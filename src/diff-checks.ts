/**
 * Deterministic diff checks for the review verdict.
 *
 * The four `diffChecks` gate the auto-merge recommendation absolutely, but they
 * were all **model output** — asked for as JSON booleans in the diff-quality
 * prompt. A confidently wrong boolean was indistinguishable, to the gate, from
 * a genuine structural failure, and it fired on the second organic production
 * PR ever reviewed under verdict v2: QuantEcon/lecture-python.zh-cn#199 was
 * routed to `editor` for `positionCorrect`, with findings asserting the source's
 * code change had never been applied to the target. It had (#148).
 *
 * The direction is safe — it fails toward a human — but Stage 4 chooses the
 * per-criterion floors from shadow data, and reviewer error is
 * indistinguishable from translation defects in that data unless somebody
 * hand-diffs every PR. The measurement instrument had an error term the
 * measurement could not see.
 *
 * Two of the four are recoverable from ground truth the engine already holds,
 * and they are computed here instead:
 *
 * - `structurePreserved` — the existing structural parity guard (directive
 *   tokens and target anchors, #118/#119/#65) plus section-tree shape.
 * - `headingMapCorrect` — the heading map is a structure the engine *writes*;
 *   what it should contain is recomputable from the two documents.
 *
 * `scopeCorrect` and `positionCorrect` stay model-asserted. `positionCorrect`
 * in particular ("do changes appear in the same sections as source") needs
 * change attribution across a translated document, and inventing that logic
 * would replace model false-gates with engine false-gates that are harder to
 * spot. They are no longer laundered into the same field as the deterministic
 * results — see `diffCheckSources` in the verdict block.
 *
 * Lives outside reviewer.ts on the Stage-2 rule: guards go in modules Jest can
 * load. See https://github.com/QuantEcon/action-translation/issues/148
 */

import { MystParser } from './parser.js';
import { checkStructuralParity } from './structural-parity.js';
import { buildHeadingMap, extractHeadingMap, normalizeHeadingForMatch } from './heading-map.js';
import { Section } from './types.js';

/** Where a diff check's value came from. */
export type DiffCheckSource = 'deterministic' | 'model';

/** One document pair under review, before the per-file contents are concatenated. */
export interface ReviewedFilePair {
  filename: string;
  /** Source (English) content after the change. */
  source: string;
  /** Target (translated) content after the change. */
  target: string;
}

/** Outcome of one deterministic check across every reviewed file. */
export interface DeterministicCheckResult {
  passed: boolean;
  /** Human-readable reasons, one per violating file; empty when passed. */
  details: string[];
}

export interface DeterministicDiffChecks {
  structurePreserved: DeterministicCheckResult;
  headingMapCorrect: DeterministicCheckResult;
}

/** Cap on reported detail lines, so one broken file cannot flood the comment. */
const MAX_DETAILS = 10;

/**
 * Flatten a section tree to its heading levels in document order.
 * The text is translated and so differs by design; the *shape* must not.
 */
function levelSequence(sections: Section[]): number[] {
  const levels: number[] = [];
  const walk = (secs: Section[]): void => {
    for (const s of secs) {
      levels.push(s.level);
      walk(s.subsections);
    }
  };
  walk(sections);
  return levels;
}

/**
 * `structurePreserved` — the target kept the source's structural skeleton.
 *
 * Two independent deterministic signals, both already trusted on the write
 * paths: structural parity (directive openings and target anchors, which are
 * never legitimately translated) and the section-tree level sequence.
 */
export async function checkStructurePreserved(
  parser: MystParser,
  pairs: ReviewedFilePair[]
): Promise<DeterministicCheckResult> {
  const details: string[] = [];

  for (const pair of pairs) {
    const parity = checkStructuralParity(pair.source, pair.target);
    if (!parity.ok) {
      for (const violation of parity.violations) {
        details.push(`${pair.filename}: ${violation.message}`);
      }
    }

    const [sourceParsed, targetParsed] = await Promise.all([
      parser.parseSections(pair.source, pair.filename),
      parser.parseSections(pair.target, pair.filename),
    ]);
    const sourceLevels = levelSequence(sourceParsed.sections);
    const targetLevels = levelSequence(targetParsed.sections);
    if (sourceLevels.join(',') !== targetLevels.join(',')) {
      details.push(
        `${pair.filename}: heading level sequence differs — source [${sourceLevels.join(', ')}] ` +
          `vs target [${targetLevels.join(', ')}]`
      );
    }
  }

  return { passed: details.length === 0, details: details.slice(0, MAX_DETAILS) };
}

/**
 * `headingMapCorrect` — the recorded map matches what the two documents imply.
 *
 * `buildHeadingMap` is the same function the write paths use to produce the
 * map, so this compares the frontmatter against its own generator rather than
 * against a model's reading of it. Values are compared with the map's own
 * matching normalisation: a frontmatter value and its body heading legitimately
 * disagree on typography, and treating that as a defect would gate every French
 * PR.
 */
export async function checkHeadingMapCorrect(
  parser: MystParser,
  pairs: ReviewedFilePair[]
): Promise<DeterministicCheckResult> {
  const details: string[] = [];

  for (const pair of pairs) {
    const [sourceParsed, targetParsed] = await Promise.all([
      parser.parseSections(pair.source, pair.filename),
      parser.parseSections(pair.target, pair.filename),
    ]);

    const { map: expected, warnings } = buildHeadingMap(
      sourceParsed.sections,
      targetParsed.sections
    );
    for (const warning of warnings) {
      details.push(`${pair.filename}: ${warning}`);
    }

    // A document with no sections has nothing to map — not a defect.
    if (expected.size === 0) continue;

    const recorded = extractHeadingMap(pair.target);
    if (recorded.size === 0) {
      details.push(`${pair.filename}: no heading map in frontmatter (expected ${expected.size})`);
      continue;
    }

    for (const [key, value] of expected) {
      const actual = recorded.get(key);
      if (actual === undefined) {
        details.push(`${pair.filename}: heading map missing entry for "${key}"`);
      } else if (normalizeHeadingForMatch(actual) !== normalizeHeadingForMatch(value)) {
        details.push(
          `${pair.filename}: heading map entry for "${key}" is "${actual}", document has "${value}"`
        );
      }
    }
  }

  return { passed: details.length === 0, details: details.slice(0, MAX_DETAILS) };
}

/**
 * Run every deterministic check.
 *
 * A check that throws is reported as **failed**, not skipped: this feeds a gate
 * whose whole design is fail-closed, and a guard that silently disappears when
 * it errors is the defect class this module exists to remove.
 */
export async function runDeterministicDiffChecks(
  parser: MystParser,
  pairs: ReviewedFilePair[]
): Promise<DeterministicDiffChecks> {
  const guard = async (
    name: string,
    fn: () => Promise<DeterministicCheckResult>
  ): Promise<DeterministicCheckResult> => {
    try {
      return await fn();
    } catch (error) {
      const message = (error as { message?: unknown } | null | undefined)?.message;
      return {
        passed: false,
        details: [
          `${name} could not be evaluated: ${typeof message === 'string' ? message : String(error)}`,
        ],
      };
    }
  };

  return {
    structurePreserved: await guard('structurePreserved', () =>
      checkStructurePreserved(parser, pairs)
    ),
    headingMapCorrect: await guard('headingMapCorrect', () =>
      checkHeadingMapCorrect(parser, pairs)
    ),
  };
}

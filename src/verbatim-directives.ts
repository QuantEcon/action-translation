/**
 * Verbatim directive policy — per-language, applied in code rather than via
 * the prompt.
 *
 * Some editions keep whole directive families byte-identical to the English
 * source. The first is `ml`: the editor of record ruled on 2026-09-01 that
 * every exercise-related block (`{exercise}`, `{exercise-start}` …
 * `{exercise-end}`, `{hint}`, `{solution}`, `{solution-start}` …
 * `{solution-end}`) stays in English, byte-for-byte, until he has ruled on each
 * exercise individually (decision record
 * `D-2026-09-03-ml-all-exercise-content-stays-english`). A rule with no
 * judgement boundary does not belong to the model: this module restores the
 * blocks from the source after translation on every write path (sync, init,
 * forward), and `diff-checks.ts` fails a review whose target diverges.
 *
 * Block extents come from a nesting-aware fence walk (the same stack discipline
 * as `typography.ts`): backtick, tilde and colon fences; a closer is the same
 * character, at least as long, with no directive name. A block of the family
 * that is nested inside another family block (a `{hint}` inside an
 * `{exercise}`) rides along with its parent; a code cell between
 * `{exercise-start}` and `{exercise-end}` is part of the region.
 *
 * Policy lookup is a `Map`, not an object: language codes are user input, and
 * an object literal would answer `true` for `constructor`.
 */

import { PROSE_DIRECTIVES } from './typography.js';

const FENCE_OPEN = /^(\s{0,3})(`{3,}|~{3,}|:{3,})\s*(?:\{([\w:+.-]+)\}.*)?$/;

/** Simple directives: opener, options, body, closer — one region. */
const SIMPLE_DIRECTIVES = new Set(['exercise', 'hint', 'solution']);
/** Gated directives: `{x-start}` … free content … `{x-end}` — one region. */
const START_DIRECTIVES = new Map<string, string>([
  ['exercise-start', 'exercise-end'],
  ['solution-start', 'solution-end'],
]);

/** Languages whose editions keep the exercise family verbatim. */
const VERBATIM_POLICY = new Map<string, true>([['ml', true]]);

export function hasVerbatimDirectivePolicy(language: string): boolean {
  return VERBATIM_POLICY.has(language.toLowerCase());
}

export interface VerbatimBlock {
  /** Directive name that opened the region (`exercise`, `exercise-start`, …). */
  kind: string;
  /** First line index (0-based), the opening fence. */
  start: number;
  /** Last line index (0-based), inclusive — the closing fence. */
  end: number;
}

interface Fence {
  marker: string;
  directive: string | null;
  /** A literal body (code cell, plain fence): only its own closer is read. */
  literal: boolean;
}

interface OpenRegion {
  kind: string;
  start: number;
  /** Stack depth outside the region; the region closes when a pop returns here. */
  depth: number;
  /** For gated directives, the `-end` name whose fence closes the region. */
  endName: string | null;
}

/**
 * Locate every verbatim-family block, outermost only, in document order.
 * Unterminated regions are dropped (the structural-parity guard will report the
 * broken shape on its own terms).
 */
export function extractVerbatimBlocks(content: string): VerbatimBlock[] {
  const lines = content.split('\n');
  const blocks: VerbatimBlock[] = [];
  const stack: Fence[] = [];
  let region: OpenRegion | null = null;
  let inFrontmatter = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0 && line.trim() === '---') {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (line.trim() === '---') inFrontmatter = false;
      continue;
    }

    const open = FENCE_OPEN.exec(line);
    if (!open) continue;
    const [, , marker, rawDirective] = open;
    const top = stack[stack.length - 1];

    // Closer: same character, at least as long, no directive name.
    if (top && !rawDirective && marker[0] === top.marker[0] && marker.length >= top.marker.length) {
      const popped = stack.pop() as Fence;
      if (region && stack.length === region.depth) {
        const closes = region.endName ? popped.directive === region.endName : true;
        if (closes) {
          blocks.push({ kind: region.kind, start: region.start, end: i });
          region = null;
        }
      }
      continue;
    }

    // Inside a literal fence (a code cell, a plain code block), nothing opens —
    // a ```{hint} line there is code, exactly as typography.ts reads it.
    if (top && top.literal) continue;

    const directive = rawDirective ? rawDirective.toLowerCase() : null;
    const literal = !directive || !PROSE_DIRECTIVES.has(directive);
    if (!region && directive) {
      if (SIMPLE_DIRECTIVES.has(directive)) {
        region = { kind: directive, start: i, depth: stack.length, endName: null };
      } else if (START_DIRECTIVES.has(directive)) {
        region = {
          kind: directive,
          start: i,
          depth: stack.length,
          endName: START_DIRECTIVES.get(directive) as string,
        };
      }
    }
    stack.push({ marker, directive, literal });
  }

  return blocks;
}

export interface VerbatimApplyResult {
  content: string;
  /** Blocks whose bytes were replaced by the source's. */
  replaced: number;
  /** Set when the two documents' block sequences differ and nothing was applied. */
  mismatch: string | null;
}

/** Signature of a block sequence for shape comparison. */
function shape(blocks: VerbatimBlock[]): string {
  return blocks.map((b) => b.kind).join(',');
}

/**
 * Restore every verbatim-family block in `output` from `source`, when the
 * language carries the policy. Blocks pair by position; a different block
 * sequence is left untouched and reported, because guessing a pairing could
 * copy the wrong exercise over the right one.
 */
export function applyVerbatimDirectives(
  source: string,
  output: string,
  language: string
): VerbatimApplyResult {
  if (!hasVerbatimDirectivePolicy(language))
    return { content: output, replaced: 0, mismatch: null };

  const sourceBlocks = extractVerbatimBlocks(source);
  const outputBlocks = extractVerbatimBlocks(output);
  if (shape(sourceBlocks) !== shape(outputBlocks)) {
    return {
      content: output,
      replaced: 0,
      mismatch:
        `verbatim-directive block sequence differs: source [${shape(sourceBlocks) || 'none'}] ` +
        `vs output [${shape(outputBlocks) || 'none'}]`,
    };
  }
  if (sourceBlocks.length === 0) return { content: output, replaced: 0, mismatch: null };

  const sourceLines = source.split('\n');
  const outputLines = output.split('\n');
  let replaced = 0;
  for (let k = sourceBlocks.length - 1; k >= 0; k--) {
    const s = sourceBlocks[k];
    const o = outputBlocks[k];
    const fromSource = sourceLines.slice(s.start, s.end + 1);
    const current = outputLines.slice(o.start, o.end + 1);
    if (fromSource.join('\n') !== current.join('\n')) {
      outputLines.splice(o.start, o.end - o.start + 1, ...fromSource);
      replaced++;
    }
  }
  return { content: outputLines.join('\n'), replaced, mismatch: null };
}

/**
 * Report every verbatim-family block in `target` that is not byte-identical to
 * its positional counterpart in `source`. Empty when compliant. Language-neutral
 * — callers gate on `hasVerbatimDirectivePolicy`.
 */
export function findVerbatimViolations(source: string, target: string): string[] {
  const sourceBlocks = extractVerbatimBlocks(source);
  const targetBlocks = extractVerbatimBlocks(target);
  if (shape(sourceBlocks) !== shape(targetBlocks)) {
    return [
      `exercise-family block sequence differs: source [${shape(sourceBlocks) || 'none'}] ` +
        `vs target [${shape(targetBlocks) || 'none'}]`,
    ];
  }
  const sourceLines = source.split('\n');
  const targetLines = target.split('\n');
  const violations: string[] = [];
  sourceBlocks.forEach((s, k) => {
    const t = targetBlocks[k];
    if (
      sourceLines.slice(s.start, s.end + 1).join('\n') !==
      targetLines.slice(t.start, t.end + 1).join('\n')
    ) {
      violations.push(
        `{${s.kind}} block at target line ${t.start + 1} is not byte-identical to the source block at line ${s.start + 1}`
      );
    }
  });
  return violations;
}

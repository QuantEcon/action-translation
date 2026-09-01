/**
 * TOC part-caption preservation on sync (#254).
 *
 * A sync mirrors the source `_toc.yml` into the target.  Part captions are the
 * one thing in that file an edition localises by hand, so a verbatim mirror
 * silently replaces every translated caption with English — and nothing
 * downstream notices: English captions are valid MyST, review mode never sees
 * `_toc.yml`, and the strict build passes.  lecture-python.zh-cn served 19
 * English captions for 17 days after #202 that way.
 *
 * This module carries the target's captions forward.  It is the interim step
 * toward W1's structured merge (`- file:` add/remove only, captions never taken
 * from the source; #259) and the shared deterministic localisation check that
 * will flag any caption left byte-identical to the source.  Two properties are
 * load-bearing until then:
 *
 * 1. **Matching is by membership overlap, not identity.**  The canonical
 *    trigger is a lecture-adding sync, which changes exactly one part's file
 *    set; matching parts by identical file sets would lose the caption of the
 *    one part the sync touches — the #254 failure again, one part at a time.
 *    Each source part is paired with the unclaimed target part sharing the
 *    most files (ties broken by position).  A part with no overlap at all is
 *    new, or wholly rewritten, and keeps the source caption — the honest
 *    "untranslated" state the coming check detects, rather than a guess from
 *    position that could attach a stale translation to the wrong topic.
 *
 * 2. **The output is the source text with caption values substituted** — not a
 *    js-yaml round trip.  QuantEcon TOCs use the zero-indent block style that
 *    js-yaml re-indents, so a round trip turns a caption merge into a
 *    whole-file rewrite (201 of 204 lines on lecture-python's TOC) that hides
 *    the real change from the reviewer and drops comments.  The substitution is
 *    verified by parse against the intended document; only if that fails does
 *    the function fall back to re-serialising.
 */

import * as yaml from 'js-yaml';

/** The subset of the orchestrator's Logger this module needs. */
export interface CaptionMergeLogger {
  info(message: string): void;
  warning(message: string): void;
}

type TocPart = Record<string, unknown>;

/** A `caption:` key line, at any indent, with or without a leading dash. */
const CAPTION_LINE_RE = /^(\s*(?:-\s+)?caption:\s*)(.*?)(\s*)$/;

/** Every `file:` value under a part's chapters, at any depth. */
function partFiles(part: TocPart): Set<string> {
  const out = new Set<string>();
  const visit = (entries: unknown): void => {
    if (!Array.isArray(entries)) return;
    for (const entry of entries) {
      if (typeof entry !== 'object' || entry === null) continue;
      const e = entry as Record<string, unknown>;
      if (typeof e.file === 'string') out.add(e.file);
      visit(e.chapters);
      visit(e.sections);
    }
  };
  visit(part.chapters);
  return out;
}

function partsOf(doc: unknown): TocPart[] | undefined {
  if (!doc || typeof doc !== 'object') return undefined;
  const parts = (doc as Record<string, unknown>).parts;
  if (!Array.isArray(parts)) return undefined;
  return parts.filter((p): p is TocPart => typeof p === 'object' && p !== null);
}

/**
 * Pair source parts with target parts by shared file membership: greedy on the
 * largest overlap, ties to the nearest position, each part used at most once.
 * Returns source index → target index.  Exported for unit testing.
 */
export function matchPartsByOverlap(
  source: Set<string>[],
  target: Set<string>[]
): Map<number, number> {
  const candidates: { i: number; j: number; overlap: number }[] = [];
  source.forEach((s, i) => {
    target.forEach((t, j) => {
      let overlap = 0;
      for (const f of s) if (t.has(f)) overlap++;
      if (overlap > 0) candidates.push({ i, j, overlap });
    });
  });
  candidates.sort(
    (a, b) => b.overlap - a.overlap || Math.abs(a.i - a.j) - Math.abs(b.i - b.j) || a.i - b.i
  );
  const matched = new Map<number, number>();
  const claimed = new Set<number>();
  for (const { i, j } of candidates) {
    if (matched.has(i) || claimed.has(j)) continue;
    matched.set(i, j);
    claimed.add(j);
  }
  return matched;
}

/** Render a caption as a single-line YAML scalar (quoted only when YAML requires it). */
function renderCaption(value: string): string {
  return yaml.dump(value, { lineWidth: -1 }).replace(/\n$/, '');
}

/**
 * Replace the values of the k-th `caption:` key lines in `sourceYaml` for each
 * k in `captions`, touching nothing else.  Part captions are the only
 * `caption:` keys a jb-book TOC carries, so text order equals `parts` order;
 * the caller verifies the result by parse regardless.
 */
function substituteCaptionLines(sourceYaml: string, captions: Map<number, string>): string {
  const lines = sourceYaml.split('\n');
  let k = -1;
  for (let n = 0; n < lines.length; n++) {
    if (lines[n].trimStart().startsWith('#')) continue;
    const m = CAPTION_LINE_RE.exec(lines[n]);
    if (!m) continue;
    k++;
    const wanted = captions.get(k);
    if (wanted === undefined) continue;
    lines[n] = `${m[1]}${renderCaption(wanted)}${m[3]}`;
  }
  return lines.join('\n');
}

function sameDocument(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Merge the target `_toc.yml`'s localised part captions into the source
 * `_toc.yml`.  Returns the source text unchanged (same reference) when there is
 * nothing to carry forward.  Exported for unit testing.
 */
export function mergeTargetCaptions(
  sourceYaml: string,
  targetYaml: string,
  logger?: CaptionMergeLogger
): string {
  let source: unknown;
  let target: unknown;
  try {
    source = yaml.load(sourceYaml);
    target = yaml.load(targetYaml);
  } catch {
    logger?.warning('Could not parse _toc.yml for caption merge — using source as-is');
    return sourceYaml;
  }

  const sourceParts = partsOf(source);
  const targetParts = partsOf(target);
  if (!sourceParts || !targetParts || sourceParts.length === 0 || targetParts.length === 0) {
    return sourceYaml;
  }

  const matched = matchPartsByOverlap(sourceParts.map(partFiles), targetParts.map(partFiles));

  const captions = new Map<number, string>();
  const notLocalised: string[] = [];
  const unmatched: string[] = [];
  sourceParts.forEach((part, i) => {
    const sourceCaption = typeof part.caption === 'string' ? part.caption : undefined;
    const j = matched.get(i);
    if (j === undefined) {
      if (sourceCaption !== undefined) unmatched.push(sourceCaption);
      return;
    }
    const targetCaption = targetParts[j].caption;
    if (typeof targetCaption !== 'string' || targetCaption === '') return;
    if (targetCaption === sourceCaption) {
      notLocalised.push(sourceCaption);
      return;
    }
    captions.set(i, targetCaption);
  });

  for (const caption of unmatched) {
    logger?.warning(
      `_toc.yml part "${caption}" has no counterpart in the target TOC — caption left as in source`
    );
  }
  if (notLocalised.length > 0) {
    logger?.info(
      `_toc.yml: ${notLocalised.length} part caption(s) identical in source and target (not localised): ${notLocalised
        .map((c) => `"${c}"`)
        .join(', ')}`
    );
  }
  if (captions.size === 0) return sourceYaml;

  // The intended document: the parsed source with only the captions changed.
  const expected = yaml.load(sourceYaml) as Record<string, unknown>;
  const expectedParts = partsOf(expected)!;
  for (const [i, caption] of captions) expectedParts[i].caption = caption;

  const substituted = substituteCaptionLines(sourceYaml, captions);
  let verified = false;
  try {
    verified = sameDocument(yaml.load(substituted), expected);
  } catch {
    verified = false;
  }

  logger?.info(`Preserved ${captions.size} localised TOC part caption(s) from target`);
  if (verified) return substituted;

  logger?.warning(
    '_toc.yml caption merge could not be applied in place — re-serialising the document'
  );
  return yaml.dump(expected, { lineWidth: -1, noArrayIndent: true });
}

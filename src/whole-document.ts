/**
 * Repairs to a model's whole-document response, made in code before anything
 * derives from it.
 *
 * A whole-document translation sometimes comes back wrapped in a code fence:
 * one bare ``` line before a complete, correct translation and another after
 * it (#363, diagnosed on #203). The structural-parity guard refuses it, and
 * rightly so: the wrapper's opening fence is closed by the first bare closing
 * fence inside the document (a `{raw}` block's, say), so everything above that
 * line drops out of the guard's fence scan and the first directive reads as
 * renamed. The translation inside is sound; taking away the two lines is all
 * it needs, or only the first when the wrapper was never closed (condition 4).
 * What is left is trimmed, as the translator trims every response.
 *
 * The wrapper is removed only when all six of these hold, so that nothing but
 * a wrapper is ever taken away:
 *
 * 1. the first line is a fence at column 0 with no info string, or with
 *    `markdown`, `md` or `myst`;
 * 2. the last non-blank line is a bare fence at column 0, of the same character
 *    and at least as long, so it closes the first;
 * 3. no document the request carried (the source, and for a resync the existing
 *    translation) starts with a fence, so the output's first fence cannot be
 *    the document's own;
 * 4. once the wrapper is gone, the guard's fence walk ends with no fence open.
 *    This also tells whether the wrapper was ever closed. If removing the
 *    first and last lines leaves a fence open, the model opened a wrapper and
 *    never closed it, on a document that ends in a closing fence of its own
 *    (as 20 of the 27 programming lectures do, after a code cell or
 *    `{solution-end}`). The last line is then the document's, and only the
 *    first line is removed. At most one of the two removals can leave the walk
 *    closed, since a bare fence line either closes the fence open before it or
 *    opens one; when neither does, the text is left as it came;
 * 5. the source's own fence walk ends with no fence open. Condition 4 reads
 *    the walk as the document's, which it cannot be for a source the walk
 *    reads as unbalanced (an indented fence inside a directive, say): there a
 *    removal can leave a balanced walk with the document's last fence gone, or
 *    with the wrapper's closing fence kept. A faithful translation of such a
 *    source is unbalanced too, so neither removal would give it back, and this
 *    refuses nothing that would have been repaired;
 * 6. the document left is not indented as a whole: when it has more than one
 *    non-blank line, a line after its first starts at column 0. A model that
 *    indents the document inside its wrapper would otherwise have the indented
 *    document written, and the guard does not see that when the source has no
 *    anchor at column 0.
 *
 * The guard's fence walk also reads an indented line as a fence, but the two
 * wrapper lines must start at column 0. The translator trims a response before
 * it gets here, so only the last line can arrive indented, and when it does the
 * wrapper was indented as a whole, usually with the document inside it. That
 * response is left as it came, for the guard.
 *
 * The guard still runs on the result. Lives outside translator.ts so that it
 * is tested without a client.
 *
 * The head region, the front matter and the pre-title content above the H1, is
 * not the model's to write (#326). A whole-document draw that drops `jupytext`
 * and `kernelspec` passes structural parity, and MyST-NB then reads the page as
 * plain Markdown and drops every code cell. Other draws have put commentary and
 * a second front-matter block above the title. `restoreHead` takes the head
 * from the documents the request carried, byte for byte, and keeps the model's
 * text from its H1 on. That is safe because no source pre-title holds prose:
 * across 228 of them there are only anchors, `{raw}` headers, `{index}`
 * entries, one `<style>` block and two `+++` lines, and the target pre-titles
 * that differ from their source's are all defects.
 *
 * `checkWrittenDocument` is the check every write path runs on the exact bytes
 * it writes: structural parity, plus #288's rule that front-matter keys appear
 * only in the leading block and that the front matter keeps the source's
 * `jupytext` and `kernelspec`.
 */

import {
  ParityResult,
  ParityViolation,
  checkStructuralParity,
  endsInsideFence,
  isFenceLine,
  walkFences,
} from './structural-parity.js';

/** A wrapper's first line: a fence at column 0 with no info string, or one naming Markdown. */
const WRAPPER_OPENING = /^(`{3,}|~{3,})\s*(?:markdown|md|myst)?\s*$/i;
/** A wrapper's last line: a fence at column 0 and nothing else. */
const BARE_FENCE = /^(`{3,}|~{3,})\s*$/;

export interface UnwrapResult {
  /** The document with its wrapper removed, or the text as given. */
  text: string;
  /** Whether a wrapper was removed. */
  unwrapped: boolean;
}

/** Whether the first line of `content` with anything on it is a fence. */
function startsWithFence(content: string): boolean {
  const first = content
    .replace(/^\uFEFF/, '')
    .split('\n')
    .find((line) => line.trim() !== '');
  return first !== undefined && isFenceLine(first);
}

/** Whether every non-blank line of `content` after its first is indented (condition 6). */
function indentedAsAWhole(content: string): boolean {
  const later = content
    .split('\n')
    .slice(1)
    .filter((line) => line.trim() !== '');
  return later.length > 0 && later.every((line) => /^\s/.test(line));
}

/**
 * Remove a code fence wrapping a whole-document response (#363) when the six
 * conditions in the module comment hold. Otherwise the text comes back as
 * given.
 *
 * @param text       the model's response
 * @param references every document the request carried: the source first, then
 *                   for a resync the existing translation
 */
export function unwrapDocumentFence(text: string, references: readonly string[]): UnwrapResult {
  const unchanged: UnwrapResult = { text, unwrapped: false };
  const lines = text.split('\n');

  let first = 0;
  while (first < lines.length && lines[first].trim() === '') first++;
  let last = lines.length - 1;
  while (last > first && lines[last].trim() === '') last--;
  if (first >= last) return unchanged;

  const opening = WRAPPER_OPENING.exec(lines[first]);
  const closing = BARE_FENCE.exec(lines[last]);
  if (
    !opening ||
    !closing ||
    closing[1][0] !== opening[1][0] ||
    closing[1].length < opening[1].length
  ) {
    return unchanged;
  }

  if (references.some(startsWithFence)) return unchanged;
  if (references.length > 0 && endsInsideFence(references[0])) return unchanged;

  const inner = lines
    .slice(first + 1, last)
    .join('\n')
    .trim();
  // Condition 4: without its last line the walk ends open, so that line is the
  // document's own closing fence and the wrapper was never closed.
  const document = endsInsideFence(inner)
    ? lines
        .slice(first + 1)
        .join('\n')
        .trim()
    : inner;
  if (endsInsideFence(document) || indentedAsAWhole(document)) return unchanged;

  return { text: document, unwrapped: true };
}

// ─── The head region (#326) ─────────────────────────────────────────────────

/** A document's lines, with where its front matter ends and where its H1 is. */
interface HeadLayout {
  lines: string[];
  /** Index of the `---` closing a front-matter block opened on the first line; -1 if none. */
  frontMatterEnd: number;
  /** Index of the H1, outside the front matter and outside any fence; -1 if none. */
  title: number;
}

/** An H1 line, as the parser reads one. */
const H1_LINE = /^#\s+\S/;

/**
 * Where a document's head region ends. Front matter follows the parser's rule
 * (`parser.ts`), until #170 gives the codebase one splitter: the first line is
 * `---` and the block runs to the next `---` line. The H1 is
 * the first `# ` line below the front matter and outside any fence, by the
 * guard's fence walk, so a `# comment` in a code cell is never read as the title.
 */
function layoutOf(content: string): HeadLayout {
  const lines = content.split('\n');
  const frontMatterEnd = lines[0] === '---' ? lines.findIndex((l, i) => i > 0 && l === '---') : -1;
  let title = -1;
  walkFences(content, (line, i, fence) => {
    if (title === -1 && !fence && i > frontMatterEnd && H1_LINE.test(line)) title = i;
  });
  return { lines, frontMatterEnd, title };
}

export interface HeadRestore {
  /** The document with its head region restored. */
  text: string;
  /** Whether the lines above the model's H1 differed from the restored head. */
  replaced: boolean;
}

/**
 * The output with its head region taken from the request's documents (#326):
 * the front-matter block of `frontMatterFrom` (the source for a new
 * translation, the existing translation for a resync), then the source's
 * pre-title lines, then the output from its H1 on. With the default
 * `frontMatterFrom`, the head is the source's lines above its H1, byte for byte.
 *
 * Null when the source or the output has no H1 (a page such as
 * `_admonition/gpu.md`): the caller keeps the output as it is, and the
 * front-matter rule in `checkWrittenDocument` still applies to it.
 */
export function restoreHead(
  output: string,
  source: string,
  frontMatterFrom: string = source
): HeadRestore | null {
  const out = layoutOf(output);
  const src = layoutOf(source);
  if (out.title === -1 || src.title === -1) return null;

  let head: string[];
  if (frontMatterFrom === source) {
    head = src.lines.slice(0, src.title);
  } else {
    const from = layoutOf(frontMatterFrom);
    const frontMatter =
      from.frontMatterEnd === -1 ? [] : from.lines.slice(0, from.frontMatterEnd + 1);
    const preTitle = src.lines.slice(src.frontMatterEnd + 1, src.title);
    while (preTitle.length > 0 && preTitle[0].trim() === '') preTitle.shift();
    // One blank line below the front matter, none above the first line.
    head = frontMatter.length > 0 ? [...frontMatter, '', ...preTitle] : preTitle;
  }

  const modelHead = out.lines.slice(0, out.title).join('\n').trim();
  return {
    text: [...head, ...out.lines.slice(out.title)].join('\n'),
    replaced: modelHead !== head.join('\n').trim(),
  };
}

// ─── The front-matter rule (#288) ───────────────────────────────────────────

/** Keys that belong only in a lecture's front matter. */
const FRONT_MATTER_KEY = /^(jupytext|kernelspec|translation):/;
/** The front-matter keys MyST-NB needs to read a page as a notebook. */
const NOTEBOOK_KEYS = ['jupytext', 'kernelspec'];
/** A top-level YAML key. */
const TOP_LEVEL_KEY = /^([A-Za-z_][A-Za-z0-9_-]*):/;

/** The top-level keys of a document's leading front-matter block. */
function frontMatterKeys(layout: HeadLayout): Set<string> {
  const keys = new Set<string>();
  for (let i = 1; i < layout.frontMatterEnd; i++) {
    const key = TOP_LEVEL_KEY.exec(layout.lines[i]);
    if (key) keys.add(key[1]);
  }
  return keys;
}

/**
 * #288's front-matter rule, as violations. Front-matter keys (`jupytext:`,
 * `kernelspec:`, `translation:` at the start of a line, outside any fence)
 * appear only in the leading block, and the output's front matter keeps the
 * source's `jupytext` and `kernelspec`. Written files have broken each half: a
 * second block below the first, opened or not (`forward`, 2026-08-20 and
 * 2026-10-09), and a block holding only `translation:` (`init`, #326). Neither
 * adds a directive, so parity alone passes both. The rule refuses the write;
 * it does not repair it.
 */
export function checkFrontMatter(sourceContent: string, outputContent: string): ParityViolation[] {
  const violations: ParityViolation[] = [];
  const output = layoutOf(outputContent);

  const stray: Array<{ line: number; key: string }> = [];
  walkFences(outputContent, (line, i, fence) => {
    if (fence || i <= output.frontMatterEnd) return;
    const key = FRONT_MATTER_KEY.exec(line);
    if (key) stray.push({ line: i + 1, key: key[1] });
  });
  if (stray.length > 0) {
    violations.push({
      message:
        `front-matter key \`${stray[0].key}:\` at output line ${stray[0].line} is outside the ` +
        `front matter (${stray.length} such line${stray.length === 1 ? '' : 's'}): a second, ` +
        `unopened or unclosed front-matter block`,
    });
  }

  const sourceKeys = frontMatterKeys(layoutOf(sourceContent));
  const outputKeys = frontMatterKeys(output);
  const lost = NOTEBOOK_KEYS.filter((key) => sourceKeys.has(key) && !outputKeys.has(key));
  if (lost.length > 0) {
    violations.push({
      message:
        `front matter lost ${lost.map((key) => `\`${key}\``).join(' and ')}, which the ` +
        `source's has: without ${lost.length === 1 ? 'it' : 'them'} MyST-NB does not read the ` +
        `page as a notebook and drops every code cell`,
    });
  }
  return violations;
}

/**
 * The checks every write path runs on the exact bytes it is about to write:
 * structural parity with the source (#119, #65) and the front-matter rule
 * (#288, #326). Reported with `formatParityViolations`, as parity was alone.
 */
export function checkWrittenDocument(sourceContent: string, outputContent: string): ParityResult {
  const parity = checkStructuralParity(sourceContent, outputContent);
  const violations = [...parity.violations, ...checkFrontMatter(sourceContent, outputContent)];
  return { ok: violations.length === 0, violations };
}

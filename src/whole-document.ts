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
 * it needs. What is left is trimmed, as the translator trims every response.
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
 * 4. with the two lines removed, the guard's fence walk ends with no fence
 *    open. Without this, a response that opened a wrapper and never closed it,
 *    on a document that ends in a code cell's closing fence (as 20 of the 27
 *    programming lectures do), would lose that closing fence and still pass
 *    the guard;
 * 5. the source's own fence walk ends with no fence open. Condition 4 cannot
 *    protect a source the walk reads as unbalanced (an indented fence inside a
 *    directive, say): there an unclosed wrapper can take the document's last
 *    fence and leave a balanced walk. A faithful translation of such a source
 *    is unbalanced too, so condition 4 already refuses every wrapper around
 *    one, and this refuses nothing that would have been repaired;
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
 */

import { endsInsideFence, isFenceLine } from './structural-parity.js';

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
  if (endsInsideFence(inner) || indentedAsAWhole(inner)) return unchanged;

  return { text: inner, unwrapped: true };
}

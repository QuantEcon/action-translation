/**
 * What the structural parity guard refused, kept for diagnosis (#364, #430).
 *
 * `init` and `forward` used to discard the model's output when the guard
 * refused it, so a refusal could be read only through the guard's message,
 * which describes the symptom: a whole-document code fence reads as a renamed
 * directive. The bytes the guard checked are now written to
 * `<target>/.translate/refused/<lecture>`, the lecture's path under the docs
 * folder, `.md` kept. The lecture still fails.
 *
 * The folder holds a `.gitignore` of `*`, checked before every write and
 * replaced when it is not a file with a `*` line (missing, empty, or edited),
 * so that the folder stays out of git in every edition, including those set
 * up before it existed. No lecture path names that file. Nothing that reads `.translate/`
 * walks it: state files live under `.translate/state/`, and the lecture-set
 * reader skips folders whose names start with a dot.
 *
 * No write follows a symbolic link: a link anywhere on the way, from
 * `.translate` down to the file, leaves the output unkept, as `init` refuses
 * a `.translate/config.yml` that is a link to nothing (#134). Nor can a
 * lecture path leave the folder.
 */

import * as fs from 'fs';
import * as path from 'path';

/** The folder, relative to the target repository's root. */
export const REFUSED_DIR = '.translate/refused';

/** The folder's ignore file, and the content it is written with. */
const IGNORE_FILE = '.gitignore';
const IGNORE_CONTENT = '*\n';

/** Where a lecture's refused output goes, relative to the target repository's root. */
export function refusedOutputRelativePath(lecture: string): string {
  return `${REFUSED_DIR}/${lecture.split(/[\\/]/).join('/')}`;
}

/** The outcome of keeping one refused output. */
export type KeptOutput = { kept: true; path: string } | { kept: false; reason: string };

/**
 * The folders from the repository root down to the lecture's, and the file's
 * name, or the reason the lecture path cannot name a file under the folder.
 */
function resolveParts(lecture: string): { dirs: string[]; name: string } | { reason: string } {
  const parts = lecture.split(/[\\/]/);
  if (
    path.isAbsolute(lecture) ||
    parts.some((part) => part === '' || part === '.' || part === '..')
  ) {
    return { reason: `${lecture} is not a path inside the docs folder` };
  }
  // The folder's own ignore file: a refused `.gitignore` written there would
  // replace it, and its removal would delete it. Compared without case, for a
  // file system that does not tell `.GITIGNORE` from it.
  if (parts[parts.length - 1].toLowerCase() === IGNORE_FILE) {
    return { reason: `${lecture} would replace ${REFUSED_DIR}/${IGNORE_FILE}` };
  }
  return {
    dirs: [...REFUSED_DIR.split('/'), ...parts.slice(0, -1)],
    name: parts[parts.length - 1],
  };
}

/**
 * What is at `p`, without following a link: 'none', 'link', 'dir', 'file' (a
 * regular file) or 'other' (a socket, a pipe, a device).
 */
function kindAt(p: string): 'none' | 'link' | 'dir' | 'file' | 'other' {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(p);
  } catch {
    return 'none';
  }
  if (stat.isSymbolicLink()) return 'link';
  if (stat.isDirectory()) return 'dir';
  return stat.isFile() ? 'file' : 'other';
}

function isExists(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'EEXIST';
}

/**
 * Make `dir` a folder, or say why it is not one. Another process may create it
 * at the same moment: a folder already there is what was wanted.
 */
function ensureFolder(dir: string, relative: string): string | undefined {
  const before = kindAt(dir);
  if (before === 'none') {
    try {
      fs.mkdirSync(dir);
    } catch (error) {
      if (!isExists(error)) throw error;
    }
  }
  const kind = kindAt(dir);
  if (kind === 'link') return `${relative} is a symbolic link`;
  if (kind !== 'dir') return `${relative} is not a folder`;
  return undefined;
}

/** Whether `content` ignores everything: it has a line that is `*` alone. */
function ignoresAll(content: string): boolean {
  return content.split('\n').some((line) => line.replace(/\r$/, '').trim() === '*');
}

/**
 * Make the folder's ignore file a regular file with a `*` line, or say why it
 * cannot be. A missing, empty or edited one is replaced; a link or a folder
 * there is left alone and the output is not kept, as with the other links.
 * Another process may write it at the same moment: the exclusive write then
 * fails with EEXIST, and the file it wrote is checked as found.
 */
function ensureIgnoreFile(dir: string): string | undefined {
  const ignore = path.join(dir, IGNORE_FILE);
  const relative = `${REFUSED_DIR}/${IGNORE_FILE}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const kind = kindAt(ignore);
    if (kind === 'link') return `${relative} is a symbolic link`;
    if (kind === 'dir' || kind === 'other') return `${relative} is not a file`;
    if (kind === 'file') {
      if (ignoresAll(fs.readFileSync(ignore, 'utf-8'))) return undefined;
      fs.writeFileSync(ignore, IGNORE_CONTENT, 'utf-8');
      return undefined;
    }
    try {
      fs.writeFileSync(ignore, IGNORE_CONTENT, { encoding: 'utf-8', flag: 'wx' });
      return undefined;
    } catch (error) {
      if (!isExists(error)) throw error;
    }
  }
  return `${relative} could not be written`;
}

/**
 * Write a lecture's refused output to `.translate/refused/<lecture>`.
 * Never throws: a write that cannot be made is returned as its reason, and the
 * caller says the output was not kept.
 */
export function keepRefusedOutput(
  targetRepoPath: string,
  lecture: string,
  content: string
): KeptOutput {
  const resolved = resolveParts(lecture);
  if ('reason' in resolved) return { kept: false, reason: resolved.reason };
  try {
    let dir = targetRepoPath;
    const walked: string[] = [];
    for (const part of resolved.dirs) {
      dir = path.join(dir, part);
      walked.push(part);
      const notFolder = ensureFolder(dir, walked.join('/'));
      if (notFolder) return { kept: false, reason: notFolder };
      // The folder ignores itself, so an edition set up before it existed
      // never commits a refused output. Checked before every write: an
      // empty or edited ignore file would let the output into `git add -A`.
      if (walked.length === 2) {
        const notIgnored = ensureIgnoreFile(dir);
        if (notIgnored) return { kept: false, reason: notIgnored };
      }
    }
    const file = path.join(dir, resolved.name);
    const relative = refusedOutputRelativePath(lecture);
    const kind = kindAt(file);
    if (kind === 'link') return { kept: false, reason: `${relative} is a symbolic link` };
    if (kind === 'dir') return { kept: false, reason: `${relative} is a folder` };
    if (kind === 'other') return { kept: false, reason: `${relative} is not a file` };
    fs.writeFileSync(file, content, 'utf-8');
    return { kept: true, path: relative };
  } catch (error) {
    return { kept: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Remove a lecture's refused output, once a later translation of it is
 * written: a stale file would describe a refusal that no longer holds.
 * Leaves everything else alone, and does nothing through a symbolic link.
 * Never throws.
 *
 * @returns whether a file was removed
 */
export function removeRefusedOutput(targetRepoPath: string, lecture: string): boolean {
  const resolved = resolveParts(lecture);
  if ('reason' in resolved) return false;
  try {
    let dir = targetRepoPath;
    for (const part of resolved.dirs) {
      dir = path.join(dir, part);
      if (kindAt(dir) !== 'dir') return false;
    }
    const file = path.join(dir, resolved.name);
    if (kindAt(file) !== 'file') return false;
    fs.unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}

/** The longest preview line, in characters, before it is clipped. */
export const PREVIEW_LINE_MAX = 200;

/**
 * One line as the console and `TRANSLATION-REPORT.md` can show it: a CRLF's
 * `\r` dropped, every other control character but a tab shown as U+FFFD (an
 * escape sequence would reach the terminal), and clipped to
 * PREVIEW_LINE_MAX characters, saying how many were left out.
 */
function previewLine(line: string): string {
  const shown = line
    .replace(/\r$/, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000a-\u001f\u007f-\u009f]/g, '�');
  const chars = Array.from(shown);
  if (chars.length <= PREVIEW_LINE_MAX) return shown;
  const left = chars.length - PREVIEW_LINE_MAX;
  return `${chars.slice(0, PREVIEW_LINE_MAX).join('')}… [${left} more characters]`;
}

/**
 * Where the body starts: after a leading front-matter block (a first line of
 * `---` through the next `---` line) and the blank lines after it, or 0 when
 * there is none, or nothing but front matter.
 */
function bodyStart(lines: string[]): number {
  if (lines[0]?.replace(/\r$/, '') !== '---') return 0;
  const close = lines.findIndex((line, i) => i > 0 && line.replace(/\r$/, '') === '---');
  if (close < 0) return 0;
  let start = close + 1;
  while (start < lines.length && lines[start].trim() === '') start++;
  return start < lines.length ? start : 0;
}

/**
 * The first and last three lines of a refused output, with `…` between them
 * when lines are left out: enough to show a wrapper (a code fence, a preamble)
 * at a glance. The first lines are the body's: the front matter `init` and
 * `forward` put on every output would hide a fence that opens the model's
 * reply. Each line is made safe to print by previewLine.
 */
export function refusedOutputPreview(content: string): string[] {
  const all = content.replace(/\n$/, '').split('\n');
  const lines = all.slice(bodyStart(all));
  const shown = lines.length <= 7 ? lines : [...lines.slice(0, 3), '…', ...lines.slice(-3)];
  return shown.map(previewLine);
}

/** The line a failure adds about its refused output: where it is, or why it was not kept. */
export function describeKeptOutput(kept: KeptOutput): string {
  return kept.kept
    ? `The refused output is kept at ${kept.path}`
    : `The refused output was not kept: ${kept.reason}`;
}

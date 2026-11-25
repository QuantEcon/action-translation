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
 * The folder holds a `.gitignore` of `*`, written when the folder is created
 * (or found without one), so that it stays out of git in every edition,
 * including those set up before it existed. Nothing that reads `.translate/`
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
  return {
    dirs: [...REFUSED_DIR.split('/'), ...parts.slice(0, -1)],
    name: parts[parts.length - 1],
  };
}

/** What is at `p`, without following a link: 'none', 'link', 'dir' or 'other'. */
function kindAt(p: string): 'none' | 'link' | 'dir' | 'other' {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(p);
  } catch {
    return 'none';
  }
  if (stat.isSymbolicLink()) return 'link';
  return stat.isDirectory() ? 'dir' : 'other';
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
      const kind = kindAt(dir);
      if (kind === 'link') {
        return { kept: false, reason: `${walked.join('/')} is a symbolic link` };
      }
      if (kind === 'other') return { kept: false, reason: `${walked.join('/')} is not a folder` };
      if (kind === 'none') fs.mkdirSync(dir);
      // The folder ignores itself, so an edition set up before it existed
      // never commits a refused output.
      if (walked.length === 2) {
        const ignore = path.join(dir, '.gitignore');
        if (kindAt(ignore) === 'none') fs.writeFileSync(ignore, '*\n', { flag: 'wx' });
      }
    }
    const file = path.join(dir, resolved.name);
    const relative = refusedOutputRelativePath(lecture);
    const kind = kindAt(file);
    if (kind === 'link') return { kept: false, reason: `${relative} is a symbolic link` };
    if (kind === 'dir') return { kept: false, reason: `${relative} is a folder` };
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
    if (kindAt(file) !== 'other') return false;
    fs.unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * The first and last three lines of a refused output, with `…` between them
 * when lines are left out: enough to show a wrapper (a code fence, a preamble)
 * at a glance.
 */
export function refusedOutputPreview(content: string): string[] {
  const lines = content.replace(/\n$/, '').split('\n');
  if (lines.length <= 7) return lines;
  return [...lines.slice(0, 3), '…', ...lines.slice(-3)];
}

/** The line a failure adds about its refused output: where it is, or why it was not kept. */
export function describeKeptOutput(kept: KeptOutput): string {
  return kept.kept
    ? `The refused output is kept at ${kept.path}`
    : `The refused output was not kept: ${kept.reason}`;
}

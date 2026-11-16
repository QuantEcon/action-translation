/**
 * Which lectures the CLI's commands work on: each repository's lecture set (#449).
 *
 * `init` and the bulk modes (`status`, `forward` through it, `backward`,
 * `headingmap` and `doctor`) take their lectures from the docs folder's ToC
 * and the `.md` files its documents include, as `src/lecture-set.ts` reads
 * them. The source side is the source's set. The target side is the edition's
 * own set: the same reader on the edition's docs folder, whose `_toc.yml` is a
 * mirror that can list lectures a partial edition lacks; those are missing
 * entries, not files. Paths are docs-relative, subfolders included
 * (`_admonition/gpu.md`).
 *
 * A docs folder with no ToC has no lecture set, and a bulk mode there fails
 * with the reader's message, as `init` does (ruling 9). A bulk mode's `-f`
 * names one file and skips discovery, so it needs no ToC. Ruled 2026-11-16
 * (D-2026-11-16-the-lecture-set-is-the-toc-and-its-includes).
 */

import * as path from 'path';
import {
  LectureSet,
  LectureSetError,
  fileSystemSource,
  isBookFile,
  readLectureSet,
} from '../lecture-set.js';

/** Which repository a lecture set belongs to, as the CLI's output names it. */
export type RepoSide = 'SOURCE' | 'TARGET';

/** One repository's lecture set, with what the CLI needs beside it. */
export interface RepoLectures {
  /** The set, as the reader read it. */
  set: LectureSet;
  /** Its lectures: the ToC's documents in order, then the files they include. */
  lectures: string[];
  /** Every `.md` under the docs folder that the book can build from, in the set or not. */
  markdownFiles: string[];
}

/** What a bulk mode adds to the reader's refusal: why it needs a ToC, and the way round it. */
export const BULK_TOC_HINT =
  "A bulk run takes its lectures from the docs folder's _toc.yml and the files they " +
  'include (#449). To work on one file without one, name it with -f.';

/**
 * Read one repository's lecture set from disk. A `LectureSetError` (no docs
 * folder, no `_toc.yml`, one the reader cannot use) is rethrown naming the
 * repository and its docs folder, with `hint` on a line of its own.
 */
export async function readRepoLectures(
  repoPath: string,
  docsFolder: string,
  side: RepoSide,
  hint?: string
): Promise<RepoLectures> {
  const dir = path.join(repoPath, docsFolder);
  try {
    const source = fileSystemSource(repoPath, docsFolder);
    const set = await readLectureSet(source);
    return {
      set,
      lectures: [...set.documents, ...set.fragments],
      markdownFiles: source.files.filter((f) => f.endsWith('.md') && isBookFile(f)),
    };
  } catch (error) {
    if (!(error instanceof LectureSetError)) throw error;
    // The reader names the folder only when it does not exist.
    const where = error.message.includes(dir) ? side : `${side} ${dir}`;
    throw new LectureSetError(`${where}: ${error.message}${hint ? `\n${hint}` : ''}`);
  }
}

/** Both repositories' lecture sets, for a bulk mode: source first, then the edition. */
export async function readBulkLectures(
  sourcePath: string,
  targetPath: string,
  docsFolder: string
): Promise<{ source: RepoLectures; target: RepoLectures }> {
  return {
    source: await readRepoLectures(sourcePath, docsFolder, 'SOURCE', BULK_TOC_HINT),
    target: await readRepoLectures(targetPath, docsFolder, 'TARGET', BULK_TOC_HINT),
  };
}

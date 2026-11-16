/**
 * Sync on the lecture set (#449): which changed files a sync run treats as
 * lectures, and what it lists beside them.
 *
 * A changed or renamed `.md` syncs only when it is in the source's lecture
 * set at the commit being synced: a document the docs folder's `_toc.yml`
 * lists, or a `.md` file one of them includes, followed through further
 * includes (src/lecture-set.ts). One outside it, such as a draft, a
 * `README.md` or an entry commented out of the ToC, is left alone: it is not
 * translated, and the PR body and the job summary list it. That is not a
 * failure. Under `sync-scope: existing` this test comes before scope, so a
 * file outside the set is never checked for a state file. Removals are not
 * narrowed: a removed `.md` is deleted from the edition whether or not the ToC
 * listed it. Ruled 2026-11-16 (@mmcky), on #449
 * (D-2026-11-16-the-lecture-set-is-the-toc-and-its-includes).
 *
 * The set is read through the GitHub API at the commit: one recursive tree
 * read for the file list, then the ToC, then, only for a changed `.md` that is
 * not a ToC document, the include scan, which stops at the first includer.
 * When the PR changes the docs folder's `_toc.yml`, the ToC before it is read
 * at the commit's parent, against the tree there, so that the run can list the
 * lectures the PR takes out of the ToC (the edition keeps them, and sync no
 * longer updates them) and those it adds without changing them (gaps, each
 * with its CLI catch-up). Once the orchestrator has run, each include of a
 * delivered lecture that the edition lacks is listed as a gap too. Sync gains
 * no translation path for any of these: it only lists them.
 *
 * A source ToC that cannot be read or parsed, or a file list GitHub truncated,
 * holds the whole run. It never falls back to the folder, which would widen
 * the set in silence. A lecture that cannot be read during the include scan
 * is an error for the changed file whose place it decides: that file is
 * neither synced nor listed, the run fails, and the other files still sync,
 * as for a failed scope read (D-2026-10-19-sync-scope-existing-reads-state-files).
 *
 * It lives outside `src/index.ts`, which cannot be imported (#169).
 */

import { DEFAULT_RETRY, GitWriteLogger, RetryPolicy, withRetry } from './git-commit.js';
import {
  includesOf,
  isBookFile,
  LectureReadError,
  LectureSetError,
  LectureSetReader,
  LectureSetSource,
  TocDocuments,
} from './lecture-set.js';
import {
  ClassifiedFiles,
  ContentReader,
  docsRelativePath,
  stateFileFor,
  TargetRepo,
  targetHasFile,
} from './sync-scope.js';
import type { Logger } from './sync-orchestrator.js';

/**
 * The tree read the lecture set makes in the source, narrowed so a test can
 * supply it without an Octokit. An Octokit instance satisfies it.
 */
export interface TreeReader {
  rest: {
    git: {
      getTree(params: {
        owner: string;
        repo: string;
        tree_sha: string;
        recursive?: string;
      }): Promise<{
        data: { tree: Array<{ path?: string; type?: string }>; truncated?: boolean };
      }>;
    };
  };
}

/** The source repository. */
export interface SourceRepo {
  owner: string;
  repo: string;
}

/** One source file's text at a ref; `path` is repo-relative. Rejects when it cannot be read. */
export type SourceRead = (path: string, ref: string) => Promise<string>;

/** A changed `.md` the run leaves alone because it is outside the lecture set. */
export interface OutsideFile {
  /** Source path; for a rename, the new path. */
  path: string;
  /** For a rename, the old path, where the edition keeps its translation. */
  previousPath?: string;
}

/** A lecture the source PR added to the ToC without changing it. */
export interface TocAddedEntry {
  /** Source path of the lecture. */
  path: string;
  /** Whether the edition has its state file: a re-listed lecture, caught up with `forward`. */
  inEdition: boolean;
}

/** An include target a delivered lecture names that the edition does not have. */
export interface MissingInclude {
  /** Source path of the included file. */
  path: string;
  /** The delivered lectures that include it, in the order they were found. */
  includedBy: string[];
}

/** Where a sync run's changed files stand against the lecture set. */
export interface LectureSetPlacement {
  /**
   * The classified files less the changed and renamed `.md` files outside the
   * set, and those whose place could not be read. Removals and ToCs are
   * untouched.
   */
  classified: ClassifiedFiles;
  /** Changed `.md` files outside the set, then renames whose new path is outside it. */
  outside: OutsideFile[];
  /** Lectures the source PR took out of the ToC and kept in the docs folder. */
  tocRemoved: string[];
  /** Lectures the source PR added to the ToC without changing them, before the edition is read. */
  tocAdded: string[];
  /**
   * Reads that failed, each an error for the file or ToC entry it names: the
   * caller records each one, which fails the run and opens the failure issue.
   */
  errors: string[];
  /**
   * Set when the lecture set could not be read at all: the ToC is missing,
   * unparseable or of a layout the reader refuses, a read of it failed, or the
   * file list could not be read whole. The run then syncs nothing, and this
   * is its one error.
   */
  refused?: string;
  /** The source's docs-relative files at the commit, when the set was read. */
  sourceFiles?: ReadonlySet<string>;
  /** The docs folder's `_toc.yml` as read at the commit, for the content fetch to reuse. */
  toc?: { path: string; content: string };
}

/** What the PR body and the job summary list from the lecture set. */
export interface LectureSetReport {
  /** The docs folder, normalised as `getInputs` returns it; `-f` arguments are relative to it. */
  docsFolder: string;
  outside: OutsideFile[];
  tocRemoved: string[];
  tocAdded: TocAddedEntry[];
  missingIncludes: MissingInclude[];
}

function statusOf(error: unknown): number | undefined {
  return (error as { status?: number } | null | undefined)?.status;
}

/**
 * An error's message, as one line: a YAML error's message goes on to quote
 * the lines around the fault, which would break the failure issue's list.
 */
function messageOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).split('\n')[0];
}

/** `lectures/`, or '' for the repository root: the prefix of every docs path. */
function prefixOf(docsFolder: string): string {
  return docsFolder && !docsFolder.endsWith('/') ? `${docsFolder}/` : docsFolder;
}

/** A commit, or its parent written `<sha>^`, shortened for a message. */
function shortRef(ref: string): string {
  return ref.endsWith('^') ? `${ref.slice(0, 7)}^` : ref.slice(0, 7);
}

/**
 * The source's docs folder at `ref`, as the lecture set reads it: the file
 * list from one recursive tree read (a commit, or `<sha>^`, resolves to its
 * tree), filtered to the docs folder and made docs-relative, and each file
 * read at `ref`. A tree GitHub truncated is refused, never read as a smaller
 * folder, which would narrow the set in silence.
 *
 * The tree read and the ToC read are retried on a 5xx or a rate limit, as
 * the commit's own calls are: either failing holds the whole run, where a
 * failed read of one lecture fails only that lecture.
 */
export async function githubLectureSetSource(
  client: TreeReader,
  source: SourceRepo,
  docsFolder: string,
  ref: string,
  read: SourceRead,
  logger: GitWriteLogger = SILENT,
  retry: RetryPolicy = DEFAULT_RETRY
): Promise<LectureSetSource> {
  const prefix = prefixOf(docsFolder);
  const where = `${source.owner}/${source.repo} at ${shortRef(ref)}`;
  let data: Awaited<ReturnType<TreeReader['rest']['git']['getTree']>>['data'];
  try {
    ({ data } = await withRetry(
      `Reading the file list of ${where}`,
      () =>
        client.rest.git.getTree({
          owner: source.owner,
          repo: source.repo,
          tree_sha: ref,
          recursive: 'true',
        }),
      logger,
      retry
    ));
  } catch (error) {
    throw new Error(
      `could not read the file list of ${source.owner}/${source.repo} at ${shortRef(ref)} ` +
        `(status ${statusOf(error) ?? 'unknown'}): ${messageOf(error)}`
    );
  }
  if (data.truncated) {
    throw new Error(
      `GitHub truncated the file list of ${source.owner}/${source.repo} at ${shortRef(ref)}, ` +
        'so the lecture set cannot be read whole'
    );
  }
  const files = data.tree
    .filter((entry) => entry.type === 'blob' && typeof entry.path === 'string')
    .map((entry) => entry.path as string)
    .filter((path) => path.startsWith(prefix))
    .map((path) => path.slice(prefix.length));
  return {
    files,
    read: (file) =>
      file === TOC_FILE
        ? withRetry(
            `Reading ${prefix}${file} from ${where}`,
            () => read(`${prefix}${file}`, ref),
            logger,
            retry
          )
        : read(`${prefix}${file}`, ref),
  };
}

/** The docs folder's ToC, whose read is retried with the tree's. */
const TOC_FILE = '_toc.yml';

const SILENT: GitWriteLogger = { info: () => {}, warning: () => {} };

/** The set at one ref: the reader, the folder's files and the ToC's documents. */
interface SetAtRef {
  reader: LectureSetReader;
  files: ReadonlySet<string>;
  toc: TocDocuments;
  tocText?: string;
}

/**
 * Where changed files stand against the source's lecture set at `sha`, read
 * only on a run with a changed or renamed `.md`, or a change to the docs
 * folder's `_toc.yml`; otherwise nothing is read and every file passes
 * through. See the module comment for what each list holds.
 */
export async function placeOnLectureSet(
  client: TreeReader,
  source: SourceRepo,
  read: SourceRead,
  classified: ClassifiedFiles,
  docsFolder: string,
  sha: string,
  /** `owner/repo` of the edition, for the messages. */
  edition: string,
  logger: Logger,
  retry: RetryPolicy = DEFAULT_RETRY
): Promise<LectureSetPlacement> {
  const prefix = prefixOf(docsFolder);
  const tocPath = `${prefix}_toc.yml`;
  const sourceName = `${source.owner}/${source.repo}`;
  const unchanged: LectureSetPlacement = {
    classified,
    outside: [],
    tocRemoved: [],
    tocAdded: [],
    errors: [],
  };
  const tocChanged = classified.changedTocFiles.some((file) => file.filename === tocPath);
  const lectures = classified.changedMarkdownFiles.length + classified.renamedMarkdownFiles.length;
  if (lectures === 0 && !tocChanged) return unchanged;

  const readSetAt = async (ref: string): Promise<SetAtRef> => {
    const texts = new Map<string, string>();
    const folder = await githubLectureSetSource(
      client,
      source,
      docsFolder,
      ref,
      read,
      logger,
      retry
    );
    const reader = new LectureSetReader({
      files: folder.files,
      read: async (file) => {
        const text = await folder.read(file);
        texts.set(file, text);
        return text;
      },
    });
    const toc = await reader.toc();
    // The files the reader resolves against, so `has` agrees with it.
    return {
      reader,
      files: new Set(folder.files.filter(isBookFile)),
      toc,
      tocText: texts.get(toc.toc),
    };
  };

  /** Why a read the reader made failed, naming the file it could not read. */
  const failure = (error: unknown, ref: string): string => {
    if (error instanceof LectureReadError) {
      return (
        `could not read ${prefix}${error.file} from ${sourceName} at ${shortRef(ref)} ` +
        `(status ${statusOf(error.cause) ?? 'unknown'}): ${messageOf(error.cause)}`
      );
    }
    return messageOf(error);
  };

  let after: SetAtRef;
  try {
    after = await readSetAt(sha);
  } catch (error) {
    const refused =
      `Sync refused: the source's lecture set at ${shortRef(sha)} could not be read: ` +
      `${failure(error, sha)}. Without it the run cannot tell which changed files are lectures, ` +
      'so nothing was synced.';
    logger.error(refused);
    return { ...unchanged, errors: [refused], refused };
  }

  if (after.toc.missingEntries.length > 0) {
    const one = after.toc.missingEntries.length === 1;
    logger.info(
      `${tocPath} lists ${after.toc.missingEntries.map((e) => `'${e}'`).join(', ')}, with no ` +
        `file behind ${one ? 'it' : 'them'}; ${one ? 'it is' : 'they are'} not in the lecture set`
    );
  }

  const errors: string[] = [];
  const recordError = (message: string) => {
    errors.push(message);
    logger.error(message);
  };
  /** Where a changed file stands: in the set, outside it, or unknown (an error, recorded). */
  const places = new Map<string, 'in' | 'outside' | 'error'>();
  const place = async (path: string): Promise<'in' | 'outside' | 'error'> => {
    try {
      const membership = await after.reader.membership(docsRelativePath(path, docsFolder));
      return membership === 'outside' ? 'outside' : 'in';
    } catch (error) {
      recordError(
        `Fetch failed (lecture set): ${path}: ${failure(error, sha)}, so whether it is in the ` +
          'lecture set is unknown. It was not synced.'
      );
      return 'error';
    }
  };

  for (const file of classified.changedMarkdownFiles) {
    places.set(file.filename, await place(file.filename));
  }
  for (const file of classified.renamedMarkdownFiles) {
    places.set(file.filename, await place(file.filename));
  }

  // The ToC before this PR, against the tree before it: a lecture the PR took
  // out of the ToC and kept, and one it added without changing it.
  const tocRemoved: string[] = [];
  const tocAdded: string[] = [];
  if (tocChanged) {
    let before: SetAtRef | undefined;
    const parent = `${sha}^`;
    try {
      before = await readSetAt(parent);
    } catch (error) {
      if (error instanceof LectureSetError) {
        // No ToC before this PR, or one the reader could not read: there is
        // nothing to compare with, and a PR that repairs a ToC must not fail.
        logger.info(
          `${tocPath} before this PR could not be read as a ToC (${messageOf(error)}), so the ` +
            'lectures this PR adds to it or takes out of it are not listed'
        );
      } else {
        recordError(
          `Fetch failed (lecture set): ${tocPath}: ${failure(error, parent)}, so the lectures ` +
            'this PR adds to it or takes out of it are unknown.'
        );
      }
    }
    if (before) {
      const changed = new Set([
        ...classified.changedMarkdownFiles.map((f) => f.filename as string),
        ...classified.renamedMarkdownFiles.map((f) => f.filename as string),
      ]);
      // A document can stay in the set as a fragment, which a lecture
      // includes: then it still syncs, and is not listed.
      const stillOutside = async (set: SetAtRef, ref: string, doc: string) => {
        try {
          return (await set.reader.membership(doc)) === 'outside';
        } catch (error) {
          recordError(
            `Fetch failed (lecture set): ${prefix}${doc}: ${failure(error, ref)}, so whether ` +
              `this PR's change to ${tocPath} leaves it in the lecture set is unknown.`
          );
          return false;
        }
      };
      for (const doc of before.toc.documents) {
        if (after.toc.documents.includes(doc) || !after.files.has(doc)) continue;
        const path = `${prefix}${doc}`;
        const known = places.get(path);
        if (known === 'outside' || (known === undefined && (await stillOutside(after, sha, doc)))) {
          tocRemoved.push(path);
        }
      }
      for (const doc of after.toc.documents) {
        const path = `${prefix}${doc}`;
        if (before.toc.documents.includes(doc) || changed.has(path)) continue;
        if (await stillOutside(before, parent, doc)) tocAdded.push(path);
      }
    }
  }

  const outside: OutsideFile[] = [];
  const changedMarkdownFiles = classified.changedMarkdownFiles.filter((file) => {
    const where = places.get(file.filename);
    if (where === 'outside' && !tocRemoved.includes(file.filename)) {
      outside.push({ path: file.filename });
      logger.info(
        `${file.filename}: not synced — outside the lecture set (${tocPath} does not list it, ` +
          'and no lecture includes it)'
      );
    }
    return where === 'in';
  });
  // A rename is one only when its old path is a lecture too, so it has one.
  const renamedMarkdownFiles = classified.renamedMarkdownFiles.filter((file) => {
    const where = places.get(file.filename);
    if (where === 'outside') {
      const previousPath: string = file.previous_filename;
      outside.push({ path: file.filename, previousPath });
      logger.warning(
        `${previousPath} was renamed to ${file.filename}, which is outside the lecture set: ` +
          `${edition} keeps its translation of ${previousPath}, which sync no longer updates`
      );
    }
    return where === 'in';
  });
  for (const path of tocRemoved) {
    logger.info(
      `${path}: taken out of ${tocPath} and kept in the docs folder — ${edition} keeps its ` +
        'translation, which sync no longer updates'
    );
  }

  return {
    classified: { ...classified, changedMarkdownFiles, renamedMarkdownFiles },
    outside,
    tocRemoved,
    tocAdded,
    errors,
    sourceFiles: after.files,
    ...(after.tocText !== undefined ? { toc: { path: tocPath, content: after.tocText } } : {}),
  };
}

/**
 * The gaps the run lists once it knows what it delivers, with one edition
 * read each. For a lecture the PR added to the ToC without changing it, the
 * read of its state file picks the catch-up: `status` and `forward` for a
 * re-listed lecture, which has one, `init -f` for one listed for the first
 * time. For each `.md` a delivered lecture includes, unless this PR delivers
 * it too or the source does not have it, the read of the file itself says
 * whether the edition lacks it. Only a 404 means absent: any other answer is
 * an error for that entry, which the caller records.
 */
export async function findLectureSetGaps(
  client: ContentReader,
  target: TargetRepo,
  docsFolder: string,
  input: {
    /** `LectureSetPlacement.tocAdded`. */
    tocAdded: string[];
    /** The lectures this PR delivers, each with its English at the commit. */
    delivered: Array<{ path: string; content: string }>;
    /** `LectureSetPlacement.sourceFiles`. */
    sourceFiles?: ReadonlySet<string>;
  },
  logger: Logger
): Promise<{ tocAdded: TocAddedEntry[]; missingIncludes: MissingInclude[]; errors: string[] }> {
  const prefix = prefixOf(docsFolder);
  const tocAdded: TocAddedEntry[] = [];
  const missingIncludes: MissingInclude[] = [];
  const errors: string[] = [];
  const recordError = (message: string) => {
    errors.push(message);
    logger.error(message);
  };

  for (const path of input.tocAdded) {
    try {
      tocAdded.push({
        path,
        inEdition: await targetHasFile(client, target, stateFileFor(path, docsFolder)),
      });
    } catch (error) {
      recordError(
        `Fetch failed (lecture set): ${path}: ${messageOf(error)}, so the catch-up for this ` +
          'lecture, which this PR adds to the ToC without delivering it, is unknown.'
      );
    }
  }

  const delivered = new Set(input.delivered.map((lecture) => lecture.path));
  const includedBy = new Map<string, string[]>();
  for (const lecture of input.delivered) {
    for (const file of includesOf(lecture.content, docsRelativePath(lecture.path, docsFolder))) {
      const path = `${prefix}${file}`;
      if (delivered.has(path) || (input.sourceFiles && !input.sourceFiles.has(file))) continue;
      includedBy.set(path, [...(includedBy.get(path) ?? []), lecture.path]);
    }
  }
  for (const [path, by] of includedBy) {
    try {
      if (!(await targetHasFile(client, target, path))) {
        missingIncludes.push({ path, includedBy: by });
        logger.warning(
          `${path}: ${by.join(', ')} ${by.length === 1 ? 'includes' : 'include'} it, and ` +
            `${target.owner}/${target.repo} does not have it`
        );
      }
    } catch (error) {
      recordError(
        `Fetch failed (lecture set): ${path}: ${messageOf(error)}, so whether the edition has ` +
          `this file, which ${by.join(', ')} ${by.length === 1 ? 'includes' : 'include'}, is unknown.`
      );
    }
  }
  return { tocAdded, missingIncludes, errors };
}

// =============================================================================
// THE PR BODY AND THE JOB SUMMARY
// =============================================================================

/** The PR-body heading for changed files outside the lecture set. */
export const OUTSIDE_SET_HEADING = '### Files Outside the Lecture Set';

/** The PR-body heading for lectures taken out of the ToC and kept. */
export const TOC_REMOVED_HEADING = '### Lectures Taken Out of the ToC';

/** The PR-body heading for lectures added to the ToC with nothing delivered. */
export const TOC_ADDED_HEADING = '### ⚠️ ToC Entries With Nothing Delivered';

/** The PR-body heading for included files the edition lacks. */
export const MISSING_INCLUDES_HEADING = '### ⚠️ Included Files the Edition Lacks';

function outsideItem(file: OutsideFile): string {
  return file.previousPath
    ? `- \`${file.path}\` (renamed from \`${file.previousPath}\`): the edition keeps its ` +
        `translation of \`${file.previousPath}\`, which sync no longer updates`
    : `- \`${file.path}\``;
}

function tocAddedItem(entry: TocAddedEntry, docsFolder: string): string {
  const file = docsRelativePath(entry.path, docsFolder);
  return entry.inEdition
    ? `- \`${entry.path}\`: \`translate status -f ${file}\`, then \`translate forward -f ${file}\``
    : `- \`${entry.path}\`: \`translate init -f ${file}\``;
}

function missingIncludeItem(include: MissingInclude, docsFolder: string): string {
  const by = include.includedBy.map((p) => `\`${p}\``).join(', ');
  return (
    `- \`${include.path}\` (included by ${by}): ` +
    `\`translate init -f ${docsRelativePath(include.path, docsFolder)}\``
  );
}

/**
 * The PR-body sections for what the lecture set left out or found missing,
 * or '' when there is nothing to list. They are listed, never declared: they
 * stay out of the metadata's `files`, which names what the PR delivers
 * (#259's declared-vs-delivered check).
 */
export function formatLectureSetNotice(report: LectureSetReport): string {
  const toc = `\`${prefixOf(report.docsFolder)}_toc.yml\``;
  let notice = '';
  if (report.outside.length > 0) {
    notice +=
      `\n\n${OUTSIDE_SET_HEADING}\n\nThe source PR also changed these \`.md\` files. ${toc} ` +
      'does not list them and no lecture includes them, so they are not lectures, and this PR ' +
      'leaves them out.\n\n' +
      report.outside.map(outsideItem).join('\n');
  }
  if (report.tocRemoved.length > 0) {
    notice +=
      `\n\n${TOC_REMOVED_HEADING}\n\nThe source PR took these lectures out of ${toc} and kept ` +
      'them in the docs folder, so sync no longer updates them. The edition keeps its ' +
      "translation and state file of each, and its `_toc.yml`, a mirror of the source's, no " +
      'longer lists them.\n\n' +
      report.tocRemoved.map((p) => `- \`${p}\``).join('\n');
  }
  if (report.tocAdded.length > 0) {
    notice +=
      `\n\n${TOC_ADDED_HEADING}\n\nThe source PR added these lectures to ${toc} without ` +
      "changing them, so this PR delivers nothing for them, though the edition's `_toc.yml` " +
      "now lists them. Catch each one up from a checkout of the source's default branch: " +
      'with `translate status` and `translate forward` when the edition has its state file, ' +
      'and with `translate init -f` when it has none, as for a lecture listed for the first ' +
      'time. `translate init -f` overwrites a translation without asking, so use it only for a ' +
      'lecture the edition does not have.\n\n' +
      report.tocAdded.map((e) => tocAddedItem(e, report.docsFolder)).join('\n');
  }
  if (report.missingIncludes.length > 0) {
    notice +=
      `\n\n${MISSING_INCLUDES_HEADING}\n\nLectures this PR delivers include these files with ` +
      '`{include}`, and the edition does not have them, so its build cannot resolve those ' +
      "includes. Translate each one from a checkout of the source's default branch:\n\n" +
      report.missingIncludes.map((i) => missingIncludeItem(i, report.docsFolder)).join('\n');
  }
  return notice;
}

/**
 * The job-summary sections for the lecture set: what it left out, the gaps it
 * found, and the reads that failed (`errors`), or '' when there are none.
 */
export function formatLectureSetSummary(report: LectureSetReport, errors: string[]): string {
  const lines: string[] = [];
  const section = (heading: string, items: string[], note?: string) => {
    if (items.length === 0) return;
    lines.push('', `${heading} (${items.length})`, '');
    if (note) lines.push(note, '');
    lines.push(...items);
  };
  const toc = `\`${prefixOf(report.docsFolder)}_toc.yml\``;
  section(
    '### Not synced: outside the lecture set',
    report.outside.map(outsideItem),
    `${toc} does not list these files, and no lecture includes them.`
  );
  section(
    '### Not synced: taken out of the ToC',
    report.tocRemoved.map((p) => `- \`${p}\``),
    'The edition keeps its translation and state file of each.'
  );
  section(
    '### ⚠️ Added to the ToC, nothing delivered',
    report.tocAdded.map((e) => tocAddedItem(e, report.docsFolder)),
    "Catch each one up from a checkout of the source's default branch."
  );
  section(
    '### ⚠️ Included, but not in this edition',
    report.missingIncludes.map((i) => missingIncludeItem(i, report.docsFolder)),
    "Translate each one from a checkout of the source's default branch."
  );
  section(
    '### ❌ Lecture set unknown',
    errors.map((e) => `- ${e}`),
    'These reads failed, so the files they cover were neither synced nor listed, and the run ' +
      'failed.'
  );
  return lines.length > 0 ? lines.join('\n').slice(1) : '';
}

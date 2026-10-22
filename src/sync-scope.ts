/**
 * Sync scope: which changed lectures a sync run may touch (#344).
 *
 * A lecture is in scope when the target edition holds its state file,
 * `.translate/state/<docs-relative path>.yml`, on its default branch. Every
 * tool that adds a lecture writes one (`init`, `forward`, the sync itself and
 * `status --write-state`), so a lecture joins sync when the pull request that
 * adds it, state file included, merges. There is no list to maintain. A `.md`
 * on `main` is not enough: a partial edition can carry English copies (the
 * Malayalam edition's `intro.md` and `_admonition/gpu.md`), and syncing one
 * would turn an English change into a half-translated page.
 *
 * Scope reads existence, never contents. `readFileState` returns undefined for
 * a state file it cannot validate, and that must not drop a lecture from sync.
 *
 * Only a 404 means "not in scope". Any other failure is an error for that
 * lecture, which fails the run and opens the failure issue, as a non-404 ToC
 * read does (#254): taking a read error as absence, which
 * `fetchAllFileContents` still does on the `all` path (F36 on #169), would
 * turn an outage into a silent skip of a reviewed lecture. The edition itself
 * is read first for the same reason, because GitHub also answers 404 for a
 * repository the token cannot see.
 *
 * Today this runs only under `sync-scope: existing`. It is written as the path
 * every edition will take: the input retires once D2 (#259), one ToC rule and
 * a state-file check have landed, and state-aware sync is then the only
 * behaviour (D-2026-10-19-sync-scope-existing-reads-state-files). It lives
 * outside `src/index.ts`, which cannot be imported (#169), so that D2's path
 * can call it too.
 */

import { stateFileRelativePath } from './cli/translate-state.js';
import type { SyncScope } from './contracts.js';
import type { classifyChangedFiles, FileToSync, Logger } from './sync-orchestrator.js';

/** A source PR's changed files, as `classifyChangedFiles` sorts them. */
export type ClassifiedFiles = ReturnType<typeof classifyChangedFiles>;

/**
 * The two GitHub calls the scope check makes, narrowed so a test can supply
 * them without an Octokit. An Octokit instance satisfies it.
 */
export interface ContentReader {
  rest: {
    repos: {
      get(params: { owner: string; repo: string }): Promise<unknown>;
      getContent(params: { owner: string; repo: string; path: string }): Promise<unknown>;
    };
  };
}

/** The target edition's repository. */
export interface TargetRepo {
  owner: string;
  repo: string;
}

/** A changed lecture the run leaves alone, and why. */
export interface ScopeSkip {
  /** Source path of the lecture; for a rename, the new path. */
  path: string;
  /** For a rename, the old path, whose state file decided. */
  previousPath?: string;
  /** The state file the decision read, repo-relative. */
  statePath: string;
  /**
   * `not-in-edition`: the edition has no state file, so it has not taken the
   * lecture yet. Expected on a partial edition.
   * `lecture-missing`: the state file exists but the lecture's `.md` does not.
   * The edition is inconsistent, and the lecture is not translated from
   * scratch.
   */
  reason: 'not-in-edition' | 'lecture-missing';
}

/** A scoped run. */
export interface ScopedFiles {
  /**
   * The classified files less the lectures out of scope. Removals and ToCs are
   * untouched, unless the edition could not be read: then every list is empty.
   */
  classified: ClassifiedFiles;
  /** Source paths of the changed and renamed lectures that stay in the run. */
  inScope: string[];
  /** The lectures left out: changed lectures first, then renames, each in source-PR order. */
  skipped: ScopeSkip[];
  /**
   * Lectures whose scope could not be read: a read that failed with a status
   * other than 404, or an edition the token cannot see. Such a lecture is
   * neither synced nor skipped. The caller records each message as an error,
   * which fails the run and opens the failure issue.
   */
  errors: string[];
}

/**
 * A path relative to the docs folder, which is how state files are keyed
 * (`lectures/intro.md` → `intro.md` for docs folder `lectures/` or
 * `lectures`). The rule the orchestrator and `fetchExistingStateShas` apply to
 * the normalised folder `getInputs` returns.
 */
export function docsRelativePath(filename: string, docsFolder: string): string {
  if (!docsFolder) return filename;
  const prefix = docsFolder.endsWith('/') ? docsFolder : `${docsFolder}/`;
  return filename.startsWith(prefix) ? filename.slice(prefix.length) : filename;
}

/** The repo-relative state file of a repo-relative lecture path. */
export function stateFileFor(filename: string, docsFolder: string): string {
  return stateFileRelativePath(docsRelativePath(filename, docsFolder));
}

function statusOf(error: unknown): number | undefined {
  return (error as { status?: number } | null | undefined)?.status;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Whether `path` exists on the target's default branch. A 404 is "no"; any
 * other failure throws, so the caller cannot mistake an outage for absence.
 */
export async function targetHasFile(
  client: ContentReader,
  target: TargetRepo,
  path: string
): Promise<boolean> {
  try {
    await client.rest.repos.getContent({ owner: target.owner, repo: target.repo, path });
    return true;
  } catch (error) {
    const status = statusOf(error);
    if (status === 404) return false;
    throw new Error(
      `could not read ${path} from ${target.owner}/${target.repo} ` +
        `(status ${status ?? 'unknown'}): ${messageOf(error)}`
    );
  }
}

/**
 * Keep the changed and renamed lectures the edition has, and list the rest.
 *
 * A lecture is checked before any of its content is fetched, so a skipped one
 * costs one request and no model call. A rename is decided by its previous
 * path: until this sync moves them, the edition holds the lecture and its
 * state file under the old name. A lecture whose state file exists but whose
 * `.md` does not is skipped too, never translated from scratch, and warned
 * about. A lecture whose scope cannot be read is an error, not a skip.
 *
 * Removals and `_toc.yml` pass through. Removals follow the `.md`, and the
 * ToC stays a mirror of the source, which a partial edition prunes at build
 * time. The one exception is an edition that cannot be read at all: then
 * nothing passes through, and the single error fails the run.
 */
export async function scopeChangedLectures(
  client: ContentReader,
  classified: ClassifiedFiles,
  target: TargetRepo,
  docsFolder: string,
  logger: Logger
): Promise<ScopedFiles> {
  const inScope: string[] = [];
  const skipped: ScopeSkip[] = [];
  const errors: string[] = [];
  const edition = `${target.owner}/${target.repo}`;

  // GitHub answers 404 for a repository the token cannot see, the same answer
  // as for a missing state file. Without this read, a misspelt `target-repo`
  // or a token without access would put every lecture out of scope, and the
  // run would pass with nothing synced. An edition that cannot be read can
  // take no change at all, so the ToC and removals are dropped too.
  if (classified.changedMarkdownFiles.length + classified.renamedMarkdownFiles.length > 0) {
    try {
      await client.rest.repos.get({ owner: target.owner, repo: target.repo });
    } catch (error) {
      const message =
        `Fetch failed (scope): could not read the edition ${edition} ` +
        `(status ${statusOf(error) ?? 'unknown'}), so nothing was synced: ${messageOf(error)}`;
      logger.error(message);
      return {
        classified: {
          changedMarkdownFiles: [],
          renamedMarkdownFiles: [],
          changedTocFiles: [],
          removedMarkdownFiles: [],
          removedTocFiles: [],
        },
        inScope,
        skipped,
        errors: [message],
      };
    }
  }

  const keep = async (path: string, previousPath?: string): Promise<boolean> => {
    const decidingPath = previousPath ?? path;
    const statePath = stateFileFor(decidingPath, docsFolder);
    const skip = (reason: ScopeSkip['reason']): ScopeSkip =>
      previousPath ? { path, previousPath, statePath, reason } : { path, statePath, reason };

    try {
      if (!(await targetHasFile(client, target, statePath))) {
        skipped.push(skip('not-in-edition'));
        logger.info(`${path}: not synced — ${edition} has no ${statePath}`);
        return false;
      }
      if (!(await targetHasFile(client, target, decidingPath))) {
        skipped.push(skip('lecture-missing'));
        logger.warning(
          `${path}: not synced — ${edition} has ${statePath} but not ${decidingPath}, so the ` +
            `lecture is not translated from scratch. Restore the lecture or remove its state file.`
        );
        return false;
      }
    } catch (error) {
      // Not a 404, so this lecture's scope is unknown: it is neither synced nor
      // skipped. The error fails the run and opens the failure issue, as a
      // non-404 ToC read does (#254), and the other lectures go on.
      const message = `Fetch failed (scope): ${path}: ${messageOf(error)}`;
      errors.push(message);
      logger.error(message);
      return false;
    }
    inScope.push(path);
    return true;
  };

  const changedMarkdownFiles: ClassifiedFiles['changedMarkdownFiles'] = [];
  for (const file of classified.changedMarkdownFiles) {
    if (await keep(file.filename)) changedMarkdownFiles.push(file);
  }

  const renamedMarkdownFiles: ClassifiedFiles['renamedMarkdownFiles'] = [];
  for (const file of classified.renamedMarkdownFiles) {
    if (await keep(file.filename, file.previous_filename || undefined)) {
      renamedMarkdownFiles.push(file);
    }
  }

  return {
    classified: { ...classified, changedMarkdownFiles, renamedMarkdownFiles },
    inScope,
    skipped,
    errors,
  };
}

/**
 * The `sync-scope` input, as a switch around `scopeChangedLectures`. `all`
 * returns undefined without a request, and the run goes on exactly as it did
 * before the input existed. Retiring the input deletes this function: the
 * caller then scopes every run.
 */
export async function applySyncScope(
  scope: SyncScope,
  client: ContentReader,
  classified: ClassifiedFiles,
  target: TargetRepo,
  docsFolder: string,
  logger: Logger
): Promise<ScopedFiles | undefined> {
  if (scope !== 'existing') return undefined;
  const scoped = await scopeChangedLectures(client, classified, target, docsFolder, logger);
  logger.info(
    `sync-scope: existing — ${scoped.inScope.length} changed lecture(s) in scope, ` +
      `${scoped.skipped.length} not synced` +
      (scoped.errors.length > 0 ? `, ${scoped.errors.length} scope error(s)` : '')
  );
  return scoped;
}

/** True when a scoped run has nothing left to translate, mirror or delete. */
export function nothingToSync(classified: ClassifiedFiles): boolean {
  return (
    classified.changedMarkdownFiles.length === 0 &&
    classified.renamedMarkdownFiles.length === 0 &&
    classified.changedTocFiles.length === 0 &&
    classified.removedMarkdownFiles.length === 0 &&
    classified.removedTocFiles.length === 0
  );
}

/**
 * Hold an in-scope lecture to the rule that it is never translated from
 * scratch. The scope check saw the lecture's `.md` in the edition, so a file
 * that comes back from the content fetch marked new is one the fetch could not
 * read: on the `all` path a failed target read is taken as "absent" (F36 on
 * #169). Translating it would put a fresh machine translation over a reviewed
 * lecture, or beside it for a rename. Such files are dropped and each becomes
 * an error, which fails the run.
 */
export function refuseUnreadLectures(files: FileToSync[]): {
  files: FileToSync[];
  errors: string[];
} {
  const kept: FileToSync[] = [];
  const errors: string[] = [];
  for (const file of files) {
    if ((file.type === 'markdown' || file.type === 'renamed') && file.isNewFile) {
      const read = file.previousFilename ?? file.filename;
      errors.push(
        `Fetch failed (${file.type}): ${file.filename}: the edition has ${read} (sync-scope: ` +
          `existing), but its content could not be read, so it was not translated from scratch`
      );
    } else {
      kept.push(file);
    }
  }
  return { files: kept, errors };
}

/** The PR-body heading for lectures a scoped run left out. */
export const NOT_SYNCED_HEADING = '### Lectures Not Synced';

/** The PR-body heading for lectures whose state file has no lecture beside it. */
export const LECTURE_MISSING_HEADING = '### ⚠️ State File Without a Lecture';

function lectureLabel(skip: ScopeSkip): string {
  return skip.previousPath
    ? `\`${skip.path}\` (renamed from \`${skip.previousPath}\`)`
    : `\`${skip.path}\``;
}

/**
 * The PR-body sections listing the lectures a scoped run left out, or '' when
 * there are none. They are listed, never declared: they stay out of the
 * metadata's `files`, which names what the PR delivers (#259's
 * declared-vs-delivered check).
 */
export function formatScopeNotice(skipped: ScopeSkip[]): string {
  const notInEdition = skipped.filter((s) => s.reason === 'not-in-edition');
  const lectureMissing = skipped.filter((s) => s.reason === 'lecture-missing');
  let notice = '';
  if (notInEdition.length > 0) {
    notice +=
      `\n\n${NOT_SYNCED_HEADING}\n\nThe source PR also changed these lectures. This edition ` +
      `does not have them yet (no state file under \`.translate/state/\`), so ` +
      `\`sync-scope: existing\` leaves them out of this PR.\n\n` +
      notInEdition.map((s) => `- ${lectureLabel(s)}`).join('\n');
  }
  if (lectureMissing.length > 0) {
    notice +=
      `\n\n${LECTURE_MISSING_HEADING}\n\nThis edition has a state file for each of these ` +
      `lectures but not the lecture itself, so this PR does not translate them from scratch. ` +
      `Restore each lecture, or remove its state file.\n\n` +
      lectureMissing.map((s) => `- ${lectureLabel(s)}: \`${s.statePath}\``).join('\n');
  }
  return notice;
}

/** What the job summary of a scoped run reports. */
export interface ScopeSummaryInput {
  targetLanguage: string;
  /** `owner/repo` of the edition. */
  targetRepo: string;
  /** `owner/repo` of the source. */
  sourceRepo: string;
  prNumber: number;
  scoped: ScopedFiles;
  /** The translation PR, when one was opened. */
  prUrl?: string;
  /** Errors the run recorded; non-zero means it failed. */
  errorCount: number;
}

/**
 * The job summary of a scoped run. When nothing is left to sync and every
 * scope read succeeded, it is the run's only output: no PR, no failure issue,
 * and no comment on the source PR. When a scope read failed, the run fails
 * and, outside test mode, also opens the failure issue.
 */
export function buildScopeSummary(input: ScopeSummaryInput): string {
  const { scoped } = input;
  const sourcePr = `[${input.sourceRepo}#${input.prNumber}](https://github.com/${input.sourceRepo}/pull/${input.prNumber})`;

  let outcome: string;
  if (input.prUrl) {
    outcome =
      `**Translation PR:** ${input.prUrl}` +
      (input.errorCount > 0
        ? ` The run also failed with ${input.errorCount} error(s); see the log.`
        : '');
  } else if (input.errorCount > 0) {
    outcome = `**No translation PR.** The run failed with ${input.errorCount} error(s); see the log.`;
  } else if (nothingToSync(scoped.classified)) {
    outcome = '**No translation PR.** Nothing this source PR changed is in scope.';
  } else {
    outcome = '**No translation PR.** The run produced no changes.';
  }

  const notInEdition = scoped.skipped.filter((s) => s.reason === 'not-in-edition');
  const lectureMissing = scoped.skipped.filter((s) => s.reason === 'lecture-missing');

  const lines = [
    `## Translation sync (${input.targetLanguage}): \`sync-scope: existing\``,
    '',
    `Source PR ${sourcePr} → edition \`${input.targetRepo}\``,
    '',
    outcome,
    '',
    'A changed lecture syncs only when this edition has its state file under ' +
      '`.translate/state/`. Removals and `_toc.yml` are not scoped.',
    '',
    `### In scope (${scoped.inScope.length})`,
    '',
    ...(scoped.inScope.length > 0 ? scoped.inScope.map((p) => `- \`${p}\``) : ['None.']),
  ];
  if (notInEdition.length > 0) {
    lines.push(
      '',
      `### Not synced: not in this edition yet (${notInEdition.length})`,
      '',
      ...notInEdition.map((s) => `- ${lectureLabel(s)}`)
    );
  }
  if (lectureMissing.length > 0) {
    lines.push(
      '',
      `### ⚠️ Not synced: state file without a lecture (${lectureMissing.length})`,
      '',
      'Restore each lecture, or remove its state file.',
      '',
      ...lectureMissing.map((s) => `- ${lectureLabel(s)}: \`${s.statePath}\``)
    );
  }
  if (scoped.errors.length > 0) {
    lines.push(
      '',
      `### ❌ Scope unknown (${scoped.errors.length})`,
      '',
      'These reads failed, so the lectures they cover were neither synced nor skipped, ' +
        'and the run failed.',
      '',
      ...scoped.errors.map((e) => `- ${e}`)
    );
  }
  return lines.join('\n') + '\n';
}

/** The part of `core.summary` used here, so a test can stand in for it. */
export interface JobSummary {
  addRaw(text: string, addEOL?: boolean): { write(): Promise<unknown> };
}

/**
 * Write the job summary. One that cannot be written, as when the bundle runs
 * without `GITHUB_STEP_SUMMARY`, is a warning and never fails the sync.
 */
export async function writeJobSummary(
  summary: JobSummary,
  markdown: string,
  logger: Logger
): Promise<void> {
  try {
    await summary.addRaw(markdown, true).write();
  } catch (error) {
    logger.warning(
      `Could not write the job summary: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Sync premise: does the edition's translation start from the English this
 * source PR changed (#420)?
 *
 * Update mode sends the model one source PR's change, from the English at the
 * PR's parent to the English at its merge commit, to carry into the edition's
 * current translation. That works only if the translation already matches the
 * old English. When the edition is behind, because the lecture's previous sync
 * PR is still open or its previous sync failed, the rebuilt lecture cannot
 * match the new English, the structural-parity guard refuses it, and a
 * `\translate-resync` runs the same diff against the same translation and is
 * refused again.
 *
 * The edition's state file, `.translate/state/<docs-relative path>.yml`,
 * records `source-sha`: the source commit the translation was last synced to.
 * The check reads the source file at that commit and compares it, as exact
 * text, with the old English the run already fetched. Content, not commit
 * ancestry, decides: it is exactly the premise, and it does not care that the
 * recorded SHA is a merge commit (#391) or that a squash or rebase merge gave
 * the same English another SHA.
 *
 * - Equal: the premise holds and the lecture syncs as before.
 * - Equal to the new English instead: the translation already carries this
 *   change (a resync of a PR that synced). The lecture syncs as before.
 * - Different: the lecture is not synced and no model call is made. Its error
 *   fails the run and opens the failure issue, which says which case it is.
 *   One commit comparison tells a translation that is behind this change from
 *   one already past it (a resync of an older PR, #276); a translation that is
 *   behind is then looked for in the edition's open translation PRs.
 * - No state file, no usable `source-sha`, or no source file at that commit:
 *   the premise cannot be checked, which is logged, and the lecture syncs as
 *   before. A state file the edition cannot serve (a status other than 404) is
 *   an error, as the scope check's reads are (F36 on #169).
 *
 * The check is necessary, not sufficient: a state file can be advanced past a
 * change that never landed (#287), and then the English at `source-sha` is not
 * what the translation holds.
 *
 * It costs no request of its own for the state file, whose content the run's
 * state-file read already returns, and none at all for a lecture new to the
 * edition, a ToC or a removal. A lecture in update mode with a usable
 * `source-sha` costs one source read; a lecture that fails the check costs a
 * commit comparison; and a run with a lecture behind lists the edition's open
 * PRs once.
 *
 * It lives outside `src/index.ts`, which cannot be imported (#169), so its
 * logic is tested directly.
 */

import * as yaml from 'js-yaml';
import { isTranslationBranch } from './branch-naming.js';
import { parseTranslationSyncMetadata } from './pr-creator.js';
import type { FileToSync, Logger } from './sync-orchestrator.js';
import { docsRelativePath, stateFileFor } from './sync-scope.js';

/** A repository, as `owner` and `repo`. */
export interface Repo {
  owner: string;
  repo: string;
}

/** What the run's read of one state file in the edition returned. */
export type StateRead =
  | { status: 'found'; content: string }
  | { status: 'missing' }
  | { status: 'error'; message: string };

/** The state-file reads a run made, keyed by repo-relative state path. */
export type StateReads = Map<string, StateRead>;

/**
 * The `source-sha` a state file records, or undefined when it records none
 * that can be used: text that is not a YAML mapping, a missing or empty value,
 * `unknown` (what `status --write-state` writes when it cannot tell), or a
 * value that is not a string. Loaded with CORE_SCHEMA, as the CLI loads state;
 * an unquoted all-digit SHA then loads as a number and is not used, since its
 * leading zeros may be gone.
 */
export function recordedSourceSha(stateYaml: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = yaml.load(stateYaml, { schema: yaml.CORE_SCHEMA });
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const value = (parsed as Record<string, unknown>)['source-sha'];
  if (typeof value !== 'string') return undefined;
  const sha = value.trim();
  return sha === '' || sha === 'unknown' ? undefined : sha;
}

/**
 * Whether a fetched file goes to update mode: a changed lecture the edition
 * already has, or a renamed one whose translation exists under the old name.
 * Only these carry a source change into an existing translation.
 */
export function takesUpdateMode(file: FileToSync): boolean {
  if (file.type === 'markdown') return !file.isNewFile;
  if (file.type === 'renamed') return Boolean(file.targetContent);
  return false;
}

/**
 * Where the edition holds the lecture until this sync moves it: the old path
 * for a rename. Its state file, and the source path at the recorded commit,
 * go by this path.
 */
export function editionPath(file: FileToSync): string {
  return file.type === 'renamed' && file.previousFilename ? file.previousFilename : file.filename;
}

/** How the English at the recorded commit compares with this PR's English. */
export type PremiseJudgement = 'holds' | 'carried' | 'mismatch';

/**
 * Judge the premise from the three texts: the English this PR changed from,
 * the English it changed to, and the English at the state file's commit.
 * Exact text comparison: a translation synced to other English is not the one
 * this change was written against, however small the difference.
 */
export function judgePremise(
  oldEnglish: string,
  newEnglish: string,
  englishAtState: string
): PremiseJudgement {
  if (englishAtState === oldEnglish) return 'holds';
  if (englishAtState === newEnglish) return 'carried';
  return 'mismatch';
}

/**
 * Which case a lecture whose premise failed is in:
 *
 * - `still-open`: the translation is behind, and an open translation PR in the
 *   edition carries the lecture: merge it, then carry this change;
 * - `behind`: the translation is behind, and no open PR carries the lecture:
 *   a change never reached the edition, so recover the lecture first;
 * - `ahead`: the translation is at a source commit later than this PR's merge
 *   commit, so this change would undo later source changes (#276).
 */
export type PremiseCase = 'still-open' | 'behind' | 'ahead';

/** A lecture the check kept out of the run. */
export interface PremiseFailure {
  /** Source path; for a rename, the new path. */
  file: string;
  /** For a rename, the old path, under which the edition holds the lecture. */
  previousPath?: string;
  /** The edition's state file the check read, repo-relative. */
  statePath: string;
  /** The `source-sha` it records. */
  stateSha: string;
  /** The source commit this run syncs: the PR's merge commit. */
  sourceSha: string;
  case: PremiseCase;
  /** For `still-open`: the open PRs that carry the lecture, as `owner/repo#N`. */
  openPulls: string[];
}

/** An open PR in the edition, as `pulls.list` returns it. */
export interface OpenPull {
  number: number;
  head: { ref: string };
  body?: string | null;
}

/**
 * The open translation PRs that carry a lecture, by number: PRs on a
 * translation branch whose `translation-sync-metadata` declares one of
 * `paths` as a lecture it writes (a changed or renamed file, under either
 * name of a rename). A PR for this same source PR is left out: it carries
 * this change, not the English it starts from. PRs without metadata, such as
 * hand-staged seed PRs, are not recognised.
 */
export function findCarryingPulls(
  pulls: OpenPull[],
  paths: string[],
  sourcePr: { repo: string; number: number }
): number[] {
  const wanted = new Set(paths);
  const numbers: number[] = [];
  for (const pull of pulls) {
    if (!isTranslationBranch(pull.head?.ref ?? '')) continue;
    const metadata = parseTranslationSyncMetadata(pull.body ?? '');
    if (!metadata) continue;
    if (metadata.sourceRepo === sourcePr.repo && metadata.sourcePR === sourcePr.number) continue;
    const carries = metadata.files.some(
      (entry) =>
        entry.type !== 'removed' &&
        entry.type !== 'toc' &&
        (wanted.has(entry.path) ||
          (entry.previousPath !== undefined && wanted.has(entry.previousPath)))
    );
    if (carries) numbers.push(pull.number);
  }
  return numbers.sort((a, b) => a - b);
}

/** A commit SHA as messages print it. */
export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

function lectureLabel(failure: Pick<PremiseFailure, 'file' | 'previousPath'>): string {
  return failure.previousPath
    ? `${failure.file} (renamed from ${failure.previousPath})`
    : failure.file;
}

function listOf(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * The error a lecture that failed the check records, which the failure issue
 * lists in place of a parity listing. It says which case the lecture is in,
 * and that nothing was sent to the model.
 */
export function formatPremiseError(failure: PremiseFailure, targetLanguage: string): string {
  const at = `${targetLanguage}'s translation of it is at source \`${shortSha(failure.stateSha)}\``;
  const label = lectureLabel(failure);
  const tail = 'It was not synced, and no model call was made.';
  switch (failure.case) {
    case 'still-open': {
      const one = failure.openPulls.length === 1;
      return (
        `Translation behind: ${label}: ${at}. This PR's change assumes the English that ` +
        `${one ? 'translation PR' : 'translation PRs'} ${listOf(failure.openPulls)} ` +
        `${one ? 'carries, and it is' : 'carry, and they are'} still open in the edition. ` +
        `Merge ${one ? 'it' : 'them'}, then carry this change. ${tail}`
      );
    }
    case 'behind':
      return (
        `Translation behind: ${label}: ${at}. The source changed the lecture after that, and ` +
        `that change never reached the edition. Recover the lecture first; that brings in this ` +
        `change too. ${tail}`
      );
    case 'ahead':
      return (
        `Translation ahead: ${label}: ${at}, which is later than this PR's merge commit ` +
        `\`${shortSha(failure.sourceSha)}\`. Carrying this change into it would undo the source ` +
        `changes made since (#276). ${tail}`
      );
  }
}

/** The `translate forward -f` argument for a path: docs-relative. */
function forwardArgument(path: string, docsFolder: string): string {
  return docsRelativePath(path, docsFolder);
}

/**
 * The failure issue's recovery advice for the lectures that failed the check,
 * one item per lecture, or an empty list when there are none. It replaces the
 * generic advice for these lectures: re-running this sync cannot help them,
 * because it carries the same change into the same translation.
 */
export function formatPremiseRecovery(
  failures: PremiseFailure[],
  docsFolder: string,
  targetLanguage: string
): string[] {
  if (failures.length === 0) return [];
  const items = failures.map((failure) => {
    const label = failure.previousPath
      ? `\`${failure.file}\` (renamed from \`${failure.previousPath}\`)`
      : `\`${failure.file}\``;
    const forward = `\`translate forward -f ${forwardArgument(failure.file, docsFolder)}\``;
    const move = failure.previousPath
      ? `, after moving the edition's \`${failure.previousPath}\` and its state file to the new name`
      : '';
    switch (failure.case) {
      case 'still-open':
        return (
          `- ${label}: merge ${listOf(failure.openPulls)} in the edition first, then carry ` +
          `this PR's change into the lecture.`
        );
      case 'behind':
        return (
          `- ${label}: recover the lecture first with ${forward}${move}, run from a checkout ` +
          `of the source's default branch. That includes this PR's change. A ` +
          `\`\\translate-resync\` of this PR cannot recover it.`
        );
      case 'ahead':
        return (
          `- ${label}: if the lecture already has this PR's change, nothing is owed. If it ` +
          `does not, bring it up to date with ${forward}${move}, run from a checkout of the ` +
          `source's default branch.`
        );
    }
  });
  return [
    `These lectures were not synced: ${targetLanguage}'s translation of each does not start ` +
      `from the English this PR changed, so its change cannot be carried in.`,
    '',
    ...items,
    '',
    '`translate forward` regenerates the whole lecture. On a lecture that has been natively ' +
      'reviewed, carry the missed changes in by hand instead.',
  ];
}

// =============================================================================
// THE CHECK
// =============================================================================

/**
 * The GitHub reads the check makes, narrowed so a test can supply them
 * without an Octokit. `githubPremiseReader` builds them from one.
 */
export interface PremiseReader {
  /**
   * The source file's text at `ref`, or undefined when GitHub has no such
   * file or commit there (404, or 422 for a commit it cannot resolve). Throws
   * on any other failure.
   */
  readSource(path: string, ref: string): Promise<string | undefined>;
  /**
   * GitHub's comparison status of `head` against `base` in the source
   * (`ahead`, `behind`, `identical` or `diverged`). Throws when it cannot say.
   */
  compareSource(base: string, head: string): Promise<string>;
  /** The edition's open pull requests. */
  listOpenPulls(): Promise<OpenPull[]>;
}

function statusOf(error: unknown): number | undefined {
  return (error as { status?: number } | null | undefined)?.status;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The check's reads, made with an Octokit. Thin by design: everything that
 * decides anything is in `checkSyncPremise`.
 */
export function githubPremiseReader(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  octokit: any,
  source: Repo,
  edition: Repo
): PremiseReader {
  return {
    async readSource(path, ref) {
      try {
        const { data } = await octokit.rest.repos.getContent({ ...source, path, ref });
        if (!data || !('content' in data)) return undefined;
        return Buffer.from(data.content, 'base64').toString('utf-8');
      } catch (error) {
        const status = statusOf(error);
        if (status === 404 || status === 422) return undefined;
        throw error;
      }
    },
    async compareSource(base, head) {
      const { data } = await octokit.rest.repos.compareCommitsWithBasehead({
        ...source,
        basehead: `${base}...${head}`,
        per_page: 1,
      });
      return String(data.status);
    },
    async listOpenPulls() {
      return (await octokit.paginate(octokit.rest.pulls.list, {
        ...edition,
        state: 'open',
        per_page: 100,
      })) as OpenPull[];
    },
  };
}

/** What the check is given. */
export interface PremiseInput {
  /** The run's fetched files, after any scope filtering. */
  files: FileToSync[];
  /** The run's reads of the edition's state files. */
  stateReads: StateReads;
  docsFolder: string;
  /** The source commit this run syncs: the PR's merge commit. */
  sourceSha: string;
  /** The source repository and PR. */
  source: Repo;
  prNumber: number;
  edition: Repo;
  targetLanguage: string;
}

/** What the check decided. */
export interface PremiseResult {
  /** The files to sync: every file but those held back below. */
  files: FileToSync[];
  /** The lectures whose premise failed, each with its case. */
  failures: PremiseFailure[];
  /**
   * One error per lecture held back, in file order: a failed premise, or a
   * state file the edition could not serve. Each fails the run.
   */
  errors: string[];
}

/**
 * Check each lecture in update mode, before any model call, and hold back
 * those whose translation does not start from this PR's old English. Other
 * files pass through untouched.
 */
export async function checkSyncPremise(
  input: PremiseInput,
  reader: PremiseReader,
  logger: Logger
): Promise<PremiseResult> {
  const edition = `${input.edition.owner}/${input.edition.repo}`;
  const kept: FileToSync[] = [];
  // In file order: a held-back file's error, or its failure to word later.
  const held: Array<{ error: string } | { failure: PremiseFailure }> = [];

  for (const file of input.files) {
    if (!takesUpdateMode(file)) {
      kept.push(file);
      continue;
    }
    const lecturePath = editionPath(file);
    const statePath = stateFileFor(lecturePath, input.docsFolder);
    const uncheckable = (why: string) => {
      logger.info(`${file.filename}: premise not checked — ${why}; syncing as before`);
      kept.push(file);
    };

    const read = input.stateReads.get(statePath) ?? { status: 'missing' };
    if (read.status === 'error') {
      const error =
        `Fetch failed (state): ${file.filename}: could not read ${statePath} from ${edition} ` +
        `(${read.message}), so whether its translation starts from this PR's English could not ` +
        `be checked. It was not synced.`;
      logger.error(error);
      held.push({ error });
      continue;
    }
    if (read.status === 'missing') {
      uncheckable(`${edition} has no ${statePath}`);
      continue;
    }
    const stateSha = recordedSourceSha(read.content);
    if (!stateSha) {
      uncheckable(`${statePath} records no usable source-sha`);
      continue;
    }
    if (!file.oldContent || file.newContent === undefined) {
      uncheckable('this run has no previous English for it');
      continue;
    }

    let englishAtState: string | undefined;
    try {
      englishAtState = await reader.readSource(lecturePath, stateSha);
    } catch (error) {
      logger.warning(
        `${file.filename}: premise not checked — could not read ${lecturePath} at ` +
          `${shortSha(stateSha)} from the source (status ${statusOf(error) ?? 'unknown'}): ` +
          `${messageOf(error)}; syncing as before`
      );
      kept.push(file);
      continue;
    }
    if (englishAtState === undefined) {
      uncheckable(`the source has no ${lecturePath} at ${shortSha(stateSha)}`);
      continue;
    }

    const judgement = judgePremise(file.oldContent, file.newContent, englishAtState);
    if (judgement === 'holds') {
      logger.info(
        `${file.filename}: premise holds — the translation is at source ${shortSha(stateSha)}, ` +
          `whose English is the English this PR changed`
      );
      kept.push(file);
      continue;
    }
    if (judgement === 'carried') {
      logger.info(
        `${file.filename}: the translation is at source ${shortSha(stateSha)}, whose English ` +
          `is this PR's new English; syncing as before`
      );
      kept.push(file);
      continue;
    }

    // The translation is not at this change's starting English. Which side of
    // the change it is on decides the advice; when the comparison fails, the
    // usual case, behind, is assumed.
    let comparison: string | undefined;
    try {
      comparison = await reader.compareSource(stateSha, input.sourceSha);
    } catch (error) {
      logger.warning(
        `${file.filename}: could not compare source ${shortSha(stateSha)} with ` +
          `${shortSha(input.sourceSha)} (${messageOf(error)}); reporting it as behind`
      );
    }
    held.push({
      failure: {
        file: file.filename,
        ...(file.type === 'renamed' && file.previousFilename
          ? { previousPath: file.previousFilename }
          : {}),
        statePath,
        stateSha,
        sourceSha: input.sourceSha,
        // `behind`: this PR's merge commit is behind the recorded commit.
        case: comparison === 'behind' ? 'ahead' : 'behind',
        openPulls: [],
      },
    });
  }

  const failures = held.flatMap((entry) => ('failure' in entry ? [entry.failure] : []));
  const behind = failures.filter((failure) => failure.case === 'behind');
  if (behind.length > 0) {
    // One listing for the whole run, and only when a lecture is behind. A
    // listing that fails leaves each lecture reported as behind, without a PR.
    let pulls: OpenPull[] | undefined;
    try {
      pulls = await reader.listOpenPulls();
    } catch (error) {
      logger.warning(
        `Could not list the open PRs in ${edition} (${messageOf(error)}); the lectures behind ` +
          `are reported without one`
      );
    }
    if (pulls) {
      const sourceRepo = `${input.source.owner}/${input.source.repo}`;
      for (const failure of behind) {
        const paths = failure.previousPath ? [failure.file, failure.previousPath] : [failure.file];
        const numbers = findCarryingPulls(pulls, paths, {
          repo: sourceRepo,
          number: input.prNumber,
        });
        if (numbers.length > 0) {
          failure.case = 'still-open';
          failure.openPulls = numbers.map((n) => `${edition}#${n}`);
        }
      }
    }
  }

  const errors = held.map((entry) => {
    if ('error' in entry) return entry.error;
    const error = formatPremiseError(entry.failure, input.targetLanguage);
    logger.error(error);
    return error;
  });
  return { files: kept, failures, errors };
}

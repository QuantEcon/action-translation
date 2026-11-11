/**
 * Sync premise: does the edition's translation start from the English this
 * source PR changed (#420)?
 *
 * Update mode sends the model one source PR's change, from the English at the
 * PR's parent to the English at its merge commit, to carry into the edition's
 * current translation. That works only if the translation already matches the
 * old English. When the edition is behind because the lecture's previous sync
 * failed, the rebuilt lecture cannot match the new English, the
 * structural-parity guard refuses it, and a `\translate-resync` runs the same
 * diff against the same translation and is refused again. When it is behind
 * because the lecture's previous sync PR is still open, the same happens if
 * that PR changed the lecture's structure; if it did not, the sync succeeds as
 * a stacked PR, which rebase mode rebuilds once the earlier PR merges.
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
 * - Different: one commit comparison tells a translation that is behind this
 *   change from one already past it (a resync of an older PR, #276); a
 *   translation that is behind is then looked for in the edition's open
 *   translation PRs. That gives three cases:
 *   - `still-open`, behind and carried by an open translation PR: the lecture
 *     syncs as before, since the stacked sync may well succeed. The case is
 *     kept as a diagnosis: the sync PR's body names the open PRs, or, when the
 *     lecture then fails, the failure issue says why and to merge them first.
 *   - `behind`, with no open PR that carries it, and `ahead`: the lecture is
 *     held back and no model call is made. Its error fails the run and opens
 *     the failure issue, which says which case it is.
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
 * `source-sha` costs one source read; a lecture whose English differs costs a
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
 * Which case a lecture whose translation does not start from this PR's old
 * English is in:
 *
 * - `still-open`: the translation is behind, and an open translation PR in the
 *   edition carries the lecture. The lecture still syncs, as a stacked PR;
 * - `behind`: the translation is behind, and no open PR carries the lecture:
 *   a change never reached the edition, so recover the lecture first;
 * - `ahead`: the translation is at a source commit later than this PR's merge
 *   commit, so this change would undo later source changes (#276).
 */
export type PremiseCase = 'still-open' | 'behind' | 'ahead';

/** What the check records of a lecture whose English differs, in every case. */
interface MismatchDetails {
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
}

/** A lecture the check kept out of the run: `behind` or `ahead`. */
export interface HeldBackLecture extends MismatchDetails {
  case: 'behind' | 'ahead';
}

/**
 * A lecture behind an open translation PR in the edition. It is synced as
 * before; this is the diagnosis the sync PR's body, or the failure issue if
 * the lecture then fails, gives for it.
 */
export interface StillOpenLecture extends MismatchDetails {
  case: 'still-open';
  /** The open PRs that carry the lecture, as `owner/repo#N`, in number order. */
  openPulls: string[];
}

/** A lecture whose translation does not start from this PR's old English. */
export type PremiseMismatch = HeldBackLecture | StillOpenLecture;

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

/**
 * The engine's issue on rebuilding from a stale merge-time snapshot (#276),
 * as messages cite it. They are posted to the source repository or the
 * edition, where a bare `#276` would link that repository's own issue.
 */
export const STALE_SNAPSHOT_ISSUE = 'QuantEcon/action-translation#276';

/** A commit SHA as messages print it. */
export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

function lectureLabel(lecture: Pick<MismatchDetails, 'file' | 'previousPath'>): string {
  return lecture.previousPath
    ? `${lecture.file} (renamed from ${lecture.previousPath})`
    : lecture.file;
}

/** A list of names as prose: `a`, `a and b`, `a, b and c`. */
export function listOf(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * The error a held-back lecture records, which the failure issue lists in
 * place of a parity listing. It says which case the lecture is in, and that
 * nothing was sent to the model.
 */
export function formatHeldBackError(lecture: HeldBackLecture, targetLanguage: string): string {
  const at = `${targetLanguage}'s translation of it is at source \`${shortSha(lecture.stateSha)}\``;
  const label = lectureLabel(lecture);
  const tail = 'It was not synced, and no model call was made.';
  switch (lecture.case) {
    case 'behind':
      return (
        `Translation behind: ${label}: ${at}. The source changed the lecture after that, and ` +
        `that change never reached the edition. Recover the lecture first; that brings in this ` +
        `change too. ${tail}`
      );
    case 'ahead':
      return (
        `Translation ahead: ${label}: ${at}, which is later than this PR's merge commit ` +
        `\`${shortSha(lecture.sourceSha)}\`. Carrying this change into it would undo the source ` +
        `changes made since (${STALE_SNAPSHOT_ISSUE}). ${tail}`
      );
  }
}

/**
 * Why a lecture behind an open translation PR may have failed, which the
 * failure issue puts beside the lecture's own error when its sync failed. The
 * lecture was synced; this names the open PRs and says to merge them first.
 */
export function formatStillOpenDiagnosis(
  lecture: StillOpenLecture,
  targetLanguage: string
): string {
  const one = lecture.openPulls.length === 1;
  return (
    `Translation behind: ${lectureLabel(lecture)}: ${targetLanguage}'s translation of it is at ` +
    `source \`${shortSha(lecture.stateSha)}\`. This PR's change assumes the English that ` +
    `${one ? 'translation PR' : 'translation PRs'} ${listOf(lecture.openPulls)} ` +
    `${one ? 'carries, and it is' : 'carry, and they are'} still open in the edition. ` +
    `Merge ${one ? 'it' : 'them'}, then carry this change.`
  );
}

/**
 * The `-d` value the CLI takes for the Action's docs folder: no trailing
 * slash, and `.` for the repository root, which the Action holds as ''.
 */
function cliDocsFolder(docsFolder: string): string {
  const trimmed = docsFolder.replace(/\/+$/, '');
  return trimmed === '' ? '.' : trimmed;
}

/**
 * The failure issue's recovery advice for the held-back lectures, one item
 * per lecture, or an empty list when there are none. It replaces the generic
 * advice for these lectures: re-running this sync cannot help them, because
 * it carries the same change into the same translation.
 *
 * A lecture reads `behind` also when its state file is wrong and the edition
 * has the changes: rebase stamps each sync PR's own source commit, so sibling
 * sync PRs merged out of source order leave the state file at the older PR's
 * commit. The `behind` item says how to correct the state file in that case,
 * with `translate status --write-state --carried` run from a source clone at
 * this PR's parent, whose English is the English this PR changed: the CLI
 * records the commit that last changed the file at the clone's HEAD.
 */
export function formatPremiseRecovery(
  heldBack: HeldBackLecture[],
  docsFolder: string,
  targetLanguage: string
): string[] {
  if (heldBack.length === 0) return [];
  const items = heldBack.map((lecture) => {
    const label = lecture.previousPath
      ? `\`${lecture.file}\` (renamed from \`${lecture.previousPath}\`)`
      : `\`${lecture.file}\``;
    const forward = `\`translate forward -f ${docsRelativePath(lecture.file, docsFolder)}\``;
    const move = lecture.previousPath
      ? `, after moving the edition's \`${lecture.previousPath}\` and its state file to the new name`
      : '';
    switch (lecture.case) {
      case 'behind': {
        // The state file is under the name the edition holds the lecture by,
        // which is also its name at this PR's parent.
        const statusFile = docsRelativePath(lecture.previousPath ?? lecture.file, docsFolder);
        const status =
          `\`translate status -s <source clone> -t <edition clone> -l ${targetLanguage} ` +
          `-d ${cliDocsFolder(docsFolder)} -f ${statusFile} --write-state --carried\``;
        return [
          `- ${label}: recover the lecture first with ${forward}${move}, run from a checkout ` +
            `of the source's default branch. That includes this PR's change. A ` +
            `\`\\translate-resync\` of this PR cannot recover it.`,
          `  - If the edition already has the changes made since \`${shortSha(lecture.stateSha)}\`, ` +
            `the state file is wrong, not the lecture: sibling sync PRs merged out of source ` +
            `order leave it at the older PR's commit. Correct it instead of regenerating the ` +
            `lecture: check out this PR's parent, \`${shortSha(lecture.sourceSha)}^\`, in a ` +
            `source clone, run ${status}, and commit the state file to the edition. A ` +
            `\`\\translate-resync\` of this PR can then carry its change, if none of the PR's ` +
            `files has changed on the source's default branch since it merged ` +
            `(${STALE_SNAPSHOT_ISSUE}).`,
        ].join('\n');
      }
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
  /** The files to sync, in order: every file but those held back below. */
  files: FileToSync[];
  /** The lectures held back, `behind` or `ahead`, in file order. */
  heldBack: HeldBackLecture[];
  /**
   * The lectures behind an open translation PR, in file order. They are among
   * `files`: each syncs as before, and this is the diagnosis for it.
   */
  stillOpen: StillOpenLecture[];
  /**
   * One error per lecture held back, in file order: a held-back lecture, or a
   * state file the edition could not serve. Each fails the run.
   */
  errors: string[];
}

/**
 * Check each lecture in update mode, before any model call. Hold back those
 * whose translation does not start from this PR's old English, unless an open
 * translation PR in the edition carries the lecture: that one syncs as before,
 * with its diagnosis recorded. Other files pass through untouched.
 */
export async function checkSyncPremise(
  input: PremiseInput,
  reader: PremiseReader,
  logger: Logger
): Promise<PremiseResult> {
  const edition = `${input.edition.owner}/${input.edition.repo}`;
  // In file order: a file to sync, a held-back file's error, or a file whose
  // English differs, whose case the listing of open PRs below may still change.
  const outcomes: Array<
    { keep: FileToSync } | { error: string } | { mismatch: PremiseMismatch; file: FileToSync }
  > = [];

  for (const file of input.files) {
    if (!takesUpdateMode(file)) {
      outcomes.push({ keep: file });
      continue;
    }
    const lecturePath = editionPath(file);
    const statePath = stateFileFor(lecturePath, input.docsFolder);
    const uncheckable = (why: string) => {
      logger.info(`${file.filename}: premise not checked — ${why}; syncing as before`);
      outcomes.push({ keep: file });
    };

    const read = input.stateReads.get(statePath) ?? { status: 'missing' };
    if (read.status === 'error') {
      const error =
        `Fetch failed (state): ${file.filename}: could not read ${statePath} from ${edition} ` +
        `(${read.message}), so whether its translation starts from this PR's English could not ` +
        `be checked. It was not synced.`;
      logger.error(error);
      outcomes.push({ error });
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
      outcomes.push({ keep: file });
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
      outcomes.push({ keep: file });
      continue;
    }
    if (judgement === 'carried') {
      logger.info(
        `${file.filename}: the translation is at source ${shortSha(stateSha)}, whose English ` +
          `is this PR's new English; syncing as before`
      );
      outcomes.push({ keep: file });
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
    outcomes.push({
      file,
      mismatch: {
        file: file.filename,
        ...(file.type === 'renamed' && file.previousFilename
          ? { previousPath: file.previousFilename }
          : {}),
        statePath,
        stateSha,
        sourceSha: input.sourceSha,
        // `behind`: this PR's merge commit is behind the recorded commit.
        case: comparison === 'behind' ? 'ahead' : 'behind',
      },
    });
  }

  const behind = outcomes.flatMap((entry) =>
    'mismatch' in entry && entry.mismatch.case === 'behind' ? [entry] : []
  );
  if (behind.length > 0) {
    // One listing for the whole run, and only when a lecture is behind. A
    // listing that fails leaves each lecture reported as behind, without a PR,
    // and so held back.
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
      for (const entry of behind) {
        const { file, previousPath } = entry.mismatch;
        const numbers = findCarryingPulls(pulls, previousPath ? [file, previousPath] : [file], {
          repo: sourceRepo,
          number: input.prNumber,
        });
        if (numbers.length > 0) {
          entry.mismatch = {
            ...entry.mismatch,
            case: 'still-open',
            openPulls: numbers.map((n) => `${edition}#${n}`),
          };
        }
      }
    }
  }

  const result: PremiseResult = { files: [], heldBack: [], stillOpen: [], errors: [] };
  for (const entry of outcomes) {
    if ('keep' in entry) {
      result.files.push(entry.keep);
    } else if ('error' in entry) {
      result.errors.push(entry.error);
    } else if (entry.mismatch.case === 'still-open') {
      const lecture = entry.mismatch;
      const one = lecture.openPulls.length === 1;
      logger.warning(
        `${lecture.file}: the translation is at source ${shortSha(lecture.stateSha)}, behind ` +
          `the English this PR changed; ${one ? 'translation PR' : 'translation PRs'} ` +
          `${listOf(lecture.openPulls)}, still open in the edition, ${one ? 'carries' : 'carry'} ` +
          `the lecture. Syncing as before`
      );
      result.files.push(entry.file);
      result.stillOpen.push(lecture);
    } else {
      const error = formatHeldBackError(entry.mismatch, input.targetLanguage);
      logger.error(error);
      result.heldBack.push(entry.mismatch);
      result.errors.push(error);
    }
  }
  return result;
}

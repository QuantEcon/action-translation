/**
 * Recovery advice the Action prints (#281): the sync failure issue's body and
 * the comment on a translation PR whose rebase failed.
 *
 * Both used to prescribe `\translate-resync` with no condition, the rebase
 * comment with the wrong slash. A resync rebuilds every file of the source PR
 * from its merge-time snapshot, so once the source has changed any of them
 * since the merge it reverts that change (#276), and it repeats a
 * structural-parity failure exactly. The 2026-08-20 ruling on #276 made the
 * CLI the documented recovery and allowed a resync only under a precondition;
 * this module prints that ruling:
 *
 * - a lecture the edition has: `translate forward -f <file>`, from a checkout
 *   of the source's default branch, never on a natively reviewed lecture,
 *   which takes the change by hand;
 * - a lecture the edition does not have: `translate init -f <file>`, which
 *   overwrites without asking and so is only for that case;
 * - `\translate-resync` only when no file of the source PR has changed on the
 *   source's default branch since the PR merged, every file of the PR and not
 *   only the one that failed.
 *
 * A lecture held back by update mode's premise check (#420) gets the advice
 * `formatPremiseRecovery` gives for its case instead. A lecture the check
 * found behind an open translation PR is synced; if it then fails, the issue
 * puts that diagnosis beside its error and advises merging the open PR first.
 *
 * It lives outside `src/index.ts`, which cannot be imported (#169), so the
 * text is tested directly.
 */

import { RESYNC_COMMAND } from './inputs.js';
import type { TranslationSyncMetadata } from './pr-creator.js';
import {
  formatPremiseRecovery,
  formatStillOpenDiagnosis,
  HeldBackLecture,
  listOf,
  STALE_SNAPSHOT_ISSUE,
  StillOpenLecture,
} from './sync-premise.js';
import { docsRelativePath } from './sync-scope.js';

/** A lecture whose sync failed, for the per-lecture recovery lines. */
export interface FailedLecture {
  /** Source path; for a rename, the new path. */
  file: string;
  /** For a rename, the old path, under which the edition holds the lecture. */
  previousPath?: string;
  /** Whether the edition has a translation of it (under the old path for a rename). */
  inEdition: boolean;
}

/** What the failure issue reports. */
export interface FailureIssueInput {
  prNumber: number;
  /** `owner/repo` of the edition. */
  targetRepo: string;
  targetLanguage: string;
  /** Every error the run recorded, in order. */
  errors: string[];
  docsFolder: string;
  /** The source PR's merge commit, which a resync rebuilds from. */
  mergeSha?: string;
  /** Lectures the premise check held back (#420), each with its own advice. */
  heldBack?: HeldBackLecture[];
  /** Other lectures whose translation failed, when the run knows them. */
  failedLectures?: FailedLecture[];
  /**
   * Lectures the premise check found behind an open translation PR (#420) and
   * that then failed. Each gets its diagnosis beside its error, and the advice
   * to merge the open PR first in place of its generic recovery line.
   */
  stillOpen?: StillOpenLecture[];
}

/** The deterministic title of a sync failure issue, which a later success closes by. */
export function failureIssueTitle(prNumber: number, targetLanguage: string): string {
  return `Translation sync failed for PR #${prNumber} (${targetLanguage})`;
}

/** The `-f` argument for a lecture: its path inside the docs folder. */
function fileArgument(path: string, docsFolder: string): string {
  return docsRelativePath(path, docsFolder);
}

function failedLectureLine(
  lecture: FailedLecture,
  docsFolder: string,
  stillOpen: StillOpenLecture | undefined
): string {
  const arg = fileArgument(lecture.file, docsFolder);
  const label = lecture.previousPath
    ? `\`${lecture.file}\` (renamed from \`${lecture.previousPath}\`)`
    : `\`${lecture.file}\``;
  if (!lecture.inEdition) {
    return `- ${label}: \`translate init -f ${arg}\`; the edition does not have it yet.`;
  }
  const move = lecture.previousPath
    ? `, after moving the edition's \`${lecture.previousPath}\` and its state file to the new name`
    : '';
  const forward = `\`translate forward -f ${arg}\`${move}`;
  if (stillOpen) {
    const one = stillOpen.openPulls.length === 1;
    return (
      `- ${label}: merge ${listOf(stillOpen.openPulls)} in the edition first; ` +
      `${one ? 'it carries' : 'they carry'} the English this PR's change assumes. Then carry ` +
      `this PR's change into the lecture: ${forward}, or \`${RESYNC_COMMAND}\` on this PR ` +
      `under the condition below.`
    );
  }
  return `- ${label}: ${forward}.`;
}

/**
 * The Errors list: one item per error. A lecture behind an open translation
 * PR that then failed gets its diagnosis as a sub-item under the error the
 * orchestrator recorded for it, or, when it recorded none, as its own item.
 */
function errorLines(errors: string[], stillOpen: StillOpenLecture[], language: string): string[] {
  const placed = new Set<StillOpenLecture>();
  const lines: string[] = [];
  for (const error of errors) {
    lines.push(`- ${error}`);
    const lecture = stillOpen.find(
      (s) => !placed.has(s) && error.startsWith(`Error processing ${s.file}: `)
    );
    if (lecture) {
      placed.add(lecture);
      lines.push(`  - ${formatStillOpenDiagnosis(lecture, language)}`);
    }
  }
  for (const lecture of stillOpen) {
    if (!placed.has(lecture)) lines.push(`- ${formatStillOpenDiagnosis(lecture, language)}`);
  }
  return lines;
}

/**
 * The paragraph that allows a resync, with the #276 precondition, or the
 * failure issue's whole advice for errors that name no lecture.
 */
function resyncParagraph(prNumber: number, mergeSha: string | undefined): string[] {
  const sha = mergeSha ?? '<merge commit>';
  return [
    `\`${RESYNC_COMMAND}\` on #${prNumber} re-runs this sync from the PR's merge-time snapshot, ` +
      `for every file the PR changed, not only those named above. Use it only when none of ` +
      `those files has changed on the source's default branch since the PR merged; otherwise ` +
      `it reverts the later changes (${STALE_SNAPSHOT_ISSUE}). For each file the PR changed,`,
    '',
    `    git rev-list --count ${sha}..origin/main -- <path>`,
    '',
    'must print 0. A structural-parity failure repeats exactly on a resync, so fix its cause ' +
      'first.',
  ];
}

/**
 * The Recovery section's lines. Lectures held back by the premise check come
 * first, with their own advice; the CLI route and the resync precondition
 * follow when any other error is left.
 */
export function failureRecoveryLines(input: FailureIssueInput): string[] {
  const heldBack = input.heldBack ?? [];
  const premise = formatPremiseRecovery(heldBack, input.docsFolder, input.targetLanguage);
  const otherErrors = input.errors.length > heldBack.length;
  if (!otherErrors) return premise;

  const lectures = input.failedLectures ?? [];
  const stillOpen = input.stillOpen ?? [];
  const lines: string[] = [];
  if (premise.length > 0) lines.push(...premise, '', '**For the other errors:**', '');
  lines.push(
    "Recover a lecture from a checkout of the source's default branch, not by re-running this " +
      'sync:',
    ''
  );
  if (lectures.length > 0) {
    lines.push(
      ...lectures.map((lecture) =>
        failedLectureLine(
          lecture,
          input.docsFolder,
          stillOpen.find((s) => s.file === lecture.file)
        )
      ),
      ''
    );
    lines.push('Any other lecture named above:', '');
  }
  lines.push(
    '- one the edition has: `translate forward -f <file>`;',
    '- one the edition does not have yet: `translate init -f <file>`.',
    '',
    "`<file>` is the lecture's path inside the docs folder. `translate forward` regenerates the " +
      'whole lecture, so do not run it on a lecture that has been natively reviewed: carry the ' +
      'change into that one by hand. `translate init -f` overwrites a translation without ' +
      'asking, so use it only for a lecture the edition does not have.',
    '',
    ...resyncParagraph(input.prNumber, input.mergeSha)
  );
  return lines;
}

/** The body of the sync failure issue opened on the source repository. */
export function buildFailureIssueBody(input: FailureIssueInput): string {
  return [
    `### Translation sync failure`,
    '',
    `**Source PR**: #${input.prNumber}`,
    `**Target repo**: ${input.targetRepo}`,
    `**Target language**: ${input.targetLanguage}`,
    '',
    `### Errors`,
    '',
    errorLines(input.errors, input.stillOpen ?? [], input.targetLanguage).join('\n'),
    '',
    `### Recovery`,
    '',
    ...failureRecoveryLines(input),
  ].join('\n');
}

/** What the comment on a translation PR whose rebase failed says. */
export interface RebaseFailureInput {
  /** The edition PR whose merge started the rebase. */
  mergedPrNumber: number;
  /** The failure's message. */
  error: string;
  /** The rebased PR's metadata, when its body has it. */
  metadata?: TranslationSyncMetadata;
  /** The PR's files that the merged PR also changed. */
  overlapping: string[];
  docsFolder: string;
}

/**
 * The comment posted on a translation PR whose rebase failed. It runs in the
 * edition, so a source PR is written `owner/repo#N`: a bare `#N` would link
 * the edition's own PR N. A PR from `translate forward` (`sourcePR: 0`, a
 * `resync/` branch) has no source PR, so none is named, and no resync is
 * offered for it.
 */
export function rebaseFailureComment(input: RebaseFailureInput): string {
  const lectures = input.overlapping
    .filter((path) => path.endsWith('.md'))
    .map((path) => `\`${fileArgument(path, input.docsFolder)}\``);
  const files = lectures.length > 0 ? ` (here: ${lectures.join(', ')})` : '';
  const lines = [
    `⚠️ **Automatic rebase failed** after #${input.mergedPrNumber} was merged.`,
    '',
    `Error: ${input.error}`,
    '',
    'Resolve the conflicts by hand, or regenerate the overlapping lectures with ' +
      `\`translate forward -f <file>\`${files}, run from a checkout of the source's default ` +
      "branch, where `<file>` is the lecture's path inside the docs folder. `translate forward` " +
      'regenerates the whole lecture, so on a lecture that has been natively reviewed, carry the ' +
      'changes in by hand instead.',
  ];
  const metadata = input.metadata;
  if (metadata && metadata.sourcePR > 0) {
    const sourcePr = `${metadata.sourceRepo}#${metadata.sourcePR}`;
    lines.push(
      '',
      `This PR syncs ${sourcePr}. A \`${RESYNC_COMMAND}\` on that PR rebuilds every file it ` +
        'changed from its merge-time snapshot, so use it only when none of those files has ' +
        `changed on the source's default branch since the PR merged (${STALE_SNAPSHOT_ISSUE}).`
    );
  }
  return lines.join('\n');
}

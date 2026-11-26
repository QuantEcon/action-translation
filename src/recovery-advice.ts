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
import { stateFileRelativePath } from './cli/translate-state.js';
import type { AddedLecture, DeletedLecture } from './rebase-plan.js';

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
  /**
   * The edition's bibliography could not be read, so the run synced nothing
   * (#386). No lecture failed, so none gets a recovery line of its own.
   */
  bibliographyUnread?: boolean;
  /**
   * The source's lecture set could not be read at the merge commit, so the
   * run synced nothing (#449). No lecture failed, so none gets a recovery
   * line of its own.
   */
  lectureSetUnread?: boolean;
  /**
   * With `lectureSetUnread`: the `.md` files the held PR removed, and the old
   * paths of those it renamed (#449). No later sync deletes them, since the
   * change that removed them is this one, so each is named with its state
   * file, to delete from the edition by hand.
   */
  heldRemovals?: string[];
  /**
   * The docs folder's `_toc.yml` moved out of it, so the source moved its
   * book and the run was refused (#398). Its advice replaces the rest.
   */
  folderMoved?: { from: string; to: string };
  /**
   * Lectures held back because the read of their own state file answered
   * something other than a 404 (#290). Each has its own error; a failed read
   * is transient more often than not, so they get a resync, not the CLI.
   */
  unreadStates?: UnreadState[];
}

/** A lecture held back because its own state file could not be read (#290). */
export interface UnreadState {
  /** Source path; for a rename, the new path. */
  file: string;
  /** The state file whose read failed, from the repository root. */
  statePath: string;
  /** What the read answered, as `status 502: ...`. */
  status: string;
}

/**
 * A read the rebase plan needed that failed with something other than a 404
 * (#467): of `main`, the PR's baseline, its branch, or the source parent.
 */
export interface FailedRead {
  /** The lecture's path in the PR. */
  file: string;
  /** What was read, as `lectures/x.md at this PR's baseline 1234567`. */
  read: string;
  /** What the read answered, as `status 502: ...`. */
  status: string;
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
 * The advice for lectures held back because their own state file could not
 * be read (#290). The lecture was not translated, and a failed read is
 * transient more often than not, so the advice is to sync again once it
 * reads, under the resync's precondition, which follows.
 */
function unreadStateLines(unread: UnreadState[], prNumber: number): string[] {
  const one = unread.length === 1;
  return [
    `${one ? 'This lecture was' : 'These lectures were'} held back, not translated: the read of ` +
      `${one ? 'its' : "each one's"} state file answered something other than "not found", ` +
      'and sync keeps the keys a state file holds besides its own, so it does not write over a ' +
      'file it could not read. A failed read is transient more often than not: once the state ' +
      `file reads again, sync ${one ? 'it' : 'them'} again with \`${RESYNC_COMMAND}\` on ` +
      `#${prNumber}, under the condition below.`,
    '',
    ...unread.map(
      (lecture) => `- \`${lecture.file}\`: \`${lecture.statePath}\` (${lecture.status})`
    ),
  ];
}

/**
 * The opening of the advice when the edition's bibliography could not be read
 * (#386). The sync stopped before any lecture, so it can run again once the
 * read works, under the resync's precondition, or lecture by lecture.
 */
function bibliographyIntro(input: FailureIssueInput): string {
  return (
    'This run synced nothing: it could not read the bibliography a sync needs to carry the ' +
    `entries its citations use (the edition's \`${input.docsFolder}_config.yml\`, and the files ` +
    'its `bibtex_bibfiles` lists, in the edition and in the source). No lecture was translated ' +
    `and nothing in ${input.targetRepo} changed. Make the file the error names readable (a ` +
    "transient error needs nothing), then sync this PR's changes again: with " +
    `\`${RESYNC_COMMAND}\` under the condition below, or lecture by lecture from a checkout of ` +
    "the source's default branch:"
  );
}

/**
 * The opening of the advice when the source's lecture set could not be read
 * (#449). A resync reads the same merge commit, so it helps only when the
 * read failed for a transient reason; a ToC broken at that commit takes the
 * CLI, whose `forward -f` names its file and reads no ToC.
 */
function lectureSetIntro(input: FailureIssueInput): string {
  return (
    "This run synced nothing: it could not read the source's lecture set at the PR's merge " +
    `commit (\`${input.docsFolder}_toc.yml\`, the lectures it lists and the files they ` +
    'include), which says which changed files are lectures. No lecture was translated and ' +
    `nothing in ${input.targetRepo} changed. If the read failed for a transient reason, sync ` +
    `this PR's changes again with \`${RESYNC_COMMAND}\` under the condition below. If the ToC ` +
    'is missing or broken at that commit, a resync fails the same way: fix the ToC in the ' +
    "source, then carry this PR's lectures from a checkout of the source's default branch:"
  );
}

/**
 * The advice when the source moved its book out of the docs folder (#398).
 * A sync follows changes lecture by lecture and path by path, so the move is
 * made in the edition by hand, and the workflow pointed at the new folder.
 */
function folderMovedLines(moved: { from: string; to: string }, docsFolder: string): string[] {
  const slash = moved.to.lastIndexOf('/');
  const folder = slash === -1 ? '.' : moved.to.slice(0, slash);
  return [
    `The source moved its book: \`${moved.from}\` became \`${moved.to}\`, outside ` +
      `\`docs-folder\` (\`${docsFolder}\`). A sync carries changes into the lectures the edition ` +
      'already has, by path, so it cannot follow the move, and nothing was synced.',
    '',
    `1. In the edition, move the docs folder's files to \`${folder}\` the same way, in a PR of ` +
      'its own. The state files under `.translate/state/` are named relative to the docs ' +
      'folder, so they stay where they are.',
    `2. Set the sync workflow's \`docs-folder\` input to \`${folder}\`, and its \`paths:\` ` +
      'filter to match.',
    '',
    `Do not use \`${RESYNC_COMMAND}\` on this PR: under the new \`docs-folder\`, each lecture ` +
      'it moved reads as a file added from outside the folder, not as a change to a lecture the ' +
      'edition has.',
  ];
}

/**
 * The Recovery section's lines. Lectures held back by the premise check come
 * first, with their own advice; the CLI route and the resync precondition
 * follow when any other error is left.
 */
export function failureRecoveryLines(input: FailureIssueInput): string[] {
  if (input.folderMoved) return folderMovedLines(input.folderMoved, input.docsFolder);
  const heldBack = input.heldBack ?? [];
  const unread = input.unreadStates ?? [];
  const premise = formatPremiseRecovery(heldBack, input.docsFolder, input.targetLanguage);
  const otherErrors = input.errors.length > heldBack.length + unread.length;
  if (!otherErrors && unread.length === 0) return premise;

  const lines: string[] = [];
  if (premise.length > 0) lines.push(...premise, '');
  if (unread.length > 0) {
    if (premise.length > 0) {
      lines.push('**For the lectures whose state file could not be read:**', '');
    }
    lines.push(...unreadStateLines(unread, input.prNumber), '');
    if (!otherErrors) {
      lines.push(...resyncParagraph(input.prNumber, input.mergeSha));
      return lines;
    }
  }
  if (lines.length > 0) lines.push('**For the other errors:**', '');

  const syncedNothing = input.bibliographyUnread || input.lectureSetUnread;
  const lectures = syncedNothing ? [] : (input.failedLectures ?? []);
  const stillOpen = input.stillOpen ?? [];
  lines.push(
    input.lectureSetUnread
      ? lectureSetIntro(input)
      : input.bibliographyUnread
        ? bibliographyIntro(input)
        : "Recover a lecture from a checkout of the source's default branch, not by re-running " +
          'this sync:',
    ''
  );
  const removals = input.lectureSetUnread ? (input.heldRemovals ?? []) : [];
  if (removals.length > 0) {
    lines.push(
      `This PR also removed or renamed ${removals.length === 1 ? 'a lecture' : 'lectures'}, ` +
        `and no later sync deletes ${removals.length === 1 ? 'it' : 'them'} from ` +
        `${input.targetRepo}: the change that removed ${removals.length === 1 ? 'it' : 'them'} ` +
        'is this one. Delete each from the edition by hand, with its state file, where the ' +
        'edition has it:',
      '',
      ...removals.map(
        (file) =>
          `- \`${file}\` and \`${stateFileRelativePath(docsRelativePath(file, input.docsFolder))}\``
      ),
      '',
      'Then carry the lectures this PR changed:',
      ''
    );
  }
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
  /**
   * Lectures the PR changes that were on `main` when it opened and that a PR
   * merged since deleted (#389). The rebase does not bring them back.
   */
  deletedSinceOpened?: DeletedLecture[];
  /**
   * Lectures the PR adds that a PR merged since it opened added to `main`
   * first (#467). The rebase does not choose between the two translations.
   */
  addedOnMainSinceOpened?: AddedLecture[];
  /**
   * Lectures whose own state file the rebase could not read (#290): the
   * rebase stopped for them, and a re-run is the advice.
   */
  unreadStates?: UnreadState[];
  /**
   * Reads of the edition or the source that failed where they decided what
   * the rebase does (#467): a re-run is the advice, as for `unreadStates`.
   */
  failedReads?: FailedRead[];
  /**
   * With `unreadStates` or `failedReads`: whether the rebase failed for
   * anything else too, which keeps the general advice below theirs.
   */
  otherErrors?: boolean;
}

/** A deleted lecture as the comment names it, with its path in the PR for a rename. */
function deletedName(lecture: DeletedLecture): string {
  return lecture.path === lecture.editionPath
    ? `\`${lecture.path}\``
    : `\`${lecture.editionPath}\` (\`${lecture.path}\` in this PR)`;
}

/**
 * The comment posted on a translation PR whose rebase failed. It runs in the
 * edition, so a source PR is written `owner/repo#N`: a bare `#N` would link
 * the edition's own PR N. A PR from `translate forward` (`sourcePR: 0`, a
 * `resync/` branch) has no source PR, so none is named, and no resync is
 * offered for it.
 */
export function rebaseFailureComment(input: RebaseFailureInput): string {
  const deleted = input.deletedSinceOpened ?? [];
  const added = input.addedOnMainSinceOpened ?? [];
  // A deleted lecture is not one to regenerate: `forward` would bring it back.
  // Nor is one with two translations: regenerating it would replace both.
  const held = [...deleted, ...added];
  const lectures = input.overlapping
    .filter(
      (path) => path.endsWith('.md') && !held.some((d) => d.path === path || d.editionPath === path)
    )
    .map((path) => `\`${fileArgument(path, input.docsFolder)}\``);
  const files = lectures.length > 0 ? ` (here: ${lectures.join(', ')})` : '';
  const lines = [
    `⚠️ **Automatic rebase failed** after #${input.mergedPrNumber} was merged.`,
    '',
    `Error: ${input.error}`,
    '',
  ];
  if (deleted.length > 0) {
    const one = deleted.length === 1;
    lines.push(
      `${listOf(deleted.map(deletedName))} ${one ? 'is' : 'are'} no longer on ` +
        `\`main\`: ${one ? 'it was' : 'they were'} there when this PR opened, and a PR merged ` +
        `since deleted ${one ? 'it' : 'them'}. The rebase does not bring a deleted lecture ` +
        'back. If the deletion stands, remove ' +
        (one ? 'the lecture and its state file' : 'those lectures and their state files') +
        ` from this PR's branch (the next rebase then leaves ${one ? 'it' : 'them'} out), or ` +
        'close the PR if nothing else is left in it. If ' +
        `${one ? 'the lecture' : 'a lecture'} should stay in the edition, restore it on \`main\` ` +
        'first, then resolve this PR by hand.',
      ''
    );
  }
  if (added.length > 0) {
    const one = added.length === 1;
    lines.push(
      `${listOf(added.map(deletedName))} ${one ? 'is' : 'are'} on \`main\` now but ` +
        `${one ? 'was' : 'were'} not when this PR opened: a PR merged since added ` +
        `${one ? 'it' : 'them'}, and this PR's source change adds ${one ? 'it' : 'them'} too, ` +
        `so the edition has two translations of ${one ? 'it' : 'each'}. The rebase does not ` +
        'choose between them, and changed neither. Decide which copy wins. To keep ' +
        `\`main\`'s, make ${one ? 'the lecture and its state file' : 'those lectures and their state files'} ` +
        "on this PR's branch match `main`, or close the PR if nothing else is left in it. To " +
        "keep this PR's, resolve the conflict on its branch by hand, keeping the branch's " +
        'copy. Until this PR merges or closes, a later rebase of it stops here again, ' +
        "whatever the branch's copy then holds: this PR's baseline lacks " +
        `${one ? 'the lecture' : 'them'}, and its branch has ${one ? 'it' : 'them'}.`,
      ''
    );
  }
  // A stop for two translations alone gets only its own advice: regenerating
  // the lecture, or resyncing the source PR, would make a third.
  if (added.length > 0 && deleted.length === 0 && lectures.length === 0) {
    return lines.slice(0, -1).join('\n');
  }
  const unread = input.unreadStates ?? [];
  if (unread.length > 0) {
    const one = unread.length === 1;
    lines.push(
      `The rebase stopped before the branch moved, and translated nothing: the read of ` +
        `${one ? 'the state file' : 'each state file'} below answered something other than ` +
        '"not found", and the rebase keeps the keys a state file holds besides its own, so it ' +
        'does not write over a file it could not read. A failed read is transient more often ' +
        'than not: once it reads again, re-run the failed rebase workflow run, which rebuilds ' +
        'this PR on the current `main`.',
      '',
      ...unread.map(
        (lecture) => `- \`${lecture.file}\`: \`${lecture.statePath}\` (${lecture.status})`
      )
    );
    // A failed read alone needs only the re-run: regenerating would replace
    // the translation for a transient error.
    if (!input.otherErrors) return lines.join('\n');
    lines.push('');
  }
  const failedReads = input.failedReads ?? [];
  if (failedReads.length > 0) {
    const one = failedReads.length === 1;
    lines.push(
      `The rebase stopped before the branch moved, and translated nothing: ` +
        `${one ? 'the read below' : 'each read below'} answered something other than ` +
        '"not found", and what the rebase does with the lecture depends on it. A failed read ' +
        'is transient more often than not: once it reads again, re-run the failed rebase ' +
        'workflow run, which rebuilds this PR on the current `main`.',
      '',
      ...failedReads.map((read) => `- \`${read.file}\`: ${read.read} (${read.status})`)
    );
    if (!input.otherErrors) return lines.join('\n');
    lines.push('');
  }
  lines.push(
    'Resolve the conflicts by hand, or regenerate the overlapping lectures with ' +
      `\`translate forward -f <file>\`${files}, run from a checkout of the source's default ` +
      "branch, where `<file>` is the lecture's path inside the docs folder. `translate forward` " +
      'regenerates the whole lecture, so on a lecture that has been natively reviewed, carry the ' +
      'changes in by hand instead.'
  );
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

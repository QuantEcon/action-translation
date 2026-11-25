/**
 * What rebase mode does with a lecture a sibling translation PR carries, from
 * where the edition has it (#389, #351).
 *
 * Rebase mode rebuilds an open translation PR on the edition's new `main`
 * after another PR merges. It used to read each lecture on `main` alone and
 * take any failed read for a lecture new to the edition, which it translated
 * from scratch:
 *
 * - a lecture a merged sibling had deleted came back, freshly translated in
 *   place of the PR's reviewed update (#389);
 * - a lecture the PR itself adds was translated again, in place of the PR's
 *   reviewed translation, because the rebase cache needs a baseline that a new
 *   lecture lacks (#351);
 * - a read that failed for any other reason did the same.
 *
 * And it read a lecture `main` has as an update. When the PR's own source
 * change adds the lecture and another PR added it to `main` first, as a sync
 * and a `\translate-resync` of one source PR both do, the update had no old
 * English to diff against: it failed with a missing-title error that named
 * neither PR, before any model call and with the branch as it was (#467).
 * A lecture `main` got first that the PR's source change only edits, as when
 * a second source PR edits a lecture before the edition merges the first
 * one's sync, is an ordinary stacked update and stays one.
 *
 * `planRebaseRead` decides from up to five reads. On `main` at the SHA the
 * rebase pinned, it looks for the lecture, or for a rename its old path, and
 * then, for a rename whose old path is gone, its new one. At the PR's
 * baseline, `targetBaseSha` (`main` when the PR opened), it looks for the
 * path the edition held the lecture under. On the PR's branch it looks for
 * the lecture under its new name. In the source, the English before the PR's
 * source commit (its parent) says whether that commit adds the lecture. Each
 * read is found, missing (a 404) or an error, and the plan consults a read
 * only when it needs it. When `main` has the lecture, the baseline is read
 * too (when the PR has one); once that answers 404, the source parent
 * decides, and the branch is read only when the parent lacks the lecture.
 *
 * This module is pure, and lives outside `src/index.ts`, which cannot be
 * imported (#169).
 */

/** One read of the edition: the file is there, GitHub answered 404, or the read failed. */
export type ReadStatus = 'found' | 'missing' | 'error';

export interface RebaseReads {
  /** The lecture on `main`, or for a rename its old path. */
  onMain: ReadStatus;
  /**
   * For a rename whose old path `main` lacks: its new path on `main`.
   * Undefined for a plain lecture, or when not read.
   */
  newPathOnMain?: ReadStatus;
  /**
   * The path the edition held the lecture under, at the PR's baseline.
   * Undefined when the PR records no baseline (opened before the rebase
   * cache) or the read was not needed.
   */
  atBaseline?: ReadStatus;
  /** The lecture on the PR's branch, under its new name; undefined when not read. */
  onBranch?: ReadStatus;
  /**
   * The English at the parent of the PR's source commit: 'missing' when that
   * commit adds the lecture (a 404, or an empty file, which leaves nothing to
   * diff against). Consulted only when `main` has the lecture and the
   * baseline lacks it; undefined when not read.
   */
  sourceParent?: ReadStatus;
}

export type RebaseReadPlan =
  /**
   * `main` has it, and so did the baseline (or the PR records none, or the
   * PR's source change edits it, or the branch lacks it): rebuild it on
   * `main` as before, with the rebase cache where the baseline has it.
   */
  | { action: 'update' }
  /**
   * On `main`, not at the baseline, absent before the PR's source commit, and
   * on the branch: the PR's source change adds the lecture, and a PR merged
   * since this one opened added it to `main` first, so the edition has two
   * independent translations of it and nothing to diff the English against.
   * The rebase does not choose between them: fail before the branch moves,
   * with no model call (#467).
   */
  | { action: 'added-on-main-since-opened' }
  /**
   * A rename whose old path is gone from `main` while its new one is there,
   * as after another PR made the same move: rebuild the new path as an update.
   */
  | { action: 'update-at-new-path' }
  /**
   * Not on `main`, nor at the baseline, nor on the branch: a lecture new to
   * the edition that the PR never delivered. Translate it as new, as the
   * sync did; no reviewed text can be lost.
   */
  | { action: 'translate-new' }
  /**
   * Not on `main` or at the baseline, but on the branch: the PR adds it.
   * Carry it and its state file unchanged from the branch (#351).
   */
  | { action: 'carry' }
  /**
   * At the baseline, not on `main`, and still on the branch: a PR merged
   * since deleted it, and rebuilding the PR would bring it back (#389).
   */
  | { action: 'deleted-since-opened' }
  /**
   * Deleted since the PR opened, and gone from the branch too, as once the
   * editor has taken it off: nothing to bring back, so the rebase leaves it.
   */
  | { action: 'drop' }
  /**
   * A read failed, or `main` lacks it and the PR records no baseline, so
   * whether it was deleted since cannot be told. Fail before the branch moves.
   */
  | {
      action: 'error';
      reason: 'main-read' | 'baseline-read' | 'branch-read' | 'source-parent-read' | 'no-baseline';
    };

/**
 * Decide from the reads made so far. When `main` has the lecture, the caller
 * reads the baseline (when the PR has one) and, if that answers 404, consults
 * the source parent and, if that lacks the lecture, reads the branch. Once
 * `main` answers 404, it reads a rename's new path on `main`; unless that
 * settles it, the baseline (when the PR has one); and unless that read fails,
 * the branch.
 */
export function planRebaseRead(reads: RebaseReads): RebaseReadPlan {
  if (reads.onMain === 'found') {
    // A PR opened before the cache has no baseline to read: as before.
    if (reads.atBaseline === undefined || reads.atBaseline === 'found') return { action: 'update' };
    if (reads.atBaseline === 'error') return { action: 'error', reason: 'baseline-read' };
    // The PR's source change edits a lecture the edition got since it opened:
    // a stacked update of `main`'s copy, diffed against the parent's English.
    if (reads.sourceParent === 'found') return { action: 'update' };
    if (reads.sourceParent === undefined || reads.sourceParent === 'error') {
      return { action: 'error', reason: 'source-parent-read' };
    }
    if (reads.onBranch === undefined || reads.onBranch === 'error') {
      return { action: 'error', reason: 'branch-read' };
    }
    // Not on the branch: the PR never delivered it, so no reviewed text of
    // its own is lost, and `main`'s copy is updated as before.
    return reads.onBranch === 'found'
      ? { action: 'added-on-main-since-opened' }
      : { action: 'update' };
  }
  if (reads.onMain === 'error') return { action: 'error', reason: 'main-read' };
  if (reads.newPathOnMain === 'found') return { action: 'update-at-new-path' };
  if (reads.newPathOnMain === 'error') return { action: 'error', reason: 'main-read' };
  if (reads.atBaseline === undefined) return { action: 'error', reason: 'no-baseline' };
  if (reads.atBaseline === 'error') return { action: 'error', reason: 'baseline-read' };
  if (reads.onBranch === undefined || reads.onBranch === 'error') {
    return { action: 'error', reason: 'branch-read' };
  }
  if (reads.atBaseline === 'found') {
    return reads.onBranch === 'found' ? { action: 'deleted-since-opened' } : { action: 'drop' };
  }
  return reads.onBranch === 'found' ? { action: 'carry' } : { action: 'translate-new' };
}

/** A lecture a PR merged since the rebased PR opened deleted from `main`. */
export interface DeletedLecture {
  /** The path `main` held it under: for a rename, its old path. */
  editionPath: string;
  /** Its path in the rebased PR, and on its branch. */
  path: string;
}

/**
 * A lecture the rebased PR adds that a PR merged since it opened added to
 * `main` first (#467). Same shape as a deleted one: for a rename,
 * `editionPath` is the old path `main` now has.
 */
export type AddedLecture = DeletedLecture;

/**
 * A rebase that failed before the branch moved, carrying the lectures a PR
 * merged since the rebased PR opened deleted, and those it added that this PR
 * adds too, so the failure comment can say what to do about them.
 */
export class RebaseReadError extends Error {
  constructor(
    message: string,
    readonly deletedSinceOpened: DeletedLecture[],
    readonly addedOnMainSinceOpened: AddedLecture[] = []
  ) {
    super(message);
    this.name = 'RebaseReadError';
  }
}

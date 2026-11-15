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
 * `planRebaseRead` decides from up to four reads. On `main` at the SHA the
 * rebase pinned, it looks for the lecture, or for a rename its old path, and
 * then, for a rename whose old path is gone, its new one. At the PR's
 * baseline, `targetBaseSha` (`main` when the PR opened), it looks for the
 * path the edition held the lecture under. On the PR's branch it looks for
 * the lecture under its new name. Each read is found, missing (a 404) or an
 * error, and a read is made only when the plan needs it.
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
}

export type RebaseReadPlan =
  /** `main` has it: rebuild it on `main` as before, with the rebase cache. */
  | { action: 'update' }
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
  | { action: 'error'; reason: 'main-read' | 'baseline-read' | 'branch-read' | 'no-baseline' };

/**
 * Decide from the reads made so far. Once `main` answers 404, the caller
 * reads a rename's new path on `main`; unless that settles it, the baseline
 * (when the PR has one); and unless that read fails, the branch.
 */
export function planRebaseRead(reads: RebaseReads): RebaseReadPlan {
  if (reads.onMain === 'found') return { action: 'update' };
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
 * A rebase that failed before the branch moved, carrying the lectures a PR
 * merged since the rebased PR opened deleted, so the failure comment can say
 * what to do about them.
 */
export class RebaseReadError extends Error {
  constructor(
    message: string,
    readonly deletedSinceOpened: DeletedLecture[]
  ) {
    super(message);
    this.name = 'RebaseReadError';
  }
}

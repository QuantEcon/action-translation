/**
 * Keeping non-conflicting sibling translation PRs current during a wave.
 *
 * Rebase mode re-runs the sync pipeline for PRs whose files overlap the merged PR —
 * that is conflict resolution, and it is expensive. A PR with no overlap has no conflict
 * and must not be re-translated, but it is still *behind*: every merge moves the base and
 * its checks go stale. In a `forward` drift-recovery wave that is every sibling, because
 * `forward` opens one PR per lecture and each PR's metadata lists only that lecture plus
 * its own per-lecture state file, so no two siblings ever share a path.
 *
 * See https://github.com/QuantEcon/action-translation/issues/123 (and #115, whose reported
 * symptom — dozens of stale checks re-enqueued by hand — this addresses).
 *
 * This lives outside src/index.ts deliberately. index.ts uses `import.meta.url`, which the
 * Jest CJS module registry cannot load, so nothing in it can be unit tested; that gap is
 * how a third hard-coded branch prefix survived the first fix for #115. New rebase logic
 * goes in testable modules.
 */

/** The subset of Octokit this module needs. */
export interface UpdateBranchCapableOctokit {
  rest: {
    pulls: {
      updateBranch(params: {
        owner: string;
        repo: string;
        pull_number: number;
      }): Promise<unknown>;
    };
  };
}

/**
 * GitHub returns 422 from the update-branch endpoint when the head branch is not behind
 * its base. Mid-wave that is routine — a PR opened after the last merge is already
 * current — so it is a quiet no-op, never a failure.
 */
const NOT_BEHIND_BASE = 422;

/**
 * Bring a PR branch up to date with its base without re-translating anything.
 *
 * Merges the base branch into the head branch via GitHub's update-branch endpoint. This is
 * deliberately not the force-push that conflict rebasing performs: there is nothing to
 * resolve, so the translated content must be left exactly as it is. The only goal is a
 * fresh commit on the branch so its checks re-run against the current base.
 *
 * @returns true if the branch was updated, false if it was already current.
 * @throws on any other error, so the caller can count it as a failure rather than
 *         silently reporting the branch as fine.
 */
export async function refreshStaleBranch(
  octokit: UpdateBranchCapableOctokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<boolean> {
  try {
    await octokit.rest.pulls.updateBranch({ owner, repo, pull_number: prNumber });
    return true;
  } catch (error) {
    if ((error as { status?: number }).status === NOT_BEHIND_BASE) {
      return false;
    }
    throw error;
  }
}

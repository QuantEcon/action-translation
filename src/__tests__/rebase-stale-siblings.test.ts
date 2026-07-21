/**
 * Refreshing stale, non-overlapping sibling PRs in rebase mode (#123).
 *
 * `forward` opens one PR per lecture, and each PR's metadata lists only that lecture
 * plus its own per-lecture state file — so two siblings from the same wave never share
 * a path, never overlap, and were skipped forever. They still go stale: every merge
 * moves the base out from under them and their checks go out of date, which is the
 * symptom #115 actually reported.
 *
 * These cover the refresh helper. The important case is the 422: GitHub returns it when
 * a branch is not behind its base, which is a normal mid-wave outcome and must NOT be
 * reported as a failure. That branch is easy to invert silently, and `src/index.ts` has
 * no other coverage.
 */

import { refreshStaleBranch } from '../rebase-siblings.js';

type UpdateBranchFake = jest.Mock<Promise<unknown>, [unknown]>;

function makeOctokit(updateBranch: UpdateBranchFake) {
  return { rest: { pulls: { updateBranch } } };
}

/** Build an error shaped like an Octokit HTTP error. */
function httpError(status: number, message = `HTTP ${status}`): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

describe('refreshStaleBranch', () => {
  it('reports true when the branch was actually updated', async () => {
    const updateBranch: UpdateBranchFake = jest.fn().mockResolvedValue({ status: 202 });

    const result = await refreshStaleBranch(makeOctokit(updateBranch), 'QuantEcon', 'repo.zh-cn', 7);

    expect(result).toBe(true);
    expect(updateBranch).toHaveBeenCalledWith({
      owner: 'QuantEcon',
      repo: 'repo.zh-cn',
      pull_number: 7,
    });
  });

  it('treats 422 as "already current", not as an error', async () => {
    // GitHub returns 422 when the head branch is not behind its base. A PR opened after
    // the last merge is in exactly that state, so this must be a quiet no-op.
    const updateBranch: UpdateBranchFake = jest.fn().mockRejectedValue(httpError(422));

    await expect(
      refreshStaleBranch(makeOctokit(updateBranch), 'QuantEcon', 'repo.zh-cn', 7)
    ).resolves.toBe(false);
  });

  it('rethrows any other HTTP error so the caller counts it as a failure', async () => {
    // A revoked token or a protected branch must surface, not be swallowed as "up to date".
    for (const status of [403, 404, 409, 500]) {
      const updateBranch: UpdateBranchFake = jest.fn().mockRejectedValue(httpError(status));

      await expect(
        refreshStaleBranch(makeOctokit(updateBranch), 'QuantEcon', 'repo.zh-cn', 7)
      ).rejects.toThrow(`HTTP ${status}`);
    }
  });

  it('rethrows errors that carry no status at all', async () => {
    // e.g. a network failure — absence of a status must not read as 422.
    const updateBranch: UpdateBranchFake = jest.fn().mockRejectedValue(new Error('socket hang up'));

    await expect(
      refreshStaleBranch(makeOctokit(updateBranch), 'QuantEcon', 'repo.zh-cn', 7)
    ).rejects.toThrow('socket hang up');
  });

  it('never re-translates — it only calls updateBranch', async () => {
    // The whole point is that a non-overlapping PR has no conflict to resolve, so its
    // translated content must not be regenerated. Guard against someone later routing
    // this through the sync pipeline for symmetry with rebaseSinglePR.
    const updateBranch: UpdateBranchFake = jest.fn().mockResolvedValue({ status: 202 });
    const octokit = makeOctokit(updateBranch);

    await refreshStaleBranch(octokit, 'QuantEcon', 'repo.zh-cn', 7);

    expect(updateBranch).toHaveBeenCalledTimes(1);
    expect(Object.keys(octokit.rest)).toEqual(['pulls']);
  });
});

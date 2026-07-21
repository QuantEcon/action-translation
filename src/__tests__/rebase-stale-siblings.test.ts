/**
 * Refreshing stale, non-overlapping sibling PRs in rebase mode (#123).
 *
 * `forward` opens one PR per lecture, and each PR's metadata lists only that lecture
 * plus its own per-lecture state file — so two siblings from the same wave never share
 * a path, never overlap, and were skipped forever. They still go stale: every merge
 * moves the base out from under them and their checks go out of date, which is the
 * symptom #115 actually reported.
 *
 * These cover the refresh helper. The important cases are the 422s: GitHub uses that
 * status for BOTH "branch not behind base" (benign, routine mid-wave) and "merge
 * conflict between base and head" (a real problem — reachable here because overlap is
 * computed from PR metadata, and branches can carry hand-pushed commits touching files
 * the metadata does not list). Only message-identified benign 422s may be swallowed;
 * a conflict reported as "already up to date" would be a silent failure.
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

    const result = await refreshStaleBranch(
      makeOctokit(updateBranch),
      'QuantEcon',
      'repo.zh-cn',
      7
    );

    expect(result).toBe(true);
    expect(updateBranch).toHaveBeenCalledWith({
      owner: 'QuantEcon',
      repo: 'repo.zh-cn',
      pull_number: 7,
    });
  });

  it('treats a benign 422 ("not behind base") as "already current", not as an error', async () => {
    // A PR opened after the last merge is already current, so this must be a quiet no-op.
    // The known benign wordings all resolve false; matching is case-insensitive.
    for (const message of [
      'There are no new commits on the base branch.',
      'Head branch is not behind the base branch',
      'Branch is already up to date',
    ]) {
      const updateBranch: UpdateBranchFake = jest.fn().mockRejectedValue(httpError(422, message));

      await expect(
        refreshStaleBranch(makeOctokit(updateBranch), 'QuantEcon', 'repo.zh-cn', 7)
      ).resolves.toBe(false);
    }
  });

  it('rethrows a 422 merge conflict — the status alone must never read as benign', async () => {
    // GitHub also uses 422 for a merge conflict between base and head, and for an
    // expected-head-SHA mismatch. Reporting either as "already up to date" would be a
    // silent failure — the exact class this feature exists to eliminate.
    for (const message of [
      'merge conflict between base and head',
      'expected head sha didn’t match current head ref.',
    ]) {
      const updateBranch: UpdateBranchFake = jest.fn().mockRejectedValue(httpError(422, message));

      await expect(
        refreshStaleBranch(makeOctokit(updateBranch), 'QuantEcon', 'repo.zh-cn', 7)
      ).rejects.toThrow(message);
    }
  });

  it('rethrows a 422 with an unrecognised message rather than guessing it is benign', async () => {
    // If GitHub changes its wording, the failure mode must be a loud error we then
    // whitelist deliberately — not a silent skip.
    const updateBranch: UpdateBranchFake = jest
      .fn()
      .mockRejectedValue(httpError(422, 'Validation Failed'));

    await expect(
      refreshStaleBranch(makeOctokit(updateBranch), 'QuantEcon', 'repo.zh-cn', 7)
    ).rejects.toThrow('Validation Failed');
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

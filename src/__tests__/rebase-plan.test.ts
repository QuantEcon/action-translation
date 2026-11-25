/**
 * Tests for planRebaseRead (#389, #351): what rebase mode does with a lecture
 * a sibling translation PR carries, from where the edition has it.
 */

import { planRebaseRead, RebaseReadError } from '../rebase-plan.js';

describe('planRebaseRead', () => {
  it('rebuilds a lecture main has that the baseline had too, or when the PR has no baseline', () => {
    expect(planRebaseRead({ onMain: 'found' })).toEqual({ action: 'update' });
    expect(planRebaseRead({ onMain: 'found', atBaseline: 'found' })).toEqual({ action: 'update' });
    // The branch is not read when the baseline has it, and would not matter.
    expect(planRebaseRead({ onMain: 'found', atBaseline: 'found', onBranch: 'error' })).toEqual({
      action: 'update',
    });
  });

  it('stops for a lecture main has, the baseline lacks and the branch has (#467)', () => {
    expect(planRebaseRead({ onMain: 'found', atBaseline: 'missing', onBranch: 'found' })).toEqual({
      action: 'added-on-main-since-opened',
    });
  });

  it('updates a lecture main has and the baseline lacks when the PR never delivered it', () => {
    expect(planRebaseRead({ onMain: 'found', atBaseline: 'missing', onBranch: 'missing' })).toEqual(
      { action: 'update' }
    );
  });

  it('fails when main has the lecture and the read of the baseline or branch fails (#467)', () => {
    expect(planRebaseRead({ onMain: 'found', atBaseline: 'error' })).toEqual({
      action: 'error',
      reason: 'baseline-read',
    });
    expect(planRebaseRead({ onMain: 'found', atBaseline: 'error', onBranch: 'error' })).toEqual({
      action: 'error',
      reason: 'baseline-read',
    });
    expect(planRebaseRead({ onMain: 'found', atBaseline: 'missing', onBranch: 'error' })).toEqual({
      action: 'error',
      reason: 'branch-read',
    });
    expect(planRebaseRead({ onMain: 'found', atBaseline: 'missing' })).toEqual({
      action: 'error',
      reason: 'branch-read',
    });
  });

  it('fails when the read of main fails, rather than take it as a new lecture', () => {
    expect(planRebaseRead({ onMain: 'error' })).toEqual({ action: 'error', reason: 'main-read' });
  });

  it('fails when main lacks the lecture and the PR records no baseline (#389)', () => {
    expect(planRebaseRead({ onMain: 'missing' })).toEqual({
      action: 'error',
      reason: 'no-baseline',
    });
  });

  it('fails when the read of the baseline fails', () => {
    expect(planRebaseRead({ onMain: 'missing', atBaseline: 'error' })).toEqual({
      action: 'error',
      reason: 'baseline-read',
    });
  });

  it('reports a lecture at the baseline, not on main, and on the branch as deleted since the PR opened (#389)', () => {
    expect(planRebaseRead({ onMain: 'missing', atBaseline: 'found', onBranch: 'found' })).toEqual({
      action: 'deleted-since-opened',
    });
  });

  it('drops a lecture deleted since the PR opened once the branch no longer has it either', () => {
    expect(planRebaseRead({ onMain: 'missing', atBaseline: 'found', onBranch: 'missing' })).toEqual(
      { action: 'drop' }
    );
  });

  it('rebuilds a rename as an update of its new path when main already has it there', () => {
    expect(planRebaseRead({ onMain: 'missing', newPathOnMain: 'found' })).toEqual({
      action: 'update-at-new-path',
    });
  });

  it("fails when the read of a rename's new path on main fails", () => {
    expect(planRebaseRead({ onMain: 'missing', newPathOnMain: 'error' })).toEqual({
      action: 'error',
      reason: 'main-read',
    });
  });

  it("goes on to the baseline when main has neither of a rename's paths", () => {
    expect(
      planRebaseRead({
        onMain: 'missing',
        newPathOnMain: 'missing',
        atBaseline: 'missing',
        onBranch: 'found',
      })
    ).toEqual({ action: 'carry' });
  });

  it('carries a lecture the PR adds from its branch, unchanged (#351)', () => {
    expect(planRebaseRead({ onMain: 'missing', atBaseline: 'missing', onBranch: 'found' })).toEqual(
      { action: 'carry' }
    );
  });

  it('translates as new a lecture the PR never delivered, which no reviewed text holds', () => {
    expect(
      planRebaseRead({ onMain: 'missing', atBaseline: 'missing', onBranch: 'missing' })
    ).toEqual({ action: 'translate-new' });
  });

  it('fails when the read of the branch fails, or was not made', () => {
    expect(planRebaseRead({ onMain: 'missing', atBaseline: 'missing', onBranch: 'error' })).toEqual(
      { action: 'error', reason: 'branch-read' }
    );
    expect(planRebaseRead({ onMain: 'missing', atBaseline: 'missing' })).toEqual({
      action: 'error',
      reason: 'branch-read',
    });
    expect(planRebaseRead({ onMain: 'missing', atBaseline: 'found', onBranch: 'error' })).toEqual({
      action: 'error',
      reason: 'branch-read',
    });
  });
});

describe('RebaseReadError', () => {
  it('keeps its message and the lectures deleted since the PR opened', () => {
    const deleted = [{ editionPath: 'lectures/x.md', path: 'lectures/x-new.md' }];
    const error = new RebaseReadError('content fetch failed', deleted);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('content fetch failed');
    expect(error.deletedSinceOpened).toEqual(deleted);
    expect(error.addedOnMainSinceOpened).toEqual([]);
  });

  it('keeps the lectures main got first (#467)', () => {
    const added = [{ editionPath: 'lectures/x.md', path: 'lectures/x.md' }];
    expect(new RebaseReadError('content fetch failed', [], added).addedOnMainSinceOpened).toEqual(
      added
    );
  });
});

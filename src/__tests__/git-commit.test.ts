/**
 * Rebase mode's one-step branch write (#280).
 *
 * Rebase mode used to reset a PR branch to `main`'s own SHA and then commit
 * each file onto it. From the reset until the first commit landed the branch
 * had no commits ahead of its base, and GitHub closed six sync PRs on two
 * editions in that window, each in the same second as its force-push. These
 * cover the replacement: the commit is built on a pinned base without moving
 * any ref, the branch moves once, from its old head straight to that commit,
 * and a PR that did not stay open fails the run instead of passing silently.
 */

import {
  BuildCommitParams,
  GitWriteOctokit,
  RebasedBranchParams,
  RetryPolicy,
  buildCommit,
  isRetryableGitHubError,
  writeRebasedBranch,
} from '../git-commit.js';

const OWNER = 'QuantEcon';
const REPO = 'lecture-python.zh-cn';
const BASE_SHA = 'ba5e000000000000000000000000000000000001';
const BASE_TREE = 'ba5e7ee000000000000000000000000000000001';
const NEW_TREE = '7ee0000000000000000000000000000000000002';
const NEW_COMMIT = 'c0ffee0000000000000000000000000000000003';
const BRANCH = 'translation-sync-2026-10-21T23-51-48-pr-812';

type Method =
  | 'getCommit'
  | 'createTree'
  | 'createCommit'
  | 'updateRef'
  | 'getContent'
  | 'pullsGet'
  | 'pullsUpdate'
  | 'createComment';

interface Call {
  method: Method;
  params: Record<string, unknown>;
}

interface FakeOptions {
  /** Paths the base commit holds. */
  inBase?: string[];
  /** The SHA createTree returns. */
  treeSha?: string;
  /** Errors each method throws on its next calls, in order. */
  failures?: Partial<Record<Method, unknown[]>>;
  /** What pulls.get reports after the move. */
  prState?: string;
}

/** Build an error shaped like an Octokit HTTP error. */
function httpError(
  status: number,
  message = `HTTP ${status}`,
  headers?: Record<string, string>
): Error & { status: number } {
  return Object.assign(new Error(message), {
    status,
    ...(headers ? { response: { headers } } : {}),
  });
}

function fakeGitHub(options: FakeOptions = {}) {
  const calls: Call[] = [];
  const inBase = new Set(options.inBase ?? []);
  const failures: Partial<Record<Method, unknown[]>> = {};
  for (const [method, errors] of Object.entries(options.failures ?? {})) {
    failures[method as Method] = [...(errors ?? [])];
  }

  async function record<T>(method: Method, params: object, result: () => T): Promise<T> {
    calls.push({ method, params: { ...params } });
    const queued = failures[method];
    if (queued && queued.length > 0) throw queued.shift();
    return result();
  }

  const octokit: GitWriteOctokit = {
    rest: {
      git: {
        getCommit: (params) =>
          record('getCommit', params, () => ({ data: { tree: { sha: BASE_TREE } } })),
        createTree: (params) =>
          record('createTree', params, () => ({ data: { sha: options.treeSha ?? NEW_TREE } })),
        createCommit: (params) =>
          record('createCommit', params, () => ({ data: { sha: NEW_COMMIT } })),
        updateRef: (params) => record('updateRef', params, () => ({})),
      },
      repos: {
        getContent: (params) =>
          record('getContent', params, () => {
            if (!inBase.has(params.path)) throw httpError(404, 'Not Found');
            return { data: { type: 'file', path: params.path, sha: 'b10b' } };
          }),
      },
      pulls: {
        get: (params) =>
          record('pullsGet', params, () => ({ data: { state: options.prState ?? 'open' } })),
        update: (params) => record('pullsUpdate', params, () => ({})),
      },
      issues: {
        createComment: (params) => record('createComment', params, () => ({})),
      },
    },
  };

  return {
    octokit,
    calls,
    methods: () => calls.map((call) => call.method),
    paramsOf: (method: Method) =>
      calls.filter((call) => call.method === method).map((call) => call.params),
  };
}

function testPolicy(): RetryPolicy & { sleep: jest.Mock<Promise<void>, [number]> } {
  return {
    attempts: 3,
    delayMs: (attempt) => 1000 * attempt,
    sleep: jest.fn<Promise<void>, [number]>(async () => undefined),
  };
}

function testLogger() {
  return { info: jest.fn<void, [string]>(), warning: jest.fn<void, [string]>() };
}

function commitParams(overrides: Partial<BuildCommitParams> = {}): BuildCommitParams {
  return {
    owner: OWNER,
    repo: REPO,
    baseSha: BASE_SHA,
    files: [{ path: 'lectures/a.md', content: '# A\n' }],
    deletions: [],
    message: 'Rebase translations',
    ...overrides,
  };
}

function branchParams(overrides: Partial<RebasedBranchParams> = {}): RebasedBranchParams {
  return {
    owner: OWNER,
    repo: REPO,
    pullNumber: 294,
    branch: BRANCH,
    baseBranch: 'main',
    baseSha: BASE_SHA,
    files: [
      { path: 'lectures/a.md', content: '# A\n' },
      { path: '.translate/state/a.md.yml', content: 'source-sha: abc\n' },
    ],
    deletions: [],
    declaredFiles: ['lectures/a.md', '.translate/state/a.md.yml'],
    mergedPrNumber: 286,
    ...overrides,
  };
}

describe('isRetryableGitHubError', () => {
  it('retries a 5xx, a 429 and a secondary rate limit', () => {
    for (const status of [500, 502, 503, 504]) {
      expect(isRetryableGitHubError(httpError(status))).toBe(true);
    }
    expect(isRetryableGitHubError(httpError(429))).toBe(true);
    expect(
      isRetryableGitHubError(
        httpError(403, 'You have exceeded a secondary rate limit. Please wait a few minutes')
      )
    ).toBe(true);
  });

  it('does not retry a plain 403, a 404, a 409, a 422, or an error with no status', () => {
    expect(isRetryableGitHubError(httpError(403, 'Resource not accessible by integration'))).toBe(
      false
    );
    for (const status of [401, 404, 409, 422]) {
      expect(isRetryableGitHubError(httpError(status))).toBe(false);
    }
    expect(isRetryableGitHubError(new Error('socket hang up'))).toBe(false);
    expect(isRetryableGitHubError('boom')).toBe(false);
    expect(isRetryableGitHubError(undefined)).toBe(false);
  });
});

describe('buildCommit', () => {
  it('writes and deletes in one tree on the base, with the base as the only parent', async () => {
    const github = fakeGitHub({ inBase: ['lectures/old.md', '.translate/state/old.md.yml'] });

    const built = await buildCommit(
      github.octokit,
      commitParams({
        files: [
          { path: 'lectures/a.md', content: '# A\n' },
          { path: '.translate/state/a.md.yml', content: 'source-sha: abc\n' },
        ],
        deletions: ['lectures/old.md', '.translate/state/old.md.yml'],
      }),
      testLogger(),
      testPolicy()
    );

    expect(built).toEqual({ unchanged: false, sha: NEW_COMMIT, treeSha: NEW_TREE });
    expect(github.paramsOf('createTree')).toEqual([
      {
        owner: OWNER,
        repo: REPO,
        base_tree: BASE_TREE,
        tree: [
          { path: 'lectures/a.md', mode: '100644', type: 'blob', content: '# A\n' },
          {
            path: '.translate/state/a.md.yml',
            mode: '100644',
            type: 'blob',
            content: 'source-sha: abc\n',
          },
          { path: 'lectures/old.md', mode: '100644', type: 'blob', sha: null },
          { path: '.translate/state/old.md.yml', mode: '100644', type: 'blob', sha: null },
        ],
      },
    ]);
    expect(github.paramsOf('createCommit')).toEqual([
      {
        owner: OWNER,
        repo: REPO,
        message: 'Rebase translations',
        tree: NEW_TREE,
        parents: [BASE_SHA],
      },
    ]);
    // Each deletion is looked up at the pinned base, not on a moving branch.
    expect(github.paramsOf('getContent').map((params) => params.ref)).toEqual([BASE_SHA, BASE_SHA]);
    expect(github.methods()).not.toContain('updateRef');
  });

  it('drops a deletion the base does not hold, with an info log', async () => {
    // GitHub's create-tree fails on a `sha: null` entry for a path absent from
    // the base tree, so an absent path must never reach it.
    const github = fakeGitHub({ inBase: ['lectures/old.md'] });
    const logger = testLogger();

    await buildCommit(
      github.octokit,
      commitParams({ deletions: ['lectures/old.md', 'lectures/gone.md'] }),
      logger,
      testPolicy()
    );

    const tree = github.paramsOf('createTree')[0].tree as Array<{ path: string }>;
    expect(tree.map((entry) => entry.path)).toEqual(['lectures/a.md', 'lectures/old.md']);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('lectures/gone.md'));
  });

  it('does not delete a path the same commit writes', async () => {
    const github = fakeGitHub({ inBase: ['lectures/a.md'] });

    await buildCommit(
      github.octokit,
      commitParams({ deletions: ['lectures/a.md'] }),
      testLogger(),
      testPolicy()
    );

    expect(github.methods()).not.toContain('getContent');
    const tree = github.paramsOf('createTree')[0].tree as Array<Record<string, unknown>>;
    expect(tree).toEqual([
      { path: 'lectures/a.md', mode: '100644', type: 'blob', content: '# A\n' },
    ]);
  });

  it("is unchanged, and makes no commit, when the tree comes back as the base's own", async () => {
    const github = fakeGitHub({ treeSha: BASE_TREE });

    const built = await buildCommit(github.octokit, commitParams(), testLogger(), testPolicy());

    expect(built).toEqual({ unchanged: true });
    expect(github.methods()).toEqual(['getCommit', 'createTree']);
  });

  it('is unchanged without building a tree when nothing is left to write or delete', async () => {
    const github = fakeGitHub();

    const built = await buildCommit(
      github.octokit,
      commitParams({ files: [], deletions: ['lectures/gone.md'] }),
      testLogger(),
      testPolicy()
    );

    expect(built).toEqual({ unchanged: true });
    expect(github.methods()).toEqual(['getContent']);
  });

  it('retries a 5xx and a secondary rate limit on each call that moves no ref', async () => {
    const github = fakeGitHub({
      inBase: ['lectures/old.md'],
      failures: {
        getContent: [httpError(500)],
        getCommit: [httpError(502)],
        createTree: [httpError(403, 'You have exceeded a secondary rate limit')],
        createCommit: [httpError(503), httpError(504)],
      },
    });
    const logger = testLogger();
    const policy = testPolicy();

    const built = await buildCommit(
      github.octokit,
      commitParams({ deletions: ['lectures/old.md'] }),
      logger,
      policy
    );

    expect(built).toEqual({ unchanged: false, sha: NEW_COMMIT, treeSha: NEW_TREE });
    expect(github.methods()).toEqual([
      'getContent',
      'getContent',
      'getCommit',
      'getCommit',
      'createTree',
      'createTree',
      'createCommit',
      'createCommit',
      'createCommit',
    ]);
    expect(policy.sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 1000, 1000, 1000, 2000]);
    expect(logger.warning).toHaveBeenCalledTimes(5);
  });

  it('waits as long as retry-after asks, up to 60 s', async () => {
    const github = fakeGitHub({
      failures: {
        createTree: [httpError(429, 'Too Many Requests', { 'retry-after': '5' })],
        createCommit: [httpError(429, 'Too Many Requests', { 'retry-after': '600' })],
      },
    });
    const policy = testPolicy();

    await buildCommit(github.octokit, commitParams(), testLogger(), policy);

    expect(policy.sleep.mock.calls.map(([ms]) => ms)).toEqual([5000, 60000]);
  });

  it('does not retry a 422, a 409 or a plain 403', async () => {
    for (const error of [
      httpError(422, 'GitRPC::BadObjectState'),
      httpError(409, 'Git Repository is empty.'),
      httpError(403, 'Resource not accessible by integration'),
    ]) {
      const github = fakeGitHub({ failures: { createTree: [error] } });
      const policy = testPolicy();

      await expect(buildCommit(github.octokit, commitParams(), testLogger(), policy)).rejects.toBe(
        error
      );
      expect(github.paramsOf('createTree')).toHaveLength(1);
      expect(policy.sleep).not.toHaveBeenCalled();
    }
  });

  it("gives up after the policy's attempts", async () => {
    const error = httpError(503);
    const github = fakeGitHub({ failures: { createCommit: [error, error, error] } });
    const policy = testPolicy();

    await expect(buildCommit(github.octokit, commitParams(), testLogger(), policy)).rejects.toBe(
      error
    );
    expect(github.paramsOf('createCommit')).toHaveLength(3);
    expect(policy.sleep).toHaveBeenCalledTimes(2);
  });

  it('fails on a deletion lookup that is not a 404, rather than reading it as absent', async () => {
    const error = httpError(401, 'Bad credentials');
    const github = fakeGitHub({ inBase: ['lectures/old.md'], failures: { getContent: [error] } });

    await expect(
      buildCommit(
        github.octokit,
        commitParams({ deletions: ['lectures/old.md'] }),
        testLogger(),
        testPolicy()
      )
    ).rejects.toBe(error);
    expect(github.methods()).toEqual(['getContent']);
  });
});

describe('writeRebasedBranch', () => {
  it('moves the branch once, from its old head straight to a commit on the pinned base', async () => {
    const github = fakeGitHub();

    const written = await writeRebasedBranch(
      github.octokit,
      branchParams(),
      testLogger(),
      testPolicy()
    );

    expect(written).toEqual({ outcome: 'moved', commitSha: NEW_COMMIT });
    expect(github.methods()).toEqual([
      'getCommit',
      'createTree',
      'createCommit',
      'updateRef',
      'pullsGet',
    ]);
    expect(github.paramsOf('updateRef')).toEqual([
      { owner: OWNER, repo: REPO, ref: `heads/${BRANCH}`, sha: NEW_COMMIT, force: true },
    ]);
    // The state GitHub closes a PR on: the branch equal to its base.
    for (const params of github.paramsOf('updateRef')) {
      expect(params.sha).not.toBe(BASE_SHA);
    }
    expect(github.paramsOf('createCommit')[0].parents).toEqual([BASE_SHA]);
    expect(github.paramsOf('pullsGet')).toEqual([{ owner: OWNER, repo: REPO, pull_number: 294 }]);
  });

  it('writes one commit that names the merge, the base, and every path', async () => {
    const github = fakeGitHub({ inBase: ['lectures/old.md'] });

    await writeRebasedBranch(
      github.octokit,
      branchParams({ deletions: ['lectures/old.md'] }),
      testLogger(),
      testPolicy()
    );

    expect(github.paramsOf('createCommit')).toHaveLength(1);
    expect(github.paramsOf('createCommit')[0].message).toBe(
      [
        'Rebase translations onto main (ba5e000) after #286',
        '',
        'lectures/a.md',
        '.translate/state/a.md.yml',
        'deleted: lectures/old.md',
      ].join('\n')
    );
  });

  it("closes the PR with a comment, branch untouched, when the rebuilt tree is main's own", async () => {
    // #256 defect 4: a PR whose content is already on main must not be pushed
    // to a branch with no commits ahead of it.
    const github = fakeGitHub({ treeSha: BASE_TREE });

    const written = await writeRebasedBranch(
      github.octokit,
      branchParams(),
      testLogger(),
      testPolicy()
    );

    expect(written).toEqual({ outcome: 'closed' });
    expect(github.methods()).toEqual(['getCommit', 'createTree', 'createComment', 'pullsUpdate']);
    const [comment] = github.paramsOf('createComment');
    expect(comment.issue_number).toBe(294);
    const body = String(comment.body);
    expect(body).toContain('Closed: nothing left to carry.');
    expect(body).toContain('After #286 was merged');
    expect(body).toContain('rebuilt on `main` (`ba5e000`)');
    expect(body).toContain('- `lectures/a.md`\n- `.translate/state/a.md.yml`');
    expect(body).toContain('The branch was not changed');
    expect(github.paramsOf('pullsUpdate')).toEqual([
      { owner: OWNER, repo: REPO, pull_number: 294, state: 'closed' },
    ]);
  });

  it('fails, naming the PR and the branch, when the PR is not open after the move', async () => {
    const github = fakeGitHub({ prState: 'closed' });

    const write = writeRebasedBranch(github.octokit, branchParams(), testLogger(), testPolicy());

    await expect(write).rejects.toThrow(`PR #294 is closed after ${BRANCH} moved`);
    // No attempt to reopen: GitHub refuses once the branch has moved again.
    expect(github.methods()).not.toContain('pullsUpdate');
    expect(github.paramsOf('updateRef')).toHaveLength(1);
  });

  it('leaves the branch where it was when the commit cannot be built', async () => {
    for (const failures of [
      { createCommit: [httpError(422, 'Invalid tree info')] },
      { createTree: [httpError(503), httpError(503), httpError(503)] },
      { getCommit: [httpError(404, 'Not Found')] },
    ]) {
      const github = fakeGitHub({ failures });

      await expect(
        writeRebasedBranch(github.octokit, branchParams(), testLogger(), testPolicy())
      ).rejects.toThrow(
        /could not build the rebased commit on main \(ba5e000\); branch left untouched/
      );
      expect(github.methods()).not.toContain('updateRef');
      expect(github.methods()).not.toContain('pullsUpdate');
    }
  });

  it('does not retry the ref move', async () => {
    const github = fakeGitHub({ failures: { updateRef: [httpError(502)] } });
    const policy = testPolicy();

    await expect(
      writeRebasedBranch(github.octokit, branchParams(), testLogger(), policy)
    ).rejects.toThrow(`could not move ${BRANCH} to the rebased commit c0ffee0`);
    expect(github.paramsOf('updateRef')).toHaveLength(1);
    expect(github.methods()).not.toContain('pullsGet');
    expect(policy.sleep).not.toHaveBeenCalled();
  });

  it('retries reading the PR back', async () => {
    const github = fakeGitHub({ failures: { pullsGet: [httpError(502)] } });

    const written = await writeRebasedBranch(
      github.octokit,
      branchParams(),
      testLogger(),
      testPolicy()
    );

    expect(written).toEqual({ outcome: 'moved', commitSha: NEW_COMMIT });
    expect(github.paramsOf('pullsGet')).toHaveLength(2);
  });

  it('fails, saying the branch moved, when the PR cannot be read back', async () => {
    const error = httpError(502);
    const github = fakeGitHub({ failures: { pullsGet: [error, error, error] } });

    await expect(
      writeRebasedBranch(github.octokit, branchParams(), testLogger(), testPolicy())
    ).rejects.toThrow(
      `${BRANCH} moved to the rebased commit c0ffee0, but PR #294 could not be read back`
    );
  });
});

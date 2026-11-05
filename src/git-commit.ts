/**
 * Rebase mode's branch write, in one step (#280).
 *
 * Rebase mode used to reset a PR branch to `main`'s own SHA and then commit
 * each file onto it through the contents API. From the reset until the first
 * of those commits landed, the branch had no commits ahead of its base, which
 * is the state GitHub closes a pull request on, for good: six sync PRs on two
 * editions were closed that way, and one of them kept a lecture out of its
 * edition for twelve days. A write that failed part-way left the branch at
 * `main` plus some of its files, still open and looking complete.
 *
 * Here the rebased content becomes one commit, built with the Git Data API on
 * a base SHA the caller pinned when the rebase began, and the branch moves to
 * it with a single ref update. Building the commit moves no ref, so those calls
 * are retried on 5xx and secondary rate limits; the ref update is not. The
 * branch is never equal to its base, and anything that fails before the move
 * leaves the branch where it was.
 *
 * Lives outside src/index.ts so that it can be unit tested (#169).
 */

/** A file the new commit writes, with its full content. */
export interface CommitFile {
  path: string;
  content: string;
}

/** A tree entry: a file with its content, or a path to delete (`sha: null`). */
export type TreeEntry =
  | { path: string; mode: '100644'; type: 'blob'; content: string }
  | { path: string; mode: '100644'; type: 'blob'; sha: null };

/** The subset of Octokit this module calls. */
export interface GitWriteOctokit {
  rest: {
    git: {
      getCommit(params: {
        owner: string;
        repo: string;
        commit_sha: string;
      }): Promise<{ data: { tree: { sha: string } } }>;
      createTree(params: {
        owner: string;
        repo: string;
        base_tree: string;
        tree: TreeEntry[];
      }): Promise<{ data: { sha: string } }>;
      createCommit(params: {
        owner: string;
        repo: string;
        message: string;
        tree: string;
        parents: string[];
      }): Promise<{ data: { sha: string } }>;
      updateRef(params: {
        owner: string;
        repo: string;
        ref: string;
        sha: string;
        force: boolean;
      }): Promise<unknown>;
    };
    repos: {
      getContent(params: {
        owner: string;
        repo: string;
        path: string;
        ref: string;
      }): Promise<unknown>;
    };
    pulls: {
      get(params: {
        owner: string;
        repo: string;
        pull_number: number;
      }): Promise<{ data: { state: string } }>;
      update(params: {
        owner: string;
        repo: string;
        pull_number: number;
        state: 'closed';
      }): Promise<unknown>;
    };
    issues: {
      createComment(params: {
        owner: string;
        repo: string;
        issue_number: number;
        body: string;
      }): Promise<unknown>;
    };
  };
}

export interface GitWriteLogger {
  info(message: string): void;
  warning(message: string): void;
}

// ─── Retrying the calls that move no ref ────────────────────────────────────

export interface RetryPolicy {
  /** Attempts in all, the first included. */
  attempts: number;
  /** The wait after failed attempt `n` (from 1), when the error carries no `retry-after`. */
  delayMs(attempt: number): number;
  sleep(ms: number): Promise<void>;
}

export const DEFAULT_RETRY: RetryPolicy = {
  attempts: 3,
  delayMs: (attempt) => 2000 * 4 ** (attempt - 1), // 2 s, then 8 s
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** The longest `retry-after` honoured, in seconds. */
const RETRY_AFTER_CAP_S = 60;

function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null | undefined)?.status;
  return typeof status === 'number' ? status : undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Whether a GitHub API error is worth another attempt: a 5xx, a 429, or a 403
 * that is a secondary rate limit. A plain 403, a 404, a 409 or a 422 is not.
 */
export function isRetryableGitHubError(error: unknown): boolean {
  const status = statusOf(error);
  if (status === undefined) return false;
  if (status >= 500 || status === 429) return true;
  return status === 403 && /secondary rate limit/i.test(messageOf(error));
}

function retryAfterMs(error: unknown): number | undefined {
  const headers = (error as { response?: { headers?: Record<string, unknown> } } | null | undefined)
    ?.response?.headers;
  const seconds = Number(headers?.['retry-after']);
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(seconds, RETRY_AFTER_CAP_S) * 1000
    : undefined;
}

async function withRetry<T>(
  what: string,
  call: () => Promise<T>,
  logger: GitWriteLogger,
  policy: RetryPolicy
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      if (attempt >= policy.attempts || !isRetryableGitHubError(error)) throw error;
      const wait = retryAfterMs(error) ?? policy.delayMs(attempt);
      logger.warning(
        `${what} failed (${statusOf(error)}: ${messageOf(error)}); attempt ${attempt + 1} of ` +
          `${policy.attempts} in ${Math.round(wait / 1000)} s`
      );
      await policy.sleep(wait);
    }
  }
}

const short = (sha: string): string => sha.slice(0, 7);

// ─── The commit ─────────────────────────────────────────────────────────────

export interface BuildCommitParams {
  owner: string;
  repo: string;
  /** The commit the new one is built on, and its only parent. */
  baseSha: string;
  files: readonly CommitFile[];
  /** Paths to remove. One the base does not hold is dropped, with an info log. */
  deletions: readonly string[];
  message: string;
}

export type BuiltCommit = { unchanged: true } | { unchanged: false; sha: string; treeSha: string };

async function existsAt(
  octokit: GitWriteOctokit,
  params: { owner: string; repo: string; path: string; ref: string },
  logger: GitWriteLogger,
  policy: RetryPolicy
): Promise<boolean> {
  try {
    await withRetry(
      `reading ${params.path} at ${short(params.ref)}`,
      () => octokit.rest.repos.getContent(params),
      logger,
      policy
    );
    return true;
  } catch (error) {
    if (statusOf(error) === 404) return false;
    throw error;
  }
}

/**
 * Build one commit on `baseSha` that writes `files` and deletes `deletions`,
 * moving no ref. Unchanged when the resulting tree is the base's own, in which
 * case no commit is made.
 *
 * GitHub's create-tree endpoint fails on a `sha: null` entry for a path the
 * base tree does not hold, so each deletion is first looked up at `baseSha`.
 */
export async function buildCommit(
  octokit: GitWriteOctokit,
  params: BuildCommitParams,
  logger: GitWriteLogger,
  policy: RetryPolicy = DEFAULT_RETRY
): Promise<BuiltCommit> {
  const { owner, repo, baseSha } = params;
  const written = new Set(params.files.map((file) => file.path));

  const deletions: string[] = [];
  for (const path of new Set(params.deletions)) {
    if (written.has(path)) continue; // written in full by this commit
    if (await existsAt(octokit, { owner, repo, path, ref: baseSha }, logger, policy)) {
      deletions.push(path);
    } else {
      logger.info(`${path}: not in ${short(baseSha)}, so there is nothing to delete`);
    }
  }

  const tree: TreeEntry[] = [
    ...params.files.map(
      (file): TreeEntry => ({
        path: file.path,
        mode: '100644',
        type: 'blob',
        content: file.content,
      })
    ),
    ...deletions.map((path): TreeEntry => ({ path, mode: '100644', type: 'blob', sha: null })),
  ];
  if (tree.length === 0) return { unchanged: true };

  const base = await withRetry(
    `reading commit ${short(baseSha)}`,
    () => octokit.rest.git.getCommit({ owner, repo, commit_sha: baseSha }),
    logger,
    policy
  );
  const created = await withRetry(
    'creating the tree',
    () => octokit.rest.git.createTree({ owner, repo, base_tree: base.data.tree.sha, tree }),
    logger,
    policy
  );
  if (created.data.sha === base.data.tree.sha) return { unchanged: true };

  const commit = await withRetry(
    'creating the commit',
    () =>
      octokit.rest.git.createCommit({
        owner,
        repo,
        message: params.message,
        tree: created.data.sha,
        parents: [baseSha],
      }),
    logger,
    policy
  );
  return { unchanged: false, sha: commit.data.sha, treeSha: created.data.sha };
}

// ─── The rebase write ───────────────────────────────────────────────────────

export interface RebasedBranchParams {
  owner: string;
  repo: string;
  pullNumber: number;
  /** The PR's head branch, without `refs/heads/`. */
  branch: string;
  /** The default branch's name, for messages. */
  baseBranch: string;
  /** The default branch's SHA, read once when this PR's rebase began. */
  baseSha: string;
  files: readonly CommitFile[];
  deletions: readonly string[];
  /** The files the PR's metadata declares, named when nothing is left to carry. */
  declaredFiles: readonly string[];
  /** The merge that started the rebase. */
  mergedPrNumber: number;
}

export type RebasedBranch = { outcome: 'moved'; commitSha: string } | { outcome: 'closed' };

function rebaseCommitMessage(params: RebasedBranchParams): string {
  const lines = [
    `Rebase translations onto ${params.baseBranch} (${short(params.baseSha)}) after #${params.mergedPrNumber}`,
    '',
    ...params.files.map((file) => file.path),
    ...params.deletions.map((path) => `deleted: ${path}`),
  ];
  return lines.join('\n');
}

function nothingLeftComment(params: RebasedBranchParams): string {
  const declared = params.declaredFiles.map((path) => `- \`${path}\``).join('\n');
  return (
    `🗂️ **Closed: nothing left to carry.** After #${params.mergedPrNumber} was merged, this ` +
    `PR's translation was rebuilt on \`${params.baseBranch}\` (\`${short(params.baseSha)}\`), ` +
    `and the rebuilt files are identical to what \`${params.baseBranch}\` already holds.\n\n` +
    `The files this PR declares:\n\n${declared}\n\n` +
    `The branch was not changed, so it still holds this PR's previous commits. The rebase ` +
    `automation closed the PR rather than push a branch with no commits ahead of ` +
    `\`${params.baseBranch}\` (#280).`
  );
}

/**
 * Write a rebased PR branch: one commit on the pinned `baseSha`, then one
 * forced ref move from the branch's old head straight to it, then the PR read
 * back. The branch never points at `baseSha` itself.
 *
 * When the rebased tree is the base's own, nothing is pushed: the PR is closed
 * with a comment that names the files it declared (#256, defect 4).
 *
 * Throws, so the caller counts the PR as failed, when the commit cannot be
 * built (the branch left untouched), when the ref cannot be moved, or when the
 * PR is not open after the move. It never reopens a PR: GitHub refuses that
 * once the branch has moved again, and a recreated PR is the recovery.
 */
export async function writeRebasedBranch(
  octokit: GitWriteOctokit,
  params: RebasedBranchParams,
  logger: GitWriteLogger,
  policy: RetryPolicy = DEFAULT_RETRY
): Promise<RebasedBranch> {
  const { owner, repo, pullNumber, branch, baseBranch, baseSha } = params;

  let built: BuiltCommit;
  try {
    built = await buildCommit(
      octokit,
      {
        owner,
        repo,
        baseSha,
        files: params.files,
        deletions: params.deletions,
        message: rebaseCommitMessage(params),
      },
      logger,
      policy
    );
  } catch (error) {
    throw new Error(
      `could not build the rebased commit on ${baseBranch} (${short(baseSha)}); ` +
        `branch left untouched: ${messageOf(error)}`
    );
  }

  if (built.unchanged) {
    // The comment goes first: a PR closed without one is the silence #280 is about.
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body: nothingLeftComment(params),
    });
    await octokit.rest.pulls.update({ owner, repo, pull_number: pullNumber, state: 'closed' });
    logger.info(
      `PR #${pullNumber}: nothing left to carry onto ${baseBranch}; closed, branch unchanged`
    );
    return { outcome: 'closed' };
  }

  try {
    await octokit.rest.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: built.sha,
      force: true,
    });
  } catch (error) {
    throw new Error(
      `could not move ${branch} to the rebased commit ${short(built.sha)}: ${messageOf(error)}`
    );
  }

  let state: string;
  try {
    const { data } = await withRetry(
      `reading PR #${pullNumber} back`,
      () => octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber }),
      logger,
      policy
    );
    state = data.state;
  } catch (error) {
    throw new Error(
      `${branch} moved to the rebased commit ${short(built.sha)}, but PR #${pullNumber} ` +
        `could not be read back: ${messageOf(error)}`
    );
  }
  if (state !== 'open') {
    throw new Error(
      `PR #${pullNumber} is ${state} after ${branch} moved to the rebased commit ` +
        `${short(built.sha)}. The branch holds the rebased translation; recreate the PR from ` +
        `it (#280)`
    );
  }
  return { outcome: 'moved', commitSha: built.sha };
}

/**
 * GitHub Issue creator for the `review` command.
 *
 * Calls `gh issue create` for each accepted suggestion after interactive review.
 * Targets the SOURCE repo so improvements flow back to the English source.
 *
 * Architecture note:
 * - `buildGhArgs()` is a pure function that builds the gh CLI argument list.
 *   This is the testable unit — tests verify argument construction without
 *   actually calling gh.
 * - `runGh()` is the thin I/O wrapper around child_process.spawnSync.
 * - `createIssue()` / `createIssuesForAccepted()` compose the two above.
 */

import { spawnSync, SpawnSyncOptions } from 'child_process';
import { SuggestionWithContext } from './commands/review.js';
import { formatIssueTitle, formatIssueBody, getIssueLabels } from './issue-generator.js';

// ============================================================================
// TYPES
// ============================================================================

export interface IssueResult {
  /** The suggestion that was acted on */
  suggestion: SuggestionWithContext;
  /** Created Issue URL, if successful */
  url?: string;
  /** Error message, if creation failed */
  error?: string;
  /** Whether the creation succeeded */
  success: boolean;
}

/**
 * Injectable gh runner for testability.
 * Defaults to the real spawnSync-based runner.
 */
export type GhRunner = (
  args: string[],
  stdin: string,
) => { stdout: string; stderr: string; status: number | null };

// ============================================================================
// ARG BUILDER (pure, testable)
// ============================================================================

/**
 * Build the `gh issue create` argument list for a suggestion.
 *
 * Uses `--body-file -` so multi-line markdown body is passed via stdin,
 * avoiding shell-quoting issues with backticks, dollar signs, etc.
 *
 * @param suggestion  The suggestion to create an Issue for
 * @param repo        Target SOURCE repo in `owner/repo` format
 */
export function buildGhArgs(suggestion: SuggestionWithContext, repo: string): string[] {
  const title  = formatIssueTitle(suggestion);
  const labels = getIssueLabels(suggestion);

  return [
    'issue', 'create',
    '--repo', repo,
    '--title', title,
    '--body-file', '-',           // Read body from stdin
    ...labels.flatMap(l => ['--label', l]),
  ];
}

// ============================================================================
// GH RUNNER (I/O)
// ============================================================================

/**
 * Real gh runner using spawnSync.
 */
export function realGhRunner(args: string[], stdin: string): ReturnType<GhRunner> {
  const opts: SpawnSyncOptions = {
    input: stdin,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  };

  const result = spawnSync('gh', args, opts) as {
    stdout: string;
    stderr: string;
    status: number | null;
    error?: Error;
  };

  if (result.error) {
    return { stdout: '', stderr: result.error.message, status: 1 };
  }

  return {
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    status: result.status ?? 1,
  };
}

// ============================================================================
// CREATE SINGLE ISSUE
// ============================================================================

/**
 * Create a single GitHub Issue for an accepted suggestion.
 *
 * @param suggestion  The suggestion to create an Issue for
 * @param repo        TARGET SOURCE repo in `owner/repo` format
 * @param runner      Injectable gh runner (real by default; mock in tests)
 */
export function createIssue(
  suggestion: SuggestionWithContext,
  repo: string,
  runner: GhRunner = realGhRunner,
): IssueResult {
  const args  = buildGhArgs(suggestion, repo);
  const body  = formatIssueBody(suggestion);
  const result = runner(args, body);

  if (result.status === 0 && result.stdout) {
    // gh prints the Issue URL on stdout on success
    const url = result.stdout.trim();
    return { suggestion, url, success: true };
  }

  return {
    suggestion,
    error: result.stderr || `gh exited with status ${result.status}`,
    success: false,
  };
}

// ============================================================================
// BATCH ISSUE CREATION
// ============================================================================

/**
 * Create GitHub Issues for all accepted suggestions and print results.
 *
 * @param accepted  Suggestions accepted during interactive review
 * @param repo      SOURCE repo in `owner/repo` format
 * @param runner    Injectable gh runner (real by default; mock in tests)
 */
export async function createIssuesForAccepted(
  accepted: SuggestionWithContext[],
  repo: string,
  runner: GhRunner = realGhRunner,
): Promise<IssueResult[]> {
  if (accepted.length === 0) return [];

  console.log(`\n  Creating ${accepted.length} GitHub Issue(s) in ${repo}…\n`);

  const results: IssueResult[] = [];

  for (const suggestion of accepted) {
    const result = createIssue(suggestion, repo, runner);

    if (result.success) {
      console.log(`  ✅ ${result.url}`);
    } else {
      console.error(`  ❌ Failed to create Issue for [${suggestion.file}]: ${result.error}`);
    }

    results.push(result);
  }

  const created = results.filter(r => r.success).length;
  const failed  = results.filter(r => !r.success).length;

  console.log('');
  if (failed === 0) {
    console.log(`  Created ${created} Issue(s). ✅`);
  } else {
    console.log(`  Created ${created} Issue(s), ${failed} failed.`);
  }

  return results;
}

/**
 * Forward PR Creator
 *
 * Creates one PR per file in the TARGET repository after forward resync.
 * Two-phase process:
 * 1. gitPrepareAndPush — creates branch, writes file, commits, pushes
 * 2. createForwardPR — creates the PR via `gh` CLI
 *
 * Both phases use injectable runners (GitRunner / GhRunner) for testability.
 *
 * Branch: `resync/{filename}` (e.g., `resync/cobweb`)
 * Title: `🔄 [resync] cobweb.md`
 * Labels: `action-translation-sync`, `resync`
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync, SpawnSyncOptions } from 'child_process';
import { ResyncSectionResult } from './types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ForwardPRResult {
  file: string;
  url?: string;
  error?: string;
  success: boolean;
}

/**
 * Injectable gh runner for testability.
 * Same signature as issue-creator.ts.
 */
export type GhRunner = (
  args: string[],
  stdin: string,
) => { stdout: string; stderr: string; status: number | null };

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
// GIT RUNNER (I/O)
// ============================================================================

/**
 * Injectable git runner for testability.
 * Runs `git` commands in a specified cwd.
 */
export type GitRunner = (
  args: string[],
  cwd: string,
) => { stdout: string; stderr: string; status: number | null };

/**
 * Real git runner using spawnSync.
 */
export function realGitRunner(args: string[], cwd: string): ReturnType<GitRunner> {
  const opts: SpawnSyncOptions = {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  };

  const result = spawnSync('git', args, opts) as {
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
// GIT PREPARE & PUSH
// ============================================================================

export interface GitPrepareResult {
  success: boolean;
  branchName: string;
  originalBranch: string;
  error?: string;
}

/**
 * Prepare a git branch with the resynced file and push to remote.
 *
 * Steps:
 * 1. Record current branch
 * 2. Create and switch to `resync/{filename}` branch
 * 3. Write the resynced file content
 * 4. Stage, commit, push
 * 5. Switch back to the original branch
 *
 * On failure, attempts to switch back to the original branch.
 *
 * @param file           Filename relative to docsFolder (e.g., "pv.md")
 * @param content        Updated file content
 * @param targetRepoPath Absolute path to TARGET repository root
 * @param docsFolder     Docs folder within repo (e.g., "lectures")
 * @param runner         Injectable git runner (default: realGitRunner)
 */
export function gitPrepareAndPush(
  file: string,
  content: string,
  targetRepoPath: string,
  docsFolder: string,
  runner: GitRunner = realGitRunner,
): GitPrepareResult {
  const branchName = buildBranchName(file);

  // 1. Record current branch
  const branchResult = runner(['rev-parse', '--abbrev-ref', 'HEAD'], targetRepoPath);
  if (branchResult.status !== 0) {
    return { success: false, branchName, originalBranch: '', error: `Failed to detect current branch: ${branchResult.stderr}` };
  }
  const originalBranch = branchResult.stdout.trim();

  // Helper: switch back on failure
  const switchBack = () => runner(['checkout', originalBranch], targetRepoPath);

  // 2. Create and switch to the resync branch (from current HEAD)
  //    Delete existing branch if present (from a prior run)
  const existsResult = runner(['rev-parse', '--verify', branchName], targetRepoPath);
  if (existsResult.status === 0) {
    // Branch exists — delete it first
    runner(['branch', '-D', branchName], targetRepoPath);
  }

  const checkoutResult = runner(['checkout', '-b', branchName], targetRepoPath);
  if (checkoutResult.status !== 0) {
    switchBack();
    return { success: false, branchName, originalBranch, error: `Failed to create branch: ${checkoutResult.stderr}` };
  }

  // 3. Write file
  const filePath = path.join(targetRepoPath, docsFolder, file);
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
  } catch (err) {
    switchBack();
    return { success: false, branchName, originalBranch, error: `Failed to write file: ${err}` };
  }

  // 4. Stage and commit
  const addResult = runner(['add', path.join(docsFolder, file)], targetRepoPath);
  if (addResult.status !== 0) {
    switchBack();
    return { success: false, branchName, originalBranch, error: `Failed to stage file: ${addResult.stderr}` };
  }

  const commitResult = runner(['commit', '-m', `🔄 resync ${file}`], targetRepoPath);
  if (commitResult.status !== 0) {
    switchBack();
    return { success: false, branchName, originalBranch, error: `Failed to commit: ${commitResult.stderr}` };
  }

  // 5. Push (force to handle re-runs)
  const pushResult = runner(['push', '-u', 'origin', branchName, '--force'], targetRepoPath);
  if (pushResult.status !== 0) {
    switchBack();
    return { success: false, branchName, originalBranch, error: `Failed to push: ${pushResult.stderr}` };
  }

  // 6. Switch back to original branch
  switchBack();

  return { success: true, branchName, originalBranch };
}

// ============================================================================
// PR BODY
// ============================================================================

/**
 * Extract GitHub owner/repo from a git remote URL.
 * Handles both HTTPS and SSH formats.
 * Returns undefined if the URL can't be parsed.
 */
export function parseGitHubRepo(remoteUrl: string): string | undefined {
  // HTTPS: https://github.com/owner/repo.git or https://github.com/owner/repo
  const httpsMatch = remoteUrl.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\s*$/);
  if (httpsMatch) return httpsMatch[1];

  // SSH: git@github.com:owner/repo.git
  const sshMatch = remoteUrl.match(/github\.com:([^/]+\/[^/]+?)(?:\.git)?\s*$/);
  if (sshMatch) return sshMatch[1];

  return undefined;
}

/**
 * Detect the GitHub owner/repo for a local repository.
 * Uses `git remote get-url origin`.
 */
export function detectSourceRepo(
  sourceRepoPath: string,
  runner: GitRunner = realGitRunner,
): string | undefined {
  const result = runner(['remote', 'get-url', 'origin'], sourceRepoPath);
  if (result.status !== 0 || !result.stdout) return undefined;
  return parseGitHubRepo(result.stdout);
}

/**
 * Build the PR body summarizing the resync changes.
 *
 * Supports both whole-file resync (sectionResults empty) and legacy
 * section-by-section mode (sectionResults populated).
 *
 * Exported for testing.
 */
export function buildForwardPRBody(
  file: string,
  sectionResults: ResyncSectionResult[],
  sourceRepo?: string,
  docsFolder?: string,
  triageReason?: string,
): string {
  const lines: string[] = [];

  lines.push(`## Forward Resync: ${file}`);
  lines.push('');

  // Source reference
  if (sourceRepo) {
    const effectiveFolder = (docsFolder && docsFolder !== '.' && docsFolder !== '/') ? docsFolder : '';
    const sourcePath = effectiveFolder ? `${effectiveFolder}/${file}` : file;
    const sourceUrl = `https://github.com/${sourceRepo}/blob/main/${sourcePath}`;
    lines.push(`**Source**: [${sourceRepo}](https://github.com/${sourceRepo}) — [${sourcePath}](${sourceUrl})`);
  }
  lines.push('This PR resyncs the translation to match the current source document.');
  lines.push('');

  // Triage reason
  if (triageReason) {
    lines.push(`**Reason**: ${triageReason}`);
    lines.push('');
  }

  if (sectionResults.length === 0) {
    // Whole-file resync — no per-section breakdown
    lines.push('### Changes');
    lines.push('');
    lines.push('Whole-file resync applied. The entire document was resynced in a single pass.');
    lines.push('');
  } else {
    // Legacy section-by-section breakdown
    const resynced = sectionResults.filter(r => r.action === 'RESYNCED');
    const newSections = sectionResults.filter(r => r.action === 'NEW');
    const removed = sectionResults.filter(r => r.action === 'REMOVED');
    const unchanged = sectionResults.filter(r => r.action === 'UNCHANGED');
    const errors = sectionResults.filter(r => r.action === 'ERROR');

    lines.push('### Changes');
    lines.push('');
    if (resynced.length > 0) {
      lines.push(`**↻ Resynced** (${resynced.length}):`);
      for (const s of resynced) {
        lines.push(`- ${s.sectionHeading}`);
      }
      lines.push('');
    }
    if (newSections.length > 0) {
      lines.push(`**+ New** (${newSections.length}):`);
      for (const s of newSections) {
        lines.push(`- ${s.sectionHeading}`);
      }
      lines.push('');
    }
    if (removed.length > 0) {
      lines.push(`**- Removed** (${removed.length}):`);
      for (const s of removed) {
        lines.push(`- ${s.sectionHeading}`);
      }
      lines.push('');
    }
    if (unchanged.length > 0) {
      lines.push(`**= Unchanged**: ${unchanged.length} section(s)`);
      lines.push('');
    }
    if (errors.length > 0) {
      lines.push(`**⚠️ Errors** (${errors.length}):`);
      for (const s of errors) {
        lines.push(`- ${s.sectionHeading}: ${s.error}`);
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('*Created by [action-translation](https://github.com/QuantEcon/action-translation) forward resync*');

  return lines.join('\n');
}

/**
 * Build the branch name for a forward resync PR.
 *
 * Exported for testing.
 */
export function buildBranchName(file: string): string {
  // Remove .md extension and sanitize for git branch name
  const stem = file.replace(/\.md$/i, '').replace(/[^a-zA-Z0-9_.-]/g, '-');
  return `resync/${stem}`;
}

/**
 * Build the PR title.
 *
 * Exported for testing.
 */
export function buildPRTitle(file: string): string {
  return `[action-translation] resync: ${file}`;
}

// ============================================================================
// PR CREATION
// ============================================================================

/**
 * Build `gh pr create` arguments.
 *
 * Exported for testing.
 */
export function buildGhArgs(file: string, repo: string): string[] {
  const title = buildPRTitle(file);
  return [
    'pr', 'create',
    '--repo', repo,
    '--head', buildBranchName(file),
    '--title', title,
    '--body-file', '-',
    '--label', 'action-translation-sync',
    '--label', 'resync',
  ];
}

/**
 * Create a PR in the TARGET repo for a single forward-resynced file.
 *
 * Prerequisite: `gitPrepareAndPush()` must have been called first
 * to create the branch with the committed file.
 *
 * @param file           Filename (e.g., "cobweb.md")
 * @param content        Updated file content (currently unused, kept for API compat)
 * @param sectionResults Section-level results for PR body (empty for whole-file)
 * @param repo           TARGET repo in `owner/repo` format
 * @param runner         Injectable gh runner
 * @param sourceRepo     SOURCE repo in `owner/repo` format (optional, for PR body)
 * @param docsFolder     Docs folder path (optional, for source file link)
 * @param triageReason   Triage explanation (optional, for PR body)
 */
export function createForwardPR(
  file: string,
  content: string,
  sectionResults: ResyncSectionResult[],
  repo: string,
  runner: GhRunner = realGhRunner,
  sourceRepo?: string,
  docsFolder?: string,
  triageReason?: string,
): ForwardPRResult {
  const args = buildGhArgs(file, repo);
  const body = buildForwardPRBody(file, sectionResults, sourceRepo, docsFolder, triageReason);
  const result = runner(args, body);

  if (result.status === 0 && result.stdout) {
    return { file, url: result.stdout.trim(), success: true };
  }

  return {
    file,
    error: result.stderr || `gh exited with status ${result.status}`,
    success: false,
  };
}

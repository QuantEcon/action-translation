/**
 * Forward PR Creator
 *
 * Creates one PR per file in the TARGET repository after forward resync.
 * Uses `gh` CLI for PR creation, following the same injectable GhRunner
 * pattern as `issue-creator.ts`.
 *
 * Branch: `resync/{filename}` (e.g., `resync/cobweb`)
 * Title: `🔄 [resync] cobweb.md`
 * Labels: `action-translation-sync`, `resync`
 */

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
// PR BODY
// ============================================================================

/**
 * Build the PR body summarizing the resync changes.
 *
 * Exported for testing.
 */
export function buildForwardPRBody(
  file: string,
  sectionResults: ResyncSectionResult[],
): string {
  const lines: string[] = [];

  lines.push(`## Forward Resync: ${file}`);
  lines.push('');
  lines.push('This PR resyncs the TARGET translation to match the current SOURCE content.');
  lines.push('');

  // Section summary table
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
  return `🔄 [resync] ${file}`;
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
 * This function:
 * 1. Creates a branch in the TARGET repo
 * 2. Commits the updated file
 * 3. Creates a PR
 *
 * Note: The actual git operations (branch, commit, push) need to happen
 * before calling this function. This function only creates the PR via `gh`.
 *
 * @param file           Filename (e.g., "cobweb.md")
 * @param content        Updated file content
 * @param sectionResults Section-level results for PR body
 * @param repo           TARGET repo in `owner/repo` format
 * @param runner         Injectable gh runner
 */
export function createForwardPR(
  file: string,
  content: string,
  sectionResults: ResyncSectionResult[],
  repo: string,
  runner: GhRunner = realGhRunner,
): ForwardPRResult {
  const args = buildGhArgs(file, repo);
  const body = buildForwardPRBody(file, sectionResults);
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

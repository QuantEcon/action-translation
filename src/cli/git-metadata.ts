/**
 * File-level git metadata extraction
 * 
 * Uses `git log` to get last modification date, commit SHA, and author
 * for source and target files. This temporal context is passed to the LLM
 * to help evaluate whether changes are worth backporting.
 * 
 * Uses file-level dates (not section-level) for simplicity and reliability.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { FileGitMetadata } from './types';

const execFileAsync = promisify(execFile);

/**
 * Get file-level git metadata for a file
 * 
 * @param repoPath - Path to the git repository root
 * @param filePath - Relative path to the file within the repo
 * @returns Git metadata or null if the file has no git history
 */
export async function getFileGitMetadata(
  repoPath: string,
  filePath: string,
): Promise<FileGitMetadata | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['log', '-1', '--format=%H %ai %an', '--', filePath],
      { cwd: repoPath },
    );

    const trimmed = stdout.trim();
    if (!trimmed) {
      return null; // File has no git history (untracked or new)
    }

    return parseGitLogOutput(trimmed);
  } catch {
    return null; // Git command failed (not a repo, file doesn't exist, etc.)
  }
}

/**
 * Parse the output of `git log -1 --format="%H %ai %an"`
 * 
 * Format: "<sha> <date> <timezone> <author>"
 * Example: "abc123def 2024-06-15 10:30:00 -0500 Jane Doe"
 */
export function parseGitLogOutput(output: string): FileGitMetadata | null {
  // SHA is 40 hex chars, date is "YYYY-MM-DD HH:MM:SS +ZZZZ", rest is author
  const match = output.match(/^([0-9a-f]{40})\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+[+-]\d{4})\s+(.+)$/);
  if (!match) {
    return null;
  }

  const [, sha, dateStr, author] = match;
  return {
    lastModified: new Date(dateStr),
    lastCommit: sha,
    lastAuthor: author,
  };
}

/**
 * Format a date for display in reports and LLM prompts
 * Returns ISO date string (e.g., "2024-06-15")
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Calculate the number of days between two dates
 */
export function daysBetween(earlier: Date, later: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((later.getTime() - earlier.getTime()) / msPerDay);
}

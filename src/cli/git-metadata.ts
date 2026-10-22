/**
 * File-level git metadata extraction
 *
 * Uses `git log` to get last modification date, commit SHA, and author
 * for source and target files. This temporal context is passed to the LLM
 * to help evaluate whether changes are worth backporting.
 *
 * Uses file-level dates (not section-level) for simplicity and reliability.
 *
 * Also answers whether a file changed since a recorded sync point, and with
 * which commits, for `status --write-state` (#380).
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { FileGitMetadata, TimelineEntry, FileTimeline } from './types.js';

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
  filePath: string
): Promise<FileGitMetadata | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['log', '-1', '--format=%H %ai %an', '--', filePath],
      { cwd: repoPath }
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
  const match = output.match(
    /^([0-9a-f]{40})\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+[+-]\d{4})\s+(.+)$/
  );
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

// A recorded sync point (a state file's `source-sha`) reaches git as a revision
// argument. Only a full or abbreviated hex object name is passed on, so a
// hand-edited value such as `--output=<path>` is never read as an option.
const OBJECT_NAME = /^[0-9a-f]{4,64}$/i;

/**
 * Has a file's content changed between a recorded commit and HEAD?
 *
 * Runs `git diff --quiet <sha> HEAD -- <path>`, which compares the file's
 * content at the two commits rather than the commits themselves: a recorded
 * commit that did not touch the file, such as the merge commit sync records
 * (#391), reads as unchanged.
 *
 * @param repoPath - Path to the git repository root
 * @param sha - The recorded commit
 * @param filePath - Relative path to the file within the repo
 * @returns false when the content is the same (exit 0), true when it differs
 *   (exit 1), and undefined when git cannot tell: the commit is not in the
 *   local clone (shallow, not pulled, another repository) or git failed
 */
export async function fileChangedSince(
  repoPath: string,
  sha: string,
  filePath: string
): Promise<boolean | undefined> {
  if (!OBJECT_NAME.test(sha)) return undefined;
  try {
    await execFileAsync('git', ['diff', '--quiet', sha, 'HEAD', '--', filePath], {
      cwd: repoPath,
    });
    return false;
  } catch (error) {
    return (error as { code?: unknown }).code === 1 ? true : undefined;
  }
}

/**
 * The commits after a recorded commit, up to HEAD, that change a file:
 * newest first, one line each, `<short sha> <author date> <subject>`.
 *
 * Empty both when there are none and when git fails; fileChangedSince tells
 * those apart.
 *
 * @param repoPath - Path to the git repository root
 * @param sha - The recorded commit
 * @param filePath - Relative path to the file within the repo
 */
export async function commitsSince(
  repoPath: string,
  sha: string,
  filePath: string
): Promise<string[]> {
  if (!OBJECT_NAME.test(sha)) return [];
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['log', '--format=%h %ad %s', '--date=short', `${sha}..HEAD`, '--', filePath],
      { cwd: repoPath }
    );
    return stdout.split('\n').filter((line) => line.trim() !== '');
  } catch {
    return [];
  }
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

// ============================================================================
// INTERLEAVED TIMELINE
// ============================================================================

/**
 * Get the full commit history for a file from a single repo
 * Returns entries newest-first.
 *
 * @param repoPath - Path to the git repository root
 * @param filePath - Relative path to the file within the repo
 * @param label - 'SOURCE' or 'TARGET'
 * @returns Array of timeline entries
 */
export async function getRepoCommits(
  repoPath: string,
  filePath: string,
  label: 'SOURCE' | 'TARGET'
): Promise<TimelineEntry[]> {
  try {
    const { stdout } = await execFileAsync('git', ['log', '--format=%ai|%h|%s', '--', filePath], {
      cwd: repoPath,
    });

    const trimmed = stdout.trim();
    if (!trimmed) return [];

    return trimmed
      .split('\n')
      .map((line) => parseTimelineEntry(line, label))
      .filter((entry): entry is TimelineEntry => entry !== null);
  } catch {
    return [];
  }
}

/**
 * Parse a single line of `git log --format="%ai|%h|%s"` output
 *
 * Format: "2024-06-15 10:30:00 -0500|abc123d|commit message"
 */
export function parseTimelineEntry(line: string, label: 'SOURCE' | 'TARGET'): TimelineEntry | null {
  const parts = line.split('|');
  if (parts.length < 3) return null;

  const dateStr = parts[0].trim();
  const sha = parts[1].trim();
  const message = parts.slice(2).join('|').trim(); // rejoin if commit message had pipes

  // Extract YYYY-MM-DD from the date string (keep full string for precise sorting)
  const dateMatch = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!dateMatch) return null;

  return {
    date: dateMatch[1],
    fullDate: dateStr,
    repo: label,
    sha,
    message,
  };
}

/**
 * Build an interleaved commit timeline for a file across SOURCE and TARGET repos.
 *
 * This gives the LLM a chronological narrative of what changed where and when,
 * preventing directional reasoning errors (e.g., thinking TARGET's older code
 * should be backported when SOURCE is actually newer).
 *
 * @param sourceRepoPath - Path to the SOURCE repository
 * @param targetRepoPath - Path to the TARGET repository
 * @param filePath - Relative path to the file within each repo's docs folder
 * @returns FileTimeline with interleaved entries, or null if no history
 */
export async function getFileTimeline(
  sourceRepoPath: string,
  targetRepoPath: string,
  filePath: string
): Promise<FileTimeline | null> {
  const [sourceEntries, targetEntries] = await Promise.all([
    getRepoCommits(sourceRepoPath, filePath, 'SOURCE'),
    getRepoCommits(targetRepoPath, filePath, 'TARGET'),
  ]);

  if (sourceEntries.length === 0 && targetEntries.length === 0) {
    return null;
  }

  // Interleave and sort newest-first by full timestamp (not just date)
  const allEntries = [...sourceEntries, ...targetEntries].sort((a, b) =>
    b.fullDate.localeCompare(a.fullDate)
  );

  // Estimated sync date: earliest TARGET commit = when translation was first created
  const estimatedSyncDate =
    targetEntries.length > 0 ? targetEntries[targetEntries.length - 1].date : null;

  // Count SOURCE commits after the sync point
  const sourceCommitsAfterSync = estimatedSyncDate
    ? sourceEntries.filter((e) => e.date > estimatedSyncDate).length
    : 0;

  return {
    entries: allEntries,
    sourceCommitCount: sourceEntries.length,
    targetCommitCount: targetEntries.length,
    estimatedSyncDate,
    sourceCommitsAfterSync,
  };
}

/**
 * Format a timeline into a compact string for LLM prompts.
 * Shows most recent N entries to keep token usage reasonable.
 *
 * @param timeline - The file timeline
 * @param maxEntries - Maximum entries to show (default: 20)
 * @returns Formatted string for inclusion in a prompt
 */
export function formatTimelineForPrompt(timeline: FileTimeline, maxEntries: number = 20): string {
  const lines: string[] = [];

  lines.push(
    `Source has ${timeline.sourceCommitCount} commits, Target has ${timeline.targetCommitCount} commits.`
  );

  if (timeline.estimatedSyncDate) {
    lines.push(`Estimated sync point (earliest TARGET commit): ${timeline.estimatedSyncDate}`);
    if (timeline.sourceCommitsAfterSync > 0) {
      lines.push(
        `SOURCE has ${timeline.sourceCommitsAfterSync} commit(s) AFTER the translation was created.`
      );
    }
  }

  lines.push('');
  lines.push('Commit history (newest first):');

  const entries = timeline.entries.slice(0, maxEntries);
  for (const entry of entries) {
    lines.push(`  ${entry.date}  ${entry.repo.padEnd(6)}  ${entry.sha}  ${entry.message}`);
  }

  if (timeline.entries.length > maxEntries) {
    lines.push(`  ... and ${timeline.entries.length - maxEntries} older commits`);
  }

  return lines.join('\n');
}

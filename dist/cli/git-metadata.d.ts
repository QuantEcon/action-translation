/**
 * File-level git metadata extraction
 *
 * Uses `git log` to get last modification date, commit SHA, and author
 * for source and target files. This temporal context is passed to the LLM
 * to help evaluate whether changes are worth backporting.
 *
 * Uses file-level dates (not section-level) for simplicity and reliability.
 */
import { FileGitMetadata, TimelineEntry, FileTimeline } from './types';
/**
 * Get file-level git metadata for a file
 *
 * @param repoPath - Path to the git repository root
 * @param filePath - Relative path to the file within the repo
 * @returns Git metadata or null if the file has no git history
 */
export declare function getFileGitMetadata(repoPath: string, filePath: string): Promise<FileGitMetadata | null>;
/**
 * Parse the output of `git log -1 --format="%H %ai %an"`
 *
 * Format: "<sha> <date> <timezone> <author>"
 * Example: "abc123def 2024-06-15 10:30:00 -0500 Jane Doe"
 */
export declare function parseGitLogOutput(output: string): FileGitMetadata | null;
/**
 * Format a date for display in reports and LLM prompts
 * Returns ISO date string (e.g., "2024-06-15")
 */
export declare function formatDate(date: Date): string;
/**
 * Calculate the number of days between two dates
 */
export declare function daysBetween(earlier: Date, later: Date): number;
/**
 * Get the full commit history for a file from a single repo
 * Returns entries newest-first.
 *
 * @param repoPath - Path to the git repository root
 * @param filePath - Relative path to the file within the repo
 * @param label - 'SOURCE' or 'TARGET'
 * @returns Array of timeline entries
 */
export declare function getRepoCommits(repoPath: string, filePath: string, label: 'SOURCE' | 'TARGET'): Promise<TimelineEntry[]>;
/**
 * Parse a single line of `git log --format="%ai|%h|%s"` output
 *
 * Format: "2024-06-15 10:30:00 -0500|abc123d|commit message"
 */
export declare function parseTimelineEntry(line: string, label: 'SOURCE' | 'TARGET'): TimelineEntry | null;
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
export declare function getFileTimeline(sourceRepoPath: string, targetRepoPath: string, filePath: string): Promise<FileTimeline | null>;
/**
 * Format a timeline into a compact string for LLM prompts.
 * Shows most recent N entries to keep token usage reasonable.
 *
 * @param timeline - The file timeline
 * @param maxEntries - Maximum entries to show (default: 20)
 * @returns Formatted string for inclusion in a prompt
 */
export declare function formatTimelineForPrompt(timeline: FileTimeline, maxEntries?: number): string;
//# sourceMappingURL=git-metadata.d.ts.map
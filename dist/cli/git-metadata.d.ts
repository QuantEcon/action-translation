/**
 * File-level git metadata extraction
 *
 * Uses `git log` to get last modification date, commit SHA, and author
 * for source and target files. This temporal context is passed to the LLM
 * to help evaluate whether changes are worth backporting.
 *
 * Uses file-level dates (not section-level) for simplicity and reliability.
 */
import { FileGitMetadata } from './types';
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
//# sourceMappingURL=git-metadata.d.ts.map
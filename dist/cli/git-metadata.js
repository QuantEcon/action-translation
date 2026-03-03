"use strict";
/**
 * File-level git metadata extraction
 *
 * Uses `git log` to get last modification date, commit SHA, and author
 * for source and target files. This temporal context is passed to the LLM
 * to help evaluate whether changes are worth backporting.
 *
 * Uses file-level dates (not section-level) for simplicity and reliability.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFileGitMetadata = getFileGitMetadata;
exports.parseGitLogOutput = parseGitLogOutput;
exports.formatDate = formatDate;
exports.daysBetween = daysBetween;
exports.getRepoCommits = getRepoCommits;
exports.parseTimelineEntry = parseTimelineEntry;
exports.getFileTimeline = getFileTimeline;
exports.formatTimelineForPrompt = formatTimelineForPrompt;
const child_process_1 = require("child_process");
const util_1 = require("util");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
/**
 * Get file-level git metadata for a file
 *
 * @param repoPath - Path to the git repository root
 * @param filePath - Relative path to the file within the repo
 * @returns Git metadata or null if the file has no git history
 */
async function getFileGitMetadata(repoPath, filePath) {
    try {
        const { stdout } = await execFileAsync('git', ['log', '-1', '--format=%H %ai %an', '--', filePath], { cwd: repoPath });
        const trimmed = stdout.trim();
        if (!trimmed) {
            return null; // File has no git history (untracked or new)
        }
        return parseGitLogOutput(trimmed);
    }
    catch {
        return null; // Git command failed (not a repo, file doesn't exist, etc.)
    }
}
/**
 * Parse the output of `git log -1 --format="%H %ai %an"`
 *
 * Format: "<sha> <date> <timezone> <author>"
 * Example: "abc123def 2024-06-15 10:30:00 -0500 Jane Doe"
 */
function parseGitLogOutput(output) {
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
function formatDate(date) {
    return date.toISOString().split('T')[0];
}
/**
 * Calculate the number of days between two dates
 */
function daysBetween(earlier, later) {
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
async function getRepoCommits(repoPath, filePath, label) {
    try {
        const { stdout } = await execFileAsync('git', ['log', '--format=%ai|%h|%s', '--', filePath], { cwd: repoPath });
        const trimmed = stdout.trim();
        if (!trimmed)
            return [];
        return trimmed.split('\n').map(line => parseTimelineEntry(line, label)).filter((entry) => entry !== null);
    }
    catch {
        return [];
    }
}
/**
 * Parse a single line of `git log --format="%ai|%h|%s"` output
 *
 * Format: "2024-06-15 10:30:00 -0500|abc123d|commit message"
 */
function parseTimelineEntry(line, label) {
    const parts = line.split('|');
    if (parts.length < 3)
        return null;
    const dateStr = parts[0].trim();
    const sha = parts[1].trim();
    const message = parts.slice(2).join('|').trim(); // rejoin if commit message had pipes
    // Extract YYYY-MM-DD from the date string
    const dateMatch = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch)
        return null;
    return {
        date: dateMatch[1],
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
async function getFileTimeline(sourceRepoPath, targetRepoPath, filePath) {
    const [sourceEntries, targetEntries] = await Promise.all([
        getRepoCommits(sourceRepoPath, filePath, 'SOURCE'),
        getRepoCommits(targetRepoPath, filePath, 'TARGET'),
    ]);
    if (sourceEntries.length === 0 && targetEntries.length === 0) {
        return null;
    }
    // Interleave and sort newest-first by date
    const allEntries = [...sourceEntries, ...targetEntries].sort((a, b) => b.date.localeCompare(a.date));
    // Estimated sync date: earliest TARGET commit = when translation was first created
    const estimatedSyncDate = targetEntries.length > 0
        ? targetEntries[targetEntries.length - 1].date
        : null;
    // Count SOURCE commits after the sync point
    const sourceCommitsAfterSync = estimatedSyncDate
        ? sourceEntries.filter(e => e.date > estimatedSyncDate).length
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
function formatTimelineForPrompt(timeline, maxEntries = 20) {
    const lines = [];
    lines.push(`Source has ${timeline.sourceCommitCount} commits, Target has ${timeline.targetCommitCount} commits.`);
    if (timeline.estimatedSyncDate) {
        lines.push(`Estimated sync point (earliest TARGET commit): ${timeline.estimatedSyncDate}`);
        if (timeline.sourceCommitsAfterSync > 0) {
            lines.push(`SOURCE has ${timeline.sourceCommitsAfterSync} commit(s) AFTER the translation was created.`);
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
//# sourceMappingURL=git-metadata.js.map
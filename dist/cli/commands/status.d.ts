/**
 * Status Command
 *
 * Fast, free diagnostic — no LLM calls.
 * Compares SOURCE and TARGET repos to produce a per-file sync status.
 *
 * Output goes to the CLI console (like `git status`), not report files.
 *
 * Primary status (most significant issue):
 * - ALIGNED:            Structure matches, heading-map present, no newer SOURCE commits
 * - OUTDATED:           Structure/heading-map OK, but SOURCE has newer commits than TARGET
 * - SOURCE_AHEAD:       SOURCE has more sections than TARGET (sections added upstream)
 * - TARGET_AHEAD:       TARGET has more sections than SOURCE (unexpected divergence)
 * - MISSING_HEADINGMAP: No heading-map in TARGET file
 * - SOURCE_ONLY:        File exists in SOURCE but not TARGET
 * - TARGET_ONLY:        File exists in TARGET but not SOURCE
 *
 * Flags (compound conditions — a file may have multiple):
 * - SOURCE_AHEAD / TARGET_AHEAD: section count mismatch
 * - MISSING_HEADINGMAP: no heading-map in TARGET
 * - OUTDATED: SOURCE modified after TARGET
 */
export type FileSyncStatus = 'ALIGNED' | 'OUTDATED' | 'SOURCE_AHEAD' | 'TARGET_AHEAD' | 'MISSING_HEADINGMAP' | 'SOURCE_ONLY' | 'TARGET_ONLY';
export interface FileStatusEntry {
    file: string;
    status: FileSyncStatus;
    flags: FileSyncStatus[];
    details?: string;
    sourceSections?: number;
    targetSections?: number;
    sourceLastModified?: string;
    targetLastModified?: string;
}
export interface StatusResult {
    sourceRepo: string;
    targetRepo: string;
    language: string;
    entries: FileStatusEntry[];
    summary: {
        total: number;
        aligned: number;
        outdated: number;
        sourceAhead: number;
        targetAhead: number;
        missingHeadingMap: number;
        sourceOnly: number;
        targetOnly: number;
    };
}
export interface StatusOptions {
    source: string;
    target: string;
    docsFolder: string;
    language: string;
    exclude: string[];
    file?: string;
}
/**
 * Find all .md files in a docs folder (non-recursive, flat list).
 * Use --exclude patterns to filter out non-lecture files.
 */
export declare function discoverMarkdownFiles(repoPath: string, docsFolder: string): string[];
/**
 * Resolve the set of all files across SOURCE and TARGET, paired by filename.
 * Returns a deduplicated sorted list of filenames.
 */
export declare function resolveFilePairs(sourceFiles: string[], targetFiles: string[]): string[];
/**
 * Apply exclude patterns to a list of filenames.
 * Supports simple glob: exact match or leading * wildcard (e.g., "README.md", "*.yml").
 */
export declare function applyExcludes(files: string[], excludes: string[]): string[];
/**
 * Determine the sync status of a single file.
 *
 * Builds a list of all applicable flags, then picks the most significant
 * as the primary status. Priority: SOURCE_AHEAD/TARGET_AHEAD > MISSING_HEADINGMAP > OUTDATED > ALIGNED.
 */
export declare function checkFileStatus(file: string, sourceRepoPath: string, targetRepoPath: string, docsFolder: string): Promise<FileStatusEntry>;
/**
 * Run the status command across all files in both repos.
 *
 * @param options - Status command options
 * @returns StatusResult with per-file entries and summary
 */
export declare function runStatus(options: StatusOptions): Promise<StatusResult>;
/**
 * Format a StatusResult as a console-friendly table string.
 */
export declare function formatStatusTable(result: StatusResult): string;
/**
 * Format a StatusResult as JSON for --json flag (printed to stdout).
 */
export declare function formatStatusJson(result: StatusResult): string;
//# sourceMappingURL=status.d.ts.map
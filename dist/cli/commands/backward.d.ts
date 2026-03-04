/**
 * Backward Command
 *
 * Orchestrates the two-stage backward analysis pipeline:
 *
 * Stage 1: Document-level triage (single LLM call per file)
 *   - Determines if a file has substantive changes beyond translation
 *   - IN_SYNC files are skipped (cheap filter)
 *
 * Stage 2: Section-level analysis (one LLM call per section, flagged files only)
 *   - Matches sections by position with heading-map validation
 *   - Evaluates each section pair for backport potential
 *   - Produces structured suggestions with category/confidence
 *
 * Supports two modes:
 * - Single-file: `npx resync backward -f file.md`
 * - Bulk: `npx resync backward` (all files in docs folder)
 *   - Writes reports to a timestamped folder
 *   - Incremental checkpointing via _progress.json
 *   - Supports --resume to continue interrupted runs
 */
import { BackwardReport, BackwardOptions, BulkBackwardReport } from '../types';
/**
 * Logger interface for backward command output
 */
export interface BackwardLogger {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}
/**
 * Execute backward analysis for a single file
 *
 * @param options - Backward command options
 * @param logger - Logger for console output
 * @returns BackwardReport
 */
export declare function runBackwardSingleFile(options: BackwardOptions & {
    apiKey: string;
}, logger?: BackwardLogger): Promise<BackwardReport>;
/**
 * Progress manifest for incremental checkpointing.
 * Written to _progress.json in the output folder after each file completes.
 */
export interface BulkProgress {
    startedAt: string;
    lastUpdated: string;
    totalFiles: number;
    completedFiles: string[];
    /** Files that errored (still counted as "done" for resume purposes) */
    erroredFiles: {
        file: string;
        error: string;
    }[];
}
/**
 * Read existing progress from _progress.json, or return null if not found.
 */
export declare function readProgress(outputDir: string): BulkProgress | null;
/**
 * Write progress to _progress.json.
 */
export declare function writeProgress(outputDir: string, progress: BulkProgress): void;
/**
 * Build a timestamped output folder name:
 *   reports/backward-2026-03-03_14-23-05/
 *
 * Uses date + time (to the second) to avoid collisions between multiple
 * bulk runs on the same day.
 */
export declare function buildBulkOutputDir(baseOutput: string): string;
/**
 * Estimate the cost of a bulk backward run.
 */
export interface CostEstimate {
    totalFiles: number;
    stage1Calls: number;
    estimatedFlaggedFiles: number;
    estimatedStage2Calls: number;
    estimatedCostUsd: number;
    estimatedTimeMinutes: number;
}
export declare function estimateBulkCost(fileCount: number, avgSectionsPerFile?: number): CostEstimate;
/**
 * Format a cost estimate for console display.
 */
export declare function formatCostEstimate(estimate: CostEstimate): string;
/**
 * Discover files to analyze in bulk mode.
 * Uses both SOURCE and TARGET file lists, applies exclusions.
 */
export declare function discoverBulkFiles(sourceRepoPath: string, targetRepoPath: string, docsFolder: string, exclude: string[]): string[];
/**
 * Execute bulk backward analysis across all files.
 *
 * Reports are written incrementally to a timestamped folder.
 * Supports --resume to skip already-completed files.
 *
 * @param options - Backward command options (file should be undefined for bulk)
 * @param logger - Logger for console output
 * @param exclude - Exclude patterns
 * @param resume - Whether to resume from a previous run
 * @returns BulkBackwardReport
 */
export declare function runBackwardBulk(options: BackwardOptions & {
    apiKey: string;
}, logger?: BackwardLogger, exclude?: string[], resume?: boolean): Promise<BulkBackwardReport>;
/**
 * Build a BulkBackwardReport from individual file reports.
 */
export declare function buildBulkReport(sourceRepo: string, targetRepo: string, language: string, fileReports: BackwardReport[]): BulkBackwardReport;
//# sourceMappingURL=backward.d.ts.map
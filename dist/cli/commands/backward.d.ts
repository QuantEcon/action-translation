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
 */
import { BackwardReport, BackwardOptions } from '../types';
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
//# sourceMappingURL=backward.d.ts.map
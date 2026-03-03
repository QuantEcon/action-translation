/**
 * CLI-specific types for the resync tool
 *
 * These types support the three-command architecture:
 * - backward: Two-stage triage + section analysis → suggestion reports
 * - backward-sync: Apply accepted suggestions to SOURCE (Phase 3)
 * - forward: Translate SOURCE changes to TARGET (Phase 3)
 */
import { Section } from '../types';
/**
 * Verdict from Stage 1 whole-document comparison
 */
export type TriageVerdict = 'CHANGES_DETECTED' | 'IN_SYNC' | 'SKIPPED_TOO_LARGE';
/**
 * Result of Stage 1 document-level triage
 */
export interface TriageResult {
    file: string;
    verdict: TriageVerdict;
    notes: string;
    tokenCount?: number;
}
/**
 * Status of a matched section pair (cross-language)
 */
export type SectionSyncStatus = 'SOURCE_ONLY' | 'TARGET_ONLY' | 'MATCHED';
/**
 * A pair of sections matched across SOURCE and TARGET
 */
export interface SectionPair {
    sourceSection: Section | null;
    targetSection: Section | null;
    status: SectionSyncStatus;
    sourceHeading?: string;
    targetHeading?: string;
}
/**
 * Category of a backward suggestion
 */
export type BackportCategory = 'BUG_FIX' | 'CLARIFICATION' | 'EXAMPLE' | 'CODE_IMPROVEMENT' | 'I18N_ONLY' | 'NO_CHANGE';
/**
 * A specific change identified in a section
 */
export interface SpecificChange {
    type: string;
    original: string;
    improved: string;
}
/**
 * A suggestion to improve the English source based on translation improvements
 */
export interface BackportSuggestion {
    sectionHeading: string;
    recommendation: 'BACKPORT' | 'NO_BACKPORT';
    category: BackportCategory;
    confidence: number;
    summary: string;
    specificChanges: SpecificChange[];
    reasoning: string;
}
/**
 * File-level git metadata for temporal context
 */
export interface FileGitMetadata {
    lastModified: Date;
    lastCommit: string;
    lastAuthor: string;
}
/**
 * A single entry in the interleaved commit timeline
 */
export interface TimelineEntry {
    date: string;
    repo: 'SOURCE' | 'TARGET';
    sha: string;
    message: string;
}
/**
 * Interleaved commit timeline for a file across both repos.
 * Sorted newest-first. Helps the LLM reason about which repo
 * changed what and when — preventing directional errors.
 */
export interface FileTimeline {
    entries: TimelineEntry[];
    sourceCommitCount: number;
    targetCommitCount: number;
    /** Date of the earliest TARGET commit — approximate sync point */
    estimatedSyncDate: string | null;
    /** Number of SOURCE commits after the estimated sync point */
    sourceCommitsAfterSync: number;
}
/**
 * Complete backward analysis report for a single file
 */
export interface BackwardReport {
    file: string;
    timestamp: string;
    sourceMetadata: FileGitMetadata | null;
    targetMetadata: FileGitMetadata | null;
    timeline: FileTimeline | null;
    triageResult: TriageResult;
    suggestions: BackportSuggestion[];
    sectionPairs?: SectionPair[];
}
/**
 * Summary report across multiple files (bulk mode)
 */
export interface BulkBackwardReport {
    timestamp: string;
    sourceRepo: string;
    targetRepo: string;
    language: string;
    filesAnalyzed: number;
    filesInSync: number;
    filesFlagged: number;
    filesSkipped: number;
    totalSuggestions: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
    fileReports: BackwardReport[];
}
/**
 * Common CLI options shared across commands
 */
export interface CommonOptions {
    source: string;
    target: string;
    docsFolder: string;
    language: string;
    output: string;
    model: string;
    json: boolean;
    test: boolean;
}
/**
 * Backward command options
 */
export interface BackwardOptions extends CommonOptions {
    file?: string;
    minConfidence: number;
    estimate: boolean;
}
//# sourceMappingURL=types.d.ts.map
/**
 * CLI-specific types for the resync tool
 * 
 * These types support the three-command architecture:
 * - backward: Two-stage triage + section analysis → suggestion reports
 * - backward-sync: Apply accepted suggestions to SOURCE (Phase 3)
 * - forward: Translate SOURCE changes to TARGET (Phase 3)
 */

import { Section } from '../types.js';

// ============================================================================
// STAGE 1: DOCUMENT-LEVEL TRIAGE
// ============================================================================

/**
 * Verdict from Stage 1 whole-document comparison
 */
export type TriageVerdict = 
  | 'CHANGES_DETECTED'     // Substantive changes found beyond translation
  | 'IN_SYNC'              // Translation is faithful, no backport candidates
  | 'SKIPPED_TOO_LARGE';   // Document too large for single-call triage

/**
 * Result of Stage 1 document-level triage
 */
export interface TriageResult {
  file: string;
  verdict: TriageVerdict;
  notes: string;           // Brief description of what looks different (empty if IN_SYNC)
  tokenCount?: number;     // Approximate tokens used for the triage call
}

// ============================================================================
// STAGE 2: SECTION-LEVEL ANALYSIS
// ============================================================================

/**
 * Status of a matched section pair (cross-language)
 */
export type SectionSyncStatus = 
  | 'SOURCE_ONLY'          // Section exists only in source (new, not yet translated)
  | 'TARGET_ONLY'          // Section exists only in target (extra, or deleted from source)
  | 'MATCHED';             // Section exists in both (position-based match)

/**
 * A pair of sections matched across SOURCE and TARGET
 */
export interface SectionPair {
  sourceSection: Section | null;   // null if TARGET_ONLY
  targetSection: Section | null;   // null if SOURCE_ONLY
  status: SectionSyncStatus;
  sourceHeading?: string;          // For logging/reporting
  targetHeading?: string;          // For logging/reporting
}

/**
 * Category of a backward suggestion
 */
export type BackportCategory = 
  | 'BUG_FIX'              // Correction of errors (formulas, code, facts)
  | 'CLARIFICATION'        // Better explanation or wording
  | 'EXAMPLE'              // Additional example or context
  | 'CODE_IMPROVEMENT'     // Non-i18n code change
  | 'I18N_ONLY'            // Only translation/locale changes (no backport needed)
  | 'NO_CHANGE';           // Sections are equivalent

/**
 * A specific change identified in a section
 */
export interface SpecificChange {
  type: string;              // Description of change type
  original: string;          // What was in SOURCE
  improved: string;          // What is in TARGET (translated back to English if needed)
}

/**
 * A suggestion to improve the English source based on translation improvements
 */
export interface BackportSuggestion {
  sectionHeading: string;    // The section this suggestion applies to
  recommendation: 'BACKPORT' | 'NO_BACKPORT';
  category: BackportCategory;
  confidence: number;        // 0.0 to 1.0
  summary: string;           // Brief description of the improvement
  specificChanges: SpecificChange[];
  reasoning: string;         // Why this should/shouldn't be backported
}

// ============================================================================
// GIT METADATA
// ============================================================================

/**
 * File-level git metadata for temporal context
 */
export interface FileGitMetadata {
  lastModified: Date;
  lastCommit: string;        // SHA
  lastAuthor: string;
}

/**
 * A single entry in the interleaved commit timeline
 */
export interface TimelineEntry {
  date: string;              // ISO date "YYYY-MM-DD" (for display)
  fullDate: string;          // Full timestamp "YYYY-MM-DD HH:MM:SS +ZZZZ" (for sorting)
  repo: 'SOURCE' | 'TARGET';
  sha: string;               // Short SHA (7-8 chars)
  message: string;           // Commit message (first line)
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

// ============================================================================
// REPORTS
// ============================================================================

/**
 * Complete backward analysis report for a single file
 */
export interface BackwardReport {
  schemaVersion?: string;        // Added in v1.0.0; absent in pre-schema reports
  file: string;
  timestamp: string;
  model?: string;               // Claude model used for analysis
  sourceRepo?: string;          // Source repo name (basename of path)
  targetRepo?: string;          // Target repo name (basename of path)
  sourceMetadata: FileGitMetadata | null;
  targetMetadata: FileGitMetadata | null;
  timeline: FileTimeline | null;
  triageResult: TriageResult;
  suggestions: BackportSuggestion[];
  sectionPairs?: SectionPair[];  // Included for detail/debugging
}

/**
 * Summary report across multiple files (bulk mode)
 */
export interface BulkBackwardReport {
  schemaVersion?: string;        // Added in v1.0.0
  timestamp: string;
  model?: string;               // Claude model used for analysis
  sourceRepo: string;
  targetRepo: string;
  language: string;
  filesAnalyzed: number;
  filesInSync: number;
  filesFlagged: number;
  filesSkipped: number;
  totalSuggestions: number;
  highConfidence: number;     // confidence >= 0.85
  mediumConfidence: number;   // confidence 0.6-0.85
  lowConfidence: number;      // confidence < 0.6
  fileReports: BackwardReport[];
}

// ============================================================================
// CLI CONFIGURATION
// ============================================================================

/**
 * Common CLI options shared across commands
 */
export interface CommonOptions {
  source: string;            // Source repository path
  target: string;            // Target repository path
  docsFolder: string;        // Documentation folder (default: "lectures")
  language: string;          // Target language code (default: "zh-cn")
  output: string;            // Output directory for reports (default: "./reports")
  model: string;             // Claude model (default: "claude-sonnet-4-6")
  json: boolean;             // Output as JSON
  test: boolean;             // Use deterministic mock responses (no LLM calls)
}

/**
 * Backward command options
 */
export interface BackwardOptions extends CommonOptions {
  file?: string;             // Single file mode
  minConfidence: number;     // Minimum confidence for reporting (default: 0.6)
  estimate: boolean;         // Show cost estimate without running
}

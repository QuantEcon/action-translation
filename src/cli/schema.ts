/**
 * Formal JSON schema definitions for backward report files.
 *
 * This module is the single source of truth for the backward report format.
 * The TypeScript interfaces in types.ts remain for backward compatibility,
 * but new consumers (e.g. the `review` command) should validate through
 * the Zod schemas exported here.
 *
 * Schema version history:
 *   1.0.0 — Initial formalization (Phase 3a). Matches the output format
 *           produced by `backward` since Phase 2.
 */

import { z } from 'zod';

// ============================================================================
// VERSION
// ============================================================================

/**
 * Current schema version.  Follows semver:
 *   MAJOR — breaking changes (fields removed/renamed, semantics changed)
 *   MINOR — additive changes (new optional fields)
 *   PATCH — documentation-only or cosmetic changes
 */
export const SCHEMA_VERSION = '1.0.0';

// ============================================================================
// TRIAGE (Stage 1)
// ============================================================================

export const TriageVerdictSchema = z.enum([
  'CHANGES_DETECTED',
  'IN_SYNC',
  'SKIPPED_TOO_LARGE',
]);

export const TriageResultSchema = z.object({
  file: z.string(),
  verdict: TriageVerdictSchema,
  notes: z.string(),
  tokenCount: z.number().int().nonnegative().optional(),
});

// ============================================================================
// SECTION-LEVEL ANALYSIS (Stage 2)
// ============================================================================

export const SectionSyncStatusSchema = z.enum([
  'SOURCE_ONLY',
  'TARGET_ONLY',
  'MATCHED',
]);

export const BackportCategorySchema = z.enum([
  'BUG_FIX',
  'CLARIFICATION',
  'EXAMPLE',
  'CODE_IMPROVEMENT',
  'I18N_ONLY',
  'NO_CHANGE',
]);

export const SpecificChangeSchema = z.object({
  type: z.string(),
  original: z.string(),
  improved: z.string(),
});

export const BackportSuggestionSchema = z.object({
  sectionHeading: z.string(),
  recommendation: z.enum(['BACKPORT', 'NO_BACKPORT']),
  category: BackportCategorySchema,
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  specificChanges: z.array(SpecificChangeSchema),
  reasoning: z.string(),
});

// ============================================================================
// GIT METADATA
// ============================================================================

export const FileGitMetadataSchema = z.object({
  lastModified: z.string(),   // ISO 8601 date string (serialized from Date)
  lastCommit: z.string(),
  lastAuthor: z.string(),
});

export const TimelineEntrySchema = z.object({
  date: z.string(),           // "YYYY-MM-DD"
  fullDate: z.string(),       // "YYYY-MM-DD HH:MM:SS +ZZZZ"
  repo: z.enum(['SOURCE', 'TARGET']),
  sha: z.string(),
  message: z.string(),
});

export const FileTimelineSchema = z.object({
  entries: z.array(TimelineEntrySchema),
  sourceCommitCount: z.number().int().nonnegative(),
  targetCommitCount: z.number().int().nonnegative(),
  estimatedSyncDate: z.string().nullable(),
  sourceCommitsAfterSync: z.number().int().nonnegative(),
});

// ============================================================================
// SECTION (embedded in sectionPairs)
// ============================================================================

// Section snapshots in sectionPairs can nest. Define the type manually
// to avoid circular inference, then build the recursive Zod schema.
export interface SectionSnapshot {
  heading: string;
  level: number;
  id: string;
  content: string;
  startLine: number;
  endLine: number;
  subsections?: SectionSnapshot[];
}

export const SectionSnapshotSchema: z.ZodType<SectionSnapshot> = z.object({
  heading: z.string(),
  level: z.number().int().min(1).max(6),
  id: z.string(),
  content: z.string(),
  startLine: z.number().int().nonnegative(),
  endLine: z.number().int().nonnegative(),
  subsections: z.lazy(() => z.array(SectionSnapshotSchema)).optional().default([]),
});

export const SectionPairSchema = z.object({
  sourceSection: SectionSnapshotSchema.nullable(),
  targetSection: SectionSnapshotSchema.nullable(),
  status: SectionSyncStatusSchema,
  sourceHeading: z.string().optional(),
  targetHeading: z.string().optional(),
});

// ============================================================================
// BACKWARD REPORT (per-file sidecar)
// ============================================================================

export const BackwardReportSchema = z.object({
  schemaVersion: z.string().optional(),  // Added in v1.0.0; absent in pre-schema reports
  file: z.string(),
  timestamp: z.string(),
  model: z.string().optional(),
  sourceRepo: z.string().optional(),
  targetRepo: z.string().optional(),
  sourceMetadata: FileGitMetadataSchema.nullable(),
  targetMetadata: FileGitMetadataSchema.nullable(),
  timeline: FileTimelineSchema.nullable(),
  triageResult: TriageResultSchema,
  suggestions: z.array(BackportSuggestionSchema),
  sectionPairs: z.array(SectionPairSchema).optional(),
});

// ============================================================================
// BULK REPORT (aggregate)
// ============================================================================

export const BulkBackwardReportSchema = z.object({
  schemaVersion: z.string().optional(),
  timestamp: z.string(),
  model: z.string().optional(),
  sourceRepo: z.string(),
  targetRepo: z.string(),
  language: z.string(),
  filesAnalyzed: z.number().int().nonnegative(),
  filesInSync: z.number().int().nonnegative(),
  filesFlagged: z.number().int().nonnegative(),
  filesSkipped: z.number().int().nonnegative(),
  totalSuggestions: z.number().int().nonnegative(),
  highConfidence: z.number().int().nonnegative(),
  mediumConfidence: z.number().int().nonnegative(),
  lowConfidence: z.number().int().nonnegative(),
  fileReports: z.array(BackwardReportSchema),
});

// ============================================================================
// PROGRESS CHECKPOINT
// ============================================================================

export const ProgressErrorSchema = z.object({
  file: z.string(),
  error: z.string(),
});

export const ProgressCheckpointSchema = z.object({
  schemaVersion: z.string().optional(),
  startedAt: z.string(),
  lastUpdated: z.string(),
  totalFiles: z.number().int().nonnegative(),
  completedFiles: z.array(z.string()),
  erroredFiles: z.array(ProgressErrorSchema).optional().default([]),
});

// ============================================================================
// INFERRED TYPES (derive from Zod — canonical)
// ============================================================================

export type BackwardReportData = z.infer<typeof BackwardReportSchema>;
export type BulkBackwardReportData = z.infer<typeof BulkBackwardReportSchema>;
export type ProgressCheckpointData = z.infer<typeof ProgressCheckpointSchema>;
export type BackportSuggestionData = z.infer<typeof BackportSuggestionSchema>;
export type SpecificChangeData = z.infer<typeof SpecificChangeSchema>;
export type TriageResultData = z.infer<typeof TriageResultSchema>;

// ============================================================================
// LOADER / VALIDATOR
// ============================================================================

export type LoadResult<T> = {
  success: true;
  data: T;
} | {
  success: false;
  error: string;
};

/**
 * Parse and validate a JSON string as a BackwardReport.
 * Accepts both pre-schema reports (no schemaVersion) and v1.0.0+.
 */
export function parseBackwardReport(json: string): LoadResult<BackwardReportData> {
  try {
    const raw = JSON.parse(json);
    const result = BackwardReportSchema.safeParse(raw);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return {
      success: false,
      error: `Validation failed: ${result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    };
  } catch (e) {
    return { success: false, error: `Invalid JSON: ${(e as Error).message}` };
  }
}

/**
 * Parse and validate a JSON string as a ProgressCheckpoint.
 */
export function parseProgressCheckpoint(json: string): LoadResult<ProgressCheckpointData> {
  try {
    const raw = JSON.parse(json);
    const result = ProgressCheckpointSchema.safeParse(raw);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return {
      success: false,
      error: `Validation failed: ${result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    };
  } catch (e) {
    return { success: false, error: `Invalid JSON: ${(e as Error).message}` };
  }
}

/**
 * Load all per-file sidecar reports from a .resync directory.
 * Skips _progress.json, _log.txt, and any non-JSON files.
 * Returns validated reports and a list of load errors.
 */
export function loadResyncDirectory(resyncDir: string): {
  reports: BackwardReportData[];
  errors: Array<{ file: string; error: string }>;
} {
  // Dynamic import at call site — this module stays pure for testing
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require('path');

  const reports: BackwardReportData[] = [];
  const errors: Array<{ file: string; error: string }> = [];

  if (!fs.existsSync(resyncDir)) {
    return { reports, errors: [{ file: resyncDir, error: 'Directory not found' }] };
  }

  const files: string[] = fs.readdirSync(resyncDir);
  for (const file of files) {
    // Skip meta-files and non-JSON
    if (file.startsWith('_') || !file.endsWith('.json')) continue;

    const fullPath = path.join(resyncDir, file);
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const result = parseBackwardReport(content);
      if (result.success) {
        reports.push(result.data);
      } else {
        errors.push({ file, error: result.error });
      }
    } catch (e) {
      errors.push({ file, error: (e as Error).message });
    }
  }

  return { reports, errors };
}

/**
 * Filter suggestions that meet a minimum confidence threshold.
 * Returns only BACKPORT suggestions.
 */
export function filterActionableSuggestions(
  report: BackwardReportData,
  minConfidence: number = 0.6,
): BackportSuggestionData[] {
  return report.suggestions.filter(
    s => s.recommendation === 'BACKPORT' && s.confidence >= minConfidence,
  );
}

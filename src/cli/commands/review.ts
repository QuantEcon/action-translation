/**
 * Review Command — Step 1: Command scaffold + report loading
 *
 * Loads backward analysis reports from a `.resync/` directory,
 * filters to actionable BACKPORT suggestions, and flattens them
 * into a single sorted list for the interactive review session.
 *
 * Architecture:
 * - Step 1 (this file): scaffold + loading pipeline
 * - Step 2: `--dry-run` chalk formatter
 * - Step 3: Issue body generator
 * - Step 4: Ink interactive mode
 * - Step 5: `gh` Issue creation
 */

import * as path from 'path';
import { loadResyncDirectory, filterActionableSuggestions, BackwardReportData, BackportSuggestionData } from '../schema.js';
import { formatSuggestionCard, formatSessionSummary } from '../review-formatter.js';
import { formatIssuePreview } from '../issue-generator.js';
import { createIssuesForAccepted } from '../issue-creator.js';
import type { SessionSummary } from '../review-session.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * A suggestion enriched with its source file context.
 * This is the unit of work in the review session.
 */
export interface SuggestionWithContext {
  /** Relative filename from the backward report (e.g. "ar1_processes.md") */
  file: string;
  /** ISO 8601 timestamp of when the backward analysis was run */
  timestamp: string;
  /** Source repo basename (e.g. "lecture-python-intro") */
  sourceRepo?: string;
  /** Target repo basename (e.g. "lecture-chinese-zh-cn") */
  targetRepo?: string;
  /** The validated suggestion data */
  suggestion: BackportSuggestionData;
}

/** Summary statistics from a load operation */
export interface LoadStats {
  /** Number of per-file report JSON files successfully loaded */
  filesLoaded: number;
  /** Number of files with at least one actionable suggestion */
  filesWithSuggestions: number;
  /** Total BACKPORT suggestions meeting the confidence threshold */
  totalSuggestions: number;
}

/** Result of loading and flattening a report directory */
export interface FlattenResult {
  suggestions: SuggestionWithContext[];
  errors: Array<{ file: string; error: string }>;
  stats: LoadStats;
}

/** Options for the `review` command */
export interface ReviewOptions {
  /** Path to the backward report directory (must contain a `.resync/` subfolder) */
  reportDir: string;
  /** SOURCE repository for GitHub Issue creation, e.g. "QuantEcon/lecture-python-intro" */
  repo?: string;
  /** Preview Issues without creating them */
  dryRun: boolean;
  /** Minimum suggestion confidence to include (0–1, default 0.6) */
  minConfidence: number;
}

// ============================================================================
// LOADING PIPELINE
// ============================================================================

/**
 * Load all backward reports from `reportDir/.resync/`, filter to actionable
 * BACKPORT suggestions, and return a flat list sorted by confidence descending.
 *
 * This is the core data pipeline for the review session — all downstream
 * steps (formatter, Issue creation, interactive UI) consume this output.
 *
 * @param reportDir   Path to the backward report directory (parent of `.resync/`)
 * @param minConfidence  Minimum confidence threshold (default 0.6)
 */
export function loadAndFlattenSuggestions(
  reportDir: string,
  minConfidence: number = 0.6,
): FlattenResult {
  const resyncDir = path.join(reportDir, '.resync');
  const { reports, errors } = loadResyncDirectory(resyncDir);

  const suggestions: SuggestionWithContext[] = [];
  let filesWithSuggestions = 0;

  for (const report of reports) {
    const actionable = filterActionableSuggestions(report, minConfidence);
    if (actionable.length > 0) {
      filesWithSuggestions++;
      for (const suggestion of actionable) {
        suggestions.push({
          file: report.file,
          timestamp: report.timestamp,
          sourceRepo: report.sourceRepo,
          targetRepo: report.targetRepo,
          suggestion,
        });
      }
    }
  }

  // Sort by confidence descending — highest-quality suggestions first
  suggestions.sort((a, b) => b.suggestion.confidence - a.suggestion.confidence);

  return {
    suggestions,
    errors,
    stats: {
      filesLoaded: reports.length,
      filesWithSuggestions,
      totalSuggestions: suggestions.length,
    },
  };
}

/**
 * Build a summary line for display (used in Step 1 output and Step 2 header).
 */
export function formatLoadSummary(stats: LoadStats, reportDir: string): string {
  const { filesLoaded, filesWithSuggestions, totalSuggestions } = stats;
  if (totalSuggestions === 0) {
    return `Loaded ${filesLoaded} report(s) from ${reportDir} — no actionable suggestions found.`;
  }
  return (
    `Loaded ${filesLoaded} report(s) from ${reportDir}\n` +
    `Found ${totalSuggestions} actionable suggestion(s) across ${filesWithSuggestions} file(s)`
  );
}

// ============================================================================
// COMMAND RUNNER
// ============================================================================

/**
 * Entry point for the `review` command.
 *
 * Step 1 behaviour: load reports, print summary.
 * Formatter (Step 2) and interactive mode (Step 4) will be layered on top.
 */
export async function runReview(options: ReviewOptions): Promise<void> {
  const { reportDir, minConfidence } = options;

  const { suggestions, errors, stats } = loadAndFlattenSuggestions(reportDir, minConfidence);

  // Surface load errors as warnings
  if (errors.length > 0) {
    for (const err of errors) {
      console.warn(`⚠️  Could not load ${err.file}: ${err.error}`);
    }
  }

  console.log('\n' + formatLoadSummary(stats, reportDir));

  if (suggestions.length === 0) {
    console.log('\n✅ Nothing to review.');
    return;
  }

  if (options.dryRun) {
    // Steps 2 + 3: chalk suggestion card + Issue preview for every suggestion
    const parts: string[] = [];
    for (let i = 0; i < suggestions.length; i++) {
      parts.push(formatSuggestionCard(suggestions[i], i + 1, suggestions.length));
      parts.push(formatIssuePreview(suggestions[i]));
    }
    parts.push(formatSessionSummary(suggestions));
    process.stdout.write(parts.join(''));
  } else {
    // Step 4: ink interactive mode — [A]ccept / [S]kip / [R]eject per suggestion
    // Dynamic imports keep ink/React out of the CJS Jest environment (ink is ESM-only)
    const [{ default: React }, { render }, { ReviewSession }] = await Promise.all([
      import('react'),
      import('ink'),
      import('../components/ReviewSession.js'),
    ]);

    let sessionSummary: SessionSummary | null = null;

    const { waitUntilExit } = render(
      React.createElement(ReviewSession, {
        suggestions,
        onDone: (summary: SessionSummary) => {
          sessionSummary = summary;
        },
      }),
    );

    await waitUntilExit();

    // Step 5: create GitHub Issues for accepted suggestions (wired below)
    if (sessionSummary !== null && options.repo) {
      await createIssuesForAccepted((sessionSummary as SessionSummary).accepted, options.repo);
    }
  }
}

// End of review command

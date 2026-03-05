/**
 * Backward Command
 * 
 * Orchestrates the two-stage backward analysis pipeline:
 * 
 * Stage 1: Document-level triage (single LLM call per file)
 *   - Determines if a file has substantive changes beyond translation
 *   - IN_SYNC files are skipped (cheap filter)
 *   
 * Stage 2: Whole-file analysis (one LLM call per flagged file)
 *   - Matches sections by position with heading-map validation
 *   - Evaluates all section pairs in a single LLM call
 *   - Produces structured per-section suggestions with category/confidence
 * 
 * Supports two modes:
 * - Single-file: `npx resync backward -f file.md`
 * - Bulk: `npx resync backward` (all files in docs folder)
 *   - Writes reports to a timestamped folder
 *   - Incremental checkpointing via .resync/_progress.json
 *   - Supports --resume to continue interrupted runs
 */

import * as fs from 'fs';
import * as path from 'path';
import cliProgress from 'cli-progress';
import { MystParser } from '../../parser.js';
import { extractHeadingMap } from '../../heading-map.js';
import { matchSections, getMatchingSummary, validateMatchesWithHeadingMap } from '../section-matcher.js';
import { triageDocument } from '../document-comparator.js';
import { evaluateFile } from '../backward-evaluator.js';
import { getFileGitMetadata, getFileTimeline } from '../git-metadata.js';
import { generateMarkdownReport, generateJsonReport, generateBulkMarkdownReport, generateBulkJsonReport } from '../report-generator.js';
import { BackwardReport, BackwardOptions, BackportSuggestion, BulkBackwardReport } from '../types.js';
import { SCHEMA_VERSION } from '../schema.js';
import { discoverMarkdownFiles, resolveFilePairs, applyExcludes } from './status.js';

/**
 * Logger interface for backward command output
 */
export interface BackwardLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

const defaultLogger: BackwardLogger = {
  info: (msg) => console.log(msg),
  warn: (msg) => console.warn(`⚠️  ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
};

/**
 * A logger that buffers all output, then flushes it in one block.
 * Used for parallel processing so file outputs don't interleave.
 */
export class BufferedLogger implements BackwardLogger {
  private buffer: string[] = [];

  info(message: string): void {
    this.buffer.push(message);
  }
  warn(message: string): void {
    this.buffer.push(`⚠️  ${message}`);
  }
  error(message: string): void {
    this.buffer.push(`❌ ${message}`);
  }

  /** Flush all buffered output to a parent logger (for console). */
  flush(parent: BackwardLogger): void {
    for (const line of this.buffer) {
      parent.info(line);
    }
    this.buffer = [];
  }

  /** Append all buffered output to a log file. */
  flushToFile(logPath: string): void {
    if (this.buffer.length === 0) return;
    fs.appendFileSync(logPath, this.buffer.join('\n') + '\n', 'utf-8');
    this.buffer = [];
  }
}

/**
 * Execute backward analysis for a single file
 * 
 * @param options - Backward command options
 * @param logger - Logger for console output
 * @returns BackwardReport
 */
export async function runBackwardSingleFile(
  options: BackwardOptions & { apiKey: string },
  logger: BackwardLogger = defaultLogger,
): Promise<BackwardReport> {
  const { file, source, target, docsFolder, language, model, test: testMode } = options;
  
  if (!file) {
    throw new Error('Single-file mode requires --file (-f) option');
  }

  // Resolve file paths
  const sourceFilePath = resolveFilePath(source, docsFolder, file);
  const targetFilePath = resolveFilePath(target, docsFolder, file);

  logger.info(`Analyzing: ${file}`);
  logger.info(`  SOURCE: ${sourceFilePath}`);
  logger.info(`  TARGET: ${targetFilePath}`);

  // Read files
  if (!fs.existsSync(sourceFilePath)) {
    throw new Error(`SOURCE file not found: ${sourceFilePath}`);
  }
  if (!fs.existsSync(targetFilePath)) {
    throw new Error(`TARGET file not found: ${targetFilePath}`);
  }

  const sourceContent = fs.readFileSync(sourceFilePath, 'utf-8');
  const targetContent = fs.readFileSync(targetFilePath, 'utf-8');

  // Get git metadata
  logger.info('  Getting git metadata...');
  const sourceMetadata = await getFileGitMetadata(source, path.join(docsFolder, file));
  const targetMetadata = await getFileGitMetadata(target, path.join(docsFolder, file));

  if (sourceMetadata) {
    logger.info(`  SOURCE last modified: ${sourceMetadata.lastModified.toISOString().split('T')[0]}`);
  }
  if (targetMetadata) {
    logger.info(`  TARGET last modified: ${targetMetadata.lastModified.toISOString().split('T')[0]}`);
  }

  // Get interleaved commit timeline
  logger.info('  Building commit timeline...');
  const timeline = await getFileTimeline(source, target, path.join(docsFolder, file));
  if (timeline) {
    logger.info(`  Timeline: ${timeline.sourceCommitCount} source + ${timeline.targetCommitCount} target commits`);
    if (timeline.estimatedSyncDate) {
      logger.info(`  Estimated sync point: ${timeline.estimatedSyncDate}`);
      if (timeline.sourceCommitsAfterSync > 0) {
        logger.info(`  SOURCE has ${timeline.sourceCommitsAfterSync} commit(s) after sync point`);
      }
    }
  }

  // ─── Stage 1: Document-Level Triage ───
  logger.info('');
  logger.info('  Stage 1: Document-level triage...');
  
  const triageResult = await triageDocument(
    file,
    sourceContent,
    targetContent,
    sourceMetadata,
    targetMetadata,
    timeline,
    {
      apiKey: options.apiKey,
      model,
      sourceLanguage: 'en',
      targetLanguage: language,
      testMode,
    },
  );

  logger.info(`  Stage 1 verdict: ${triageResult.verdict}`);
  if (triageResult.notes) {
    logger.info(`  Notes: ${triageResult.notes}`);
  }

  // If IN_SYNC, we're done
  if (triageResult.verdict === 'IN_SYNC') {
    logger.info('  ✓ File is in sync. No suggestions.');
    
    const report: BackwardReport = {
      schemaVersion: SCHEMA_VERSION,
      file,
      timestamp: new Date().toISOString(),
      model,
      sourceRepo: path.basename(source),
      targetRepo: path.basename(target),
      sourceMetadata,
      targetMetadata,
      timeline,
      triageResult,
      suggestions: [],
    };

    await writeReport(report, options, logger);
    return report;
  }

  // ─── Stage 2: Whole-File Analysis ───
  logger.info('');
  logger.info('  Stage 2: Section-level analysis...');

  const parser = new MystParser();
  const sourceParsed = await parser.parseSections(sourceContent, sourceFilePath);
  const targetParsed = await parser.parseSections(targetContent, targetFilePath);

  // Extract heading-map from target for validation
  const headingMap = extractHeadingMap(targetContent);
  if (headingMap.size > 0) {
    logger.info(`  Heading-map: ${headingMap.size} entries`);
  } else {
    logger.warn('  No heading-map found in TARGET. Using position-only matching.');
  }

  // Match sections
  const pairs = matchSections(
    sourceParsed.sections,
    targetParsed.sections,
    headingMap.size > 0 ? headingMap : undefined,
  );

  const summary = getMatchingSummary(pairs);
  logger.info(`  Sections: ${summary.matched} matched, ${summary.sourceOnly} source-only, ${summary.targetOnly} target-only`);

  // Validate matches against heading-map if available
  if (headingMap.size > 0) {
    const warnings = validateMatchesWithHeadingMap(pairs, headingMap);
    for (const warning of warnings) {
      logger.warn(`Heading-map mismatch: ${warning}`);
    }
  }

  // Evaluate all matched sections in a single LLM call
  logger.info(`  Evaluating ${summary.matched} sections (1 LLM call)...`);

  const suggestions = await evaluateFile(
    pairs,
    sourceMetadata,
    targetMetadata,
    triageResult.notes,
    timeline,
    {
      apiKey: options.apiKey,
      model,
      sourceLanguage: 'en',
      targetLanguage: language,
      testMode,
    },
  );

  for (const suggestion of suggestions) {
    if (suggestion.recommendation === 'BACKPORT') {
      logger.info(`    → BACKPORT: ${suggestion.sectionHeading} (${suggestion.category}, confidence: ${suggestion.confidence.toFixed(2)})`);
    }
  }

  // Filter suggestions by min-confidence
  const minConfidence = options.minConfidence ?? 0;
  const filteredSuggestions = suggestions.map(s => {
    // Downgrade to NO_BACKPORT if below confidence threshold
    if (s.recommendation === 'BACKPORT' && s.confidence < minConfidence) {
      return { ...s, recommendation: 'NO_BACKPORT' as const };
    }
    return s;
  });

  // Build report
  const backportCount = filteredSuggestions.filter(s => s.recommendation === 'BACKPORT').length;
  logger.info('');
  logger.info(`  Done: ${backportCount} suggestion(s) from ${filteredSuggestions.length} sections analyzed.`);

  const report: BackwardReport = {
    schemaVersion: SCHEMA_VERSION,
    file,
    timestamp: new Date().toISOString(),
    model,
    sourceRepo: path.basename(source),
    targetRepo: path.basename(target),
    sourceMetadata,
    targetMetadata,
    timeline,
    triageResult,
    suggestions: filteredSuggestions,
    sectionPairs: pairs,
  };

  await writeReport(report, options, logger);
  return report;
}

/**
 * Resolve a file path within a repo's docs folder
 */
function resolveFilePath(repoPath: string, docsFolder: string, filename: string): string {
  return path.join(repoPath, docsFolder, filename);
}

/**
 * Write report to output path.
 *
 * In single-file mode, if `options.output` ends with `.md` or `.json` it is
 * treated as a **file path** (the user chose the exact name).  Otherwise it is
 * treated as a **directory** and a filename is generated from the source file.
 */
async function writeReport(
  report: BackwardReport,
  options: BackwardOptions,
  logger: BackwardLogger,
): Promise<void> {
  const output = options.output;
  const basename = path.basename(report.file, '.md');

  // Detect whether the user specified a file path or a directory.
  const looksLikeFile = /\.(md|json)$/i.test(output);
  const isSingleFile = !!options.file;

  if (isSingleFile && looksLikeFile) {
    // Single-file mode with an explicit file path
    const dir = path.dirname(output);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const content = output.endsWith('.json')
      ? generateJsonReport(report)
      : generateMarkdownReport(report);
    fs.writeFileSync(output, content, 'utf-8');
    logger.info(`  Report written: ${output}`);

    // Always write a JSON sidecar for resume reliability (in .resync/ subfolder)
    if (!output.endsWith('.json')) {
      const resyncDir = path.join(path.dirname(output), '.resync');
      if (!fs.existsSync(resyncDir)) fs.mkdirSync(resyncDir, { recursive: true });
      const jsonSidecar = path.join(resyncDir, path.basename(output).replace(/\.md$/i, '.json'));
      fs.writeFileSync(jsonSidecar, generateJsonReport(report), 'utf-8');
    }
  } else {
    // Directory mode (bulk, or single-file without extension)
    if (!fs.existsSync(output)) {
      fs.mkdirSync(output, { recursive: true });
    }

    if (options.json) {
      const jsonPath = path.join(output, `${basename}.json`);
      fs.writeFileSync(jsonPath, generateJsonReport(report), 'utf-8');
      logger.info(`  Report written: ${jsonPath}`);
    } else {
      const mdPath = path.join(output, `${basename}.md`);
      fs.writeFileSync(mdPath, generateMarkdownReport(report), 'utf-8');
      logger.info(`  Report written: ${mdPath}`);

      // Always write a JSON sidecar for resume reliability (in .resync/ subfolder)
      const resyncDir = path.join(output, '.resync');
      if (!fs.existsSync(resyncDir)) fs.mkdirSync(resyncDir, { recursive: true });
      const jsonSidecar = path.join(resyncDir, `${basename}.json`);
      fs.writeFileSync(jsonSidecar, generateJsonReport(report), 'utf-8');
    }
  }
}

// ============================================================================
// BULK BACKWARD — File discovery, checkpointing, orchestration
// ============================================================================

/**
 * Progress manifest for incremental checkpointing.
 * Written to .resync/_progress.json in the output folder after each file completes.
 */
export interface BulkProgress {
  startedAt: string;
  lastUpdated: string;
  totalFiles: number;
  completedFiles: string[];
  /** Files that errored (still counted as "done" for resume purposes) */
  erroredFiles: { file: string; error: string }[];
}

/**
 * Read existing progress from .resync/_progress.json, or return null if not found.
 */
export function readProgress(outputDir: string): BulkProgress | null {
  const progressPath = path.join(outputDir, '.resync', '_progress.json');
  if (!fs.existsSync(progressPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Write progress to .resync/_progress.json.
 */
export function writeProgress(outputDir: string, progress: BulkProgress): void {
  const resyncDir = path.join(outputDir, '.resync');
  if (!fs.existsSync(resyncDir)) fs.mkdirSync(resyncDir, { recursive: true });
  const progressPath = path.join(resyncDir, '_progress.json');
  fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2), 'utf-8');
}

/**
 * Build a date-stamped output folder name scoped to the source repo:
 *   reports/lecture-python-intro/backward-2026-03-03/
 *
 * Grouping by sourceName means multiple repos never collide and all
 * historical runs for a repo are discoverable under one subfolder.
 * Re-running on the same day for the same repo overwrites that day's run.
 */
export function buildBulkOutputDir(baseOutput: string, sourceName: string): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // "2026-03-03"
  return path.join(baseOutput, sourceName, `backward-${dateStr}`);
}

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

export function estimateBulkCost(fileCount: number, avgSectionsPerFile: number = 8): CostEstimate {
  // Stage 1: ~$0.01 per file (single triage call)
  const stage1Calls = fileCount;
  const stage1Cost = stage1Calls * 0.01;

  // Estimate ~5-10% of files will be flagged
  const flagRate = 0.075; // 7.5% middle estimate
  const estimatedFlagged = Math.max(1, Math.round(fileCount * flagRate));

  // Stage 2: 1 call per flagged file (whole-file evaluation)
  const estimatedStage2Calls = estimatedFlagged;
  const stage2Cost = estimatedStage2Calls * 0.03; // ~$0.03 per file (larger prompt)

  // Time: ~3s per Stage 1 call + ~8s per Stage 2 call (larger response)
  const estimatedTimeSeconds = (stage1Calls * 3) + (estimatedStage2Calls * 8);

  return {
    totalFiles: fileCount,
    stage1Calls,
    estimatedFlaggedFiles: estimatedFlagged,
    estimatedStage2Calls,
    estimatedCostUsd: Math.round((stage1Cost + stage2Cost) * 100) / 100,
    estimatedTimeMinutes: Math.round(estimatedTimeSeconds / 60 * 10) / 10,
  };
}

/**
 * Format a cost estimate for console display.
 */
export function formatCostEstimate(estimate: CostEstimate): string {
  const lines: string[] = [];
  lines.push('Cost Estimate:');
  lines.push(`  Files to analyze:       ${estimate.totalFiles}`);
  lines.push(`  Stage 1 triage calls:   ${estimate.stage1Calls}`);
  lines.push(`  Est. flagged files:     ~${estimate.estimatedFlaggedFiles} (~7.5%)`);
  lines.push(`  Est. Stage 2 calls:     ~${estimate.estimatedStage2Calls} (1 per flagged file)`);
  lines.push(`  Est. API cost:          ~$${estimate.estimatedCostUsd.toFixed(2)}`);
  lines.push(`  Est. time:              ~${estimate.estimatedTimeMinutes} min`);
  return lines.join('\n');
}

/**
 * Discover files to analyze in bulk mode.
 * Uses both SOURCE and TARGET file lists, applies exclusions.
 */
export function discoverBulkFiles(
  sourceRepoPath: string,
  targetRepoPath: string,
  docsFolder: string,
  exclude: string[],
): string[] {
  const sourceFiles = discoverMarkdownFiles(sourceRepoPath, docsFolder);
  const targetFiles = discoverMarkdownFiles(targetRepoPath, docsFolder);
  let allFiles = resolveFilePairs(sourceFiles, targetFiles);
  allFiles = applyExcludes(allFiles, exclude);
  return allFiles;
}

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
export async function runBackwardBulk(
  options: BackwardOptions & { apiKey: string },
  logger: BackwardLogger = defaultLogger,
  exclude: string[] = [],
  resume: boolean = false,
): Promise<BulkBackwardReport> {
  const { source, target, docsFolder, language } = options;

  // Build output directory — scoped to source repo name
  const sourceName = path.basename(source);
  const outputDir = resume
    ? resolveResumeDir(options.output, sourceName)
    : buildBulkOutputDir(options.output, sourceName);

  // Fresh start: wipe the folder if not resuming
  if (!resume && fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Discover files
  const allFiles = discoverBulkFiles(source, target, docsFolder, exclude);
  logger.info(`Found ${allFiles.length} files to analyze.`);

  if (allFiles.length === 0) {
    logger.warn('No files found. Check --source, --target, and --docs-folder paths.');
    return buildEmptyBulkReport(source, target, language, options.model);
  }

  // Cost estimate
  if (options.estimate) {
    const estimate = estimateBulkCost(allFiles.length);
    logger.info('');
    logger.info(formatCostEstimate(estimate));
    return buildEmptyBulkReport(source, target, language, options.model);
  }

  // Check for resume
  let progress: BulkProgress;
  const existingProgress = resume ? readProgress(outputDir) : null;
  if (existingProgress) {
    const doneSet = new Set([
      ...existingProgress.completedFiles,
      ...existingProgress.erroredFiles.map(e => e.file),
    ]);
    const remaining = allFiles.filter(f => !doneSet.has(f));
    logger.info(`Resuming: ${existingProgress.completedFiles.length} already done, ${remaining.length} remaining.`);
    progress = existingProgress;
  } else {
    progress = {
      startedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalFiles: allFiles.length,
      completedFiles: [],
      erroredFiles: [],
    };
  }

  const doneSet = new Set([
    ...progress.completedFiles,
    ...progress.erroredFiles.map(e => e.file),
  ]);

  // Process files with concurrency
  const fileReports: BackwardReport[] = [];
  const CONCURRENCY = 5;

  // Load any already-written reports for the aggregate (always from JSON sidecar)
  for (const doneFile of progress.completedFiles) {
    const jsonPath = resolveReportPath(outputDir, doneFile, true);
    if (fs.existsSync(jsonPath)) {
      try {
        const report = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as BackwardReport;
        fileReports.push(report);
      } catch {
        // Skip corrupted reports
      }
    }
  }

  const filesToProcess = allFiles.filter(f => !doneSet.has(f));

  /**
   * Process a single file in the bulk pipeline.
   * Uses a BufferedLogger so parallel output doesn't interleave.
   * Returns { file, report? } so the caller can track progress.
   */
  async function processOneFile(
    file: string,
    logPath: string,
  ): Promise<{ file: string; report?: BackwardReport; error?: string }> {
    const globalIdx = allFiles.indexOf(file) + 1;
    const buffered = new BufferedLogger();
    buffered.info(`\n[${globalIdx}/${allFiles.length}] ${file}`);

    try {
      const fileOptions: BackwardOptions & { apiKey: string } = {
        ...options,
        file,
        output: outputDir,
      };

      const report = await runBackwardSingleFile(fileOptions, buffered);

      // Always write a JSON sidecar for resume reliability (in .resync/ subfolder)
      if (!options.json) {
        const jsonSidecarPath = resolveReportPath(outputDir, file, true);
        const resyncDir = path.dirname(jsonSidecarPath);
        if (!fs.existsSync(resyncDir)) fs.mkdirSync(resyncDir, { recursive: true });
        fs.writeFileSync(jsonSidecarPath, generateJsonReport(report), 'utf-8');
      }

      // Write detailed output to log file
      buffered.flushToFile(logPath);
      return { file, report };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      buffered.error(`  Failed: ${errorMsg}`);
      buffered.flushToFile(logPath);
      return { file, error: errorMsg };
    }
  }

  // Set up log file for detailed output
  const resyncDir = path.join(outputDir, '.resync');
  if (!fs.existsSync(resyncDir)) fs.mkdirSync(resyncDir, { recursive: true });
  const logPath = path.join(resyncDir, '_log.txt');
  fs.writeFileSync(logPath, `Backward analysis started: ${new Date().toISOString()}\n`, 'utf-8');

  // Track running stats for progress bar
  let completedCount = progress.completedFiles.length;
  let inSyncCount = 0;
  let suggestionsCount = 0;
  let errorsCount = progress.erroredFiles.length;

  // Set up progress bar (only for interactive TTY, skip in tests/piped output)
  const isTTY = process.stderr.isTTY && logger === defaultLogger;
  const bar = isTTY
    ? new cliProgress.SingleBar({
        format: '  {bar} {value}/{total} | ✓ {inSync} sync  📝 {suggestions} suggestions  ❌ {errors} errors | {currentFile}',
        barCompleteChar: '█',
        barIncompleteChar: '░',
        hideCursor: true,
        clearOnComplete: true,
        stream: process.stderr,
      })
    : null;

  logger.info(`Backward analysis: ${filesToProcess.length} files (${CONCURRENCY} parallel)`);
  bar?.start(allFiles.length, completedCount, {
    inSync: inSyncCount,
    suggestions: suggestionsCount,
    errors: errorsCount,
    currentFile: filesToProcess[0] || '',
  });

  // Process in batches of CONCURRENCY
  for (let i = 0; i < filesToProcess.length; i += CONCURRENCY) {
    const batch = filesToProcess.slice(i, i + CONCURRENCY);

    // Show first file in batch as current
    bar?.update({ currentFile: batch[0] });

    const results = await Promise.all(batch.map(f => processOneFile(f, logPath)));

    for (const result of results) {
      completedCount++;
      if (result.report) {
        fileReports.push(result.report);
        progress.completedFiles.push(result.file);

        // Update stats
        if (result.report.triageResult.verdict === 'IN_SYNC') {
          inSyncCount++;
        }
        const backports = result.report.suggestions.filter(s => s.recommendation === 'BACKPORT').length;
        suggestionsCount += backports;
      } else if (result.error) {
        progress.erroredFiles.push({ file: result.file, error: result.error });
        errorsCount++;
      }

      bar?.update(completedCount, {
        inSync: inSyncCount,
        suggestions: suggestionsCount,
        errors: errorsCount,
        currentFile: result.file,
      });
    }

    // Update progress checkpoint after each batch
    progress.lastUpdated = new Date().toISOString();
    writeProgress(outputDir, progress);
  }

  bar?.stop();

  // Build aggregate report
  const bulkReport = buildBulkReport(source, target, language, fileReports, options.model);

  // Write aggregate summary
  if (options.json) {
    const summaryPath = path.join(outputDir, '_summary.json');
    fs.writeFileSync(summaryPath, generateBulkJsonReport(bulkReport), 'utf-8');
    logger.info(`\nAggregate report: ${summaryPath}`);
  } else {
    const summaryPath = path.join(outputDir, '_summary.md');
    fs.writeFileSync(summaryPath, generateBulkMarkdownReport(bulkReport), 'utf-8');
    logger.info(`\nAggregate report: ${summaryPath}`);
  }

  // Print console summary
  const s = bulkReport;
  logger.info('');
  logger.info(`Done: ${s.filesAnalyzed} files analyzed.`);
  logger.info(`  In sync: ${s.filesInSync}`);
  logger.info(`  Suggestions: ${s.totalSuggestions} across ${s.filesFlagged} file(s)`);
  if (s.filesSkipped > 0) {
    logger.info(`  Skipped (too large): ${s.filesSkipped}`);
  }
  if (progress.erroredFiles.length > 0) {
    logger.info(`  Errors: ${progress.erroredFiles.length}`);
  }
  logger.info(`\nReports: ${outputDir}`);
  logger.info(`Log: ${logPath}`);

  return bulkReport;
}

/**
 * Build a BulkBackwardReport from individual file reports.
 */
export function buildBulkReport(
  sourceRepo: string,
  targetRepo: string,
  language: string,
  fileReports: BackwardReport[],
  model?: string,
): BulkBackwardReport {
  const allSuggestions = fileReports.flatMap(r =>
    r.suggestions.filter(s => s.recommendation === 'BACKPORT'),
  );

  return {
    schemaVersion: SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
    model,
    sourceRepo,
    targetRepo,
    language,
    filesAnalyzed: fileReports.length,
    filesInSync: fileReports.filter(r => r.triageResult.verdict === 'IN_SYNC').length,
    filesFlagged: fileReports.filter(r =>
      r.suggestions.some(s => s.recommendation === 'BACKPORT'),
    ).length,
    filesSkipped: fileReports.filter(r => r.triageResult.verdict === 'SKIPPED_TOO_LARGE').length,
    totalSuggestions: allSuggestions.length,
    highConfidence: allSuggestions.filter(s => s.confidence >= 0.85).length,
    mediumConfidence: allSuggestions.filter(s => s.confidence >= 0.6 && s.confidence < 0.85).length,
    lowConfidence: allSuggestions.filter(s => s.confidence < 0.6).length,
    fileReports,
  };
}

function buildEmptyBulkReport(
  sourceRepo: string,
  targetRepo: string,
  language: string,
  model?: string,
): BulkBackwardReport {
  return buildBulkReport(sourceRepo, targetRepo, language, [], model);
}

function resolveReportPath(outputDir: string, file: string, json: boolean): string {
  const basename = path.basename(file, '.md');
  const ext = json ? '.json' : '.md';
  // JSON sidecars live in .resync/ subfolder; markdown reports stay in outputDir
  const dir = json ? path.join(outputDir, '.resync') : outputDir;
  return path.join(dir, `${basename}${ext}`);
}

/**
 * Find the correct output directory for --resume.
 * 
 * Checks (in order):
 * 1. If options.output itself contains .resync/_progress.json → use it directly
 * 2. If options.output contains backward-* subdirs → use most recent with .resync/_progress.json
 * 3. Otherwise → error (nothing to resume from)
 */
function resolveResumeDir(outputPath: string, sourceName: string): string {
  // Case 1: Direct path to a run directory (user pointed --output at the backward-DATE folder)
  if (fs.existsSync(path.join(outputPath, '.resync', '_progress.json'))) {
    return outputPath;
  }

  // Case 2: Repo-scoped subfolder (e.g., ./reports/lecture-python-intro) — find most recent run
  const repoScopedPath = path.join(outputPath, sourceName);
  const searchPath = fs.existsSync(repoScopedPath) ? repoScopedPath : outputPath;

  if (fs.existsSync(searchPath)) {
    const candidates = fs.readdirSync(searchPath)
      .filter(d => d.startsWith('backward-'))
      .filter(d => fs.existsSync(path.join(searchPath, d, '.resync', '_progress.json')))
      .sort()
      .reverse(); // Most recent first (lexicographic sort on timestamps)

    if (candidates.length > 0) {
      return path.join(searchPath, candidates[0]);
    }
  }

  throw new Error(
    `No resumable run found in ${outputPath}. ` +
    'Run without --resume first, or point --output to a specific backward-* folder.',
  );
}

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

import * as fs from 'fs';
import * as path from 'path';
import { MystParser } from '../../parser';
import { extractHeadingMap } from '../../heading-map';
import { matchSections, getMatchingSummary, validateMatchesWithHeadingMap } from '../section-matcher';
import { triageDocument } from '../document-comparator';
import { evaluateSection } from '../backward-evaluator';
import { getFileGitMetadata, getFileTimeline } from '../git-metadata';
import { generateMarkdownReport, generateJsonReport } from '../report-generator';
import { BackwardReport, BackwardOptions, BackportSuggestion } from '../types';

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
      file,
      timestamp: new Date().toISOString(),
      sourceMetadata,
      targetMetadata,
      timeline,
      triageResult,
      suggestions: [],
    };

    await writeReport(report, options, logger);
    return report;
  }

  // ─── Stage 2: Section-Level Analysis ───
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

  // Evaluate each matched section pair
  const suggestions: BackportSuggestion[] = [];

  for (const pair of pairs) {
    if (pair.status !== 'MATCHED' || !pair.sourceSection || !pair.targetSection) {
      continue; // Skip unmatched sections (reported separately)
    }

    const heading = pair.sourceHeading || 'Unknown Section';
    logger.info(`  Evaluating: ${heading}`);

    const suggestion = await evaluateSection(
      pair.sourceSection.content,
      pair.targetSection.content,
      heading,
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

    suggestions.push(suggestion);

    if (suggestion.recommendation === 'BACKPORT') {
      logger.info(`    → BACKPORT (${suggestion.category}, confidence: ${suggestion.confidence.toFixed(2)})`);
    } else {
      logger.info(`    → No backport (${suggestion.category})`);
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
  logger.info(`  Done: ${backportCount} suggestion(s) from ${filteredSuggestions.length} sections analyzed.`);

  const report: BackwardReport = {
    file,
    timestamp: new Date().toISOString(),
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
 * Write report to output directory
 */
async function writeReport(
  report: BackwardReport,
  options: BackwardOptions,
  logger: BackwardLogger,
): Promise<void> {
  const outputDir = options.output;
  
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const basename = path.basename(report.file, '.md');

  if (options.json) {
    const jsonPath = path.join(outputDir, `${basename}-backward.json`);
    fs.writeFileSync(jsonPath, generateJsonReport(report), 'utf-8');
    logger.info(`  Report written: ${jsonPath}`);
  } else {
    const mdPath = path.join(outputDir, `${basename}-backward.md`);
    fs.writeFileSync(mdPath, generateMarkdownReport(report), 'utf-8');
    logger.info(`  Report written: ${mdPath}`);
  }
}

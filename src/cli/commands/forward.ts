/**
 * Forward Command — Resync TARGET to match current SOURCE
 *
 * Pipeline per file:
 * 1. Forward triage (LLM) — content changes or i18n only?
 * 2. Parse + match sections via heading-map
 * 3. RESYNC translate changed sections
 * 4. Reconstruct TARGET document
 * 5. Output: write to disk or create PR (--github)
 *
 * Supports:
 * - Single file: `npx resync forward -f cobweb.md`
 * - Bulk: `npx resync forward` (all OUTDATED files via status)
 * - GitHub: `--github owner/repo` (one PR per file in TARGET repo)
 */

import * as fs from 'fs';
import * as path from 'path';
import cliProgress from 'cli-progress';
import { MystParser } from '../../parser.js';
import {
  extractHeadingMap,
  updateHeadingMap,
  injectHeadingMap,
} from '../../heading-map.js';
import { TranslationService } from '../../translator.js';
import { Glossary, Section } from '../../types.js';
import { matchSections, getMatchingSummary } from '../section-matcher.js';
import { triageForward } from '../forward-triage.js';
import {
  ForwardOptions,
  ForwardFileResult,
  ForwardTriageResult,
  ResyncSectionResult,
  ResyncSectionAction,
} from '../types.js';
import {
  runStatus,
  discoverMarkdownFiles,
  resolveFilePairs,
  applyExcludes,
  StatusOptions,
} from './status.js';
import {
  createForwardPR,
  ForwardPRResult,
  GhRunner,
  realGhRunner,
} from '../forward-pr-creator.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ForwardLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

const defaultLogger: ForwardLogger = {
  info: (msg) => console.log(msg),
  warn: (msg) => console.warn(`⚠️  ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
};

// ============================================================================
// COST ESTIMATION
// ============================================================================

/**
 * Estimate cost for forward resync.
 * Triage: ~$0.01/file, RESYNC: ~$0.05/section
 */
function estimateCost(fileCount: number, avgSectionsPerFile: number = 8): {
  triageCost: number;
  resyncCost: number;
  totalCost: number;
} {
  const triageCost = fileCount * 0.01;
  // Assume ~60% of files pass triage, ~40% of sections need resync
  const resyncFiles = Math.ceil(fileCount * 0.6);
  const resyncSections = resyncFiles * Math.ceil(avgSectionsPerFile * 0.4);
  const resyncCost = resyncSections * 0.05;
  const totalCost = triageCost + resyncCost;
  return { triageCost, resyncCost, totalCost };
}

// ============================================================================
// SINGLE FILE RESYNC
// ============================================================================

/**
 * Resync a single file: triage → parse → match → RESYNC → reconstruct.
 *
 * Exported for direct testing.
 */
export async function resyncSingleFile(
  file: string,
  sourceRepoPath: string,
  targetRepoPath: string,
  docsFolder: string,
  options: ForwardOptions,
  logger: ForwardLogger = defaultLogger,
  ghRunner?: GhRunner,
): Promise<ForwardFileResult> {
  const sourceFilePath = path.join(sourceRepoPath, docsFolder, file);
  const targetFilePath = path.join(targetRepoPath, docsFolder, file);

  // Verify both files exist
  if (!fs.existsSync(sourceFilePath)) {
    throw new Error(`Source file not found: ${sourceFilePath}`);
  }
  if (!fs.existsSync(targetFilePath)) {
    throw new Error(`Target file not found: ${targetFilePath} (use 'new' translation for missing targets)`);
  }

  const sourceContent = fs.readFileSync(sourceFilePath, 'utf-8');
  const targetContent = fs.readFileSync(targetFilePath, 'utf-8');

  // ──── Step 1: Forward triage ─────────────────────────────────────────────
  logger.info(`  Triaging ${file}…`);

  const triageResult = await triageForward(
    file,
    sourceContent,
    targetContent,
    {
      apiKey: options.apiKey,
      model: options.model,
      sourceLanguage: 'English',
      targetLanguage: options.language,
      testMode: options.test,
    },
  );

  if (triageResult.verdict !== 'CONTENT_CHANGES') {
    const label = triageResult.verdict === 'IDENTICAL' ? 'identical' : 'i18n only';
    logger.info(`  SKIPPED — ${label}${triageResult.reason ? ` (${triageResult.reason})` : ''}`);
    return {
      file,
      triageResult,
      sections: [],
      summary: { resynced: 0, unchanged: 0, new: 0, removed: 0, errors: 0 },
    };
  }

  logger.info(`  Content changes detected — resyncing…`);

  // ──── Step 2: Parse both documents ───────────────────────────────────────
  const parser = new MystParser();
  const sourceParsed = await parser.parseDocumentComponents(sourceContent, sourceFilePath);
  const targetParsed = await parser.parseDocumentComponents(targetContent, targetFilePath);

  // ──── Step 3: Match sections by position ─────────────────────────────────
  const headingMap = extractHeadingMap(targetContent);
  const pairs = matchSections(sourceParsed.sections, targetParsed.sections, headingMap);
  const matchSummary = getMatchingSummary(pairs);

  logger.info(`  Sections: ${matchSummary.matched} matched, ${matchSummary.sourceOnly} new, ${matchSummary.targetOnly} removed`);

  // ──── Step 4: RESYNC translate each section ──────────────────────────────
  const translator = options.test ? null : new TranslationService(options.apiKey, options.model, false);
  const glossary = loadGlossary(options.language);

  const sectionResults: ResyncSectionResult[] = [];
  const translatedSections: (Section | null)[] = [];

  for (const pair of pairs) {
    if (pair.status === 'SOURCE_ONLY') {
      // New section: translate fresh
      const heading = pair.sourceSection!.heading;
      logger.info(`    + NEW: ${heading}`);

      if (options.test) {
        // Test mode: mock translation — use source content as-is
        sectionResults.push({
          sectionHeading: heading,
          action: 'NEW',
          translatedContent: `[TEST TRANSLATION] ${pair.sourceSection!.content}`,
        });
        translatedSections.push({
          ...pair.sourceSection!,
          content: `[TEST TRANSLATION] ${pair.sourceSection!.content}`,
        });
        continue;
      }

      const result = await translator!.translateSection({
        mode: 'new',
        sourceLanguage: 'English',
        targetLanguage: options.language,
        glossary,
        englishSection: pair.sourceSection!.content,
      });

      if (result.success && result.translatedSection) {
        sectionResults.push({
          sectionHeading: heading,
          action: 'NEW',
          translatedContent: result.translatedSection,
          tokensUsed: result.tokensUsed,
        });
        // Create a synthetic section from the translated content
        translatedSections.push({
          ...pair.sourceSection!,
          content: result.translatedSection,
        });
      } else {
        sectionResults.push({ sectionHeading: heading, action: 'ERROR', error: result.error });
        translatedSections.push(null);
      }
      continue;
    }

    if (pair.status === 'TARGET_ONLY') {
      // Section removed from SOURCE — mark for removal
      const heading = pair.targetSection!.heading;
      logger.info(`    - REMOVED: ${heading}`);
      sectionResults.push({ sectionHeading: heading, action: 'REMOVED' });
      translatedSections.push(null); // Will be excluded from reconstruction
      continue;
    }

    // MATCHED — RESYNC if content differs meaningfully
    const sourceSection = pair.sourceSection!;
    const targetSection = pair.targetSection!;
    const heading = sourceSection.heading;

    // Quick content comparison (strip whitespace for fuzzy check)
    const sourceNorm = sourceSection.content.replace(/\s+/g, ' ').trim();
    const targetNorm = targetSection.content.replace(/\s+/g, ' ').trim();

    if (sourceNorm === targetNorm) {
      // Content is essentially identical (same language — shouldn't happen often
      // for cross-language pairs, but handle gracefully)
      sectionResults.push({ sectionHeading: heading, action: 'UNCHANGED' });
      translatedSections.push(targetSection);
      continue;
    }

    // RESYNC this section
    logger.info(`    ↻ RESYNC: ${heading}`);

    if (options.test) {
      // Test mode: mock resync — keep target content with marker
      const mockContent = `[TEST RESYNC] ${targetSection.content}`;
      sectionResults.push({
        sectionHeading: heading,
        action: 'RESYNCED',
        translatedContent: mockContent,
      });
      translatedSections.push({ ...targetSection, content: mockContent });
      continue;
    }

    const result = await translator!.translateSection({
      mode: 'resync',
      sourceLanguage: 'English',
      targetLanguage: options.language,
      glossary,
      newEnglish: sourceSection.content,
      currentTranslation: targetSection.content,
    });

    if (result.success && result.translatedSection) {
      sectionResults.push({
        sectionHeading: heading,
        action: 'RESYNCED',
        translatedContent: result.translatedSection,
        tokensUsed: result.tokensUsed,
      });
      translatedSections.push({
        ...targetSection,
        content: result.translatedSection,
      });
    } else {
      logger.warn(`Failed to resync section "${heading}": ${result.error}`);
      sectionResults.push({ sectionHeading: heading, action: 'ERROR', error: result.error });
      translatedSections.push(targetSection); // Keep existing on error
    }
  }

  // ──── Step 5: Reconstruct TARGET document ────────────────────────────────
  const outputContent = reconstructDocument(
    sourceParsed,
    targetParsed,
    pairs,
    translatedSections,
    headingMap,
    targetContent,
  );

  // ──── Step 6: Output ─────────────────────────────────────────────────────
  let prUrl: string | undefined;

  if (outputContent) {
    if (options.github) {
      // Create PR in TARGET repo
      const runner = ghRunner ?? realGhRunner;
      const prResult = createForwardPR(
        file,
        outputContent,
        sectionResults,
        options.github,
        runner,
      );
      if (prResult.success) {
        prUrl = prResult.url;
        logger.info(`  ✅ PR created: ${prUrl}`);
      } else {
        logger.error(`Failed to create PR for ${file}: ${prResult.error}`);
      }
    } else {
      // Write to local disk
      fs.writeFileSync(targetFilePath, outputContent, 'utf-8');
      logger.info(`  ✅ Written to ${targetFilePath}`);
    }
  }

  // Build summary counts
  const summary = {
    resynced: sectionResults.filter(r => r.action === 'RESYNCED').length,
    unchanged: sectionResults.filter(r => r.action === 'UNCHANGED').length,
    new: sectionResults.filter(r => r.action === 'NEW').length,
    removed: sectionResults.filter(r => r.action === 'REMOVED').length,
    errors: sectionResults.filter(r => r.action === 'ERROR').length,
  };

  return { file, triageResult, sections: sectionResults, outputContent, prUrl, summary };
}

// ============================================================================
// DOCUMENT RECONSTRUCTION
// ============================================================================

/**
 * Reconstruct the TARGET document from resynced sections.
 *
 * Layout: CONFIG (frontmatter) + PREAMBLE (title + intro) + SECTIONS
 * Heading-map is updated to reflect new section headings.
 */
function reconstructDocument(
  sourceParsed: { config: string; title: string; titleText: string; intro: string; sections: Section[] },
  targetParsed: { config: string; title: string; titleText: string; intro: string; sections: Section[] },
  pairs: { status: string; sourceSection: Section | null; targetSection: Section | null }[],
  translatedSections: (Section | null)[],
  existingHeadingMap: Map<string, string>,
  originalTargetContent: string,
): string {
  const parts: string[] = [];

  // CONFIG: keep target's frontmatter (will be updated with heading-map later)
  // We'll inject heading-map at the end

  // PREAMBLE: keep target's title and intro
  parts.push(targetParsed.title);
  if (targetParsed.intro) {
    parts.push('');
    parts.push(targetParsed.intro);
  }

  // SECTIONS: use translated sections, skip REMOVED
  const sectionParts: string[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    const translated = translatedSections[i];

    if (pair.status === 'TARGET_ONLY') {
      // Removed from source — skip
      continue;
    }

    if (translated) {
      sectionParts.push(translated.content);
    } else if (pair.targetSection) {
      // Fallback to existing target section
      sectionParts.push(pair.targetSection.content);
    }
  }

  if (sectionParts.length > 0) {
    parts.push('');
    parts.push(sectionParts.join('\n\n'));
  }

  // Combine body
  let body = parts.join('\n');

  // Update heading-map
  const activeSections = pairs
    .filter(p => p.status !== 'TARGET_ONLY')
    .map((p, i) => translatedSections[i] ?? p.targetSection)
    .filter((s): s is Section => s !== null);

  const newHeadingMap = updateHeadingMap(
    existingHeadingMap,
    sourceParsed.sections,
    activeSections,
    sourceParsed.titleText,
  );

  // Inject heading-map into frontmatter
  const fullContent = `${targetParsed.config}\n${body}`;
  return injectHeadingMap(fullContent, newHeadingMap);
}

// ============================================================================
// BULK FORWARD RESYNC
// ============================================================================

/**
 * Run forward resync on all OUTDATED files.
 */
export async function runForwardBulk(
  options: ForwardOptions,
  logger: ForwardLogger = defaultLogger,
  exclude: string[] = [],
  ghRunner?: GhRunner,
): Promise<ForwardFileResult[]> {
  const { source, target, docsFolder, language } = options;

  // Discover OUTDATED files via status command
  logger.info('Discovering outdated files…\n');

  const statusResult = await runStatus({
    source,
    target,
    docsFolder,
    language,
    exclude,
  });

  // Filter to files that need resync (OUTDATED or SOURCE_AHEAD)
  const candidates = statusResult.entries
    .filter(e => e.status === 'OUTDATED' || e.status === 'SOURCE_AHEAD')
    .map(e => e.file);

  if (candidates.length === 0) {
    logger.info('All files are in sync — nothing to resync.');
    return [];
  }

  logger.info(`Found ${candidates.length} file(s) to resync:\n`);
  for (const f of candidates) {
    logger.info(`  • ${f}`);
  }
  logger.info('');

  // Cost estimate
  if (options.estimate) {
    const est = estimateCost(candidates.length);
    logger.info(`Estimated cost:`);
    logger.info(`  Triage:  ~$${est.triageCost.toFixed(2)} (${candidates.length} files × $0.01)`);
    logger.info(`  RESYNC:  ~$${est.resyncCost.toFixed(2)} (est. sections)`);
    logger.info(`  Total:   ~$${est.totalCost.toFixed(2)}`);
    return [];
  }

  // Process each file
  const results: ForwardFileResult[] = [];
  const bar = new cliProgress.SingleBar(
    { format: '  {bar} {percentage}% | {value}/{total} files | {filename}' },
    cliProgress.Presets.shades_classic,
  );
  bar.start(candidates.length, 0, { filename: '' });

  for (const file of candidates) {
    bar.update(results.length, { filename: file });

    try {
      const result = await resyncSingleFile(
        file,
        source,
        target,
        docsFolder,
        options,
        logger,
        ghRunner,
      );
      results.push(result);
    } catch (error) {
      logger.error(`Failed to resync ${file}: ${error instanceof Error ? error.message : String(error)}`);
      results.push({
        file,
        triageResult: { file, verdict: 'CONTENT_CHANGES', reason: 'Error during processing' },
        sections: [],
        summary: { resynced: 0, unchanged: 0, new: 0, removed: 0, errors: 1 },
      });
    }
  }

  bar.update(candidates.length, { filename: 'done' });
  bar.stop();
  console.log('');

  // Print summary
  printBulkSummary(results, logger);

  return results;
}

// ============================================================================
// SUMMARY
// ============================================================================

function printBulkSummary(results: ForwardFileResult[], logger: ForwardLogger): void {
  const skipped = results.filter(r => r.triageResult.verdict !== 'CONTENT_CHANGES');
  const processed = results.filter(r => r.triageResult.verdict === 'CONTENT_CHANGES');

  let totalResynced = 0;
  let totalNew = 0;
  let totalRemoved = 0;
  let totalUnchanged = 0;
  let totalErrors = 0;

  for (const r of processed) {
    totalResynced += r.summary.resynced;
    totalNew += r.summary.new;
    totalRemoved += r.summary.removed;
    totalUnchanged += r.summary.unchanged;
    totalErrors += r.summary.errors;
  }

  logger.info('─── Forward Resync Summary ───────────────────────────');
  logger.info(`  Files processed: ${processed.length}`);
  logger.info(`  Files skipped:   ${skipped.length}`);

  if (skipped.length > 0) {
    for (const r of skipped) {
      const label = r.triageResult.verdict === 'IDENTICAL' ? 'identical' : 'i18n only';
      const reason = r.triageResult.reason ? ` — ${r.triageResult.reason}` : '';
      logger.info(`    ${r.file}: ${label}${reason}`);
    }
  }

  logger.info('');
  logger.info(`  Sections resynced:  ${totalResynced}`);
  logger.info(`  Sections new:       ${totalNew}`);
  logger.info(`  Sections removed:   ${totalRemoved}`);
  logger.info(`  Sections unchanged: ${totalUnchanged}`);
  if (totalErrors > 0) {
    logger.info(`  Sections errored:   ${totalErrors}`);
  }
  logger.info('─────────────────────────────────────────────────────');
}

// ============================================================================
// GLOSSARY LOADER
// ============================================================================

function loadGlossary(language: string): Glossary | undefined {
  // Try to find glossary file relative to CWD
  const candidates = [
    path.join(process.cwd(), 'glossary', `${language}.json`),
    path.join(process.cwd(), `glossary-${language}.json`),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const raw = fs.readFileSync(candidate, 'utf-8');
        return JSON.parse(raw) as Glossary;
      } catch {
        // Ignore parse errors
      }
    }
  }

  return undefined;
}

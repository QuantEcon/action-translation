/**
 * Forward Command — Resync TARGET to match current SOURCE
 *
 * Pipeline per file:
 * 1. Forward triage (LLM) — content changes or i18n only?
 * 2. Whole-file RESYNC translate (LLM) — entire document in one pass
 * 3. Output: write to disk or create PR (--github)
 *
 * Uses whole-file RESYNC (decided after experiment — see
 * experiments/forward/whole-file-vs-section-by-section/REPORT.md).
 * Benefits over section-by-section:
 * - Preserves cross-section context (localized plot labels, font config)
 * - 2-3× cheaper (glossary sent once, not per section)
 * - Fewer diff lines (more surgical updates)
 *
 * Supports:
 * - Single file: `npx resync forward -f cobweb.md`
 * - Bulk: `npx resync forward` (all OUTDATED files via status)
 * - GitHub: `--github owner/repo` (one PR per file in TARGET repo)
 */

import * as fs from 'fs';
import * as path from 'path';
import cliProgress from 'cli-progress';
import { TranslationService } from '../../translator.js';
import { Glossary } from '../../types.js';
import { triageForward } from '../forward-triage.js';
import {
  ForwardOptions,
  ForwardFileResult,
} from '../types.js';
import {
  runStatus,
  StatusOptions,
} from './status.js';
import {
  createForwardPR,
  gitPrepareAndPush,
  detectSourceRepo,
  ForwardPRResult,
  GhRunner,
  GitRunner,
  realGhRunner,
  realGitRunner,
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
 * Estimate cost for forward resync (whole-file approach).
 * Triage: ~$0.01/file, Whole-file RESYNC: ~$0.12/file
 */
function estimateCost(fileCount: number): {
  triageCost: number;
  resyncCost: number;
  totalCost: number;
} {
  const triageCost = fileCount * 0.01;
  // Assume ~60% of files pass triage, whole-file RESYNC ~$0.12 each
  const resyncFiles = Math.ceil(fileCount * 0.6);
  const resyncCost = resyncFiles * 0.12;
  const totalCost = triageCost + resyncCost;
  return { triageCost, resyncCost, totalCost };
}

// ============================================================================
// SINGLE FILE RESYNC
// ============================================================================

/**
 * Resync a single file: triage → whole-file RESYNC → output.
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
  gitRunner?: GitRunner,
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

  logger.info(`  Content changes detected — resyncing (whole-file)…`);

  // ──── Step 2: Whole-file RESYNC ──────────────────────────────────────────
  const glossary = loadGlossary(options.language);
  let outputContent: string | undefined;
  let tokensUsed: number | undefined;

  if (options.test) {
    // Test mode: mock resync — prefix target content with marker
    outputContent = `[TEST RESYNC]\n${targetContent}`;
    logger.info(`  ✅ Test mode — mock resync applied`);
  } else {
    const translator = new TranslationService(options.apiKey, options.model, false);
    const result = await translator.translateDocumentResync({
      sourceLanguage: 'English',
      targetLanguage: options.language,
      glossary,
      sourceContent,
      targetContent,
    });

    if (result.success && result.translatedSection) {
      outputContent = result.translatedSection;
      tokensUsed = result.tokensUsed;
      logger.info(`  ✅ Resync complete (${tokensUsed?.toLocaleString()} tokens)`);
    } else {
      logger.error(`  Failed to resync ${file}: ${result.error}`);
      return {
        file,
        triageResult,
        sections: [],
        summary: { resynced: 0, unchanged: 0, new: 0, removed: 0, errors: 1 },
      };
    }
  }

  // ──── Step 3: Output ─────────────────────────────────────────────────────
  let prUrl: string | undefined;

  if (outputContent) {
    if (options.github) {
      // Git: create branch, write file, commit, push
      const gRunner = gitRunner ?? realGitRunner;
      const gitResult = gitPrepareAndPush(file, outputContent, targetRepoPath, docsFolder, gRunner);
      if (!gitResult.success) {
        logger.error(`  Git failed for ${file}: ${gitResult.error}`);
        return {
          file,
          triageResult,
          sections: [],
          outputContent,
          tokensUsed,
          summary: { resynced: 0, unchanged: 0, new: 0, removed: 0, errors: 1 },
        };
      }
      logger.info(`  Branch ${gitResult.branchName} pushed to origin`);

      // Detect source repo's GitHub identity for the PR body
      const sourceGitHub = detectSourceRepo(sourceRepoPath, gRunner);

      // Create PR in TARGET repo via gh CLI
      const runner = ghRunner ?? realGhRunner;
      const prResult = createForwardPR(
        file,
        outputContent,
        [],  // No per-section results in whole-file mode
        options.github,
        runner,
        sourceGitHub,
        docsFolder,
        triageResult.reason,
      );
      if (prResult.success) {
        prUrl = prResult.url;
        logger.info(`  ✅ PR created: ${prUrl}`);
      } else {
        logger.error(`  Failed to create PR for ${file}: ${prResult.error}`);
      }
    } else {
      // Write to local disk
      fs.writeFileSync(targetFilePath, outputContent, 'utf-8');
      logger.info(`  ✅ Written to ${targetFilePath}`);
    }
  }

  return {
    file,
    triageResult,
    sections: [],  // Whole-file mode — no per-section tracking
    outputContent,
    prUrl,
    tokensUsed,
    summary: { resynced: 1, unchanged: 0, new: 0, removed: 0, errors: 0 },
  };
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
  gitRunner?: GitRunner,
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
    logger.info(`  RESYNC:  ~$${est.resyncCost.toFixed(2)} (est. ~${Math.ceil(candidates.length * 0.6)} files × $0.12)`);
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
        gitRunner,
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
  let totalErrors = 0;
  let totalTokens = 0;

  for (const r of processed) {
    totalResynced += r.summary.resynced;
    totalErrors += r.summary.errors;
    if (r.tokensUsed) totalTokens += r.tokensUsed;
  }

  logger.info('─── Forward Resync Summary ───────────────────────────');
  logger.info(`  Files processed: ${processed.length}`);
  logger.info(`  Files resynced:  ${totalResynced}`);
  logger.info(`  Files skipped:   ${skipped.length}`);

  if (skipped.length > 0) {
    for (const r of skipped) {
      const label = r.triageResult.verdict === 'IDENTICAL' ? 'identical' : 'i18n only';
      const reason = r.triageResult.reason ? ` — ${r.triageResult.reason}` : '';
      logger.info(`    ${r.file}: ${label}${reason}`);
    }
  }

  if (totalErrors > 0) {
    logger.info(`  Files errored:   ${totalErrors}`);
  }
  if (totalTokens > 0) {
    logger.info(`  Total tokens:    ${totalTokens.toLocaleString()}`);
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

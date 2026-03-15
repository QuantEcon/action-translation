#!/usr/bin/env node
/**
 * Translate CLI — Entry Point
 * 
 * Commands:
 * - init:          Bulk-translate a new project (Phase 5)
 * - backward:      Two-stage analysis → suggestion reports
 * - forward:       Translate SOURCE changes to TARGET
 * - status:        Show sync status overview
 * - review:        Interactive review of backward suggestions
 */

import { Command } from 'commander';
import { runBackwardSingleFile, runBackwardBulk } from './commands/backward.js';
import { runStatus, formatStatusTable, formatStatusJson, StatusOptions } from './commands/status.js';
import { runReview, ReviewOptions } from './commands/review.js';
import { resyncSingleFile, runForwardBulk } from './commands/forward.js';
import { runInit, InitOptions } from './commands/init.js';
import { BackwardOptions, ForwardOptions } from './types.js';
import { DEFAULT_RULES, parseLocalizationRules } from '../localization-rules.js';
import { checkGhAvailable } from './issue-creator.js';

// Read version from package.json — use createRequire since JSON imports
// need import assertions which aren't stable in all Node versions.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

const program = new Command();

program
  .name('translate')
  .description('Translate and sync documentation between source and target repositories')
  .version(version);

/**
 * Validate --min-confidence value: must be a number in [0, 1].
 */
function validateMinConfidence(raw: string): number {
  const value = parseFloat(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    console.error(`❌ --min-confidence must be a number between 0 and 1 (got "${raw}")`);
    process.exit(1);
  }
  return value;
}

/**
 * Parse --exclude into an array. Supports comma-separated and repeated flags.
 */
function collectExclude(value: string, previous: string[]): string[] {
  return previous.concat(value.split(',').map(s => s.trim()).filter(Boolean));
}

// ─── backward command ───────────────────────────────────────────────────────

program
  .command('backward')
  .description('Analyze target translation for improvements worth backporting to source')
  .requiredOption('-s, --source <path>', 'Path to SOURCE (English) repository')
  .requiredOption('-t, --target <path>', 'Path to TARGET (translated) repository')
  .option('-f, --file <filename>', 'Analyze a single file (relative to docs-folder)')
  .option('-d, --docs-folder <folder>', 'Documentation folder within repos', 'lectures')
  .option('-l, --language <code>', 'Target language code', 'zh-cn')
  .option('-o, --output <path>', 'Output directory (or .md/.json file path for single-file mode)', './reports')
  .option('-m, --model <model>', 'Claude model to use', 'claude-sonnet-4-6')
  .option('--json', 'Output reports as JSON', false)
  .option('--test', 'Use deterministic mock responses (no LLM calls)', false)
  .option('--min-confidence <number>', 'Minimum confidence for reporting', '0.6')
  .option('--exclude <pattern>', 'Exclude files matching pattern (repeatable, comma-separated)', collectExclude, [])
  .option('--resume', 'Resume a previous bulk run from checkpoint', false)
  .action(async (opts) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey && !opts.test) {
      console.error('❌ ANTHROPIC_API_KEY environment variable is required (or use --test)');
      process.exit(1);
    }

    const options: BackwardOptions & { apiKey: string } = {
      source: opts.source,
      target: opts.target,
      file: opts.file,
      docsFolder: opts.docsFolder,
      language: opts.language,
      output: opts.output,
      model: opts.model,
      json: opts.json,
      test: opts.test,
      minConfidence: validateMinConfidence(opts.minConfidence),
      apiKey: apiKey || 'test-key',
    };

    if (opts.file) {
      // Single file mode
      try {
        const report = await runBackwardSingleFile(options);
        const backportCount = report.suggestions.filter(s => s.recommendation === 'BACKPORT').length;
        
        if (backportCount > 0) {
          const outputLabel = /\.(md|json)$/i.test(opts.output) ? opts.output : `${opts.output}/`;
          console.log(`\n✅ Found ${backportCount} suggestion(s). Report written to ${outputLabel}`);
        } else {
          console.log('\n✅ No backport suggestions found.');
        }
      } catch (error) {
        console.error(`\n❌ ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    } else {
      // Bulk mode
      try {
        await runBackwardBulk(options, undefined, opts.exclude, opts.resume);
      } catch (error) {
        console.error(`\n❌ ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    }
  });

// ─── status command ─────────────────────────────────────────────────────────

program
  .command('status')
  .description('Show sync status overview (no LLM calls)')
  .requiredOption('-s, --source <path>', 'Path to SOURCE (English) repository')
  .requiredOption('-t, --target <path>', 'Path to TARGET (translated) repository')
  .option('-f, --file <filename>', 'Check a single file (relative to docs-folder)')
  .option('-d, --docs-folder <folder>', 'Documentation folder within repos', 'lectures')
  .option('-l, --language <code>', 'Target language code', 'zh-cn')
  .option('--exclude <pattern>', 'Exclude files matching pattern (repeatable, comma-separated)', collectExclude, [])
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    const statusOptions: StatusOptions = {
      source: opts.source,
      target: opts.target,
      file: opts.file,
      docsFolder: opts.docsFolder,
      language: opts.language,
      exclude: opts.exclude,
    };

    try {
      const result = await runStatus(statusOptions);

      if (opts.json) {
        console.log(formatStatusJson(result));
      } else {
        console.log(formatStatusTable(result));
      }
    } catch (error) {
      console.error(`\n❌ ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

// ─── review command ─────────────────────────────────────────────────────────

program
  .command('review')
  .description('Interactively review backward suggestions and create GitHub Issues')
  .argument('<report-dir>', 'Path to the backward report directory (must contain a .resync/ subfolder)')
  .option('--repo <owner/repo>', 'SOURCE repository for Issue creation (e.g. QuantEcon/lecture-python-intro)')
  .option('--dry-run', 'Preview Issues without creating them', false)
  .option('--min-confidence <number>', 'Minimum confidence threshold for suggestions', '0.6')
  .action(async (reportDir: string, opts) => {
    const options: ReviewOptions = {
      reportDir,
      repo: opts.repo,
      dryRun: opts.dryRun,
      minConfidence: validateMinConfidence(opts.minConfidence),
    };
    try {
      await runReview(options);
    } catch (error) {
      console.error(`\n❌ ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

// ─── forward command ────────────────────────────────────────────────────────

program
  .command('forward')
  .description('Resync TARGET translations to match current SOURCE (forward resync)')
  .requiredOption('-s, --source <path>', 'Path to SOURCE (English) repository')
  .requiredOption('-t, --target <path>', 'Path to TARGET (translated) repository')
  .option('-f, --file <filename>', 'Resync a single file (relative to docs-folder)')
  .option('-d, --docs-folder <folder>', 'Documentation folder within repos', 'lectures')
  .option('-l, --language <code>', 'Target language code', 'zh-cn')
  .option('-m, --model <model>', 'Claude model to use', 'claude-sonnet-4-6')
  .option('--test', 'Use deterministic mock responses (no LLM calls)', false)
  .option('--github <owner/repo>', 'Create one PR per file in TARGET repo')
  .option('--exclude <pattern>', 'Exclude files matching pattern (repeatable, comma-separated)', collectExclude, [])
  .action(async (opts) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey && !opts.test) {
      console.error('❌ ANTHROPIC_API_KEY environment variable is required (or use --test)');
      process.exit(1);
    }

    const options: ForwardOptions = {
      source: opts.source,
      target: opts.target,
      file: opts.file,
      docsFolder: opts.docsFolder,
      language: opts.language,
      model: opts.model,
      test: opts.test,
      github: opts.github,
      apiKey: apiKey || 'test-key',
    };

    try {
      // Pre-flight: check `gh` CLI before doing any work
      if (opts.github) {
        checkGhAvailable();
      }
      if (opts.file) {
        // Single file mode
        const result = await resyncSingleFile(
          opts.file,
          opts.source,
          opts.target,
          opts.docsFolder,
          options,
        );

        const { summary } = result;
        if (result.triageResult.verdict !== 'CONTENT_CHANGES') {
          const label = result.triageResult.verdict === 'IDENTICAL' ? 'identical' : 'i18n only';
          console.log(`\n  ${opts.file}: SKIPPED (${label})`);
        } else {
          console.log(`\n  ${opts.file}: ${summary.resynced} resynced, ${summary.new} new, ${summary.removed} removed, ${summary.unchanged} unchanged${summary.errors > 0 ? `, ${summary.errors} errors` : ''}`);
        }
      } else {
        // Bulk mode
        await runForwardBulk(options, undefined, opts.exclude);
      }
    } catch (error) {
      console.error(`\n❌ ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

// ─── init command ───────────────────────────────────────────────────────────

program
  .command('init')
  .description('Bulk-translate a new project from a local source repository')
  .requiredOption('-s, --source <path>', 'Path to SOURCE (English) repository')
  .requiredOption('-t, --target <path>', 'Path to TARGET directory (will be created)')
  .requiredOption('--target-language <code>', 'Target language code (e.g., zh-cn, fa)')
  .option('--source-language <code>', 'Source language code', 'en')
  .option('-d, --docs-folder <folder>', 'Documentation folder within repos', 'lectures')
  .option('-m, --model <model>', 'Claude model to use', 'claude-sonnet-4-6')
  .option('--batch-delay <ms>', 'Delay between lectures in ms (rate limiting)', '1000')
  .option('-f, --file <file>', 'Translate a single lecture file (e.g., cobweb.md)')
  .option('--resume-from <file>', 'Resume from a specific lecture file (e.g., cobweb.md)')
  .option('--glossary <path>', 'Path to glossary JSON file (default: glossary/<lang>.json)')
  .option('--localize <rules>', `Localization rules for code cells (use "none" to disable)`, DEFAULT_RULES.join(','))
  .option('--dry-run', 'Preview lectures without translating', false)
  .action(async (opts) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey && !opts.dryRun) {
      console.error('❌ ANTHROPIC_API_KEY environment variable is required (or use --dry-run)');
      process.exit(1);
    }

    const batchDelay = parseInt(opts.batchDelay, 10);
    if (!Number.isFinite(batchDelay) || batchDelay < 0) {
      console.error('❌ --batch-delay must be a non-negative integer');
      process.exit(1);
    }

    let localizeRules;
    try {
      localizeRules = parseLocalizationRules(opts.localize);
    } catch (error) {
      console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }

    const options: InitOptions = {
      source: opts.source,
      target: opts.target,
      targetLanguage: opts.targetLanguage,
      sourceLanguage: opts.sourceLanguage,
      docsFolder: opts.docsFolder,
      model: opts.model,
      batchDelay,
      file: opts.file,
      resumeFrom: opts.resumeFrom,
      glossaryPath: opts.glossary,
      localize: localizeRules,
      dryRun: opts.dryRun,
      apiKey: apiKey || '',
    };

    try {
      const stats = await runInit(options);
      if (stats.failureCount > 0) {
        process.exit(1);
      }
    } catch (error) {
      console.error(`\n❌ ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

// ─── Parse and run ─────────────────────────────────────────────────────────

program.parse();

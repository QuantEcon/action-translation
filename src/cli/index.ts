#!/usr/bin/env node
/**
 * Resync CLI — Entry Point
 * 
 * Commands:
 * - backward:      Two-stage analysis → suggestion reports (Phase 1-2)
 * - backward-sync: Apply accepted suggestions to SOURCE (Phase 3)
 * - forward:       Translate SOURCE changes to TARGET (Phase 3)
 * - status:        Show sync status overview (Phase 2)
 */

import { Command } from 'commander';
import { runBackwardSingleFile, runBackwardBulk } from './commands/backward';
import { runStatus, formatStatusTable, formatStatusJson, StatusOptions } from './commands/status';
import { BackwardOptions } from './types';

// Read version from package.json to stay in sync
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require('../../package.json');

const program = new Command();

program
  .name('resync')
  .description('Analyze and sync translations between source and target repositories')
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
  .option('-o, --output <dir>', 'Output directory for reports', './reports')
  .option('-m, --model <model>', 'Claude model to use', 'claude-sonnet-4-5-20250929')
  .option('--json', 'Output reports as JSON', false)
  .option('--test', 'Use deterministic mock responses (no LLM calls)', false)
  .option('--min-confidence <number>', 'Minimum confidence for reporting', '0.6')
  .option('--exclude <pattern>', 'Exclude files matching pattern (repeatable, comma-separated)', collectExclude, [])
  .option('--estimate', 'Show cost estimate without running', false)
  .option('--resume', 'Resume a previous bulk run from checkpoint', false)
  .action(async (opts) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey && !opts.test && !opts.estimate) {
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
      estimate: opts.estimate,
      apiKey: apiKey || 'test-key',
    };

    if (opts.file) {
      // Single file mode
      try {
        const report = await runBackwardSingleFile(options);
        const backportCount = report.suggestions.filter(s => s.recommendation === 'BACKPORT').length;
        
        if (backportCount > 0) {
          console.log(`\n✅ Found ${backportCount} suggestion(s). Report written to ${opts.output}/`);
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
  .option('-d, --docs-folder <folder>', 'Documentation folder within repos', 'lectures')
  .option('-l, --language <code>', 'Target language code', 'zh-cn')
  .option('--exclude <pattern>', 'Exclude files matching pattern (repeatable, comma-separated)', collectExclude, [])
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    const statusOptions: StatusOptions = {
      source: opts.source,
      target: opts.target,
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

// ─── Parse and run ─────────────────────────────────────────────────────────

program.parse();

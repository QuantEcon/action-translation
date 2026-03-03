#!/usr/bin/env node
/**
 * Resync CLI — Entry Point
 * 
 * Three-command architecture:
 * - backward:      Two-stage analysis → suggestion reports (Phase 1)
 * - backward-sync: Apply accepted suggestions to SOURCE (Phase 3)
 * - forward:       Translate SOURCE changes to TARGET (Phase 3)
 * - status:        Show sync status overview (Phase 2)
 */

import { Command } from 'commander';
import { runBackwardSingleFile } from './commands/backward';
import { BackwardOptions } from './types';

const program = new Command();

program
  .name('resync')
  .description('Analyze and sync translations between source and target repositories')
  .version('0.1.0');

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
      minConfidence: parseFloat(opts.minConfidence),
      estimate: false,
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
      console.error('❌ Single-file mode requires --file (-f). Bulk mode is not yet available.');
      process.exit(1);
    }
  });

// ─── Parse and run ─────────────────────────────────────────────────────────

program.parse();

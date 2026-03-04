#!/usr/bin/env node
"use strict";
/**
 * Resync CLI — Entry Point
 *
 * Commands:
 * - backward:      Two-stage analysis → suggestion reports (Phase 1-2)
 * - backward-sync: Apply accepted suggestions to SOURCE (Phase 3)
 * - forward:       Translate SOURCE changes to TARGET (Phase 3)
 * - status:        Show sync status overview (Phase 2)
 */
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const backward_1 = require("./commands/backward");
const status_1 = require("./commands/status");
// Read version from package.json to stay in sync
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require('../../package.json');
const program = new commander_1.Command();
program
    .name('resync')
    .description('Analyze and sync translations between source and target repositories')
    .version(version);
/**
 * Validate --min-confidence value: must be a number in [0, 1].
 */
function validateMinConfidence(raw) {
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
function collectExclude(value, previous) {
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
    .option('--estimate', 'Show cost estimate without running', false)
    .option('--resume', 'Resume a previous bulk run from checkpoint', false)
    .action(async (opts) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey && !opts.test && !opts.estimate) {
        console.error('❌ ANTHROPIC_API_KEY environment variable is required (or use --test)');
        process.exit(1);
    }
    const options = {
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
            const report = await (0, backward_1.runBackwardSingleFile)(options);
            const backportCount = report.suggestions.filter(s => s.recommendation === 'BACKPORT').length;
            if (backportCount > 0) {
                const outputLabel = /\.(md|json)$/i.test(opts.output) ? opts.output : `${opts.output}/`;
                console.log(`\n✅ Found ${backportCount} suggestion(s). Report written to ${outputLabel}`);
            }
            else {
                console.log('\n✅ No backport suggestions found.');
            }
        }
        catch (error) {
            console.error(`\n❌ ${error instanceof Error ? error.message : String(error)}`);
            process.exit(1);
        }
    }
    else {
        // Bulk mode
        try {
            await (0, backward_1.runBackwardBulk)(options, undefined, opts.exclude, opts.resume);
        }
        catch (error) {
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
    const statusOptions = {
        source: opts.source,
        target: opts.target,
        file: opts.file,
        docsFolder: opts.docsFolder,
        language: opts.language,
        exclude: opts.exclude,
    };
    try {
        const result = await (0, status_1.runStatus)(statusOptions);
        if (opts.json) {
            console.log((0, status_1.formatStatusJson)(result));
        }
        else {
            console.log((0, status_1.formatStatusTable)(result));
        }
    }
    catch (error) {
        console.error(`\n❌ ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
});
// ─── Parse and run ─────────────────────────────────────────────────────────
program.parse();
//# sourceMappingURL=index.js.map
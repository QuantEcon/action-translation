"use strict";
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
 *
 * Supports two modes:
 * - Single-file: `npx resync backward -f file.md`
 * - Bulk: `npx resync backward` (all files in docs folder)
 *   - Writes reports to a timestamped folder
 *   - Incremental checkpointing via _progress.json
 *   - Supports --resume to continue interrupted runs
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.runBackwardSingleFile = runBackwardSingleFile;
exports.readProgress = readProgress;
exports.writeProgress = writeProgress;
exports.buildBulkOutputDir = buildBulkOutputDir;
exports.estimateBulkCost = estimateBulkCost;
exports.formatCostEstimate = formatCostEstimate;
exports.discoverBulkFiles = discoverBulkFiles;
exports.runBackwardBulk = runBackwardBulk;
exports.buildBulkReport = buildBulkReport;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const parser_1 = require("../../parser");
const heading_map_1 = require("../../heading-map");
const section_matcher_1 = require("../section-matcher");
const document_comparator_1 = require("../document-comparator");
const backward_evaluator_1 = require("../backward-evaluator");
const git_metadata_1 = require("../git-metadata");
const report_generator_1 = require("../report-generator");
const status_1 = require("./status");
const defaultLogger = {
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
async function runBackwardSingleFile(options, logger = defaultLogger) {
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
    const sourceMetadata = await (0, git_metadata_1.getFileGitMetadata)(source, path.join(docsFolder, file));
    const targetMetadata = await (0, git_metadata_1.getFileGitMetadata)(target, path.join(docsFolder, file));
    if (sourceMetadata) {
        logger.info(`  SOURCE last modified: ${sourceMetadata.lastModified.toISOString().split('T')[0]}`);
    }
    if (targetMetadata) {
        logger.info(`  TARGET last modified: ${targetMetadata.lastModified.toISOString().split('T')[0]}`);
    }
    // Get interleaved commit timeline
    logger.info('  Building commit timeline...');
    const timeline = await (0, git_metadata_1.getFileTimeline)(source, target, path.join(docsFolder, file));
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
    const triageResult = await (0, document_comparator_1.triageDocument)(file, sourceContent, targetContent, sourceMetadata, targetMetadata, timeline, {
        apiKey: options.apiKey,
        model,
        sourceLanguage: 'en',
        targetLanguage: language,
        testMode,
    });
    logger.info(`  Stage 1 verdict: ${triageResult.verdict}`);
    if (triageResult.notes) {
        logger.info(`  Notes: ${triageResult.notes}`);
    }
    // If IN_SYNC, we're done
    if (triageResult.verdict === 'IN_SYNC') {
        logger.info('  ✓ File is in sync. No suggestions.');
        const report = {
            file,
            timestamp: new Date().toISOString(),
            model,
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
    const parser = new parser_1.MystParser();
    const sourceParsed = await parser.parseSections(sourceContent, sourceFilePath);
    const targetParsed = await parser.parseSections(targetContent, targetFilePath);
    // Extract heading-map from target for validation
    const headingMap = (0, heading_map_1.extractHeadingMap)(targetContent);
    if (headingMap.size > 0) {
        logger.info(`  Heading-map: ${headingMap.size} entries`);
    }
    else {
        logger.warn('  No heading-map found in TARGET. Using position-only matching.');
    }
    // Match sections
    const pairs = (0, section_matcher_1.matchSections)(sourceParsed.sections, targetParsed.sections, headingMap.size > 0 ? headingMap : undefined);
    const summary = (0, section_matcher_1.getMatchingSummary)(pairs);
    logger.info(`  Sections: ${summary.matched} matched, ${summary.sourceOnly} source-only, ${summary.targetOnly} target-only`);
    // Validate matches against heading-map if available
    if (headingMap.size > 0) {
        const warnings = (0, section_matcher_1.validateMatchesWithHeadingMap)(pairs, headingMap);
        for (const warning of warnings) {
            logger.warn(`Heading-map mismatch: ${warning}`);
        }
    }
    // Evaluate each matched section pair
    const suggestions = [];
    for (const pair of pairs) {
        if (pair.status !== 'MATCHED' || !pair.sourceSection || !pair.targetSection) {
            continue; // Skip unmatched sections (reported separately)
        }
        const heading = pair.sourceHeading || 'Unknown Section';
        logger.info(`  Evaluating: ${heading}`);
        const suggestion = await (0, backward_evaluator_1.evaluateSection)(pair.sourceSection.content, pair.targetSection.content, heading, sourceMetadata, targetMetadata, triageResult.notes, timeline, {
            apiKey: options.apiKey,
            model,
            sourceLanguage: 'en',
            targetLanguage: language,
            testMode,
        });
        suggestions.push(suggestion);
        if (suggestion.recommendation === 'BACKPORT') {
            logger.info(`    → BACKPORT (${suggestion.category}, confidence: ${suggestion.confidence.toFixed(2)})`);
        }
        else {
            logger.info(`    → No backport (${suggestion.category})`);
        }
    }
    // Filter suggestions by min-confidence
    const minConfidence = options.minConfidence ?? 0;
    const filteredSuggestions = suggestions.map(s => {
        // Downgrade to NO_BACKPORT if below confidence threshold
        if (s.recommendation === 'BACKPORT' && s.confidence < minConfidence) {
            return { ...s, recommendation: 'NO_BACKPORT' };
        }
        return s;
    });
    // Build report
    const backportCount = filteredSuggestions.filter(s => s.recommendation === 'BACKPORT').length;
    logger.info(`  Done: ${backportCount} suggestion(s) from ${filteredSuggestions.length} sections analyzed.`);
    const report = {
        file,
        timestamp: new Date().toISOString(),
        model,
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
function resolveFilePath(repoPath, docsFolder, filename) {
    return path.join(repoPath, docsFolder, filename);
}
/**
 * Write report to output path.
 *
 * In single-file mode, if `options.output` ends with `.md` or `.json` it is
 * treated as a **file path** (the user chose the exact name).  Otherwise it is
 * treated as a **directory** and a filename is generated from the source file.
 */
async function writeReport(report, options, logger) {
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
            ? (0, report_generator_1.generateJsonReport)(report)
            : (0, report_generator_1.generateMarkdownReport)(report);
        fs.writeFileSync(output, content, 'utf-8');
        logger.info(`  Report written: ${output}`);
        // Always write a JSON sidecar for resume reliability
        if (!output.endsWith('.json')) {
            const jsonSidecar = output.replace(/\.md$/i, '.json');
            fs.writeFileSync(jsonSidecar, (0, report_generator_1.generateJsonReport)(report), 'utf-8');
        }
    }
    else {
        // Directory mode (bulk, or single-file without extension)
        if (!fs.existsSync(output)) {
            fs.mkdirSync(output, { recursive: true });
        }
        if (options.json) {
            const jsonPath = path.join(output, `${basename}-backward.json`);
            fs.writeFileSync(jsonPath, (0, report_generator_1.generateJsonReport)(report), 'utf-8');
            logger.info(`  Report written: ${jsonPath}`);
        }
        else {
            const mdPath = path.join(output, `${basename}-backward.md`);
            fs.writeFileSync(mdPath, (0, report_generator_1.generateMarkdownReport)(report), 'utf-8');
            logger.info(`  Report written: ${mdPath}`);
            // Always write a JSON sidecar for resume reliability
            const jsonSidecar = path.join(output, `${basename}-backward.json`);
            fs.writeFileSync(jsonSidecar, (0, report_generator_1.generateJsonReport)(report), 'utf-8');
        }
    }
}
/**
 * Read existing progress from _progress.json, or return null if not found.
 */
function readProgress(outputDir) {
    const progressPath = path.join(outputDir, '_progress.json');
    if (!fs.existsSync(progressPath)) {
        return null;
    }
    try {
        return JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
    }
    catch {
        return null;
    }
}
/**
 * Write progress to _progress.json.
 */
function writeProgress(outputDir, progress) {
    const progressPath = path.join(outputDir, '_progress.json');
    fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2), 'utf-8');
}
/**
 * Build a timestamped output folder name:
 *   reports/backward-2026-03-03_14-23-05/
 *
 * Uses date + time (to the second) to avoid collisions between multiple
 * bulk runs on the same day.
 */
function buildBulkOutputDir(baseOutput) {
    const now = new Date();
    const iso = now.toISOString(); // e.g. "2026-03-03T14:23:05.123Z"
    const [dateStr, timeStr] = iso.split('T');
    const timePart = timeStr.slice(0, 8).replace(/:/g, '-'); // "14-23-05"
    return path.join(baseOutput, `backward-${dateStr}_${timePart}`);
}
function estimateBulkCost(fileCount, avgSectionsPerFile = 8) {
    // Stage 1: ~$0.01 per file (single triage call)
    const stage1Calls = fileCount;
    const stage1Cost = stage1Calls * 0.01;
    // Estimate ~5-10% of files will be flagged
    const flagRate = 0.075; // 7.5% middle estimate
    const estimatedFlagged = Math.max(1, Math.round(fileCount * flagRate));
    // Stage 2: ~$0.01-0.02 per section for flagged files
    const estimatedStage2Calls = estimatedFlagged * avgSectionsPerFile;
    const stage2Cost = estimatedStage2Calls * 0.015;
    // Time: ~3s per Stage 1 call + ~5s per Stage 2 call
    const estimatedTimeSeconds = (stage1Calls * 3) + (estimatedStage2Calls * 5);
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
function formatCostEstimate(estimate) {
    const lines = [];
    lines.push('Cost Estimate:');
    lines.push(`  Files to analyze:       ${estimate.totalFiles}`);
    lines.push(`  Stage 1 triage calls:   ${estimate.stage1Calls}`);
    lines.push(`  Est. flagged files:     ~${estimate.estimatedFlaggedFiles} (~7.5%)`);
    lines.push(`  Est. Stage 2 calls:     ~${estimate.estimatedStage2Calls}`);
    lines.push(`  Est. API cost:          ~$${estimate.estimatedCostUsd.toFixed(2)}`);
    lines.push(`  Est. time:              ~${estimate.estimatedTimeMinutes} min`);
    return lines.join('\n');
}
/**
 * Discover files to analyze in bulk mode.
 * Uses both SOURCE and TARGET file lists, applies exclusions.
 */
function discoverBulkFiles(sourceRepoPath, targetRepoPath, docsFolder, exclude) {
    const sourceFiles = (0, status_1.discoverMarkdownFiles)(sourceRepoPath, docsFolder);
    const targetFiles = (0, status_1.discoverMarkdownFiles)(targetRepoPath, docsFolder);
    let allFiles = (0, status_1.resolveFilePairs)(sourceFiles, targetFiles);
    allFiles = (0, status_1.applyExcludes)(allFiles, exclude);
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
async function runBackwardBulk(options, logger = defaultLogger, exclude = [], resume = false) {
    const { source, target, docsFolder, language } = options;
    // Build output directory
    const outputDir = resume
        ? resolveResumeDir(options.output)
        : buildBulkOutputDir(options.output);
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
    let progress;
    const existingProgress = resume ? readProgress(outputDir) : null;
    if (existingProgress) {
        const doneSet = new Set([
            ...existingProgress.completedFiles,
            ...existingProgress.erroredFiles.map(e => e.file),
        ]);
        const remaining = allFiles.filter(f => !doneSet.has(f));
        logger.info(`Resuming: ${existingProgress.completedFiles.length} already done, ${remaining.length} remaining.`);
        progress = existingProgress;
    }
    else {
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
    // Process files sequentially
    const fileReports = [];
    // Load any already-written reports for the aggregate (always from JSON sidecar)
    for (const doneFile of progress.completedFiles) {
        const jsonPath = resolveReportPath(outputDir, doneFile, true);
        if (fs.existsSync(jsonPath)) {
            try {
                const report = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
                fileReports.push(report);
            }
            catch {
                // Skip corrupted reports
            }
        }
    }
    const filesToProcess = allFiles.filter(f => !doneSet.has(f));
    for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i];
        const globalIdx = allFiles.indexOf(file) + 1;
        logger.info(`\n[${globalIdx}/${allFiles.length}] ${file}`);
        try {
            // Run single-file backward with output pointing to the bulk folder
            const fileOptions = {
                ...options,
                file,
                output: outputDir,
            };
            const report = await runBackwardSingleFile(fileOptions, logger);
            fileReports.push(report);
            // Always write a JSON sidecar for resume reliability
            if (!options.json) {
                const jsonSidecarPath = resolveReportPath(outputDir, file, true);
                fs.writeFileSync(jsonSidecarPath, (0, report_generator_1.generateJsonReport)(report), 'utf-8');
            }
            progress.completedFiles.push(file);
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error(`  Failed: ${errorMsg}`);
            progress.erroredFiles.push({ file, error: errorMsg });
        }
        // Update progress checkpoint
        progress.lastUpdated = new Date().toISOString();
        writeProgress(outputDir, progress);
    }
    // Build aggregate report
    const bulkReport = buildBulkReport(source, target, language, fileReports, options.model);
    // Write aggregate summary
    if (options.json) {
        const summaryPath = path.join(outputDir, '_summary.json');
        fs.writeFileSync(summaryPath, (0, report_generator_1.generateBulkJsonReport)(bulkReport), 'utf-8');
        logger.info(`\nAggregate report: ${summaryPath}`);
    }
    else {
        const summaryPath = path.join(outputDir, '_summary.md');
        fs.writeFileSync(summaryPath, (0, report_generator_1.generateBulkMarkdownReport)(bulkReport), 'utf-8');
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
    logger.info(`\nReports written to: ${outputDir}`);
    return bulkReport;
}
/**
 * Build a BulkBackwardReport from individual file reports.
 */
function buildBulkReport(sourceRepo, targetRepo, language, fileReports, model) {
    const allSuggestions = fileReports.flatMap(r => r.suggestions.filter(s => s.recommendation === 'BACKPORT'));
    return {
        timestamp: new Date().toISOString(),
        model,
        sourceRepo,
        targetRepo,
        language,
        filesAnalyzed: fileReports.length,
        filesInSync: fileReports.filter(r => r.triageResult.verdict === 'IN_SYNC').length,
        filesFlagged: fileReports.filter(r => r.suggestions.some(s => s.recommendation === 'BACKPORT')).length,
        filesSkipped: fileReports.filter(r => r.triageResult.verdict === 'SKIPPED_TOO_LARGE').length,
        totalSuggestions: allSuggestions.length,
        highConfidence: allSuggestions.filter(s => s.confidence >= 0.85).length,
        mediumConfidence: allSuggestions.filter(s => s.confidence >= 0.6 && s.confidence < 0.85).length,
        lowConfidence: allSuggestions.filter(s => s.confidence < 0.6).length,
        fileReports,
    };
}
function buildEmptyBulkReport(sourceRepo, targetRepo, language, model) {
    return buildBulkReport(sourceRepo, targetRepo, language, [], model);
}
function resolveReportPath(outputDir, file, json) {
    const basename = path.basename(file, '.md');
    const ext = json ? '.json' : '.md';
    return path.join(outputDir, `${basename}-backward${ext}`);
}
/**
 * Find the correct output directory for --resume.
 *
 * Checks (in order):
 * 1. If options.output itself contains _progress.json → use it directly
 * 2. If options.output contains backward-* subdirs → use most recent with _progress.json
 * 3. Otherwise → error (nothing to resume from)
 */
function resolveResumeDir(outputPath) {
    // Case 1: Direct path to a run directory
    if (fs.existsSync(path.join(outputPath, '_progress.json'))) {
        return outputPath;
    }
    // Case 2: Base output directory (e.g., ./reports) — find most recent run
    if (fs.existsSync(outputPath)) {
        const candidates = fs.readdirSync(outputPath)
            .filter(d => d.startsWith('backward-'))
            .filter(d => fs.existsSync(path.join(outputPath, d, '_progress.json')))
            .sort()
            .reverse(); // Most recent first (lexicographic sort on timestamps)
        if (candidates.length > 0) {
            return path.join(outputPath, candidates[0]);
        }
    }
    throw new Error(`No resumable run found in ${outputPath}. ` +
        'Run without --resume first, or point --output to a specific backward-* folder.');
}
//# sourceMappingURL=backward.js.map
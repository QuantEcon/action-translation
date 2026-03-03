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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const parser_1 = require("../../parser");
const heading_map_1 = require("../../heading-map");
const section_matcher_1 = require("../section-matcher");
const document_comparator_1 = require("../document-comparator");
const backward_evaluator_1 = require("../backward-evaluator");
const git_metadata_1 = require("../git-metadata");
const report_generator_1 = require("../report-generator");
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
    // Build report
    const backportCount = suggestions.filter(s => s.recommendation === 'BACKPORT').length;
    logger.info(`  Done: ${backportCount} suggestion(s) from ${suggestions.length} sections analyzed.`);
    const report = {
        file,
        timestamp: new Date().toISOString(),
        sourceMetadata,
        targetMetadata,
        timeline,
        triageResult,
        suggestions,
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
 * Write report to output directory
 */
async function writeReport(report, options, logger) {
    const outputDir = options.output;
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    const basename = path.basename(report.file, '.md');
    if (options.json) {
        const jsonPath = path.join(outputDir, `${basename}-backward.json`);
        fs.writeFileSync(jsonPath, (0, report_generator_1.generateJsonReport)(report), 'utf-8');
        logger.info(`  Report written: ${jsonPath}`);
    }
    else {
        const mdPath = path.join(outputDir, `${basename}-backward.md`);
        fs.writeFileSync(mdPath, (0, report_generator_1.generateMarkdownReport)(report), 'utf-8');
        logger.info(`  Report written: ${mdPath}`);
    }
}
//# sourceMappingURL=backward.js.map
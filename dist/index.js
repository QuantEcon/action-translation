"use strict";
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
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const inputs_1 = require("./inputs");
const reviewer_1 = require("./reviewer");
const sync_orchestrator_1 = require("./sync-orchestrator");
const pr_creator_1 = require("./pr-creator");
const fs_1 = require("fs");
const path = __importStar(require("path"));
/**
 * Main entry point for the GitHub Action
 * Routes to sync or review mode based on 'mode' input
 */
async function run() {
    try {
        const mode = (0, inputs_1.getMode)();
        core.info(`🚀 Running in ${mode.toUpperCase()} mode`);
        if (mode === 'sync') {
            await runSync();
        }
        else {
            await runReview();
        }
    }
    catch (error) {
        core.setFailed(`Action failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Run the REVIEW mode - evaluate translation quality on a PR
 */
async function runReview() {
    // Get and validate inputs
    core.info('Getting review mode inputs...');
    const inputs = (0, inputs_1.getReviewInputs)();
    // Validate this is a PR event
    core.info('Validating PR event...');
    const { prNumber } = (0, inputs_1.validateReviewPREvent)(github.context);
    core.info(`📝 Reviewing translation PR #${prNumber}`);
    // Initialize reviewer
    const reviewer = new reviewer_1.TranslationReviewer(inputs.anthropicApiKey, inputs.githubToken, inputs.claudeModel, inputs.maxSuggestions);
    // Load glossary
    let glossaryTerms;
    const targetLanguage = detectTargetLanguage();
    if (targetLanguage) {
        const builtInGlossaryPath = path.join(__dirname, '..', 'glossary', `${targetLanguage}.json`);
        try {
            const glossaryContent = await fs_1.promises.readFile(builtInGlossaryPath, 'utf-8');
            const glossary = JSON.parse(glossaryContent);
            if (glossary && glossary.terms) {
                glossaryTerms = glossary.terms
                    .map((t) => `- "${t.en}" → "${t[targetLanguage] || ''}"${t.context ? ` (${t.context})` : ''}`)
                    .join('\n');
                core.info(`✓ Loaded glossary for ${targetLanguage} with ${glossary.terms.length} terms`);
            }
        }
        catch (error) {
            core.warning(`Could not load glossary for ${targetLanguage}: ${error}`);
        }
    }
    // Run review
    const result = await reviewer.reviewPR(prNumber, inputs.sourceRepo, github.context.repo.owner, github.context.repo.repo, inputs.docsFolder, glossaryTerms, targetLanguage);
    // Set outputs
    core.setOutput('review-verdict', result.verdict);
    core.setOutput('translation-score', result.translationQuality.score.toString());
    core.setOutput('diff-score', result.diffQuality.score.toString());
    core.info(`✅ Review complete: ${result.verdict} (Translation: ${result.translationQuality.score}/10, Diff: ${result.diffQuality.score}/10)`);
}
/**
 * Detect target language from repository name
 * e.g., 'lecture-python.zh-cn' -> 'zh-cn'
 */
function detectTargetLanguage() {
    const repoName = github.context.repo.repo;
    const match = repoName.match(/\.([a-z]{2}(?:-[a-z]{2})?)$/);
    return match ? match[1] : undefined;
}
/**
 * Run the SYNC mode - create translation PRs
 *
 * Workflow:
 * 1. Validate inputs and PR event
 * 2. List and classify changed files
 * 3. Fetch content from GitHub API (source + target repos)
 * 4. Process files via SyncOrchestrator (translation + validation)
 * 5. Create PR in target repo via PrCreator
 */
async function runSync() {
    // Get and validate inputs
    core.info('Getting action inputs...');
    const inputs = (0, inputs_1.getInputs)();
    // Validate this is a merged PR event, test mode, or manual dispatch
    core.info('Validating PR event...');
    const { merged, prNumber, isTestMode } = (0, inputs_1.validatePREvent)(github.context, inputs.testMode);
    if (!merged) {
        core.info('PR was not merged. Exiting.');
        return;
    }
    if (isTestMode) {
        core.info(`🧪 TEST MODE: Processing PR #${prNumber} (using head commit)`);
    }
    else {
        core.info(`Processing merged PR #${prNumber}`);
    }
    // Get changed files from PR
    const octokit = github.getOctokit(inputs.githubToken);
    const { data: files } = await octokit.rest.pulls.listFiles({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        pull_number: prNumber,
    });
    // Classify files into categories
    const classified = (0, sync_orchestrator_1.classifyChangedFiles)(files, inputs.docsFolder);
    if (classified.changedMarkdownFiles.length === 0 && classified.changedTocFiles.length === 0 &&
        classified.removedMarkdownFiles.length === 0 && classified.removedTocFiles.length === 0 &&
        classified.renamedMarkdownFiles.length === 0) {
        core.info('No markdown or TOC files changed in docs folder. Exiting.');
        return;
    }
    core.info(`Found ${classified.changedMarkdownFiles.length} changed markdown files`);
    core.info(`Found ${classified.renamedMarkdownFiles.length} renamed markdown files`);
    core.info(`Found ${classified.changedTocFiles.length} changed TOC files`);
    core.info(`Found ${classified.removedMarkdownFiles.length} removed markdown files`);
    core.info(`Found ${classified.removedTocFiles.length} removed TOC files`);
    // Load glossary
    const builtInGlossaryDir = path.join(__dirname, '..', 'glossary');
    const glossary = await (0, sync_orchestrator_1.loadGlossary)(inputs.targetLanguage, builtInGlossaryDir, inputs.glossaryPath || undefined, coreLogger);
    // Fetch content and build FileToSync array
    const [targetOwner, targetRepo] = inputs.targetRepo.split('/');
    const filesToSync = await fetchAllFileContents(octokit, classified, inputs, targetOwner, targetRepo);
    // Process files through the orchestrator
    const orchestrator = new sync_orchestrator_1.SyncOrchestrator({
        sourceLanguage: inputs.sourceLanguage,
        targetLanguage: inputs.targetLanguage,
        claudeModel: inputs.claudeModel,
        anthropicApiKey: inputs.anthropicApiKey,
        debugMode: true,
    }, coreLogger);
    const result = await orchestrator.processFiles(filesToSync, glossary);
    // Report results
    if (result.errors.length > 0) {
        core.setFailed(`Translation completed with ${result.errors.length} errors`);
    }
    else {
        core.info(`Successfully processed ${result.processedFiles.length} files`);
    }
    // Create PR in target repo with translated content
    if (result.translatedFiles.length > 0 || result.filesToDelete.length > 0) {
        try {
            core.info('Creating PR in target repository...');
            // Fetch source PR details
            const sourcePrInfo = await fetchSourcePrInfo(octokit, prNumber);
            const prConfig = {
                targetOwner,
                targetRepo,
                sourceLanguage: inputs.sourceLanguage,
                targetLanguage: inputs.targetLanguage,
                claudeModel: inputs.claudeModel,
                sourceRepoOwner: github.context.repo.owner,
                sourceRepoName: github.context.repo.repo,
                prNumber,
                prLabels: inputs.prLabels,
                prReviewers: inputs.prReviewers,
                prTeamReviewers: inputs.prTeamReviewers,
            };
            const prResult = await (0, pr_creator_1.createTranslationPR)(octokit, result.translatedFiles, result.filesToDelete, prConfig, coreLogger, sourcePrInfo);
            core.setOutput('pr-url', prResult.prUrl);
            core.setOutput('files-synced', result.processedFiles.length.toString());
        }
        catch (prError) {
            core.setFailed(`Failed to create PR: ${prError instanceof Error ? prError.message : String(prError)}`);
        }
    }
}
// =============================================================================
// HELPERS - GitHub API content fetching
// =============================================================================
/**
 * Logger adapter: maps @actions/core to the Logger interface
 */
const coreLogger = {
    info: (msg) => core.info(msg),
    error: (msg) => core.error(msg),
    warning: (msg) => core.warning(msg),
};
/**
 * Fetch file content from a GitHub repo at a specific ref.
 * Returns empty string if file doesn't exist.
 */
async function fetchFileContent(
// eslint-disable-next-line @typescript-eslint/no-explicit-any
octokit, owner, repo, filepath, ref) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params = { owner, repo, path: filepath };
    if (ref)
        params.ref = ref;
    const { data } = await octokit.rest.repos.getContent(params);
    if (!('content' in data)) {
        throw new Error(`Could not get content for ${filepath}`);
    }
    return {
        content: Buffer.from(data.content, 'base64').toString('utf-8'),
        sha: data.sha,
    };
}
/**
 * Build FileToSync[] by fetching content from GitHub API for all classified files.
 */
async function fetchAllFileContents(
// eslint-disable-next-line @typescript-eslint/no-explicit-any
octokit, classified, inputs, targetOwner, targetRepo) {
    const filesToSync = [];
    const sourceOwner = github.context.repo.owner;
    const sourceRepo = github.context.repo.repo;
    const sha = github.context.sha;
    // Changed markdown files
    for (const file of classified.changedMarkdownFiles) {
        try {
            const { content: newContent } = await fetchFileContent(octokit, sourceOwner, sourceRepo, file.filename, sha);
            let oldContent = '';
            try {
                const result = await fetchFileContent(octokit, sourceOwner, sourceRepo, file.filename, `${sha}^`);
                oldContent = result.content;
            }
            catch {
                core.info(`${file.filename} is a new file`);
            }
            let targetContent = '';
            let existingFileSha;
            let isNewFile = false;
            try {
                const result = await fetchFileContent(octokit, targetOwner, targetRepo, file.filename);
                targetContent = result.content;
                existingFileSha = result.sha;
            }
            catch {
                isNewFile = true;
                core.info(`${file.filename} does not exist in target repo - will create it`);
            }
            filesToSync.push({
                filename: file.filename,
                type: 'markdown',
                newContent,
                oldContent,
                targetContent,
                existingFileSha,
                isNewFile,
            });
        }
        catch (error) {
            core.error(`Error fetching content for ${file.filename}: ${error}`);
        }
    }
    // Renamed markdown files
    for (const file of classified.renamedMarkdownFiles) {
        try {
            const { content: newContent } = await fetchFileContent(octokit, sourceOwner, sourceRepo, file.filename, sha);
            const previousFilename = file.previous_filename;
            let oldContent = '';
            if (previousFilename) {
                try {
                    const result = await fetchFileContent(octokit, sourceOwner, sourceRepo, previousFilename, `${sha}^`);
                    oldContent = result.content;
                }
                catch {
                    core.info(`Could not get old content from ${previousFilename}`);
                }
            }
            let targetContent = '';
            let oldFileSha;
            if (previousFilename) {
                try {
                    const result = await fetchFileContent(octokit, targetOwner, targetRepo, previousFilename);
                    targetContent = result.content;
                    oldFileSha = result.sha;
                    core.info(`Found existing translation at ${previousFilename} - will transfer to ${file.filename}`);
                }
                catch {
                    core.info(`${previousFilename} does not exist in target repo`);
                }
            }
            filesToSync.push({
                filename: file.filename,
                type: 'renamed',
                newContent,
                oldContent,
                targetContent,
                previousFilename,
                oldFileSha,
                isNewFile: !targetContent,
            });
        }
        catch (error) {
            core.error(`Error fetching content for renamed file ${file.filename}: ${error}`);
        }
    }
    // TOC files
    for (const file of classified.changedTocFiles) {
        try {
            const { content: newContent } = await fetchFileContent(octokit, sourceOwner, sourceRepo, file.filename, sha);
            let existingFileSha;
            try {
                const result = await fetchFileContent(octokit, targetOwner, targetRepo, file.filename);
                existingFileSha = result.sha;
            }
            catch {
                core.info(`${file.filename} does not exist in target repo - will create it`);
            }
            filesToSync.push({
                filename: file.filename,
                type: 'toc',
                newContent,
                existingFileSha,
                isNewFile: !existingFileSha,
            });
        }
        catch (error) {
            core.error(`Error fetching content for TOC file ${file.filename}: ${error}`);
        }
    }
    // Removed files (markdown + TOC)
    for (const file of [...classified.removedMarkdownFiles, ...classified.removedTocFiles]) {
        try {
            let existingFileSha;
            try {
                const result = await fetchFileContent(octokit, targetOwner, targetRepo, file.filename);
                existingFileSha = result.sha;
            }
            catch {
                core.info(`${file.filename} does not exist in target repo - skipping deletion`);
            }
            if (existingFileSha) {
                filesToSync.push({
                    filename: file.filename,
                    type: 'removed',
                    existingFileSha,
                    isNewFile: false,
                });
            }
        }
        catch (error) {
            core.error(`Error checking removal of ${file.filename}: ${error}`);
        }
    }
    return filesToSync;
}
/**
 * Fetch source PR title and labels for the translation PR body.
 */
async function fetchSourcePrInfo(
// eslint-disable-next-line @typescript-eslint/no-explicit-any
octokit, prNumber) {
    try {
        const { data: sourcePr } = await octokit.rest.pulls.get({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            pull_number: prNumber,
        });
        return {
            title: sourcePr.title,
            labels: sourcePr.labels
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((label) => typeof label === 'string' ? label : label.name || '')
                .filter((name) => name && name !== 'test-translation'),
        };
    }
    catch (error) {
        core.warning(`Could not fetch source PR details: ${error}`);
        return undefined;
    }
}
// Run the action
run();
//# sourceMappingURL=index.js.map
import * as core from '@actions/core';
import * as github from '@actions/github';
import { getMode, getInputs, getReviewInputs, validatePREvent, validateReviewPREvent } from './inputs.js';
import { TranslationReviewer } from './reviewer.js';
import { SyncOrchestrator, classifyChangedFiles, loadGlossary, FileToSync, Logger, StateGenerationConfig } from './sync-orchestrator.js';
import { createTranslationPR, PrCreatorConfig, SourcePrInfo } from './pr-creator.js';
import { stateFileRelativePath } from './cli/translate-state.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Main entry point for the GitHub Action
 * Routes to sync or review mode based on 'mode' input
 */
async function run(): Promise<void> {
  try {
    const mode = getMode();
    core.info(`🚀 Running in ${mode.toUpperCase()} mode`);

    if (mode === 'sync') {
      await runSync();
    } else {
      await runReview();
    }
  } catch (error) {
    core.setFailed(`Action failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Run the REVIEW mode - evaluate translation quality on a PR
 */
async function runReview(): Promise<void> {
  // Get and validate inputs
  core.info('Getting review mode inputs...');
  const inputs = getReviewInputs();

  // Validate this is a PR event
  core.info('Validating PR event...');
  const { prNumber } = validateReviewPREvent(github.context);

  core.info(`📝 Reviewing translation PR #${prNumber}`);

  // Initialize reviewer
  const reviewer = new TranslationReviewer(
    inputs.anthropicApiKey,
    inputs.githubToken,
    inputs.claudeModel,
    inputs.maxSuggestions
  );

  // Load glossary
  let glossaryTerms: string | undefined;
  const targetLanguage = detectTargetLanguage();
  if (targetLanguage) {
    const builtInGlossaryPath = path.join(__dirname, '..', 'glossary', `${targetLanguage}.json`);
    try {
      const glossaryContent = await fs.readFile(builtInGlossaryPath, 'utf-8');
      const glossary = JSON.parse(glossaryContent);
      if (glossary && glossary.terms) {
        glossaryTerms = glossary.terms
          .map((t: { en: string; [key: string]: string | undefined; context?: string }) => 
            `- "${t.en}" → "${t[targetLanguage] || ''}"${t.context ? ` (${t.context})` : ''}`)
          .join('\n');
        core.info(`✓ Loaded glossary for ${targetLanguage} with ${glossary.terms.length} terms`);
      }
    } catch (error) {
      core.warning(`Could not load glossary for ${targetLanguage}: ${error}`);
    }
  }

  // Run review
  const result = await reviewer.reviewPR(
    prNumber,
    inputs.sourceRepo,
    github.context.repo.owner,
    github.context.repo.repo,
    inputs.docsFolder,
    glossaryTerms,
    targetLanguage
  );

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
function detectTargetLanguage(): string | undefined {
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
async function runSync(): Promise<void> {
    // Get and validate inputs
    core.info('Getting action inputs...');
    const inputs = getInputs();

    // Validate this is a merged PR event, test mode, or resync comment
    core.info('Validating PR event...');
    const { merged, prNumber, isTestMode, isResync, resyncLanguage } = validatePREvent(github.context, inputs.testMode);

    if (!merged) {
      core.info('PR was not merged. Exiting.');
      return;
    }

    // If resync targets a specific language, skip if this workflow doesn't match
    if (isResync && resyncLanguage && resyncLanguage !== inputs.targetLanguage) {
      core.info(`Resync requested for '${resyncLanguage}', skipping (this workflow targets '${inputs.targetLanguage}').`);
      return;
    }

    const octokit = github.getOctokit(inputs.githubToken);

    // Determine effective SHA for fetching file content.
    // For issue_comment events (resync), github.context.sha is HEAD of default branch,
    // NOT the PR's merge commit. Use the PR's merge_commit_sha instead so that
    // oldContent (sha^) and newContent (sha) reflect the actual PR changes.
    let effectiveSha = github.context.sha;

    // For resync: verify PR is actually merged (issue_comment payload doesn't include merged status)
    if (isResync) {
      const { data: pr } = await octokit.rest.pulls.get({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        pull_number: prNumber,
      });
      if (!pr.merged) {
        core.info(`PR #${prNumber} is not merged. Resync only works on merged PRs.`);
        return;
      }
      if (pr.merge_commit_sha) {
        effectiveSha = pr.merge_commit_sha;
        core.info(`🔄 RESYNC: PR #${prNumber} is merged — using merge commit ${effectiveSha}`);
      } else {
        core.warning(`PR #${prNumber} has no merge_commit_sha, falling back to context.sha`);
        core.info(`🔄 RESYNC: PR #${prNumber} is merged — proceeding with translation sync`);
      }
    }

    if (isTestMode) {
      core.info(`🧪 TEST MODE: Processing PR #${prNumber} (using head commit)`);
    } else if (!isResync) {
      core.info(`Processing merged PR #${prNumber}`);
    }

    // Get changed files from PR
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      pull_number: prNumber,
    });

    // Classify files into categories
    const classified = classifyChangedFiles(files, inputs.docsFolder);

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
    const glossary = await loadGlossary(
      inputs.targetLanguage,
      builtInGlossaryDir,
      inputs.glossaryPath || undefined,
      coreLogger,
    );

    // Fetch content and build FileToSync array
    const [targetOwner, targetRepo] = inputs.targetRepo.split('/');
    const filesToSync = await fetchAllFileContents(
      octokit, classified, inputs, targetOwner, targetRepo, effectiveSha,
    );

    // Fetch existing state file SHAs from target repo for state generation
    const existingStateShas = await fetchExistingStateShas(
      octokit, targetOwner, targetRepo, filesToSync, inputs.docsFolder,
    );

    const stateConfig: StateGenerationConfig = {
      sourceCommitSha: effectiveSha,
      existingStateShas,
      docsFolder: inputs.docsFolder,
    };

    // Process files through the orchestrator
    const orchestrator = new SyncOrchestrator({
      sourceLanguage: inputs.sourceLanguage,
      targetLanguage: inputs.targetLanguage,
      claudeModel: inputs.claudeModel,
      anthropicApiKey: inputs.anthropicApiKey,
      debugMode: true,
    }, coreLogger, stateConfig);

    const result = await orchestrator.processFiles(filesToSync, glossary);

    // Report results
    const hasErrors = result.errors.length > 0;
    if (hasErrors) {
      core.setFailed(`Translation completed with ${result.errors.length} errors`);
    } else {
      core.info(`Successfully processed ${result.processedFiles.length} files`);
    }

    // Create PR in target repo with translated content
    let prUrl: string | undefined;
    if (result.translatedFiles.length > 0 || result.filesToDelete.length > 0) {
      try {
        core.info('Creating PR in target repository...');

        // Fetch source PR details
        const sourcePrInfo = await fetchSourcePrInfo(octokit, prNumber);

        const prConfig: PrCreatorConfig = {
          targetOwner,
          targetRepo,
          sourceLanguage: inputs.sourceLanguage,
          targetLanguage: inputs.targetLanguage,
          claudeModel: inputs.claudeModel,
          sourceRepoOwner: github.context.repo.owner,
          sourceRepoName: github.context.repo.repo,
          prNumber,
          sourceCommitSha: effectiveSha,
          prLabels: inputs.prLabels,
          prReviewers: inputs.prReviewers,
          prTeamReviewers: inputs.prTeamReviewers,
        };

        const prResult = await createTranslationPR(
          octokit,
          result.translatedFiles,
          result.filesToDelete,
          prConfig,
          coreLogger,
          sourcePrInfo,
          result.skippedSections,
        );

        prUrl = prResult.prUrl;
        core.setOutput('pr-url', prResult.prUrl);
        core.setOutput('files-synced', result.processedFiles.length.toString());

      } catch (prError) {
        core.setFailed(`Failed to create PR: ${prError instanceof Error ? prError.message : String(prError)}`);
        result.errors.push(`PR creation failed: ${prError instanceof Error ? prError.message : String(prError)}`);
      }
    }

    // Post-sync notifications (skip in test mode)
    if (!isTestMode) {
      if (result.errors.length > 0) {
        // On failure: open an Issue linked to the source PR
        await createFailureIssue(
          octokit, prNumber, inputs.targetLanguage, inputs.targetRepo, result.errors,
        );
      } else if (prUrl) {
        // On success: comment on the source PR
        await postSuccessComment(
          octokit, prNumber, inputs.targetLanguage, inputs.targetRepo, prUrl, result.processedFiles,
        );
      }
    }
}

// =============================================================================
// HELPERS - GitHub API content fetching
// =============================================================================

/**
 * Logger adapter: maps @actions/core to the Logger interface
 */
const coreLogger: Logger = {
  info: (msg: string) => core.info(msg),
  error: (msg: string) => core.error(msg),
  warning: (msg: string) => core.warning(msg),
};

/**
 * Fetch file content from a GitHub repo at a specific ref.
 * Returns empty string if file doesn't exist.
 */
async function fetchFileContent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  octokit: any,
  owner: string,
  repo: string,
  filepath: string,
  ref?: string,
): Promise<{ content: string; sha?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any = { owner, repo, path: filepath };
  if (ref) params.ref = ref;

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
  octokit: any,
  classified: ReturnType<typeof classifyChangedFiles>,
  inputs: ReturnType<typeof getInputs>,
  targetOwner: string,
  targetRepo: string,
  commitSha?: string,
): Promise<FileToSync[]> {
  const filesToSync: FileToSync[] = [];
  const sourceOwner = github.context.repo.owner;
  const sourceRepo = github.context.repo.repo;
  const sha = commitSha || github.context.sha;

  // Changed markdown files
  for (const file of classified.changedMarkdownFiles) {
    try {
      const { content: newContent } = await fetchFileContent(octokit, sourceOwner, sourceRepo, file.filename, sha);

      let oldContent = '';
      try {
        const result = await fetchFileContent(octokit, sourceOwner, sourceRepo, file.filename, `${sha}^`);
        oldContent = result.content;
      } catch {
        core.info(`${file.filename} is a new file`);
      }

      let targetContent = '';
      let existingFileSha: string | undefined;
      let isNewFile = false;

      try {
        const result = await fetchFileContent(octokit, targetOwner, targetRepo, file.filename);
        targetContent = result.content;
        existingFileSha = result.sha;
      } catch {
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
        sourceCommitSha: sha,
      });
    } catch (error) {
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
        } catch {
          core.info(`Could not get old content from ${previousFilename}`);
        }
      }

      let targetContent = '';
      let oldFileSha: string | undefined;

      if (previousFilename) {
        try {
          const result = await fetchFileContent(octokit, targetOwner, targetRepo, previousFilename);
          targetContent = result.content;
          oldFileSha = result.sha;
          core.info(`Found existing translation at ${previousFilename} - will transfer to ${file.filename}`);
        } catch {
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
        sourceCommitSha: sha,
      });
    } catch (error) {
      core.error(`Error fetching content for renamed file ${file.filename}: ${error}`);
    }
  }

  // TOC files
  for (const file of classified.changedTocFiles) {
    try {
      const { content: newContent } = await fetchFileContent(octokit, sourceOwner, sourceRepo, file.filename, sha);

      let existingFileSha: string | undefined;
      try {
        const result = await fetchFileContent(octokit, targetOwner, targetRepo, file.filename);
        existingFileSha = result.sha;
      } catch {
        core.info(`${file.filename} does not exist in target repo - will create it`);
      }

      filesToSync.push({
        filename: file.filename,
        type: 'toc',
        newContent,
        existingFileSha,
        isNewFile: !existingFileSha,
      });
    } catch (error) {
      core.error(`Error fetching content for TOC file ${file.filename}: ${error}`);
    }
  }

  // Removed files (markdown + TOC)
  for (const file of [...classified.removedMarkdownFiles, ...classified.removedTocFiles]) {
    try {
      let existingFileSha: string | undefined;
      try {
        const result = await fetchFileContent(octokit, targetOwner, targetRepo, file.filename);
        existingFileSha = result.sha;
      } catch {
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
    } catch (error) {
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
  octokit: any,
  prNumber: number,
): Promise<SourcePrInfo | undefined> {
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
        .map((label: any) => typeof label === 'string' ? label : label.name || '')
        .filter((name: string) => name && name !== 'test-translation'),
    };
  } catch (error) {
    core.warning(`Could not fetch source PR details: ${error}`);
    return undefined;
  }
}

/**
 * Fetch existing .translate/state/ file SHAs from the target repo.
 * These SHAs are needed so Octokit can update (rather than create) state files.
 * Missing state files are silently skipped — they'll be created as new files.
 */
async function fetchExistingStateShas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  octokit: any,
  targetOwner: string,
  targetRepo: string,
  filesToSync: FileToSync[],
  docsFolder: string,
): Promise<Map<string, string>> {
  const shas = new Map<string, string>();

  // Only need state SHAs for markdown and renamed files (ones that generate state)
  const markdownFiles = filesToSync.filter(f => f.type === 'markdown' || f.type === 'renamed' || f.type === 'removed');

  // Compute docs-folder-relative filenames for state paths (CLI uses docs-relative)
  for (const file of markdownFiles) {
    const docsRelName = docsFolder && file.filename.startsWith(docsFolder)
      ? file.filename.slice(docsFolder.length)
      : file.filename;
    const statePath = stateFileRelativePath(docsRelName);
    try {
      const { data } = await octokit.rest.repos.getContent({
        owner: targetOwner,
        repo: targetRepo,
        path: statePath,
      });
      if ('sha' in data) {
        shas.set(statePath, data.sha);
      }
    } catch {
      // State file doesn't exist yet — will be created
    }

    // For renamed files, also fetch the old state file SHA (for deletion)
    if (file.type === 'renamed' && file.previousFilename) {
      const oldDocsRelName = docsFolder && file.previousFilename.startsWith(docsFolder)
        ? file.previousFilename.slice(docsFolder.length)
        : file.previousFilename;
      const oldStatePath = stateFileRelativePath(oldDocsRelName);
      try {
        const { data } = await octokit.rest.repos.getContent({
          owner: targetOwner,
          repo: targetRepo,
          path: oldStatePath,
        });
        if ('sha' in data) {
          shas.set(oldStatePath, data.sha);
        }
      } catch {
        // Old state file doesn't exist — nothing to delete
      }
    }
  }

  if (shas.size > 0) {
    core.info(`Found ${shas.size} existing state file(s) in target repo`);
  }

  return shas;
}

// =============================================================================
// HELPERS - Post-sync notifications
// =============================================================================

/**
 * Post a success comment on the source PR after sync completes.
 */
async function postSuccessComment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  octokit: any,
  prNumber: number,
  targetLanguage: string,
  targetRepo: string,
  prUrl: string,
  processedFiles: string[],
): Promise<void> {
  try {
    const fileList = processedFiles.map(f => `- \`${f}\``).join('\n');
    const body = [
      `### ✅ Translation sync completed (${targetLanguage})`,
      '',
      `**Target repo**: ${targetRepo}`,
      `**Translation PR**: ${prUrl}`,
      `**Files synced** (${processedFiles.length}):`,
      fileList,
    ].join('\n');

    await octokit.rest.issues.createComment({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: prNumber,
      body,
    });
    core.info(`Posted success comment on PR #${prNumber}`);
  } catch (error) {
    core.warning(`Could not post success comment on PR #${prNumber}: ${error}`);
  }
}

/**
 * Create a GitHub Issue when sync fails, linked to the source PR.
 */
async function createFailureIssue(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  octokit: any,
  prNumber: number,
  targetLanguage: string,
  targetRepo: string,
  errors: string[],
): Promise<void> {
  try {
    const errorList = errors.map(e => `- ${e}`).join('\n');
    const title = `Translation sync failed for PR #${prNumber} (${targetLanguage})`;
    const body = [
      `### Translation sync failure`,
      '',
      `**Source PR**: #${prNumber}`,
      `**Target repo**: ${targetRepo}`,
      `**Target language**: ${targetLanguage}`,
      '',
      `### Errors`,
      '',
      errorList,
      '',
      `### Recovery`,
      '',
      `Once the issue is resolved, comment \`\\translate-resync\` on PR #${prNumber} to retry.`,
    ].join('\n');

    const { data: issue } = await octokit.rest.issues.create({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      title,
      body,
    });

    // Best-effort label — may fail if label doesn't exist in the repo
    try {
      await octokit.rest.issues.addLabels({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issue_number: issue.number,
        labels: ['translation-sync-failure'],
      });
    } catch (labelError) {
      core.warning(`Could not add label to failure issue #${issue.number}: ${labelError instanceof Error ? labelError.message : String(labelError)}`);
    }

    core.info(`Created failure issue #${issue.number}: ${issue.html_url}`);
  } catch (error) {
    core.warning(`Could not create failure issue: ${error}`);
  }
}

// Run the action
run();

import * as core from '@actions/core';
import * as github from '@actions/github';
import {
  getMode,
  getInputs,
  getReviewInputs,
  getRebaseInputs,
  validatePREvent,
  validateReviewPREvent,
} from './inputs.js';
import { TranslationReviewer } from './reviewer.js';
import {
  SyncOrchestrator,
  classifyChangedFiles,
  loadGlossary,
  formatGlossaryTerms,
  FileToSync,
  Logger,
  StateGenerationConfig,
} from './sync-orchestrator.js';
import {
  createTranslationPR,
  PrCreatorConfig,
  SourcePrInfo,
  parseTranslationSyncMetadata,
  TranslationSyncMetadata,
} from './pr-creator.js';
import { RebaseCache } from './types.js';
import { isTranslationBranch } from './branch-naming.js';
import { FAILURE_ISSUE_LABEL } from './contracts.js';
import { refreshStaleBranch } from './rebase-siblings.js';
import { stateFileRelativePath } from './cli/translate-state.js';
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
    } else if (mode === 'rebase') {
      await runRebase();
    } else {
      await runReview();
    }
  } catch (error) {
    // The stack is the only pointer into a 2.9 MB bundle — without it every
    // terminal failure reads as its message alone (#160). The run.cjs shim
    // enables source maps, so these frames decode to src/ locations.
    if (error instanceof Error && error.stack) {
      core.error(error.stack);
    }
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

  // Load glossary — through the same loader sync and rebase use, so a repo with
  // a custom glossary is reviewed against the terminology it was translated
  // against. Review used to read the built-in file directly and ignore
  // `glossary-path` entirely (#146), which mattered once verdict v2 made
  // `terminology` a gating category: judging against the wrong glossary
  // suppresses the gate and biases the shadow calibration data.
  let glossaryTerms: string | undefined;
  const targetLanguage = detectTargetLanguage();
  if (targetLanguage) {
    const builtInGlossaryDir = path.join(__dirname, '..', 'glossary');
    const glossary = await loadGlossary(
      targetLanguage,
      builtInGlossaryDir,
      inputs.glossaryPath || undefined,
      coreLogger
    );
    if (glossary) {
      glossaryTerms = formatGlossaryTerms(glossary, targetLanguage);
    }
  } else {
    core.warning(
      `Could not detect a target language from repository name '${github.context.repo.repo}' — ` +
        `reviewing WITHOUT a glossary, so terminology findings are unreliable.`
    );
  }

  // Run review
  const result = await reviewer.reviewPR(
    prNumber,
    inputs.sourceRepo,
    github.context.repo.owner,
    github.context.repo.repo,
    inputs.docsFolder,
    glossaryTerms,
    targetLanguage,
    inputs.autoMergeMode
  );

  // Set outputs
  core.setOutput('review-verdict', result.verdict);
  core.setOutput('translation-score', result.translationQuality.score.toString());
  core.setOutput('diff-score', result.diffQuality.score.toString());
  core.setOutput('review-recommendation', result.recommendation);
  core.setOutput('reviewed-head-sha', result.reviewedHeadSha);
  if (result.wouldAutoMerge !== undefined) {
    core.setOutput('would-auto-merge', String(result.wouldAutoMerge));
  }

  // Cost accounting — retries included (#164). Review runs on every
  // translation PR and previously emitted no token or call count at all.
  const usage = reviewer.getUsage();
  core.setOutput('input-tokens', String(usage.inputTokens));
  core.setOutput('output-tokens', String(usage.outputTokens));
  core.setOutput('api-calls', String(usage.apiCalls));
  core.info(
    `API usage: ${usage.apiCalls} call(s), ${usage.inputTokens} input + ${usage.outputTokens} output tokens`
  );

  core.info(
    `✅ Review complete: ${result.verdict} → ${result.recommendation} (Translation: ${result.translationQuality.score}/10, Diff: ${result.diffQuality.score}/10)`
  );
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

// =============================================================================
// REBASE MODE
// =============================================================================

/**
 * Run the REBASE mode - update conflicted translation sync PRs
 *
 * Triggered in the TARGET repo when a translation-sync PR is merged.
 * Finds other open translation-sync PRs, checks for conflicts, and
 * re-generates them against the updated main branch.
 *
 * Workflow:
 * 1. Validate this is a merged translation-sync PR
 * 2. List other open translation-sync PRs
 * 3. For each conflicted PR, parse metadata and re-run the sync pipeline
 * 4. Force-push the result to the existing PR branch
 * 5. Post a comment explaining the rebase
 */
async function runRebase(): Promise<void> {
  core.info('Getting rebase mode inputs...');
  const inputs = getRebaseInputs();

  // Validate this is a merged PR event
  const { eventName, payload } = github.context;
  if (
    eventName !== 'pull_request' ||
    payload.action !== 'closed' ||
    !payload.pull_request?.merged
  ) {
    core.info('Rebase mode requires a merged pull_request event. Exiting.');
    return;
  }

  const mergedPrNumber = payload.pull_request.number;
  const mergedBranch = payload.pull_request.head?.ref || '';

  // Only run when a translation PR is merged — sync or resync. Using the shared
  // predicate matters here: the workflow template fires for both prefixes, so a
  // narrower check would enter this function on a resync merge and return before
  // rebasing anything, which is a silent no-op rather than a visible failure.
  if (!isTranslationBranch(mergedBranch)) {
    core.info(
      `Merged PR #${mergedPrNumber} is not a translation PR (branch: ${mergedBranch}). Exiting.`
    );
    return;
  }

  core.info(
    `♻️ Translation PR #${mergedPrNumber} was merged. Checking for conflicted sibling PRs...`
  );

  const octokit = github.getOctokit(inputs.githubToken);
  const { owner, repo } = github.context.repo;

  // Find files touched by the merged PR (paginate — PRs can touch >30 files)
  const mergedPrFiles = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: mergedPrNumber,
    per_page: 100,
  });
  const mergedFilePaths = new Set(mergedPrFiles.map((f: { filename: string }) => f.filename));

  // List all open PRs in this repo (paginate — sibling PRs beyond 100 must still rebase)
  const openPRs = await octokit.paginate(octokit.rest.pulls.list, {
    owner,
    repo,
    state: 'open',
    per_page: 100,
  });

  // Filter to translation PRs this tool created — both the Action's sync branches
  // and the CLI's `resync/*` branches. Matching only the former left resync waves
  // permanently unrebased (issue #115).
  const siblingPRs = openPRs.filter(
    (pr: { head: { ref: string }; number: number }) =>
      isTranslationBranch(pr.head.ref) && pr.number !== mergedPrNumber
  );

  if (siblingPRs.length === 0) {
    core.info('No other open translation PRs found. Nothing to rebase.');
    return;
  }

  core.info(`Found ${siblingPRs.length} open translation PR(s). Checking for file overlaps...`);

  let rebasedCount = 0;
  let refreshedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const pr of siblingPRs) {
    try {
      // Parse metadata from PR body
      const metadata = parseTranslationSyncMetadata(pr.body || '');
      if (!metadata) {
        core.info(
          `PR #${pr.number}: No translation-sync metadata found — skipping (pre-metadata PR).`
        );
        skippedCount++;
        continue;
      }

      // Check file overlap
      const prFilePaths = metadata.files.map((f) => f.path);
      const overlapping = prFilePaths.filter((p) => mergedFilePaths.has(p));
      if (overlapping.length === 0) {
        // No overlap means no merge conflict, so there is nothing to re-translate. The
        // branch is still behind the new base though, and its checks are now stale —
        // which is the whole complaint in #115 for a `forward` wave, where every PR
        // touches a different lecture and so no two siblings ever overlap.
        if (!inputs.rebaseStaleSiblings) {
          core.info(`PR #${pr.number}: No file overlap with merged PR — skipping.`);
          skippedCount++;
          continue;
        }

        // Errors are handled here rather than by the outer catch: its comment advises
        // resolving conflicts or re-running the resync, which is wrong for a refresh —
        // nothing was translated and there is no conflict-resolution step to redo.
        try {
          const refreshed = await refreshStaleBranch(octokit, owner, repo, pr.number);
          if (refreshed) {
            core.info(`PR #${pr.number}: No overlap — refreshed against the new base.`);
            refreshedCount++;
          } else {
            core.info(`PR #${pr.number}: No overlap and already up to date — skipping.`);
            skippedCount++;
          }
        } catch (refreshError) {
          const msg = refreshError instanceof Error ? refreshError.message : String(refreshError);
          core.error(`PR #${pr.number}: Branch refresh failed — ${msg}`);
          errorCount++;
          try {
            await octokit.rest.issues.createComment({
              owner,
              repo,
              issue_number: pr.number,
              body: `⚠️ **Automatic branch refresh failed** after #${mergedPrNumber} was merged.\n\nError: ${msg}\n\nNo content was changed — this PR's branch is simply still behind \`main\`. Use the **Update branch** button on this PR, or merge \`main\` into the branch manually.`,
            });
          } catch {
            core.warning(`Could not post refresh-failure comment on PR #${pr.number}`);
          }
        }
        continue;
      }

      core.info(`PR #${pr.number}: ${overlapping.length} overlapping file(s) — rebasing...`);

      // Re-run the sync pipeline for this PR
      const outcome = await rebaseSinglePR(octokit, pr, metadata, inputs);
      if (outcome === 'skipped') {
        // Nothing was translated or pushed — a "rebased" comment here would
        // claim work that never happened.
        skippedCount++;
        continue;
      }
      rebasedCount++;

      // Post a comment on the rebased PR
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: pr.number,
        body: `♻️ **Automatically rebased** after #${mergedPrNumber} was merged.\n\nOverlapping files: ${overlapping.map((f) => `\`${f}\``).join(', ')}\n\nThe translation content is preserved; only unchanged sections were updated to match the current \`main\` branch. Please re-review if needed.`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      core.error(`PR #${pr.number}: Rebase failed — ${msg}`);
      errorCount++;

      // Post an error comment so the PR author knows
      try {
        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: pr.number,
          body: `⚠️ **Automatic rebase failed** after #${mergedPrNumber} was merged.\n\nError: ${msg}\n\nYou may need to manually resolve conflicts or run \`/translate-resync\` on the source PR.`,
        });
      } catch {
        core.warning(`Could not post error comment on PR #${pr.number}`);
      }
    }
  }

  const refreshedNote = inputs.rebaseStaleSiblings ? `, ${refreshedCount} refreshed` : '';
  const summary = `♻️ Rebase complete: ${rebasedCount} rebased${refreshedNote}, ${skippedCount} skipped, ${errorCount} errors.`;
  if (errorCount > 0) {
    // A rebase run that failed PRs must fail the workflow — every error above
    // was caught per-PR, so without this the run reports green (#160/F37).
    core.setFailed(summary);
  } else {
    core.info(summary);
  }
}

/**
 * Re-run the sync pipeline for a single translation PR and force-push the result.
 *
 * Returns 'rebased' only when the branch was actually reset and re-pushed;
 * 'skipped' when there was nothing to do. Throws — before any branch reset —
 * when translation produced errors: force-resetting first and committing only
 * the successful files would silently drop the errored files' translations
 * from the PR while reporting success (#160/F37).
 */
async function rebaseSinglePR(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  octokit: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pr: any,
  metadata: TranslationSyncMetadata,
  inputs: ReturnType<typeof getRebaseInputs>
): Promise<'rebased' | 'skipped'> {
  const { owner, repo } = github.context.repo;
  const [sourceOwner, sourceRepoName] = metadata.sourceRepo.split('/');
  const sourceCommitSha = metadata.sourceCommitSha;

  // Fetch content for each file and build FileToSync array
  const filesToSync: FileToSync[] = [];
  const fetchErrors: string[] = [];

  for (const file of metadata.files) {
    // Determine file type from metadata (default to 'markdown' for backward compat)
    const fileType = file.type || 'markdown';

    try {
      if (fileType === 'removed') {
        // Removed files: just need the existing target SHA for deletion
        let existingFileSha: string | undefined;
        try {
          const result = await fetchFileContent(octokit, owner, repo, file.path);
          existingFileSha = result.sha;
        } catch {
          core.info(`${file.path}: Already gone from target repo — skip deletion`);
          continue;
        }

        filesToSync.push({
          filename: file.path,
          type: 'removed',
          existingFileSha,
          isNewFile: false,
        });
        continue;
      }

      if (fileType === 'toc') {
        // TOC files: copy from source as-is (no translation)
        let newContent = '';
        try {
          const { content } = await fetchFileContent(
            octokit,
            sourceOwner,
            sourceRepoName,
            file.path,
            sourceCommitSha
          );
          newContent = content;
        } catch {
          core.info(`${file.path}: Could not fetch TOC content — skipping`);
          continue;
        }

        let existingFileSha: string | undefined;
        try {
          const result = await fetchFileContent(octokit, owner, repo, file.path);
          existingFileSha = result.sha;
        } catch {
          // New TOC file
        }

        filesToSync.push({
          filename: file.path,
          type: 'toc',
          newContent,
          existingFileSha,
          isNewFile: !existingFileSha,
        });
        continue;
      }

      // markdown and renamed: fetch source content
      let newContent = '';
      try {
        const { content } = await fetchFileContent(
          octokit,
          sourceOwner,
          sourceRepoName,
          file.path,
          sourceCommitSha
        );
        newContent = content;
      } catch {
        core.info(`${file.path}: Could not fetch source content at ${sourceCommitSha} — skipping`);
        continue;
      }

      let oldContent = '';
      try {
        const result = await fetchFileContent(
          octokit,
          sourceOwner,
          sourceRepoName,
          file.path,
          `${sourceCommitSha}^`
        );
        oldContent = result.content;
      } catch {
        core.info(`${file.path}: New file (no parent commit content)`);
      }

      if (fileType === 'renamed' && file.previousPath) {
        // Renamed files: fetch target content from old path
        let targetContent = '';
        let oldFileSha: string | undefined;

        try {
          const result = await fetchFileContent(octokit, owner, repo, file.previousPath);
          targetContent = result.content;
          oldFileSha = result.sha;
        } catch {
          core.info(`${file.previousPath}: Previous path not found in target repo`);
        }

        filesToSync.push({
          filename: file.path,
          type: 'renamed',
          newContent,
          oldContent,
          targetContent,
          previousFilename: file.previousPath,
          oldFileSha,
          isNewFile: !targetContent,
          sourceCommitSha,
        });
      } else {
        // Default: markdown file
        let targetContent = '';
        let existingFileSha: string | undefined;
        let isNewFile = false;

        try {
          const result = await fetchFileContent(octokit, owner, repo, file.path);
          targetContent = result.content;
          existingFileSha = result.sha;
        } catch {
          isNewFile = true;
          core.info(`${file.path}: Not found in target repo — treating as new file`);
        }

        filesToSync.push({
          filename: file.path,
          type: 'markdown',
          newContent,
          oldContent,
          targetContent,
          existingFileSha,
          isNewFile,
          sourceCommitSha,
        });
      }
    } catch (error) {
      core.error(`Error fetching content for ${file.path}: ${error}`);
      fetchErrors.push(`${file.path}: ${error}`);
    }
  }

  // Same rule as translation errors (#160): throw BEFORE any branch reset —
  // rebasing without a file the metadata says the PR carries would drop it.
  if (fetchErrors.length > 0) {
    throw new Error(
      `content fetch failed for ${fetchErrors.length} file(s); branch left untouched: ${fetchErrors.join('; ')}`
    );
  }

  if (filesToSync.length === 0) {
    core.info(`PR #${pr.number}: No files to process after content fetch. Skipping.`);
    return 'skipped';
  }

  // Load glossary
  const builtInGlossaryDir = path.join(__dirname, '..', 'glossary');
  const glossary = await loadGlossary(
    metadata.targetLanguage,
    builtInGlossaryDir,
    inputs.glossaryPath || undefined,
    coreLogger
  );

  // Build rebase cache: read existing translations from PR branch and old target
  // baseline to skip redundant Claude API calls during re-translation
  let rebaseCache: RebaseCache | undefined;
  const targetBaseSha = metadata.targetBaseSha;
  if (targetBaseSha) {
    rebaseCache = new Map();
    const prBranch = pr.head.ref;

    for (const file of filesToSync) {
      try {
        // Read the previously translated file from the PR branch
        const { content: previousTranslation } = await fetchFileContent(
          octokit,
          owner,
          repo,
          file.filename,
          prBranch
        );

        // Read the old target baseline (what target main looked like when PR was created)
        const { content: oldTargetContent } = await fetchFileContent(
          octokit,
          owner,
          repo,
          file.filename,
          targetBaseSha
        );

        rebaseCache.set(file.filename, { previousTranslation, oldTargetContent });
        core.info(`${file.filename}: Loaded rebase cache (previous translation + old baseline)`);
      } catch {
        core.info(`${file.filename}: Could not load rebase cache — will re-translate`);
      }
    }

    if (rebaseCache.size > 0) {
      core.info(
        `Rebase cache loaded for ${rebaseCache.size} file(s) — unchanged sections will skip Claude API calls`
      );
    } else {
      rebaseCache = undefined;
    }
  } else {
    core.info('No targetBaseSha in metadata — rebase cache unavailable (pre-cache PR)');
  }

  // Fetch existing state file SHAs — the branch was reset to main, so state files
  // from main exist and need their SHAs for createOrUpdateFileContents to succeed
  const existingStateShas = await fetchExistingStateShas(
    octokit,
    owner,
    repo,
    filesToSync,
    inputs.docsFolder
  );
  const stateConfig: StateGenerationConfig = {
    sourceCommitSha,
    existingStateShas,
    docsFolder: inputs.docsFolder,
  };

  // Run the sync orchestrator
  const orchestrator = new SyncOrchestrator(
    {
      sourceLanguage: metadata.sourceLanguage,
      targetLanguage: metadata.targetLanguage,
      claudeModel: metadata.claudeModel,
      anthropicApiKey: inputs.anthropicApiKey,
      debugMode: true,
    },
    coreLogger,
    stateConfig
  );

  const result = await orchestrator.processFiles(filesToSync, glossary, rebaseCache);

  // Throw BEFORE any branch reset: committing only the successful files onto a
  // freshly-reset branch drops the errored files' previous translations from
  // the PR, then the caller comments "content is preserved" on it.
  if (result.errors.length > 0) {
    throw new Error(
      `translation produced ${result.errors.length} error(s); branch left untouched: ${result.errors.join('; ')}`
    );
  }

  if (result.translatedFiles.length === 0 && result.filesToDelete.length === 0) {
    core.info(`PR #${pr.number}: No translated files produced. Skipping force-push.`);
    return 'skipped';
  }

  // Force-push: delete the old branch and recreate from current main
  const branchName = pr.head.ref;
  const branchRef = `heads/${branchName}`;

  // Get current main SHA
  const { data: defaultBranchData } = await octokit.rest.repos.get({ owner, repo });
  const { data: mainRef } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${defaultBranchData.default_branch}`,
  });
  const newBaseSha = mainRef.object.sha;

  // Reset the branch to current main
  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref: branchRef,
    sha: newBaseSha,
    force: true,
  });

  // Commit translated files to the branch
  for (const file of result.translatedFiles) {
    // Get the SHA of this file on the newly-reset branch (it now matches main)
    let fileSha: string | undefined;
    try {
      const { sha } = await fetchFileContent(octokit, owner, repo, file.path, branchName);
      fileSha = sha;
    } catch {
      // File doesn't exist on this branch yet — that's fine
    }

    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: file.path,
      message: `Update translation: ${file.path}`,
      content: Buffer.from(file.content).toString('base64'),
      branch: branchName,
      sha: fileSha,
    });
  }

  // Delete removed files
  for (const file of result.filesToDelete) {
    try {
      const { sha } = await fetchFileContent(octokit, owner, repo, file.path, branchName);
      await octokit.rest.repos.deleteFile({
        owner,
        repo,
        path: file.path,
        message: `Delete removed file: ${file.path}`,
        branch: branchName,
        sha,
      });
    } catch {
      core.info(`${file.path}: Not found on branch — skip deletion`);
    }
  }

  core.info(
    `PR #${pr.number}: Successfully rebased with ${result.translatedFiles.length} file(s).`
  );
  return 'rebased';
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
  const { merged, prNumber, isTestMode, isResync, resyncLanguage } = validatePREvent(
    github.context,
    inputs.testMode
  );

  if (!merged) {
    core.info('PR was not merged. Exiting.');
    return;
  }

  // If resync targets a specific language, skip if this workflow doesn't match
  if (isResync && resyncLanguage && resyncLanguage !== inputs.targetLanguage) {
    core.info(
      `Resync requested for '${resyncLanguage}', skipping (this workflow targets '${inputs.targetLanguage}').`
    );
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

  // Get changed files from PR (paginate — PRs can touch >30 files)
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    pull_number: prNumber,
  });

  // Classify files into categories
  const classified = classifyChangedFiles(files, inputs.docsFolder);

  if (
    classified.changedMarkdownFiles.length === 0 &&
    classified.changedTocFiles.length === 0 &&
    classified.removedMarkdownFiles.length === 0 &&
    classified.removedTocFiles.length === 0 &&
    classified.renamedMarkdownFiles.length === 0
  ) {
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
    coreLogger
  );

  // Fetch content and build FileToSync array
  const [targetOwner, targetRepo] = inputs.targetRepo.split('/');
  const { files: filesToSync, errors: fetchErrors } = await fetchAllFileContents(
    octokit,
    classified,
    inputs,
    targetOwner,
    targetRepo,
    effectiveSha
  );

  // Fetch existing state file SHAs from target repo for state generation
  const existingStateShas = await fetchExistingStateShas(
    octokit,
    targetOwner,
    targetRepo,
    filesToSync,
    inputs.docsFolder
  );

  const stateConfig: StateGenerationConfig = {
    sourceCommitSha: effectiveSha,
    existingStateShas,
    docsFolder: inputs.docsFolder,
  };

  // Process files through the orchestrator
  const orchestrator = new SyncOrchestrator(
    {
      sourceLanguage: inputs.sourceLanguage,
      targetLanguage: inputs.targetLanguage,
      claudeModel: inputs.claudeModel,
      anthropicApiKey: inputs.anthropicApiKey,
      debugMode: true,
    },
    coreLogger,
    stateConfig
  );

  const result = await orchestrator.processFiles(filesToSync, glossary);

  // Fetch failures count as processing errors: they fail the run and open a
  // failure issue instead of shipping a PR that silently misses files.
  result.errors.unshift(...fetchErrors);

  // Report results
  const hasErrors = result.errors.length > 0;
  if (hasErrors) {
    core.setFailed(`Translation completed with ${result.errors.length} errors`);
  } else {
    core.info(`Successfully processed ${result.processedFiles.length} files`);
  }

  // Cost accounting — retries included, which per-file token counts miss (#164).
  const usage = orchestrator.getUsage();
  core.setOutput('input-tokens', String(usage.inputTokens));
  core.setOutput('output-tokens', String(usage.outputTokens));
  core.setOutput('api-calls', String(usage.apiCalls));
  core.info(
    `API usage: ${usage.apiCalls} call(s), ${usage.inputTokens} input + ${usage.outputTokens} output tokens`
  );

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

      // Build file metadata with type info for rebase mode
      const fileMetadata = filesToSync.map((f) => {
        const entry: { path: string; type: string; previousPath?: string } = {
          path: f.filename,
          type: f.type,
        };
        if (f.type === 'renamed' && f.previousFilename) {
          entry.previousPath = f.previousFilename;
        }
        return entry;
      });

      const prResult = await createTranslationPR(
        octokit,
        result.translatedFiles,
        result.filesToDelete,
        prConfig,
        coreLogger,
        sourcePrInfo,
        result.skippedSections,
        fileMetadata,
        result.droppedTargetSections
      );

      prUrl = prResult.prUrl;
      core.setOutput('pr-url', prResult.prUrl);
      core.setOutput('files-synced', result.processedFiles.length.toString());
    } catch (prError) {
      core.setFailed(
        `Failed to create PR: ${prError instanceof Error ? prError.message : String(prError)}`
      );
      result.errors.push(
        `PR creation failed: ${prError instanceof Error ? prError.message : String(prError)}`
      );
    }
  }

  // Post-sync notifications (skip in test mode)
  if (!isTestMode) {
    if (result.errors.length > 0) {
      // On failure: open an Issue linked to the source PR
      await createFailureIssue(
        octokit,
        prNumber,
        inputs.targetLanguage,
        inputs.targetRepo,
        result.errors
      );
    } else if (prUrl) {
      // On success: comment on the source PR
      await postSuccessComment(
        octokit,
        prNumber,
        inputs.targetLanguage,
        inputs.targetRepo,
        prUrl,
        result.processedFiles
      );
      // ...and close any failure issues earlier runs opened for this PR.
      await closeFailureIssues(octokit, prNumber, inputs.targetLanguage, prUrl);
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
  ref?: string
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
  commitSha?: string
): Promise<{ files: FileToSync[]; errors: string[] }> {
  const filesToSync: FileToSync[] = [];
  // Fetch failures are returned, not swallowed: a transient 5xx on one file
  // used to yield a PR missing that file plus a success comment and a green
  // check (#165/F121 — #90 defect 3).
  const fetchErrors: string[] = [];
  const sourceOwner = github.context.repo.owner;
  const sourceRepo = github.context.repo.repo;
  const sha = commitSha || github.context.sha;

  // Changed markdown files
  for (const file of classified.changedMarkdownFiles) {
    try {
      const { content: newContent } = await fetchFileContent(
        octokit,
        sourceOwner,
        sourceRepo,
        file.filename,
        sha
      );

      let oldContent = '';
      try {
        const result = await fetchFileContent(
          octokit,
          sourceOwner,
          sourceRepo,
          file.filename,
          `${sha}^`
        );
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
      fetchErrors.push(`Fetch failed (markdown): ${file.filename}: ${error}`);
    }
  }

  // Renamed markdown files
  for (const file of classified.renamedMarkdownFiles) {
    try {
      const { content: newContent } = await fetchFileContent(
        octokit,
        sourceOwner,
        sourceRepo,
        file.filename,
        sha
      );
      const previousFilename = file.previous_filename;

      let oldContent = '';
      if (previousFilename) {
        try {
          const result = await fetchFileContent(
            octokit,
            sourceOwner,
            sourceRepo,
            previousFilename,
            `${sha}^`
          );
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
          core.info(
            `Found existing translation at ${previousFilename} - will transfer to ${file.filename}`
          );
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
      fetchErrors.push(`Fetch failed (renamed): ${file.filename}: ${error}`);
    }
  }

  // TOC files
  for (const file of classified.changedTocFiles) {
    try {
      const { content: newContent } = await fetchFileContent(
        octokit,
        sourceOwner,
        sourceRepo,
        file.filename,
        sha
      );

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
      fetchErrors.push(`Fetch failed (toc): ${file.filename}: ${error}`);
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
      fetchErrors.push(`Fetch failed (removed): ${file.filename}: ${error}`);
    }
  }

  return { files: filesToSync, errors: fetchErrors };
}

/**
 * Fetch source PR title and labels for the translation PR body.
 */
async function fetchSourcePrInfo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  octokit: any,
  prNumber: number
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
        .map((label: any) => (typeof label === 'string' ? label : label.name || ''))
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
  docsFolder: string
): Promise<Map<string, string>> {
  const shas = new Map<string, string>();

  // Only need state SHAs for markdown and renamed files (ones that generate state)
  const markdownFiles = filesToSync.filter(
    (f) => f.type === 'markdown' || f.type === 'renamed' || f.type === 'removed'
  );

  // Compute docs-folder-relative filenames for state paths (CLI uses docs-relative)
  for (const file of markdownFiles) {
    const docsRelName =
      docsFolder && file.filename.startsWith(docsFolder)
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
      const oldDocsRelName =
        docsFolder && file.previousFilename.startsWith(docsFolder)
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
  processedFiles: string[]
): Promise<void> {
  try {
    const fileList = processedFiles.map((f) => `- \`${f}\``).join('\n');
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
 * Close open failure issues for this PR once a sync succeeds.
 *
 * Close-on-recovery is the deliberate half of the issue lifecycle: every failed
 * run opens a fresh issue (deduping at creation is check-then-act, which races
 * under this repo's concurrency — refused in D-2026-07-16), so a recovered PR
 * is where the pile gets cleaned up. Issues are matched by their exact
 * deterministic title, not by label — the label is applied best-effort and may
 * be missing.
 */
async function closeFailureIssues(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  octokit: any,
  prNumber: number,
  targetLanguage: string,
  prUrl: string
): Promise<void> {
  try {
    const title = `Translation sync failed for PR #${prNumber} (${targetLanguage})`;
    const openIssues = await octokit.paginate(octokit.rest.issues.listForRepo, {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      state: 'open',
      per_page: 100,
    });
    const stale = openIssues.filter(
      (issue: { title: string; pull_request?: unknown }) =>
        issue.title === title && !issue.pull_request
    );

    for (const issue of stale) {
      await octokit.rest.issues.createComment({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issue_number: issue.number,
        body: `✅ A later sync for PR #${prNumber} (${targetLanguage}) succeeded: ${prUrl}\n\nClosing this failure report.`,
      });
      await octokit.rest.issues.update({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issue_number: issue.number,
        state: 'closed',
        state_reason: 'completed',
      });
      core.info(`Closed recovered failure issue #${issue.number}`);
    }
  } catch (error) {
    core.warning(`Could not close failure issues for PR #${prNumber}: ${error}`);
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
  errors: string[]
): Promise<void> {
  try {
    const errorList = errors.map((e) => `- ${e}`).join('\n');
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
        labels: [FAILURE_ISSUE_LABEL],
      });
    } catch (labelError) {
      core.warning(
        `Could not add label to failure issue #${issue.number}: ${labelError instanceof Error ? labelError.message : String(labelError)}`
      );
    }

    core.info(`Created failure issue #${issue.number}: ${issue.html_url}`);
  } catch (error) {
    core.warning(`Could not create failure issue: ${error}`);
  }
}

// Run the action
run();

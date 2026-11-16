import * as core from '@actions/core';
import * as github from '@actions/github';
import {
  getMode,
  getInputs,
  getRebaseInputs,
  validatePREvent,
  mergedIntoDefaultBranch,
} from './inputs.js';
import {
  SyncOrchestrator,
  classifyChangedFiles,
  findRenamesOut,
  isDocsMarkdownPath,
  loadGlossary,
  FileToSync,
  StateGenerationConfig,
  SyncProcessingResult,
} from './sync-orchestrator.js';
import {
  createTranslationPR,
  PrCreatorConfig,
  SourcePrInfo,
  parseTranslationSyncMetadata,
  TranslationSyncMetadata,
} from './pr-creator.js';
import { RebaseCache } from './types.js';
import { BibliographySources, BibFile, parseBibtexBibfiles } from './bibliography.js';
import { isTranslationBranch } from './branch-naming.js';
import { FAILURE_ISSUE_LABEL } from './contracts.js';
import { refreshStaleBranch } from './rebase-siblings.js';
import { writeRebasedBranch } from './git-commit.js';
import { DeletedLecture, planRebaseRead, RebaseReadError, RebaseReads } from './rebase-plan.js';
import { stateFileRelativePath } from './cli/translate-state.js';
import {
  applySyncScope,
  buildScopeSummary,
  nothingToSync,
  refuseUnreadLectures,
  ScopedFiles,
  stateFileFor,
  writeJobSummary,
} from './sync-scope.js';
import {
  findLectureSetGaps,
  formatLectureSetSummary,
  LectureSetReport,
  placeOnLectureSet,
} from './sync-lecture-set.js';
import {
  checkSyncPremise,
  githubPremiseReader,
  StateReads,
  takesUpdateMode,
} from './sync-premise.js';
import {
  buildFailureIssueBody,
  failureIssueTitle,
  FailureIssueInput,
  rebaseFailureComment,
} from './recovery-advice.js';
import { runReview } from './action/review.js';
import { coreLogger } from './action/core-logger.js';
import { getBuiltInGlossaryDir } from './runtime-paths.js';

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
      await runReview(getBuiltInGlossaryDir());
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
  let closedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const pr of siblingPRs) {
    // Read again by the failure comment below, which names the PR's source PR
    // and its overlapping lectures.
    let metadata: TranslationSyncMetadata | undefined;
    let overlapping: string[] = [];
    try {
      // Parse metadata from PR body
      metadata = parseTranslationSyncMetadata(pr.body || '');
      if (!metadata) {
        core.info(
          `PR #${pr.number}: No translation-sync metadata found — skipping (pre-metadata PR).`
        );
        skippedCount++;
        continue;
      }

      // Check file overlap
      const prFilePaths = metadata.files.map((f) => f.path);
      overlapping = prFilePaths.filter((p) => mergedFilePaths.has(p));
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
      const outcome = await rebaseSinglePR(octokit, pr, metadata, inputs, mergedPrNumber);
      if (outcome === 'skipped') {
        // Nothing was translated or pushed — a "rebased" comment here would
        // claim work that never happened.
        skippedCount++;
        continue;
      }
      if (outcome === 'closed') {
        // Its rebuilt content is already on main: writeRebasedBranch said so
        // on the PR and closed it, leaving the branch as it was (#280).
        closedCount++;
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
          // Built in recovery-advice.ts (#281): the CLI route, and a resync
          // of the source PR only for a sync PR, under #276's precondition.
          body: rebaseFailureComment({
            mergedPrNumber,
            error: msg,
            metadata,
            overlapping,
            docsFolder: inputs.docsFolder,
            deletedSinceOpened:
              error instanceof RebaseReadError ? error.deletedSinceOpened : undefined,
          }),
        });
      } catch {
        core.warning(`Could not post error comment on PR #${pr.number}`);
      }
    }
  }

  const refreshedNote = inputs.rebaseStaleSiblings ? `, ${refreshedCount} refreshed` : '';
  const closedNote = closedCount > 0 ? `, ${closedCount} closed (nothing left to carry)` : '';
  const summary = `♻️ Rebase complete: ${rebasedCount} rebased${refreshedNote}${closedNote}, ${skippedCount} skipped, ${errorCount} errors.`;
  if (errorCount > 0) {
    // A rebase run that failed PRs must fail the workflow — every error above
    // was caught per-PR, so without this the run reports green (#160/F37).
    core.setFailed(summary);
  } else {
    core.info(summary);
  }
}

/**
 * Re-run the sync pipeline for a single translation PR and move its branch to
 * the result: one commit on the default branch, pinned when this PR's rebase
 * began, written by `writeRebasedBranch` (#280).
 *
 * Returns 'rebased' when the branch moved; 'closed' when the rebuilt content
 * was already on the default branch, so the PR was closed with a comment and
 * its branch left alone; 'skipped' when there was nothing to do. Throws, with
 * the branch where it was, when a content fetch or the translation failed
 * (#165, #160/F37: committing only the files that succeeded would drop the
 * others' translations while reporting success) or when the commit could not
 * be built; and throws after the move when the PR did not stay open.
 */
async function rebaseSinglePR(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  octokit: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pr: any,
  metadata: TranslationSyncMetadata,
  inputs: ReturnType<typeof getRebaseInputs>,
  mergedPrNumber: number
): Promise<'rebased' | 'skipped' | 'closed'> {
  const { owner, repo } = github.context.repo;
  const [sourceOwner, sourceRepoName] = metadata.sourceRepo.split('/');
  const sourceCommitSha = metadata.sourceCommitSha;

  // Pin the default branch once, before any read (#280). Every target read
  // below is made at this SHA, and the rebased commit's only parent is it. A
  // merge that lands while this PR is being rebuilt then leaves the branch
  // behind main, a visible conflict that the merge's own queued run repairs,
  // instead of a commit built from pre-merge content that silently reverts it.
  const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
  const baseBranch: string = repoData.default_branch;
  const { data: baseRef } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${baseBranch}`,
  });
  const baseSha: string = baseRef.object.sha;
  core.info(`PR #${pr.number}: rebasing onto ${baseBranch} at ${baseSha.slice(0, 7)}`);

  // Fetch content for each file and build FileToSync array
  const filesToSync: FileToSync[] = [];
  const fetchErrors: string[] = [];
  // Lectures carried unchanged from the PR's branch (#351), and lectures a PR
  // merged since this one opened deleted (#389).
  const carried: Array<{ path: string; content: string }> = [];
  const deletedSinceOpened: DeletedLecture[] = [];

  for (const file of metadata.files) {
    // Determine file type from metadata (default to 'markdown' for backward compat)
    const fileType = file.type || 'markdown';

    try {
      if (fileType === 'removed') {
        // Removed files: just need the existing target SHA for deletion. Only
        // a 404 means main no longer has the file (#396): any other answer
        // throws, and the rebase stops before the branch moves, where taking
        // it as gone would drop the deletion from the PR.
        let existingFileSha: string | undefined;
        try {
          const result = await fetchFileContent(octokit, owner, repo, file.path, baseSha);
          existingFileSha = result.sha;
        } catch (error) {
          const status = (error as { status?: number } | null | undefined)?.status;
          if (status !== 404) {
            throw new Error(
              `Could not read ${file.path} from ${owner}/${repo} at ${baseSha.slice(0, 7)} ` +
                `(status ${status ?? 'unknown'}): ${error}`
            );
          }
          core.info(`${file.path}: Already gone from target repo`);
          // A lecture already gone can leave its state file behind: the entry
          // without a SHA lets the orchestrator delete that alone.
          if (!file.path.endsWith('.md')) continue;
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
        // TOC files: mirrored from source, with the target's localised part
        // captions carried forward (#254) — same as the sync path.
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
        let targetContent: string | undefined;
        try {
          const result = await fetchFileContent(octokit, owner, repo, file.path, baseSha);
          existingFileSha = result.sha;
          targetContent = result.content;
        } catch (error) {
          // Same rule as the sync path: 404 is a first delivery; anything else
          // fails the fetch rather than silently re-copying English captions.
          const status = (error as { status?: number } | null | undefined)?.status;
          if (status !== 404) {
            throw new Error(
              `Could not read ${file.path} from ${owner}/${repo} ` +
                `(status ${status ?? 'unknown'}): ${error}`
            );
          }
        }

        filesToSync.push({
          filename: file.path,
          type: 'toc',
          newContent,
          targetContent,
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

      // Where the edition holds the lecture until this PR moves it: the old
      // path for a rename. A PR opened before #307's fix can record an old
      // path outside the docs folder; that one is rebuilt as a plain lecture,
      // so the edition's own file there is neither read as a translation nor
      // deleted.
      const renamed =
        fileType === 'renamed' &&
        file.previousPath !== undefined &&
        isDocsMarkdownPath(file.previousPath, inputs.docsFolder);
      const editionPath = renamed && file.previousPath ? file.previousPath : file.path;

      // What the edition has decides what the rebase does with the lecture
      // (#389, #351; see rebase-plan.ts). The other reads are made only when
      // `main` answers 404.
      const onMain = await readEditionFile(octokit, owner, repo, editionPath, baseSha);
      const reads: RebaseReads = { onMain: onMain.status };
      let newOnMain: EditionRead | undefined;
      let atBaseline: EditionRead | undefined;
      let onBranch: EditionRead | undefined;
      if (onMain.status === 'missing' && renamed) {
        newOnMain = await readEditionFile(octokit, owner, repo, file.path, baseSha);
        reads.newPathOnMain = newOnMain.status;
      }
      const newPathSettles = newOnMain?.status === 'found' || newOnMain?.status === 'error';
      if (onMain.status === 'missing' && !newPathSettles && metadata.targetBaseSha) {
        atBaseline = await readEditionFile(
          octokit,
          owner,
          repo,
          editionPath,
          metadata.targetBaseSha
        );
        reads.atBaseline = atBaseline.status;
        if (atBaseline.status !== 'error') {
          onBranch = await readEditionFile(octokit, owner, repo, file.path, pr.head.ref);
          reads.onBranch = onBranch.status;
        }
      }
      const plan = planRebaseRead(reads);
      const failure = (read: EditionRead | undefined) =>
        read?.status === 'error' ? read.message : 'unknown';

      if (plan.action === 'error') {
        switch (plan.reason) {
          case 'main-read': {
            const [path, read] =
              onMain.status === 'error' ? [editionPath, onMain] : [file.path, newOnMain];
            throw new Error(
              `Could not read ${path} from ${owner}/${repo} at ${baseSha.slice(0, 7)} ` +
                `(${failure(read)})`
            );
          }
          case 'baseline-read':
            throw new Error(
              `Could not read ${editionPath} at this PR's baseline ` +
                `${metadata.targetBaseSha?.slice(0, 7)} (${failure(atBaseline)})`
            );
          case 'branch-read':
            throw new Error(`Could not read ${file.path} on ${pr.head.ref} (${failure(onBranch)})`);
          case 'no-baseline':
            throw new Error(
              `${editionPath} is not on ${baseBranch}, and this PR records no baseline (it ` +
                'predates the rebase cache), so a lecture deleted since it opened cannot be ' +
                'told from one it adds. It was not translated from scratch'
            );
        }
      }
      if (plan.action === 'deleted-since-opened') {
        deletedSinceOpened.push({ editionPath, path: file.path });
        throw new Error(
          `${editionPath} was on ${baseBranch} when this PR opened ` +
            `(${metadata.targetBaseSha?.slice(0, 7)}) and is not there now ` +
            `(${baseSha.slice(0, 7)}): a PR merged since deleted it, so this PR's change to it ` +
            'was not carried'
        );
      }
      if (plan.action === 'drop') {
        // Deleted from main since the PR opened, and off its branch too:
        // nothing to bring back, so the rebuilt PR goes without it.
        core.info(
          `${editionPath}: deleted from ${baseBranch} since this PR opened, and ${file.path} is ` +
            `no longer on ${pr.head.ref}: nothing to carry`
        );
        continue;
      }
      if (plan.action === 'carry' && onBranch?.status === 'found') {
        // The PR adds the lecture, and its branch has the translation: carry
        // it and its state file as they are, with no model call (#351).
        const statePath = stateFileFor(file.path, inputs.docsFolder);
        const state = await readEditionFile(octokit, owner, repo, statePath, pr.head.ref);
        if (state.status === 'error') {
          throw new Error(`Could not read ${statePath} on ${pr.head.ref} (${state.message})`);
        }
        carried.push({ path: file.path, content: onBranch.content });
        if (state.status === 'found') carried.push({ path: statePath, content: state.content });
        core.info(
          `${file.path}: new to the edition and on ${pr.head.ref}: carried unchanged` +
            (state.status === 'found' ? ', with its state file' : '')
        );
        continue;
      }

      if (plan.action === 'update-at-new-path' && newOnMain?.status === 'found') {
        // Another PR already made this move: the edition has the lecture at
        // its new path, so the rebuild updates that file and deletes nothing.
        core.info(
          `${file.path}: on ${baseBranch} already, and ${editionPath} is not: rebuilt as an ` +
            `update of ${file.path}`
        );
        filesToSync.push({
          filename: file.path,
          type: 'markdown',
          newContent,
          oldContent,
          targetContent: newOnMain.content,
          existingFileSha: newOnMain.sha,
          isNewFile: false,
          sourceCommitSha,
        });
        continue;
      }

      // 'update', or 'translate-new' for a lecture the PR never delivered.
      const target = onMain.status === 'found' ? onMain : undefined;
      if (!target) {
        core.info(
          `${editionPath}: not in the edition, at this PR's baseline or on its branch: ` +
            'translating as new'
        );
      }
      if (renamed) {
        filesToSync.push({
          filename: file.path,
          type: 'renamed',
          newContent,
          oldContent,
          targetContent: target?.content ?? '',
          previousFilename: file.previousPath,
          oldFileSha: target?.sha,
          isNewFile: !target?.content,
          sourceCommitSha,
        });
      } else {
        filesToSync.push({
          filename: file.path,
          type: 'markdown',
          newContent,
          oldContent,
          targetContent: target?.content ?? '',
          existingFileSha: target?.sha,
          isNewFile: !target,
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
    throw new RebaseReadError(
      `content fetch failed for ${fetchErrors.length} file(s); branch left untouched: ${fetchErrors.join('; ')}`,
      deletedSinceOpened
    );
  }

  if (filesToSync.length === 0 && carried.length === 0) {
    core.info(`PR #${pr.number}: No files to process after content fetch. Skipping.`);
    return 'skipped';
  }

  // Load glossary
  const builtInGlossaryDir = getBuiltInGlossaryDir();
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

  // The state files main holds at the pinned SHA. The orchestrator deletes a
  // removed or renamed lecture's state file only when main has one, and the
  // rebased commit is built on that same SHA, so the two agree. A read that
  // failed leaves that unknown, so it stops the rebase before the branch
  // moves (#396), as a failed content read does.
  const { shas: existingStateShas, reads: stateReads } = await fetchExistingStateShas(
    octokit,
    owner,
    repo,
    filesToSync,
    inputs.docsFolder,
    baseSha
  );
  const unreadStates = holdUnreadDeletionStates(
    filesToSync,
    stateReads,
    inputs.docsFolder,
    `${owner}/${repo}`
  );
  if (unreadStates.errors.length > 0) {
    throw new Error(
      `state read failed for ${unreadStates.errors.length} file(s); branch left untouched: ` +
        unreadStates.errors.join('; ')
    );
  }
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
      bibliographyMode: inputs.bibliographyMode,
    },
    coreLogger,
    stateConfig
  );

  const bibliography =
    inputs.bibliographyMode === 'off'
      ? undefined
      : await fetchBibliographies(
          octokit,
          // The source at the commit this PR translates, as sync mode reads it.
          { owner: sourceOwner, repo: sourceRepoName, ref: sourceCommitSha },
          { owner, repo, ref: baseSha },
          inputs.docsFolder
        );

  const result = await orchestrator.processFiles(filesToSync, glossary, rebaseCache, bibliography);

  // Throw before the branch is touched: a commit of only the successful files
  // drops the errored files' previous translations from the PR, then the
  // caller comments "content is preserved" on it.
  if (result.errors.length > 0) {
    throw new Error(
      `translation produced ${result.errors.length} error(s); branch left untouched: ${result.errors.join('; ')}`
    );
  }

  if (
    result.translatedFiles.length === 0 &&
    result.filesToDelete.length === 0 &&
    carried.length === 0
  ) {
    core.info(`PR #${pr.number}: No translated files produced. Branch left as it was.`);
    return 'skipped';
  }

  // One commit on the pinned base, then one ref move from the branch's old
  // head straight to it: the branch never equals main, the state GitHub
  // closes a PR on (#280).
  const written = await writeRebasedBranch(
    octokit,
    {
      owner,
      repo,
      pullNumber: pr.number,
      branch: pr.head.ref,
      baseBranch,
      baseSha,
      files: [
        ...result.translatedFiles.map((file) => ({ path: file.path, content: file.content })),
        ...carried,
      ],
      deletions: result.filesToDelete.map((file) => file.path),
      declaredFiles: metadata.files.map((file) => file.path),
      mergedPrNumber,
    },
    coreLogger
  );
  if (written.outcome === 'closed') return 'closed';

  core.info(
    `PR #${pr.number}: rebased in one commit (${written.commitSha.slice(0, 7)}) with ` +
      `${result.translatedFiles.length} file(s) written, ${carried.length} carried unchanged ` +
      `and ${result.filesToDelete.length} marked for deletion.`
  );
  return 'rebased';
}

/**
 * Run the SYNC mode - create translation PRs
 *
 * Workflow:
 * 1. Validate inputs and PR event
 * 2. List and classify changed files, keep the `.md` files in the source's
 *    lecture set (#449), then, under `sync-scope: existing`, those in scope
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
    // The workflow's `branches:` filter does not apply to issue_comment events,
    // so this is the only base-branch check on the resync path.
    if (!mergedIntoDefaultBranch(pr.base?.ref, pr.base?.repo?.default_branch, prNumber)) {
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

  // Renames sync does not carry out (#398). A lecture renamed to a name that
  // is not `.md` keeps its translation, no longer synced. The docs folder's
  // `_toc.yml` moved out of it means the source moved its book, which a sync
  // cannot follow: each lecture's move would read as a removal.
  const renamesOut = findRenamesOut(files, inputs.docsFolder);
  for (const { from, to } of renamesOut.notMarkdown) {
    core.warning(
      `${from} was renamed to ${to}, which is not a .md file: ${inputs.targetRepo} keeps its ` +
        `translation of ${from}, which sync no longer updates`
    );
  }
  if (renamesOut.tocMovedOut) {
    const { from, to } = renamesOut.tocMovedOut;
    const error =
      `Sync refused: ${from} was moved to ${to}, out of docs-folder '${inputs.docsFolder}', ` +
      'so the source has moved its book. Nothing was synced.';
    core.setFailed(error);
    if (!isTestMode) {
      await createFailureIssue(
        octokit,
        prNumber,
        inputs.targetLanguage,
        inputs.targetRepo,
        [error],
        { docsFolder: inputs.docsFolder, mergeSha: effectiveSha, folderMoved: { from, to } }
      );
    }
    return;
  }
  for (const file of classified.removedMarkdownFiles) {
    if (file.renamedTo) {
      core.info(
        `${file.filename} was moved to ${file.renamedTo}, out of docs-folder: its translation ` +
          'and state file are deleted'
      );
    }
  }

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

  // The lecture set (#449): a changed or renamed `.md` syncs only when the
  // source's `_toc.yml` lists it, or a lecture it lists includes it, at the
  // commit being synced. One outside the set is left alone and listed. A set
  // that cannot be read holds the whole run; a lecture the include scan cannot
  // read is an error for the file it decides. Under `existing` this comes
  // before scope, so a file outside the set is never checked for a state
  // file. Removals are not narrowed (see sync-lecture-set.ts).
  const source = { owner: github.context.repo.owner, repo: github.context.repo.repo };
  const placement = await placeOnLectureSet(
    octokit,
    source,
    async (filePath, ref) =>
      (await fetchFileContent(octokit, source.owner, source.repo, filePath, ref)).content,
    classified,
    inputs.docsFolder,
    effectiveSha,
    inputs.targetRepo,
    coreLogger
  );

  // The job summary: every run under `existing`, as before, and a run under
  // `all` with something from the lecture set to list (#449). The gaps are
  // known only once the run knows what it delivers.
  type Gaps = Awaited<ReturnType<typeof findLectureSetGaps>>;
  const noGaps: Gaps = { tocAdded: [], missingIncludes: [], errors: [] };
  const reportOf = (gaps: Gaps): LectureSetReport => ({
    docsFolder: inputs.docsFolder,
    outside: placement.outside,
    tocRemoved: placement.tocRemoved,
    tocAdded: gaps.tocAdded,
    missingIncludes: gaps.missingIncludes,
  });
  const writeSummary = (run: {
    scope?: ScopedFiles;
    prUrl?: string;
    errorCount: number;
    gaps?: Gaps;
  }): Promise<void> => {
    const gaps = run.gaps ?? noGaps;
    const lectureSet = formatLectureSetSummary(reportOf(gaps), [
      ...placement.errors,
      ...gaps.errors,
    ]);
    if (inputs.syncScope !== 'existing' && lectureSet === '') return Promise.resolve();
    return writeJobSummary(
      core.summary,
      buildScopeSummary({
        targetLanguage: inputs.targetLanguage,
        targetRepo: inputs.targetRepo,
        sourceRepo: `${source.owner}/${source.repo}`,
        prNumber,
        syncScope: inputs.syncScope,
        scoped: run.scope,
        remaining: placement.classified,
        lectureSet,
        prUrl: run.prUrl,
        errorCount: run.errorCount,
      }),
      coreLogger
    );
  };

  if (placement.refused) {
    core.setFailed(placement.refused);
    await writeSummary({ errorCount: 1 });
    if (!isTestMode) {
      await createFailureIssue(
        octokit,
        prNumber,
        inputs.targetLanguage,
        inputs.targetRepo,
        [placement.refused],
        {
          docsFolder: inputs.docsFolder,
          mergeSha: effectiveSha,
          lectureSetUnread: true,
          heldRemovals: [
            ...classified.removedMarkdownFiles.map((file) => file.filename),
            ...classified.renamedMarkdownFiles.flatMap((file) =>
              file.previous_filename ? [file.previous_filename] : []
            ),
          ],
        }
      );
    }
    return;
  }

  // sync-scope (#344): under `existing`, a changed or renamed lecture syncs
  // only when the edition has its state file, checked before any content is
  // fetched. Removals and `_toc.yml` are not scoped. `all` returns undefined
  // and makes no request, so every `scope` branch below is skipped.
  const [targetOwner, targetRepo] = inputs.targetRepo.split('/');
  const scope = await applySyncScope(
    inputs.syncScope,
    octokit,
    placement.classified,
    { owner: targetOwner, repo: targetRepo },
    inputs.docsFolder,
    coreLogger
  );
  const remaining = scope ? scope.classified : placement.classified;
  // The lecture set's errors come first, as its test comes first.
  const placeErrors = [...placement.errors, ...(scope?.errors ?? [])];

  // Nothing left to sync. Without an error the run passes: no PR, no failure
  // issue and no comment on the source PR. Besides the job summary, a scoped
  // run closes the failure issues earlier runs opened for this PR (the scoped
  // half of #387): on a partial edition, passing with nothing in scope is an
  // ordinary recovery, such as a rerun after a transient read error left a
  // lecture's scope unknown. Under `all`, which reaches here only when every
  // changed `.md` is outside the lecture set (#449), they stay open, as for
  // any `all` run without a PR. With an error, some changed file's place is
  // unknown, so the run fails here, before it reads the edition again.
  if (nothingToSync(remaining)) {
    if (placeErrors.length === 0) {
      core.info(
        scope
          ? 'sync-scope: existing — nothing this PR changed is in scope. No translation PR.'
          : 'Nothing this PR changed is in the lecture set. No translation PR.'
      );
      await writeSummary({ scope, errorCount: 0 });
      if (!isTestMode && scope) {
        await closeFailureIssues(
          octokit,
          prNumber,
          inputs.targetLanguage,
          nothingToDeliverResolution(prNumber, inputs.targetLanguage)
        );
      }
      return;
    }
    core.setFailed(`Translation completed with ${placeErrors.length} errors`);
    await writeSummary({ scope, errorCount: placeErrors.length });
    if (!isTestMode) {
      await createFailureIssue(
        octokit,
        prNumber,
        inputs.targetLanguage,
        inputs.targetRepo,
        placeErrors,
        { docsFolder: inputs.docsFolder, mergeSha: effectiveSha }
      );
    }
    return;
  }

  // Load glossary
  const builtInGlossaryDir = getBuiltInGlossaryDir();
  const glossary = await loadGlossary(
    inputs.targetLanguage,
    builtInGlossaryDir,
    inputs.glossaryPath || undefined,
    coreLogger
  );

  // Fetch content and build FileToSync array
  const {
    files: fetchedFiles,
    errors: fetchErrors,
    fetchFailedNewFiles,
  } = await fetchAllFileContents(
    octokit,
    remaining,
    inputs,
    targetOwner,
    targetRepo,
    effectiveSha,
    placement.toc
  );

  // A changed file whose place in the lecture set could not be read fails the
  // run. Under scope, so does a lecture whose scope could not be read, and an
  // in-scope lecture the fetch could not read: none is translated, and an
  // in-scope lecture is never translated from scratch (see sync-scope.ts).
  let filesToSync = fetchedFiles;
  const heldErrors: string[] = [];
  if (scope) {
    const held = refuseUnreadLectures(fetchedFiles);
    for (const error of held.errors) core.error(error);
    filesToSync = held.files;
    heldErrors.push(...held.errors);
  }
  fetchErrors.unshift(...placeErrors, ...heldErrors);

  // Fetch existing state file SHAs from target repo for state generation
  const { shas: existingStateShas, reads: stateReads } = await fetchExistingStateShas(
    octokit,
    targetOwner,
    targetRepo,
    filesToSync,
    inputs.docsFolder
  );

  // A removed lecture's state file, and a renamed lecture's at its old path,
  // go only when the read found one, so a lecture whose read failed is held
  // back (#396). The premise check reports the renamed lectures it checks.
  const unreadStates = holdUnreadDeletionStates(
    filesToSync,
    stateReads,
    inputs.docsFolder,
    `${targetOwner}/${targetRepo}`,
    takesUpdateMode
  );
  for (const error of unreadStates.errors) core.error(error);
  filesToSync = unreadStates.files;
  fetchErrors.push(...unreadStates.errors);

  // The premise of update mode (#420): a lecture whose translation does not
  // start from the English this PR changed is held back before any model
  // call, and its error says which case it is, unless an open translation PR
  // in the edition carries it: that one syncs as before, as a stacked PR, and
  // its diagnosis goes to the PR body or, if it fails, the failure issue. The
  // state files' content comes from the read above; a lecture new to the
  // edition costs nothing here.
  const premise = await checkSyncPremise(
    {
      files: filesToSync,
      stateReads,
      docsFolder: inputs.docsFolder,
      sourceSha: effectiveSha,
      source: { owner: github.context.repo.owner, repo: github.context.repo.repo },
      prNumber,
      edition: { owner: targetOwner, repo: targetRepo },
      targetLanguage: inputs.targetLanguage,
    },
    githubPremiseReader(
      octokit,
      { owner: github.context.repo.owner, repo: github.context.repo.repo },
      { owner: targetOwner, repo: targetRepo }
    ),
    coreLogger
  );
  filesToSync = premise.files;
  fetchErrors.push(...premise.errors);

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
      bibliographyMode: inputs.bibliographyMode,
    },
    coreLogger,
    stateConfig
  );

  // Citations this sync introduces need their bibliography entries to cross
  // with them, or the target stops building under -W (#117). A bibliography
  // that cannot be read holds the whole sync (#386): no lecture, ToC or
  // removal goes ahead without it, and the run fails with a failure issue.
  let bibliography: BibliographySources | undefined;
  let bibliographyError: string | undefined;
  if (inputs.bibliographyMode !== 'off') {
    try {
      bibliography = await fetchBibliographies(
        octokit,
        { owner: github.context.repo.owner, repo: github.context.repo.repo, ref: effectiveSha },
        { owner: targetOwner, repo: targetRepo },
        inputs.docsFolder
      );
    } catch (error) {
      bibliographyError =
        `Fetch failed (bibliography): ${error instanceof Error ? error.message : String(error)}. ` +
        'Nothing was synced.';
      core.error(bibliographyError);
    }
  }

  const result: SyncProcessingResult = bibliographyError
    ? {
        translatedFiles: [],
        filesToDelete: [],
        processedFiles: [],
        errors: [bibliographyError],
        skippedSections: new Map(),
        droppedTargetSections: new Map(),
      }
    : await orchestrator.processFiles(
        filesToSync,
        glossary,
        undefined,
        bibliography,
        fetchFailedNewFiles
      );

  // Fetch failures count as processing errors: they fail the run and open a
  // failure issue instead of shipping a PR that silently misses files.
  result.errors.unshift(...fetchErrors);

  // The lecture set's gaps (#449), listed and never translated: a lecture the
  // PR added to the ToC without changing it, and a file a delivered lecture
  // includes that the edition lacks. Each costs one edition read, after the
  // scope check's read of the edition; a read that fails is an error.
  const gaps = await findLectureSetGaps(
    octokit,
    { owner: targetOwner, repo: targetRepo },
    inputs.docsFolder,
    {
      tocAdded: placement.tocAdded,
      delivered: filesToSync
        .filter(
          (f) =>
            (f.type === 'markdown' || f.type === 'renamed') &&
            result.processedFiles.includes(f.filename)
        )
        .map((f) => ({ path: f.filename, content: f.newContent ?? '' })),
      sourceFiles: placement.sourceFiles,
    },
    coreLogger
  );
  result.errors.push(...gaps.errors);

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
  core.setOutput('cache-creation-input-tokens', String(usage.cacheCreationInputTokens));
  core.setOutput('cache-read-input-tokens', String(usage.cacheReadInputTokens));
  core.setOutput('api-calls', String(usage.apiCalls));
  core.info(
    `API usage: ${usage.apiCalls} call(s), ${usage.inputTokens} input + ${usage.outputTokens} output tokens, cache: ${usage.cacheReadInputTokens} read + ${usage.cacheCreationInputTokens} written`
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

      // Build file metadata with type info for rebase mode. A removal that
      // deleted nothing, a lecture already gone with no state file left, is
      // not something the PR delivers.
      const delivered = filesToSync.filter(
        (f) => f.type !== 'removed' || result.processedFiles.includes(f.filename)
      );
      const fileMetadata = delivered.map((f) => {
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
        result.droppedTargetSections,
        result.failedNewFiles
          ? { files: result.failedNewFiles, filteredTocPaths: result.filteredTocPaths ?? [] }
          : undefined,
        scope?.skipped,
        // Only the lectures this PR delivers: one that failed is in the
        // failure issue instead.
        premise.stillOpen.filter((lecture) => result.processedFiles.includes(lecture.file)),
        reportOf(gaps)
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

  await writeSummary({ scope, prUrl, errorCount: result.errors.length, gaps });

  // Post-sync notifications (skip in test mode)
  if (!isTestMode) {
    if (result.errors.length > 0) {
      // On failure: open an Issue linked to the source PR. The lectures the
      // orchestrator could not translate get one recovery line each:
      // `forward` for one the edition has, `init` for a new one (#281), and,
      // for one the premise check found behind an open translation PR, its
      // diagnosis and the advice to merge that PR first (#420).
      const failedLectures = filesToSync
        .filter(
          (f) =>
            (f.type === 'markdown' || f.type === 'renamed') &&
            !result.processedFiles.includes(f.filename)
        )
        .map((f) => ({
          file: f.filename,
          ...(f.type === 'renamed' && f.previousFilename
            ? { previousPath: f.previousFilename }
            : {}),
          inEdition: !f.isNewFile,
        }));
      await createFailureIssue(
        octokit,
        prNumber,
        inputs.targetLanguage,
        inputs.targetRepo,
        result.errors,
        {
          docsFolder: inputs.docsFolder,
          mergeSha: effectiveSha,
          heldBack: premise.heldBack,
          failedLectures,
          bibliographyUnread: bibliographyError !== undefined,
          // A bibliography hold synced nothing, so no lecture behind an open
          // PR failed: its diagnosis would read as an error of its own.
          stillOpen: bibliographyError
            ? []
            : premise.stillOpen.filter((lecture) => !result.processedFiles.includes(lecture.file)),
        }
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
      await closeFailureIssues(
        octokit,
        prNumber,
        inputs.targetLanguage,
        `✅ A later sync for PR #${prNumber} (${inputs.targetLanguage}) succeeded: ${prUrl}`
      );
    } else if (scope) {
      // The scoped half of #387: a scoped run that passes with nothing to
      // deliver, such as one whose only change removes a lecture the edition
      // no longer has, closes the PR's failure issues too. Under `all` such a
      // run leaves them open, as it always has; #387 stays open for that half.
      await closeFailureIssues(
        octokit,
        prNumber,
        inputs.targetLanguage,
        nothingToDeliverResolution(prNumber, inputs.targetLanguage)
      );
    }
  }
}

// =============================================================================
// HELPERS - GitHub API content fetching
// =============================================================================

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

/** One read of the edition at a ref, for rebase-plan.ts: the file, a 404, or the failure. */
type EditionRead =
  | { status: 'found'; content: string; sha?: string }
  | { status: 'missing' }
  | { status: 'error'; message: string };

async function readEditionFile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  octokit: any,
  owner: string,
  repo: string,
  filepath: string,
  ref: string
): Promise<EditionRead> {
  try {
    const { content, sha } = await fetchFileContent(octokit, owner, repo, filepath, ref);
    return { status: 'found', content, sha };
  } catch (error) {
    const status = (error as { status?: number } | null | undefined)?.status;
    if (status === 404) return { status: 'missing' };
    return {
      status: 'error',
      message: `status ${status ?? 'unknown'}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Build FileToSync[] by fetching content from GitHub API for all classified files.
 * `sourceToc` is the docs folder's `_toc.yml` as the lecture set already read
 * it at `commitSha` (#449), so a changed ToC is not read twice.
 */
async function fetchAllFileContents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  octokit: any,
  classified: ReturnType<typeof classifyChangedFiles>,
  inputs: ReturnType<typeof getInputs>,
  targetOwner: string,
  targetRepo: string,
  commitSha?: string,
  sourceToc?: { path: string; content: string }
): Promise<{ files: FileToSync[]; errors: string[]; fetchFailedNewFiles: string[] }> {
  const filesToSync: FileToSync[] = [];
  // Fetch failures are returned, not swallowed: a transient 5xx on one file
  // used to yield a PR missing that file plus a success comment and a green
  // check (#165/F121 — #90 defect 3).
  const fetchErrors: string[] = [];
  // Markdown files whose source fetch failed AND which the target does not
  // have: nothing will be delivered under that name, so their `_toc.yml`
  // entries must go the same way as a translation failure's (#156).  Renamed
  // files are not classified here — dropping the new stem would orphan the
  // old file from the toctree, which fails the strict build just the same.
  const fetchFailedNewFiles: string[] = [];
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
      if (await targetFileIsMissing(octokit, targetOwner, targetRepo, file.filename)) {
        fetchFailedNewFiles.push(file.filename);
      }
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
      const newContent =
        sourceToc && sourceToc.path === file.filename
          ? sourceToc.content
          : (await fetchFileContent(octokit, sourceOwner, sourceRepo, file.filename, sha)).content;

      let existingFileSha: string | undefined;
      let targetContent: string | undefined;
      try {
        const result = await fetchFileContent(octokit, targetOwner, targetRepo, file.filename);
        existingFileSha = result.sha;
        targetContent = result.content;
      } catch (error) {
        // Only a genuine 404 means "first delivery of this TOC". Any other
        // status must fail the fetch: swallowing it would drop the target's
        // localised captions on a transient error (#254) — the outer catch
        // records it as a fetch error and the run fails loudly.
        const status = (error as { status?: number } | null | undefined)?.status;
        if (status !== 404) {
          throw new Error(
            `Could not read ${file.filename} from ${targetOwner}/${targetRepo} ` +
              `(status ${status ?? 'unknown'}): ${error}`
          );
        }
        core.info(`${file.filename} does not exist in target repo - will create it`);
      }

      filesToSync.push({
        filename: file.filename,
        type: 'toc',
        newContent,
        targetContent,
        existingFileSha,
        isNewFile: !existingFileSha,
      });
    } catch (error) {
      core.error(`Error fetching content for TOC file ${file.filename}: ${error}`);
      fetchErrors.push(`Fetch failed (toc): ${file.filename}: ${error}`);
    }
  }

  // Removed files (markdown + TOC). Only a 404 means the target no longer has
  // one (#396): any other answer leaves that unknown, and reading it as
  // "already gone" passed the run with the file still in the target. GitHub
  // also answers 404 for a repository the token cannot see, so a 404 counts
  // only once the target repo itself reads, as in the scope check.
  let targetRepoRead: Promise<unknown> | undefined;
  const removals = [
    ...classified.removedMarkdownFiles.map((file) => ({ file, lecture: true })),
    ...classified.removedTocFiles.map((file) => ({ file, lecture: false })),
  ];
  for (const { file, lecture } of removals) {
    try {
      let existingFileSha: string | undefined;
      try {
        const result = await fetchFileContent(octokit, targetOwner, targetRepo, file.filename);
        existingFileSha = result.sha;
      } catch (error) {
        const status = (error as { status?: number } | null | undefined)?.status;
        if (status !== 404) {
          throw new Error(
            `Could not read ${file.filename} from ${targetOwner}/${targetRepo} ` +
              `(status ${status ?? 'unknown'}): ${error}`
          );
        }
        targetRepoRead ??= octokit.rest.repos.get({ owner: targetOwner, repo: targetRepo });
        try {
          await targetRepoRead;
        } catch (repoError) {
          const repoStatus = (repoError as { status?: number } | null | undefined)?.status;
          throw new Error(
            `could not read the target repo ${targetOwner}/${targetRepo} ` +
              `(status ${repoStatus ?? 'unknown'}), so its 404 for this file cannot be trusted: ` +
              `${repoError}`
          );
        }
        core.info(`${file.filename} does not exist in target repo`);
      }

      // A lecture already gone can leave its state file behind: the entry
      // without a SHA lets the orchestrator delete that alone.
      if (existingFileSha || lecture) {
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

  return { files: filesToSync, errors: fetchErrors, fetchFailedNewFiles };
}

/**
 * True only when the target repo answers 404 for `filePath`.  Any other
 * failure (rate limit, network, 5xx) reads as "unknown" — an outage must never
 * remove a live TOC entry, so the caller keeps the entry and lets the run's
 * fetch error fail it instead.
 */
async function targetFileIsMissing(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  octokit: any,
  owner: string,
  repo: string,
  filePath: string
): Promise<boolean> {
  try {
    await fetchFileContent(octokit, owner, repo, filePath);
    return false;
  } catch (error) {
    return (error as { status?: number } | null)?.status === 404;
  }
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
 * Fetch existing .translate/state/ file SHAs from the target repo, at `ref`
 * when one is given (rebase mode pins it, #280) and on the default branch
 * otherwise. Sync mode needs them so Octokit can update (rather than create)
 * state files; both modes use them to decide whether a removed or renamed
 * lecture has a state file to delete. Missing state files are silently
 * skipped — they'll be created as new files.
 */
async function fetchExistingStateShas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  octokit: any,
  targetOwner: string,
  targetRepo: string,
  filesToSync: FileToSync[],
  docsFolder: string,
  ref?: string
): Promise<{ shas: Map<string, string>; reads: StateReads }> {
  const shas = new Map<string, string>();
  // What each read returned, for sync's premise check (#420), which needs a
  // state file's content and must tell a missing file from a failed read.
  // The SHAs above keep their old rule: anything but a file is "no SHA".
  const reads: StateReads = new Map();
  const at = ref ? { ref } : {};

  const readState = async (statePath: string): Promise<void> => {
    try {
      const { data } = await octokit.rest.repos.getContent({
        owner: targetOwner,
        repo: targetRepo,
        path: statePath,
        ...at,
      });
      if ('sha' in data) {
        shas.set(statePath, data.sha);
      }
      reads.set(
        statePath,
        'content' in data
          ? { status: 'found', content: Buffer.from(data.content, 'base64').toString('utf-8') }
          : { status: 'error', message: 'not a file' }
      );
    } catch (error) {
      // A 404 means the state file doesn't exist yet: it will be created, or
      // for an old path there is nothing to delete.
      const status = (error as { status?: number } | null | undefined)?.status;
      reads.set(
        statePath,
        status === 404
          ? { status: 'missing' }
          : {
              status: 'error',
              message: `status ${status ?? 'unknown'}: ${error instanceof Error ? error.message : String(error)}`,
            }
      );
    }
  };

  // Markdown and renamed files write state; a removed file's state is deleted
  const markdownFiles = filesToSync.filter(
    (f) => f.type === 'markdown' || f.type === 'renamed' || f.type === 'removed'
  );

  // Compute docs-folder-relative filenames for state paths (CLI uses docs-relative)
  for (const file of markdownFiles) {
    const docsRelName =
      docsFolder && file.filename.startsWith(docsFolder)
        ? file.filename.slice(docsFolder.length)
        : file.filename;
    await readState(stateFileRelativePath(docsRelName));

    // For renamed files, also fetch the old state file SHA (for deletion)
    if (file.type === 'renamed' && file.previousFilename) {
      const oldDocsRelName =
        docsFolder && file.previousFilename.startsWith(docsFolder)
          ? file.previousFilename.slice(docsFolder.length)
          : file.previousFilename;
      await readState(stateFileRelativePath(oldDocsRelName));
    }
  }

  if (shas.size > 0) {
    core.info(`Found ${shas.size} existing state file(s) in target repo`);
  }

  return { shas, reads };
}

/**
 * Hold back each removed lecture, and each renamed one, whose state file the
 * run would delete but could not read (#396): a removed lecture's, and a
 * renamed lecture's at its old path. The orchestrator deletes one only when
 * its read found it, so going ahead would leave a state file that claims a
 * translation the target no longer has. `reported` names the files whose read
 * another check already reports as an error.
 */
function holdUnreadDeletionStates(
  files: FileToSync[],
  reads: StateReads,
  docsFolder: string,
  targetRepo: string,
  reported: (file: FileToSync) => boolean = () => false
): { files: FileToSync[]; errors: string[] } {
  const kept: FileToSync[] = [];
  const errors: string[] = [];
  for (const file of files) {
    const deletedPath =
      file.type === 'removed' && file.filename.endsWith('.md')
        ? file.filename
        : file.type === 'renamed'
          ? file.previousFilename
          : undefined;
    const statePath = deletedPath ? stateFileFor(deletedPath, docsFolder) : undefined;
    const read = statePath ? reads.get(statePath) : undefined;
    if (statePath && read?.status === 'error' && !reported(file)) {
      errors.push(
        `Fetch failed (state): ${file.filename}: could not read ${statePath} from ${targetRepo} ` +
          `(${read.message}), so whether to delete it is unknown. ` +
          `It was not ${file.type === 'removed' ? 'removed' : 'synced'}.`
      );
      continue;
    }
    kept.push(file);
  }
  return { files: kept, errors };
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
 *
 * `resolution` opens the closing comment and says how the PR recovered: with
 * the translation PR a later run opened, or, under `sync-scope: existing`,
 * with a later run that passed with nothing to deliver
 * (`nothingToDeliverResolution`, the scoped half of #387).
 */
async function closeFailureIssues(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  octokit: any,
  prNumber: number,
  targetLanguage: string,
  resolution: string
): Promise<void> {
  try {
    const title = failureIssueTitle(prNumber, targetLanguage);
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
        body: `${resolution}\n\nClosing this failure report.`,
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
 * How a scoped run that passed with nothing to deliver resolves the PR's
 * failure issues (the scoped half of #387). With no translation PR to cite, it
 * cites this run. Outside Actions GITHUB_RUN_ID is unset, `runId` is NaN, and
 * the sentence ends without a link.
 */
function nothingToDeliverResolution(prNumber: number, targetLanguage: string): string {
  const resolution =
    `✅ A later sync for PR #${prNumber} (${targetLanguage}) passed with nothing to deliver ` +
    `to this edition (sync-scope: existing)`;
  const { serverUrl, runId } = github.context;
  if (!Number.isFinite(runId) || runId <= 0) return `${resolution}.`;
  const { owner, repo } = github.context.repo;
  return `${resolution}: ${serverUrl}/${owner}/${repo}/actions/runs/${runId}`;
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
  advice: Pick<
    FailureIssueInput,
    | 'docsFolder'
    | 'mergeSha'
    | 'heldBack'
    | 'failedLectures'
    | 'stillOpen'
    | 'bibliographyUnread'
    | 'lectureSetUnread'
    | 'heldRemovals'
    | 'folderMoved'
  > = { docsFolder: '' }
): Promise<void> {
  try {
    const title = failureIssueTitle(prNumber, targetLanguage);
    // The Recovery section is built in recovery-advice.ts (#281): the CLI
    // route, and a resync only under #276's precondition. Lectures held back
    // by the premise check (#420), and failed lectures it found behind an
    // open translation PR, get their own advice.
    const body = buildFailureIssueBody({
      prNumber,
      targetRepo,
      targetLanguage,
      errors,
      ...advice,
    });

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

/**
 * Fetch the bibliographies a citation backfill needs (#117).
 *
 * The target's `_config.yml` names them via `bibtex_bibfiles`; the source is
 * read at the same docs-relative paths. Each side is read at its `ref` when one
 * is given: the source at the commit being translated, the target at the base
 * rebase mode pinned (#280). Returns undefined when the target
 * configures no bibliography — correct for editions that have none. (The E2E
 * harness targets DO carry a minimal `_config.yml` + `references.bib` since
 * scenario 27, precisely so this path is exercisable end-to-end.)
 *
 * Fails closed on a configured-but-unreadable bibliography: silently skipping
 * would restore the exact silence this guard exists to remove.
 */
export async function fetchBibliographies(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  octokit: any,
  source: { owner: string; repo: string; ref?: string },
  target: { owner: string; repo: string; ref?: string },
  docsFolder: string
): Promise<BibliographySources | undefined> {
  const configPath = `${docsFolder}_config.yml`;

  let configYaml: string;
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: target.owner,
      repo: target.repo,
      path: configPath,
      ...(target.ref ? { ref: target.ref } : {}),
    });
    if (!('content' in data)) return undefined;
    configYaml = Buffer.from(data.content, 'base64').toString('utf8');
  } catch (error) {
    // Only a genuine 404 means "this edition has no jupyter-book config", which
    // is a legitimate skip. Any other status — rate limit, 5xx, permissions —
    // must fail the run: swallowing it would disable the guard silently on a
    // transient error, which is the exact failure mode this module removes.
    const status = (error as { status?: number } | null | undefined)?.status;
    if (status !== 404) {
      throw new Error(
        `Could not read ${configPath} from ${target.owner}/${target.repo} ` +
          `(status ${status ?? 'unknown'}): ${error}`
      );
    }
    core.info(`No ${configPath} in target repo — bibliography backfill not applicable`);
    return undefined;
  }

  const bibPaths = parseBibtexBibfiles(configYaml);
  if (bibPaths.length === 0) {
    core.info(`No bibtex_bibfiles in ${configPath} — bibliography backfill not applicable`);
    return undefined;
  }

  const targets: BibFile[] = [];
  const sources: BibFile[] = [];

  for (const rel of bibPaths) {
    const repoPath = `${docsFolder}${rel}`;

    try {
      const { data } = await octokit.rest.repos.getContent({
        owner: target.owner,
        repo: target.repo,
        path: repoPath,
        ...(target.ref ? { ref: target.ref } : {}),
      });
      if (!('content' in data)) throw new Error('not a file');
      targets.push({
        path: repoPath,
        content: Buffer.from(data.content, 'base64').toString('utf8'),
        sha: data.sha,
      });
    } catch (error) {
      throw new Error(
        `Target ${configPath} configures bibtex_bibfiles '${rel}' but ${repoPath} could not be read: ${error}`
      );
    }

    try {
      const { data } = await octokit.rest.repos.getContent({
        owner: source.owner,
        repo: source.repo,
        path: repoPath,
        ...(source.ref ? { ref: source.ref } : {}),
      });
      if ('content' in data) {
        sources.push({
          path: repoPath,
          content: Buffer.from(data.content, 'base64').toString('utf8'),
        });
      }
    } catch (error) {
      // A source that genuinely lacks this bibliography is not an error:
      // nothing to copy from, and any unresolved key is reported by the
      // planner. A transient failure is a different thing entirely — treating
      // it as "no entries available" would turn it into a misleading
      // "resolves in neither bibliography" error against the wrong cause.
      const status = (error as { status?: number } | null | undefined)?.status;
      if (status !== 404) {
        throw new Error(
          `Could not read ${repoPath} from source ${source.owner}/${source.repo} ` +
            `(status ${status ?? 'unknown'}): ${error}`
        );
      }
      core.info(`Source has no ${repoPath} — nothing to backfill from`);
    }
  }

  core.info(
    `Bibliography: ${targets.length} target file(s), ${sources.length} source file(s) available for backfill`
  );
  return { targets, sources };
}

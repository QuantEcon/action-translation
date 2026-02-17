/**
 * PR Creator - creates translation PRs in the target repository
 *
 * Handles:
 * - Branch creation from default branch
 * - File commits (create/update)
 * - File deletions
 * - PR creation with descriptive body
 * - Label assignment (input labels + source PR labels)
 * - Reviewer assignment
 *
 * Extracted from index.ts for separation of concerns.
 */

import { TranslatedFile } from './types';
import { Logger } from './sync-orchestrator';

// =============================================================================
// INTERFACES
// =============================================================================

/**
 * Configuration for PR creation
 */
export interface PrCreatorConfig {
  targetOwner: string;
  targetRepo: string;
  sourceLanguage: string;
  targetLanguage: string;
  claudeModel: string;
  sourceRepoOwner: string;
  sourceRepoName: string;
  prNumber: number;
  prLabels: string[];
  prReviewers: string[];
  prTeamReviewers: string[];
}

/**
 * Source PR metadata for PR body and title
 */
export interface SourcePrInfo {
  title: string;
  labels: string[];
}

/**
 * Result of PR creation
 */
export interface PrCreationResult {
  prUrl: string;
  branchName: string;
  prNumber: number;
}

// =============================================================================
// PR CREATOR
// =============================================================================

/**
 * Create a translation PR in the target repository.
 *
 * Creates a branch, commits translated files, deletes removed files,
 * creates a PR with descriptive body, and assigns labels/reviewers.
 *
 * @param octokit - Authenticated Octokit instance with access to target repo
 * @param translatedFiles - Files to create/update in target repo
 * @param filesToDelete - Files to delete from target repo
 * @param config - PR configuration
 * @param logger - Logger instance
 * @param sourcePrInfo - Optional source PR metadata
 * @returns PR creation result with URL and branch name
 */
export async function createTranslationPR(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  octokit: any,
  translatedFiles: TranslatedFile[],
  filesToDelete: Array<{ path: string; sha: string }>,
  config: PrCreatorConfig,
  logger: Logger,
  sourcePrInfo?: SourcePrInfo,
): Promise<PrCreationResult> {
  const { targetOwner, targetRepo } = config;

  // Get default branch of target repo
  const { data: targetRepoData } = await octokit.rest.repos.get({
    owner: targetOwner,
    repo: targetRepo,
  });
  const defaultBranch = targetRepoData.default_branch;

  // Get the SHA of the default branch
  const { data: refData } = await octokit.rest.git.getRef({
    owner: targetOwner,
    repo: targetRepo,
    ref: `heads/${defaultBranch}`,
  });
  const baseSha = refData.object.sha;

  // Create a new branch
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const branchName = `translation-sync-${timestamp}-pr-${config.prNumber}`;

  await octokit.rest.git.createRef({
    owner: targetOwner,
    repo: targetRepo,
    ref: `refs/heads/${branchName}`,
    sha: baseSha,
  });

  logger.info(`Created branch: ${branchName}`);

  // Commit each translated file
  for (const file of translatedFiles) {
    await octokit.rest.repos.createOrUpdateFileContents({
      owner: targetOwner,
      repo: targetRepo,
      path: file.path,
      message: `Update translation: ${file.path}`,
      content: Buffer.from(file.content).toString('base64'),
      branch: branchName,
      sha: file.sha, // Include SHA if updating existing file
    });
    logger.info(`Committed: ${file.path}`);
  }

  // Delete removed files
  for (const file of filesToDelete) {
    await octokit.rest.repos.deleteFile({
      owner: targetOwner,
      repo: targetRepo,
      path: file.path,
      message: `Delete removed file: ${file.path}`,
      branch: branchName,
      sha: file.sha,
    });
    logger.info(`Deleted: ${file.path}`);
  }

  // Build PR body
  const prBody = buildPrBody(translatedFiles, filesToDelete, config, sourcePrInfo);

  // Build PR title
  const prTitle = buildPrTitle(translatedFiles, filesToDelete, config, sourcePrInfo);

  // Create pull request
  const { data: pr } = await octokit.rest.pulls.create({
    owner: targetOwner,
    repo: targetRepo,
    title: prTitle,
    body: prBody,
    head: branchName,
    base: defaultBranch,
  });

  logger.info(`Created PR: ${pr.html_url}`);

  // Add labels
  const labelsToAdd = buildLabelSet(config.prLabels, sourcePrInfo?.labels);
  if (labelsToAdd.length > 0) {
    await octokit.rest.issues.addLabels({
      owner: targetOwner,
      repo: targetRepo,
      issue_number: pr.number,
      labels: labelsToAdd,
    });
    logger.info(`Added labels: ${labelsToAdd.join(', ')}`);
  }

  // Request reviewers
  await requestReviewers(octokit, targetOwner, targetRepo, pr.number, config, logger);

  return {
    prUrl: pr.html_url,
    branchName,
    prNumber: pr.number,
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Build the PR body with file change details.
 */
export function buildPrBody(
  translatedFiles: TranslatedFile[],
  filesToDelete: Array<{ path: string; sha: string }>,
  config: PrCreatorConfig,
  sourcePrInfo?: SourcePrInfo,
): string {
  const newFiles = translatedFiles.filter(f => !f.sha);
  const updatedFiles = translatedFiles.filter(f => f.sha);

  let filesChangedSection = '';
  if (newFiles.length > 0) {
    filesChangedSection += '### Files Added\n' + newFiles.map(f => `- ✅ \`${f.path}\``).join('\n');
  }
  if (updatedFiles.length > 0) {
    if (filesChangedSection) filesChangedSection += '\n\n';
    filesChangedSection += '### Files Updated\n' + updatedFiles.map(f => `- ✏️ \`${f.path}\``).join('\n');
  }
  if (filesToDelete.length > 0) {
    if (filesChangedSection) filesChangedSection += '\n\n';
    filesChangedSection += '### Files Deleted\n' + filesToDelete.map(f => `- ❌ \`${f.path}\``).join('\n');
  }

  const sourcePrTitle = sourcePrInfo?.title || '';
  const { sourceRepoOwner, sourceRepoName, prNumber } = config;

  return `## Automated Translation Sync

This PR contains automated translations from [${sourceRepoOwner}/${sourceRepoName}](https://github.com/${sourceRepoOwner}/${sourceRepoName}).

### Source PR
**[#${prNumber}${sourcePrTitle ? ` - ${sourcePrTitle}` : ''}](https://github.com/${sourceRepoOwner}/${sourceRepoName}/pull/${prNumber})**

${filesChangedSection}

### Details
- **Source Language**: ${config.sourceLanguage}
- **Target Language**: ${config.targetLanguage}
- **Model**: ${config.claudeModel}

---
*This PR was created automatically by the [translation action](https://github.com/quantecon/action-translation).*`;
}

/**
 * Build the PR title.
 */
export function buildPrTitle(
  translatedFiles: TranslatedFile[],
  filesToDelete: Array<{ path: string; sha: string }>,
  config: PrCreatorConfig,
  sourcePrInfo?: SourcePrInfo,
): string {
  if (sourcePrInfo?.title) {
    return `🌐 [translation-sync] ${sourcePrInfo.title}`;
  }

  // Fallback: list files changed
  const allFiles = [...translatedFiles.map(f => f.path), ...filesToDelete.map(f => f.path)];
  let titleFileList: string;
  if (allFiles.length === 1) {
    titleFileList = allFiles[0];
  } else if (allFiles.length === 2) {
    titleFileList = `${allFiles[0]} + 1 more`;
  } else {
    titleFileList = `${allFiles.length} files`;
  }
  return `🌐 [translation-sync] ${titleFileList}`;
}

/**
 * Build the set of labels to add to the PR.
 * Combines input labels with source PR labels (excluding source-specific ones).
 */
export function buildLabelSet(
  inputLabels: string[],
  sourcePrLabels?: string[],
): string[] {
  const labelsToAdd = new Set<string>();

  for (const label of inputLabels) {
    labelsToAdd.add(label);
  }

  if (sourcePrLabels) {
    for (const label of sourcePrLabels) {
      labelsToAdd.add(label);
    }
  }

  return Array.from(labelsToAdd);
}

/**
 * Request reviewers on the PR.
 */
async function requestReviewers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  octokit: any,
  targetOwner: string,
  targetRepo: string,
  prNumber: number,
  config: PrCreatorConfig,
  logger: Logger,
): Promise<void> {
  if (config.prReviewers.length === 0 && config.prTeamReviewers.length === 0) {
    return;
  }

  try {
    const reviewRequest: { reviewers?: string[]; team_reviewers?: string[] } = {};
    if (config.prReviewers.length > 0) {
      reviewRequest.reviewers = config.prReviewers;
    }
    if (config.prTeamReviewers.length > 0) {
      reviewRequest.team_reviewers = config.prTeamReviewers;
    }

    await octokit.rest.pulls.requestReviewers({
      owner: targetOwner,
      repo: targetRepo,
      pull_number: prNumber,
      ...reviewRequest,
    });

    const reviewersList = [];
    if (config.prReviewers.length > 0) {
      reviewersList.push(`users: ${config.prReviewers.join(', ')}`);
    }
    if (config.prTeamReviewers.length > 0) {
      reviewersList.push(`teams: ${config.prTeamReviewers.join(', ')}`);
    }
    logger.info(`Requested reviewers: ${reviewersList.join('; ')}`);
  } catch (reviewerError) {
    // Don't fail the entire action if reviewer request fails
    logger.warning(`Could not request reviewers: ${reviewerError instanceof Error ? reviewerError.message : String(reviewerError)}`);
  }
}

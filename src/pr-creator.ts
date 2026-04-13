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

import { TranslatedFile } from './types.js';
import { Logger } from './sync-orchestrator.js';

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
  sourceCommitSha: string;
  prLabels: string[];
  prReviewers: string[];
  prTeamReviewers: string[];
}

/**
 * Machine-readable metadata embedded in translation sync PR bodies.
 * Used by rebase mode to reconstruct pipeline inputs.
 */
export interface TranslationSyncMetadata {
  sourceRepo: string;
  sourcePR: number;
  sourceCommitSha: string;
  sourceLanguage: string;
  targetLanguage: string;
  claudeModel: string;
  files: Array<{ path: string }>;
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
  skippedSections?: Map<string, string[]>,
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
  const prBody = buildPrBody(translatedFiles, filesToDelete, config, sourcePrInfo, skippedSections);

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

  // Add labels (non-fatal — PR is already created)
  // Retry up to 3 times with delay to handle GitHub API propagation delays
  // (newly-created PRs may temporarily return 404/validation errors when adding labels)
  const labelsToAdd = buildLabelSet(config.prLabels, sourcePrInfo?.labels);
  if (labelsToAdd.length > 0) {
    const maxAttempts = 3;
    const delayMs = 2000;
    let labeled = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await octokit.rest.issues.addLabels({
          owner: targetOwner,
          repo: targetRepo,
          issue_number: pr.number,
          labels: labelsToAdd,
        });
        logger.info(`Added labels: ${labelsToAdd.join(', ')}`);
        labeled = true;
        break;
      } catch (labelError) {
        if (attempt < maxAttempts) {
          logger.info(`Label attempt ${attempt}/${maxAttempts} failed, retrying in ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        } else {
          logger.warning(`Could not add labels to PR #${pr.number} after ${maxAttempts} attempts: ${labelError instanceof Error ? labelError.message : String(labelError)}`);
        }
      }
    }
    if (!labeled) {
      logger.warning(`PR #${pr.number} created successfully but labels could not be applied. Downstream workflows that filter by label may not trigger.`);
    }
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
  skippedSections?: Map<string, string[]>,
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

  // Build skipped sections notice (present when earlier translation PRs are unmerged)
  let skippedNotice = '';
  if (skippedSections && skippedSections.size > 0) {
    const lines: string[] = [];
    for (const [file, headings] of skippedSections) {
      // Wrap each heading in backticks (escaped) to neutralize any Markdown syntax
      lines.push(`- \`${file}\`: ${headings.map(h => `\`${h.replace(/`/g, '\\`')}\``).join(', ')}`);
    }
    skippedNotice = `\n\n### ⚠️ Sections Pending Earlier Translation PR\n\nThe following sections were **not modified by this source PR** and are missing from the target. They have been omitted from this PR to keep it scoped to the source PR's actual changes. An earlier translation PR should add them. If that PR is abandoned, run \`/translate-resync\` to recover.\n\n${lines.join('\n')}`;
  }

  // Build machine-readable metadata for rebase mode
  const allFilePaths = [
    ...translatedFiles.map(f => ({ path: f.path })),
    ...filesToDelete.map(f => ({ path: f.path })),
  ];

  const metadata: TranslationSyncMetadata = {
    sourceRepo: `${sourceRepoOwner}/${sourceRepoName}`,
    sourcePR: prNumber,
    sourceCommitSha: config.sourceCommitSha,
    sourceLanguage: config.sourceLanguage,
    targetLanguage: config.targetLanguage,
    claudeModel: config.claudeModel,
    files: allFilePaths,
  };

  const metadataBlock = `<!-- translation-sync-metadata\n${JSON.stringify(metadata, null, 2)}\n-->`;

  return `## Automated Translation Sync

This PR contains automated translations from [${sourceRepoOwner}/${sourceRepoName}](https://github.com/${sourceRepoOwner}/${sourceRepoName}).

### Source PR
**[#${prNumber}${sourcePrTitle ? ` - ${sourcePrTitle}` : ''}](https://github.com/${sourceRepoOwner}/${sourceRepoName}/pull/${prNumber})**

${filesChangedSection}${skippedNotice}

### Details
- **Source Language**: ${config.sourceLanguage}
- **Target Language**: ${config.targetLanguage}
- **Model**: ${config.claudeModel}

---
*This PR was created automatically by the [translation action](https://github.com/quantecon/action-translation).*

${metadataBlock}`;
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

// =============================================================================
// METADATA PARSER
// =============================================================================

/**
 * Parse machine-readable translation sync metadata from a PR body.
 * Returns undefined if no metadata block is found or parsing fails.
 *
 * Used by rebase mode to reconstruct pipeline inputs from existing PRs.
 */
export function parseTranslationSyncMetadata(prBody: string): TranslationSyncMetadata | undefined {
  const match = prBody.match(/<!-- translation-sync-metadata\n([\s\S]*?)\n-->/);
  if (!match) return undefined;

  try {
    const parsed = JSON.parse(match[1]);

    // Validate required fields
    if (
      typeof parsed.sourceRepo !== 'string' ||
      typeof parsed.sourcePR !== 'number' ||
      typeof parsed.sourceCommitSha !== 'string' ||
      typeof parsed.sourceLanguage !== 'string' ||
      typeof parsed.targetLanguage !== 'string' ||
      typeof parsed.claudeModel !== 'string' ||
      !Array.isArray(parsed.files)
    ) {
      return undefined;
    }

    return parsed as TranslationSyncMetadata;
  } catch {
    return undefined;
  }
}

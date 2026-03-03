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
export declare function createTranslationPR(octokit: any, translatedFiles: TranslatedFile[], filesToDelete: Array<{
    path: string;
    sha: string;
}>, config: PrCreatorConfig, logger: Logger, sourcePrInfo?: SourcePrInfo): Promise<PrCreationResult>;
/**
 * Build the PR body with file change details.
 */
export declare function buildPrBody(translatedFiles: TranslatedFile[], filesToDelete: Array<{
    path: string;
    sha: string;
}>, config: PrCreatorConfig, sourcePrInfo?: SourcePrInfo): string;
/**
 * Build the PR title.
 */
export declare function buildPrTitle(translatedFiles: TranslatedFile[], filesToDelete: Array<{
    path: string;
    sha: string;
}>, config: PrCreatorConfig, sourcePrInfo?: SourcePrInfo): string;
/**
 * Build the set of labels to add to the PR.
 * Combines input labels with source PR labels (excluding source-specific ones).
 */
export declare function buildLabelSet(inputLabels: string[], sourcePrLabels?: string[]): string[];
//# sourceMappingURL=pr-creator.d.ts.map
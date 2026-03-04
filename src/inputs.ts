import * as core from '@actions/core';
import { ActionInputs, ReviewInputs } from './types';
import { validateLanguageCode, getSupportedLanguages } from './language-config';

/**
 * Known Claude model patterns for validation
 * These are the model patterns that are valid for the Anthropic API
 */
const VALID_MODEL_PATTERNS = [
  /^claude-sonnet-4-6$/,             // claude-sonnet-4-6 (latest Sonnet)
  /^claude-opus-4-6$/,               // claude-opus-4-6 (latest Opus)
  /^claude-sonnet-4-5-\d{8}$/,      // claude-sonnet-4-5-20250929
  /^claude-opus-4-5-\d{8}$/,        // claude-opus-4-5-20251101
  /^claude-haiku-4-5-\d{8}$/,       // claude-haiku-4-5-20251001
  /^claude-3-5-sonnet-\d{8}$/,      // claude-3-5-sonnet-20241022
  /^claude-3-5-haiku-\d{8}$/,       // claude-3-5-haiku-20241022
  /^claude-3-opus-\d{8}$/,          // claude-3-opus-20240229
  /^claude-3-sonnet-\d{8}$/,        // claude-3-sonnet-20240229
  /^claude-3-haiku-\d{8}$/,         // claude-3-haiku-20240307
];

/**
 * Validate Claude model name
 */
function validateClaudeModel(model: string): void {
  const isValid = VALID_MODEL_PATTERNS.some(pattern => pattern.test(model));
  if (!isValid) {
    core.warning(
      `Unrecognized Claude model: '${model}'. ` +
      `Expected patterns like 'claude-sonnet-4-6' or 'claude-sonnet-4-5-YYYYMMDD'. ` +
      `The model will still be used, but verify it's correct.`
    );
  }
}

/**
 * Get the action mode (sync or review)
 */
export function getMode(): 'sync' | 'review' {
  const mode = core.getInput('mode', { required: true });
  if (!mode) {
    throw new Error(`Missing required input: 'mode'. Expected 'sync' or 'review'.`);
  }
  if (mode !== 'sync' && mode !== 'review') {
    throw new Error(`Invalid mode: '${mode}'. Expected 'sync' or 'review'.`);
  }
  return mode;
}

/**
 * Get and validate action inputs for SYNC mode
 */
export function getInputs(): ActionInputs {
  const targetRepo = core.getInput('target-repo', { required: true });
  const targetLanguage = core.getInput('target-language', { required: true });
  // Handle docs-folder: '.' means root level (empty string for no prefix filter)
  const docsFolderInput = core.getInput('docs-folder', { required: false });
  const docsFolder = (docsFolderInput === '.' || docsFolderInput === '/') ? '' : docsFolderInput;
  const sourceLanguage = core.getInput('source-language', { required: false }) || 'en';
  const glossaryPath = core.getInput('glossary-path', { required: false }) || '';  // Empty by default - uses built-in
  const tocFile = core.getInput('toc-file', { required: false }) || '_toc.yml';
  const anthropicApiKey = core.getInput('anthropic-api-key', { required: true });
  const claudeModel = core.getInput('claude-model', { required: false }) || 'claude-sonnet-4-6';
  const githubToken = core.getInput('github-token', { required: true });
  
  const prLabelsRaw = core.getInput('pr-labels', { required: false }) || 'action-translation,automated';
  const prLabels = prLabelsRaw.split(',').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
  
  const prReviewersRaw = core.getInput('pr-reviewers', { required: false }) || '';
  const prReviewers = prReviewersRaw.split(',').map((r: string) => r.trim()).filter((r: string) => r.length > 0);

  const prTeamReviewersRaw = core.getInput('pr-team-reviewers', { required: false }) || '';
  const prTeamReviewers = prTeamReviewersRaw.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0);

  // Test mode: use PR head instead of merge commit
  const testModeRaw = core.getInput('test-mode', { required: false }) || 'false';
  const testMode = testModeRaw.toLowerCase() === 'true';

  // Validate target repo format
  if (!targetRepo.includes('/')) {
    throw new Error(`Invalid target-repo format: ${targetRepo}. Expected format: owner/repo`);
  }

  // Validate target language is supported
  validateLanguageCode(targetLanguage);

  // Validate Claude model (warning only, doesn't throw)
  validateClaudeModel(claudeModel);

  // Ensure docs folder ends with / (unless it's empty string for root level)
  const normalizedDocsFolder = docsFolder === '' ? '' : (docsFolder.endsWith('/') ? docsFolder : `${docsFolder}/`);

  return {
    targetRepo,
    targetLanguage,
    docsFolder: normalizedDocsFolder,
    sourceLanguage,
    glossaryPath,
    tocFile,
    anthropicApiKey,
    claudeModel,
    githubToken,
    prLabels,
    prReviewers,
    prTeamReviewers,
    testMode,
  };
}

/**
 * Get and validate action inputs for REVIEW mode
 */
export function getReviewInputs(): ReviewInputs {
  const sourceRepo = core.getInput('source-repo', { required: true });
  const maxSuggestionsRaw = core.getInput('max-suggestions', { required: false }) || '5';
  const maxSuggestions = parseInt(maxSuggestionsRaw, 10);
  
  if (isNaN(maxSuggestions) || maxSuggestions < 0) {
    throw new Error(`Invalid max-suggestions: '${maxSuggestionsRaw}'. Expected a non-negative integer.`);
  }

  // Handle docs-folder: '.' means root level (empty string for no prefix filter)
  const docsFolderInput = core.getInput('docs-folder', { required: false });
  const docsFolder = (docsFolderInput === '.' || docsFolderInput === '/') ? '' : docsFolderInput;
  
  const sourceLanguage = core.getInput('source-language', { required: false }) || 'en';
  const glossaryPath = core.getInput('glossary-path', { required: false }) || '';
  const anthropicApiKey = core.getInput('anthropic-api-key', { required: true });
  const claudeModel = core.getInput('claude-model', { required: false }) || 'claude-sonnet-4-6';
  const githubToken = core.getInput('github-token', { required: true });

  // Validate source repo format
  if (!sourceRepo.includes('/')) {
    throw new Error(`Invalid source-repo format: ${sourceRepo}. Expected format: owner/repo`);
  }

  // Validate Claude model (warning only, doesn't throw)
  validateClaudeModel(claudeModel);

  // Ensure docs folder ends with / (unless it's empty string for root level)
  const normalizedDocsFolder = docsFolder === '' ? '' : (docsFolder.endsWith('/') ? docsFolder : `${docsFolder}/`);

  return {
    sourceRepo,
    maxSuggestions,
    docsFolder: normalizedDocsFolder,
    sourceLanguage,
    glossaryPath,
    anthropicApiKey,
    claudeModel,
    githubToken,
  };
}

/**
 * Validate that the event is a merged PR or test mode label (SYNC mode)
 * Note: workflow_dispatch is NOT supported - use test-translation label for manual testing
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validatePREvent(context: any, testMode: boolean): { merged: boolean; prNumber: number; isTestMode: boolean } {
  const { eventName, payload } = context;

  // Handle pull_request events only
  if (eventName !== 'pull_request') {
    throw new Error(
      `This action only works on pull_request events. Got: ${eventName}. ` +
      `For manual testing, add the 'test-translation' label to a PR instead of using workflow_dispatch.`
    );
  }

  // Test mode: triggered by label, use PR head (not merged)
  if (testMode || (payload.action === 'labeled' && payload.label?.name === 'test-translation')) {
    const prNumber = payload.pull_request?.number;
    if (!prNumber) {
      throw new Error('Could not determine PR number from event payload');
    }
    core.info(`🧪 Running in TEST mode for PR #${prNumber} (using PR head commit, not merge)`);
    return { merged: true, prNumber, isTestMode: true };  // merged=true to continue processing
  }

  // Production mode: must be closed and merged
  if (payload.action !== 'closed') {
    throw new Error(`This action only runs when PRs are closed or labeled with test-translation. Got action: ${payload.action}`);
  }

  const merged = payload.pull_request?.merged === true;
  const prNumber = payload.pull_request?.number;

  if (!merged) {
    core.info('PR was closed but not merged. Skipping sync.');
  }

  if (!prNumber) {
    throw new Error('Could not determine PR number from event payload');
  }

  core.info(`🚀 Running in PRODUCTION mode for merged PR #${prNumber}`);
  return { merged, prNumber, isTestMode: false };
}

/**
 * Validate that the event is a PR event (REVIEW mode)
 * Returns PR number for open PRs, or throws if not a PR event
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validateReviewPREvent(context: any): { prNumber: number } {
  const { eventName, payload } = context;

  if (eventName !== 'pull_request') {
    throw new Error(`Review mode only works on pull_request events. Got: ${eventName}`);
  }

  const prNumber = payload.pull_request?.number;
  if (!prNumber) {
    throw new Error('Could not determine PR number from event payload');
  }

  core.info(`📝 Running REVIEW mode for PR #${prNumber}`);
  return { prNumber };
}

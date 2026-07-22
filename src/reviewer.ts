/**
 * Translation Reviewer for GitHub Action Review Mode
 *
 * Provides AI-powered quality assessment of translation PRs.
 * Adapted from tool-test-action-on-github/evaluate/src/evaluator.ts
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import Anthropic from '@anthropic-ai/sdk';
import {
  APIError,
  AuthenticationError,
  RateLimitError,
  APIConnectionError,
  BadRequestError,
} from '@anthropic-ai/sdk';
import {
  TranslationQualityResult,
  DiffQualityResult,
  ReviewResult,
  ReviewFinding,
  ChangedSection,
  FileChange,
} from './types.js';
import { parseTranslationSyncMetadata, TranslationSyncMetadata } from './pr-creator.js';
import { DEFAULT_CLAUDE_MODEL, MAX_TOKENS, DEFAULT_THINKING } from './models.js';
import {
  ReviewVerdictV2,
  REVIEW_VERDICT_SCHEMA_VERSION,
  buildVerdictBlock,
  computeRecommendation,
  findingToDisplayString,
  getEngineVersion,
  normalizeFindings,
  sanitizeCommentText,
  sortAndCapFindings,
  truncateField,
} from './review-verdict.js';

// Default model for review (can be overridden)
const DEFAULT_REVIEW_MODEL = DEFAULT_CLAUDE_MODEL;

/** Retry configuration for review API calls */
const REVIEW_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000, // 1s, 2s, 4s with exponential backoff
};

/**
 * Hidden marker on the first line of every review comment this action posts.
 * Invisible on GitHub; lets later runs find their own comment without prose matching.
 */
export const REVIEW_COMMENT_MARKER = '<!-- action-translation-review -->';

/** Heading of review comments posted before the marker existed (v0.16.1 and earlier). */
const LEGACY_REVIEW_HEADING = /^#{2} .*Translation Quality Review/;

/** Attempts for the comment upsert; >1 only matters when a concurrent run deletes our target. */
const REVIEW_COMMENT_UPSERT_ATTEMPTS = 3;

/**
 * Structural type for items from `pulls.listFiles` — the @octokit majors that
 * arrived with @actions/github@8 no longer infer element types through
 * `paginate()`, so the fields the reviewer uses are pinned here explicitly.
 */
interface PrListFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  previous_filename?: string;
}

/** The four criteria a translation review must score, with their verdict weights. */
export const REVIEW_CRITERIA = [
  { key: 'accuracy', weight: 0.35 },
  { key: 'fluency', weight: 0.25 },
  { key: 'terminology', weight: 0.25 },
  { key: 'formatting', weight: 0.15 },
] as const;

export type CriterionScores = Record<(typeof REVIEW_CRITERIA)[number]['key'], number>;

/**
 * Validate the criterion scores in a model review response (#102).
 *
 * A missing criterion previously flowed straight into the weighted sum —
 * `undefined * 0.15` → NaN → both verdict thresholds false → automatic FAIL
 * on a clean PR, rendered as "undefined/10" and "NaN/10". Scores must be
 * finite numbers; numeric strings ("9") are coerced as a mercy since the
 * model occasionally quotes values. Exported for testing.
 */
export function validateCriterionScores(result: Record<string, unknown>): {
  valid: boolean;
  missing: string[];
  scores?: CriterionScores;
} {
  const scores = {} as CriterionScores;
  const missing: string[] = [];

  for (const { key } of REVIEW_CRITERIA) {
    const raw = result[key];
    const value =
      typeof raw === 'number' ? raw : typeof raw === 'string' && raw !== '' ? Number(raw) : NaN;
    // Range-checked, not merely finite. A response on a 0-100 scale
    // (accuracy: 85) is finite, clears every floor, and means nothing of the
    // sort — a scale error must be rejected like a missing criterion.
    if (Number.isFinite(value) && value >= 0 && value <= 10) {
      scores[key] = value;
    } else {
      missing.push(key);
    }
  }

  return missing.length === 0 ? { valid: true, missing, scores } : { valid: false, missing };
}

/**
 * Whether `body` is a review comment posted by this action.
 *
 * Both patterns are anchored at the start of the body: these comments get deleted as
 * duplicates, so matching a human's comment that quotes a review would destroy it.
 */
export function isActionReviewComment(body: string | undefined | null): boolean {
  if (!body) return false;
  if (body.startsWith(REVIEW_COMMENT_MARKER)) return true;
  return LEGACY_REVIEW_HEADING.test(body) && body.includes('action-translation');
}

/** Whether an Octokit error is a 404 — the comment was already deleted by a concurrent run. */
function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { status?: number }).status === 404
  );
}

/**
 * Extract JSON from an LLM response string.
 * Tries multiple strategies: raw parse, markdown code block extraction, greedy regex.
 * Returns a non-null object (throws if the parsed value is not an object).
 */
export function parseJsonResponse(text: string): Record<string, unknown> {
  let parsed: unknown;

  // Strategy 1: Direct parse (response is pure JSON)
  try {
    parsed = JSON.parse(text);
  } catch {
    // Continue to next strategy
  }

  // Strategy 2: Extract from markdown code block (```json ... ``` or ``` ... ```)
  if (parsed === undefined) {
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      const content = codeBlockMatch[1].trim();
      try {
        parsed = JSON.parse(content);
      } catch {
        // Continue to next strategy
      }
    }
  }

  // Strategy 3: Greedy regex to find outermost JSON object
  if (parsed === undefined) {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    }
  }

  if (parsed === undefined) {
    throw new Error('No JSON object found in response');
  }

  // Validate that the result is a non-null object (not a number, string, array, etc.)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Response JSON is not an object');
  }

  return parsed as Record<string, unknown>;
}

/**
 * Extract preamble (content before first heading) from a markdown document
 */
function extractPreamble(content: string): string {
  const lines = content.split('\n');
  const preambleLines: string[] = [];

  for (const line of lines) {
    if (line.match(/^#{1,6}\s+/)) {
      break;
    }
    preambleLines.push(line);
  }

  return preambleLines.join('\n').trim();
}

/**
 * Extract sections from a markdown document
 * Returns an array of {heading, content} in document order
 */
function extractSections(content: string): Array<{ heading: string; content: string }> {
  const sections: Array<{ heading: string; content: string }> = [];
  const lines = content.split('\n');

  let currentHeading = '';
  let currentContent: string[] = [];
  let inSection = false;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{2,6})\s+(.+)$/);
    if (headingMatch) {
      // Save previous section
      if (inSection && currentHeading) {
        sections.push({
          heading: currentHeading,
          content: currentContent.join('\n').trim(),
        });
      }
      currentHeading = line;
      currentContent = [];
      inSection = true;
    } else if (inSection) {
      currentContent.push(line);
    }
  }

  // Save last section
  if (inSection && currentHeading) {
    sections.push({
      heading: currentHeading,
      content: currentContent.join('\n').trim(),
    });
  }

  return sections;
}

/**
 * Generate a simple ID from heading text for matching.
 * Uses Unicode-aware matching to preserve non-Latin scripts.
 */
function headingToId(heading: string): string {
  return heading
    .replace(/^#{2,6}\s+/, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Identify changed sections by comparing before and after content
 */
export function identifyChangedSections(
  sourceBefore: string,
  sourceAfter: string,
  targetBefore: string,
  targetAfter: string
): ChangedSection[] {
  const changedSections: ChangedSection[] = [];

  // Handle empty documents
  if (!sourceAfter && !targetAfter) {
    return [{ heading: '(document deleted)', changeType: 'deleted' }];
  }

  if (!sourceBefore && !targetBefore) {
    const sections = extractSections(sourceAfter);
    if (sections.length === 0) {
      return [{ heading: '(new document)', changeType: 'added', englishContent: sourceAfter }];
    }
    return sections.map((s) => ({
      heading: s.heading,
      changeType: 'added' as const,
      englishContent: s.content,
    }));
  }

  // Check for pure rename (no content changes)
  const normalizeForComparison = (s: string) => s.replace(/\r\n/g, '\n').trim();
  if (
    normalizeForComparison(sourceBefore) === normalizeForComparison(sourceAfter) &&
    normalizeForComparison(targetBefore) === normalizeForComparison(targetAfter)
  ) {
    return [{ heading: '(no content changes - file renamed)', changeType: 'modified' as const }];
  }

  // Check preamble changes
  const sourcePreambleBefore = extractPreamble(sourceBefore);
  const sourcePreambleAfter = extractPreamble(sourceAfter);
  const targetPreambleBefore = extractPreamble(targetBefore);
  const targetPreambleAfter = extractPreamble(targetAfter);

  if (
    sourcePreambleBefore !== sourcePreambleAfter ||
    targetPreambleBefore !== targetPreambleAfter
  ) {
    changedSections.push({
      heading: '(preamble/frontmatter)',
      changeType: 'modified',
      englishContent: sourcePreambleAfter,
      translatedContent: targetPreambleAfter,
    });
  }

  // Extract sections
  const sourceBeforeSections = extractSections(sourceBefore);
  const sourceAfterSections = extractSections(sourceAfter);
  const targetAfterSections = extractSections(targetAfter);

  // Build maps for quick lookup by ID
  const beforeById = new Map(sourceBeforeSections.map((s) => [headingToId(s.heading), s]));
  const afterById = new Map(sourceAfterSections.map((s) => [headingToId(s.heading), s]));

  // Check for added and modified sections
  for (let i = 0; i < sourceAfterSections.length; i++) {
    const section = sourceAfterSections[i];
    const id = headingToId(section.heading);
    const beforeSection = beforeById.get(id);
    const targetSection = targetAfterSections[i];

    if (!beforeSection) {
      changedSections.push({
        heading: section.heading,
        changeType: 'added',
        englishContent: section.content,
        translatedContent: targetSection?.content,
      });
    } else if (
      beforeSection.content !== section.content ||
      beforeSection.heading !== section.heading
    ) {
      changedSections.push({
        heading: section.heading,
        changeType: 'modified',
        englishContent: section.content,
        translatedContent: targetSection?.content,
      });
    }
  }

  // Check for deleted sections
  for (const section of sourceBeforeSections) {
    const id = headingToId(section.heading);
    if (!afterById.has(id)) {
      changedSections.push({
        heading: section.heading,
        changeType: 'deleted',
      });
    }
  }

  return changedSections;
}

/**
 * Translation Reviewer class
 * Evaluates translation quality and posts review comments on PRs
 */
export class TranslationReviewer {
  private anthropic: Anthropic;
  private octokit: ReturnType<typeof github.getOctokit>;
  private model: string;
  private maxSuggestions: number;

  constructor(
    anthropicApiKey: string,
    githubToken: string,
    model: string = DEFAULT_REVIEW_MODEL,
    maxSuggestions: number = 5
  ) {
    this.anthropic = new Anthropic({ apiKey: anthropicApiKey });
    this.octokit = github.getOctokit(githubToken);
    this.model = model;
    this.maxSuggestions = maxSuggestions;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Call Claude API with retry logic and exponential backoff.
   * Retries on transient API errors and parse failures.
   */
  private async callWithRetry(
    prompt: string,
    maxTokens: number,
    operationName: string
  ): Promise<Record<string, unknown>> {
    const { maxRetries, baseDelayMs } = REVIEW_RETRY_CONFIG;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const stream = this.anthropic.messages.stream({
          model: this.model,
          max_tokens: maxTokens,
          thinking: DEFAULT_THINKING,
          messages: [{ role: 'user', content: prompt }],
        });
        const response = await stream.finalMessage();

        // A max_tokens stop means the verdict JSON was cut off; retrying at
        // the same cap cannot succeed (generic Error is not retried below).
        if (response.stop_reason === 'max_tokens') {
          throw new Error(
            `${operationName}: response truncated at max_tokens=${maxTokens}; verdict JSON is incomplete`
          );
        }

        const content = response.content[0];
        if (!content || content.type !== 'text') {
          throw new Error(
            `Unexpected response from Claude: ${content ? content.type : `empty content (stop_reason: ${response.stop_reason})`}`
          );
        }

        return parseJsonResponse(content.text);
      } catch (error) {
        // Don't retry on non-transient API errors
        if (error instanceof AuthenticationError || error instanceof BadRequestError) {
          throw error;
        }

        // Retry on transient API errors or parse failures
        const isApiRetryable =
          error instanceof RateLimitError ||
          error instanceof APIConnectionError ||
          (error instanceof APIError && error.status !== undefined && error.status >= 500);
        const isParseFailure =
          error instanceof SyntaxError ||
          (error instanceof Error && error.message.includes('No JSON object'));

        if ((!isApiRetryable && !isParseFailure) || attempt === maxRetries) {
          if (isParseFailure) {
            core.error(`${operationName}: Failed to parse response after ${maxRetries} attempts`);
          }
          throw error;
        }

        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        core.info(
          `${operationName}: retryable error on attempt ${attempt}/${maxRetries}: ${error instanceof Error ? error.message : error}. Retrying in ${delay}ms...`
        );
        await this.sleep(delay);
      }
    }

    throw new Error('Unexpected: retry loop completed without result');
  }

  /**
   * Parse source PR number from translation PR body
   * Looks for: ### Source PR\n**[#123 - ...
   */
  private parseSourcePRNumber(prBody: string | null): number | null {
    if (!prBody) return null;

    // Match: ### Source PR\n**[#123
    // \r?\n: GitHub normalizes edited PR bodies to CRLF — a \n-only match
    // permanently breaks review mode for any PR whose body was edited.
    const match = prBody.match(/### Source PR\r?\n\*\*\[#(\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }
    return null;
  }

  /**
   * Get source PR diff (English before/after)
   */
  private async getSourceDiff(
    sourceOwner: string,
    sourceRepoName: string,
    sourcePrNumber: number,
    filenames: string[]
  ): Promise<{ before: Map<string, string>; after: Map<string, string> }> {
    const before = new Map<string, string>();
    const after = new Map<string, string>();

    try {
      // Get source PR details
      const { data: sourcePr } = await this.octokit.rest.pulls.get({
        owner: sourceOwner,
        repo: sourceRepoName,
        pull_number: sourcePrNumber,
      });

      // Get files changed in source PR (paginate — PRs can touch >30 files)
      const sourceFiles: PrListFile[] = await this.octokit.paginate(
        this.octokit.rest.pulls.listFiles,
        {
          owner: sourceOwner,
          repo: sourceRepoName,
          pull_number: sourcePrNumber,
        }
      );

      for (const filename of filenames) {
        // Check if this file was changed in source PR
        const sourceFile = sourceFiles.find((f: PrListFile) => f.filename === filename);

        // For renamed files, use previous filename for "before"
        const beforeFilename =
          sourceFile?.status === 'renamed' && sourceFile.previous_filename
            ? sourceFile.previous_filename
            : filename;

        // Get content BEFORE (from base ref)
        if (!sourceFile || sourceFile.status !== 'added') {
          try {
            const { data: beforeData } = await this.octokit.rest.repos.getContent({
              owner: sourceOwner,
              repo: sourceRepoName,
              path: beforeFilename,
              ref: sourcePr.base.sha,
            });
            if ('content' in beforeData) {
              before.set(filename, Buffer.from(beforeData.content, 'base64').toString('utf-8'));
            }
          } catch {
            // File didn't exist before
          }
        }

        // Get content AFTER (from head ref)
        if (!sourceFile || sourceFile.status !== 'removed') {
          try {
            const { data: afterData } = await this.octokit.rest.repos.getContent({
              owner: sourceOwner,
              repo: sourceRepoName,
              path: filename,
              ref: sourcePr.head.sha,
            });
            if ('content' in afterData) {
              after.set(filename, Buffer.from(afterData.content, 'base64').toString('utf-8'));
            }
          } catch {
            // File doesn't exist after (deleted)
          }
        }
      }

      core.info(`✓ Fetched source PR #${sourcePrNumber} diff for ${filenames.length} file(s)`);
    } catch (error) {
      core.warning(`Could not fetch source PR #${sourcePrNumber}: ${error}`);
    }

    return { before, after };
  }

  /**
   * Get source content at a specific commit (for resync PRs, which have no
   * source PR). Returns the same shape as getSourceDiff with an empty
   * `before` map — a resync review compares the whole target against the
   * current source, not against a source-side diff.
   */
  private async getSourceAtCommit(
    sourceOwner: string,
    sourceRepoName: string,
    commitSha: string,
    filenames: string[]
  ): Promise<{ before: Map<string, string>; after: Map<string, string> }> {
    const before = new Map<string, string>();
    const after = new Map<string, string>();

    for (const filename of filenames) {
      try {
        const { data } = await this.octokit.rest.repos.getContent({
          owner: sourceOwner,
          repo: sourceRepoName,
          path: filename,
          ref: commitSha,
        });
        if ('content' in data) {
          after.set(filename, Buffer.from(data.content, 'base64').toString('utf-8'));
        }
      } catch (error) {
        core.warning(`Could not fetch ${filename} @ ${commitSha.substring(0, 7)}: ${error}`);
      }
    }

    core.info(
      `✓ Fetched source @ ${commitSha.substring(0, 7)} for ${after.size}/${filenames.length} file(s)`
    );
    return { before, after };
  }

  /**
   * Review a translation PR
   */
  async reviewPR(
    prNumber: number,
    sourceRepo: string,
    targetOwner: string,
    targetRepo: string,
    docsFolder: string,
    glossaryTerms?: string,
    targetLanguage?: string,
    autoMergeMode: 'off' | 'shadow' = 'off'
  ): Promise<ReviewResult> {
    core.info(`Starting review of PR #${prNumber}...`);

    // Get PR details
    const { data: pr } = await this.octokit.rest.pulls.get({
      owner: targetOwner,
      repo: targetRepo,
      pull_number: prNumber,
    });

    // Get changed files in the PR (paginate — PRs can touch >30 files)
    const files: PrListFile[] = await this.octokit.paginate(this.octokit.rest.pulls.listFiles, {
      owner: targetOwner,
      repo: targetRepo,
      pull_number: prNumber,
    });

    // Filter for markdown files in docs folder
    const markdownFiles = files.filter(
      (f: PrListFile) => f.filename.startsWith(docsFolder) && f.filename.endsWith('.md')
    );

    if (markdownFiles.length === 0) {
      core.info('No markdown files to review');
      const emptyResult: ReviewResult = {
        prNumber,
        timestamp: new Date().toISOString(),
        translationQuality: {
          score: 10,
          accuracy: 10,
          fluency: 10,
          terminology: 10,
          formatting: 10,
          syntaxErrors: [],
          findings: [],
          findingsMalformed: false,
          issues: [],
          strengths: ['No markdown files to review'],
          summary: 'No markdown files changed in this PR.',
        },
        diffQuality: {
          score: 10,
          scopeCorrect: true,
          positionCorrect: true,
          structurePreserved: true,
          headingMapCorrect: true,
          issues: [],
          summary: 'No changes to evaluate.',
          scopeDetails: 'No markdown files changed.',
          positionDetails: 'N/A',
          structureDetails: 'N/A',
        },
        overallScore: 10,
        verdict: 'PASS',
        // Fail-closed: with nothing reviewed there is nothing to gate on.
        recommendation: 'editor',
        recommendationReasons: ['no markdown files reviewed — nothing to gate'],
        autoMergeMode,
        ...(autoMergeMode === 'shadow' ? { wouldAutoMerge: false } : {}),
        reviewedHeadSha: pr.head.sha,
        reviewComment: 'No markdown files to review in this PR.',
      };
      return emptyResult;
    }

    // Get content for evaluation
    const [sourceOwner, sourceRepoName] = sourceRepo.split('/');

    // Parse source PR number from translation PR body
    // Format: "### Source PR\n**[#123 - Title](url)**"
    // Always present for PRs created by sync mode. CLI forward resync PRs
    // have no source PR — they carry a translation-sync-metadata block with
    // mode "resync" and a source commit SHA instead (#104).
    const sourcePrNumber = this.parseSourcePRNumber(pr.body);
    let resyncMetadata: TranslationSyncMetadata | undefined;
    if (!sourcePrNumber) {
      const metadata = parseTranslationSyncMetadata(pr.body || '');
      if (metadata && !metadata.sourcePR && metadata.sourceCommitSha) {
        resyncMetadata = metadata;
        core.info(
          `No source PR reference — resync PR detected; reviewing against source @ ${metadata.sourceCommitSha.substring(0, 7)}`
        );
      } else {
        throw new Error(
          'Could not find source PR reference in translation PR body. ' +
            'This PR may not have been created by the translation action. ' +
            'Expected format: "### Source PR\\n**[#123..." ' +
            '(or a translation-sync-metadata block for resync PRs)'
        );
      }
    } else {
      core.info(`Found source PR reference: #${sourcePrNumber}`);
    }

    // Get filenames for fetching
    const filenames = markdownFiles.map((f) => f.filename);

    // Fetch source content (English before/after).
    // Sync PRs: from the source PR diff — accurate change detection.
    // Resync PRs: current source at the recorded commit; there is no
    // source-side "before" because the change under review is target-side.
    const { before: sourceBeforeMap, after: sourceAfterMap } = resyncMetadata
      ? await this.getSourceAtCommit(
          sourceOwner,
          sourceRepoName,
          resyncMetadata.sourceCommitSha,
          filenames
        )
      : await this.getSourceDiff(sourceOwner, sourceRepoName, sourcePrNumber as number, filenames);

    // Build content strings for evaluation
    let sourceEnglish = '';
    let targetTranslation = '';
    let sourceBefore = '';
    let targetBefore = '';
    const changedSections: ChangedSection[] = [];

    for (const file of markdownFiles) {
      try {
        // Get target (translation) content - after changes
        const { data: targetData } = await this.octokit.rest.repos.getContent({
          owner: targetOwner,
          repo: targetRepo,
          path: file.filename,
          ref: pr.head.sha,
        });

        if ('content' in targetData) {
          targetTranslation += Buffer.from(targetData.content, 'base64').toString('utf-8') + '\n\n';
        }

        // Get target content before changes (base branch)
        try {
          const { data: targetBeforeData } = await this.octokit.rest.repos.getContent({
            owner: targetOwner,
            repo: targetRepo,
            path: file.filename,
            ref: pr.base.sha,
          });
          if ('content' in targetBeforeData) {
            targetBefore +=
              Buffer.from(targetBeforeData.content, 'base64').toString('utf-8') + '\n\n';
          }
        } catch {
          // File is new in target
        }

        // Get source (English) content from source PR diff
        if (sourceAfterMap.has(file.filename)) {
          sourceEnglish += sourceAfterMap.get(file.filename) + '\n\n';
        } else {
          core.warning(
            `Source content not found for ${file.filename} in ${
              resyncMetadata
                ? `source @ ${resyncMetadata.sourceCommitSha.substring(0, 7)}`
                : `source PR #${sourcePrNumber}`
            }`
          );
        }

        // Get source content before from source PR diff
        if (sourceBeforeMap.has(file.filename)) {
          sourceBefore += sourceBeforeMap.get(file.filename) + '\n\n';
        }
        // Note: sourceBefore may be empty for new files, which is correct
      } catch (error) {
        core.warning(`Error processing ${file.filename}: ${error}`);
      }
    }

    // Identify changed sections.
    // A resync PR realigns the whole document, so scoping suggestions to a
    // source-side diff (which doesn't exist) would be wrong — review it all.
    if (resyncMetadata) {
      changedSections.push({
        heading: '(whole-file resync — the entire document was re-aligned to the current source)',
        changeType: 'modified',
      });
    } else {
      const detectedChanges = identifyChangedSections(
        sourceBefore,
        sourceEnglish,
        targetBefore,
        targetTranslation
      );
      changedSections.push(...detectedChanges);
    }

    // Evaluate translation quality
    const translationQuality = await this.evaluateTranslation(
      sourceEnglish,
      targetTranslation,
      changedSections,
      filenames,
      glossaryTerms,
      targetLanguage
    );

    // Evaluate diff quality. For resync PRs the source has no before/after —
    // pass the current source as both and tell the evaluator large target
    // diffs are expected.
    const diffQuality = await this.evaluateDiff(
      resyncMetadata ? sourceEnglish : sourceBefore,
      sourceEnglish,
      targetBefore,
      targetTranslation,
      markdownFiles.map((f) => ({
        filename: f.filename,
        status: f.status as 'added' | 'modified' | 'removed' | 'renamed',
        additions: f.additions,
        deletions: f.deletions,
      })),
      resyncMetadata !== undefined
    );

    // Calculate overall score and verdict
    const overallScore = translationQuality.score * 0.7 + diffQuality.score * 0.3;
    let verdict: 'PASS' | 'WARN' | 'FAIL';
    if (overallScore >= 8 && translationQuality.syntaxErrors.length === 0) {
      verdict = 'PASS';
    } else if (overallScore >= 6) {
      verdict = 'WARN';
    } else {
      verdict = 'FAIL';
    }

    // Verdict v2 (#103, #66): unify every issue class into one findings array,
    // then compute the categorical routing recommendation.
    //
    // Severity assignment differs by source, deliberately:
    //   - model findings carry their own rated severity;
    //   - syntax errors are blockers (the prompt calls them CRITICAL, and
    //     `syntaxErrorCount` gates independently);
    //   - diff-quality issues are recorded at `minor`/`structure`, which does
    //     NOT gate. `evaluateDiff` returns free prose with no severity concept,
    //     and harness runs showed it emits narration and self-correction
    //     ("wait, checking again…", "this matches the new schema, so it's
    //     fine, but…") alongside real observations. Promoting that to `major`
    //     made it an absolute gate, which both buried the real signal and
    //     would poison the shadow-phase calibration data with false negatives.
    //     The authoritative diff signal is the four `diffChecks` booleans,
    //     which gate absolutely; these strings are their explanation.
    const soleFile = filenames.length === 1 ? filenames[0] : null;
    const syntaxFindings: ReviewFinding[] = translationQuality.syntaxErrors.map((e) => ({
      severity: 'blocker',
      category: 'syntax',
      file: soleFile,
      location: null,
      description: truncateField(e),
      suggestion: null,
    }));
    const diffFindings: ReviewFinding[] = diffQuality.issues.map((i) => ({
      severity: 'minor',
      category: 'structure',
      file: soleFile,
      location: null,
      description: truncateField(i),
      suggestion: null,
    }));
    // Re-sorted and re-capped: normalizeFindings ordered and bounded the
    // model's own findings, but concatenating syntax and diff findings onto
    // the end breaks both, and the contract publishes "worst first, capped".
    const allFindings = sortAndCapFindings([
      ...translationQuality.findings,
      ...syntaxFindings,
      ...diffFindings,
    ]);

    const diffChecks = {
      scopeCorrect: diffQuality.scopeCorrect,
      positionCorrect: diffQuality.positionCorrect,
      structurePreserved: diffQuality.structurePreserved,
      headingMapCorrect: diffQuality.headingMapCorrect,
    };
    // A failed source fetch is only a warning on the fetch path (getSourceDiff
    // catches everything and returns empty maps), so the review can end up
    // scoring the target against nothing and calling it clean. That must never
    // reach auto-merge.
    const sourceContentMissing = sourceEnglish.trim() === '';
    if (sourceContentMissing) {
      core.warning(
        'No source content was fetched for any reviewed file — the verdict is not a real comparison and routes to editor'
      );
    }

    const { recommendation, reasons } = computeRecommendation({
      verdict,
      scores: {
        accuracy: translationQuality.accuracy,
        fluency: translationQuality.fluency,
        terminology: translationQuality.terminology,
        formatting: translationQuality.formatting,
      },
      diffChecks,
      syntaxErrorCount: translationQuality.syntaxErrors.length,
      findings: allFindings,
      findingsMalformed: translationQuality.findingsMalformed,
      sourceContentMissing,
      // With max-suggestions: 0 the prompt asks for no findings at all, so an
      // empty findings array is not evidence of a clean translation.
      findingsSuppressed: this.maxSuggestions === 0,
    });

    const wouldAutoMerge = autoMergeMode === 'shadow' ? recommendation === 'auto-merge' : undefined;
    if (autoMergeMode === 'shadow') {
      core.notice(
        `Shadow auto-merge gate: would ${wouldAutoMerge ? '' : 'NOT '}auto-merge PR #${prNumber}` +
          (wouldAutoMerge ? '' : ` — ${reasons.join('; ')}`) +
          ' (recorded in the verdict block; no action taken)'
      );
    }

    const timestamp = new Date().toISOString();
    const verdictV2: ReviewVerdictV2 = {
      schemaVersion: REVIEW_VERDICT_SCHEMA_VERSION,
      engineVersion: getEngineVersion(),
      reviewerModel: this.model,
      reviewedHeadSha: pr.head.sha,
      targetBaseSha: pr.base.sha,
      sourceRepo,
      prNumber,
      timestamp,
      verdict,
      recommendation,
      recommendationReasons: reasons,
      autoMergeMode,
      ...(wouldAutoMerge !== undefined ? { wouldAutoMerge } : {}),
      scores: {
        accuracy: translationQuality.accuracy,
        fluency: translationQuality.fluency,
        terminology: translationQuality.terminology,
        formatting: translationQuality.formatting,
        translation: translationQuality.score,
        diff: diffQuality.score,
        overall: Math.round(overallScore * 10) / 10,
      },
      diffChecks,
      syntaxErrorCount: translationQuality.syntaxErrors.length,
      findings: allFindings,
    };

    // Generate review comment, with the machine-readable block at the end
    const reviewComment =
      this.generateReviewComment(translationQuality, diffQuality, verdict, {
        recommendation,
        reasons,
        wouldAutoMerge,
      }) +
      '\n\n' +
      buildVerdictBlock(verdictV2);

    // Post review comment
    await this.postReviewComment(prNumber, targetOwner, targetRepo, reviewComment);

    const result: ReviewResult = {
      prNumber,
      timestamp,
      translationQuality,
      diffQuality,
      overallScore: Math.round(overallScore * 10) / 10,
      verdict,
      recommendation,
      recommendationReasons: reasons,
      autoMergeMode,
      ...(wouldAutoMerge !== undefined ? { wouldAutoMerge } : {}),
      reviewedHeadSha: pr.head.sha,
      reviewComment,
    };

    return result;
  }

  /**
   * Evaluate translation quality using Claude
   */
  private async evaluateTranslation(
    sourceEnglish: string,
    targetTranslation: string,
    changedSections: ChangedSection[],
    filenames: string[],
    glossaryTerms?: string,
    targetLanguage?: string
  ): Promise<TranslationQualityResult> {
    const changedSectionsPrompt = this.formatChangedSections(changedSections);
    const filesList = filenames.map((f) => `- ${f}`).join('\n');

    // Determine language name for prompt
    const languageNames: Record<string, string> = {
      'zh-cn': 'Simplified Chinese',
      'zh-tw': 'Traditional Chinese',
      fa: 'Persian (Farsi)',
      es: 'Spanish',
      fr: 'French',
      de: 'German',
      ja: 'Japanese',
      ko: 'Korean',
    };
    const targetLangName = targetLanguage
      ? languageNames[targetLanguage] || targetLanguage
      : 'the target language';

    const glossarySection = glossaryTerms
      ? `\n## Reference Glossary\nThe translation should follow this established terminology glossary:\n${glossaryTerms}\n`
      : '';

    const prompt = `You are a professional translator and quality evaluator specializing in technical/academic content translation from English to ${targetLangName}.

## Task
Evaluate the quality of the ${targetLangName} translation compared to the English source.
${changedSectionsPrompt}
## English Source Document
\`\`\`markdown
${sourceEnglish}
\`\`\`

## ${targetLangName} Translation
\`\`\`markdown
${targetTranslation}
\`\`\`
${glossarySection}
## IMPORTANT: About the Translation Metadata

The ${targetLangName} translation contains a \`translation\` section in the YAML frontmatter that is NOT present in the English source. This is CORRECT and EXPECTED behavior:

\`\`\`yaml
translation:
  title: "介绍"
  headings:
    introduction: "介绍"
    background: "背景"
\`\`\`

This is a feature of the translation sync system that maps English heading IDs to ${targetLangName} headings for section matching across languages. The \`title\` field tracks the translated document title. Do NOT flag this as an issue or formatting problem - it is intentional and does not affect Jupyter Book compilation.

**Note on double-colon notation**: The headings may use \`section::subsection\` notation (e.g., \`supply-and-demand::market-dynamics\`) to represent hierarchical headings. This double-colon \`::\` syntax is intentional and valid - it represents the relationship between a section and its nested subsection. This is safe in YAML because YAML only treats \`:\` as a key-value separator when followed by a space.

## Evaluation Criteria
Rate each criterion from 1-10:

1. **Accuracy** (1-10): Does the translation accurately convey the meaning of the English source?
   - Technical terms translated correctly
   - No missing or added information
   - Mathematical concepts preserved

2. **Fluency** (1-10): Does the translation read naturally in ${targetLangName}?
   - Natural sentence structure
   - Appropriate academic register
   - No awkward phrasing

3. **Terminology** (1-10): Is technical terminology consistent and correct?
   - Does the translation follow the reference glossary above?
   - Domain-specific terms handled appropriately
   - Consistent translation of repeated terms
   - Proper use of established ${targetLangName} terminology

4. **Formatting** (1-10): Is MyST/Markdown formatting preserved?
   - Math equations (LaTeX) intact
   - Code blocks preserved
   - Headings, lists, and structure maintained
   - Links and references correct

5. **Syntax** (check for errors): Check for markdown/MyST syntax errors in the translation:
   - Headings MUST have a space after # (e.g., "## Title" not "##Title")
   - Code blocks must have matching \`\`\` delimiters
   - Math blocks must have matching $$ delimiters
   - MyST directives must use correct syntax: \`\`\`{directive}
   - Report any syntax errors found - these are CRITICAL issues that must be fixed

## Files Under Review
The changed markdown files in this PR are (the document blocks above concatenate them in this order):
${filesList}

## Response Format
Respond with ONLY valid JSON in this exact format (no markdown code blocks):
{
  "accuracy": <number 1-10>,
  "fluency": <number 1-10>,
  "terminology": <number 1-10>,
  "formatting": <number 1-10>,
  "syntaxErrors": ["error 1 with line/location if possible", "error 2"],
  "findings": [
    {
      "severity": "blocker|major|minor|nit",
      "category": "accuracy|fluency|terminology|formatting",
      "file": "<one of the file paths listed under Files Under Review, or null>",
      "location": "<section heading or a short quote locating the finding, or null>",
      "description": "<what is wrong, specific and self-contained>",
      "suggestion": "<proposed replacement text, or null>"
    }
  ],
  "strengths": ["strength 1", "strength 2"],
  "summary": "Brief overall assessment"
}

Note: "syntaxErrors" should be an empty array [] if no markdown syntax errors are found. Syntax errors are CRITICAL and should always be reported even if the array would otherwise be empty.

## Findings Guidelines
- The "findings" array can contain **0 to ${this.maxSuggestions} findings** - an empty array [] is perfectly valid for excellent translations
- Severity meanings:
  - "blocker": meaning inversion, wrong mathematics or code, or broken MyST that will not build
  - "major": an accuracy or terminology error a reader would be misled by
  - "minor": correct but awkward phrasing, or a minor terminology inconsistency
  - "nit": a stylistic preference
- "category" must name the criterion the finding counts against
- "file" must be one of the listed file paths (or null if you cannot attribute the finding)
- Each finding must be specific and actionable; prioritize by importance: accuracy first, then fluency, terminology, formatting
- Do NOT invent findings just to fill the array - quality over quantity

**CRITICAL**: Findings MUST relate ONLY to the sections that were changed in this PR. Do not report findings for unchanged parts of the document.`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any = await this.callWithRetry(prompt, MAX_TOKENS.review, 'evaluateTranslation');

    // Validate the four criterion scores before they reach the weighted sum
    // (#102) — retry once on an incomplete response, then fail loudly rather
    // than let a partial review become an automatic FAIL verdict.
    let check = validateCriterionScores(result);
    if (!check.valid) {
      core.warning(
        `evaluateTranslation: response missing numeric criteria [${check.missing.join(', ')}] — retrying`
      );
      result = await this.callWithRetry(prompt, MAX_TOKENS.review, 'evaluateTranslation');
      check = validateCriterionScores(result);
      if (!check.valid) {
        throw new Error(
          `evaluateTranslation: response still missing numeric criterion scores [${check.missing.join(', ')}] after retry — refusing to compute a verdict from an incomplete review`
        );
      }
    }
    const scores = check.scores!;
    const score = REVIEW_CRITERIA.reduce((sum, c) => sum + scores[c.key] * c.weight, 0);

    // Structured findings (verdict v2). Legacy `issues` responses are coerced
    // conservatively; a payload with neither field usable sets the malformed
    // flag, which gates the recommendation (fail-closed).
    const { findings, malformed } = normalizeFindings(result.findings, result.issues, filenames);
    if (malformed) {
      core.warning(
        'evaluateTranslation: findings payload missing or malformed — recommendation will fail closed to editor'
      );
    }

    return {
      score: Math.round(score * 10) / 10,
      accuracy: scores.accuracy,
      fluency: scores.fluency,
      terminology: scores.terminology,
      formatting: scores.formatting,
      syntaxErrors: Array.isArray(result.syntaxErrors)
        ? result.syntaxErrors.map((e: unknown) => String(e))
        : [],
      findings,
      findingsMalformed: malformed,
      issues: findings.map(findingToDisplayString),
      strengths: result.strengths || [],
      summary: result.summary || '',
    };
  }

  /**
   * Evaluate diff quality using Claude
   */
  private async evaluateDiff(
    sourceBefore: string,
    sourceAfter: string,
    targetBefore: string,
    targetAfter: string,
    targetFiles: FileChange[],
    isResync = false
  ): Promise<DiffQualityResult> {
    const contextNote = isResync
      ? `A whole-file resync re-aligned the target document to the current source: the source "Before" and "After" below are identical (the current source), and the target diff may legitimately be large — do not penalize its size. Evaluate whether the final target matches the current source's structure and content. We need to verify:`
      : `A translation sync action detected changes in an English source document and created corresponding changes in the target document. We need to verify:`;

    const prompt = `You are an expert code reviewer specializing in translation sync workflows. Your task is to verify that translation changes are correctly positioned in the target document.

## Context
${contextNote}

1. **Scope**: Only the correct files were modified
2. **Position**: Changes appear in the same relative positions
3. **Structure**: Document structure is preserved
4. **Translation metadata**: The translation metadata in frontmatter is correctly updated

## IMPORTANT: About the Translation Metadata System

The \`translation\` section in the frontmatter is a CRITICAL feature of this translation system, NOT a bug. Here's how it works:

- English headings generate IDs from English text: \`## Introduction\` → ID: \`introduction\`
- Translated headings generate IDs from translated text: \`## 介绍\` → ID: \`介绍\`
- The translation headings bridge this gap by mapping English IDs to translated headings

Example:
\`\`\`yaml
translation:
  title: "介绍"
  headings:
    introduction: "介绍"
    supply-and-demand: "供需分析"
\`\`\`

**Note on double-colon notation**: The headings may use \`section::subsection\` notation to represent hierarchical headings. This is intentional and valid YAML.

## Source Document (English)
### Before:
\`\`\`markdown
${sourceBefore}
\`\`\`

### After:
\`\`\`markdown
${sourceAfter}
\`\`\`

## Target Document (Translation)
### Before:
\`\`\`markdown
${targetBefore}
\`\`\`

### After:
\`\`\`markdown
${targetAfter}
\`\`\`

### Files Changed:
${targetFiles.map((f) => `- ${f.filename}: ${f.status} (+${f.additions}/-${f.deletions})`).join('\n')}

## Verification Checks
Evaluate each criterion:

1. **Scope Correct**: Were only the necessary files modified? The target should change the same files as the source.
2. **Position Correct**: Do changes appear in the same sections as source? Section order should match.
3. **Structure Preserved**: Is the document structure (heading levels, nesting) maintained?
4. **Heading-map Correct**: Is the heading-map updated with new/changed headings?

## Response Format
Respond with ONLY valid JSON:
{
  "scopeCorrect": true/false,
  "positionCorrect": true/false,
  "structurePreserved": true/false,
  "headingMapCorrect": true/false,
  "issues": ["issue 1 if any"],
  "summary": "One sentence overall summary",
  "scopeDetails": "Brief explanation of scope check",
  "positionDetails": "Brief explanation of position check",
  "structureDetails": "Brief explanation of structure check"
}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await this.callWithRetry(prompt, MAX_TOKENS.review, 'evaluateDiff');
    // Strict identity: these come straight off model JSON, and a quoted
    // "false" is truthy. Anything that is not literally `true` is a failed
    // check — including a missing key.
    const isTrue = (v: unknown): boolean => v === true;
    const scopeCorrect = isTrue(result.scopeCorrect);
    const positionCorrect = isTrue(result.positionCorrect);
    const structurePreserved = isTrue(result.structurePreserved);
    const headingMapCorrect = isTrue(result.headingMapCorrect);

    const checks = [scopeCorrect, positionCorrect, structurePreserved, headingMapCorrect];
    const passedChecks = checks.filter(Boolean).length;
    const score = (passedChecks / checks.length) * 10;

    return {
      score: Math.round(score * 10) / 10,
      scopeCorrect,
      positionCorrect,
      structurePreserved,
      headingMapCorrect,
      issues: Array.isArray(result.issues) ? result.issues.map((i: unknown) => String(i)) : [],
      summary: result.summary || '',
      scopeDetails: result.scopeDetails || '',
      positionDetails: result.positionDetails || '',
      structureDetails: result.structureDetails || '',
    };
  }

  /**
   * Format changed sections for the prompt
   */
  private formatChangedSections(changedSections: ChangedSection[]): string {
    if (changedSections.length === 0) {
      return '';
    }

    const sectionsList = changedSections
      .map((s) => {
        if (s.changeType === 'deleted') {
          return `- **DELETED**: ${s.heading}`;
        }
        return `- **${s.changeType.toUpperCase()}**: ${s.heading}`;
      })
      .join('\n');

    return `\n## IMPORTANT: Changed Sections in This PR

The following sections were actually modified in this PR. **Your suggestions MUST focus ONLY on these changed sections**. Do NOT suggest improvements for unchanged parts of the document.

${sectionsList}

**Rule**: Any suggestions you make must be about the translation quality of the changed sections listed above. Ignore any issues in other parts of the document - those can be addressed in a separate comprehensive review.
`;
  }

  /**
   * Generate review comment
   */
  private generateReviewComment(
    translationResult: TranslationQualityResult,
    diffResult: DiffQualityResult,
    verdict: 'PASS' | 'WARN' | 'FAIL',
    routing?: {
      recommendation: 'auto-merge' | 'editor';
      reasons: string[];
      wouldAutoMerge?: boolean;
    }
  ): string {
    const emoji = verdict === 'PASS' ? '✅' : verdict === 'WARN' ? '⚠️' : '❌';

    // Routing line (verdict v2): the categorical recommendation, with its
    // reasons when the route is `editor`, plus the shadow-gate note when the
    // gate ran in shadow mode.
    let routingLines = '';
    if (routing) {
      routingLines = `\n**Routing**: \`${routing.recommendation}\`${
        routing.reasons.length > 0
          ? ` — ${routing.reasons.join('; ')}`
          : ' — no gating findings; floors met'
      }`;
      if (routing.wouldAutoMerge !== undefined) {
        routingLines += `\n**Shadow gate**: would ${routing.wouldAutoMerge ? '' : 'NOT '}auto-merge (recorded only; no action taken)`;
      }
    }

    let comment = `## ${emoji} Translation Quality Review

**Verdict**: ${verdict} | **Model**: ${this.model} | **Date**: ${new Date().toISOString().split('T')[0]}${routingLines}

---

### 📝 Translation Quality

| Criterion | Score |
|-----------|-------|
| Accuracy | ${translationResult.accuracy}/10 |
| Fluency | ${translationResult.fluency}/10 |
| Terminology | ${translationResult.terminology}/10 |
| Formatting | ${translationResult.formatting}/10 |
| **Overall** | **${translationResult.score}/10** |

**Summary**: ${sanitizeCommentText(translationResult.summary)}`;

    if (translationResult.strengths.length > 0) {
      comment += ` ${sanitizeCommentText(translationResult.strengths.join(' '))}`;
    }

    if (translationResult.syntaxErrors && translationResult.syntaxErrors.length > 0) {
      comment += `

### ⚠️ Markdown Syntax Errors (CRITICAL)
${translationResult.syntaxErrors.map((e) => `- 🔴 ${sanitizeCommentText(String(e))}`).join('\n')}`;
    }

    if (translationResult.issues.length > 0) {
      comment += `

**Suggestions**:
${translationResult.issues.map((i) => `- ${sanitizeCommentText(i)}`).join('\n')}`;
    }

    comment += `

---

### 🔍 Diff Quality

| Check | Status |
|-------|--------|
| Scope Correct | ${diffResult.scopeCorrect ? '✅' : '❌'} |
| Position Correct | ${diffResult.positionCorrect ? '✅' : '❌'} |
| Structure Preserved | ${diffResult.structurePreserved ? '✅' : '❌'} |
| Heading-map Correct | ${diffResult.headingMapCorrect ? '✅' : '❌'} |
| **Overall** | **${diffResult.score}/10** |

**Summary**: ${sanitizeCommentText(diffResult.summary)}`;

    if (diffResult.issues.length > 0) {
      comment += `

**Issues**:
${diffResult.issues.map((i) => `- ${sanitizeCommentText(String(i))}`).join('\n')}`;
    }

    comment += `

---
*This review was generated automatically by [action-translation](https://github.com/quantecon/action-translation) review mode.*`;

    return comment;
  }

  /**
   * Our review comments on the PR, oldest first.
   *
   * Paginated: beyond 30 comments the existing one is missed and duplicates accumulate.
   */
  private async listOwnReviewComments(
    prNumber: number,
    owner: string,
    repo: string
  ): Promise<Array<{ id: number }>> {
    const comments: Array<{ id: number; body?: string | null }> = await this.octokit.paginate(
      this.octokit.rest.issues.listComments,
      {
        owner,
        repo,
        issue_number: prNumber,
        per_page: 100,
      }
    );

    return comments
      .filter((c: { id: number; body?: string | null }) => isActionReviewComment(c.body))
      .sort((a: { id: number }, b: { id: number }) => a.id - b.id);
  }

  /**
   * Delete our review comments older than `keepId` — duplicates left by concurrent runs.
   *
   * Best effort: a duplicate comment is not worth failing a review that posted successfully.
   */
  private async deleteOlderReviewComments(
    prNumber: number,
    owner: string,
    repo: string,
    keepId: number
  ): Promise<void> {
    let duplicates: Array<{ id: number }>;
    try {
      duplicates = (await this.listOwnReviewComments(prNumber, owner, repo)).filter(
        (c) => c.id < keepId
      );
    } catch (error) {
      core.warning(`Could not check PR #${prNumber} for duplicate review comments: ${error}`);
      return;
    }

    for (const duplicate of duplicates) {
      try {
        await this.octokit.rest.issues.deleteComment({ owner, repo, comment_id: duplicate.id });
        core.info(`Removed duplicate review comment ${duplicate.id} on PR #${prNumber}`);
      } catch (error) {
        if (isNotFoundError(error)) continue; // Another run deleted it: same end state.
        core.warning(
          `Could not remove duplicate review comment ${duplicate.id} on PR #${prNumber}: ${error}`
        );
      }
    }
  }

  /**
   * Post the review, leaving exactly one review comment on the PR.
   *
   * Concurrent review runs are routine — one sync fires `opened` plus a `labeled` event per
   * label — and list-then-create is a check-then-act race: every run sees "no comment yet"
   * and creates one (issue #96). Issue comments have no conditional-write primitive, so each
   * run instead reconciles after writing, deleting every *older* review comment of ours.
   * Ids increase with creation time and each run lists after it writes, so the run holding the
   * highest id necessarily sees the others and removes them: one comment survives any
   * interleaving. (Deleting *newer* ids instead would not converge — a run that lists before
   * a slower run creates would leave both.)
   */
  private async postReviewComment(
    prNumber: number,
    owner: string,
    repo: string,
    comment: string
  ): Promise<void> {
    const body = `${REVIEW_COMMENT_MARKER}\n${comment}`;

    try {
      for (let attempt = 1; attempt <= REVIEW_COMMENT_UPSERT_ATTEMPTS; attempt++) {
        const existing = await this.listOwnReviewComments(prNumber, owner, repo);

        if (existing.length === 0) {
          const { data: created } = await this.octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: prNumber,
            body,
          });
          core.info(`Posted review comment on PR #${prNumber}`);
          await this.deleteOlderReviewComments(prNumber, owner, repo, created.id);
          return;
        }

        // Newest wins — anything older is a duplicate, including pre-marker comments.
        const target = existing[existing.length - 1];
        try {
          await this.octokit.rest.issues.updateComment({
            owner,
            repo,
            comment_id: target.id,
            body,
          });
        } catch (error) {
          // A concurrent run pruned it between our list and our update: re-read and retry.
          // Logged at info — these races are diagnosed from run logs, and `core.debug` output
          // only appears when the repo has ACTIONS_STEP_DEBUG set.
          if (isNotFoundError(error) && attempt < REVIEW_COMMENT_UPSERT_ATTEMPTS) {
            core.info(
              `Review comment ${target.id} was removed by a concurrent run, retrying (${attempt})`
            );
            continue;
          }
          throw error;
        }
        core.info(`Updated existing review comment on PR #${prNumber}`);
        await this.deleteOlderReviewComments(prNumber, owner, repo, target.id);
        return;
      }
    } catch (error) {
      core.error(`Failed to post review comment: ${error}`);
      throw error;
    }
  }
}

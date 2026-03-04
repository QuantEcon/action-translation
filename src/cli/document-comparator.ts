/**
 * Document Comparator — Stage 1 Triage
 * 
 * Performs whole-document comparison with a single LLM call per file.
 * Determines whether a translated document contains substantive changes
 * beyond normal translation work that might be worth backporting to SOURCE.
 * 
 * Design: Recall-biased — false positives (flagging a clean file) are cheap
 * (~$0.10 for unnecessary Stage 2), but false negatives (missing a real
 * backport) mean lost improvements. When in doubt, flag it.
 */

import Anthropic from '@anthropic-ai/sdk';
import { 
  APIError, 
  AuthenticationError, 
  RateLimitError, 
  APIConnectionError,
  BadRequestError 
} from '@anthropic-ai/sdk';
import { TriageResult, TriageVerdict, FileGitMetadata, FileTimeline } from './types';
import { formatDate, daysBetween, formatTimelineForPrompt } from './git-metadata';
import { RETRY_CONFIG } from '../translator';

/**
 * Maximum combined token estimate for Stage 1 triage.
 * Documents larger than this skip Stage 1 and go directly to Stage 2.
 * ~100K tokens covers most lecture files (typically 5-15K tokens each side).
 */
const MAX_TRIAGE_TOKENS = 100_000;

/**
 * Rough token estimate: ~4 characters per token
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Build the Stage 1 triage prompt
 * 
 * Exported for snapshot testing.
 */
export function buildTriagePrompt(
  sourceContent: string,
  targetContent: string,
  sourceLanguage: string,
  targetLanguage: string,
  sourceMetadata: FileGitMetadata | null,
  targetMetadata: FileGitMetadata | null,
  timeline: FileTimeline | null,
): string {
  let timelineContext = '';
  if (sourceMetadata && targetMetadata) {
    const days = daysBetween(sourceMetadata.lastModified, targetMetadata.lastModified);
    const direction = days >= 0 ? 'newer' : 'older';
    timelineContext = `
## Timeline
- SOURCE last modified: ${formatDate(sourceMetadata.lastModified)} by ${sourceMetadata.lastAuthor}
- TARGET last modified: ${formatDate(targetMetadata.lastModified)} by ${targetMetadata.lastAuthor}
- TARGET is ${Math.abs(days)} days ${direction} than SOURCE`;
  }

  if (timeline) {
    timelineContext += `

## Commit History
${formatTimelineForPrompt(timeline)}

**Key**: If SOURCE has commits AFTER the estimated sync point, those represent
updates the TARGET translation has NOT received. Differences from these newer
SOURCE commits should NOT be flagged as TARGET improvements — they are expected
divergences because the translation predates those SOURCE changes.`;
  }

  return `You are comparing an English source document with its ${targetLanguage} translation to determine if the translation contains substantive changes beyond normal translation work.

## Context
- Source language: ${sourceLanguage}
- Target language: ${targetLanguage}
${timelineContext}

## Source Content (${sourceLanguage})
\`\`\`
${sourceContent}
\`\`\`

## Target Content (${targetLanguage})
\`\`\`
${targetContent}
\`\`\`

## Task
Determine if the TARGET translation contains **substantive changes** that go beyond normal translation work. We are looking for:

1. **Bug fixes**: Errors corrected in the translation (wrong formulas, incorrect code, factual errors)
2. **Clarifications**: Explanations made clearer or more precise
3. **Additional content**: New examples, explanations, or code added
4. **Code improvements**: Non-cosmetic code changes (beyond i18n adjustments like fonts/locale)

**Ignore** (these are normal translation work, NOT backport candidates):
- Language-specific formatting (punctuation, writing style)
- i18n code changes (figure sizes, fonts, locale settings)
- Translation style variations that don't change meaning
- Restructured sentences for better flow in the target language

## Response Format
Respond with a JSON object:
\`\`\`json
{
  "verdict": "CHANGES_DETECTED" or "IN_SYNC",
  "notes": "Brief description of what substantive changes were found, or empty string if in sync"
}
\`\`\`

**Important**: When in doubt, use "CHANGES_DETECTED". It is much better to flag a file for closer inspection than to miss a genuine improvement. Only use "IN_SYNC" when you are confident the translation is faithful with no substantive additions or corrections.`;
}

/**
 * Parse the LLM response for Stage 1 triage
 * Robust: handles cases where Claude doesn't return clean JSON
 */
export function parseTriageResponse(responseText: string): { verdict: TriageVerdict; notes: string } {
  // Strategy 1: Extract JSON from a code fence (most reliable)
  const fenceMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1]);
      const verdict = parsed.verdict === 'IN_SYNC' ? 'IN_SYNC' : 'CHANGES_DETECTED';
      const notes = typeof parsed.notes === 'string' ? parsed.notes : '';
      return { verdict: verdict as TriageVerdict, notes };
    } catch {
      // JSON parse failed, fall through
    }
  }

  // Strategy 2: Greedy match for the outermost {...} block
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const verdict = parsed.verdict === 'IN_SYNC' ? 'IN_SYNC' : 'CHANGES_DETECTED';
      const notes = typeof parsed.notes === 'string' ? parsed.notes : '';
      return { verdict: verdict as TriageVerdict, notes };
    } catch {
      // JSON parse failed, fall through
    }
  }

  // Strategy 3: Look for keywords in the response
  const lower = responseText.toLowerCase();
  if (lower.includes('in_sync') || lower.includes('in sync') || lower.includes('no substantive')) {
    return { verdict: 'IN_SYNC', notes: '' };
  }

  // Default to CHANGES_DETECTED (recall-biased: when in doubt, flag it)
  return { 
    verdict: 'CHANGES_DETECTED', 
    notes: `Unable to parse LLM response cleanly; flagging for detailed review. Raw: ${responseText.slice(0, 200)}` 
  };
}

/**
 * Mock triage response for --test mode
 */
function mockTriageResponse(file: string): { verdict: TriageVerdict; notes: string } {
  // In test mode, return a deterministic response based on filename
  if (file.includes('aligned') || file.includes('intro')) {
    return { verdict: 'IN_SYNC', notes: '' };
  }
  return { 
    verdict: 'CHANGES_DETECTED', 
    notes: 'Test mode: flagged for detailed review.' 
  };
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Perform Stage 1 document-level triage
 * 
 * @param file - Filename for reporting
 * @param sourceContent - Full SOURCE document content
 * @param targetContent - Full TARGET document content
 * @param sourceMetadata - Git metadata for SOURCE file
 * @param targetMetadata - Git metadata for TARGET file
 * @param options - Configuration options
 * @returns TriageResult with verdict and notes
 */
export async function triageDocument(
  file: string,
  sourceContent: string,
  targetContent: string,
  sourceMetadata: FileGitMetadata | null,
  targetMetadata: FileGitMetadata | null,
  timeline: FileTimeline | null,
  options: {
    apiKey: string;
    model: string;
    sourceLanguage: string;
    targetLanguage: string;
    testMode: boolean;
  },
): Promise<TriageResult> {
  // Test mode: return deterministic response
  if (options.testMode) {
    const mock = mockTriageResponse(file);
    return {
      file,
      verdict: mock.verdict,
      notes: mock.notes,
    };
  }

  // Pre-flight size check
  const estimatedTokens = estimateTokens(sourceContent) + estimateTokens(targetContent);
  if (estimatedTokens > MAX_TRIAGE_TOKENS) {
    return {
      file,
      verdict: 'SKIPPED_TOO_LARGE',
      notes: `Document too large for single-call triage (~${estimatedTokens} tokens). Will proceed directly to section-level analysis.`,
      tokenCount: estimatedTokens,
    };
  }

  const prompt = buildTriagePrompt(
    sourceContent,
    targetContent,
    options.sourceLanguage,
    options.targetLanguage,
    sourceMetadata,
    targetMetadata,
    timeline,
  );

  const client = new Anthropic({ apiKey: options.apiKey });
  const { maxRetries, baseDelayMs } = RETRY_CONFIG;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.messages.create({
        model: options.model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const responseText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('');

      const { verdict, notes } = parseTriageResponse(responseText);

      return {
        file,
        verdict,
        notes,
        tokenCount: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
      };
    } catch (error) {
      // Don't retry on non-transient errors
      if (error instanceof AuthenticationError || error instanceof BadRequestError) {
        throw error;
      }

      const isRetryable =
        error instanceof RateLimitError ||
        error instanceof APIConnectionError ||
        (error instanceof APIError && error.status !== undefined && error.status >= 500);

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }

  throw new Error('Unexpected: retry loop completed without result');
}

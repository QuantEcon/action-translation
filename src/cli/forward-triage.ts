/**
 * Forward Triage — Content vs i18n Filter
 *
 * LLM-based filter that classifies whether differences between SOURCE and
 * TARGET are substantive content changes (proceed to RESYNC) or only
 * internationalisation differences (skip).
 *
 * Runs on every file before RESYNC to avoid noise from files that differ
 * only in punctuation, terminology style, or locale-specific formatting.
 *
 * Cost: ~$0.01 per file (single LLM call with both documents).
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  APIError,
  AuthenticationError,
  RateLimitError,
  APIConnectionError,
  BadRequestError,
} from '@anthropic-ai/sdk';
import { ForwardTriageResult, ForwardTriageVerdict } from './types.js';
import { RETRY_CONFIG } from '../translator.js';

// ============================================================================
// PROMPT
// ============================================================================

/**
 * Build the forward triage prompt.
 *
 * Exported for snapshot testing.
 */
export function buildForwardTriagePrompt(
  sourceContent: string,
  targetContent: string,
  sourceLanguage: string,
  targetLanguage: string,
): string {
  return `You are comparing an ${sourceLanguage} source document with its ${targetLanguage} translation to determine if there are substantive content differences that require re-translation.

## Source Content (${sourceLanguage})
\`\`\`
${sourceContent}
\`\`\`

## Target Content (${targetLanguage})
\`\`\`
${targetContent}
\`\`\`

## Task
Classify the differences between SOURCE and TARGET into one of three categories:

1. **CONTENT_CHANGES**: Differences that affect meaning or completeness. Examples:
   - Missing or added sections, paragraphs, or sentences
   - Missing or added figures, images, or diagrams
   - Different file paths for images, figures, or includes (e.g. \`/_static/img.png\` vs \`images/img.png\`)
   - Changed formulas, updated code logic, modified examples
   - New explanations or removed explanations
   - Different URL targets (not just formatting of the same URL)
   These require re-translation.

2. **I18N_ONLY**: Differences that are purely stylistic or locale-specific. Examples:
   - Punctuation style (full-width vs half-width characters)
   - Terminology/word choices that convey the same meaning
   - Whitespace, indentation, or line-wrapping differences
   - Equivalent markup for the same content (e.g. \`{figure}\` directive vs \`![alt]()\` syntax showing the same image)
   - Locale-specific number or date formatting
   These do NOT require re-translation.

3. **IDENTICAL**: The documents are equivalent in content (translation is faithful and complete).

**Rules:**
- Focus on content, not style. A different word for "function" that means the same thing is I18N_ONLY. A missing paragraph or changed formula is CONTENT_CHANGES.
- If text present in SOURCE is absent from TARGET (even a single sentence), that is CONTENT_CHANGES, not a "formatting convention."
- When in doubt, choose CONTENT_CHANGES. It is safer to re-translate than to miss a real change.

## Response Format
Respond with a JSON object:
\`\`\`json
{
  "verdict": "CONTENT_CHANGES" or "I18N_ONLY" or "IDENTICAL",
  "reason": "Brief description of the key differences (or 'no differences' if IDENTICAL)"
}
\`\`\``;
}

// ============================================================================
// RESPONSE PARSING
// ============================================================================

/**
 * Parse the LLM response for forward triage.
 * Robust: handles cases where Claude doesn't return clean JSON.
 *
 * Exported for unit testing.
 */
export function parseForwardTriageResponse(responseText: string): {
  verdict: ForwardTriageVerdict;
  reason: string;
} {
  // Strategy 1: Extract JSON from a code fence
  const fenceMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1]);
      return normalizeVerdict(parsed);
    } catch {
      // Fall through
    }
  }

  // Strategy 2: Greedy match for the outermost {...} block
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return normalizeVerdict(parsed);
    } catch {
      // Fall through
    }
  }

  // Strategy 3: Keyword detection
  const lower = responseText.toLowerCase();
  if (lower.includes('identical')) {
    return { verdict: 'IDENTICAL', reason: '' };
  }
  if (lower.includes('i18n_only') || lower.includes('i18n only')) {
    return { verdict: 'I18N_ONLY', reason: 'Detected via keyword in response' };
  }

  // Default to CONTENT_CHANGES (safe: will proceed to RESYNC)
  return {
    verdict: 'CONTENT_CHANGES',
    reason: `Unable to parse LLM response cleanly; proceeding with RESYNC. Raw: ${responseText.slice(0, 200)}`,
  };
}

function normalizeVerdict(parsed: any): { verdict: ForwardTriageVerdict; reason: string } {
  const raw = String(parsed.verdict ?? '').toUpperCase();
  let verdict: ForwardTriageVerdict;

  if (raw === 'IDENTICAL') {
    verdict = 'IDENTICAL';
  } else if (raw === 'I18N_ONLY') {
    verdict = 'I18N_ONLY';
  } else {
    verdict = 'CONTENT_CHANGES';
  }

  const reason = typeof parsed.reason === 'string' ? parsed.reason : '';
  return { verdict, reason };
}

// ============================================================================
// MOCK (--test mode)
// ============================================================================

function mockForwardTriage(file: string): { verdict: ForwardTriageVerdict; reason: string } {
  if (file.includes('identical') || file.includes('aligned')) {
    return { verdict: 'IDENTICAL', reason: 'Test mode: files are identical' };
  }
  if (file.includes('i18n') || file.includes('style')) {
    return { verdict: 'I18N_ONLY', reason: 'Test mode: i18n-only differences' };
  }
  return { verdict: 'CONTENT_CHANGES', reason: 'Test mode: content changes detected' };
}

// ============================================================================
// MAIN TRIAGE FUNCTION
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Triage a single file: content changes or i18n only?
 *
 * @param file          Filename for reporting
 * @param sourceContent Full SOURCE document content
 * @param targetContent Full TARGET document content
 * @param options       Configuration
 * @returns ForwardTriageResult
 */
export async function triageForward(
  file: string,
  sourceContent: string,
  targetContent: string,
  options: {
    apiKey: string;
    model: string;
    sourceLanguage: string;
    targetLanguage: string;
    testMode: boolean;
  },
): Promise<ForwardTriageResult> {
  // Quick check: if content is byte-identical, skip everything
  if (sourceContent === targetContent) {
    return { file, verdict: 'IDENTICAL', reason: 'Files are byte-identical' };
  }

  // Test mode: deterministic response
  if (options.testMode) {
    const mock = mockForwardTriage(file);
    return { file, verdict: mock.verdict, reason: mock.reason };
  }

  const prompt = buildForwardTriagePrompt(
    sourceContent,
    targetContent,
    options.sourceLanguage,
    options.targetLanguage,
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

      const { verdict, reason } = parseForwardTriageResponse(responseText);

      return {
        file,
        verdict,
        reason,
        tokenCount: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
      };
    } catch (error) {
      // Non-transient errors: don't retry
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

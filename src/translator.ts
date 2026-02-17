/**
 * Section-Based Translation Service
 * 
 * Uses Claude Sonnet 4.5 to translate sections of MyST Markdown documents.
 * 
 * Two modes:
 * 1. UPDATE: Claude sees old English, new English, current translation → produces updated translation
 * 2. NEW: Claude sees new English → produces new translation
 * 
 * For full documents (new files), translates the entire content in one pass.
 */

import Anthropic from '@anthropic-ai/sdk';
import { 
  APIError, 
  AuthenticationError, 
  RateLimitError, 
  APIConnectionError,
  BadRequestError 
} from '@anthropic-ai/sdk';
import { Glossary, SectionTranslationRequest, SectionTranslationResult, FullDocumentTranslationRequest } from './types';
import * as core from '@actions/core';
import { getLanguageConfig } from './language-config';

/**
 * Constants
 */
const INCOMPLETE_DOCUMENT_MARKER = '-----> INCOMPLETE DOCUMENT <------';

/** Retry configuration for API calls */
export const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,  // 1s, 2s, 4s with exponential backoff
};

/**
 * Estimate output tokens needed for translation
 * Returns a conservative estimate based on source content length
 */
function estimateOutputTokens(sourceLength: number, targetLanguage: string): number {
  // Base estimation: ~4 chars per token for most languages
  const baseTokens = Math.ceil(sourceLength / 4);
  
  // Language-specific expansion factors
  // Translation typically expands text, plus we preserve English code/math
  let expansionFactor = 1.5; // Default: 50% expansion
  
  // RTL languages (Arabic, Persian, Hebrew) need more margin due to verbose translations
  if (['ar', 'fa', 'he'].includes(targetLanguage)) {
    expansionFactor = 1.8;
  }
  
  // CJK languages (Chinese, Japanese, Korean) are more compact
  if (['zh', 'zh-cn', 'zh-tw', 'ja', 'ko'].includes(targetLanguage)) {
    expansionFactor = 1.3;
  }
  
  const estimatedTokens = Math.ceil(baseTokens * expansionFactor);
  
  // Add buffer for prompts, formatting, etc.
  const buffer = 2000;
  
  return estimatedTokens + buffer;
}

/**
 * Check if a document is likely to exceed API token limits.
 * Returns null if document is translatable, otherwise returns an error message.
 */
function checkDocumentSize(sourceLength: number, targetLanguage: string): string | null {
  const estimated = estimateOutputTokens(sourceLength, targetLanguage);
  const API_MAX_TOKENS = 32768;
  
  if (estimated > API_MAX_TOKENS) {
    return `Document too large: estimated ${estimated} tokens exceeds API maximum of ${API_MAX_TOKENS} tokens. ` +
           `This document needs section-by-section translation rather than bulk translation.`;
  }
  
  // Log estimation for monitoring
  console.log(`Pre-flight check: source=${sourceLength} chars, estimated output=${estimated} tokens, using max_tokens=${API_MAX_TOKENS}`);
  
  return null;
}

/**
 * Format API error for user-friendly output
 */
function formatApiError(error: unknown): string {
  if (error instanceof AuthenticationError) {
    return 'Authentication failed: Invalid or expired API key. Check your anthropic-api-key secret.';
  }
  if (error instanceof RateLimitError) {
    return 'Rate limit exceeded: Too many requests. The action will retry automatically, or try again later.';
  }
  if (error instanceof APIConnectionError) {
    return 'Connection error: Unable to reach Anthropic API. Check network connectivity.';
  }
  if (error instanceof BadRequestError) {
    return `Bad request: ${error.message}. This may indicate an issue with the prompt or content.`;
  }
  if (error instanceof APIError) {
    return `API error (${error.status}): ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown translation error';
}

export class TranslationService {
  private client: Anthropic;
  private model: string;
  private debug: boolean;

  constructor(apiKey: string, model: string = 'claude-sonnet-4-5-20250929', debug: boolean = false) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.debug = debug;
  }

  private log(message: string): void {
    if (this.debug) {
      core.info(`[Translator] ${message}`);
    }
  }

  /**
   * Sleep for a given number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Call Claude API with retry logic and exponential backoff.
   *
   * Retries on transient errors:
   * - RateLimitError (429)
   * - APIConnectionError (network issues)
   * - APIError with 5xx status (server errors)
   *
   * Does NOT retry on:
   * - AuthenticationError (invalid API key)
   * - BadRequestError (prompt issues)
   * - Other non-transient errors
   */
  private async callWithRetry(
    createParams: { model: string; max_tokens: number; messages: Array<{ role: string; content: string }> },
    operationName: string,
  ): Promise<Anthropic.Message> {
    const { maxRetries, baseDelayMs } = RETRY_CONFIG;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.client.messages.create(createParams as Anthropic.MessageCreateParamsNonStreaming);
      } catch (error) {
        // Don't retry on non-transient errors
        if (error instanceof AuthenticationError || error instanceof BadRequestError) {
          throw error;
        }

        // Check for transient errors worth retrying
        const isRetryable =
          error instanceof RateLimitError ||
          error instanceof APIConnectionError ||
          (error instanceof APIError && error.status !== undefined && error.status >= 500);

        if (!isRetryable || attempt === maxRetries) {
          throw error;
        }

        const delay = baseDelayMs * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        this.log(`${operationName}: retryable error on attempt ${attempt}/${maxRetries}: ${error instanceof Error ? error.message : error}. Retrying in ${delay}ms...`);
        await this.sleep(delay);
      }
    }

    // Should never reach here
    throw new Error('Unexpected: retry loop completed without result');
  }

  /**
   * Translate a section (update or new)
   */
  async translateSection(request: SectionTranslationRequest): Promise<SectionTranslationResult> {
    try {
      if (request.mode === 'update') {
        return await this.translateSectionUpdate(request);
      } else {
        return await this.translateNewSection(request);
      }
    } catch (error) {
      return {
        success: false,
        error: formatApiError(error),
      };
    }
  }

  /**
   * Update existing section (mode='update')
   * Claude sees: old English, new English, current translation → produces updated translation
   */
  private async translateSectionUpdate(request: SectionTranslationRequest): Promise<SectionTranslationResult> {
    const { oldEnglish, newEnglish, currentTranslation, sourceLanguage, targetLanguage, glossary } = request;

    if (!oldEnglish || !newEnglish || !currentTranslation) {
      return {
        success: false,
        error: 'Update mode requires oldEnglish, newEnglish, and currentTranslation',
      };
    }

    const glossarySection = glossary ? this.formatGlossary(glossary, targetLanguage) : '';
    const languageConfig = getLanguageConfig(targetLanguage);
    const additionalRules = languageConfig.additionalRules.length > 0
      ? languageConfig.additionalRules.map((rule, i) => `${7 + i}. ${rule}`).join('\n')
      : '';

    const prompt = `You are updating a translation of a technical document section from ${sourceLanguage} to ${targetLanguage}.

TASK: The ${sourceLanguage} section has been modified. Update the existing ${targetLanguage} translation to reflect these changes.

CRITICAL RULES:
1. Compare the OLD and NEW ${sourceLanguage} versions to understand what changed
2. Update the CURRENT ${targetLanguage} translation to reflect these changes
3. Maintain consistency with the existing ${targetLanguage} style and terminology
4. Preserve all MyST Markdown formatting, code blocks, math equations, and directives
5. DO NOT translate code, math, URLs, or technical identifiers
6. Use the glossary for consistent terminology
7. MARKDOWN SYNTAX: Ensure proper markdown syntax in your output:
   - Headings MUST have a space after # (e.g., "## Title" not "##Title")
   - Code blocks must have matching \`\`\` delimiters
   - Math blocks must have matching $$ delimiters
   - CRITICAL: Do NOT mix fence markers - use $$...$$ for math OR \`\`\`{math}...\`\`\` for directive math, but NEVER $$...\`\`\` or \`\`\`...$$
${additionalRules}
${additionalRules ? '' : '8. '}Return ONLY the updated ${targetLanguage} section, no explanations

${glossarySection}

[OLD ${sourceLanguage} VERSION]
${oldEnglish}
[/OLD ${sourceLanguage} VERSION]

[NEW ${sourceLanguage} VERSION]
${newEnglish}
[/NEW ${sourceLanguage} VERSION]

[CURRENT ${targetLanguage} TRANSLATION]
${currentTranslation}
[/CURRENT ${targetLanguage} TRANSLATION]

Provide ONLY the updated ${targetLanguage} translation. Do not include any markers, explanations, or comments.`;

    this.log(`Translating section update, mode=update`);
    this.log(`Old ${sourceLanguage} length: ${oldEnglish.length}`);
    this.log(`New ${sourceLanguage} length: ${newEnglish.length}`);
    this.log(`Current ${targetLanguage} length: ${currentTranslation.length}`);

    const response = await this.callWithRetry({
      model: this.model,
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    }, 'translateSectionUpdate');

    const content = response.content[0];
    if (content.type !== 'text') {
      return {
        success: false,
        error: 'Unexpected response format from Claude',
      };
    }

    this.log(`Translated section length: ${content.text.length}`);

    return {
      success: true,
      translatedSection: content.text.trim(),
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
    };
  }

  /**
   * Translate new section (mode='new')
   * Claude sees: English section → produces translation
   */
  private async translateNewSection(request: SectionTranslationRequest): Promise<SectionTranslationResult> {
    const { englishSection, sourceLanguage, targetLanguage, glossary } = request;

    if (!englishSection) {
      return {
        success: false,
        error: 'New mode requires englishSection',
      };
    }

    const glossarySection = glossary ? this.formatGlossary(glossary, targetLanguage) : '';
    const languageConfig = getLanguageConfig(targetLanguage);
    const additionalRules = languageConfig.additionalRules.length > 0
      ? languageConfig.additionalRules.map((rule, i) => `${8 + i}. ${rule}`).join('\n')
      : '';

    const prompt = `You are translating a new section of technical documentation from ${sourceLanguage} to ${targetLanguage}.

RULES:
1. Translate all prose content accurately
2. Preserve all MyST Markdown formatting, structure, and directives
3. DO NOT translate code blocks (keep code as-is)
4. DO NOT translate mathematical equations (keep LaTeX as-is)
5. DO NOT translate URLs, file paths, or technical identifiers
6. Use the glossary for consistent terminology
7. Maintain heading structure and levels
8. MARKDOWN SYNTAX: Ensure proper markdown syntax in your output:
   - Headings MUST have a space after # (e.g., "## Title" not "##Title")
   - Code blocks must have matching \`\`\` delimiters
   - Math blocks must have matching $$ delimiters
   - CRITICAL: Do NOT mix fence markers - use $$...$$ for math OR \`\`\`{math}...\`\`\` for directive math, but NEVER $$...\`\`\` or \`\`\`...$$
${additionalRules}
${additionalRules ? '' : '9. '}Return ONLY the translated section, no explanations

${glossarySection}

[${sourceLanguage} SECTION TO TRANSLATE]
${englishSection}
[/END SECTION]

Provide ONLY the ${targetLanguage} translation. Do not include any markers, explanations, or comments.`;

    this.log(`Translating new section, mode=new`);
    this.log(`${sourceLanguage} section length: ${englishSection.length}`);

    const response = await this.callWithRetry({
      model: this.model,
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    }, 'translateNewSection');

    const content = response.content[0];
    if (content.type !== 'text') {
      return {
        success: false,
        error: 'Unexpected response format from Claude',
      };
    }

    this.log(`Translated section length: ${content.text.length}`);

    return {
      success: true,
      translatedSection: content.text.trim(),
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
    };
  }

  /**
   * Translate full document (for new files)
   */
  async translateFullDocument(request: FullDocumentTranslationRequest): Promise<SectionTranslationResult> {
    const { content, sourceLanguage, targetLanguage, glossary } = request;

    const glossarySection = glossary ? this.formatGlossary(glossary, targetLanguage) : '';
    const languageConfig = getLanguageConfig(targetLanguage);
    const additionalRules = languageConfig.additionalRules.length > 0
      ? languageConfig.additionalRules.map((rule, i) => `${8 + i}. ${rule}`).join('\n')
      : '';

    const prompt = `You are translating a complete technical lecture from ${sourceLanguage} to ${targetLanguage}.

RULES:
1. Translate all prose content
2. Preserve all MyST Markdown directives and structure exactly
3. DO NOT translate code blocks (keep code as-is)
4. DO NOT translate mathematical equations (keep LaTeX as-is)
5. DO NOT translate URLs, file paths, or technical identifiers
6. Use the provided glossary for consistent terminology
7. Maintain the exact same heading structure and anchors
8. MARKDOWN SYNTAX: Ensure proper markdown syntax in your output:
   - Headings MUST have a space after # (e.g., "## Title" not "##Title")
   - Code blocks must have matching \`\`\` delimiters  
   - Math blocks must have matching $$ delimiters
   - CRITICAL: Do NOT mix fence markers - use $$...$$ for math OR \`\`\`{math}...\`\`\` for directive math, but NEVER $$...\`\`\` or \`\`\`...$$
9. DIRECTIVE BLOCKS: MyST directive blocks MUST be balanced:
   - Every \`\`\`{exercise-start} MUST have matching \`\`\`{exercise-end}
   - Every \`\`\`{solution-start} MUST have matching \`\`\`{solution-end}
   - Every \`\`\`{code-cell} MUST have closing \`\`\`
${additionalRules}

${glossarySection}

IMPORTANT: You MUST translate the ENTIRE document. Do not stop mid-sentence or mid-code.
If you are approaching token limits and cannot complete the translation, print:
"${INCOMPLETE_DOCUMENT_MARKER}"

CONTENT:
${content}

Provide the complete translated document maintaining exact MyST structure.`;

    // Pre-flight check: verify document is within API limits
    const sizeError = checkDocumentSize(content.length, targetLanguage);
    if (sizeError) {
      throw new Error(sizeError);
    }
    
    // Use maximum tokens for all translatable documents
    const maxTokens = 32768;
    
    this.log(`Translating full document`);
    this.log(`Content length: ${content.length} chars`);

    const response = await this.callWithRetry({
      model: this.model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }, 'translateFullDocument');

    const result = response.content[0];
    if (result.type !== 'text') {
      return {
        success: false,
        error: 'Unexpected response format from Claude',
      };
    }

    const translatedText = result.text.trim();
    
    // Check for incomplete translation marker
    if (translatedText.includes(INCOMPLETE_DOCUMENT_MARKER)) {
      return {
        success: false,
        error: `Document exceeded token limits and was truncated. ` +
               `This document needs section-by-section translation rather than bulk translation.`,
      };
    }
    
    this.log(`Translation complete: ${response.usage.input_tokens} input tokens, ${response.usage.output_tokens} output tokens`);

    return {
      success: true,
      translatedSection: translatedText,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
    };
  }

  /**
   * Format glossary for inclusion in prompt
   */
  private formatGlossary(glossary: Glossary, targetLanguage: string): string {
    if (!glossary.terms || glossary.terms.length === 0) {
      return '';
    }

    const terms = glossary.terms
      .map((term) => {
        const translation = term[targetLanguage];
        const context = term.context ? ` (${term.context})` : '';
        return `  - "${term.en}" → "${translation}"${context}`;
      })
      .join('\n');

    return `GLOSSARY:
${terms}
`;
  }
}

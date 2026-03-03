"use strict";
/**
 * Backward Evaluator — Stage 2 Section-Level Analysis
 *
 * For files flagged by Stage 1, evaluates each matched section pair
 * to identify specific improvements worth backporting to SOURCE.
 *
 * The LLM reads both languages directly (no back-translation needed)
 * and produces structured suggestions with category, confidence, and reasoning.
 *
 * Tone: Respectful suggestions. SOURCE is the source of truth.
 * These are improvements "for consideration", not corrections.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildEvaluationPrompt = buildEvaluationPrompt;
exports.parseEvaluationResponse = parseEvaluationResponse;
exports.evaluateSection = evaluateSection;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const sdk_2 = require("@anthropic-ai/sdk");
const git_metadata_1 = require("./git-metadata");
const translator_1 = require("../translator");
/**
 * Build the Stage 2 section evaluation prompt
 *
 * Exported for snapshot testing.
 */
function buildEvaluationPrompt(sourceSection, targetSection, sectionHeading, sourceLanguage, targetLanguage, sourceMetadata, targetMetadata, triageNotes, timeline) {
    let timelineContext = '';
    if (sourceMetadata && targetMetadata) {
        const days = (0, git_metadata_1.daysBetween)(sourceMetadata.lastModified, targetMetadata.lastModified);
        const direction = days >= 0 ? 'newer' : 'older';
        timelineContext = `
## Timeline
- SOURCE last modified: ${(0, git_metadata_1.formatDate)(sourceMetadata.lastModified)}
- TARGET last modified: ${(0, git_metadata_1.formatDate)(targetMetadata.lastModified)}
- TARGET is ${Math.abs(days)} days ${direction} than SOURCE`;
    }
    if (timeline) {
        timelineContext += `

## Commit History
${(0, git_metadata_1.formatTimelineForPrompt)(timeline)}

**Key**: If SOURCE has commits AFTER the estimated sync point, differences from those
newer SOURCE commits are expected divergences — the TARGET simply hasn't been updated yet.
Do NOT recommend backporting content that SOURCE already has in a newer form.`;
    }
    let triageContext = '';
    if (triageNotes) {
        triageContext = `
## Stage 1 Triage Notes
The document-level triage identified these potential changes:
${triageNotes}
`;
    }
    return `You are analyzing a section from a translated document to determine if it contains improvements worth suggesting back to the English source.

## Context
- Source language: ${sourceLanguage}
- Target language: ${targetLanguage}
- Section: ${sectionHeading}
${timelineContext}
${triageContext}
## Source Section (${sourceLanguage})
\`\`\`
${sourceSection}
\`\`\`

## Target Section (${targetLanguage})
\`\`\`
${targetSection}
\`\`\`

## Task
Analyze if the TARGET section contains improvements worth **suggesting** back to the SOURCE.

Consider:
1. **Bug fixes**: Errors corrected in the translation (wrong formulas, incorrect code, factual errors)
2. **Clarifications**: Better explanations or wording that could improve the English
3. **Additional examples**: New examples or context added by the translator
4. **Code improvements**: Non-cosmetic code changes (not i18n fonts/locale adjustments)

Ignore (these are normal translation work):
- Language-specific formatting (Chinese punctuation, etc.)
- i18n code changes (fonts, figure size adjustments, locale settings)
- Translation variations that don't improve meaning
- Sentence restructuring for target language flow

## Response Format
Respond with a JSON object:
\`\`\`json
{
  "recommendation": "BACKPORT" or "NO_BACKPORT",
  "category": "BUG_FIX" | "CLARIFICATION" | "EXAMPLE" | "CODE_IMPROVEMENT" | "I18N_ONLY" | "NO_CHANGE",
  "confidence": 0.0 to 1.0,
  "summary": "Brief description of the improvement found (or why no backport needed)",
  "specific_changes": [
    {
      "type": "description of the change type",
      "original": "what was in SOURCE (English)",
      "improved": "suggested improvement for SOURCE (in English)"
    }
  ],
  "reasoning": "Why this should or shouldn't be suggested back to the source"
}
\`\`\`

**Important**: 
- These are SUGGESTIONS for the source maintainers, not corrections.
- The English source is the source of truth — frame improvements respectfully.
- For "specific_changes", translate any target-language improvements back to English.
- Only recommend BACKPORT for genuine content improvements, not translation quality.`;
}
/**
 * Parse the LLM response for Stage 2 evaluation
 * Robust: handles cases where Claude doesn't return clean JSON
 */
function parseEvaluationResponse(responseText, sectionHeading) {
    // Try to extract JSON from the response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                sectionHeading,
                recommendation: parsed.recommendation === 'BACKPORT' ? 'BACKPORT' : 'NO_BACKPORT',
                category: validateCategory(parsed.category),
                confidence: typeof parsed.confidence === 'number'
                    ? Math.max(0, Math.min(1, parsed.confidence))
                    : 0.5,
                summary: typeof parsed.summary === 'string' ? parsed.summary : '',
                specificChanges: parseSpecificChanges(parsed.specific_changes),
                reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
            };
        }
        catch {
            // JSON parse failed, fall through
        }
    }
    // Fallback: couldn't parse response
    return {
        sectionHeading,
        recommendation: 'NO_BACKPORT',
        category: 'NO_CHANGE',
        confidence: 0,
        summary: 'Unable to parse LLM evaluation response.',
        specificChanges: [],
        reasoning: 'Response parsing failed. Manual review may be needed.',
    };
}
/**
 * Validate a category string from LLM response
 */
function validateCategory(category) {
    const validCategories = [
        'BUG_FIX', 'CLARIFICATION', 'EXAMPLE', 'CODE_IMPROVEMENT', 'I18N_ONLY', 'NO_CHANGE',
    ];
    if (typeof category === 'string' && validCategories.includes(category)) {
        return category;
    }
    return 'NO_CHANGE';
}
/**
 * Parse specific_changes array from LLM response
 */
function parseSpecificChanges(changes) {
    if (!Array.isArray(changes))
        return [];
    return changes
        .filter((c) => typeof c === 'object' && c !== null)
        .map(c => ({
        type: typeof c.type === 'string' ? c.type : 'unknown',
        original: typeof c.original === 'string' ? c.original : '',
        improved: typeof c.improved === 'string' ? c.improved : '',
    }));
}
/**
 * Mock evaluation response for --test mode
 */
function mockEvaluationResponse(sectionHeading) {
    return {
        sectionHeading,
        recommendation: 'NO_BACKPORT',
        category: 'NO_CHANGE',
        confidence: 0.95,
        summary: 'Test mode: section appears to be a faithful translation.',
        specificChanges: [],
        reasoning: 'Test mode: deterministic NO_BACKPORT response.',
    };
}
/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Evaluate a single section pair for backport potential
 *
 * @param sourceSection - SOURCE section content
 * @param targetSection - TARGET section content
 * @param sectionHeading - Heading text for this section
 * @param sourceMetadata - Git metadata for SOURCE file
 * @param targetMetadata - Git metadata for TARGET file
 * @param triageNotes - Notes from Stage 1 triage (focus hints)
 * @param options - Configuration options
 * @returns BackportSuggestion with recommendation
 */
async function evaluateSection(sourceSection, targetSection, sectionHeading, sourceMetadata, targetMetadata, triageNotes, timeline, options) {
    // Test mode: return deterministic response
    if (options.testMode) {
        return mockEvaluationResponse(sectionHeading);
    }
    const prompt = buildEvaluationPrompt(sourceSection, targetSection, sectionHeading, options.sourceLanguage, options.targetLanguage, sourceMetadata, targetMetadata, triageNotes, timeline);
    const client = new sdk_1.default({ apiKey: options.apiKey });
    const { maxRetries, baseDelayMs } = translator_1.RETRY_CONFIG;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await client.messages.create({
                model: options.model,
                max_tokens: 2048,
                messages: [{ role: 'user', content: prompt }],
            });
            const responseText = response.content
                .filter((block) => block.type === 'text')
                .map(block => block.text)
                .join('');
            return parseEvaluationResponse(responseText, sectionHeading);
        }
        catch (error) {
            // Don't retry on non-transient errors
            if (error instanceof sdk_2.AuthenticationError || error instanceof sdk_2.BadRequestError) {
                throw error;
            }
            const isRetryable = error instanceof sdk_2.RateLimitError ||
                error instanceof sdk_2.APIConnectionError ||
                (error instanceof sdk_2.APIError && error.status !== undefined && error.status >= 500);
            if (!isRetryable || attempt === maxRetries) {
                throw error;
            }
            const delay = baseDelayMs * Math.pow(2, attempt - 1);
            await sleep(delay);
        }
    }
    throw new Error('Unexpected: retry loop completed without result');
}
//# sourceMappingURL=backward-evaluator.js.map
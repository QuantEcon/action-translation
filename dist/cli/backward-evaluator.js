"use strict";
/**
 * Backward Evaluator — Stage 2 Analysis
 *
 * For files flagged by Stage 1, evaluates all matched section pairs in a single
 * LLM call to identify improvements worth backporting to SOURCE.
 *
 * The LLM reads both languages directly (no back-translation needed)
 * and produces structured per-section suggestions with category, confidence, and reasoning.
 *
 * Whole-file approach: one LLM call per file (all sections at once) for better
 * cross-section context, fewer API calls, and lower latency.
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
exports.buildFileEvaluationPrompt = buildFileEvaluationPrompt;
exports.parseFileEvaluationResponse = parseFileEvaluationResponse;
exports.evaluateFile = evaluateFile;
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
    // Strategy 1: Extract JSON from a code fence (most reliable)
    const fenceMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    const jsonText = fenceMatch ? fenceMatch[1] : null;
    // Strategy 2: Greedy match for the outermost {...} block
    const fallbackMatch = responseText.match(/\{[\s\S]*\}/);
    const candidates = [jsonText, fallbackMatch?.[0]].filter(Boolean);
    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
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
            // Try next candidate
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
// ============================================================================
// WHOLE-FILE EVALUATION (preferred — one LLM call per flagged file)
// ============================================================================
/**
 * Build section pairs block for the whole-file prompt.
 * Each matched pair is numbered for the LLM to reference.
 */
function buildSectionPairsBlock(matchedPairs) {
    return matchedPairs.map((pair, i) => {
        return `### Section ${i + 1}: ${pair.heading}

**SOURCE:**
\`\`\`
${pair.source}
\`\`\`

**TARGET:**
\`\`\`
${pair.target}
\`\`\``;
    }).join('\n\n---\n\n');
}
/**
 * Build the whole-file Stage 2 evaluation prompt.
 *
 * Sends all matched section pairs in a single prompt and asks the LLM
 * to return per-section suggestions in one structured JSON response.
 *
 * Exported for snapshot testing.
 */
function buildFileEvaluationPrompt(matchedPairs, sourceLanguage, targetLanguage, sourceMetadata, targetMetadata, triageNotes, timeline) {
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
    const sectionPairsBlock = buildSectionPairsBlock(matchedPairs);
    return `You are analyzing a translated document to determine if any sections contain improvements worth suggesting back to the English source.

## Context
- Source language: ${sourceLanguage}
- Target language: ${targetLanguage}
- Number of sections: ${matchedPairs.length}
${timelineContext}
${triageContext}
## Matched Section Pairs

${sectionPairsBlock}

## Task
Analyze ALL sections above. For each section, determine if the TARGET contains improvements worth **suggesting** back to the SOURCE.

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
Respond with a JSON object containing a "sections" array. Include an entry for EVERY section, even those with no changes:
\`\`\`json
{
  "sections": [
    {
      "section_number": 1,
      "section_heading": "Section heading text",
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
  ]
}
\`\`\`

**Important**: 
- These are SUGGESTIONS for the source maintainers, not corrections.
- The English source is the source of truth — frame improvements respectfully.
- For "specific_changes", translate any target-language improvements back to English.
- Only recommend BACKPORT for genuine content improvements, not translation quality.
- Include ALL ${matchedPairs.length} sections in your response, in order.`;
}
/**
 * Parse the whole-file LLM response into per-section suggestions.
 *
 * The response should contain a "sections" array with one entry per section.
 * Falls back gracefully if parsing fails.
 */
function parseFileEvaluationResponse(responseText, matchedPairs) {
    // Strategy 1: Extract JSON from a code fence
    const fenceMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    const jsonText = fenceMatch ? fenceMatch[1] : null;
    // Strategy 2: Greedy match for the outermost {...} block
    const fallbackMatch = responseText.match(/\{[\s\S]*\}/);
    const candidates = [jsonText, fallbackMatch?.[0]].filter(Boolean);
    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            const sections = Array.isArray(parsed.sections) ? parsed.sections : [];
            // Map parsed sections back to headings
            return matchedPairs.map((pair, i) => {
                const section = sections[i] || {};
                return {
                    sectionHeading: pair.heading,
                    recommendation: section.recommendation === 'BACKPORT' ? 'BACKPORT' : 'NO_BACKPORT',
                    category: validateCategory(section.category),
                    confidence: typeof section.confidence === 'number'
                        ? Math.max(0, Math.min(1, section.confidence))
                        : 0.5,
                    summary: typeof section.summary === 'string' ? section.summary : '',
                    specificChanges: parseSpecificChanges(section.specific_changes),
                    reasoning: typeof section.reasoning === 'string' ? section.reasoning : '',
                };
            });
        }
        catch {
            // Try next candidate
        }
    }
    // Fallback: return NO_BACKPORT for all sections
    return matchedPairs.map(pair => ({
        sectionHeading: pair.heading,
        recommendation: 'NO_BACKPORT',
        category: 'NO_CHANGE',
        confidence: 0,
        summary: 'Unable to parse LLM evaluation response.',
        specificChanges: [],
        reasoning: 'Response parsing failed. Manual review may be needed.',
    }));
}
/**
 * Mock whole-file evaluation response for --test mode
 */
function mockFileEvaluationResponse(matchedPairs) {
    return matchedPairs.map(pair => ({
        sectionHeading: pair.heading,
        recommendation: 'NO_BACKPORT',
        category: 'NO_CHANGE',
        confidence: 0.95,
        summary: 'Test mode: section appears to be a faithful translation.',
        specificChanges: [],
        reasoning: 'Test mode: deterministic NO_BACKPORT response.',
    }));
}
/**
 * Evaluate all matched section pairs in a file with a single LLM call.
 *
 * This is the preferred Stage 2 approach — one call per flagged file
 * rather than one call per section. Benefits:
 * - Fewer API calls (1 vs N)
 * - Lower latency (1 round-trip vs N)
 * - Cross-section context (LLM sees full picture)
 *
 * @param sectionPairs - Matched section pairs from section-matcher
 * @param sourceMetadata - Git metadata for SOURCE file
 * @param targetMetadata - Git metadata for TARGET file
 * @param triageNotes - Notes from Stage 1 triage
 * @param timeline - Interleaved commit history
 * @param options - Configuration options
 * @returns Array of BackportSuggestion, one per matched section
 */
async function evaluateFile(sectionPairs, sourceMetadata, targetMetadata, triageNotes, timeline, options) {
    // Filter to matched pairs only
    const matchedPairs = sectionPairs
        .filter(p => p.status === 'MATCHED' && p.sourceSection && p.targetSection)
        .map(p => ({
        heading: p.sourceHeading || 'Unknown Section',
        source: p.sourceSection.content,
        target: p.targetSection.content,
    }));
    if (matchedPairs.length === 0) {
        return [];
    }
    // Test mode: return deterministic responses
    if (options.testMode) {
        return mockFileEvaluationResponse(matchedPairs);
    }
    const prompt = buildFileEvaluationPrompt(matchedPairs, options.sourceLanguage, options.targetLanguage, sourceMetadata, targetMetadata, triageNotes, timeline);
    const client = new sdk_1.default({ apiKey: options.apiKey });
    const { maxRetries, baseDelayMs } = translator_1.RETRY_CONFIG;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await client.messages.create({
                model: options.model,
                max_tokens: 4096,
                messages: [{ role: 'user', content: prompt }],
            });
            const responseText = response.content
                .filter((block) => block.type === 'text')
                .map(block => block.text)
                .join('');
            return parseFileEvaluationResponse(responseText, matchedPairs);
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
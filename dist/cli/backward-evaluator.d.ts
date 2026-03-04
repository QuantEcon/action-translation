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
import { BackportSuggestion, FileGitMetadata, FileTimeline, SectionPair } from './types';
/**
 * Build the Stage 2 section evaluation prompt
 *
 * Exported for snapshot testing.
 */
export declare function buildEvaluationPrompt(sourceSection: string, targetSection: string, sectionHeading: string, sourceLanguage: string, targetLanguage: string, sourceMetadata: FileGitMetadata | null, targetMetadata: FileGitMetadata | null, triageNotes: string, timeline: FileTimeline | null): string;
/**
 * Parse the LLM response for Stage 2 evaluation
 * Robust: handles cases where Claude doesn't return clean JSON
 */
export declare function parseEvaluationResponse(responseText: string, sectionHeading: string): BackportSuggestion;
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
export declare function evaluateSection(sourceSection: string, targetSection: string, sectionHeading: string, sourceMetadata: FileGitMetadata | null, targetMetadata: FileGitMetadata | null, triageNotes: string, timeline: FileTimeline | null, options: {
    apiKey: string;
    model: string;
    sourceLanguage: string;
    targetLanguage: string;
    testMode: boolean;
}): Promise<BackportSuggestion>;
/**
 * Build the whole-file Stage 2 evaluation prompt.
 *
 * Sends all matched section pairs in a single prompt and asks the LLM
 * to return per-section suggestions in one structured JSON response.
 *
 * Exported for snapshot testing.
 */
export declare function buildFileEvaluationPrompt(matchedPairs: Array<{
    heading: string;
    source: string;
    target: string;
}>, sourceLanguage: string, targetLanguage: string, sourceMetadata: FileGitMetadata | null, targetMetadata: FileGitMetadata | null, triageNotes: string, timeline: FileTimeline | null): string;
/**
 * Parse the whole-file LLM response into per-section suggestions.
 *
 * The response should contain a "sections" array with one entry per section.
 * Falls back gracefully if parsing fails.
 */
export declare function parseFileEvaluationResponse(responseText: string, matchedPairs: Array<{
    heading: string;
}>): BackportSuggestion[];
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
export declare function evaluateFile(sectionPairs: SectionPair[], sourceMetadata: FileGitMetadata | null, targetMetadata: FileGitMetadata | null, triageNotes: string, timeline: FileTimeline | null, options: {
    apiKey: string;
    model: string;
    sourceLanguage: string;
    targetLanguage: string;
    testMode: boolean;
}): Promise<BackportSuggestion[]>;
//# sourceMappingURL=backward-evaluator.d.ts.map
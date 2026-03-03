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
import { BackportSuggestion, FileGitMetadata } from './types';
/**
 * Build the Stage 2 section evaluation prompt
 *
 * Exported for snapshot testing.
 */
export declare function buildEvaluationPrompt(sourceSection: string, targetSection: string, sectionHeading: string, sourceLanguage: string, targetLanguage: string, sourceMetadata: FileGitMetadata | null, targetMetadata: FileGitMetadata | null, triageNotes: string): string;
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
export declare function evaluateSection(sourceSection: string, targetSection: string, sectionHeading: string, sourceMetadata: FileGitMetadata | null, targetMetadata: FileGitMetadata | null, triageNotes: string, options: {
    apiKey: string;
    model: string;
    sourceLanguage: string;
    targetLanguage: string;
    testMode: boolean;
}): Promise<BackportSuggestion>;
//# sourceMappingURL=backward-evaluator.d.ts.map
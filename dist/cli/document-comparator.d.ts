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
import { TriageResult, TriageVerdict, FileGitMetadata, FileTimeline } from './types';
/**
 * Build the Stage 1 triage prompt
 *
 * Exported for snapshot testing.
 */
export declare function buildTriagePrompt(sourceContent: string, targetContent: string, sourceLanguage: string, targetLanguage: string, sourceMetadata: FileGitMetadata | null, targetMetadata: FileGitMetadata | null, timeline: FileTimeline | null): string;
/**
 * Parse the LLM response for Stage 1 triage
 * Robust: handles cases where Claude doesn't return clean JSON
 */
export declare function parseTriageResponse(responseText: string): {
    verdict: TriageVerdict;
    notes: string;
};
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
export declare function triageDocument(file: string, sourceContent: string, targetContent: string, sourceMetadata: FileGitMetadata | null, targetMetadata: FileGitMetadata | null, timeline: FileTimeline | null, options: {
    apiKey: string;
    model: string;
    sourceLanguage: string;
    targetLanguage: string;
    testMode: boolean;
}): Promise<TriageResult>;
//# sourceMappingURL=document-comparator.d.ts.map
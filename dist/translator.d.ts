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
import { SectionTranslationRequest, SectionTranslationResult, FullDocumentTranslationRequest } from './types';
/** Retry configuration for API calls */
export declare const RETRY_CONFIG: {
    maxRetries: number;
    baseDelayMs: number;
};
export declare class TranslationService {
    private client;
    private model;
    private debug;
    constructor(apiKey: string, model?: string, debug?: boolean);
    private log;
    /**
     * Sleep for a given number of milliseconds
     */
    private sleep;
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
    private callWithRetry;
    /**
     * Translate a section (update or new)
     */
    translateSection(request: SectionTranslationRequest): Promise<SectionTranslationResult>;
    /**
     * Update existing section (mode='update')
     * Claude sees: old English, new English, current translation → produces updated translation
     */
    private translateSectionUpdate;
    /**
     * Translate new section (mode='new')
     * Claude sees: English section → produces translation
     */
    private translateNewSection;
    /**
     * Translate full document (for new files)
     */
    translateFullDocument(request: FullDocumentTranslationRequest): Promise<SectionTranslationResult>;
    /**
     * Format glossary for inclusion in prompt
     */
    private formatGlossary;
}
//# sourceMappingURL=translator.d.ts.map
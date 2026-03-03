/**
 * Sync Orchestration - file processing pipeline for translation sync
 *
 * This module handles the core sync logic:
 * - Processing markdown files (section-based vs full translation)
 * - Processing renamed files (preserve translation, update paths)
 * - Processing TOC files (copy directly)
 * - Tracking removed files for deletion
 * - Error aggregation across files
 *
 * Extracted from index.ts for reuse by both GitHub Action and CLI.
 */
import { Glossary, TranslatedFile } from './types';
/**
 * Logger interface for decoupling from @actions/core
 * GitHub Action uses core.info/error/warning, CLI uses console
 */
export interface Logger {
    info: (message: string) => void;
    error: (message: string) => void;
    warning: (message: string) => void;
}
/**
 * Configuration for the sync orchestrator
 */
export interface SyncConfig {
    sourceLanguage: string;
    targetLanguage: string;
    claudeModel: string;
    anthropicApiKey: string;
    debugMode?: boolean;
}
/**
 * A file to be processed by the sync orchestrator.
 * Content should be pre-fetched by the caller (GitHub API or local filesystem).
 */
export interface FileToSync {
    filename: string;
    type: 'markdown' | 'toc' | 'renamed' | 'removed';
    newContent?: string;
    oldContent?: string;
    targetContent?: string;
    previousFilename?: string;
    existingFileSha?: string;
    oldFileSha?: string;
    isNewFile: boolean;
}
/**
 * Result of sync processing across all files
 */
export interface SyncProcessingResult {
    translatedFiles: TranslatedFile[];
    filesToDelete: Array<{
        path: string;
        sha: string;
    }>;
    processedFiles: string[];
    errors: string[];
}
/**
 * Load glossary for the target language.
 * Tries built-in glossary first, then falls back to custom glossary path.
 *
 * @param targetLanguage - Target language code (e.g., 'zh-cn')
 * @param builtInGlossaryDir - Directory containing built-in glossary files
 * @param customGlossaryPath - Optional path to custom glossary file
 * @param logger - Optional logger for status messages
 * @returns Loaded glossary or undefined if not found
 */
export declare function loadGlossary(targetLanguage: string, builtInGlossaryDir: string, customGlossaryPath?: string, logger?: Logger): Promise<Glossary | undefined>;
/**
 * Classify GitHub PR files into sync categories.
 * Handles the docs-folder prefix filtering and file type detection.
 *
 * @param files - Array of file objects from GitHub API (pulls.listFiles)
 * @param docsFolder - Documentation folder prefix (empty string for root)
 * @returns Categorized file arrays
 */
export declare function classifyChangedFiles(files: any[], docsFolder: string): {
    changedMarkdownFiles: typeof files;
    renamedMarkdownFiles: typeof files;
    changedTocFiles: typeof files;
    removedMarkdownFiles: typeof files;
    removedTocFiles: typeof files;
};
/**
 * Orchestrates the sync processing pipeline.
 *
 * Takes pre-fetched file content and delegates to FileProcessor for
 * translation. Returns results for PR creation (or other output).
 *
 * Design: Content fetching is the caller's responsibility (GitHub API or
 * local filesystem), keeping this module testable and reusable.
 */
export declare class SyncOrchestrator {
    private translator;
    private processor;
    private logger;
    private config;
    constructor(config: SyncConfig, logger: Logger);
    /**
     * Process all files through the translation pipeline.
     *
     * Files are processed sequentially (each may call Claude API).
     * Errors in individual files don't stop processing of others.
     *
     * @param files - Pre-fetched files to process
     * @param glossary - Optional glossary for translation
     * @returns Aggregated results across all files
     */
    processFiles(files: FileToSync[], glossary?: Glossary): Promise<SyncProcessingResult>;
    /**
     * Process a markdown file (added or modified).
     * New files get full translation; existing files get section-based updates.
     */
    private processMarkdownFile;
    /**
     * Process a renamed markdown file.
     * Preserves existing translation at new path, deletes old path.
     */
    private processRenamedFile;
    /**
     * Process a TOC file (copied directly without translation).
     */
    private processTocFile;
    /**
     * Process a removed file (track for deletion in target repo).
     */
    private processRemovedFile;
}
//# sourceMappingURL=sync-orchestrator.d.ts.map
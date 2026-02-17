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

import { TranslationService } from './translator';
import { FileProcessor } from './file-processor';
import { Glossary, TranslatedFile } from './types';
import { promises as fs } from 'fs';
import * as path from 'path';

// =============================================================================
// INTERFACES
// =============================================================================

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
  newContent?: string;         // Current English content from source
  oldContent?: string;         // Previous English content (before change)
  targetContent?: string;      // Current translation in target repo
  previousFilename?: string;   // For renamed files: old path
  existingFileSha?: string;    // SHA of existing target file (for updates)
  oldFileSha?: string;         // SHA of old target file to delete (renamed files)
  isNewFile: boolean;          // No existing translation in target repo
}

/**
 * Result of sync processing across all files
 */
export interface SyncProcessingResult {
  translatedFiles: TranslatedFile[];
  filesToDelete: Array<{ path: string; sha: string }>;
  processedFiles: string[];
  errors: string[];
}

// =============================================================================
// GLOSSARY LOADING
// =============================================================================

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
export async function loadGlossary(
  targetLanguage: string,
  builtInGlossaryDir: string,
  customGlossaryPath?: string,
  logger?: Logger,
): Promise<Glossary | undefined> {
  // Try built-in glossary first
  const builtInPath = path.join(builtInGlossaryDir, `${targetLanguage}.json`);
  try {
    const content = await fs.readFile(builtInPath, 'utf-8');
    const glossary: Glossary = JSON.parse(content);
    if (glossary) {
      logger?.info(`✓ Loaded built-in glossary for ${targetLanguage} with ${glossary.terms.length} terms`);
      return glossary;
    }
  } catch (error) {
    logger?.warning(`Could not load built-in glossary for ${targetLanguage}: ${error}`);
  }

  // Fallback: try custom glossary path
  if (customGlossaryPath) {
    try {
      const content = await fs.readFile(customGlossaryPath, 'utf-8');
      const glossary: Glossary = JSON.parse(content);
      if (glossary) {
        logger?.info(`✓ Loaded custom glossary from ${customGlossaryPath} with ${glossary.terms.length} terms`);
        return glossary;
      }
    } catch (error) {
      logger?.warning(`Could not load custom glossary from ${customGlossaryPath}: ${error}`);
    }
  }

  return undefined;
}

// =============================================================================
// FILE CLASSIFICATION
// =============================================================================

/**
 * Classify GitHub PR files into sync categories.
 * Handles the docs-folder prefix filtering and file type detection.
 *
 * @param files - Array of file objects from GitHub API (pulls.listFiles)
 * @param docsFolder - Documentation folder prefix (empty string for root)
 * @returns Categorized file arrays
 */
export function classifyChangedFiles(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  files: any[],
  docsFolder: string,
): {
  changedMarkdownFiles: typeof files;
  renamedMarkdownFiles: typeof files;
  changedTocFiles: typeof files;
  removedMarkdownFiles: typeof files;
  removedTocFiles: typeof files;
} {
  const prefix = docsFolder;

  const changedMarkdownFiles = files.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (file: any) =>
      file.filename.startsWith(prefix) &&
      file.filename.endsWith('.md') &&
      file.status !== 'removed' &&
      file.status !== 'renamed'
  );

  const renamedMarkdownFiles = files.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (file: any) =>
      file.filename.startsWith(prefix) &&
      file.filename.endsWith('.md') &&
      file.status === 'renamed'
  );

  const changedTocFiles = files.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (file: any) =>
      file.filename.startsWith(prefix) &&
      file.filename.endsWith('_toc.yml') &&
      file.status !== 'removed' &&
      file.status !== 'renamed'
  );

  const removedMarkdownFiles = files.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (file: any) =>
      file.filename.startsWith(prefix) &&
      file.filename.endsWith('.md') &&
      file.status === 'removed'
  );

  const removedTocFiles = files.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (file: any) =>
      file.filename.startsWith(prefix) &&
      file.filename.endsWith('_toc.yml') &&
      file.status === 'removed'
  );

  return { changedMarkdownFiles, renamedMarkdownFiles, changedTocFiles, removedMarkdownFiles, removedTocFiles };
}

// =============================================================================
// SYNC ORCHESTRATOR
// =============================================================================

/**
 * Orchestrates the sync processing pipeline.
 *
 * Takes pre-fetched file content and delegates to FileProcessor for
 * translation. Returns results for PR creation (or other output).
 *
 * Design: Content fetching is the caller's responsibility (GitHub API or
 * local filesystem), keeping this module testable and reusable.
 */
export class SyncOrchestrator {
  private translator: TranslationService;
  private processor: FileProcessor;
  private logger: Logger;
  private config: SyncConfig;

  constructor(config: SyncConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    const debugMode = config.debugMode ?? false;
    this.translator = new TranslationService(config.anthropicApiKey, config.claudeModel, debugMode);
    this.processor = new FileProcessor(this.translator, debugMode);
  }

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
  async processFiles(
    files: FileToSync[],
    glossary?: Glossary,
  ): Promise<SyncProcessingResult> {
    const result: SyncProcessingResult = {
      translatedFiles: [],
      filesToDelete: [],
      processedFiles: [],
      errors: [],
    };

    for (const file of files) {
      try {
        switch (file.type) {
          case 'markdown':
            await this.processMarkdownFile(file, glossary, result);
            break;
          case 'renamed':
            await this.processRenamedFile(file, glossary, result);
            break;
          case 'toc':
            this.processTocFile(file, result);
            break;
          case 'removed':
            this.processRemovedFile(file, result);
            break;
        }
      } catch (error) {
        const errorMessage = `Error processing ${file.filename}: ${error}`;
        this.logger.error(errorMessage);
        result.errors.push(errorMessage);
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Private: File type handlers
  // ---------------------------------------------------------------------------

  /**
   * Process a markdown file (added or modified).
   * New files get full translation; existing files get section-based updates.
   */
  private async processMarkdownFile(
    file: FileToSync,
    glossary: Glossary | undefined,
    result: SyncProcessingResult,
  ): Promise<void> {
    this.logger.info(`Processing ${file.filename}...`);

    if (!file.newContent) {
      throw new Error(`No content provided for ${file.filename}`);
    }

    let translatedContent: string;
    if (file.isNewFile) {
      translatedContent = await this.processor.processFull(
        file.newContent,
        file.filename,
        this.config.sourceLanguage,
        this.config.targetLanguage,
        glossary,
      );
    } else {
      translatedContent = await this.processor.processSectionBased(
        file.oldContent || '',
        file.newContent,
        file.targetContent || '',
        file.filename,
        this.config.sourceLanguage,
        this.config.targetLanguage,
        glossary,
      );
    }

    // Validate translated content
    const validation = await this.processor.validateMyST(translatedContent, file.filename);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.error}`);
    }

    this.logger.info(`Successfully processed ${file.filename}`);
    result.processedFiles.push(file.filename);
    result.translatedFiles.push({
      path: file.filename,
      content: translatedContent,
      sha: file.existingFileSha,
    });
  }

  /**
   * Process a renamed markdown file.
   * Preserves existing translation at new path, deletes old path.
   */
  private async processRenamedFile(
    file: FileToSync,
    glossary: Glossary | undefined,
    result: SyncProcessingResult,
  ): Promise<void> {
    this.logger.info(`Processing renamed file: ${file.previousFilename} → ${file.filename}...`);

    if (!file.newContent) {
      throw new Error(`No content provided for ${file.filename}`);
    }

    let translatedContent: string;
    if (file.targetContent) {
      // Existing translation — use section-based processing to update
      translatedContent = await this.processor.processSectionBased(
        file.oldContent || '',
        file.newContent,
        file.targetContent,
        file.filename,
        this.config.sourceLanguage,
        this.config.targetLanguage,
        glossary,
      );
    } else {
      // No existing translation — full translation
      translatedContent = await this.processor.processFull(
        file.newContent,
        file.filename,
        this.config.sourceLanguage,
        this.config.targetLanguage,
        glossary,
      );
    }

    // Validate
    const validation = await this.processor.validateMyST(translatedContent, file.filename);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.error}`);
    }

    this.logger.info(`Successfully processed renamed file ${file.filename}`);
    result.processedFiles.push(file.filename);

    // Store at new path (no sha — new file location)
    result.translatedFiles.push({
      path: file.filename,
      content: translatedContent,
    });

    // Mark old file for deletion
    if (file.oldFileSha && file.previousFilename) {
      result.filesToDelete.push({
        path: file.previousFilename,
        sha: file.oldFileSha,
      });
      this.logger.info(`Marked ${file.previousFilename} for deletion (renamed to ${file.filename})`);
    }
  }

  /**
   * Process a TOC file (copied directly without translation).
   */
  private processTocFile(
    file: FileToSync,
    result: SyncProcessingResult,
  ): void {
    this.logger.info(`Processing TOC file ${file.filename}...`);

    if (!file.newContent) {
      throw new Error(`No content provided for ${file.filename}`);
    }

    result.processedFiles.push(file.filename);
    result.translatedFiles.push({
      path: file.filename,
      content: file.newContent,
      sha: file.existingFileSha,
    });

    this.logger.info(`Successfully processed ${file.filename}`);
  }

  /**
   * Process a removed file (track for deletion in target repo).
   */
  private processRemovedFile(
    file: FileToSync,
    result: SyncProcessingResult,
  ): void {
    if (file.existingFileSha) {
      result.filesToDelete.push({
        path: file.filename,
        sha: file.existingFileSha,
      });
      result.processedFiles.push(file.filename);
      this.logger.info(`Marked ${file.filename} for deletion`);
    } else {
      this.logger.info(`${file.filename} does not exist in target repo - skipping deletion`);
    }
  }
}

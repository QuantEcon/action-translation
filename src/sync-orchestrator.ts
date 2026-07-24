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

import { TranslationService } from './translator.js';
import { FileProcessor } from './file-processor.js';
import { MystParser } from './parser.js';
import { checkStructuralParity, formatParityViolations } from './structural-parity.js';
import { Glossary, TranslatedFile, RebaseCache } from './types.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  serializeFileState,
  stateFileRelativePath,
  getToolVersion,
} from './cli/translate-state.js';
import { FileState } from './cli/types.js';

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
 * Optional configuration for generating .translate/state/ files.
 * When provided, state files are included in translatedFiles alongside translations.
 */
export interface StateGenerationConfig {
  /** Commit SHA in the source repo that triggered this sync */
  sourceCommitSha: string;
  /** Map from state file path → existing git blob SHA (for updates via Octokit) */
  existingStateShas: Map<string, string>;
  /** Docs folder prefix to strip from filenames (e.g. 'lectures/') so state paths are docs-relative */
  docsFolder: string;
}

/**
 * A file to be processed by the sync orchestrator.
 * Content should be pre-fetched by the caller (GitHub API or local filesystem).
 */
export interface FileToSync {
  filename: string;
  type: 'markdown' | 'toc' | 'renamed' | 'removed';
  newContent?: string; // Current English content from source
  oldContent?: string; // Previous English content (before change)
  targetContent?: string; // Current translation in target repo
  previousFilename?: string; // For renamed files: old path
  existingFileSha?: string; // SHA of existing target file (for updates)
  oldFileSha?: string; // SHA of old target file to delete (renamed files)
  isNewFile: boolean; // No existing translation in target repo
  /** Per-file source commit SHA (overrides StateGenerationConfig.sourceCommitSha) */
  sourceCommitSha?: string;
}

/**
 * Result of sync processing across all files
 */
export interface SyncProcessingResult {
  translatedFiles: TranslatedFile[];
  filesToDelete: Array<{ path: string; sha: string }>;
  processedFiles: string[];
  errors: string[];
  /** Sections skipped per file: unchanged in source diff but missing from target (pending earlier translation PR). */
  skippedSections: Map<string, string[]>;
  /** Target-only sections removed per file: present in the target but with no counterpart in the current source (#90 defect 2 — upstream drift or human-added content; the PR body surfaces them so a reviewer decides which). */
  droppedTargetSections: Map<string, string[]>;
}

// =============================================================================
// GLOSSARY LOADING
// =============================================================================

/**
 * Load glossary for the target language.
 *
 * `glossary-path`, when set, is an **override**, not a fallback: it is the only
 * candidate, and a file that cannot be read or parsed fails the run. It used to
 * be tried *after* the built-in glossary, which meant a custom glossary was
 * silently ignored for every language that ships one — i.e. for the whole
 * estate — and an unreadable custom file quietly degraded to different
 * terminology. Both are the silent-wrong-glossary class of #146/#149.
 *
 * @param targetLanguage - Target language code (e.g., 'zh-cn')
 * @param builtInGlossaryDir - Directory containing built-in glossary files
 * @param customGlossaryPath - Optional path to a custom glossary file (overrides the built-in)
 * @param logger - Optional logger for status messages
 * @returns Loaded glossary, or undefined when the language has no built-in glossary
 * @throws if `customGlossaryPath` is set but cannot be read or parsed
 */
export async function loadGlossary(
  targetLanguage: string,
  builtInGlossaryDir: string,
  customGlossaryPath?: string,
  logger?: Logger
): Promise<Glossary | undefined> {
  // A custom glossary is an override — falling back to different terminology
  // because the operator's file is missing is exactly the failure to avoid.
  if (customGlossaryPath) {
    let glossary: Glossary;
    try {
      glossary = await readGlossaryFile(customGlossaryPath);
    } catch (error) {
      throw new Error(
        `Could not load custom glossary from ${customGlossaryPath}: ${errorMessage(error)}`
      );
    }
    logger?.info(
      `✓ Loaded custom glossary from ${customGlossaryPath} with ${glossary.terms.length} terms`
    );
    return glossary;
  }

  // Same validation, deliberately different consequence: a missing custom path
  // is operator misconfiguration and fails the run, while a corrupt built-in
  // glossary means a broken install — reported, but not the operator's fault.
  const builtInPath = path.join(builtInGlossaryDir, `${targetLanguage}.json`);
  try {
    const glossary = await readGlossaryFile(builtInPath);
    logger?.info(
      `✓ Loaded built-in glossary for ${targetLanguage} with ${glossary.terms.length} terms`
    );
    return glossary;
  } catch (error) {
    logger?.warning(
      `Could not load built-in glossary for ${targetLanguage}: ${errorMessage(error)}`
    );
  }

  return undefined;
}

/**
 * Message text for a caught value, without the doubled `Error:` prefix that
 * interpolating the error object itself produces.
 *
 * Deliberately duck-typed rather than the `error instanceof Error` idiom used
 * elsewhere in this codebase: `fs.promises` rejections cross a realm boundary
 * under Jest's vm context, so `instanceof Error` is **false** for them even
 * though `constructor.name` is `Error` — the idiom silently falls through to
 * `String(error)` and re-adds the prefix it was meant to strip. That is only a
 * cosmetic difference in production (single realm, so `instanceof` holds), but
 * it is the difference between this behaviour being testable and not.
 */
function errorMessage(error: unknown): string {
  const message = (error as { message?: unknown } | null | undefined)?.message;
  return typeof message === 'string' ? message : String(error);
}

/**
 * Read and validate one glossary file.
 *
 * Validating `terms` here rather than at each call site keeps the two branches
 * from drifting apart: a glossary whose `terms` is present but not an array used
 * to be logged as `with undefined terms` and returned, then blew up downstream
 * in `formatGlossaryTerms` or the translator, far from the cause.
 */
async function readGlossaryFile(file: string): Promise<Glossary> {
  const content = await fs.readFile(file, 'utf-8');

  let glossary: Glossary;
  try {
    glossary = JSON.parse(content);
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${errorMessage(error)}`);
  }

  if (!glossary || !Array.isArray(glossary.terms)) {
    throw new Error(`${file} has no "terms" array`);
  }

  return glossary;
}

/**
 * Render a glossary as the prompt lines the reviewer consumes.
 *
 * The reviewer takes terminology as pre-formatted text while the translator
 * takes the object, so this formatting has to live somewhere; it lived inline
 * in `runReview`, where `import.meta.url` puts it beyond the reach of the Jest
 * CJS registry and so beyond the reach of tests.
 */
export function formatGlossaryTerms(glossary: Glossary, targetLanguage: string): string {
  return (
    glossary.terms
      // Match the translator's filter (#163/F79): a term with no translation for
      // this language rendered as `- "term" → ""` here while the translation was
      // produced without it — the reviewer judged against terminology the
      // translator never saw.
      .filter((t) => typeof t[targetLanguage] === 'string' && t[targetLanguage] !== '')
      .map((t) => `- "${t.en}" → "${t[targetLanguage]}"${t.context ? ` (${t.context})` : ''}`)
      .join('\n')
  );
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
  docsFolder: string
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
      file.filename.startsWith(prefix) && file.filename.endsWith('.md') && file.status === 'renamed'
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
      file.filename.startsWith(prefix) && file.filename.endsWith('.md') && file.status === 'removed'
  );

  const removedTocFiles = files.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (file: any) =>
      file.filename.startsWith(prefix) &&
      file.filename.endsWith('_toc.yml') &&
      file.status === 'removed'
  );

  return {
    changedMarkdownFiles,
    renamedMarkdownFiles,
    changedTocFiles,
    removedMarkdownFiles,
    removedTocFiles,
  };
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
  private parser: MystParser;
  private logger: Logger;
  private config: SyncConfig;
  private stateConfig?: StateGenerationConfig;

  constructor(config: SyncConfig, logger: Logger, stateConfig?: StateGenerationConfig) {
    this.config = config;
    this.logger = logger;
    this.stateConfig = stateConfig;
    const debugMode = config.debugMode ?? false;
    this.translator = new TranslationService(config.anthropicApiKey, config.claudeModel, debugMode);
    this.processor = new FileProcessor(this.translator, debugMode);
    this.parser = new MystParser();
  }

  /** API usage across every Claude call this run made, retries included (#164). */
  getUsage(): ReturnType<TranslationService['getUsage']> {
    return this.translator.getUsage();
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
    rebaseCache?: RebaseCache
  ): Promise<SyncProcessingResult> {
    const result: SyncProcessingResult = {
      translatedFiles: [],
      filesToDelete: [],
      processedFiles: [],
      errors: [],
      skippedSections: new Map(),
      droppedTargetSections: new Map(),
    };

    for (const file of files) {
      try {
        switch (file.type) {
          case 'markdown':
            await this.processMarkdownFile(file, glossary, result, rebaseCache?.get(file.filename));
            break;
          case 'renamed':
            await this.processRenamedFile(file, glossary, result, rebaseCache?.get(file.filename));
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
    fileRebaseCache?: import('./types.js').RebaseCacheData
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
        glossary
      );
    } else {
      const skipped: string[] = [];
      const dropped: string[] = [];
      translatedContent = await this.processor.processSectionBased(
        file.oldContent || '',
        file.newContent,
        file.targetContent || '',
        file.filename,
        this.config.sourceLanguage,
        this.config.targetLanguage,
        glossary,
        (heading) => skipped.push(heading),
        fileRebaseCache,
        (heading) => dropped.push(heading)
      );
      if (skipped.length > 0) {
        result.skippedSections.set(file.filename, skipped);
        this.logger.warning(
          `${file.filename}: skipped ${skipped.length} section(s) unchanged in source but missing from target — pending earlier translation PR`
        );
      }
      if (dropped.length > 0) {
        result.droppedTargetSections.set(file.filename, dropped);
        this.logger.warning(
          `${file.filename}: removed ${dropped.length} target-only section(s) with no source counterpart — correct if upstream deleted them; destructive if human-added (see PR body)`
        );
      }
    }

    // Structural parity — the single honest guard on this path (#165: the
    // former validateMyST gate could never fail; parseSections has no throw
    // path, so it read as protection and was not): directive shapes and
    // target anchors must survive
    // translation verbatim (#119, #65). Failing the file loudly here is the
    // point — every defect in this class previously shipped as a success and
    // surfaced weeks later on a downstream strict build.
    const parity = checkStructuralParity(file.newContent, translatedContent);
    if (!parity.ok) {
      throw new Error(formatParityViolations(file.filename, parity));
    }

    this.logger.info(`Successfully processed ${file.filename}`);
    result.processedFiles.push(file.filename);
    result.translatedFiles.push({
      path: file.filename,
      content: translatedContent,
      sha: file.existingFileSha,
    });

    // Generate state file if state generation is enabled
    await this.maybeGenerateStateFile(
      file.filename,
      file.newContent,
      file.sourceCommitSha,
      file.isNewFile ? 'NEW' : 'UPDATE',
      result
    );
  }

  /**
   * Process a renamed markdown file.
   * Preserves existing translation at new path, deletes old path.
   */
  private async processRenamedFile(
    file: FileToSync,
    glossary: Glossary | undefined,
    result: SyncProcessingResult,
    fileRebaseCache?: import('./types.js').RebaseCacheData
  ): Promise<void> {
    this.logger.info(`Processing renamed file: ${file.previousFilename} → ${file.filename}...`);

    if (!file.newContent) {
      throw new Error(`No content provided for ${file.filename}`);
    }

    let translatedContent: string;
    if (file.targetContent) {
      // Existing translation — use section-based processing to update
      const skipped: string[] = [];
      const dropped: string[] = [];
      translatedContent = await this.processor.processSectionBased(
        file.oldContent || '',
        file.newContent,
        file.targetContent,
        file.filename,
        this.config.sourceLanguage,
        this.config.targetLanguage,
        glossary,
        (heading) => skipped.push(heading),
        fileRebaseCache,
        (heading) => dropped.push(heading)
      );
      if (skipped.length > 0) {
        result.skippedSections.set(file.filename, skipped);
        this.logger.warning(
          `${file.filename}: skipped ${skipped.length} section(s) unchanged in source but missing from target — pending earlier translation PR`
        );
      }
      if (dropped.length > 0) {
        result.droppedTargetSections.set(file.filename, dropped);
        this.logger.warning(
          `${file.filename}: removed ${dropped.length} target-only section(s) with no source counterpart — correct if upstream deleted them; destructive if human-added (see PR body)`
        );
      }
    } else {
      // No existing translation — full translation
      translatedContent = await this.processor.processFull(
        file.newContent,
        file.filename,
        this.config.sourceLanguage,
        this.config.targetLanguage,
        glossary
      );
    }

    // Structural parity — same (and only) guard as processMarkdownFile
    // (#119, #65; the dead validateMyST gate was deleted in #165).
    const parity = checkStructuralParity(file.newContent, translatedContent);
    if (!parity.ok) {
      throw new Error(formatParityViolations(file.filename, parity));
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
      this.logger.info(
        `Marked ${file.previousFilename} for deletion (renamed to ${file.filename})`
      );

      // Also delete old state file if it exists
      if (this.stateConfig) {
        const oldDocsRelName = this.toDocsRelative(file.previousFilename);
        const oldStatePath = stateFileRelativePath(oldDocsRelName);
        const oldStateSha = this.stateConfig.existingStateShas.get(oldStatePath);
        if (oldStateSha) {
          result.filesToDelete.push({ path: oldStatePath, sha: oldStateSha });
          this.logger.info(`Marked old state file for deletion: ${oldStatePath}`);
        }
      }
    }

    // Generate state file for the new filename
    if (file.newContent) {
      await this.maybeGenerateStateFile(
        file.filename,
        file.newContent,
        file.sourceCommitSha,
        file.targetContent ? 'UPDATE' : 'NEW',
        result
      );
    }
  }

  /**
   * Process a TOC file (copied directly without translation).
   */
  private processTocFile(file: FileToSync, result: SyncProcessingResult): void {
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
  private processRemovedFile(file: FileToSync, result: SyncProcessingResult): void {
    if (file.existingFileSha) {
      result.filesToDelete.push({
        path: file.filename,
        sha: file.existingFileSha,
      });
      result.processedFiles.push(file.filename);
      this.logger.info(`Marked ${file.filename} for deletion`);

      // Also delete the corresponding state file
      if (this.stateConfig) {
        const docsRelName = this.toDocsRelative(file.filename);
        const statePath = stateFileRelativePath(docsRelName);
        const stateSha = this.stateConfig.existingStateShas.get(statePath);
        if (stateSha) {
          result.filesToDelete.push({ path: statePath, sha: stateSha });
          this.logger.info(`Marked state file for deletion: ${statePath}`);
        }
      }
    } else {
      this.logger.info(`${file.filename} does not exist in target repo - skipping deletion`);
    }
  }

  // ---------------------------------------------------------------------------
  // Private: State file generation
  // ---------------------------------------------------------------------------

  /**
   * Generate a .translate/state/ file for a processed markdown file.
   * Only generates when stateConfig is provided (opt-in).
   */
  private async maybeGenerateStateFile(
    filename: string,
    sourceContent: string,
    perFileCommitSha: string | undefined,
    mode: 'NEW' | 'UPDATE',
    result: SyncProcessingResult
  ): Promise<void> {
    if (!this.stateConfig) return;

    const commitSha = perFileCommitSha || this.stateConfig.sourceCommitSha;

    try {
      // Count sections in the source content
      const parsed = await this.parser.parseSections(sourceContent, filename);
      const sectionCount = parsed.sections.length;

      const state: FileState = {
        'source-sha': commitSha,
        'synced-at': new Date().toISOString().slice(0, 10),
        model: this.config.claudeModel,
        mode,
        'section-count': sectionCount,
        'tool-version': getToolVersion(),
      };

      const docsRelName = this.toDocsRelative(filename);
      const statePath = stateFileRelativePath(docsRelName);
      const existingSha = this.stateConfig.existingStateShas.get(statePath);

      result.translatedFiles.push({
        path: statePath,
        content: serializeFileState(state),
        sha: existingSha,
      });

      this.logger.info(`Generated state file: ${statePath}`);
    } catch (error) {
      // State generation is non-fatal
      this.logger.warning(`Could not generate state for ${filename}: ${error}`);
    }
  }

  /**
   * Strip docsFolder prefix from a repo-relative filename to get docs-relative path.
   * e.g., 'lectures/intro.md' with docsFolder 'lectures/' → 'intro.md'
   */
  private toDocsRelative(filename: string): string {
    if (!this.stateConfig?.docsFolder) return filename;
    const prefix = this.stateConfig.docsFolder;
    if (filename.startsWith(prefix)) {
      return filename.slice(prefix.length);
    }
    return filename;
  }
}

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
import { formatParityViolations } from './structural-parity.js';
import { checkWrittenDocument } from './whole-document.js';
import { applyVerbatimDirectives } from './verbatim-directives.js';
import {
  BibliographyMode,
  BibliographySources,
  CitationDoc,
  CitationPlan,
  DEFAULT_BIBLIOGRAPHY_MODE,
  formatCitationErrors,
  planCitationBackfill,
} from './bibliography.js';
import { Glossary, TranslatedFile, RebaseCache } from './types.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { mergeFileState, stateFileRelativePath, getToolVersion } from './cli/translate-state.js';
import { FileState } from './cli/types.js';
import type { StateRead } from './sync-premise.js';
import { mergeTargetCaptions } from './toc-captions.js';
import { collectTocFiles } from './lecture-set.js';

// The ToC walk lives with the lecture set (#449); re-exported for this module's callers and tests.
export { collectTocFiles };

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
  /**
   * How to handle citations this run introduces that the target bibliography
   * lacks (#117). Defaults to 'backfill'.
   */
  bibliographyMode?: BibliographyMode;
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
  /**
   * What the run's read of each existing state file returned, by state path
   * (#290). A state file written over one that was found keeps that file's
   * keys the engine does not own; one whose read failed is not written.
   * Without it, every state file is written fresh, as before.
   */
  existingStates?: Map<string, StateRead>;
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
  /** What the bibliography backfill did, when it ran (#117). */
  citationBackfill?: CitationPlan;
  /**
   * Source paths of *new* files this run did not deliver (#156): translation
   * failed, or the source content could not be fetched.  Absent when every new
   * file landed.  The PR creator surfaces these so the reviewer understands why
   * the PR is intentionally partial.
   */
  failedNewFiles?: string[];
  /**
   * `_toc.yml` paths from which the failed new files' entries were removed.
   * Empty when `failedNewFiles` is set but no TOC was in this run's changeset —
   * the PR body words the notice differently in that case, because nothing
   * was removed and a pre-existing target entry may still dangle.
   */
  filteredTocPaths?: string[];
  /**
   * State files this run wrote over an existing file that did not load as a
   * YAML mapping, so whatever it held is gone (#290). The PR body names them;
   * absent when there are none.
   */
  overwrittenStateFiles?: string[];
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
 * in `runReview` back when that ran inside the untestable entry point. #169
 * moved the runner to `src/action/review.ts`, so its use of this function is
 * now covered by tests — but the formatting stays here, next to the loader
 * whose output it renders.
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
 * True when `path` names a markdown file inside the docs folder. An empty
 * `docsFolder` is the repository root, which contains every path.
 */
export function isDocsMarkdownPath(path: unknown, docsFolder: string): path is string {
  return typeof path === 'string' && path.startsWith(docsFolder) && path.endsWith('.md');
}

/**
 * True when `file` is a docs-folder lecture renamed to a path outside the
 * docs folder. The repository root contains every path, so nothing moves out
 * of an empty `docsFolder`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isMovedOutOfDocs(file: any, docsFolder: string): boolean {
  return (
    file.status === 'renamed' &&
    isDocsMarkdownPath(file.previous_filename, docsFolder) &&
    typeof file.filename === 'string' &&
    !file.filename.startsWith(docsFolder)
  );
}

/** A rename sync does not carry out, beside a lecture moved out of the folder (#398). */
export interface RenamesOut {
  /**
   * The docs folder's own `_toc.yml` moved out of it, or removed while a
   * `_toc.yml` outside the folder is added: the source has moved its book.
   * Taking each lecture's move as a removal would delete every translation,
   * so the run is refused instead.
   */
  tocMovedOut?: { from: string; to: string };
  /**
   * Lectures renamed inside the docs folder to a name that is not `.md`. The
   * edition keeps the translation, which sync no longer updates; the run
   * warns about each.
   */
  notMarkdown: Array<{ from: string; to: string }>;
}

/** The renames out of what sync handles, other than a lecture moved out of the folder. */
export function findRenamesOut(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  files: any[],
  docsFolder: string
): RenamesOut {
  const renamesOut: RenamesOut = { notMarkdown: [] };
  const toc = `${docsFolder}_toc.yml`;
  const outside = (path: unknown): path is string =>
    typeof path === 'string' && !path.startsWith(docsFolder);
  for (const file of files) {
    if (file.status !== 'renamed' || typeof file.previous_filename !== 'string') continue;
    const from: string = file.previous_filename;
    const to: string = file.filename;
    if (!from.startsWith(docsFolder)) continue;
    if (from === toc && outside(to)) {
      renamesOut.tocMovedOut ??= { from, to };
    } else if (from.endsWith('.md') && to.startsWith(docsFolder) && !to.endsWith('.md')) {
      renamesOut.notMarkdown.push({ from, to });
    }
  }
  // GitHub lists a file that was moved and rewritten past its similarity
  // threshold as a removal plus an addition, and a book move is when its ToC
  // is likeliest to be rewritten.
  if (!renamesOut.tocMovedOut && files.some((f) => f.status === 'removed' && f.filename === toc)) {
    const added = files.find(
      (f) =>
        f.status === 'added' &&
        outside(f.filename) &&
        (f.filename === '_toc.yml' || f.filename.endsWith('/_toc.yml'))
    );
    if (added) renamesOut.tocMovedOut = { from: toc, to: added.filename };
  }
  return renamesOut;
}

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

  // A rename carries the edition's translation from the old path to the new
  // one and deletes the old file, so it is a rename only when the old path is
  // a lecture too. A file moved into the docs folder from outside it (or from
  // a name that is not `.md`) has no translation to carry: it is an addition,
  // and the edition's own file at the old path is left alone (#307).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isLectureRename = (file: any): boolean =>
    file.status === 'renamed' && isDocsMarkdownPath(file.previous_filename, prefix);

  const changedMarkdownFiles = files.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (file: any) =>
      file.filename.startsWith(prefix) &&
      file.filename.endsWith('.md') &&
      file.status !== 'removed' &&
      !isLectureRename(file)
  );

  const renamedMarkdownFiles = files.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (file: any) =>
      file.filename.startsWith(prefix) && file.filename.endsWith('.md') && isLectureRename(file)
  );

  const changedTocFiles = files.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (file: any) =>
      file.filename.startsWith(prefix) &&
      file.filename.endsWith('_toc.yml') &&
      file.status !== 'removed' &&
      file.status !== 'renamed'
  );

  // A lecture moved out of the docs folder is gone from the book, so the
  // edition deletes its translation and state file, as for a removal (#398).
  // The entry names the old path, where the edition has the lecture.
  const removedMarkdownFiles = files.flatMap(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (file: any) => {
      if (
        file.filename.startsWith(prefix) &&
        file.filename.endsWith('.md') &&
        file.status === 'removed'
      ) {
        return [file];
      }
      if (isMovedOutOfDocs(file, prefix)) {
        return [
          {
            ...file,
            filename: file.previous_filename,
            status: 'removed',
            renamedTo: file.filename,
          },
        ];
      }
      return [];
    }
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
// TOC FILTERING
// =============================================================================

/**
 * A `- file:` line in a block-style `_toc.yml`, in any of YAML's scalar
 * quotings, with an optional trailing comment.  Group 1 is the indent of the
 * dash; groups 2-4 carry the stem.
 */
const TOC_FILE_LINE_RE = /^(\s*)-\s+file:\s*(?:"([^"]*)"|'([^']*)'|([^\s#]+))\s*(?:#.*)?$/;

/**
 * Splice the lines of the dropped entries out of the original TOC text.  An
 * entry is its `- file:` line plus every following line indented deeper than
 * the dash (`title:`, `sections:` and their children); blank lines that turn
 * out to separate entries are left in place.  Everything else — indentation
 * style, quoting, comments, trailing whitespace — is untouched, so the
 * target's diff shows exactly the removed entries and nothing else.
 */
function spliceTocEntryLines(tocContent: string, entriesToDrop: Set<string>): string {
  const lines = tocContent.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const m = TOC_FILE_LINE_RE.exec(lines[i]);
    const stem = m ? (m[2] ?? m[3] ?? m[4]) : undefined;
    if (m && stem !== undefined && entriesToDrop.has(stem)) {
      const dashIndent = m[1].length;
      let j = i + 1;
      while (j < lines.length) {
        const line = lines[j];
        if (line.trim() === '') {
          j++;
          continue;
        }
        const indent = line.length - line.trimStart().length;
        if (indent <= dashIndent) break;
        j++;
      }
      while (j > i + 1 && lines[j - 1].trim() === '') j--;
      i = j;
      continue;
    }
    out.push(lines[i]);
    i++;
  }
  return out.join('\n');
}

/** Filter the parsed TOC in place; the fallback serialiser's input. */
function filterTocDocument(doc: Record<string, unknown>, entriesToDrop: Set<string>): void {
  const filterList = (entries: unknown): unknown => {
    if (!Array.isArray(entries)) return entries;
    const kept = entries.filter((entry) => {
      if (typeof entry !== 'object' || entry === null) return true;
      const file = (entry as Record<string, unknown>).file;
      return !(typeof file === 'string' && entriesToDrop.has(file));
    });
    for (const entry of kept) {
      if (typeof entry === 'object' && entry !== null) {
        const e = entry as Record<string, unknown>;
        if ('chapters' in e) e.chapters = filterList(e.chapters);
        if ('sections' in e) e.sections = filterList(e.sections);
      }
    }
    return kept;
  };
  if ('chapters' in doc) doc.chapters = filterList(doc.chapters);
  if ('sections' in doc) doc.sections = filterList(doc.sections);
  if (Array.isArray(doc.parts)) {
    for (const part of doc.parts) {
      if (typeof part === 'object' && part !== null) {
        const p = part as Record<string, unknown>;
        if ('chapters' in p) p.chapters = filterList(p.chapters);
      }
    }
  }
}

/**
 * Remove `file:` entries from a `_toc.yml` string for a set of stems (paths
 * relative to the TOC file's directory, without the `.md` extension).  Handles
 * the flat `chapters:` and `parts: [{chapters: …}]` layouts and nested
 * `sections:` / `chapters:` lists at any depth.
 *
 * The result is byte-identical to the input apart from the removed entries'
 * lines.  QuantEcon TOCs are written in the zero-indent block style
 * (`parts:\n- caption:`), which js-yaml would re-indent on a round trip —
 * turning a one-line removal into a whole-file rewrite that hides the change
 * from the reviewer and flips back on the next verbatim sync.  So the entries
 * are spliced out of the original text, and the splice is *verified* by
 * parsing the result: the surviving `file:` list must equal what filtering
 * the parsed document yields.  Only if that check fails — a layout the line
 * splice does not recognise, such as a dash on its own line — does the
 * function fall back to filtering the parsed document and re-serialising.
 *
 * Returns the *original* string (same reference) when nothing matches, so
 * callers can detect a no-op by identity.  Exported for unit testing.
 */
export function removeTocFileEntries(tocContent: string, entriesToDrop: Set<string>): string {
  if (entriesToDrop.size === 0) return tocContent;

  let doc: unknown;
  try {
    doc = yaml.load(tocContent);
  } catch {
    return tocContent;
  }
  if (!doc || typeof doc !== 'object') return tocContent;

  const before = collectTocFiles(doc);
  if (!before.some((f) => entriesToDrop.has(f))) return tocContent;

  // The filtered document is the oracle: a dropped entry takes its nested
  // sections with it, so "original minus the stems" would under-count.
  filterTocDocument(doc as Record<string, unknown>, entriesToDrop);
  const expected = collectTocFiles(doc);

  const spliced = spliceTocEntryLines(tocContent, entriesToDrop);
  if (tocFilesAre(spliced, expected)) return spliced;

  return yaml.dump(doc, { lineWidth: -1, noArrayIndent: true });
}

function tocFilesAre(content: string, expected: string[]): boolean {
  try {
    const files = collectTocFiles(yaml.load(content));
    return files.length === expected.length && files.every((f, i) => f === expected[i]);
  } catch {
    return false;
  }
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
    rebaseCache?: RebaseCache,
    bibliography?: BibliographySources,
    fetchFailedNewFiles: string[] = []
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

    this.backfillCitations(files, result, bibliography);
    this.filterTocForFailedNewFiles(files, result, fetchFailedNewFiles);

    return result;
  }

  /**
   * Carry bibliography entries for citations this run introduces (#117).
   *
   * Runs after translation, over the bytes that will actually be committed, and
   * is demand-driven: the trigger is a `{cite}` key that is new to the target
   * document and does not resolve there, whatever the source diff contained.
   * A diff-driven design misses the larger class, where the target simply had
   * not translated a citing lecture yet and no source PR touches the bib.
   *
   * Append-only, and a key that already resolves in the target is never a
   * candidate — so an edition that has localised an entry cannot have it
   * clobbered.
   */
  private backfillCitations(
    files: FileToSync[],
    result: SyncProcessingResult,
    bibliography?: BibliographySources
  ): void {
    const mode = this.config.bibliographyMode ?? DEFAULT_BIBLIOGRAPHY_MODE;
    if (mode === 'off' || !bibliography || bibliography.targets.length === 0) return;

    // Only markdown documents carry citations, and only the ones this run
    // actually produced are in scope.
    const beforeByPath = new Map(files.map((f) => [f.filename, f.targetContent || '']));
    const docs: CitationDoc[] = result.translatedFiles
      .filter((f) => f.path.endsWith('.md'))
      .map((f) => ({
        file: f.path,
        before: beforeByPath.get(f.path) ?? '',
        after: f.content,
      }));
    if (docs.length === 0) return;

    const plan = planCitationBackfill({ docs, bib: bibliography, mode });

    for (const warning of plan.warnings) this.logger.warning(warning);

    if (plan.mergedBib && plan.bibPath) {
      const total = [...plan.backfilled.values()].reduce((n, keys) => n + keys.length, 0);
      this.logger.info(
        `Bibliography: appended ${total} entr${total === 1 ? 'y' : 'ies'} to ${plan.bibPath} for citations this sync introduced`
      );
      result.translatedFiles.push({
        path: plan.bibPath,
        content: plan.mergedBib,
        sha: plan.bibSha,
      });
    }

    if (plan.errors.length > 0) {
      // A citation that resolves nowhere means the target cannot build. Failing
      // here is the point: this class previously shipped green and surfaced as a
      // broken build in the target repo days later.
      const message = formatCitationErrors(plan);
      this.logger.error(message);
      result.errors.push(message);
    }

    result.citationBackfill = plan;
  }

  // ---------------------------------------------------------------------------
  // Private: File type handlers
  // ---------------------------------------------------------------------------

  /**
   * Verbatim-directive policy (`verbatim-directives.ts`): for editions that
   * keep the exercise family byte-identical to the source (`ml`), restore
   * those blocks from `file.newContent` after translation, before the parity
   * guard checks the bytes that will be written. A block-sequence mismatch is
   * left for the parity guard to report.
   */
  private restoreVerbatimDirectives(file: FileToSync, translatedContent: string): string {
    if (file.newContent === undefined) return translatedContent;
    const verbatim = applyVerbatimDirectives(
      file.newContent,
      translatedContent,
      this.config.targetLanguage
    );
    if (verbatim.mismatch) {
      this.logger.warning(`${file.filename}: ${verbatim.mismatch}; verbatim restore skipped`);
    } else if (verbatim.replaced > 0) {
      this.logger.info(
        `${file.filename}: restored ${verbatim.replaced} exercise-family block(s) verbatim from source`
      );
    }
    return verbatim.content;
  }

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
      translatedContent = await this.updateTranslation(
        file,
        file.targetContent || '',
        glossary,
        result,
        fileRebaseCache
      );
    }

    // Structural parity — the single honest guard on this path (#165: the
    // former validateMyST gate could never fail; parseSections has no throw
    // path, so it read as protection and was not): directive shapes and
    // target anchors must survive
    // translation verbatim (#119, #65). Failing the file loudly here is the
    // point — every defect in this class previously shipped as a success and
    // surfaced weeks later on a downstream strict build. The front-matter rule
    // runs with it (#288): one front-matter block, keeping jupytext/kernelspec.
    translatedContent = this.restoreVerbatimDirectives(file, translatedContent);
    const parity = checkWrittenDocument(file.newContent, translatedContent);
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
   * Update an existing translation. A document with a `# title` is updated
   * section by section, which keeps every unchanged section's translation as
   * it is. One without, such as an included fragment (`_admonition/gpu.md`),
   * cannot be split into sections, and the section-based update used to fail
   * it with "Document must have a # title heading", in every edition holding
   * the file. It is updated whole instead, from the current source and the
   * existing translation: an update of a file the edition has, not a first
   * translation (#449). So is a file whose old English or edition copy has no
   * title, which the section-based update cannot split either.
   *
   * On that whole-file route, two cases need no model call. An edition copy
   * that is the English itself (lecture-python-programming.fa keeps an English
   * `gpu.md`) takes the new English: translating it here would be the first
   * translation D2 rules out. And in a rebase, an edition copy unchanged since
   * the PR's base keeps the PR's translation, as an unchanged section does.
   */
  private async updateTranslation(
    file: FileToSync,
    targetContent: string,
    glossary: Glossary | undefined,
    result: SyncProcessingResult,
    fileRebaseCache?: import('./types.js').RebaseCacheData
  ): Promise<string> {
    const newContent = file.newContent || '';
    const oldContent = file.oldContent || '';
    const newTitled = await this.parser.hasTitle(newContent, file.filename);
    const oldTitled = oldContent === '' || (await this.parser.hasTitle(oldContent, file.filename));
    const targetTitled = await this.parser.hasTitle(targetContent, file.filename);
    if (!newTitled || !oldTitled || !targetTitled) {
      if (!newTitled && ((oldContent !== '' && oldTitled) || targetTitled)) {
        // A lecture whose `# title` went missing in this PR, perhaps by an
        // editing slip, loses the per-section update: say so where it is seen.
        this.logger.warning(
          `${file.filename}: the new English has no # title, though the old English or the ` +
            "edition's copy has one, " +
            'so the whole file is updated rather than section by section; check the title'
        );
      } else {
        this.logger.info(
          `${file.filename} has no # title, so it is updated whole rather than section by section`
        );
      }
      if (targetContent.trim() === '') {
        // Updating an empty copy would translate the file from scratch.
        throw new Error(
          `${file.filename}: the edition's copy is empty, so there is no translation to update`
        );
      }
      if (targetContent === oldContent || targetContent === newContent) {
        this.logger.warning(
          `${file.filename}: the edition's copy is the English, so it takes the new English ` +
            'unchanged; sync does not translate it'
        );
        return newContent;
      }
      if (fileRebaseCache && fileRebaseCache.oldTargetContent === targetContent) {
        this.logger.info(
          `${file.filename}: the edition's copy is unchanged since this PR's base, so the PR's ` +
            'translation is kept'
        );
        return fileRebaseCache.previousTranslation;
      }
      return this.processor.processWholeFile(
        newContent,
        targetContent,
        file.filename,
        this.config.sourceLanguage,
        this.config.targetLanguage,
        glossary
      );
    }

    const skipped: string[] = [];
    const dropped: string[] = [];
    const translatedContent = await this.processor.processSectionBased(
      file.oldContent || '',
      newContent,
      targetContent,
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
    return translatedContent;
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

    // The old path is read as the lecture's translation and then deleted, so
    // it must be a lecture of this edition. Both builders already turn a
    // rename from outside the docs folder into an addition; this holds the
    // rule for any caller that does not (#307).
    if (
      file.previousFilename &&
      this.stateConfig &&
      !isDocsMarkdownPath(file.previousFilename, this.stateConfig.docsFolder)
    ) {
      throw new Error(
        `${file.filename}: renamed from ${file.previousFilename}, which is not a markdown file ` +
          `in the docs folder, so it was not read as this lecture's translation or deleted`
      );
    }

    if (!file.newContent) {
      throw new Error(`No content provided for ${file.filename}`);
    }

    let translatedContent: string;
    if (file.targetContent) {
      // Existing translation — update it
      translatedContent = await this.updateTranslation(
        file,
        file.targetContent,
        glossary,
        result,
        fileRebaseCache
      );
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

    // Structural parity and the front-matter rule — the same guard as
    // processMarkdownFile (#119, #65, #288; the dead validateMyST gate was
    // deleted in #165).
    translatedContent = this.restoreVerbatimDirectives(file, translatedContent);
    const parity = checkWrittenDocument(file.newContent, translatedContent);
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
    let movedState: string | undefined;
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
          // The state file moves with the lecture: the new one keeps the old
          // one's keys the engine does not own, unless the new path already
          // has a state file of its own (#290).
          const oldRead = this.stateConfig.existingStates?.get(oldStatePath);
          if (oldRead?.status === 'found') movedState = oldRead.content;
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
        result,
        movedState
      );
    }
  }

  /**
   * Process a TOC file: the source is mirrored, with the target's localised
   * part captions carried forward (#254; see `toc-captions.ts`).  No target
   * content means a first delivery, which takes the source verbatim.
   */
  private processTocFile(file: FileToSync, result: SyncProcessingResult): void {
    this.logger.info(`Processing TOC file ${file.filename}...`);

    if (!file.newContent) {
      throw new Error(`No content provided for ${file.filename}`);
    }

    let content = file.newContent;
    if (file.targetContent) {
      content = mergeTargetCaptions(file.newContent, file.targetContent, this.logger);
    }

    result.processedFiles.push(file.filename);
    result.translatedFiles.push({
      path: file.filename,
      content,
      sha: file.existingFileSha,
    });

    this.logger.info(`Successfully processed ${file.filename}`);
  }

  /**
   * After all per-file processing, drop TOC entries that reference new files
   * this run did not deliver (#156).
   *
   * A new file that errored is absent from the target repo — its TOC entry
   * would create a dangling reference that breaks the target build under
   * `-n -W` and corrupts cross-references in every sibling lecture that cites
   * it.  Only new files are candidates: if a file already existed in the
   * target, its entry belongs in the TOC regardless of whether this run's
   * update succeeded.
   *
   * Two ways a new file fails to arrive: translation errored inside this loop
   * (the file is in `files`, `isNewFile`, and not in `processedFiles`), or its
   * source content could not be fetched, in which case the caller never built
   * a `FileToSync` for it and passes it in as `fetchFailedNewFiles` instead.
   * Both must leave the TOC, or the build breaks either way.
   */
  private filterTocForFailedNewFiles(
    files: FileToSync[],
    result: SyncProcessingResult,
    fetchFailedNewFiles: string[]
  ): void {
    if (result.errors.length === 0 && fetchFailedNewFiles.length === 0) return;

    const processedSet = new Set(result.processedFiles);

    const failedNewFiles = files
      .filter(
        (f) =>
          (f.type === 'markdown' || f.type === 'renamed') &&
          f.isNewFile &&
          !processedSet.has(f.filename)
      )
      .map((f) => f.filename);
    for (const filename of fetchFailedNewFiles) {
      if (!failedNewFiles.includes(filename)) failedNewFiles.push(filename);
    }

    if (failedNewFiles.length === 0) return;

    result.failedNewFiles = failedNewFiles;
    result.filteredTocPaths = [];

    for (const translated of result.translatedFiles) {
      if (path.basename(translated.path) !== '_toc.yml') continue;

      const tocDir = path.dirname(translated.path);

      // Convert full filenames to TOC-relative stems (no .md extension)
      const entriesToDrop = new Set(
        failedNewFiles.map((filename) => {
          const rel = tocDir === '.' ? filename : path.relative(tocDir, filename);
          return rel.replace(/\.md$/, '');
        })
      );

      const before = translated.content;
      const filtered = removeTocFileEntries(before, entriesToDrop);

      if (filtered !== before) {
        translated.content = filtered;
        result.filteredTocPaths.push(translated.path);
        const names = failedNewFiles.map((f) => path.basename(f, '.md')).join(', ');
        this.logger.warning(
          `${translated.path}: removed ${names} from TOC — file(s) were not delivered and are absent from the target`
        );
      }
    }
  }

  /**
   * Process a removed file (track for deletion in target repo). Its state
   * file goes with it, and goes alone when the target no longer has the file:
   * a state file left behind claims a translation the target lacks (#396).
   */
  private processRemovedFile(file: FileToSync, result: SyncProcessingResult): void {
    let deleted = false;
    if (file.existingFileSha) {
      result.filesToDelete.push({
        path: file.filename,
        sha: file.existingFileSha,
      });
      deleted = true;
      this.logger.info(`Marked ${file.filename} for deletion`);
    } else {
      this.logger.info(`${file.filename} does not exist in target repo - skipping its deletion`);
    }

    if (this.stateConfig) {
      const docsRelName = this.toDocsRelative(file.filename);
      const statePath = stateFileRelativePath(docsRelName);
      const stateSha = this.stateConfig.existingStateShas.get(statePath);
      if (stateSha) {
        result.filesToDelete.push({ path: statePath, sha: stateSha });
        deleted = true;
        this.logger.info(`Marked state file for deletion: ${statePath}`);
      }
    }

    if (deleted) result.processedFiles.push(file.filename);
  }

  // ---------------------------------------------------------------------------
  // Private: State file generation
  // ---------------------------------------------------------------------------

  /**
   * Generate a .translate/state/ file for a processed markdown file.
   * Only generates when stateConfig is provided (opt-in).
   *
   * Written over the existing state file the run read, keeping that file's
   * keys the engine does not own (#290); for a rename with no state file at
   * its new path, over the old path's (`movedState`). One whose read failed
   * is not written, so the file in the edition stays as it is: the caller
   * holds such a lecture back before it gets here.
   */
  private async maybeGenerateStateFile(
    filename: string,
    sourceContent: string,
    perFileCommitSha: string | undefined,
    mode: 'NEW' | 'UPDATE',
    result: SyncProcessingResult,
    movedState?: string
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

      // Only a 404 means there is no state file to keep keys from: a failed
      // read is not written over (D-2026-11-15-only-a-404-means-absent).
      const read = this.stateConfig.existingStates?.get(statePath);
      if (read?.status === 'error') {
        this.logger.warning(
          `Not writing ${statePath}: it could not be read (${read.message}), so the keys it ` +
            'holds besides the ones sync writes could not be kept'
        );
        return;
      }
      const existing = read?.status === 'found' ? read.content : movedState;
      const merged = mergeFileState(existing, state, statePath);
      if (merged.warning) this.logger.warning(merged.warning);
      if (merged.overwritten) (result.overwrittenStateFiles ??= []).push(statePath);

      result.translatedFiles.push({
        path: statePath,
        content: merged.content,
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

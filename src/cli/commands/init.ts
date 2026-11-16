/**
 * Init Command — Bulk-translate a new project
 *
 * One-time bulk translation of an entire lecture series from a local source repo.
 * Takes its lectures from the source's lecture set (#449): the documents
 * _toc.yml lists, then the .md files they include, such as
 * `_admonition/gpu.md`. Translates each lecture sequentially, generates
 * heading-maps, and produces a translation report.
 *
 * Adapted from tool-bulk-translator with local-path approach (no Octokit).
 *
 * Supports:
 * - Full translation: `npx translate init -s /path/to/source -t /path/to/target --target-language zh-cn`
 * - Dry run:          `npx translate init -s /path/to/source -t /path/to/target --target-language zh-cn --dry-run`
 * - Resume:           `npx translate init ... --resume-from cobweb.md`
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import { VERSION as SDK_VERSION } from '@anthropic-ai/sdk/version';
import { TranslationService } from '../../translator.js';
import { MystParser } from '../../parser.js';
import { Glossary } from '../../types.js';
import { TranslateConfig } from '../types.js';
import { updateHeadingMap, injectHeadingMap } from '../../heading-map.js';
import { applyTypography } from '../../typography.js';
import { formatParityViolations } from '../../structural-parity.js';
import { checkWrittenDocument, restoreHead } from '../../whole-document.js';
import { applyVerbatimDirectives } from '../../verbatim-directives.js';
import { RuleId, buildLocalizationPrompt, getFontRequirements } from '../../localization-rules.js';
import { maxTokensFor, requestPolicyFor } from '../../models.js';
import { costUSD } from '../../model-pricing.js';
import { ensureTrailingNewline } from './forward.js';
import {
  getToolVersion,
  inspectFileState,
  stateFileRelativePath,
  writeConfig,
  writeFileState,
} from '../translate-state.js';
import { getFileGitMetadata } from '../git-metadata.js';
import { loadGlossary } from '../glossary-loader.js';
import { LectureSet } from '../../lecture-set.js';
import { readRepoLectures } from '../lecture-discovery.js';
import {
  INIT_REPORT_SCHEMA,
  InitRunReport,
  LectureReport,
  StateWriteError,
  StructuralParityError,
  classifyFailure,
  formatFailureLine,
  usageSince,
  writeRunReport,
} from '../run-report.js';

// ============================================================================
// TYPES
// ============================================================================

export interface InitOptions {
  source: string; // Source repository path (local)
  target: string; // Target folder path (local)
  targetLanguage: string; // Target language code (e.g., "zh-cn")
  sourceLanguage: string; // Source language code (default: "en")
  docsFolder: string; // Documentation folder within repos (default: "lectures")
  model: string; // Claude model (default: DEFAULT_CLAUDE_MODEL - see src/models.ts)
  batchDelay: number; // Delay between lectures in ms (default: 1000)
  parallel: number; // Number of parallel translations (default: 1)
  file?: string; // Single file to translate (for testing)
  resumeFrom?: string; // Resume from specific lecture file
  skipExisting?: boolean; // Skip lectures that already have .translate/state entries
  glossaryPath?: string; // Explicit path to glossary JSON file
  builtInGlossaryDir?: string; // Packaged glossary directory (<package-root>/glossary)
  localize: RuleId[]; // Active localization rules (default: all)
  dryRun: boolean; // Preview without API calls or file writes
  apiKey: string; // Anthropic API key
  reportJson?: string; // Also write a machine-readable run report (JSON) here
}

interface TranslationStats {
  totalLectures: number;
  successCount: number;
  skippedCount: number;
  failureCount: number;
  totalTokens: number;
  totalTimeMs: number;
  failures: Array<{ file: string; error: string }>;
}

// ============================================================================
// THE LECTURE SET
// ============================================================================

/** `n` and the noun for it, singular or plural. */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The lines a bulk run prints about the ToC entries it does not translate
 * (#449): an entry with no `.md` behind it, such as a `root: index` the
 * folder has no `index.md` for, and an entry backed by a file that is not
 * Markdown, such as a notebook, which the run copies as it is with the other
 * non-Markdown files. Empty when the ToC has neither.
 */
export function describeUntranslatedEntries(set: LectureSet): string[] {
  const lines: string[] = [];
  const entries = (n: number) => count(n, `${set.toc} entry`, `${set.toc} entries`);
  const missing = set.missingEntries;
  if (missing.length > 0) {
    lines.push(
      `⚠ Not translated: ${entries(missing.length)} with no .md file behind ` +
        `${missing.length === 1 ? 'it' : 'them'}: ${missing.join(', ')}`
    );
  }
  const other = set.otherDocuments;
  if (other.length > 0) {
    lines.push(
      `ℹ Not translated: ${entries(other.length)} backed by a file that is not Markdown, ` +
        `copied with the other non-Markdown files: ${other.join(', ')}`
    );
  }
  return lines;
}

/** A ToC entry or a file without its source suffix, as the ToC names it. */
const tocStem = (file: string) => file.replace(/\.(md|ipynb|rst|Rmd|myst)$/, '');

/**
 * Why `init -f <file>` refuses a file: it is not in the source's lecture set,
 * neither a document the ToC lists nor a file one of them includes (#449).
 * When the ToC does list the name, it says what is behind the entry instead:
 * no file, which is a lecture not written yet rather than a mistyped name, or
 * a file that is not Markdown, which the run copies and does not translate.
 */
function notInLectureSet(file: string, set: LectureSet, lectures: string[]): string {
  const stem = tocStem(file);
  const missing = set.missingEntries.find((entry) => tocStem(entry) === stem);
  const other = set.otherDocuments.find((doc) => tocStem(doc) === stem);
  const why = missing
    ? `${set.toc} lists ${missing}, but the docs folder has no ${stem}.md.`
    : other
      ? `${set.toc} lists ${stem}, backed by ${other}, which is not Markdown: a run copies it ` +
        'with the other non-Markdown files and does not translate it.'
      : `${set.toc} does not list it, and no lecture it lists includes it.`;
  return (
    `${file} is not in the source's lecture set: ${why}\n` +
    `Available lectures: ${lectures.slice(0, 5).join(', ')}${lectures.length > 5 ? ', ...' : ''}`
  );
}

/**
 * The lecture `init -f <file>` names (#449): the one at that path; else the
 * one with that file name, in any folder; else the one whose path contains
 * the name. A name that matches more than one lecture at the first step that
 * matches any is refused, naming them, rather than translating the first:
 * `-f topic` must not pick `a/topic.md` over `b/topic.md` unseen.
 */
export function findInitLecture(file: string, set: LectureSet, lectures: string[]): string {
  const target = file.endsWith('.md') ? file : `${file}.md`;
  const steps = [
    lectures.filter((l) => l === target),
    lectures.filter((l) => path.posix.basename(l) === target),
    lectures.filter((l) => l.includes(file)),
  ];
  const matches = steps.find((found) => found.length > 0);
  if (!matches) throw new Error(notInLectureSet(file, set, lectures));
  if (matches.length > 1) {
    throw new Error(
      `${file} names ${matches.length} lectures: ${matches.join(', ')}. Name one by its path ` +
        'in the docs folder.'
    );
  }
  return matches[0];
}

// ============================================================================
// FILE COPY (NON-MARKDOWN)
// ============================================================================

/**
 * `--skip-existing`: leave out the lectures the edition already has.
 *
 * A lecture is skipped when its translation is in the edition, whatever its
 * state file says (#379). The filter used to skip only on a state file the
 * reader accepted, so a lecture whose state file was hand-written with one
 * mistyped key, or that had no state file at all, was translated again over
 * the edition's reviewed text. Each case that needs the operator is returned
 * as a warning:
 *
 * - the lecture and a state file that does not validate: skipped; the warning
 *   names the key, since `status` and `doctor` cannot use the file either;
 * - the lecture with no state file: skipped, never overwritten;
 * - a state file with no lecture beside it: translated, since there is nothing
 *   to protect, and a stale state file would otherwise hide a lecture the
 *   source added back.
 */
export function filterSkipExisting(
  edition: EditionFlags,
  lectures: string[]
): { remaining: string[]; skipped: string[]; skippedCount: number; warnings: string[] } {
  const { target: targetPath, docsFolder } = edition;
  const remaining: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];
  for (const lecture of lectures) {
    const state = inspectFileState(targetPath, lecture);
    const lectureExists = fs.existsSync(path.join(targetPath, docsFolder, lecture));
    const statePath = stateFileRelativePath(lecture);

    if (!lectureExists) {
      if (state.status !== 'missing') {
        warnings.push(
          `${lecture}: ${statePath} exists but the edition has no ${lecture}, so it is ` +
            `translated and the state file replaced. If the translation was removed by ` +
            `mistake, restore it from git instead and run \`translate forward -f ${lecture}\`.`
        );
      }
      remaining.push(lecture);
      continue;
    }

    skipped.push(lecture);
    if (state.status === 'missing') {
      warnings.push(
        `${lecture}: skipped. The edition has this lecture but no ${statePath}, and ` +
          `--skip-existing does not overwrite a translation. Record its state with ` +
          `\`${writeStateCommand(edition, lecture)}\`; to translate it again, ` +
          `run without --skip-existing.`
      );
    } else if (state.status === 'invalid') {
      warnings.push(
        `${lecture}: skipped, but ${statePath} cannot be used: ${state.reason}. ` +
          `Until it is repaired, \`status\` and \`doctor\` cannot read this lecture's sync point.`
      );
    }
  }
  return { remaining, skipped, skippedCount: skipped.length, warnings };
}

/** The flags that name an edition, for a command printed to the operator. */
export type EditionFlags = Pick<
  InitOptions,
  'source' | 'target' | 'targetLanguage' | 'sourceLanguage' | 'docsFolder'
>;

/** `value`, quoted for a POSIX shell when it needs to be. */
function shellArg(value: string): string {
  return /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * The `translate status --write-state` run that records one lecture's state
 * file, with the edition's own flags. `status` reads no config: its language
 * and docs folder come from its flags, which default to `zh-cn` and
 * `lectures`, and `--write-state` rewrites `.translate/config.yml` from them,
 * so a bare `status -f <file> --write-state` resets an `fa` edition's config
 * to `zh-cn`. The paths are absolute, so the command runs from any folder.
 */
export function writeStateCommand(edition: EditionFlags, lecture: string): string {
  const sourceLanguage =
    edition.sourceLanguage === 'en' ? '' : ` --source-language ${shellArg(edition.sourceLanguage)}`;
  return (
    `translate status -s ${shellArg(path.resolve(edition.source))} ` +
    `-t ${shellArg(path.resolve(edition.target))} ` +
    `-l ${shellArg(edition.targetLanguage)}${sourceLanguage} -d ${shellArg(edition.docsFolder)} ` +
    `-f ${shellArg(lecture)} --write-state`
  );
}

/**
 * The non-.md files in the source docs folder (`_config.yml`, `_toc.yml`,
 * images, CSS, data files), relative to it, split by whether the edition
 * already has something at the same path (#134). The dry run counts the same
 * split that the real run copies.
 */
export function planNonMarkdownCopy(
  sourceRepoPath: string,
  targetPath: string,
  docsFolder: string
): { copy: string[]; keep: string[] } {
  const plan = { copy: [] as string[], keep: [] as string[] };
  const sourceDocsDir = path.join(sourceRepoPath, docsFolder);
  if (!fs.existsSync(sourceDocsDir)) return plan;

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(sourceDocsDir, fullPath);

      if (entry.name.startsWith('.git')) continue;
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (!entry.name.endsWith('.md')) {
        const targetFilePath = path.join(targetPath, docsFolder, relativePath);
        (pathExists(targetFilePath) ? plan.keep : plan.copy).push(relativePath);
      }
    }
  }

  walk(sourceDocsDir);
  return plan;
}

/** Whether anything is at `p`, a dangling symlink included. */
function pathExists(p: string): boolean {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copy the source docs folder's non-.md files that the edition does not have
 * (#134). A file the edition already has is never overwritten: in an
 * existing edition it is usually localised (a translated `_toc.yml` caption,
 * a `_config.yml` title, a figure with translated labels), and an `init -f`
 * round used to replace each with the English copy.
 */
export function copyNonMarkdownFiles(
  sourceRepoPath: string,
  targetPath: string,
  docsFolder: string
): { copied: number; kept: number } {
  const plan = planNonMarkdownCopy(sourceRepoPath, targetPath, docsFolder);
  for (const relativePath of plan.copy) {
    const targetFilePath = path.join(targetPath, docsFolder, relativePath);
    fs.mkdirSync(path.dirname(targetFilePath), { recursive: true });
    fs.copyFileSync(path.join(sourceRepoPath, docsFolder, relativePath), targetFilePath);
  }
  return { copied: plan.copy.length, kept: plan.keep.length };
}

const CONFIG_FLAGS: ReadonlyArray<[keyof TranslateConfig & string, string]> = [
  ['source-language', '--source-language'],
  ['target-language', '--target-language'],
  ['docs-folder', '-d'],
];

/** `lectures`, `lectures/` and `./lectures` name one folder; so do `.` and ``. */
function normalizeDocsFolder(folder: string): string {
  return path.posix.normalize(folder.replace(/\\/g, '/')).replace(/(.)\/+$/, '$1');
}

/**
 * Hold the run to the edition's `.translate/config.yml` (#134). `init` used to
 * rewrite it from its flags on every run, so an `init -f` round into an
 * existing edition reset any core key the flags did not match and dropped the
 * file's comments. Now an absent config is written; one whose three core keys
 * match the flags is left byte for byte; and one that differs refuses the run
 * before any model call, naming each key with both values, since only the
 * operator knows whether the flags or the config are wrong.
 */
export function checkEditionConfig(
  targetPath: string,
  wanted: TranslateConfig
): 'absent' | 'matches' {
  const configPath = path.join(targetPath, '.translate', 'config.yml');
  if (!pathExists(configPath)) return 'absent';
  // A dangling link is not an absent config: writing one would go through it.
  if (!fs.existsSync(configPath)) {
    throw new Error(`${configPath} is a symbolic link to nothing: fix or remove it, then re-run.`);
  }

  let parsed: unknown;
  try {
    parsed = yaml.load(fs.readFileSync(configPath, 'utf-8'), { schema: yaml.CORE_SCHEMA });
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    throw new Error(`${configPath} is not valid YAML (${message}): fix or remove it, then re-run.`);
  }
  // An empty or comment-only file is a document with no keys, as `writeConfig` reads it.
  if (parsed === undefined || parsed === null) parsed = {};
  // A plain mapping, as `writeConfig` requires: a typed scalar such as
  // `!!binary` loads as an object, but has no keys to compare.
  const proto = Object.getPrototypeOf(parsed);
  if (
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    (proto !== Object.prototype && proto !== null)
  ) {
    throw new Error(`${configPath} is not a YAML mapping: fix or remove it, then re-run.`);
  }

  const config = parsed as Record<string, unknown>;
  const mismatches: string[] = [];
  for (const [key, flag] of CONFIG_FLAGS) {
    const have = config[key];
    const same =
      typeof have === 'string' &&
      (key === 'docs-folder'
        ? normalizeDocsFolder(have) === normalizeDocsFolder(wanted[key])
        : have === wanted[key]);
    if (!same) {
      const shown = have === undefined ? 'no value' : JSON.stringify(have);
      mismatches.push(
        `  ${key}: the config has ${shown}, and this run's ${flag} is "${wanted[key]}"`
      );
    }
  }
  if (mismatches.length > 0) {
    throw new Error(
      `${configPath} does not match this run's flags, so nothing was translated or written:\n` +
        mismatches.join('\n') +
        `\n\nPass the values the edition's config names, or correct the config if it is wrong.`
    );
  }
  return 'matches';
}

// ============================================================================
// HEADING-MAP GENERATION
// ============================================================================

/**
 * Generate heading-map and extract title by parsing source and translated sections.
 * Uses updateHeadingMap() for correct path-based keys (Parent::Child).
 */
async function generateHeadingMap(
  sourceContent: string,
  translatedContent: string
): Promise<{ map: Map<string, string>; title?: string }> {
  const parser = new MystParser();
  const sourceParsed = await parser.parseSections(sourceContent, 'temp.md');
  const translatedParsed = await parser.parseSections(translatedContent, 'temp.md');

  const map = updateHeadingMap(new Map(), sourceParsed.sections, translatedParsed.sections);

  // Extract translated title
  let title: string | undefined;
  try {
    const targetComponents = await parser.parseDocumentComponents(translatedContent, 'temp.md');
    title = targetComponents.titleText;
  } catch {
    // No title found
  }

  return { map, title };
}

// ============================================================================
// SINGLE LECTURE TRANSLATION
// ============================================================================

/**
 * Translate a single lecture file with retry logic.
 * Returns tokens used, or throws on permanent failure.
 * Exported for tests; the CLI path goes through runInit.
 */
export async function translateLecture(
  lectureFile: string,
  sourceRepoPath: string,
  targetPath: string,
  docsFolder: string,
  translator: TranslationService,
  options: InitOptions,
  glossary: Glossary | undefined
): Promise<{ tokensUsed: number; elapsedMs: number; outputChars: number; headRestored: boolean }> {
  const startTime = Date.now();

  // Validate lecture path doesn't escape docs folder (path traversal protection)
  const sourceBaseDir = path.resolve(sourceRepoPath, docsFolder);
  const sourceFilePath = path.resolve(sourceRepoPath, docsFolder, lectureFile);
  if (!sourceFilePath.startsWith(sourceBaseDir + path.sep) && sourceFilePath !== sourceBaseDir) {
    throw new Error(`Invalid lecture path (path traversal detected): ${lectureFile}`);
  }
  if (!fs.existsSync(sourceFilePath)) {
    throw new Error(`Source file not found: ${sourceFilePath}`);
  }

  const sourceContent = fs.readFileSync(sourceFilePath, 'utf-8');

  // Build localization prompt from active rules
  const customInstructions = buildLocalizationPrompt(options.localize, options.targetLanguage);

  // TranslationService.callWithRetry() handles retries internally (3 attempts, exponential backoff)
  const result = await translator.translateFullDocument({
    content: sourceContent,
    sourceLanguage: options.sourceLanguage,
    targetLanguage: options.targetLanguage,
    glossary,
    customInstructions: customInstructions || undefined,
  });

  if (!result.success || !result.translatedSection) {
    throw new Error(result.error || 'Translation failed');
  }

  // Apply deterministic typography before anything derives from the text, so the
  // heading map is built from the same strings that land in the body.
  const typeset = applyTypography(result.translatedSection, options.targetLanguage);

  // The head region is the source's, byte for byte: its front matter and the
  // pre-title lines above the H1 (#326). After typography, so that nothing
  // rewrites them; before the heading map, which goes into this front matter.
  const head = restoreHead(typeset, sourceContent);
  if (head?.replaced) {
    console.warn(
      `  ${lectureFile}: kept the source's front matter and pre-title in place of the ` +
        `model's lines above the title (#326)`
    );
  }
  const translatedContent = head ? head.text : typeset;

  // Generate heading-map
  const { map: headingMap, title: translatedTitle } = await generateHeadingMap(
    sourceContent,
    translatedContent
  );

  // Inject translation metadata into frontmatter, then terminate the document
  // with a newline — the translator trims the model's response and neither
  // typography nor heading-map injection restores the terminator, so every
  // seeded file was written with `\ No newline at end of file` (forward's #116,
  // same defect on this writer). Applied before the parity guard so the guard
  // checks the exact bytes that get written, same as forward's finalize path.
  // Verbatim-directive policy (ml): exercise-family blocks are restored from
  // the source after translation and before the parity guard, so the guard
  // checks the bytes that get written.
  const verbatim = applyVerbatimDirectives(
    sourceContent,
    ensureTrailingNewline(injectHeadingMap(translatedContent, headingMap, translatedTitle)),
    options.targetLanguage
  );
  if (verbatim.mismatch) {
    console.warn(`  ${lectureFile}: ${verbatim.mismatch}; verbatim restore skipped`);
  }
  const finalContent = verbatim.content;

  // Structural parity: directive shapes and target anchors must survive
  // translation verbatim, same as the sync and forward write paths. init
  // seeds whole editions — corruption here becomes the baseline the sync
  // guard compares forward from, so it can never be re-examined. Checks the
  // exact bytes that would be written; failing the file loudly is the point.
  // The front-matter rule runs with it (#288).
  const parity = checkWrittenDocument(sourceContent, finalContent);
  if (!parity.ok) {
    throw new StructuralParityError(formatParityViolations(lectureFile, parity));
  }

  // Write to target folder
  const targetBaseDir = path.resolve(targetPath, docsFolder);
  const targetFilePath = path.resolve(targetPath, docsFolder, lectureFile);
  if (!targetFilePath.startsWith(targetBaseDir + path.sep) && targetFilePath !== targetBaseDir) {
    throw new Error(`Invalid target path (path traversal detected): ${lectureFile}`);
  }
  fs.mkdirSync(path.dirname(targetFilePath), { recursive: true });
  fs.writeFileSync(targetFilePath, finalContent, 'utf-8');

  const elapsedMs = Date.now() - startTime;
  return {
    tokensUsed: result.tokensUsed || 0,
    elapsedMs,
    outputChars: finalContent.length,
    headRestored: head?.replaced ?? false,
  };
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateReport(
  targetPath: string,
  options: InitOptions,
  stats: TranslationStats,
  glossaryTermCount: number
): void {
  const avgTimePerLecture = stats.successCount > 0 ? stats.totalTimeMs / stats.successCount : 0;

  let report = `# Translation Report

**Generated**: ${new Date().toISOString()}

## Summary

- **Total Lectures**: ${stats.totalLectures}
- **Successfully Translated**: ${stats.successCount}${stats.skippedCount > 0 ? `\n- **Skipped (already translated)**: ${stats.skippedCount}` : ''}
- **Failed**: ${stats.failureCount}
- **Total Tokens Used**: ${stats.totalTokens.toLocaleString()}
- **Total Time**: ${(stats.totalTimeMs / 1000 / 60).toFixed(1)} minutes
- **Average Time per Lecture**: ${(avgTimePerLecture / 1000).toFixed(1)} seconds

## Configuration

- **Source**: ${options.source}
- **Target**: ${options.target}
- **Source Language**: ${options.sourceLanguage}
- **Target Language**: ${options.targetLanguage}
- **Model**: ${options.model}
- **Localization Rules**: ${options.localize.length > 0 ? options.localize.join(', ') : 'none'}
- **Glossary Terms**: ${glossaryTermCount}
`;

  if (stats.failures.length > 0) {
    report += `\n## Failures\n\n`;
    for (const failure of stats.failures) {
      report += `- **${failure.file}**: ${failure.error}\n`;
    }
  }

  report += `\n## Next Steps

1. Review translated lectures in \`${options.target}\`
2. Set up repo-level files if not already present:
   - \`.github/workflows/\` — CI/CD and \`action-translation\` sync workflow
   - \`environment.yml\` or \`requirements.txt\` — Python dependencies
   - \`LICENSE\`
3. Build to verify: \`jupyter-book build ${options.target}\`
4. Push to GitHub repository
5. Configure \`action-translation\` for incremental updates

---

Generated by \`translate init\`
`;

  const reportPath = path.join(targetPath, 'TRANSLATION-REPORT.md');
  fs.writeFileSync(reportPath, report, 'utf-8');
}

/**
 * The machine-readable record of a run (`--report-json`). Its usage is the
 * translator's own total: every call that returned a final message, refused,
 * truncated and parity-failed ones included. An attempt that threw before its
 * final message, every retried one among them, returns no usage; `retries`
 * counts the retried ones. The Markdown report's token figure sums only the
 * final responses of the lectures that succeeded (#356).
 */
function buildRunReport(
  options: InitOptions,
  startedAt: Date,
  translator: TranslationService,
  stats: TranslationStats,
  lectures: LectureReport[],
  glossaryTermCount: number
): InitRunReport {
  const usage = translator.getUsage();
  const policy = requestPolicyFor(options.model);
  const finishedAt = new Date();
  return {
    schema: INIT_REPORT_SCHEMA,
    toolVersion: getToolVersion(),
    sdkVersion: SDK_VERSION,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    elapsedMs: finishedAt.getTime() - startedAt.getTime(),
    model: options.model,
    requestPolicy: {
      label: policy.label,
      thinking: policy.thinking ?? null,
      effort: policy.effort ?? null,
      alwaysThinks: policy.alwaysThinks,
    },
    maxTokens: { fullDocument: maxTokensFor(options.model, 'fullDocument') },
    sourceLanguage: options.sourceLanguage,
    targetLanguage: options.targetLanguage,
    localize: [...options.localize],
    glossaryTerms: glossaryTermCount,
    parallel: options.parallel,
    usage,
    costUSD: costUSD(options.model, usage),
    servedModels: translator.getServedModels(),
    retries: translator.getRetryCount(),
    fenceUnwraps: translator.getFenceUnwrapCount(),
    headRestores: lectures.filter((lecture) => lecture.headRestored).length,
    summary: {
      total: lectures.length + stats.skippedCount,
      ok: stats.successCount,
      failed: stats.failureCount,
      skipped: stats.skippedCount,
    },
    lectures,
  };
}

// ============================================================================
// MAIN COMMAND
// ============================================================================

/**
 * Run the init command — bulk translate all lectures in a project.
 */
export async function runInit(options: InitOptions): Promise<TranslationStats> {
  const startedAt = new Date();
  if (options.dryRun) {
    console.log(chalk.bold.yellow('\n🔍 DRY RUN — No changes will be made\n'));
  } else {
    console.log(chalk.bold.cyan('\n🌍 Bulk Translation\n'));
  }

  console.log(chalk.gray(`Source:   ${options.source}`));
  console.log(chalk.gray(`Target:   ${options.target}`));
  console.log(chalk.gray(`Language: ${options.sourceLanguage} → ${options.targetLanguage}`));
  console.log(chalk.gray(`Model:    ${options.model}`));
  if (options.parallel > 1) {
    console.log(chalk.gray(`Parallel: ${options.parallel} concurrent`));
  }
  if (options.localize.length > 0) {
    console.log(chalk.gray(`Localize: ${options.localize.join(', ')}`));
  }

  // Phase 1: Load glossary — reported either way, so a run without terminology
  // enforcement never looks like a run with it (#149).
  const glossary = loadGlossary(
    options.targetLanguage,
    {
      customPath: options.glossaryPath,
      builtInDir: options.builtInGlossaryDir,
    },
    {
      info: (msg) => console.log(chalk.green(msg)),
      warn: (msg) => console.log(chalk.yellow(`⚠️  ${msg}`)),
    }
  );
  const termCount = glossary?.terms?.length ?? 0;

  // Phase 2: The source's lecture set (#449): the ToC's documents, then the
  // files they include. No usable ToC stops the run here, before any model call.
  const sourceLectures = await readRepoLectures(options.source, options.docsFolder, 'SOURCE');
  const { set } = sourceLectures;
  let lectures = sourceLectures.lectures;

  const stats: TranslationStats = {
    totalLectures: lectures.length,
    successCount: 0,
    skippedCount: 0,
    failureCount: 0,
    totalTokens: 0,
    totalTimeMs: 0,
    failures: [],
  };

  // Filter to single file if specified
  if (options.file) {
    // An exact match wins over an entry that merely contains the name: `-f
    // intro.md` must not translate a `jax_intro.md` listed before it.
    const found = findInitLecture(options.file, set, lectures);
    lectures = [found];
    stats.totalLectures = 1;
    console.log(chalk.bold(`Translating single file: ${found}\n`));
  } else {
    const included = set.fragments.length;
    console.log(
      chalk.bold(
        `\nFound ${lectures.length} lectures` +
          (included > 0
            ? `: ${set.documents.length} in ${set.toc}, and ${count(included, 'file', 'files')} they include`
            : ` in ${set.toc}`)
      )
    );
    for (const line of describeUntranslatedEntries(set)) {
      console.log(chalk.yellow(line));
    }
    console.log('');
  }

  // Checked before the dry run returns, so a preview refuses as the run would.
  const editionConfig: TranslateConfig = {
    'source-language': options.sourceLanguage,
    'target-language': options.targetLanguage,
    'docs-folder': options.docsFolder,
  };
  const configState = checkEditionConfig(options.target, editionConfig);

  if (options.dryRun) {
    // The preview applies --skip-existing as the real run does, so its list
    // is the real run's list (#379).
    const skip = options.skipExisting ? filterSkipExisting(options, lectures) : undefined;
    const skippedSet = new Set(skip?.skipped ?? []);
    // Every lecture in the set has its file: a ToC entry without one is
    // reported above, not listed here (#449).
    console.log(chalk.yellow('Would translate the following lectures:'));
    lectures.forEach((lecture, index) => {
      const marker = skippedSet.has(lecture)
        ? chalk.yellow('⊘ skipped (already in the edition)')
        : chalk.green('✓');
      console.log(chalk.gray(`  ${index + 1}. ${lecture} ${marker}`));
    });
    if (skip) {
      for (const warning of skip.warnings) {
        console.log(chalk.yellow(`⚠ ${warning}`));
      }
      stats.skippedCount = skip.skippedCount;
    }

    const plan = planNonMarkdownCopy(options.source, options.target, options.docsFolder);
    console.log(
      chalk.yellow(
        `\nWould copy ${plan.copy.length} non-markdown file(s), and keep ${plan.keep.length} the edition already has`
      )
    );
    console.log(
      chalk.yellow(
        configState === 'absent'
          ? 'Would write .translate/config.yml'
          : 'Would leave .translate/config.yml as it is: it matches the flags'
      )
    );

    console.log(chalk.yellow('\nRun without --dry-run to translate.'));
    console.log(
      chalk.gray(
        `\nNote: This command translates content in the ${options.docsFolder}/ folder only.`
      )
    );
    console.log(
      chalk.gray(
        'You may also need to set up: .github/workflows/, environment.yml, requirements.txt, LICENSE'
      )
    );
    return stats;
  }

  // Phase 3: Setup target folder
  fs.mkdirSync(path.join(options.target, options.docsFolder), { recursive: true });

  // A state folder init cannot write fails every lecture once its translation
  // is paid for (#378), so it is checked before the first model call.
  const stateDir = path.join(options.target, path.dirname(stateFileRelativePath('lecture.md')));
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    // Creating a file in a folder takes search permission as well as write.
    fs.accessSync(stateDir, fs.constants.W_OK | fs.constants.X_OK);
  } catch (error) {
    throw new Error(
      `Cannot write lecture state files in ${stateDir} (` +
        (error instanceof Error ? error.message : String(error)) +
        '), so nothing was translated: without its state file a lecture never syncs ' +
        'under `sync-scope: existing`.'
    );
  }

  // Write .translate/config.yml, unless the edition has one that matches
  if (configState === 'absent') writeConfig(options.target, editionConfig);

  // Phase 4: Copy the non-markdown files the edition does not have
  const copy = copyNonMarkdownFiles(options.source, options.target, options.docsFolder);
  console.log(
    chalk.green(
      `Copied ${copy.copied} non-markdown file(s), and kept ${copy.kept} the edition already has\n`
    )
  );

  // Phase 5: Translate lectures
  const translator = new TranslationService(options.apiKey, options.model, false);

  // Handle resume
  let startIndex = 0;
  if (options.resumeFrom) {
    const idx = lectures.indexOf(options.resumeFrom);
    if (idx === -1) {
      // Try partial match
      const partial = lectures.findIndex((l) => l.includes(options.resumeFrom!));
      if (partial !== -1) {
        startIndex = partial;
        console.log(chalk.yellow(`Resuming from: ${lectures[partial]}\n`));
      } else {
        console.log(
          chalk.yellow(`Resume file not found: ${options.resumeFrom}, starting from beginning\n`)
        );
      }
    } else {
      startIndex = idx;
      console.log(chalk.yellow(`Resuming from: ${lectures[idx]}\n`));
    }
  }

  const CONCURRENCY = options.parallel;
  let remaining = lectures.slice(startIndex);

  // Handle --skip-existing: filter out lectures that already have state
  if (options.skipExisting) {
    const result = filterSkipExisting(options, remaining);
    remaining = result.remaining;
    for (const warning of result.warnings) {
      console.log(chalk.yellow(`⚠ ${warning}`));
    }
    if (result.skippedCount > 0) {
      stats.skippedCount = result.skippedCount;
      console.log(
        chalk.yellow(
          `Skipping ${result.skippedCount} already-translated lecture(s) (of ${result.skippedCount + remaining.length})\n`
        )
      );
    }
  }

  const bar = new cliProgress.SingleBar(
    { format: '  {bar} {percentage}% | {value}/{total} | {status}' },
    cliProgress.Presets.shades_classic
  );
  bar.start(remaining.length, 0, { status: '' });

  const stateParser = new MystParser();
  // Printed after the progress bar: a lecture whose state records no source commit.
  const stateWarnings: string[] = [];

  // Process a single lecture — used by both sequential and parallel paths.
  // Returns its record for the run report.
  async function processOne(lecture: string): Promise<LectureReport> {
    const startTime = Date.now();
    // API usage belongs to one lecture only when lectures run one at a time.
    const usageBefore = CONCURRENCY === 1 ? translator.getUsage() : undefined;
    const retriesBefore = translator.getRetryCount();
    const unwrapsBefore = translator.getFenceUnwrapCount();
    let record: LectureReport;
    try {
      const result = await translateLecture(
        lecture,
        options.source,
        options.target,
        options.docsFolder,
        translator,
        options,
        glossary
      );
      stats.totalTokens += result.tokensUsed;
      stats.totalTimeMs += result.elapsedMs;

      // Write the lecture's state file before counting the lecture (#378).
      // Under `sync-scope: existing` a lecture without one never syncs, so a
      // failed write fails the lecture; the translation stays on disk.
      const statePath = stateFileRelativePath(lecture);
      const docsRelPath = options.docsFolder ? path.join(options.docsFolder, lecture) : lecture;
      const sourceGit = await getFileGitMetadata(options.source, docsRelPath);
      try {
        const sourceFile = path.join(options.source, options.docsFolder, lecture);
        const sourceContent = fs.readFileSync(sourceFile, 'utf-8');
        const parsed = await stateParser.parseSections(sourceContent, sourceFile);
        writeFileState(options.target, lecture, {
          'source-sha': sourceGit?.lastCommit ?? 'unknown',
          'synced-at': new Date().toISOString().split('T')[0],
          model: options.model,
          mode: 'NEW',
          'section-count': parsed.sections.length,
        });
      } catch (error) {
        throw new StateWriteError(
          `translated, but ${statePath} was not written: ` +
            (error instanceof Error ? error.message : String(error))
        );
      }
      if (!sourceGit) {
        stateWarnings.push(
          `${lecture}: the source clone has no commit for it, so ${statePath} records ` +
            '`source-sha: unknown`, and `translate status` will report it OUTDATED once it is ' +
            'committed. Commit the lecture in the source first, or correct the state file.'
        );
      }

      record = {
        file: lecture,
        outcome: 'ok',
        elapsedMs: result.elapsedMs,
        tokensUsed: result.tokensUsed,
        outputChars: result.outputChars,
        headRestored: result.headRestored,
      };
      stats.successCount++;
    } catch (error) {
      stats.failureCount++;
      const errorMsg = error instanceof Error ? error.message : String(error);
      stats.failures.push({ file: lecture, error: errorMsg });
      record = {
        file: lecture,
        outcome: 'failed',
        failure: classifyFailure(error),
        elapsedMs: Date.now() - startTime,
      };
    }
    if (usageBefore) {
      record.usage = usageSince(usageBefore, translator.getUsage());
      record.retries = translator.getRetryCount() - retriesBefore;
      record.fenceUnwraps = translator.getFenceUnwrapCount() - unwrapsBefore;
    }
    return record;
  }

  const lectureReports: LectureReport[] = [];
  let completed = 0;

  // Process in batches of CONCURRENCY
  for (let i = 0; i < remaining.length; i += CONCURRENCY) {
    const batch = remaining.slice(i, i + CONCURRENCY);
    bar.update(completed, {
      status: batch.length > 1 ? `${batch[0]} (+${batch.length - 1})` : batch[0],
    });

    lectureReports.push(...(await Promise.all(batch.map((lecture) => processOne(lecture)))));
    completed += batch.length;

    // Delay between batches for rate limiting (skip after last batch)
    if (i + CONCURRENCY < remaining.length && options.batchDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, options.batchDelay));
    }
  }

  bar.update(remaining.length, { status: 'done' });
  bar.stop();

  for (const warning of stateWarnings) {
    console.log(chalk.yellow(`⚠️  ${warning}`));
  }

  // One stderr line per failed lecture, naming its failure class: the reason
  // used to reach only TRANSLATION-REPORT.md, so a log showed `✗ Failed: N`.
  for (const record of lectureReports) {
    if (record.failure) {
      console.error(formatFailureLine(record.file, record.failure));
    }
  }
  // The failure line keeps 200 characters. With `-f` no TRANSLATION-REPORT.md
  // carries the rest, such as a parity check's full list (#134), so it is
  // printed here.
  if (options.file) {
    for (const failure of stats.failures) {
      console.error(`\n${failure.file} failed:\n${failure.error}`);
    }
  }
  // Untruncated, unlike the failure lines: each command is the recovery.
  const unrecorded = lectureReports.filter((record) => record.failure?.kind === 'state-write');
  if (unrecorded.length > 0) {
    console.error(
      chalk.yellow(
        `\n${unrecorded.length} lecture(s) were translated but have no state file. Once the ` +
          'cause is fixed, record each sync point (as `model: unknown`, `mode: RESYNC`) with:'
      )
    );
    for (const record of unrecorded) {
      console.error(`  ${writeStateCommand(options, record.file)}`);
    }
  }

  // Phase 6: Generate report. Not for `-f`, whose round's PR would have to
  // delete it (#134): its one lecture's failure is on stderr above, and
  // `--report-json` still records the run.
  if (!options.file) {
    generateReport(options.target, options, stats, termCount);
    console.log(
      chalk.green(`\n📄 Report saved to: ${path.join(options.target, 'TRANSLATION-REPORT.md')}`)
    );
  }
  if (options.reportJson) {
    const runReport = buildRunReport(
      options,
      startedAt,
      translator,
      stats,
      lectureReports,
      termCount
    );
    const written = writeRunReport(options.reportJson, runReport);
    console.log(chalk.green(`📄 Run report (JSON) saved to: ${written}`));
    if (runReport.costUSD === null) {
      console.log(
        chalk.yellow(
          `⚠️  No list price for model '${options.model}' in src/model-pricing.ts — costUSD is null (unpriced)`
        )
      );
    }
  }

  // Phase 7: Summary
  console.log(chalk.bold.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.bold(`  ✓ Translated: ${stats.successCount}/${stats.totalLectures}`));
  if (stats.skippedCount > 0) {
    console.log(chalk.yellow(`  ⊘ Skipped (already translated): ${stats.skippedCount}`));
  }
  if (stats.failureCount > 0) {
    console.log(chalk.red(`  ✗ Failed: ${stats.failureCount}`));
  }
  console.log(chalk.gray(`  Tokens: ${stats.totalTokens.toLocaleString()}`));
  console.log(chalk.gray(`  Time: ${(stats.totalTimeMs / 1000 / 60).toFixed(1)} minutes`));
  console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

  // Font setup guidance — shown after translation so the user sees it last.
  // A lecture written without its state file references the fonts too.
  if (
    (stats.successCount > 0 || unrecorded.length > 0) &&
    options.localize.includes('i18n-font-config')
  ) {
    const fontReqs = getFontRequirements(options.targetLanguage);
    if (fontReqs.length > 0) {
      const fontsDir = path.join(options.target, options.docsFolder, '_fonts');
      fs.mkdirSync(fontsDir, { recursive: true });
      console.log(chalk.yellow('⚠ Font setup required'));
      console.log(chalk.gray(`  The translated code cells reference fonts in _fonts/.`));
      console.log(chalk.gray(`  Please download and place the following file(s):\n`));
      for (const req of fontReqs) {
        console.log(chalk.white(`  ${req.description}`));
        console.log(chalk.gray(`    File: ${req.filename}`));
        console.log(chalk.gray(`    Place at: ${path.join(fontsDir, req.filename)}`));
        console.log(chalk.blue(`    Download: ${req.url}`));
      }
      console.log('');
    }
  }

  return stats;
}

/**
 * Init Command — Bulk-translate a new project
 *
 * One-time bulk translation of an entire lecture series from a local source repo.
 * Reads _toc.yml for lecture discovery, translates each lecture sequentially,
 * generates heading-maps, and produces a translation report.
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
import { TranslationService } from '../../translator.js';
import { MystParser } from '../../parser.js';
import { Glossary } from '../../types.js';
import { updateHeadingMap, injectHeadingMap } from '../../heading-map.js';
import { RuleId, buildLocalizationPrompt, getFontRequirements } from '../../localization-rules.js';
import { readFileState, writeConfig, writeFileState } from '../translate-state.js';
import { getFileGitMetadata } from '../git-metadata.js';

// ============================================================================
// TYPES
// ============================================================================

export interface InitOptions {
  source: string;            // Source repository path (local)
  target: string;            // Target folder path (local)
  targetLanguage: string;    // Target language code (e.g., "zh-cn")
  sourceLanguage: string;    // Source language code (default: "en")
  docsFolder: string;        // Documentation folder within repos (default: "lectures")
  model: string;             // Claude model (default: "claude-sonnet-4-6")
  batchDelay: number;        // Delay between lectures in ms (default: 1000)
  parallel: number;          // Number of parallel translations (default: 1)
  file?: string;             // Single file to translate (for testing)
  resumeFrom?: string;       // Resume from specific lecture file
  skipExisting?: boolean;     // Skip lectures that already have .translate/state entries
  glossaryPath?: string;     // Explicit path to glossary JSON file
  localize: RuleId[];        // Active localization rules (default: all)
  dryRun: boolean;           // Preview without API calls or file writes
  apiKey: string;            // Anthropic API key
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

interface TocEntry {
  file?: string;
  sections?: TocEntry[];
  caption?: string;
  chapters?: TocEntry[];
}

// ============================================================================
// GLOSSARY LOADER
// ============================================================================

function loadGlossary(language: string, glossaryPath?: string): Glossary | undefined {
  const candidates = glossaryPath
    ? [glossaryPath]
    : [
        path.join(process.cwd(), 'glossary', `${language}.json`),
        path.join(process.cwd(), `glossary-${language}.json`),
      ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const raw = fs.readFileSync(candidate, 'utf-8');
        return JSON.parse(raw) as Glossary;
      } catch {
        // Ignore parse errors
      }
    }
  }

  return undefined;
}

// ============================================================================
// TOC PARSER
// ============================================================================

/**
 * Parse _toc.yml from the source repo to get ordered list of lecture files.
 */
export function parseTocLectures(sourceRepoPath: string, docsFolder: string): string[] {
  const tocPath = path.join(sourceRepoPath, docsFolder, '_toc.yml');
  if (!fs.existsSync(tocPath)) {
    throw new Error(`_toc.yml not found at ${tocPath}`);
  }

  const tocContent = fs.readFileSync(tocPath, 'utf-8');
  let toc: any;
  try {
    toc = yaml.load(tocContent);
  } catch (e) {
    throw new Error(
      `Malformed _toc.yml at ${tocPath}: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  if (!toc || typeof toc !== 'object') {
    throw new Error(`_toc.yml at ${tocPath} is empty or not a valid YAML mapping`);
  }

  const lectures: string[] = [];

  const extractFiles = (entries: TocEntry[] | undefined) => {
    if (!entries) return;
    for (const entry of entries) {
      if (entry.file) {
        lectures.push(entry.file.endsWith('.md') ? entry.file : `${entry.file}.md`);
      }
      if (entry.sections) extractFiles(entry.sections);
      if (entry.chapters) extractFiles(entry.chapters);
    }
  };

  // TOC can have 'chapters' or 'parts' at root level
  if (toc.chapters) {
    extractFiles(toc.chapters);
  }
  if (toc.parts) {
    for (const part of toc.parts) {
      if (part.chapters) extractFiles(part.chapters);
    }
  }
  // Also check for root-level file (intro page)
  if (toc.root) {
    lectures.unshift(toc.root.endsWith('.md') ? toc.root : `${toc.root}.md`);
  }

  return lectures;
}

// ============================================================================
// FILE COPY (NON-MARKDOWN)
// ============================================================================

/**
 * Filter out lectures that already have .translate/state entries.
 * Returns the remaining (untranslated) lectures and the count of skipped ones.
 */
export function filterSkipExisting(
  targetPath: string,
  lectures: string[],
): { remaining: string[]; skippedCount: number } {
  const remaining: string[] = [];
  let skippedCount = 0;
  for (const lecture of lectures) {
    if (readFileState(targetPath, lecture)) {
      skippedCount++;
    } else {
      remaining.push(lecture);
    }
  }
  return { remaining, skippedCount };
}

/**
 * Copy all non-.md files from source docs folder to target.
 * Preserves _config.yml, _toc.yml, images, CSS, data files, etc.
 */
export function copyNonMarkdownFiles(
  sourceRepoPath: string,
  targetPath: string,
  docsFolder: string,
): number {
  const sourceDocsDir = path.join(sourceRepoPath, docsFolder);
  if (!fs.existsSync(sourceDocsDir)) {
    return 0;
  }

  let count = 0;

  function walkAndCopy(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(sourceDocsDir, fullPath);

      if (entry.name.startsWith('.git')) continue;
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        walkAndCopy(fullPath);
      } else if (!entry.name.endsWith('.md')) {
        const targetFilePath = path.join(targetPath, docsFolder, relativePath);
        fs.mkdirSync(path.dirname(targetFilePath), { recursive: true });
        fs.copyFileSync(fullPath, targetFilePath);
        count++;
      }
    }
  }

  walkAndCopy(sourceDocsDir);
  return count;
}

// ============================================================================
// HEADING-MAP GENERATION
// ============================================================================

/**
 * Generate heading-map by parsing source and translated sections.
 * Uses updateHeadingMap() for correct path-based keys (Parent::Child).
 */
async function generateHeadingMap(
  sourceContent: string,
  translatedContent: string,
): Promise<Map<string, string>> {
  const parser = new MystParser();
  const sourceParsed = await parser.parseSections(sourceContent, 'temp.md');
  const translatedParsed = await parser.parseSections(translatedContent, 'temp.md');

  return updateHeadingMap(
    new Map(),
    sourceParsed.sections,
    translatedParsed.sections,
  );
}

// ============================================================================
// SINGLE LECTURE TRANSLATION
// ============================================================================

/**
 * Translate a single lecture file with retry logic.
 * Returns tokens used, or throws on permanent failure.
 */
async function translateLecture(
  lectureFile: string,
  sourceRepoPath: string,
  targetPath: string,
  docsFolder: string,
  translator: TranslationService,
  options: InitOptions,
  glossary: Glossary | undefined,
): Promise<{ tokensUsed: number; elapsedMs: number }> {
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

  const translatedContent = result.translatedSection;

  // Generate heading-map
  const headingMap = await generateHeadingMap(sourceContent, translatedContent);

  // Inject heading-map into frontmatter
  const finalContent = injectHeadingMap(translatedContent, headingMap);

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
  };
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateReport(
  targetPath: string,
  options: InitOptions,
  stats: TranslationStats,
  glossaryTermCount: number,
): void {
  const avgTimePerLecture = stats.successCount > 0
    ? stats.totalTimeMs / stats.successCount
    : 0;

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

// ============================================================================
// MAIN COMMAND
// ============================================================================

/**
 * Run the init command — bulk translate all lectures in a project.
 */
export async function runInit(options: InitOptions): Promise<TranslationStats> {
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

  // Phase 1: Load glossary
  const glossary = loadGlossary(options.targetLanguage, options.glossaryPath);
  const termCount = glossary?.terms?.length || 0;
  if (termCount > 0) {
    console.log(chalk.green(`Glossary: ${termCount} terms`));
  } else {
    console.log(chalk.yellow(`Glossary: none found for ${options.targetLanguage}`));
  }

  // Phase 2: Parse TOC for lecture list
  let lectures = parseTocLectures(options.source, options.docsFolder);

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
    const target = options.file.endsWith('.md') ? options.file : `${options.file}.md`;
    const found = lectures.find(l => l === target || l.includes(options.file!));
    if (found) {
      lectures = [found];
      stats.totalLectures = 1;
      console.log(chalk.bold(`Translating single file: ${found}\n`));
    } else {
      throw new Error(
        `File not found in _toc.yml: ${options.file}\n` +
        `Available lectures: ${lectures.slice(0, 5).join(', ')}${lectures.length > 5 ? ', ...' : ''}`
      );
    }
  } else {
    console.log(chalk.bold(`\nFound ${lectures.length} lectures in _toc.yml\n`));
  }

  if (options.dryRun) {
    console.log(chalk.yellow('Would translate the following lectures:'));
    lectures.forEach((lecture, index) => {
      const sourceFile = path.join(options.source, options.docsFolder, lecture);
      const exists = fs.existsSync(sourceFile);
      const marker = exists ? chalk.green('✓') : chalk.red('✗ missing');
      console.log(chalk.gray(`  ${index + 1}. ${lecture} ${marker}`));
    });

    // Show what non-md files would be copied
    const sourceDocsDir = path.join(options.source, options.docsFolder);
    if (fs.existsSync(sourceDocsDir)) {
      let nonMdCount = 0;
      function countNonMd(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.git')) continue;
          if (entry.isDirectory()) countNonMd(path.join(dir, entry.name));
          else if (!entry.name.endsWith('.md')) nonMdCount++;
        }
      }
      countNonMd(sourceDocsDir);
      console.log(chalk.yellow(`\nWould copy ${nonMdCount} non-markdown file(s)`));
    }

    console.log(chalk.yellow('\nRun without --dry-run to translate.'));
    console.log(chalk.gray(`\nNote: This command translates content in the ${options.docsFolder}/ folder only.`));
    console.log(chalk.gray('You may also need to set up: .github/workflows/, environment.yml, requirements.txt, LICENSE'));
    return stats;
  }

  // Phase 3: Setup target folder
  fs.mkdirSync(path.join(options.target, options.docsFolder), { recursive: true });

  // Write .translate/config.yml
  writeConfig(options.target, {
    'source-language': options.sourceLanguage,
    'target-language': options.targetLanguage,
    'docs-folder': options.docsFolder,
  });

  // Phase 4: Copy non-markdown files
  const copiedCount = copyNonMarkdownFiles(options.source, options.target, options.docsFolder);
  console.log(chalk.green(`Copied ${copiedCount} non-markdown file(s)\n`));

  // Phase 5: Translate lectures
  const translator = new TranslationService(options.apiKey, options.model, false);

  // Handle resume
  let startIndex = 0;
  if (options.resumeFrom) {
    const idx = lectures.indexOf(options.resumeFrom);
    if (idx === -1) {
      // Try partial match
      const partial = lectures.findIndex(l => l.includes(options.resumeFrom!));
      if (partial !== -1) {
        startIndex = partial;
        console.log(chalk.yellow(`Resuming from: ${lectures[partial]}\n`));
      } else {
        console.log(chalk.yellow(`Resume file not found: ${options.resumeFrom}, starting from beginning\n`));
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
    const result = filterSkipExisting(options.target, remaining);
    remaining = result.remaining;
    if (result.skippedCount > 0) {
      stats.skippedCount = result.skippedCount;
      console.log(chalk.yellow(`Skipping ${result.skippedCount} already-translated lecture(s) (of ${result.skippedCount + remaining.length})\n`));
    }
  }

  const bar = new cliProgress.SingleBar(
    { format: '  {bar} {percentage}% | {value}/{total} | {status}' },
    cliProgress.Presets.shades_classic,
  );
  bar.start(remaining.length, 0, { status: '' });

  const stateParser = new MystParser();

  // Process a single lecture — used by both sequential and parallel paths
  async function processOne(lecture: string): Promise<void> {
    try {
      const result = await translateLecture(
        lecture,
        options.source,
        options.target,
        options.docsFolder,
        translator,
        options,
        glossary,
      );

      stats.successCount++;
      stats.totalTokens += result.tokensUsed;
      stats.totalTimeMs += result.elapsedMs;

      // Write per-file state
      try {
        const docsRelPath = options.docsFolder ? path.join(options.docsFolder, lecture) : lecture;
        const sourceGit = await getFileGitMetadata(options.source, docsRelPath);
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
      } catch {
        // State write failure is non-fatal
      }
    } catch (error) {
      stats.failureCount++;
      const errorMsg = error instanceof Error ? error.message : String(error);
      stats.failures.push({ file: lecture, error: errorMsg });
    }
  }

  let completed = 0;

  // Process in batches of CONCURRENCY
  for (let i = 0; i < remaining.length; i += CONCURRENCY) {
    const batch = remaining.slice(i, i + CONCURRENCY);
    bar.update(completed, { status: batch.length > 1 ? `${batch[0]} (+${batch.length - 1})` : batch[0] });

    await Promise.all(batch.map(lecture => processOne(lecture)));
    completed += batch.length;

    // Delay between batches for rate limiting (skip after last batch)
    if (i + CONCURRENCY < remaining.length && options.batchDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, options.batchDelay));
    }
  }

  bar.update(remaining.length, { status: 'done' });
  bar.stop();

  // Phase 6: Generate report
  generateReport(options.target, options, stats, termCount);
  console.log(chalk.green(`\n📄 Report saved to: ${path.join(options.target, 'TRANSLATION-REPORT.md')}`));

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

  // Font setup guidance — shown after translation so the user sees it last
  if (stats.successCount > 0 && options.localize.includes('i18n-font-config')) {
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

/**
 * Tests for bulk backward processing
 *
 * Tests file discovery, checkpointing, cost estimation, and bulk orchestration.
 * Uses --test mode (no LLM calls) with temporary directories. Discovery reads
 * each repository's lecture set (#449), so the fixtures write a `_toc.yml`.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  runBackwardBulk,
  buildBulkReport,
  buildBulkOutputDir,
  readProgress,
  writeProgress,
  discoverBulkFiles,
  BulkProgress,
  BackwardLogger,
} from '../commands/backward.js';
import { BackwardOptions, BackwardReport } from '../types.js';
import { loadResyncDirectory } from '../schema.js';
import { writeToc } from '../../test-support/toc-fixture.js';

// ============================================================================
// HELPERS
// ============================================================================

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resync-bulk-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const silentLogger: BackwardLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

function writeMd(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

/** Simple source file */
const SOURCE_CONTENT = `---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
---

# Test Lecture

Intro text.

## Section One

Some content here.

## Section Two

More content here.
`;

/** Aligned target file (heading-map + same sections) */
const TARGET_ALIGNED = `---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
heading-map:
  Section One: 第一节
  Section Two: 第二节
---

# 测试讲座

介绍文字。

## 第一节

这里有一些内容。

## 第二节

这里有更多内容。
`;

/** Target with bug fix (different content) */
const TARGET_BUGFIX = `---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
heading-map:
  Section One: 第一节
  Section Two: 第二节
---

# 测试讲座

介绍文字。

## 第一节

这里有修正后的内容，修复了一个错误。

## 第二节

这里修正了计算公式。
`;

/**
 * Set up a multi-file test scenario in tmpDir.
 * Returns source and target repo paths.
 */
function setupMultiFileFixture(): { sourceDir: string; targetDir: string } {
  const sourceDir = path.join(tmpDir, 'source');
  const targetDir = path.join(tmpDir, 'target');

  // Two aligned files (names contain "aligned" or "intro" → test mode returns IN_SYNC)
  writeMd(path.join(sourceDir, 'lectures', 'intro.md'), SOURCE_CONTENT);
  writeMd(path.join(targetDir, 'lectures', 'intro.md'), TARGET_ALIGNED);

  writeMd(path.join(sourceDir, 'lectures', 'aligned-basics.md'), SOURCE_CONTENT);
  writeMd(path.join(targetDir, 'lectures', 'aligned-basics.md'), TARGET_ALIGNED);

  // One file with changes (name doesn't contain "aligned"/"intro" → test mode flags it)
  writeMd(path.join(sourceDir, 'lectures', 'cobweb.md'), SOURCE_CONTENT);
  writeMd(path.join(targetDir, 'lectures', 'cobweb.md'), TARGET_BUGFIX);

  const lectures = ['intro', 'aligned-basics', 'cobweb'];
  writeToc(path.join(sourceDir, 'lectures'), lectures);
  writeToc(path.join(targetDir, 'lectures'), lectures);

  return { sourceDir, targetDir };
}

function buildBulkOptions(
  sourceDir: string,
  targetDir: string,
  outputDir: string,
  overrides: Partial<BackwardOptions & { apiKey: string }> = {}
): BackwardOptions & { apiKey: string } {
  return {
    source: sourceDir,
    target: targetDir,
    file: undefined,
    docsFolder: 'lectures',
    language: 'zh-cn',
    sourceLanguage: 'en',
    output: outputDir,
    model: 'claude-sonnet-4-6',
    json: false,
    test: true,
    minConfidence: 0.6,
    apiKey: 'test-key',
    ...overrides,
  };
}

// ============================================================================
// PROGRESS CHECKPOINTING
// ============================================================================

describe('progress checkpointing', () => {
  it('should write and read progress', () => {
    const progress: BulkProgress = {
      startedAt: '2026-03-03T10:00:00Z',
      lastUpdated: '2026-03-03T10:05:00Z',
      totalFiles: 10,
      completedFiles: ['intro.md', 'cobweb.md'],
      erroredFiles: [],
    };

    writeProgress(tmpDir, progress);
    const read = readProgress(tmpDir);

    expect(read).toEqual(progress);
  });

  it('should return null when no progress file exists', () => {
    const read = readProgress(tmpDir);
    expect(read).toBeNull();
  });

  it('should return null for corrupted progress file', () => {
    const resyncDir = path.join(tmpDir, '.resync');
    fs.mkdirSync(resyncDir, { recursive: true });
    fs.writeFileSync(path.join(resyncDir, '_progress.json'), 'not json', 'utf-8');
    const read = readProgress(tmpDir);
    expect(read).toBeNull();
  });
});

// ============================================================================
// OUTPUT DIRECTORY NAMING
// ============================================================================

describe('buildBulkOutputDir', () => {
  it('should create a repo-scoped date-stamped folder name', () => {
    const dir = buildBulkOutputDir('./reports', 'lecture-python-intro');

    // Should be in the format: reports/lecture-python-intro/backward-YYYY-MM-DD
    expect(dir).toMatch(/reports[/\\]lecture-python-intro[/\\]backward-\d{4}-\d{2}-\d{2}$/);
  });
});

// ============================================================================
// FILE DISCOVERY
// ============================================================================

/**
 * The multi-file fixture plus one file of each one-sided kind (#400): a
 * lecture the edition has not translated, an edition-only page, and an orphan
 * whose English was removed but whose state file is still there.
 */
function setupOneSidedFixture(): { sourceDir: string; targetDir: string } {
  const dirs = setupMultiFileFixture();
  writeMd(path.join(dirs.sourceDir, 'lectures', 'untranslated.md'), SOURCE_CONTENT);
  writeMd(path.join(dirs.targetDir, 'lectures', 'extra.md'), TARGET_ALIGNED);
  writeMd(path.join(dirs.targetDir, 'lectures', 'gone.md'), TARGET_ALIGNED);
  writeMd(
    path.join(dirs.targetDir, '.translate', 'state', 'gone.md.yml'),
    "source-sha: abc1234\nsynced-at: '2026-10-01'\nmodel: claude-sonnet-5\nmode: NEW\nsection-count: 1\n"
  );
  writeToc(path.join(dirs.sourceDir, 'lectures'), [
    'intro',
    'aligned-basics',
    'cobweb',
    'untranslated',
  ]);
  writeToc(path.join(dirs.targetDir, 'lectures'), [
    'intro',
    'aligned-basics',
    'cobweb',
    'extra',
    'gone',
  ]);
  return dirs;
}

describe('discoverBulkFiles', () => {
  it('returns the files both repos have', async () => {
    const { sourceDir, targetDir } = setupMultiFileFixture();
    const discovered = await discoverBulkFiles(sourceDir, targetDir, 'lectures', []);

    expect(discovered).toEqual({
      files: ['aligned-basics.md', 'cobweb.md', 'intro.md'],
      oneSided: [],
      excluded: 0,
      sourceCount: 3,
      targetCount: 3,
    });
  });

  it('returns a file on one side only apart, naming the side (#400)', async () => {
    const { sourceDir, targetDir } = setupOneSidedFixture();
    const discovered = await discoverBulkFiles(sourceDir, targetDir, 'lectures', []);

    expect(discovered.files).toEqual(['aligned-basics.md', 'cobweb.md', 'intro.md']);
    expect(discovered.oneSided).toEqual([
      { file: 'extra.md', side: 'target only' },
      { file: 'gone.md', side: 'target only' },
      { file: 'untranslated.md', side: 'source only' },
    ]);
  });

  it('applies exclude patterns before either list, and counts what they removed', async () => {
    const { sourceDir, targetDir } = setupOneSidedFixture();
    const discovered = await discoverBulkFiles(sourceDir, targetDir, 'lectures', [
      'intro.md',
      'extra.md',
    ]);

    expect(discovered.files).toEqual(['aligned-basics.md', 'cobweb.md']);
    expect(discovered.oneSided.map((f) => f.file)).toEqual(['gone.md', 'untranslated.md']);
    expect(discovered.excluded).toBe(2);
  });

  // #385: bulk discovery read only the top level of the docs folder
  it('takes the fragments the lectures include, and no .md outside the lecture set', async () => {
    const { sourceDir, targetDir } = setupMultiFileFixture();
    writeFragment(sourceDir, targetDir);

    const discovered = await discoverBulkFiles(sourceDir, targetDir, 'lectures', []);
    expect(discovered.files).toEqual([
      '_admonition/gpu.md',
      'aligned-basics.md',
      'cobweb.md',
      'intro.md',
    ]);

    const excluded = await discoverBulkFiles(sourceDir, targetDir, 'lectures', [
      '_admonition/gpu.md',
    ]);
    expect(excluded.files).not.toContain('_admonition/gpu.md');
    expect(excluded.excluded).toBe(1);
  });
});

/**
 * `cobweb.md` in both repositories includes `_admonition/gpu.md`, and each
 * docs folder holds a README its ToC does not list.
 */
function writeFragment(sourceDir: string, targetDir: string): void {
  const include = '```{include} _admonition/gpu.md\n```\n\n';
  for (const [dir, content, gpu] of [
    [sourceDir, SOURCE_CONTENT, 'This lecture was built with a GPU.'],
    [targetDir, TARGET_BUGFIX, '本讲座使用 GPU 构建。'],
  ]) {
    const docs = path.join(dir, 'lectures');
    writeMd(path.join(docs, 'cobweb.md'), content.replace(/\n## /, `\n${include}## `));
    writeMd(path.join(docs, '_admonition', 'gpu.md'), `\`\`\`{admonition} GPU\n${gpu}\n\`\`\`\n`);
    writeMd(path.join(docs, 'README.md'), '# Lectures\n');
  }
}

// ============================================================================
// BUILD BULK REPORT
// ============================================================================

describe('buildBulkReport', () => {
  it('should aggregate file reports correctly', () => {
    const reports: BackwardReport[] = [
      {
        file: 'intro.md',
        timestamp: '2026-03-03T10:00:00Z',
        sourceMetadata: null,
        targetMetadata: null,
        timeline: null,
        triageResult: { file: 'intro.md', verdict: 'IN_SYNC', notes: '' },
        suggestions: [],
      },
      {
        file: 'cobweb.md',
        timestamp: '2026-03-03T10:01:00Z',
        sourceMetadata: null,
        targetMetadata: null,
        timeline: null,
        triageResult: { file: 'cobweb.md', verdict: 'CHANGES_DETECTED', notes: 'Bug fix found' },
        suggestions: [
          {
            sectionHeading: 'Section One',
            recommendation: 'BACKPORT',
            category: 'BUG_FIX',
            confidence: 0.9,
            summary: 'Fixed formula error',
            specificChanges: [],
            reasoning: 'The formula had an error',
          },
          {
            sectionHeading: 'Section Two',
            recommendation: 'NO_BACKPORT',
            category: 'I18N_ONLY',
            confidence: 0.3,
            summary: 'Font change only',
            specificChanges: [],
            reasoning: 'i18n only',
          },
        ],
      },
    ];

    const bulk = buildBulkReport('/source', '/target', 'zh-cn', reports);

    expect(bulk.filesAnalyzed).toBe(2);
    expect(bulk.filesInSync).toBe(1);
    expect(bulk.filesFlagged).toBe(1);
    expect(bulk.totalSuggestions).toBe(1); // Only BACKPORT suggestions counted
    expect(bulk.highConfidence).toBe(1); // 0.9 >= 0.85
    expect(bulk.mediumConfidence).toBe(0);
    expect(bulk.lowConfidence).toBe(0);
    expect(bulk.fileReports).toHaveLength(2);
  });

  it('should handle empty report list', () => {
    const bulk = buildBulkReport('/source', '/target', 'zh-cn', []);

    expect(bulk.filesAnalyzed).toBe(0);
    expect(bulk.filesInSync).toBe(0);
    expect(bulk.totalSuggestions).toBe(0);
    expect(bulk.filesErrored).toBe(0);
  });

  it('carries errored files into the aggregate report', () => {
    const bulk = buildBulkReport('/source', '/target', 'zh-cn', [], undefined, [
      { file: 'broken.md', error: 'boom' },
    ]);

    expect(bulk.filesErrored).toBe(1);
    expect(bulk.erroredFiles).toEqual([{ file: 'broken.md', error: 'boom' }]);
  });
});

// ============================================================================
// BULK BACKWARD RUN (integration, --test mode)
// ============================================================================

describe('runBackwardBulk', () => {
  it('should process all files and write reports', async () => {
    const { sourceDir, targetDir } = setupMultiFileFixture();
    const outputDir = path.join(tmpDir, 'reports');

    const options = buildBulkOptions(sourceDir, targetDir, outputDir);
    const result = await runBackwardBulk(options, silentLogger);

    // Should have processed all 3 files
    expect(result.filesAnalyzed).toBe(3);

    // In test mode: "intro" and "aligned-basics" → IN_SYNC; "cobweb" → CHANGES_DETECTED
    expect(result.filesInSync).toBe(2);

    // Check that output folder was created under the source repo name subfolder
    const sourceName = path.basename(sourceDir); // 'source'
    const repoScopedDir = path.join(outputDir, sourceName);
    expect(fs.existsSync(repoScopedDir)).toBe(true);
    const bulkFolder = fs.readdirSync(repoScopedDir).find((f) => f.startsWith('backward-'));
    expect(bulkFolder).toBeDefined();

    // Check aggregate summary was written
    const bulkDir = path.join(repoScopedDir, bulkFolder!);
    expect(fs.existsSync(path.join(bulkDir, '_summary.md'))).toBe(true);
    expect(fs.existsSync(path.join(bulkDir, '.resync', '_progress.json'))).toBe(true);
  });

  it('should write per-file reports', async () => {
    const { sourceDir, targetDir } = setupMultiFileFixture();
    const outputDir = path.join(tmpDir, 'reports');

    const options = buildBulkOptions(sourceDir, targetDir, outputDir);
    await runBackwardBulk(options, silentLogger);

    // Find the timestamped folder under the source repo subfolder
    const repoScopedDir = path.join(outputDir, path.basename(sourceDir));
    const bulkFolder = fs.readdirSync(repoScopedDir).find((f) => f.startsWith('backward-'));
    const bulkDir = path.join(repoScopedDir, bulkFolder!);

    // Each file should have a report
    expect(fs.existsSync(path.join(bulkDir, 'intro.md'))).toBe(true);
    expect(fs.existsSync(path.join(bulkDir, 'cobweb.md'))).toBe(true);
    expect(fs.existsSync(path.join(bulkDir, 'aligned-basics.md'))).toBe(true);
  });

  it('should write JSON reports when --json is set', async () => {
    const { sourceDir, targetDir } = setupMultiFileFixture();
    const outputDir = path.join(tmpDir, 'reports');

    const options = buildBulkOptions(sourceDir, targetDir, outputDir, { json: true });
    await runBackwardBulk(options, silentLogger);

    const repoScopedDir = path.join(outputDir, path.basename(sourceDir));
    const bulkFolder = fs.readdirSync(repoScopedDir).find((f) => f.startsWith('backward-'));
    const bulkDir = path.join(repoScopedDir, bulkFolder!);

    expect(fs.existsSync(path.join(bulkDir, '_summary.json'))).toBe(true);
    expect(fs.existsSync(path.join(bulkDir, 'cobweb.json'))).toBe(true);

    // Verify JSON is valid
    const summary = JSON.parse(fs.readFileSync(path.join(bulkDir, '_summary.json'), 'utf-8'));
    expect(summary.filesAnalyzed).toBe(3);
  });

  it('should apply exclude patterns', async () => {
    const { sourceDir, targetDir } = setupMultiFileFixture();
    const outputDir = path.join(tmpDir, 'reports');

    const options = buildBulkOptions(sourceDir, targetDir, outputDir);
    const result = await runBackwardBulk(options, silentLogger, ['intro.md']);

    // Should have processed 2 files (excluded intro.md)
    expect(result.filesAnalyzed).toBe(2);
  });

  // #400: each of these threw "SOURCE/TARGET file not found" and failed the run.
  it('analyses only the files both repos have, and reports the rest without an error', async () => {
    const { sourceDir, targetDir } = setupOneSidedFixture();
    const outputDir = path.join(tmpDir, 'reports');
    const infos: string[] = [];
    const logger: BackwardLogger = { ...silentLogger, info: (m) => infos.push(m) };

    const result = await runBackwardBulk(buildBulkOptions(sourceDir, targetDir, outputDir), logger);

    expect(result.filesAnalyzed).toBe(3);
    expect(result.filesErrored).toBe(0);
    expect(result.oneSidedFiles).toEqual([
      { file: 'extra.md', side: 'target only' },
      { file: 'gone.md', side: 'target only' },
      { file: 'untranslated.md', side: 'source only' },
    ]);
    expect(infos).toContain(
      'Skipped 3 file(s) present on one side only: extra.md (target only), ' +
        'gone.md (target only), untranslated.md (source only).'
    );
    const repoScopedDir = path.join(outputDir, path.basename(sourceDir));
    const bulkDir = path.join(repoScopedDir, fs.readdirSync(repoScopedDir)[0]);
    expect(fs.readFileSync(path.join(bulkDir, '_summary.md'), 'utf-8')).toContain(
      'Not analyzed, present on one side only: `extra.md` (target only), ' +
        '`gone.md` (target only), `untranslated.md` (source only)'
    );

    // A resume converges on the same clean result.
    const resumed = await runBackwardBulk(
      buildBulkOptions(sourceDir, targetDir, bulkDir),
      logger,
      [],
      true
    );
    expect(resumed.filesAnalyzed).toBe(3);
    expect(resumed.filesErrored).toBe(0);
    expect(resumed.oneSidedFiles).toHaveLength(3);
  });

  it('says why nothing is left to analyse, instead of blaming the paths', async () => {
    const { sourceDir, targetDir } = setupOneSidedFixture();
    const infos: string[] = [];
    const warnings: string[] = [];
    const logger: BackwardLogger = {
      ...silentLogger,
      info: (m) => infos.push(m),
      warn: (m) => warnings.push(m),
    };

    const result = await runBackwardBulk(
      buildBulkOptions(sourceDir, targetDir, path.join(tmpDir, 'reports')),
      logger,
      ['intro.md', 'aligned-basics.md', 'cobweb.md']
    );

    expect(result.filesAnalyzed).toBe(0);
    expect(infos).toContain('No files to analyze: 3 on one side only, 3 excluded.');
    expect(warnings.join('\n')).not.toContain('No files found');
    // The summary still lists what was left out.
    const repoScopedDir = path.join(tmpDir, 'reports', path.basename(sourceDir));
    const bulkDir = path.join(repoScopedDir, fs.readdirSync(repoScopedDir)[0]);
    expect(fs.readFileSync(path.join(bulkDir, '_summary.md'), 'utf-8')).toContain(
      'Not analyzed, present on one side only: `extra.md` (target only)'
    );
  });

  // Every file would read as one-sided, and the run pass having done nothing.
  it.each([
    [
      '--target',
      (dirs: { sourceDir: string; targetDir: string }) => [
        dirs.sourceDir,
        path.join(tmpDir, 'typo'),
      ],
    ],
    [
      '--source',
      (dirs: { sourceDir: string; targetDir: string }) => [
        path.join(tmpDir, 'typo'),
        dirs.targetDir,
      ],
    ],
  ])('refuses a run whose %s has no docs folder, before writing anything', async (flag, pick) => {
    const [sourceDir, targetDir] = pick(setupMultiFileFixture());
    const side = flag === '--source' ? 'SOURCE' : 'TARGET';

    // The reader stops a wrong path now: a docs folder that is not there has no lecture set (#449)
    await expect(
      runBackwardBulk(
        buildBulkOptions(sourceDir, targetDir, path.join(tmpDir, 'reports')),
        silentLogger
      )
    ).rejects.toThrow(
      `${side}: the docs folder ${path.join(tmpDir, 'typo', 'lectures')} does not exist`
    );
    expect(fs.existsSync(path.join(tmpDir, 'reports'))).toBe(false);
  });

  it.each(['--source', '--target'])(
    'refuses a run whose %s has a ToC with no lecture behind it while the other has lectures (#400)',
    async (flag) => {
      const dirs = setupMultiFileFixture();
      const typo = path.join(tmpDir, 'typo');
      writeToc(path.join(typo, 'lectures'), ['intro', 'cobweb']);
      const [sourceDir, targetDir] =
        flag === '--source' ? [typo, dirs.targetDir] : [dirs.sourceDir, typo];

      await expect(
        runBackwardBulk(
          buildBulkOptions(sourceDir, targetDir, path.join(tmpDir, 'reports')),
          silentLogger
        )
      ).rejects.toThrow(
        `No lectures in ${path.join(typo, 'lectures')}: no entry in its _toc.yml has a .md file ` +
          `behind it, though the other repository has lectures. Check ${flag} and --docs-folder.`
      );
      expect(fs.existsSync(path.join(tmpDir, 'reports'))).toBe(false);
    }
  );

  it('refuses a run when a docs folder has no _toc.yml, before writing anything (#449)', async () => {
    const { sourceDir, targetDir } = setupMultiFileFixture();
    fs.rmSync(path.join(sourceDir, 'lectures', '_toc.yml'));

    await expect(
      runBackwardBulk(
        buildBulkOptions(sourceDir, targetDir, path.join(tmpDir, 'reports')),
        silentLogger
      )
    ).rejects.toThrow(/^SOURCE .*has no _toc\.yml or myst\.yml, so it has no lecture set\n/);
    expect(fs.existsSync(path.join(tmpDir, 'reports'))).toBe(false);
  });

  it('writes a fragment’s report at its docs-relative path, where resume and review find it', async () => {
    const { sourceDir, targetDir } = setupMultiFileFixture();
    writeFragment(sourceDir, targetDir);
    const outputDir = path.join(tmpDir, 'reports');

    const result = await runBackwardBulk(
      buildBulkOptions(sourceDir, targetDir, outputDir),
      silentLogger
    );

    expect(result.filesAnalyzed).toBe(4);
    const repoScopedDir = path.join(outputDir, path.basename(sourceDir));
    const bulkDir = path.join(repoScopedDir, fs.readdirSync(repoScopedDir)[0]);
    expect(fs.existsSync(path.join(bulkDir, '_admonition', 'gpu.md'))).toBe(true);
    expect(fs.existsSync(path.join(bulkDir, '.resync', '_admonition', 'gpu.json'))).toBe(true);
    expect(fs.existsSync(path.join(bulkDir, 'gpu.md'))).toBe(false);
    expect(fs.existsSync(path.join(bulkDir, 'README.md'))).toBe(false);

    const loaded = loadResyncDirectory(path.join(bulkDir, '.resync'));
    expect(loaded.errors).toEqual([]);
    expect(loaded.reports.map((r) => r.file).sort()).toEqual([
      '_admonition/gpu.md',
      'aligned-basics.md',
      'cobweb.md',
      'intro.md',
    ]);

    // A resume reloads every report from its sidecar, the nested one included
    const resumed = await runBackwardBulk(
      buildBulkOptions(sourceDir, targetDir, bulkDir),
      silentLogger,
      [],
      true
    );
    expect(resumed.fileReports.map((r) => r.file).sort()).toEqual(
      loaded.reports.map((r) => r.file).sort()
    );
  });

  it('should handle empty docs folder gracefully', async () => {
    const sourceDir = path.join(tmpDir, 'empty-source');
    const targetDir = path.join(tmpDir, 'empty-target');
    // ToCs whose root has no file behind it: lecture sets with no lectures
    writeToc(path.join(sourceDir, 'lectures'), ['index']);
    writeToc(path.join(targetDir, 'lectures'), ['index']);

    const outputDir = path.join(tmpDir, 'reports');
    const options = buildBulkOptions(sourceDir, targetDir, outputDir);
    const result = await runBackwardBulk(options, silentLogger);

    expect(result.filesAnalyzed).toBe(0);
  });
});

// ============================================================================
// RESUME (CHECKPOINTING)
// ============================================================================

describe('runBackwardBulk with resume', () => {
  it('should skip already-completed files on resume (direct path)', async () => {
    const { sourceDir, targetDir } = setupMultiFileFixture();
    const outputDir = path.join(tmpDir, 'reports');

    // First run: process all files
    const options = buildBulkOptions(sourceDir, targetDir, outputDir);
    const firstResult = await runBackwardBulk(options, silentLogger);
    expect(firstResult.filesAnalyzed).toBe(3);

    // Find the bulk folder under the source repo subfolder
    const repoScopedDir = path.join(outputDir, path.basename(sourceDir));
    const bulkFolder = fs.readdirSync(repoScopedDir).find((f) => f.startsWith('backward-'));
    const bulkDir = path.join(repoScopedDir, bulkFolder!);

    // Read progress
    const progress = readProgress(bulkDir);
    expect(progress).not.toBeNull();
    expect(progress!.completedFiles).toHaveLength(3);

    // Resume (point output to existing bulk dir directly) — all files already done
    const resumeOptions = buildBulkOptions(sourceDir, targetDir, bulkDir);
    const secondResult = await runBackwardBulk(resumeOptions, silentLogger, [], true);

    // Resume should reload all 3 reports from JSON sidecars
    expect(secondResult).toBeDefined();
    expect(secondResult.filesAnalyzed).toBe(3);
  });

  it('should auto-detect run folder from base output dir on resume', async () => {
    const { sourceDir, targetDir } = setupMultiFileFixture();
    const outputDir = path.join(tmpDir, 'reports');

    // First run: process all files
    const options = buildBulkOptions(sourceDir, targetDir, outputDir);
    const firstResult = await runBackwardBulk(options, silentLogger);
    expect(firstResult.filesAnalyzed).toBe(3);

    // Resume with base output dir (./reports) — should auto-find the run folder
    const resumeOptions = buildBulkOptions(sourceDir, targetDir, outputDir);
    const secondResult = await runBackwardBulk(resumeOptions, silentLogger, [], true);

    expect(secondResult).toBeDefined();
    expect(secondResult.filesAnalyzed).toBe(3);
  });

  it('retries errored files on resume instead of skipping them (#160)', async () => {
    const { sourceDir, targetDir } = setupMultiFileFixture();
    const outputDir = path.join(tmpDir, 'reports');

    const options = buildBulkOptions(sourceDir, targetDir, outputDir);
    await runBackwardBulk(options, silentLogger);

    const repoScopedDir = path.join(outputDir, path.basename(sourceDir));
    const bulkFolder = fs.readdirSync(repoScopedDir).find((f) => f.startsWith('backward-'));
    const bulkDir = path.join(repoScopedDir, bulkFolder!);

    // Rewrite history: pretend cobweb.md errored on the first run.
    const progress = readProgress(bulkDir)!;
    progress.completedFiles = progress.completedFiles.filter((f) => f !== 'cobweb.md');
    progress.erroredFiles = [{ file: 'cobweb.md', error: 'simulated crash' }];
    writeProgress(bulkDir, progress);
    fs.rmSync(path.join(bulkDir, '.resync', 'cobweb.json'), { force: true });

    const resumeOptions = buildBulkOptions(sourceDir, targetDir, bulkDir);
    const result = await runBackwardBulk(resumeOptions, silentLogger, [], true);

    // cobweb.md was retried: back in the aggregate, its stale error dropped.
    expect(result.filesAnalyzed).toBe(3);
    expect(result.filesErrored).toBe(0);
    expect(result.erroredFiles).toEqual([]);
    const after = readProgress(bulkDir)!;
    expect(after.completedFiles).toContain('cobweb.md');
    expect(after.erroredFiles).toEqual([]);
  });

  it('drops stale error records for files no longer in scope, so resume converges', async () => {
    const { sourceDir, targetDir } = setupMultiFileFixture();
    const outputDir = path.join(tmpDir, 'reports');

    const options = buildBulkOptions(sourceDir, targetDir, outputDir);
    await runBackwardBulk(options, silentLogger);

    const repoScopedDir = path.join(outputDir, path.basename(sourceDir));
    const bulkFolder = fs.readdirSync(repoScopedDir).find((f) => f.startsWith('backward-'));
    const bulkDir = path.join(repoScopedDir, bulkFolder!);

    // Pretend cobweb.md errored on the first run — then exclude it on resume,
    // taking it out of scope. Its record must not pin filesErrored > 0 forever.
    const progress = readProgress(bulkDir)!;
    progress.completedFiles = progress.completedFiles.filter((f) => f !== 'cobweb.md');
    progress.erroredFiles = [{ file: 'cobweb.md', error: 'simulated crash' }];
    writeProgress(bulkDir, progress);
    fs.rmSync(path.join(bulkDir, '.resync', 'cobweb.json'), { force: true });

    const resumeOptions = buildBulkOptions(sourceDir, targetDir, bulkDir);
    const result = await runBackwardBulk(resumeOptions, silentLogger, ['cobweb.md'], true);

    expect(result.filesAnalyzed).toBe(2);
    expect(result.filesErrored).toBe(0);
    expect(readProgress(bulkDir)!.erroredFiles).toEqual([]);
  });

  it('converges from a checkpoint whose engine recorded one-sided files as errors (#400)', async () => {
    const { sourceDir, targetDir } = setupOneSidedFixture();
    const outputDir = path.join(tmpDir, 'reports');
    await runBackwardBulk(buildBulkOptions(sourceDir, targetDir, outputDir), silentLogger);
    const repoScopedDir = path.join(outputDir, path.basename(sourceDir));
    const bulkDir = path.join(repoScopedDir, fs.readdirSync(repoScopedDir)[0]);

    // What an older engine left: each one-sided file errored, and cobweb.md too.
    const progress = readProgress(bulkDir)!;
    progress.completedFiles = progress.completedFiles.filter((f) => f !== 'cobweb.md');
    progress.erroredFiles = [
      { file: 'cobweb.md', error: 'simulated crash' },
      { file: 'extra.md', error: 'SOURCE file not found: extra.md' },
      { file: 'untranslated.md', error: 'TARGET file not found: untranslated.md' },
    ];
    writeProgress(bulkDir, progress);
    fs.rmSync(path.join(bulkDir, '.resync', 'cobweb.json'), { force: true });

    const result = await runBackwardBulk(
      buildBulkOptions(sourceDir, targetDir, bulkDir),
      silentLogger,
      [],
      true
    );

    expect(result.filesAnalyzed).toBe(3);
    expect(result.filesErrored).toBe(0);
    expect(result.oneSidedFiles).toHaveLength(3);
    expect(readProgress(bulkDir)!.erroredFiles).toEqual([]);
  });

  it('rejects a schema-violating progress checkpoint instead of casting it (#165)', () => {
    const runDir = path.join(tmpDir, 'run');
    fs.mkdirSync(path.join(runDir, '.resync'), { recursive: true });
    // completedFiles must be an array — the old unvalidated cast handed this
    // straight to .filter()/.map().
    fs.writeFileSync(
      path.join(runDir, '.resync', '_progress.json'),
      JSON.stringify({ startedAt: 'x', lastUpdated: 'x', totalFiles: 1, completedFiles: 'nope' }),
      'utf-8'
    );

    const warnings: string[] = [];
    const logger: BackwardLogger = {
      info: () => {},
      warn: (m) => warnings.push(m),
      error: () => {},
    };
    expect(readProgress(runDir, logger)).toBeNull();
    expect(warnings.join('\n')).toContain('Corrupt progress checkpoint');
  });

  it('should error when no resumable run exists', async () => {
    const emptyDir = path.join(tmpDir, 'no-runs');
    fs.mkdirSync(emptyDir, { recursive: true });
    // Discovery runs first, so the repositories need their lecture sets
    const { sourceDir, targetDir } = setupMultiFileFixture();

    const options = buildBulkOptions(sourceDir, targetDir, emptyDir);

    await expect(runBackwardBulk(options, silentLogger, [], true)).rejects.toThrow(
      'No resumable run found'
    );
  });
});

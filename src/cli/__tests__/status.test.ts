/**
 * Tests for the status command
 *
 * Tests file discovery, per-file status checking, and console output formatting.
 * Uses temporary directories with fixture-style .md files.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';
import {
  discoverMarkdownFiles,
  resolveFilePairs,
  applyExcludes,
  checkFileStatus,
  runStatus,
  formatStatusTable,
  formatStatusJson,
  FileSyncStatus,
  StatusOptions,
  StatusResult,
} from '../commands/status.js';
import { readFileState, writeFileState } from '../translate-state.js';
import { getFileGitMetadata } from '../git-metadata.js';

// ============================================================================
// HELPERS
// ============================================================================

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resync-status-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/**
 * Create a minimal .md file at the given path.
 */
function writeMd(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Run git in a fixture repository, cut off from the machine's git config and
 * GIT_* environment so that signing, hooks or a GIT_DIR cannot reach it.
 * `date` ("YYYY-MM-DD") sets the author and committer dates, at noon UTC.
 */
function git(repo: string, args: string[], date?: string): string {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_')) env[key] = value;
  }
  Object.assign(env, {
    GIT_CONFIG_GLOBAL: os.devNull,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  });
  if (date) {
    env.GIT_AUTHOR_DATE = `${date} 12:00:00 +0000`;
    env.GIT_COMMITTER_DATE = `${date} 12:00:00 +0000`;
  }
  return execFileSync('git', args, {
    cwd: repo,
    env,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** Write files (paths relative to the repo) and commit them on `date`; returns the commit's sha. */
function commit(
  repo: string,
  files: Record<string, string>,
  date: string,
  message: string
): string {
  for (const [file, content] of Object.entries(files)) {
    writeMd(path.join(repo, file), content);
  }
  git(repo, ['add', '--all']);
  git(repo, ['commit', '-q', '--no-verify', '--no-gpg-sign', '-m', message], date);
  return git(repo, ['rev-parse', 'HEAD']).trim();
}

/** Source file with 2 sections */
const SOURCE_2_SECTIONS = `---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
---

# Test Lecture

Intro text.

## Section One

Some content.

## Section Two

More content.
`;

/** Target file with heading-map and 2 sections */
const TARGET_2_SECTIONS_WITH_MAP = `---
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

一些内容。

## 第二节

更多内容。
`;

/** Target file without heading-map */
const TARGET_NO_HEADINGMAP = `---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
---

# 测试讲座

介绍文字。

## 第一节

一些内容。

## 第二节

更多内容。
`;

/** Target file with 3 sections (drift) */
const TARGET_3_SECTIONS = `---
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

一些内容。

## 第二节

更多内容。

## 额外的部分

额外的内容。
`;

// ============================================================================
// FILE DISCOVERY
// ============================================================================

describe('discoverMarkdownFiles', () => {
  it('should find .md files in a directory', () => {
    const docsDir = path.join(tmpDir, 'lectures');
    writeMd(path.join(docsDir, 'intro.md'), '# Intro');
    writeMd(path.join(docsDir, 'cobweb.md'), '# Cobweb');
    writeMd(path.join(docsDir, 'solow.md'), '# Solow');

    const files = discoverMarkdownFiles(tmpDir, 'lectures');

    expect(files).toEqual(['cobweb.md', 'intro.md', 'solow.md']);
  });

  it('should return empty array for missing directory', () => {
    const files = discoverMarkdownFiles(tmpDir, 'nonexistent');
    expect(files).toEqual([]);
  });

  it('should ignore non-.md files', () => {
    const docsDir = path.join(tmpDir, 'lectures');
    writeMd(path.join(docsDir, 'intro.md'), '# Intro');
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, '_toc.yml'), 'toc content');
    fs.writeFileSync(path.join(docsDir, 'data.csv'), 'x,y\n1,2');

    const files = discoverMarkdownFiles(tmpDir, 'lectures');

    expect(files).toEqual(['intro.md']);
  });
});

describe('resolveFilePairs', () => {
  it('should union and sort files from both repos', () => {
    const source = ['alpha.md', 'beta.md'];
    const target = ['beta.md', 'gamma.md'];

    const result = resolveFilePairs(source, target);

    expect(result).toEqual(['alpha.md', 'beta.md', 'gamma.md']);
  });

  it('should handle identical file lists', () => {
    const files = ['a.md', 'b.md'];
    expect(resolveFilePairs(files, files)).toEqual(['a.md', 'b.md']);
  });

  it('should handle empty lists', () => {
    expect(resolveFilePairs([], [])).toEqual([]);
    expect(resolveFilePairs(['a.md'], [])).toEqual(['a.md']);
  });
});

describe('applyExcludes', () => {
  it('should exclude exact filename matches', () => {
    const files = ['README.md', 'intro.md', 'solow.md'];
    expect(applyExcludes(files, ['README.md'])).toEqual(['intro.md', 'solow.md']);
  });

  it('should exclude wildcard suffix patterns', () => {
    const files = ['intro.md', 'data.yml', 'config.yml'];
    expect(applyExcludes(files, ['*.yml'])).toEqual(['intro.md']);
  });

  it('should handle multiple exclude patterns', () => {
    const files = ['README.md', 'intro.md', 'data.yml'];
    expect(applyExcludes(files, ['README.md', '*.yml'])).toEqual(['intro.md']);
  });

  it('should pass through with empty excludes', () => {
    const files = ['a.md', 'b.md'];
    expect(applyExcludes(files, [])).toEqual(['a.md', 'b.md']);
  });
});

// ============================================================================
// PER-FILE STATUS
// ============================================================================

describe('checkFileStatus', () => {
  it('should return SOURCE_ONLY when target file is missing', async () => {
    const sourceDir = path.join(tmpDir, 'source', 'lectures');
    writeMd(path.join(sourceDir, 'intro.md'), SOURCE_2_SECTIONS);

    const result = await checkFileStatus(
      'intro.md',
      path.join(tmpDir, 'source'),
      path.join(tmpDir, 'target'),
      'lectures'
    );

    expect(result.status).toBe('SOURCE_ONLY');
  });

  it('should return TARGET_ONLY when source file is missing', async () => {
    const targetDir = path.join(tmpDir, 'target', 'lectures');
    writeMd(path.join(targetDir, 'intro.md'), TARGET_2_SECTIONS_WITH_MAP);

    const result = await checkFileStatus(
      'intro.md',
      path.join(tmpDir, 'source'),
      path.join(tmpDir, 'target'),
      'lectures'
    );

    expect(result.status).toBe('TARGET_ONLY');
  });

  it('should return TARGET_AHEAD when target has more sections', async () => {
    const sourceDir = path.join(tmpDir, 'source', 'lectures');
    const targetDir = path.join(tmpDir, 'target', 'lectures');
    writeMd(path.join(sourceDir, 'intro.md'), SOURCE_2_SECTIONS);
    writeMd(path.join(targetDir, 'intro.md'), TARGET_3_SECTIONS);

    const result = await checkFileStatus(
      'intro.md',
      path.join(tmpDir, 'source'),
      path.join(tmpDir, 'target'),
      'lectures'
    );

    expect(result.status).toBe('TARGET_AHEAD');
    expect(result.flags).toContain('TARGET_AHEAD');
    expect(result.sourceSections).toBe(2);
    expect(result.targetSections).toBe(3);
    expect(result.details).toContain('3 target vs 2 source');
  });

  it('should return SOURCE_AHEAD when source has more sections', async () => {
    const sourceDir = path.join(tmpDir, 'source', 'lectures');
    const targetDir = path.join(tmpDir, 'target', 'lectures');
    writeMd(path.join(sourceDir, 'intro.md'), TARGET_3_SECTIONS); // 3 sections as source
    writeMd(path.join(targetDir, 'intro.md'), SOURCE_2_SECTIONS); // 2 sections as target (fewer)

    const result = await checkFileStatus(
      'intro.md',
      path.join(tmpDir, 'source'),
      path.join(tmpDir, 'target'),
      'lectures'
    );

    expect(result.status).toBe('SOURCE_AHEAD');
    expect(result.flags).toContain('SOURCE_AHEAD');
    expect(result.sourceSections).toBe(3);
    expect(result.targetSections).toBe(2);
    expect(result.details).toContain('3 source vs 2 target');
  });

  it('should report compound flags (section mismatch + missing heading-map)', async () => {
    const sourceDir = path.join(tmpDir, 'source', 'lectures');
    const targetDir = path.join(tmpDir, 'target', 'lectures');
    writeMd(path.join(sourceDir, 'intro.md'), SOURCE_2_SECTIONS);
    // Target with 3 sections and no heading-map
    writeMd(
      path.join(targetDir, 'intro.md'),
      TARGET_NO_HEADINGMAP + '\n## 额外的部分\n\n额外的内容。\n'
    );

    const result = await checkFileStatus(
      'intro.md',
      path.join(tmpDir, 'source'),
      path.join(tmpDir, 'target'),
      'lectures'
    );

    // Primary status is TARGET_AHEAD (highest priority)
    expect(result.status).toBe('TARGET_AHEAD');
    // Both flags should be present
    expect(result.flags).toContain('TARGET_AHEAD');
    expect(result.flags).toContain('MISSING_HEADINGMAP');
  });

  it('should return MISSING_HEADINGMAP when target has no heading-map', async () => {
    const sourceDir = path.join(tmpDir, 'source', 'lectures');
    const targetDir = path.join(tmpDir, 'target', 'lectures');
    writeMd(path.join(sourceDir, 'intro.md'), SOURCE_2_SECTIONS);
    writeMd(path.join(targetDir, 'intro.md'), TARGET_NO_HEADINGMAP);

    const result = await checkFileStatus(
      'intro.md',
      path.join(tmpDir, 'source'),
      path.join(tmpDir, 'target'),
      'lectures'
    );

    expect(result.status).toBe('MISSING_HEADINGMAP');
  });

  it('should return ALIGNED when structure matches and heading-map present', async () => {
    const sourceDir = path.join(tmpDir, 'source', 'lectures');
    const targetDir = path.join(tmpDir, 'target', 'lectures');
    writeMd(path.join(sourceDir, 'intro.md'), SOURCE_2_SECTIONS);
    writeMd(path.join(targetDir, 'intro.md'), TARGET_2_SECTIONS_WITH_MAP);

    const result = await checkFileStatus(
      'intro.md',
      path.join(tmpDir, 'source'),
      path.join(tmpDir, 'target'),
      'lectures'
    );

    // Without git history in tmpDir, dates won't be available, so ALIGNED
    expect(result.status).toBe('ALIGNED');
    expect(result.sourceSections).toBe(2);
    expect(result.targetSections).toBe(2);
  });

  it('should return NOT_FOUND when file is missing from both repos', async () => {
    // Neither source nor target directories have the file
    const result = await checkFileStatus(
      'nonexistent.md',
      path.join(tmpDir, 'source'),
      path.join(tmpDir, 'target'),
      'lectures'
    );

    expect(result.status).toBe('NOT_FOUND');
    expect(result.flags).toContain('NOT_FOUND');
    expect(result.details).toContain('not found in either repo');
  });

  it('should NOT flag MISSING_HEADINGMAP for title-only files (no ## sections)', async () => {
    const sourceDir = path.join(tmpDir, 'source', 'lectures');
    const targetDir = path.join(tmpDir, 'target', 'lectures');

    // Title-only source (no ## headings)
    const titleOnlySource = `---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
---

# Status

This file has only a title, no sections.
`;

    // Title-only target (no ## headings, no heading-map needed)
    const titleOnlyTarget = `---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
---

# 状态

这个文件只有标题，没有章节。
`;

    writeMd(path.join(sourceDir, 'status.md'), titleOnlySource);
    writeMd(path.join(targetDir, 'status.md'), titleOnlyTarget);

    const result = await checkFileStatus(
      'status.md',
      path.join(tmpDir, 'source'),
      path.join(tmpDir, 'target'),
      'lectures'
    );

    expect(result.status).toBe('ALIGNED');
    expect(result.flags).not.toContain('MISSING_HEADINGMAP');
    expect(result.sourceSections).toBe(0);
    expect(result.targetSections).toBe(0);
  });
});

// ============================================================================
// FULL STATUS RUN
// ============================================================================

describe('runStatus', () => {
  it('should analyze multiple files and produce summaries', async () => {
    const sourceDir = path.join(tmpDir, 'source', 'lectures');
    const targetDir = path.join(tmpDir, 'target', 'lectures');

    // aligned file
    writeMd(path.join(sourceDir, 'aligned.md'), SOURCE_2_SECTIONS);
    writeMd(path.join(targetDir, 'aligned.md'), TARGET_2_SECTIONS_WITH_MAP);

    // drift file
    writeMd(path.join(sourceDir, 'drift.md'), SOURCE_2_SECTIONS);
    writeMd(path.join(targetDir, 'drift.md'), TARGET_3_SECTIONS);

    // source-only
    writeMd(path.join(sourceDir, 'new-lecture.md'), SOURCE_2_SECTIONS);

    // target-only
    writeMd(path.join(targetDir, 'old-lecture.md'), TARGET_2_SECTIONS_WITH_MAP);

    const result = await runStatus({
      source: path.join(tmpDir, 'source'),
      target: path.join(tmpDir, 'target'),
      docsFolder: 'lectures',
      language: 'zh-cn',
      exclude: [],
    });

    expect(result.entries).toHaveLength(4);
    expect(result.summary.total).toBe(4);
    expect(result.summary.aligned).toBe(1);
    expect(result.summary.targetAhead).toBe(1);
    expect(result.summary.sourceOnly).toBe(1);
    expect(result.summary.targetOnly).toBe(1);
  });

  it('should apply exclude patterns', async () => {
    const sourceDir = path.join(tmpDir, 'source', 'lectures');
    const targetDir = path.join(tmpDir, 'target', 'lectures');

    writeMd(path.join(sourceDir, 'README.md'), '# README');
    writeMd(path.join(sourceDir, 'intro.md'), SOURCE_2_SECTIONS);
    writeMd(path.join(targetDir, 'intro.md'), TARGET_2_SECTIONS_WITH_MAP);

    const result = await runStatus({
      source: path.join(tmpDir, 'source'),
      target: path.join(tmpDir, 'target'),
      docsFolder: 'lectures',
      language: 'zh-cn',
      exclude: ['README.md'],
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].file).toBe('intro.md');
  });

  it('should handle empty docs folders', async () => {
    const result = await runStatus({
      source: path.join(tmpDir, 'source'),
      target: path.join(tmpDir, 'target'),
      docsFolder: 'lectures',
      language: 'zh-cn',
      exclude: [],
    });

    expect(result.entries).toHaveLength(0);
    expect(result.summary.total).toBe(0);
  });

  it('should check a single file when --file is provided', async () => {
    const sourceDir = path.join(tmpDir, 'source', 'lectures');
    const targetDir = path.join(tmpDir, 'target', 'lectures');

    // Create multiple files
    writeMd(path.join(sourceDir, 'aligned.md'), SOURCE_2_SECTIONS);
    writeMd(path.join(targetDir, 'aligned.md'), TARGET_2_SECTIONS_WITH_MAP);
    writeMd(path.join(sourceDir, 'drift.md'), SOURCE_2_SECTIONS);
    writeMd(path.join(targetDir, 'drift.md'), TARGET_3_SECTIONS);

    const result = await runStatus({
      source: path.join(tmpDir, 'source'),
      target: path.join(tmpDir, 'target'),
      docsFolder: 'lectures',
      language: 'zh-cn',
      exclude: [],
      file: 'drift.md',
    });

    // Should only contain the single requested file
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].file).toBe('drift.md');
    expect(result.entries[0].status).toBe('TARGET_AHEAD');
    expect(result.summary.total).toBe(1);
  });
});

// ============================================================================
// CONSOLE OUTPUT FORMAT
// ============================================================================

describe('formatStatusTable', () => {
  it('should format a readable console table', () => {
    const result = {
      sourceRepo: '/path/to/source',
      targetRepo: '/path/to/target',
      language: 'zh-cn',
      entries: [
        {
          file: 'intro.md',
          status: 'ALIGNED' as FileSyncStatus,
          flags: ['ALIGNED' as FileSyncStatus],
        },
        {
          file: 'cobweb.md',
          status: 'OUTDATED' as FileSyncStatus,
          flags: ['OUTDATED' as FileSyncStatus],
          details: 'SOURCE modified 2026-03-01, TARGET modified 2026-02-15',
        },
        {
          file: 'new.md',
          status: 'SOURCE_ONLY' as FileSyncStatus,
          flags: ['SOURCE_ONLY' as FileSyncStatus],
        },
      ],
      summary: {
        total: 3,
        aligned: 1,
        outdated: 1,
        sourceAhead: 0,
        targetAhead: 0,
        missingHeadingMap: 0,
        sourceOnly: 1,
        targetOnly: 0,
        notFound: 0,
      },
    };

    const output = formatStatusTable(result);

    expect(output).toContain('Sync Status:');
    expect(output).toContain('intro.md');
    expect(output).toContain('ALIGNED');
    expect(output).toContain('cobweb.md');
    expect(output).toContain('OUTDATED');
    expect(output).toContain('new.md');
    expect(output).toContain('SOURCE_ONLY');
    expect(output).toContain('Summary:');
    expect(output).toContain('3 files total');
    expect(output).toContain('1 aligned');
    expect(output).toContain('1 outdated');
    expect(output).toContain('1 source only');
  });

  it('should hide zero-count summary lines', () => {
    const result = {
      sourceRepo: '/path/to/source',
      targetRepo: '/path/to/target',
      language: 'zh-cn',
      entries: [
        {
          file: 'intro.md',
          status: 'ALIGNED' as FileSyncStatus,
          flags: ['ALIGNED' as FileSyncStatus],
        },
      ],
      summary: {
        total: 1,
        aligned: 1,
        outdated: 0,
        sourceAhead: 0,
        targetAhead: 0,
        missingHeadingMap: 0,
        sourceOnly: 0,
        targetOnly: 0,
        notFound: 0,
      },
    };

    const output = formatStatusTable(result);

    expect(output).toContain('1 aligned');
    expect(output).not.toContain('outdated');
    expect(output).not.toContain('source ahead');
    expect(output).not.toContain('source only');
    expect(output).not.toContain('target only');
  });
});

describe('formatStatusJson', () => {
  it('should produce valid JSON', () => {
    const result = {
      sourceRepo: '/path/to/source',
      targetRepo: '/path/to/target',
      language: 'zh-cn',
      entries: [
        {
          file: 'intro.md',
          status: 'ALIGNED' as FileSyncStatus,
          flags: ['ALIGNED' as FileSyncStatus],
        },
      ],
      summary: {
        total: 1,
        aligned: 1,
        outdated: 0,
        sourceAhead: 0,
        targetAhead: 0,
        missingHeadingMap: 0,
        sourceOnly: 0,
        targetOnly: 0,
        notFound: 0,
      },
    };

    const json = formatStatusJson(result);
    const parsed = JSON.parse(json);

    expect(parsed.language).toBe('zh-cn');
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].status).toBe('ALIGNED');
  });
});

// ============================================================================
// --write-state SAFEGUARD
// ============================================================================

describe('--write-state safeguard', () => {
  it('should block --write-state when SOURCE files are newer than TARGET (no git dates in tmpDir → allowed)', async () => {
    // In tmpDir there is no git history, so sourceLastModified/targetLastModified
    // are both undefined → no stale files detected → write-state proceeds
    const sourceDir = path.join(tmpDir, 'source', 'lectures');
    const targetDir = path.join(tmpDir, 'target', 'lectures');
    writeMd(path.join(sourceDir, 'intro.md'), SOURCE_2_SECTIONS);
    writeMd(path.join(targetDir, 'intro.md'), TARGET_2_SECTIONS_WITH_MAP);

    // Should NOT throw (no git dates to compare)
    const result = await runStatus({
      source: path.join(tmpDir, 'source'),
      target: path.join(tmpDir, 'target'),
      docsFolder: 'lectures',
      language: 'zh-cn',
      exclude: [],
      writeState: true,
    });

    expect(result.entries).toHaveLength(1);
    // Config should have been written
    expect(fs.existsSync(path.join(tmpDir, 'target', '.translate', 'config.yml'))).toBe(true);
  });

  it('refuses to overwrite a corrupt state file without --force (#165)', async () => {
    const sourceDir = path.join(tmpDir, 'source', 'lectures');
    const targetDir = path.join(tmpDir, 'target', 'lectures');
    writeMd(path.join(sourceDir, 'intro.md'), SOURCE_2_SECTIONS);
    writeMd(path.join(targetDir, 'intro.md'), TARGET_2_SECTIONS_WITH_MAP);
    const statePath = path.join(tmpDir, 'target', '.translate', 'state', 'intro.md.yml');
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, '{{{ not yaml at all', 'utf-8');

    await expect(
      runStatus({
        source: path.join(tmpDir, 'source'),
        target: path.join(tmpDir, 'target'),
        docsFolder: 'lectures',
        language: 'zh-cn',
        exclude: [],
        writeState: true,
      })
    ).rejects.toThrow(/corrupt/i);

    // --force is the explicit escape hatch
    const result = await runStatus({
      source: path.join(tmpDir, 'source'),
      target: path.join(tmpDir, 'target'),
      docsFolder: 'lectures',
      language: 'zh-cn',
      exclude: [],
      writeState: true,
      force: true,
    });
    expect(result.entries).toHaveLength(1);
  });

  it('should allow --write-state with --force even when dates would block', async () => {
    const sourceDir = path.join(tmpDir, 'source', 'lectures');
    const targetDir = path.join(tmpDir, 'target', 'lectures');
    writeMd(path.join(sourceDir, 'intro.md'), SOURCE_2_SECTIONS);
    writeMd(path.join(targetDir, 'intro.md'), TARGET_2_SECTIONS_WITH_MAP);

    // With --force, should always succeed regardless of dates
    const result = await runStatus({
      source: path.join(tmpDir, 'source'),
      target: path.join(tmpDir, 'target'),
      docsFolder: 'lectures',
      language: 'zh-cn',
      exclude: [],
      writeState: true,
      force: true,
    });

    expect(result.entries).toHaveLength(1);
    expect(fs.existsSync(path.join(tmpDir, 'target', '.translate', 'config.yml'))).toBe(true);
  });

  it('should allow --write-state when files are aligned and have no git dates', async () => {
    // Without git history in tmpDir, sourceLastModified/targetLastModified are
    // both undefined → no stale files → write-state proceeds.
    const sourceDir = path.join(tmpDir, 'source', 'lectures');
    const targetDir = path.join(tmpDir, 'target', 'lectures');
    writeMd(path.join(sourceDir, 'intro.md'), SOURCE_2_SECTIONS);
    writeMd(path.join(targetDir, 'intro.md'), TARGET_2_SECTIONS_WITH_MAP);

    await expect(
      runStatus({
        source: path.join(tmpDir, 'source'),
        target: path.join(tmpDir, 'target'),
        docsFolder: 'lectures',
        language: 'zh-cn',
        exclude: [],
        writeState: true,
      })
    ).resolves.toBeDefined();
  });

  it('should reject --write-state combined with --check-sync', async () => {
    const sourceDir = path.join(tmpDir, 'source', 'lectures');
    const targetDir = path.join(tmpDir, 'target', 'lectures');
    writeMd(path.join(sourceDir, 'intro.md'), SOURCE_2_SECTIONS);
    writeMd(path.join(targetDir, 'intro.md'), TARGET_2_SECTIONS_WITH_MAP);

    await expect(
      runStatus({
        source: path.join(tmpDir, 'source'),
        target: path.join(tmpDir, 'target'),
        docsFolder: 'lectures',
        language: 'zh-cn',
        exclude: [],
        writeState: true,
        checkSync: true,
        apiKey: 'test-key',
        testMode: true,
      })
    ).rejects.toThrow('cannot be used together');
  });

  it('should preserve model from existing state file instead of overwriting with unknown', async () => {
    const sourceDir = path.join(tmpDir, 'source', 'lectures');
    const targetDir = path.join(tmpDir, 'target', 'lectures');
    writeMd(path.join(sourceDir, 'intro.md'), SOURCE_2_SECTIONS);
    writeMd(path.join(targetDir, 'intro.md'), TARGET_2_SECTIONS_WITH_MAP);

    // Pre-seed a state file (as forward would)
    writeFileState(path.join(tmpDir, 'target'), 'intro.md', {
      'source-sha': 'abc123',
      'synced-at': '2026-03-01',
      model: 'claude-sonnet-4-20250514',
      mode: 'RESYNC',
      'section-count': 2,
    });

    // --write-state should preserve the existing model
    await runStatus({
      source: path.join(tmpDir, 'source'),
      target: path.join(tmpDir, 'target'),
      docsFolder: 'lectures',
      language: 'zh-cn',
      exclude: [],
      writeState: true,
    });

    const state = readFileState(path.join(tmpDir, 'target'), 'intro.md');
    expect(state?.model).toBe('claude-sonnet-4-20250514');
  });

  it('should write unknown model when no existing state file exists', async () => {
    const sourceDir = path.join(tmpDir, 'source', 'lectures');
    const targetDir = path.join(tmpDir, 'target', 'lectures');
    writeMd(path.join(sourceDir, 'intro.md'), SOURCE_2_SECTIONS);
    writeMd(path.join(targetDir, 'intro.md'), TARGET_2_SECTIONS_WITH_MAP);

    // No pre-existing state file
    await runStatus({
      source: path.join(tmpDir, 'source'),
      target: path.join(tmpDir, 'target'),
      docsFolder: 'lectures',
      language: 'zh-cn',
      exclude: [],
      writeState: true,
    });

    const state = readFileState(path.join(tmpDir, 'target'), 'intro.md');
    expect(state?.model).toBe('unknown');
  });
});

// ============================================================================
// --write-state CARRIED-CHANGE GUARD (#380)
// ============================================================================

describe('--write-state carried-change guard (#380)', () => {
  /** The English after a fix the translation has not carried */
  const SOURCE_FIXED = SOURCE_2_SECTIONS.replace('Some content.', 'Some corrected content.');
  /** The translation after a reviewer's suggestion, which carries no English change */
  const TARGET_REVIEWED = TARGET_2_SECTIONS_WITH_MAP.replace('一些内容。', '一些修订过的内容。');
  /** A well-formed commit that neither fixture repository has */
  const ABSENT_SHA = '0123456789abcdef0123456789abcdef01234567';

  let source: string;
  let target: string;

  beforeEach(() => {
    source = path.join(tmpDir, 'source');
    target = path.join(tmpDir, 'target');
    for (const repo of [source, target]) {
      fs.mkdirSync(repo, { recursive: true });
      git(repo, ['init', '-q']);
    }
  });

  /** The state file a draft from `sha` leaves behind */
  function recordSyncPoint(sha: string, file = 'lecture.md'): void {
    writeFileState(target, file, {
      'source-sha': sha,
      'synced-at': '2026-10-02',
      model: 'claude-sonnet-5',
      mode: 'NEW',
      'section-count': 2,
    });
  }

  function statusOf(extra: Partial<StatusOptions> = {}): Promise<StatusResult> {
    return runStatus({
      source,
      target,
      docsFolder: 'lectures',
      language: 'ja',
      exclude: [],
      ...extra,
    });
  }

  function writeState(extra: Partial<StatusOptions> = {}): Promise<StatusResult> {
    return statusOf({ writeState: true, ...extra });
  }

  /** The refused run's message (fails the test if the run is not refused) */
  async function refusal(extra: Partial<StatusOptions> = {}): Promise<string> {
    try {
      await writeState(extra);
    } catch (error) {
      return (error as Error).message;
    }
    throw new Error('expected --write-state to be refused');
  }

  /** A commit line as `git log --format='%h %ad %s' --date=short` prints it */
  function commitLine(sha: string, rest: string): RegExp {
    return new RegExp(`\\n    ${sha.slice(0, 4)}[0-9a-f]* ${rest}`);
  }

  /**
   * #380's sequence: the lecture is drafted from English commit A and its state
   * records A; the English is fixed in B; a reviewer's suggestion is then
   * committed to the lecture, so the date guard alone passes it.
   */
  function draftThenUncarriedFix(): { drafted: string; fixed: string } {
    const lecture = 'lectures/lecture.md';
    const drafted = commit(source, { [lecture]: SOURCE_2_SECTIONS }, '2026-10-01', 'Add lecture');
    commit(target, { [lecture]: TARGET_2_SECTIONS_WITH_MAP }, '2026-10-02', 'Draft lecture');
    recordSyncPoint(drafted);
    const fixed = commit(
      source,
      { [lecture]: SOURCE_FIXED },
      '2026-10-05',
      'FIX: lecture cleanup batch'
    );
    commit(target, { [lecture]: TARGET_REVIEWED }, '2026-10-06', 'Apply reviewer suggestion');
    return { drafted, fixed };
  }

  /** The English fix arrives through a --no-ff merge, whose commit the state records (#391) */
  function syncedFromMergeCommit(): { fix: string; merge: string } {
    commit(source, { 'lectures/lecture.md': SOURCE_2_SECTIONS }, '2026-10-01', 'Add lecture');
    git(source, ['checkout', '-q', '-b', 'fix']);
    const fix = commit(source, { 'lectures/lecture.md': SOURCE_FIXED }, '2026-10-03', 'FIX: typo');
    git(source, ['checkout', '-q', '-']);
    git(
      source,
      [
        'merge',
        '-q',
        '--no-ff',
        '--no-verify',
        '--no-gpg-sign',
        '-m',
        'Merge pull request #1',
        'fix',
      ],
      '2026-10-03'
    );
    const merge = git(source, ['rev-parse', 'HEAD']).trim();
    commit(target, { 'lectures/lecture.md': TARGET_REVIEWED }, '2026-10-04', 'Sync from #1');
    recordSyncPoint(merge);
    return { fix, merge };
  }

  it('refuses English changes after the sync point when the lecture has a later commit', async () => {
    const { drafted, fixed } = draftThenUncarriedFix();

    // The premise: the lecture reads OUTDATED, and the date guard alone passes it
    expect((await statusOf()).entries[0].status).toBe('OUTDATED');

    const message = await refusal();
    expect(message).toContain(
      '--write-state blocked: 1 file(s) have English changes since the sync point their state file records.\n' +
        'Recording the current English commit would mark those changes as carried into the translation.\n\n' +
        `  lecture.md  (recorded ${drafted.slice(0, 7)})\n`
    );
    expect(message).toMatch(commitLine(fixed, '2026-10-05 FIX: lecture cleanup batch'));
    expect(message).toContain(
      'Options:\n' +
        '  1. Carry each change into the translation and commit it, then rerun with --carried\n' +
        '  2. Use --force to write state anyway (skips every check)'
    );
    expect(message).not.toContain('not in the local source clone');

    // Refused before anything was written
    expect(readFileState(target, 'lecture.md')).toMatchObject({
      'source-sha': drafted,
      mode: 'NEW',
    });
    expect(fs.existsSync(path.join(target, '.translate', 'config.yml'))).toBe(false);
  });

  it('writes the current English commit with --carried, after which the lecture reads ALIGNED', async () => {
    const { fixed } = draftThenUncarriedFix();

    await writeState({ carried: true });

    expect(readFileState(target, 'lecture.md')).toMatchObject({
      'source-sha': fixed,
      'synced-at': '2026-10-06',
      model: 'claude-sonnet-5',
      mode: 'RESYNC',
      'section-count': 2,
    });
    expect((await statusOf()).entries[0].status).toBe('ALIGNED');
  });

  it('passes a recorded commit that did not change the English file', async () => {
    const lastTouched = commit(
      source,
      { 'lectures/lecture.md': SOURCE_2_SECTIONS },
      '2026-10-01',
      'Add lecture'
    );
    const unrelated = commit(source, { 'README.md': '# Lectures\n' }, '2026-10-03', 'Edit README');
    commit(target, { 'lectures/lecture.md': TARGET_2_SECTIONS_WITH_MAP }, '2026-10-04', 'Draft');
    recordSyncPoint(unrelated);

    await writeState();

    expect(readFileState(target, 'lecture.md')?.['source-sha']).toBe(lastTouched);
  });

  it('passes the merge commit sync records when the file is unchanged since (#391)', async () => {
    const { fix, merge } = syncedFromMergeCommit();
    // The premise: the file's last commit is the PR's own commit, not the merge
    const lastCommit = (await getFileGitMetadata(source, 'lectures/lecture.md'))?.lastCommit;
    expect(lastCommit).toBe(fix);
    expect(lastCommit).not.toBe(merge);

    await writeState();

    expect(readFileState(target, 'lecture.md')?.['source-sha']).toBe(fix);
  });

  it('lists only the commits after the recorded one', async () => {
    const { merge } = syncedFromMergeCommit();
    const revised = commit(
      source,
      { 'lectures/lecture.md': SOURCE_FIXED.replace('More content.', 'More content, revised.') },
      '2026-10-05',
      'Revise section two'
    );
    commit(target, { 'lectures/lecture.md': TARGET_2_SECTIONS_WITH_MAP }, '2026-10-06', 'Review');

    const message = await refusal();

    expect(message).toContain(`  lecture.md  (recorded ${merge.slice(0, 7)})\n`);
    expect(message).toMatch(commitLine(revised, '2026-10-05 Revise section two'));
    expect(message).not.toContain('FIX: typo');
  });

  it('refuses a recorded commit that is not in the local source clone, unless --carried', async () => {
    const current = commit(
      source,
      { 'lectures/lecture.md': SOURCE_2_SECTIONS },
      '2026-10-01',
      'Add lecture'
    );
    commit(target, { 'lectures/lecture.md': TARGET_2_SECTIONS_WITH_MAP }, '2026-10-02', 'Draft');
    recordSyncPoint(ABSENT_SHA);

    const message = await refusal();
    expect(message).toContain(
      '  lecture.md  (recorded 0123456, which is not in the local source clone)\n\n' +
        'A recorded commit that is not in the local source clone cannot be checked: ' +
        'pull or unshallow the clone and rerun, or confirm with --carried.\n\n' +
        'Options:'
    );
    expect(readFileState(target, 'lecture.md')?.['source-sha']).toBe(ABSENT_SHA);

    await writeState({ carried: true });
    expect(readFileState(target, 'lecture.md')?.['source-sha']).toBe(current);
  });

  it('finds a recorded commit beyond a shallow clone missing', async () => {
    const upstream = path.join(tmpDir, 'upstream');
    fs.mkdirSync(upstream);
    git(upstream, ['init', '-q']);
    const drafted = commit(
      upstream,
      { 'lectures/lecture.md': SOURCE_2_SECTIONS },
      '2026-10-01',
      'Add lecture'
    );
    commit(upstream, { 'lectures/lecture.md': SOURCE_FIXED }, '2026-10-05', 'FIX: typo');
    source = path.join(tmpDir, 'shallow');
    git(tmpDir, ['clone', '-q', '--depth', '1', `file://${upstream}`, source]);
    commit(target, { 'lectures/lecture.md': TARGET_2_SECTIONS_WITH_MAP }, '2026-10-06', 'Draft');
    recordSyncPoint(drafted);

    const message = await refusal();

    expect(message).toContain(
      `  lecture.md  (recorded ${drafted.slice(0, 7)}, which is not in the local source clone)`
    );
  });

  it("leaves a recorded 'unknown' to the date guard", async () => {
    commit(source, { 'lectures/lecture.md': SOURCE_2_SECTIONS }, '2026-10-01', 'Add lecture');
    commit(target, { 'lectures/lecture.md': TARGET_2_SECTIONS_WITH_MAP }, '2026-10-02', 'Draft');
    recordSyncPoint('unknown');
    const fixed = commit(source, { 'lectures/lecture.md': SOURCE_FIXED }, '2026-10-05', 'FIX');
    commit(target, { 'lectures/lecture.md': TARGET_REVIEWED }, '2026-10-06', 'Review');

    await writeState();
    expect(readFileState(target, 'lecture.md')?.['source-sha']).toBe(fixed);

    // ...which still refuses English dated after the lecture's last commit
    recordSyncPoint('unknown');
    commit(source, { 'lectures/lecture.md': SOURCE_2_SECTIONS }, '2026-10-08', 'Revert FIX');
    await expect(writeState()).rejects.toThrow(/SOURCE commits newer than TARGET/);
  });

  it('leaves a lecture without a state file (bootstrap) to the date guard', async () => {
    commit(source, { 'lectures/lecture.md': SOURCE_2_SECTIONS }, '2026-10-01', 'Add lecture');
    commit(target, { 'lectures/lecture.md': TARGET_2_SECTIONS_WITH_MAP }, '2026-10-02', 'Draft');
    const fixed = commit(source, { 'lectures/lecture.md': SOURCE_FIXED }, '2026-10-05', 'FIX');
    commit(target, { 'lectures/lecture.md': TARGET_REVIEWED }, '2026-10-06', 'Review');

    await writeState();

    expect(readFileState(target, 'lecture.md')).toMatchObject({
      'source-sha': fixed,
      mode: 'RESYNC',
    });
  });

  it('is skipped by --force', async () => {
    const { fixed } = draftThenUncarriedFix();

    await writeState({ force: true });

    expect(readFileState(target, 'lecture.md')?.['source-sha']).toBe(fixed);
  });

  it('--carried does not skip the date guard', async () => {
    const drafted = commit(
      source,
      { 'lectures/lecture.md': SOURCE_2_SECTIONS },
      '2026-10-01',
      'Add lecture'
    );
    commit(target, { 'lectures/lecture.md': TARGET_2_SECTIONS_WITH_MAP }, '2026-10-02', 'Draft');
    recordSyncPoint(drafted);
    commit(source, { 'lectures/lecture.md': SOURCE_FIXED }, '2026-10-05', 'FIX');

    await expect(writeState({ carried: true })).rejects.toThrow(/SOURCE commits newer than TARGET/);
    expect(readFileState(target, 'lecture.md')?.['source-sha']).toBe(drafted);
  });

  it('--carried does not skip the corrupt-file refusal', async () => {
    commit(source, { 'lectures/lecture.md': SOURCE_2_SECTIONS }, '2026-10-01', 'Add lecture');
    commit(target, { 'lectures/lecture.md': TARGET_2_SECTIONS_WITH_MAP }, '2026-10-02', 'Draft');
    const statePath = path.join(target, '.translate', 'state', 'lecture.md.yml');
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, '{{{ not yaml at all', 'utf-8');

    await expect(writeState({ carried: true })).rejects.toThrow(/corrupt/i);
    expect(fs.readFileSync(statePath, 'utf-8')).toBe('{{{ not yaml at all');
  });

  it('reports every refused lecture in one error and writes nothing', async () => {
    const lectures = ['aligned.md', 'lecture.md', 'other.md'];
    const drafted = commit(
      source,
      Object.fromEntries(lectures.map((f) => [`lectures/${f}`, SOURCE_2_SECTIONS])),
      '2026-10-01',
      'Add lectures'
    );
    commit(
      target,
      Object.fromEntries(lectures.map((f) => [`lectures/${f}`, TARGET_2_SECTIONS_WITH_MAP])),
      '2026-10-02',
      'Draft lectures'
    );
    recordSyncPoint(drafted, 'aligned.md'); // its English has not changed
    recordSyncPoint(drafted, 'lecture.md');
    recordSyncPoint(ABSENT_SHA, 'other.md');
    const fixed = commit(
      source,
      { 'lectures/lecture.md': SOURCE_FIXED },
      '2026-10-05',
      'FIX: lecture cleanup batch'
    );
    commit(target, { 'lectures/lecture.md': TARGET_REVIEWED }, '2026-10-06', 'Review');

    const message = await refusal();

    expect(message).toContain('--write-state blocked: 2 file(s) have English changes');
    expect(message).toContain(`  lecture.md  (recorded ${drafted.slice(0, 7)})\n`);
    expect(message).toMatch(commitLine(fixed, '2026-10-05 FIX: lecture cleanup batch'));
    expect(message).toContain(
      '  other.md  (recorded 0123456, which is not in the local source clone)'
    );
    expect(message.indexOf('lecture.md')).toBeLessThan(message.indexOf('other.md'));
    expect(message).not.toContain('aligned.md');
    for (const file of lectures) {
      expect(readFileState(target, file)?.mode).toBe('NEW');
    }
    expect(fs.existsSync(path.join(target, '.translate', 'config.yml'))).toBe(false);
  });

  it('points at the diff when no commit since the recorded one changes the file', async () => {
    commit(source, { 'lectures/lecture.md': SOURCE_2_SECTIONS }, '2026-10-01', 'Add lecture');
    git(source, ['checkout', '-q', '-b', 'draft']);
    const unmerged = commit(
      source,
      { 'lectures/lecture.md': SOURCE_FIXED },
      '2026-10-02',
      'Unmerged English edit'
    );
    git(source, ['checkout', '-q', '-']);
    commit(target, { 'lectures/lecture.md': TARGET_2_SECTIONS_WITH_MAP }, '2026-10-03', 'Draft');
    recordSyncPoint(unmerged);

    const message = await refusal();

    expect(message).toContain(
      `  lecture.md  (recorded ${unmerged.slice(0, 7)})\n` +
        `    (no listed commit; see git diff ${unmerged.slice(0, 7)} HEAD -- lectures/lecture.md, ` +
        `and pull the clone first if the recorded commit is newer than its HEAD)`
    );
  });

  it('refuses an uncarried change that adds a section (primary status SOURCE_AHEAD)', async () => {
    const lecture = 'lectures/lecture.md';
    const drafted = commit(source, { [lecture]: SOURCE_2_SECTIONS }, '2026-10-01', 'Add lecture');
    commit(target, { [lecture]: TARGET_2_SECTIONS_WITH_MAP }, '2026-10-02', 'Draft lecture');
    recordSyncPoint(drafted);
    const added = commit(
      source,
      { [lecture]: `${SOURCE_2_SECTIONS}\n## Section Three\n\nNew content.\n` },
      '2026-10-05',
      'Add section three'
    );
    commit(target, { [lecture]: TARGET_REVIEWED }, '2026-10-06', 'Apply reviewer suggestion');

    // The premise: OUTDATED is a flag here, not the primary status
    const entry = (await statusOf()).entries[0];
    expect(entry.status).toBe('SOURCE_AHEAD');
    expect(entry.flags).toContain('OUTDATED');

    const message = await refusal();
    expect(message).toContain(`  lecture.md  (recorded ${drafted.slice(0, 7)})\n`);
    expect(message).toMatch(commitLine(added, '2026-10-05 Add section three'));
  });

  it('skips a lecture the English renamed, whose old translation and state file remain', async () => {
    const drafted = commit(
      source,
      { 'lectures/old.md': SOURCE_2_SECTIONS },
      '2026-10-01',
      'Add lecture'
    );
    commit(target, { 'lectures/old.md': TARGET_2_SECTIONS_WITH_MAP }, '2026-10-02', 'Draft');
    recordSyncPoint(drafted, 'old.md');
    git(source, ['mv', 'lectures/old.md', 'lectures/new.md']);
    git(source, ['commit', '-q', '--no-verify', '--no-gpg-sign', '-m', 'Rename'], '2026-10-05');

    // The premise: git still dates the old name, to the rename, so only the
    // status skip keeps it out of the guard
    expect((await getFileGitMetadata(source, 'lectures/old.md'))?.lastCommit).toBe(
      git(source, ['rev-parse', 'HEAD']).trim()
    );

    const result = await writeState();

    expect(result.entries.map((e) => e.status)).toEqual(['SOURCE_ONLY', 'TARGET_ONLY']);
    expect(fs.existsSync(path.join(target, '.translate', 'config.yml'))).toBe(true);
    expect(readFileState(target, 'old.md')?.['source-sha']).toBe(drafted);
  });

  it('checks a lecture in a subfolder by its docs-relative path', async () => {
    const lecture = 'lectures/advanced/topic.md';
    const drafted = commit(source, { [lecture]: SOURCE_2_SECTIONS }, '2026-10-01', 'Add lecture');
    commit(target, { [lecture]: TARGET_2_SECTIONS_WITH_MAP }, '2026-10-02', 'Draft lecture');
    recordSyncPoint(drafted, 'advanced/topic.md');
    const fixed = commit(
      source,
      { [lecture]: SOURCE_FIXED },
      '2026-10-05',
      'FIX: lecture cleanup batch'
    );
    commit(target, { [lecture]: TARGET_REVIEWED }, '2026-10-06', 'Apply reviewer suggestion');

    const message = await refusal({ file: 'advanced/topic.md' });
    expect(message).toContain(`  advanced/topic.md  (recorded ${drafted.slice(0, 7)})\n`);
    expect(message).toMatch(commitLine(fixed, '2026-10-05 FIX: lecture cleanup batch'));

    await writeState({ file: 'advanced/topic.md', carried: true });
    expect(readFileState(target, 'advanced/topic.md')?.['source-sha']).toBe(fixed);
  });
});

// ============================================================================
// --check-sync
// ============================================================================

describe('--check-sync', () => {
  it('should add contentSync verdict to entries (test mode)', async () => {
    const sourceDir = path.join(tmpDir, 'source', 'lectures');
    const targetDir = path.join(tmpDir, 'target', 'lectures');
    writeMd(path.join(sourceDir, 'cobweb.md'), SOURCE_2_SECTIONS);
    writeMd(path.join(targetDir, 'cobweb.md'), TARGET_2_SECTIONS_WITH_MAP);

    const result = await runStatus({
      source: path.join(tmpDir, 'source'),
      target: path.join(tmpDir, 'target'),
      docsFolder: 'lectures',
      language: 'zh-cn',
      exclude: [],
      checkSync: true,
      apiKey: 'test-key',
      testMode: true,
    });

    expect(result.entries).toHaveLength(1);
    // In test mode, triage is determined by filename — "cobweb" → CONTENT_CHANGES
    expect(result.entries[0].contentSync).toBe('CONTENT_CHANGES');
  });

  it('should skip content sync for SOURCE_ONLY files', async () => {
    const sourceDir = path.join(tmpDir, 'source', 'lectures');
    writeMd(path.join(sourceDir, 'new-file.md'), SOURCE_2_SECTIONS);

    const result = await runStatus({
      source: path.join(tmpDir, 'source'),
      target: path.join(tmpDir, 'target'),
      docsFolder: 'lectures',
      language: 'zh-cn',
      exclude: [],
      checkSync: true,
      apiKey: 'test-key',
      testMode: true,
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].status).toBe('SOURCE_ONLY');
    expect(result.entries[0].contentSync).toBeUndefined();
  });

  it('should return IDENTICAL for byte-identical files', async () => {
    const sourceDir = path.join(tmpDir, 'source', 'lectures');
    const targetDir = path.join(tmpDir, 'target', 'lectures');
    const content = SOURCE_2_SECTIONS;
    writeMd(path.join(sourceDir, 'same.md'), content);
    writeMd(path.join(targetDir, 'same.md'), content);

    const result = await runStatus({
      source: path.join(tmpDir, 'source'),
      target: path.join(tmpDir, 'target'),
      docsFolder: 'lectures',
      language: 'zh-cn',
      exclude: [],
      checkSync: true,
      apiKey: 'test-key',
      testMode: true,
    });

    expect(result.entries).toHaveLength(1);
    // Byte-identical files get IDENTICAL verdict (checked before test-mode mock)
    expect(result.entries[0].contentSync).toBe('IDENTICAL');
  });

  it('should not run triage when checkSync is false', async () => {
    const sourceDir = path.join(tmpDir, 'source', 'lectures');
    const targetDir = path.join(tmpDir, 'target', 'lectures');
    writeMd(path.join(sourceDir, 'intro.md'), SOURCE_2_SECTIONS);
    writeMd(path.join(targetDir, 'intro.md'), TARGET_2_SECTIONS_WITH_MAP);

    const result = await runStatus({
      source: path.join(tmpDir, 'source'),
      target: path.join(tmpDir, 'target'),
      docsFolder: 'lectures',
      language: 'zh-cn',
      exclude: [],
    });

    expect(result.entries[0].contentSync).toBeUndefined();
  });
});

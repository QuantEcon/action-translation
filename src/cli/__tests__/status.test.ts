/**
 * Tests for the status command
 * 
 * Tests file discovery, per-file status checking, and console output formatting.
 * Uses temporary directories with fixture-style .md files.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  discoverMarkdownFiles,
  resolveFilePairs,
  applyExcludes,
  checkFileStatus,
  runStatus,
  formatStatusTable,
  formatStatusJson,
  FileSyncStatus,
} from '../commands/status';

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
      'lectures',
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
      'lectures',
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
      'lectures',
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
      'lectures',
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
    writeMd(path.join(targetDir, 'intro.md'), TARGET_NO_HEADINGMAP + '\n## 额外的部分\n\n额外的内容。\n');

    const result = await checkFileStatus(
      'intro.md',
      path.join(tmpDir, 'source'),
      path.join(tmpDir, 'target'),
      'lectures',
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
      'lectures',
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
      'lectures',
    );

    // Without git history in tmpDir, dates won't be available, so ALIGNED
    expect(result.status).toBe('ALIGNED');
    expect(result.sourceSections).toBe(2);
    expect(result.targetSections).toBe(2);
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
        { file: 'intro.md', status: 'ALIGNED' as FileSyncStatus, flags: ['ALIGNED' as FileSyncStatus] },
        { file: 'cobweb.md', status: 'OUTDATED' as FileSyncStatus, flags: ['OUTDATED' as FileSyncStatus], details: 'SOURCE modified 2026-03-01, TARGET modified 2026-02-15' },
        { file: 'new.md', status: 'SOURCE_ONLY' as FileSyncStatus, flags: ['SOURCE_ONLY' as FileSyncStatus] },
      ],
      summary: { total: 3, aligned: 1, outdated: 1, sourceAhead: 0, targetAhead: 0, missingHeadingMap: 0, sourceOnly: 1, targetOnly: 0 },
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
        { file: 'intro.md', status: 'ALIGNED' as FileSyncStatus, flags: ['ALIGNED' as FileSyncStatus] },
      ],
      summary: { total: 1, aligned: 1, outdated: 0, sourceAhead: 0, targetAhead: 0, missingHeadingMap: 0, sourceOnly: 0, targetOnly: 0 },
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
        { file: 'intro.md', status: 'ALIGNED' as FileSyncStatus, flags: ['ALIGNED' as FileSyncStatus] },
      ],
      summary: { total: 1, aligned: 1, outdated: 0, sourceAhead: 0, targetAhead: 0, missingHeadingMap: 0, sourceOnly: 0, targetOnly: 0 },
    };

    const json = formatStatusJson(result);
    const parsed = JSON.parse(json);

    expect(parsed.language).toBe('zh-cn');
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].status).toBe('ALIGNED');
  });
});

/**
 * Tests for the headingmap command
 * 
 * Tests heading-map generation by position-based section matching,
 * frontmatter injection, mismatch handling, and console output formatting.
 * Uses temporary directories with fixture-style .md files.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  buildHeadingMap,
  generateHeadingmapForFile,
  runHeadingmap,
  formatHeadingmapTable,
  formatHeadingmapJson,
  HeadingmapOptions,
} from '../commands/headingmap.js';
import { extractHeadingMap } from '../../heading-map.js';

// ============================================================================
// HELPERS
// ============================================================================

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'headingmap-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeMd(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

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

const TARGET_2_SECTIONS_NO_MAP = `---
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

const TARGET_2_SECTIONS_WITH_MAP = `---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
translation:
  title: 测试讲座
  headings:
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

const SOURCE_3_SECTIONS = `---
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

## Section Three

Even more content.
`;

const SOURCE_WITH_SUBSECTIONS = `---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
---

# Test Lecture

Intro text.

## Vector Spaces

Some content about vector spaces.

### Basic Properties

Properties here.

### Applications

Applications here.

## Linear Maps

More content.
`;

const TARGET_WITH_SUBSECTIONS = `---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
---

# 测试讲座

介绍文字。

## 向量空间

关于向量空间的内容。

### 基本性质

性质在这里。

### 应用

应用在这里。

## 线性映射

更多内容。
`;

// ============================================================================
// buildHeadingMap TESTS
// ============================================================================

describe('buildHeadingMap', () => {
  test('builds map from matching sections', () => {
    const source = [
      { heading: '## Section One', level: 2, id: 'section-one', content: '', startLine: 1, endLine: 2, subsections: [] },
      { heading: '## Section Two', level: 2, id: 'section-two', content: '', startLine: 3, endLine: 4, subsections: [] },
    ];
    const target = [
      { heading: '## 第一节', level: 2, id: '第一节', content: '', startLine: 1, endLine: 2, subsections: [] },
      { heading: '## 第二节', level: 2, id: '第二节', content: '', startLine: 3, endLine: 4, subsections: [] },
    ];

    const { map, warnings } = buildHeadingMap(source, target);

    expect(map.size).toBe(2);
    expect(map.get('Section One')).toBe('第一节');
    expect(map.get('Section Two')).toBe('第二节');
    expect(warnings).toHaveLength(0);
  });

  test('handles source-only sections with warnings', () => {
    const source = [
      { heading: '## Section One', level: 2, id: 'section-one', content: '', startLine: 1, endLine: 2, subsections: [] },
      { heading: '## Section Two', level: 2, id: 'section-two', content: '', startLine: 3, endLine: 4, subsections: [] },
    ];
    const target = [
      { heading: '## 第一节', level: 2, id: '第一节', content: '', startLine: 1, endLine: 2, subsections: [] },
    ];

    const { map, warnings } = buildHeadingMap(source, target);

    expect(map.size).toBe(1);
    expect(map.get('Section One')).toBe('第一节');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('SOURCE_ONLY');
    expect(warnings[0]).toContain('Section Two');
  });

  test('handles target-only sections with warnings', () => {
    const source = [
      { heading: '## Section One', level: 2, id: 'section-one', content: '', startLine: 1, endLine: 2, subsections: [] },
    ];
    const target = [
      { heading: '## 第一节', level: 2, id: '第一节', content: '', startLine: 1, endLine: 2, subsections: [] },
      { heading: '## 额外节', level: 2, id: '额外节', content: '', startLine: 3, endLine: 4, subsections: [] },
    ];

    const { map, warnings } = buildHeadingMap(source, target);

    expect(map.size).toBe(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('TARGET_ONLY');
  });

  test('handles subsections with path-based keys', () => {
    const source = [
      {
        heading: '## Vector Spaces', level: 2, id: 'vector-spaces', content: '', startLine: 1, endLine: 6,
        subsections: [
          { heading: '### Basic Properties', level: 3, id: 'basic-properties', content: '', startLine: 3, endLine: 4, subsections: [] },
          { heading: '### Applications', level: 3, id: 'applications', content: '', startLine: 5, endLine: 6, subsections: [] },
        ],
      },
    ];
    const target = [
      {
        heading: '## 向量空间', level: 2, id: '向量空间', content: '', startLine: 1, endLine: 6,
        subsections: [
          { heading: '### 基本性质', level: 3, id: '基本性质', content: '', startLine: 3, endLine: 4, subsections: [] },
          { heading: '### 应用', level: 3, id: '应用', content: '', startLine: 5, endLine: 6, subsections: [] },
        ],
      },
    ];

    const { map, warnings } = buildHeadingMap(source, target);

    expect(map.size).toBe(3);
    expect(map.get('Vector Spaces')).toBe('向量空间');
    expect(map.get('Vector Spaces::Basic Properties')).toBe('基本性质');
    expect(map.get('Vector Spaces::Applications')).toBe('应用');
    expect(warnings).toHaveLength(0);
  });

  test('returns empty map for empty section arrays', () => {
    const { map, warnings } = buildHeadingMap([], []);
    expect(map.size).toBe(0);
    expect(warnings).toHaveLength(0);
  });
});

// ============================================================================
// generateHeadingmapForFile TESTS
// ============================================================================

describe('generateHeadingmapForFile', () => {
  test('generates heading-map for file without existing map', async () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');
    writeMd(path.join(sourceDir, 'lectures', 'intro.md'), SOURCE_2_SECTIONS);
    writeMd(path.join(targetDir, 'lectures', 'intro.md'), TARGET_2_SECTIONS_NO_MAP);

    const result = await generateHeadingmapForFile('intro.md', sourceDir, targetDir, 'lectures');

    expect(result.status).toBe('generated');
    expect(result.matchedSections).toBe(2);
    expect(result.totalSourceSections).toBe(2);
    expect(result.totalTargetSections).toBe(2);
    expect(result.warnings).toHaveLength(0);
  });

  test('reports unchanged when existing map matches', async () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');
    writeMd(path.join(sourceDir, 'lectures', 'intro.md'), SOURCE_2_SECTIONS);
    writeMd(path.join(targetDir, 'lectures', 'intro.md'), TARGET_2_SECTIONS_WITH_MAP);

    const result = await generateHeadingmapForFile('intro.md', sourceDir, targetDir, 'lectures');

    expect(result.status).toBe('unchanged');
  });

  test('detects section count mismatch', async () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');
    writeMd(path.join(sourceDir, 'lectures', 'intro.md'), SOURCE_3_SECTIONS);
    writeMd(path.join(targetDir, 'lectures', 'intro.md'), TARGET_2_SECTIONS_NO_MAP);

    const result = await generateHeadingmapForFile('intro.md', sourceDir, targetDir, 'lectures');

    expect(result.status).toBe('mismatch');
    expect(result.matchedSections).toBe(2);
    expect(result.totalSourceSections).toBe(3);
    expect(result.totalTargetSections).toBe(2);
    expect(result.warnings.some(w => w.includes('Section count mismatch'))).toBe(true);
  });

  test('skips when source file missing', async () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');
    fs.mkdirSync(path.join(sourceDir, 'lectures'), { recursive: true });
    writeMd(path.join(targetDir, 'lectures', 'intro.md'), TARGET_2_SECTIONS_NO_MAP);

    const result = await generateHeadingmapForFile('intro.md', sourceDir, targetDir, 'lectures');

    expect(result.status).toBe('skipped');
    expect(result.warnings).toContain('Source file not found');
  });

  test('skips when target file missing', async () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');
    writeMd(path.join(sourceDir, 'lectures', 'intro.md'), SOURCE_2_SECTIONS);
    fs.mkdirSync(path.join(targetDir, 'lectures'), { recursive: true });

    const result = await generateHeadingmapForFile('intro.md', sourceDir, targetDir, 'lectures');

    expect(result.status).toBe('skipped');
    expect(result.warnings).toContain('Target file not found');
  });

  test('generates heading-map for files with subsections', async () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');
    writeMd(path.join(sourceDir, 'lectures', 'vectors.md'), SOURCE_WITH_SUBSECTIONS);
    writeMd(path.join(targetDir, 'lectures', 'vectors.md'), TARGET_WITH_SUBSECTIONS);

    const result = await generateHeadingmapForFile('vectors.md', sourceDir, targetDir, 'lectures');

    expect(result.status).toBe('generated');
    expect(result.matchedSections).toBe(2); // top-level sections
    expect(result.warnings).toHaveLength(0);
  });
});

// ============================================================================
// runHeadingmap TESTS (integration)
// ============================================================================

describe('runHeadingmap', () => {
  test('processes all files in docs folder', async () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');
    writeMd(path.join(sourceDir, 'lectures', 'intro.md'), SOURCE_2_SECTIONS);
    writeMd(path.join(sourceDir, 'lectures', 'vectors.md'), SOURCE_WITH_SUBSECTIONS);
    writeMd(path.join(targetDir, 'lectures', 'intro.md'), TARGET_2_SECTIONS_NO_MAP);
    writeMd(path.join(targetDir, 'lectures', 'vectors.md'), TARGET_WITH_SUBSECTIONS);

    const options: HeadingmapOptions = {
      source: sourceDir,
      target: targetDir,
      docsFolder: 'lectures',
      exclude: [],
      dryRun: false,
    };

    const result = await runHeadingmap(options);

    expect(result.results).toHaveLength(2);
    expect(result.summary.total).toBe(2);
    expect(result.summary.generated).toBe(2);
    expect(result.summary.skipped).toBe(0);
  });

  test('writes heading-map to target files', async () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');
    writeMd(path.join(sourceDir, 'lectures', 'intro.md'), SOURCE_2_SECTIONS);
    writeMd(path.join(targetDir, 'lectures', 'intro.md'), TARGET_2_SECTIONS_NO_MAP);

    const options: HeadingmapOptions = {
      source: sourceDir,
      target: targetDir,
      docsFolder: 'lectures',
      exclude: [],
      dryRun: false,
    };

    await runHeadingmap(options);

    // Verify the heading-map was written to the target file
    const updatedContent = fs.readFileSync(path.join(targetDir, 'lectures', 'intro.md'), 'utf-8');
    const map = extractHeadingMap(updatedContent);
    expect(map.get('Section One')).toBe('第一节');
    expect(map.get('Section Two')).toBe('第二节');
  });

  test('dry-run does not modify files', async () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');
    writeMd(path.join(sourceDir, 'lectures', 'intro.md'), SOURCE_2_SECTIONS);
    writeMd(path.join(targetDir, 'lectures', 'intro.md'), TARGET_2_SECTIONS_NO_MAP);

    const options: HeadingmapOptions = {
      source: sourceDir,
      target: targetDir,
      docsFolder: 'lectures',
      exclude: [],
      dryRun: true,
    };

    await runHeadingmap(options);

    // Verify the file was NOT modified
    const content = fs.readFileSync(path.join(targetDir, 'lectures', 'intro.md'), 'utf-8');
    const map = extractHeadingMap(content);
    expect(map.size).toBe(0);
  });

  test('single file mode with --file', async () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');
    writeMd(path.join(sourceDir, 'lectures', 'intro.md'), SOURCE_2_SECTIONS);
    writeMd(path.join(sourceDir, 'lectures', 'vectors.md'), SOURCE_WITH_SUBSECTIONS);
    writeMd(path.join(targetDir, 'lectures', 'intro.md'), TARGET_2_SECTIONS_NO_MAP);
    writeMd(path.join(targetDir, 'lectures', 'vectors.md'), TARGET_WITH_SUBSECTIONS);

    const options: HeadingmapOptions = {
      source: sourceDir,
      target: targetDir,
      docsFolder: 'lectures',
      file: 'intro.md',
      exclude: [],
      dryRun: false,
    };

    const result = await runHeadingmap(options);

    expect(result.results).toHaveLength(1);
    expect(result.results[0].file).toBe('intro.md');
    // vectors.md should NOT have been processed
  });

  test('applies exclude patterns', async () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');
    writeMd(path.join(sourceDir, 'lectures', 'intro.md'), SOURCE_2_SECTIONS);
    writeMd(path.join(sourceDir, 'lectures', 'README.md'), SOURCE_2_SECTIONS);
    writeMd(path.join(targetDir, 'lectures', 'intro.md'), TARGET_2_SECTIONS_NO_MAP);
    writeMd(path.join(targetDir, 'lectures', 'README.md'), TARGET_2_SECTIONS_NO_MAP);

    const options: HeadingmapOptions = {
      source: sourceDir,
      target: targetDir,
      docsFolder: 'lectures',
      exclude: ['README.md'],
      dryRun: false,
    };

    const result = await runHeadingmap(options);

    expect(result.results).toHaveLength(1);
    expect(result.results[0].file).toBe('intro.md');
  });

  test('writes subsection heading-maps correctly', async () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');
    writeMd(path.join(sourceDir, 'lectures', 'vectors.md'), SOURCE_WITH_SUBSECTIONS);
    writeMd(path.join(targetDir, 'lectures', 'vectors.md'), TARGET_WITH_SUBSECTIONS);

    const options: HeadingmapOptions = {
      source: sourceDir,
      target: targetDir,
      docsFolder: 'lectures',
      exclude: [],
      dryRun: false,
    };

    await runHeadingmap(options);

    const updatedContent = fs.readFileSync(path.join(targetDir, 'lectures', 'vectors.md'), 'utf-8');
    const map = extractHeadingMap(updatedContent);
    expect(map.get('Vector Spaces')).toBe('向量空间');
    expect(map.get('Vector Spaces::Basic Properties')).toBe('基本性质');
    expect(map.get('Vector Spaces::Applications')).toBe('应用');
    expect(map.get('Linear Maps')).toBe('线性映射');
  });

  test('handles mismatch and still writes partial map', async () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');
    writeMd(path.join(sourceDir, 'lectures', 'intro.md'), SOURCE_3_SECTIONS);
    writeMd(path.join(targetDir, 'lectures', 'intro.md'), TARGET_2_SECTIONS_NO_MAP);

    const options: HeadingmapOptions = {
      source: sourceDir,
      target: targetDir,
      docsFolder: 'lectures',
      exclude: [],
      dryRun: false,
    };

    await runHeadingmap(options);

    // Should still write a partial map for the matched sections
    const updatedContent = fs.readFileSync(path.join(targetDir, 'lectures', 'intro.md'), 'utf-8');
    const map = extractHeadingMap(updatedContent);
    expect(map.get('Section One')).toBe('第一节');
    expect(map.get('Section Two')).toBe('第二节');
    // Section Three has no match, so it's not in the map
    expect(map.has('Section Three')).toBe(false);
  });

  test('updates section-count in .translate/state/ when state exists', async () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');
    writeMd(path.join(sourceDir, 'lectures', 'intro.md'), SOURCE_2_SECTIONS);
    writeMd(path.join(targetDir, 'lectures', 'intro.md'), TARGET_2_SECTIONS_NO_MAP);

    // Seed a .translate/state/ entry with an outdated section-count
    const stateDir = path.join(targetDir, '.translate', 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(
      path.join(stateDir, 'intro.md.yml'),
      'source-sha: abc123\nsynced-at: "2026-01-01"\nmodel: claude-sonnet-4-6\nmode: NEW\nsection-count: 99\ntool-version: 0.8.0\n',
    );

    const options: HeadingmapOptions = {
      source: sourceDir,
      target: targetDir,
      docsFolder: 'lectures',
      exclude: [],
      dryRun: false,
    };

    await runHeadingmap(options);

    // Verify section-count was updated
    const stateContent = fs.readFileSync(path.join(stateDir, 'intro.md.yml'), 'utf-8');
    expect(stateContent).toContain('section-count: 2');
    expect(stateContent).not.toContain('section-count: 99');
  });
});

// ============================================================================
// FORMATTING TESTS
// ============================================================================

describe('formatHeadingmapTable', () => {
  test('formats results table correctly', () => {
    const result = {
      results: [
        { file: 'intro.md', status: 'generated' as const, matchedSections: 2, totalSourceSections: 2, totalTargetSections: 2, warnings: [] },
        { file: 'cobweb.md', status: 'unchanged' as const, matchedSections: 3, totalSourceSections: 3, totalTargetSections: 3, warnings: [] },
      ],
      summary: { total: 2, generated: 1, updated: 0, unchanged: 1, mismatch: 0, skipped: 0 },
    };

    const output = formatHeadingmapTable(result, false);
    expect(output).toContain('Heading-Map Generation');
    expect(output).toContain('intro.md');
    expect(output).toContain('generated');
    expect(output).toContain('cobweb.md');
    expect(output).toContain('unchanged');
    expect(output).not.toContain('dry run');
  });

  test('dry-run header appears when dry-run is true', () => {
    const result = {
      results: [],
      summary: { total: 0, generated: 0, updated: 0, unchanged: 0, mismatch: 0, skipped: 0 },
    };

    const output = formatHeadingmapTable(result, true);
    expect(output).toContain('dry run');
  });

  test('shows warnings in table output', () => {
    const result = {
      results: [
        {
          file: 'intro.md',
          status: 'mismatch' as const,
          matchedSections: 2,
          totalSourceSections: 3,
          totalTargetSections: 2,
          warnings: ['Section count mismatch: 3 source vs 2 target'],
        },
      ],
      summary: { total: 1, generated: 0, updated: 0, unchanged: 0, mismatch: 1, skipped: 0 },
    };

    const output = formatHeadingmapTable(result, false);
    expect(output).toContain('Section count mismatch');
  });
});

describe('formatHeadingmapJson', () => {
  test('formats results as valid JSON', () => {
    const result = {
      results: [
        { file: 'intro.md', status: 'generated' as const, matchedSections: 2, totalSourceSections: 2, totalTargetSections: 2, warnings: [] },
      ],
      summary: { total: 1, generated: 1, updated: 0, unchanged: 0, mismatch: 0, skipped: 0 },
    };

    const output = formatHeadingmapJson(result);
    const parsed = JSON.parse(output);
    expect(parsed.results[0].file).toBe('intro.md');
    expect(parsed.summary.generated).toBe(1);
  });
});

// ============================================================================
// TITLE-ONLY AND IDEMPOTENCE TESTS
// ============================================================================

const SOURCE_TITLE_ONLY = `---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
---

# Preamble Lecture

This lecture has a title but no ## sections.
`;

const TARGET_TITLE_ONLY_NO_MAP = `---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
---

# 前言讲座

本讲座有标题但没有章节。
`;

const TARGET_TITLE_ONLY_WITH_MAP = `---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
translation:
  title: 前言讲座
---

# 前言讲座

本讲座有标题但没有章节。
`;

describe('Title-only files', () => {
  test('generates translation metadata for title-only file', async () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');
    writeMd(path.join(sourceDir, 'lectures', 'preamble.md'), SOURCE_TITLE_ONLY);
    writeMd(path.join(targetDir, 'lectures', 'preamble.md'), TARGET_TITLE_ONLY_NO_MAP);

    const result = await generateHeadingmapForFile('preamble.md', sourceDir, targetDir, 'lectures');

    expect(result.status).toBe('generated');
    expect(result.generatedTitle).toBe('前言讲座');
  });

  test('writes title-only translation metadata to file', async () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');
    writeMd(path.join(sourceDir, 'lectures', 'preamble.md'), SOURCE_TITLE_ONLY);
    writeMd(path.join(targetDir, 'lectures', 'preamble.md'), TARGET_TITLE_ONLY_NO_MAP);

    const options: HeadingmapOptions = {
      source: sourceDir,
      target: targetDir,
      docsFolder: 'lectures',
      exclude: [],
      dryRun: false,
    };

    await runHeadingmap(options);

    const updatedContent = fs.readFileSync(path.join(targetDir, 'lectures', 'preamble.md'), 'utf-8');
    expect(updatedContent).toContain('translation:');
    expect(updatedContent).toContain('title: 前言讲座');
  });

  test('reports unchanged on second run (idempotence)', async () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');
    writeMd(path.join(sourceDir, 'lectures', 'preamble.md'), SOURCE_TITLE_ONLY);
    writeMd(path.join(targetDir, 'lectures', 'preamble.md'), TARGET_TITLE_ONLY_WITH_MAP);

    const result = await generateHeadingmapForFile('preamble.md', sourceDir, targetDir, 'lectures');

    expect(result.status).toBe('unchanged');
  });

  test('idempotence: run twice, second is unchanged', async () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');
    writeMd(path.join(sourceDir, 'lectures', 'preamble.md'), SOURCE_TITLE_ONLY);
    writeMd(path.join(targetDir, 'lectures', 'preamble.md'), TARGET_TITLE_ONLY_NO_MAP);

    const options: HeadingmapOptions = {
      source: sourceDir,
      target: targetDir,
      docsFolder: 'lectures',
      exclude: [],
      dryRun: false,
    };

    // First run — should generate
    const first = await runHeadingmap(options);
    expect(first.summary.generated).toBe(1);

    // Second run — should be unchanged
    const second = await runHeadingmap(options);
    expect(second.summary.unchanged).toBe(1);
  });
});

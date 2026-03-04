/**
 * Tests for bulk backward processing
 * 
 * Tests file discovery, checkpointing, cost estimation, and bulk orchestration.
 * Uses --test mode (no LLM calls) with temporary directories.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  runBackwardBulk,
  buildBulkReport,
  buildBulkOutputDir,
  estimateBulkCost,
  formatCostEstimate,
  readProgress,
  writeProgress,
  discoverBulkFiles,
  BulkProgress,
  BackwardLogger,
} from '../commands/backward.js';
import { BackwardOptions, BackwardReport } from '../types.js';

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

  return { sourceDir, targetDir };
}

function buildBulkOptions(
  sourceDir: string,
  targetDir: string,
  outputDir: string,
  overrides: Partial<BackwardOptions & { apiKey: string }> = {},
): BackwardOptions & { apiKey: string } {
  return {
    source: sourceDir,
    target: targetDir,
    file: undefined,
    docsFolder: 'lectures',
    language: 'zh-cn',
    output: outputDir,
    model: 'claude-sonnet-4-6',
    json: false,
    test: true,
    minConfidence: 0.6,
    estimate: false,
    apiKey: 'test-key',
    ...overrides,
  };
}

// ============================================================================
// COST ESTIMATION
// ============================================================================

describe('estimateBulkCost', () => {
  it('should estimate cost for a medium repo', () => {
    const estimate = estimateBulkCost(50);

    expect(estimate.totalFiles).toBe(50);
    expect(estimate.stage1Calls).toBe(50);
    expect(estimate.estimatedFlaggedFiles).toBeGreaterThan(0);
    expect(estimate.estimatedFlaggedFiles).toBeLessThanOrEqual(10);
    expect(estimate.estimatedCostUsd).toBeGreaterThan(0);
    expect(estimate.estimatedTimeMinutes).toBeGreaterThan(0);
  });

  it('should estimate at least 1 flagged file', () => {
    const estimate = estimateBulkCost(1);
    expect(estimate.estimatedFlaggedFiles).toBe(1);
  });

  it('should format cost estimate as readable string', () => {
    const estimate = estimateBulkCost(50);
    const output = formatCostEstimate(estimate);

    expect(output).toContain('Cost Estimate');
    expect(output).toContain('50');
    expect(output).toContain('$');
    expect(output).toContain('min');
    expect(output).toContain('1 per flagged file');
  });
});

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
  it('should create a date-stamped folder name', () => {
    const dir = buildBulkOutputDir('./reports');

    // Should be in the format: reports/backward-YYYY-MM-DD
    expect(dir).toMatch(/reports[/\\]backward-\d{4}-\d{2}-\d{2}$/);
  });
});

// ============================================================================
// FILE DISCOVERY
// ============================================================================

describe('discoverBulkFiles', () => {
  it('should discover files from both repos', () => {
    const { sourceDir, targetDir } = setupMultiFileFixture();
    const files = discoverBulkFiles(sourceDir, targetDir, 'lectures', []);

    expect(files).toHaveLength(3);
    expect(files).toContain('intro.md');
    expect(files).toContain('aligned-basics.md');
    expect(files).toContain('cobweb.md');
  });

  it('should apply exclude patterns', () => {
    const { sourceDir, targetDir } = setupMultiFileFixture();
    const files = discoverBulkFiles(sourceDir, targetDir, 'lectures', ['intro.md']);

    expect(files).toHaveLength(2);
    expect(files).not.toContain('intro.md');
  });
});

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
    expect(bulk.highConfidence).toBe(1);   // 0.9 >= 0.85
    expect(bulk.mediumConfidence).toBe(0);
    expect(bulk.lowConfidence).toBe(0);
    expect(bulk.fileReports).toHaveLength(2);
  });

  it('should handle empty report list', () => {
    const bulk = buildBulkReport('/source', '/target', 'zh-cn', []);

    expect(bulk.filesAnalyzed).toBe(0);
    expect(bulk.filesInSync).toBe(0);
    expect(bulk.totalSuggestions).toBe(0);
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

    // Check that output folder was created (timestamped)
    const outputContents = fs.readdirSync(outputDir);
    expect(outputContents.length).toBeGreaterThan(0);
    const bulkFolder = outputContents.find(f => f.startsWith('backward-'));
    expect(bulkFolder).toBeDefined();

    // Check aggregate summary was written
    const bulkDir = path.join(outputDir, bulkFolder!);
    expect(fs.existsSync(path.join(bulkDir, '_summary.md'))).toBe(true);
    expect(fs.existsSync(path.join(bulkDir, '.resync', '_progress.json'))).toBe(true);
  });

  it('should write per-file reports', async () => {
    const { sourceDir, targetDir } = setupMultiFileFixture();
    const outputDir = path.join(tmpDir, 'reports');

    const options = buildBulkOptions(sourceDir, targetDir, outputDir);
    await runBackwardBulk(options, silentLogger);

    // Find the timestamped folder
    const bulkFolder = fs.readdirSync(outputDir).find(f => f.startsWith('backward-'));
    const bulkDir = path.join(outputDir, bulkFolder!);

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

    const bulkFolder = fs.readdirSync(outputDir).find(f => f.startsWith('backward-'));
    const bulkDir = path.join(outputDir, bulkFolder!);

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

  it('should return immediately for --estimate', async () => {
    const { sourceDir, targetDir } = setupMultiFileFixture();
    const outputDir = path.join(tmpDir, 'reports');

    const logged: string[] = [];
    const captureLogger: BackwardLogger = {
      info: (msg) => logged.push(msg),
      warn: () => {},
      error: () => {},
    };

    const options = buildBulkOptions(sourceDir, targetDir, outputDir, { estimate: true });
    const result = await runBackwardBulk(options, captureLogger);

    // Should not have processed any files
    expect(result.filesAnalyzed).toBe(0);

    // Should have printed cost estimate
    const allOutput = logged.join('\n');
    expect(allOutput).toContain('Cost Estimate');
  });

  it('should handle empty docs folder gracefully', async () => {
    const sourceDir = path.join(tmpDir, 'empty-source');
    const targetDir = path.join(tmpDir, 'empty-target');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });

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

    // Find the bulk folder
    const bulkFolder = fs.readdirSync(outputDir).find(f => f.startsWith('backward-'));
    const bulkDir = path.join(outputDir, bulkFolder!);

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

  it('should error when no resumable run exists', async () => {
    const emptyDir = path.join(tmpDir, 'no-runs');
    fs.mkdirSync(emptyDir, { recursive: true });

    const options = buildBulkOptions(
      path.join(tmpDir, 'source'),
      path.join(tmpDir, 'target'),
      emptyDir,
    );

    await expect(runBackwardBulk(options, silentLogger, [], true))
      .rejects.toThrow('No resumable run found');
  });
});

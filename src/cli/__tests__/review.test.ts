/**
 * Tests for the review command loading + filtering pipeline.
 *
 * Tests cover:
 * - loadAndFlattenSuggestions: loading, filtering, sorting, stats
 * - formatLoadSummary: display strings
 * - Edge cases: empty dirs, load errors, no suggestions, multiple files
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  loadAndFlattenSuggestions,
  formatLoadSummary,
  SuggestionWithContext,
  LoadStats,
} from '../commands/review.js';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Build a minimal valid BackwardReport JSON object for testing.
 */
function makeReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    file: 'example.md',
    timestamp: '2026-03-05T00:00:00.000Z',
    schemaVersion: '1.0.0',
    sourceRepo: 'lecture-python-intro',
    targetRepo: 'lecture-intro.zh-cn',
    sourceMetadata: null,
    targetMetadata: null,
    timeline: null,
    triageResult: {
      file: 'example.md',
      verdict: 'IN_SYNC',
      notes: '',
    },
    suggestions: [],
    ...overrides,
  };
}

/**
 * Build a BACKPORT suggestion with configurable confidence.
 */
function makeSuggestion(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    sectionHeading: '## Introduction',
    recommendation: 'BACKPORT',
    category: 'BUG_FIX',
    confidence: 0.85,
    summary: 'Fixed a formula',
    specificChanges: [
      { type: 'Formula', original: 'x^2', improved: 'x^3' },
    ],
    reasoning: 'The target fixed a typo.',
    ...overrides,
  };
}

/**
 * Write a JSON file to a directory.
 */
function writeJson(dir: string, filename: string, data: unknown): void {
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(data));
}

/**
 * Create a temporary directory with an inner `.resync/` subfolder.
 * Returns { reportDir, resyncDir } paths.
 */
function createTempReport(suffix = ''): { reportDir: string; resyncDir: string } {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), `review-test-${suffix}`));
  const resyncDir = path.join(reportDir, '.resync');
  fs.mkdirSync(resyncDir);
  return { reportDir, resyncDir };
}

// ============================================================================
// loadAndFlattenSuggestions — basic loading
// ============================================================================

describe('loadAndFlattenSuggestions — basic loading', () => {
  it('returns empty results for a directory with no reports', () => {
    const { reportDir } = createTempReport('empty');
    const result = loadAndFlattenSuggestions(reportDir);
    expect(result.suggestions).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(result.stats.filesLoaded).toBe(0);
    expect(result.stats.filesWithSuggestions).toBe(0);
    expect(result.stats.totalSuggestions).toBe(0);
  });

  it('loads a report with no BACKPORT suggestions', () => {
    const { reportDir, resyncDir } = createTempReport('no-backport');
    writeJson(resyncDir, 'example.json', makeReport());
    const result = loadAndFlattenSuggestions(reportDir);
    expect(result.stats.filesLoaded).toBe(1);
    expect(result.stats.filesWithSuggestions).toBe(0);
    expect(result.suggestions).toHaveLength(0);
  });

  it('loads a report with one BACKPORT suggestion', () => {
    const { reportDir, resyncDir } = createTempReport('one-backport');
    writeJson(resyncDir, 'example.json', makeReport({
      file: 'ar1_processes.md',
      suggestions: [makeSuggestion()],
      triageResult: { file: 'ar1_processes.md', verdict: 'CHANGES_DETECTED', notes: '' },
    }));
    const result = loadAndFlattenSuggestions(reportDir);
    expect(result.stats.filesLoaded).toBe(1);
    expect(result.stats.filesWithSuggestions).toBe(1);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].file).toBe('ar1_processes.md');
    expect(result.suggestions[0].suggestion.recommendation).toBe('BACKPORT');
  });

  it('enriches suggestions with file context', () => {
    const { reportDir, resyncDir } = createTempReport('context');
    writeJson(resyncDir, 'example.json', makeReport({
      file: 'cobweb.md',
      sourceRepo: 'lecture-python-intro',
      targetRepo: 'lecture-intro.zh-cn',
      timestamp: '2026-03-05T10:00:00Z',
      suggestions: [makeSuggestion()],
      triageResult: { file: 'cobweb.md', verdict: 'CHANGES_DETECTED', notes: '' },
    }));
    const result = loadAndFlattenSuggestions(reportDir);
    const item = result.suggestions[0];
    expect(item.file).toBe('cobweb.md');
    expect(item.sourceRepo).toBe('lecture-python-intro');
    expect(item.targetRepo).toBe('lecture-intro.zh-cn');
    expect(item.timestamp).toBe('2026-03-05T10:00:00Z');
  });

  it('returns an error (not a throw) for a non-existent .resync directory', () => {
    // Create only the outer report dir — no .resync/ subfolder
    const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-test-no-resync'));
    const result = loadAndFlattenSuggestions(reportDir);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain('not found');
    expect(result.suggestions).toHaveLength(0);
  });

  it('reports errors for malformed JSON files', () => {
    const { reportDir, resyncDir } = createTempReport('malformed');
    fs.writeFileSync(path.join(resyncDir, 'bad.json'), 'not valid json');
    const result = loadAndFlattenSuggestions(reportDir);
    expect(result.errors).toHaveLength(1);
  });

  it('skips _-prefixed files (meta files like _progress.json)', () => {
    const { reportDir, resyncDir } = createTempReport('skip-meta');
    writeJson(resyncDir, '_progress.json', { startedAt: '2026-01-01', totalFiles: 1 });
    writeJson(resyncDir, 'example.json', makeReport());
    const result = loadAndFlattenSuggestions(reportDir);
    expect(result.stats.filesLoaded).toBe(1); // only example.json
  });
});

// ============================================================================
// loadAndFlattenSuggestions — filtering
// ============================================================================

describe('loadAndFlattenSuggestions — confidence filtering', () => {
  let reportDir: string;
  let resyncDir: string;

  beforeEach(() => {
    ({ reportDir, resyncDir } = createTempReport('filter'));
    writeJson(resyncDir, 'file.json', makeReport({
      file: 'test.md',
      triageResult: { file: 'test.md', verdict: 'CHANGES_DETECTED', notes: '' },
      suggestions: [
        makeSuggestion({ confidence: 0.9 }),
        makeSuggestion({ confidence: 0.7, sectionHeading: '## Section 2' }),
        makeSuggestion({ confidence: 0.5, sectionHeading: '## Section 3' }),
        // NO_BACKPORT should always be excluded
        makeSuggestion({ recommendation: 'NO_BACKPORT', confidence: 0.95, category: 'NO_CHANGE', sectionHeading: '## Section 4' }),
      ],
    }));
  });

  it('uses default threshold of 0.6 (includes 0.9 and 0.7, excludes 0.5)', () => {
    const result = loadAndFlattenSuggestions(reportDir);
    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions.every(s => s.suggestion.confidence >= 0.6)).toBe(true);
  });

  it('applies custom minConfidence threshold', () => {
    const result = loadAndFlattenSuggestions(reportDir, 0.8);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].suggestion.confidence).toBe(0.9);
  });

  it('threshold 0 includes all BACKPORT suggestions regardless of confidence', () => {
    const result = loadAndFlattenSuggestions(reportDir, 0);
    expect(result.suggestions).toHaveLength(3); // excludes NO_BACKPORT
  });

  it('always excludes NO_BACKPORT suggestions even above threshold', () => {
    const result = loadAndFlattenSuggestions(reportDir, 0);
    expect(result.suggestions.every(s => s.suggestion.recommendation === 'BACKPORT')).toBe(true);
  });

  it('threshold 1 includes only perfect-confidence suggestions', () => {
    const result = loadAndFlattenSuggestions(reportDir, 1.0);
    expect(result.suggestions).toHaveLength(0);
  });
});

// ============================================================================
// loadAndFlattenSuggestions — sorting
// ============================================================================

describe('loadAndFlattenSuggestions — sort order', () => {
  it('sorts suggestions by confidence descending across multiple files', () => {
    const { reportDir, resyncDir } = createTempReport('sort');
    writeJson(resyncDir, 'a.json', makeReport({
      file: 'a.md',
      triageResult: { file: 'a.md', verdict: 'CHANGES_DETECTED', notes: '' },
      suggestions: [
        makeSuggestion({ confidence: 0.7, sectionHeading: '## A-Low' }),
        makeSuggestion({ confidence: 0.95, sectionHeading: '## A-High' }),
      ],
    }));
    writeJson(resyncDir, 'b.json', makeReport({
      file: 'b.md',
      triageResult: { file: 'b.md', verdict: 'CHANGES_DETECTED', notes: '' },
      suggestions: [
        makeSuggestion({ confidence: 0.85, sectionHeading: '## B-Mid' }),
      ],
    }));
    const result = loadAndFlattenSuggestions(reportDir, 0);
    const confidences = result.suggestions.map(s => s.suggestion.confidence);
    expect(confidences).toEqual([0.95, 0.85, 0.7]);
  });

  it('stats correctly aggregates across multiple files', () => {
    const { reportDir, resyncDir } = createTempReport('multi-stats');
    // File 1: 2 BACKPORT suggestions above threshold
    writeJson(resyncDir, 'file1.json', makeReport({
      file: 'file1.md',
      triageResult: { file: 'file1.md', verdict: 'CHANGES_DETECTED', notes: '' },
      suggestions: [
        makeSuggestion({ confidence: 0.9 }),
        makeSuggestion({ confidence: 0.8, sectionHeading: '## S2' }),
      ],
    }));
    // File 2: 1 BACKPORT suggestion above threshold
    writeJson(resyncDir, 'file2.json', makeReport({
      file: 'file2.md',
      triageResult: { file: 'file2.md', verdict: 'CHANGES_DETECTED', notes: '' },
      suggestions: [makeSuggestion({ confidence: 0.75 })],
    }));
    // File 3: no BACKPORT suggestions (IN_SYNC)
    writeJson(resyncDir, 'file3.json', makeReport({ file: 'file3.md' }));

    const result = loadAndFlattenSuggestions(reportDir, 0.6);
    expect(result.stats.filesLoaded).toBe(3);
    expect(result.stats.filesWithSuggestions).toBe(2);
    expect(result.stats.totalSuggestions).toBe(3);
    expect(result.suggestions).toHaveLength(3);
  });
});

// ============================================================================
// formatLoadSummary
// ============================================================================

describe('formatLoadSummary', () => {
  it('returns a "no suggestions" message when total is 0', () => {
    const stats: LoadStats = { filesLoaded: 5, filesWithSuggestions: 0, totalSuggestions: 0 };
    const msg = formatLoadSummary(stats, '/my/report');
    expect(msg).toContain('5 report(s)');
    expect(msg).toContain('/my/report');
    expect(msg).toContain('no actionable suggestions');
  });

  it('returns a count message when suggestions exist', () => {
    const stats: LoadStats = { filesLoaded: 10, filesWithSuggestions: 3, totalSuggestions: 7 };
    const msg = formatLoadSummary(stats, '/my/report');
    expect(msg).toContain('10 report(s)');
    expect(msg).toContain('7 actionable suggestion(s)');
    expect(msg).toContain('3 file(s)');
  });

  it('handles singular file count', () => {
    const stats: LoadStats = { filesLoaded: 1, filesWithSuggestions: 1, totalSuggestions: 2 };
    const msg = formatLoadSummary(stats, '/dir');
    expect(msg).toContain('1 report(s)');
    expect(msg).toContain('2 actionable suggestion(s)');
  });
});

// ============================================================================
// Integration: real report fixtures (conditional)
// ============================================================================

describe('loadAndFlattenSuggestions — integration with real fixtures', () => {
  const fixtureReportDir = path.join(
    __dirname, '..', '..', '..', 'reports',
    'lecture-python-intro',
    'backward-2026-03-04-section-by-section',
  );
  const hasFixtures = fs.existsSync(path.join(fixtureReportDir, '.resync'));

  (hasFixtures ? it : it.skip)('loads real reports from fixture directory', () => {
    const result = loadAndFlattenSuggestions(fixtureReportDir, 0.6);
    expect(result.stats.filesLoaded).toBeGreaterThan(0);
    // All returned suggestions should be BACKPORT above threshold
    for (const item of result.suggestions) {
      expect(item.suggestion.recommendation).toBe('BACKPORT');
      expect(item.suggestion.confidence).toBeGreaterThanOrEqual(0.6);
      expect(item.file).toBeTruthy();
    }
  });

  (hasFixtures ? it : it.skip)('results are sorted by confidence descending', () => {
    const result = loadAndFlattenSuggestions(fixtureReportDir, 0);
    const confidences = result.suggestions.map(s => s.suggestion.confidence);
    for (let i = 1; i < confidences.length; i++) {
      expect(confidences[i]).toBeLessThanOrEqual(confidences[i - 1]);
    }
  });

  (hasFixtures ? it : it.skip)('each suggestion has file context from its source report', () => {
    const result = loadAndFlattenSuggestions(fixtureReportDir, 0.6);
    for (const item of result.suggestions) {
      expect(item.file).toBeTruthy();
      expect(item.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}/);
    }
  });
});

/**
 * Tests for the backward report JSON schema (Zod validation).
 *
 * Tests cover:
 * - Valid report parsing (with and without schemaVersion)
 * - Field-level validation (enums, ranges, nullability)
 * - loadResyncDirectory (reads real report fixtures)
 * - filterActionableSuggestions
 * - Malformed input rejection
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  SCHEMA_VERSION,
  BackwardReportSchema,
  BulkBackwardReportSchema,
  ProgressCheckpointSchema,
  TriageVerdictSchema,
  BackportCategorySchema,
  BackportSuggestionSchema,
  SpecificChangeSchema,
  SectionPairSchema,
  parseBackwardReport,
  parseProgressCheckpoint,
  loadResyncDirectory,
  filterActionableSuggestions,
  BackwardReportData,
  BackportSuggestionData,
} from '../schema.js';

// ============================================================================
// FIXTURES
// ============================================================================

function minimalReport(overrides: Partial<BackwardReportData> = {}): Record<string, unknown> {
  return {
    file: 'example.md',
    timestamp: '2026-03-04T03:01:49.778Z',
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

function backportSuggestion(overrides: Partial<BackportSuggestionData> = {}): Record<string, unknown> {
  return {
    sectionHeading: '## Example',
    recommendation: 'BACKPORT',
    category: 'BUG_FIX',
    confidence: 0.85,
    summary: 'Fixed a formula error',
    specificChanges: [
      { type: 'Formula fix', original: 'x^2', improved: 'x^3' },
    ],
    reasoning: 'The target fixed a typo.',
    ...overrides,
  };
}

// ============================================================================
// SCHEMA VERSION
// ============================================================================

describe('SCHEMA_VERSION', () => {
  it('follows semver format', () => {
    expect(SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('is 1.0.0 at initial release', () => {
    expect(SCHEMA_VERSION).toBe('1.0.0');
  });
});

// ============================================================================
// TRIAGE VERDICTS
// ============================================================================

describe('TriageVerdictSchema', () => {
  it('accepts valid verdicts', () => {
    expect(TriageVerdictSchema.parse('CHANGES_DETECTED')).toBe('CHANGES_DETECTED');
    expect(TriageVerdictSchema.parse('IN_SYNC')).toBe('IN_SYNC');
    expect(TriageVerdictSchema.parse('SKIPPED_TOO_LARGE')).toBe('SKIPPED_TOO_LARGE');
  });

  it('rejects invalid verdicts', () => {
    expect(() => TriageVerdictSchema.parse('UNKNOWN')).toThrow();
  });
});

// ============================================================================
// BACKPORT CATEGORIES
// ============================================================================

describe('BackportCategorySchema', () => {
  const validCategories = [
    'BUG_FIX', 'CLARIFICATION', 'EXAMPLE',
    'CODE_IMPROVEMENT', 'I18N_ONLY', 'NO_CHANGE',
  ];

  it.each(validCategories)('accepts %s', (cat) => {
    expect(BackportCategorySchema.parse(cat)).toBe(cat);
  });

  it('rejects invalid categories', () => {
    expect(() => BackportCategorySchema.parse('TYPO_FIX')).toThrow();
  });
});

// ============================================================================
// SPECIFIC CHANGE
// ============================================================================

describe('SpecificChangeSchema', () => {
  it('validates a complete change', () => {
    const change = { type: 'Code fix', original: 'old', improved: 'new' };
    expect(SpecificChangeSchema.parse(change)).toEqual(change);
  });

  it('rejects missing fields', () => {
    expect(() => SpecificChangeSchema.parse({ type: 'x' })).toThrow();
  });
});

// ============================================================================
// BACKPORT SUGGESTION
// ============================================================================

describe('BackportSuggestionSchema', () => {
  it('validates a BACKPORT suggestion with specific changes', () => {
    const result = BackportSuggestionSchema.parse(backportSuggestion());
    expect(result.recommendation).toBe('BACKPORT');
    expect(result.specificChanges).toHaveLength(1);
  });

  it('validates a NO_BACKPORT suggestion with empty changes', () => {
    const result = BackportSuggestionSchema.parse(backportSuggestion({
      recommendation: 'NO_BACKPORT',
      category: 'NO_CHANGE',
      confidence: 0.9,
      specificChanges: [],
    }));
    expect(result.recommendation).toBe('NO_BACKPORT');
  });

  it('rejects confidence > 1', () => {
    expect(() => BackportSuggestionSchema.parse(
      backportSuggestion({ confidence: 1.5 }),
    )).toThrow();
  });

  it('rejects confidence < 0', () => {
    expect(() => BackportSuggestionSchema.parse(
      backportSuggestion({ confidence: -0.1 }),
    )).toThrow();
  });
});

// ============================================================================
// SECTION PAIR
// ============================================================================

describe('SectionPairSchema', () => {
  it('accepts a MATCHED pair', () => {
    const pair = {
      sourceSection: {
        heading: '## Intro',
        level: 2,
        id: 'intro',
        content: '## Intro\n\nHello',
        startLine: 1,
        endLine: 3,
        subsections: [],
      },
      targetSection: {
        heading: '## 简介',
        level: 2,
        id: '',
        content: '## 简介\n\n你好',
        startLine: 1,
        endLine: 3,
        subsections: [],
      },
      status: 'MATCHED' as const,
      sourceHeading: '## Intro',
      targetHeading: '## 简介',
    };
    const result = SectionPairSchema.parse(pair);
    expect(result.status).toBe('MATCHED');
  });

  it('accepts SOURCE_ONLY with null target', () => {
    const pair = {
      sourceSection: {
        heading: '## New',
        level: 2,
        id: 'new',
        content: '## New\n\nContent',
        startLine: 10,
        endLine: 12,
      },
      targetSection: null,
      status: 'SOURCE_ONLY' as const,
    };
    const result = SectionPairSchema.parse(pair);
    expect(result.targetSection).toBeNull();
  });
});

// ============================================================================
// BACKWARD REPORT (per-file)
// ============================================================================

describe('BackwardReportSchema', () => {
  it('validates a minimal IN_SYNC report', () => {
    const result = BackwardReportSchema.parse(minimalReport());
    expect(result.file).toBe('example.md');
    expect(result.suggestions).toHaveLength(0);
  });

  it('accepts reports without schemaVersion (pre-v1 backward compat)', () => {
    const report = minimalReport();
    delete (report as Record<string, unknown>).schemaVersion;
    const result = BackwardReportSchema.parse(report);
    expect(result.schemaVersion).toBeUndefined();
  });

  it('accepts reports with schemaVersion', () => {
    const result = BackwardReportSchema.parse(minimalReport({ schemaVersion: '1.0.0' } as any));
    expect(result.schemaVersion).toBe('1.0.0');
  });

  it('validates a report with BACKPORT suggestions', () => {
    const report = minimalReport({
      triageResult: {
        file: 'example.md',
        verdict: 'CHANGES_DETECTED',
        notes: 'Code changes found',
      },
      suggestions: [backportSuggestion() as any],
    });
    const result = BackwardReportSchema.parse(report);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].recommendation).toBe('BACKPORT');
  });

  it('validates a report with full metadata and timeline', () => {
    const report = minimalReport({
      model: 'claude-sonnet-4-6',
      sourceRepo: 'lecture-python-intro',
      targetRepo: 'lecture-intro.zh-cn',
      sourceMetadata: {
        lastModified: '2025-12-28T17:41:42.000Z',
        lastCommit: '21bd3b604363fac8cd5a59891ed18d441408e886',
        lastAuthor: 'John Stachurski',
      },
      targetMetadata: {
        lastModified: '2025-03-11T13:46:39.000Z',
        lastCommit: '124959db925b9b394f71dc82f94dbecd95bd6788',
        lastAuthor: 'Humphrey Yang',
      },
      timeline: {
        entries: [
          {
            date: '2025-12-29',
            fullDate: '2025-12-29 02:41:42 +0900',
            repo: 'SOURCE',
            sha: '21bd3b60',
            message: 'Fix grammar (#688)',
          },
        ],
        sourceCommitCount: 1,
        targetCommitCount: 0,
        estimatedSyncDate: '2024-07-22',
        sourceCommitsAfterSync: 1,
      },
    } as any);
    const result = BackwardReportSchema.parse(report);
    expect(result.model).toBe('claude-sonnet-4-6');
    expect(result.timeline?.entries).toHaveLength(1);
  });

  it('rejects a report missing required triageResult', () => {
    const report = minimalReport();
    delete (report as any).triageResult;
    expect(() => BackwardReportSchema.parse(report)).toThrow();
  });

  it('rejects a report with invalid verdict', () => {
    const report = minimalReport({
      triageResult: {
        file: 'x.md',
        verdict: 'INVALID' as any,
        notes: '',
      },
    });
    expect(() => BackwardReportSchema.parse(report)).toThrow();
  });
});

// ============================================================================
// PROGRESS CHECKPOINT
// ============================================================================

describe('ProgressCheckpointSchema', () => {
  it('validates a progress checkpoint', () => {
    const checkpoint = {
      startedAt: '2026-03-04T03:01:07.981Z',
      lastUpdated: '2026-03-04T03:09:03.963Z',
      totalFiles: 51,
      completedFiles: ['about.md', 'cobweb.md'],
      erroredFiles: [
        { file: 'README.md', error: 'SOURCE file not found' },
      ],
    };
    const result = ProgressCheckpointSchema.parse(checkpoint);
    expect(result.completedFiles).toHaveLength(2);
    expect(result.erroredFiles).toHaveLength(1);
  });

  it('defaults erroredFiles to empty array when absent', () => {
    const checkpoint = {
      startedAt: '2026-03-04T03:01:07.981Z',
      lastUpdated: '2026-03-04T03:09:03.963Z',
      totalFiles: 10,
      completedFiles: [],
    };
    const result = ProgressCheckpointSchema.parse(checkpoint);
    expect(result.erroredFiles).toEqual([]);
  });
});

// ============================================================================
// BULK BACKWARD REPORT
// ============================================================================

describe('BulkBackwardReportSchema', () => {
  it('validates a minimal bulk report', () => {
    const bulk = {
      timestamp: '2026-03-04T03:09:03.963Z',
      sourceRepo: 'lecture-python-intro',
      targetRepo: 'lecture-intro.zh-cn',
      language: 'zh-cn',
      filesAnalyzed: 0,
      filesInSync: 0,
      filesFlagged: 0,
      filesSkipped: 0,
      totalSuggestions: 0,
      highConfidence: 0,
      mediumConfidence: 0,
      lowConfidence: 0,
      fileReports: [],
    };
    const result = BulkBackwardReportSchema.parse(bulk);
    expect(result.fileReports).toHaveLength(0);
  });
});

// ============================================================================
// parseBackwardReport (string → validated data)
// ============================================================================

describe('parseBackwardReport', () => {
  it('returns success for valid JSON', () => {
    const result = parseBackwardReport(JSON.stringify(minimalReport()));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.file).toBe('example.md');
    }
  });

  it('returns error for invalid JSON syntax', () => {
    const result = parseBackwardReport('not json');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Invalid JSON');
    }
  });

  it('returns error for valid JSON with bad schema', () => {
    const result = parseBackwardReport(JSON.stringify({ file: 123 }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Validation failed');
    }
  });
});

// ============================================================================
// parseProgressCheckpoint
// ============================================================================

describe('parseProgressCheckpoint', () => {
  it('returns success for valid checkpoint', () => {
    const result = parseProgressCheckpoint(JSON.stringify({
      startedAt: '2026-01-01T00:00:00Z',
      lastUpdated: '2026-01-01T00:05:00Z',
      totalFiles: 5,
      completedFiles: ['a.md'],
    }));
    expect(result.success).toBe(true);
  });

  it('returns error for invalid checkpoint', () => {
    const result = parseProgressCheckpoint(JSON.stringify({ totalFiles: 'five' }));
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// filterActionableSuggestions
// ============================================================================

describe('filterActionableSuggestions', () => {
  const report = BackwardReportSchema.parse(minimalReport({
    triageResult: { file: 'x.md', verdict: 'CHANGES_DETECTED', notes: 'changes' },
    suggestions: [
      backportSuggestion({ confidence: 0.9 }),
      backportSuggestion({ recommendation: 'NO_BACKPORT', confidence: 0.95, category: 'NO_CHANGE', specificChanges: [] }),
      backportSuggestion({ confidence: 0.5 }),
      backportSuggestion({ confidence: 0.7 }),
    ] as any,
  }));

  it('returns only BACKPORT suggestions above threshold', () => {
    const result = filterActionableSuggestions(report, 0.6);
    expect(result).toHaveLength(2); // 0.9 and 0.7
    expect(result.every(s => s.recommendation === 'BACKPORT')).toBe(true);
    expect(result.every(s => s.confidence >= 0.6)).toBe(true);
  });

  it('defaults to 0.6 threshold', () => {
    const result = filterActionableSuggestions(report);
    expect(result).toHaveLength(2);
  });

  it('returns all BACKPORT at threshold 0', () => {
    const result = filterActionableSuggestions(report, 0);
    expect(result).toHaveLength(3); // 0.9, 0.5, 0.7
  });
});

// ============================================================================
// loadResyncDirectory (integration with real fixture files)
// ============================================================================

describe('loadResyncDirectory', () => {
  const fixtureDir = path.join(
    __dirname, '..', '..', '..', 'reports',
    'backward-2026-03-04-whole-file', '.resync',
  );

  // Only run these tests if the fixture directory exists
  const hasFixtures = fs.existsSync(fixtureDir);

  (hasFixtures ? it : it.skip)('loads real report files from fixture dir', () => {
    const { reports, errors } = loadResyncDirectory(fixtureDir);
    expect(reports.length).toBeGreaterThan(0);
    // All loaded reports should have required fields
    for (const report of reports) {
      expect(report.file).toBeDefined();
      expect(report.timestamp).toBeDefined();
      expect(report.triageResult).toBeDefined();
      expect(Array.isArray(report.suggestions)).toBe(true);
    }
  });

  (hasFixtures ? it : it.skip)('skips _progress.json and _log.txt', () => {
    const { reports } = loadResyncDirectory(fixtureDir);
    const filenames = reports.map(r => r.file);
    expect(filenames).not.toContain('_progress.json');
    expect(filenames).not.toContain('_log.txt');
  });

  (hasFixtures ? it : it.skip)('finds files with BACKPORT suggestions', () => {
    const { reports } = loadResyncDirectory(fixtureDir);
    const withBackport = reports.filter(r =>
      r.suggestions.some(s => s.recommendation === 'BACKPORT'),
    );
    // We know from exploration that at least cagan_adaptive.json has BACKPORT suggestions
    expect(withBackport.length).toBeGreaterThan(0);
  });

  it('returns error for non-existent directory', () => {
    const { reports, errors } = loadResyncDirectory('/tmp/does-not-exist');
    expect(reports).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].error).toContain('not found');
  });
});

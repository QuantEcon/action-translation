/**
 * Tests for report-generator module
 * 
 * Tests Markdown and JSON report formatting for both single-file
 * and bulk backward analysis reports.
 */

import { 
  generateMarkdownReport, 
  generateBulkMarkdownReport, 
  generateJsonReport,
  generateBulkJsonReport,
} from '../report-generator';
import { BackwardReport, BulkBackwardReport, FileTimeline } from '../types';

describe('report-generator', () => {
  const baseReport: BackwardReport = {
    file: 'solow.md',
    timestamp: '2024-06-15T10:00:00.000Z',
    sourceMetadata: {
      lastModified: new Date('2024-06-01'),
      lastCommit: 'a'.repeat(40),
      lastAuthor: 'Alice',
    },
    targetMetadata: {
      lastModified: new Date('2024-09-15'),
      lastCommit: 'b'.repeat(40),
      lastAuthor: 'Bob',
    },
    timeline: null,
    triageResult: {
      file: 'solow.md',
      verdict: 'CHANGES_DETECTED',
      notes: 'Formula correction found in Steady State section.',
    },
    suggestions: [],
  };

  describe('generateMarkdownReport', () => {
    it('should generate header with file name and timestamp', () => {
      const md = generateMarkdownReport(baseReport);
      expect(md).toContain('# Backward Analysis: solow.md');
      expect(md).toContain('2024-06-15T10:00:00.000Z');
    });

    it('should include git metadata', () => {
      const md = generateMarkdownReport(baseReport);
      expect(md).toContain('2024-06-01');
      expect(md).toContain('Alice');
      expect(md).toContain('2024-09-15');
      expect(md).toContain('Bob');
    });

    it('should include commit timeline when present', () => {
      const timeline: FileTimeline = {
        entries: [
          { date: '2025-12-23', repo: 'SOURCE', sha: 'abc123d', message: 'Fix SymPy' },
          { date: '2024-07-22', repo: 'TARGET', sha: 'fed987a', message: 'Translate to zh-cn' },
        ],
        sourceCommitCount: 1,
        targetCommitCount: 1,
        estimatedSyncDate: '2024-07-22',
        sourceCommitsAfterSync: 1,
      };
      const report: BackwardReport = { ...baseReport, timeline };
      const md = generateMarkdownReport(report);
      expect(md).toContain('## Commit Timeline');
      expect(md).toContain('abc123d');
      expect(md).toContain('SOURCE has 1 commit(s) AFTER');
    });

    it('should omit commit timeline when null', () => {
      const md = generateMarkdownReport(baseReport);
      expect(md).not.toContain('## Commit Timeline');
    });

    it('should show NO ACTION NEEDED verdict when changes detected but no backports', () => {
      const md = generateMarkdownReport(baseReport);
      expect(md).toContain('NO ACTION NEEDED');
      expect(md).toContain('none require backporting');
    });

    it('should show IN SYNC verdict for synced files', () => {
      const report: BackwardReport = {
        ...baseReport,
        triageResult: { file: 'test.md', verdict: 'IN_SYNC', notes: '' },
      };
      const md = generateMarkdownReport(report);
      expect(md).toContain('Result:');
      expect(md).toContain('IN SYNC');
    });

    it('should show SUGGESTION count verdict when backports found', () => {
      const report: BackwardReport = {
        ...baseReport,
        suggestions: [{
          sectionHeading: '## A',
          recommendation: 'BACKPORT',
          category: 'BUG_FIX',
          confidence: 0.9,
          summary: 'fix',
          specificChanges: [],
          reasoning: 'reason',
        }],
      };
      const md = generateMarkdownReport(report);
      expect(md).toContain('1 SUGGESTION');
      expect(md).toContain('See details below');
    });

    it('should show IN_SYNC message for files in sync', () => {
      const report: BackwardReport = {
        ...baseReport,
        triageResult: { file: 'test.md', verdict: 'IN_SYNC', notes: '' },
      };
      const md = generateMarkdownReport(report);
      expect(md).toContain('IN SYNC');
      expect(md).toContain('faithful');
      expect(md).not.toContain('Suggestions');
    });

    it('should render suggestions with confidence labels', () => {
      const report: BackwardReport = {
        ...baseReport,
        suggestions: [
          {
            sectionHeading: '## Steady State',
            recommendation: 'BACKPORT',
            category: 'BUG_FIX',
            confidence: 0.92,
            summary: 'The steady state formula was corrected to include A.',
            specificChanges: [
              {
                type: 'formula correction',
                original: 'k* = (s/δ)^(1/(1-α))',
                improved: 'k* = (sA/δ)^(1/(1-α))',
              },
            ],
            reasoning: 'The technology parameter A was missing.',
          },
        ],
      };

      const md = generateMarkdownReport(report);
      expect(md).toContain('## Suggestions (1 found)');
      expect(md).toContain('### ## Steady State (HIGH confidence: 0.92)');
      expect(md).toContain('BUG_FIX');
      expect(md).toContain('formula correction');
      expect(md).toContain('(s/δ)');
      expect(md).toContain('(sA/δ)');
    });

    it('should label confidence levels correctly', () => {
      const highReport: BackwardReport = {
        ...baseReport,
        suggestions: [{
          sectionHeading: '## A',
          recommendation: 'BACKPORT',
          category: 'BUG_FIX',
          confidence: 0.90,
          summary: 'test',
          specificChanges: [],
          reasoning: 'test',
        }],
      };
      expect(generateMarkdownReport(highReport)).toContain('HIGH');

      const medReport: BackwardReport = {
        ...baseReport,
        suggestions: [{
          sectionHeading: '## B',
          recommendation: 'BACKPORT',
          category: 'CLARIFICATION',
          confidence: 0.70,
          summary: 'test',
          specificChanges: [],
          reasoning: 'test',
        }],
      };
      expect(generateMarkdownReport(medReport)).toContain('MEDIUM');

      const lowReport: BackwardReport = {
        ...baseReport,
        suggestions: [{
          sectionHeading: '## C',
          recommendation: 'BACKPORT',
          category: 'EXAMPLE',
          confidence: 0.40,
          summary: 'test',
          specificChanges: [],
          reasoning: 'test',
        }],
      };
      expect(generateMarkdownReport(lowReport)).toContain('LOW');
    });

    it('should include "no suggestions" message when Stage 2 found nothing', () => {
      const report: BackwardReport = {
        ...baseReport,
        suggestions: [{
          sectionHeading: '## Test',
          recommendation: 'NO_BACKPORT',
          category: 'NO_CHANGE',
          confidence: 0.95,
          summary: 'Faithful translation',
          specificChanges: [],
          reasoning: 'No changes found',
        }],
      };
      const md = generateMarkdownReport(report);
      expect(md).toContain('No backport suggestions');
    });

    it('should include footer', () => {
      const report: BackwardReport = {
        ...baseReport,
        suggestions: [{
          sectionHeading: '## A',
          recommendation: 'BACKPORT',
          category: 'BUG_FIX',
          confidence: 0.9,
          summary: 'fix',
          specificChanges: [],
          reasoning: 'reason',
        }],
      };
      const md = generateMarkdownReport(report);
      expect(md).toContain('Suggestions are for consideration by source maintainers');
    });
  });

  describe('generateBulkMarkdownReport', () => {
    it('should generate summary table', () => {
      const bulk: BulkBackwardReport = {
        timestamp: '2024-06-15T10:00:00.000Z',
        sourceRepo: '/path/to/source',
        targetRepo: '/path/to/target',
        language: 'zh-cn',
        filesAnalyzed: 10,
        filesInSync: 7,
        filesFlagged: 2,
        filesSkipped: 1,
        totalSuggestions: 3,
        highConfidence: 1,
        mediumConfidence: 1,
        lowConfidence: 1,
        fileReports: [],
      };

      const md = generateBulkMarkdownReport(bulk);
      expect(md).toContain('# Backward Analysis Report');
      expect(md).toContain('zh-cn');
      expect(md).toContain('| Files analyzed | 10 |');
      expect(md).toContain('| Files in sync | 7 |');
      expect(md).toContain('| Total suggestions | 3 |');
      expect(md).toContain('| High confidence');
    });
  });

  describe('generateJsonReport', () => {
    it('should produce valid JSON', () => {
      const json = generateJsonReport(baseReport);
      const parsed = JSON.parse(json);
      expect(parsed.file).toBe('solow.md');
      expect(parsed.triageResult.verdict).toBe('CHANGES_DETECTED');
    });
  });

  describe('generateBulkJsonReport', () => {
    it('should produce valid JSON', () => {
      const bulk: BulkBackwardReport = {
        timestamp: '2024-06-15T10:00:00.000Z',
        sourceRepo: '/path/to/source',
        targetRepo: '/path/to/target',
        language: 'zh-cn',
        filesAnalyzed: 1,
        filesInSync: 0,
        filesFlagged: 1,
        filesSkipped: 0,
        totalSuggestions: 1,
        highConfidence: 1,
        mediumConfidence: 0,
        lowConfidence: 0,
        fileReports: [baseReport],
      };
      const json = generateBulkJsonReport(bulk);
      const parsed = JSON.parse(json);
      expect(parsed.filesAnalyzed).toBe(1);
      expect(parsed.fileReports).toHaveLength(1);
    });
  });
});

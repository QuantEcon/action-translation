/**
 * Tests for backward-evaluator module (Stage 2)
 * 
 * Tests prompt building, response parsing, and test-mode behavior.
 * Does NOT make real LLM calls.
 */

import { 
  buildEvaluationPrompt, 
  parseEvaluationResponse, 
  evaluateSection,
} from '../backward-evaluator';
import { FileGitMetadata, FileTimeline } from '../types';

describe('backward-evaluator', () => {
  const mockSourceMeta: FileGitMetadata = {
    lastModified: new Date('2024-06-01'),
    lastCommit: 'a'.repeat(40),
    lastAuthor: 'Author A',
  };

  const mockTargetMeta: FileGitMetadata = {
    lastModified: new Date('2024-09-15'),
    lastCommit: 'b'.repeat(40),
    lastAuthor: 'Author B',
  };

  describe('buildEvaluationPrompt', () => {
    it('should include source and target sections', () => {
      const prompt = buildEvaluationPrompt(
        'Source section text', 'Target section text',
        '## Example', 'en', 'zh-cn', null, null, '', null,
      );
      expect(prompt).toContain('Source section text');
      expect(prompt).toContain('Target section text');
      expect(prompt).toContain('## Example');
    });

    it('should include timeline when git metadata provided', () => {
      const prompt = buildEvaluationPrompt(
        'source', 'target', '## Test',
        'en', 'zh-cn', mockSourceMeta, mockTargetMeta, '', null,
      );
      expect(prompt).toContain('2024-06-01');
      expect(prompt).toContain('2024-09-15');
      expect(prompt).toContain('newer');
    });

    it('should include triage notes when provided', () => {
      const prompt = buildEvaluationPrompt(
        'source', 'target', '## Test',
        'en', 'zh-cn', null, null,
        'Formula correction found in section 3', null,
      );
      expect(prompt).toContain('Stage 1 Triage Notes');
      expect(prompt).toContain('Formula correction found in section 3');
    });

    it('should omit triage notes section when empty', () => {
      const prompt = buildEvaluationPrompt(
        'source', 'target', '## Test',
        'en', 'zh-cn', null, null, '', null,
      );
      expect(prompt).not.toContain('Stage 1 Triage Notes');
    });

    it('should include respectful suggestion framing', () => {
      const prompt = buildEvaluationPrompt(
        'source', 'target', '## Test',
        'en', 'zh-cn', null, null, '', null,
      );
      expect(prompt).toContain('SUGGESTIONS');
      expect(prompt).toContain('source of truth');
      expect(prompt).toContain('respectfully');
    });

    it('should include commit history when timeline is provided', () => {
      const timeline: FileTimeline = {
        entries: [
          { date: '2025-12-23', fullDate: '2025-12-23 10:00:00 +0000', repo: 'SOURCE', sha: 'abc123d', message: 'Fix SymPy' },
          { date: '2024-07-22', fullDate: '2024-07-22 08:00:00 +0000', repo: 'TARGET', sha: 'fed987a', message: 'Translate' },
        ],
        sourceCommitCount: 1,
        targetCommitCount: 1,
        estimatedSyncDate: '2024-07-22',
        sourceCommitsAfterSync: 1,
      };
      const prompt = buildEvaluationPrompt(
        'source', 'target', '## Test',
        'en', 'zh-cn', mockSourceMeta, mockTargetMeta, '', timeline,
      );
      expect(prompt).toContain('## Commit History');
      expect(prompt).toContain('SOURCE has 1 commit(s) AFTER');
      expect(prompt).toContain('expected divergences');
    });

    it('should match prompt structure', () => {
      const prompt = buildEvaluationPrompt(
        'source', 'target', '## Test',
        'en', 'zh-cn', mockSourceMeta, mockTargetMeta, 'notes', null,
      );
      expect(prompt).toContain('## Context');
      expect(prompt).toContain('## Source Section');
      expect(prompt).toContain('## Target Section');
      expect(prompt).toContain('## Task');
      expect(prompt).toContain('## Response Format');
      expect(prompt).toContain('BACKPORT');
      expect(prompt).toContain('NO_BACKPORT');
    });
  });

  describe('parseEvaluationResponse', () => {
    it('should parse a BACKPORT response', () => {
      const response = JSON.stringify({
        recommendation: 'BACKPORT',
        category: 'BUG_FIX',
        confidence: 0.92,
        summary: 'Formula correction: added missing A parameter',
        specific_changes: [
          {
            type: 'formula correction',
            original: 'k* = (s/δ)^(1/(1-α))',
            improved: 'k* = (sA/δ)^(1/(1-α))',
          },
        ],
        reasoning: 'The translation corrected a missing technology parameter.',
      });

      const result = parseEvaluationResponse(response, '## Steady State');
      expect(result.recommendation).toBe('BACKPORT');
      expect(result.category).toBe('BUG_FIX');
      expect(result.confidence).toBe(0.92);
      expect(result.sectionHeading).toBe('## Steady State');
      expect(result.specificChanges).toHaveLength(1);
      expect(result.specificChanges[0].improved).toContain('sA');
    });

    it('should parse a NO_BACKPORT response', () => {
      const response = JSON.stringify({
        recommendation: 'NO_BACKPORT',
        category: 'I18N_ONLY',
        confidence: 0.88,
        summary: 'Only i18n changes (font sizes, Chinese labels)',
        specific_changes: [],
        reasoning: 'All changes are locale-related.',
      });

      const result = parseEvaluationResponse(response, '## Code');
      expect(result.recommendation).toBe('NO_BACKPORT');
      expect(result.category).toBe('I18N_ONLY');
      expect(result.specificChanges).toHaveLength(0);
    });

    it('should handle JSON wrapped in markdown code block', () => {
      const response = `Here's my analysis:

\`\`\`json
{
  "recommendation": "BACKPORT",
  "category": "CLARIFICATION",
  "confidence": 0.75,
  "summary": "Added clarifying note about row stochastic property",
  "specific_changes": [],
  "reasoning": "The translation added useful context."
}
\`\`\``;

      const result = parseEvaluationResponse(response, '## Definitions');
      expect(result.recommendation).toBe('BACKPORT');
      expect(result.category).toBe('CLARIFICATION');
      expect(result.confidence).toBe(0.75);
    });

    it('should clamp confidence to [0, 1]', () => {
      const response = JSON.stringify({
        recommendation: 'BACKPORT',
        category: 'BUG_FIX',
        confidence: 1.5,
        summary: 'test',
        specific_changes: [],
        reasoning: 'test',
      });

      const result = parseEvaluationResponse(response, '## Test');
      expect(result.confidence).toBe(1.0);
    });

    it('should default confidence to 0.5 when missing', () => {
      const response = JSON.stringify({
        recommendation: 'BACKPORT',
        category: 'BUG_FIX',
        summary: 'test',
        specific_changes: [],
        reasoning: 'test',
      });

      const result = parseEvaluationResponse(response, '## Test');
      expect(result.confidence).toBe(0.5);
    });

    it('should validate category values', () => {
      const response = JSON.stringify({
        recommendation: 'BACKPORT',
        category: 'INVALID_CATEGORY',
        confidence: 0.8,
        summary: 'test',
        specific_changes: [],
        reasoning: 'test',
      });

      const result = parseEvaluationResponse(response, '## Test');
      expect(result.category).toBe('NO_CHANGE');
    });

    it('should handle completely unparseable response', () => {
      const result = parseEvaluationResponse(
        'I cannot process this request.', '## Test',
      );
      expect(result.recommendation).toBe('NO_BACKPORT');
      expect(result.category).toBe('NO_CHANGE');
      expect(result.confidence).toBe(0);
    });

    it('should handle specific_changes with missing fields', () => {
      const response = JSON.stringify({
        recommendation: 'BACKPORT',
        category: 'BUG_FIX',
        confidence: 0.9,
        summary: 'test',
        specific_changes: [
          { type: 'fix' },
          { original: 'old', improved: 'new' },
          'not an object',
        ],
        reasoning: 'test',
      });

      const result = parseEvaluationResponse(response, '## Test');
      expect(result.specificChanges).toHaveLength(2);
      expect(result.specificChanges[0].type).toBe('fix');
      expect(result.specificChanges[0].original).toBe('');
      expect(result.specificChanges[1].type).toBe('unknown');
    });
  });

  describe('evaluateSection (test mode)', () => {
    const testOptions = {
      apiKey: 'test-key',
      model: 'claude-sonnet-4-6',
      sourceLanguage: 'en',
      targetLanguage: 'zh-cn',
      testMode: true,
    };

    it('should return NO_BACKPORT in test mode', async () => {
      const result = await evaluateSection(
        'source section', 'target section',
        '## Introduction', null, null, '', null, testOptions,
      );
      expect(result.recommendation).toBe('NO_BACKPORT');
      expect(result.category).toBe('NO_CHANGE');
      expect(result.sectionHeading).toBe('## Introduction');
      expect(result.confidence).toBe(0.95);
    });

    it('should include section heading in test mode result', async () => {
      const result = await evaluateSection(
        'source', 'target',
        '## 稳态', null, null, '', null, testOptions,
      );
      expect(result.sectionHeading).toBe('## 稳态');
    });
  });
});

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
  buildFileEvaluationPrompt,
  parseFileEvaluationResponse,
  evaluateFile,
} from '../backward-evaluator.js';
import { FileGitMetadata, FileTimeline, SectionPair } from '../types.js';

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

  // ===========================================================================
  // WHOLE-FILE EVALUATION
  // ===========================================================================

  describe('buildFileEvaluationPrompt', () => {
    const matchedPairs = [
      { heading: '## Introduction', source: 'English intro', target: '中文介绍' },
      { heading: '## Model', source: 'English model section', target: '中文模型部分' },
      { heading: '## Conclusion', source: 'English conclusion', target: '中文结论' },
    ];

    it('should include all section pairs', () => {
      const prompt = buildFileEvaluationPrompt(
        matchedPairs, 'en', 'zh-cn', null, null, '', null,
      );
      expect(prompt).toContain('Section 1: ## Introduction');
      expect(prompt).toContain('Section 2: ## Model');
      expect(prompt).toContain('Section 3: ## Conclusion');
      expect(prompt).toContain('English intro');
      expect(prompt).toContain('中文介绍');
      expect(prompt).toContain('English model section');
      expect(prompt).toContain('中文模型部分');
    });

    it('should state the number of sections', () => {
      const prompt = buildFileEvaluationPrompt(
        matchedPairs, 'en', 'zh-cn', null, null, '', null,
      );
      expect(prompt).toContain('Number of sections: 3');
      expect(prompt).toContain(`Include ALL 3 sections`);
    });

    it('should include timeline context', () => {
      const prompt = buildFileEvaluationPrompt(
        matchedPairs, 'en', 'zh-cn',
        mockSourceMeta, mockTargetMeta, '', null,
      );
      expect(prompt).toContain('2024-06-01');
      expect(prompt).toContain('2024-09-15');
    });

    it('should include triage notes', () => {
      const prompt = buildFileEvaluationPrompt(
        matchedPairs, 'en', 'zh-cn', null, null,
        'Formula correction in section about steady state', null,
      );
      expect(prompt).toContain('Stage 1 Triage Notes');
      expect(prompt).toContain('Formula correction in section about steady state');
    });

    it('should include commit history when timeline provided', () => {
      const timeline: FileTimeline = {
        entries: [
          { date: '2025-12-23', fullDate: '2025-12-23 10:00:00 +0000', repo: 'SOURCE', sha: 'abc123d', message: 'Fix formula' },
        ],
        sourceCommitCount: 1,
        targetCommitCount: 0,
        estimatedSyncDate: '2024-07-22',
        sourceCommitsAfterSync: 1,
      };
      const prompt = buildFileEvaluationPrompt(
        matchedPairs, 'en', 'zh-cn',
        mockSourceMeta, mockTargetMeta, '', timeline,
      );
      expect(prompt).toContain('## Commit History');
      expect(prompt).toContain('expected divergences');
    });

    it('should include response format with sections array', () => {
      const prompt = buildFileEvaluationPrompt(
        matchedPairs, 'en', 'zh-cn', null, null, '', null,
      );
      expect(prompt).toContain('"sections"');
      expect(prompt).toContain('"section_number"');
      expect(prompt).toContain('"section_heading"');
      expect(prompt).toContain('BACKPORT');
      expect(prompt).toContain('NO_BACKPORT');
    });

    it('should include respectful suggestion framing', () => {
      const prompt = buildFileEvaluationPrompt(
        matchedPairs, 'en', 'zh-cn', null, null, '', null,
      );
      expect(prompt).toContain('SUGGESTIONS');
      expect(prompt).toContain('source of truth');
      expect(prompt).toContain('respectfully');
    });
  });

  describe('parseFileEvaluationResponse', () => {
    const matchedPairs = [
      { heading: '## Introduction' },
      { heading: '## Model' },
      { heading: '## Conclusion' },
    ];

    it('should parse a multi-section response', () => {
      const response = JSON.stringify({
        sections: [
          {
            section_number: 1,
            section_heading: '## Introduction',
            recommendation: 'NO_BACKPORT',
            category: 'NO_CHANGE',
            confidence: 0.95,
            summary: 'Faithful translation',
            specific_changes: [],
            reasoning: 'No changes needed',
          },
          {
            section_number: 2,
            section_heading: '## Model',
            recommendation: 'BACKPORT',
            category: 'BUG_FIX',
            confidence: 0.92,
            summary: 'Formula correction',
            specific_changes: [{ type: 'fix', original: 'k*', improved: 'k* = sA/δ' }],
            reasoning: 'Missing parameter A',
          },
          {
            section_number: 3,
            section_heading: '## Conclusion',
            recommendation: 'NO_BACKPORT',
            category: 'I18N_ONLY',
            confidence: 0.88,
            summary: 'Only formatting changes',
            specific_changes: [],
            reasoning: 'Locale-specific',
          },
        ],
      });

      const results = parseFileEvaluationResponse(response, matchedPairs);
      expect(results).toHaveLength(3);
      expect(results[0].sectionHeading).toBe('## Introduction');
      expect(results[0].recommendation).toBe('NO_BACKPORT');
      expect(results[1].sectionHeading).toBe('## Model');
      expect(results[1].recommendation).toBe('BACKPORT');
      expect(results[1].category).toBe('BUG_FIX');
      expect(results[1].confidence).toBe(0.92);
      expect(results[1].specificChanges).toHaveLength(1);
      expect(results[2].category).toBe('I18N_ONLY');
    });

    it('should handle JSON in code fence', () => {
      const response = `Here's my analysis:

\`\`\`json
{
  "sections": [
    { "recommendation": "NO_BACKPORT", "category": "NO_CHANGE", "confidence": 0.9, "summary": "ok", "specific_changes": [], "reasoning": "fine" },
    { "recommendation": "BACKPORT", "category": "CLARIFICATION", "confidence": 0.75, "summary": "improved", "specific_changes": [], "reasoning": "better" },
    { "recommendation": "NO_BACKPORT", "category": "NO_CHANGE", "confidence": 0.9, "summary": "ok", "specific_changes": [], "reasoning": "fine" }
  ]
}
\`\`\``;

      const results = parseFileEvaluationResponse(response, matchedPairs);
      expect(results).toHaveLength(3);
      expect(results[1].recommendation).toBe('BACKPORT');
      expect(results[1].category).toBe('CLARIFICATION');
    });

    it('should handle fewer sections in response than expected', () => {
      const response = JSON.stringify({
        sections: [
          { recommendation: 'NO_BACKPORT', category: 'NO_CHANGE', confidence: 0.9, summary: 'ok', specific_changes: [], reasoning: 'fine' },
        ],
      });

      const results = parseFileEvaluationResponse(response, matchedPairs);
      expect(results).toHaveLength(3);
      expect(results[0].recommendation).toBe('NO_BACKPORT');
      // Missing sections default to safe values
      expect(results[1].recommendation).toBe('NO_BACKPORT');
      expect(results[1].confidence).toBe(0.5);
      expect(results[2].recommendation).toBe('NO_BACKPORT');
    });

    it('should handle completely unparseable response', () => {
      const results = parseFileEvaluationResponse(
        'I cannot process this request.', matchedPairs,
      );
      expect(results).toHaveLength(3);
      expect(results[0].recommendation).toBe('NO_BACKPORT');
      expect(results[0].confidence).toBe(0);
      expect(results[0].summary).toContain('Unable to parse');
    });

    it('should clamp confidence values', () => {
      const response = JSON.stringify({
        sections: [
          { recommendation: 'BACKPORT', category: 'BUG_FIX', confidence: 1.5, summary: 'test', specific_changes: [], reasoning: 'test' },
          { recommendation: 'BACKPORT', category: 'BUG_FIX', confidence: -0.3, summary: 'test', specific_changes: [], reasoning: 'test' },
          { recommendation: 'BACKPORT', category: 'BUG_FIX', confidence: 0.8, summary: 'test', specific_changes: [], reasoning: 'test' },
        ],
      });

      const results = parseFileEvaluationResponse(response, matchedPairs);
      expect(results[0].confidence).toBe(1.0);
      expect(results[1].confidence).toBe(0.0);
      expect(results[2].confidence).toBe(0.8);
    });

    it('should validate categories', () => {
      const response = JSON.stringify({
        sections: [
          { recommendation: 'BACKPORT', category: 'INVALID', confidence: 0.8, summary: 'test', specific_changes: [], reasoning: 'test' },
          { recommendation: 'BACKPORT', category: 'BUG_FIX', confidence: 0.8, summary: 'test', specific_changes: [], reasoning: 'test' },
          { recommendation: 'BACKPORT', category: 'CLARIFICATION', confidence: 0.8, summary: 'test', specific_changes: [], reasoning: 'test' },
        ],
      });

      const results = parseFileEvaluationResponse(response, matchedPairs);
      expect(results[0].category).toBe('NO_CHANGE'); // invalid → default
      expect(results[1].category).toBe('BUG_FIX');
      expect(results[2].category).toBe('CLARIFICATION');
    });

    it('should map sections by section_number when available', () => {
      // LLM returns sections out of order — section_number should be used for mapping
      const response = JSON.stringify({
        sections: [
          { section_number: 3, section_heading: 'Section Three', recommendation: 'NO_BACKPORT', category: 'NO_CHANGE', confidence: 0.9, summary: 'third', specific_changes: [], reasoning: 'ok' },
          { section_number: 1, section_heading: 'Section One', recommendation: 'BACKPORT', category: 'BUG_FIX', confidence: 0.85, summary: 'first', specific_changes: [], reasoning: 'important' },
          { section_number: 2, section_heading: 'Section Two', recommendation: 'NO_BACKPORT', category: 'NO_CHANGE', confidence: 0.7, summary: 'second', specific_changes: [], reasoning: 'fine' },
        ],
      });

      const results = parseFileEvaluationResponse(response, matchedPairs);
      expect(results).toHaveLength(3);
      // Section 1 maps to matchedPairs[0]
      expect(results[0].recommendation).toBe('BACKPORT');
      expect(results[0].category).toBe('BUG_FIX');
      expect(results[0].summary).toBe('first');
      // Section 2 maps to matchedPairs[1]
      expect(results[1].recommendation).toBe('NO_BACKPORT');
      expect(results[1].summary).toBe('second');
      // Section 3 maps to matchedPairs[2]
      expect(results[2].recommendation).toBe('NO_BACKPORT');
      expect(results[2].summary).toBe('third');
    });
  });

  describe('evaluateFile (test mode)', () => {
    const testOptions = {
      apiKey: 'test-key',
      model: 'claude-sonnet-4-6',
      sourceLanguage: 'en',
      targetLanguage: 'zh-cn',
      testMode: true,
    };

    it('should return NO_BACKPORT for all sections in test mode', async () => {
      const pairs: SectionPair[] = [
        {
          sourceSection: { heading: '## Intro', content: 'intro text', level: 2, id: 'intro', startLine: 1, endLine: 5, subsections: [] },
          targetSection: { heading: '## 介绍', content: '介绍文本', level: 2, id: 'intro', startLine: 1, endLine: 5, subsections: [] },
          status: 'MATCHED',
          sourceHeading: '## Intro',
          targetHeading: '## 介绍',
        },
        {
          sourceSection: { heading: '## Model', content: 'model text', level: 2, id: 'model', startLine: 6, endLine: 15, subsections: [] },
          targetSection: { heading: '## 模型', content: '模型文本', level: 2, id: 'model', startLine: 6, endLine: 15, subsections: [] },
          status: 'MATCHED',
          sourceHeading: '## Model',
          targetHeading: '## 模型',
        },
      ];

      const results = await evaluateFile(pairs, null, null, '', null, testOptions);
      expect(results).toHaveLength(2);
      expect(results[0].recommendation).toBe('NO_BACKPORT');
      expect(results[0].sectionHeading).toBe('## Intro');
      expect(results[1].recommendation).toBe('NO_BACKPORT');
      expect(results[1].sectionHeading).toBe('## Model');
    });

    it('should skip non-matched pairs', async () => {
      const pairs: SectionPair[] = [
        {
          sourceSection: { heading: '## Intro', content: 'intro text', level: 2, id: 'intro', startLine: 1, endLine: 5, subsections: [] },
          targetSection: { heading: '## 介绍', content: '介绍文本', level: 2, id: 'intro', startLine: 1, endLine: 5, subsections: [] },
          status: 'MATCHED',
          sourceHeading: '## Intro',
        },
        {
          sourceSection: { heading: '## Extra', content: 'extra text', level: 2, id: 'extra', startLine: 6, endLine: 15, subsections: [] },
          targetSection: null,
          status: 'SOURCE_ONLY',
          sourceHeading: '## Extra',
        },
      ];

      const results = await evaluateFile(pairs, null, null, '', null, testOptions);
      expect(results).toHaveLength(1);
      expect(results[0].sectionHeading).toBe('## Intro');
    });

    it('should return empty array when no matched pairs', async () => {
      const pairs: SectionPair[] = [
        {
          sourceSection: { heading: '## Extra', content: 'extra text', level: 2, id: 'extra', startLine: 1, endLine: 5, subsections: [] },
          targetSection: null,
          status: 'SOURCE_ONLY',
          sourceHeading: '## Extra',
        },
      ];

      const results = await evaluateFile(pairs, null, null, '', null, testOptions);
      expect(results).toHaveLength(0);
    });
  });
});

// =============================================================================
// Prompt snapshots
// =============================================================================

describe('evaluation prompt snapshots', () => {
  it('section evaluation prompt matches snapshot', () => {
    const prompt = buildEvaluationPrompt(
      '## Introduction\n\nThis is the introduction to the model.',
      '## 介绍\n\n这是模型的介绍。',
      '## Introduction',
      'English', 'zh-cn',
      null, null, 'Target may contain clarifications.', null,
    );
    expect(prompt).toMatchSnapshot();
  });

  it('file evaluation prompt matches snapshot', () => {
    const pairs = [
      {
        sourceSection: { heading: '## Intro', content: 'Source intro.', level: 2, id: 'intro', startLine: 1, endLine: 3, subsections: [] },
        targetSection: { heading: '## 介绍', content: '翻译介绍。', level: 2, id: '介绍', startLine: 1, endLine: 3, subsections: [] },
        status: 'MATCHED' as const,
        sourceHeading: '## Intro',
      },
    ];
    const prompt = buildFileEvaluationPrompt(
      pairs, 'English', 'zh-cn', null, null, 'Some triage notes.', null,
    );
    expect(prompt).toMatchSnapshot();
  });
});

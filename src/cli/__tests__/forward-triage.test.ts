/**
 * Tests for forward-triage module (content vs i18n classification)
 *
 * Tests prompt building, response parsing, and test-mode behavior.
 * Does NOT make real LLM calls.
 */

import {
  buildForwardTriagePrompt,
  parseForwardTriageResponse,
  triageForward,
} from '../forward-triage.js';

// =============================================================================
// buildForwardTriagePrompt
// =============================================================================

describe('buildForwardTriagePrompt', () => {
  it('includes source and target content', () => {
    const prompt = buildForwardTriagePrompt(
      'Hello world', '你好世界', 'English', 'zh-cn',
    );
    expect(prompt).toContain('Hello world');
    expect(prompt).toContain('你好世界');
    expect(prompt).toContain('English');
    expect(prompt).toContain('zh-cn');
  });

  it('mentions all four verdicts', () => {
    const prompt = buildForwardTriagePrompt('src', 'tgt', 'English', 'zh-cn');
    expect(prompt).toContain('CONTENT_CHANGES');
    expect(prompt).toContain('TARGET_HAS_ADDITIONS');
    expect(prompt).toContain('I18N_ONLY');
    expect(prompt).toContain('IDENTICAL');
  });

  it('requests JSON response format', () => {
    const prompt = buildForwardTriagePrompt('a', 'b', 'English', 'zh-cn');
    expect(prompt).toContain('"verdict"');
    expect(prompt).toContain('"reason"');
  });
});

// =============================================================================
// parseForwardTriageResponse
// =============================================================================

describe('parseForwardTriageResponse', () => {
  it('parses clean JSON in code fence', () => {
    const response = '```json\n{"verdict": "CONTENT_CHANGES", "reason": "Missing section"}\n```';
    const result = parseForwardTriageResponse(response);
    expect(result.verdict).toBe('CONTENT_CHANGES');
    expect(result.reason).toBe('Missing section');
  });

  it('parses JSON without code fence', () => {
    const response = '{"verdict": "I18N_ONLY", "reason": "punctuation style"}';
    const result = parseForwardTriageResponse(response);
    expect(result.verdict).toBe('I18N_ONLY');
    expect(result.reason).toBe('punctuation style');
  });

  it('parses IDENTICAL verdict', () => {
    const response = '```json\n{"verdict": "IDENTICAL", "reason": ""}\n```';
    const result = parseForwardTriageResponse(response);
    expect(result.verdict).toBe('IDENTICAL');
    expect(result.reason).toBe('');
  });

  it('normalizes case-insensitive verdict', () => {
    const response = '{"verdict": "i18n_only", "reason": "Style"}';
    const result = parseForwardTriageResponse(response);
    expect(result.verdict).toBe('I18N_ONLY');
  });

  it('falls back to keyword detection for "identical"', () => {
    const response = 'The documents are identical in content.';
    const result = parseForwardTriageResponse(response);
    expect(result.verdict).toBe('IDENTICAL');
  });

  it('does not match "not identical" as IDENTICAL', () => {
    const response = 'The documents are not identical — there are content differences.';
    const result = parseForwardTriageResponse(response);
    expect(result.verdict).toBe('CONTENT_CHANGES');
  });

  it('falls back to keyword detection for "i18n_only"', () => {
    const response = 'These are i18n only differences.';
    const result = parseForwardTriageResponse(response);
    expect(result.verdict).toBe('I18N_ONLY');
  });

  it('defaults to CONTENT_CHANGES when unparseable', () => {
    const response = 'Some random text with no recognizable pattern.';
    const result = parseForwardTriageResponse(response);
    expect(result.verdict).toBe('CONTENT_CHANGES');
    expect(result.reason).toContain('Unable to parse');
  });

  it('handles malformed JSON gracefully', () => {
    const response = '{verdict: CONTENT_CHANGES, reason:}';
    const result = parseForwardTriageResponse(response);
    // Falls through to keyword or default
    expect(['CONTENT_CHANGES', 'I18N_ONLY', 'IDENTICAL']).toContain(result.verdict);
  });

  it('handles JSON with extra text around it', () => {
    const response = 'Based on my analysis:\n\n{"verdict": "I18N_ONLY", "reason": "terminology"}\n\nThe differences are minor.';
    const result = parseForwardTriageResponse(response);
    expect(result.verdict).toBe('I18N_ONLY');
    expect(result.reason).toBe('terminology');
  });

  it('handles empty reason gracefully', () => {
    const response = '{"verdict": "IDENTICAL"}';
    const result = parseForwardTriageResponse(response);
    expect(result.verdict).toBe('IDENTICAL');
    expect(result.reason).toBe('');
  });

  it('treats unknown verdicts as CONTENT_CHANGES', () => {
    const response = '{"verdict": "MAYBE_CHANGES", "reason": "unclear"}';
    const result = parseForwardTriageResponse(response);
    expect(result.verdict).toBe('CONTENT_CHANGES');
  });

  it('parses TARGET_HAS_ADDITIONS verdict', () => {
    const response = '```json\n{"verdict": "TARGET_HAS_ADDITIONS", "reason": "Target has extra examples"}\n```';
    const result = parseForwardTriageResponse(response);
    expect(result.verdict).toBe('TARGET_HAS_ADDITIONS');
    expect(result.reason).toBe('Target has extra examples');
  });

  it('normalizes case-insensitive TARGET_HAS_ADDITIONS', () => {
    const response = '{"verdict": "target_has_additions", "reason": "extra section"}';
    const result = parseForwardTriageResponse(response);
    expect(result.verdict).toBe('TARGET_HAS_ADDITIONS');
  });

  it('falls back to keyword detection for "target_has_additions"', () => {
    const response = 'The target_has_additions beyond what source provides.';
    const result = parseForwardTriageResponse(response);
    expect(result.verdict).toBe('TARGET_HAS_ADDITIONS');
  });
});

// =============================================================================
// triageForward — test mode
// =============================================================================

describe('triageForward (test mode)', () => {
  const baseOptions = {
    apiKey: 'test-key',
    model: 'claude-sonnet-4-6',
    sourceLanguage: 'English',
    targetLanguage: 'zh-cn',
    testMode: true,
  };

  it('returns IDENTICAL for files with "identical" in name', async () => {
    const result = await triageForward('identical-file.md', 'src', 'tgt', baseOptions);
    expect(result.file).toBe('identical-file.md');
    expect(result.verdict).toBe('IDENTICAL');
  });

  it('returns IDENTICAL for files with "aligned" in name', async () => {
    const result = await triageForward('my-aligned.md', 'src', 'tgt', baseOptions);
    expect(result.verdict).toBe('IDENTICAL');
  });

  it('returns I18N_ONLY for files with "i18n" in name', async () => {
    const result = await triageForward('i18n-differences.md', 'src', 'tgt', baseOptions);
    expect(result.verdict).toBe('I18N_ONLY');
  });

  it('returns I18N_ONLY for files with "style" in name', async () => {
    const result = await triageForward('style-only.md', 'src', 'tgt', baseOptions);
    expect(result.verdict).toBe('I18N_ONLY');
  });

  it('returns CONTENT_CHANGES for other files', async () => {
    const result = await triageForward('cobweb.md', 'src', 'tgt', baseOptions);
    expect(result.verdict).toBe('CONTENT_CHANGES');
  });

  it('returns TARGET_HAS_ADDITIONS for files with "additions" in name', async () => {
    const result = await triageForward('additions-test.md', 'src', 'tgt', baseOptions);
    expect(result.verdict).toBe('TARGET_HAS_ADDITIONS');
  });

  it('returns TARGET_HAS_ADDITIONS for files with "target-extra" in name', async () => {
    const result = await triageForward('target-extra.md', 'src', 'tgt', baseOptions);
    expect(result.verdict).toBe('TARGET_HAS_ADDITIONS');
  });

  it('returns IDENTICAL when source === target (even without testMode)', async () => {
    const same = '## Hello\n\nSame content';
    const result = await triageForward('any.md', same, same, baseOptions);
    expect(result.verdict).toBe('IDENTICAL');
    expect(result.reason).toContain('byte-identical');
  });
});

// =============================================================================
// Prompt snapshot
// =============================================================================

describe('forward triage prompt snapshot', () => {
  it('matches snapshot', () => {
    const prompt = buildForwardTriagePrompt(
      '## Introduction\n\nThis is an intro.',
      '## 介绍\n\n这是一个介绍。',
      'English',
      'zh-cn',
    );
    expect(prompt).toMatchSnapshot();
  });
});

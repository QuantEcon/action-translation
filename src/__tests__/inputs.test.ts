/**
 * Tests for Action Inputs module
 * 
 * Tests input validation for both SYNC and REVIEW modes including:
 * - Mode validation
 * - Repo format validation
 * - Language code validation
 * - Claude model validation
 * - PR event validation
 * - Docs folder normalization
 */

import * as core from '@actions/core';
import { getMode, getInputs, getReviewInputs, validatePREvent, validateReviewPREvent } from '../inputs';

// Mock @actions/core
jest.mock('@actions/core');
const mockedCore = core as jest.Mocked<typeof core>;

// Helper to set up mock inputs
function setMockInputs(inputs: Record<string, string>) {
  mockedCore.getInput.mockImplementation((name: string) => inputs[name] || '');
}

// =============================================================================
// MODE VALIDATION TESTS
// =============================================================================

describe('getMode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should accept sync mode', () => {
    setMockInputs({ mode: 'sync' });
    expect(getMode()).toBe('sync');
  });

  it('should accept review mode', () => {
    setMockInputs({ mode: 'review' });
    expect(getMode()).toBe('review');
  });

  it('should reject invalid modes', () => {
    setMockInputs({ mode: 'invalid' });
    expect(() => getMode()).toThrow(/Invalid mode/);
  });

  it('should reject empty mode', () => {
    setMockInputs({ mode: '' });
    expect(() => getMode()).toThrow(/Missing required input.*mode/);
  });
});

// =============================================================================
// SYNC MODE INPUT TESTS
// =============================================================================

describe('getInputs (sync mode)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const validInputs = {
    'target-repo': 'owner/repo',
    'target-language': 'zh-cn',
    'docs-folder': 'lectures',
    'anthropic-api-key': 'sk-test-key',
    'github-token': 'ghp-test-token',
  };

  it('should accept valid inputs', () => {
    setMockInputs(validInputs);
    const result = getInputs();
    
    expect(result.targetRepo).toBe('owner/repo');
    expect(result.targetLanguage).toBe('zh-cn');
    expect(result.docsFolder).toBe('lectures/');
  });

  it('should reject invalid target-repo format (missing slash)', () => {
    setMockInputs({ ...validInputs, 'target-repo': 'invalid-repo' });
    expect(() => getInputs()).toThrow(/Invalid target-repo format/);
  });

  it('should validate target language code', () => {
    setMockInputs({ ...validInputs, 'target-language': 'invalid-lang' });
    expect(() => getInputs()).toThrow(/Unsupported target language/);
  });

  describe('docs-folder normalization', () => {
    it('should handle root level with "."', () => {
      setMockInputs({ ...validInputs, 'docs-folder': '.' });
      const result = getInputs();
      expect(result.docsFolder).toBe('');
    });

    it('should handle root level with "/"', () => {
      setMockInputs({ ...validInputs, 'docs-folder': '/' });
      const result = getInputs();
      expect(result.docsFolder).toBe('');
    });

    it('should add trailing slash to folder', () => {
      setMockInputs({ ...validInputs, 'docs-folder': 'docs' });
      const result = getInputs();
      expect(result.docsFolder).toBe('docs/');
    });

    it('should not duplicate trailing slash', () => {
      setMockInputs({ ...validInputs, 'docs-folder': 'docs/' });
      const result = getInputs();
      expect(result.docsFolder).toBe('docs/');
    });
  });

  describe('default values', () => {
    it('should use default claude model', () => {
      setMockInputs(validInputs);
      const result = getInputs();
      expect(result.claudeModel).toBe('claude-sonnet-4-5-20250929');
    });

    it('should use default source language', () => {
      setMockInputs(validInputs);
      const result = getInputs();
      expect(result.sourceLanguage).toBe('en');
    });

    it('should use default toc file', () => {
      setMockInputs(validInputs);
      const result = getInputs();
      expect(result.tocFile).toBe('_toc.yml');
    });

    it('should use default pr labels', () => {
      setMockInputs(validInputs);
      const result = getInputs();
      expect(result.prLabels).toEqual(['action-translation', 'automated']);
    });
  });

  describe('pr-labels parsing', () => {
    it('should parse comma-separated labels', () => {
      setMockInputs({ ...validInputs, 'pr-labels': 'label1,label2,label3' });
      const result = getInputs();
      expect(result.prLabels).toEqual(['label1', 'label2', 'label3']);
    });

    it('should trim whitespace from labels', () => {
      setMockInputs({ ...validInputs, 'pr-labels': ' label1 , label2 , label3 ' });
      const result = getInputs();
      expect(result.prLabels).toEqual(['label1', 'label2', 'label3']);
    });

    it('should filter empty labels', () => {
      setMockInputs({ ...validInputs, 'pr-labels': 'label1,,label2,' });
      const result = getInputs();
      expect(result.prLabels).toEqual(['label1', 'label2']);
    });
  });

  describe('test-mode parsing', () => {
    it('should parse test-mode true', () => {
      setMockInputs({ ...validInputs, 'test-mode': 'true' });
      const result = getInputs();
      expect(result.testMode).toBe(true);
    });

    it('should parse test-mode false', () => {
      setMockInputs({ ...validInputs, 'test-mode': 'false' });
      const result = getInputs();
      expect(result.testMode).toBe(false);
    });

    it('should default test-mode to false', () => {
      setMockInputs(validInputs);
      const result = getInputs();
      expect(result.testMode).toBe(false);
    });

    it('should be case-insensitive', () => {
      setMockInputs({ ...validInputs, 'test-mode': 'TRUE' });
      const result = getInputs();
      expect(result.testMode).toBe(true);
    });
  });
});

// =============================================================================
// REVIEW MODE INPUT TESTS
// =============================================================================

describe('getReviewInputs (review mode)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const validReviewInputs = {
    'source-repo': 'owner/repo',
    'anthropic-api-key': 'sk-test-key',
    'github-token': 'ghp-test-token',
  };

  it('should accept valid review inputs', () => {
    setMockInputs(validReviewInputs);
    const result = getReviewInputs();
    
    expect(result.sourceRepo).toBe('owner/repo');
  });

  it('should reject invalid source-repo format', () => {
    setMockInputs({ ...validReviewInputs, 'source-repo': 'invalid-repo' });
    expect(() => getReviewInputs()).toThrow(/Invalid source-repo format/);
  });

  describe('max-suggestions validation', () => {
    it('should accept positive integers', () => {
      setMockInputs({ ...validReviewInputs, 'max-suggestions': '10' });
      const result = getReviewInputs();
      expect(result.maxSuggestions).toBe(10);
    });

    it('should accept zero', () => {
      setMockInputs({ ...validReviewInputs, 'max-suggestions': '0' });
      const result = getReviewInputs();
      expect(result.maxSuggestions).toBe(0);
    });

    it('should use default of 5', () => {
      setMockInputs(validReviewInputs);
      const result = getReviewInputs();
      expect(result.maxSuggestions).toBe(5);
    });

    it('should reject negative numbers', () => {
      setMockInputs({ ...validReviewInputs, 'max-suggestions': '-1' });
      expect(() => getReviewInputs()).toThrow(/Invalid max-suggestions/);
    });

    it('should reject non-numeric values', () => {
      setMockInputs({ ...validReviewInputs, 'max-suggestions': 'abc' });
      expect(() => getReviewInputs()).toThrow(/Invalid max-suggestions/);
    });
  });
});

// =============================================================================
// CLAUDE MODEL VALIDATION TESTS
// =============================================================================

describe('Claude Model Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseInputs = {
    'target-repo': 'owner/repo',
    'target-language': 'zh-cn',
    'anthropic-api-key': 'sk-test-key',
    'github-token': 'ghp-test-token',
  };

  const validModels = [
    'claude-3-5-sonnet-20241022',
    'claude-sonnet-4-5-20250929',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
    'claude-opus-4-5-20251101',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
  ];

  validModels.forEach(model => {
    it(`should accept valid model: ${model}`, () => {
      setMockInputs({ ...baseInputs, 'claude-model': model });
      const result = getInputs();
      expect(result.claudeModel).toBe(model);
      // Should not produce warning for valid model
      expect(mockedCore.warning).not.toHaveBeenCalled();
    });
  });

  it('should warn about unrecognized model but still use it', () => {
    setMockInputs({ ...baseInputs, 'claude-model': 'claude-unknown-model' });
    const result = getInputs();
    expect(result.claudeModel).toBe('claude-unknown-model');
    expect(mockedCore.warning).toHaveBeenCalledWith(expect.stringContaining('Unrecognized Claude model'));
  });
});

// =============================================================================
// PR EVENT VALIDATION TESTS (SYNC MODE)
// =============================================================================

describe('validatePREvent (sync mode)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should accept merged PR', () => {
    const context = {
      eventName: 'pull_request',
      payload: {
        action: 'closed',
        pull_request: {
          merged: true,
          number: 123,
        },
      },
    };

    const result = validatePREvent(context, false);
    expect(result.merged).toBe(true);
    expect(result.prNumber).toBe(123);
    expect(result.isTestMode).toBe(false);
  });

  it('should handle closed but not merged PR', () => {
    const context = {
      eventName: 'pull_request',
      payload: {
        action: 'closed',
        pull_request: {
          merged: false,
          number: 123,
        },
      },
    };

    const result = validatePREvent(context, false);
    expect(result.merged).toBe(false);
    expect(result.prNumber).toBe(123);
  });

  it('should reject non-pull_request events', () => {
    const context = {
      eventName: 'push',
      payload: {},
    };

    expect(() => validatePREvent(context, false)).toThrow(/only works on pull_request events/);
  });

  it('should reject non-closed actions without test mode', () => {
    const context = {
      eventName: 'pull_request',
      payload: {
        action: 'opened',
        pull_request: {
          number: 123,
        },
      },
    };

    expect(() => validatePREvent(context, false)).toThrow(/only runs when PRs are closed/);
  });

  describe('test mode', () => {
    it('should accept labeled event with test-translation label', () => {
      const context = {
        eventName: 'pull_request',
        payload: {
          action: 'labeled',
          label: { name: 'test-translation' },
          pull_request: {
            number: 123,
          },
        },
      };

      const result = validatePREvent(context, false);
      expect(result.merged).toBe(true); // treated as merged for processing
      expect(result.isTestMode).toBe(true);
    });

    it('should accept testMode=true parameter', () => {
      const context = {
        eventName: 'pull_request',
        payload: {
          action: 'opened',
          pull_request: {
            number: 123,
          },
        },
      };

      const result = validatePREvent(context, true);
      expect(result.merged).toBe(true);
      expect(result.isTestMode).toBe(true);
    });
  });
});

// =============================================================================
// PR EVENT VALIDATION TESTS (REVIEW MODE)
// =============================================================================

describe('validateReviewPREvent (review mode)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should accept pull_request event', () => {
    const context = {
      eventName: 'pull_request',
      payload: {
        pull_request: {
          number: 456,
        },
      },
    };

    const result = validateReviewPREvent(context);
    expect(result.prNumber).toBe(456);
  });

  it('should reject non-pull_request events', () => {
    const context = {
      eventName: 'push',
      payload: {},
    };

    expect(() => validateReviewPREvent(context)).toThrow(/only works on pull_request events/);
  });

  it('should reject missing PR number', () => {
    const context = {
      eventName: 'pull_request',
      payload: {
        pull_request: {},
      },
    };

    expect(() => validateReviewPREvent(context)).toThrow(/Could not determine PR number/);
  });
});

// =============================================================================
// LANGUAGE CODE VALIDATION
// =============================================================================

describe('Language Code Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseInputs = {
    'target-repo': 'owner/repo',
    'anthropic-api-key': 'sk-test-key',
    'github-token': 'ghp-test-token',
  };

  // Only test languages that are actually configured in LANGUAGE_CONFIGS
  const supportedLanguages = [
    'zh-cn',  // Simplified Chinese
    'fa',     // Persian (Farsi)
  ];

  supportedLanguages.forEach(lang => {
    it(`should accept supported language: ${lang}`, () => {
      setMockInputs({ ...baseInputs, 'target-language': lang });
      const result = getInputs();
      expect(result.targetLanguage).toBe(lang);
    });
  });

  it('should reject unsupported language codes', () => {
    setMockInputs({ ...baseInputs, 'target-language': 'xx' });
    expect(() => getInputs()).toThrow(/Unsupported target language/);
  });

  // These languages are NOT YET configured - tests document future expansion
  const futureLanguages = ['zh-tw', 'ja', 'ko', 'es', 'de', 'fr'];
  
  futureLanguages.forEach(lang => {
    it(`should reject not-yet-configured language: ${lang}`, () => {
      setMockInputs({ ...baseInputs, 'target-language': lang });
      expect(() => getInputs()).toThrow(/Unsupported target language/);
    });
  });
});

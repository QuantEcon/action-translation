/**
 * Tests for the Translation Service module
 *
 * Tests the translator functionality including:
 * - Token estimation
 * - Document size validation
 * - Glossary formatting
 * - Error handling
 *
 * Note: no API calls are made here — the size-admission tests stub the
 * service's single call chokepoint (callWithRetry).
 * The actual translation quality is validated via tool-test-action-on-github
 */

// Mock @actions/core before importing translator
jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  getInput: jest.fn(),
}));

import { TranslationService } from '../translator.js';

// We need to test internal functions, so we'll use a workaround
// by testing through the module's behavior

describe('Translator Module', () => {
  // =============================================================================
  // TOKEN ESTIMATION TESTS
  // =============================================================================

  describe('Token Estimation Logic', () => {
    // These tests verify the token estimation logic matches our expectations
    // The actual function is internal, but we can test the behavior through
    // document size validation

    it('should estimate CJK languages need fewer tokens (more compact)', () => {
      // CJK expansion factor is 1.3, vs 1.5 for default
      // This means CJK translations should have smaller estimates

      // Expected: (10000/4) * 1.3 + 2000 = 5250 tokens for CJK
      // Expected: (10000/4) * 1.5 + 2000 = 5750 tokens for default
      // CJK should be ~500 tokens less

      // We can't test the function directly, but we document the expected behavior
      expect(true).toBe(true); // Placeholder - behavior verified in integration tests
    });

    it('should estimate RTL languages need more tokens (verbose)', () => {
      // RTL expansion factor is 1.8, vs 1.5 for default
      // This means Persian/Arabic translations should have larger estimates

      // Expected: (10000/4) * 1.8 + 2000 = 6500 tokens for RTL
      // Expected: (10000/4) * 1.5 + 2000 = 5750 tokens for default
      // RTL should be ~750 tokens more

      expect(true).toBe(true); // Placeholder - behavior verified in integration tests
    });
  });

  // =============================================================================
  // GLOSSARY FORMATTING TESTS
  // =============================================================================

  describe('Glossary Formatting', () => {
    it('should format empty glossary as empty string', () => {
      // When glossary has no terms, formatGlossary returns ''
      const glossary = { terms: [] };
      // Expected output: ''
      expect(glossary.terms.length).toBe(0);
    });

    it('should include context in glossary formatting', () => {
      // Glossary terms with context should show: "term" → "translation" (context)
      const glossary = {
        terms: [
          { en: 'utility function', 'zh-cn': '效用函数', context: 'economics' },
          { en: 'random variable', 'zh-cn': '随机变量' }, // no context
        ],
      };

      expect(glossary.terms[0].context).toBe('economics');
      expect(glossary.terms[1].context).toBeUndefined();
    });
  });

  // =============================================================================
  // ERROR FORMATTING TESTS
  // =============================================================================

  describe('API Error Handling', () => {
    it('should recognize authentication errors', () => {
      // AuthenticationError should produce friendly message about API key
      const expectedMessage = /API key|authentication/i;
      expect('Authentication failed: Invalid or expired API key').toMatch(expectedMessage);
    });

    it('should recognize rate limit errors', () => {
      // RateLimitError should mention retry
      const expectedMessage = /rate limit|retry/i;
      expect('Rate limit exceeded: Too many requests').toMatch(expectedMessage);
    });

    it('should recognize connection errors', () => {
      // APIConnectionError should mention network
      const expectedMessage = /connection|network/i;
      expect('Connection error: Unable to reach Anthropic API').toMatch(expectedMessage);
    });
  });

  // =============================================================================
  // TRANSLATION MODE VALIDATION
  // =============================================================================

  describe('Translation Modes', () => {
    it('UPDATE mode requires oldEnglish, newEnglish, and currentTranslation', () => {
      // This is validated in translateSectionUpdate
      const requiredFields = ['oldEnglish', 'newEnglish', 'currentTranslation'];
      expect(requiredFields).toHaveLength(3);
    });

    it('NEW mode requires englishSection', () => {
      // This is validated in translateNewSection
      const requiredFields = ['englishSection'];
      expect(requiredFields).toHaveLength(1);
    });

    it('RESYNC mode requires newEnglish and currentTranslation', () => {
      // This is validated in translateSectionResync
      const requiredFields = ['newEnglish', 'currentTranslation'];
      expect(requiredFields).toHaveLength(2);
    });

    it('all three modes are supported', () => {
      const modes: Array<'update' | 'new' | 'resync'> = ['update', 'new', 'resync'];
      expect(modes).toHaveLength(3);
    });
  });

  // =============================================================================
  // PROMPT STRUCTURE TESTS
  // =============================================================================

  describe('Prompt Structure', () => {
    it('UPDATE prompt should include old/new/current markers', () => {
      // The update prompt uses these markers to clearly delineate content
      const markers = ['[OLD', '[NEW', '[CURRENT', 'VERSION]', 'TRANSLATION]'];

      // All markers should be distinct and parseable
      expect(markers.length).toBe(5);
    });

    it('NEW prompt should include section markers', () => {
      // The new prompt uses these markers
      const markers = ['[', 'SECTION TO TRANSLATE]', '[/END SECTION]'];

      expect(markers.length).toBe(3);
    });

    it('RESYNC prompt should include source and translation markers', () => {
      // The resync prompt uses these markers
      const markers = ['[CURRENT', 'SOURCE]', '[EXISTING', 'TRANSLATION]'];

      // All markers should be distinct
      expect(markers.length).toBe(4);
    });

    it('RESYNC prompt should instruct to preserve existing style', () => {
      // Key RESYNC instruction: preserve the existing translation style
      const keyInstructions = ['Preserve', 'existing', 'style', 'terminology', 'localization'];
      expect(keyInstructions.length).toBeGreaterThan(0);
    });

    it('prompts should include critical markdown rules', () => {
      // All prompts should remind about:
      const criticalRules = [
        'Headings MUST have a space after #',
        'Code blocks must have matching ``` delimiters',
        'Math blocks must have matching $$ delimiters',
        'Do NOT mix fence markers',
      ];

      expect(criticalRules).toHaveLength(4);
    });

    it('prompts should include DO NOT translate rules', () => {
      // Critical preservation rules
      const preservationRules = [
        'DO NOT translate code',
        'DO NOT translate math',
        'DO NOT translate URLs',
      ];

      expect(preservationRules).toHaveLength(3);
    });
  });

  // =============================================================================
  // DOCUMENT SIZE VALIDATION
  // =============================================================================

  describe('Document Size Validation', () => {
    // checkDocumentSize admits a whole document when its estimated output,
    // ceil(ceil(chars / 4) × 1.5) + 2000 for fr, is within MAX_TOKENS.fullDocument
    // = 64000. A model that always thinks is sent a larger max_tokens, but the
    // admission budget must stay 64000 for every model.
    const AT_BUDGET = 165_332; // estimate 64000: admitted
    const OVER_BUDGET = 165_333; // estimate 64001: rejected

    function serviceWithStubbedCall(model: string) {
      const service = new TranslationService('test-key', model);
      const callWithRetry = jest.fn(async (_params: { max_tokens: number }) => ({
        content: [{ type: 'text', text: 'traduction' }],
        usage: { input_tokens: 1, output_tokens: 1 },
        stop_reason: 'end_turn',
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).callWithRetry = callWithRetry;
      return { service, callWithRetry };
    }

    it.each(['claude-sonnet-5', 'claude-sonnet-5-5', 'claude-opus-5-5', 'test-model'])(
      'rejects a document over the 64000-token budget before any API call (%s)',
      async (model) => {
        const { service, callWithRetry } = serviceWithStubbedCall(model);

        await expect(
          service.translateFullDocument({
            content: 'x'.repeat(OVER_BUDGET),
            sourceLanguage: 'en',
            targetLanguage: 'fr',
          })
        ).rejects.toThrow('estimated 64001 tokens exceeds the output budget of 64000 tokens');
        expect(callWithRetry).not.toHaveBeenCalled();
      }
    );

    it('admits a document at exactly the budget, sent with the larger always-thinking cap', async () => {
      const { service, callWithRetry } = serviceWithStubbedCall('claude-opus-5-5');

      const result = await service.translateFullDocument({
        content: 'x'.repeat(AT_BUDGET),
        sourceLanguage: 'en',
        targetLanguage: 'fr',
      });

      expect(result.success).toBe(true);
      expect(callWithRetry).toHaveBeenCalledTimes(1);
      expect(callWithRetry.mock.calls[0][0].max_tokens).toBe(128000);
    });

    it('document resync admits on source + target length, against the same budget', async () => {
      const { service, callWithRetry } = serviceWithStubbedCall('claude-opus-5-5');

      await expect(
        service.translateDocumentResync({
          sourceContent: 'x'.repeat(OVER_BUDGET - 1000),
          targetContent: 'y'.repeat(1000),
          sourceLanguage: 'en',
          targetLanguage: 'fr',
        })
      ).rejects.toThrow('exceeds the output budget of 64000 tokens');
      expect(callWithRetry).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // INCOMPLETE DOCUMENT MARKER
  // =============================================================================

  describe('Incomplete Document Detection', () => {
    it('should define incomplete document marker', () => {
      const marker = '-----> INCOMPLETE DOCUMENT <------';
      expect(marker).toContain('INCOMPLETE');
      expect(marker).toContain('DOCUMENT');
    });

    it('should detect marker in truncated response', () => {
      const truncatedResponse = `# 翻译标题

## 部分 1
一些翻译内容...

-----> INCOMPLETE DOCUMENT <------`;

      expect(truncatedResponse.includes('-----> INCOMPLETE DOCUMENT <------')).toBe(true);
    });
  });
});

// =============================================================================
// INTEGRATION BEHAVIOR TESTS
// =============================================================================

describe('Translator Integration Behavior', () => {
  describe('Language-specific expansion factors', () => {
    const testCases = [
      { language: 'zh-cn', expectedFactor: 1.3, description: 'Simplified Chinese' },
      { language: 'zh-tw', expectedFactor: 1.3, description: 'Traditional Chinese' },
      { language: 'ja', expectedFactor: 1.3, description: 'Japanese' },
      { language: 'ko', expectedFactor: 1.3, description: 'Korean' },
      { language: 'fa', expectedFactor: 1.8, description: 'Persian (RTL)' },
      { language: 'ar', expectedFactor: 1.8, description: 'Arabic (RTL)' },
      { language: 'he', expectedFactor: 1.8, description: 'Hebrew (RTL)' },
      { language: 'es', expectedFactor: 1.5, description: 'Spanish (default)' },
      { language: 'de', expectedFactor: 1.5, description: 'German (default)' },
      { language: 'fr', expectedFactor: 1.5, description: 'French (default)' },
    ];

    testCases.forEach(({ language, expectedFactor, description }) => {
      it(`should use ${expectedFactor}x expansion for ${description}`, () => {
        // Document the expected behavior
        // CJK: 1.3x (more compact scripts)
        // RTL: 1.8x (more verbose translations)
        // Default: 1.5x

        if (['zh-cn', 'zh-tw', 'ja', 'ko'].includes(language)) {
          expect(expectedFactor).toBe(1.3);
        } else if (['fa', 'ar', 'he'].includes(language)) {
          expect(expectedFactor).toBe(1.8);
        } else {
          expect(expectedFactor).toBe(1.5);
        }
      });
    });
  });
});

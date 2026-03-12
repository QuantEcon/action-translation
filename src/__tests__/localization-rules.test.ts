import {
  parseLocalizationRules,
  buildLocalizationPrompt,
  ALL_RULE_IDS,
  DEFAULT_RULES,
} from '../localization-rules.js';

describe('localization-rules', () => {
  // ========================================================================
  // parseLocalizationRules
  // ========================================================================

  describe('parseLocalizationRules', () => {
    it('parses comma-separated valid rules', () => {
      expect(parseLocalizationRules('code-comments,figure-labels'))
        .toEqual(['code-comments', 'figure-labels']);
    });

    it('parses single rule', () => {
      expect(parseLocalizationRules('figure-labels'))
        .toEqual(['figure-labels']);
    });

    it('returns empty array for "none"', () => {
      expect(parseLocalizationRules('none')).toEqual([]);
    });

    it('handles whitespace and casing', () => {
      expect(parseLocalizationRules(' Code-Comments , Figure-Labels '))
        .toEqual(['code-comments', 'figure-labels']);
    });

    it('throws on unknown rule', () => {
      expect(() => parseLocalizationRules('code-comments,unknown-rule'))
        .toThrow(/Unknown localization rule\(s\): unknown-rule/);
    });

    it('throws on multiple unknown rules', () => {
      expect(() => parseLocalizationRules('foo,bar'))
        .toThrow(/foo, bar/);
    });

    it('lists available rules in error message', () => {
      expect(() => parseLocalizationRules('bad'))
        .toThrow(/Available: code-comments, figure-labels, none/);
    });
  });

  // ========================================================================
  // buildLocalizationPrompt
  // ========================================================================

  describe('buildLocalizationPrompt', () => {
    it('returns empty string when no rules', () => {
      expect(buildLocalizationPrompt([], 'zh-cn')).toBe('');
    });

    it('includes code-comments rule text', () => {
      const prompt = buildLocalizationPrompt(['code-comments'], 'zh-cn');
      expect(prompt).toContain('Localize code comments');
      expect(prompt).toContain('计算稳态');
    });

    it('includes figure-labels rule text', () => {
      const prompt = buildLocalizationPrompt(['figure-labels'], 'zh-cn');
      expect(prompt).toContain('Localize figure labels');
      expect(prompt).toContain('价格动态');
    });

    it('includes both rules numbered', () => {
      const prompt = buildLocalizationPrompt(['code-comments', 'figure-labels'], 'zh-cn');
      expect(prompt).toContain('1. **Localize code comments**');
      expect(prompt).toContain('2. **Localize figure labels**');
    });

    it('contains override note', () => {
      const prompt = buildLocalizationPrompt(DEFAULT_RULES, 'zh-cn');
      expect(prompt).toContain('OVERRIDE the default "keep code as-is" rule');
    });

    it('produces Farsi examples for fa', () => {
      const prompt = buildLocalizationPrompt(DEFAULT_RULES, 'fa');
      expect(prompt).toContain('محاسبه حالت پایدار');
      expect(prompt).toContain('دینامیک قیمت');
    });

    it('works for unsupported language (no examples)', () => {
      const prompt = buildLocalizationPrompt(DEFAULT_RULES, 'ja');
      expect(prompt).toContain('Localize code comments');
      expect(prompt).toContain('Localize figure labels');
      // No language-specific examples, but prompt still valid
      expect(prompt).not.toContain('计算稳态');
    });
  });

  // ========================================================================
  // Constants
  // ========================================================================

  describe('constants', () => {
    it('ALL_RULE_IDS contains both rules', () => {
      expect(ALL_RULE_IDS).toEqual(['code-comments', 'figure-labels']);
    });

    it('DEFAULT_RULES matches ALL_RULE_IDS', () => {
      expect(DEFAULT_RULES).toEqual(ALL_RULE_IDS);
    });
  });
});

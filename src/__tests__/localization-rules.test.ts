import {
  parseLocalizationRules,
  buildLocalizationPrompt,
  getFontRequirements,
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

    it('parses i18n-font-config rule', () => {
      expect(parseLocalizationRules('i18n-font-config'))
        .toEqual(['i18n-font-config']);
    });

    it('parses all three rules', () => {
      expect(parseLocalizationRules('code-comments,figure-labels,i18n-font-config'))
        .toEqual(['code-comments', 'figure-labels', 'i18n-font-config']);
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
        .toThrow(/Available: code-comments, figure-labels, i18n-font-config, none/);
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

    it('includes i18n-font-config for zh-cn', () => {
      const prompt = buildLocalizationPrompt(['i18n-font-config'], 'zh-cn');
      expect(prompt).toContain('Inject font configuration');
      expect(prompt).toContain('SourceHanSerifSC-SemiBold.otf');
      expect(prompt).toContain('Source Han Serif SC');
      expect(prompt).toContain('# i18n');
    });

    it('skips i18n-font-config for fa (no special fonts needed)', () => {
      const prompt = buildLocalizationPrompt(['i18n-font-config'], 'fa');
      expect(prompt).toBe('');
    });

    it('skips i18n-font-config for unsupported language', () => {
      const prompt = buildLocalizationPrompt(['i18n-font-config'], 'ja');
      // No font config for Japanese, rule produces empty string → filtered out
      expect(prompt).not.toContain('Inject font configuration');
    });

    it('numbers rules correctly with all three', () => {
      const prompt = buildLocalizationPrompt(['code-comments', 'figure-labels', 'i18n-font-config'], 'zh-cn');
      expect(prompt).toContain('1. **Localize code comments**');
      expect(prompt).toContain('2. **Localize figure labels**');
      expect(prompt).toContain('3. **Inject font configuration**');
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
      const prompt = buildLocalizationPrompt(['code-comments', 'figure-labels'], 'ja');
      expect(prompt).toContain('Localize code comments');
      expect(prompt).toContain('Localize figure labels');
      expect(prompt).not.toContain('计算稳态');
    });
  });

  // ========================================================================
  // getFontRequirements
  // ========================================================================

  describe('getFontRequirements', () => {
    it('returns zh-cn font requirements', () => {
      const reqs = getFontRequirements('zh-cn');
      expect(reqs).toHaveLength(1);
      expect(reqs[0].filename).toBe('SourceHanSerifSC-SemiBold.otf');
      expect(reqs[0].url).toContain('source-han-serif');
    });

    it('returns empty for unsupported language', () => {
      expect(getFontRequirements('ja')).toEqual([]);
    });
  });

  // ========================================================================
  // Constants
  // ========================================================================

  describe('constants', () => {
    it('ALL_RULE_IDS contains all three rules', () => {
      expect(ALL_RULE_IDS).toEqual(['code-comments', 'figure-labels', 'i18n-font-config']);
    });

    it('DEFAULT_RULES matches ALL_RULE_IDS', () => {
      expect(DEFAULT_RULES).toEqual(ALL_RULE_IDS);
    });
  });
});

/**
 * Tests for language-specific configuration
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  getLanguageConfig,
  formatAdditionalRules,
  getSupportedLanguages,
  isLanguageSupported,
  validateLanguageCode,
  languageLabel,
} from '../language-config.js';

describe('Language Configuration', () => {
  describe('getLanguageConfig', () => {
    it('should return Chinese config for zh-cn', () => {
      const config = getLanguageConfig('zh-cn');
      expect(config.code).toBe('zh-cn');
      expect(config.name).toBe('Chinese (Simplified)');
      expect(config.additionalRules).toHaveLength(2);
      expect(config.additionalRules[0]).toContain('full-width Chinese punctuation');
      expect(config.additionalRules[1]).toContain(
        'space between Chinese characters and inline MyST directives'
      );
    });

    it('should handle case insensitive language codes', () => {
      const config1 = getLanguageConfig('zh-cn');
      const config2 = getLanguageConfig('ZH-CN');
      const config3 = getLanguageConfig('Zh-Cn');

      expect(config1).toEqual(config2);
      expect(config2).toEqual(config3);
    });

    it('should return Malayalam config with keep-English-dominant rules', () => {
      const config = getLanguageConfig('ml');
      expect(config.code).toBe('ml');
      expect(config.name).toBe('Malayalam');
      expect(config.additionalRules.length).toBeGreaterThan(0);
      // The policy core: technical terms stay English, morphology attaches to
      // English roots, headings stay English (issue #70 native-speaker review)
      expect(config.additionalRules.join('\n')).toContain(
        'do NOT translate or transliterate them into Malayalam script'
      );
      expect(config.additionalRules.join('\n')).toContain('economy-യിലെ');
      expect(config.additionalRules.join('\n')).toContain('Keep section headings');
    });

    it('should return empty rules for unconfigured languages', () => {
      const config = getLanguageConfig('ja');
      expect(config.code).toBe('ja');
      expect(config.additionalRules).toHaveLength(0);
    });

    it('should return empty rules for unknown languages', () => {
      const config = getLanguageConfig('unknown-lang');
      expect(config.code).toBe('unknown-lang');
      expect(config.additionalRules).toHaveLength(0);
    });
  });

  describe('formatAdditionalRules', () => {
    it('should format Chinese rules as string', () => {
      const rules = formatAdditionalRules('zh-cn');
      expect(rules).toContain('full-width Chinese punctuation');
    });

    it('should return empty string for unconfigured languages', () => {
      const rules = formatAdditionalRules('ja');
      expect(rules).toBe('');
    });

    it('should return empty string for unknown languages', () => {
      const rules = formatAdditionalRules('unknown-lang');
      expect(rules).toBe('');
    });
  });

  describe('getSupportedLanguages', () => {
    it('should return array of supported language codes', () => {
      const languages = getSupportedLanguages();
      expect(Array.isArray(languages)).toBe(true);
      expect(languages).toContain('zh-cn');
    });

    it('should not be empty', () => {
      const languages = getSupportedLanguages();
      expect(languages.length).toBeGreaterThan(0);
    });
  });

  describe('isLanguageSupported', () => {
    it('should return true for configured languages', () => {
      expect(isLanguageSupported('zh-cn')).toBe(true);
      expect(isLanguageSupported('ZH-CN')).toBe(true);
    });

    it('should return false for unconfigured languages', () => {
      expect(isLanguageSupported('ja')).toBe(false);
      expect(isLanguageSupported('es')).toBe(false);
      expect(isLanguageSupported('unknown')).toBe(false);
    });
  });

  describe('validateLanguageCode', () => {
    it('should not throw for supported languages', () => {
      expect(() => validateLanguageCode('zh-cn')).not.toThrow();
      expect(() => validateLanguageCode('ZH-CN')).not.toThrow();
    });

    it('should throw for unsupported languages', () => {
      expect(() => validateLanguageCode('ja')).toThrow(/Unsupported target language/);
      expect(() => validateLanguageCode('unknown')).toThrow(/Unsupported target language/);
    });

    it('should include supported languages in error message', () => {
      expect(() => validateLanguageCode('ja')).toThrow(/zh-cn/);
    });

    it('should suggest updating LANGUAGE_CONFIGS in error', () => {
      expect(() => validateLanguageCode('es')).toThrow(/LANGUAGE_CONFIGS/);
    });
  });

  describe('languageLabel', () => {
    it('should format known language as Name (code)', () => {
      expect(languageLabel('en')).toBe('English (en)');
      expect(languageLabel('zh-cn')).toBe('Chinese (Simplified) (zh-cn)');
      expect(languageLabel('fa')).toBe('Persian (Farsi) (fa)');
    });

    it('should handle case insensitive codes', () => {
      expect(languageLabel('EN')).toBe('English (en)');
      expect(languageLabel('ZH-CN')).toBe('Chinese (Simplified) (zh-cn)');
    });

    it('should fall back to code for unknown languages', () => {
      expect(languageLabel('ja')).toBe('ja (ja)');
      expect(languageLabel('es')).toBe('es (es)');
    });
  });

  describe('Malayalam glossary (glossary/ml.json)', () => {
    const glossaryPath = path.join(__dirname, '..', '..', 'glossary', 'ml.json');
    const glossary = JSON.parse(fs.readFileSync(glossaryPath, 'utf-8'));

    it('every term has en and ml string values', () => {
      expect(glossary.terms.length).toBeGreaterThan(0);
      for (const term of glossary.terms) {
        expect(typeof term.en).toBe('string');
        expect(typeof term.ml).toBe('string');
      }
    });

    it('has no duplicate en keys', () => {
      const keys = glossary.terms.map((t: { en: string }) => t.en);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('is keep-English-dominant: technical terms pin ml == en, only everyday words translate', () => {
      const kept = glossary.terms.filter((t: { en: string; ml: string }) => t.en === t.ml);
      const translated = glossary.terms.filter((t: { en: string; ml: string }) => t.en !== t.ml);
      expect(kept.length).toBeGreaterThan(translated.length);
      // Translated entries are the reviewer-approved everyday words — function
      // words (we, two, each, ...) are deliberately absent because they inflect
      // with Malayalam grammar and must not be pinned term-level
      expect(translated.map((t: { en: string }) => t.en).sort()).toEqual([
        'country',
        'increase',
        'over time',
        'relationship',
        'year',
      ]);
      for (const t of translated) {
        expect(t.context).toContain('everyday');
      }
    });
  });
});

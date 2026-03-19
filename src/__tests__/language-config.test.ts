/**
 * Tests for language-specific configuration
 */

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
      expect(config.additionalRules).toHaveLength(1);
      expect(config.additionalRules[0]).toContain('full-width Chinese punctuation');
    });

    it('should handle case insensitive language codes', () => {
      const config1 = getLanguageConfig('zh-cn');
      const config2 = getLanguageConfig('ZH-CN');
      const config3 = getLanguageConfig('Zh-Cn');
      
      expect(config1).toEqual(config2);
      expect(config2).toEqual(config3);
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
});

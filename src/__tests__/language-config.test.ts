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

    it('should return French config with typography and register rules', () => {
      const config = getLanguageConfig('fr');
      expect(config.code).toBe('fr');
      expect(config.name).toBe('French');
      expect(config.additionalRules).toHaveLength(6);
      // Two typography rules plus the native-editor register/anti-calque
      // rulings encoded from lecture-python-programming.fr PRs #24/#25
      expect(config.additionalRules.join('\n')).toContain('non-breaking space');
      expect(config.additionalRules.join('\n')).toContain('On pose $T = 200$');
      expect(config.additionalRules.join('\n')).toContain('Nous verrons plus loin');
      expect(config.additionalRules.join('\n')).toContain(
        'never rename identifiers that executable code defines or uses'
      );
    });

    it('should return Japanese config for ja', () => {
      const config = getLanguageConfig('ja');
      expect(config.code).toBe('ja');
      expect(config.name).toBe('Japanese');
      expect(config.additionalRules).toHaveLength(7);
      expect(config.additionalRules[0]).toContain('full-width Japanese punctuation');
      // The terminology policy from the PR #69 native-speaker review
      expect(config.additionalRules.join('\n')).toContain('if in doubt, keep English');
      expect(config.additionalRules.join('\n')).toContain(
        'Keep ALL personal names in Latin script'
      );
      expect(config.additionalRules.join('\n')).toContain('never with ＝');
    });

    it('should return empty rules for unconfigured languages', () => {
      const config = getLanguageConfig('ko');
      expect(config.code).toBe('ko');
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
      const rules = formatAdditionalRules('ko');
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
      expect(isLanguageSupported('ja')).toBe(true);
    });

    it('should return false for unconfigured languages', () => {
      expect(isLanguageSupported('ko')).toBe(false);
      expect(isLanguageSupported('es')).toBe(false);
      expect(isLanguageSupported('unknown')).toBe(false);
    });
  });

  describe('validateLanguageCode', () => {
    it('should not throw for supported languages', () => {
      expect(() => validateLanguageCode('zh-cn')).not.toThrow();
      expect(() => validateLanguageCode('ZH-CN')).not.toThrow();
    });

    it('should not throw for ja', () => {
      expect(() => validateLanguageCode('ja')).not.toThrow();
    });

    it('should throw for unsupported languages', () => {
      expect(() => validateLanguageCode('ko')).toThrow(/Unsupported target language/);
      expect(() => validateLanguageCode('unknown')).toThrow(/Unsupported target language/);
    });

    it('should include supported languages in error message', () => {
      expect(() => validateLanguageCode('ko')).toThrow(/zh-cn/);
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
      expect(languageLabel('ja')).toBe('Japanese (ja)');
    });

    it('should handle case insensitive codes', () => {
      expect(languageLabel('EN')).toBe('English (en)');
      expect(languageLabel('ZH-CN')).toBe('Chinese (Simplified) (zh-cn)');
    });

    it('should fall back to code for unknown languages', () => {
      expect(languageLabel('ko')).toBe('ko (ko)');
      expect(languageLabel('es')).toBe('es (es)');
    });
  });

  describe('Japanese glossary (glossary/ja.json)', () => {
    const glossaryPath = path.join(__dirname, '..', '..', 'glossary', 'ja.json');
    type JaGlossaryTerm = { en: string; ja: string; context?: string };
    const glossary: { terms: JaGlossaryTerm[] } = JSON.parse(
      fs.readFileSync(glossaryPath, 'utf-8')
    );

    it('every term has en and ja string values', () => {
      expect(glossary.terms.length).toBeGreaterThan(0);
      for (const term of glossary.terms) {
        expect(typeof term.en).toBe('string');
        expect(typeof term.ja).toBe('string');
      }
    });

    it('has no duplicate en keys', () => {
      const keys = glossary.terms.map((t) => t.en);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('mirrors the en term set of zh-cn.json', () => {
      const zh: { terms: { en: string }[] } = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', '..', 'glossary', 'zh-cn.json'), 'utf-8')
      );
      expect(glossary.terms.map((t) => t.en)).toEqual(zh.terms.map((t) => t.en));
    });

    // PR #69 review, unanimous (2026-07-29/30): every personal name stays in
    // Latin script — no katakana transliteration, no guessed kanji.
    it('keeps every personal name in Latin script (ja == en)', () => {
      const names = glossary.terms.filter((t) => /name$/.test(t.context ?? ''));
      expect(names.length).toBeGreaterThan(30);
      for (const t of names) {
        expect(t.ja).toBe(t.en);
      }
    });

    it('joins compound names with ・, never ＝', () => {
      for (const t of glossary.terms) {
        expect(t.ja).not.toContain('＝');
      }
    });
  });

  describe('Malayalam glossary (glossary/ml.json)', () => {
    const glossaryPath = path.join(__dirname, '..', '..', 'glossary', 'ml.json');
    type MlGlossaryTerm = { en: string; ml: string; context?: string };
    const glossary: { terms: MlGlossaryTerm[] } = JSON.parse(
      fs.readFileSync(glossaryPath, 'utf-8')
    );

    it('every term has en and ml string values', () => {
      expect(glossary.terms.length).toBeGreaterThan(0);
      for (const term of glossary.terms) {
        expect(typeof term.en).toBe('string');
        expect(typeof term.ml).toBe('string');
      }
    });

    it('has no duplicate en keys', () => {
      const keys = glossary.terms.map((t) => t.en);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('is keep-English-dominant: technical terms pin ml == en, only everyday words translate', () => {
      const kept = glossary.terms.filter((t) => t.en === t.ml);
      const translated = glossary.terms.filter((t) => t.en !== t.ml);
      expect(kept.length).toBeGreaterThan(translated.length);
      // Translated entries are the reviewer-approved everyday words — function
      // words (we, two, each, ...) are deliberately absent because they inflect
      // with Malayalam grammar and must not be pinned term-level
      expect(translated.map((t) => t.en).sort()).toEqual([
        'contrived',
        'country',
        'facilitate',
        'increase',
        'limited',
        'over time',
        'relationship',
        'straightforward',
        'year',
      ]);
      for (const t of translated) {
        expect(t.context).toContain('everyday');
      }
    });

    // Round 2 (lecture-python-programming.ml#7, 118 suggestion blocks): the
    // ordinary words the editor moved back to English are pinned ml == en so
    // the model stops reaching for the dictionary equivalent (rule 2 alone did
    // not hold them), and the #273 line/lines variance regression is pinned.
    it('pins the round-2 keep-English words and line/lines', () => {
      const byEn = new Map(glossary.terms.map((t) => [t.en, t]));
      // 'already', 'name', 'example(s)' and 'work' are deliberately absent —
      // held for the editor's answers on ml#12.
      for (const en of ['useful', 'line', 'lines', 'automatically', 'improve']) {
        const term = byEn.get(en);
        expect(term).toBeDefined();
        expect(term!.ml).toBe(en);
      }
      expect(byEn.get('useful')!.context).toContain('ഉപയോഗപ്രദമായ');
    });
  });

  describe('Malayalam round-2 rules (lecture-python-programming.ml#7)', () => {
    const rules = getLanguageConfig('ml').additionalRules.join('\n');

    it('carries the deterministic classes: terminal punctuation and sentence-initial capitalisation', () => {
      expect(rules).toContain(
        'Terminal punctuation is required on every Malayalam prose paragraph'
      );
      expect(rules).toContain('never begin a sentence with a lowercase Latin word');
    });

    it('carries the hortative teacher voice and the fixed renderings', () => {
      expect(rules).toContain('നമുക്ക് … -ആം');
      expect(rules).toContain('never as the plain future നമ്മൾ … -ും');
      expect(rules).toContain('തന്നിരിക്കുന്ന N');
      expect(rules).toContain('NEVER ഒരു നൽകിയ N');
      expect(rules).toContain('NEVER കണക്കിലെടുക്കുക');
      expect(rules).toContain('കുറച്ചുകൂടി, not കുറച്ചുകൂടെ');
    });

    it('extends the scope ruling to exercise statements (D-2026-09-01) and reinforces pointer sentences', () => {
      expect(rules).toContain('D-2026-09-01-ml-exercise-statements-stay-english');
      expect(rules).toContain('a mixed sentence keeps its mathematical clause in English');
      expect(rules).toContain(
        "Here\\'s a function for the first random device.".replace("\\'", "'")
      );
    });

    it('holds the items still waiting on the editor (ml#12): "For example" is not yet a discourse rule', () => {
      // Q1 on ml#12 — encode once answered; the other three connectives are in.
      expect(rules).toContain('"In particular, …"');
      expect(rules).not.toContain('"For example, …" stay');
    });
  });
});

// ============================================================================
// Docs drift guard (#167 — F126)
// ============================================================================

describe('the documented supported-language list matches the code', () => {
  // Three user docs used to promise that any language code works while the
  // Action throws on anything outside LANGUAGE_CONFIGS. The docs now state
  // the real contract, and this guard fails when the sets drift — update the
  // `supported-languages:` marker in docs/user/language-config.md (and the
  // prose around it) when adding a language.
  it('language-config.md marker names exactly the configured languages', () => {
    const doc = fs.readFileSync(
      path.join(__dirname, '..', '..', 'docs', 'user', 'language-config.md'),
      'utf8'
    );
    const marker = doc.match(/<!-- supported-languages: ([^>]+) -->/);
    expect(marker).not.toBeNull();
    const documented = marker![1]
      .split(',')
      .map((s) => s.trim())
      .sort();
    expect(documented).toEqual([...getSupportedLanguages()].sort());
  });

  // The marker is a hidden HTML comment, so it can be correct while the
  // human-readable table above it is stale — which is exactly what happened
  // when ml shipped in v0.24.0: the marker listed it, the table did not, and
  // the guard passed. Readers see the table, so the table is what must agree.
  it('language-config.md supported-languages TABLE names every configured language', () => {
    const doc = fs.readFileSync(
      path.join(__dirname, '..', '..', 'docs', 'user', 'language-config.md'),
      'utf8'
    );
    const section = doc.slice(doc.indexOf('## Supported languages'));
    const table = section.slice(0, section.indexOf('\n## '));
    const rows = [...table.matchAll(/^\|\s*`([a-z-]+)`\s*\|/gm)].map((m) => m[1]);

    // `en` is the source language and has no row; every other configured
    // language must appear.
    const expected = [...getSupportedLanguages()].filter((c) => c !== 'en').sort();
    const missing = expected.filter((c) => !rows.includes(c));
    expect(missing).toEqual([]);
  });
});

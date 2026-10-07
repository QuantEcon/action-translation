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
        'explicit',
        'facilitate',
        'increase',
        'limited',
        'multiple',
        'over time',
        'provide',
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

  // Round 3 (lecture-python-programming.ml#13, 44 suggestion blocks): few new
  // terms. The residue was style; style examples were built, tested on a
  // held-out lecture with a blind pairwise judge, and set aside — see below.
  describe('Malayalam round-3 glossary (v0.6.0, answers in v0.7.0): terms, no style examples', () => {
    const glossaryPath = path.join(__dirname, '..', '..', 'glossary', 'ml.json');
    const glossary: {
      terms: { en: string; ml: string }[];
      style_examples?: { en: string; ml: string; source?: string }[];
    } = JSON.parse(fs.readFileSync(glossaryPath, 'utf-8'));
    const byEn = new Map(glossary.terms.map((t) => [t.en, t]));

    it('moves multiple / explicit to Malayalam and keeps remove / label as light verbs', () => {
      expect(byEn.get('multiple')!.ml).toBe('ഒന്നിലധികം');
      expect(byEn.get('explicit')!.ml).toBe('വ്യക്തമായ');
      expect(byEn.get('remove')!.ml).toBe('remove');
      expect(byEn.get('label')!.ml).toBe('label');
    });

    // v0.7.0: the editor answered the held words on ml#22 (2026-09-19).
    it('encodes the ml#22 answers: prefer stays English, provide moves to Malayalam', () => {
      expect(byEn.get('prefer')!.ml).toBe('prefer');
      // He calls both forms of `provide` acceptable and leans നൽകുന്നു; the
      // round-2 pin (provide ചെയ്യുന്ന) is superseded, not banned.
      expect(byEn.get('provide')!.ml).toBe('നൽകുക');
    });

    it('leaves draw and available unpinned — either form is the editor’s', () => {
      // `draw`: he calls വരയ്ക്കാം natural and chose draw ചെയ്യുക elsewhere in
      // the same lecture, so a flip is preference. `available`: a singleton.
      for (const en of ['draw', 'available']) {
        expect(byEn.has(en)).toBe(false);
      }
    });

    it('ships no style examples — evaluated and set aside (arm 2026-09-18)', () => {
      // The mechanism is live (translator-prompts.test.ts); the ml set is not.
      // On a held-out lecture a blind pairwise judge found small, large,
      // contrastive and rules-replacing example sets all indistinguishable
      // from the rules alone, so no set is carried. Reinstate only with a
      // measured case — and re-add the banned-rendering / open-question guard
      // that protected the set when it existed.
      expect(glossary.style_examples).toBeUndefined();
    });
  });

  describe('Malayalam round-3 rules (lecture-python-programming.ml#13)', () => {
    const rules = getLanguageConfig('ml').additionalRules;
    const joined = rules.join('\n');

    it('round 3 added four rules (23 → 27; 28 since the ml#22 answers): commas, verb form, idiom, further-reading scope', () => {
      // 28 since the ml#22 answers added the plural rule (block below)
      expect(rules).toHaveLength(28);
      expect(joined).toContain('Mark clause boundaries with commas');
      expect(joined).toContain('Choose the verb form by what the English means');
      expect(joined).toContain(
        'Render English idiom, metaphor and coined jargon by its plain meaning'
      );
      expect(joined).toContain('D-2026-09-18-ml-further-reading-lists-stay-english');
    });

    it('extends the existing rules rather than restating them', () => {
      expect(joined).toContain('കരുതാം');
      expect(joined).toContain('ഒന്നിലധികം');
      expect(joined).toContain('dictionary പോലെയുള്ള');
      expect(joined).toContain('remove ചെയ്യാൻ');
      expect(joined).toContain('മറ്റൊരു');
    });

    it('no rule ends on a dangling colon (#301)', () => {
      for (const rule of rules) expect(rule.trimEnd().endsWith(':')).toBe(false);
    });
  });

  // The editor's answers to the round-3 questions (2026-09-19). Two of them
  // overturned the guess v0.29.0 had shipped, so these pin the corrected text.
  describe('Malayalam round-3 answers (lecture-python-programming.ml#22)', () => {
    const rules = getLanguageConfig('ml').additionalRules;
    const joined = rules.join('\n');

    it('puts the comma between -ഉം items always, single words included', () => {
      expect(joined).toContain('simple-ഉം, convenient-ഉം');
      expect(joined).not.toContain('when each side is a phrase rather than a single word');
      // the suffix rule's own example must not contradict the comma rule
      expect(joined).not.toContain('a green border-ഉം a blinking cursor-ഉം');
    });

    it('states the plural of a retained noun as its own rule (27 → 28)', () => {
      const plural = rules.find((r) => r.startsWith('The plural of an English noun'));
      expect(plural).toBeDefined();
      expect(plural).toContain('function calls-ൽ');
      expect(plural).toContain('not object-ുകൾ');
    });

    it('does not force draw into the light-verb pattern', () => {
      expect(joined).not.toContain('draw ചെയ്യ');
    });
  });

  // v0.29.1's §4a gate (2026-09-21): scenario 17 on the .ml lane failed twice
  // — the model wrapped the fixture's plain "## Exercises" list in
  // {exercise-start}, and structural parity refused the file. Measured on that
  // fixture: 5/12 refusals at v0.29.0, 11/12 at v0.29.1, 0/24 with this scope
  // sentence. The verbatim rule must speak only of directives the source has.
  describe('Malayalam exercise rule is scoped to existing directives', () => {
    const rules = getLanguageConfig('ml').additionalRules;
    const exerciseRule = rules.find((r) => r.startsWith('Every exercise-related directive'));

    it('forbids adding a directive the source does not have', () => {
      expect(exerciseRule).toBeDefined();
      expect(exerciseRule).toContain('directives the source ALREADY contains');
      expect(exerciseRule).toContain('never add an {exercise}, {exercise-start}, {solution}');
      expect(exerciseRule).toContain('with no directive wrapped around it');
    });

    it('stays one rule — the scope is part of the verbatim rule, not a 29th', () => {
      expect(rules).toHaveLength(28);
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

    it('reinforces pointer sentences with the round-2 worked examples', () => {
      expect(rules).toContain(
        "Here\\'s a function for the first random device.".replace("\\'", "'")
      );
    });

    // The editor's ml#12 answers (2026-09-01), encoded 2026-09-03.
    it('keeps every exercise-family block byte-identical to the source (D-2026-09-03), replacing the 09-01 scope rule', () => {
      expect(rules).toContain('D-2026-09-03-ml-all-exercise-content-stays-english');
      expect(rules).toContain('{exercise-start} … {exercise-end}, {hint}, {solution}');
      expect(rules).toContain('including pure programming instructions');
      expect(rules).not.toContain('D-2026-09-01-ml-exercise-statements-stay-english');
      expect(rules).not.toContain('MUST NOT be left in English');
      expect(rules).not.toContain('a mixed sentence keeps its mathematical clause in English');
      // The 08-17 math-heavy Hint/Solution rule is subsumed while the ruling stands.
      expect(rules).not.toContain('native-editor ruling, 2026-08-17');
      expect(rules).toContain('subsumes the earlier math-heavy Hint/Solution ruling');
    });

    it('answers ml#12: "For example" joins the discourse rule, the refer calque is named, headings keep possessives', () => {
      expect(rules).toContain('"For example, …", "In fact, …"');
      expect(rules).toContain('not ഉദാഹരണത്തിന്');
      expect(rules).toContain('never സൂചിപ്പിക്കുന്നു');
      expect(rules).toContain('never "Matplotlib-യുടെ Split Personality"');
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

/**
 * Language-specific configuration for translation prompts
 *
 * Each target language can have specific instructions that are appended to the translation prompts.
 * This allows for language-specific typography, punctuation, and stylistic rules.
 */

export interface LanguageConfig {
  /** Language code (e.g., 'zh-cn', 'ja', 'es') */
  code: string;
  /** Language name in English */
  name: string;
  /** Additional rules to append to translation prompts */
  additionalRules: string[];
}

/**
 * Language-specific configurations
 *
 * To add a new language:
 * 1. Add a new entry with the language code as the key
 * 2. Include any language-specific typography or punctuation rules
 * 3. The language will automatically be available for use
 */
export const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  en: {
    code: 'en',
    name: 'English',
    additionalRules: [],
  },
  'zh-cn': {
    code: 'zh-cn',
    name: 'Chinese (Simplified)',
    additionalRules: [
      'Use proper full-width Chinese punctuation marks (，：。！？) not ASCII punctuation (,.!?) in prose text',
      'Always insert a space between Chinese characters and inline MyST directives ({doc}, {ref}, {any}, {term}, etc.) or Markdown links ([text](url)), e.g., "请参阅 {doc}`介绍 <intro>`" not "请参阅{doc}`介绍 <intro>`"',
    ],
  },
  fa: {
    code: 'fa',
    name: 'Persian (Farsi)',
    additionalRules: [
      'Use proper Persian punctuation marks (، ؛ ؟) without any RTL directionality markup',
      'Keep technical terms and code examples in English/Latin script',
      'Use formal/academic Persian style appropriate for educational content',
    ],
  },
  fr: {
    code: 'fr',
    name: 'French',
    additionalRules: [
      'Use French guillemets « » (with a non-breaking space inside each, e.g. « citation ») for quotations rather than straight or curly double quotes',
      'Insert a non-breaking space before the high punctuation marks ; : ! ? as required by French typography (e.g. "Bonjour !" not "Bonjour!")',
    ],
  },
  ml: {
    code: 'ml',
    name: 'Malayalam',
    // Policy: keep-English-dominant (per native-speaker review, issue #70).
    // Kerala STEM/finance learners use English technical terms natively;
    // translating or transliterating them reads archaic. Keep technical terms
    // in English; translate only the connective Malayalam prose.
    additionalRules: [
      'Keep ALL technical and domain terms in their original English/Latin form — do NOT translate or transliterate them into Malayalam script. This covers economics (inflation, GDP, recession, interest rate, demand, supply), finance (equity, bond, yield, portfolio, asset class), statistics (regression, correlation, standard deviation, normal distribution), mathematics, and programming (function, loop, library, variable, dataset, numpy, pandas), plus acronyms (GDP, RBI) and named institutions (Federal Reserve)',
      'Translate only the surrounding Malayalam prose and common NON-technical everyday words that have a natural, in-use Malayalam equivalent (e.g. country → രാജ്യം, year → വർഷം, increase → ഉയർത്തുക, before → മുമ്പ്)',
      'Attach Malayalam case-suffixes, postpositions, and sandhi directly to the English term, hyphenated where natural (e.g. economy-യിലെ, bond-ന്റെ, asset classes-ൽ, consumers-ന്റെ); for English verbs, use the English verb plus a Malayalam auxiliary (e.g. process ചെയ്ത്, return ചെയ്യുന്നു, execute ചെയ്യുന്നു)',
      'Keep section headings in their original English form — do not translate them (e.g. "## Overview" stays "## Overview")',
      'Keep proper names (economists, researchers, institutions) in English/Latin script — do not transliterate them',
      'Handle every term consistently across the whole document — a term kept in English must remain English on every occurrence, and a word translated to Malayalam must reuse the same Malayalam root each time (normal grammatical inflection is fine)',
      'Use a natural classroom/educational register, not a formal government-gazette style; where a Malayalam word genuinely aids comprehension for a borderline non-technical concept, it may be given with the English in parentheses on first use (e.g. ബന്ധം (relationship)) — use sparingly',
    ],
  },
  // Future language configurations can be added here:
  // 'ja': {
  //   code: 'ja',
  //   name: 'Japanese',
  //   additionalRules: [
  //     'Use proper Japanese punctuation marks (、。「」)',
  //   ],
  // },
  // 'es': {
  //   code: 'es',
  //   name: 'Spanish',
  //   additionalRules: [
  //     'Use inverted punctuation marks (¿?) for questions and (¡!) for exclamations',
  //   ],
  // },
};

/**
 * Get language-specific configuration
 * Returns empty rules array if language not configured
 */
export function getLanguageConfig(languageCode: string): LanguageConfig {
  const normalized = languageCode.toLowerCase();
  return (
    LANGUAGE_CONFIGS[normalized] || {
      code: languageCode,
      name: languageCode,
      additionalRules: [],
    }
  );
}

/**
 * Format a language as "Name (code)" for LLM prompts.
 * e.g. languageLabel('en') → 'English (en)', languageLabel('fa') → 'Persian (Farsi) (fa)'
 */
export function languageLabel(languageCode: string): string {
  const config = getLanguageConfig(languageCode);
  return `${config.name} (${config.code})`;
}

/**
 * Format additional rules for inclusion in prompts
 * Returns empty string if no additional rules
 */
export function formatAdditionalRules(languageCode: string): string {
  const config = getLanguageConfig(languageCode);
  if (config.additionalRules.length === 0) {
    return '';
  }
  return config.additionalRules.map((rule) => rule).join('\n');
}

/**
 * Get list of supported language codes
 */
export function getSupportedLanguages(): string[] {
  return Object.keys(LANGUAGE_CONFIGS);
}

/**
 * Check if a language code is supported (has configuration)
 */
export function isLanguageSupported(languageCode: string): boolean {
  const normalized = languageCode.toLowerCase();
  return normalized in LANGUAGE_CONFIGS;
}

/**
 * Validate language code and throw descriptive error if not supported
 */
export function validateLanguageCode(languageCode: string): void {
  if (!isLanguageSupported(languageCode)) {
    const supported = getSupportedLanguages().join(', ');
    throw new Error(
      `Unsupported target language: '${languageCode}'. ` +
        `Supported languages: ${supported}. ` +
        `To add a new language, update LANGUAGE_CONFIGS in src/language-config.ts`
    );
  }
}

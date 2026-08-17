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
    // Register and anti-calque rules derived from the first native-editor review
    // of machine output: Emile (@Honaminto), lecture-python-programming.fr PRs
    // #24/#25 (2026-08). Every rule generalises a correction he made at least
    // twice across those two lectures.
    additionalRules: [
      'Use French guillemets « » (with a non-breaking space inside each, e.g. « citation ») for quotations rather than straight or curly double quotes',
      'Insert a non-breaking space before the high punctuation marks ; : ! ? as required by French typography (e.g. "Bonjour !" not "Bonjour!")',
      'Use the impersonal academic register of French course materials rather than calquing the English direct address: render exercise set-ups as "On pose $T = 200$" (not "Posez..."), task statements as "L\'objectif de cet exercice est de..." (not "Votre tâche consiste à..."), and drop chatty asides addressed to the reader (e.g. "prenez votre temps et vous comprendrez")',
      'Do not calque English discourse formulas word-for-word — render the function, not the words: "We can and will examine..." becomes "Nous verrons plus loin..." (never "Nous pouvons et allons..."), "worth knowing" becomes "utile à connaître" (not "vaut la peine d\'être connue"), and a heading "The Task: ..." becomes "Objectif : ..." (not "La tâche : ...")',
      'In display math and exercise hints, translate ordinary English words used as descriptive symbols (e.g. $area = \\pi * radius^2$ becomes $aire = \\pi * rayon^2$); never rename identifiers that executable code defines or uses. Where code comments are being localized (the code-comments localization rule), apply the same descriptive-symbol translation there (e.g. "division par radius**2" becomes "division par rayon**2")',
      'Prefer natural French sentence structure over mirroring the English: split long English sentences into two French ones and reword constructions that read as translationese — fidelity is owed to meaning and technical content, not to English syntax',
    ],
  },
  ml: {
    code: 'ml',
    name: 'Malayalam',
    // Policy: keep-English-dominant (per native-speaker review, issue #70).
    // Kerala STEM/finance learners use English technical terms natively;
    // translating or transliterating them reads archaic. Keep technical terms
    // in English; translate only the connective Malayalam prose.
    // Register confirmed and rules refined by the reviewer's packet reply,
    // 2026-08-03 — per-rule provenance in experiments/ml-benchmark/DISPOSITIONS.md.
    // Extended 2026-08 from the first inline review round: 100 flags on
    // lecture-python-programming.ml#1 (python_by_example), analysed with
    // per-flag dispositions in QuantEcon/project-translation
    // reports/2026-08-17-ml-python-by-example-review-disposition.md.
    // The math-heavy Hint/Solution ruling is recorded in
    // .dev/decisions/D-2026-08-17-ml-math-heavy-sections-stay-english.md.
    additionalRules: [
      'Keep ALL technical and domain terms in their original English/Latin form — do NOT translate or transliterate them into Malayalam script. This covers economics (inflation, GDP, recession, interest rate, demand, supply), finance (equity, bond, yield, portfolio, asset class), statistics (regression, correlation, standard deviation, normal distribution), mathematics, and programming (function, loop, library, variable, dataset, numpy, pandas), plus acronyms (GDP, RBI) and named institutions (Federal Reserve)',
      'Translate into Malayalam only the grammatical connective tissue — pronouns, demonstratives, conjunctions, postpositions, question words, everyday time/place words with a natural in-use equivalent (e.g. country → രാജ്യം, year → വർഷം, before → മുമ്പ്), and common native verbs of perceiving and saying (e.g. കാണാം, പറയുന്നു). Ordinary English content words — everyday adjectives, adverbs and nouns such as simple, best, important, hopefully, example, idea, popular — usually stay in Latin script in this register; do NOT force a Malayalam rendering merely because a dictionary equivalent exists',
      'Attach Malayalam case-suffixes, postpositions, and sandhi directly to the English term, hyphenated where natural, using the forms a native writer prefers: -യിലെ after roots ending in a vowel sound (e.g. directory-യിലെ, numpy-യിലെ, economy-യിലെ; likewise bond-ന്റെ, asset classes-ൽ); the genitive allomorph -യുടെ, never -ന്റെ, after roots ending in a vowel sound (NumPy-യുടെ, $\\pi$-യുടെ); the fuller ablative നിന്നും rather than clipped നിന്ന്; the dative variant -ഇനും where euphony prefers it (ഓരോ element-ഇനും, എല്ലാ lines-ഇനും); accusative -നെ on the object of a light-verb construction (100 standard normals-നെ generate ചെയ്ത്); keep the additive -ഉം wherever the source says "plus", "also" or "too" (e.g. a green border-ഉം a blinking cursor-ഉം); prefer -ുമായി over plain -മായി',
      'For verbs naming software, interface, or instructional actions, keep the English verb in Latin script and attach a Malayalam light verb (e.g. click ചെയ്യുക, press ചെയ്യുക, select ചെയ്യുക, enable ആകും, close ആകും, check ചെയ്യാം; likewise process ചെയ്ത്, return ചെയ്യുന്നു, execute ചെയ്യുന്നു; cover ചെയ്യും for what a lecture covers, break down ചെയ്ത് for decomposing a program, refer ചെയ്യുന്നു for what a name refers to, and keep the adverb repeatedly in English in loop descriptions). NEVER replace these with a native Malayalam verb (e.g. not അമർത്തുക for press, not അടിക്കുക for hit, not അടയ്ക്കുന്നു for close, not പ്രവർത്തനക്ഷമമാകും for enable, not കൈകാര്യം ചെയ്യുക for cover — it reads managerial, not instructional); when the source uses a synonym for pressing a key (hit, strike, tap), normalise it to press ചെയ്യുക',
      'The light-verb pattern is for technical and instructional actions only — an everyday verb with a natural Malayalam equivalent takes the Malayalam verb, not an English light-verb construction: a line that "ends with a colon" അവസാനിക്കണം (not end ആകുന്നു), a result "placed into the string" ചേർക്കപ്പെടും (not place ചെയ്യപ്പെടും), lines that "end up on the same figure" ഒരേ figure-ൽ വരും; and "is required/needed" is ആവശ്യമായിവരുന്നു, never ആവശ്യപ്പെടുന്നു (which means "demands")',
      'A short sentence whose content is mostly code, commands, URLs, file paths, mathematical notation or parameter settings should stay entirely in English rather than being fragmented to translate one or two connective words (e.g. "For example, try `np.random.randn(3)`.", "Here\'s one solution:", "Use $T=200$, $\\alpha = 0.9$ and $\\{\\epsilon_t\\}$ as before.", "The sequence of shocks is assumed to be IID and standard normal."); parenthetical language comparisons also stay English ("(as in C, Java or Go)"); in longer sentences translate the prose and leave the embedded code, URLs and math untouched',
      'Render English discourse formulas by function, never word-for-word: sentence-initial "In fact, …" and "On the other hand, …" stay in English at the head of the rendered sentence (not വാസ്തവത്തിൽ, not മറുവശത്ത്); "in other words" → അതായത് (not മറ്റൊരു വിധത്തിൽ പറഞ്ഞാൽ); sentence-initial "Now, …" → ഇനി (not ഇപ്പോൾ); "turn to (the exercises)" → (exercises-ലേക്ക്) കടക്കുക; "almost always" → മിക്ക സമയത്തും',
      'When the English points at content that immediately follows ("Here is/are X …", "figures like this one", "a version that illustrates …"), render the pointer with താഴെ കാണാം / താഴെ കൊടുത്തിരിക്കുന്ന ("can be seen below" / "given below"), never with a literal ഇവിടെ ("here") or ഇതുപോലുള്ള ("like this") — e.g. "Here\'s a version that illustrates for loops" → "… ഒരു version താഴെ കാണാം:"',
      'Render English "the N with X" as an identifying modifier using the relative participle ഉള്ള — X ഉള്ള N, e.g. "the cell with the flashing cursor" → flashing cursor ഉള്ള cell — never with an accompaniment form (-ഉം, -നൊപ്പം), which misreads identification ("which N") as accompaniment ("N together with X")',
      'With the comparative suffix -നേക്കാൾ/-നെക്കാൾ the comparison is already fully expressed — never add less/more/കുറച്ചു alongside it; for "less X than Y" prefer Y-ന്റെ അത്ര X അല്ല ("not as X as Y")',
      'Write short sentences in a classroom teacher\'s register: split English compound sentences at comma splices and em-dashes into two Malayalam sentences rather than mirroring the English punctuation; order clauses the way a teacher speaks — topic or purpose first, then the action; when introducing a definition, describe the concept before naming it; and use the fuller adjectival ordinals ആദ്യത്തെ / അവസാനത്തെ for "first"/"last", never clipped ആദ്യ / അവസാന',
      'In exercise Hint and Solution sections whose prose is predominantly mathematical reasoning (probability statements, convergence arguments, derivations) rather than Python instruction, keep the entire section in English — a reader who can follow the mathematics learnt it in English, so a Malayalam rendering serves neither reader (native-editor ruling, 2026-08-17); Hint/Solution prose that is programming guidance translates normally',
      'Never translate comments inside code blocks or code cells — every code comment stays exactly as written in the English source',
      'Keep section headings in their original English form — do not translate them (e.g. "## Overview" stays "## Overview")',
      'Keep proper names (economists, researchers, institutions) in English/Latin script — do not transliterate them',
      'Handle every term consistently across the whole document — a term kept in English must remain English on every occurrence, and a word translated to Malayalam must reuse the same Malayalam root each time (normal grammatical inflection is fine)',
      'Use a natural classroom/educational register, not a formal government-gazette style; where a Malayalam word genuinely aids comprehension for a borderline non-technical concept, it may be given with the English in parentheses on first use (e.g. ബന്ധം (relationship)) — use sparingly',
      'English-retained terms carrying Malayalam case-suffixes (relationships-ൽ, concepts-ന്റെ, NumPy-യുടെ) and English section headings are the REQUIRED form of compliant Malayalam prose under this policy — never treat them as partial translation, untranslated content, or a terminology inconsistency',
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

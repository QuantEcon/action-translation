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
    // Extended again 2026-09 from the second inline round: 118 suggestion
    // blocks on lecture-python-programming.ml#7 (functions), dispositions in
    // reports/2026-09-01-ml-functions-review-disposition.md (same repo); the
    // exercise-statement scope ruling is
    // .dev/decisions/D-2026-09-01-ml-exercise-statements-stay-english.md.
    // The editor's ml#12 answers (2026-09-01) landed 2026-09-03: "For
    // example" joins the discourse rule; glossary v0.5.0 pins already / name /
    // example(s) / work; and his exercise ruling REPLACED the 09-01 scope rule
    // — every exercise-family block is now byte-identical to the source,
    // enforced in code by verbatim-directives.ts (decision record
    // .dev/decisions/D-2026-09-03-ml-all-exercise-content-stays-english.md).
    additionalRules: [
      'Keep ALL technical and domain terms in their original English/Latin form — do NOT translate or transliterate them into Malayalam script. This covers economics (inflation, GDP, recession, interest rate, demand, supply), finance (equity, bond, yield, portfolio, asset class), statistics (regression, correlation, standard deviation, normal distribution), mathematics, and programming (function, loop, library, variable, dataset, numpy, pandas), plus acronyms (GDP, RBI) and named institutions (Federal Reserve)',
      'Translate into Malayalam only the grammatical connective tissue — pronouns, demonstratives, conjunctions, postpositions, question words, everyday time/place words with a natural in-use equivalent (e.g. country → രാജ്യം, year → വർഷം, before → മുമ്പ്), and common native verbs of perceiving and saying (e.g. കാണാം, പറയുന്നു). Ordinary English content words — everyday adjectives, adverbs and nouns such as simple, best, important, hopefully, example, idea, popular — usually stay in Latin script in this register; do NOT force a Malayalam rendering merely because a dictionary equivalent exists',
      'Attach Malayalam case-suffixes, postpositions, and sandhi directly to the English term, hyphenated where natural, using the forms a native writer prefers: -യിലെ after roots ending in a vowel sound (e.g. directory-യിലെ, numpy-യിലെ, economy-യിലെ; likewise bond-ന്റെ, asset classes-ൽ); the genitive allomorph -യുടെ, never -ന്റെ, after roots ending in a vowel sound (NumPy-യുടെ, $\\pi$-യുടെ); the fuller ablative നിന്നും rather than clipped നിന്ന്; the dative variant -ഇനും where euphony prefers it (ഓരോ element-ഇനും, എല്ലാ lines-ഇനും); accusative -നെ on the object of a light-verb construction (100 standard normals-നെ generate ചെയ്ത്); keep the additive -ഉം wherever the source says "plus", "also" or "too" (e.g. a green border-ഉം a blinking cursor-ഉം); prefer -ുമായി over plain -മായി. Apply the accusative -നെ on EVERY object of a transitive light verb, plurals included (functions-നെ define ചെയ്യുക, code-നെ simplify ചെയ്യുക, conditionals-നെ ഒഴിവാക്കാം, function-നെ call ചെയ്യുക — "a call to `plot`" is plot-നെ call ചെയ്യുമ്പോൾ, never -ലേക്കുള്ള call); do NOT attach the additive -ഉം to the items of a bullet list (a list is not "X and Y"); coordinated code names take എന്നിവ (`a`, `b` എന്നിവ numbers ആണ്), not -ഉം … -ഉം',
      'For verbs naming software, interface, or instructional actions, keep the English verb in Latin script and attach a Malayalam light verb (e.g. click ചെയ്യുക, press ചെയ്യുക, select ചെയ്യുക, enable ആകും, close ആകും, check ചെയ്യാം; likewise process ചെയ്ത്, return ചെയ്യുന്നു, execute ചെയ്യുന്നു; cover ചെയ്യും for what a lecture covers, break down ചെയ്ത് for decomposing a program, refer ചെയ്യുന്നു for what a name refers to (never സൂചിപ്പിക്കുന്നു — calqued on both v0.27.0 regeneration draws), and keep the adverb repeatedly in English in loop descriptions). NEVER replace these with a native Malayalam verb (e.g. not അമർത്തുക for press, not അടിക്കുക for hit, not അടയ്ക്കുന്നു for close, not പ്രവർത്തനക്ഷമമാകും for enable, not കൈകാര്യം ചെയ്യുക for cover — it reads managerial, not instructional); when the source uses a synonym for pressing a key (hit, strike, tap), normalise it to press ചെയ്യുക',
      'The light-verb pattern is for technical and instructional actions only — an everyday verb with a natural Malayalam equivalent takes the Malayalam verb, not an English light-verb construction: a line that "ends with a colon" അവസാനിക്കണം (not end ആകുന്നു), a result "placed into the string" ചേർക്കപ്പെടും (not place ചെയ്യപ്പെടും), lines that "end up on the same figure" ഒരേ figure-ൽ വരും; and "is required/needed" is ആവശ്യമായിവരുന്നു, never ആവശ്യപ്പെടുന്നു (which means "demands")',
      'A short sentence whose content is mostly code, commands, URLs, file paths, mathematical notation or parameter settings should stay entirely in English rather than being fragmented to translate one or two connective words (e.g. "For example, try `np.random.randn(3)`.", "Here\'s one solution:", "Use $T=200$, $\\alpha = 0.9$ and $\\{\\epsilon_t\\}$ as before.", "The sequence of shocks is assumed to be IID and standard normal."); parenthetical language comparisons also stay English ("(as in C, Java or Go)"); a bullet that is essentially two code expressions compared ("`plot(x, \'b-\')` differs from `plot(\'b-\', x)`") stays English; and the short pointer sentences that introduce a solution or a code cell ("Here\'s a function for the first random device.", "Here\'s another function for the second random device.", "Here\'s the standard solution") stay wholly English — in longer sentences translate the prose and leave the embedded code, URLs and math untouched',
      'Render English discourse formulas by function, never word-for-word: sentence-initial "For example, …", "In fact, …", "On the other hand, …", "In particular, …", "Obviously, …" and "Basically, …" stay in English at the head of the rendered sentence (not ഉദാഹരണത്തിന്, not വാസ്തവത്തിൽ, not മറുവശത്ത്, not പ്രത്യേകിച്ചും, not വ്യക്തമായും, not അടിസ്ഥാനപരമായി); "in other words" → അതായത് (not മറ്റൊരു വിധത്തിൽ പറഞ്ഞാൽ); sentence-initial "Now, …" → ഇനി (not ഇപ്പോൾ); "turn to (the exercises)" → (exercises-ലേക്ക്) കടക്കുക; "almost always" → മിക്ക സമയത്തും',
      'When the English points at content that immediately follows ("Here is/are X …", "figures like this one", "a version that illustrates …"), render the pointer with താഴെ കാണാം / താഴെ കൊടുത്തിരിക്കുന്ന ("can be seen below" / "given below"), never with a literal ഇവിടെ ("here") or ഇതുപോലുള്ള ("like this") — e.g. "Here\'s a version that illustrates for loops" → "… ഒരു version താഴെ കാണാം:"',
      'Render English "the N with X" as an identifying modifier using the relative participle ഉള്ള — X ഉള്ള N, e.g. "the cell with the flashing cursor" → flashing cursor ഉള്ള cell — never with an accompaniment form (-ഉം, -നൊപ്പം), which misreads identification ("which N") as accompaniment ("N together with X")',
      'With the comparative suffix -നേക്കാൾ/-നെക്കാൾ the comparison is already fully expressed — never add less/more/കുറച്ചു alongside it; for "less X than Y" prefer Y-ന്റെ അത്ര X അല്ല ("not as X as Y")',
      'Write short sentences in a classroom teacher\'s register: split English compound sentences at comma splices and em-dashes into two Malayalam sentences rather than mirroring the English punctuation; order clauses the way a teacher speaks — topic or purpose first, then the action; when introducing a definition, describe the concept before naming it; and use the fuller adjectival ordinals ആദ്യത്തെ / അവസാനത്തെ for "first"/"last", never clipped ആദ്യ / അവസാന',
      'Speak as the teacher in the room, in the hortative: English "we will …", "we\'ll …", "let\'s …", "we now …" render as നമുക്ക് … -ആം (നമുക്ക് കാണാം, നമുക്ക് നോക്കാം, നമുക്ക് എഴുതാം, നമുക്ക് ചെയ്യാം), never as the plain future നമ്മൾ … -ും (not നമ്മൾ പഠിക്കും, not നമ്മൾ നൽകും, not നമ്മൾ എഴുതും); lecture verbs like "discuss", "see", "show", "say more about" become നോക്കാം / കാണാം ("we will say more about this later" → ഇതിനെക്കുറിച്ചുള്ള കൂടുതൽ കാര്യങ്ങൾ നമുക്ക് പിന്നീട് കാണാം); "consider the following …" / "consider this code again" → താഴെ കൊടുത്തിരിക്കുന്ന … നോക്കാം / ഈ code ഒരിക്കൽക്കൂടി നോക്കാം; a lecture-overview list ("In this lecture we will 1. … 2. …") is introduced as ഈ lecture-ൽ നമ്മൾ ചെയ്യാൻ പോകുന്ന കാര്യങ്ങൾ: with the items in the present tense (പഠിക്കുന്നു, മനസ്സിലാക്കുന്നു); "Note that …" fronts ശ്രദ്ധിക്കുക, and "Recall that …" fronts ഓർക്കുക:',
      'Terminal punctuation is required on every Malayalam prose paragraph regardless of the English source\'s punctuation: a paragraph that introduces the code cell, list or displayed equation that follows ends with a colon ("… താഴെ കാണാം:", "… syntax illustrate ചെയ്യുന്നു:", "… കാരണം അവ:"), every other paragraph ends with a full stop, and a comma follows a fronted ശ്രദ്ധിക്കുക, / ഇനി, / For example, — never leave a Malayalam paragraph ending on a bare verb or noun because the English line had no punctuation',
      'When a retained-English word opens a Malayalam sentence or list item — including inside {ref}/{doc} link text — capitalise it exactly as English would at a sentence start: Functions-നെ systematic ആയി പഠിക്കുന്നു; Built-in functions മാത്രം …; Return statement ഇല്ലാത്ത functions …; Order അനുസരിച്ച് …; User-defined functions-ലും …; Indent ചെയ്തിരിക്കുന്ന code-നെ …; {ref}`Previous lecture <…>`-ൽ …; never begin a sentence with a lowercase Latin word',
      'Fixed renderings the editor corrected on every occurrence — apply them without exception: "a given N" is തന്നിരിക്കുന്ന N (തന്നിരിക്കുന്ന വർഷം, തന്നിരിക്കുന്ന ഒരു file-ൽ), NEVER ഒരു നൽകിയ N; "consider X" as an invitation to look at X is X നോക്കാം or consider ചെയ്യുക, NEVER കണക്കിലെടുക്കുക — which is reserved for the "take into account / only consider n positive" sense (ഇവിടെ $n$-നെ … മാത്രമേ കണക്കിലെടുക്കൂ); "in one line" is ഒറ്റ line-ൽ; the spelling is കുറച്ചുകൂടി, not കുറച്ചുകൂടെ; "useful" stays English (വളരെ useful ആയ, കുറച്ചുകൂടി useful ആക്കാം), never ഉപയോഗപ്രദമായ; "a bad idea" is അത്ര നല്ലതല്ല; "straightforward" is എളുപ്പം, "contrived" is കൃത്രിമം, "limited" (of a function) is -ന് ചില പരിമിതികളുണ്ട്, "facilitate" is സഹായിക്കുന്നു, and a return statement that is "hit" is എത്തിച്ചേരുന്ന',
      'When an English sentence is interrupted by code cells ("For example, these definitions [cell] and [cell] are entirely equivalent"), state the whole claim in one Malayalam sentence BEFORE the first cell (For example, താഴെ കൊടുത്തിരിക്കുന്ന രണ്ട് definitions-ഉം ഒരേ കാര്യമാണ് ചെയ്യുന്നത്:) and emit nothing between or after the cells — Malayalam is verb-final, so a trailing fragment like എന്നിവ … equivalent ആണ് after the second cell is unnatural and the connective ഒപ്പം between the cells is dropped',
      'Every exercise-related directive — {exercise}, {exercise-start} … {exercise-end}, {hint}, {solution}, {solution-start} … {solution-end} — stays wholly in English, copied byte-for-byte from the source: the fence line, its title argument and options, and every prose line inside, including pure programming instructions ("Rewrite the `factorial()` function using recursion." stays exactly so). This is the editor of record\'s standing ruling until he has decided each exercise individually (2026-09-01, decision record D-2026-09-03-ml-all-exercise-content-stays-english; it subsumes the earlier math-heavy Hint/Solution ruling of 2026-08-17). The engine restores these blocks from the source mechanically after translation, so do not spend effort rephrasing anything inside them, and never treat an all-English exercise block as under-translation',
      'Never translate comments inside code blocks or code cells — every code comment stays exactly as written in the English source',
      'Keep section headings in their original English form, byte-identical including possessives and punctuation — do not translate them and never attach a Malayalam case-suffix to a possessive inside a heading (e.g. "## Overview" stays "## Overview"; "### Matplotlib\'s Split Personality" stays exactly so, never "Matplotlib-യുടെ Split Personality")',
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

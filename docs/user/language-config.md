---
title: Language Configuration
---

# Language Configuration

Each target language can have specific translation rules that are automatically included in Claude's prompts. These rules handle language-specific typography, punctuation conventions, and stylistic guidelines.

## Supported languages

| Code | Language | Status |
|------|----------|--------|
| `zh-cn` | Chinese (Simplified) | ✅ Configured |
| `fa` | Farsi (Persian) | ✅ Configured |
| `fr` | French | ✅ Configured (draft glossary) |
| `ml` | Malayalam | ✅ Configured (keep-English policy; glossary in review) |
| `ja` | Japanese | Planned |
| `es` | Spanish | Planned |

## Current rules

### Chinese (Simplified) — `zh-cn`

- Use proper full-width Chinese punctuation marks (，：。！？) not ASCII punctuation (,.!?) in prose text

### Farsi — `fa`

- Use proper Persian punctuation marks (، ؛ ؟) without any RTL directionality markup
- Keep technical terms and code examples in English/Latin script
- Use formal/academic Persian style appropriate for educational content

### French — `fr`

- Use French guillemets « » (with a non-breaking space inside each) for quotations rather than straight or curly double quotes
- Insert a non-breaking space before the high punctuation marks ; : ! ? as required by French typography
- Use the impersonal academic register of French course materials rather than calquing the English direct address ("On pose $T = 200$", "L'objectif de cet exercice est de…")
- Do not calque English discourse formulas word-for-word — render the function, not the words ("We can and will examine…" → "Nous verrons plus loin…")
- In display math and exercise hints, translate ordinary English words used as descriptive symbols ($aire = \pi * rayon^2$); never rename identifiers that executable code defines or uses. Where code comments are being localized (the `code-comments` localization rule), the same descriptive-symbol translation applies there
- Prefer natural French sentence structure over mirroring the English — fidelity is owed to meaning and technical content, not to English syntax

The register and anti-calque rules encode the first native-editor review of machine output (Emile, lecture-python-programming.fr PRs #24/#25, August 2026); each generalises a correction made at least twice across those lectures.

## How rules are applied

Language rules are appended to every translation prompt as numbered rules after the standard instructions. For example, when translating to `zh-cn`, Claude's prompt includes:

```
CRITICAL RULES:
1. Preserve all MyST Markdown formatting...
2. DO NOT translate code, math, URLs...
...
9. Use proper full-width Chinese punctuation marks (，：。！？) not ASCII punctuation
```

Rules apply to all translation modes: UPDATE (incremental sync), NEW (full file), and RESYNC (drift recovery).

## Supported languages

<!-- supported-languages: en, zh-cn, fa, fr, ml -->

The **GitHub Action** validates `target-language` against its configured language list — currently `en`, `zh-cn`, `fa`, `fr`, and `ml` — and fails immediately, before any work happens, on anything else. Adding a language means adding a `LANGUAGE_CONFIGS` entry in `src/language-config.ts` (a glossary alone does not enable a language); the drift test in `language-config.test.ts` keeps this page's list in sync with the code.

The **CLI** (`translate init`, `forward`, `backward`) never validates the language code: any code works there, with no language-specific rules applied for unconfigured codes.

### Malayalam — `ml`

Malayalam is **keep-English-dominant**, unlike every other configured language. Technical and domain terms stay in their original English/Latin form rather than being translated or transliterated; only the connective prose is Malayalam, with case-suffixes and sandhi attached to the English roots (`economy-യിലെ`, `bond-ന്റെ`, `supply-യും`). Section headings stay in English.

The reason is register, not convenience: Kerala has no Malayalam-medium STEM university or active classroom term bank, and learners meet these terms in English from first exposure — so translating them reads archaic rather than accessible. This is native-speaker guidance recorded in issue #70 and implemented in #71, and it inverts the full-translation pattern `zh-cn` and `fa` follow. The glossary's role flips accordingly: rather than a technical dictionary, it is a small consistency list (77 terms) — mostly keep-English pins (`ml == en`) for the technical and instructional terms machine output most often over-translates or transliterates, plus a handful of reviewer-approved everyday-word translations.

The rule set has been extended three times from native-reviewer evidence, in the same pattern as French: the reviewer's packet reply of 2026-08-03 (register and morphology confirmations, glossary v0.2.0), and his first inline PR review round — 100 comments on lecture-python-programming.ml#1, August 2026 — which added the below-deixis pattern (`താഴെ കാണാം` for "here is X" pointing at content below), discourse-formula and calque rules, ordinal and case-allomorph morphology, a classroom sentence-splitting register rule, glossary v0.3.0, and the ruling that exercise Hint/Solution sections which are predominantly mathematical reasoning stay wholly in English (decision record `D-2026-08-17-ml-math-heavy-sections-stay-english`); and his second inline round — 118 suggestion blocks on lecture-python-programming.ml#7, September 2026 — which added terminal punctuation (a colon before the cell or list a paragraph introduces), sentence-initial capitalisation of retained-English words, the hortative teacher's voice (നമുക്ക് … -ആം, never നമ്മൾ … -ും), fixed renderings ("a given" → തന്നിരിക്കുന്ന, "consider" → നോക്കാം), the sandwich-sentence rule for prose interrupted by code cells, glossary v0.4.0, and the extension of the scope ruling to exercise statements with mathematical content (decision record `D-2026-09-01-ml-exercise-statements-stay-english`).

## Adding a new language

To add rules for a new language, edit `src/language-config.ts`:

```typescript
export const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  'zh-cn': { /* ... */ },
  'fa': { /* ... */ },

  // Add new language:
  'ja': {
    code: 'ja',
    name: 'Japanese',
    additionalRules: [
      'Use proper Japanese punctuation marks (、。「」)',
    ],
  },
};
```

Each language configuration has:
- `code` — Language code (matches the `target-language` input)
- `name` — Human-readable language name
- `additionalRules` — Array of rules appended to translation prompts

After adding a language configuration, you should also:
1. Create a glossary file at `glossary/{code}.json` (see [Glossary](glossary.md))
2. Add test cases for the new language
3. Rebuild the action (`npm run build`)

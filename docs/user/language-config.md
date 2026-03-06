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
| `ja` | Japanese | Planned |
| `es` | Spanish | Planned |

## Current rules

### Chinese (Simplified) — `zh-cn`

- Use proper full-width Chinese punctuation marks (，：。！？) not ASCII punctuation (,.!?) in prose text

### Farsi — `fa`

- Use proper Persian punctuation marks (، ؛ ؟) without any RTL directionality markup
- Keep technical terms and code examples in English/Latin script
- Use formal/academic Persian style appropriate for educational content

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

## Using unsupported languages

Any language code can be used as a `target-language` — it doesn't need to be pre-configured. If no configuration exists, the action uses the language code as-is with no additional rules. You can still provide a glossary for terminology consistency.

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
3. Rebuild the action (`npm run build && npm run package`)

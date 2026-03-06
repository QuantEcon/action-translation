---
title: Translation Glossary
---

# Translation Glossary

The glossary system ensures consistent translation of technical terminology across all documents. When Claude encounters a glossary term, it uses the specified translation rather than choosing its own.

## Built-in glossaries

| Language | File | Terms | Last updated |
|----------|------|-------|--------------|
| Chinese (Simplified) | `glossary/zh-cn.json` | 357 | October 2025 |
| Farsi | `glossary/fa.json` | 357 | December 2025 |

Both glossaries are bundled with the action and loaded automatically when the `target-language` matches. No configuration needed.

## How it works

The glossary is included in every translation prompt sent to Claude. For example, when translating to `zh-cn`, Claude sees:

```
GLOSSARY:
  - "utility function" → "效用函数"
  - "Bellman equation" → "贝尔曼方程"
  - "steady state" → "稳态"
  ...
```

This applies to all translation modes: sync (UPDATE, NEW), forward RESYNC, and whole-file translation.

## Glossary format

Each glossary is a JSON file with this structure:

```json
{
  "language": "zh-cn",
  "version": "1.0",
  "description": "Technical terms for quantitative economics",
  "terms": [
    {
      "en": "utility function",
      "zh-cn": "效用函数",
      "context": "economics"
    },
    {
      "en": "Bellman equation",
      "zh-cn": "贝尔曼方程",
      "context": "dynamic programming"
    }
  ]
}
```

Each term has:
- `en` — The English term (matched in source content)
- `{lang-code}` — The target language translation (e.g., `zh-cn`, `fa`)
- `context` — Optional category for disambiguation (e.g., `economics`, `statistics`, `programming`)

## Using a custom glossary

To use your own glossary instead of (or in addition to) the built-in one, specify the `glossary-path` input:

```yaml
- uses: QuantEcon/action-translation@v0.8
  with:
    mode: sync
    glossary-path: 'glossary/my-custom-glossary.json'
    # ... other inputs
```

For the CLI, glossaries are loaded automatically based on the language code. The CLI looks for `glossary/{language}.json` in the action-translation repository.

## Adding terms to a glossary

1. Edit the relevant glossary file (e.g., `glossary/zh-cn.json`)
2. Add new term objects to the `terms` array
3. Follow these quality guidelines:
   - Use established translations from authoritative sources
   - Include context when a term has multiple translations in different fields
   - Prefer commonly accepted academic translations
   - Keep terms concise — short phrases, not full sentences

**Example — adding a new term:**

```json
{
  "en": "Pareto efficiency",
  "zh-cn": "帕累托效率",
  "context": "welfare economics"
}
```

## Adding a new language

To add glossary support for a new language:

1. Create `glossary/{lang-code}.json` (e.g., `glossary/ja.json`)
2. Use the same JSON structure as existing glossaries
3. The target language field should match the language code (e.g., `"ja"` for Japanese)
4. The glossary is loaded automatically when `target-language` matches the file name

**Planned languages:** Japanese (`ja`), Spanish (`es`)

## Context categories

Terms use these context categories for disambiguation:

| Context | Description | Examples |
|---------|-------------|----------|
| `economics` | General economic terminology | utility function, marginal cost |
| `statistics` | Statistical and probabilistic terms | variance, likelihood, posterior |
| `dynamic programming` | DP-specific terminology | Bellman equation, value function |
| `programming` | Code and software terms | array, function, iterator |
| `finance` | Financial terminology | bond price, yield curve |
| `linear algebra` | Matrix and vector terms | eigenvalue, determinant |

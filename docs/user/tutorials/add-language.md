---
title: "Tutorial: Adding a New Language"
subtitle: Extend action-translation to support an additional target language
---

# Tutorial: Adding a New Language

This tutorial walks through adding support for a new target language — for example, adding Japanese (`ja`) to a project that already has Chinese (`zh-cn`). By the end, you'll have:

- A language configuration with language-specific translation rules
- A glossary for consistent technical terminology
- A new target repository with automated sync

**Time:** ~1 hour for configuration, plus translation time (~$0.12/lecture)

## Overview

Adding a new language involves four areas:

```
Step 1: Create a glossary                   (glossary/ja.json)
Step 2: Add language-specific rules         (language-config.ts)
Step 3: Set up the target repository        (translate setup + init)
Step 4: Configure multi-language workflows  (.github/workflows/)
```

Steps 1–2 are one-time project contributions (merged into action-translation). Steps 3–4 are per-project setup.

---

## Step 1: Create a glossary

The glossary ensures consistent translation of technical terms. Each glossary is a JSON file at `glossary/{code}.json`.

### Start from an existing glossary

Copy an existing glossary as a template:

```bash
cd /path/to/action-translation
cp glossary/zh-cn.json glossary/ja.json
```

### Edit the glossary

Update the file with Japanese translations. The format:

```json
{
  "version": "1.0",
  "description": "Translation glossary for QuantEcon lectures (English to Japanese)",
  "terms": [
    {
      "en": "utility function",
      "ja": "効用関数",
      "context": "economics"
    },
    {
      "en": "Bellman equation",
      "ja": "ベルマン方程式",
      "context": "dynamic programming"
    },
    {
      "en": "steady state",
      "ja": "定常状態",
      "context": "macroeconomics"
    }
  ]
}
```

Each term has:

| Field | Description |
|---|---|
| `en` | English source term |
| `{lang-code}` | Translation in the target language (must match the language code) |
| `context` | Domain hint for disambiguation (e.g., "economics", "statistics", "programming") |

### Quality guidelines

- **Use established translations** from authoritative academic sources
- **Include context** when a term has multiple translations in different fields
- **Prefer commonly accepted academic translations** over literal translations
- **Keep terms concise** — short phrases, not full sentences
- **Cover key domains**: economics, mathematics, statistics, programming, named theorists

The existing glossaries have 357 terms organized across:
- Economic terms (~160): equilibrium, GDP, fiscal policy, etc.
- Mathematical terms (~100): matrix, eigenvalue, convergence, etc.
- Statistical terms (~35): normal distribution, regression, variance, etc.
- Economist names (~45): Robert Solow, Milton Friedman, etc.

You don't need all 357 terms from day one. Start with the most important terms and expand over time.

:::{tip}
For economist names, use the standard transliteration in the target language's academic community. These vary significantly across languages.
:::

---

## Step 2: Add language-specific rules

Language rules control how Claude handles language-specific formatting in translations. They're defined in `src/language-config.ts`.

### What rules do

Rules are injected into every translation prompt. They tell Claude about punctuation conventions, typography, and style expectations specific to the target language. Without rules, Claude uses its general knowledge (which usually works but may be inconsistent).

### Current configurations

| Language | Key rules |
|---|---|
| `zh-cn` (Chinese) | Use full-width punctuation: `，` `：` `。` `！` `？` (not ASCII) |
| `fa` (Farsi) | Use Persian punctuation: `،` `؛` `؟`; keep technical terms in English; formal/academic style |

### Add a new language entry

Edit `src/language-config.ts` and add an entry to the `LANGUAGE_CONFIGS` object:

```typescript
ja: {
  code: 'ja',
  name: 'Japanese',
  additionalRules: [
    'Use Japanese punctuation: 、(読点) for commas, 。(句点) for periods.',
    'Use full-width parentheses（）and brackets【】for Japanese text.',
    'Keep mathematical notation and code in half-width ASCII characters.',
    'Use です/ます (polite) form for explanatory text, である form for formal definitions.',
    'Translate technical terms using standard Japanese academic conventions.',
  ],
},
```

### Localization rules (optional)

If the language uses a non-Latin script and needs special fonts for matplotlib figures (like Chinese does), you may need to add font configuration to `src/localization-rules.ts`. Currently:

- `zh-cn` has font configuration (Source Han Serif SC)
- `fa` silently skips font configuration (standard fonts work)

For Japanese, you would add a font entry if matplotlib's default fonts don't render Japanese characters correctly.

### Build and test

After editing the source:

```bash
npm run build       # Compile TypeScript
npm run package     # Bundle for distribution (updates dist-action/)
npm test            # Run all tests
```

### Contribute back

If this is a generally useful language, contribute the glossary and config back:

```bash
git checkout -b add-japanese-language
git add glossary/ja.json src/language-config.ts
git commit -m "Add Japanese language support with glossary"
# Open a PR to QuantEcon/action-translation
```

---

## Step 3: Set up the target repository

Now create the target repository and translate the content. This follows the same process as [Tutorial: Fresh Setup](fresh-setup.md), adapted for the new language.

### Scaffold the target repo

```bash
npx translate setup \
  --source QuantEcon/lecture-python-intro \
  --target-language ja
```

This creates `QuantEcon/lecture-python-intro.ja` on GitHub with the scaffolding files.

### Translate the content

```bash
npx translate init \
  -s ~/repos/lecture-python-intro \
  -t ./lecture-python-intro.ja \
  --target-language ja \
  --dry-run   # Preview first

npx translate init \
  -s ~/repos/lecture-python-intro \
  -t ./lecture-python-intro.ja \
  --target-language ja
```

:::{note}
If you haven't rebuilt the action with your new glossary/language config yet, you can point to your glossary explicitly:

```bash
npx translate init \
  -s ~/repos/lecture-python-intro \
  -t ./lecture-python-intro.ja \
  --target-language ja \
  --glossary /path/to/action-translation/glossary/ja.json
```
:::

### Push the translated content

```bash
cd lecture-python-intro.ja
git add .
git commit -m "Initial Japanese translation via translate init"
git push origin main
```

---

## Step 4: Configure multi-language workflows

If your source repo already syncs to one language, add the new language as a parallel job.

### Source repo — Multi-language sync workflow

Update `.github/workflows/sync-translations.yml` in the **source** repository:

```yaml
name: Sync Translations

on:
  pull_request:
    types: [closed]
    paths:
      - 'lectures/**/*.md'
      - '_toc.yml'

jobs:
  sync-to-chinese:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2
      - uses: QuantEcon/action-translation@v0.8
        with:
          mode: sync
          target-repo: 'QuantEcon/lecture-python-intro.zh-cn'
          target-language: 'zh-cn'
          docs-folder: 'lectures'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.TRANSLATION_PAT }}

  sync-to-japanese:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2
      - uses: QuantEcon/action-translation@v0.8
        with:
          mode: sync
          target-repo: 'QuantEcon/lecture-python-intro.ja'
          target-language: 'ja'
          docs-folder: 'lectures'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.TRANSLATION_PAT }}
```

The jobs run in **parallel** — each language is translated independently.

### Target repo — Review workflow

Create `.github/workflows/review-translations.yml` in the **new target** repository:

```yaml
name: Review Translations

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    if: contains(github.event.pull_request.labels.*.name, 'action-translation')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2
      - uses: QuantEcon/action-translation@v0.8
        with:
          mode: review
          source-repo: 'QuantEcon/lecture-python-intro'
          source-language: 'en'
          target-language: 'ja'
          docs-folder: 'lectures'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Secrets

Add these secrets to the relevant repos:

| Repo | Secret | Purpose |
|---|---|---|
| Source repo | `ANTHROPIC_API_KEY` | Claude translations |
| Source repo | `TRANSLATION_PAT` | Cross-repo PR creation (needs `repo` scope for all target repos) |
| New target repo | `ANTHROPIC_API_KEY` | Translation reviews |

The `TRANSLATION_PAT` in the source repo needs access to the new target repo. If you're using a fine-grained PAT, update its repository scope.

---

## Step 5: Verify the setup

### Check sync status

```bash
npx translate status \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.ja \
  -l ja
```

All files should show `✅ ALIGNED`.

### Test the pipeline

1. Make a small edit in the source repo
2. Open and merge a PR
3. Check both target repos — you should see translation PRs in both `.zh-cn` and `.ja` repos

---

## Working without a glossary or language config

Both the glossary and language config are **optional**. The system works with any language code — you just get fewer guardrails:

| Component | Without it | Impact |
|---|---|---|
| Glossary | Claude uses its own terminology choices | Less consistent technical terms |
| Language config | No language-specific prompt rules | Claude uses general knowledge (usually fine) |

You can add both later and run `forward` to bring existing translations into alignment with the new glossary.

---

## Maintaining multiple language targets

With multiple target languages, the CLI tools work the same way — just specify the language:

```bash
# Status for Japanese target
npx translate status -s ~/source -t ~/target-ja -l ja

# Backward analysis for Japanese
npx translate backward -s ~/source -t ~/target-ja -l ja

# Forward resync for Japanese
npx translate forward -s ~/source -t ~/target-ja -l ja
```

Each target repository maintains its own `.translate/state/` independently.

---

## Checklist

- [ ] Glossary created at `glossary/{code}.json`
- [ ] Language rules added to `src/language-config.ts` (optional)
- [ ] Font configuration added if needed (optional)
- [ ] Source rebuilt: `npm run build && npm run package`
- [ ] Target repo scaffolded: `translate setup`
- [ ] Content translated: `translate init`
- [ ] Translated content pushed to target repo
- [ ] Source workflow updated with new language job
- [ ] Target workflow created for review
- [ ] Secrets configured in both repos
- [ ] Pipeline tested with a small change

## Next steps

- [Tutorial: Fresh Setup](fresh-setup.md) — detailed walkthrough of the setup + init process
- [Tutorial: Resync a Drifted Target](resync-drifted.md) — recovering from drift
- [Glossary Guide](../glossary.md) — detailed glossary format and guidelines
- [Language Configuration](../language-config.md) — full language config reference

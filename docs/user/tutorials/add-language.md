---
title: "Tutorial: Adding a New Language"
subtitle: Extend action-translation to support an additional target language
---

# Tutorial: Adding a New Language

This tutorial walks through adding support for a new target language — for example, adding Japanese (`ja`) to a project that already has Chinese (`zh-cn`). Japanese is now configured (#69), so its real entry in `src/language-config.ts` and its glossary, `glossary/ja.json`, show where this walkthrough ends up. By the end, you'll have:

- A language configuration with language-specific translation rules
- A glossary for consistent technical terminology
- A new target repository with automated sync

**Time:** ~1 hour for configuration, plus translation time (~$0.16/lecture)

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
Settle how personal names are written with the language's reviewers before you draft the names section, because practice varies by language. The Japanese edition keeps every name in Latin script exactly as in the English (Robert Solow, not ロバート・ソロー), while the Chinese glossary uses established Chinese renderings.
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
    'Use full-width Japanese punctuation (、。「」) in prose, never ASCII punctuation (,.) and never ，．',
    'Always insert a half-width space between Japanese characters and Latin words or inline code: NumPy の配列, `x` の値',
    'Use the Japanese term only where a well-known, standard Japanese counterpart exists; otherwise keep the English term in Latin script — if in doubt, keep English',
    'Write prose in the plain である style throughout, never です・ます. Exercise instructions end in 〜なさい',
    // …and five more: see the real entry in src/language-config.ts
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
npm run build       # Compile TypeScript + bundle the action (updates dist-action/)
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

This translates every lecture at once. If each lecture will be reviewed before it is published, follow [One reviewed lecture at a time](#one-reviewed-lecture-at-a-time) below instead.

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

### One reviewed lecture at a time

If each lecture is reviewed before it is published, skip the two subsections above (the `--glossary` note still applies). Translate one lecture at a time, and add each to the edition in its own PR, together with its state file. [Tutorial: Fresh Setup](fresh-setup.md#one-reviewed-lecture-at-a-time) walks through one lecture in full; in short:

Once, before the first lecture's PR, make the edition's build prune its table of contents (see [Prune the table of contents at build time](fresh-setup.md#prune-the-table-of-contents-at-build-time)). Sync keeps the committed `_toc.yml` a mirror of the source's, so it lists lectures the edition does not have yet.

Then, for each lecture, update the source clone, start a branch from an up-to-date `main` in `lecture-python-intro.ja`, and preview the draft. `-f` takes the first `_toc.yml` entry that equals or contains the name; `--dry-run` prints that entry on the `Translating single file:` line, then stops before translating or writing anything:

```bash
npx translate init \
  -s ~/repos/lecture-python-intro \
  -t ./lecture-python-intro.ja \
  --target-language ja \
  -f cobweb.md \
  --dry-run
```

Run the same command without `--dry-run` to translate the lecture. Merging its PR after review puts the lecture in sync. Before opening the PR:

- **Check `git status`.** `-f` narrows the translation, not the rest of the run: every `init` run except a dry run rewrites `.translate/config.yml` and `TRANSLATION-REPORT.md`, and copies every non-Markdown file in the source docs folder into the target, `_toc.yml` and `_config.yml` included. The first lecture's PR keeps the copied build files (`_config.yml`, `_toc.yml`, images and other static files), since the new edition has none. A later PR keeps only the lecture, its state file and any new file the lecture uses: restore the edition's copies of everything else, and delete the new files the PR does not need, `TRANSLATION-REPORT.md` among them.
- **Confirm the state file exists**, here `.translate/state/cobweb.md.yml`. `init` does not fail when it cannot write it, and without it the lecture never syncs.

Before merging, check whether the English changed after the draft. Update the source clone, put the edition's clone on the PR's branch and pull it, since reviewers' suggestions land there as commits, and run:

```bash
npx translate status \
  -s ~/repos/lecture-python-intro \
  -t ./lecture-python-intro.ja \
  -l ja \
  -f cobweb.md
```

`OUTDATED` means it did. Sync does not update a lecture until its PR merges, so the PR must carry the change. To see it, take the `source-sha` from the lecture's state file and run `git log -p <source-sha>..HEAD -- lectures/cobweb.md` in the source clone. Carry each change, commit and push it, then run the same command with `--write-state --carried` added to record the new English commit in the lecture's state file. `--carried` confirms that the PR carries every English change since the commit the state file records. Without it, the run refuses, and lists the English commits since that one (or says that commit is not in your source clone), so you can check each against the PR. Keep `-l ja`, because that run rewrites `.translate/config.yml` from its flags, and `-l` defaults to `zh-cn`. Restore `.translate/config.yml` if the run changed it, commit and push the state file too, and run the check again: it should now read `ALIGNED`. The check reads your local clones, so it reads `ALIGNED` even when a commit has not reached the PR: push before you trust it.

Set `sync-scope: existing` on the Japanese sync job in Step 4.

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
    branches: [main]
    paths:
      - 'lectures/**/*.md'
      - '_toc.yml'
  issue_comment:
    types: [created]

jobs:
  sync-to-chinese:
    # Every job carries the same guard — the trust gate belongs on each one,
    # not on the first. The issue_comment path requires a comment on a PR (not
    # a bare issue), the command, and a trusted author.
    if: >
      (github.event_name == 'pull_request' && github.event.pull_request.merged == true) ||
      (github.event_name == 'issue_comment' &&
       github.event.issue.pull_request &&
       startsWith(github.event.comment.body, '\translate-resync') &&
       contains(fromJSON('["OWNER", "MEMBER", "COLLABORATOR"]'), github.event.comment.author_association))
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 2
      - uses: QuantEcon/action-translation@v0
        with:
          mode: sync
          target-repo: 'QuantEcon/lecture-python-intro.zh-cn'
          target-language: 'zh-cn'
          docs-folder: 'lectures'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.TRANSLATION_PAT }}

  sync-to-japanese:
    if: >
      (github.event_name == 'pull_request' && github.event.pull_request.merged == true) ||
      (github.event_name == 'issue_comment' &&
       github.event.issue.pull_request &&
       startsWith(github.event.comment.body, '\translate-resync') &&
       contains(fromJSON('["OWNER", "MEMBER", "COLLABORATOR"]'), github.event.comment.author_association))
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 2
      - uses: QuantEcon/action-translation@v0
        with:
          mode: sync
          target-repo: 'QuantEcon/lecture-python-intro.ja'
          target-language: 'ja'
          docs-folder: 'lectures'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.TRANSLATION_PAT }}
```

The jobs run in **parallel** — each language is translated independently.

Scope is set per job. If the Japanese edition takes lectures one at a time, add `sync-scope: existing` (a temporary input; see [Partial editions](../action-reference.md#partial-editions)) to the `sync-to-japanese` job only, and the Chinese job keeps the default, `all`:

```yaml
- uses: QuantEcon/action-translation@v0
  with:
    mode: sync
    target-repo: 'QuantEcon/lecture-python-intro.ja'
    target-language: 'ja'
    sync-scope: existing
    # ... other inputs as above
```

### Target repo — Review workflow

Create `.github/workflows/review-translations.yml` in the **new target** repository:

```yaml
name: Review Translations

on:
  pull_request:
    types: [opened, synchronize, labeled, reopened]

jobs:
  review:
    # `labeled` matters: the sync applies its labels after opening the PR.
    # The second clause ignores `labeled` events for every other label.
    if: >
      contains(github.event.pull_request.labels.*.name, 'action-translation') &&
      (github.event.action != 'labeled' || github.event.label.name == 'action-translation')
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    # One review per PR — supersede an in-flight review instead of running both
    concurrency:
      group: review-translations-${{ github.event.pull_request.number }}
      cancel-in-progress: true
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 2
      - uses: QuantEcon/action-translation@v0
        with:
          mode: review
          source-repo: 'QuantEcon/lecture-python-intro'
          source-language: 'en'
          docs-folder: 'lectures'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

There is no `target-language` input in review mode — the language is detected from the repository-name suffix (`lecture-python-intro.ja` → `ja`).

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

All files should show `✅ ALIGNED`. On an edition built one lecture at a time, the lectures it has not taken yet show `SOURCE_ONLY`.

### Health check

For a comprehensive verification that covers configuration, state, workflows, and heading-maps:

```bash
npx translate doctor \
  -t ~/repos/lecture-python-intro.ja
```

Any ❌ items should be addressed before moving to production.

### Test the pipeline

1. Make a small edit in the source repo
2. Open and merge a PR
3. Check both target repos — you should see translation PRs in both `.zh-cn` and `.ja` repos

If the Japanese edition is built one lecture at a time, edit a lecture it already has.

---

## Working without a glossary or language config

The glossary is **optional**; the language config is optional **only for the CLI**. The GitHub Action requires a `LANGUAGE_CONFIGS` entry for the target language and fails on any unconfigured code — the CLI (`init`, `forward`, `backward`) is what works with any language code, with fewer guardrails:

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
- [ ] `LANGUAGE_CONFIGS` entry added in `src/language-config.ts` (**required** — sync throws for language codes without one; a glossary alone does not enable a language)
- [ ] Font configuration added if needed (optional)
- [ ] Source rebuilt: `npm run build`
- [ ] Target repo scaffolded: `translate setup`
- [ ] Content translated: `translate init` for every lecture, or `translate init -f` for one reviewed lecture per PR
- [ ] Translated content pushed to target repo, or the first lecture's PR merged with its state file
- [ ] Source workflow updated with new language job (with `sync-scope: existing` for an edition built one lecture at a time)
- [ ] Target workflow created for review
- [ ] Secrets configured in both repos
- [ ] Pipeline tested with a small change

## Next steps

- [Tutorial: Fresh Setup](fresh-setup.md) — detailed walkthrough of the setup + init process
- [Tutorial: Resync a Drifted Target](resync-drifted.md) — recovering from drift
- [Glossary Guide](../glossary.md) — detailed glossary format and guidelines
- [Language Configuration](../language-config.md) — full language config reference

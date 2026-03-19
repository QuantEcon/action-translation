---
title: "Tutorial: Fresh Setup"
subtitle: Create a new translation project from scratch
---

# Tutorial: Fresh Setup

This tutorial walks through creating a new Chinese translation of an English lecture series **from scratch**. By the end, you'll have:

- A GitHub repository for the translated content
- All lectures translated with heading-maps and `.translate/` metadata
- Automated sync and review workflows configured

**Time:** ~30 minutes (plus translation time, which depends on project size)
**Cost:** ~$0.12/lecture for translation using `claude-sonnet-4-6`

## Prerequisites

Before starting, make sure you have:

| Requirement | Check |
|---|---|
| Source repo cloned locally | `ls ~/repos/lecture-python-intro/lectures/` |
| `gh` CLI installed & authenticated | `gh auth status` |
| Node.js 18+ | `node --version` |
| Anthropic API key | [console.anthropic.com](https://console.anthropic.com/) |
| action-translation installed | See [Installation](#step-0-install-action-translation) |

## Overview

The fresh setup process has 5 steps:

```
Step 0: Install action-translation
Step 1: Scaffold the target repo          (translate setup)
Step 2: Translate all lectures             (translate init)
Step 3: Push and verify                    (git push + translate status)
Step 4: Configure workflows and secrets    (manual GitHub setup)
Step 5: Test the pipeline                  (merge a test PR)
```

---

## Step 0: Install action-translation

```bash
git clone https://github.com/QuantEcon/action-translation.git
cd action-translation
npm install
npm run build:cli
```

Verify it works:

```bash
npx translate --version
```

Set your API key for translation steps:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

---

## Step 1: Scaffold the target repository

The `setup` command creates a new GitHub repository and plants the initial configuration files.

**Preview first (dry run):**

```bash
npx translate setup \
  --source QuantEcon/lecture-python-intro \
  --target-language zh-cn \
  --dry-run
```

This shows what would be created without touching GitHub.

**Create the repository:**

```bash
npx translate setup \
  --source QuantEcon/lecture-python-intro \
  --target-language zh-cn
```

This:
1. Creates `QuantEcon/lecture-python-intro.zh-cn` on GitHub
2. Clones it locally to `./lecture-python-intro.zh-cn/`
3. Writes `.translate/config.yml`, `.github/workflows/translation-sync.yml`, `.gitignore`, `README.md`
4. Commits and pushes

**What you get:**

```
lecture-python-intro.zh-cn/
├── .translate/
│   └── config.yml          # source-language: en, target-language: zh-cn
├── .github/
│   └── workflows/
│       └── translation-sync.yml
├── .gitignore
└── README.md
```

:::{tip}
If you prefer to create the repository manually (e.g., with a different name or organization), skip `setup` and create the files yourself. The critical file is `.translate/config.yml` — see [`.translate/` metadata](../cli-reference.md#translate-metadata-folder).
:::

---

## Step 2: Translate all lectures

The `init` command bulk-translates every lecture in the source project.

**Preview first (dry run):**

```bash
npx translate init \
  -s ~/repos/lecture-python-intro \
  -t ./lecture-python-intro.zh-cn \
  --target-language zh-cn \
  --dry-run
```

This lists all lectures that would be translated and all non-markdown files that would be copied, without making any API calls.

**Run the translation:**

```bash
npx translate init \
  -s ~/repos/lecture-python-intro \
  -t ./lecture-python-intro.zh-cn \
  --target-language zh-cn
```

The `init` command runs a 7-phase pipeline:

| Phase | What happens |
|---|---|
| 1. Load glossary | Loads `glossary/zh-cn.json` (357 technical terms) |
| 2. Parse `_toc.yml` | Discovers all lectures in the source project |
| 3. Setup target | Creates the docs folder structure |
| 4. Copy non-markdown files | Images, `_config.yml`, `_toc.yml`, CSS, data files |
| 5. Translate lectures | Sequential translation with progress bar |
| 6. Generate heading-maps | Position-based section matching, injected into frontmatter |
| 7. Write report | `TRANSLATION-REPORT.md` with stats and any failures |

A progress bar shows the current lecture being translated.

**If translation is interrupted**, resume from where you left off:

```bash
npx translate init \
  -s ~/repos/lecture-python-intro \
  -t ./lecture-python-intro.zh-cn \
  --target-language zh-cn \
  --resume-from cobweb.md
```

### Localization options

By default, `init` localizes code cells: translates Python comments, matplotlib labels, and injects CJK font configuration. Control this with `--localize`:

```bash
# Translate everything except font configuration
npx translate init ... --localize code-comments,figure-labels

# No code-cell localization at all
npx translate init ... --localize none
```

### Font setup (zh-cn only)

After translation, the CLI prints font download instructions. For Chinese, you need to place a font file at:

```
lectures/_fonts/SourceHanSerifSC-SemiBold.otf
```

Download from [Adobe Source Han Serif releases](https://github.com/adobe-fonts/source-han-serif/releases).

### What `init` produces

After translation, each lecture file contains:

```yaml
---
title: 蛛网模型
heading-map:
  overview: "概述"
  equilibrium: "均衡"
  exercises: "练习"
---
```

And the `.translate/state/` folder tracks sync metadata:

```
.translate/
├── config.yml
└── state/
    ├── intro.md.yml
    ├── cobweb.md.yml
    └── solow.md.yml
```

---

## Step 3: Push and verify

Commit the translated content and push:

```bash
cd lecture-python-intro.zh-cn

# Review what was created
ls lectures/

# Commit all translated content
git add .
git commit -m "Initial zh-cn translation via translate init"
git push origin main
```

Verify the sync state:

```bash
cd /path/to/action-translation

npx translate status \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn
```

All files should show `✅ ALIGNED`.

Run a health check to confirm everything is properly configured:

```bash
npx translate doctor \
  -t ~/repos/lecture-python-intro.zh-cn
```

All checks should pass (✅) before proceeding to workflow configuration.

---

## Step 4: Configure workflows and secrets

You need two workflows: one in the **source** repo (to trigger translations) and one in the **target** repo (to review them).

### 4a: Source repo — Sync workflow

Create `.github/workflows/sync-translations.yml` in the **source** (English) repository:

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
```

### 4b: Source repo — Secrets

Add these secrets to the **source** repo (**Settings → Secrets and variables → Actions**):

| Secret | Value | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key | Pays for Claude translations |
| `TRANSLATION_PAT` | GitHub PAT with `repo` scope | Creates PRs in the target repo |

The PAT needs `repo` scope because the action creates PRs in the target repository from the source repo's workflow.

:::{tip}
Create a fine-grained Personal Access Token scoped to just the target repository for better security.
:::

### 4c: Target repo — Review workflow (optional)

Create `.github/workflows/review-translations.yml` in the **target** repository:

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
          target-language: 'zh-cn'
          docs-folder: 'lectures'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

Add the `ANTHROPIC_API_KEY` secret to the **target** repo as well (for the review workflow).

### 4d: Target repo — Secret

| Secret | Value | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key | Pays for AI-powered translation reviews |

The target repo uses `${{ secrets.GITHUB_TOKEN }}` (automatic) for PR access — no PAT needed.

---

## Step 5: Test the pipeline

Make a small change in the source repo and merge a PR to verify the full pipeline:

1. **Create a branch** in the source repo and edit a lecture (e.g., fix a typo in `cobweb.md`)
2. **Open and merge a PR** — the sync workflow triggers
3. **Check the target repo** — a translation PR should appear within a few minutes
4. **Review the PR** — if the review workflow is configured, it posts a quality assessment
5. **Merge the translation PR** — the target repo is now in sync

---

## What happens going forward

Once configured, the automated pipeline handles ongoing changes:

```
You merge a PR in source repo
        │
        ▼
Sync workflow detects changed sections
        │
        ▼
Claude translates ONLY the changed sections
        │
        ▼
Translation PR created in target repo
        │
        ▼
Review workflow posts quality scores (optional)
        │
        ▼
Human reviewer approves & merges
```

For maintenance tasks (checking drift, finding backport suggestions, recovering from failed syncs), use the CLI tools:

```bash
# Quick status check
npx translate status -s ~/source -t ~/target

# Find improvements worth backporting to English
npx translate backward -s ~/source -t ~/target

# Resync drifted files
npx translate forward -s ~/source -t ~/target
```

---

## Troubleshooting

### `gh repo create` fails

- Check `gh auth status` — you may need to re-authenticate
- Check the repo name isn't already taken: `gh repo view QuantEcon/lecture-python-intro.zh-cn`

### `init` fails mid-translation

Use `--resume-from` to pick up where you left off. Check `TRANSLATION-REPORT.md` for details on which lectures failed and why.

### Sync workflow doesn't trigger

- Verify the workflow file is on the default branch (`main`)
- Check that the PR modified files matching the `paths` filter (`lectures/**/*.md`)
- Verify the PR was **merged** (not just closed)

### Translation PR has no changes

- The changed sections may have translated identically to the existing content
- Check the heading-map — if it's missing, sections may not be matching correctly

## Next steps

- [Tutorial: Connecting an Existing Target](connect-existing.md) — for repos that were translated before action-translation
- [Tutorial: Resync a Drifted Target](resync-drifted.md) — for repos that have fallen out of sync
- [Tutorial: Backward Analysis & Review](backward-review.md) — find improvements in translations worth backporting
- [Tutorial: Adding a New Language](add-language.md) — extend to additional target languages
- [CLI Reference](../cli-reference.md) — full command documentation
- [Heading Maps](../heading-maps.md) — how cross-language section matching works

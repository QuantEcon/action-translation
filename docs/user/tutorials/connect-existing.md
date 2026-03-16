---
title: "Tutorial: Connect an Existing Target"
subtitle: Add action-translation to a repo that was already translated
---

# Tutorial: Connect an Existing Target

This tutorial covers connecting **action-translation** to a project where the target repository already exists and contains translations — but was translated manually or with a different tool, before action-translation was in place.

By the end, you'll have:

- `.translate/` metadata bootstrapped from the current state
- Heading-maps generated for all translated files
- Automated sync and review workflows configured

**Time:** ~20 minutes (mostly manual verification)
**Cost:** Free if heading-maps already exist. ~$0.12/file if heading-maps need generation via `forward`.

## When to use this tutorial

Use this when you have:

- An English source repo (e.g., `QuantEcon/lecture-python-intro`)
- A Chinese target repo (e.g., `QuantEcon/lecture-python-intro.zh-cn`)
- The target **already has translated `.md` files** in a docs folder
- The repos are **not yet connected** via action-translation (no `.translate/` folder, no sync workflow)

If you're starting from scratch with no translations, see [Tutorial: Fresh Setup](fresh-setup.md) instead.

## Overview

```
Step 1: Assess the current state          (translate status)
Step 2: Bootstrap .translate/ metadata     (translate status --write-state)
Step 3: Fix missing heading-maps           (translate forward or manual)
Step 4: Configure workflows and secrets    (manual GitHub setup)
Step 5: Verify the connection              (translate status)
```

---

## Step 1: Assess the current state

Before making changes, understand what you're working with. The `status` command gives a free, instant diagnostic:

```bash
npx translate status \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn
```

Example output:

```
 Status Summary: lecture-python-intro ↔ lecture-python-intro.zh-cn
┌──────────────────────────────────┬──────────────────────┐
│ File                             │ Status               │
├──────────────────────────────────┼──────────────────────┤
│ intro.md                         │ ✅ ALIGNED            │
│ cobweb.md                        │ ⚠️  MISSING_HEADINGMAP │
│ solow.md                         │ ⚠️  MISSING_HEADINGMAP │
│ cagan_adaptive.md                │ ⚠️  OUTDATED           │
│ pv.md                            │ ⚠️  SOURCE_AHEAD       │
│ new_lecture.md                   │ 📄 SOURCE_ONLY        │
│ old_removed.md                   │ 📄 TARGET_ONLY        │
└──────────────────────────────────┴──────────────────────┘
```

**What to look for:**

| Status | What it means | Action needed |
|---|---|---|
| `ALIGNED` | Sections match and file is up to date | None |
| `MISSING_HEADINGMAP` | No heading-map in target frontmatter | Add heading-map (Step 3) |
| `OUTDATED` | Source has newer commits | Resync later (see [Resync Tutorial](resync-drifted.md)) |
| `SOURCE_AHEAD` | Source has more sections than target | Resync later |
| `SOURCE_ONLY` | File exists only in source | Translate new file later |
| `TARGET_ONLY` | File exists only in target | Investigate (orphaned?) |

At this stage, we're focused on getting the connection established. Don't worry about OUTDATED or SOURCE_AHEAD files yet — handle those after the workflows are in place.

---

## Step 2: Bootstrap `.translate/` metadata

The `.translate/` folder is how the system tracks which source commit each translation is synced to. For new connections, bootstrap it from the current state:

```bash
npx translate status \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn \
  -l zh-cn \
  --write-state
```

This creates:

```
.translate/
├── config.yml              # Project settings
└── state/
    ├── intro.md.yml        # Per-file metadata
    ├── cobweb.md.yml
    └── solow.md.yml
```

Each state file records:

```yaml
source-sha: abc1234f       # Current HEAD SHA for the source file
synced-at: "2026-03-16"    # Target file's last commit date
model: unknown             # Not recoverable from history
mode: RESYNC               # Marked as RESYNC (not a fresh translation)
section-count: 5           # Current source section count
```

**Commit the metadata:**

```bash
cd ~/repos/lecture-python-intro.zh-cn
git add .translate/
git commit -m "Bootstrap .translate/ metadata via action-translation"
git push origin main
```

:::{note}
The `model: unknown` and `mode: RESYNC` values are expected for bootstrapped state. They indicate that the translation was done outside action-translation. Future syncs will update these with accurate values.
:::

---

## Step 3: Fix missing heading-maps

Heading-maps are essential for reliable section matching. If Step 1 showed `MISSING_HEADINGMAP` for some files, you need to add them.

### Option A: Use `forward` to regenerate (recommended)

The `forward` command does a whole-file RESYNC, which generates heading-maps as part of the process. This also updates the translation to match the current source:

```bash
# Resync a single file (generates heading-map + updates translation)
npx translate forward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn \
  -f cobweb.md
```

Review the changes:

```bash
cd ~/repos/lecture-python-intro.zh-cn
git diff cobweb.md
```

The diff should show the heading-map added to the frontmatter. The translation content should be largely preserved (the RESYNC mode is designed to maintain existing style).

For multiple files:

```bash
# Resync all files that need attention
npx translate forward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn
```

:::{tip}
After running `forward`, review changes carefully with `git diff`. If a file was changed more than expected, use `git restore <file>` to undo and try a different approach.
:::

### Option B: Add heading-maps manually

If you don't want to re-translate files (e.g., they've been carefully reviewed by human translators), you can add heading-maps by hand.

For each translated file:

1. **Parse the source file** to find the English section headings and their IDs
2. **Find the corresponding translated headings** in the target file
3. **Add the heading-map** to the target file's YAML frontmatter

**Example:**

English source (`cobweb.md`):
```markdown
## Overview
## The Cobweb Model
### Equilibrium
## Exercises
```

Chinese target (`cobweb.md`):
```markdown
## 概述
## 蛛网模型
### 均衡
## 练习
```

Add this to the target's frontmatter:
```yaml
---
title: 蛛网模型
heading-map:
  overview: "概述"
  the-cobweb-model: "蛛网模型"
  equilibrium: "均衡"
  exercises: "练习"
---
```

The heading-map key is the English heading ID (lowercased, spaces → hyphens, punctuation removed). The value is the exact translated heading text as it appears in the document.

See [Heading Maps](../heading-maps.md) for complete format rules and ID generation details.

### Commit the heading-maps

```bash
cd ~/repos/lecture-python-intro.zh-cn
git add lectures/
git commit -m "Add heading-maps to translated files"
git push origin main
```

---

## Step 4: Configure workflows and secrets

Now set up the automated pipeline. You need a workflow in the **source** repo and optionally one in the **target** repo.

### 4a: Source repo — Sync workflow

Create `.github/workflows/sync-translations.yml` in the **source** repository:

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

| Secret | Value | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key | Pays for Claude translations |
| `TRANSLATION_PAT` | GitHub PAT with `repo` scope | Creates PRs in the target repo |

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

### 4d: Target repo — Secret

| Secret | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |

---

## Step 5: Verify the connection

Run `status` again to confirm everything is properly connected:

```bash
npx translate status \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn
```

**What "ready" looks like:**

- All files show `✅ ALIGNED` or `⚠️ OUTDATED` (OUTDATED is OK — it just means the source has newer changes)
- No `MISSING_HEADINGMAP` warnings
- `.translate/config.yml` exists in the target repo
- `.translate/state/*.yml` files exist for each translated file

If some files show `OUTDATED` or `SOURCE_AHEAD`, you can address those now or wait for the automated pipeline to handle them on the next PR merge. For immediate catch-up, see [Tutorial: Resync a Drifted Target](resync-drifted.md).

---

## Common issues when connecting

### Many files show MISSING_HEADINGMAP

This is expected for repos translated before action-translation. Use `forward` to bulk-regenerate:

```bash
npx translate forward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn
```

Review changes, commit, and push.

### Section counts don't match (SOURCE_AHEAD / TARGET_AHEAD)

This means the source and target have different numbers of `##` sections. Common causes:

- A section was added to the source but not translated yet → address with `forward`
- The target was manually restructured → may need manual alignment
- Subsections (`###`) inside a section don't affect the count — only `##` headings matter

### Files exist in only one repo

- `SOURCE_ONLY` — new file that hasn't been translated yet. Use `forward -f <file>` or wait for the sync action to handle it when the file is changed via a PR.
- `TARGET_ONLY` — a file that was deleted from source. Consider deleting it from target too.

## Next steps

- [Tutorial: Resync a Drifted Target](resync-drifted.md) — catch up on outdated files
- [Tutorial: Backward Analysis & Review](backward-review.md) — find improvements in translations worth backporting
- [Tutorial: Automated Maintenance](automated-maintenance.md) — set up scheduled checks
- [CLI Reference](../cli-reference.md) — full command documentation
- [Heading Maps](../heading-maps.md) — format rules and ID generation

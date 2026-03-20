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

**Time:** ~30 minutes (includes sync verification)
**Cost:** Free for status/heading-maps. ~$0.02/file for sync check. ~$0.12/file if resync needed.

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
Step 2: Check sync before bootstrapping    (translate status --check-sync)
Step 3: Catch up stale translations        (translate forward, if needed)
Step 4: Bootstrap .translate/ metadata     (translate status --write-state)
Step 5: Fix missing heading-maps           (translate headingmap)
Step 6: Configure workflows and secrets    (manual GitHub setup)
Step 7: Verify the connection              (translate doctor)
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
Sync Status: lecture-python-intro ↔ lecture-python-intro.zh-cn (zh-cn)

  File                              Status
  ────────────────────────────────  ────────────────────
  intro.md                          ✅ ALIGNED
  cobweb.md                         📋 MISSING_HEADINGMAP
  solow.md                          📋 MISSING_HEADINGMAP
  cagan_adaptive.md                 ⏳ OUTDATED
  pv.md                             ⚠️ SOURCE_AHEAD
  new_lecture.md                    ➕ SOURCE_ONLY
  old_removed.md                    🔸 TARGET_ONLY
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

At this stage, you're gathering information. Pay attention to `OUTDATED` and `SOURCE_AHEAD` statuses — these indicate the translations may have fallen behind the source. We'll address those in Step 2 before bootstrapping.

For a more comprehensive assessment including workflow and state file verification, run:

```bash
npx translate doctor \
  -t ~/repos/lecture-python-intro.zh-cn
```

This reports configuration health across all dimensions. All items should be ✅ by the end of Step 5.

---

## Step 2: Check sync before bootstrapping

:::{warning}
**Critical step.** Before bootstrapping state, verify that your translations actually match the current source. The `--write-state` flag records the current source commit as the baseline — if translations are stale, this creates a false "everything is synced" state and future changes to already-stale content will be invisible.
:::

Run the sync check to compare source and target content:

```bash
npx translate status \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn \
  --check-sync
```

This uses a lightweight LLM comparison to classify each file:

| Result | Meaning | Action |
|---|---|---|
| `IDENTICAL` | Translation matches current source | Safe to bootstrap |
| `I18N_ONLY` | Differences are localization-only (fonts, RTL, etc.) | Safe to bootstrap |
| `CONTENT_CHANGES` | Source has content changes not in translation | Resync first (Step 3) |
| `TARGET_HAS_ADDITIONS` | Target has extra content not in source | Run `backward` to capture, then resync |

If all files show `IDENTICAL` or `I18N_ONLY`, skip to Step 4. If any show `CONTENT_CHANGES`, proceed to Step 3. If any show `TARGET_HAS_ADDITIONS`, consider running `translate backward` first to capture improvements before resyncing.

:::{tip}
If you're confident the translations are current (e.g., they were just completed), you can skip this step. But for repos where the source has been actively developed since the translations were done, this check can save significant debugging later.
:::

---

## Step 3: Catch up stale translations

For files flagged as `CONTENT_STALE`, use the `forward` command to bring them up to date. The `forward` command preserves existing localization (RTL adaptations, font configuration, `# i18n` code, locale-specific links) while updating the translation to match the current source content.

```bash
# Dry run first — see what would change
npx translate forward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn \
  --dry-run

# Resync all stale files
npx translate forward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn
```

For a single file:

```bash
npx translate forward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn \
  -f solow.md
```

Review and commit the changes:

```bash
cd ~/repos/lecture-python-intro.zh-cn
git diff lectures/  # Review all changes
git add lectures/
git commit -m "Resync translations to current source via forward"
git push
```

:::{note}
The `forward` command uses whole-file RESYNC mode. It sends both the source document and existing translation to Claude, with explicit instructions to preserve the translation's style, terminology, and localization choices — only updating parts where the source content has actually changed.
:::

---

## Step 4: Bootstrap `.translate/` metadata

Now that translations are current, bootstrap the state tracking. The `.translate/` folder records which source commit each translation is synced to:

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

## Step 5: Fix missing heading-maps

Heading-maps are essential for reliable section matching. If Step 1 showed `MISSING_HEADINGMAP` for some files, you need to add them.

:::{note}
Files with zero sections (no `##` headings, like a simple `intro.md` or `status.md`) correctly have no heading-map. The `doctor` command will not warn about these.
:::

### Option A: Use `headingmap` to generate maps (recommended)

The `headingmap` command generates heading-maps by matching source and target headings by position — no LLM calls needed, and no changes to translations:

```bash
# Generate heading-map for a single file
npx translate headingmap \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn \
  -f cobweb.md
```

This:
1. Parses both files to extract section headings
2. Matches them by position (1st source → 1st target, etc.)
3. Injects the `heading-map` into the target file's YAML frontmatter
4. Makes **no changes to the translation content**

For all files missing heading-maps:

```bash
npx translate headingmap \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn
```

Preview first with `--dry-run`:

```bash
npx translate headingmap \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn \
  --dry-run
```

:::{tip}
This approach is ideal for repos with carefully reviewed human translations — it adds the heading-map metadata without touching any content.
:::

### Option B: Use `forward` to regenerate (also adds heading-maps)

If you already ran `forward` in Step 3, heading-maps were generated as part of that process. Check if any files still need them:

```bash
npx translate headingmap \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn \
  --dry-run
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

### Option C: Add heading-maps manually

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
  Overview: "概述"
  The Cobweb Model: "蛛网模型"
  The Cobweb Model::Equilibrium: "均衡"
  Exercises: "练习"
---
```

Heading-map keys use the full heading text with `::` nesting for subsections. See [Heading Maps](../heading-maps.md) for complete format rules.

### Commit the heading-maps

```bash
cd ~/repos/lecture-python-intro.zh-cn
git add lectures/
git commit -m "Add heading-maps to translated files"
git push origin main
```

---

## Step 6: Configure workflows and secrets

Now set up the automated pipeline. You need a workflow in the **source** repo and one in the **target** repo.

### 6a: Source repo — Sync workflow

Create `.github/workflows/sync-translations.yml` in the **source** repository:

```yaml
name: Sync Translations

on:
  pull_request:
    types: [closed]
    paths:
      - 'lectures/**/*.md'
      - 'lectures/_toc.yml'

jobs:
  sync:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 2

      - uses: QuantEcon/action-translation@v0.10.0
        with:
          mode: sync
          target-repo: 'QuantEcon/lecture-python-intro.zh-cn'
          source-language: 'en'
          target-language: 'zh-cn'
          docs-folder: 'lectures'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.TRANSLATION_PAT }}
```

:::{note}
Make sure the `paths` filter matches your actual file locations. For example, if your TOC is at `lectures/_toc.yml`, use that — not `_toc.yml` at the repo root.
:::

### 6b: Source repo — Secrets

| Secret | Value | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key | Pays for Claude translations |
| `TRANSLATION_PAT` | GitHub PAT with `repo` scope | Creates PRs in the target repo |

### 6c: Target repo — Review workflow

Create `.github/workflows/review-translations.yml` in the **target** repository:

```yaml
name: Review Translations

on:
  pull_request:
    types: [opened, synchronize, labeled, reopened]

jobs:
  review:
    if: contains(github.event.pull_request.labels.*.name, 'action-translation')
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 2

      - uses: QuantEcon/action-translation@v0.10.0
        with:
          mode: review
          source-repo: 'QuantEcon/lecture-python-intro'
          source-language: 'en'
          target-language: 'zh-cn'
          docs-folder: 'lectures'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

:::{tip}
The `labeled` event type is important — without it, the workflow won't trigger if the `action-translation` label is added after the PR is opened.
:::

### 6d: Target repo — Secret

| Secret | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |

---

### 6e: Merge order

Merge the **target repo** changes first (`.translate/`, heading-maps, review workflow), then the **source repo** sync workflow. This ensures the target is ready to receive translation PRs when the sync workflow activates.

---

## Step 7: Verify the connection

Run `status` again to confirm everything is properly connected:

```bash
npx translate status \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn
```

**What "ready" looks like:**

- All files show `✅ ALIGNED` or `⏳ OUTDATED` (OUTDATED is OK — it just means the source has newer changes)
- No `MISSING_HEADINGMAP` warnings
- `.translate/config.yml` exists in the target repo
- `.translate/state/*.yml` files exist for each translated file

Run a final health check:

```bash
npx translate doctor \
  -t ~/repos/lecture-python-intro.zh-cn \
  -s ~/repos/lecture-python-intro
```

All checks should pass ✅. If some files show `OUTDATED` or `SOURCE_AHEAD`, address them with `forward` before considering the connection complete — otherwise those files will be silently out of date.

---

## Common issues when connecting

### Many files show MISSING_HEADINGMAP

This is expected for repos translated before action-translation. Use `headingmap` to fix without changing translations:

```bash
npx translate headingmap \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn
```

Or use `forward` if you also want to update the translations:

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

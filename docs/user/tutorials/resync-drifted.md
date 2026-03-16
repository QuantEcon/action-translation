---
title: "Tutorial: Resync a Drifted Target"
subtitle: Catch up when translations fall behind the source
---

# Tutorial: Resync a Drifted Target

This tutorial covers diagnosing and recovering when translations have fallen behind the source — whether due to failed syncs, rapid source changes, manual edits, or periods where the automated pipeline wasn't active.

By the end, you'll have all drifted files resynced to match the current source content.

**Time:** ~15 minutes for diagnosis + ~2 minutes per file for resync
**Cost:** ~$0.12/file for resync using `claude-sonnet-4-6`

## When to use this tutorial

Use this when:

- **Source moved faster than the sync pipeline** — multiple PRs merged before translation PRs were reviewed
- **The sync workflow was turned off** or broken for a period
- **You manually edited the source** without going through PRs
- **You're onboarding** and some files were already outdated when you connected

## Overview

```
Step 1: Diagnose drift                (translate status)
Step 2: Triage — understand changes   (translate backward, optional)
Step 3: Resync drifted files          (translate forward)
Step 4: Review and commit             (git diff + git commit)
Step 5: Verify alignment              (translate status)
```

---

## Step 1: Diagnose drift

Run `status` to see which files have drifted:

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
│ cobweb.md                        │ ✅ ALIGNED            │
│ solow.md                         │ ⚠️  OUTDATED           │
│   ↳ SOURCE has 3 newer commits   │                      │
│ cagan_adaptive.md                │ ⚠️  OUTDATED           │
│   ↳ SOURCE has 1 newer commit    │                      │
│ pv.md                            │ ⚠️  SOURCE_AHEAD       │
│   ↳ SOURCE: 8 sections, TARGET: 7│                      │
│ new_lecture.md                   │ 📄 SOURCE_ONLY        │
└──────────────────────────────────┴──────────────────────┘
```

**Understanding the drift categories:**

| Status | What happened | Recovery approach |
|---|---|---|
| `OUTDATED` | Source has newer commits since last sync | `forward` resync |
| `SOURCE_AHEAD` | Source added new sections | `forward` resync |
| `SOURCE_ONLY` | Entirely new file in source | `forward -f <file>` |
| `TARGET_AHEAD` | Target has more sections than source | Investigate manually |

For JSON output (useful for scripting):

```bash
npx translate status \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn \
  --json
```

---

## Step 2: Understand what changed (optional)

Before blindly resyncing, you may want to understand *what* changed in the source. This is especially useful if significant time has passed.

### Quick: Check git log

```bash
cd ~/repos/lecture-python-intro
git log --oneline --since="2026-01-01" -- lectures/solow.md
```

### Thorough: Run backward analysis

The `backward` command does a deeper analysis — it can tell you whether the translations contain improvements worth preserving:

```bash
npx translate backward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn \
  -f solow.md
```

This produces a report with categorized suggestions. If the translation contains bug fixes or clarifications not in the source, you might want to backport those before resyncing.

For a full analysis of all files:

```bash
npx translate backward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn
```

:::{tip}
`backward` with `.translate/` state files is smart — it automatically skips files where the source hasn't changed since the last sync. This makes bulk runs efficient even on large projects.
:::

---

## Step 3: Resync drifted files

### Single file resync

For surgical recovery, resync one file at a time:

```bash
npx translate forward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn \
  -f solow.md
```

The forward pipeline:
1. **Triage** — lightweight LLM call to distinguish real content changes from i18n-only differences
2. **RESYNC** — sends complete source + existing translation to Claude, which produces an updated translation preserving existing style
3. **Write** — writes the updated file to disk and updates `.translate/state/`

Review the changes:

```bash
cd ~/repos/lecture-python-intro.zh-cn
git diff lectures/solow.md
```

The RESYNC mode is designed to preserve existing translation style and terminology — it only changes sections where the source content actually differs. Look for:

- New sections that were added
- Updated content that reflects source changes
- Existing translations that should be largely unchanged

If the changes look wrong, undo with:

```bash
git restore lectures/solow.md
```

### Bulk resync (all outdated files)

To resync everything that's drifted:

```bash
npx translate forward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn
```

This automatically:
1. Runs `status` to discover OUTDATED and SOURCE_AHEAD files
2. Triages each file (skips files with only i18n differences)
3. Resyncs files with real content changes
4. Shows a summary table

Example output:

```
 Forward Resync Summary
┌──────────────────────────┬──────────────┬──────────┐
│ File                     │ Result       │ Tokens   │
├──────────────────────────┼──────────────┼──────────┤
│ solow.md                 │ ✅ RESYNCED   │ 12,340   │
│ cagan_adaptive.md        │ ✅ RESYNCED   │ 8,920    │
│ pv.md                    │ ✅ RESYNCED   │ 15,100   │
│ intro.md                 │ ⏭️  I18N_ONLY │ —        │
└──────────────────────────┴──────────────┴──────────┘

3 resynced, 1 skipped (i18n only), 0 errors
Total tokens: 36,360
```

### Excluding files

Skip specific files from a bulk resync:

```bash
npx translate forward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn \
  --exclude intro.md \
  --exclude "troubleshooting*"
```

### GitHub PR mode

Instead of writing changes locally, create one PR per file in the target repo:

```bash
npx translate forward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn \
  --github QuantEcon/lecture-python-intro.zh-cn
```

Each PR is created on a `resync/{filename}` branch with labels `action-translation-sync` and `resync`.

---

## Step 4: Review and commit

After running `forward` locally, review all changes:

```bash
cd ~/repos/lecture-python-intro.zh-cn

# See which files changed
git status

# Review all diffs
git diff

# Review a specific file
git diff lectures/solow.md
```

**What to check:**

- Heading-maps should be intact or updated correctly
- Code cells should be preserved (especially i18n font configuration)
- New sections should be present and well-translated
- Existing sections should have minimal changes

**Selective commit** — if some files look good but others need manual fixes:

```bash
# Stage the good files
git add lectures/solow.md lectures/cagan_adaptive.md

# Undo the one that needs manual attention
git restore lectures/pv.md

git commit -m "Resync solow.md and cagan_adaptive.md to match current source"
git push origin main
```

**Commit everything:**

```bash
git add .
git commit -m "Resync all drifted files to match current source"
git push origin main
```

---

## Step 5: Verify alignment

After committing and pushing, run `status` again:

```bash
npx translate status \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn
```

All previously-drifted files should now show `✅ ALIGNED`.

If any files still show as `OUTDATED`, it may be because the source changed *again* between your resync and your status check. This is normal in active repos.

---

## Handling special cases

### New files (SOURCE_ONLY)

For files that exist only in the source, `forward` will translate them from scratch:

```bash
npx translate forward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn \
  -f new_lecture.md
```

### Target-only files (TARGET_ONLY)

Files that exist only in the target are usually orphans — the source file was deleted or renamed. Check git history:

```bash
cd ~/repos/lecture-python-intro
git log --oneline --all --follow -- lectures/old_name.md
```

If the file was deleted intentionally, remove it from the target:

```bash
cd ~/repos/lecture-python-intro.zh-cn
git rm lectures/old_name.md
git commit -m "Remove orphaned translation (source deleted)"
```

### TARGET_AHEAD (more sections in target)

This usually means someone added content directly to the translation that doesn't exist in the source. Before resyncing, run `backward` to check if the extra content is worth backporting:

```bash
npx translate backward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn \
  -f problem_file.md
```

If the backward analysis finds valuable additions, create Issues in the source repo:

```bash
npx translate review reports/lecture-python-intro/backward-2026-03-16 \
  --repo QuantEcon/lecture-python-intro
```

After backporting the content to the source, run `forward` to realign.

### Large-scale drift (most files outdated)

For very large drift (e.g., dozens of files), consider using the GitHub PR mode so changes can be reviewed individually:

```bash
npx translate forward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn \
  --github QuantEcon/lecture-python-intro.zh-cn
```

This creates one PR per file, making it easier for reviewers to handle.

---

## Preventing future drift

To minimize drift:

1. **Keep the sync workflow active** — it handles routine changes automatically
2. **Merge translation PRs promptly** — a backlog of unmerged PRs causes compound drift
3. **Run `status` periodically** — a quick check catches problems early:
   ```bash
   npx translate status -s ~/source -t ~/target
   ```
4. **Use the review workflow** — automated quality checks catch issues before they're merged

## Next steps

- [Tutorial: Fresh Setup](fresh-setup.md) — for new translation projects
- [Tutorial: Connect an Existing Target](connect-existing.md) — for repos that pre-date action-translation
- [Tutorial: Backward Analysis & Review](backward-review.md) — find improvements worth backporting
- [Tutorial: Automated Maintenance](automated-maintenance.md) — set up scheduled drift detection
- [CLI Reference](../cli-reference.md) — full command documentation

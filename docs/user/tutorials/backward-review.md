---
title: "Tutorial: Backward Analysis & Review"
subtitle: Find improvements in translations worth backporting to the source
---

# Tutorial: Backward Analysis & Review

Translations don't just follow the source — sometimes translators fix bugs, add clarifications, or improve examples that the English source would benefit from. The **backward analysis** workflow discovers these improvements and creates GitHub Issues in the source repo so they can be incorporated.

This tutorial walks through the full backward loop:

```
backward analysis → interactive review → GitHub Issues → fix source → verify
```

**Time:** ~10 minutes for analysis of a 50-file project, plus review time
**Cost:** ~$0.85 for 51 files using `claude-sonnet-4-6`

## When to use this

- After a period of active translation work (translators may have improved content)
- Before a major release (catch any fixes that should be in the source)
- Periodically as part of translation maintenance (monthly is typical)
- When a translator reports they fixed something in the target

## Prerequisites

| Requirement | Check |
|---|---|
| Source and target repos cloned locally | `ls ~/repos/lecture-python-intro/lectures/` |
| action-translation installed | `npx translate --version` |
| Anthropic API key set | `echo $ANTHROPIC_API_KEY` |
| `gh` CLI installed & authenticated | `gh auth status` (for Issue creation only) |

---

## Step 1: Run a status check

Start with a free diagnostic to understand the current state:

```bash
npx translate status \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-intro.zh-cn
```

This gives you context on which files are aligned, outdated, or structurally different. Backward analysis works best on files that are `ALIGNED` or `OUTDATED` — it's comparing *content* across languages, not sync state.

---

## Step 2: Run backward analysis

### Single file (quick test)

Try a single file first to see what the output looks like:

```bash
npx translate backward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-intro.zh-cn \
  -f cobweb.md
```

This runs the two-stage pipeline:

1. **Stage 1 — Triage**: One LLM call. Asks: "Beyond translation, are there substantive content differences?" Most files are filtered out here (~80%).
2. **Stage 2 — Analysis**: If flagged, parses sections, matches them by position, and evaluates all section pairs in one LLM call. Produces categorized suggestions with confidence scores.

Output:

```
📄 cobweb.md

Stage 1: Triage → CHANGES_DETECTED
Stage 2: Analyzing 6 section pairs…

Result: 📋 2 SUGGESTION(S)

  1. [BUG_FIX] (0.92) — Fixed off-by-one in equilibrium formula
  2. [CLARIFICATION] (0.71) — Added convergence condition explanation

Report written to: reports/lecture-python-intro/backward-2026-03-16/cobweb.md
```

### Bulk analysis (all files)

For a full project analysis:

```bash
npx translate backward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-intro.zh-cn
```

A progress bar shows status:

```
████████████████████░░░░ 42/51 | ✓ 30 sync  📝 8 suggestions  ❌ 0 errors | solow.md
```

**Smart skipping**: If `.translate/state/` exists, files where the source hasn't changed since the last sync are automatically skipped — saving both time and money on repeated runs.

### Output structure

Reports are saved to a timestamped folder:

```
reports/lecture-python-intro/backward-2026-03-16/
├── _summary.md           # Aggregate overview
├── _summary.json         # Machine-readable summary (with --json)
├── .resync/              # Machine-readable data for review command
│   ├── _progress.json    # Checkpoint for --resume
│   ├── _log.txt          # Detailed processing log
│   ├── cobweb.json       # Per-file JSON sidecar
│   └── solow.json
├── cobweb.md             # Human-readable per-file report
└── solow.md
```

### Options for tuning

```bash
# Lower confidence threshold to see more suggestions
npx translate backward ... --min-confidence 0.5

# Exclude files you don't want to analyze
npx translate backward ... --exclude intro.md --exclude "troubleshoot*"

# Include JSON output alongside Markdown reports
npx translate backward ... --json

# Use test mode (no LLM calls, deterministic mock responses)
npx translate backward ... --test

# Resume an interrupted bulk run
npx translate backward ... --resume
```

---

## Step 3: Read the summary

Open the summary report to get an overview:

```bash
cat reports/lecture-python-intro/backward-2026-03-16/_summary.md
```

The summary shows:
- Total files analyzed
- Files in sync (no action needed)
- Files with suggestions (grouped by category)
- High-confidence findings highlighted

Review individual file reports for details:

```bash
cat reports/lecture-python-intro/backward-2026-03-16/cobweb.md
```

Each report includes:
- Triage verdict and reasoning
- Per-section suggestions with category, confidence, and before/after changes
- Commit timeline showing when source and target were last modified

### Suggestion categories

| Category | What it means | Typical action |
|---|---|---|
| `BUG_FIX` | Translation corrected an error in the source | Backport — fix the source |
| `CLARIFICATION` | Translation added helpful explanation | Backport — improve the source |
| `EXAMPLE` | Translation improved or added an example | Backport — enhance the source |
| `CODE_IMPROVEMENT` | Translation fixed or improved code | Backport — fix the source code |
| `I18N_ONLY` | Changes are translation/localization only | No action (filtered by default) |
| `NO_CHANGE` | No meaningful difference | No action (filtered by default) |

---

## Step 4: Interactive review

The `review` command walks through each suggestion interactively, letting you decide what to do:

### Dry run first

Preview all suggestions without creating any Issues:

```bash
npx translate review \
  reports/lecture-python-intro/backward-2026-03-16 \
  --dry-run
```

This shows each suggestion as a styled card:

```
  ──────────────────────────────────────────────────────────────────────────
  [1/5] cobweb.md  Equilibrium
  ──────────────────────────────────────────────────────────────────────────

  [BUG FIX]  92% (high)

  Fixed off-by-one error in equilibrium price formula

  Suggested changes:
    1. Formula correction
       Before: p_{t+1} = α + β p_t
       After:  p_{t+1} = α + β p_{t-1}

  [A]ccept  [S]kip  [R]eject  [D]etails          ✓ 0 accepted  ~ 0 skipped  ✗ 0 rejected
```

### Interactive review with Issue creation

When you're ready to create Issues in the source repo:

```bash
npx translate review \
  reports/lecture-python-intro/backward-2026-03-16 \
  --repo QuantEcon/lecture-python-intro
```

For each suggestion, press:

| Key | Action |
|---|---|
| `A` | **Accept** — queued for Issue creation |
| `S` | **Skip** — move to the next suggestion |
| `R` | **Reject** — mark as false positive |
| `D` | **Details** — toggle the full LLM reasoning |

Suggestions are presented in confidence order (highest first), so the most likely real improvements come first.

After reviewing all suggestions, the command creates GitHub Issues for each accepted suggestion:

```
Creating Issues…
  ✅ https://github.com/QuantEcon/lecture-python-intro/issues/142
  ✅ https://github.com/QuantEcon/lecture-python-intro/issues/143

Summary: 2 accepted, 1 skipped, 2 rejected
```

### What the Issues look like

Each Issue is created with:

- **Title**: `[cobweb.md] Fixed off-by-one in equilibrium formula`
- **Labels**: `translate`, `translate:bug-fix`, `translate:zh-cn`
- **Body**: Category, confidence, section location, full analysis, before/after excerpts, and source/target repo links

The labels make it easy to filter translation-sourced improvements in your issue tracker.

---

## Step 5: Fix the source

Now address the Issues in the source repo through your normal development workflow:

1. **Create a branch** for each fix (or batch related fixes)
2. **Make the corrections** in the English source files
3. **Open a PR** and reference the Issue (e.g., "Fixes #142")
4. **Merge the PR** — the sync action automatically translates the changes forward to the target

This closes the loop: the improvement discovered in the *translation* is now in the *source*, and the sync action keeps both repos aligned.

---

## Step 6: Verify the cycle

After the source PR merges and the sync action runs:

```bash
npx translate status \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-intro.zh-cn
```

The fixed files should show `✅ ALIGNED` once the translation PR is merged in the target repo.

For a more thorough check, re-run backward on the specific file:

```bash
npx translate backward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-intro.zh-cn \
  -f cobweb.md
```

The previously-flagged suggestions should no longer appear (the source now matches the translation).

---

## Cost breakdown

| Step | Cost | Notes |
|---|---|---|
| `status` | Free | No LLM calls |
| `backward` Stage 1 (triage) | ~$0.05/file | 1 LLM call per file |
| `backward` Stage 2 (analysis) | ~$0.10/file | Only for flagged files (~20%) |
| `backward` full run (51 files) | ~$0.85 total | Stage 1 filters ~80% |
| `review` | Free | Reads existing reports |
| Issue creation | Free | Uses `gh` CLI |

Repeated runs with `.translate/` state are cheaper — unchanged files are skipped automatically.

---

## Tips

### Confidence thresholds

The default `--min-confidence 0.6` is well-calibrated:
- **High confidence (≥0.85)**: Almost always real improvements — prioritize these
- **Medium confidence (0.60–0.84)**: Worth reviewing but may include borderline cases
- **Low confidence (<0.60)**: Filtered out by default; lower the threshold to see them

### Running periodically

A monthly backward analysis catches improvements without creating noise:

```bash
# Monthly backward analysis
npx translate backward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-intro.zh-cn

# Review and create Issues
npx translate review \
  reports/lecture-python-intro/backward-2026-03-16 \
  --repo QuantEcon/lecture-python-intro
```

### Handling interrupted runs

If a bulk backward run is interrupted (network error, Ctrl+C), resume from where it stopped:

```bash
npx translate backward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-intro.zh-cn \
  --resume
```

The checkpoint in `.resync/_progress.json` tracks which files are complete.

## Next steps

- [Tutorial: Fresh Setup](fresh-setup.md) — for new translation projects
- [Tutorial: Resync a Drifted Target](resync-drifted.md) — catch up on outdated translations
- [CLI Reference](../cli-reference.md) — full backward and review command docs

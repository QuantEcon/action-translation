---
title: CLI Reference
---

# CLI Reference

The `resync` CLI tool provides local analysis and recovery capabilities for translation repositories. It complements the GitHub Action by handling tasks that require interactive use or don't fit a CI/CD pipeline.

## Installation

```bash
git clone https://github.com/QuantEcon/action-translation.git
cd action-translation
npm install
npm run build:cli
```

The CLI is available as `npx resync` from within the repository.

## Environment variables

| Variable | Required for | Description |
|----------|-------------|-------------|
| `ANTHROPIC_API_KEY` | `backward`, `forward` | Anthropic API key for Claude. Not needed with `--test` or `--estimate` flags. |

## Commands

### `status` — Sync diagnostic

Fast structural check with no LLM calls. Compares source and target repositories and reports per-file sync status.

```bash
npx resync status -s <source-path> -t <target-path> [options]
```

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `-s, --source <path>` | *(required)* | Path to source (English) repository |
| `-t, --target <path>` | *(required)* | Path to target (translated) repository |
| `-f, --file <name>` | *(all files)* | Check a single file (relative to docs folder) |
| `-d, --docs-folder <folder>` | `lectures` | Documentation folder within repos |
| `-l, --language <code>` | `zh-cn` | Target language code |
| `--exclude <pattern>` | *(none)* | Exclude files matching pattern (repeatable) |
| `--json` | `false` | Output as JSON |

**Status categories:**

| Status | Meaning |
|--------|---------|
| `ALIGNED` | Structure matches, heading-map present, no newer source commits |
| `SOURCE_AHEAD` | Source has more sections than target |
| `TARGET_AHEAD` | Target has more sections than source |
| `OUTDATED` | Source has newer commits than target |
| `MISSING_HEADINGMAP` | No heading-map in target frontmatter |
| `SOURCE_ONLY` | File exists in source but not target |
| `TARGET_ONLY` | File exists in target but not source |

**Example:**

```bash
npx resync status \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-intro.zh-cn
```

Output:
```
 Status Summary: lecture-python-intro ↔ lecture-intro.zh-cn
┌──────────────────────────────────┬──────────────────┐
│ File                             │ Status           │
├──────────────────────────────────┼──────────────────┤
│ cobweb.md                        │ ✅ ALIGNED       │
│ solow.md                         │ ✅ ALIGNED       │
│ cagan_adaptive.md                │ ⚠️  OUTDATED     │
│   ↳ SOURCE has 3 newer commits   │                  │
│ pv.md                            │ ⚠️  SOURCE_AHEAD │
│   ↳ SOURCE: 8 sections, TARGET: 7│                  │
└──────────────────────────────────┴──────────────────┘
```

---

### `backward` — Discover backport suggestions

Two-stage analysis that finds improvements in translations worth backporting to the English source.

**Stage 1 (triage):** Lightweight LLM call per file — "Are there substantive changes beyond translation?" Most files are filtered out here (~80%).

**Stage 2 (evaluation):** Detailed LLM analysis of flagged files — per-section comparison producing categorised suggestions with confidence scores.

```bash
npx resync backward -s <source-path> -t <target-path> [options]
```

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `-s, --source <path>` | *(required)* | Path to source repository |
| `-t, --target <path>` | *(required)* | Path to target repository |
| `-f, --file <name>` | *(all files)* | Analyze a single file |
| `-d, --docs-folder <folder>` | `lectures` | Documentation folder within repos |
| `-l, --language <code>` | `zh-cn` | Target language code |
| `-o, --output <path>` | `./reports` | Output directory for reports |
| `-m, --model <model>` | `claude-sonnet-4-6` | Claude model |
| `--json` | `false` | Include JSON reports |
| `--test` | `false` | Use deterministic mock responses (no LLM) |
| `--min-confidence <n>` | `0.6` | Minimum confidence threshold for reporting |
| `--exclude <pattern>` | *(none)* | Exclude files matching pattern |
| `--estimate` | `false` | Show cost estimate without running |
| `--resume` | `false` | Resume a previous bulk run from checkpoint |

**Single-file example:**

```bash
npx resync backward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-intro.zh-cn \
  -f cobweb.md \
  -o ./reports
```

**Bulk example (all files):**

```bash
npx resync backward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-intro.zh-cn \
  --estimate  # Preview cost first
```

**Output structure (bulk mode):**

```
reports/backward-2026-03-06/
├── _summary.md           # Aggregate summary
├── _summary.json         # (with --json)
├── .resync/              # Machine-readable data
│   ├── _progress.json    # Checkpoint manifest
│   ├── _log.txt          # Detailed processing log
│   ├── cobweb.json       # Per-file JSON sidecar
│   └── solow.json
├── cobweb.md             # Per-file Markdown report
└── solow.md
```

**Suggestion categories:**

| Category | Description |
|----------|-------------|
| `BUG_FIX` | Translation corrected an error in the source |
| `CLARIFICATION` | Translation added helpful context or explanation |
| `EXAMPLE` | Translation improved or added an example |
| `CODE_IMPROVEMENT` | Translation fixed or improved code |
| `I18N_ONLY` | Changes are translation/localisation only (filtered out) |
| `NO_CHANGE` | No meaningful difference (filtered out) |

---

### `review` — Interactive suggestion review

Walks through backward analysis suggestions interactively, letting you accept, skip, or reject each one. Accepted suggestions become GitHub Issues in the source repository.

```bash
npx resync review <report-dir> [options]
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `<report-dir>` | Path to the backward report directory (must contain `.resync/` subfolder) |

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `--repo <owner/repo>` | *(none)* | Source repository for Issue creation |
| `--dry-run` | `false` | Preview Issues without creating them |
| `--min-confidence <n>` | `0.6` | Minimum confidence threshold |

**Example:**

```bash
# Dry run — preview what Issues would look like
npx resync review reports/backward-2026-03-06 --dry-run

# Create Issues in the source repo
npx resync review reports/backward-2026-03-06 \
  --repo QuantEcon/lecture-python-intro
```

**Interactive controls:**

| Key | Action |
|-----|--------|
| `A` | Accept suggestion — queue for Issue creation |
| `S` | Skip suggestion — move to next |
| `R` | Reject suggestion — mark as false positive |
| `D` | Toggle detail view (show/hide full reasoning) |

Issues are created with labels: `translate`, `translate:{category}` (e.g., `translate:bug-fix`), `translate:{language}` (e.g., `translate:zh-cn`).

Requires the `gh` CLI to be installed and authenticated for Issue creation.

---

### `forward` — Resync translations

Updates target translations to match current source content. Used for drift recovery when translations have fallen behind due to failed syncs, manual edits, or initial onboarding.

The forward pipeline:
1. **Triage** each file with a lightweight LLM call to distinguish real content changes from i18n-only differences
2. **Whole-file RESYNC** — sends the complete source and existing translation to Claude, which produces an updated translation preserving existing style and localisation
3. **Write** the updated file locally, or create a PR

```bash
npx resync forward -s <source-path> -t <target-path> [options]
```

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `-s, --source <path>` | *(required)* | Path to source repository |
| `-t, --target <path>` | *(required)* | Path to target repository |
| `-f, --file <name>` | *(all outdated files)* | Resync a single file |
| `-d, --docs-folder <folder>` | `lectures` | Documentation folder within repos |
| `-l, --language <code>` | `zh-cn` | Target language code |
| `-m, --model <model>` | `claude-sonnet-4-6` | Claude model |
| `--test` | `false` | Use deterministic mock responses (no LLM) |
| `--github <owner/repo>` | *(none)* | Create one PR per file in the target repo |
| `--exclude <pattern>` | *(none)* | Exclude files matching pattern |
| `--estimate` | `false` | Show cost estimate without running |

**Single-file example:**

```bash
npx resync forward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-intro.zh-cn \
  -f cobweb.md
```

After running, review the changes with `git diff` in the target repo. Use `git restore .` to undo if needed.

**Bulk example (all outdated files):**

```bash
# See what would be resynced
npx resync forward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-intro.zh-cn \
  --estimate

# Run the resync
npx resync forward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-intro.zh-cn
```

**GitHub PR mode:**

```bash
npx resync forward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-intro.zh-cn \
  --github QuantEcon/lecture-intro.zh-cn
```

Creates one PR per file in the target repo with branch `resync/{filename}` and labels `action-translation-sync`, `resync`.

**Forward triage verdicts:**

| Verdict | Action | Description |
|---------|--------|-------------|
| `CONTENT_CHANGES` | Proceeds to RESYNC | Real structural or content differences found |
| `I18N_ONLY` | Skipped | Only internationalisation differences (punctuation, terminology style) |
| `IDENTICAL` | Skipped | Files are byte-identical |

---

## Typical workflow

A complete translation maintenance workflow using the CLI:

```bash
# 1. Check sync status (free, instant)
npx resync status -s ~/source -t ~/target

# 2. Run backward analysis to find improvements (LLM, ~$0.85 for 51 files)
npx resync backward -s ~/source -t ~/target --estimate
npx resync backward -s ~/source -t ~/target

# 3. Review suggestions interactively, create Issues for accepted ones
npx resync review reports/backward-2026-03-06 --repo QuantEcon/lecture-python-intro

# 4. Forward resync any outdated files (LLM, ~$0.12/file)
npx resync forward -s ~/source -t ~/target --estimate
npx resync forward -s ~/source -t ~/target
cd ~/target && git diff  # Review changes
```

## Cost estimates

Approximate costs using `claude-sonnet-4-6` (March 2026 pricing):

| Operation | Cost | Notes |
|-----------|------|-------|
| `status` | Free | No LLM calls |
| `backward` Stage 1 (triage) | ~$0.05/file | 1 LLM call per file |
| `backward` Stage 2 (evaluation) | ~$0.10/file | 1 LLM call per flagged file |
| `backward` full run (51 files) | ~$0.85 total | Stage 1 filters ~80% of files |
| `forward` triage | ~$0.05/file | 1 LLM call per file |
| `forward` RESYNC | ~$0.12/file | 1 LLM call per file (whole-file) |
| `review` | Free | Reads existing reports, no LLM calls |

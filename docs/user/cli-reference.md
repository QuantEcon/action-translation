---
title: CLI Reference
---

# CLI Reference

The `translate` CLI tool provides local analysis and recovery capabilities for translation repositories. It complements the GitHub Action by handling tasks that require interactive use or don't fit a CI/CD pipeline.

## Installation

```bash
git clone https://github.com/QuantEcon/action-translation.git
cd action-translation
npm install
npm run build:cli
```

The CLI is available as `npx translate` from within the repository.

## Environment variables

| Variable | Required for | Description |
|----------|-------------|-------------|
| `ANTHROPIC_API_KEY` | `backward`, `forward`, `init` | Anthropic API key for Claude. Not needed with `--test` (`backward`/`forward`) or `--dry-run` (`init`). |

## Commands

### `status` — Sync diagnostic

Fast structural check with no LLM calls. Compares source and target repositories and reports per-file sync status.

```bash
npx translate status -s <source-path> -t <target-path> [options]
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
npx translate status \
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
npx translate backward -s <source-path> -t <target-path> [options]
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
| `--resume` | `false` | Resume a previous bulk run from checkpoint |

**Single-file example:**

```bash
npx translate backward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-intro.zh-cn \
  -f cobweb.md \
  -o ./reports
```

**Bulk example (all files):**

```bash
npx translate backward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-intro.zh-cn
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
npx translate review <report-dir> [options]
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
npx translate review reports/backward-2026-03-06 --dry-run

# Create Issues in the source repo
npx translate review reports/backward-2026-03-06 \
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
npx translate forward -s <source-path> -t <target-path> [options]
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

**Single-file example:**

```bash
npx translate forward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-intro.zh-cn \
  -f cobweb.md
```

After running, review the changes with `git diff` in the target repo. Use `git restore .` to undo if needed.

**Bulk example (all outdated files):**

```bash
# Run the resync
npx translate forward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-intro.zh-cn
```

**GitHub PR mode:**

```bash
npx translate forward \
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

### `init` — Bulk-translate a new project

One-time bulk translation of an entire lecture series from a local source repository. Reads `_toc.yml` for lecture discovery, translates each lecture sequentially with `translateFullDocument()`, generates heading-maps, and produces a translation report.

This is intended for onboarding a new project — use `forward` for incremental updates after the initial translation.

```bash
npx translate init -s <source-path> -t <target-path> --target-language <code> [options]
```

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `-s, --source <path>` | *(required)* | Path to source (English) repository |
| `-t, --target <path>` | *(required)* | Path to target directory (will be created) |
| `--target-language <code>` | *(required)* | Target language code (e.g., `zh-cn`, `fa`) |
| `--source-language <code>` | `en` | Source language code |
| `-d, --docs-folder <folder>` | `lectures` | Documentation folder within repos |
| `-m, --model <model>` | `claude-sonnet-4-6` | Claude model |
| `--batch-delay <ms>` | `1000` | Delay between lectures in ms (rate limiting) |
| `--resume-from <file>` | *(none)* | Resume from a specific lecture file |
| `--glossary <path>` | *(auto)* | Path to glossary JSON file (default: `glossary/<lang>.json`) |
| `--dry-run` | `false` | Preview lectures without translating |

**7-phase pipeline:**

1. **Load glossary** — looks for `glossary/<lang>.json` in the current working directory
2. **Parse `_toc.yml`** — discovers lectures from the source repo's table of contents
3. **Setup target folder** — creates the target directory structure
4. **Copy non-markdown files** — images, config, data files, CSS (preserves directory structure)
5. **Translate lectures** — sequentially with retry + progress bar
6. **Generate heading-maps** — position-based section matching, injected into frontmatter
7. **Write report** — `TRANSLATION-REPORT.md` with stats, config, and failure details

**Dry run example (preview without API calls):**

```bash
npx translate init \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn \
  --target-language zh-cn \
  --dry-run
```

Output:
```
🔍 DRY RUN — No changes will be made

Source:   /Users/you/repos/lecture-python-intro
Target:   /Users/you/repos/lecture-python-intro.zh-cn
Language: en → zh-cn
Model:    claude-sonnet-4-6
Glossary: 181 terms

Found 51 lectures in _toc.yml

Would translate the following lectures:
  1. intro.md ✓
  2. getting_started.md ✓
  3. cobweb.md ✓
  ...

Would copy 24 non-markdown file(s)

Run without --dry-run to translate.
```

**Full translation example:**

```bash
npx translate init \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn \
  --target-language zh-cn
```

**Resume from a specific lecture (after a failure or interruption):**

```bash
npx translate init \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn \
  --target-language zh-cn \
  --resume-from cobweb.md
```

Partial filename matches are supported — `--resume-from cobweb` will also work.

**Output:**

A `TRANSLATION-REPORT.md` file is written to the target directory with:
- Total lectures, success/failure counts
- Total tokens used, total time
- Configuration details
- List of any failures with error messages

---

## Typical workflow

A complete translation maintenance workflow using the CLI:

```bash
# 1. Check sync status (free, instant)
npx translate status -s ~/source -t ~/target

# 2. Run backward analysis to find improvements (LLM, ~$0.85 for 51 files)
npx translate backward -s ~/source -t ~/target

# 3. Review suggestions interactively, create Issues for accepted ones
npx translate review reports/backward-2026-03-06 --repo QuantEcon/lecture-python-intro

# 4. Forward resync any outdated files (LLM, ~$0.12/file)
npx translate forward -s ~/source -t ~/target
cd ~/target && git diff  # Review changes
```

For initial project onboarding, use `init` first:

```bash
# Translate entire project from scratch
npx translate init -s ~/source -t ~/target --target-language zh-cn --dry-run
npx translate init -s ~/source -t ~/target --target-language zh-cn
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
| `init` (bulk translate) | ~$0.12/file | 1 LLM call per lecture (whole-file) |
| `review` | Free | Reads existing reports, no LLM calls |

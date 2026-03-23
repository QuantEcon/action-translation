---
title: GitHub Action Reference
---

# GitHub Action Reference

Complete reference for the `QuantEcon/action-translation` GitHub Action.

## Modes

The action operates in two modes, specified by the `mode` input:

### Sync mode

Runs in the **source** (English) repository. When a PR is merged that changes Markdown files, the action:

1. Detects which files and sections changed
2. Translates only the changed sections using Claude
3. Reconstructs the target document, preserving unchanged sections
4. Creates a PR in the target repository with the updated translations
5. Posts a confirmation comment on the source PR

If sync fails, it automatically opens a GitHub Issue with error details and recovery instructions.

### Review mode

Runs in the **target** (translated) repository. When a translation PR is opened (typically by sync mode), the action:

1. Compares the translation against the source content
2. Evaluates translation quality and diff accuracy
3. Posts a review comment with scores and suggestions

## Inputs

### Required inputs

| Input | Description |
|-------|-------------|
| `mode` | Operation mode: `sync` or `review` |
| `anthropic-api-key` | Anthropic API key for Claude |
| `github-token` | GitHub token for API access (cross-repo requires a PAT with `repo` scope) |

### Sync mode inputs

| Input | Default | Description |
|-------|---------|-------------|
| `target-repo` | *(required)* | Target repository for translations (`owner/repo`) |
| `target-language` | *(required)* | Target language code (e.g., `zh-cn`, `fa`) |
| `docs-folder` | `lectures/` | Documentation folder containing Markdown files |
| `source-language` | `en` | Source language code |
| `glossary-path` | *(empty)* | Path to custom glossary JSON file. If empty, the built-in glossary for the target language is used |
| `toc-file` | `_toc.yml` | Table of contents file name |
| `claude-model` | `claude-sonnet-4-6` | Claude model for translation |
| `pr-labels` | `action-translation,automated` | Comma-separated labels for created PRs |
| `pr-reviewers` | *(empty)* | GitHub usernames to request as reviewers |
| `pr-team-reviewers` | *(empty)* | GitHub team slugs to request as reviewers |
| `test-mode` | `false` | Use PR head commit instead of merge commit (for testing) |

### Review mode inputs

| Input | Default | Description |
|-------|---------|-------------|
| `source-repo` | *(required)* | Source repository for English content (`owner/repo`) |
| `source-language` | `en` | Source language code |
| `target-language` | *(required for review)* | Target language code |
| `docs-folder` | `lectures/` | Documentation folder |
| `max-suggestions` | `5` | Maximum improvement suggestions in review comment |
| `claude-model` | `claude-sonnet-4-6` | Claude model for review |

## Outputs

### Sync mode outputs

| Output | Description |
|--------|-------------|
| `pr-url` | URL of the created translation PR |
| `files-synced` | Number of files synchronized |

### Review mode outputs

| Output | Description |
|--------|-------------|
| `review-verdict` | Review verdict: `PASS`, `WARN`, or `FAIL` |
| `translation-score` | Overall translation quality score (1–10) |
| `diff-score` | Diff accuracy score (1–10) |

## Workflow examples

### Basic sync (single language)

```yaml
name: Sync Translations

on:
  pull_request:
    types: [closed]
    paths:
      - 'lectures/**/*.md'
      - '_toc.yml'
  issue_comment:
    types: [created]

jobs:
  sync-to-chinese:
    if: >
      (github.event_name == 'pull_request' && github.event.pull_request.merged == true) ||
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '\\translate-resync'))
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - uses: QuantEcon/action-translation@v0.11
        with:
          mode: sync
          target-repo: 'QuantEcon/lecture-intro.zh-cn'
          target-language: 'zh-cn'
          docs-folder: 'lectures/'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.TRANSLATION_PAT }}
```

The `issue_comment` trigger enables the `\translate-resync` command — comment it on any merged PR to retry a failed sync.

### Multi-language sync

Use separate jobs for each target language. They run in parallel and create independent PRs:

```yaml
name: Sync Translations

on:
  pull_request:
    types: [closed]
    paths:
      - 'lectures/**/*.md'
  issue_comment:
    types: [created]

jobs:
  sync-to-chinese:
    if: >
      (github.event_name == 'pull_request' && github.event.pull_request.merged == true) ||
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '\\translate-resync'))
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2
      - uses: QuantEcon/action-translation@v0.11
        with:
          mode: sync
          target-repo: 'QuantEcon/lecture-intro.zh-cn'
          target-language: 'zh-cn'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.TRANSLATION_PAT }}

  sync-to-farsi:
    if: >
      (github.event_name == 'pull_request' && github.event.pull_request.merged == true) ||
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '\\translate-resync'))
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2
      - uses: QuantEcon/action-translation@v0.11
        with:
          mode: sync
          target-repo: 'QuantEcon/lecture-intro.fa'
          target-language: 'fa'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.TRANSLATION_PAT }}
```

### Review on translation PRs

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

      - uses: QuantEcon/action-translation@v0.11
        with:
          mode: review
          source-repo: 'QuantEcon/lecture-python-intro'
          source-language: 'en'
          target-language: 'zh-cn'
          docs-folder: 'lectures/'
          max-suggestions: 5
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Using outputs

```yaml
- uses: QuantEcon/action-translation@v0.11
  id: translate
  with:
    mode: sync
    # ... other inputs

- name: Comment on PR
  if: steps.translate.outputs.pr-url
  run: |
    echo "Translation PR created: ${{ steps.translate.outputs.pr-url }}"
    echo "Files synced: ${{ steps.translate.outputs.files-synced }}"
```

## How sync mode works

When a PR is merged, sync mode:

1. **Identifies changed files** — Compares the PR's diff against the docs folder pattern
2. **Classifies each file** — New file (full translation) or existing file (section-level update)
3. **Parses sections** — Splits documents at `##` headings using a stack-based parser
4. **Detects section changes** — Compares old and new source to find which sections differ
5. **Translates changed sections** — Sends only modified sections to Claude (UPDATE mode)
6. **Reconstructs the document** — Merges translated sections back with unchanged content
7. **Updates heading-map** — Refreshes the section ID mapping in the target frontmatter
8. **Creates a PR** — Commits all updated files to a branch in the target repo
9. **Posts a success comment** — Confirms sync completion on the source PR with a link to the translation PR

If any files fail to process, the action opens a GitHub Issue with error details and a link to the source PR. Comment `\translate-resync` on the merged PR to retry.

For new files, the entire document is translated in a single call (NEW mode).

## Claude model selection

The default model is `claude-sonnet-4-6`, which provides excellent translation quality at reasonable cost. Options:

| Model | Cost | Best for |
|-------|------|----------|
| `claude-sonnet-4-6` | ~$0.05/file | Daily sync operations (recommended) |
| `claude-opus-4` | ~$0.25/file | High-stakes translations needing maximum quality |
| `claude-haiku-3.5` | ~$0.01/file | Budget-conscious bulk operations |

## File naming conventions

The action follows QuantEcon's repository naming convention:

- **Source**: `lecture-python-intro` (English)
- **Target**: `lecture-intro.zh-cn` (Chinese), `lecture-intro.fa` (Farsi)

The `target-repo` input must be the full `owner/repo` path (e.g., `QuantEcon/lecture-intro.zh-cn`).

## Root-level docs folder

If your Markdown files are in the repository root (not a subfolder), set `docs-folder` to `.`:

```yaml
docs-folder: '.'
```

The action handles this correctly, filtering only top-level `.md` files.

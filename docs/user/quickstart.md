---
title: Quick Start
---

# Quick Start

Get **action-translation** running in your repositories in three steps.

## Prerequisites

- Two GitHub repositories: a **source** (English) and a **target** (translated) repo
- Both repos contain MyST Markdown files in a docs folder (e.g., `lectures/`)
- An [Anthropic API key](https://console.anthropic.com/) for Claude
- A GitHub Personal Access Token (PAT) with `repo` scope for cross-repo access

## Step 1: Set up secrets

In your **source** repository, go to **Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|--------|-------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `TRANSLATION_PAT` | A GitHub PAT with `repo` scope for the target repository |

## Step 2: Add the sync workflow

Create `.github/workflows/sync-translations.yml` in your **source** repository:

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
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '\translate-resync'))
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - uses: QuantEcon/action-translation@v0.11
        with:
          mode: sync
          target-repo: 'YourOrg/your-repo.zh-cn'
          target-language: 'zh-cn'
          docs-folder: 'lectures/'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.TRANSLATION_PAT }}
```

This workflow triggers whenever a PR that touches Markdown files in `lectures/` is merged. It detects which sections changed and creates a translation PR in the target repository. The `issue_comment` trigger enables re-syncing by commenting `\translate-resync` on a merged PR.

## Step 3: Add the review workflow (optional)

Create `.github/workflows/review-translations.yml` in your **target** repository:

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
          source-repo: 'YourOrg/your-source-repo'
          source-language: 'en'
          target-language: 'zh-cn'
          docs-folder: 'lectures/'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

This posts an AI-generated quality review comment on each translation PR, including a translation score, diff quality score, and improvement suggestions.

## What happens next

1. **You merge a PR** in the source repo that changes `lectures/cobweb.md`
2. **The sync workflow** detects the changed sections, translates them with Claude, and creates a PR in the target repo
3. **The action posts a confirmation comment** on the source PR with a link to the translation PR
4. **The review workflow** (if configured) automatically reviews the translation PR and posts quality feedback
5. **A human reviewer** approves and merges the translation PR

If the sync fails, the action automatically opens a GitHub Issue with error details and recovery instructions. You can re-run the sync by commenting `\translate-resync` on the merged PR.

Only changed sections are translated — the rest of the document is preserved exactly as-is.

## Using the CLI tool

For local analysis and drift recovery, install the CLI:

```bash
# Clone the repository
git clone https://github.com/QuantEcon/action-translation.git
cd action-translation
npm install
npm run build:cli

# Check sync status (no API key needed)
npx translate status -s ~/source-repo -t ~/target-repo

# Run backward analysis (finds improvements in translations)
export ANTHROPIC_API_KEY=your-key
npx translate backward -s ~/source-repo -t ~/target-repo

# Forward resync (updates translations to match source)
npx translate forward -s ~/source-repo -t ~/target-repo -f cobweb.md
```

See the [CLI Reference](cli-reference.md) for full command documentation.

## Next steps

- [Action Reference](action-reference.md) — All inputs, outputs, and configuration options
- [CLI Reference](cli-reference.md) — Complete CLI command documentation
- [Glossary](glossary.md) — How to use and extend translation glossaries
- [Heading Maps](heading-maps.md) — Understanding the cross-language section matching system

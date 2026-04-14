# Example Workflow Configuration

This directory contains example workflow files for using the Translation Sync action.

## Basic Usage

Create `.github/workflows/sync-translations.yml` in your source repository:

```yaml
name: Sync Translations to Chinese

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
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '\translate-resync'))
    runs-on: ubuntu-latest
    
    steps:
      - name: Sync translations
        uses: quantecon/action-translation@v0.11
        with:
          mode: sync
          target-repo: 'quantecon/lecture-python.zh-cn'
          target-language: 'zh-cn'
          docs-folder: 'lectures/'
          source-language: 'en'
          glossary-path: '.github/translation-glossary.json'
          toc-file: '_toc.yml'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          pr-labels: 'translation-sync,automated'
          pr-reviewers: 'translation-team'
```

## Multi-Language Support

You can sync to multiple target repositories:

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
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '\translate-resync'))
    runs-on: ubuntu-latest
    steps:
      - uses: quantecon/action-translation@v0.11
        with:
          mode: sync
          target-repo: 'quantecon/lecture-python.zh-cn'
          target-language: 'zh-cn'
          docs-folder: 'lectures/'
          glossary-path: '.github/translation-glossary-zh-cn.json'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
  
  sync-to-japanese:
    if: >
      (github.event_name == 'pull_request' && github.event.pull_request.merged == true) ||
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '\translate-resync'))
    runs-on: ubuntu-latest
    steps:
      - uses: quantecon/action-translation@v0.11
        with:
          mode: sync
          target-repo: 'quantecon/lecture-python.ja'
          target-language: 'ja'
          docs-folder: 'lectures/'
          glossary-path: '.github/translation-glossary-ja.json'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Required Secrets

Add these secrets to your repository settings:

- `ANTHROPIC_API_KEY`: Your Anthropic API key for Claude
- `GITHUB_TOKEN`: Automatically provided by GitHub Actions

## Rebase Workflow (Conflict Prevention)

Install this workflow in each **target** (translated) repository to automatically rebase
open translation-sync PRs when another translation PR is merged. This eliminates the
merge conflicts described in [issue #63](https://github.com/QuantEcon/action-translation/issues/63).

See [`rebase-translations.yml`](rebase-translations.yml) for the ready-to-use template.

Place it at `.github/workflows/rebase-translations.yml` in the target repo.

## Glossary File

Create `.github/translation-glossary.json`:

```json
{
  "version": "1.0",
  "terms": [
    {
      "en": "equilibrium",
      "zh-cn": "均衡",
      "ja": "均衡",
      "context": "economics"
    },
    {
      "en": "steady state",
      "zh-cn": "稳态",
      "ja": "定常状態"
    }
  ],
  "style_guide": {
    "preserve_code_blocks": true,
    "preserve_math": true,
    "preserve_citations": true,
    "preserve_myst_directives": true
  }
}
```

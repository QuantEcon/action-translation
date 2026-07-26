# Example Workflow Configuration

This directory contains example workflow files for the action-translation action.

> **Cross-repo pushes need a PAT.** Sync mode opens PRs in a *different* repository, which
> the workflow-scoped `secrets.GITHUB_TOKEN` cannot do. Store a fine-grained personal
> access token (or a machine-user token) with write access to the target repo as
> `TRANSLATION_PAT` and pass that. `GITHUB_TOKEN` is only sufficient for same-repo modes
> (review, rebase).

## Basic Usage

Create `.github/workflows/sync-translations.yml` in your **source** repository:

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
    # The issue_comment path requires all three: a comment on a PR (not a bare
    # issue), the command, and a trusted author — otherwise any account could
    # fire a secrets-bearing run (Anthropic spend plus the PAT) from any comment.
    if: >
      (github.event_name == 'pull_request' && github.event.pull_request.merged == true) ||
      (github.event_name == 'issue_comment' &&
       github.event.issue.pull_request &&
       contains(github.event.comment.body, '\translate-resync') &&
       contains(fromJSON('["OWNER", "MEMBER", "COLLABORATOR"]'), github.event.comment.author_association))
    runs-on: ubuntu-latest

    # The action authenticates with TRANSLATION_PAT; the ambient GITHUB_TOKEN
    # is unused beyond checkout, so keep it read-only.
    permissions:
      contents: read

    steps:
      - name: Sync translations
        uses: quantecon/action-translation@v0
        with:
          mode: sync
          target-repo: 'quantecon/lecture-python.zh-cn'
          target-language: 'zh-cn'
          docs-folder: 'lectures/'
          source-language: 'en'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.TRANSLATION_PAT }}
          pr-reviewers: 'translation-team'
```

### Who can trigger a resync

The `issue_comment` clause of the `if:` is a trust gate, not decoration. `issue_comment`
workflows run in default-branch context with full access to secrets, so without it any
GitHub account could comment `\translate-resync` on a merged PR and spend Anthropic credits
and runner minutes at will. The three checks are: the comment is on a **pull request**
(`github.event.issue.pull_request` — issues fire the same event), it carries the command,
and its author is an `OWNER`, `MEMBER` or `COLLABORATOR`. `CONTRIBUTOR` — anyone with one
merged PR — is deliberately excluded; the action applies the same three-way set internally,
so admitting it here would only produce a run that no-ops.

## Multi-Language Support

You can sync to multiple target repositories. Each target language needs a
`LANGUAGE_CONFIGS` entry in the action (target languages currently: `zh-cn`, `fa`, `fr`,
`ml`; `en` is configured for the source side) — a glossary alone does not enable a language.

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
    # Every job carries the same guard — the trust gate belongs on each one,
    # not on the first.
    if: >
      (github.event_name == 'pull_request' && github.event.pull_request.merged == true) ||
      (github.event_name == 'issue_comment' &&
       github.event.issue.pull_request &&
       contains(github.event.comment.body, '\translate-resync') &&
       contains(fromJSON('["OWNER", "MEMBER", "COLLABORATOR"]'), github.event.comment.author_association))
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: quantecon/action-translation@v0
        with:
          mode: sync
          target-repo: 'quantecon/lecture-python.zh-cn'
          target-language: 'zh-cn'
          docs-folder: 'lectures/'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.TRANSLATION_PAT }}

  sync-to-french:
    if: >
      (github.event_name == 'pull_request' && github.event.pull_request.merged == true) ||
      (github.event_name == 'issue_comment' &&
       github.event.issue.pull_request &&
       contains(github.event.comment.body, '\translate-resync') &&
       contains(fromJSON('["OWNER", "MEMBER", "COLLABORATOR"]'), github.event.comment.author_association))
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: quantecon/action-translation@v0
        with:
          mode: sync
          target-repo: 'quantecon/lecture-python.fr'
          target-language: 'fr'
          docs-folder: 'lectures/'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.TRANSLATION_PAT }}
```

## Required Secrets

Add these secrets to your **source** repository settings:

- `ANTHROPIC_API_KEY`: Your Anthropic API key for Claude
- `TRANSLATION_PAT`: A token with write access to each target repo (the default
  `GITHUB_TOKEN` cannot push cross-repo)

## Rebase Workflow (Conflict Prevention)

Install this workflow in each **target** (translated) repository to automatically rebase
open translation-sync PRs when another translation PR is merged. This eliminates the
merge conflicts described in [issue #63](https://github.com/QuantEcon/action-translation/issues/63).
Rebase runs in the same repository, so the default `GITHUB_TOKEN` is sufficient there.

See [`rebase-translations.yml`](rebase-translations.yml) for the ready-to-use template.

Place it at `.github/workflows/rebase-translations.yml` in the target repo.

## Glossary File

Built-in glossaries ship with the action for `zh-cn`, `fa`, and `fr` — most projects
need no glossary configuration at all. To override with your own, point `glossary-path`
at a JSON file shaped like the built-ins:

```json
{
  "version": "1.0",
  "description": "Project-specific terminology",
  "terms": [
    {
      "en": "equilibrium",
      "context": "economics",
      "zh-cn": "均衡"
    },
    {
      "en": "steady state",
      "context": "economics",
      "zh-cn": "稳态"
    }
  ]
}
```

Every term needs a translation for each target language you sync to; terms without one
are skipped (with a log line) for that language.

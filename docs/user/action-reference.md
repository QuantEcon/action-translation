---
title: GitHub Action Reference
---

# GitHub Action Reference

Complete reference for the `QuantEcon/action-translation` GitHub Action.

## Modes

The action operates in three modes, specified by the `mode` input:

### Sync mode

Runs in the **source** (English) repository. When a PR that changes Markdown files is merged into the default branch, the action:

1. Detects which files and sections changed
2. Translates only the changed sections using Claude
3. Reconstructs the target document, preserving unchanged sections
4. Creates a PR in the target repository with the updated translations
5. Posts a confirmation comment on the source PR

If sync fails, it automatically opens a GitHub Issue with error details and recovery instructions.

An edition that takes lectures one reviewed PR at a time can limit sync to the lectures it already has: see [Partial editions](#partial-editions).

### Review mode

Runs in the **target** (translated) repository. When a translation PR is opened (typically by sync mode), the action:

1. Compares the translation against the source content
2. Evaluates translation quality and diff accuracy
3. Posts a review comment with scores, structured findings, and a machine-readable verdict block (see [Metadata contract](metadata-contract.md))

### Rebase mode

Runs in the **target** (translated) repository, triggered when a translation PR is merged. Open translation PRs go stale as soon as the base moves, so the action:

1. Finds the other open translation PRs — both sync (`translation-sync-*`) and CLI resync (`resync/*`) branches
2. For each one whose files **overlap** the merged PR, re-runs the sync pipeline and force-pushes, resolving the conflict while preserving translated content
3. For each one that does **not** overlap, skips by default — or, with `rebase-stale-siblings`, refreshes it against the new base without re-translating

## Inputs

### Required inputs

| Input | Description |
|-------|-------------|
| `mode` | Operation mode: `sync`, `review`, or `rebase` |
| `anthropic-api-key` | Anthropic API key for Claude |
| `github-token` | GitHub token for API access (cross-repo requires a PAT with `repo` scope) |

### Sync mode inputs

| Input | Default | Description |
|-------|---------|-------------|
| `target-repo` | *(required)* | Target repository for translations (`owner/repo`) |
| `target-language` | *(required)* | Target language code (e.g., `zh-cn`, `fa`) |
| `docs-folder` | `lectures/` | Documentation folder containing Markdown files |
| `source-language` | `en` | Source language code |
| `glossary-path` | *(empty)* | Path to custom glossary JSON file. **Overrides** the built-in glossary for the target language; if empty, the built-in one is used. Honoured by all three modes — sync, rebase and review. A path that cannot be read or parsed **fails the run** rather than falling back to different terminology |
| `claude-model` | `claude-sonnet-5` | Claude model for translation |
| `bibliography` | `backfill` | How to handle citations a run introduces that the target bibliography lacks (#117). `backfill` copies the entry from the source bibliography; `lint` reports and fails the run without copying; `off` disables the check. Entries are only ever **appended** — a key that already resolves in the target is never a candidate, so an edition that has localised an entry cannot have it clobbered. An unrecognised value **fails the run** |
| `sync-scope` | `all` | Which changed lectures a sync translates. `all` takes every one. `existing` syncs a changed or renamed lecture only when the edition has its state file, `.translate/state/<file>.yml`; the others are skipped and listed. A temporary input for an edition built one reviewed lecture at a time (see [Partial editions](#partial-editions)). An unrecognised value **fails the run** |
| `pr-labels` | `action-translation,automated` | Comma-separated labels for created PRs |
| `pr-reviewers` | *(empty)* | GitHub usernames to request as reviewers |
| `pr-team-reviewers` | *(empty)* | GitHub team slugs to request as reviewers |
| `test-mode` | `false` | Use PR head commit instead of merge commit (for testing) |

### Review mode inputs

| Input | Default | Description |
|-------|---------|-------------|
| `source-repo` | *(required)* | Source repository for English content (`owner/repo`) |
| `source-language` | `en` | Source language code |
| `docs-folder` | `lectures/` | Documentation folder |
| `max-suggestions` | `5` | Maximum findings in review comment |
| `claude-model` | `claude-sonnet-5` | Claude model for review |
| `auto-merge-mode` | `off` | `off` or `shadow`. Shadow records the would-auto-merge decision in the verdict block and outputs without acting on it. `active` is not implemented and fails loudly ([#103](https://github.com/QuantEcon/action-translation/issues/103)) |

There is no `target-language` input in review mode: the language is detected from the repository-name suffix (`lecture-python-intro.zh-cn` → `zh-cn`), which selects the glossary for terminology review. A repo whose name carries no language suffix logs a warning and reviews without a glossary.

### Rebase mode inputs

| Input | Default | Description |
|-------|---------|-------------|
| `rebase-stale-siblings` | `false` | Also refresh open translation PRs that do **not** overlap the merged PR, so their checks re-run against the new base. No re-translation and no model calls — the branch is merged forward, nothing else. |

`rebase-stale-siblings` exists for **drift-recovery waves**. `translate forward --github` opens one PR per lecture, and each PR touches only that lecture and its own state file — so no two siblings ever overlap, none are conflict-rebased, and every merge leaves the rest of the wave stale. Enabling this keeps them current.

It is off by default because the cost scales with the wave: with 60 open PRs, every merge refreshes up to 59 branches and re-runs their checks. Turn it on while a wave is in flight, and off again afterwards.

**Token caveat — this applies to all of rebase mode, not just the new input.** Commits pushed with the default `GITHUB_TOKEN` do not trigger workflows (GitHub's recursion guard), so a branch rebased or refreshed with it gets its new commit but **no CI runs on it** — verified live on the test harness, where 13 force-push rebased PRs ended with zero check runs on their new heads. If the goal is re-run checks (it usually is), pass a PAT or GitHub App token as `github-token` in the rebase workflow, exactly as the sync workflows already do with the machine-user PAT. With required status checks, a `GITHUB_TOKEN` refresh is worse than nothing: the PR goes from stale-but-green to a head with no runs at all, which blocks merging until someone triggers checks by hand.

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
| `review-recommendation` | Categorical routing recommendation: `auto-merge` or `editor` (verdict v2) |
| `reviewed-head-sha` | Head SHA the verdict was computed against |
| `would-auto-merge` | Shadow-gate decision (`true`/`false`); only set when `auto-merge-mode: shadow` |

## Workflow examples

### Basic sync (single language)

```yaml
name: Sync Translations

on:
  pull_request:
    types: [closed]
    branches: [main]
    paths:
      - 'lectures/**/*.md'
      - '_toc.yml'
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
       startsWith(github.event.comment.body, '\translate-resync') &&
       contains(fromJSON('["OWNER", "MEMBER", "COLLABORATOR"]'), github.event.comment.author_association))
    runs-on: ubuntu-latest

    # The action authenticates with TRANSLATION_PAT; the ambient GITHUB_TOKEN
    # is unused beyond checkout, so keep it read-only.
    permissions:
      contents: read

    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 2

      - uses: QuantEcon/action-translation@v0
        with:
          mode: sync
          target-repo: 'QuantEcon/lecture-intro.zh-cn'
          target-language: 'zh-cn'
          docs-folder: 'lectures/'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.TRANSLATION_PAT }}
```

The `issue_comment` trigger enables the `\translate-resync` command — comment it on any merged PR to retry a failed sync. The command must start the comment (both the workflow gate and the action check for it there — a comment merely mentioning it mid-text does nothing). To retrigger only one language, add the language code: `\translate-resync fa` or `\translate-resync zh-cn`. Bare `\translate-resync` retriggers all languages.

**The four conditions on that clause are load-bearing.** `issue_comment` workflows run in default-branch context with full access to secrets, and GitHub cannot filter the event by comment body at the trigger level — so the `if:` is the only gate. It checks that the comment is on a **pull request** (`github.event.issue.pull_request`; plain issues raise the same event), that it carries the command, and that its author is an `OWNER`, `MEMBER` or `COLLABORATOR`. Without the last one, any GitHub account can spend your Anthropic credits by commenting on a merged PR. `CONTRIBUTOR` — anyone with one merged PR — is deliberately excluded, and the action enforces the same set internally, so widening the workflow alone would only buy a run that no-ops. `permissions: contents: read` completes the picture: the action authenticates to the target repo with `TRANSLATION_PAT`, so the ambient `GITHUB_TOKEN` never needs write.

**`branches: [main]` is the other half of the trigger.** `pull_request: types: [closed]` fires for a PR closed against *any* base branch, and `github.event.pull_request.merged` says nothing about which branch it merged into — so without the filter a PR merged into a long-lived work branch (a theme migration, a lecture rewrite in progress) is forwarded to every target repo as if it had been published. The action checks too: a merged PR whose base is not the repository's default branch is skipped, on the `pull_request` path and on `\translate-resync` (an `issue_comment` trigger cannot carry a branch filter). If your default branch is not `main`, change the filter to match; the action's check follows the repository setting.

### Multi-language sync

Use separate jobs for each target language. They run in parallel and create independent PRs:

```yaml
name: Sync Translations

on:
  pull_request:
    types: [closed]
    branches: [main]
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
       startsWith(github.event.comment.body, '\translate-resync') &&
       contains(fromJSON('["OWNER", "MEMBER", "COLLABORATOR"]'), github.event.comment.author_association))
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 2
      - uses: QuantEcon/action-translation@v0
        with:
          mode: sync
          target-repo: 'QuantEcon/lecture-intro.zh-cn'
          target-language: 'zh-cn'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.TRANSLATION_PAT }}

  sync-to-farsi:
    if: >
      (github.event_name == 'pull_request' && github.event.pull_request.merged == true) ||
      (github.event_name == 'issue_comment' &&
       github.event.issue.pull_request &&
       startsWith(github.event.comment.body, '\translate-resync') &&
       contains(fromJSON('["OWNER", "MEMBER", "COLLABORATOR"]'), github.event.comment.author_association))
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 2
      - uses: QuantEcon/action-translation@v0
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
    types: [opened, synchronize, labeled, reopened]

jobs:
  review:
    # `labeled` matters: the sync applies its labels after opening the PR.
    # The second clause ignores `labeled` events for every other label.
    if: >
      contains(github.event.pull_request.labels.*.name, 'action-translation') &&
      (github.event.action != 'labeled' || github.event.label.name == 'action-translation')
    runs-on: ubuntu-latest

    permissions:
      contents: read
      pull-requests: write

    # One review per PR — supersede an in-flight review instead of running both
    concurrency:
      group: review-translations-${{ github.event.pull_request.number }}
      cancel-in-progress: true

    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 2

      - uses: QuantEcon/action-translation@v0
        with:
          mode: review
          source-repo: 'QuantEcon/lecture-python-intro'
          source-language: 'en'
          docs-folder: 'lectures/'
          max-suggestions: 5
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Using outputs

```yaml
- uses: QuantEcon/action-translation@v0
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

When a PR is merged into the default branch, sync mode:

1. **Identifies changed files** — Compares the PR's diff against the docs folder pattern
2. **Checks scope** — Under `sync-scope: existing` only: keeps a changed or renamed lecture only if the edition has both its state file and the lecture, before any content is fetched. If nothing is left to sync, the run ends here with a job summary and no PR: it passes if every check succeeded, and otherwise fails and opens the failure issue (see [Partial editions](#partial-editions))
3. **Classifies each file** — New file (full translation) or existing file (section-level update)
4. **Parses sections** — Splits documents at `##` headings using a stack-based parser
5. **Detects section changes** — Compares old and new source to find which sections differ
6. **Translates changed sections** — Sends only modified sections to Claude (UPDATE mode)
7. **Reconstructs the document** — Merges translated sections back with unchanged content
8. **Updates heading-map** — Refreshes the section ID mapping in the target frontmatter
9. **Creates a PR** — Commits all updated files to a branch in the target repo
10. **Posts a success comment** — Confirms sync completion on the source PR with a link to the translation PR

If any files fail to process, the action opens a GitHub Issue with error details and a link to the source PR. Comment `\translate-resync` on the merged PR to retry all languages, or `\translate-resync fa` to retry a specific language.

For new files, the entire document is translated in a single call (NEW mode). Under `sync-scope: existing` this never happens: a lecture is in scope only if the edition already has it.

## Partial editions

A partial edition takes lectures one reviewed PR at a time, so the source has lectures the edition does not have yet. Under the default `sync-scope: all`, a source PR that changes one of them has it translated from scratch in the sync PR. Set `sync-scope: existing` on the edition's sync job to sync only the lectures the edition already has:

```yaml
- uses: QuantEcon/action-translation@v0
  with:
    mode: sync
    target-repo: 'QuantEcon/lecture-python-programming.ml'
    target-language: 'ml'
    sync-scope: existing
    # ... other inputs
```

**What is in scope.** A changed lecture syncs only when the edition's default branch has its state file, `.translate/state/<path>.yml`, with `<path>` relative to `docs-folder`: `lectures/cobweb.md` needs `.translate/state/cobweb.md.yml`, and `lectures/_admonition/gpu.md` needs `.translate/state/_admonition/gpu.md.yml`. A renamed lecture is decided by its previous path. `translate init` writes the state file with the lecture, so a lecture joins sync when the PR that adds it, state file included, merges. A lecture new to the source is out of scope, since the edition has no state file for it. The run checks only that the state file exists, not what it says.

A lecture's `.md` file is not enough. `QuantEcon/lecture-python-programming.ml` carries English copies of `intro.md` and `_admonition/gpu.md`, and syncing them would turn an English change into a half-translated page; with no state files, they stay out of scope. By the same rule, an edition with no state files syncs no lecture under `existing`. Before an edition switches to `existing`, every lecture it has translated needs a state file, and no other lecture should have one (see [Bootstrapping existing projects](cli-reference.md#bootstrapping-existing-projects)).

**How a scoped run behaves.**

- Each changed or renamed lecture is checked before any of its content is fetched, so one out of scope costs a request or two and no model call.
- Only a 404 counts as absent. Any other read error leaves that lecture's scope unknown, and the lecture is neither synced nor skipped: the run fails and opens the failure issue, and the job summary lists the error under **Scope unknown**. The lectures the run could check still sync, in a PR as usual. If a later read fails as well, as the bibliography check's read of the edition's `_config.yml` can, the run stops at that read instead: no PR, no failure issue and no job summary, and both errors are only in the run's log.
- Before checking any lecture, the run reads the edition itself. GitHub also answers 404 for a repository the token cannot see, so without this read a `target-repo` that names no repository the token can see (a misspelt name, or a token without access) would pass with every lecture skipped. If the read fails, the run syncs nothing, not even a `_toc.yml` change or a removal, since an edition it cannot read can take no change. It fails at once and opens the failure issue, and the job summary lists the error under **Scope unknown**.
- Removals are not scoped: a lecture deleted upstream is deleted from the edition, with its state file, as under `all`. When a rename comes with a large rewrite, GitHub can report it as a removal plus an addition instead: the removal then deletes the edition's lecture and its state file, and the addition is out of scope. Add the lecture back at its new path in a reviewed PR.
- A rename is scoped by its previous path. When the edition has no state file there, as for an English copy, the rename is skipped: the edition keeps the file under its old name, and when the source PR also changes `_toc.yml`, as a rename usually does, the mirrored ToC drops the old name's entry, leaving the file outside the ToC. Move or remove it by hand.
- `_toc.yml` is not scoped either. It is mirrored from the source with the edition's translated part captions kept, as under `all`, so it lists lectures the edition does not have yet. A partial edition prunes it at build time (the Malayalam edition runs `scripts/prune_toc.py`).
- Lectures the edition does not have yet are listed under **Lectures Not Synced** in the PR body, when there is one, and in the job summary on the workflow run's page. They are not in the PR's metadata `files`, which names what the PR delivers, and the comment on the source PR does not mention them.
- When nothing is left to sync (no lecture in scope, no `_toc.yml` change, no removal) and every check succeeded, the run passes without a PR, a new failure issue or a comment on the source PR, and its job summary lists what it skipped. If an earlier run opened a failure issue for the same PR and language, for example after a failed scope read, this run closes it, with a comment that links the run. A scoped run that gets past the scope check and passes without a PR, because it had nothing to deliver, does the same. Runs that end before the scope check (a PR with no docs changes, or a resync aimed at another language) close nothing, and under `all` only a run that opens its translation PR without errors closes the issue.
- A lecture is never translated from scratch. If its state file exists but its `.md` does not, it is skipped with a warning and listed under **State File Without a Lecture**: restore the lecture, or remove the state file. If the content of a lecture in scope cannot be read, the run fails.

**Known gap.** An English change that merges after a lecture is drafted (`translate init`) and before its PR merges does not reach that lecture: the lecture is out of scope until its PR merges. `translate init` records the English commit the draft was made from, so a check before merging catches such a change: run `translate status -f <file>` with the edition's clone on the PR's branch, and both clones up to date. `OUTDATED` means the PR should carry the change. Once the change is committed, record the new English commit in the lecture's state file: run the same check with `--write-state --carried`, and with the edition's own `-l` and `-d`, because that run rewrites `.translate/config.yml` from its flags. `--carried` confirms that the PR carries every English change since the commit the state file records. Without it, `--write-state` refuses, and lists the English commits since that one, or says that commit is not in the local source clone. Restore `.translate/config.yml` if the run changed it, commit the state file to the PR, and run the check again: it should now read `ALIGNED`. [Tutorial: Fresh Setup](tutorials/fresh-setup.md#one-reviewed-lecture-at-a-time) walks through it. A rename opens the same gap: until the rename's sync PR merges, the edition's state file is under the old name, so a change to the lecture at its new path is not synced. Once that PR merges, `translate status -f <new name>` reports the lecture `OUTDATED`.

**The input is temporary.** `sync-scope` retires once three things land: sync never first-translates a lecture the edition lacks ([#259](https://github.com/QuantEcon/action-translation/issues/259)); one `_toc.yml` rule for every edition, under which the committed ToC lists the lectures that have a state file and those the PR delivers, and `translate init` inserts a new lecture's entry ([#259](https://github.com/QuantEcon/action-translation/issues/259), [#142](https://github.com/QuantEcon/action-translation/issues/142)); and a check that fails any lecture in the edition that has no state file. As ruled on 2026-10-19, that check runs in each syncing edition's CI and fails on a `.md` in the docs folder, subfolders included, that has no state file and is not a declared exception (such as an English copy), on a declared exception that has one, on a state file with no lecture, and on an unreadable state file ([#370](https://github.com/QuantEcon/action-translation/issues/370)); today `translate doctor` only warns about a missing state file, and only for top-level lectures. State-aware sync is then every edition's only behaviour, and an edition with a state file for every lecture loses nothing. An edition that completes before then stays on `existing`: there is no switch back to `all`.

## Claude model selection

The default model is `claude-sonnet-5`, which provides excellent translation quality at reasonable cost. Options:

| Model | Cost | Best for |
|-------|------|----------|
| `claude-sonnet-5` | ~$0.06/file | Daily sync operations (recommended) |
| `claude-opus-4-8` | ~$0.10/file | High-stakes translations needing maximum quality |
| `claude-haiku-4-5` | ~$0.02/file | Budget-conscious bulk operations |

Costs are approximate and based on Sonnet 5 standard pricing ($3 / $15 per M input/output tokens); the introductory rate ($2 / $10 per M through 2026-08-31) runs ~13% lower. Sonnet 5's tokenizer produces ~30% more tokens than Sonnet 4.6 for the same text, which is already reflected above.

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

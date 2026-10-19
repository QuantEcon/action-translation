---
title: FAQ
---

# Frequently Asked Questions

## General

### What file formats does the action support?

Only MyST Markdown (`.md`) files. The parser is specifically designed for MyST Markdown with its directives, roles, math blocks, and code cells. It does not process Jupyter notebooks, reStructuredText, or other formats.

### What languages are supported?

The GitHub Action supports the configured languages only — the target languages are currently Chinese (`zh-cn`), Farsi (`fa`), French (`fr`), and Malayalam (`ml`), each with language rules and a glossary, and `en` is configured as the source language (it passes validation too) — anything else is rejected as `target-language` before any work happens. The CLI accepts any language code, using Claude's general translation ability with no language-specific rules for unconfigured codes. Adding a language to the Action means adding a `LANGUAGE_CONFIGS` entry (see [Language configuration](language-config.md)).

### How much does it cost to run?

Costs depend on document size and the Claude model used. With `claude-sonnet-5` at standard pricing ($3 / $15 per M input/output tokens; ~13% lower during the introductory rate through 2026-08-31):
- **Sync mode** (per PR): ~$0.06–0.25 depending on how many sections changed
- **Backward analysis** (51 files): ~$1.10 total
- **Forward resync** (per file): ~$0.16–0.22

Use `--dry-run` with CLI commands to preview what would be done without making API calls.

### Is an Anthropic API key required?

Yes, for any operation that involves translation or analysis. The `status` CLI command and `review` command (which reads existing reports) do not require an API key.

## Sync mode

### Why did the action create a PR with no changes?

This can happen if:
- The merged PR changed files outside the `docs-folder` pattern
- The changed files were not `.md` files
- The translation of the changed sections is identical to what was already in the target

### Does sync run for PRs merged into branches other than `main`?

No. The workflow's `branches: [main]` filter stops the run before it starts, and the action itself skips a merged PR whose base branch is not the repository's default branch — the `\translate-resync` comment path included. A long-lived work branch (a theme migration, a rewrite in progress) is not a publication, so merging into it must not open translation PRs. If your sync workflow predates the filter, add `branches: [main]` under `pull_request:`; the action's check covers the gap until you do.

### The action created a PR but some sections weren't translated

Check that:
1. The changed sections are detected correctly — the action compares the PR's base and head for each file
2. The heading-map in the target file is up to date (see [Heading Maps](heading-maps.md))
3. The document structure hasn't diverged significantly between source and target

### Can I retrigger the action for a specific PR?

Yes. Comment `\translate-resync` on the **merged** PR in the source repo. The workflow will re-run the sync for that PR's changed files.

To retrigger only a specific language, add the language code:

```
\translate-resync fa        # retrigger Farsi only
\translate-resync zh-cn     # retrigger Chinese only
\translate-resync            # retrigger all languages (default)
```

Requirements:
- The workflow must include the `issue_comment` trigger (see [Action Reference](action-reference.md) for the YAML)
- The comment must be on a pull request, not a plain issue — GitHub raises `issue_comment` for both
- You must be an `OWNER`, `MEMBER` or `COLLABORATOR` of the source repo. A resync run spends Anthropic credits and uses the target-repo PAT, so comments from anyone else are ignored — at the workflow level (no job starts) and again inside the action. `CONTRIBUTOR` (anyone with one merged PR) is deliberately not enough
- The PR must be merged (resync on open PRs is ignored)
- The comment body must start with `\translate-resync`
- The language code (if provided) must match a supported language; unsupported values are ignored with a warning and fall back to all-language resync

For drift recovery beyond a single PR, use the CLI `forward` command instead — it works on any file regardless of PR history.

### What happens when the sync workflow fails?

When the sync workflow encounters an error (API failure, parsing error, etc.), it automatically opens a **GitHub Issue** in the source repository with:
- The title `Translation sync failed for PR #N (language)`
- A list of errors encountered
- Recovery instructions including the `\translate-resync` command
- The label `translation-sync-failure`

To recover, fix the underlying issue and comment `\translate-resync` on the original merged PR. To retry only a specific language, use `\translate-resync zh-cn` or `\translate-resync fa`.

### Does the action post any status updates?

Yes. On successful sync, the action posts a **confirmation comment** on the source PR with:
- A link to the translation PR in the target repo
- A list of translated files

This gives visibility to the PR author and reviewers that the translation was created. Under `sync-scope: existing`, a run left with nothing to sync posts no comment; its job summary lists what it skipped.

:::{note}
Because success comments are posted via the GitHub API on the source PR, they trigger the `issue_comment` event again. This causes the sync workflows to start, but the `if:` condition correctly skips them (the comment body doesn't start with `\translate-resync`). These skipped runs use no compute and complete in ~1 second. This is a known GitHub Actions limitation — `issue_comment` cannot filter by comment body at the trigger level.
:::

### Can an edition sync only the lectures it has reviewed?

Yes. Set `sync-scope: existing`, a temporary input, on the edition's sync job. A changed lecture then syncs only when the edition has its state file, `.translate/state/<file>.yml`, on its default branch. `translate init` writes one with each lecture, so a lecture joins sync when the PR that adds it, state file included, merges. Other changed lectures are skipped before any model call and never translated from scratch. See [Partial editions](action-reference.md#partial-editions), which also says when the input retires, and [Tutorial: Fresh Setup](tutorials/fresh-setup.md#one-reviewed-lecture-at-a-time) for adding lectures one at a time.

### What does "Lectures Not Synced" in a sync PR mean?

The edition syncs with `sync-scope: existing`, and the source PR also changed lectures the edition does not have yet: there is no state file for them under `.translate/state/`. They were skipped, not translated, and are left out of the PR's metadata.

Nothing needs doing for a lecture nobody has drafted for the edition yet: it joins sync when the PR that adds it merges. A lecture that has been drafted but whose PR has not merged is another matter: its PR must carry this change before it merges, because sync will not. Run `translate status -f <file>` on that PR's branch to check (see the known gap under [Partial editions](action-reference.md#partial-editions)).

A lecture listed under **State File Without a Lecture** needs fixing: the edition has its state file but not the lecture. Restore the lecture, or remove its state file.

### Why did a changed lecture get no sync PR?

Under `sync-scope: existing`, this happens when the lecture is out of scope and the run has nothing else to sync (no `_toc.yml` change, no removal). Such a run passes without a PR, a failure issue or a comment on the source PR; its job summary, on the workflow run's page, lists each skipped lecture and why.

If the edition does have the lecture, check that:

- Its state file is on the edition's default branch. `translate init` does not fail when it cannot write one.
- Its PR merged before the change did. A lecture is out of scope until then, so a change that merges after the lecture is drafted and before its PR merges must be carried in that PR (see the known gap under [Partial editions](action-reference.md#partial-editions)).
- It was not renamed in a sync PR that is still open. Until that PR merges, the edition's state file is under the old name, so a change to the lecture at its new path is not synced. Once it merges, `translate status -f <new name>` reports the lecture `OUTDATED`.

An error in the scope check is not a skip: the run fails and opens a failure issue, and its job summary lists the error under **Scope unknown**. (An in-scope lecture whose content then cannot be read fails the run too; that error is in the failure issue and the log.) If the run cannot read the edition at all, as with a `target-repo` that names no repository the token can see, it syncs nothing, not even a `_toc.yml` change or a removal. If it cannot tell whether a lecture is in scope, the lectures it could check still sync; should a later read fail as well, the run stops at that read, and both errors are only in its log.

### How do I add a new language?

1. Create a target repository (e.g., `your-repo.ja` for Japanese)
2. Add a workflow file in the source repo for the new language
3. Optionally add a glossary at `glossary/ja.json`
4. Optionally add language rules in `src/language-config.ts`

See [Language Configuration](language-config.md) for details.

### Why did the translated section captions in `_toc.yml` revert to English after a sync?

They should no longer. A sync mirrors the source `_toc.yml` so that lecture additions, removals and reorderings propagate, and in v0.29.3 and earlier it mirrored the part captions too, overwriting whatever the edition had translated — silently, because English captions build fine and review mode never looks at the TOC. The sync now reads the target's current `_toc.yml` and carries each part's translated caption forward, matching parts by the lectures they contain rather than by name or position, so a part that gains or loses a lecture keeps its caption. Only the caption lines change; the rest of the TOC is byte-identical to the source, unless the same run failed to deliver a new lecture, whose entry is also removed (see *A sync PR says some files "failed to translate"* below).

Two cases still land in English, both on purpose. A **new part** — one sharing no lectures with any part in the target — arrives with its source caption, and the run log warns `has no counterpart in the target TOC`; translate it in the sync PR before merging. A part whose caption was **never translated** (byte-identical to the source in the target already) stays that way and is logged as `not localised`; that is the state to fix once in the edition, after which every later sync preserves it.

### How do I add content to a translated edition that isn't in the source?

Put it in a **target-only file** — a new `.md` file in the target repo's docs folder, added to the target's `_toc.yml`. Sync only ever touches files that exist in the source, so a target-only file is never modified, resynced, or removed by automation. The `status` command lists such files as `TARGET_ONLY` so they stay visible.

Do **not** add extra sections inside a synced file. The sync mirrors the source document's structure, so a section that has no counterpart in the source is removed on the next sync of that file. The removal is deliberate — it is how upstream deletions propagate — and the sync PR lists every removed target-only section under "Target-Only Sections Removed" so a reviewer can catch the case where the content was human-authored. If that happens, restore the content into a target-only file and merge the sync.

If the addition is an *improvement to existing content* rather than new material, consider contributing it to the source repository instead (`translate backward` helps capture such improvements) — then every language edition benefits and the sync carries it back to yours.

### A sync PR says some files "failed to translate" — is the PR safe to merge?

Yes, as far as the build goes. When a _new_ lecture in the source PR cannot be delivered (most often the structural-parity guard refusing a translation whose directive sequence came back scrambled, sometimes a failed content fetch), the sync PR is opened without it and lists it under **Files Failed to Translate**. The lecture's `_toc.yml` entry is removed from the same PR so the target builds cleanly, and the removal takes out only that entry's lines — nothing else in the TOC changes because of it (the translated part captions are still carried forward as usual). The entry comes back with the file when a later rebase delivers it; the machine-readable metadata block still declares the file for exactly that reason.

Read the notice's second sentence carefully. If it names the TOC the entry was removed from, the PR is self-consistent. If it says _no `_toc.yml` was part of this sync_, nothing was removed because nothing needed to be in this changeset — but the target's existing TOC may already list the file (for example, from a concurrent sync that mirrored the whole source TOC), and the build will fail until the file arrives. The failure issue opened on the source repository carries the error details and the recovery steps.

Only new files are ever removed from the TOC. A lecture that already exists in the target and merely failed to _update_ keeps its entry — the previous translation is still there and still correct to link.

### The `forward` command changed too many lines

The RESYNC translation mode is designed to preserve existing style and only change what's needed. However, Claude may occasionally rephrase sections unnecessarily.

Mitigation:
- Review changes with `git diff` before committing
- Use `git restore .` to undo all changes
- Use `git restore <file>` to undo specific files
- Use `git add -p` to stage only the changes you want

### The `backward` command found no suggestions

This is expected for well-maintained translations. The backward analysis is designed to find rare improvements (typically 5–10% of files have actionable suggestions). If you recently ran a full sync, most files will be in sync.

### What's the difference between `forward` and the sync Action?

| Aspect | Sync Action | Forward CLI |
|--------|------------|-------------|
| **Trigger** | PR merged into the default branch | Manual command |
| **Change signal** | Git diff from PR | Whole-document comparison |
| **Translation mode** | UPDATE (section-level) | RESYNC (whole-file) |
| **Scope** | Files changed in that PR (under `sync-scope: existing`, only lectures with a state file in the edition) | Any drifted files |
| **Output** | PR in target repo | Local file update (or PR with `--github`) |
| **Use case** | Ongoing maintenance | Drift recovery, onboarding |

### I get "ANTHROPIC_API_KEY not set" errors

Set the environment variable before running CLI commands:

```bash
export ANTHROPIC_API_KEY=your-key-here
```

Or use `--test` for development without API calls.

## Heading maps

### My heading map is missing or incomplete

The `status` command reports missing heading maps. To fix:
1. Run `npx translate forward -f <file>` to regenerate the translation (heading map is included automatically)
2. Or manually add the heading-map to the target file's frontmatter (see [Heading Maps](heading-maps.md))

### I changed a heading in the translation — do I need to update the heading map?

Yes. The `translation.headings` value must exactly match the heading text in the document. If you change `## 介绍` to `## 引言`, update the entry:

```yaml
translation:
  headings:
    Introduction: "引言"  # was "介绍"
```

## Troubleshooting

### API rate limits

If you hit Anthropic rate limits during bulk operations, the system automatically retries with exponential backoff (3 attempts: 1s, 2s, 4s delays). For the CLI, the 5-way parallel processing is designed to stay under typical rate limits.

### Large documents fail

Very large documents (30K+ tokens per side) may exceed Claude's context window. The action reports these as `SKIPPED_TOO_LARGE`. Consider:
- Splitting large documents into smaller files
- Using a model with a larger context window

### The `gh` CLI is not found

The `review` command's Issue creation requires the GitHub CLI (`gh`). Install it:

```bash
# macOS
brew install gh

# Then authenticate
gh auth login
```

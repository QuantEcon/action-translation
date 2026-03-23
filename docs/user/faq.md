---
title: FAQ
---

# Frequently Asked Questions

## General

### What file formats does the action support?

Only MyST Markdown (`.md`) files. The parser is specifically designed for MyST Markdown with its directives, roles, math blocks, and code cells. It does not process Jupyter notebooks, reStructuredText, or other formats.

### What languages are supported?

Any language can be used as a target. The `target-language` input accepts any language code. Chinese (`zh-cn`) and Farsi (`fa`) have pre-configured rules and glossaries. Other languages work with Claude's general translation ability.

### How much does it cost to run?

Costs depend on document size and the Claude model used. With `claude-sonnet-4-6`:
- **Sync mode** (per PR): ~$0.05–0.20 depending on how many sections changed
- **Backward analysis** (51 files): ~$0.85 total
- **Forward resync** (per file): ~$0.12–0.17

Use `--dry-run` with CLI commands to preview what would be done without making API calls.

### Is an Anthropic API key required?

Yes, for any operation that involves translation or analysis. The `status` CLI command and `review` command (which reads existing reports) do not require an API key.

## Sync mode

### Why did the action create a PR with no changes?

This can happen if:
- The merged PR changed files outside the `docs-folder` pattern
- The changed files were not `.md` files
- The translation of the changed sections is identical to what was already in the target

### The action created a PR but some sections weren't translated

Check that:
1. The changed sections are detected correctly — the action compares the PR's base and head for each file
2. The heading-map in the target file is up to date (see [Heading Maps](heading-maps.md))
3. The document structure hasn't diverged significantly between source and target

### Can I retrigger the action for a specific PR?

Yes. Comment `\translate-resync` on the **merged** PR in the source repo. The workflow will re-run the sync for that PR's changed files.

Requirements:
- The workflow must include the `issue_comment` trigger (see [Action Reference](action-reference.md) for the YAML)
- The PR must be merged (resync on open PRs is ignored)
- The comment body must start with `\translate-resync`

For drift recovery beyond a single PR, use the CLI `forward` command instead — it works on any file regardless of PR history.

### What happens when the sync workflow fails?

When the sync workflow encounters an error (API failure, parsing error, etc.), it automatically opens a **GitHub Issue** in the source repository with:
- The title `Translation sync failed for PR #N (language)`
- A list of errors encountered
- Recovery instructions including the `\translate-resync` command
- The label `translation-sync-failure`

To recover, fix the underlying issue and comment `\translate-resync` on the original merged PR.

### Does the action post any status updates?

Yes. On successful sync, the action posts a **confirmation comment** on the source PR with:
- A link to the translation PR in the target repo
- A list of translated files

This gives visibility to the PR author and reviewers that the translation was created.

:::{note}
Because success comments are posted via the GitHub API on the source PR, they trigger the `issue_comment` event again. This causes the sync workflows to start, but the `if:` condition correctly skips them (the comment body doesn't contain `\translate-resync`). These skipped runs use no compute and complete in ~1 second. This is a known GitHub Actions limitation — `issue_comment` cannot filter by comment body at the trigger level.
:::

### How do I add a new language?

1. Create a target repository (e.g., `your-repo.ja` for Japanese)
2. Add a workflow file in the source repo for the new language
3. Optionally add a glossary at `glossary/ja.json`
4. Optionally add language rules in `src/language-config.ts`

See [Language Configuration](language-config.md) for details.

## CLI tool

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
| **Trigger** | PR merge event | Manual command |
| **Change signal** | Git diff from PR | Whole-document comparison |
| **Translation mode** | UPDATE (section-level) | RESYNC (whole-file) |
| **Scope** | Files changed in that PR | Any drifted files |
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

Yes. The heading-map value must exactly match the heading text in the document. If you change `## 介绍` to `## 引言`, update the heading-map entry:

```yaml
heading-map:
  introduction: "引言"  # was "介绍"
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

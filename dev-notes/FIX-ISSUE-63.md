# Fix: Translation sync PR conflicts (Issue #63)

**Issue**: [#63 — Translation sync PRs conflict when multiple upstream PRs modify the same file — 62% failure rate](https://github.com/QuantEcon/action-translation/issues/63)

---

## Root Cause

Each translation PR produces a **full file replacement**. When `file-processor.ts` runs `processSectionBased()`, it:
1. Translates only **changed** sections (via Claude)
2. Copies **unchanged** sections verbatim from target repo's `main`
3. Reconstructs the **entire file** from these components

When two upstream PRs (A, B) both touch the same file:
- Translation PR X (from A) and PR Y (from B) are each generated against the **same target `main`**
- Both PRs contain the full file, each with their own translated sections + shared unchanged sections
- When X merges, the file on `main` changes substantially
- Y's version of the unchanged sections is now stale → three-way merge fails

This is fundamentally different from typical code conflicts where small localized changes can often auto-merge. Translation PRs replace large blocks of text, making three-way merge almost always impossible.

---

## Recommended Solution: Rebase-on-Merge

Inspired by Dependabot's default `rebase-strategy`, which automatically rebases open PRs when conflicts are detected after a push to the target branch.

### Key Insight

Re-generating a translation PR against an updated `main` is cheap:
- **Sections changed by PR Y**: Same source diff → same translation. Can be cached from the first run, or costs one Claude API call per section at worst.
- **Sections NOT changed by PR Y**: Simply copied from the new target `main` — free, and this is exactly what eliminates the conflict.
- **In the common case** where PRs X and Y modify *different sections* of the same file: **zero Claude API calls** needed for the rebase.

### Will Rebase-on-Merge Ever Fail With Merge Conflicts?

**No**, as long as each merge triggers a rebase and the rebase completes before the next PR is merged. Here's the proof by tracing through the same scenario from the issue:

Given upstream PRs A, B, C all touching `file.md`, creating translation PRs X, Y, Z:

```
1. X merges → triggers rebase of Y, Z
   - Y regenerated against post-X main → clean
   - Z regenerated against post-X main → clean

2. Y merges → triggers rebase of Z
   - Z regenerated against post-X+Y main → clean

3. Z merges → no remaining PRs → done
```

**Order doesn't matter either.** If Z merges first:
```
1. Z merges → rebase X, Y against post-Z main → both clean
2. X merges → rebase Y against post-Z+X main → clean
3. Y merges → done
```

This works because each rebase **regenerates the full file** against current `main`. There is no accumulation of stale state.

**The only theoretical failure mode** is a race condition: two PRs merged within seconds of each other before the rebase workflow completes. But even this self-heals — the second merge triggers another rebase of any remaining PRs. The system is **eventually consistent** and **idempotent**. Since merging is a human action (review → approve → merge), there is always ample time for the rebase workflow to complete (<1 minute typically).

### Architecture

```
Target repo: translation-sync PR merged
        │
        ▼
Workflow fires (pull_request.closed + merged)
        │
        ▼
Find other open translation-sync PRs
        │
        ▼
For each PR touching the same files:
  1. Read source PR metadata from PR body (repo, PR#, commit SHA)
  2. Fetch source content at original commit SHA
  3. Fetch UPDATED target main (post-merge)
  4. Re-run SyncOrchestrator pipeline
  5. Force-push result to existing PR branch
  6. Comment: "♻️ Rebased after #N was merged. Translations unchanged."
```

### Metadata Already Available

The PR body (built by `buildPrBody()` in `pr-creator.ts`) already contains:
- Source repo owner/name
- Source PR number (with link)
- Source/target language
- Claude model used
- List of files changed

**Needed additionally** (machine-readable format in PR body):
- Source commit SHA (the `merge_commit_sha` used during translation)
- Per-file source content hashes or the SHA references
- A structured metadata block (e.g., HTML comment with JSON) so the rebase mode can parse it reliably

### Branch Name Convention

Current: `translation-sync-{timestamp}-pr-{N}`

This prefix is already unique enough to identify translation sync PRs programmatically via the GitHub API.

---

## Implementation Plan

### Phase 1: Structured Metadata in PR Body

Embed machine-readable metadata in the PR body so the rebase mode can reconstruct the pipeline inputs:

```html
<!-- translation-sync-metadata
{
  "sourceRepo": "QuantEcon/lecture-python-programming",
  "sourcePR": 521,
  "sourceCommitSha": "abc123...",
  "sourceLanguage": "en",
  "targetLanguage": "fa",
  "claudeModel": "claude-sonnet-4-20250514",
  "files": [
    { "path": "lectures/numba.md", "sourceOldSha": "...", "sourceNewSha": "..." }
  ]
}
-->
```

This is a non-breaking change — existing PRs without metadata simply can't be rebased.

**Status**: ✅ Complete — commit `edefffb`

### Phase 2: Rebase Mode

New action mode `rebase` that runs in the **target repo** when a translation-sync PR is merged:

1. **List open translation-sync PRs** via GitHub API (filter by branch prefix `translation-sync-`)
2. **Check file overlap** — compare files touched by merged PR with each sibling PR's metadata
3. **Parse metadata** from each PR's body
4. **Re-run the sync pipeline** for conflicted PRs:
   - Fetch source file contents at the recorded commit SHA
   - Fetch updated target `main` content
   - Run `SyncOrchestrator.processFiles()` with the same inputs
   - Force-push the result to the existing PR branch (reset to main SHA, then commit)
5. **Post a comment** on the rebased PR explaining what happened

**Status**: ✅ Complete — commit `0eed2e3`

### Phase 3: Translation Cache (Optimization)

To ensure rebases cost zero Claude API calls in the common case:

- Store `targetBaseSha` (target repo's default branch SHA at PR creation) in the PR metadata
- Before resetting the branch during rebase, read previously translated files from the PR branch
- Also fetch old target content at `targetBaseSha` (the original baseline)
- Parse both into document components and compare section-by-section:
  - If a section's target content is unchanged since PR creation → cache hit → skip Claude call
  - If a section's target content changed (due to the merged PR) → cache miss → re-translate
- For added sections: use the heading map from the cached translation to match English→translated sections
- For title and intro: same comparison logic (old target vs current target)
- Graceful degradation: if cache parsing fails, falls through to normal re-translation

This makes rebase effectively free for PRs that modify different sections of the same file (the common case from issue #63).

**Status**: ✅ Complete — 7 new tests (999 total)

### Phase 4: Target Repo Workflow Template

Ready-to-use workflow template at `examples/rebase-translations.yml`:

```yaml
name: Rebase Translation PRs
on:
  pull_request:
    types: [closed]

jobs:
  rebase:
    if: >
      github.event.pull_request.merged == true &&
      startsWith(github.event.pull_request.head.ref, 'translation-sync-')
    runs-on: ubuntu-latest
    concurrency:
      group: rebase-translations
      cancel-in-progress: false
    steps:
      - uses: quantecon/action-translation@v0.15
        with:
          mode: rebase
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

Includes a `concurrency` group to prevent overlapping rebases from racing.

**Status**: ✅ Complete — `examples/rebase-translations.yml`

---

## Feature: Auto-Merge (Configurable)

Auto-merging high-quality translation PRs reduces editor overhead for the ~80-90% of translations that score well on review. This is built **after** rebase-on-merge, so it becomes a genuine workflow improvement rather than a conflict workaround.

**Why build both**: Rebase-on-merge solves the root cause (conflicts). Auto-merge solves a different problem (editor bottleneck). Without rebase-on-merge, auto-merge is a race condition — you're hoping to merge before the next sync fires. With rebase-on-merge in place, auto-merge becomes safe and purely a productivity feature.

### Configuration

This **must be a configurable option** that can be enabled/disabled per target repo:

```yaml
# In the target repo's workflow
- uses: QuantEcon/action-translation@v0.15
  with:
    mode: sync
    auto-merge: true                    # default: false
    auto-merge-quality-threshold: 9     # minimum review score (1-10, default: 9)
    auto-merge-labels: "auto-merged"    # label applied to auto-merged PRs
    auto-merge-digest: "weekly"         # digest frequency: "weekly" | "monthly" | "none" (default: "weekly")
    auto-merge-digest-assignees: "editor-username"  # GitHub users assigned to digest issues
```

### Behavior When Enabled

1. After sync creates the translation PR, the review mode runs automatically
2. If review score >= threshold AND no structural issues:
   - PR is approved and merged automatically
   - Label `auto-merged` is applied
3. If review score < threshold:
   - PR remains open for human review (normal flow)
   - Label `needs-review` is applied

### Digest Report (Accountability Layer)

A scheduled workflow generates periodic digest issues so editors can audit auto-merged translations without watching every PR:

**Trigger**: Scheduled workflow (cron), configurable as weekly or monthly.

**Digest issue contents**:
- Summary: "N translation PRs were auto-merged since the last report"
- Table of each auto-merged PR:
  - PR number + link
  - Source PR number + link
  - Files changed
  - Review score (overall + per-section breakdown)
  - Any review comments or warnings flagged by the automated reviewer
  - Link to the full review comment on the PR
- Assigned to the configured editor(s)
- Labelled `translation-digest`

**Example workflow for digest**:
```yaml
name: Translation Digest Report
on:
  schedule:
    - cron: '0 9 * * 1'  # Weekly, Monday 9am UTC

jobs:
  digest:
    runs-on: ubuntu-latest
    steps:
      - uses: QuantEcon/action-translation@v0.15
        with:
          mode: digest
          digest-period: weekly           # or "monthly"
          digest-assignees: "editor-username"
          target-repo-token: ${{ secrets.GITHUB_TOKEN }}
```

**Editor workflow**:
1. Editor receives the digest issue (weekly/monthly)
2. Reviews the summary table — most entries need no action
3. If something looks wrong, clicks through to the PR and its review comments
4. Comments on the digest issue to flag problems → can trigger a fix PR or `/translate-resync`
5. Closes the digest issue when satisfied

### Safeguards

- **Off by default** — repos must explicitly opt in
- **Score threshold is configurable** — conservative default of 9/10
- **Digest reports** — editors can retroactively flag issues on a comfortable cadence
- **Label tracking** — easy to find and audit auto-merged PRs via GitHub search
- **Structural issue veto** — heading misalignment, missing sections, etc. always block auto-merge regardless of score
- **Digest assignees** — ensures someone is accountable for reviewing the reports

---

## Comparison of Approaches

| Criterion | Rebase-on-merge | Auto-merge | Sequential queue | Batching |
|---|---|---|---|---|
| Preserves human review | ✅ Yes | ❌ No (bypassed) | ✅ Yes | ✅ Yes |
| No added latency | ✅ Yes | ✅ Yes | ❌ Queue depth | ❌ Time window |
| Per-PR provenance | ✅ Yes | ✅ Yes | ✅ Yes | ❌ Combined |
| Zero/low API cost | ✅ Section reuse | N/A | ❌ Re-translates | ✅ Yes |
| Handles rapid upstream | ✅ Yes | ✅ Yes | ❌ Slow | Partially |
| Complexity | Medium | Low | High | Medium |
| Solves root cause | ✅ Yes | ❌ Sidesteps it | ✅ Yes | Partially |

**Recommendation**: Build both features sequentially — rebase-on-merge first (solves the root cause), then auto-merge with digest reports (reduces editor overhead). Rebase-on-merge is the foundation; auto-merge is safe to deploy only once rebasing is reliable.

---

## Risks and Mitigations

### Force-push invalidates existing reviews
- **Mitigation**: Post a clear comment explaining only "copied from main" sections changed, not the translated content
- **Mitigation**: If the PR had an approved review, re-request review automatically
- **Mitigation**: The diff between old and new branch should be minimal — reviewers can verify quickly

### Race condition on rapid sequential merges
- **Mitigation**: The system is idempotent — each merge triggers a rebase, so the system self-heals
- **Mitigation**: Add a de-bounce mechanism (e.g., workflow concurrency group per file) to avoid redundant rebases

### Source PR metadata missing (pre-existing PRs)
- **Mitigation**: PRs without structured metadata are skipped with a comment: "Unable to rebase — metadata not found. Use `/translate-resync` to recreate."
- **Mitigation**: All new PRs will include metadata going forward

### Claude API cost during rebase
- **Mitigation**: Phase 3 translation cache eliminates API calls for the common case (different sections modified)
- **Mitigation**: Rebase only processes conflicted PRs, not all open PRs

---

## Implementation Sequence

### Stage 1: Fix the Root Cause (Rebase-on-Merge) — ✅ Complete

1. **Phase 1**: ✅ Structured metadata in PR body — `sourceCommitSha` + `targetBaseSha` + file list
2. **Phase 2**: ✅ Rebase mode — core solution, eliminates all merge conflicts
3. **Phase 3**: ✅ Translation cache — optimization, reduces API cost of rebases to near-zero
4. **Phase 4**: ✅ Rebase workflow template — ready-to-use YAML for target repos

### Stage 2: Workflow Automation (Auto-Merge + Digest)

Built **after** rebase-on-merge is stable and deployed. These are independent features that complement the fix.

5. **Phase 5**: Auto-merge mode — configurable, off by default, quality-gated
6. **Phase 6**: Digest report mode — scheduled workflow, generates periodic summary issues for editor review

Stage 2 depends on Stage 1 being complete. Without rebase-on-merge, auto-merge is a race condition. With it, auto-merge is a safe productivity feature.

# Rebase stops when `main` got a lecture first that the rebased PR's source change adds too

**Context**: `D-2026-11-15-rebase-decides-from-three-reads` read the baseline and the branch only
when `main` answered 404, and rebuilt any lecture `main` has as an update. Two translation PRs
can add the same lecture: a sync and a `\translate-resync` of one source PR, a copy pushed with
the CLI, or (as the issue put it) the syncs of two source PRs that both carry a lecture new to the
edition. Once one merges, rebase mode rebuilds
the other as an update of `main`'s copy (#467). The issue took the result to be a full-cost
re-translation that dropped the branch's reviewed translation. Ruled 2026-11-25 (@mmcky): fail
with a comment, matching #389's rule for a lecture whose history the rebase cannot reconcile.

The first build stopped every rebase of a lecture `main` has, the PR's baseline lacks and its
branch has. Its review then found two things:

- The premise does not hold. When the PR's source change adds the lecture, the English before
  the source commit is empty, and the update fails with a missing-title error from the section
  parser, before any model call and with the branch as it was. Nothing was re-translated; the
  operator got an error that named neither PR.
- The broad stop broke a rebase that worked. Source PR 1 adds `x.md`; source PR 2 edits one
  section of it before the edition merges PR 1's sync; under `sync-scope: all`, PR 2's sync
  carries `x.md` too. Once PR 1's sync merges, the earlier code rebased PR 2's as a stacked
  update: one model call for the edited section, the rest of `main`'s copy kept. The broad stop
  failed it, and its advice to keep `main`'s copy would have dropped PR 2's change.

**Decision**: The stop was therefore narrowed to the case where the PR's own source change adds
the lecture, so that there is nothing to diff against and two independent translations exist.
The narrowing was decided in the building session on the review's evidence, to be confirmed by
@mmcky at merge; it is not part of his ruling.

When `main` has the lecture and the PR records a baseline, rebase also reads it at the baseline.
When the baseline answers 404, or its read fails, the English at the source commit's parent
decides; the PR's branch is read only when the parent lacks the lecture and the baseline answered
404. The table gains these rows (`planRebaseRead` in `src/rebase-plan.ts`):

| `main` | Baseline | Source parent | Branch | Meaning | Rebase |
|---|---|---|---|---|---|
| 200 | 200 | | | The usual case | Updates the lecture, as before; the rebase cache reuses the baseline read |
| 200 | 404 | 200 | | The PR's source change edits a lecture the edition got since it opened | Updates `main`'s copy, as before: a stacked update |
| 200 | any other status | 200 | | The PR's source change edits the lecture; the baseline decides nothing here | Updates `main`'s copy without the rebase cache, as before this record, when the failed baseline read only meant a cache miss |
| 200 | 404 | 404 (or empty) | 200 | The PR's source change adds the lecture, and a PR merged since added it first | Fails before the branch moves, with no model call; the comment names the path and asks a person to decide which copy wins |
| 200 | 404 | 404 (or empty) | 404 | The PR never delivered it | Treated as an update of `main`'s copy, as before. With no English at the parent to diff against, that update fails with the missing-title error when the copy has a title, also as before; this record does not change it |
| 200 | any other status | 404 (or empty), or any other status | | The baseline would decide between the stop and an update | Fails, with the branch untouched |
| 200 | 404 | any other status, or 404 then any other status on the branch | | | Fails, with the branch untouched |
| 200, and the PR predates the cache | | | | No baseline to read | Updates, as before |

The other rows of the earlier table are unchanged. A rename is read under its old path on `main`
and at the baseline, and under its new path on the branch, as there. For the plan, a rename's
source parent is read at its **old** path, where the parent has the lecture. Read at the new path,
as the update's old English still is, it always answers 404 (#478), and a rename whose old path
`main` got since the PR opened would read as an addition: the stop's comment would claim that this
PR's source change adds the lecture too, and following its "keep `main`'s copy" would discard the
rename. Renames are therefore outside the stop: such a rename takes the update, exactly as before
this record, and then fails with the missing-title error, which is #478's to fix.

**Consequences**:

- The stop replaces the missing-title error with a comment that names the lecture; it does not
  save a re-translation, since none happened. The comment gives only the advice for this stop
  when nothing else in the PR failed: keep `main`'s copy (make the branch match it, or close the
  PR) or the PR's (resolve on the branch by hand). Regenerating with `translate forward`, or a
  resync, would make a third translation, so neither is offered.
- The stop depends on the baseline, the source parent and the branch having the lecture, not on
  what the branch's copy says, so a later rebase of the PR stops on it again until the PR
  merges or closes.
- In practice the stop is reached by a resync, or by a duplicate pushed with the CLI. Two source
  PRs that both add a lecture do not reach it: by the time the second is synced, its source
  commit's parent already has the lecture, so its rebase takes the stacked update.
- The source parent read follows `D-2026-11-15-only-a-404-means-absent` where it decides: a
  failed read there fails the rebase of that PR. Elsewhere a failed read of it still leaves the
  old English empty, as before. A failed baseline read is fatal only where the baseline decides
  (the parent lacks the lecture); beside a parent that has it, it costs the cache, as before.
- A failed read of `main`, the baseline, the source parent or the branch, where it decides, gets
  the advice to re-run the rebase workflow once it reads again, as an unread state file does,
  not the advice to regenerate the lecture.
- Reads: an ordinary update makes the same reads as before, in another order (the cache reuses
  the plan's baseline read). The stop makes the two edition reads the cache did. A stacked
  update makes one read fewer (the branch). A lecture `main` has that neither the baseline nor
  the branch has costs one read more (the cache stopped at the branch's 404), as does a renamed
  lecture still under its old path on `main` (its old path at the baseline). Such a rename whose
  baseline lacks the old path, or cannot be read, costs one source read more: the parent at the
  old path.

**Refs**: #467, #389, #351, #441, `D-2026-11-15-rebase-decides-from-three-reads`,
`D-2026-11-15-only-a-404-means-absent`.

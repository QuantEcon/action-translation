# Rebase stops when `main` got a lecture first that the rebased PR's source change adds too

**Context**: `D-2026-11-15-rebase-decides-from-three-reads` read the baseline and the branch only
when `main` answered 404, and rebuilt any lecture `main` has as an update. Two translation PRs
can add the same lecture: a sync and a `\translate-resync` of one source PR, or the syncs of two
source PRs that both carry a lecture new to the edition. Once one merges, rebase mode rebuilds
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
When the baseline answers 404, the English at the source commit's parent, which rebase reads
anyway, decides; the PR's branch is read only when the parent lacks the lecture. The table gains
these rows (`planRebaseRead` in `src/rebase-plan.ts`):

| `main` | Baseline | Source parent | Branch | Meaning | Rebase |
|---|---|---|---|---|---|
| 200 | 200 | | | The usual case | Updates the lecture, as before; the rebase cache reuses the baseline read |
| 200 | 404 | 200 | | The PR's source change edits a lecture the edition got since it opened | Updates `main`'s copy, as before: a stacked update |
| 200 | 404 | 404 (or empty) | 200 | The PR's source change adds the lecture, and a PR merged since added it first | Fails before the branch moves, with no model call; the comment names the path and asks a person to decide which copy wins |
| 200 | 404 | 404 (or empty) | 404 | The PR never delivered it | Updates `main`'s copy, as before |
| 200 | any other status, or 404 then any other status on the parent or the branch | | | | Fails, with the branch untouched |
| 200, and the PR predates the cache | | | | No baseline to read | Updates, as before |

The other rows of the earlier table are unchanged. A rename is read under its old path on `main`
and at the baseline, and under its new path on the branch and in the source, as there.

**Consequences**:

- The stop replaces the missing-title error with a comment that names the lecture; it does not
  save a re-translation, since none happened. The comment gives only the advice for this stop
  when nothing else in the PR failed: keep `main`'s copy (make the branch match it, or close the
  PR) or the PR's (resolve on the branch by hand). Regenerating with `translate forward`, or a
  resync, would make a third translation, so neither is offered.
- The stop depends on the baseline, the source parent and the branch having the lecture, not on
  what the branch's copy says, so a later rebase of the PR stops on it again until the PR
  merges or closes.
- The source parent read follows `D-2026-11-15-only-a-404-means-absent` where it decides: a
  failed read there fails the rebase of that PR. Elsewhere a failed read of it still leaves the
  old English empty, as before.
- Reads: an ordinary update makes the same reads as before, in another order (the cache reuses
  the plan's baseline read). The stop makes the two edition reads the cache did. A stacked
  update makes one read fewer (the branch). A lecture `main` has that neither the baseline nor
  the branch has costs one read more (the cache stopped at the branch's 404), as does a renamed
  lecture still under its old path on `main` (its old path at the baseline).

**Refs**: #467, #389, #351, #441, `D-2026-11-15-rebase-decides-from-three-reads`,
`D-2026-11-15-only-a-404-means-absent`.

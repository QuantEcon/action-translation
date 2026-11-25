# Rebase stops when `main` got a lecture first that the rebased PR adds too

**Context**: `D-2026-11-15-rebase-decides-from-three-reads` read the baseline and the branch only
when `main` answered 404, and rebuilt any lecture `main` has as an update. Two translation PRs
can add the same lecture: a sync and a `\translate-resync` of one source PR, or the syncs of two
source PRs that both touch a lecture new to the edition. Once one merges, rebase mode rebuilt the
other as an update of `main`'s copy. The rebase cache needs the file at the PR's baseline, where
it is absent, and the previous English is read at the source commit's parent, where the lecture
is absent too, so every section read as new: the lecture was translated again at full cost and
the branch's reviewed translation dropped (#467). Ruled 2026-11-25 (@mmcky): fail with a comment,
matching #389's rule for a lecture whose history the rebase cannot reconcile.

**Decision**: When `main` has the lecture and the PR records a baseline, rebase also reads it at
the baseline, and, when the baseline answers 404, on the PR's branch. The three-reads table gains
these rows (`planRebaseRead` in `src/rebase-plan.ts`):

| `main` | Baseline | Branch | Meaning | Rebase |
|---|---|---|---|---|
| 200 | 200 | | The usual case | Updates the lecture, as before; the rebase cache reuses the baseline read |
| 200 | 404 | 200 | A PR merged since added the lecture this PR adds too | Fails before the branch moves, with no model call; the comment names the path and asks a person to decide which copy wins |
| 200 | 404 | 404 | The PR never delivered it, and the edition has it from elsewhere | Updates `main`'s copy, as before |
| 200 | any other status, or 404 then any other status on the branch | | | Fails, with the branch untouched |
| 200, and the PR predates the cache | | | No baseline to read | Updates, as before |

The other rows of the earlier table are unchanged. A rename is read under its old path on `main`
and at the baseline, and under its new path on the branch, as there.

**Consequences**:

- The comment offers two ways out: make the lecture and its state file on the PR's branch match
  `main`, or close the PR if nothing else is left in it, to keep `main`'s copy; or resolve the
  conflict on the branch by hand to keep the PR's. Either way the PR's baseline still lacks the
  lecture, so a later rebase of that PR stops on it again until the PR merges or closes.
- The extra read is taken only when `main` has the lecture and the PR records a baseline. The
  rebase cache read each such lecture on the branch and at the baseline already; it now reuses
  the plan's baseline read, so an ordinary update makes the same reads as before, in another
  order. The new stop makes the same two reads the cache did. A lecture `main` has that neither
  the baseline nor the branch has costs one read more (the cache stopped at the branch's 404). A
  renamed lecture still found under its old path on `main` costs one read more (its old path at
  the baseline; the cache reads its new path).
- The new reads follow `D-2026-11-15-only-a-404-means-absent`.

**Refs**: #467, #389, #351, #441, `D-2026-11-15-rebase-decides-from-three-reads`,
`D-2026-11-15-only-a-404-means-absent`.

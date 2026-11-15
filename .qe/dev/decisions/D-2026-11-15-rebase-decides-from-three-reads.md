# Rebase decides what a lecture missing from `main` is from three reads: `main`, the PR's baseline and the PR's branch

**Context**: Rebase mode read each lecture of a sibling PR on `main` alone, and took any failed
read for a lecture new to the edition, which it translated from scratch. When a merged PR had
deleted the lecture, the rebased PR re-added it, freshly translated in place of the PR's
reviewed update, under a "translation content is preserved" comment (#389). A lecture the PR
itself adds could never use the rebase cache, which needs the file at the PR's baseline, so
every rebase replaced its reviewed translation with a new one (#351; lecture-intro.zh-cn#309's
`wealth_tax.md`, where only the parity check stopped it). Ruled 2026-11-15 (@mmcky), in the
overnight plan for WP2 (2a): "fail the rebase, with a comment naming the path"; "carry the
lecture and its state file unchanged from the branch"; and, for a PR opened before the cache,
"fail". The fourth case was accepted at #441's merge (2026-11-15).

**Decision**: When `main` answers 404, rebase also reads the lecture at the PR's baseline
(`main` as it was when the PR opened), then on the PR's branch, and decides from what it finds
(`planRebaseRead` in `src/rebase-plan.ts`). A rename whose old path `main` lacks takes a fourth
read, of the new path on `main`:

| `main` | Baseline | Branch | Meaning | Rebase |
|---|---|---|---|---|
| 200 | | | The usual case | Updates the lecture, as before |
| 404 | 200 | 200 | A PR merged since deleted it | Fails before the branch moves; the comment names the path and says the rebase does not bring a deleted lecture back |
| 404 | 200 | 404 | Deleted since the PR opened, and taken off the PR's branch | Leaves it out; there is nothing to carry |
| 404 | 404 | 200 | The PR adds it | Carries it and its state file unchanged into the rebased commit, with no model call |
| 404 | 404 | 404 | The PR never delivered it, such as a new lecture whose translation failed | Translates it as new, as before |
| any other status, on any read | | | | Fails, with the branch untouched |
| 404, and the PR predates the cache | | | No baseline to tell the cases apart | Fails |

A rename is looked up by its old path on `main` and at the baseline. When `main` lacks the old
path but already has the new one, as after another PR made the same move, the rename is rebuilt
as an update of the new path.

**Consequences**:

- If a deletion on `main` stands, the operator takes the lecture and its state file off the
  PR's branch, and later rebases leave it out. If the lecture should stay, it is restored on
  `main` first.
- The last case means a rebase can deliver a lecture that the sync's failure issue still
  lists, under the usual "rebased" comment.
- Rebase reads follow `D-2026-11-15-only-a-404-means-absent`.

**Refs**: #389, #351, #441, `D-2026-11-15-only-a-404-means-absent`, `D-2026-04-01-rebase-on-merge`.

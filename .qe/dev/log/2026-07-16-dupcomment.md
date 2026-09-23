# 2026-07-16 — #96: duplicate review comments under concurrent runs

Fixed the unsynchronised check-then-act in `postReviewComment` (#96, observed on
`lecture-python-programming.fr#6`: two review comments a second apart, each overwritten by a
different run). Hidden `<!-- action-translation-review -->` marker + delete-older-ids
reconciliation after every write; decision and the convergence argument in
`decisions/D-2026-07-16-single-review-comment.md`. Note the rule is the *mirror* of the one
#96 sketched — deleting **newer** ids doesn't converge, deleting older ones provably does.

Tests (`src/__tests__/reviewer-comment.test.ts`) drive N reviewers against a shared in-memory
comments API; the natural `await` interleaving reproduces the all-list-then-all-create race
without any scheduling tricks. Confirmed the five-run test fails on the pre-fix code (5
comments) before keeping it — 5 of 16 fail against the old implementation.

Found while there: the `[opened, synchronize, labeled, reopened]` trigger list #96 blames on
the target repo is **shipped by our own docs** (`connect-existing.md`), and no review template
had a `concurrency` group — so every edition set up from the tutorials inherits the 5x review
spend, `.fa` included. Added the per-PR `concurrency` group to all four review templates, the
`github.event.label.name` guard to the one that triggers on `labeled`, and explicit
`permissions` (the delete needs `pull-requests: write`). `labeled` itself is load-bearing —
labels are applied after the PR opens, so dropping it would skip reviews entirely.

#promote: docs that ship a workflow template make workflow bugs a *fleet* problem — the
target-repo fix (lecture-python-programming.fr#7) doesn't stop the next edition inheriting it.
Worth checking other QuantEcon action repos whose READMEs carry copy-paste workflows.

Not addressed: #96's secondary observation (four `labeled` events recorded for two
`addLabels` calls, #92 family). Unreproduced, mechanism unknown from the logs; the
`concurrency` group makes it harmless for now, but the naive label retry loop in
`pr-creator.ts` is still the #92-shaped hazard if it ever fires.

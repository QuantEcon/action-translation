# One review comment per PR: hidden marker + delete-older reconciliation

**Context**: `postReviewComment` was a check-then-act (list → find → update-or-create) with no
lock, so concurrent review runs each observed "no comment yet" and each created a comment
(#96). Concurrency is routine, not exceptional: one sync fires `opened` plus a `labeled` event
per label, which is five qualifying events in four seconds on `lecture-python-programming.fr#6`.
Issue comments have no conditional-write primitive (no ETag/If-Match, no unique key), so the
race cannot be closed by retrying — both creates genuinely succeed.

**Decision**: Every review comment carries a hidden `<!-- action-translation-review -->` marker
on its first line. After writing (create *or* update), a run lists again and deletes every
marked comment with an id **lower** than the one it wrote — newest wins.

Delete-older converges; delete-newer does not. Ids increase with creation time, and each run
lists strictly after it writes. So for any two of our comments `ci < cj`, the run owning `cj`
listed after `cj` was created, hence after `ci` was created, hence it sees and deletes `ci`.
Only the highest id survives, whatever the interleaving. The mirror rule #96 suggested
("delete ids greater than yours", keeping the oldest) leaves duplicates whenever the winner
lists before a slower run creates — the exact interleaving that produced the bug.

Matching is anchored at the *start* of the body (marker, or the generated `## … Translation
Quality Review` heading for pre-marker comments). These comments get deleted, so a loose
predicate destroys data: the old prose match — "Translation Quality Review" and
"action-translation" appearing anywhere — would match a human comment quoting a review.

**Consequences**:

- Exactly one review comment per PR under any concurrency. The common path (re-review after a
  push) still updates in place, so the comment keeps its position in the thread.
- Duplicates from v0.16.1 and earlier are marker-less; the legacy heading match adopts the
  newest as ours and deletes the rest, so affected PRs self-heal on their next review.
- Costs one extra `listComments` per review, and needs `pull-requests: write` to delete.
  Deletes are best-effort — a failed delete leaves a duplicate, which is not worth failing a
  review that posted successfully.
- Converging the comment does **not** converge the spend: every racing run still pays for a
  full review. That is a workflow-side problem, fixed by the `concurrency` group and the
  `labeled` guard now in the review templates.

**Refs**: QuantEcon/action-translation#96 · workflow-side fix
QuantEcon/lecture-python-programming.fr#7 · tests in `src/__tests__/reviewer-comment.test.ts`
drive concurrent reviewers against a shared fake comments API.

# 2026-07-26 — #210: review mode fails on a deliberate deletion

Details in the CHANGELOG entry; decisions that outlive the PR:

- **Keyed on the SOURCE PR's status, not the target's.** The question a deletion review has
  to answer is whether the *source document* was meant to disappear. Reading the target PR's
  own `removed` status would be cheaper (no extra data needed) and wrong — it lets a
  translation PR excuse its own unexplained deletion, which is exactly the defect the new
  blocker finding catches.
- **Two defects, not one.** The issue described the F40 guard failing to discriminate. The
  log line it quoted (`Error processing lecture.md: HttpError: Not Found`) came from a
  *different* bug: the per-file `try` wrapped the target fetch and the source fetch together,
  so the expected 404 on a deleted target skipped the source fetch too. That one also
  under-reviews mixed PRs, silently, without ever going red. Both fixed.
- **The deletion-only branch is not a rubber stamp, but the check is structural, not a
  comparison.** Reaching it *means* every markdown file in the PR matched a source-PR
  deletion — a target file deleted without a match lands in `reviewableFiles` and is gated
  there. Resisted adding a second explicit set-comparison inside the branch; it would have
  been provably dead code.
- **Under-deletion deliberately NOT checked.** "The source PR deleted a file the translation
  PR did not" looks like a symmetric check but is a false-positive generator: a partially
  seeded target repo legitimately has no file to remove, and sync is right to produce nothing.
  Flagging it would fail healthy runs — the same failure mode as #210 itself.
- **Deletion-only routes to `editor`, never `auto-merge`.** Nothing about content was
  verified, and deleting a translated document is consequential. The scores in the verdict
  block are 10s because no criterion was *evaluated* (matching the existing "no markdown
  files" branch); the load-bearing fields are `recommendation` + reasons, and the comment says
  in plain text that nothing was compared — otherwise this becomes the "✅ PASS over nothing"
  F40 was raised about, relocated.
- **Fail-closed on an unreadable source diff.** `getSourceDiff`'s outer catch returns an empty
  `removed` set, so a source PR that cannot be listed excuses nothing and the abort stands.
  Regression-tested; this is the property most likely to be "simplified" away later.
- **Resync path untouched.** `getSourceAtCommit` returns an empty `removed` set by
  construction — a commit is a state, not a diff. Deletions on the resync path (if forward
  ever produces one) remain fatal and unhandled; noted, not fixed.
- **E2E confirmation (post-merge, scoped smoke against `main`).** Scenario 18 green in
  zh-cn; the deletion-only comment rendered as designed and the run reported `API usage:
  0 call(s)`. Scenario 20 came back as GitHub-reported `renamed`, so it took the ordinary
  review path — which means **the delete+add rename form is still only unit-tested**. It is
  reachable in production (heavy edits defeat rename detection) and no harness scenario
  produces it. If a rename ever fails review, that is the shape to suspect.
- **Renames need no separate fix.** The GitHub-reported `renamed` case never had the bug (new
  path exists at both heads); the delete+add form GitHub falls back to when heavy edits defeat
  rename detection is the deletion case and is covered by the same partition. Tested both.

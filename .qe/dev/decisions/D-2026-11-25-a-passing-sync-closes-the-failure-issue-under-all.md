# A sync that passes without a PR closes the stale failure issue under `sync-scope: all` too

**Context**: A failed sync opens a "Translation sync failed for PR #N (lang)" issue in the
source repository, and a later sync of the same PR is meant to close it (F31 on #160). Under
`all`, only a later run that opened its translation PR without errors closed it, so a run that
passed with nothing to deliver (a PR whose only change removes a lecture the edition no longer
has, or whose changed `.md` files are all outside the lecture set, #449) left the issue open
after the problem was gone (#387). `D-2026-10-19-sync-scope-existing-reads-state-files` folded
the scoped half of #387 into #376 and kept `all` byte for byte unchanged, so #387 stayed open
for `all`. Its caveat, that a removal read failing with a 5xx passed as "already gone" and so
could close the issue with nothing deleted, was fixed by #440
(`D-2026-11-15-only-a-404-means-absent`). Ruled 2026-11-25 (@mmcky): build the `all` half,
with this superseding record.

**Decision**:

- **Under either scope, a run that passes without a PR closes the failure issues earlier runs
  opened for the same PR and language.** That covers the nothing-to-sync exit (under `all`,
  every changed `.md` outside the lecture set) and a run that gets to the end with nothing to
  deliver. Its closing comment cites the run, as a scoped run's does, and names
  `sync-scope: existing` only when the run was scoped:
  `✅ A later sync for PR #N (lang) passed with nothing to deliver to this edition: <run URL>`.
- **What still closes nothing is unchanged**: a test-mode run (it must not close real issues),
  a failed run, and the runs that end before the lecture set is read (a PR with no docs
  changes, a resync aimed at another language).
- A run that opens its PR closes the issue with the text it always used.

**Consequences**:

- This supersedes one consequence of `D-2026-10-19-sync-scope-existing-reads-state-files`
  only: that `all` keeps its behaviour byte for byte, so there a run that passes without a PR
  leaves the issue open. For this one behaviour, closing a stale failure issue in the source
  repository, `all` now does what `existing` does. Everything else in that record stands.
- The change touches nothing in an edition: no read, write, branch or PR in the target
  repository changes. Its only new requests are in the source repository: the listing of open
  issues, and a comment and an update on each stale failure issue.
- The bundle scenarios that pinned `all` as leaving the issue open now pin it closed, with the
  unscoped comment text; a test-mode scenario under `all` pins that it makes no issue request.

**Refs**: #387, #160 (F31), #376, #440, #449,
`D-2026-10-19-sync-scope-existing-reads-state-files`, `D-2026-11-15-only-a-404-means-absent`.

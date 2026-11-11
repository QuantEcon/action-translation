# The sync premise check holds back a lecture that is behind or ahead, not one whose earlier sync PR is still open

**Context**: Update mode carries one source PR's change, from its old English to its new,
into the edition's current translation. That works only if the translation is at the old
English, and nothing checked it (#420). The edition's state file records `source-sha`, so the
check can read the English at that commit and compare it with the English the PR changed.
When they differ, the lecture is in one of three cases: an open translation PR in the edition
carries it (`still-open`); none does, so a change never reached the edition (`behind`); or
the recorded commit is later than the PR's merge commit, as after a resync of an older PR
(`ahead`, #276).

#420 proposed refusing all three before the model call, on the ground that the update cannot
succeed. The first build did that. Review of it found the ground does not hold for
`still-open`: when the earlier PR's change did not alter the lecture's structure, the later
sync succeeds today as a stacked PR, and rebase mode rebuilds it once the earlier PR merges
(`D-2026-04-01-rebase-on-merge`; the "Sections Pending Earlier Translation PR" notice exists
for this). On 2026-11-11 lecture-python.zh-cn#308, #310, #311 and #312 were open and held 32
lectures, and a refusal would have failed every later source PR that touched one of them.
Ruled 2026-11-11 (@mmcky), for v0.30.2.

**Decision**:

- **`behind` and `ahead` are held back.** No model call is made, the lecture gets an error
  that names its case, the run fails, and the PR's other files still sync. For `behind`,
  syncing would deliver this PR's change and record the lecture as aligned while the missed
  change stays missing (#287). For `ahead`, it would undo the source edits made since (#276).
- **`still-open` syncs as before.** The check records a diagnosis for it. If the sync then
  fails, the failure issue carries the diagnosis beside the lecture's error and names the open
  PR to merge first. If it succeeds, the sync PR's body says which open PR it is stacked on.
- **Text decides, not commit ancestry.** The premise is that the translation is at the old
  English, and comparing the two texts tests exactly that. It also does not care that sync
  records a merge commit as `source-sha` (#391). One commit comparison is made only to tell
  `ahead` from `behind`.
- **A premise that cannot be checked does not block.** With no state file, no usable
  `source-sha`, or no source file at that commit, the lecture syncs as before, with a line in
  the log. A state file the edition cannot serve (a status other than 404) is an error for
  that lecture, as the scope check's reads are
  (`D-2026-10-19-sync-scope-existing-reads-state-files`).

**Known limits, accepted**:

- The check is necessary and not sufficient: a state file advanced past a change that never
  landed still passes (#287).
- A state file can also be wrong the other way. Sibling sync PRs merged out of source order
  leave it at the older PR's commit, because rebase stamps each PR's own source commit, and
  that lecture then reads `behind` although the edition has the changes. The `behind` advice
  says how to correct the state file in that case, with `status --write-state --carried` from
  a checkout of the PR's parent, in place of regenerating the lecture. How often this happens
  in the field is not measured; if it is common, the fix belongs in how rebase stamps state,
  not in loosening the check.
- A lecture renamed by hand in the edition cannot be checked: the source has no file at that
  path at the recorded commit.

**Not decided here**: #420's third proposal, to update a `behind` lecture from the English at
its state file's commit, so that one run carries every missed change. It changes what a sync
delivers and stays open on #420.

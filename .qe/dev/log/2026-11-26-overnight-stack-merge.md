# 2026-11-26 — the overnight stack reviewed, fixed and merged (#471–#476)

**Trigger**: Matt asked this repository's organiser session (`mini:action-translation`, on
qe-mini1) to review the six open PRs, which a cloud session had built overnight (log
`2026-11-25-overnight-stack`), then to watch them and say when each was ready for the PR
organiser. Nothing was released.

## Review rounds

Each round used a fresh Fable reviewer on a read-only worktree, with no GitHub writes and no
model calls. Round 1 was posted as a comment on every PR, and the re-checks of #475 and #476 as
comments on those two. The re-check of #474, this session's checks of #471 to #473's fixes,
and its check of `1e2e377` were not posted; their results are here.

- **Round 1, every PR.** #471, #472 and #474 were ready as they stood; #473, #475 and #476
  needed fixes. The ones that mattered: `--resume-from ""` restarted the whole series (#473);
  #283's matcher runs once over the joined text of every reviewed file, so multi-file PRs shift
  too and one case reads worse (#475, now #482); a failed baseline read failed rebases the
  parent read already settles, the #467 stop fired on a rename with a false comment, and the
  state-file fallback rewrote `1234e56` as `1.234e+59` (#476). #474's reviewer ran the patched
  `scripts/typography/apply.mjs` on the live fr edition: 14 of 27 files, 25 lines (24 elisions
  and one table row), and a second pass changed nothing.
- **Round 2, the fix commits** (Fable for #474 to #476, this session for the rest). #475's fix
  made a JSON reply that is not an object retry and degrade, undisclosed and untested: ruled to
  keep, then pinned and recorded. #476 still reached the last-resort dump for a byte-order mark
  beside a numeric key such as `0x1f`.
- **Round 3, #476's last fix.** Pairing keys by their text fixed that, but recursed without end
  on a self-referencing anchor beside a fallback trigger, which reached sync as a thrown
  `RangeError`. Fixed in `1e2e377`. This session reran round 3's 36,106-case key fuzz on it:
  the 12 cases that had thrown now fall back with a warning, and every other outcome is
  unchanged.

Every head was rebuilt from `npm ci` with no `dist-action/` drift, and CI passed at each.

## Rulings (@mmcky, 2026-11-26)

1. A rebase keeps the default branch's state keys. In his words: "Everything should transit a
   PR. So the approval of the sync PR would merge it (for an editor) and then a follow up PR
   would be available + any automated checks and CI."
2. A JSON reply that is not an object is a parse failure: he accepted the review's
   recommendation to keep the behaviour #475's fix had introduced.
3. #471 to #474 go to the PR organiser as an ordered batch, and "Squash all four in order".
4. #475: "Merge, closing #283 and #284".
5. #476: "Accept narrowing, merge", the confirmation
   `D-2026-11-25-rebase-stops-when-main-got-the-lecture-first` asked for at merge.

"Squash all four in order" and rulings 4 and 5 were given to the PR organiser, which relayed
them; the rest were given in this session.

## Merge

| PR | Merge commit | Closed |
|---|---|---|
| #471 | `8d2926a` | #382, #383, #390, #465 |
| #472 | `ebfc475` | #92, #387, #466 |
| #473 | `cd1adb5` | #356, #364, #384, #430 |
| #474 | `c740b97` | none; #324 and #325 wait on fr-edition repairs |
| #475 | `eaf9062` | #283, #284 |
| #476 | `36d1a77` | #467 |

Each squash was pinned to the head reported, and its tree checked equal to that head's tree and
to `git merge-tree` of `main` with it. The suite on `main` afterwards: 3,173 tests across 91
suites.

## Process notes

- **Merging a squash-merged stack without force-pushes.** After each squash, retarget the next
  PR to `main` first, since a retarget alone fires no CI run. Then merge `main` into its branch,
  resolve every conflict to the branch's side, check that the merged tree equals the branch
  head's tree, and push as a fast-forward. Taking the branch's side is right only when `main`'s
  content equals a commit the branch already contains (`git diff <that commit> origin/main`
  empty), which a squash of the PR below gives. #472 needed no merge, since its tree already
  held #471. #473 to #475 conflicted only in `dist-action/index.js.map`, which is one long
  line. #476 also conflicted in `src/reviewer.ts`, two tests and a doc, because it was stacked
  on #475's head from before #475's merge-in. A `git rebase --onto` restack would need
  force-pushes instead. #promote
- **Re-check the fixes, not only the findings.** Each round found a defect the previous round's
  fixes had introduced: #475's undisclosed behaviour change, and #476's stack overflow.
- **Say whose words a ruling is in.** Review comments here are posted under Matt's account, so
  the first #475 record quoted the review's reasoning as his. The record now says which words
  are his.

## Left

- The release prerequisites in STATE.md's *Next*: the fr heal before `@v0`, #290's harness
  exercise, and the release-note line on detecting a degraded review.
- Follow-ups found along the way, not filed, for Matt's go: a line starting `[Un mot] :` is not
  stable across two typography passes (found by the builder, confirmed by the #474 re-check);
  `closesFence` takes a fence with an info string as a closing fence inside a raw block in a
  directive (the #474 re-check); a failed edition read's failure issue still advises "not by
  re-running this sync" (round 1, #472); the sibling overlap check in rebase ignores a rename's
  old path (round 1, #476); plus the builder's own list (log `2026-11-25-overnight-stack`,
  *Found, not fixed*).

# 2026-10-06 — handover: the review follow-up's remaining GitHub updates, for a local agent

**Trigger**: the 2026-10-05 codebase review and its 2026-10-06 follow-up ran in a cloud session
without working `gh` credentials. The GitHub updates still owed are handed to a local agent here.
This log supersedes #352's resume checklist. The review and its routing are in
[`2026-10-06-codebase-review.md`](2026-10-06-codebase-review.md) and
[`2026-10-06-review-followup.md`](2026-10-06-review-followup.md); both arrive with PR #350.

**State, read live on 2026-10-06 between 10:45 and 11:20 UTC**:

- `main` is at `415cf87` (v0.29.3).
- **PR #350** holds the `.qe/` records: open, `mergeable_state: clean`, head `60ae8a0`. Its CI
  `test` job passed at 06:07Z; CI runs because `AGENTS.md` is in the diff. Copilot's review
  reported no findings.
- **QuantEcon/status-projects#237** registers #349 as `engine-hardening-2026-10`. It is open.
- **#349** is the Project tracker. Its stamp is verified 2026-10-06 and *Next* is #348. Its
  sub-issues are #348 and then #280, both Task and `bug`.
- **#351** was filed by @mmcky at 06:06Z, after #349 was written. It has label `bug`, no type and
  no parent. Nothing in #349 or the logs accounts for it yet.
- **#352** is the session's resume checklist: open, with no type or labels.
- None of the touched issues has had other activity since 06:20Z.

## How to run this (local agent)

1. Check out this PR's branch and work Parts 1–3 in order. Part 4 is bookkeeping that goes with
   later code work, and it is not part of this run unless @mmcky asks for it.
2. Re-read each object live before writing to it, because another session may have changed it.
   If it no longer matches what the step expects, stop and ask.
3. Edit bodies and comments from a lossless read; never retype them:
   - set `SCRATCH=$(mktemp -d)` (see `AGENTS.md`);
   - read with `gh api … --jq .body > $SCRATCH/x.md`, edit, and write back with `--body-file`, or
     with `gh api -X PATCH … -F body=@$SCRATCH/x.md` for a comment;
   - read it back and diff.

   Use `gh`, not the GitHub MCP server, for any text that contains `![`: the MCP dropped that
   sequence from the #90 comment (step 3.1).
4. Steps marked **maintainer** need @mmcky's ruling first. Ask, record the answer under
   **Outcome**, then act.
5. After each step:
   - tick its box;
   - fill in its **Outcome** (a link, SHA or date);
   - commit to this branch and push.

   When Parts 1–3 are done:
   - run `npm run check-dev-refs`;
   - update this PR's body;
   - ask @mmcky to merge.

   Do not merge this PR yourself.
6. Once this PR merges, this log is append-only. Later outcomes go in a new log entry or in a
   tracker's revision-log comment.

## Part 1 — finish PR #350 before it merges

- [ ] **1.1 Correct PR #350's body.**
  - **The `## Checks` line.** It says "CI skips `.qe/`-only changes, so this was run by hand",
    which is wrong for this PR: `AGENTS.md` is outside the `.qe/**` paths-ignore, so CI ran.
    Replace that bullet with:

    > - CI ran on this PR, because `AGENTS.md` is outside the `.qe/**` paths-ignore: the `test`
    >   job, which includes the `.qe` reference check, passed on `60ae8a0`. `npm run
    >   check-dev-refs` was also run locally → `✓ 192 .qe/ file references resolve`.

  - **The last "Already done on GitHub" bullet.** Until #237 merges it should read "#349's
    registry row is proposed in QuantEcon/status-projects#237."

  How: `gh pr view 350 -R QuantEcon/action-translation --json body --jq .body > $SCRATCH/pr350.md`,
  edit, then `gh pr edit 350 -R QuantEcon/action-translation --body-file $SCRATCH/pr350.md`.
  **Outcome**:

- [ ] **1.2 Complete three cut-off cells** on #350's branch (`claude/laughing-shannon-jrhu8h`).
  The disposition table in `.qe/dev/log/2026-10-06-review-followup.md` has three *Why* cells
  that end in `… |`. Replace each ending with the text the routing actually recorded. Each
  replacement below is wrapped here, but must stay on its table row's single line:
  - **R7**: `translator tautologies with … |` →
    `translator tautologies with #174. The coverage threshold stays deferred. |`
  - **R17**: `carrying the fix shape: shrink the outer try or collect … |` →
    ``carrying the fix shape: shrink the outer try or collect `fetchFailed` and abort before any
    model call; route 404 residuals to `editor`; the same change in `getSourceAtCommit`; tests
    through the `sourceFetchError` knob. |``
  - **R24**: `fail closed if listing fails, keep … |` →
    ``fail closed if listing fails, keep plain `--force`; trigger: #177's 40+ file drift-wave
    row. No comment of its own: the #154 comment names the hazard as a precondition of any
    forward re-run wave and points to that spec. |``

  **Outcome**:

- [ ] **1.3 Fix two lines that #350 would carry to `main`.** Put these in the same commit as 1.2.
  - **`.qe/dev/STATE.md`, resume checklist step 1.** It still tells the next session to triage
    #280 into W1–W6 with #257's other arrivals. #280 is now a work item of #349, and an issue
    has one parent, so placing it under a W-phase would detach it. Take #280 out of that list,
    or add "(#280 is now #349's — do not place it)".
  - **`.qe/dev/README.md`, layout block.** "the tracker (#257) holds the state" contradicts the
    `AGENTS.md` change in the same PR. Change it to "the project trackers hold the state
    (reading order: `../NEXT-STEPS.md`)".
  - **Optional:**
    - STATE.md's documented recovery route recommends `translate forward` without the hold
      that STATE.md states further down; add "(after #348 merges)".
    - PLAN.md Phase 4's "Rebase force-push races" line cites `src/index.ts` lines 464-473,
      but the reset is at lines 564-571 at `415cf87`. This predates the review.

  **Outcome**:

- [ ] **1.4 maintainer: approve the people-curated files**, `.qe/NEXT-STEPS.md` and
  `.qe/project.yml`. On approval, in the same commit as 1.2 and 1.3, change NEXT-STEPS.md's
  "Proposed 2026-10-06 for the maintainer's approval." to "Approved by @mmcky on YYYY-MM-DD.".
  `project.yml`'s `projects:` list form is also field feedback on QuantEcon/qeps#39.
  **Outcome**:

- [ ] **1.5 Push the 1.2–1.4 commit** to `claude/laughing-shannon-jrhu8h`. Run
  `npm run check-dev-refs` and wait for CI `test` to pass again. **Outcome**:

## Part 2 — merges, in this order

- [ ] **2.1 maintainer: rule on #237's row, then merge QuantEcon/status-projects#237.**
  - The row is proposed as `active · next`. The alternative is `proposed` until #348 has a
    branch.
  - If the ruling changes the row:
    - edit `projects.yml` on `claude/register-engine-hardening`;
    - re-run `python3 collector/validate.py --offline`;
    - before 2.2, mirror the stage in #350's `.qe/project.yml`, in NEXT-STEPS.md's table and in
      the follow-up log.
  - After the collection that the merge triggers, check that the dashboard shows the project
    under Translation, with `engine-v027` still parked.

  Merge it first because #350's follow-up log and commit `60ae8a0` state the registration as a
  fact. **Outcome**:

- [ ] **2.2 Merge PR #350 with an explicit squash message.** The repository's squash default is
  the commit list, which would put "Proposed for maintainer approval" into `main`'s history.
  Write a short body to `$SCRATCH/squash.txt`: what the PR adds, the approved files, and the
  registration as `engine-hardening-2026-10`. Then run:
  ```
  gh pr merge 350 -R QuantEcon/action-translation --squash \
    --subject "dev: 2026-10-05 codebase review — logs, hardening tracker #349, NEXT-STEPS.md, project.yml (#350)" \
    --body-file $SCRATCH/squash.txt
  ```
  The repository does not delete branches on merge, so add `--delete-branch` if wanted.
  **Outcome**:

- [ ] **2.3 Re-stamp #349 and post its revision-log comment, in the same sitting as 2.2.**
  *Needs a person* names two unmerged PRs and says the records are not on `main`; that becomes
  false at the merge.
  - **Body.** From a lossless read, replace only the `## Where we stand` section:
    - a new date;
    - *Next* still #348, unless a branch exists;
    - *In flight* nothing;
    - *Needs a person* nothing, or whatever remains.
  - **Revision-log comment.** Cover:
    - the 2026-10-06 approval to register the tracker;
    - #237 merged, with the ruled stage and priority;
    - #350 merged as `<sha>`;
    - #351's disposition (step 3.2).
  - Re-verify the stamp by 2026-11-05 at the latest, when the registry's 30-day stale-stamp flag
    would fire.

  **Outcome**:

- [ ] **2.4 Close #352** as completed, if it is still open, with a pointer:
  `gh issue close 352 -R QuantEcon/action-translation --reason completed --comment "Superseded:
  the resume checklist is now .qe/dev/log/2026-10-06-review-handover.md (PR #<this PR>), and the
  project's state is #349's Where we stand."` **Outcome**:

## Part 3 — issue adjustments (independent of the merges)

- [ ] **3.1 #90: restore a dropped character in the 2026-10-06 review comment** (comment id
  `6009946814`).
  - The non-null assertion in the comment's **Fix** code block was lost when it was posted, so
    the snippet no longer compiles under `strict`.
  - The line must read `const prefix = sourceSub.heading.match(/^#+\s+/)![0];`. Change that one
    line only.
  - Use `gh api`, not the MCP:
    - read: `gh api repos/QuantEcon/action-translation/issues/comments/6009946814 --jq .body > $SCRATCH/c90.md`;
    - fix the line;
    - write: `gh api -X PATCH repos/QuantEcon/action-translation/issues/comments/6009946814 -F body=@$SCRATCH/c90.md`;
    - read it back.

  **Outcome**:

- [ ] **3.2 maintainer: triage #351** ("Rebase re-translates a lecture the PR adds from scratch
  …").
  - **Membership.** Closing #351 does not advance #349's definition of done, so by QEP-6's
    membership test the default is to keep it out of #349. It can stay unparented, or be placed
    at #257's re-cut beside #169's slice 2. Adopting it instead means widening #349's goal and
    adding it as a sub-issue in plan position, with a revision-log entry.
  - **Type.** Run `gh api -X PATCH repos/QuantEcon/action-translation/issues/351 -f type=Task`,
    then read it back with `--jq .type.name`.
  - **Coordination comment** on #351, because both #351 and #280 change `rebaseSinglePR`.
    Proposed text:

    > Coordination with #280. This is not a dependency: neither needs the other's output. Both
    > change `rebaseSinglePR`. This fix changes which files a rebase re-translates, and #280
    > replaces the per-file writes with one commit built on a pinned `main`.
    >
    > Today the write step resets the branch to `main` and then commits only
    > `result.translatedFiles` (`src/index.ts` lines 564-593 at `415cf87`). After #280, the
    > commit's tree is `main`'s tree plus the files written. Either way, a file the rebase does
    > not re-translate must still be written with the branch's existing content, or it drops
    > out of the PR.
    >
    > Whichever of the two lands second should carry a test: a sibling PR that adds a lecture,
    > and overlaps the merged PR only on `_toc.yml`, keeps the added lecture byte for byte.

  - **Record the outcome** in 2.3's revision-log comment. If #351 stays out, also add it to the
    "Rebase follow-ons" note in #349's out-of-scope section.

  **Outcome**:

- [ ] **3.3 #261: put the re-registered gate in the body.** The disposition says the reviewer's
  per-file source-fetch gate (R17) was "re-registered on W3 #261", but it exists only as the
  2026-10-06 comment.
  - With a lossless body edit, add a checklist item:

    > - [ ] **Per-file source-fetch gate** (#198's remainder, re-registered 2026-10-06; see the
    >   comment below). A non-404 failure on one source file fails the review run before any
    >   model call: shrink `getSourceDiff`'s outer try, or collect `fetchFailed`. Apply the same
    >   rule in `getSourceAtCommit`. 404 residuals route to `editor` and name the file. Tests:
    >   the `sourceFetchError` knob.

  - Name the item on the body's member line.

  **Outcome**:

- [ ] **3.4 #257: add a dated note to the body, not a comment.** Do not change the stamp.
  - **Why the edit:**
    - the body says the tracker is not yet registered, but it is registered as `engine-v027`;
    - its resume pointer would triage #280 into W1–W6.
  - **Why the body:** a comment counts as tracker activity on the dashboard, and would refresh
    the parked row's health with no work behind it.
  - **Text**, to go under the "Parked 2026-10-04" paragraph:

    > **Dated note (YYYY-MM-DD):** this tracker is registered on the dashboard as `engine-v027`;
    > the *Tracker type* row below predates that. #280, listed below among the untriaged
    > arrivals, is now a work item of #349. Do not place it in W1–W6: adding it under a phase
    > would detach it from #349. The notes for the re-cut are in the 2026-10-06 comment on #259.

  **Outcome**:

- [ ] **3.5 File the edition-side carry-forward** (the follow-up log's `#promote` entry) in
  QuantEcon/project-translation.
  - **Search first:**
    `gh issue list -R QuantEcon/project-translation --state all --search "zh-cn language rules forward"`.
  - **If nothing owns it**, file it with the type label `bug`, parented wherever the zh-cn
    edition work lives.
    - The issue covers the zh-cn language rules that forward-written text went out without:
      full-width punctuation, and a space before inline roles and links.
    - The text is in `lecture-intro.zh-cn` and `lecture-python.zh-cn`.
    - Glossary adherence stays with #154.
    - Note that any repair waits for #348, and never re-runs a natively reviewed lecture.
  - **Optional, before 2.2:** add "Filed as QuantEcon/project-translation#N" to the follow-up
    log's carry-forward section.

  **Outcome**:

- [ ] **3.6 Optional small adjustments.**
  - **#325:** add its type label (QEP-2 asks for one, and it has none):
    `gh issue edit 325 -R QuantEcon/action-translation --add-label bug`.
  - **#280:** add one line at the top of the body. It points to the 2026-10-06 adoption comment
    and marks the body's suggested reopen guard as superseded by the adopted scope.
  - **#177, after #350 merges:** comment that the F25 trigger also carries PLAN.md Phase 3's
    `forward --github` re-run guard and the `gitPrepareAndPush` preflight (R24 and R25).
  - **#307:** comment that its ruling on what `docs-folder: '.'` matches should also correct the
    "Root-level files" gotcha in `AGENTS.md`.
  - **QuantEcon/qeps#39:** cross-reference point 1 (the `project.yml` list form) to the
    2026-09-21 comment on QuantEcon/qeps#40. That comment leaned toward one primary tracker plus
    `NEXT-STEPS.md`.

  **Outcome**:

## Part 4 — bookkeeping that goes with later work (not part of this run)

The order is #349's sub-issue list: #348, then #280.

- **#348's PR.** Steps and acceptance are on #348:
  - write the seam test first, so that it fails on `main`;
  - pass codes, not labels, at `src/cli/commands/forward.ts:376-377`;
  - add the zero-term warning;
  - CHANGELOG, then build.

  Write `Closes #348` and `Refs #154, #281` in the PR body. When the PR opens, re-stamp #349's
  *In flight*. **Until it merges, nobody runs `translate forward` against a real edition.**
- **After #348 merges:**
  - comment its merge date and SHA on #154, where it ends the window the glossary audit
    partitions on;
  - comment the same on #281: wording that prescribes `translate forward` may ship in any
    release after it;
  - re-stamp #349, with *Next* becoming #280;
  - resolve STATE.md's forward-hold line;
  - on the 3.5 issue, note that a forward re-run is now possible, except on natively reviewed
    lectures.
- **#280's PR.** Scope and acceptance are in #280's adoption comment:
  - a single-step write in `src/git-commit.ts`, registered in `docs/developer/architecture.md`;
  - target reads pinned to one `main` SHA;
  - a check after the move that the PR is still open;
  - `queue: max` in `examples/rebase-translations.yml`, asserted in `workflow-templates.test.ts`.

  Write `Part of #280` and `Refs #349` in the PR body, never a closing keyword: #280 closes
  after the rollout. Coordinate with #351 as in 3.2.
- **#280's rollout and closure.** After the release reaches `v0` and the floating tags move:
  1. Confirm that `queue: max` is accepted on a harness target.
  2. Patch `rebase-translations.yml` in the seven editions, and record the repos and commits on
     #280.
  3. Run the harness check: two back-to-back merges, with a third PR overlapping both.
  4. Close #280 as completed.
  5. Tick PLAN.md Phase 4's "Rebase force-push races" line.
  6. Comment on #259 that #280 delivered #256.4.
  7. Watch the next multi-merge drain for same-second force-push and close pairs.
- **Each release cut (#346 first, then #340).** Re-check `main`'s runtime changes since v0.29.3
  and update both bodies:
  - once #348 or #280 merges, #335 is no longer "the only runtime change";
  - add `npm update js-yaml undici` and a rebuild;
  - if `v0` has moved, update "Today `@v0` resolves to v0.29.3".
- **#325.** Before its branch is pushed, @mmcky decides whether to fold in the 2026-10-06
  widening: table delimiter rows and `+++` lines. If it is folded in, update #346's #325 row.
  After the release reaches `v0`, open the fr edition PR that restores the `pandas` indicator
  table's delimiter row.
- **#257's re-cut**, when a release is assigned to W1:
  - apply the 2026-10-06 notes on #259: box 1's fail-closed claim, box 5's #256.4 clause, and
    placing #90's defects 6–7 and #281;
  - drop the sequence tokens and the version from the W-phase titles.
- **#349's closure.** When #348 and #280 are closed and the definition of done holds:
  - post a close-out revision-log comment;
  - close #349 as completed;
  - open a registry PR that sets `engine-hardening-2026-10` to `done`;
  - mark the row done in `.qe/NEXT-STEPS.md`.
- **Branches.** Delete `claude/laughing-shannon-jrhu8h`, `claude/register-engine-hardening` and
  this PR's branch after each merges.

## Open maintainer decisions

1. #237's stage and priority (step 2.1).
2. Approval of `.qe/NEXT-STEPS.md` and `.qe/project.yml` (step 1.4).
3. #351's membership (step 3.2).
4. Whether #325 takes the 2026-10-06 widening (Part 4).
5. QEP-7: whether `project.yml` keeps its `projects:` list form (QuantEcon/qeps#39, point 1).

## Run record

*The local agent appends here: the date, who ran it, what was done, and anything skipped and
why.*

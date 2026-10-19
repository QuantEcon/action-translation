# 2026-10-19 — #344 `sync-scope: existing`: PR #376 open for review

**Trigger**: Matt asked for #344 as a PR for review; it ships in #346.

**What #376 does.** A sync input, `sync-scope`: `all` (default, unchanged) or `existing`, under
which a changed or renamed lecture syncs only when the edition has its state file on its
default branch (renames by the previous path; existence, never contents; only a 404 is "no").
The check is its own module, `src/sync-scope.ts`, so D2 (#259) can reuse it, and the input is a
thin switch around it (`applySyncScope`). Skipped lectures go to a PR-body section and a job
summary, never to the metadata `files`. Removals and `_toc.yml` behave as under `all`. Decision
record `D-2026-10-19-sync-scope-existing-reads-state-files`.

**Choices where #344 was silent** (labelled in the record): a non-404 scope read is an error for
that lecture alone, read from "as the ToC fetch already does (#254)"; the edition is read first,
because GitHub answers 404 for a repository the token cannot see, and if that read fails nothing
syncs and the run fails at once; an in-scope lecture the content fetch cannot read is dropped and
fails the run, so the `all` path's F36 coercion cannot re-create a reviewed lecture. The harness
replays scenarios 17, 19 and 20 under a `--sync-scope existing` flag (label
`test-sync-scope-existing`), and its reset lays down a state file for `lecture.md` only, so
`lecture-minimal.md` plays the English copy and 19 is the mixed PR.

**Verification.** `main` at `41ed05f`: 68 suites, 1,635 tests; the branch: 70 suites, 1,789.
A new bundle-level test runs the built `dist-action/` in a child process against a fake GitHub
(an `undici` MockAgent as the global dispatcher) and pins `runSync`'s wiring, which no unit test
can import (#169). Under `all`, the branch bundle makes `main`'s exact 23-request sequence, with
identical writes, PR body and comment, and no job summary. On Node 26 the runner must touch the
global `fetch` before installing the mock, or the first use of `Response` replaces it; the runner
records whether the mock survived. The `all` PR body is pinned by snapshots proven equal to
`main`'s. Reviewer agents ran mutation rounds against scratch copies. **Not run**: the harness
scope smoke. The `gh` token has no `workflow` scope, so it is Matt's; the command is in #376.

**Found along the way.**
- ml's `main` has `.translate/config.yml` and no state file, beside five translated lectures, so
  `existing` would sync none until each gets one; asked on #344 whether that backfill is part of
  #346. #promote
- ml's `scripts/prune_toc.py` keeps entries whose `.md` exists; #344 has it keep those with a
  state file. #promote
- `translate doctor` warns, rather than fails, on a lecture without a state file, and reads only
  the top level of the docs folder (retirement condition 3; asked on #344).
- Not fixed here: `init -f` matches by substring; `status --write-state` defaults `-l` to
  `zh-cn` and rewrites `.translate/config.yml`; the action reference says `docs-folder: '.'`
  filters top-level files only, but classification includes subfolders; #346's table still
  describes #344's first version (`_toc.yml` left alone).
- Sandbox: `npm ci` needs the sandbox off (a dependency writes under `.idea/`), SSH `git` too, and
  local port binding is refused, hence the in-process MockAgent rather than a fake server.

**Next**: Matt reviews #376 and runs the scope smoke; answers on #344 (ml backfill, doctor);
then #346.

## Addendum, later 2026-10-19: rulings and the fold

**Handover.** The scope smoke went to Matt as #377 (log `2026-10-19-sync-scope-harness-handover`
on that branch), run as five scenarios (01, 17, 18, 19, 20) on all three lanes. Fourteen issues
came out of the reviews, #378–#391, among them `init`'s swallowed state write (#378), the
`source-sha` a merge commit leaves (#391), and #380 and #387, folded in below.

**Ruled by Matt.** Q1: lecture-at-a-time tooling is CLI-first, a thin skill later, no pipeline
command (new record `D-2026-10-19-lecture-at-a-time-tooling-is-cli-first`). Q2: retirement
condition 3 is a required CI state check on every PR and push to `main`, failing on an
unexcepted `.md` without state (subfolders included), an excepted file with state, orphan state
and unreadable state; it is built on #370 with #385, and the backfills and exceptions it needs
are listed in the sync-scope record. Q3: scope stays existence-only, and the CLI's reader is
fixed instead (#381, #379). The sync-scope record now carries all three.

**Folded into #376.**
- #380: `status --write-state` checks `git diff <recorded source-sha> HEAD` per lecture and
  refuses a lecture whose English changed since (or whose recorded commit the clone lacks),
  listing the commits, until `--carried` confirms the translation carries them. `--force` skips it with the other checks. Before, it
  compared only commit dates. (`fileChangedSince`/`commitsSince` in `src/cli/git-metadata.ts`.)
- #387, the scoped half: a scoped run that passes without a PR closes the failure issue an
  earlier run opened for the same PR and language, with a comment that links the run; not in
  test mode, and `all` is byte for byte as before, so #387 stays open for that half.
- Verified by a review workflow (builders, then two skeptics per finding); its findings went in
  before commit, among them a stale-clone hint in the refusal, two bundle scenarios with
  decoy issues, and a test that the date guard refuses first when both guards would. Counts:
  70 suites, 1,839 tests.
- Checked live for the records: the five complete editions are lecture-python-programming.fr,
  .zh-cn and .fa, lecture-python.zh-cn and lecture-intro.zh-cn; every top-level lecture has a
  state file, and the `.md` files without one are the ones the record lists. #promote

**Next**: Matt's review of #376 and the smoke; then the CLI bug fixes of phase 1, and ml's
backfill (phase 0) before ml's sync workflow.

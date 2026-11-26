# 2026-11-25 — an overnight stack of six draft PRs (#471–#476); 42 issues validated first

**Trigger**: Matt asked for a work package from the issues list to work through overnight,
then for the candidate issues to be validated, then for the open decisions one at a time.
Built in a cloud session, with agents for building and for adversarial review. Nothing is
merged or released: six draft PRs wait for his review.

## Validation, at `939ceaf`

Three read-only passes read 42 open issues in full and checked each against the code. None
was closable. Partly fixed, with text out of date: #384, #387, #391, #399, #356, #106, #157 and
#235. Status comments went on the four the stack does not touch (#399, #106, #157, #235). The
other 74 open issues rest on the 2026-11-11 validation.

## Rulings (@mmcky, 2026-11-25)

Eight questions, each answered as recommended:

1. #387: build the `all` half, with a superseding record
   (`D-2026-11-25-a-passing-sync-closes-the-failure-issue-under-all`).
2. #364 with #430: refused output goes to `<target>/.translate/refused/`, kept out of git, and
   a parity failure's message is no longer cut at 500 characters
   (`D-2026-11-25-refused-output-is-kept-under-translate-refused`).
3. #284: the degraded review records the model's diff checks false with a finding, and the run
   ends green (`D-2026-11-25-an-unparseable-diff-evaluation-degrades-the-review`).
4. #283: allowed during the reviewer-prompt freeze (same record).
5. #467: fail with a comment
   (`D-2026-11-25-rebase-stops-when-main-got-the-lecture-first`; narrowed, see below).
6. #290: an unparseable state file is overwritten with a warning.
7. Stacked draft PRs, one per group.
8. Status comments only on the partly fixed issues the stack leaves alone.

Later the same day: all six groups, one agent at a time.

## What is open

Each PR is based on the one before; #471 is based on `main`.

| PR | Group | Would close | Touched, stays open |
|---|---|---|---|
| #471 | housekeeping | #465, #390, #383, #382 | #399 (docs half), #409 (rows 1, 2, 4) |
| #472 | sync | #466, #92, #387 | |
| #473 | CLI | #384, #356, #364, #430 | #391 (sync still records the merge commit), #428 (the prompt's escape hatch) |
| #474 | French typography | | #325, #324 (each waits on its fr edition repair) |
| #475 | reviewer | #284, #283 | #261 (box 5 built) |
| #476 | stretch | #467 | #290 (its harness exercise was not run, and whether a rebase keeps a branch-only key is open), #223 (its "unlocated" remedy needs a schema change) |

3,117 tests pass across 91 suites at #476's head (2,761 at `939ceaf`; one more is skipped when
the suite runs as root).

## For Matt at merge

- **#476 needs three confirmations**, set out in its body: the #467 stop was narrowed in the
  session to the case where the PR's own source change adds the lecture, on the review's
  evidence that the broad stop failed a rebase that works today; a rebase keeps the default
  branch's state keys, not the PR branch's; and #223 tolerates one quote found nowhere, with a
  residual for a finding that quotes only a long phrase from another file.
- **#474's release order**: heal the fr edition with the patched `scripts/typography/apply.mjs`
  before a release carrying #324 reaches `@v0`; #325's `<style>` repair comes after it.
- **#475 shifts shadow data**: the Changed Sections list on lectures with colliding heading ids,
  a new degraded-review record, and reviews that now fail red on a source read error.
- **#290's harness exercise was not run** (billed).

## What the reviews changed

Every group had an adversarial review on a read-only worktree, and #476 a second pass on its
fixes. Findings that changed a PR:

- #471: the changelog told owners of deployed workflows to re-run `setup --source-workflow`,
  which fails when the edition exists; `rate-check.sh --ref <branch>` broke for a remote-only
  branch once the worktree was detached.
- #472: no defect in the three fixes; `faq.md` still said only an `existing` run closes the
  issue.
- #473: nine small defects around the refused output, among them an ignore file written only
  when absent, and a preview that showed the injected front matter instead of the opening fence.
- #474: no defect in either rule over 20,000 generated documents; nine elision prefixes and the
  one-line `<pre>` closer could be broken without failing a test.
- #475: a degraded review could record `auto-merge` when the translation reply carried 20 minor
  findings, since the cap of 20 dropped the two findings that gated it. It now gates by a
  reason. The prompt freeze held: 3,003 of 3,462 captured requests byte-identical, the other 459
  differing only in the Changed Sections list on documents with colliding ids.
- #476: the three points above, plus state values YAML reads as numbers being rewritten
  (`0123456` to `123456`), now carried as written.

## Found, not fixed

- **The finding cap can drop a gating finding on `main` today**: a model-reported
  `scopeCorrect: false` gates only through its `minor` finding, which 20 other minor findings
  push out of the cap, so the verdict reads `auto-merge`. Either fix changes verdict behaviour
  during the shadow window. Described in #475's body; filed as #477.
- **Rebasing a renamed lecture fails with a missing-title error**: the old English is read at
  the new path of the source commit's parent. Described in #476's body; filed as #478.
- The source read at `sha^` in sync still has a bare `catch`; a rename whose old file is empty
  or over 1 MB reads as new (#472's body).
- Typography: a `---` option block inside a prose directive is typeset; a double-backtick span
  desyncs inline masking for the rest of its line (#474's body).

## Process notes

- **The run stopped for ten hours at the account's 5-hour usage limit**, about two and a half
  hours in, with two agents running. Two groups were built and unpushed at the time. After
  that, each branch was pushed as soon as its build was verified. #promote
- **CI runs only on PRs that target `main`**, so a stacked PR gets no run. Each later branch's
  CI was started by `workflow_dispatch`; #471 to #475 passed, and #476's run was started with
  the commit that adds this log.
- **A brief can be wrong where the issue is right**: the #325 brief asked for a three-dash
  delimiter row, and the live fr row has one dash per cell. The builder followed the issue.
- **Edit tools turn `\u` escapes into literal characters.** Two builders hit it with U+00A0;
  each checked its diff for literal no-break spaces afterwards.
- **The stale-build guard reads as 208 failures**: touching a source file's mtime without
  rebuilding fails the smoke and bundle suites by design. Rebuild before reading a red suite.

## Next

- Matt's review and merges, in order, with the confirmations above.
- A ruling on #477, since either fix changes verdicts during the shadow window.
- A release carrying the stack, after the fr edition heal for #324.

## 2026-11-26 — independent review

A second, independent review commented on each PR; its findings were checked against the code
and applied in one new commit per branch (no commit rewritten), then the stack was restacked.

- #471: `rate-check.sh --ref` resolves a remote-only branch under any remote and refuses one two
  remotes disagree on; the `--ref` test is renamed to what it proves; the rename recipe covers a
  merge commit and a heavily edited rename (`D` beside `A`). Left: the `--max-refusals` string
  identity, the probe-directory filter, the stale STATE count.
- #472: a bundle test pins that a test-mode run at the nothing-to-sync exit under `all` makes no
  issue request (the review's mutant now fails). Left: the failure-issue wording for a failed
  read, the #92 lookup's `head.repo`.
- #473: `--resume-from ""` and `-f ""` are refused, not read as absent; `source-sha` is peeled
  to a commit, so a tree id stays OUTDATED; `init -f` says once where the refused output went.
  Left by ruling: the unique-substring step.
- #474: an unclosed raw block inside a directive ends at the directive's closing fence; a line
  starting `<pre> ...` stays a raw block, now documented; the three surviving mutants are killed.
  Left: a raw block not at line start, elisions in directive titles, `x_t'*y*`.
- #475: the #283 changelog entry says "within one lecture" and discloses the multi-file
  pairing, with a test pinning its known wrong case (follow-up: pair per file); a parse failure
  is only a reply that did not parse; the injection scorer reads reasons only; a resync removal
  404 is tested; the contract says an all-404 review aborts.
- #476: a failed baseline read is fatal only where it decides; renames are outside the #467 stop
  (the plan reads the parent at the old path; #478 unchanged); the state-file fallback keeps
  each value's text (`1234e56` stays) and names an unsupported tag; failed plan reads advise a
  re-run; records for #290 (one question open) and #223. Left: a way out of the stop (follow-up).

A re-check of #475 and #476 on 2026-11-26 brought two rulings, applied in one more commit on each:

- #475: a reply that is valid JSON but not an object is a parse failure, as built (Matt): it
  retries and, in the diff evaluation, degrades; tests, changelog, contract and record say so.
- #476: a rebase keeps the default branch's keys, as built (Matt): a sign-off arrives by its own
  follow-up PR after the sync PR merges; the record marks the question ruled. Also fixed: a
  numeric mapping key keeps its text on the state-file fallback, and two rebase-advice nits.
- #471 to #474 went to the merge coordinator as an ordered batch; push nothing to them from here.
- Still open: Matt's own yes on narrowing #467.

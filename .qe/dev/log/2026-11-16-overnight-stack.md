# 2026-11-16 — the overnight PR stack merged: WP1–WP4 of 2026-11-15; #449 filed

**Trigger**: the 2026-11-15 release paragraph in STATE.md, whose next steps were step 3 of the work order
(#396 with #386, #389 with #351, #398, #90 defect 6) and step 4 (#378, #401, #134, #400). After
the release, Matt approved an overnight plan in four work packages. He asked for Fable
reviewers for the design work and for adversarial review, and for the PRs to be stacked for
him to review in the morning. A local session on qe-mini1 built the stack. He merged #440, #439
and #441 that evening and the rest the next morning, an organiser session merging each on his
yes.

## Rulings (@mmcky)

- **2026-11-15: all 20 design recommendations accepted**, in one answer. The overnight design
  reviews were read-only Fable passes at `fdab41f`. Recorded:
  - `D-2026-11-15-only-a-404-means-absent` (2b);
  - `D-2026-11-15-rebase-decides-from-three-reads` (2a);
  - `D-2026-11-15-a-lecture-moved-out-of-docs-is-deleted` (2c);
  - `D-2026-11-15-a-failed-cli-state-write-is-a-failure` (3a);
  - `D-2026-11-15-init-keeps-the-editions-files` (3b, in #445).

  The rest live in their PRs and the changelog: #90 defect 6 as its own PR (2d); bulk
  `backward` analyses the files both sides have and reports the rest (3c); retry exactly
  `TypeError('terminated')` and leave `SyntaxError` to #284 (4a); and update only `handlebars`,
  `browserslist` and `brace-expansion` 1.x, leaving `@typescript-eslint` and `minimatch` to
  #177's ESLint 9 work (4b).
- **At merge** (#440, #439 and #441 on the evening of 2026-11-15; the rest on 2026-11-16):
  - #441: a lecture missing from `main`, the baseline and the branch is translated as new.
  - #444: both points flagged in its body.
  - #445: a bulk `init` into an existing edition keeps its own copy of a build file the source
    has changed, such as `_toc.yml`.
  - #448: both commits, so `brace-expansion` 2.x moved too.
  - Before #442 merged, Matt asked whether lectures should be tracked by the ToC rather than
    the folder. His ruling: "Merge; open ToC issue". That issue is #449.
  - The CHANGELOG suggestions on QuantEcon/infrastructure#123: changelog fragments, agreed.

## What shipped

All of it is on `main` and unreleased. The editions run `@v0` (v0.30.2).

| PR | Package | Landed | Closed |
|---|---|---|---|
| #440 | 2b: a failed removal read fails the run; an unreadable bibliography opens a failure issue | `43f0444` | #396, #386 |
| #439 | WP1, docs | `46e0a4d` | |
| #441 | 2a: rebase does not re-add a deleted lecture, and carries one its PR adds | `72e1835` | #389, #351 |
| #442 | 2c: a lecture moved out of `docs-folder` is deleted | `454b7db` | #398 |
| #444 | 3a: a failed CLI state write is a failure; `status --write-state` says what it wrote | `d899e73` | #378, #401 |
| #446 | 3c: bulk `backward` analyses the intersection | `65c6594` | #400 |
| #445 | 3b: `init` never overwrites the edition's own files | `3e1934b` | #134 |
| #447 | 4a: a non-streamed response cut off mid-read is retried | `091b846` | |
| #448 | 4b: dev-only dependency updates (`npm audit` 18 → 14) | `f6d39ab` | |
| #443 | 2d: a heading's surrounding whitespace no longer changes its section id | `f214c5e` | (#90 stays open) |

4c was a comment on #284 with v0.30.2's gate instance: fa scenario 15's `evaluateDiff`
returned malformed JSON, and was retried once, then posted. 2,467 tests pass across 84 suites
at `f214c5e`.

## What the reviews changed

Every code PR had a Fable adversarial review on a read-only worktree; #439, docs only, had
none. #444, #445 and #446 also had a second pass on the fixes. Some of the findings that
changed a PR:

- #444: the recovery command printed for a lecture without a state file lacked `-l` and `-d`.
  `status` reads no config, so on an `fa` edition it would have reset the config to `zh-cn`.
- #442: GitHub can list a book move as the docs folder's `_toc.yml` removed plus a `_toc.yml`
  added outside it. Without the refusal covering that shape, such a move would have deleted
  every translation.
- #446: a wrong `--target` passed silently, with nothing analysed. An empty side now stops the
  run with a path hint.
- #447: both cut-off checks used `instanceof TypeError`. Fetch's errors come from Node's own
  undici, which is another realm under Jest, so the tests could not have seen a miss. Both now
  match by name. The review also observed the premise directly: undici rejects a body read
  dropped after the headers with exactly `TypeError('terminated')`.
- #448: the changelog now names the eight low advisories that stay, and `browserslist`'s path
  through `jest`. The review also checked every changed lockfile hash against the registry, and
  that the production package set is identical to `main`'s.

## Process notes

- **Most merges conflicted the open PRs on `CHANGELOG.md`**, since each PR added its entry at
  the same place under `### Fixed`, and those that rebuild the bundle conflicted on
  `dist-action/index.js.map`. The open PRs were rebased after each merge by a guarded script. It
  resolves only the CHANGELOG (keeping both sides, and taking a commit's revised entry over its
  old one by bold title) and `dist-action/` (by rebuilding), stops on any other conflict, and
  scans every commit for markers. Each PR's patch-id outside the CHANGELOG and the bundle was
  then checked unchanged, and its CHANGELOG entry byte-identical. `merge=union` was considered and set aside: it
  duplicates an entry that a later commit revises, as #447's did, with no marker to catch it.
  Changelog fragments, one file per PR collected at release, are next. #promote
- **Retargeting a PR fires no CI run.** Retarget first, then push.
- **Copilot reviewed every PR at a lower tier** ("model policy or plan restrictions"). It left
  threads on #441, #444 and #445, all answered. On #445 it found that a dangling symbolic link
  at `.translate/config.yml` would be written through, which is now refused. The other six got
  a summary only.
- **The test count depends on the checkout.** `workflow-templates.test.ts` sweeps
  `tool-test-action-on-github/` recursively, so in a working tree that holds the harness's
  gitignored `test-translation-sync*` clones it runs 15 more tests (2,482, against CI's 2,467).
  Its own comment says it avoids reading those clones. The counts in this batch's PR bodies
  came from such a tree. Noted for an issue.
- **Two slips, both caught before they reached `main`:** a claim to the organiser that #445
  had no open Copilot threads, when it had two (corrected); and a resolver crash in a
  `;`-chained command that committed conflict markers locally, caught by scanning each commit
  before the push.

## Filed

- **#449** (`enhancement`, `discuss`): one lecture set for sync, `init` and the CLI, taken from
  the ToC plus the `.md` files its lectures include. It covers fragments, drafts,
  `sync-scope: existing`, the state check and `myst.yml`. Two Fable passes shaped it, and it
  asks eight questions.

## Next

- Changelog fragments (QuantEcon/infrastructure#123), with this repository's AGENTS.md rule
  and release checklist step 1 changed to match.
- A release carrying the stack. #442 and #445 change what sync and `init` do to an edition's
  files, so the notes should say so.
- Matt's rulings on #449.
- Still Matt's, from the previous log: #280's close sequence and the four zh-cn PRs.

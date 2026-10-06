# Review follow-up — 2026-10-06

This log records what was done with the findings of
[`2026-10-05` codebase review](2026-10-06-codebase-review.md): which issues and comments were
filed, how the project was chosen, and where each finding went. The tracker is #349.

## What was created on GitHub

- **#348** (new, type Task, label `bug`): `translate forward` sends no glossary terms and no
  language rules, because it passes language labels where the translator uses them as lookup keys.
- **#349** (new, type Project): the hardening tracker. Its sub-issues are #348 and then #280, and
  it has no phase table. Its first revision-log comment records how it was created.
- **#280** was adopted as a work item. It had no parent, so no member of #257's phases moved. It
  was given type Task and label `bug`, and a comment fixes its scope:
  - the single-step branch write (`createTree` / `createCommit` / one `updateRef`);
  - target reads pinned to one `main` SHA;
  - `queue: max` on the rebase template;
  - a post-move check that the PR is still open.
- **Evidence comments**, one per issue, each limited to evidence that changes the issue's fix,
  scope or acceptance:
  - #154: forward has never delivered the glossary, so the audit must split out forward-written
    zh-cn files.
  - #169: the shape of the `metadata.mode` dispatch, and acceptance for slice 2.
  - #259: a correction to box 1's fail-closed claim, and notes for #257's re-cut.
  - #90: two more silent-loss sites.
  - #325: table delimiter rows and `+++` lines, including the live fr `pandas` table.
  - #281: two more surfaces print a dead `/translate-resync`.
  - #170: the verbatim walker's opener.
  - #261: the reviewer's per-file source-fetch gate, re-registered.
- **Native dependency edges:** none. There are no gates. The #281 ↔ #348 coordination is a note on
  #281, not an edge.

## How the project was chosen

Three independent designs were scored from 1 to 10 on six criteria:

1. the quality bar;
2. QEP-2/6/7 compliance;
3. one PR per item;
4. no duplication;
5. truthful sequencing;
6. comment discipline.

| Design | Scores (1 / 2 / 3 / 4 / 5 / 6) | Notes |
|---|---|---|
| risk-first | 6 / 7 / 5 / 9 / 7 / 3 | Folded the trigger-gated forward guard into the forward item; included sync PR creation, which an open PR edits; 18 comments |
| root-cause-first | 7 / 7 / 6 / 8 / 6 / 3 | One phase; included sync PR creation; 17 comments |
| delivery-first | 7 / 8 / 7 / 7 / 8 / 8 | Tightest scope, but its Decision item duplicated #154's existing audit |

The synthesis started from the delivery-first design and took its two code items:

- **Dropped:** its Decision item. Glossary adherence in shipped text goes to #154 instead.
- **Grafted from risk-first:** the queue key is confirmed on a harness repository before rollout.
- **Comments:** capped at eight; the rest of the evidence is recorded in PLAN.md and in this log.

Two compliance audits then revised the design.

## `.qe/` changes in this session

- **`.qe/NEXT-STEPS.md`** (new). QEP-7 §4 asks for it once a repository has two trackers. It is
  people-curated, so it is proposed for approval.
- **`STATE.md`:**
  - the #349 bullet;
  - #257 marked parked;
  - the forward hold;
  - the re-measured advisories.
- **`PLAN.md`:** dated notes on the items the routed findings belong to, plus four new lines:
  - the forward re-run guard (Phase 3);
  - the source-template concurrency group and the reviewer source-fetch gate (Phase 4);
  - the #172 acceptance tests (Phase 5).
- **`AGENTS.md`:** the current-state register is now "the project trackers", with the reading
  order in `.qe/NEXT-STEPS.md`.
- **No decision record.** No choice about how the engine is built was made; the scope split lives
  in the tracker body and NEXT-STEPS.md.
- **`.qe/project.yml` declares both projects as a `projects:` list.** This was done on the
  maintainer's instruction, 2026-10-06. QEP-7's draft Appendix A gives the file one
  tracker/registry/programme, so the list form, and the other field notes from this session,
  went to the QEP-7 discussion (QuantEcon/qeps#39) #promote. #349 is registered in
  QuantEcon/status-projects as `engine-hardening-2026-10` (QuantEcon/status-projects#237).

## Carry-forward (edition-side, unowned) #promote

Target: QuantEcon/project-translation, where the edition audits live.

Forward resyncs sent no language rules either, not only no glossary. A search on 2026-10-06 found
that no fr, fa or ml edition has merged a forward PR since 2026-03-19. So the residue is zh-cn's
two rules, in the forward-touched files of lecture-intro.zh-cn and lecture-python.zh-cn:

- full-width punctuation;
- a space before inline roles and links.

## Also noted

- **#346 and #340** each say #335 is "the only runtime change on main since v0.29.3". That stops
  holding once #348 or #280 merges, so re-check it when either release is cut.
- **#103's `active` mode.** These preconditions are recorded here because they do not gate today:
  - harden the reviewer's prompt boundary (R15): instructions go in `system`, and documents are
    wrapped per file;
  - route a PR that touches files outside the sync-written set to `editor` (R16).

## Disposition of each finding

The numbering follows the [review log](2026-10-06-codebase-review.md).

| # | Finding | Tier | Destination | Why |
|---|---|---|---|---|
| R1 | translate forward resyncs with no glossary and no language rules (language label passed where a code is expected) | CORE | #348 | New issue #348. Glossary adherence in text forward already wrote goes to #154 (comment there); the language-rule residue is edition-side (see Carry-forward below). |
| R2 | Rebase ignores metadata.mode: resync/* whole-document PRs are re-run through the section-diff pipeline | FOLD | #169 | Folded into #169's metadata.mode dispatch box (W1, parented, not claimed). The comment gives the fix shape and notes it can land ahead of slice 2. |
| R3 | Rebase silently drops a file whose source fetch fails, bypassing the throw-before-reset guard | FOLD | #169 | Folded into #169 slice 2 as acceptance with a ContentClient test. The correction to the 'fail-closed' claim is posted on #259. Kept out of #280 because #291 edits those lines and slice 2 rewrites them. |
| R4 | Rebase fetches a renamed file's old content from the new path | FOLD | #169 | Folded into #169 slice 2's rename winner. The comment adds explicit rename rules and corrects #169's description of the divergence. |
| R5 | Branch writes are non-atomic: rebase resets to main then commits per file; sync PR creation commits per file | CORE | #280 | Adopts the open, unparented #280 (same defect), so nothing is detached. The rebase half is in scope. The sync-creation half (low on its own; #289 edits createTranslationPR; idempotency is W1's #92) is out of scope and recorded in the log. |
| R6 | GitHub reads treat every error as 'file not found'; no Octokit retry/throttling | FOLD | #169 | Folded into #169 slice 2 as the 404-only rule with a bounded GET-only retry. The client-wide retry plugin is noted as wrong because it retries POSTs (#92, D-2026-07-16). The comment also says to coordinate with #222. |
| R7 | Critical-path tests prove less than the count suggests | FOLD | #348 (SDK-boundary test); rest to #172 via PLAN.md | The SDK-boundary test rides in #348. The parity-guard-fires tests and the copy-test rewrites are written into PLAN.md Phase 5 as #172 acceptance for when it is scheduled. #172 is a W2 member of the parked #257. Rebase/index tests stay with #169's slices and translator tautologies with … |
| R8 | Section matcher returns the first exact/ID match: duplicate or co-translated headings overwrite each other silently | DEFER | deferred / log only | Low, with no field instance. The matcher sites and the co-translation case are added to PLAN.md Phase 2's duplicate-heading item. |
| R9 | fr typography inserts U+00A0 into jupytext `+++ {json}` metadata and table delimiter rows | FOLD | #325 | Same mechanism and function as #325. The comment widens it to table delimiter rows and `+++` lines and pairs the live fr pandas.md repair with #325's edition repair. Not adopted: #325 is in flight on its own branch. |
| R10 | Verbatim-directive fence walker misses plain-language fences, so the ml keep-English exercise policy silently stops applying | FOLD | #170 | Folded into #170's single fence walker. The comment supplies the validated walker and fixtures. |
| R11 | Section IDs are derived from raw heading text: adding a role or trimming whitespace re-translates the section | FOLD | #90 | Folded into #90 as a sixth defect of its class. The comment gives the dead-trim fix plus three tests; no role stripping, and not via #171. |
| R12 | Translator accepts any stop_reason except max_tokens (a refusal with partial text is committed as success) | FOLD | #342 | Already a step in #342 (treat a refusal stop_reason as a failed call). Log only; no comment. |
| R13 | Retry loops ignore retry-after, have no jitter, and give up after ~3s | FOLD | #173 | Folded into #173 / PLAN.md Phase 6's shared Claude-call helper. PLAN.md gets the evidence that maxRetries:0 dropped the SDK's retry-after/jitter handling, plus the stale '1s, 2s, 4s' text sites. #173 is a W6 (#264) member of the parked #257. |
| R14 | Malformed model output defaults to a passing value in three parsers | DEFER | deferred / log only | Belongs with #173's response-schema wrapper. Recorded here. |
| R15 | Reviewer prompt boundary is weak (```markdown fences closed by the first code-cell; no system prompt) — must close before auto-merge-mode active | DEFER | deferred / log only | Shadow-only today. Recorded here as a precondition for #103 active mode; the cheap delimiting part goes with the W4 #262 prompt batch. |
| R16 | Review mode grades against the glossary from the PR's own checkout | DEFER | deferred / log only | Recorded here as a #103 active-mode precondition: a PR touching files outside the sync-written set routes to editor. |
| R17 | Reviewer: a failed source fetch for one file is not gated | FOLD | #261 + PLAN.md Phase 4 reviewer fetch-gate line | Its primary host (the 404 rule) went to #169, so it is re-registered on W3 #261 as the validators' fallback names. The comment corrects the obvious 404-only fix. Because #257's re-cut may drop W3, it is also a durable PLAN.md Phase 4 line beside the review-mode items, carrying the fix shape: shrink the outer try or collect … |
| R18 | Source PR title is copied raw into the target PR title and body | DEFER | deferred / log only | Low severity and no field instance; recorded here. |
| R19 | `\translate-resync <unknown-lang>` widens to all languages instead of failing closed | DEFER | deferred / log only | Already in PLAN.md §1.2. The log notes the constraint on #281: if a language-scoped resync form is printed, it must fail closed. |
| R20 | User-facing recovery text says `/translate-resync` (wrong slash); rebase comment points resync PRs at a source PR they don't have | FOLD | #281 | The comment widens #281 to every surface that prescribes resync and adds a test guard. It also notes that the forward route it prescribes runs without glossary terms or language rules until #348 merges, so the new text should not ship in a release that precedes #348. No edge. |
| R21 | A merged source PR whose pull_request run receives no secrets never syncs and leaves no artefact (second mechanism for #282) | DEFER | deferred / log only | Second mechanism for #282 (a merged PR that yields no sync run and no artefact). Reconciliation should compare merged docs PRs against delivered sync PRs. |
| R22 | Rebase concurrency group can drop intermediate merges' rebases | FOLD | #280 | Rides inside #280: `queue: max` in the template plus a pinned main SHA in rebaseSinglePR. The edition rollout comes after the single-step write reaches v0. |
| R23 | `translate setup` scaffolds a root `_toc.yml` path filter but the action classifies only `<docs>/_toc.yml` | FOLD | PLAN.md Phase 3 setup-templates item | Its natural host, a deferred second no-sync mechanism noted for #282, is not a work item, so it is recorded on PLAN.md Phase 3's 'setup emits broken templates' item, with the trigger 'before translate setup scaffolds the next source workflow'. |
| R24 | Re-running `forward --github` force-pushes over open resync PRs | FOLD | PLAN.md Phase 3 forward re-run guard line (trigger: #177's forward-safety row) | Not a work item of its own. #177's forward-safety row covers dry-run semantics only and the open-PR force-push hazard is new, so the guard spec goes on a new PLAN.md Phase 3 line beside the forward --github items: list open `resync/*` PRs once per run, skip and count those files with a merge-or-close hint, fail closed if listing fails, keep … |
| R25 | `gitPrepareAndPush` assumes a clean default branch (detached HEAD stacks PRs; feature-branch commits leak; dirty edits lost) | DEFER | deferred (noted on PLAN.md Phase 3 forward re-run guard line) | The clean/detached-HEAD preflight in gitPrepareAndPush is written on the same PLAN.md Phase 3 line as the forward re-run guard, with the same trigger (#177's 40+ file drift-wave row), for the same future PR. |
| R26 | `status --write-state` safety check compares dates at day granularity | FOLD | #175 | Folded with the status --write-state config-overwrite fix into #175's config-precedence item, via PLAN.md Phase 3's status --write-state item (use the OUTDATED predicate). |
| R27 | `status --write-state` writes commander defaults (zh-cn, lectures, en) over an existing config | FOLD | #175 | Folded into #175's config-precedence item. PLAN.md Phase 3's [L] item gets the two acceptance points: a flagless write-state keeps the config; with neither -l nor a config, it errors. |
| R28 | A typo in `init --resume-from` silently restarts the whole edition | FOLD | #263 via PLAN.md Phase 3 (init -f resolver) | Folded into W5 (#263) territory. PLAN.md Phase 3's 'init -f substring match' item is widened to one resolver for -f and --resume-from. |
| R29 | Production dependency advisories (js-yaml, undici) and no automation to catch them | FOLD | #177 | Dependabot stays with #177's F101 row. The in-range js-yaml/undici lockfile bump is recorded in STATE.md as a chore for the next release's build. |
| R30 | CI/docs workflows: tag-pinned and stale actions; deploy-docs on Node 20 with unpinned mystmd; no PR docs build | FOLD | #177 + PLAN.md Phase 5 node24 item | Folded into #177's pinning rows. The deploy-docs Node 20 → 24 change (`.github/workflows/deploy-docs.yml:39`, the last Node 20 site) is added to PLAN.md Phase 5's open node24 item, bundled with #177's next-CI-edit rows; the log row points there. |
| R31 | Localization rule lookup reaches Object.prototype (`--localize constructor` crashes) | DEFER | deferred / log only | A one-line hasOwn guard for when #174 is picked up. Recorded here. |
| R32 | `$` patterns in String.replace with model output corrupt headings | FOLD | #90 | Folded into #90 (§4 changes the same helper). The comment gives both sites; PLAN.md Phase 2's line refs are updated. |
| R33 | No BOM/CRLF normalisation at ingress | DEFER | deferred / log only | Recorded here, beside PLAN.md's CRLF item. |
| R34 | Citation scan misses `{cite}` roles that wrap across lines | DEFER | deferred / log only | Low severity and no field instance; recorded here. |
| R35 | Quadratic bibliography parsing/appending | DEFER | deferred / log only | Not a present problem: about 35–40 ms on the largest real bibliography. |
| R36 | CLI state writes swallow errors | DEFER | deferred / log only | Goes with #175's recordSync, which should count failures. Recorded here. |
| R37 | `setup` ignores git add/commit status and prints `❌ undefined` | FOLD | PLAN.md Phase 3 setup-templates item | Folded with the root `_toc.yml` path-filter fix on PLAN.md Phase 3's setup-templates item (git identity and commit-status checks), with the same trigger. |
| R38 | `docs-folder: '.'` matches nested .md (incl. .github/); AGENTS.md documents a root-only filter that does not exist | FOLD | #307 | Folded into #307. The AGENTS.md root-level gotcha is left unchanged pending #307's ruling on what docs-folder '.' should match. Recorded here. |
| R39 | Rebase reads the source bibliography at HEAD instead of sourceCommitSha | FOLD | #169 | Folded into #169 slice 2: rebase reads the same snapshot sync read. Included in the #169 comment with the 'unknown' SHA guard. |
| R40 | Dev tooling end-of-life / unsupported combos; SDK lag | REJECT | rejected | The SDK part is already a step in #342; the dev-tooling part is #177's. |
| R41 | Coverage denominator is skewed | DEFER | deferred / log only | No gate consumes the coverage figure. Recorded here. |
| R42 | Nothing checks that the shipped bundle loads | FOLD | #169 | Automates #169's own per-slice bundle check as the first commit of slice 2: a complement to the seam, not a substitute (D-2026-07-24). |
| R43 | Action bundle carries no third-party license notices | DEFER | deferred / log only | Low severity and no field instance; recorded here. |
| R44 | `review --repo` cannot create issues on a repo lacking its labels, exits 0, and loses the session | DEFER | deferred / log only | Recorded here, beside PLAN.md Phase 5's 'review → issue creation end to end' task. |
| R45 | `backward` bulk never exits 0 on a partially translated repo | DEFER | deferred / log only | Already PLAN.md Phase 3 [M] (backward bulk union). |
| R46 | Argument/path hygiene: `git add` without `--`; forward local-write mode lacks containment check | DEFER | deferred / log only | Already PLAN.md Phase 3 [L] (-f path traversal). |
| R47 | Sync is neither serialised nor idempotent | DEFER | deferred / log only | Hosts are noted in the log (#92's idempotency, #281's wording). The source sync-workflow template's concurrency group gets its own deferred PLAN.md Phase 4 line, separate from the rebase force-push line that #280 carries, so closing #280 does not tick it. |
| R48 | parentId is wrong for every sibling after the first (dormant) | DEFER | deferred / log only | Dormant: nothing reads parentId. |
| R49 | Model prose in review comments can @-mention users or embed images | DEFER | deferred / log only | Would ride with reviewer prompt-boundary hardening if that becomes an item. |
| R50 | A CLI smoke test depends on the environment | DEFER | deferred / log only | Low severity and no field instance; recorded here. |
| R51 | Test-only settings leak into the production build | DEFER | deferred / log only | Low severity and no field instance; recorded here. |
| R52 | Old content is fetched at `${sha}^`, wrong for rebase-merged multi-commit PRs | DEFER | deferred / log only | Dormant (all observed merges are squash). Already in PLAN.md Phase 2; if implemented, the diff base is resolved once in #169 slice 2's shared builder. |

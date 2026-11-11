# 2026-11-11 — all 128 open issues validated against `main`; two fixes

**Trigger**: Matt asked for a review of the open issues, a plan and work order, each issue
checked for currency, and the highest-priority ones worked first. Checked at `80d4ae6`
(`main`, eleven commits past v0.30.0). No billed run and no GitHub write was made.

## Method

Five read-only passes, one per area (sync and rebase; CLI and whole-document; review;
localisation and language; trackers and debt), each reading the issue body and comments and
then the code it names. The clone is shallow, so verdicts rest on the source at `HEAD`, the
tags and CHANGELOG, not on `git log -S`. The per-issue rows are in the session transcript;
what follows is what changes the plan.

## What is no longer as written

- **Closable now**: #296 (ml round 2 shipped in v0.27.0 and v0.28.0; its remainder lives on
  #260 and #366), #250 (the editor answered; the rule shipped in v0.26.0), #248 (the experiment
  ran and is archived). **Duplicate**: #430's first half is #364; its own residue is the
  500-character cut in `--report-json`.
- **Fixed on `main`, close at the release**: #118 (by #421 and #422). #280 is fixed too, but
  has a stated close sequence (release, edition workflow patches, back-to-back merge test).
- **Partly done, body out of date**: #384 (exact match wins since v0.30.0; the substring
  fallback and `--resume-from` remain), #356 (`--report-json` has the totals; console and
  forward do not), #106 (summary fixed; discovery remains), #387 (scoped half shipped), #415
  (docs done), #234 (item 4 done), #334 (eight of nine boxes done by #394 and #395), #90 and
  #256 (per-defect status in the transcript: #90 d5, d6, d7 and #256 d1, d2 are open).
- **Tracker text owed**: #349 (still says #280 has no branch), #346 (table dated 2026-10-06),
  #340 (`@v0` is v0.30.0, with `ja`), #257 and #259 (latest release, W1's target, closed
  members), #262 (the 2026-09-01 date), #173, #176, #177, #204, #82, #154.
- **Superseded, a maintainer's call**: #227 (QuantEcon/project-benchmarks-translation runs
  replicate benchmarks), #204 and #82 (the carrier is now
  `D-2026-10-20-model-upgrades-measured-against-goldens` and #416).

Every other issue stands as written, though most cite line numbers that have moved.

## The order proposed

1. **Release v0.30.1** (Matt's: billed gate and rate check). It carries #412, #419, #421,
   #422, #423, #424, #426 and this session's two fixes. It unblocks #280's close sequence and
   so #349, measures #203's residual, repairs the two zh-cn lectures failing on #418, and lets
   zh-cn#308/#310/#311/#312 merge without the old rebase.
2. **#420**, the live zh-cn blocker with no PR: check the update premise before the model
   call, and say which case it is in the failure issue. With it, **#281** (the recovery
   text), which #348's fix unblocked.
3. **Reviewed text replaced or deletions lost, small and code-only**: #389 and #351 (rebase,
   easy on #423's one-commit write), #396 and #386 (a failed read taken as "gone"; no failure
   issue), #398 (the other half of #307, with its review change), #90 d6.
4. **CLI state trust, the rest of the cluster**: #378, #401, #134, #400, then #385 and #370.
5. **French queue, deterministic**: #325 then #324 in `typography.ts`, with the fr edition
   repair; #347's seven glossary entries.
6. **Review, deterministic half (W3, #261)**: #253, the source-fetch gate, #224, #157, #284.
7. **Held on a ruling, an editor or a billed run**: #432, #414, #205, #143, #327, #365, #339,
   #416, #375, the `docs-folder: '.'` ruling on #307, D1 for #178, #182 and #141.

## Fixed this session, on `claude/youthful-wright-rkvr54`

- **#307** (`0f551cb`): a rename counts as one only when the old path is also a markdown file
  in `docs-folder`. `classifyChangedFiles` sends any other to the changed list, the rebase
  builder applies the same test to the old path a sync PR recorded, and `processRenamedFile`
  refuses one that reaches it. A bundle run asserts the edition's old path is neither read
  nor deleted. An empty docs folder contains every path, so the `'.'` ruling is untouched.
- **#379 and #381** (`aaa596a`): `init --skip-existing` skips every lecture the edition has,
  warning when the state file is missing or unusable, and translates a lecture whose state
  file has no lecture beside it; the dry run applies the filter. State files load with
  `CORE_SCHEMA`, and `inspectFileState` names the key that rejects a file, printed by
  `doctor`, `status --write-state` and the skip warning.

Suite: 2,252 tests across 81 suites, lint and format clean.

## Not done

- No issue was closed, commented on or retitled: the closable list and the tracker edits
  above are proposals.
- #398 was left out of the #307 change on purpose: its deletion needs the matching
  `getSourceDiff` change in review, and a guard for a moved `_toc.yml`.
- The review's "before" read for a file renamed in from outside still fetches the old path
  from the source; it only affects what the reviewer is shown for a new file.

verified: 2026-09-23

# STATE

Where things stand, ~1 page. Read this first; trust it less as the `verified:` date ages.
Roadmap detail lives in the work-plan tracker **#257**, not here (PLAN.md predates it).

## In flight

- **fr typography fixes #324 and #325** (filed 2026-09-23 from the French editor's second
  round) — implementation branches in progress: **#324** (`fix/fr-elision-apostrophe`) sets the
  `fr` elision apostrophe before inline markup as U+2019; **#325**
  (`fix/typography-raw-html-blocks`) stops U+00A0 being inserted inside raw `<style>` blocks.
  The fr edition already carries both defects, so each fix comes with a one-off edition repair.
  Also held for measurement from the same round: the *Ramasse-miettes* and *Renvoyer* pins.
- **#326 and #203 — the whole-document paths** (filed / re-diagnosed 2026-09-23): those paths
  take the head region from the model, so a front-matter drop passes parity and is written
  (#326); #203 is re-diagnosed as a whole-document code-fence wrap, to be fixed by one unwrap
  helper shared with #118's forward path. Queued after #324 and #325.
- **#327 — narrowing `fr.additionalRules[2]`, measured 2026-09-23**: at 12 draws per arm per
  lecture the narrowed rule keeps 152/152 instructions imperative (current rule: 0/99),
  « On pose » 12/12, overshoot 0 in 36/36 draws — but the "Your first task" criterion fails:
  only 4/12 avoid « Votre (première) tâche » (« Votre première tâche consiste à… » in 6/12).
  One phrase to add, then re-measure `python_by_example` and run the blind pairwise judge; the
  result goes on #327.
- **ml calibration: round 4 is with the editor** — the round-3 answers
  (lecture-python-programming.ml#22, closed 2026-09-21) shipped in v0.29.2 (#315 `cd41558`:
  rules 27 → 28, glossary v0.7.0; Further Reading boundary `D-2026-09-21-…`, which unblocks the
  code move under #260). Round 4 (`numpy`, lecture-python-programming.ml#23) was regenerated
  with the v0.29.2 engine on 2026-09-21: three draws, draw 1 sent (bare endings 1 / 37 / 2),
  one `ml_repair.py` comma applied and disclosed — the first repaired seed; arm
  `experiments/ml-benchmark/arms/2026-09-21-round4-numpy-v0.29.2/`. Unreviewed as of
  2026-09-23, as are lecture-python-programming.ml#24 (the #22 answers applied to the reviewed
  pages) and ml#14 (exercise blocks restored). **Open: the rule-2 arm** — rewrite around the
  editor's everyday-speech test, judged held-out before it ships, not on his say-so alone
  (no issue; STATE and the logs are its tracker). Logs `2026-09-21-ml-round3-answers`,
  `2026-09-23-close-out`.
- **The standing plan is tracker #257** (2026-08-10 backlog review; supersedes #94/#198):
  all 67 open issues triaged and verified against v0.25.0, phases W0–W6 filed as
  sub-issues #258–#264. The dominant failure shape it names: **the failure path produces
  a success-shaped artifact** (#90-class). Doctrine: decisions and external clocks first;
  detection before repair; foundations before dependents. Its `## Where we stand` section is
  stamped 2026-09-01 and has drifted (latest release v0.27.0, W1 → v0.28.0) — re-stamp it.
- **W1 (#259) is the next P0** — declared-vs-delivered assertion + TOC structured merge,
  now targeting **v0.30.0** (retargeted on #259 as v0.28.0 and v0.29.0 shipped Malayalam rounds
  instead; the issue title still says v0.27.0). 0 of 7 boxes done. Fully unblocked; the one
  gate is #169 first or alongside. Scope grew 2026-08-19: a stale-resync detection box and the
  both-directions rule on the assertion (`files[]` under-declares: bib + state delivered
  undeclared). Two 2026-08-20 proposals on #259 are not yet in the box text: re-specify the
  stale-resync box as source snapshot vs source `main` (the #276 ruling), and bring all
  localisation detection (`_toc.yml` part captions + figure captions, one
  `checkLocalisationParity`) into W1.
- **#169 is the W1 gate, one slice per PR — only slice 1 so far.** Slice 1 landed 2026-08-19
  (#278, `228a317`) and nothing has moved since (no #169 PR; `src/github-content.ts` does not
  exist at `16e50f6`). Slice 2 (`src/github-content.ts`) is next, then the `metadata.mode`
  dispatch (F19) and the tri-state metadata parser (F139/F140). **The pattern each
  remaining slice follows**, established by slice 1: pass runtime-derived values in as
  arguments rather than importing them — `import.meta.url` lives alone in
  `src/runtime-paths.ts` (F123) on the Action side, which is what makes `src/action/*`
  loadable under Jest's CJS registry. **Verify against the built bundle rather than
  asserting**: identical `core.setOutput` set before/after, `action.yml` entry
  untouched, `import.meta.url` resolving through the same esbuild banner (so
  `../glossary` still lands on the repo-root glossary). **And grep for comments that
  explain whatever moved** — slice 1 left two files asserting that `index.ts` holds
  `import.meta.url` after it no longer did; nothing but a grep catches that.
- **#276 (sixth instance of the class, resync path)** — `\translate-resync` regenerates from
  the source PR's merge-time snapshot; fired in the field 2026-08-18. Fully measured 2026-08-19
  (ledger in #276); fallout repaired and byte-verified the same day (fa#158, fr#38 merged;
  recorded-vs-actual mismatch set zero). **The blanket moratorium was lifted 2026-08-20**
  (ruling on #276) and replaced by a precondition: `\translate-resync` only when no file of the
  PR has advanced on source `main` since it merged, i.e. for every path
  `git rev-list --count <mergeSha>..origin/main -- <path>` is zero. It is no longer the
  documented recovery — use `translate forward`, or `init -f` for an absent lecture, and never
  regenerate a natively-reviewed one — but the failure-issue template in `createFailureIssue`
  still prescribes it unconditionally (#281). The fix is re-specified as source snapshot vs
  source `main` (English against English), and `mode: rebase` reads the same frozen snapshot.
  The bug stays open; W1's stale-resync box carries the guard.
- **Contributor PRs #289 (#156) and #291 (#254 interim)** — reviewed in full and upgraded in
  place on kp992's branches in the 2026-09-01 sweep (byte-preserving `_toc.yml` edits instead
  of a `yaml.dump` round-trip; detail on #257 and the PR threads). Both still open 2026-09-23
  and now **conflicting with `main`**, on CHANGELOG `[Unreleased]` and
  `dist-action/index.js.map` only (`src/` merges clean; `git merge-tree`, 2026-09-23): #289 is
  9 behind (kp992 merged `main` in on 2026-09-20; CI green at `8b98a32`), #291 is 20 behind
  (untouched since 09-01). **Merge order #289 → #291.** #291 is meant to leave #254 open (W1's
  structured merge is the end state), but its body's negated closing phrase is parsed as a
  closing reference (`closingIssuesReferences` = #254). The two #297 residuals are #301 (open).
- **Glossary PR #69** (ja) — rebuilt on `main` 2026-09-01 with the thread's rulings applied
  (`ja.json` v1.1, the `ja` entry in `LANGUAGE_CONFIGS`, decision record
  `D-2026-09-01-ja-terminology-policy` on the branch; the Wikipedia cross-check idea is #300).
  Two reviewers have since agreed three more edits (オーソリティ中心性, 資本の限界生産力,
  連邦準備制度経済データ) and asked why `SCF` was left out (last reply 2026-09-21) — awaiting
  the maintainer's reply; the branch is 21 behind `main` and conflicting.

## Recently landed

- **`.dev/` → `.qe/dev/` (#314)** — the notes convention moves inside `.qe/`, the repository's
  QuantEcon folder, per the QEP-7 draft (QuantEcon/qeps#40): `.qe/README.md` states the folder's
  contract, `.qe/project.yml` points the `qe` workplan skills at tracker #257, and nothing under
  `.qe/` is git-ignored — working files live outside the tree (decision records
  `D-2026-09-21-notes-move-to-qe-dev`, `D-2026-09-21-no-scratch-in-tree`). Raw `log/` and
  `decisions/` entries keep their historical `.dev/` mentions.
- **2026-09-23 — v0.29.3 released** (release PR #329 `16e50f6`; payload #328 `a4fe00a`, on top
  of #322 `079b3c7` and #323 `ede10e6`): `fr` glossary v1.2 from the French editor's second
  round (Namespace → Espace de nommage, Heads → Face, the standard-normal context; the edition
  was aligned first in lecture-python-programming.fr#81), the harness post-reset check (#322,
  for #321) and the release rate check, step 4b (#323, for #320). §4a 84/84: 28/28 delivery +
  28/28 `engineVersion: 0.29.3` verdicts per lane, scenario 17 delivered on all three lanes;
  the first 4b rate check (`game-theory.md`) refused 0/12 on zh-cn, fa and ml.
  `v0` = `v0.29` = `16e50f6`; `@v0` smoke `engineRef: v0` on all three lanes. Tally on #329.
- **2026-09-21 — v0.29.2 released** (release PR #318 `5f74d74`; payload #317 `62504c1`, on #315
  `cd41558`): the scope sentence on the `ml` exercise rule that v0.29.1's failed gate called for
  (scenario 17 refused 5/12 at v0.29.0, 11/12 at v0.29.1, 0/24 with the sentence), carrying the
  editor's round-3 answers. §4a 84/84, `@v0` smoke clean — tally on #318. v0.29.1 (#316
  `7fe78a5`) stays tagged, never released: gate 83/84, CHANGELOG `[YANKED]`, log
  `2026-09-21-v0291-gate-scenario17`.
- **2026-09-18 — v0.29.0 released** (release PR #312 `a6fda54`; payload #311 `847ca9f`): ml
  native-review round 3 encoded (rules 23 → 27, glossary v0.6.0; lecture-python-programming.ml#13
  merged `a24e925`), the `style_examples` glossary mechanism shipped without data (every example
  set judged 50 : 50 held out by the blind pairwise judge), decision record
  `D-2026-09-18-ml-further-reading-lists-stay-english`. §4a 84/84, tally on #312. Log
  `2026-09-18-ml-round3`.
- **2026-09-14 — v0.28.1 released** (fix #308 `aae38d1`; release PR #309 `3de9024`): sync fires
  only for PRs merged into the default branch — `branches: [main]` in every published template
  (the sweep test enforces it) plus a `mergedIntoDefaultBranch` backstop — after
  lecture-python-programming#629 merged into `jb2` fired all three deployed syncs. The three
  stray PRs (lecture-python-programming.fr#79, .fa#166, .zh-cn#105) closed unmerged; the filter
  merged into the deployed workflows (lecture-python-programming#630, lecture-python-intro#846,
  lecture-python.myst#1056). §4a 84/84, tally on #309. Log `2026-09-14-jb2-sync-fallout`.
- **2026-09-03 — v0.28.0 released** (#303 `07e7c64`; release #304 `9284fbc`): the Malayalam
  editor's ml#12 answers encoded and the verbatim exercise-family policy enforced in code
  (`verbatim-directives.ts` on all three write paths + the `verbatimDirectives` review
  diff-check; `D-2026-09-03-ml-all-exercise-content-stays-english` supersedes the 09-01
  record), glossary v0.5.0, rules 24 → 23, harness scenario 28. §4a 84/84, 28/28 per lane;
  tally on #304.
- **Older releases** (detail in CHANGELOG, git history and `log/`): v0.27.0 = ml round 2
  (#297) + prompt caching on every translator call (#293) + `tool-review-injection/` (#285),
  gate record on #298; v0.26.0 = ml round 1 (#272, regeneration-verified #273) + verdict
  provenance (#247) + harness scenario 27; v0.25.0 = trust-gated resync + templates (#192),
  bibliography backfill (#117), deletion partitioning (#210), one-version E2E harness (#202);
  v0.24.0 = tech-debt Wave 1 (#158–#168, 51 findings); v0.23.0 = glossary resolution fixed
  both halves + diff-check provenance split; v0.22.0 = verdict v2 + `auto-merge-mode: shadow`;
  v0.21.0 and earlier per CHANGELOG.

## Blocked

- Nothing hard-blocked. Language PRs wait on native-speaker review (external cadence).

## Next

**Resume here (2026-09-23, after v0.29.3):**

0. **The fr engine queue, in this order**: finish, review and PR #324, then #325 (branches in
   progress, each with its fr edition repair), then #326 together with #203's fence unwrap.
   In parallel, **#327**: add the "Your first task" phrase, re-measure `python_by_example`, run
   the blind pairwise judge, and post the result on #327 before the narrowed rule ships.
1. **Merge #289, then #291** — each needs a `main` merge and a bundle rebuild first (see In
   flight). **Reword #291's body before merging**: its negated closing phrase would close
   #254. Then **triage the post-review arrivals** into W1–W6: #257 (stamped 2026-09-01) still
   lists #280 #282 #283 #284 #286 #287 #288 #290 #295 #296 #300 as untriaged, and #301, #307
   (`high-priority`) and #324–#327 have arrived since (#282, #287, #290 look W1-shaped; #307
   goes with slice 2).
2. **#169 slice 2: `src/github-content.ts`** (not started — no such file at `16e50f6`) —
   `tryFetchFileContent` plus **one** `buildFilesToSync` over a narrow `ContentClient`
   interface, replacing the two independently-maintained builders (`rebaseSinglePR` at
   `index.ts:279` and `fetchAllFileContents` at `:935`, as of `16e50f6`). This is the slice
   that makes F44's divergence and F36's error coercion disappear by construction rather than
   by patch — and unlike slice 1 it **can change behaviour on the rename path**. Both builders
   read the target from the old path; they differ in where the source's old content comes
   from (sync: `previousFilename` at `sha^`; rebase: the new path at `sha^`, which does not
   exist before a rename, so a rebased rename diffs against empty) and on a failed source
   fetch (sync records an error; rebase `continue`s silently, past the throw-before-reset).
   Unifying them picks a winner, so decide explicitly, say so in the PR, and pin it with a
   test. Fold in **#307**: the old path is never containment-checked against `docs-folder`,
   so a rename into the folder can delete a target file outside it.
3. Then the rest of #169 — `metadata.mode` dispatch (F19), tri-state metadata parser
   (F139/F140) — then W1 (#259) proper.

- **D1** at W2 (#260) kickoff — start the editions-side conversation early.
- **Watch**: no blanket resync moratorium (lifted 2026-08-20) — until W1's stale-resync guard
  ships, `\translate-resync` is safe only under #276's precondition (no file of the PR advanced
  on source `main` since it merged). #281's failure-issue template still prescribes it
  unconditionally, so check the precondition before following a failure issue's advice. The
  v0.25.0 watches have fired: the first organic sync batch and fr review both ran at 0.25.0
  (lecture-python-programming.fr#29, 2026-08-05), and the register rule they exercised is now
  measured in #327.
- **W4 (#262) prompt work** waits for the shadow window to close — on evidence, not the
  ~2026-09-01 marker (ruled 2026-08-10): QuantEcon/project-translation#23 is still open
  (week-7 check-in 2026-09-20), and its exit criterion, QuantEcon/project-translation#28
  (reported 2026-08-20), names the severity-category sharpening to make. Any model change
  gates on #82's frozen eval set first.

## Health & context

- `main` green; **1,590 tests across 67 suites** (zero skips, type-checked) as of
  `16e50f6`; lint at `--max-warnings 0` including root `*.mjs`, CI checks formatting and
  `.qe/dev/` path:line references. Note `npm test` fails 11 cli-smoke tests on a stale `dist/`
  — run `npm run build` first; that guard is deliberate, not a break.
- Highest-priority known bug class: the success-shaped failure (#90 defects 3–5, #276's two
  resync mechanisms, and the arrivals #280, #282, #287; freshest field instance 2026-08-19 —
  lecture-python-intro#839 merged and no sync run was created, #282). Latent members found
  since, not yet seen in the field: #307 (a rename can delete outside `docs-folder`) and
  #326 (a front-matter drop passes parity and is written). W1 is its detection layer.
- Prod dep advisories: **2** (`npm audit --omit=dev`, 2026-09-23) — `js-yaml` 4.3.0 (direct,
  high; fixed in 4.3.2) and `undici` 6.27.0 (transitive via `@actions/github` /
  `@actions/http-client`, moderate; fixed in 6.28.0), both with an in-range fix available.
  ESM-only `@actions/*` 3.x/9.x majors tracked as #177 F35.

## Map

[PLAN.md](PLAN.md) roadmap (pre-#257; tracker wins where they differ) ·
[FUTURE.md](FUTURE.md) feature ideas · [ARCHITECTURE.md](ARCHITECTURE.md) design
questions · [decisions/](decisions/) settled calls · [log/](log/) session notes ·
[README.md](README.md) the convention.

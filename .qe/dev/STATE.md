verified: 2026-09-23

# STATE

Where things stand, ~1 page. Read this first; trust it less as the `verified:` date ages.
Roadmap detail lives in the project trackers (reading order in
[`../NEXT-STEPS.md`](../NEXT-STEPS.md)), not here (PLAN.md predates them).

## In flight

- **Hardening project #349** (created 2026-10-06 from the 2026-10-05 codebase review). It has two
  work items:
  - **#348**: `translate forward` sends no glossary terms and no language rules, because it passes
    display labels where language codes are expected. This must land before the next `translate
    forward` run.
  - **#280** (adopted): rebase moves a PR branch in one step and queues its runs.

  The review's evidence for other open issues went as comments on #90, #154, #169, #170, #259,
  #261, #281 and #325; the per-finding disposition is in `log/2026-10-06-review-followup.md`.
- **fr typography fixes #324 and #325** (filed 2026-09-23 from the French editor's second
  round) — implementation branches in progress: **#324** (`fix/fr-elision-apostrophe`) sets the
  `fr` elision apostrophe before inline markup as U+2019; **#325**
  (`fix/typography-raw-html-blocks`) stops U+00A0 being inserted inside raw `<style>` blocks.
  The fr edition already carries both defects, so each fix comes with a one-off edition repair.
  Also held for measurement from the same round: the *Ramasse-miettes* and *Renvoyer* pins.
- **#326 and #203 — the whole-document paths** (filed / re-diagnosed 2026-09-23): those paths
  take the head region from the model, so a front-matter drop passes parity and is written
  (#326); #203 is re-diagnosed as a whole-document code-fence wrap, to be fixed by one unwrap
  helper shared with #118's forward path. Queued after #324 and #325. Measured on zh-cn at
  the v0.29.4 release (2026-10-09): `init` refuses the scenario 17 fixture `game-theory.md`
  on ~4% of draws (v0.29.3 0/36, v0.29.4 3/36, identical request bytes). Each report has
  #203's "transposed" shape, which is the source minus its first directive, consistent with the
  wrap. At that rate the 4b rule (≤ 1 of 12) fails ~8% of releases by chance; see #203.
- **#327 — narrowing `fr.additionalRules[2]`, measured 2026-09-23**: at 12 draws per arm per
  lecture the narrowed rule keeps 152/152 instructions imperative (current rule: 0/99),
  « On pose » 12/12, overshoot 0 in 36/36 draws — but the "Your first task" criterion fails:
  only 4/12 avoid « Votre (première) tâche » (« Votre première tâche consiste à… » in 6/12).
  One phrase to add, then re-measure `python_by_example` and run the blind pairwise judge; the
  result goes on #327.
- **ml calibration: round 4 is closed out; round 5 (`pandas`) is with the editor
  (2026-09-28).**
  - **Round 4.** The editor's 73 suggestions on `numpy` (lecture-python-programming.ml#23:
    touch rate 67% → 51%, lines accepted 22 → 70) are applied and merged as `7e373de`.
    His questions are on ml#25; ml#14 (exercise blocks restored) is still open.
    Dispositions: QuantEcon/project-translation `reports/2026-09-28-ml-numpy-review-disposition.md`.
  - **Engine outcome: code, not prompt.**
    - **#331** (`d9b243c`) adds the comma-splice lint and a fourth `ml_repair` repair, and
      rebuilds `ml_metrics`' prose scanner.
    - Its regeneration test (**#333**, arm `2026-09-28-round4-splice-repair-eval`) ran on 18
      fresh drafts. The split is preferred 68 : 8 by a reference-free Opus 5.5 judge
      (20 : 0 on `functions`, a lecture it was not built from) and 60 : 21 against his
      text; all 81 splits pass a two-reader screen. The splice rate falls 17.3 → 10.7 per
      100 lines on `numpy`, still above his 2.8, so the repair covers only part of the class.
  - **Prompt.** Of four trims measured before release (arm `2026-09-28-round4-prompt-trims`,
    192 drafts), only the rule-19 exception ships: **#335** (`7d58e01`, in v0.29.4).
    - It takes "have already seen / met" to `കണ്ടുകഴിഞ്ഞു`: `numpy` 0/19 → 23/23,
      `python_essentials` 4/12 → 10/12.
    - Watch item: it also turns the simple past at `numpy` 864 into the completive.
    - The three deletions (rule 12's "and em-dashes", rule 18(a)'s "always after
      `എന്നത്`", the glossary ban on `പ്രവർത്തിക്കുന്നു`) raised bare endings before code
      cells from 42% to 75% (p = 0.017) and were rejected. A deletion is not inert.
  - **Round 5** (`pandas`, lecture-python-programming.ml#26) was generated at `@v0`
    (v0.29.3): the cleanest of three drafts, with 11 scripted repairs disclosed. The arm is
    `2026-09-28-round5-pandas-v0.29.3`. No regeneration is needed for #335, which touches
    no sentence in `pandas`.
  - **Open, in order:**
    1. A second `ml_repair` PR: the bracketed-paragraph stop and a generalised `-ഉം` comma,
       then the lexical repairs (*see* → `നോക്കുക`, adverbial *element-wise*, standalone
       `മുൻ`), each with his lines as fixtures.
    2. **The rule-2 arm**, after his ml#25 Q4 answer.
    3. His round-5 review.

    Logs: `2026-09-28-ml-round4`. Opus 5.5 is scoped separately as **#334**.
- **Tracker #257 is parked** (2026-10-04, @mmcky: relevant, not urgent). It resumes when a
  release is assigned to W1, and its next planning session re-cuts it to W1 alone; the notes for
  that re-cut are in the 2026-10-06 comment on #259. The text below is as of 2026-09-23.
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
- **Glossary PR #69** (ja) — rebuilt on `main` 2026-09-01 with the thread's rulings applied
  (`ja.json` v1.1, the `ja` entry in `LANGUAGE_CONFIGS`, decision record
  `D-2026-09-01-ja-terminology-policy` on the branch; the Wikipedia cross-check idea is #300).
  Two reviewers have since agreed three more edits (オーソリティ中心性, 資本の限界生産力,
  連邦準備制度経済データ) and asked why `SCF` was left out (last reply 2026-09-21) — awaiting
  the maintainer's reply; the branch is 21 behind `main` and conflicting.

## Recently landed

- **2026-10-09 — v0.29.4 released** (release PR #354 `fcee846`; payload #291 `a872b53`, #289
  `e084e19`, #335 `7d58e01`): translated `_toc.yml` part captions survive a sync (#254), a
  failed new lecture's TOC entry is removed from the sync PR (#156), and the `ml` rule-19
  completive. §4a 84/84: 28/28 delivery + 28/28 `engineVersion: 0.29.4` verdicts per lane,
  scenario 17 delivered on all three lanes; the flat harness TOCs exercise the new target
  fetch, not the caption carry-forward. 4b went over threshold on zh-cn (2/12), and was judged
  pre-existing (see the #203 bullet). `v0` = `v0.29` = `fcee846`; `@v0` smoke `engineRef: v0`
  on all three lanes. Tally on #354; log `2026-10-09-v0294-release`.
- **#289 and #291 merged 2026-10-09** (kp992's contributor PRs, upgraded in place in the
  2026-09-01 sweep; shipped in v0.29.4). **#291** (`a872b53`, the #254 interim) carries the
  target's part captions forward in `src/toc-captions.ts`, matching parts by shared lectures and
  substituting only the caption lines. Its body's negated closing phrase closed #254 on merge,
  as predicted; the structured TOC merge that is #254's end state stays in W1 (#259). **#289**
  (`e084e19`; #156 closed on merge) splices a failed new lecture's entry out of the sync PR's
  `_toc.yml` and lists it in the PR body. It merged second, so its branch took `main` first, with
  a test of the two together: caption merge, then entry filter, hands back the target TOC byte
  for byte.
- **ml rule-19 exception (#335, `7d58e01`, 2026-09-28, released in v0.29.4)** — "have
  already seen / met" takes the completive `കണ്ടുകഴിഞ്ഞു`. It was measured in a four-arm,
  192-draft arm with three proposed deletions, which regressed terminal punctuation and were
  not shipped.
- **ml arms: #331 regeneration test, round-5 seed (#333, `866f91a`, 2026-09-28)** — the
  splice repair wins blind pairwise judgements on fresh drafts; `pandas` is sent as ml#26.
- **ml splice lint + repair, prose scanner rebuilt (#331, `d9b243c`, 2026-09-28)** —
  `comma_splice_resumptive` / `comma_splice_watch` / `comma_splice_rate` in `ml_metrics.py`
  and a fourth deterministic repair in `ml_repair.py` (finite verb + comma + resumptive pronoun
  → full stop). The scanner now reads `(` paragraphs and prose-directive bodies, follows
  CommonMark fences, and checks punctuation at paragraph ends and capitalisation at starts; the
  future-hortative watch is retired. 16 stdlib tests (`test_ml_lints.py`) from the editor's
  own lines. Experiment tooling only; promotion into the engine is #260.
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

*ml, 2026-09-28 (end)*: see the ml bullet under In flight — round 5 is with the editor, and
next is the second `ml_repair` PR; #335 shipped in v0.29.4.

*Release, 2026-10-09*: v0.29.4 is out (see Recently landed); the next release is v0.30.0 per
#346. This page's `verified:` stamp predates it, so a full re-verify is owed.

*Review, 2026-10-06*: **no `translate forward` run before #348 merges**. Every forward resync
since PR #31 (2026-03-19) has gone out without the edition's glossary and language rules. #325
has a proposed widening (2026-10-06 comment): table delimiter rows, which already break a table
in the fr edition's pandas lecture.

0. **The fr engine queue, in this order**: finish, review and PR #324, then #325 (branches in
   progress, each with its fr edition repair), then #326 together with #203's fence unwrap.
   In parallel, **#327**: add the "Your first task" phrase, re-measure `python_by_example`, run
   the blind pairwise judge, and post the result on #327 before the narrowed rule ships.
1. **Triage the post-review arrivals** into W1–W6: #257 (stamped 2026-09-01) still lists #280
   #282 #283 #284 #286 #287 #288 #290 #295 #296 #300 as untriaged, and #301, #307
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
- Prod dep advisories: **2, both high** (`npm audit --omit=dev`, 2026-10-06): `js-yaml` 4.3.0
  (direct; fixed in 4.3.2) and `undici` 6.27.0 (transitive via `@actions/github` /
  `@actions/http-client`; now flagged for `<=6.28.0`, so the fix is 6.28.1 or later). Both fixes
  are in range: run `npm update js-yaml undici` and rebuild as part of the next release's build.
  Dependabot stays with #177.
  ESM-only `@actions/*` 3.x/9.x majors tracked as #177 F35.

## Map

[PLAN.md](PLAN.md) roadmap (pre-#257; tracker wins where they differ) ·
[FUTURE.md](FUTURE.md) feature ideas · [ARCHITECTURE.md](ARCHITECTURE.md) design
questions · [decisions/](decisions/) settled calls · [log/](log/) session notes ·
[README.md](README.md) the convention.

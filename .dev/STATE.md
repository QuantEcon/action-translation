verified: 2026-08-19

# STATE

Where things stand, ~1 page. Read this first; trust it less as the `verified:` date ages.
Roadmap detail lives in the work-plan tracker **#257**, not here (PLAN.md predates it).

## In flight

- **v0.26.0 release cut 2026-08-17** — headline: the first inline native-review round
  encoded (ml glossary v0.3.0 + 18-rule set, #272; regeneration-verified, #273), plus
  verdict provenance (#247), config-preserving writers (#243), newline-terminated
  writers (#266/#267), harness scenario 27, and the resync-gate `startsWith` alignment.
  §4a gate **completed 2026-08-17** (verified 2026-08-19: harness scenario PRs
  02:36 → GitHub release Latest 02:50; `@v0` = `v0.26` = `e4e5710`, so the alias
  moved — no #109-class lag this time). The ml calibration programme is now
  one-lecture-per-round: stale seeds ml#2–#5 closed, round 2 open (ml#7, `functions`,
  engine `8625221`).
- **The standing plan is tracker #257** (2026-08-10 backlog review; supersedes #94/#198):
  all 67 open issues triaged and verified against v0.25.0, phases W0–W6 filed as
  sub-issues #258–#264. The dominant failure shape it names: **the failure path produces
  a success-shaped artifact** (#90-class). Doctrine: decisions and external clocks first;
  detection before repair; foundations before dependents.
- **W0 (#258) CLOSED 2026-08-11** — all twelve boxes, PRs #266–#269. The tail, decided
  by the owner one-by-one: **D1** deferred to W2 kickoff (box moved to #260 as a gate);
  **D3** recorded (`decisions/D-2026-08-11-bot-identity-machine-user.md` — machine user,
  not App; #221 closed, #61 stays as the migration task); **#256.3** verified on the
  harness rather than the calendar (scenario 27 @ `v0`=v0.25.0 — the backfilled entry
  delivered in test-translation-sync.zh-cn#710; evidence in #256); **#7** refreshed
  rather than marked `wontfix` (deck renamed + rewritten against v0.25.0, regenerated).
  Two carry-forwards: the sync metadata `files[]` **under-declares** (bib + state
  delivered, undeclared — benign inverse of #256 defect 1, belongs in W1's assertion),
  and the test source repo carries only the zh-cn sync workflow until the next
  unscoped harness run.
- **W1 (#259) is the next P0** — declared-vs-delivered assertion + TOC structured merge,
  now targeting **v0.27.0** (v0.26.0 shipped 2026-08-17 as the ml round-1 release).
  Fully unblocked; the one gate is #169 first or alongside. Scope grew 2026-08-19:
  a stale-resync detection box (#276 guard — code cells modulo localized
  comments/docstrings) and the both-directions rule on the assertion (`files[]`
  under-declares: bib + state delivered undeclared).
- **#276 (sixth instance of the class, resync path)** — `\translate-resync`
  regenerates from the source PR's merge-time snapshot; fired in the field
  2026-08-18. Fully measured 2026-08-19 (ledger in #276): zh-cn clean; fr numpy
  missed #595 (regeneration silently dropped the file — second mechanism); fa two
  stale state files + a pandas_panel divergence the hand-restore introduced.
  Repair PRs open: fa#158, fr#38. **Resync moratorium until the guard lands.**
- **Malayalam** — first-class harness language (26/26); its two seed reference
  translations await native review (#207); benchmark Phase 1 (#194) unrun.
- **Glossary PR #69** (ja) — open, awaiting native review + a `LANGUAGE_CONFIGS` entry.

## Recently landed

- **2026-08-19 — #276 triaged, measured, and repairs opened** (this change): labels
  + tracker/W1 bodies updated in place (sixth instance; W1 → v0.27.0; guard box with
  the localized-docstring caveat; label migration marked done-verified). Full
  recorded-vs-actual measurement of all 21 state files across fa/fr/zh-cn plus
  content probes — three first-pass claims reversed: zh-cn needs nothing, the fa
  pandas_panel "restore" (fa#155) itself diverged from source, and fr numpy's gap is
  a silent per-file drop by the regeneration, not stale state. Repair PRs:
  lecture-python-programming.fa#158 (two state files + pandas_panel URL form),
  lecture-python-programming.fr#38 (hand-port of the two #595 numpy edits — never
  `forward` a natively-reviewed lecture). Settle-week interaction checked: the
  workspace-lectures republish→delete sequence is unblocked (pandas/polars byte-clean
  on all three targets).
- **2026-08-11 — W0 S-fixes**: #230 `claude-opus-5` pricing entry
  ($5/$25/MTok; Opus 5 spend had reported as $0.000) + warn-once on unpriced models +
  `VALID_MODEL_PATTERNS` gains opus-5/fable-5; #234.4 resync gate aligned to the
  parser's `startsWith` across the scaffolder, all docs, and the harness template;
  #53 legacy `heading-map:` deprecation warning (removal is W6); #91 heading-maps.md
  now documents the real key format (heading text verbatim + `::` paths — the docs
  taught lowercase-hyphenated IDs no writer ever produced).
- **2026-08-11 — #116 closed both ways**: `forward` (#266) and `init` (#267) terminate
  written files with a newline; all three writers now do (sync always did). Helper
  lives in `commands/forward.ts` until #172's `finalizeTranslatedDocument` consolidates
  finalization. Competing external PR #232 closed with credit; its LF/CRLF
  byte-for-byte tests adopted.
- **2026-08-10 — the backlog review shipped** (#265, `77f09da`): report + two decision
  records on main, tracker + 7 phase issues filed, QEP-0002 labels applied.
- **Post-v0.25.0 fixes on main**: #244 falsifiable `engineVersion` + `engineRef`
  (`842528b`); #243 `writeConfig` read-modify-write, unknown keys survive (`597b2be`).
- **v0.25.0** (2026-08-04) — everything since Wave 1: #192 trust-gated workflow
  templates, #117 demand-driven bibliography backfill (red-by-design when a key
  resolves nowhere), #210 deletion partitioning (deletion-only PRs stop failing
  review; non-404 target-fetch failures fail the run), #202 one-version E2E harness,
  #237 ml packet rulings, #241 fr editor rules + glossary v1.1. Released, deployed,
  gated per AGENTS.md §4a; shadow gate field-validated (`wouldAutoMerge: true`
  recorded, no action). Watch item still open: the first organic **fr** review since
  the tag move exercises the new register rules for the first time.
- **Older releases** (detail in git history and `log/`): v0.24.0 = tech-debt Wave 1
  (#158–#168, 51 findings); v0.23.0 = glossary resolution fixed both halves +
  diff-check provenance split; v0.22.0 = verdict v2 + `auto-merge-mode: shadow`;
  v0.21.0 and earlier per CHANGELOG.

## Blocked

- Nothing hard-blocked. Language PRs wait on native-speaker review (external cadence).

## Next

- **W1 (#259)**: #169 first/alongside, then the boxes — declared-vs-delivered (both
  directions, folded into the body 2026-08-19), TOC merge, partial-PR annotation,
  #276 guard.
- **D1** at W2 (#260) kickoff — start the editions-side conversation early.
- **Merge the #276 repair PRs** (fa#158, fr#38) and hold the resync moratorium.
- **Watch**: first organic fr review (register rules); first organic sync batch after
  v0.25.0 (#117 backfill turns missing-bib-key runs red by design).
- **W4 prompt work** waits for the shadow-freeze lift (~2026-09-01); any model change
  gates on #82's frozen eval set first.

## Health & context

- `main` green; 1,516 tests (64 suites, zero skips, type-checked), lint at
  `--max-warnings 0` including root `*.mjs`, CI checks formatting and `.dev/`
  path:line references.
- Highest-priority known bug class: the success-shaped failure (#90 defects 3–5 plus
  #276's two resync mechanisms; freshest instance 2026-08-18, stale regeneration
  merged on fa). W1 is its detection layer.
- Prod dep advisories: **0**. ESM-only `@actions/*` 3.x/9.x majors tracked as
  #177 F35.

## Map

[PLAN.md](PLAN.md) roadmap (pre-#257; tracker wins where they differ) ·
[FUTURE.md](FUTURE.md) feature ideas · [ARCHITECTURE.md](ARCHITECTURE.md) design
questions · [decisions/](decisions/) settled calls · [log/](log/) session notes ·
[README.md](README.md) the convention.

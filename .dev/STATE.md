verified: 2026-08-19

# STATE

Where things stand, ~1 page. Read this first; trust it less as the `verified:` date ages.
Roadmap detail lives in the work-plan tracker **#257**, not here (PLAN.md predates it).

## In flight

- **v0.27.0 release cut 2026-09-01** — headline: the second inline native-review round
  encoded (ml glossary v0.4.0 + rules 18 → 24 + the first deterministic ml lints, #297;
  regeneration-checked in the same PR, decision record
  `D-2026-09-01-ml-exercise-statements-stay-english`), plus prompt caching on every
  translator call (#293), `tool-review-injection/` (#285), the `runReview` extraction
  (#278, #169 slice 1) and the harness editors block (#275). W1 (#259) did not make it
  and now targets v0.28.0. §4a gate status is recorded on the release PR.
- **v0.26.0 release cut 2026-08-17** — headline: the first inline native-review round
  encoded (ml glossary v0.3.0 + 18-rule set, #272; regeneration-verified, #273), plus
  verdict provenance (#247), config-preserving writers (#243), newline-terminated
  writers (#266/#267), harness scenario 27, and the resync-gate `startsWith` alignment.
  §4a gate **completed 2026-08-17** (verified 2026-08-19: harness scenario PRs
  02:36 → GitHub release Latest 02:50; `@v0` = `v0.26` = `e4e5710`, so the alias
  moved — no #109-class lag this time). The ml calibration programme is now
  one-lecture-per-round: stale seeds ml#2–#5 closed, round 2 open (ml#7, `functions`,
  engine `8625221`).
- **Prompt caching shipped 2026-08-28** (#292 → PR #293, v0.27.0-bound; outside #257):
  translator prompts now send `[stable(cache_control), volatile]` blocks; forecast
  ~45-50% off sync-run cost, live-verified. Telemetry semantics changed: `input-tokens`
  is now the *uncached* remainder — total prompt = input + cache-creation + cache-read
  (two new outputs); a zero cache-read on a multi-call run means the prefix broke.
  Remaining half of FUTURE.md idea 7 (`count_tokens` sizing) still open.
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
  now targeting **v0.28.0** (v0.27.0 cut 2026-09-01 as the ml round-2 + prompt-caching release, without W1; v0.26.0 shipped 2026-08-17 as the ml round-1 release).
  Fully unblocked; the one gate is #169 first or alongside. Scope grew 2026-08-19:
  a stale-resync detection box (#276 guard — code cells modulo localized
  comments/docstrings) and the both-directions rule on the assertion (`files[]`
  under-declares: bib + state delivered undeclared).
- **#169 is underway — the W1 gate, one slice per PR.** Slice 1 landed 2026-08-19
  (#278, `228a317`); slice 2 (`src/github-content.ts`) is next, then the `metadata.mode`
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
- **#276 (sixth instance of the class, resync path)** — `\translate-resync`
  regenerates from the source PR's merge-time snapshot; fired in the field
  2026-08-18. Fully measured 2026-08-19 (ledger in #276): zh-cn clean; fr numpy
  missed #595 (regeneration silently dropped the file — second mechanism); fa two
  stale state files + a pandas_panel divergence the hand-restore introduced.
  **Fallout repaired and byte-verified 2026-08-19** (fa#158, fr#38 merged; recorded-vs-
  actual mismatch set now zero). The bug itself stays open — W1 carries the detection
  guard. **Resync moratorium until the guard lands.**
- **Malayalam** — first-class harness language (26/26); its two seed reference
  translations await native review (#207); benchmark Phase 1 (#194) unrun.
- **Glossary PR #69** (ja) — native review complete (thread 2026-07-29 → 08-18); rebuilt on main 2026-09-01 with the `ja` `LANGUAGE_CONFIGS` entry and 72 review edits applied (`ja.json` v1.1, decision `D-2026-09-01-ja-terminology-policy`); awaiting the reviewers' confirming pass, then merge.

## Recently landed

- **2026-08-19 — #169 slice 1** (#278, `228a317`): `runReview` extracted to
  `src/action/review.ts` with 17 tests — the first ever to reach entry-point logic —
  plus `src/runtime-paths.ts` and a shared `core-logger.ts`. `index.ts` loses 124 lines
  and both its `path`/`url` imports; suite 1,516 → 1,533. The issue's figures were
  re-verified against `main` before starting and corrected in place: the file is
  **1,579 lines** (1,314 at audit time), churn 24 commits/6 months, all line references
  moved. Two audit claims amended rather than repeated — "zero exports" is really *no
  usable exports* (`fetchBibliographies` has no importer anywhere), and F17's
  `dist-action/glossary/` half was already fixed by #197, leaving only its coverage
  half live. Two guards earned their keep: the module-map test (#168) caught the new
  modules' absence from `docs/developer/architecture.md`, and Copilot's review caught
  an overclaiming comment, which led to two more that the extraction itself had
  falsified (`05ce0ce`).
- **2026-08-19 — #276 triaged, measured, and repaired**: labels
  + tracker/W1 bodies updated in place (sixth instance; W1 → v0.27.0; guard box with
  the localized-docstring caveat; label migration marked done-verified). Full
  recorded-vs-actual measurement of all 21 state files across fa/fr/zh-cn plus
  content probes — three first-pass claims reversed: zh-cn needs nothing, the fa
  pandas_panel "restore" (fa#155) itself diverged from source, and fr numpy's gap is
  a silent per-file drop by the regeneration, not stale state. Repair PRs:
  lecture-python-programming.fa#158 (two state files + pandas_panel URL form),
  lecture-python-programming.fr#38 (hand-port of the two #595 numpy edits — never
  `forward` a natively-reviewed lecture); **both merged and byte-verified 03:33Z**.
  Settle-week interaction checked: the workspace-lectures republish→delete sequence is
  unblocked (pandas/polars byte-clean on all three targets), and that plan's six-repo
  merge-order table was re-measured and updated (QuantEcon/workspace-lectures#48 — all
  four programming-family republishes ran green overnight).
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

**Resume here (2026-08-20):**

1. **#169 slice 2: `src/github-content.ts`** — `tryFetchFileContent` plus **one**
   `buildFilesToSync` over a narrow `ContentClient` interface, replacing the two
   independently-maintained builders (`index.ts:381` and `:1038` as of `228a317`) that
   have already diverged on the renamed-file case. This is the slice that makes F44's
   divergence and F36's error coercion disappear by construction rather than by patch —
   and unlike slice 1 it **can change behaviour on the rename path**: `:381` fetches the
   target's content from `previousPath` and so preserves an existing translation across
   a rename, while `:1038` has no rename branch at all. Unifying them picks a winner, so
   decide that explicitly, say so in the PR, and pin it with a test — this is the
   finding where an existing translation can be discarded.
2. Then the rest of #169 — `metadata.mode` dispatch (F19), tri-state metadata parser
   (F139/F140) — then W1 (#259) proper.

- **D1** at W2 (#260) kickoff — start the editions-side conversation early.
- **Watch**: first organic fr review (register rules); first organic sync batch after
  v0.25.0 (#117 backfill turns missing-bib-key runs red by design). Hold the resync
  moratorium until #276's guard ships.
- **W4 prompt work** waits for the shadow-freeze lift (~2026-09-01); any model change
  gates on #82's frozen eval set first.

## Health & context

- `main` green; **1,533 tests across 65 suites** (zero skips, type-checked) as of
  `228a317`; lint at `--max-warnings 0` including root `*.mjs`, CI checks formatting
  and `.dev/` path:line references. Note `npm test` fails 11 cli-smoke tests on a stale
  `dist/` — run `npm run build` first; that guard is deliberate, not a break.
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

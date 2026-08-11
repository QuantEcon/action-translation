verified: 2026-08-11

# STATE

Where things stand, ~1 page. Read this first; trust it less as the `verified:` date ages.
Roadmap detail lives in the work-plan tracker **#257**, not here (PLAN.md predates it).

## In flight

- **The standing plan is tracker #257** (2026-08-10 backlog review; supersedes #94/#198):
  all 67 open issues triaged and verified against v0.25.0, phases W0–W6 filed as
  sub-issues #258–#264. The dominant failure shape it names: **the failure path produces
  a success-shaped artifact** (#90-class). Doctrine: decisions and external clocks first;
  detection before repair; foundations before dependents.
- **W0 (#258) is nearly closed.** Done: D2 decided (no first-translate; partial PRs ship
  annotated — `decisions/D-2026-08-10-*.md`), label migration, closures (#89/#94/#198),
  #116 trailing newline (forward #266 + the init sibling #267, 2026-08-11), and the
  S-fix batch #230/#234.4/#53/#91 (this change). Remaining, none engineering-blocked:
  **D1** (global font mechanism — deferred to W2 kickoff), **D3** (bot identity —
  deferred until a migration is imminent; #221 closes when recorded), **#256.3** (`.bib`
  backfill — verify on the next organic sync batch), **#7** (presentation rename or
  `wontfix` — owner call).
- **W1 (#259) is the next P0** — declared-vs-delivered assertion + TOC structured merge,
  v0.26.0. Fully unblocked; the one gate is #169 first or alongside.
- **Malayalam** — first-class harness language (26/26); its two seed reference
  translations await native review (#207); benchmark Phase 1 (#194) unrun.
- **Glossary PR #69** (ja) — open, awaiting native review + a `LANGUAGE_CONFIGS` entry.

## Recently landed

- **2026-08-11 — W0 S-fixes** (this change): #230 `claude-opus-5` pricing entry
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

- **W1 (#259)**: declared-vs-delivered + TOC merge, with #169 first/alongside.
- **W0 tail**: verify #256.3 on the next organic batch; owner decisions D1 (at W2
  kickoff — start the editions-side conversation early), D3, #7.
- **Watch**: first organic fr review (register rules); first organic sync batch after
  v0.25.0 (#117 backfill turns missing-bib-key runs red by design).
- **W4 prompt work** waits for the shadow-freeze lift (~2026-09-01); any model change
  gates on #82's frozen eval set first.

## Health & context

- `main` green; 1,516 tests (64 suites, zero skips, type-checked), lint at
  `--max-warnings 0` including root `*.mjs`, CI checks formatting and `.dev/`
  path:line references.
- Highest-priority known bug class: silent partial delivery (#90 defects 3–5 as a
  class, freshest instance 2026-08-10 fr#29 — reported success, no error recorded).
  W1 is its detection layer.
- Prod dep advisories: **0**. ESM-only `@actions/*` 3.x/9.x majors tracked as
  #177 F35.

## Map

[PLAN.md](PLAN.md) roadmap (pre-#257; tracker wins where they differ) ·
[FUTURE.md](FUTURE.md) feature ideas · [ARCHITECTURE.md](ARCHITECTURE.md) design
questions · [decisions/](decisions/) settled calls · [log/](log/) session notes ·
[README.md](README.md) the convention.

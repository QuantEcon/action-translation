verified: 2026-07-15

# STATE

Where things stand, ~1 page. Read this first; trust it less as the `verified:` date ages.
Roadmap detail lives in [PLAN.md](PLAN.md), not here.

## In flight

- **PR #78** — fr programming-domain glossary terms; awaiting native review.
- **PR #71** — Malayalam (`ml`) draft; awaiting native-reviewer calibration batch.
  Glossary PR **#69** (ja) open, awaiting native review + a `LANGUAGE_CONFIGS` entry.

## Recently landed

- **Estate upgraded to v0.16.1** — all 9 pins across 4 repos (lecture-python-programming#575,
  .zh-cn#69, .fa#132, .fr#5). First time the estate is on one version; it spanned
  v0.13.0–v0.16.0 that morning. **zh-cn and fa now translate with Sonnet 5.** Deployment
  catalogue: QuantEcon/project-translation#7.
- **v0.16.0 and v0.16.1 released** — v0.16.0 was the Sonnet 5 default + `models.ts` + fr
  typography (`init` path only; sync wiring is #81); v0.16.1 the deep-review fixes (#83).
  `v0`/`v0.16` now move as an explicit, spelled-out release-checklist step — `v0` had sat on
  v0.7.0-era code for 9 releases while the README recommended it.
- **Sonnet 5 validated for zh-cn/fa** — 26/26 correct PRs per language; 9.4/10 translation vs
  the Dec-2025 Sonnet 4.5 baseline's 9.5 (same judge), 9.6 under Opus 4.8. Answers
  QuantEcon/project-translation#5; note 4.6 — what they ran before — was never measured.
  See decisions/D-2026-07-15-sonnet5-validated.md.
- **Harness made trustworthy** (#86, #87) — it had been confidently wrong three ways: rubric
  frozen at the pre-v0.13.0 `heading-map:` format, documents truncated at 4000 chars
  (asymmetric en↔zh), pairs dropped silently. Baselines now committed — `.gitignore`'s bare
  `reports/` had been swallowing them since 2025-12.
- **fr footnote corruption repaired** — lecture-python-programming.fr#4.

## Blocked

- Nothing hard-blocked. Language PRs wait on native-speaker review (external cadence).

## Next

- **Watch the first real zh-cn/fa syncs** — the estate upgrade landed, so the next merged
  lecture PR is the first production Sonnet 5 translation. Two things to expect that look
  like regressions but are not: the new truncation guard may fail a long lecture that
  previously produced silently-truncated output (#83), and pagination now processes >30-file
  PRs completely, so a large PR costs more and produces a bigger diff than before.
- **PLAN Phase 1 remainder**: rebase no-op comments, `context.sha` vs `merge_commit_sha`,
  resync fail-closed, `@actions/*` + SDK major bumps (pair with node24, PLAN 5.8),
  rebase input-validation hardening (1.5).
- **#89 node24 + `@actions/*` majors** — GitHub already force-runs the action on Node 24
  despite `action.yml` declaring node20 (harness evidence, every run). Also clears the last
  prod advisories (undici via `@actions/*`). PLAN 5.8 + 1.4, one release.
- **#90 silent data loss in the sync merge path** — five ways translations vanish or English
  leaks in while the run reports success (REVIEW §6.1). Not covered by PLAN Phase 2; the
  Phase 2 round-trip test would catch three of them as a class, so Phase 2 first.
- Smaller review-round follow-ups: **#91** (heading-maps.md documents a key format the action
  has never written — nearly caused a bad rubric fix), **#92** (PR creation reports failure
  when the API times out *after* succeeding; naive retry would duplicate).
- Earlier review-round issues: **#81** (typography on sync path), **#82** (model-swap
  eval — see REVIEW §7.4 for a concrete deterministic design).

## Health & context

- `main` green; ~1,068 tests (40 suites), lint now actually covers all 78 files
  (`--max-warnings 0`) and CI checks formatting.
- Highest-priority known bug: issue **#65** — translator drops `(label)=` anchors
  (PLAN Phase 2), plus the silent-data-loss family documented in REVIEW §6.1.
- Prod dep advisories: 1 high / 2 moderate remaining (undici via `@actions/*` majors).

## Map

[PLAN.md](PLAN.md) roadmap · [FUTURE.md](FUTURE.md) feature ideas ·
[ARCHITECTURE.md](ARCHITECTURE.md) design questions · [decisions/](decisions/) settled calls ·
[log/](log/) session notes · [README.md](README.md) the convention.

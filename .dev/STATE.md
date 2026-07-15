verified: 2026-07-15

# STATE

Where things stand, ~1 page. Read this first; trust it less as the `verified:` date ages.
Roadmap detail lives in [PLAN.md](PLAN.md), not here.

## In flight

- **lecture-python-programming.fr#4** — the `apply.mjs` repair run for the shipped
  footnote corruption (one byte, `pandas.md`); mechanical, ready to merge.
- **PR #78** — fr programming-domain glossary terms; awaiting native review.
- **PR #71** — Malayalam (`ml`) draft; awaiting native-reviewer calibration batch.
  Glossary PR **#69** (ja) open, awaiting native review + a `LANGUAGE_CONFIGS` entry.

## Recently landed

- **PR #83** merged 2026-07-15 (squash, `bb17926`) — high-severity fixes from the
  2026-07-15 deep review (`REVIEW-FABLE5-2026-07-15.md`): fr typography definition-label
  fix, LICENSE, lint-glob fix + prettier + CI format gate + `--max-warnings 0`,
  PLAN Phase 1 pagination/CRLF/stop_reason/content[0]/glossary fixes, in-range dep
  advisories, docs [H] accuracy fixes. Unreleased on `main` — v0.16.1 is the next chore.
- **v0.16.0** released 2026-07-15 — default model → `claude-sonnet-5` (centralized in
  `src/models.ts`), thinking OFF (settled: D-2026-07-14), deterministic fr typography
  (`init` path only — sync wiring is issue #81), glossary-review tooling + skill.
- **`v0` floating tag moved to v0.16.0** (was stuck at v0.7.0-era, 115 commits behind,
  with README recommending `@v0`). Moving `v0` is now a release step.
- **fr is in production**: `lecture-python-programming.fr` exists with a sync workflow
  pinned `@v0.16.0`. Note: zh-cn/fa workflows pin `@v0.15.0` → those languages translate
  with Sonnet 4.6 while fr uses Sonnet 5 (decide: deliberate staging or drift?).

## Blocked

- Nothing hard-blocked. Language PRs wait on native-speaker review (external cadence).

## Next

- Merge lecture-python-programming.fr#4 (the repair run output).
- **Release v0.16.1** with the #83 fixes; move the `v0`/`v0.16` tags (release step).
- **PLAN Phase 1 remainder**: rebase no-op comments, `context.sha` vs `merge_commit_sha`,
  resync fail-closed, `@actions/*` + SDK major bumps (pair with node24, PLAN 5.8),
  rebase input-validation hardening (1.5).
- New issues from the review round: **#81** (typography on sync path), **#82** (model-swap
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

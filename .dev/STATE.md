verified: 2026-07-05

# STATE

Where things stand, ~1 page. Read this first; trust it less as the `verified:` date ages.
Roadmap detail lives in [PLAN.md](PLAN.md), not here.

## In flight

- **PR #72** — `.dev/` notes convention pilot (this folder; spec QuantEcon/QuantEcon.manual#103,
  pilot QuantEcon/action-translation#73). Seeds `.dev/` from the 2026-07-05 deep technical review.
- **PR #71** — Malayalam (`ml`) language support, draft; awaiting a native-reviewer calibration
  batch. Glossary PRs **#68** (fr) / **#69** (ja) open, awaiting native review + missing
  `LANGUAGE_CONFIGS` entries.

## Blocked

- Nothing hard-blocked. Language PRs wait on native-speaker review (external cadence).

## Next

- **PLAN Phase 1** — v0.15.1 patch: API pagination, CRLF PR-body parse fix, truncation guards,
  rebase-mode input-validation hardening (security — pulled forward), dependency security bumps,
  CHANGELOG date fix. See [PLAN.md](PLAN.md).

## Health & context

- Released **v0.15.0**; `main` clean. Production targets: `zh-cn`, `fa`; `ml`/`fr`/`ja` in flight.
- Highest-priority known bug: issue **#65** — translator drops `(label)=` anchors before
  headings; broke a zh-cn build once already (PLAN Phase 2).
- Test suite green (~5s); note ~30 tests in `translator.test.ts` don't exercise the module
  (PLAN Phase 5).

## Map

[PLAN.md](PLAN.md) roadmap · [FUTURE.md](FUTURE.md) feature ideas ·
[ARCHITECTURE.md](ARCHITECTURE.md) design questions · [decisions/](decisions/) settled calls ·
[log/](log/) session notes · [README.md](README.md) the convention.

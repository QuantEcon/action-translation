---
verified: 2026-07-05
---

# STATE

One-page snapshot of where the project is. Read this first; if `verified` is stale, discount it
and confirm against the repo. Roadmap detail is in [PLAN.md](PLAN.md), not here.

## In flight

- **PR #72** — `.dev/` notes convention + this pilot restructure (QuantEcon/action-translation#73,
  design QuantEcon/QuantEcon.manual#103). Seeds `.dev/` from the 2026-07-05 deep technical review.
- **PR #71** — Malayalam (`ml`) language support, draft; blocked on a native-reviewer calibration
  batch. Glossary PRs **#68** (fr) / **#69** (ja) open, blocked on native review + missing
  `LANGUAGE_CONFIGS` entries.

## Blocked

- None hard-blocked. Language PRs await native-speaker review (external cadence).

## Next

- **PLAN Phase 1** — v0.15.1 patch: `pulls.listFiles` pagination, CRLF in review-mode PR-body
  parse, `stop_reason` truncation guards, `@actions/*` + `undici` security bumps, CHANGELOG date
  fix. See [PLAN.md](PLAN.md#phase-1--patch-release-v0151-small-high-confidence-fixes).

## Health & context

- Released **v0.15.0**; `main` clean. Production targets: `zh-cn`, `fa`. `ml`/`fr`/`ja` in flight.
- **Highest-priority known bug**: issue **#65** — translator drops `(label)=` anchors before
  headings; has broken a zh-cn Jupyter Book build (PLAN Phase 2).
- **Security, now public in PLAN Phase 4**: rebase mode trusts attacker-influenceable PR-body
  metadata (`src/index.ts:164-182`). Move this fix up before issue #66 freezes the metadata as a
  public contract.
- Test suite green (~5s); note ~30 tests in `translator.test.ts` don't exercise the module
  (PLAN Phase 5).

## Map

[PLAN.md](PLAN.md) roadmap · [FUTURE.md](FUTURE.md) feature ideas ·
[ARCHITECTURE.md](ARCHITECTURE.md) design questions · [decisions/](decisions/) settled calls ·
[log/](log/) session history · [README.md](README.md) the convention.

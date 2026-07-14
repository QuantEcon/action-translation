# 2026-07-14 — STATE refresh + R2 wording (PR #72 review)

Review of the `.dev/` pilot PR (#72) surfaced two small fixes, applied here:

1. **STATE.md was stale on arrival** — it listed PR #68 (fr glossary) as open/awaiting review
   with a missing `LANGUAGE_CONFIGS` entry, but #68 merged 2026-07-14 with its config wiring.
   Moved fr to a new "Recently landed" section, dropped it from the in-flight list, updated
   Health & context (fr now enabled), and bumped `verified:` to 2026-07-14.
2. **ARCHITECTURE.md R2** described the rebase PR-body channel as an "input surface whose
   validation is being hardened in PLAN Phase 1.5" — more trust-boundary detail than the
   public-content rule wants while the fix is unshipped. Dropped that clause; kept the
   legitimate engineering rationale (size cap, editability, staleness).

Refs: PR #72, issue #73.

# Rebase-on-merge over queue/batching for sync-PR conflicts

**Context**: Issue #63 — 62% of translation PRs on lecture-python-programming.fa hit merge
conflicts. Translation PRs are full-file snapshots, so 3-way merge is structurally impossible
when siblings touch the same file.

**Decision**: A `rebase` action mode: when a translation PR merges, regenerate open sibling
PRs against the new main, with a section-level translation cache making the common case
zero-API-cost. Rejected: sequential merge queue (latency, complexity); batching (loses per-PR
provenance); auto-merge alone (sidesteps the root cause; race-prone without rebase).

**Consequences**: Shipped v0.14–v0.15.0. Auto-merge + editor digest (the design's "Stage 2")
deliberately deferred — now FUTURE.md idea 1. Regeneration is idempotent; merge order doesn't
matter.

**Refs**: issue #63, PR #64; full design in git history: `dev-notes/FIX-ISSUE-63.md`.

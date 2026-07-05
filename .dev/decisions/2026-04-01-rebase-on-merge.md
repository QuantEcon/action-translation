---
scope: repo
superseded_by: null
---

# Rebase-on-merge over queue/batching for sync-PR conflicts

**Decision**: Fix issue #63 (62% translation-PR conflict rate) with a `rebase` action mode:
when a translation PR merges, regenerate sibling PRs against the new main, with a section-level
translation cache making the common case zero-API-cost. Auto-merge + editor digest (its
designed "Stage 2") deliberately deferred — now FUTURE.md idea 1.

**Why**: Translation PRs are full-file snapshots, so 3-way merge is structurally impossible;
regeneration against current main is cheap and idempotent, and order of merges doesn't matter.

**Rejected**: sequential merge queue (adds latency, high complexity); batching (loses per-PR
provenance); auto-merge alone (sidesteps the root cause; race-prone without rebase).

**Refs**: issue #63, PR #64, v0.14–v0.15.0; full design in git history: `dev-notes/FIX-ISSUE-63.md`.

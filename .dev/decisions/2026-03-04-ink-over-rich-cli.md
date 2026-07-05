---
scope: repo
superseded_by: null
---

# `ink` over Python `rich` for the interactive review UI

**Decision**: Keep the CLI single-language TypeScript with ink v4; a full Python/`rich`
rewrite is documented as a conditional fallback (FUTURE.md idea 11).

**Why**: Unified codebase and direct imports of the core engine beat nicer terminal rendering.

**Refs**: 2026-03 plan Phase 3a (git history: `dev-notes/PLAN.md`).

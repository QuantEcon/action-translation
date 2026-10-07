# `ink` over Python `rich` for the interactive review UI

**Context**: The `review` command needed interactive terminal UI; `rich`/`textual` (Python)
render MyST better, but would split the project across two runtimes.

**Decision**: Stay single-language TypeScript with ink v4; a full Python/`rich` rewrite is
documented as a conditional fallback (FUTURE.md idea 11).

**Consequences**: Unified codebase and direct imports of the core engine; accept weaker
terminal rendering until it demonstrably blocks reviewers.

**Refs**: 2026-03 plan Phase 3a (git history: `dev-notes/PLAN.md`).

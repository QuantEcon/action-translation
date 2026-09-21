# CLI renamed `resync` → `translate`; `init` command added

**Context**: The CLI outgrew its resync origin — it manages the whole lifecycle of translated
lecture repos.

**Decision**: Rename the binary to `translate`; add `init` to bulk-bootstrap a target repo.

**Consequences**: Eight-command lifecycle CLI (`status`/`backward`/`review`/`forward`/`init`/
`setup`/`doctor`/`headingmap`).

**Refs**: PR #23; 2026-03 plan Phase 5 (git history: `dev-notes/PLAN.md`).

# Whole-file evaluation for backward Stage 2

**Context**: Backward analysis originally planned one LLM call per section, mirroring forward
sync.

**Decision**: Evaluate one whole file per call. Experiment on a 51-file repo: 182 → 32 API
calls with *better* results (more high-confidence findings, less noise) — cross-section
context reduces false positives.

**Consequences**: Raised the open question of whether forward sync should follow
(ARCHITECTURE.md Q3); experiment data in `experiments/forward/`.

**Refs**: 2026-03 plan Phase 3b (git history: `dev-notes/PLAN.md`).

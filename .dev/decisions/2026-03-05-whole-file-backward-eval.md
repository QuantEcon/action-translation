---
scope: repo
superseded_by: null
---

# Whole-file evaluation for backward Stage 2

**Decision**: Backward analysis evaluates one whole file per LLM call instead of one call per
section.

**Why**: Experiment on a 51-file repo: 182 → 32 API calls with *better* results (more
high-confidence findings, less noise) — cross-section context reduces false positives.

**Refs**: `experiments/forward/`; raised ARCHITECTURE.md Q3 (should forward sync follow?).

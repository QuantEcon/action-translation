---
scope: repo
superseded_by: null
---

# LLM improvements to unchanged translations: accept and monitor

**Decision**: When Claude opportunistically improves an unchanged target section during an
update (e.g. fixing a transliteration), accept it rather than constraining the prompt.

**Why**: Observed improvements were genuine; a strict-preservation flag remains an option if
review cost grows (field evidence of that cost noted in the #63 discussion).

**Refs**: issue #1 (close with a pointer here — PLAN Phase 8).

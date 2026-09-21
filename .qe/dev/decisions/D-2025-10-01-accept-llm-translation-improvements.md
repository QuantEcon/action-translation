# LLM improvements to unchanged translations: accept and monitor

**Context**: During section updates Claude sometimes improves *unchanged* target content
(e.g. fixing the Leontief transliteration) — technically out of scope for the diff.

**Decision**: Accept such improvements rather than constraining the prompt; monitor. A
strict-preservation flag remains an option if review cost grows (field evidence of that cost
noted in the #63 discussion).

**Consequences**: Reviewers may see edits outside the source diff in translation PRs; issue #1
closes with a pointer here (PLAN Phase 8).

**Refs**: issue #1.

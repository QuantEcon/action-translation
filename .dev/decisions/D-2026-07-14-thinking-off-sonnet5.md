# Keep extended thinking OFF for translation on Sonnet 5

**Context**: Migrating the default model to `claude-sonnet-5` (PR #75) raised the
question of whether to enable adaptive thinking. Sonnet 5 runs adaptive thinking
by default when the `thinking` param is omitted (Sonnet 4.6 ran it off), so we
pinned `DEFAULT_THINKING = disabled` to preserve shipped behaviour, and ran an
experiment to decide deliberately. A prior belief that "thinking improved results
on 4.6" turned out never to have been deployed (the shipped action never sent a
thinking param).

**Decision**: **Leave thinking off.** A calibration (`fr` × `pv.md` × off /
adaptive·medium / adaptive·high) plus a diagnostic show that adaptive thinking
**self-regulates to ~zero on translation**: the diagnostic proves the param
engages (1607 → ~6000 output tokens on a reasoning prompt), but on the
translation it added +24–32 tokens even at `effort: high`. The three variants
differ ~20% by line, but equidistantly (A-B ≈ A-C ≈ B-C) — uniform run-to-run
noise, not a thinking effect — and the Opus judge saturates at 9.25–10. No
systematic signal to gain, so the full 96-cell matrix (~$36) was not run.

**Consequences**: `DEFAULT_THINKING = disabled` stands; the `content[0]` text
extraction in translator/reviewer stays valid. The experiment surfaced two
follow-ups unrelated to thinking: (1) real `fr` cost is ~$0.21/file (~4× the
docs, glossary-dominated) — correct the doc cost tables; (2) baseline-quality
gaps for the French init — "payments" not pinned in the glossary (paiement/
versement drift), missing NBSP before `; : ! ?` — route to a native review of the
shipped-config output rather than a blind thinking ranking.

**Refs**: `experiments/thinking-sonnet5/REPORT.md` + `PLAN.md`; PR #75 (model),
#76 (experiment), #77 (docs publishing); memory `thinking-eval-pending`.

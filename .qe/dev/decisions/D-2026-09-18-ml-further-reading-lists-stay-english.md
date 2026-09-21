# Malayalam: Further Reading lists stay in English

**Context**: In the third inline review round (lecture-python-programming.ml#13, `matplotlib`,
44 suggestion blocks, 2026-09-12) the editor of record (@adisankarmt) replaced all four bullets
under `## Further Reading` with the English source text — each bullet a link to an outside
resource plus a short description ("* The [Matplotlib gallery](…) provides many examples.").
The engine had translated the descriptions. He left the three all-English bullets of the
lecture's opening feature list untouched, so this is not a general preference for English
bullets; it is the reference list specifically. Like the two earlier ml scope rulings
(`D-2026-08-17-ml-math-heavy-sections-stay-english`, and the exercise rulings that ended in
`D-2026-09-03-ml-all-exercise-content-stays-english`), it changes *what* is translated rather
than *how*, so it needs its own record. Analysis:
QuantEcon/project-translation `reports/2026-09-18-ml-matplotlib-review-disposition.md`. #promote

**Decision**: Accepted by @mmcky, 2026-09-18. For `ml`, a list of pointers to outside
resources — the bullets of a "Further Reading" / "References" style section, each a link plus a
short description — stays wholly in English, byte-identical to the source including its line
wrapping. It is encoded as a **prompt rule** for now, not in code: unlike the exercise family,
the region has no directive to key on, and where the editor draws the line (this section
heading, any list of external links, any link-led bullet) is an open question put to him on
lecture-python-programming.ml#22. Once he answers, a boundary with no judgement in it should
move to `verbatim-directives.ts`-style restoration, as the exercise ruling did.

**Consequences**: Retention checks and the script-ratio band must treat an all-English
further-reading list as compliant, never as under-translation; the review judge inherits the
rule through the shared `additionalRules` injection. The reviewed `matplotlib` on the edition's
`main` already complies (the block is byte-identical to the source after the normalisation
commit on ml#13). Regeneration evidence for the prompt rule is in
`experiments/ml-benchmark/arms/2026-09-18-round3-rules-exemplars-sonnet5/`.

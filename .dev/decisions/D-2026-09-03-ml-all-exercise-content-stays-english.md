# Malayalam: all exercise content stays byte-identical English, pending per-exercise rulings

**Context**: Two earlier rulings drew the translation-scope boundary inside exercises by the
*kind* of content: `D-2026-08-17-ml-math-heavy-sections-stay-english` kept math-heavy Hint and
Solution sections in English, and `D-2026-09-01-ml-exercise-statements-stay-english` extended
that to exercise statements whose content is probabilistic or mathematical, with mixed
sentences split clause by clause and pure-programming exercises translated normally (the rule
text shipped in v0.27.0 said such an exercise "MUST NOT be left in English"). Both boundaries
were the model's judgement call. Asked to confirm the 09-01 reading on
lecture-python-programming.ml#12, the editor of record (@adisankarmt, 2026-09-01) answered
that he has not made a final decision on exercises: "For now, please retain all
exercise-related content in English and keep it byte-for-byte identical to the source. I will
review each exercise individually and decide later which parts, if any, should be translated
into Malayalam." This is a translation-*scope* change and a reversal of a two-day-old ruling,
so it needs its own record. #promote

**Decision**: Accepted by @mmcky, 2026-09-03. For `ml`, every `{exercise}`,
`{exercise-start}…{exercise-end}`, `{hint}`, `{solution}` and `{solution-start}…{solution-end}`
directive is copied verbatim from the English source — fence line, label, body and closing
fence — until the editor rules on that exercise individually. This supersedes
`D-2026-09-01-ml-exercise-statements-stay-english` and subsumes
`D-2026-08-17-ml-math-heavy-sections-stay-english` for as long as it stands (the 08-17 reader
argument is unchanged; its boundary is simply moot while everything in an exercise is English).
Per-exercise decisions the editor later makes are carried in the edition repo as reviewed text
and, if a pattern emerges, come back here as a new ruling.

Because the rule now has no judgement boundary, it is encoded **deterministically**, not as a
prompt instruction: a post-processing step restores the listed directive blocks from the
source in both init and sync output for `ml`, and a diff-check fails an `ml` translation whose
block differs from the source. The prompt keeps only a short statement of the scope so the
translator does not waste tokens on text that will be overwritten; the v0.27.0 clause
instructing the model to translate pure-programming exercises is removed. This is the first ml
scope rule that is fully mechanical, and it is the shape #260 (W2, localisation becomes
deterministic) and the #189 Phase 3 lint graduation ask for.

**Consequences**: The ex5 "over-read" logged on #296 for the v0.27.0 regeneration arm was
correct behaviour under this ruling and is withdrawn as a miss. Retention checks and the
script-ratio band (#229 lineage) must treat an all-English exercise, hint or solution block as
compliant, as the 08-17 and 09-01 records already required. The two merged `ml` lectures are
restored to compliance by lecture-python-programming.ml#14 (`functions`: 4 of 10 blocks;
`python_by_example`: 7 of 10); `matplotlib` (ml#13) was already compliant. The harness carried
no exercise, hint or solution directive in any fixture, so the fixture suite gains one before
the engine change is validated. Nothing here generalises beyond `ml`.

**Refs**: issue #189 (Phase 2, round 2 follow-up), #296, #260,
lecture-python-programming.ml#12 (the ruling), ml#14 (restoration), ml#7 lines 484, 515, 517,
557–565, 626, `D-2026-09-01-ml-exercise-statements-stay-english`,
`D-2026-08-17-ml-math-heavy-sections-stay-english`, QuantEcon/project-translation
`reports/2026-09-01-ml-functions-review-disposition.md`.

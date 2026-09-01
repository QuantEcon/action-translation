# Malayalam: exercise statements with mathematical content stay in English

**Context**: The 2026-08-17 ruling (`D-2026-08-17-ml-math-heavy-sections-stay-english`) keeps
Hint and Solution *sections* whose prose is predominantly mathematical reasoning wholly in
English. In the second inline native review round (118 suggestion blocks on
lecture-python-programming.ml#7, `functions`), the reviewer applied the same logic to
exercise *statements*, which that ruling did not cover: the coin-flip random device of
exercise 3 (lines 557–565) and the binomial sentence of exercise 2 (517) were returned to
English wholesale; two definitional-maths sentences (484, 515) became **hybrids** — the
mathematical clause in English, the programming instruction in Malayalam (`factorial` എന്ന്
പേരുള്ള ഒരു function എഴുതുക, *such that `factorial(n)` returns $n!$ for any positive integer
$n$.*); and the purely programming exercise 5 stayed Malayalam. His round-2 summary: "retained
some of the exercises in english itself." The engine had translated these lines correctly
under the rules it had, so this is again a translation-*scope* change needing a maintainer
ruling rather than routine encoding. #promote

**Decision**: Accepted by @mmcky, 2026-09-01 ("Yes A extend"), as recommended. For `ml`,
exercise statements whose content is probabilistic or mathematical reasoning (random devices,
distributions, derivations) stay in English; a mixed sentence keeps its mathematical clause in
English and translates its programming-instruction clause; exercises that are programming
instruction translate normally. Pointer sentences ("Here's a function for the first random
device.") stay English under the existing short-technical-sentence rule, which the round
showed the model missing three times (lines 202, 576, 601) — that is reinforced with worked
examples, not widened here. Carried as a `language-config.ts` prompt rule (translator and
review judge both inherit it); the boundary remains the model's judgement call, with a
deterministic definition still deferred to the Phase 3 metric graduation in #189. Nothing here
generalises beyond `ml`.

**Consequences**: Retention checks and the script-ratio band (#229 lineage) must treat an
all-English or hybrid exercise statement as compliant, not under-translation — a hybrid
sentence mixes scripts inside one sentence, which no current check expects. English-retained
lines are kept byte-identical to the source so syncs diff cleanly (the Malayalam punctuation
rule does not apply to them). The `functions` seed already applies the ruling (applied in
ml#7 commits `a8d7d23` + the normalisation commit).

**Refs**: issue #189 (Phase 2, round 2), lecture-python-programming.ml#7 lines 484, 515,
517, 557–565, 576, 601, `D-2026-08-17-ml-math-heavy-sections-stay-english`,
QuantEcon/project-translation `reports/2026-09-01-ml-functions-review-disposition.md`.

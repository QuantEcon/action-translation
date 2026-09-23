# Malayalam: math-heavy Hint/Solution sections stay wholly in English

**Context**: In the first inline native review round (100 flags on
lecture-python-programming.ml#1, `python_by_example`), the reviewer proposed a new rule at
flags 99–100: Hint and Solution sections whose prose is predominantly mathematical reasoning
should be kept entirely in English. His rationale: these concepts (bivariate uniform
distributions, probability, convergence) are studied in English in Kerala's education system —
a reader who understands them already knows the terminology in English, and a reader who does
not needs the prerequisite mathematics first, so a Malayalam rendering helps neither. This is
a translation-*scope* change (which text gets translated at all), not a style rule, so it
needed a maintainer ruling rather than routine encoding. #promote

**Decision**: Accepted by @mmcky, 2026-08-17, as recommended by the editor of record. For
`ml`, exercise Hint and Solution sections whose prose is predominantly mathematical reasoning
(probability statements, convergence arguments, derivations) rather than Python instruction
stay wholly in English. Hint/Solution prose that is programming guidance translates normally.
Carried as a `language-config.ts` prompt rule (translator and review judge both inherit it);
the boundary is the model's judgement call for now — a deterministic definition (e.g.
math-notation density in the admonition body) is deferred until Phase 3 decides which ml
metrics graduate into `diff-checks.ts`.

**Consequences**: The `python_by_example` seed already applies it (the ex5 hint and solution
prose reverted to the English source, byte-exact, in the round-1 application commit).
Retention checks must not count an all-English hint/solution section as under-translation;
the script-ratio band (#229 lineage) gains another legitimate all-Latin region. Whether the
same scope rule ever applies to another language is a separate ruling — nothing here
generalises beyond `ml`.

**Refs**: issue #189 (Phase 2), lecture-python-programming.ml#1 flags 99–100,
QuantEcon/project-translation `reports/2026-08-17-ml-python-by-example-review-disposition.md`.

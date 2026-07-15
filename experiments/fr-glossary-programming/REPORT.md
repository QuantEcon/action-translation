# fr glossary × lecture-python-programming — report

**Status**: Concluded 2026-07-14 · terms proposed in PR #78 (awaiting native review)
**Question**: the French glossary was built for the economics lectures. What does it need
before we bulk-seed `lecture-python-programming.fr`?

This run also validated the method now generalised in `.claude/skills/glossary-review/`
and `scripts/glossary/`. `outputs/` and `data/` are gitignored, so the tables below are
the durable record.

## Setup

Five domain-dense lectures from `lecture-python-programming`: `python_by_example`,
`functions`, `numpy`, `python_essentials`, `python_oop`. Each translated twice — Sonnet 5
(the then-default, now the *probe* role) and Opus 4.8 (now the *seed* role) — both with
thinking off and the 364-term fr glossary injected. Terms were then extracted from each
EN↔FR pair by Opus and filtered.

Naming note: this run predates the skill, so its raw files use the thinking-experiment's
variant letters — `A-r1.md` = Sonnet 5 = probe, `O-r1.md` = Opus 4.8 = seed.

## Findings

### 1. The domain gap was real

**1 of 24** programming terms sampled from the lectures was present in the fr glossary.
The glossary was ~357 economics terms and effectively blind to this series.

### 2. Only variation is worth pinning

| | count |
|---|--:|
| terms proposed by Sonnet 5 | 176 |
| terms proposed by Opus 4.8 | 165 |
| **dropped — both models rendered identically everywhere** | **131** |
| **candidates with real variation** | **11** |
| survived hand assessment | 8 |
| added in PR #78 | 7 |

`function → fonction` recurred ~67× and both models always agreed. Pinning it would cost
tokens in every prompt forever and change no output. The 364-term glossary already costs
~15K input tokens per prompt — about $0.06 of the ~$0.24/lecture.

### 3. Drift alone would have found nothing

Opus showed **zero** cross-lecture drift across the 5 lectures; Sonnet 5 drifted on 5
terms. So the strong within-model signal was empty for the model we intend to seed with,
and **all 11 candidates came from cross-model disagreement**. This is the load-bearing
result for the method: the second model is not a bake-off, it is the signal.

### 4. Opus is measurably better here, at 1.66×

Beyond zero drift, Opus was *correct* where Sonnet drifted: `mutable` → `mutable` vs
Sonnet's `muable`, which is not the Python sense. Output lengths were near-identical, so
the cost difference is purely the price ratio: $1.22 → $2.03 for 5 lectures (~$6.3 →
~$10.4 for all 26). Recorded as `.dev/decisions/D-2026-07-14-opus-for-bulk-seed.md`.

## The 11 candidates

| en | sonnet-5 (probe) | opus-4-8 (seed) | evidence | ~count | assessment |
|---|---|---|---|--:|---|
| **index** | `index` · `indice` | `indice` | drift; disagreement | 16 | **pin** — matches existing `Tail index → Indice de queue` |
| **standard normal** | `loi normale standard` · `normale standard` | `loi normale standard` | drift; disagreement | 15 | **pin** — *both models wrong*; convention is `loi normale centrée réduite` |
| **mutable** | `mutable` · `muable` | `mutable` | drift; disagreement | 10 | **pin** — `muable` is wrong in the Python sense |
| **slice notation** | `notation de tranche` · `notation par tranches` | `notation de tranche` | drift; disagreement | 8 | **pin** |
| **f-string** | `chaîne f` · `f-string` | `f-string` | drift; disagreement | 6 | **pin** — keep-English question for the reviewer |
| **broadcasting** | `broadcasting` | `diffusion (broadcasting)` | disagreement | 45 | **pin** — keep-English question |
| **tuple unpacking** | `déballage de tuple` | `décompression de tuples` | disagreement | 7 | **pin** — reviewer picks |
| **import statement** | `instruction d'importation` | `instruction d'import` | disagreement | 8 | drop — trivially compositional, neither misleads |
| **frame** | `trame` | `cadre` | disagreement | 4 | **don't pin** — context-dependent; raised as a question |
| **function approximation** | `approximation de fonction` | `approximation de fonctions` | disagreement | 4 | drop — singular/plural only |
| **floating point** | `à virgule flottante` | `virgule flottante` | disagreement | 2 | drop — preposition only |

Eight assessed as worth pinning; seven added (`frame` deliberately excluded, and raised as
question 6 instead). The full drop rules are in the skill.

## Outcome

PR #78 adds 7 terms to `glossary/fr.json` — insert-only, alphabetical, 35 insertions and
zero deletions — with an evidence table and six numbered questions for Emile. The most
valuable is `standard normal`: not a consistency problem but a correctness one, where a
native economist's judgement beats any amount of model agreement.

## Follow-up surfaced (not glossary)

**NBSP before `; : ! ?` is missing.** The `language-config.ts` rule is in the prompt and
the model ignores it: 0 × U+00A0, 0 × U+202F, 12 regular spaces before high punctuation.
Needs a deterministic post-process **before** seeding, or it lands in all 26 files.

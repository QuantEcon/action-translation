# REPORT: Malayalam Stage 1–2 — divergence inventory and content-mix catalog

**Date**: 2026-07-28 · **Status**: Stages 1–3 complete; packet ready to send.
**Tracking**: #228 (re-scoped Phase 1 of #189), folding in #207.

This is the internal report. The reviewer-facing artifact is `PACKET.md` — numbered
questions only. Everything below the question cap lives here as evidence.

## TL;DR

The shipped ml config produces output that **passes every deterministic FAIL gate**
(27/27 headings identical, no pinned term lost, no casing variants) and is
recognisably the right shape: technical terms in Latin, Malayalam as connective
tissue, math and MyST structure untouched. Three things that the gates did *not*
say, in descending order of consequence:

1. **Every machine rendering is systematically more Malayalam than the native
   reference**, at every quantile — the over-translation direction #189 names as
   ml's inverted primary risk. The effect replicates across independent runs.
2. **The script-ratio gate cannot see it**, because it compares the output's *mean*
   against the reference's *p10–p90* interval — a point against a wide band.
3. **Transliterations occur** — `click`, `option`, `set`, `type` written phonetically in
   Malayalam script — against a policy target of zero, in 3 of 11 renderings, and *not*
   stable across runs of the same model. The native reference has none, across 57
   checked terms.

Set against that, the strongest positive finding of the phase: across five lectures and
two models, **203 distinct technical terms were extracted and all 203 were kept in
English**, only 6 of them pinned. The policy generalises far beyond what it was told.
Structure also held on all eleven renderings.

The Stage 3 method did not survive contact with ml: the `glossary-review` disagreement
filter produces zero real candidates for a keep-English language, for a structural
reason, and this **corrects a revision I made to #228** — see finding 8.

None of this is a model-selection result and none of it may be read as one; see
[Discipline on model claims](#discipline-on-model-claims).

## What we ran

| Rendering | Model | Path | Provenance |
|---|---|---|---|
| **Native reference** | — | hand-written | Adisankar, committed byte-exact in `reference/` (#191) |
| **Opus 5 arm** | `claude-opus-5` | `init -f`, `--localize none` | Stage 1, this run |
| **Opus 5 seed** | `claude-opus-5` | `glossary-review` seed role | Stage 3, 5 lectures |
| **Sonnet 5 probe** | `claude-sonnet-5` | `glossary-review` probe role | Stage 3, 5 lectures |

Eleven renderings in total: the Stage 1 arm plus Stage 3's 5 lectures × 2 roles. Stage 3
covers `getting_started`, `python_by_example`, `python_essentials`, `numpy` and
`python_oop` — chosen as the domain-dense lectures that introduce the series' core
vocabulary, with `getting_started` included so Stages 1 and 3 share a document and the
native reference applies to both.

Source: `QuantEcon/lecture-python-programming@5816589`, `lectures/`.
Engine: `main` at `2c3d624` (post-v0.24.0). Glossary: `glossary/ml.json` v0.1.0-draft,
52 terms, of which **7 occur in this source** — a fact worth stating plainly, because
"pinned-term retention 100%" is a weaker result than it sounds when the denominator is 7.

Stage 1 wall time 4.8 min, 23,212 tokens. No structural-parity failure: the
`{raw} jupyter` head block at line 13 survived, so the `--localize none` mitigation
held on this run. That is one observation, not a rate — see the hazard note in #228.

## Findings

### 1. Systematic over-translation, reproducible

Per-paragraph Malayalam share of alphabetic characters, prose only (code fences and
headings stripped, ≥12 letters per paragraph):

| Rendering | n | mean | median | p10 | p25 | p75 | p90 |
|---|--:|--:|--:|--:|--:|--:|--:|
| **Native reference** | 151 | 0.485 | 0.525 | 0.132 | 0.401 | 0.628 | 0.707 |
| Opus 5 arm | 150 | 0.577 | 0.604 | 0.348 | 0.478 | 0.718 | 0.810 |
| Opus 5 seed | 150 | 0.567 | 0.584 | 0.317 | 0.462 | 0.717 | 0.816 |
| Sonnet 5 probe | 150 | 0.516 | 0.540 | 0.251 | 0.407 | 0.662 | 0.777 |

Every machine rendering sits above the reference at **every** quantile. Against the
reference (Mann–Whitney U, two-sided, 151 vs 150 paragraphs):

| Rendering | z | p | paragraphs ≥75% ML (ref: 10) | paragraphs ≤15% ML (ref: 16) |
|---|--:|--:|--:|--:|
| Opus 5 arm | −4.009 | **6.1e-05** | 31 | 9 |
| Opus 5 seed | −3.483 | **0.0005** | 29 | 9 |
| Sonnet 5 probe | −1.020 | 0.308 | 19 | 10 |

Two independent Opus 5 runs of the same document agree closely (means 0.577 and
0.567; 31 and 29 heavily-translated paragraphs), so the shift is a reproducible
property of the pipeline on this document rather than run noise.

The **p10 column is the sharpest reading**. The reference's lowest decile sits at
0.132 — one paragraph in ten is essentially all-English. No machine rendering gets
below 0.251. The native speaker writes near-fully-English paragraphs; the tool
does not. That is the concrete form of open question 2 from #71 ("whole-English
sentences: acceptable, or draft remnants?") and it is now answerable by pointing at
text rather than in the abstract.

### 2. The script-ratio gate is structurally unable to detect finding 1

`PLAN.md` describes the check as "output distribution compared against the
reference's p10–p90 band". The implementation compares one number against an
interval: output **mean** 0.577 against `[ref p10 − 0.05, ref p90 + 0.05]` =
`[0.082, 0.757]`. A mean will fall inside a p10–p90 band under almost any
distribution, so the check fires only on gross failure — a document that is nearly
all English or nearly all Malayalam. It reported "all gates clean" on a rendering
whose distribution differs from the reference at p = 6.1e-05.

This is the metric that was supposed to catch over- and under-translation in one
measure, and over-translation is ml's stated primary risk. Recommend it be replaced
by a two-sample test on the paragraph-ratio distributions (candidate for Phase 3
graduation into `diff-checks.ts`). Filed separately rather than fixed here, per
#228's instruction to keep incidental defects out of the phase.

### 3. Transliterations, against a target of zero

A transliteration writes an English word phonetically in Malayalam script instead of
leaving it in Latin — `ക്ലിക്ക്` is not a Malayalam word, it is "click" spelled in
Malayalam letters. #189 sets the target at 0 instances.

| Rendering | Transliterations | Detail |
|---|--:|---|
| **Native reference** | **0** | across all 57 checked terms, 353 distinct Malayalam tokens |
| Opus 5 arm | 6 | `ക്ലിക്ക്` — **6 of 6** source occurrences of "click" |
| Opus 5 seed | 0 | — |
| Sonnet 5 probe | 5 | `ഓപ്ഷൻ` — 3 of 7 "option"; `സെറ്റ്` ×2 |

Three things follow.

**The reference having zero is the strongest empirical confirmation of the
keep-English policy we have**, and it also establishes that the detector has no
false positives on a known-good document.

**`option` at 3 of 7 is a consistency failure inside a single document** — the same
term kept Latin four times and transliterated three times. Consistency is the
primary ml risk named in #70, and this is the first field instance of it.

**It does not replicate.** Opus 5 produced 6 transliterations in one run of this
document and 0 in another. The occurrence is real; the *rate* is unknown, and n=2
establishes only that it is not deterministic. That makes frequency a `bench/`
question (#227) and severity an Adisankar question.

Widening to every rendering produced in this phase — 5 lectures × 2 models, plus the
Stage 1 arm — gives a much better base than one document:

| Lecture | Opus 5 | Sonnet 5 |
|---|---|---|
| `getting_started` (Stage 1 arm) | `ക്ലിക്ക്` click ×6 | — |
| `getting_started` (Stage 3) | 0 | `ഓപ്ഷൻ` option ×3, `സെറ്റ്` set ×2 |
| `python_by_example` | 0 | `ടൈപ്പ്` type ×2 |
| `python_essentials` | 0 | 0 |
| `numpy` | 0 | 0 |
| `python_oop` | 0 | 0 |

**Transliteration occurred in 3 of 11 renderings, affecting 4 distinct English terms:
click, option, set, type. None of the four is in the 52-term glossary.** That is the
actionable finding, and it is what makes Stage 3's checklist the highest-leverage
artifact in the packet: pinning these terms should prevent the whole class.

Two cautions on reading the table.

**It is sparse, and sparse in a way that flatters.** Eight of eleven renderings are
clean, but the three that are not include the *only* two renderings of
`getting_started` by different models — the most UI-heavy lecture in the sample. The
lectures with zero (`numpy`, `python_oop`, `python_essentials`) are the ones with least
UI vocabulary to transliterate. So the clean rows are weak evidence of compliance
rather than strong evidence of it.

**The model split is not reportable as a model property.** Opus 1-of-6 renderings,
Sonnet 2-of-5. Eleven renderings with no replicates cannot support a rate, and this
comparison points the *opposite* way from the over-translation measurement in finding 1
— where the two Opus runs shifted furthest from the reference and Sonnet least. Two
metrics, opposite orderings, no replicates: exactly the situation #227 exists to
resolve, and exactly the inference this report must not make.

### 4. Headings: the rule is confirmed, not merely plausible

All four documents carry **27/27 headings byte-identical to the English source** —
the native reference plus three independent machine renderings. #71's open question
1 ("headings stay fully English — confirm") can be put to Adisankar as a
one-line confirmation rather than a discussion.

### 5. Code comments are translated, inconsistently, and this contradicts Stage 1

The harness seed `base-lecture-ml.md` was produced by `init` at v0.24.0 under
**default** localisation, which includes `code-comments`. Result: 8 of its 10 Python
comments are translated, 2 are kept identical.

| English comment | Malayalam |
|---|---|
| `# Create two vectors` | `# രണ്ട് vectors സൃഷ്ടിക്കുക` |
| `# Visualize vectors` | `# Vectors visualize ചെയ്യുക` |
| `# Sectors: Agriculture, Manufacturing, Services` | *identical* |
| `# States: Employed, Unemployed` | *identical* |
| `# Final demand vector (in billions)` | `# Final demand vector (billions-ൽ)` |

The two kept identical are the two that are entirely proper nouns, which is
defensible behaviour — but nothing in the config asks for that distinction, so it is
incidental rather than designed. Meanwhile Stage 1 runs `--localize none`, so its
rendering leaves comments in English. **The packet therefore shows the reviewer two
contradictory treatments of the same construct**, and must ask about it explicitly
rather than let him notice the inconsistency and lose confidence in the rest.

### 6. Structure held on all eleven renderings

Every rendering produced in this phase is **skeleton-identical to its English source** —
directive sequence, math fences and headings all matching, including `numpy` at 165
structural items:

| Lecture | Structural items | Opus 5 | Sonnet 5 |
|---|--:|---|---|
| `getting_started` | 63 | identical | identical |
| `python_by_example` | 82 | identical | identical |
| `python_essentials` | 152 | identical | identical |
| `numpy` | 165 | identical | identical |
| `python_oop` | 70 | identical | identical |

Plus the Stage 1 arm, which also passed the engine's own #159 parity guard on write.

Worth stating what this is and is not. It is eleven full-document translations with no
lost, added or transposed code cell, math block or heading — a genuinely reassuring
result for a language whose morphology attaches to text immediately adjacent to those
constructs. It is **not** a pass rate for the #118 head-block defect class: these are
eleven *different* documents, not replicates of one cell, and only `getting_started`
carries the `(label)=` + `{raw} jupyter` head block that defect needs. A rate still
requires #227.

### 7. Three corrections to the recorded structure of the harness seeds

Stage 2 was specified against figures that turn out to be wrong, so the catalog was
re-sourced. All three counts are re-derivable with `scripts/passage_pairs.py`.

**`base-lecture-ml.md` has 7 markdown headings, not 17.** Both #207 and the #194
comment record 17. Ten of those seventeen are **Python comments inside code cells** —
`# Create two vectors` matches a naive `^#+\s` heading pattern. The 5-directive count
is right; the "8 display-math blocks" is 4 blocks (8 `$$` fence *lines*).

**Neither seed contains a single admonition or figure.** #228's Stage 2 requires
"admonition and exercise prose" and "figure and caption text" as content situations.
Both are absent from both seed documents, so those situations were re-sourced from the
Stage 3 lectures, which carry 12 admonitions and 17 exercise/solution directives —
at no extra cost, since those translations were already being produced.

**"Figure and caption text" is a vacuous situation for this corpus.** Of **47
`{figure}` directives across the whole programming series, 0 have caption prose** —
every one carries only `:scale:`. There is no caption text to translate, so there is
no question to ask. Recorded rather than invented.

Only two content situations survive from the seeds as specified (`math-intro` ×6,
`nested-subsection` ×2, plus `code-comment` ×10, which was not in the spec and is the
most interesting of them — see finding 5).

### 8. Stage 3: keep-English holds on 203 terms, and the disagreement mechanism does not transfer to ml

Two results, one strongly positive and one that invalidates the method this stage was
built on — including the correction I made to #228 to enable it.

**The positive result is the strongest compliance evidence in the phase.** Five lectures
× two models, with every technical term extracted from each rendering: **203 distinct
terms, and both models kept all 203 in English.** Zero rendered in Malayalam script; the
extractor's per-lecture notes read "kept in English" 359 times. Only 6 of the 203 are
pinned in `glossary/ml.json`.

That is a far better compliance measurement than the FAIL gate provides. Pinned-term
retention checked 7 terms because only 7 of the glossary's 52 occur in
`getting_started.md`; this covers 203 unpinned terms across five lectures and two models.
The keep-English policy generalises well beyond what it was explicitly told.

**The negative result: the `glossary-review` disagreement filter yields nothing for a
keep-English language.** `compare-models.mjs` surfaced 10 candidates. Every one is a
singular/plural variant (`tuple`/`tuples`, `coefficient`/`coefficients`,
`scalar`/`scalars`) or a spacing variant (`deadweight loss`/`dead weight loss`) — the
exact categories the skill's step 4 instructs you to drop. **Zero survive hand
assessment.**

The reason is structural, not a bad run. The filter measures variation in *translation
choice*: for fr it caught the seed saying `mutable` where the probe drifted to `muable`,
and cut 176 proposed terms to 11 real candidates. ml's policy removes translation choice
for precisely the terms being extracted — both models keep the term in English, so the
recorded "rendering" *is* the English term, and cross-model disagreement degenerates to
whether each model happened to record the singular or the plural. Within-role drift was
similarly empty: 4 items for the seed and 2 for the probe, all plural-only.

**This corrects my own revision of #228.** I argued the probe run was necessary because
the skill is emphatic that drift alone finds nothing, and that a single-arm Stage 3 would
have no ranking axis. The first half was right — drift alone did find nothing, 4 and 2
plural-only items. The second half was right for the wrong reason: a single arm has no
ranking axis, but neither does a double arm, because the axis itself is empty for ml. The
probe was worth its ~$1.50 for what it established rather than for what it was meant to
rank: the 203-term compliance result, the `type` transliteration, and the fact that this
mechanism should not be reached for again on a keep-English language.

**What Stage 3's artifact became.** Not a disagreement-ranked list but a
frequency-ranked confirmation list: 152 terms both models kept English, top 20 in the
packet, asking which to pin so the treatment is guaranteed rather than incidental. The
motivation is direct — the four terms that *were* transliterated (`click`, `option`,
`set`, `type`) are unpinned, and three of them are interface verbs the terminology
extractor never proposes, so no terminology-driven process would ever have protected
them. For ml the axis with signal is "did anything get rendered in Malayalam or
transliterated at all", which is what `transliteration_check.py` and the novel-token
detector measure, not "which rendering wins".

**One caution about LLM-derived notes.** The extraction model annotated `key` in
`python_essentials` as "kept in English; transliterated variants also appear". There are
**zero** occurrences of `കീ` in either rendering of that lecture — the note is a
fabrication. It was checked because it would otherwise have entered this report as a
fifth transliterated term. Consistent with #227's design constraint that no LLM-judged
metric gates anything.

## Method corrections made during this run

Recorded because both were wrong in ways that would have reached the reviewer.

**Paragraph pairing by index is invalid and fails silently.** The first divergence
inventory paired reference and output paragraphs by position. The reference splits a
paragraph the output keeps whole (reference index 20), so everything after it was
off by one, and the ratio-outlier class filled with comparisons between an anchor
line like `(install_anaconda)=` and an unrelated prose sentence — ten such items
were queued for the packet. **A count check does not detect this**: both documents
have exactly 155 prose paragraphs, because splits and merges offset. Replaced with
content-anchored alignment (Needleman–Wunsch over Jaccard similarity of Latin-token
sets, which survive translation): **145 of 155 paragraphs aligned, mean similarity
0.781**, 8 below the confidence floor and 2+2 unmatched, all reported rather than
guessed. Note the earlier distributional finding is unaffected — a two-sample test
on the two ratio populations does not depend on pairing.

**Two `strip_to_prose` copies claimed parity with `ml_metrics.py` and did not strip
YAML frontmatter** (found in Copilot's review of #231). Every QuantEcon lecture opens
with a jupytext `---` block, so its Latin keys were counted as prose. Impact was
measured rather than assumed: **no finding moved** — term-treatment 4, morphology 26,
ratio-outlier 9, total 39 with the block in or out, because it is identical in both
renderings and cancels; and `transliteration_check.py`'s output is byte-identical,
since a YAML block contains no Malayalam and none of the 57 targeted forms. The two
figures above are the only numbers that changed (156→155 paragraphs, 9→8 below floor).
The headline distributions were never at risk: they were computed by importing
`ml_metrics.strip_to_prose`, which does strip frontmatter. The latent risk was a
masked term-treatment divergence for any word the frontmatter also uses — `python`,
`language`, `name` — where a body-level translation would be hidden by the
frontmatter occurrence keeping the count non-zero.

**`passage_pairs.blocks()` did not recognise plain fences** (same review). It matched
only ```` ```{directive} ````, so ```` ```python ````, `~~~` and bare fences fell
through to the paragraph scan and their contents were extracted as prose. `FENCE_PLAIN`
was defined in the file and never used, which is fair evidence the case was intended
and missed. No document in this experiment triggered it — every fence in the ml corpus
is a braced MyST directive, and closing fences were already consumed by the forward
scan — but the harness fixture `23-special-chars-lecture.md` is 7 plain fences and 0
directives: before the fix, **4 of its prose blocks contained live Python** including
the fence markers; after, **0**. Plain fences now form their own `codefence` block
kind, count toward the structural skeleton (a lost ```` ```python ```` block is a real
defect), bound the paragraph scan, and contribute their comment lines to the
`code-comment` situation.

**A strict block-signature check cries wolf on healthy documents.** `passage_pairs.py`
first refused to run on `python_essentials`, reporting MISALIGNED where the source had
a `{code-cell}` and the target a paragraph — which looks exactly like the #118/#203
transposition class. It was not: the rendering had **one extra paragraph** (309 vs
308 blocks) because the translator split a paragraph earlier, shifting everything by
one. Every code cell was present and in order. Verified by comparing the *skeleton*
only — directives, math fences and headings — which is what the engine's own parity
guard cares about: **all six Stage 3 renderings are skeleton-identical to their
sources.** The script now separates the two conditions, treating a skeleton mismatch
as a structural defect and a paragraph-count difference as benign, and in the benign
case emits only the directive-anchored situations.

**Enumerating divergences is not the same as ranking them.** Raw extraction gave 38
term-treatment rows led by `use`, `top`, `right`, `green` — thirty glossary questions
whose real answer is a single config rule about how far keep-English extends into
ordinary vocabulary. The inventory now clusters: 32 ordinary words collapse into one
register question, and morphology clusters by *transformation* rather than root (the
reference writes `-ലെ` where the output writes `-യിലെ`, on both `directory` and
`numpy` — one rule, not two). Cap allocation also changed: #228 ranks the classes
1-2-3, but filling 30 slots in strict class order left **zero** ratio-outliers in the
packet, and those are the sharpest items. The cap is now a per-class quota (8/12/10).

## Divergence inventory

**39** divergences after clustering and after the false-positive fix below; all 39 fit
inside the 30-item cap once clustered, so nothing of substance was dropped.

| Class | Found | In packet | Resolves to |
|---|--:|--:|---|
| Term treatment | 4 (1 cluster of 32 words + 3) | 4 | one config rule, or a glossary entry |
| Morphology | 26 (3 clusters + 23 single-root) | 12 | rule change or accepted-as-is |
| Ratio outlier | 9 (of 145 aligned pairs) | 9 | depends on direction |

The ratio-outlier count was **53** before the band-membership trigger was removed; 44 of
those 53 were pairs where the two renderings agreed and the paragraph merely sat in a
distribution tail. All 9 survivors run in the same direction — more Malayalam in the
output — with no counter-examples, which is what let the packet ask one question about a
construction rather than nine about paragraphs.

Regenerate with:

    python3 experiments/ml-benchmark/scripts/divergences.py \
      --source <EN>/lectures/getting_started.md \
      --reference experiments/ml-benchmark/reference/getting_started.md \
      --output <ARM>/lectures/getting_started.md \
      --glossary glossary/ml.json --cap 30 --json

### The ordinary-vocabulary cluster (packet item A1)

32 ordinary English words the reference keeps in Latin script and the Opus 5 arm
renders in Malayalam: already, best, choose, click, create, detail, efficient,
example, explore, free, green, here, hit, hopefully, idea, important, instruction,
interact, open, popular, possible, process, provide, right, select, share, similar,
simple, top, try, use — and one in the other direction (`box`).

This is the word-level shadow of finding 1 and the single highest-yield question in
the packet: if the answer is "yes, keep those English too", it is one
`additionalRules` change, not 32 glossary entries.

### Morphology clusters (packet items A2–A4)

| Reference writes | Output writes | On roots |
|---|---|---|
| `-ലെ` | `-യിലെ` | directory, numpy |
| `-ഉം` | *(absent)* | border, file |
| *(absent)* | `-മായി` | files, message, page |

Plus individually-reported single-root differences where the two renderings choose
different cases altogether — `cursor` (`-ഉം` vs `-നൊപ്പം`), `option` (`-നെ` vs
`-നെക്കാൾ`, a comparative that may simply be wrong), `list` (`-ൽ` vs `-ന്`).

Also worth a native eye: the Opus 5 seed renders "hit the `Esc` key" with
`അടിക്കുക` — the literal *strike* sense of "hit". The reference keeps `hit` in
English. That is a candidate mistranslation rather than a style question.

## Cost

| Item | Model | Reported | Estimated true |
|---|---|--:|--:|
| Stage 1 arm, 1 lecture | `claude-opus-5` | *no cost line* | ~$0.45 |
| Stage 3 translation, 5 lectures, seed | `claude-opus-5` | **$0.000** | ~$2.25 |
| Stage 3 translation, 5 lectures, probe | `claude-sonnet-5` | $1.47 | $1.47 |
| Stage 3 term extraction, seed | `claude-opus-4-8` | $0.88 | $0.88 |
| Stage 3 term extraction, probe | `claude-opus-4-8` | $0.85 | $0.85 |
| **Total** | | **$3.20** | **~$5.90** |

The estimate lands inside the **$4–8** range the revised #228 predicted for this phase,
and roughly double the $3.20 the tooling reports.

**The cost tracker reports `$0.000` for every `claude-opus-5` call.** The model is
absent from `VALID_MODEL_PATTERNS` in `src/models.ts` (a known staleness item in
`.dev/FUTURE.md`) and evidently from the pricing table too, so Opus spend is
invisible rather than merely unvalidated. Sonnet 5 measures ~$0.23/lecture; Opus 5
list price is $5/$25 per MTok against Sonnet's $3/$15, so the true Opus figure is
roughly $0.4–0.5/lecture. Filed as **#230**.

Note `claude-opus-4-8` prices correctly, so the gap is specific to the newer ID rather
than to Opus generally — which is what makes it a stale-table problem rather than a
design one.

## Discipline on model claims

This report contains three renderings by two models and it would be easy to read a
model comparison out of it. It is not one, and #227 owns that question.

What is defensible: the over-translation *direction* holds for all three renderings;
its magnitude is reproducible across two Opus 5 runs of the same document.

What is **not** defensible from this data: that Sonnet 5 is better suited to ml
because its shift was not significant. That is one run of one document. Sonnet 5
also produced *more* transliterations than either Opus run and showed the
within-document consistency failure on `option`. The two metrics point in opposite
directions, which is exactly why a per-language default needs replicate-based rates
from `bench/` rather than a table like this one.

## Artifacts

| File | Contents |
|---|---|
| `PACKET.md` | reviewer-facing; numbered questions only |
| `scripts/ml_metrics.py` | the shipped gate suite (#191) |
| `scripts/divergences.py` | ranked, clustered, content-aligned divergence inventory |
| `scripts/transliteration_check.py` | targeted + novel-token transliteration detection |
| `scripts/passage_pairs.py` | byte-exact aligned passage extraction for the catalog |
| `../ml-glossary-programming/data/` | Stage 3 term extractions and candidate table (gitignored; regenerate with the `glossary-review` scripts) |

Scripts quote by slicing, never by retyping, so Malayalam ZWJ/ZWNJ survive — the
hazard `reference/README.md` documents for the reference commit applies equally to
anything built out of these documents.

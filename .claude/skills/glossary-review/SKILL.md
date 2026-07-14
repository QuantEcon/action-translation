---
name: glossary-review
description: Find which terminology a new lecture series needs pinned in a translation glossary, by translating a sample with two different models and keeping only the terms they disagree on. Use when adding a lecture series or repo to an existing translated language, when asked to check glossary coverage or terminology consistency for a language, before bulk-seeding a new translation repo, or when asked which terms to add to glossary/<lang>.json. Takes a language code and a source corpus.
---

# glossary-review

Decide what to add to `glossary/<lang>.json` when an existing language meets a **new
lecture series**. Produces a short, evidence-backed list of terms and a PR that asks a
native reviewer to rule on each one.

Requires: `npm run build:cli` (scripts import from `dist/`), `ANTHROPIC_API_KEY`, and a
local checkout of the English corpus.

## The one idea

**Only pin terms that show variation.** A term both models render identically in every
lecture needs no entry — they already agree, and every pinned term costs input tokens in
**every** translation prompt, forever. On the French programming run this filter cut 176
proposed terms to 11, and hand assessment cut that to 8.

The corollary matters just as much: **the second model is not a bake-off, it is the
signal.** The seed model showed *zero* cross-lecture drift over 5 lectures — drift alone
would have found nothing. All 11 candidates came from seed↔probe disagreement. If someone
proposes dropping the probe model to halve the cost, the method stops working.

## Before starting

1. **Confirm the glossary exists.** This refines an existing `glossary/<lang>.json`. A
   language with no glossary is a different job.
2. **Check the domain gap.** Glossaries are corpus-specific. The fr glossary was ~357
   economics terms and had **1 of 24** programming terms — a large gap means this exercise
   is worth running; a small one means it probably isn't.
3. **Read the language's house style** before assessing anything: the existing glossary's
   conventions, `src/language-config.ts`, and any `.dev/decisions/*<lang>*`. This changes
   the answers, it doesn't just flavour them — Malayalam deliberately **keeps technical
   terms in English** (`D-2026-06-01-malayalam-keep-english-policy.md`) while French
   translates them. Proposing `f-string → chaînes f` is a reasonable question for `fr` and
   a wrong one for `ml`.
4. **Pick a sample of ~5 lectures**, biased toward domain-dense ones (the lectures that
   introduce the series' core vocabulary), not the shortest ones.

## Workflow

Set a per-run directory: `experiments/<lang>-glossary-<series>/`. Its `outputs/` and
`data/` are gitignored — only the REPORT is committed, so the REPORT must **embed** the
candidate table rather than link to it.

### 1. Translate the sample — two roles

`seed` is the model that will do the bulk translation (Opus 4.8, per
`D-2026-07-14-opus-for-bulk-seed.md`). `probe` is a different-family model run *only* to
disagree with it.

    node scripts/glossary/translate-sample.mjs --lang fr \
      --source ~/work/quantecon/lecture-python-programming \
      --lectures python_by_example.md,functions.md,numpy.md,python_essentials.md,python_oop.md \
      --out experiments/fr-glossary-programming/outputs

**If the target repo is already seeded**, pass `--existing <repo>` — the committed
translation becomes the seed rendering for free and only the probe runs, halving the cost.
Prefer fresh if the glossary has changed a lot since that repo was seeded.

Cost: roughly $0.80/lecture fresh, $0.40 with `--existing` (fr; glossary-dominated).

### 2. Extract terms — once per role

    node scripts/glossary/suggest-glossary.mjs --lang fr --role seed  --source <corpus> --outputs <outputs>
    node scripts/glossary/suggest-glossary.mjs --lang fr --role probe --source <corpus> --outputs <outputs>

This output is far too long to act on (fr: 176 terms). Never take it to a reviewer.

### 3. Filter to candidates

    node scripts/glossary/compare-models.mjs --lang fr --data experiments/fr-glossary-programming/data

Writes `glossary-candidates.md` — terms with cross-lecture drift or cross-model
disagreement, everything else dropped and counted.

### 4. Assess by hand — the step that cannot be automated

The filter finds *variation*; only judgement separates variation that matters. Go through
every candidate and drop:

- **Singular/plural only** — `approximation de fonction` vs `de fonctions`.
- **Preposition or article only** — `à virgule flottante` vs `virgule flottante`.
- **Trivially compositional** — `instruction d'importation` vs `d'import`: both are
  obvious, and neither misleads a reader.
- **Genuinely context-dependent** — `frame` is `trame` in one context and `cadre` in
  another. Pinning one rendering forces the wrong one elsewhere. Don't pin; raise it as a
  question instead.

Keep:

- **Real semantic disagreement**, especially where one option is *wrong* — the seed said
  `mutable`, the probe drifted to `muable`, which is not the Python sense.
- **Keep-English policy questions** — `f-string`, `Broadcasting`. The reviewer decides;
  the language's house style is the prior.
- **Terms both models got wrong.** Highest value in the set, and no consistency metric can
  find them: for `standard normal` both models produced `loi normale standard`, but the
  conventional French statistical term is `loi normale centrée réduite`. Look for these
  while reading — they're the reason a native reviewer exists.

### 5. Recommend a review mechanism, then agree it with the user

Do not branch on the candidate count. Form a recommendation, state the reasoning, and
**put it to the user before building anything** — a blind packet is hours of work and a
real ask of the reviewer's time, so it should be a decision, not an automatic consequence
of a number.

Judge by the **kind of question**, not how many:

- **Answerable from a table of renderings → glossary PR.** `mutable` vs `muable` needs no
  context: one is simply wrong in the Python sense. A reviewer answers inline in minutes.
- **Needs the term seen in rendered prose to answer → blind packet.** If the reviewer must
  read a paragraph to judge whether a rendering *reads* right, a table won't do (see
  `experiments/thinking-sonnet5/scripts/make-review-packets.mjs`).
- **Correctness call vs preference ranking.** Blinding exists to strip bias out of
  *subjective ranking*. Glossary terms are mostly expert judgement, where blinding buys
  nothing and costs a lot of machinery. This is why the French run sent **11** candidates
  to a PR rather than a packet — the count exceeded any rule of thumb, but every question
  was a table question.

Count still informs the recommendation, it just doesn't decide it. As rough calibration:
under ~10 table-answerable questions is comfortably a PR; well over that starts to be a
big ask for one PR body and may be worth splitting or packaging. If the count is high,
check first whether one lecture is dominating the sample.

Put it to the user as: how many survived assessment, what kind of questions they are,
which mechanism you recommend and why, and what it will cost the reviewer.

### 6. Open the glossary PR

- Edit `glossary/<lang>.json` **insert-only**, alphabetically. Verify the diff reorders
  nothing: the line count should be `terms × 5` insertions, zero deletions.
- The PR body carries **numbered questions**, so the reviewer can answer inline with
  "1. yes, 2. keep English…". Include the evidence table (both renderings + count) so each
  question is answerable without running anything.
- Explain **why the list is short** — that N terms were dropped as already-consistent.
  Without this, a reviewer reasonably assumes the analysis missed things.
- Flag terms you deliberately did **not** add and why (the context-dependent ones).
- Per the user's global instructions: **do not hard-wrap paragraphs** in the PR body, and
  **do not put prose in fenced code blocks** — both crop the readable width on GitHub.

### 7. After review

Apply the answers, merge, then write the run's REPORT.md embedding the final candidate
table and counts. Record any policy-level outcome in `.dev/decisions/`.

## Scripts

`scripts/glossary/` — `lib.mjs` (models, prompts, pricing), `translate-sample.mjs`,
`suggest-glossary.mjs`, `compare-models.mjs`.

They live outside this skill on purpose. They do deterministic work a human maintainer
should be able to run without Claude Code in the loop, and `glossary/README.md` points
there. Moving them under `.claude/` would not make them self-contained either — they
import from `dist/` and need a build, a corpus checkout and an API key regardless. This
skill is the judgement; those are the machinery.

`lib.mjs` holds a **verbatim copy** of the production translate prompt, because
`src/translator.ts` builds it inline in `translateFullDocument` and doesn't export it. If
that prompt or `language-config.ts` changes, re-sync `lib.mjs` — otherwise you are pinning
terms based on a prompt production no longer uses.

## Worked example

`experiments/fr-glossary-programming/REPORT.md` — French × `lecture-python-programming`,
5 lectures, 176 → 11 → 8 terms, PR #78.

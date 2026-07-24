# Experiment PLAN: Malayalam (ml) benchmark vs native-speaker reference

**Created**: 2026-07-24
**Status**: Scaffold — blocked on committing the reference translation (see below)
**Language**: `ml` (Malayalam)
**Tracking**: issue #189 (phases, checklists); policy shipped in #71 (config, glossary, review-judge injection); native-speaker review in #70
**Decision this informs**: per-language model default for `ml` (Sonnet 5 vs Opus 4.8), glossary/rule tuning, and go/no-go for seeding `lecture-python-programming.ml`

---

## 1. Question

Does the shipped keep-English-dominant config produce Malayalam output matching
the native-speaker reference style — measured deterministically — and which
model does it better per dollar?

Malayalam inverts the failure mode of every prior language: the risk is
**over-translation** (rendering technical terms in Malayalam script), not
under-translation. Because "correct" means *these exact English strings
survive*, most of the assessment is scriptable — no LLM judge needed for the
core gates.

## 2. Assets

| Asset | Where | Role |
|---|---|---|
| Strategy doc (Adisankar) | issue #70 | policy ground truth, 16 worked examples |
| Reference translation of `getting_started.md` | `reference/` (**pending** — see its README) | style ground truth; calibrates the script-ratio band |
| `ml` config + glossary (52 terms) | `src/language-config.ts`, `glossary/ml.json` (#71) | the thing under test |
| English source | `lecture-python-programming/lectures/getting_started.md` | translation input |

## 3. Method

Phase numbering follows #189.

1. **Phase 1 — benchmark.** Translate the English source twice (`claude-sonnet-5`,
   `claude-opus-4-8`) via the CLI against a scratch target repo. Run
   `scripts/ml_metrics.py` on both outputs *and on the reference itself* (the
   reference run calibrates the script-ratio band and surfaces the
   beyond-glossary keep-English vocabulary). Record per-file cost. Produce
   REPORT.md with a three-way side-by-side of divergent passages.
2. **Phase 2 — calibration batch** (3–5 diverse lectures, real
   `test-translation-sync.ml` PRs, Adisankar flags → glossary/rule changes).
3. **Phase 3 — judge calibration** (judge findings vs Adisankar's flags;
   seeded-violation recall; graduate metrics into `diff-checks.ts`).

## 4. Metrics (deterministic, `scripts/ml_metrics.py`)

| Metric | Gate | Definition |
|---|---|---|
| Heading fidelity | FAIL | heading sequence identical to source (trailing whitespace normalized — an invisible-whitespace diff is not a translation defect) |
| Pinned-term retention | FAIL | every keep-English glossary term occurring in the source occurs at least as often in the output, in Latin script. Exact word match — plurals are deliberately not folded ("+s" collides with verbs the policy correctly translates: means, demands, yields), so plural-only occurrences are invisible to the gate rather than false failures |
| Casing consistency | WARN | a retained term uses one surface form across the document (sentence-initial capitalization tolerated) |
| Script-ratio band | WARN | per-paragraph Malayalam-vs-Latin letter ratio; output distribution compared against the reference's p10–p90 band. High = over-translation, low = untranslated prose |
| Everyday-term usage | info | the 5 translated glossary words: exact-string counts only, since Malayalam inflection legitimately alters endings |
| Malayalam token frequency | manual | top tokens listed for a transliteration scan — a phonetic English word in Malayalam script is a policy violation the other metrics can't see |

Run:

    python3 experiments/ml-benchmark/scripts/ml_metrics.py \
      --source  <english>.md \
      --output  <translated>.md \
      --glossary glossary/ml.json \
      --reference experiments/ml-benchmark/reference/getting_started.md

Exit code is non-zero on any FAIL-gate breach, so the script can sit in CI or
be graduated into `diff-checks.ts` later (Phase 3).

**Calibration (measured 2026-07-24, reference vs the live English source):**
the reference itself passes every gate — 27/27 headings identical (confirming
the keep-headings-English rule empirically), all pinned terms retained, zero
casing variants, and its top Malayalam tokens are all genuine function words
(no transliterations). The script-ratio band from its 151 prose paragraphs
(inclusive-method quantiles, which never extrapolate beyond observed values):
mean 0.485, median 0.525, p10 0.132, p90 0.707. Phase 1 outputs should land
inside p10−0.05 … p90+0.05.

## 5. Open questions carried from #71 (unconfirmed by Adisankar)

1. Headings stay fully English (rule shipped on the sample's evidence — confirm).
2. Whole-English sentences: acceptable when nearly every word is technical, or draft remnants?
3. Proper names: keep English/Latin (default — confirm).
4. `relationship → ബന്ധം`: optional with parenthetical first use — confirm or drop.

The Phase 1 report should present each as a concrete divergence example, so
Adisankar answers by pointing at text rather than at policy abstractions.

## 6. Known hazards

- **Byte fidelity.** Malayalam text uses ZWJ/ZWNJ (e.g. chillu formations) and
  the reference must be committed byte-exact — see `reference/README.md` for
  the verification procedure. Copy-paste through chat or editors can silently
  strip zero-width characters (same class of hazard as the U+00A0 loss we hit
  in the French typography work).
- The reference contains known typos ("eentire", "substanial") — divergences
  from it are questions, not automatic errors.

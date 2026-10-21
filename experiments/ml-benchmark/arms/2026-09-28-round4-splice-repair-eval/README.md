# Arm: does #331's splice repair improve fresh drafts? — 18 draws, 2026-09-28

This is the regeneration test for #331 (`d9b243c`). #331 added a fourth deterministic repair to `ml_repair.py`, derived from the editor's round-4 review (lecture-python-programming.ml#23, `numpy`; dispositions in QuantEcon/project-translation `reports/2026-09-28-ml-numpy-review-disposition.md`). Where two finite clauses are joined by a comma and a resumptive pronoun or connective (`ഇത്`, `ഇവ…`, `അത്`, `അതിനാൽ`, `അതേസമയം`), the repair turns the comma into a full stop. #331 was first validated only against text that already existed: the round-4 seed, his edits, and his reviewed pages. This arm asks whether the repair makes **fresh** engine drafts better, including on lectures it was not built from.

## Design

- **Drafts.** 18 fresh drafts at `d9b243c`. The ml translator there is identical to `@v0`: nothing under `src/` has changed for ml since v0.29.2.
  - Command for every draft: `init -s <src> -t <out> --target-language ml -f <lecture>.md --localize none -m claude-sonnet-5 --glossary glossary/ml.json`.
  - Six drafts of each lecture:
    - `numpy`, the lecture the repair was built from (source `lecture-python-programming@b0b0b56`);
    - `functions` and `matplotlib`, which the repair was not built from (sources as in the round-3 arm).
  - All 18 succeeded on the first attempt, with no structural-parity refusals.
- **Three versions of every draft.**
  - `raw`, as the engine wrote it;
  - `old`, the draft after `ml_repair` at `1e6936f` (before #331);
  - `new`, the draft after `ml_repair` at `d9b243c`.

  `old` versus `new` isolates what #331 changed. `raw` versus `new` is the whole repair pipeline. Only the raw drafts are archived: `repair_and_score.py` regenerates the other two versions deterministically.
- **References.** The editor's reviewed pages on the edition's `main`: `numpy` at `7e373de` (round 4), `functions` from round 2, and `matplotlib` from round 3, which includes ml#24.
- **Instruments.**
  1. **Lints.** The new `ml_metrics` scores all three versions, so the measure is the same for each.
  2. **Two blind pairwise judges**, via `judge.mjs`, which is round 3's judge with a per-task retry replacing the shared-cursor decrement. Both use `claude-opus-5-5`: `claude-opus-5` returned 529 Overloaded at run time. Each judge sees paragraphs in random order and may call a tie; identical pairs are scored as ties without an API call.
     - *style*: which candidate is closer to the editor's reviewed paragraph in style (round 3's prompt).
     - *free*: which reads as better Malayalam teaching prose. This judge does not see the reference.
  3. **A precision screen** of every paragraph where `new` differs from `old`. Two independent screeners read each batch of 10, with lenses on grammar and on meaning plus editor practice, and a third reader adjudicates any disagreement or defect verdict (`screen.json`).
  4. **Character similarity** to his paragraph, as a secondary measure only.

## Results

**The splice rate** (sites per 100 Malayalam prose lines):

| Lecture | raw (range) | after new repair (range) | his reviewed page | Paragraphs split per draft |
|---|---|---|---|---|
| `numpy` | 17.3 (13.1–21.5) | 10.7 (7.8–15.3) | 2.8 | 8–14 |
| `functions` | 18.3 (16.7–20.6) | 14.2 (12.7–15.7) | 2.8 | 3–6 |
| `matplotlib` | 9.4 (7.8–11.5) | 9.4 (unchanged) | 1.6 | 0 |

No resumptive site is left after the repair in any draft. `old` and `new` differ only at splits: 81 paragraphs (`numpy` 58, `functions` 23). The bracket and coverage changes in #331 did not fire on these drafts.

**Judges: what #331 changed** (`old` against `new`; decisions exclude ties; two-sided sign test):

| Judge | Lecture | new : old | Ties | p |
|---|---|---|---|---|
| free | `numpy` | 48 : 8 | 2 | 5×10⁻⁸ |
| free | `functions` | 20 : 0 | 3 | 2×10⁻⁶ |
| **free, pooled** | | **68 : 8 (89%)** | 5 | **6×10⁻¹³** |
| style | `numpy` | 46 : 12 | 0 | 8×10⁻⁶ |
| style | `functions` | 14 : 9 | 0 | 0.41 |
| **style, pooled** | | **60 : 21 (74%)** | 0 | **2×10⁻⁵** |

The first-shown candidate won between 43% and 60% of decisions, so there was no position bias.

**Judges: the whole pipeline** (`raw` against `new`, which includes the older repairs): style 139 : 26 and free 91 : 37 (46 ties), both in favour of `new`. The exception is `matplotlib` on the free judge, where `raw` wins 11 : 2. Ten of those eleven are the older `-ഉം` comma repair, which the free judge calls "unnatural". The editor answered on ml#22 that the comma is always there, and the style judge, which sees his text, prefers the repaired version 28 : 0. A reference-free judge does not know this edition's conventions, so use the reference-based judge for any repair that encodes a convention.

**Precision screen:** all **81 of 81** split paragraphs were rated acceptable, with no defects and nothing unsure. By the first screener's reading, his reviewed text has the same split at 60, a restructured sentence at 18 (a relative clause or converb), and something else at 3. Both judges preferred the unsplit version at only one site. That site is a *Step 1* bullet (`… ചേർക്കും, അതിനാൽ …`), the list items where he folded the clause into a converb (`ചേർത്ത്`) rather than splitting it. This is the same shape as 3 of his 13 round-4 sites, and it is well-formed but not his form.

**Similarity to his paragraph** (secondary measure): the split made 55 of the 81 paragraphs closer to his text and 5 further from it, all 5 in `numpy`. Mean similarity moves 0.794 → 0.799 on `numpy` and 0.631 → 0.639 on `functions`.

## Reading

1. **#331 improves fresh drafts.** The reference-free judge prefers the split at 89% of decisions, with 20 of 20 on `functions`, a lecture the repair was not built from. The style judge agrees overall (74%). On `functions` alone the style result is not significant (14 : 9 from 23 paragraphs). The screen found no split the editor would plausibly revert.
2. **It does not reach his splice rate on its own.** The repair covers only the comma-plus-resumptive subset: about a third of the gap on `numpy` and a quarter on `functions`. `matplotlib`'s drafts contain no such site at all, so the class depends on the lecture. The residual is the broader class: non-resumptive joins, and `പക്ഷേ` / `അതുകൊണ്ട്` / `അങ്ങനെ`, which are deliberately left alone because he writes some of these himself. Closing it needs a measured mechanism: the scoped rule-12 arm at ≥12 draws per arm, or a further repair once his practice on those connectives is clear. It should not be done by widening this regex on this evidence.
3. **The judge instruments disagree on convention-bearing repairs.** A reference-free judge encodes general Malayalam norms, and those contradicted the editor on the `-ഉം` comma. For repairs that follow one of his rulings, the reference-based style judge is the instrument.

## Reproduce

From an `action-translation` checkout at `d9b243c`, with `ml_repair.py` / `ml_metrics.py` from `1e6936f` copied to `<dir>/old-scripts/` and the raw drafts in `<dir>/draws/`:

- `python3 repair_and_score.py <dir> <checkout>`
- `python3 make_items.py <dir>`
- `python3 sites.py <dir>`
- `JUDGE_MODEL=claude-opus-5-5 [JUDGE_MODE=free] node judge.mjs items-<lecture>.json "old:new,raw:new" judgements-<mode>-<lecture>.json`
- `python3 summarise.py <dir>`

The screen was a multi-agent workflow over `sites.json`; its verdicts are in `screen.json`.

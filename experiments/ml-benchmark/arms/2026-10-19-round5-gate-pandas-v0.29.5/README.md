# Arm: the round-5 gate — `pandas` regenerated at v0.29.5 against its reviewed text, 2026-10-19

The first gate between rounds (ml plan decision 19, QuantEcon/project-translation
`plans/ml-programming-edition.md`): `pandas`, the round-5 lecture, drawn again at the release that
carries round 5's lessons (#372, in v0.29.5) and compared against the editor's reviewed text.
**Verdict: passed** (Matt, 2026-10-19), on the per-class counts; decision 19 is amended in the same
ruling (below).

## How the drafts were made

- **Engines.** v0.29.5 (`e7356cc`, glossary v0.8.0, 93 terms) and, as a same-day control, v0.29.3
  (`16e50f6`, glossary v0.7.0, 87 terms — the round-5 seed's engine). Each in its own scratch
  worktree with its own `npm ci` and `npx tsc`, so each ran its own dependencies (`js-yaml` 4.3.2
  and 4.3.0), and each draw ran from its worktree root so the CLI loaded that tag's glossary.
- **Source.** `lectures/pandas.md` from QuantEcon/lecture-python-programming at `55c87c9` (`git
  archive`), the bytes the seed and the reference were made from; unchanged on `main` (`b0c58ab`).
- **Command.** `init -s <source> -t <dir> --target-language ml -f pandas.md --localize none -m
  claude-sonnet-5`, three draws per engine, run side by side. About 25,100 tokens and 3.4–3.5
  minutes per draw.
- **Refusals.** v0.29.5 draw 2 was refused twice by the structural-parity guard before its third
  attempt succeeded: directives 90 → 89, the output being the source minus its first directive
  (`{raw}` at line 15) and the `(pd)=` anchor — #203's whole-document fence wrap. The v0.29.3
  control draws all succeeded first time (as did the three round-5 draws on 2026-09-28).
- **Repair.** Every draft was repaired with the current `ml_repair.py` (#372) against the English
  source; the v0.29.3 drafts were also repaired with the seed-era script (`d9b243c`, run with the
  v0.7.0 glossary), which reproduces the sent seed **byte for byte**. `repair-stats.jsonl` has both.
- **Reference.** `lectures/pandas.md` on QuantEcon/lecture-python-programming.ml `main` (`5378fd3`).

Files: `pandas-v0.29.5-draw{1,2,3}.md` (raw) and `-repaired.md`; `control-v0.29.3/` (the same-day
v0.29.3 drafts, raw); `checks.jsonl` and `convergence.jsonl` (24 rows each: every draft — these
five, the round-5 arm's three — raw, after the #372 repair and, for v0.29.3, after the seed-era
repair); `convergence.py` and `checks.py`, the method.

## Method

**`convergence.py`** rebuilds the round-5 report's one-method script, which was never committed
(that report's R8): Malayalam-bearing prose lines above `## Exercises` by `ml_metrics.prose_lines`,
paired with the reference's prose lines by order within each heading-delimited section, character
`SequenceMatcher` similarity with `autojunk=False`, and textstrata's `changed_chars` for edit mass.
On the sent seed it reproduces the published figures exactly — touch rate 68.0% (85/125), median
similarity 0.859, light edits 38.8%, heavy rewrites 16.5% — except edit mass, which reads 273
against the published 249: the original's denominator cannot be recovered, so the mass column here
is this script's scale, the same for every row.

**`checks.py`** rebuilds the round-5 arm's `checks.jsonl` schema on the current `ml_metrics.py` and
glossary, plus the engine's `findVerbatimViolations` for exercise-family blocks. On the round-5
drafts it reproduces the recorded bare endings, unpunctuated paragraphs, plurals, headings, code
cells and exercise blocks. Two fields read differently by design: `lowercase` is lower because
#372's `LOWERCASE_OK` no longer flags library names such as `pandas`; and *For example* is counted
at sentence start, where rule 8 keeps it in English (5 sites in `pandas`), as `for_example_kept`.

## Results

**Convergence against the reference cannot show this release's change.** The reference is the seed
with the editor's edits applied, so the seed matches it on every line he left alone; a fresh draft
at any engine starts far behind. Against fresh drafts, the two releases cannot be told apart:

| Fresh drafts | Touch rate | Median similarity | Heavy rewrites | Edit mass |
|---|---|---|---|---|
| v0.29.3, seed-era repair (5) | 90.3–94.2% (mean 91.9%) | 0.828 | 22.8% | 421 |
| v0.29.3, #372 repair (5) | 90.3–94.2% (mean 91.9%) | 0.829 | 22.0% | 417 |
| v0.29.5, #372 repair (3) | 91.2–95.2% (mean 93.1%) | 0.830 | 22.6% | 423 |
| *The sent seed (anchored)* | *68.0%* | *0.859* | *16.5%* | *273* |

The five v0.29.3 drafts are the round-5 arm's draws 2 and 3, which were never sent, and today's
three controls.

**The per-class counts move where round 5 encoded, and only there.** Per draft:

| Class | v0.29.3 + seed-era repair (the round-5 pipeline) | v0.29.3 + #372 repair | v0.29.5 + #372 repair |
|---|---|---|---|
| Banned over-translations | 10, 11, 11, 10, 5 | 8, 8, 9, 8, 4 | **2, 3, 1** |
| *convenient* / *efficient* lost to Malayalam | 4 / 2 of 5 | 4 / 2 of 5 | **0 / 0 of 3** |
| Over-translation watch | 8, 5, 12, 9, 11 | the same | 6, 7, 6 |
| `-ഉം` pairs without a comma | 1, 3, 4, 2, 6 | 0 in all | 0 in all |
| Splices per 100 lines (his band 1.6–2.8) | 4.0, 8.8, 4.2, 6.5, 5.6 | 1.6, 4.0, 2.5, 3.2, 3.2 | 4.0, 3.2, 2.4 |

- **The engine's share** (v0.29.3 → v0.29.5 at the same repair): banned renderings 7.4 → 2.0 per
  draft, every v0.29.5 draft below every v0.29.3 one (exact one-sided p ≈ 0.018); the pinned-term
  gate passes on all three, against none of five (p ≈ 0.018). The banned forms of the v0.8.0
  pins *satisfy*, *convenient* and *success* are gone from every v0.29.5 draft, as is ലളിതമായ
  (*simple*, rule 2), which three of the five v0.29.3 drafts produce. What remains is
  *In fact* and *Basically* (rule 8, restored by the repair in the seed path), കൈകാര്യം, and താരതമ്യം
  in two of three drafts although *compare* is pinned.
- **The repair's share** (v0.29.3, seed-era → #372 repair): `-ഉം` pairs to 0, splices from 5.8 to
  2.9 per 100 lines, banned 9.4 → 7.4 through the formula restores.
- **No encoded class regresses.** *For example* stays English at 5/5 in every draft; headings, code
  cells and all four exercise-family blocks are byte-identical; no plural on an English noun; bare
  endings 2–3 before repair and 0–1 after (v0.29.3: 1–4 and 0–2); `returns 6 → 2` is the known false alarm.
  Lowercase openers read 15, 15, 14 at v0.29.5 against 19, 3, 3, 12, 15 at v0.29.3: the same words
  at both tags (overview bullets that continue their lead-in, *standard*, *related*), none of them a
  new pin — the class is bimodal and draw-dependent, and seed selection by lint is its control.

**Watch, not a finding: #203 refusals on ml.** 2 of 5 attempts at v0.29.5 against 0 of 6 at v0.29.3
on `pandas` (p ≈ 0.18); with the 4b `game-theory.md` cells of the same day, 6/41 against 1/42 (p ≈
0.057, mixed fixtures and baselines). If real, glossary v0.8.0 is the only ml request change it
could come from. #363 (v0.30.0) repairs the wrap itself.

## Verdict and the amendment (Matt, 2026-10-19)

The gate passes on the per-class gain: the round's encoded targets moved, and nothing encoded
regressed. Decision 19 is amended so that convergence is measured against **fresh draws at the
previous release, not the seed** (the seed is the reference's own ancestor), and is reported beside
the per-class counts, which decide. Round 6 is drafted at v0.29.5 once the editor's answers on
lecture-python-programming.ml#57 are encoded.

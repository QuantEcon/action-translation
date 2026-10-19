# 2026-10-19 — handover: the Malayalam round-5 gate at v0.29.5 (`pandas` regenerated against its reviewed text), for @mmcky's local machine

**Trigger**: v0.29.5 is live (`@v0` = `e7356cc`). Before round 6 is drafted, ml plan decision 19
(QuantEcon/project-translation `plans/ml-programming-edition.md`) asks for the previous round's
lecture to be regenerated at the new release and compared against its reviewed text. The draws need
`ANTHROPIC_API_KEY`, which the session does not have; @mmcky draws locally and commits the files,
and the session does the comparison and the verdict.

**State, read live on 2026-10-19 at 08:00 UTC**:

- `@v0` = v0.29.5 = `e7356cc`; the ml request at this tag differs from v0.29.3's (the round-5 seed)
  only by `glossary/ml.json` v0.7.0 → v0.8.0 (#372) and rule 19's round-4 exception (#335, no
  site in `pandas`). The seed-shaping tooling, `ml_repair.py` / `ml_metrics.py`, changed in #372.
- **Reference**: `lectures/pandas.md` on QuantEcon/lecture-python-programming.ml `main` (`5378fd3`),
  the editor's 85 suggestions applied plus three normalisations.
- **Baseline**: the round-5 arm, `experiments/ml-benchmark/arms/2026-09-28-round5-pandas-v0.29.3/`:
  the sent seed is `pandas-v0.29.3-draw1-repaired.md`; draws 2 and 3 are beside it.
- **English source**: `lectures/pandas.md` in QuantEcon/lecture-python-programming at `55c87c9`,
  unchanged since 2026-08-18 (`main` is `b0c58ab`); the same bytes the seed and the reference were
  made from, so the comparison is like for like.

## How to run this (@mmcky, locally)

From a checkout of `main` at `e7356cc`, with `npm ci` **re-run after checking it out** and
`npm run build` done, `ANTHROPIC_API_KEY` exported, and a local clone of
QuantEcon/lecture-python-programming at `main`:

1. **Three draws**, the same count and command as the seed (so the gate compares best-of-3 with
   best-of-3). A draw the structural-parity guard refuses is retried and the refusal counted, not
   ignored (#203):

   ```bash
   SCRATCH=$(mktemp -d)
   ARM=experiments/ml-benchmark/arms/2026-10-19-round5-gate-pandas-v0.29.5
   mkdir -p "$ARM"
   for i in 1 2 3; do
     node dist/cli/index.js init -s /path/to/lecture-python-programming -t "$SCRATCH/draw$i" \
       --target-language ml -f pandas.md --localize none -m claude-sonnet-5 2>&1 | tee "$SCRATCH/draw$i.log"
     cp "$SCRATCH/draw$i/lectures/pandas.md" "$ARM/pandas-v0.29.5-draw$i.md"
   done
   ```

2. **Repair each draw as a seed would be**, keeping the raw file beside it, and record the stats:

   ```bash
   EN=/path/to/lecture-python-programming/lectures/pandas.md
   for i in 1 2 3; do
     cp "$ARM/pandas-v0.29.5-draw$i.md" "$ARM/pandas-v0.29.5-draw$i-repaired.md"
     python3 experiments/ml-benchmark/scripts/ml_repair.py --output "$ARM/pandas-v0.29.5-draw$i-repaired.md" --source "$EN" --write --json 2>> "$ARM/repair-stats.jsonl" >/dev/null
     python3 experiments/ml-benchmark/scripts/ml_metrics.py --output "$ARM/pandas-v0.29.5-draw$i-repaired.md" --source "$EN" --json > "$SCRATCH/checks-draw$i.json"
   done
   ```

   If `python3` is 3.9, both scripts still import (fixed in #372).

3. **Commit the arm** on a branch (`arms/2026-10-19-round5-gate-pandas-v0.29.5`): the three raw
   drafts, the three repaired ones, `repair-stats.jsonl`, and a short `README.md` with the tag, the
   model, the English sha (`55c87c9`), any refusals and retries, and the three `draw$i.log` tails
   (tokens and time). Push it and open a PR, or just push and say so; the session adds the
   comparison to that README before it merges. The `checks-*.json` files stay in `$SCRATCH`; the
   session re-runs the lints.

## What the session does next, on those files

Each repaired draw, and the sent seed, against the reference, with the one-method script of the
round-5 report (the engine's `prose_lines`, `SequenceMatcher`, `changed_chars`):

- the share of Malayalam prose lines that differ from the reference (the seed's was 68%), the
  median similarity of the differing lines (0.859), heavy rewrites (16.5%) and edit mass (249);
- the per-class counts behind round 5's residue: banned over-translations (seed 11 on the raw
  draft), the splice rate (seed 6.4 per 100 lines after the old repair; his band 1.6–2.8), formula
  restores, `-ഉം` pairs without a comma; and the encoded classes that must not regress (terminal
  punctuation, capitals, *For example*, plurals, the pinned-term gate on `efficient`,
  `convenient` and the rest);
- headings, code cells and exercise-family blocks byte-identical to the English.

**Verdict, per decision 19**: a net gain on the convergence measures over the v0.29.3 seed and no
regression on any encoded class → round 6 is drafted at v0.29.5 (after ml#57's answers are
encoded). A regression on an encoded class, or no gain → the cause is found before round 6, and
the fix is measured the way #372 was. Three draws decide the gate the way they decided the seed;
rate questions (a class that moves by one or two sites) go to 12 draws, as in step 4b.

The record goes to QuantEcon/project-translation as a dated report beside
`reports/2026-10-19-ml-pandas-review-disposition.md`, with the status page and NEXT-STEPS updated,
and to the arm README here.

## Results (2026-10-19, run from @mmcky's machine)

The handover was executed by a local session on @mmcky's machine, which has an API key: the draws,
the repairs and the comparison. Full record: the arm,
`experiments/ml-benchmark/arms/2026-10-19-round5-gate-pandas-v0.29.5/README.md`.

- **Draws.** Three at v0.29.5 and, as a same-day control, three at v0.29.3, each from its own
  worktree with its own `npm ci`. v0.29.5 draw 2 was refused twice (#203's fence wrap, `{raw}` and
  `(pd)=` lost) before succeeding; the controls all succeeded first time.
- **The comparison as written could not pass.** The reference is the seed with the editor's edits
  applied, so the seed matches it wherever he left a line alone: the two round-5 drafts that were
  never sent score 92% touch rate against the seed's 68%, at the same engine. Against five fresh
  v0.29.3 drafts the v0.29.5 drafts are flat on every convergence measure (touch 91–95% against
  90–94%, median similarity 0.830 against 0.828).
- **The per-class counts move where round 5 encoded.** Banned over-translations 9.4 → 2.0 per
  draft (every v0.29.5 draft below every v0.29.3 one, p ≈ 0.018); *convenient* and *efficient*
  retained in all three (lost in all five before, p ≈ 0.018); `-ഉം` pairs and splices repaired as
  at v0.29.3. No encoded class regressed.
- **Verdict (Matt): passed**, and decision 19 amended: convergence is measured against fresh draws
  at the previous release, not the seed, and reported beside the per-class counts, which decide.
- **Method.** `convergence.py` rebuilds the round-5 report's uncommitted script and reproduces its
  seed figures (68.0%, 0.859, 38.8%, 16.5%) except edit mass (273, not 249; its scale). The
  seed-era repair (`d9b243c`) reproduces the sent seed byte for byte. Both scripts are in the arm.
- **Next.** Round 6 is drafted at v0.29.5 once the editor's answers on
  QuantEcon/lecture-python-programming.ml#57 are encoded (open, no answers yet). Watch: #203
  refusals on ml, 6/41 at v0.29.5 against 1/42 before across today's two fixtures (p ≈ 0.057).

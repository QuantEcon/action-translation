# 2026-10-21 — handover: measure the held ml rule edits (rule 12 label bullets, rule 8 *now* and formulas), for @mmcky's local machine

**Trigger**: three ml prompt edits have waited for a re-drawing release, which must be measured at
≥ 12 draws per arm before it ships (a rule edit is not inert: the round-4 trims,
`experiments/ml-benchmark/arms/2026-09-28-round4-prompt-trims/`). This branch,
`ml/held-rule-edits`, carries all three in `src/language-config.ts`:

1. **Rule 12, label bullets** (lecture-python-programming.ml#57 Q1): a short label bullet, and a
   short label-like lead-in (*For the `.apply()` method:*), stays English; "make a bare noun-phrase
   bullet a full Malayalam sentence" is limited to longer, descriptive bullets; a bullet that
   completes the lead-in's sentence is translated with it. This also tells the review judge not to
   call an English label list under-translation. Code already restores label lists
   (`ml_repair.py` repair 6, #403); the prompt edit is for raw drafts, sync runs that are not
   repaired, and the judge.
2. **Rule 8, *now* by sense** (ml#25 answer 3; round-5 flags at ml#26 545, 561, 571): *now* meaning
   "next" or "at this point" → `ഇനി` mid-sentence too; `ഇപ്പോൾ` only for "at the moment", "for
   now", "currently", "while …" (his kept `ഇപ്പോൾ` at 492 and 609 are the negatives).
3. **Rule 8's list**: *In essence,* and *In practice,* join the formulas that stay English
   (`ml_repair.py` already restores them, #372).

The draws need `ANTHROPIC_API_KEY`, which the session does not have; @mmcky draws locally and
commits the files, and the session does the comparison, as for #392.

## Design

- **Arms.** *Control*: `main` (its `src/` is v0.29.5's, `e7356cc`). *Candidate*: this branch's
  head. Same day, side by side, each from its own worktree with its own `npm ci` and
  `npm run build`, as in the round-5 gate.
- **Lectures.** `pandas` (the target lecture: five label bullets, one lead-in, five *now* sites, two
  formulas) and `numpy` (held out for regressions: 109 code cells, the measure that caught the
  round-4 deletions, four *now* sites). English at `b0c58ab`.
- **Draws.** 12 per arm per lecture, 48 in all, `claude-sonnet-5`. A draw the structural-parity
  guard refuses is retried, and the refusal counted (#203).
- **Measured on the raw drafts** (before `ml_repair`, since the prompt is what changed):
  - *Q1*: `label_list_translated` (needs `--source`), and the lead-in kept English;
    *over-application*: prose bullets outside a label list that come out byte-identical to the
    English (`pandas` 542–543 and `numpy` 64–65 must stay Malayalam);
  - *R5*: `ഇനി` against `ഇപ്പോൾ` at the aligned *now* sites, split into "next" sites and his
    `ഇപ്പോൾ` sites;
  - *formulas*: Malayalam openers before the restore;
  - *regression panel*: the share of drafts that leave every paragraph before a code cell bare,
    terminal punctuation, capitals, banned renderings, plurals, `-ഉം` pairs, the splice rate, the
    pinned-term gate, headings and exercise blocks byte-identical, and parity refusals.
- **Decision rule**: ship when the Q1 and R5 targets improve (one-sided exact test, p < 0.05,
  12 v 12) and nothing on the regression panel or the over-application count worsens at the same
  test. A target that does not move is dropped from the release rather than kept on faith; a
  regression sends that edit back for rewording and a second arm.

## How to run this (@mmcky, locally)

From a clone of QuantEcon/action-translation, with `ANTHROPIC_API_KEY` exported and a local clone
of QuantEcon/lecture-python-programming at `b0c58ab`:

```bash
SRC=/path/to/lecture-python-programming
ARM=experiments/ml-benchmark/arms/2026-10-21-held-rule-edits
SCRATCH=$(mktemp -d)
for arm in control candidate; do
  ref=$([ "$arm" = control ] && echo origin/main || echo origin/ml/held-rule-edits)
  git worktree add "$SCRATCH/$arm" "$ref"
  (cd "$SCRATCH/$arm" && npm ci && npm run build)
done
mkdir -p "$ARM" "$SCRATCH/out"
for arm in control candidate; do
  for lect in pandas numpy; do
    for i in $(seq 1 12); do
      out="$SCRATCH/out/$arm-$lect-$i"
      (cd "$SCRATCH/$arm" && node dist/cli/index.js init -s "$SRC" -t "$out" \
        --target-language ml -f "$lect.md" --localize none -m claude-sonnet-5) > "$out.log" 2>&1
      cp "$out/lectures/$lect.md" "$ARM/$arm-$lect-draw$i.md"
      tail -5 "$out.log" > "$ARM/$arm-$lect-draw$i.log-tail"
    done &
  done
done
wait
```

Run from each worktree's root so the CLI loads that tree's glossary. The four loops run in
parallel; a refused draw shows as a failure in its log tail. Re-run that draw number, and keep the
failed tail beside the success, renamed `…-refused1.log-tail`.

Then commit the arm on a branch (`arms/2026-10-21-held-rule-edits`): the 48 drafts, their log
tails, and a short `README.md` with the two commit shas, the model, the English sha and any
refusals. Push it and say so. The session runs the lints and the comparison, writes the results
into the README, and adds the verdict to this log.

## What happens after

- **Passed**: this PR merges after #403. A release follows the release procedure: the gate on the
  tag, step 4b, the `@v0` smoke. It then serves round 7, after the editor's round-6 review of
  `intro` (lecture-python-programming.ml#58).
- **Partly passed**: the edits that passed ship, and the rest are reworded and measured again.
- The rule-2 arm (the everyday-speech test) is separate and not in this branch.

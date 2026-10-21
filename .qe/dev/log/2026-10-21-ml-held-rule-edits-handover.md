# 2026-10-21 — handover: measure the held ml rule edits (rule 12 label bullets, rule 8 *now* and formulas)

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
   "next, let's move on" → `ഇനി` mid-sentence too; `ഇപ്പോൾ` only where it means "at this moment"
   ("at the moment", "for now", "currently", "while …"). His kept `ഇപ്പോൾ` at ml 492 and 609
   (English 487 and 605) are the negatives.
3. **Rule 8's list**: *In essence,* and *In practice,* join the formulas that stay English
   (`ml_repair.py` already restores them, #372).

## Revised after review (2026-10-21)

The first version of this design would not have seen the regression it guards against, and it
measured the label-bullet target only in-sample. Four changes, all made before any draw:

- **Rule 8 wording.** The first draft sent "next" *or "at this point"* to `ഇനി`. "At this point"
  also reads as "at this moment", which is how the editor kept English 487 (*Plotting as before
  **now** yields*, `ഇപ്പോൾ`). The rule now uses the two senses he confirmed on ml#25, "next, let's
  move on" and "at this moment".
- **Power.** At 12 v 12 the bare-endings share has about 42% power (one-sided Fisher, α = 0.05)
  against the round-4 effect (42% → 75%). Round 4 itself showed it on `numpy` only as 2/12 v 4/12;
  it was seen on `functions` at 36 v 24 and pooled. `functions` is added at **24 per arm** (68%
  alone), and the share is also pooled over the three lectures (48 v 48).
- **Held-out label list.** `numpy` has no label list (`ml_metrics.is_label_list` over all 26
  lectures at `b0c58ab`), and rule 12 quotes three of the five `pandas` bullets and its lead-in, so
  `pandas` alone is in-sample. `functions` 270–271 (*separating different strands of logic*,
  *facilitating code reuse*) is a label list the rule does not quote. The round-2 review approved
  Malayalam there; the ml#57 ruling postdates it.
- **Pinned shas.** Control is `888cdb7` (`main` after #403; its `src/` is v0.29.5's, `e7356cc`), not
  `origin/main`. The candidate sha is captured once at the start and written to the arm README.

## Design

- **Arms.** *Control*: `888cdb7`. *Candidate*: this branch's head at the start of the run. Same
  day, side by side, each from its own worktree with its own `npm ci` and `npm run build:cli`, as
  in the round-5 gate.
- **Lectures.** English at `b0c58ab` (`git archive`).
  - `pandas`, 12 per arm: the target lecture (the label list at 54–58, the lead-in at 320, five
    *now* sites, two formulas). In-sample for rule 12.
  - `numpy`, 12 per arm: held out; 109 code cells, four *now* sites.
  - `functions`, 24 per arm: the bare-endings lecture (15/36 in the mode at v0.29.3); the held-out
    label list at 270–271; three *now* sites.
- **Draws.** 96 in all, `claude-sonnet-5`. A draw whose output file is not written (the
  structural-parity guard, #203) is retried, and the refusal counted.
- **Measured on the raw drafts** (before `ml_repair`, since the prompt is what changed):
  - *Q1*: `label_list_translated` (needs `--source`), per lecture, with a per-item table for
    `pandas` 57–58 (the 7-word items he kept English, where "a few words" is most likely to part
    from his page). The lead-in at 320 counts as kept when its words match the English, with or
    without the colon he and rule 14 add.
  - *Over-application*: bullets outside a label list that the reviewed edition has in Malayalam
    and a draft leaves byte-identical to the English: `pandas` 537–538, `numpy` 42–43, and
    `functions` 31–32 (the bullets that complete the lead-in's sentence).
  - *R5*: `ഇനി` against `ഇപ്പോൾ` at the aligned *now* sites, labelled by the reviewed edition's
    rendering at each site, split into "next" sites and "at this moment" sites.
  - *Formulas*: Malayalam openers for *In essence,* / *In practice,* before the restore.
  - *Regression panel*: the share of drafts in the bare-endings mode (≥ 10 bare before code cells)
    per lecture and pooled; terminal punctuation, capitals, banned renderings, plurals, `-ഉം`
    pairs, the splice rate, the pinned-term gate, headings and exercise blocks byte-identical, and
    parity refusals.
- **Decision rule**:
  - Ship an edit when its target improves (one-sided exact test, p < 0.05) and nothing on the
    regression panel or the over-application count worsens at the same test, on `functions` or
    pooled.
  - Because the panel is underpowered per lecture, a panel measure that worsens by 25 points or
    more without reaching p < 0.05 is flagged for Matt's call, not passed silently.
  - A target that does not move is dropped from the release rather than kept on faith.
  - A regression sends the bundle to an ablation (rule 12 against rule 8) before any edit is
    reworded, since rule 12's edit narrows a clause as well as adding one (the round-4 lesson).

## How to run this

From a clone of QuantEcon/action-translation, with `ANTHROPIC_API_KEY` exported and a local clone
of QuantEcon/lecture-python-programming:

```bash
LPP=/path/to/lecture-python-programming
SCRATCH=$(mktemp -d)
git -C "$LPP" archive b0c58ab lectures | tar -x -C "$SCRATCH" && mkdir "$SCRATCH/src" && mv "$SCRATCH/lectures" "$SCRATCH/src/"
CAND=$(git rev-parse origin/ml/held-rule-edits); echo "candidate $CAND"
git worktree add --detach "$SCRATCH/control" 888cdb7
git worktree add --detach "$SCRATCH/candidate" "$CAND"
for arm in control candidate; do (cd "$SCRATCH/$arm" && npm ci && npm run build:cli); done
mkdir -p "$SCRATCH/arm"
draw() {  # arm lecture first last
  for i in $(seq "$3" "$4"); do
    for try in 1 2 3; do
      out="$SCRATCH/out/$1-$2-$i-$try"
      (cd "$SCRATCH/$1" && node dist/cli/index.js init -s "$SCRATCH/src" -t "$out" \
        --target-language ml -f "$2.md" --localize none -m claude-sonnet-5) > "$out.log" 2>&1
      if [ -f "$out/lectures/$2.md" ]; then
        cp "$out/lectures/$2.md" "$SCRATCH/arm/$2-$1-draw$i.md"
        tail -5 "$out.log" > "$SCRATCH/arm/$2-$1-draw$i.log-tail"; break
      fi
      tail -5 "$out.log" > "$SCRATCH/arm/$2-$1-draw$i-refused$try.log-tail"
    done
  done
}
mkdir -p "$SCRATCH/out"
for arm in control candidate; do
  draw $arm pandas 1 12 & draw $arm numpy 1 12 &
  draw $arm functions 1 12 & draw $arm functions 13 24 &
done
wait
```

Run each draw from its worktree's root so the CLI loads that tree's glossary (identical in the two
arms). The eight loops run in parallel. Then commit the arm as
`experiments/ml-benchmark/arms/2026-10-21-held-rule-edits/` on a branch
(`arms/2026-10-21-held-rule-edits`): the drafts (or, if they are too large to commit, a
`records.jsonl` and the script that rebuilds it, as round 4 did), their log tails, and a
`README.md` with the two shas, the model, the English sha and any refusals.

## Verdict (2026-10-21): partly passed — rule 8 ships, rule 12 is withdrawn

Drawn in this session (the key was available after all). The arm is
`experiments/ml-benchmark/arms/2026-10-21-held-rule-edits/`, with its README:

- 96 drafts in the main arm;
- a rule-12 / rule-8 ablation on `functions`;
- a second `functions` round for rule 8. It was pre-registered when rule 8's first
  bare-endings result landed on the 25-point flag line (11/24 → 17/24, p = 0.071).

**Rule 12 fails.**
- It reaches its target only on `pandas`, whose bullets its examples quote (label list 0/12 → 12/12).
- On its own it raises parity refusals on `functions` from 1/49 to 7/31 attempts (p = 0.005) and
  the bare-endings mode from 28/48 to 20/24 (p = 0.03).
- It leaves the `pandas` `axis` bullets under the lead-in in English in 12/12 drafts, though the
  editor translated them.
- Withdrawn from this PR. The ruling stays in code (`ml_repair.py` repair 6).
- The held-out site, `functions` 270–271, completes its lead-in's sentence ("…by"), so it tested
  nothing. Whether such lists stay English is a question for the editor, drafted for the round-6
  questions issue.

**Rule 8 passes.**
- "next" → `ഇനി` on `pandas`: 1.58 → 2.17 per draft (p = 0.016).
- "at this moment" → `ഇപ്പോൾ` on held-out `numpy`: 0.50 → 0.92 (p = 0.036).
- Formulas kept: 0/24 → 14/24.
- At 48 v 48 on `functions` the bare-endings mode does not worsen (28/48 → 32/48, p = 0.26), and
  neither do refusals (1/49 → 1/49). Round 1's gap was mostly the control drawing low: the same
  engine gave 11/24 in round 1 and 17/24 in round 2.

## What happens after

- **Passed** (rule 8 alone, as this PR now carries): this PR merges (#403 is already merged). A release follows the release procedure: the
  gate on the tag, step 4b, the `@v0` smoke. It then serves round 7, after the editor's round-6
  review of `intro` (lecture-python-programming.ml#58).
- **Partly passed**: the edits that passed ship, the CHANGELOG's held entry is cut to them, and the
  rest are reworded and measured again.
- The rule-2 arm (the everyday-speech test) is separate and not in this branch.

# Arm: the held ml rule edits (#404) — rule 12 label bullets, rule 8 *now* and formulas, 2026-10-21

The measurement that #404 waits on (design in `.qe/dev/log/2026-10-21-ml-held-rule-edits-handover.md`
on that branch). The edits:

- **rule 12**: short label bullets, and a short label-like lead-in, stay English (lecture-python-programming.ml#57 Q1);
- **rule 8**: *now* by sense (ml#25 answer 3), plus *In essence,* and *In practice,* kept English.

**Verdict, by the decision rule: partly passed.**
- **Rule 12 fails and is withdrawn.** It hits its target on the lecture it quotes, but on its own it causes the `functions` regression: parity refusals, the bare-endings mode, and bullets left English that the editor translated.
- **Rule 8 passes and ships alone.** Its first `functions` round landed on the 25-point flag line (11/24 → 17/24, p = 0.071). A second round, pre-registered before drawing, settled it at 48 v 48: 28/48 → 32/48 (p = 0.26), refusals 1/49 v 1/49.

## How the drafts were made

- **Engines**, each in its own worktree with its own `npm ci` and `npm run build:cli`; the glossary is identical in all four (v0.8.0, 93 terms):
  - *control*: `888cdb7` (`main` after #403; its `src/` is v0.29.5's, `e7356cc`);
  - *candidate*: `b5c1f10` (#404's head);
  - *ablation*: `888cdb7` with the candidate's rule 12 only (`r12`) or rule 8 only (`r8`), one line of `src/language-config.ts` each.
- **Source.** `lectures/{pandas,numpy,functions}.md` from QuantEcon/lecture-python-programming at `b0c58ab` (`git archive`).
- **Command.** `init -s <source> -t <dir> --target-language ml -f <lecture>.md --localize none -m claude-sonnet-5`, from each worktree's root.
- **Draws:**
  - main arm: 96 drafts (`pandas` 12, `numpy` 12 and `functions` 24 per arm), 2026-10-21 00:26–01:24Z;
  - ablation: 24 `functions` drafts per arm, 01:02–01:46Z, beside the main arm's last hour;
  - rule 8, second round: 24 more `functions` drafts each for control and `r8` (draws 25–48), 01:53–02:27Z. Its decision rule was fixed in `run-r8-round2.sh` before any draw: pool with round 1, and drop rule 8 if the bare-endings mode or refusals are worse at one-sided p < 0.05. Extending a sample after a look inflates α slightly.
  - All the same day, from the same worktrees.
- **Refusals.** A draw whose output file was not written was retried (up to three tries; slot 20 of the candidate's `functions` was refused three times and redrawn in the ablation run). All 19 refusals are one class: the `{raw}` head directive dropped, one directive short (#203, #326).
- **Reference.** QuantEcon/lecture-python-programming.ml `main` at `96c1825`. It labels the *now* sites and the bullets the editor has in Malayalam.
- **Raw drafts.** No `ml_repair.py`: the prompt is what changed.

Files:
- `drafts.tar.xz`: every draft and log tail, in `main/`, `ablation/` and `r8-round2/`;
- `records.jsonl`, `records-ablation.jsonl` and `records-r8-round2.jsonl`: one row per draft;
- `summary*.txt`: the printed tables (in the ablation and rule-8 summaries, "candidate" is that ablation arm; `summary-r8-pooled.txt` is the pre-registered 48 v 48 test);
- `progress*.txt` and `meta*.txt`: the draw logs, with times and refusals;
- `run-arm.sh`, `run-ablation.sh`, `run-r8-round2.sh` and `analyze.py`: the method. The scripts' scratch paths are this session's.

## Method

`analyze.py ENGINE_ROOT ENGLISH_DIR REFERENCE_DIR ARM_DIR` runs `ml_metrics.py --source --json` on each draft. It aligns paragraphs with the round-4 arm's `align.py`, which pairs by position between headings and code cells and skips exercise and solution regions.

- **Q1.** `label_list_translated` per English item; the lead-in at `pandas` 320 counts as kept when its words match the English, with or without the colon the editor and rule 14 add.
- **Over-application.** A bullet outside a label list (by `is_label_list`) that the reference has in Malayalam and the draft leaves byte-identical to the English.
- ***Now* sites**, labelled by the reference's rendering:
  - "next" (`ഇനി`): `pandas` 540, 556, 566; `functions` 109, 381;
  - "at this moment" (`ഇപ്പോൾ`): `pandas` 487, 605; `numpy` 907, 1108.
  - Not used: `numpy` 1447 (left English), `functions` 361 (*now* dropped) and `numpy` 1141 (inside an exercise).
- **Formulas.** `pandas` 152 *In essence,* and 184 *In practice,*. `numpy` 1323 is inside a `{solution}` block and has no site.
- **Bare-endings mode.** Ten or more bare endings before a cell or list, as in round 4.
- **Tests.** One-sided Fisher exact for shares, and a one-sided permutation test for per-draft means (site-draws within a draft are not independent).

## Results

**Targets** (raw drafts, control → candidate):

| Target | Control | Candidate | p |
|---|---|---|---|
| `pandas` label list (54–58) all English | 0/12 | **12/12** | 3.7e-7 |
| `pandas` lead-in (320) kept English | 1/12 | **12/12** | 4.8e-6 |
| `functions` list at 270–271 all English | 0/24 | 0/24 | — |
| *now* "next" → `ഇനി`, `pandas`, per draft (of 3) | 1.58 | **2.17** | 0.016 |
| *now* "next" → `ഇനി`, `functions`, per draft (of 2) | 2.00 | 2.00 | — |
| *now* "at this moment" → `ഇപ്പോൾ`, `pandas`, per draft (of 2) | 1.67 | 1.67 | — |
| *now* "at this moment" → `ഇപ്പോൾ`, `numpy`, per draft (of 2) | 0.50 | **0.92** | 0.036 |
| *In essence* / *In practice* kept, `pandas` site-draws | 0/24 | **14/24** | 4.1e-6 |

By site:
- **Moved:**
  - `pandas` 566 (*that we can **now** manipulate*): `ഇനി` 8/12 → 12/12;
  - `numpy` 907 (*Now `b` is an independent copy*): `ഇപ്പോൾ` 6/12 → 11/12.
- **Did not move:**
  - `pandas` 556 (*We could **now** write*) stays `ഇപ്പോൾ` in 9/12 in both arms;
  - `numpy` 1108 (*Now, let's look at … **while** this code is running*) stays `ഇനി` in 12/12 in both arms, though the editor wrote `ഇപ്പോൾ` there;
  - the negatives at `pandas` 487 and 605 hold in both.

**Regression panel** (control → candidate; p one-sided for worse):

| Measure | `pandas` | `numpy` | `functions` | Pooled |
|---|---|---|---|---|
| Bare-endings mode | 0/12 → 0/12 | 2/12 → 2/12 | 11/24 → **20/24** (p = 0.007) | 13/48 → 22/48 (p = 0.045) |
| Bare endings, mean | 2.2 → 2.4 | 5.6 → 6.0 | 7.7 → **13.5** (p = 0.003) | |
| Paragraphs without punctuation, mean | 0.1 → 0.3 | 1.0 → 1.0 | 1.9 → **2.7** (p = 0.004) | |
| Parity refusals (attempts) | 2/14 → 0/12 | 0/12 → 1/13 | 0/24 → **7/31** (p = 0.013) | 2/50 → 8/56 (p = 0.068) |
| Reviewed-Malayalam bullets left English | 1/12 → **12/12** (p = 4.8e-6) | 0/12 → 0/12 | 0/24 → 2/24 | 1/48 → 14/48 |

Headings, exercise blocks, plurals, `-ഉം` pairs, splices and banned renderings did not worsen; `pandas` lowercase starts and banned renderings fell. The pinned-term gate fails on raw drafts in both arms alike; the round-5 gate counted it after repair.

**The `pandas` over-application is the lead-in clause spreading.** All 12 candidate drafts keep the whole `{note}` English: the lead-in *For the `.apply()` method* and its three `axis = …` bullets, which the editor translated.

**Ablation** (`functions`, 24 drafts per arm, against the same 24 control drafts):

| Measure | Control | Rule 12 only | Rule 8 only | Both (candidate) |
|---|---|---|---|---|
| Parity refusals (attempts) | 0/24 | **7/31** (p = 0.013) | 0/24 | 7/31 |
| Bare-endings mode | 11/24 | **20/24** (p = 0.007) | 17/24 (p = 0.071) | 20/24 |
| Bare endings, mean | 7.7 | **13.2** (p = 0.004) | 11.9 (p = 0.024) | 13.5 |
| Paragraphs without punctuation, mean | 1.9 | 2.7 (p = 0.003) | 2.4 (p = 0.039) | 2.7 |
| Continuation bullets (31–32) left English | 0/24 | 5/24 (p = 0.025) | 0/24 | 2/24 |

**Rule 8, second round** (`functions`, draws 25–48, and the pre-registered pool):

| Measure | Round 1 | Round 2 | Pooled, 48 v 48 |
|---|---|---|---|
| Bare-endings mode, control → `r8` | 11/24 → 17/24 | 17/24 → 15/24 | 28/48 → 32/48 (p = 0.264) |
| Bare endings, mean | 7.7 → 11.9 | 11.9 → 10.2 | 9.8 → 11.1 (p = 0.203) |
| Paragraphs without punctuation, mean | 1.9 → 2.4 | 2.4 → 2.2 | 2.1 → 2.3 (p = 0.202) |
| Parity refusals (attempts) | 0/24 → 0/24 | 1/25 → 1/25 | 1/49 → 1/49 (p = 0.753) |

The same control engine gave 11/24 in round 1 and 17/24 in round 2 (one-sided p = 0.071), so one 24-draw round of the mode still swings by 25 points. Against the pooled control, rule 12 alone remains worse: refusals 1/49 → 7/31 (p = 0.005) and the mode 28/48 → 20/24 (p = 0.029).

## Reading

1. **Rule 12 does not ship.**
   - It is perfect on the lecture its examples quote. On its own, though, it reproduces the whole `functions` regression: the refusal rate and the bare-endings mode are identical to the full candidate's.
   - It also leaves bullets English that the editor translated: the `pandas` `axis` bullets under the lead-in (12/12) and, in the ablation, the `functions` bullets that complete their lead-in's sentence (5/24).
   - A refusal fails the file on the sync path (`sync-orchestrator.ts` throws on a parity failure), so the refusal rate is a production cost on whole-document translations: new lectures and `init`.
2. **Rule 8 ships.**
   - Its targets move: "next" on `pandas` (p = 0.016) and "at this moment" on held-out `numpy` (p = 0.036), with no refusals.
   - Round 1 put it on the terminal-punctuation flag line (11/24 → 17/24, p = 0.071). The pre-registered second round reversed (17/24 → 15/24), and the pool does not worsen (28/48 → 32/48, p = 0.26).
   - Most of round 1's gap was the control drawing low. A single 24-draw round of the mode is not enough to call a moderate effect either way; 48 is.
   - Two sites did not move: `pandas` 556 and `numpy` 1108. They are singletons and are not worth a rewording, which is how punctuation regressions get in.
3. **The held-out label list was a poor choice of site.**
   - `functions` 270–271 complete their lead-in's sentence ("…the clarity of your code **by**"). The rule's own continuation clause arguably covers them, so 0/24 is ambiguous rather than a failure.
   - The editor's `pandas` list ("operations **such as**", kept English), `is_label_list` (which takes `functions` 270–271 as labels; #403 restores them) and the prompt draw the line in three places. That is a question for the editor, not one to settle by rewording.
4. **The first design would have passed this bundle.** At 12 draws on `pandas` and `numpy` alone, nothing on the panel moves and the refusals favour the candidate (2 v 1). Every regression is on `functions`, the lecture added for power.
5. **Not tested here:**
   - why rule 12 does this. One untested reading: its "copied byte-for-byte from the source" pulls the model toward mirroring the English, punctuation and `{raw}` head included;
   - the review judge's side of rule 12, which `init` does not exercise.

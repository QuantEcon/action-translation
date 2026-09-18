# Arm: round-3 rules × style exemplars, claude-sonnet-5, 2026-09-18

The regeneration test for the round-3 payload (44 suggestion blocks on
lecture-python-programming.ml#13, `matplotlib`; dispositions in
QuantEcon/project-translation
`reports/2026-09-18-ml-matplotlib-review-disposition.md`). Two things changed from the
round-1 and round-2 arms. It is a **2 × 2** — the rules/glossary payload crossed with the
new `style_examples` — because this round ships a mechanism as well as rules. And it is
**three draws per cell with a held-out lecture**, because the round-3 seed pair showed
draw-to-draw variance (9 of 66 lines identical) large enough to swamp a single-draw
comparison, and because a payload tested only on the lecture it was derived from cannot
tell learning from memorising.

## Design

| Arm | Engine rules | Glossary | Style examples |
|---|---|---|---|
| `A` / `fA` | main `e806bdc` (v0.28.1, 23 rules) | v0.5.0 | none |
| `Aex` | same rules, exemplar-capable build | v0.5.0 | 23 held-out pairs (`functions` 16, `python_by_example` 7) |
| `B` / `fB` | `ml-round3-v06` (27 rules) | v0.6.0 terms | none |
| `Bex` | `ml-round3-v06` | v0.6.0 terms | the same 23 held-out pairs |
| `fBex` | `ml-round3-v06` | v0.6.0 terms | 16 pairs, none from `functions` (`python_by_example` 7, `matplotlib` 9) |
| `fBcon` | `ml-round3-v06` + a local build rendering `draft` as a `NOT:` line (not shipped) | v0.6.0 terms | 20 contrastive triples (EN / engine draft / editor's correction), none from `functions` |
| `fBbig` | `ml-round3-v06` | v0.6.0 terms | 56 pairs, none from `functions` |
| `fAbig` | main `e806bdc` (23 rules), exemplar-capable build | v0.5.0 | the same 56 pairs |

- **In-sample lecture — `matplotlib`** (source `lecture-python-programming@4980d62`), scored
  against the editor's reviewed text (ml#13 head `2411a3b`: his 44 suggestions verbatim plus
  our four normalisations). The round-3 rules were derived from this review and several rule
  examples quote his sentences, so arms `B`/`Bex` are in-sample by construction. The
  exemplars in `Aex`/`Bex` are held out (none from `matplotlib`).
- **Held-out lecture — `functions`** (source `@81d9734`, the round-2 seed's own source),
  scored against his round-2 reviewed text on the edition's `main`. Nothing in the round-3
  payload was derived from it, and `fBex` carries no `functions` pairs.
- Command, every draw: `init -s <src> -t <out> --target-language ml -f <lecture>.md
  --localize none -m claude-sonnet-5 --glossary <glossaries/…>`.
- Score (`score.py`): paragraphs are aligned EN ↔ translation by position between
  structural anchors (`align.py`; exercise regions skipped), then each Malayalam paragraph is
  compared with the editor's paragraph for the same English by character similarity
  (`difflib` ratio). Signature counts ride alongside because character similarity is blunt.
- Exemplar selection (`select_exemplars.py`): aligned pairs from reviewed lectures only;
  a pair must pass the current lints (the round-1 lecture contains forms he corrected in
  round 2) and must not touch a question open with the editor; greedy for coverage of the
  style features the rules do not reach. Two pairs were removed by hand before the runs (a
  truncated English paragraph; one carrying the open *draw* question) — the script now
  excludes both classes and back-fills the slots, so re-running it yields the shipped 32
  plus two.

## Results — mean of three draws per arm

**`matplotlib` (in-sample for the rules), 62 Malayalam paragraphs**

| Arm | median sim | mean sim | exact | ≥ 0.90 | < 0.70 | commas / paragraph | Further Reading verbatim |
|---|---|---|---|---|---|---|---|
| editor's text | 1.000 | 1.000 | 62 | 62 | 0 | 0.71 | yes |
| seed v0.27.0 (1 draw) | 0.844 | 0.810 | 4 | 20 | 15 | 0.41 | no |
| seed v0.28.0 (1 draw — **the draw he edited**) | 0.951 | 0.879 | 22 | 39 | 10 | 0.42 | no |
| `A` baseline | 0.845 | 0.815 | 7.7 | 22.7 | 13.7 | 0.44 | 0/3 |
| `Aex` exemplars only | 0.854 | 0.808 | 5.3 | 22.3 | 14.3 | 0.55 | 0/3 |
| `B` rules | **0.928** | **0.890** | 13.3 | 37.3 | 6.0 | 0.67 | 3/3 |
| `Bex` rules + exemplars | **0.934** | 0.886 | 16.3 | 36.0 | 7.3 | 0.71 | 3/3 |

Signatures in `B` and `Bex`, every draw: `കരുതാം` 2/2, conditional `-ആൽ` 2/2, `ഒന്നിലധികം`
2 with *multiple* 0, `വ്യക്തമായ-` 2 with *explicit ആയ* 0, `പോലെയുള്ള` 2 with *dictionary-like*
0, `ഇനി,` 1/1, no literal *refugees / home*, no `നീക്കം ചെയ്യ`, no `പിന്തുടര`; aspect forms 7–9
against his 7 (baseline 2–5). One residual: `ലളിതമായ` in one `B` draw (2 occurrences) despite
the rule naming it — a lint catch, not a prompt fix.

**`functions` (held out), 100 Malayalam paragraphs**

| Arm | median sim | mean sim | exact | ≥ 0.90 | < 0.70 | commas / paragraph |
|---|---|---|---|---|---|---|
| editor's text | 1.000 | 1.000 | 100 | 100 | 0 | 0.82 |
| round-2 arm `ml-round2-v04` (1 draw) | 0.793 | 0.777 | 7 | 27 | 31 | 0.62 |
| round-2 arm v0.27.0 (1 draw) | 0.810 | 0.769 | 5 | 27 | 32 | 0.60 |
| `fA` baseline | 0.814 | 0.775 | 5.0 | 24.7 | 29.7 | 0.56 |
| `fB` rules | 0.809 | 0.774 | 8.0 | 27.0 | 30.0 | 0.72 |
| `fBex` rules + exemplars | 0.805 | 0.783 | 8.3 | 29.0 | 30.3 | 0.70 |
| `fBcon` rules + contrastive triples | 0.811 | 0.785 | 8.0 | 27.3 | 28.3 | 0.69 |
| `fBbig` rules + 56 pairs | 0.800 | 0.774 | 7.0 | 25.0 | 31.3 | 0.67 |
| `fAbig` baseline + 56 pairs | 0.803 | 0.767 | 7.0 | 24.3 | 31.0 | 0.71 |

## Blind pairwise judge

Character similarity cannot separate "reads like the editor" from "shares his words", so a
second instrument was built: `judge.mjs` shows `claude-opus-5` (a different, stronger model
than the `claude-sonnet-5` generator, so it is not grading its own habits) the English
paragraph, the editor's reviewed Malayalam as the reference, and two arms' renderings of the
same paragraph from the same-numbered draw in **random order**, and asks which is closer to
the reference in *style only* — register, comma placement, verb forms, clause order, which
words stay English — with TIE allowed. Identical candidates are scored TIE without a call.
Position is recorded so bias can be read off; across 2,570 judgements the first-shown
candidate won 0.48–0.54 of decisions, i.e. no bias. Decisions exclude identical pairs and
ties; the p-value is a two-sided sign test. `summarise_judge.py` reproduces the tables from
the archived `judgements-*.json`.

**`matplotlib` (in-sample for the rules)**

| Pairing | decisions | preference | p |
|---|---|---|---|
| `A` baseline vs `B` rules | 158 | rules **76 : 24** | < 0.001 |
| `A` baseline vs `Aex` examples only | 143 | examples 58 : 42 | 0.065 |
| `B` rules vs `Bex` rules + examples | 145 | 49 : 51 | 0.87 |

**`functions` (held out)**

| Pairing | decisions | preference | p |
|---|---|---|---|
| `fA` baseline vs `fB` rules | 206 | rules 55 : 45 | 0.19 |
| `fB` rules vs `fBex` rules + 16 pairs | 201 | + pairs 53 : 47 | 0.40 |
| `fA` baseline vs `fBex` rules + 16 pairs | 211 | rules + pairs 57 : 43 | 0.054 |
| `fB` rules vs `fBcon` rules + 20 contrastive triples | 189 | 51 : 49 | 0.88 |
| `fB` rules vs `fBbig` rules + 56 pairs | 205 | 50 : 50 | 1.00 |
| `fA` baseline vs `fAbig` baseline + 56 pairs | 211 | 50 : 50 | 1.00 |
| `fBex` rules + 16 pairs vs `fBcon` rules + contrastive | 187 | 16 pairs 53 : 47 | 0.38 |

Cost: 1,957 Opus 5 calls across the three judgement files.

## Reading

1. **The judge works, and it agrees with the similarity metric on the big picture.** It sees
   the in-sample rule effect decisively (76 : 24) where the rules quote the editor's own
   sentences, and on the held-out lecture it sees what similarity could not: a small,
   consistent edge for the rules (55 : 45) and a slightly larger one for rules + the shipped
   16-pair set (57 : 43, p = 0.054). The effect is real and small — a preference in roughly
   5–7 of every 100 paragraphs. Similarity is flat on the same draws (0.80–0.81 median for
   every arm), so it was the wrong instrument for style, not wrong about the size.
2. **Every exemplar variant is dead even on unseen text.** Contrastive triples (the delta the
   editor wanted, isolated): 51 : 49. A 3.5× larger set: 50 : 50. The large set *without*
   the new rules: 50 : 50 against baseline, although it reproduced the rules' comma density
   (0.71 vs 0.72) — the signature moved, the judged style did not. Examples on their own do
   shift style in-sample (58 : 42) but carry nothing the rules do not once the rules are
   present (49 : 51). The line of inquiry is closed for now: the shipped 16–32-pair set is
   the only form with any positive signal, and that signal is not significant.
3. **The ceiling is visible.** The remaining distance to the editor's text — 30 of 100
   held-out paragraphs below 0.70 similarity in *every* arm, and 25–30% of paragraphs
   byte-identical across arms — is sampling variance in the generator, not a missing
   instruction. More rules would compete for adherence (this round's misses were all of
   existing rules) without moving that floor; that is the case for lint-and-repair on the
   rules already present rather than a longer prompt.
4. **The seed he edited is not a fair baseline.** It scores 0.951 because his text is
   anchored to it — 22 paragraphs are exact because he left them alone. Fresh baseline draws
   score 0.845, the same as the v0.27.0 seed he never saw. Closeness to an editor's text
   must be measured from independent draws.
5. **Round 4's useful numbers are the editor-side ones**, held in one channel: touch rate,
   accepted-line count, and the magnitude distribution of his edits (round 2 → round 3:
   96% → 67%, 5 → 22 lines, median 0.77 → 0.85). The judge is the instrument for engine-side
   A/B questions from here on; similarity is retired for style questions.

## Incidents

- One of 31 runs (`fBex` draw 2, first attempt) was **rejected by the structural-parity
  guard** — the model dropped the `{raw}` directive, so every later directive shifted — and
  was re-run. The guard did its job; one event cannot be attributed to the exemplars, but the
  count is recorded here so a pattern would be visible (0/12 runs without exemplars on these two
  lectures, 1/19 with).
- One `Bex` draw rendered *origin* as `ഉത്ഭവസ്ഥാനത്തിലൂടെ (origin)` — a technical term
  translated with the English in brackets; it occurs in no other `matplotlib` draw. Separately,
  `preference ചെയ്യുന്നു` for *prefer* is a baseline habit (all three `A` draws, twice each) that
  the payload reduces but does not remove (2 of 6 `B`/`Bex` draws) — *prefer* is an open
  question on ml#22, so it is deliberately not pinned yet.

## Reproduce

From this directory: `python3 score.py matplotlib` and `python3 score.py functions` (writes
`scores-<lecture>.json`); `python3 summarise_judge.py judgements-<file>.json` for the judge tables;
to re-judge, `python3 make_pairs.py <lecture> <arm> <arm> … > items.json` then
`node judge.mjs items.json "x:y,…" out.json` (real Opus 5 spend; needs the repo's `node_modules`). Draws are in `draws/`, the glossaries each arm ran with in
`glossaries/`, the reviewed texts and their English sources in `corpus/`.

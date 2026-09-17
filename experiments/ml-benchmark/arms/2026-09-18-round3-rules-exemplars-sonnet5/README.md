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

## Reading

1. **The in-sample jump is mostly memorisation, and the held-out lecture says so.** On
   `matplotlib` the rules move median similarity 0.845 → 0.93 and halve the paragraphs below
   0.70. On `functions` the same payload moves similarity not at all (0.814 → 0.809 →
   0.805; the arms overlap draw for draw). What does transfer is the class the rules
   describe generically: **comma density 0.56 → 0.72 against his 0.82**, with small gains in
   exact and near-exact paragraphs (5 → 8; 24.7 → 29). The round-3 rules are doing what they
   say on unseen text; they are not making unseen text read like him overall, and no
   payload this size could — 30 of 100 held-out paragraphs sit below 0.70 in every arm, and
   that distance is lexical and structural draw variance, not a missing rule.
2. **The exemplars have no measurable effect on closeness** — `Aex` ≈ `A`, `Bex` ≈ `B`,
   `fBex` ≈ `fB`, all inside draw-to-draw spread. Without the rules they do pull the style
   signatures part-way (commas 0.44 → 0.55, aspect forms 3.3 → 4.7, `കരുതാം` appearing in two
   of three draws with no rule asking for it), so the mechanism transmits *something*; with
   the rules present it adds nothing this metric can see. 23–32 sentence pairs is a small
   set; the honest position is *harmless, cheap (cached), unproven*.
3. **The seed he edited is not a fair baseline.** It scores 0.951 because his text is
   anchored to it — 22 paragraphs are exact because he left them alone. Fresh baseline draws
   score 0.845, the same as the v0.27.0 seed he never saw. Closeness to an editor's text
   must be measured from independent draws. This also answers the question the 2026-09-03
   arm left open: the v0.28.0 draw is closer than the v0.27.0 draw (0.951 vs 0.844), but
   almost all of that gap is anchoring, not the ml#12 pins.
4. **Character similarity is near its ceiling as an instrument.** It cannot separate "reads
   like the editor" from "happens to share his word choices". Round 4's useful numbers are
   the editor-side ones, held in one channel: touch rate, accepted-line count, and the
   magnitude distribution of his edits (round 2 → round 3: 96% → 67%, 5 → 22 lines,
   median 0.77 → 0.85).

## Incidents

- One of 22 runs (`fBex` draw 2, first attempt) was **rejected by the structural-parity
  guard** — the model dropped the `{raw}` directive, so every later directive shifted — and
  was re-run. The guard did its job; one event cannot be attributed to the exemplars, but the
  count is recorded here so a pattern would be visible (0/12 runs without exemplars on these two
  lectures, 1/10 with).
- One `Bex` draw rendered *origin* as `ഉത്ഭവസ്ഥാനത്തിലൂടെ (origin)` — a technical term
  translated with the English in brackets; it occurs in no other `matplotlib` draw. Separately,
  `preference ചെയ്യുന്നു` for *prefer* is a baseline habit (all three `A` draws, twice each) that
  the payload reduces but does not remove (2 of 6 `B`/`Bex` draws) — *prefer* is an open
  question on ml#22, so it is deliberately not pinned yet.

## Reproduce

From this directory: `python3 score.py matplotlib` and `python3 score.py functions` (writes
`scores-<lecture>.json`). Draws are in `draws/`, the glossaries each arm ran with in
`glossaries/`, the reviewed texts and their English sources in `corpus/`.

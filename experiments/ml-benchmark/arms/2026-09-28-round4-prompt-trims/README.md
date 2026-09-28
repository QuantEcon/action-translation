# Arm: round-4 prompt trims — what ships and what doesn't, 2026-09-28

The round-4 review (lecture-python-programming.ml#23, `numpy`; dispositions in QuantEcon/project-translation `reports/2026-09-28-ml-numpy-review-disposition.md`) proposed four prompt changes for the next release.

| # | Change | Why |
|---|---|---|
| E | **Rule 19 exception:** "have already seen / met X" takes the completive `-കഴിഞ്ഞു` | His form at 4 of 4 sites across rounds; the engine's at 0 of 18 |
| D1 | **Delete** rule 12's "and em-dashes" | Never fired (0 of 36 draw lines); he keeps and adds dashes |
| D2 | **Narrow** rule 18(a)'s "always after `എന്നത്`" to a lecture's opening sentence | He left 13 of 13 bare `എന്നത്` alone and added none |
| D3 | **Delete** the glossary's ban on `പ്രവർത്തിക്കുന്നു` under `work` (v0.7.0 → v0.7.1) | An extrapolation from an answer about one line (ml#12 Q4) |

The deletions looked zero-risk, but they were measured anyway, at 12 or more drafts per arm, because the rate questions need that many.

## Design

- **Arms:**
  - **A** — the rules at v0.29.3 (`16e50f6`, identical for ml to `main` at the time);
  - **B** — all four changes;
  - **C** — E only;
  - **D** — D1 + D2 + D3 only.
- **Drafts.** Every draft was `init -f <lecture>.md --localize none -m claude-sonnet-5` with the arm's own glossary.
- **Lectures:**
  - `numpy` (the "already seen" sites, and the simple-past control at line 864);
  - `functions` (two "already met" sites, 36 drafts per arm for A and B);
  - `python_essentials` (a site the editor has never reviewed);
  - `matplotlib` (rule 19's own `alpha` example, as the no-regression check).
- **Sources.** The same as the #331 regeneration arm (`numpy` / `python_essentials` at `lecture-python-programming@b0b0b56`; `functions` / `matplotlib` as in the round-3 arm). Six of the A drafts per lecture for `numpy`, `functions` and `matplotlib` are the raw drafts from `2026-09-28-round4-splice-repair-eval`.
- **What's archived.** `records.jsonl` holds one record per draft: bare endings, splice rate, the form at every measured site with its Malayalam text, the `alpha` site, dash retention, the opener comma, and `work` / `പ്രവർത്തിക്ക` counts. The 192 drafts themselves (about 7 MB) are not committed. `measure.py` rebuilds the records from drafts named `<lecture>-<arm>-draw<n>.md`, and `summarise.py` prints the tables below.
- **The bare-endings mode.** Bare endings are bimodal by draft. A draft either punctuates the paragraphs before its code cells (about 0 bare) or mirrors the unpunctuated English and leaves all of them bare (16–45). The measure is the share of drafts in that mode, with 10 or more bare endings.

## Results

| Lecture | Arm | Drafts | In the bare-endings mode | Completive at "already seen / met" | Simple past (864) → completive | `alpha` perfect | Dashes kept | Opener `എന്നത്,` |
|---|---|---|---|---|---|---|---|---|
| `functions` | A | 36 | 15 | 36/71 | — | — | 72/72 | 11/36 |
| `functions` | B | 36 | **27** | 56/58 | — | — | 72/72 | 15/36 |
| `functions` | **C** | 24 | **10** | **46/46** | — | — | 48/48 | 11/24 |
| `functions` | D | 24 | **18** | 21/43 | — | — | 48/48 | 6/24 |
| `numpy` | A | 12 | 2 | 0/19 | 0/12 | — | 12/12 | 7/12 |
| `numpy` | B | 12 | 4 | **23/23** | **12/12** | — | 12/12 | 11/12 |
| `python_essentials` | A | 12 | 11 | 4/12 | — | — | — | 0/12 |
| `python_essentials` | B | 12 | 12 | **10/12** | — | — | — | 0/12 |
| `matplotlib` | A | 12 | 1 | — | — | 12/12 | 36/36 | 12/12 |
| `matplotlib` | B | 12 | 3 | — | — | 12/12 | 36/36 | 11/12 |

**Bare-endings mode, Fisher exact, two-sided:**

| Comparison | A | Other arm | p |
|---|---|---|---|
| `functions`, A vs **B** (all four) | 15/36 | 27/36 | **0.008** |
| `functions`, A vs **C** (E only) | 15/36 | 10/24 | **1.000** |
| `functions`, A vs **D** (deletions only) | 15/36 | 18/24 | **0.017** |
| Pooled over four lectures, A vs B | 29/72 | 46/72 | 0.007 |

**Structural-parity refusals:** A 0 of 84 attempts; B 2 of 84 (both on `functions`, both the `{raw}` head directive dropped, the #326 class); C 0 of 24; D 0 of 24.

## Reading

1. **E works and is clean: ship it.**
   - It lifts the completive at the target sites on every lecture: `numpy` 0/19 → 23/23, `python_essentials` (never reviewed) 4/12 → 10/12, `functions` 46/46 in arm C.
   - On its own it leaves the bare-endings mode unchanged (A 15/36, C 10/24, p = 1.0) and caused no refusals.
2. **The deletions regress terminal punctuation: don't ship them.**
   - D1–D3 together move `functions` drafts into the bare-endings mode from 42% to 75% (p = 0.017). In the full bundle the effect shows on all four lectures (p = 0.007 pooled).
   - None of the three touches the terminal-punctuation rule; adherence to that rule is draw-dependent and sensitive to unrelated prompt text.
   - Which of the three is responsible was not isolated. They are recorded as measured and not shipped, and should not come back without their own arm.
   - Lesson for the programme: **a deletion is not inert; measure it like an addition.**
3. **One side effect of E, to watch.** It also turns the simple past "*We already saw examples … above*" (`numpy` 864) into the completive, 12/12 against 0/12 bare. The editor left the bare past there in round 4, which is acceptance, not a rejection of the completive. Watch whether he edits it on the next draft that carries it.
4. **The rule's own example holds.** The `alpha` perfect held 12/12. One B draft restructured the sentence onto a different verb, still in the perfect (`ആക്കിയിട്ടുണ്ട്`).

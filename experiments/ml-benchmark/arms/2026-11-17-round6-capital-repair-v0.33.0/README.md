# Arm: the round-6 capital repair on fresh drafts at v0.33.0, 2026-11-17

Validates repair 7 in `ml_repair.py` (capitalise a lowercase English word that opens a Malayalam paragraph) on fresh current-engine output. It asks two things: does the repair move drafts toward the editor's reviewed text, and does it move anything away from it?

- **Drafts.** 13 of `intro` (the round-6 lecture, lecture-python-programming.ml#58) and 3 of `pandas` (round 5, a held-out reviewed lecture). All were made at v0.33.0 (`d68f54d`, `@v0`) with `init -s <English> -f <file>.md --localize none -m claude-sonnet-5` (`draw.sh`). The English was lecture-python-programming at `426fb42`; `intro.md` is unchanged there since `a2a3763`. Engine prompt for ml: v0.29.5's plus rule 8 (#404).
- **Arms.** Paired: each draft is repaired twice, by `ml_repair.py` at `main` (`9d6292a`) and at this branch, and each result is compared with the reviewed page. For `intro` that is ml#58's head `6e70325`, the editor's two suggestions applied. For `pandas` it is ml `main` `99b4642`. Only the repair differs between the arms (`compare.py`, which writes `*-compare.json`).

## Results

| | `intro` (13) | `pandas` (3) |
|---|---|---|
| Lowercase paragraph openers after repair, main → branch | 11 → 0 | 35 → 0 (19, 1, 15 per draft) |
| Every other lint count (`-ഉം` commas, plurals, punctuation, splices) | identical | identical |
| Prose similarity to the reviewed page, mean | 0.7595 → 0.7629 | 0.8019 → 0.8027 |
| Drafts closer / same / further | 11 / 2 / 0 | 3 / 0 / 0 |
| Lines identical to the reviewed page | 0 → 0 | 30 → 31 |

**Precision.** At each capitalised site, did the reviewed page open a paragraph with the capitalised word?
- **`intro`:** 11 of 11 agree.
- **`pandas`:** 32 agree and 3 he reworded; none has the lowercase form. Of the reworded three, two are plain (`read …`, `standard …`). The third, `if-else statement-ൽ`, is open: his page has `if-else` mid-sentence only, so a paragraph-initial `If-else` has not been put to him.

Similarity moves little because each repair changes one letter. The per-class count is the measure, as plan decision 19 has it.

**Engine observations on the way** (v0.33.0 against v0.29.5 on `intro`):
- No parity refusals in 16 attempts (5 of 11 before).
- Front matter identical to the English in all 16 drafts (4 of 6 dropped it before; #326).
- No Malayalam plural on an English noun in 13 drafts (3 of 6 before).
- ശ്രദ്ധ കേന്ദ്രീകരി (*focus*) in 12 of 13 `intro` drafts: the new watch reports it.

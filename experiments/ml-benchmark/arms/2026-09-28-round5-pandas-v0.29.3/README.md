# Arm: round 5 (`pandas`) — three draws at v0.29.3, chosen by lint, 2026-09-28

These are the round-5 calibration seed drafts for lecture-python-programming.ml, sent as lecture-python-programming.ml#26.

- **How they were made.** Three drafts at v0.29.3 (`16e50f6` = `@v0`) from `lecture-python-programming@b0b0b56` (`pandas.md` unchanged since `55c87c9`), with `init -f pandas.md --localize none -m claude-sonnet-5` and glossary v0.7.0. All three succeeded on the first attempt.
- **What was sent.** Draft 1, chosen on the residue that no repair touches, then repaired with `ml_repair.py` at `d9b243c` (which includes #331's splice repair). The repair counts are disclosed on the PR.
- **`checks.jsonl`** holds the per-draft checks: ml_metrics lints, headings, code cells, and exercise-family blocks via the engine's `findVerbatimViolations`.

| Draft | Bare endings | Lowercase openers | Banned | `-ഉം` pairs without comma | Splices / 100 (resumptive) | Exercise blocks |
|---|---|---|---|---|---|---|
| **1 (sent)** | 3 | 8 | 2 | 8 | 7.2 (1) | 4/4 |
| 2 | 3 | 24 | 2 | 5 | 4.0 (0) | 4/4 |
| 3 | 1 | 9 | 3 | 8 | 11.2 (3) | 4/4 |
| 1 after repair | 1 | 8 | 2 | 0 | 6.4 (0) | 4/4 |

**Why draft 1.**
- Bare endings, `-ഉം` commas and resumptive splices are all repaired, so they don't decide the choice.
- Draft 2's 24 lowercase openers are mostly real misses of rule 15 (*related*, *statistically*, *standard* …).
- Draft 3 renders *simple* as `ലളിതമായ`, a rule-2 miss, and has the most non-resumptive splices.
- Draft 1's 8 lowercase hits are mostly bullets that continue their lead-in (the editor's question 2 on lecture-python-programming.ml#25), `pandas` itself, and `axis = 0` bullets.

**Repairs on the sent draft** (11 in total, no hand edits):
- eight `-ഉം` commas;
- one splice split (line 242);
- two colons, at lines 64 and 540.

Both colons end a sentence that runs on into the list below it (`…, pandas:` before "1. defines …"). That is the case the round-4 analysis flagged as uncertain for the colon repair, and the PR asks the editor to flag it if it reads wrong.

**Left as generated and disclosed:**
- line 56: lowercase `data science` opening a paragraph;
- line 137: *In fact,* → `വാസ്തവത്തിൽ`, a rule-8 miss in all three drafts;
- line 236: a comma before a code cell;
- line 604: no full stop.

**Two false alarms in the pinned-retention check, the same in all drafts.**
- `returns 6 → 2`: the English verb becomes the light verb `return ചെയ്യുന്നു`, which the count does not fold to the plural.
- `work 5 → 1`: *working with data* is rendered `പ്രവർത്തിക്കാൻ`. The glossary ban on that form is dropped in the round-4 trims.

## Review outcome (2026-10-19)

The editor reviewed the sent draft between 2026-10-09 and 2026-10-16: 85 suggestion blocks on 85 of 125 Malayalam prose lines, all applied verbatim (`006c855`) with three normalisations (`5da1c5c`), squash-merged as `5378fd3`. Dispositions: QuantEcon/project-translation `reports/2026-10-19-ml-pandas-review-disposition.md`; his questions are lecture-python-programming.ml#57.

| Measure (one method, `prose_lines`) | r3 `matplotlib` | r4 `numpy` | r5 `pandas` |
|---|---|---|---|
| Touch rate | 66.7% | 51.0% | 68.0% |
| Median similarity | 0.824 | 0.895 | 0.859 |
| Heavy rewrites (< 0.70) | 27.3% | 5.5% | 16.5% |
| Touch rate, lines < 120 chars | 64% | 40% | 65% |

- **Every encoded class held**: 0 terminal-punctuation flags, 1 capitalisation flag (56, disclosed; draw 3 had the capital), *For example* 5/5, *provide* 6/6, and all 11 repairs kept — including both colons at a list lead-in (64, 540), the case the round-4 analysis was unsure of. He left 236 (a comma before a cell) and 604 (a bare `{note}` ending), as he left 878 in round 4.
- **The residue is unencoded classes**: over-translation of everyday words (24 flags to English, 3 the other way), sentence splitting past the pronoun subset (7 of the 8 finite-verb comma sites the lint saw, 8 restructures besides), word order (30), explicit referents (18). No hard mistranslation; three mild.
- **Draw 3** was closer to his text than the seed at 16 of the 85 flagged lines (draw 2 at 4) and matched his line at 3. The selection keys used here are all repaired before sending, so they could not separate drafts.
- **What this round changed in the scripts** (the PR that adds this section): the splice repair widens to any finite-verb comma followed by a continuing clause, the discourse formulas are restored source-gated, the `-ഉം` comma covers multi-word items, and the round's over-translations become banned renderings and glossary v0.8.0 pins. Re-run on `pandas-v0.29.3-draw1.md` with the English source: 12 `-ഉം` commas, 8 splits, 3 formulas and 2 colons (the sent draft had 8, 1, 0 and 2); splice rate 6.4 → 1.6 per 100 lines; the retention gate fails on `efficient` and `convenient`, which it could not see before. No change on the merged `numpy`, `matplotlib` or `pandas`.

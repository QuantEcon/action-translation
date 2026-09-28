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

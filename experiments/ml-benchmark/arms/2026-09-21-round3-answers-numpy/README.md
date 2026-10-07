# Arm: the ml#22 answers on `numpy` — three draws against the v0.29.0 draws, 2026-09-21

Does encoding the editor's answers on lecture-python-programming.ml#22 move the output? Three
draws of `numpy` at branch `ml-round3-answers-ml22` (`27198f3`; rules 28, glossary v0.7.0),
generated exactly as the round-4 seed was (`init -f numpy.md --localize none -m claude-sonnet-5`
from `lecture-python-programming@1706cea`), scored with `ml_metrics.py` beside the three
archived v0.29.0 draws in `../2026-09-18-round4-numpy-v0.29.0/`. Same source, same model, same
command — only the rules and glossary differ. `numpy` is held out: no rule quotes it.

| Draw | `provide ചെയ്യ…` | `നൽകു…` | hyphenated `-ഉം` pair, no comma | … with comma | Malayalam plural on English noun | bare endings | banned |
|---|---|---|---|---|---|---|---|
| v0.29.0 · 1 | 5 | 2 | 2 | 0 | 0 | 46 | 2 |
| v0.29.0 · 2 | 5 | 0 | 0 | 0 | 0 | 35 | 2 |
| v0.29.0 · 3 (sent as round 4) | 6 | 1 | 2 | 0 | 0 | 3 | 3 |
| branch · 1 | **0** | 6 | 0 | 0 | 0 | 0 | 2 |
| branch · 2 | **0** | 6 | 2 | 1 | 1 | 36 | 2 |
| branch · 3 | **0** | 7 | 2 | 1 | 0 | 2 | 2 |

What it shows:

1. **The glossary change is deterministic.** `provide ചെയ്യ…` 16 → 0 across three draws. A
   glossary pin is obeyed; this is the third round to show it.
2. **The corrected comma rule moves the output only part-way: 0 of 4 → 2 of 6.** Both hits are
   the same pair (`mature-ഉം, fast-ഉം`), both misses are the same two lines in both draws
   (`Columns-ഉം rows-ഉം` opening a sentence; `Step 1-ഉം 2-ഉം`). On the harness lane the one
   opportunity was also a miss (test-translation-sync.ml#191, `updated content-ഉം examples-ഉം`).
   A prompt rule the editor states as "always" lands about a third of the time — the same finding
   as the terminal-punctuation class, and the same remedy: it is mechanical, so `ml_repair.py`
   now inserts it (2 commas on draw 3; nothing else touched).
3. **The plural rule has nothing to do on this lecture** — the v0.29.0 draws have no Malayalam
   plural on an English noun either. The one instance is on the branch (draw 2,
   `additional functionality-കൾ`), and it is a **mass noun**, like `logic-ുകളെ` on the reviewed
   `functions` page: the rule says "use the English plural" and there is none. That case is a
   question to the editor (put to him on lecture-python-programming.ml#24), not yet a rule.
4. **Bare endings remain draw-dependent** (0 / 36 / 2 here; 46 / 35 / 3 at v0.29.0) — nothing in
   this change touches them; best-of-N by lint remains the way to choose a seed.

No draw from this arm goes to the editor — every round is generated at a published `@v0`, and
these are from an unreleased branch. But the arm is why round 4 will be regenerated: branch
draw 1 is cleaner than the draft he was sent (v0.29.0 draw 3) on every lint, so
lecture-python-programming.ml#23 is refreshed at `@v0` once this change is released (decided
2026-09-21; he had not started and was asked to hold off).

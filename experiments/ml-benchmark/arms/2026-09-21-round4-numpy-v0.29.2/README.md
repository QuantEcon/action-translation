# Arm: round 4 (`numpy`) regenerated — three draws at v0.29.2, chosen by lint, 2026-09-21

The round-4 calibration seed for lecture-python-programming.ml was first generated at v0.29.0
(`../2026-09-18-round4-numpy-v0.29.0/`, draw 3 sent). The editor then answered the round-3
questions (lecture-python-programming.ml#22) before starting on it, so the seed was regenerated
at the release that carries his answers — the round-3 precedent at v0.28.0. Three draws at
v0.29.2 (`5f74d74` = `@v0`) from `lecture-python-programming@b0b0b56` (`numpy.md` unchanged
since `1706cea`), `init -f numpy.md --localize none -m claude-sonnet-5`.

| Draw | bare endings before a cell/list | paragraph without punctuation | lowercase-initial | banned | hortative watch | `-ഉം` pair, no comma | *For example* → ഉദാഹരണത്തിന് | `provide ചെയ്യ…` | exercise blocks | headings / code cells |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 (**sent**, after repair) | **1** | 0 | 0 | 1 | 1 | 1 → 0 | 0 | 0 | 8/8 | identical |
| 2 | **37** | 1 | 0 | 2 | 0 | 1 | 6 | 0 | 8/8 | identical |
| 3 | **2** | 8 | 2 | 2 | 2 | 1 | 0 | 0 | 8/8 | identical |
| v0.29.0 draw 3 (first sent) | 3 | 0 | 0 | 3 | 1 | 2 | 0 | 6 | 8/8 | identical |

`ml_repair.py` was applied to draw 1 and **disclosed on the PR** — the first seed to go to the
editor repaired. It made one change: `Columns-ഉം rows-ഉം` → `Columns-ഉം, rows-ഉം` (line 280).
Every draw here leaves exactly one hyphenated pair without its comma — that pair in draws 1 and
3, `Step 1-ഉം 2-ഉം` in draw 2 — and those are the same two lines the 2026-09-21 answers arm
missed: the prompt rule does not reach them, the script does. Left as
generated and disclosed: line 878 (ends on a closing bracket before a cell), line 898 (*In
fact* → വാസ്തവത്തിൽ, a banned rendering), line 1092 (a genuine future statement the hortative
watch flags). Whether he touches the repaired line is the first field evidence for #260.

Terminal punctuation remains the draw-dependent class (1 / 37 / 2 here; 37 / 34 / 3 at
v0.29.0): best-of-N by lint is still what keeps it away from the editor.

# Arm: round 4 (`numpy`) — three draws at v0.29.0, chosen by lint, 2026-09-18

The round-4 calibration seed for lecture-python-programming.ml was generated three times at
the released v0.29.0 engine (`a6fda54`) from `lecture-python-programming@1706cea`
(`init -f numpy.md --localize none -m claude-sonnet-5`) and the cleanest draw by the
deterministic ml lints went to the editor. Archived because the three draws show, on one
source and one engine, how draw-dependent the terminal-punctuation miss is — the case
for lint-based best-of-N selection and for the deterministic repair (#260).

| Draw | bare endings before a cell/list | wrap-class flags | *For example* → ഉദാഹരണത്തിന് | lowercase-initial | banned | hortative watch | exercise blocks | headings |
|---|---|---|---|---|---|---|---|---|
| 1 | **37** | 9 | 7 | 3 | 2 | 0 | 8/8 | 20/20 |
| 2 | **34** | 1 | 0 | 0 | 2 | 1 | 8/8 | 20/20 |
| 3 (**sent**, ml round-4 PR) | **3** | 0 | 0 | 0 | 3 | 1 | 8/8 | 20/20 |
| 1 after `ml_repair.py` | 2 | 9 | 1 (inline, not sentence-initial) | 3 | 2 | 0 | 8/8 | 20/20 |

The source is hard-wrapped (294 unpunctuated source lines); draws 1 and 2 mirror that
shape and end paragraphs bare before cells, draw 3 does not. `ml_repair.py` (in
`scripts/`) repairs the two mechanical classes on draw 1: 35 colons, 5 *For example*.
Draw 3's residuals were left as generated and disclosed on the PR: 3 bare endings (one
a list intro, one a wrap, one ending in a parenthesis), 3 banned renderings (one a
legitimate *follow the rules* sense, *In fact* → വാസ്തവത്തിൽ, *explicit ആയ*), 1 hortative
watch that is a plain statement.

# Arm: round 3 (`matplotlib`) regenerated at v0.28.0 — before review, 2026-09-03

The round-3 calibration seed on lecture-python-programming.ml#13 was generated at
v0.27.0 on 2026-09-01. The editor had not started reviewing it when v0.28.0 shipped
on 2026-09-03 with his ml#12 answers (glossary v0.5.0, rules 24 → 23) and the
verbatim exercise-family policy, so the lecture was regenerated at the new release
and the PR head replaced (ml#13 `9e8616b`; the v0.27.0 draw stays as the previous
commit). Both draws are archived here because the pair is a clean before/after of
one release on one lecture with nothing else varied — the first arm whose "reviewed"
column is still empty, to be filled in when round 3 is applied.

## Provenance

| Field | v0.27.0 draw (ml#13 `1f726ff`) | v0.28.0 draw (ml#13 `9e8616b`) |
|---|---|---|
| Model | `claude-sonnet-5` | `claude-sonnet-5` |
| Command | `init … --target-language ml -f matplotlib.md --localize none` | same |
| Source | `QuantEcon/lecture-python-programming@4980d62` | same (unchanged) |
| Engine | v0.27.0 (`125801c`) | v0.28.0 (`9284fbc`), built at main `37374d7` (dev-only diff) |
| Tokens / wall time | 25.8k / 3.4 min (as logged on ml#13) | 13,168 / 124 s |
| Hand edits | one heading restored (`Matplotlib-യുടെ` → `Matplotlib's`) | none |

## Scores (`scripts/ml_metrics.py`, glossary v0.5.0 for both)

| Check | v0.27.0 draw | v0.28.0 draw |
|---|---|---|
| headings byte-identical | 15/15 **after** a hand restoration | 15/15, no hand edit |
| pinned-term retention (17 checked) | FAIL: *already* → ഇതിനകം, *name* → പേര് (+ `returns`, the #240 false positive) | clean apart from `returns` |
| round-2 lints (bare ending / lowercase-initial / banned / hortative-watch) | 0 / 1 / 0 / 1 | 0 / 0 / 0 / 1 |
| casing variants / transliterations | 0 / 0 | 0 / 0 |
| exercise + solution blocks byte-identical | yes (by content — the v0.27.0 rule allowed translation) | yes (by construction — verbatim policy) |
| script ratio (mean / median) | 0.517 / 0.539 | 0.520 / 0.534 |
| നമുക്ക് (hortative subject) | 8 | 10 |
| *For example* kept English | 1/1 | 1/1 |

## Closeness between the two draws

Same length (509 lines) and the same 66 Malayalam prose lines, but only 9 of those
lines are byte-identical across the draws (14%); character-level similarity of the
prose 0.683. That is the same order of draw-to-draw variance the round-2 arms showed
(exact-line match 11–21% against the reviewed text), so the gate improvements above
are attributable to the release, the wording differences are not.

## What to read off it when round 3 is reviewed

Fill in a "reviewed" column from the editor's suggestions on ml#13 and compute the
closeness of each draw to it. If the v0.28.0 draw is not closer than the v0.27.0
draw despite the cleaner gates, the ml#12 pins are not where the remaining review
effort goes — the prose classes (#260's post-processing) are.

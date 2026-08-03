# Arm: post-packet rules, claude-opus-5, 2026-08-03

The regeneration run that verifies the packet-derived rule changes generalise
(DISPOSITIONS.md "Rule text" section; PR #237). Archived per the process rule
DISPOSITIONS.md records: any machine output an analysis quotes gets committed —
the original Stage 1 arm was not, and its full sentences are unrecoverable.

## Provenance

| Field | Value |
|---|---|
| Model | `claude-opus-5` |
| Command | `init -s <src> -t <target> --target-language ml -f getting_started.md --localize none -m claude-opus-5` |
| Source | `QuantEcon/lecture-python-programming.myst@5816589820442faf73fded65d1743fda238e25d3` (same commit as the Stage 1 arm) |
| Engine | `ml/register-rules` branch — rules 7→10 rewrite + glossary v0.2.0 (57 terms) |
| Tokens / wall time | 23,136 / 4.1 min |

## Scores (vs the Stage 1 arm under the old rules)

| Metric | Stage 1 arm (old rules) | This arm (new rules) |
|---|---|---|
| `ml_metrics.py` FAIL gates | clean | clean |
| Targeted transliterations | `ക്ലിക്ക്` ×6, `ഓപ്ഷൻ` ×3, `സെറ്റ്` ×2 (packet A14) | **0** |
| Native verbs for software actions (A9) | systematic — every substantially-divergent paragraph more Malayalam | **0** (`അമർത്ത`/`അടിക്ക`/`അടയ്ക്ക`/`പ്രവർത്തനക്ഷമമാ` absent) |
| hit → press normalisation (A8) | `hit` → `അടിക്കുക` (strike sense) | `hit the Esc key` → `` `Esc` key … press ചെയ്യുക `` |
| A1 ordinary words in Latin | 32 rendered in Malayalam | hopefully, example, best, simple, important, try… all Latin |
| Script ratio (prose paragraphs) | above the reference (more Malayalam), one-directional | mean **0.464** vs reference 0.485; p10 0.188 / p90 0.684 vs 0.132 / 0.707 — inside the band, at parity |

The A9 fix reproduces the reviewer's own construction on the packet's example
sentence — his `ആ bug icon-ൽ click ചെയ്താൽ Jupyter-ന്റെ debugger enable ആകും.`
vs this arm's `ഈ icon click ചെയ്താൽ Jupyter debugger enable ആകും.` (line 408).

One rendering, one model, one document: evidence the rules moved the output to
the reviewer's register, not a rate estimate (#227 discipline still applies).

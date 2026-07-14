# REPORT: Does extended thinking improve Sonnet 5 translation?

**Date**: 2026-07-14 · **Status**: Concluded (from calibration + a targeted
diagnostic; the full 96-cell matrix was **not** run — see Why we stopped early).

## TL;DR / Decision

**Keep extended thinking OFF for translation** (ratifies the shipped
`DEFAULT_THINKING = disabled`). On Sonnet 5, adaptive thinking **self-regulates
to ~zero on translation** — the model decides a faithful translation needs no
deliberation — so "thinking on vs off" is a no-op in cost, latency, and quality.
There is no systematic signal to gain by enabling it, so we did not spend the
~$36 on the full matrix.

## What we ran

- **Calibration cell**: `fr` × `pv.md` × variants A (off) / B (adaptive·medium) /
  C (adaptive·high) × 1 rep — 3 translations + 3 blind Opus (4.8) reviews.
- **Diagnostic**: direct Sonnet 5 calls on a reasoning-heavy prompt, thinking
  off vs adaptive, to confirm the thinking parameters actually engage.

## Findings

**1. Thinking works — but the model won't use it for translation.**
The diagnostic is unambiguous: on a math/reasoning prompt, `adaptive` produced a
thinking block and output jumped **1607 → ~6000 tokens**. On the `pv.md`
translation, the same settings added **+24–32 tokens** (essentially zero), even
at `effort: high`.

| variant | output tokens | $ translate | latency | Opus overall |
|---|--:|--:|--:|--:|
| A — off | 9715 | $0.206 | 67.7s | 9.75 |
| B — adaptive·medium | 9739 | $0.206 | 67.6s | 10.0 |
| C — adaptive·high | 9747 | $0.206 | 68.1s | 9.25 |

**2. The variants differ ~20% by line — but it's run noise, not thinking.**
A-vs-B, A-vs-C, and B-vs-C all differ by ~19–20% of lines. They are **equidistant**:
if thinking helped, the two thinking variants would cluster and pull away from A.
They don't — this is uniform run-to-run variance (no `temperature` control on
Sonnet 5), i.e. three independent stochastic samples of the same process.

**3. The automated (Opus) judge saturates.** Scores sit at 9.25–10, and C(high)
landed *below* A(off) — noise at the ceiling. With no thinking signal to find, a
blind A/B/C native ranking would only measure which random draw the reviewer
happened to prefer, so it can't answer the thinking question either.

## Why we stopped early

The mechanism (thinking self-regulates to ~0 on translation) + the equidistant
noise pattern make the answer clear without the full grid. Running 96 cells
(~$36) would have measured stochastic noise across more lectures and both
languages, not a thinking effect. **Residual caveat**: n=1 lecture; a
derivation-heavy lecture *might* trigger more thinking. Low priority — translation
is a transform, not a reasoning task — but re-open if a future lecture type shows
a real gap.

## Cost correction (act on this)

Real cost is **~$0.21 / file** for `fr` translation — **~4× the docs' ~$0.05**.
The 357-term glossary (~15K input tokens) is in every prompt and dominates
(input ≈ $0.06, output ≈ $0.15). The doc cost tables (action-reference, cli-
reference, faq, tutorials) were scaled ~1.3× for the tokenizer but never
accounted for the glossary — they need a real correction, ideally from measured
`metrics.jsonl` once we do a wider run.

## Baseline-quality issues surfaced (for the French init, not thinking)

The calibration incidentally exposed real gaps worth a **native review of the
shipped-config output** (one translation per lecture, *not* a blind thinking
ranking):

- **Terminology isn't pinned.** "Payments" is absent from the `fr` glossary, so
  the model drifts run-to-run (*paiement* vs *versement*). Consistency is the real
  risk when bulk-translating all French lectures → add missing terms to the glossary.
- **French typography**: no non-breaking space before `; : ! ?` in any variant
  (Opus rated it 10/10 — it missed this). Emile should check.
- Possible grammar slips (*facteur d'actualisation temporelle* vs *temporel*).

## Provenance

- Harness + prompts: `scripts/` (see [PLAN.md](./PLAN.md)); metrics in
  `outputs/metrics.jsonl` (git-ignored).
- Decision record: `.dev/decisions/D-2026-07-14-thinking-off-sonnet5.md`.

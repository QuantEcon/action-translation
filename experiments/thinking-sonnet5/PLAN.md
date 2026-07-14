# Experiment PLAN: Does extended thinking improve Sonnet 5 translation? (zh-cn)

**Created**: 2026-07-14
**Status**: Design — not yet run
**Primary language**: `zh-cn` (Simplified Chinese)
**Decision this informs**: whether, where, and at what effort to enable adaptive
thinking on `claude-sonnet-5`, currently pinned **off** tool-wide
(`DEFAULT_THINKING` in [`src/models.ts`](../../src/models.ts)).

---

## 1. Question & hypothesis

**Question.** On `claude-sonnet-5`, does enabling adaptive thinking measurably
improve translation quality enough to justify its token cost — and if so, on
which paths and at what `effort` level?

**Hypothesis.** Thinking helps most on reasoning-heavy content (math derivations,
terminology consistency, localization judgment) and least on mechanical prose,
so the answer is likely *path- and content-dependent* rather than a blanket on/off.

**Why now.** Two facts motivate a measured decision rather than a guess:
- The shipped action (v0.15.0, Sonnet 4.6) has **always run thinking-off** — no
  `thinking` param is sent anywhere. Any prior belief that "thinking improved
  results" was never actually deployed in the action, so we have **no production
  baseline** for thinking and must measure from scratch.
- Sonnet 5 flips the API default: omitting `thinking` now runs **adaptive on**.
  We pinned it off to preserve shipped behaviour; this experiment decides whether
  to keep that or turn it on deliberately.

---

## 2. Variables

**Independent** — thinking configuration (the variants in §3).

**Controlled** (held identical across variants):
- Source lectures and their existing `zh-cn` translations (same commit).
- Translation prompt — use the **exact production prompt** from
  [`src/translator.ts`](../../src/translator.ts) (replicated in the run script),
  so we measure thinking, not prompt differences.
- Glossary — the 357-term `zh-cn` glossary ([`glossary/zh-cn.json`](../../glossary/zh-cn.json)).
- `max_tokens` — the production budgets (`MAX_TOKENS` in `src/models.ts`).
- Streaming path (`messages.stream().finalMessage()`), matching production.

**Dependent** (measured — §6): quality (automated + human), cost, latency, and
objective correctness.

---

## 3. Variants

| ID | Model | Thinking | Effort | Role |
|----|-------|----------|--------|------|
| **A** | `claude-sonnet-5` | disabled | — | New shipped default (Sonnet 5 baseline) |
| **B** | `claude-sonnet-5` | adaptive | `medium` | Balanced thinking |
| **C** | `claude-sonnet-5` | adaptive | `high` | Deep thinking (Sonnet 5's own default) |
| **D** | `claude-sonnet-4-6` | disabled | — | Current production baseline (anchor) |
| E *(optional)* | `claude-sonnet-4-6` | adaptive | (4.6 default) | Validates the historical "thinking helped on 4.6" claim |

A vs B vs C is the core decision. D anchors everything to what production does
today. E is optional — it directly tests the original premise on 4.6.

> Note: Sonnet 5 removes `temperature`/`top_k`, so we cannot seed for
> determinism. Adaptive thinking also introduces run-to-run variance. We
> therefore run **≥2 repetitions** per (lecture, variant) and report mean + range.

---

## 4. Sample

Reuse the local checkouts the existing experiments use
(`SOURCE_DIR=~/work/quantecon/lecture-python-intro`,
`TARGET_DIR=~/work/quantecon/lecture-intro.zh-cn`, `DOCS_FOLDER=lectures`).

Pick **~6 lectures spanning content types** so the result isn't skewed to one style:

| Lecture | Why (content profile) |
|---------|-----------------------|
| `pv.md` | Reused from the whole-file-vs-section experiment; math + code + localization |
| `geom_series.md` | Math-derivation-heavy |
| `inflation_history.md` | Prose- and data-heavy |
| `lln_clt.md` | Statistics + code + plots (localization-sensitive) |
| `cons_smooth.md` | Mixed math/prose |
| `networks.md` | Code- and figure-heavy |

Final list to be confirmed (§11). Native-speaker review covers a **subset of 3**
(one math-heavy, one prose-heavy, one code/localization-heavy).

---

## 5. Translation paths tested

Start with the cleanest signal, then optionally widen:

1. **Fresh whole-file translation** (`init`-style) — **primary.** One call, no
   diff/section-matching confound, so it isolates thinking's effect on raw
   translation quality.
2. **Section update (sync)** — *secondary/optional.* The most-used production
   path; run if the primary shows an effect, to confirm it survives the
   section-by-section pipeline.

RESYNC (forward whole-file) can reuse the same harness later if needed.

---

## 6. Metrics & instrumentation

For every (lecture, variant, repetition) capture:

**Quality — automated (Opus judge).** Score each output with the existing
reviewer rubric ([`src/reviewer.ts`](../../src/reviewer.ts) `evaluateTranslation`)
run with **`model: claude-opus-4-8`** — deliberately a *different model family*
than the Sonnet translator, to avoid self-preference bias. Records per-criterion
1–10 for **Accuracy, Fluency, Terminology, Formatting**, the weighted overall,
and any syntax errors. The judge sees only *(source, translation)* — **blind to
variant**.

**Quality — native speaker (ground truth).** Blind human review on the 3-lecture
subset. Outputs are anonymized and shuffled (§7). Two instruments:
- **Absolute rubric**: Accuracy / Fluency / Terminology, 1–5 each.
- **Forced-rank**: rank A/B/C (and D) for the same lecture, best→worst.

**Cost.** `usage.input_tokens`, `usage.output_tokens` (thinking tokens are billed
within output), derived `$`/file at Sonnet 5 standard pricing ($3 / $15 per M).
Report the thinking-token premium of B/C over A explicitly.

**Latency.** Wall-clock seconds per translation call.

**Objective correctness** (spot-checked, especially for code/localization
lectures): does the output preserve localization additions (Chinese font config,
translated plot labels), keep math/code intact, and produce valid MyST? Count
regressions per variant — the whole-file-vs-section experiment's
[`REPORT.md`](../forward/whole-file-vs-section-by-section/REPORT.md) is the
template for this table.

---

## 7. Protocol

1. **Freeze inputs** — pin the SOURCE and TARGET repos to a known commit; record SHAs.
2. **Translate** — for each (lecture × variant × rep), run the translation script,
   save the output to `outputs/<lecture>/<variant>-<rep>.md`, and log
   tokens + latency to `outputs/metrics.jsonl`.
3. **Anonymize** — copy outputs into `data/review-packets/` with variant identity
   stripped and filenames randomized; keep the mapping in a `key.json` **outside**
   the packet.
4. **Automated review** — run the Opus judge over every output (blind); append
   scores to `outputs/metrics.jsonl`.
5. **Native review** — hand the anonymized subset packets to the reviewer(s) with
   the rubric + rank sheet; collect results.
6. **Un-blind & aggregate** — join on `key.json`; compute per-variant mean±range
   for each metric; build the results tables.
7. **Write [`REPORT.md`](./REPORT.md)** — findings + a concrete recommendation.

---

## 8. Bias & validity controls

- **Blind both judges** (Opus and human) to variant; randomize presentation order.
- **Independent judge model** — Opus 4.8 ≠ the Sonnet translator (reduces
  same-model self-preference).
- **Prompt fidelity** — use the production prompt verbatim; only the `thinking`
  param and model differ between variants.
- **Variance** — ≥2 reps per cell; report the range, not just the mean.
- **Content coverage** — the sample spans math/prose/code so we can see *where*
  thinking helps, not just an average.
- **Human ground truth outranks the LLM judge** — if Opus and the native speaker
  disagree, the native speaker decides; the disagreement itself is a finding.

**Threats to note in the report:** single native reviewer (subjectivity) — add a
second if feasible; LLM-judge miscalibration; small N (6 lectures) — treat as
directional, not definitive.

---

## 9. Decision criteria (result → action)

Decide **per path**, because volume differs (sync review is per-PR / low volume;
`init` is bulk / high volume, so it needs a stronger quality case to justify cost):

- **Enable thinking** on a path if a variant beats A by **≥0.5 overall (Opus)**
  *and* wins the native forced-rank in **≥2 of 3** subset lectures, *and* its cost
  premium is acceptable for that path's volume.
- **Prefer `medium` over `high`** if B ≈ C (within ~0.3 overall and native ranks
  tied) — cheaper for equivalent quality.
- **Keep thinking off** (ratify the shipped default) if A ties or wins, or the
  gain is below threshold / not worth the premium.
- **If E is run:** whether 4.6+thinking beats 4.6-off tells us if the original
  "thinking helped" belief held on 4.6 — useful context, but the Sonnet 5
  decision rests on A/B/C.

Whatever we choose becomes a decision record in
[`.dev/decisions/`](../../.dev/decisions/) and, if we enable thinking, a code
change: flip `DEFAULT_THINKING` (or make it per-path) **and** switch the
translator/reviewer text extraction from `content[0]` to
`content.filter(b => b.type === 'text')` (a thinking block lands first when
thinking is on — the CLI commands already do this).

---

## 10. Deliverables & layout

```
experiments/thinking-sonnet5/
  PLAN.md            ← this document
  scripts/
    run-translate.mjs   # translate one lecture under one variant (SDK direct, prod prompt)
    run-opus-review.mjs # score one output with claude-opus-4-8 (blind)
    run-matrix.mjs      # orchestrate lectures × variants × reps; write metrics.jsonl
  outputs/            # generated translations + metrics.jsonl (git-ignored)
  data/review-packets # anonymized subset for the native speaker + key.json (git-ignored)
  REPORT.md           # results + recommendation (written after the runs)
```

Scripts follow the existing experiment convention: **standalone `.mjs` calling the
Anthropic SDK directly** and varying the `thinking` param — they do **not** go
through production code (which hardcodes thinking-off), so the experiment stays
independent of the shipped default.

---

## 11. Parameters to confirm before building scripts

1. **Lecture set** — accept the 6 proposed in §4, or substitute?
2. **Native review** — one reviewer or two? Rubric + forced-rank as in §6, or a
   different format you already use?
3. **Repetitions** — 2 per cell (proposed), or more for tighter variance (higher cost)?
4. **Include variant E** (4.6 + thinking) to validate the historical claim?
5. **Paths** — fresh-translate only to start (proposed), or also section-sync now?

## 12. Rough cost/effort of running it

Core (A–D, 6 lectures, 2 reps): **48 translations + 48 Opus reviews**.
Ballpark **$15–25** in API spend (thinking variants and the Opus judge cost more
per call) plus native-speaker time on 3 lectures. Adding E or more reps scales
linearly. Exact figures land in `REPORT.md` from the captured `metrics.jsonl`.

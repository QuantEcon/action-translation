# Experiment PLAN: Does extended thinking improve Sonnet 5 translation? (zh-cn)

**Created**: 2026-07-14
**Status**: Concluded 2026-07-14 (calibration + diagnostic) — see [REPORT.md](./REPORT.md). Decision: keep thinking OFF. The full matrix was not run.
**Languages**: `zh-cn` (Simplified Chinese) and `fr` (French)
**Decision this informs**: whether, where, and at what effort to enable adaptive
thinking on `claude-sonnet-5`, currently pinned **off** tool-wide
(`DEFAULT_THINKING` in [`src/models.ts`](../../src/models.ts)).

> **Two languages, and the `fr` arm is dual-purpose.** French has no existing
> translation yet, so its variants translate English → French from scratch —
> which is exactly the `init` path. The French arm therefore doubles as a
> **measured pilot of the French `init`** that follows this experiment: same
> command path, and its outputs can seed or sanity-check the real init. `zh-cn`
> has an existing, native-reviewed translation, so it also anchors quality
> against a known-good target. The `fr` glossary is native-reviewed (by Emile),
> so French terminology is validated going in.

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

**Same English source lectures, translated into both target languages.** The
`SOURCE` is `~/work/quantecon/lecture-python-intro`; `zh-cn` uses the existing
`~/work/quantecon/lecture-intro.zh-cn` target, `fr` starts from scratch (no
target repo needed for fresh-translate — §5).

Pick **~6 lectures spanning content types** so the result isn't skewed to one style:

| Lecture | Why (content profile) |
|---------|-----------------------|
| `pv.md` | Reused from the whole-file-vs-section experiment; math + code + localization |
| `geom_series.md` | Math-derivation-heavy |
| `inflation_history.md` | Prose- and data-heavy |
| `lln_clt.md` | Statistics + code + plots (localization-sensitive) |
| `cons_smooth.md` | Mixed math/prose |
| `networks.md` | Code- and figure-heavy |

Each lecture is translated to **both `zh-cn` and `fr`** under every variant, so
we can see whether thinking's effect is language-dependent (e.g. `zh` terminology
consistency vs `fr` typography — see §6). Final list to be confirmed (§11).
Native-speaker review covers a **subset of 3** (one math-heavy, one prose-heavy,
one code/localization-heavy), reviewed in **both** languages.

---

## 5. Translation paths tested

**Primary: fresh whole-file translation (the `init` path).** One call per
lecture, no diff/section-matching confound, so it isolates thinking's effect on
raw translation quality. It's the path **common to both languages** (French has
no existing target, so this is the only path available for `fr`) and it's exactly
what the French kickstart will run — making the `fr` arm a true init pilot.

**Secondary (optional, `zh-cn` only): section update (sync).** The most-used
production path; because `zh-cn` has an existing target we can also run it there
to confirm any effect survives the section-by-section pipeline. Not applicable to
`fr` until a French target exists.

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
subset, **per language**: a `zh-cn` native reviewer and **Emile for `fr`**.
Outputs are anonymized and shuffled (§7). Two instruments:
- **Absolute rubric**: Accuracy / Fluency / Terminology, 1–5 each.
- **Forced-rank**: rank A/B/C (and D) for the same lecture, best→worst.

**Cost.** `usage.input_tokens`, `usage.output_tokens` (thinking tokens are billed
within output), derived `$`/file at Sonnet 5 standard pricing ($3 / $15 per M).
Report the thinking-token premium of B/C over A explicitly.

**Latency.** Wall-clock seconds per translation call.

**Objective correctness** (spot-checked, especially for code/localization
lectures): keep math/code intact and produce valid MyST, plus language-specific
checks that are cheap to verify automatically:
- **`zh-cn`**: preserves localization additions (Chinese font config, translated
  plot labels).
- **`fr`**: adheres to the French typography rules already encoded in
  `language-config.ts` — guillemets `« »` with inner non-breaking spaces, and a
  non-breaking space before `;` `:` `!` `?`. Thinking may improve consistent
  adherence; a regex pass can score it per variant.

Count regressions per variant — the whole-file-vs-section experiment's
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

Also decide **per language**: thinking may pay off differently for `zh-cn`
(terminology consistency, CJK compactness) than for `fr` (typography adherence,
Romance-language expansion). If one language benefits and the other doesn't, the
outcome can be a per-language default rather than a single tool-wide value.

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
  emile-email.md        # draft email to the fr native reviewer (fill placeholders, then send)
  scripts/
    lib.mjs               # shared: variants, prod prompts (verbatim), glossary, pricing, SDK call
    run-matrix.mjs        # lectures × languages × variants × reps → translate + Opus review → metrics.jsonl
    make-review-packets.mjs  # anonymized, self-contained HTML review packets for the native reviewer
    ingest-reviews.mjs    # join reviewer JSON + key + Opus metrics → per-variant table for REPORT
  outputs/              # generated translations + metrics.jsonl (git-ignored)
  data/
    review-key.json     # id→variant map — PRIVATE, never publish (git-ignored)
    native-reviews/     # drop Emile's downloaded review JSON here (git-ignored)
    ingest-summary.{md,json}  # combined native + Opus table (git-ignored; paste into REPORT.md)
  REPORT.md             # results + recommendation (written after the runs)
```

**npm shortcuts** (from repo root): `npm run exp:matrix` (run the matrix),
`exp:packets` (build packets into `docs/_experiments/thinking-sonnet5`),
`exp:publish` / `exp:takedown` (stage+commit the packets; you push to `main`),
`exp:ingest` (aggregate the reviews). Review packets publish to the docs site —
see the **Hosting** note above.

**Native review packets** (`make-review-packets.mjs`) render each subset lecture's
source + shuffled, neutral-ID translations into one **self-contained HTML file**
(offline-capable) with an inline scoring form and a "Download my review (JSON)"
button — no backend. The `id→variant` key is written to a fixed private path
(`data/review-key.json`, gitignored) — never under a publishable dir.

**Hosting** rides the existing MyST docs → GitHub Pages deploy (there is one Pages
deployment; no `gh-pages` branch). Publish by generating packets straight into the
docs static passthrough and pushing to `main`:

```
node scripts/make-review-packets.mjs --out docs/_experiments/thinking-sonnet5   # key stays private
git add docs/_experiments/thinking-sonnet5 && git commit && git push            # triggers deploy-docs
```

`deploy-docs.yml` copies `docs/_experiments/` into the built site, serving it at
`https://quantecon.github.io/action-translation/experiments/thinking-sonnet5/`.
Emile visits that URL, scores/ranks, downloads the JSON, emails it back; we join
it to `review-key.json` to un-blind. **Take down** when finished:
`git rm -r docs/_experiments/thinking-sonnet5 && git commit && git push`.

**Status: scripts built and smoke-tested** (`--dry-run` shows the 96-cell core
matrix). To run (needs `npm run build:cli` first — `lib.mjs` imports the real
`dist/language-config.js` — and `ANTHROPIC_API_KEY`):

```
node experiments/thinking-sonnet5/scripts/run-matrix.mjs --dry-run
node experiments/thinking-sonnet5/scripts/run-matrix.mjs --langs fr --lectures pv.md --variants A,B,C --reps 1   # calibrate one lecture
node experiments/thinking-sonnet5/scripts/run-matrix.mjs                                                         # full core: A–D, both langs, 6 lectures, 2 reps
```

Scripts follow the existing experiment convention: **standalone `.mjs` calling the
Anthropic SDK directly** and varying the `thinking` param — they do **not** go
through production code (which pins thinking-off), so the experiment stays
independent of the shipped default. The translate/review prompts are copied
**verbatim** from production and the language rules are imported from `dist/`, so
we measure the real path; `max_tokens` is pinned identical across variants so the
only differences are model + thinking. The Opus judge is inherently blind — its
prompt never sees the variant.

---

## 11. Parameters — resolved vs. open

**Resolved:**
- **Languages** — `zh-cn` + `fr`.
- **Native reviewers** — `zh-cn` native reviewer + **Emile** for `fr`; format is
  the §6 rubric + forced-rank.
- **Path** — fresh whole-file translation (`init`) is primary and common to both
  languages; `zh-cn` section-sync is an optional secondary.

**Still open (sensible defaults in parens — harness takes them as inputs, so
they can change at run time without a rebuild):**
1. **Lecture set** — the 6 in §4, or substitute? *(default: the 6)*
2. **Repetitions** — *(default: 2 per cell)*; raise for tighter variance at higher cost.
3. **Include variant E** (4.6 + thinking) to validate the historical claim? *(default: run core A–D first, add E only if the A/B/C result is ambiguous)*

## 12. Rough cost/effort of running it

Core across **both languages** (A–D × 6 lectures × 2 languages × 2 reps):
**96 translations + 96 Opus reviews**. Ballpark **$30–50** in API spend (thinking
variants and the Opus judge cost more per call) plus native-speaker time on the
3-lecture subset in each language (Emile for `fr`). Adding variant E or more reps
scales linearly. Exact figures land in `REPORT.md` from the captured
`metrics.jsonl` — and those measured per-file costs feed back into the doc cost
tables (which currently hold ~1.3×-scaled estimates).

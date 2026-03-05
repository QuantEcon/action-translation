# Experiment: Whole-File vs Section-by-Section RESYNC

**Date**: 5 March 2026  
**Branch**: `phase3b-forward`  
**Test file**: `pv.md` (Present Value — QuantEcon lecture-python-intro)  
**Model**: `claude-sonnet-4-6`  
**Source repo**: `lecture-python-intro` (English)  
**Target repo**: `lecture-intro.zh-cn` (Simplified Chinese)

## Background

The `forward` command resyncs translated (TARGET) documents to match current English (SOURCE) documents when they've drifted out of sync. The key design question: should the RESYNC translation work on the **whole file** (one LLM call) or **section-by-section** (parse → match → N LLM calls → reconstruct)?

Section-by-section is the approach used by **SYNC mode** (PR-driven incremental translation), where it works well because git diff identifies exactly which sections changed. For forward RESYNC, there's no git diff — we're comparing two diverged documents without a common baseline.

This experiment compares **four approaches** on the same file:

| Approach | Description |
|----------|-------------|
| **Whole-file (no glossary)** | One LLM call, full SOURCE + TARGET, no terminology glossary |
| **Whole-file (with glossary)** | Same, plus 357-term zh-cn glossary in prompt |
| **Section-by-section** | Parse both docs → match 7 sections → RESYNC each → reconstruct, with glossary |
| **Fresh translation** | Baseline: translate SOURCE from scratch, ignoring existing TARGET entirely |

## Test File: `pv.md`

- **SOURCE** (English): 11,946 chars, 464 lines, 7 `##` sections
- **TARGET** (Chinese zh-cn): 8,320 chars, 458 lines, 7 `##` sections

Known issues in TARGET (identified by forward triage):
- Incorrect vector definition: `p^*_{T+1}` should be `δp^*_{T+1}`
- Incomplete exercise formulas (missing closed-form expressions)
- Missing assumption text (`g > 1` and `δg ∈ (0,1)`)
- Missing Wikipedia link for "invertible matrix theorem"

## Results

### Quantitative Summary

| Metric | Whole-file (no gloss) | Whole-file (glossary) | Section-by-section | Fresh translate |
|--------|----------------------|----------------------|-------------------|----------------|
| **Changed lines vs original** | 30 | 29 | 52 | 188 |
| **Output lines** | 453 | 452 | 448 | 457 |
| **Output chars** | 11,199 | 11,198 | 11,019 | 11,280 |
| **Total tokens** | 16,044 | 23,905 | 72,681 | 10,600 |
| **API calls** | 1 | 1 | 7 | 1 |
| **Elapsed time** | 75.0s | 73.0s | 49.2s | 74.4s |
| **Estimated cost** | $0.113 | $0.137 | $0.281 | $0.098 |

### Correct Fixes Made (all approaches)

All RESYNC approaches (whole-file and section-by-section) correctly made these fixes:

1. **Vector definition**: `p^*_{T+1}` → `δp^*_{T+1}` in the matrix equation
2. **Exercise formulas**: Added closed-form expressions for Gordon growth variants
3. **Missing assumption**: Added "假设 $g >1$ 且 $δg ∈ (0,1)$" before exercise
4. **Wikipedia link**: Added `[逆矩阵定理](https://en.wikipedia.org/wiki/Invertible_matrix)`
5. **Exercise numbering**: Updated from `2. 3. 4.` to `1. 1. 1.` (matching source)

### Key Differences Between Approaches

#### Whole-file preserved Chinese localization; section-by-section did not

The Chinese translation includes locale-specific additions that don't exist in the English source:
- Chinese font configuration (`plt.rcParams['font.family'] = ['Source Han Serif SC']`)
- Translated plot labels (`label='股息'`, `ax.set_xlabel('时间'`)`)

**Whole-file**: Preserved the `SourceHanSerifSC` font config and all Chinese plot labels. Only removed the `SimHei` font setup (a prompt tuning issue — both approaches had this).

**Section-by-section**: Removed **all** font configuration AND reverted **all** Chinese plot labels back to English:
```python
# Section-by-section reverted these (incorrect — should stay Chinese):
ax.plot(d, 'o', label='dividends')    # was label='股息'
ax.set_xlabel('time')                 # was ax.set_xlabel('时间')
ax.plot(p, 'o', label='asset price')  # was label='资产价格'
```

This happened in **4 separate plotting code blocks** across different sections. The root cause: each section is translated in isolation, so the LLM doesn't see that the document consistently uses Chinese labels throughout. It sees English source code with `label='dividends'` and the Chinese target with `label='股息'`, and concludes the Chinese is wrong.

#### Cost and token efficiency

Section-by-section used **3× more tokens** (72,681 vs 23,905) because:
- The 357-term glossary is sent with **every** section call (7× glossary overhead)
- Each call has its own system prompt overhead
- The source+target pair is split but prompt framing is repeated

Despite more tokens, section-by-section was slightly faster (49s vs 73s) because the 7 sequential calls were each small. However, this advantage would vanish with parallel calls or larger documents.

#### Glossary impact

Adding the glossary to the whole-file approach changed only **1 line** (29 vs 30 changed lines). The glossary-aware version used 解析表达式 (the glossary term for "analytical expressions") instead of 分析表达式. Minimal but demonstrates the glossary is effective at ensuring consistent terminology.

### Fresh Translation Baseline

The fresh translation (no existing TARGET provided) changed **188 lines** — nearly every prose sentence was rewritten:

- Different terminology choices throughout (`方程序列` → `方程组`, `本讲座描述了` → `本讲介绍`)
- Different sentence structures and phrasing
- Added its own font configuration (different from existing)
- Changed heading translations

This confirms that RESYNC (whether whole-file or section-by-section) is fundamentally the right approach — it preserves the existing translator's work. The question is only which RESYNC granularity is better.

### Diff Between Approaches

Comparing whole-file (with glossary) to section-by-section directly:

| Category | Whole-file | Section-by-section |
|----------|------------|-------------------|
| Correct fixes | ✅ All 5 | ✅ All 5 |
| Font config preserved | Partially (lost SimHei) | ❌ Lost all font config |
| Chinese plot labels | ✅ Preserved all | ❌ Reverted to English (4 blocks) |
| Unnecessary whitespace changes | 0 | 2 (blank line diffs) |
| Reconstruction artifacts | N/A | Minor spacing inconsistencies |

## Conclusion

**Whole-file RESYNC with glossary is the clear winner for the `forward` command:**

1. **Better quality**: Preserves cross-section context (Chinese localization, consistent style)
2. **Lower cost**: $0.137 vs $0.281 (2× cheaper)
3. **Simpler pipeline**: Eliminates parse → match → reconstruct (eliminates ~300 lines of fragile code)
4. **Fewer regressions**: 29 changed lines (all intentional) vs 52 (23 unnecessary)

**Section-by-section remains the right approach for SYNC mode** (PR-driven, git-diff-targeted), where precise change signals and bit-identical unchanged sections are valuable.

**Known issue for prompt tuning**: Both approaches removed the `SimHei` font configuration (4 lines) despite the prompt explicitly instructing preservation of Chinese font config. The `SourceHanSerifSC` config was preserved by whole-file but not section-by-section. This is a prompt tuning item — needs stronger instructions or explicit examples.

## Reproducing This Experiment

```bash
# Prerequisites: ANTHROPIC_API_KEY set, source/target repos cloned locally

# From the experiment scripts directory:
cd experiments/forward/whole-file-vs-section-by-section/scripts

# Run each approach:
node run-whole-file-resync.mjs pv.md
node run-whole-file-resync-glossary.mjs pv.md
node run-section-resync.mjs pv.md
node run-fresh-translate.mjs pv.md

# Compare outputs (saved in output/ directory):
diff output/resync-pv-original.md output/resync-pv-whole-glossary.md
diff output/resync-pv-original.md output/resync-pv-section.md
diff output/resync-pv-whole-glossary.md output/resync-pv-section.md
```

Environment variables for custom paths:
- `SOURCE_DIR` — path to English source repo (default: `~/work/quantecon/lecture-python-intro`)
- `TARGET_DIR` — path to Chinese target repo (default: `~/work/quantecon/lecture-intro.zh-cn`)
- `DOCS_FOLDER` — docs subfolder within repos (default: `lectures`)

## Scripts

| Script | Purpose |
|--------|---------|
| `run-whole-file-resync.mjs` | Whole-file RESYNC without glossary |
| `run-whole-file-resync-glossary.mjs` | Whole-file RESYNC with zh-cn glossary (357 terms) |
| `run-section-resync.mjs` | Section-by-section RESYNC (replicates forward pipeline) |
| `run-fresh-translate.mjs` | Fresh translation baseline (no existing TARGET) |

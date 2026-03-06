# Legacy Tools

Tools that informed the current `resync` CLI design. Both are deprecated but retained in-tree for reference. This document captures the approaches tried, what worked, and what didn't — so we don't reinvent things we've already explored.

**Evolution**:
```
tool-alignment (v1 — purely deterministic)
    ↓  replaced: too complex, hard to calibrate thresholds
tool-onboarding (v2 — hybrid deterministic + Claude)
    ↓  replaced: block-level divergence mapping broke on structural changes
resync CLI backward/forward/status (current)
    → section-based analysis, whole-section re-translate
```

---

## tool-alignment (v1 — Deterministic Structural Analysis)

**Period**: Early development  
**Size**: ~2,000 lines across 10 modules, 14 test fixtures  
**Approach**: Purely deterministic — no LLM calls for core analysis (optional Claude quality scoring as a separate mode)

### What It Did

Three analysis modes:

1. **Diagnose** — Structure report comparing section/subsection/code/math block counts between source and target. Scored files on a weighted scale (sections 40%, subsections 30%, code 15%, math 15%).

2. **Triage** — File-level action recommendations based on structure + code scores. Prioritized files as critical/high/medium/low/ok. Produced per-file reports with specific actions.

3. **Quality Assessment** — Per-section Claude scoring with weighted rubric: accuracy (40%), fluency (25%), terminology (20%), completeness (15%). Supported glossary lookup and cost estimation per model tier.

### Key Algorithms

**Code Normalization Pipeline** — The standout idea. To compare code blocks between source and target, it stripped content that's *expected* to differ in translations:

```
1. Replace strings → "<<STRING>>" (handles f-strings, triple quotes)
2. Replace MyST captions → "<<CAPTION>>"
3. Replace comments → "# <<COMMENT>>" (language-aware: Python, JS, Julia, R)
4. Collapse whitespace
```

After normalization, blocks that matched were "normalized-match" (translation-only differences). Blocks that still differed had real code changes.

**i18n-Only Pattern Detection** — Recognized font family references (SimHei, SimSun, PingFang), matplotlib config (`plt.rcParams['font.`), Unicode handling (`axes.unicode_minus`), and locale setup. If all differences matched these patterns, the block was classified as "i18n-only" — acceptable translation-related changes, not real code divergence.

**LCS-Based Diff** — Used Longest Common Subsequence for line-by-line comparison after normalization. Showed only changed lines with 2-line context, truncated to 50 lines max.

**Structure Scoring** — Weighted component matching:
```
Score = (section match × 40) + (subsection match × 30) + (code blocks × 15) + (math blocks × 15)
→ 100 = aligned, 85-99 = likely-aligned, 55-84 = needs-review, <55 = diverged
```

**Triage Decision Matrix** — Combined structure score + code integrity score to recommend actions:
- Structure < 80% → diverged (critical priority)
- Code < 80% → review-code (medium, unless i18n-only → low)
- No heading-map → resync (low, auto-generatable)
- Everything passing → ok (ready for automated sync)

### What Worked

- **Code normalization eliminated false positives** — This was the breakthrough. Without it, every translated comment or string literal flagged as a code change. The normalize-then-compare approach was highly accurate for detecting *real* code modifications.
- **i18n pattern detection** — The pattern list caught ~95% of translation-related code changes (font config, locale setup, etc.). This prevented false alarms on legitimate localization additions.
- **Triage prioritization was very useful** — Real run on lecture-python-intro (52 files): 6 ok, 20 resync, 12 review-code, 12 diverged, 2 create. The priority buckets helped focus human effort on the most critical files first.
- **Quality rubric** — The weighted scoring (accuracy/fluency/terminology/completeness) with actionable flag categories (inaccurate, awkward, terminology, omission, addition, formatting) gave structured feedback rather than vague "needs improvement."

### Why It Was Replaced

- **Threshold calibration was difficult** — The weighted scoring needed manual tuning per project. What counted as "likely-aligned" (85%?) vs "needs-review" (55%?) was somewhat arbitrary and varied across lecture series.
- **Complexity was high** — ~2,000 lines for what was ultimately a one-time diagnostic. Maintaining 10 modules, 3 report generators, and 14 test fixtures for tool run infrequently was burdensome.
- **No LLM for prose analysis** — The purely deterministic approach couldn't assess *translation quality* of prose sections. The optional Claude quality mode was bolted on as a separate step, not integrated into the main diagnostic flow.

---

## tool-onboarding (v2 — Hybrid Code + Claude Analysis)

**Period**: After tool-alignment  
**Size**: ~2,300 lines across 10 modules, 84 tests  
**Approach**: Deterministic code analysis + Claude AI for prose — each doing what it's best at

### What It Did

One-time alignment assessment to determine if an existing translation repository was ready for `action-translation` automated sync.

**Pipeline**: File Discovery → Content Extraction → Hybrid Analysis → Decision Engine → Report Generation

For each paired source/target file:
- **Code blocks** → Deterministic comparison (normalization + divergence mapping)
- **Prose sections** → Claude analysis (semantic understanding of translation quality)
- **Combined** → Four clear actions: SYNC | BACKPORT | ACCEPT LOCALISATION | MANUAL REVIEW

Output: Per-file markdown reports with action checkboxes for human review.

### Key Algorithms

**Block-Level Divergence Mapping** — The main innovation. An O(n) algorithm that walked through source and target code blocks simultaneously:

```
while (srcIdx < source.length || tgtIdx < target.length):
  if exact or normalized match → ALIGNED
  if only source left → MISSING
  if only target left → INSERTED
  else:
    look ahead in target to find source block (shifted)
    look ahead in source to find target block
    if found ahead → mark intermediate as INSERTED/MISSING
    if not found → mark as MODIFIED
```

This handled code block reordering and renames well. But the look-ahead had a finite window, so when blocks were added or deleted, it couldn't recover alignment — leading to cascading false positives.

**Hybrid Human-AI Workflow** — Tool generated analysis + recommendations with checkboxes. Humans made final decisions. The tool never auto-synced anything.

**Date-Aware Decision Logic** — Used git commit timestamps to determine direction:
- Source newer → prefer SYNC (source → target)
- Target newer → prefer BACKPORT (target → source)  
- Same/unknown → conservative (MANUAL REVIEW)

**Document-Order Organization** — Early versions grouped all code findings first, then all prose (confusing). Fixed by tracking `startLine` for every decision item and sorting by document position. Lesson learned: always present findings in document reading order.

### What Worked

- **Hybrid approach was better than pure deterministic** — Claude handled prose assessment well (semantic understanding of translation quality), while deterministic code comparison avoided Claude's tendency to hallucinate about code differences. Each approach used where it was strongest.
- **Four clear actions** — Previous scoring-based approaches (tool-alignment) produced numbers that required interpretation. The simple SYNC/BACKPORT/ACCEPT/MANUAL vocabulary was immediately actionable.
- **i18n pattern detection** (carried forward from tool-alignment) — Separate `inserted-i18n` status and recommendation for blocks that were translation-related additions. Prevented flagging legitimate localization changes.
- **Position-based section matching** — Content-based matching fails across languages (English heading ≠ Chinese heading). Matching by position (section 1 ↔ section 1) was robust. This principle carried directly into the current heading-map design.
- **Modular architecture** — 10 focused modules (~230 lines avg) much easier to test and maintain than a monolith. Each module had clear responsibility.

### Why It Was Replaced

**The fundamental issue**: Block-level divergence mapping assumes relatively stable structure between source and target. When code blocks are added *or* deleted in either repo, the look-ahead algorithm can't recover alignment — it marks too many subsequent blocks as modified/inserted, producing cascading false positives.

**Real-world failure**: lecture-python-intro had blocks added to source after initial translation. The tool couldn't match them, producing massive false positives across many files (tracked as issue #677).

**The solution**: The current CLI uses **section-based analysis** instead of block-level matching. Whole sections are re-translated in one LLM call, which naturally handles added/removed/reordered blocks within a section. This was a fundamental shift from fine-grained block matching to coarse-grained section matching.

---

## Ideas for Future Work

Curated list of approaches from both tools that could enhance the current CLI:

### High Value — Consider for future CLI enhancements

| Idea | Source | How It Could Be Used |
|------|--------|---------------------|
| Code normalization pipeline | tool-alignment | Enhance `status` command to show code-level detail (not just section counts). Strip strings/comments, then compare to distinguish real code changes from translation-only differences. |
| i18n-only pattern detection | Both | Filter false positives in `backward` analysis. If differences are all font config / locale setup, flag as i18n-only rather than suggesting backport. |
| Quality scoring rubric | tool-alignment | Formalize `review` mode scoring with weighted dimensions (accuracy, fluency, terminology, completeness) rather than single pass/fail. |
| Triage priority buckets | tool-alignment | Enhance `status --json` output with criticality levels (critical/high/medium/low) to help users prioritize large backlogs. |

### Already Adopted

| Idea | Source | Where It Landed |
|------|--------|----------------|
| Position-based section matching | Both | Core to heading-map design and section pairing |
| Hybrid human-AI workflow | tool-onboarding | `review` command (tool suggests, human decides) |
| Cost estimation | Both | `forward --estimate` |
| Date-aware direction logic | tool-onboarding | `status` command (OUTDATED based on commit dates) |
| Document-order presentation | tool-onboarding | All report output sorted by position |

### Low Priority — Reference Only

| Idea | Source | Notes |
|------|--------|-------|
| LCS-based diff algorithm | tool-alignment | Current section-level approach makes line-level diffs unnecessary, but could be useful if we ever need finer-grained comparison within a section. |
| Block divergence mapping | tool-onboarding | Proven to break on structural changes. Only worth revisiting if constrained to within a single section (where structure is more stable). |
| Multi-language comment stripping | tool-alignment | Handled Python, JavaScript, Julia, R comments. Would be useful if code normalization is adopted. |

# Project B: AI-Assisted Translation Review & Quality Feedback

> **Type**: QA-focused, bilingual review with AI assistance
> **Ideal RA profile**: Bilingual fluency (English + Chinese), attention to detail, interest in translation quality
> **Time**: 4-7 hrs/week for 12 weeks
> **Primary repo**: `QuantEcon/lecture-python-programming.zh-cn` (25 lectures to review)
> **Also uses**: `QuantEcon/action-translation` (reference), `QuantEcon/test-translation-sync.zh-cn` (onboarding)

## Goal

Review every translated lecture in `lecture-python-programming.zh-cn` before it goes live, using an AI-assisted workflow that combines automated analysis with human expert judgment. The review process simultaneously:

1. **Quality-gates the lectures** -- no lecture goes live without human sign-off
2. **Collects structured data** -- every AI finding + human concurrence/non-concurrence becomes a data point we use to improve `action-translation`

## Why This Matters

`action-translation` generates translations automatically, but we don't yet know **where it fails and how** at scale. We need bilingual reviewers to:

- Verify translation quality before publication
- Tell us which AI assessments are reliable vs. unreliable
- Surface systematic patterns that prompt changes can fix

The concurrence data is especially valuable: when humans consistently disagree with AI findings in a category, that tells us our review prompts need calibrating. When humans find issues the AI misses, that tells us what to add.

## How It Works

```
                                    ┌──────────────────────┐
                                    │  lecture-python-      │
                                    │  programming (EN)     │
                                    └──────────┬───────────┘
                                               │
┌──────────────┐    compare    ┌───────────────▼───────────────┐
│  glossary/   │──────────────>│     AI Review Script           │
│  zh-cn.json  │               │                               │
│  (357 terms) │               │  - Check terminology           │
└──────────────┘               │  - Check localization          │
                               │  - Check formatting            │
                               │  - Check completeness          │
                               │  - Assess fluency              │
                               └───────────────┬───────────────┘
                                               │
                                               │ generates
                                               v
                               ┌───────────────────────────────┐
                               │     GitHub Issue               │
                               │     (one per lecture)          │
                               │                               │
                               │  Pre-populated with:          │
                               │  - Structured findings         │
                               │  - Checkboxes for concurrence │
                               │  - Scoring fields              │
                               └───────────────┬───────────────┘
                                               │
                                               │ RA reviews
                                               v
                               ┌───────────────────────────────┐
                               │     Human Review               │
                               │                               │
                               │  For each AI finding:          │
                               │  ✅ Concur                     │
                               │  ❌ Non-concur (with reason)   │
                               │  🔧 Needs fix                  │
                               │  ➕ Additional findings         │
                               └───────────────┬───────────────┘
                                               │
                               ┌───────────────▼───────────────┐
                               │     Data Export                │
                               │                               │
                               │  - AI accuracy by category     │
                               │  - Common error patterns       │
                               │  - Terms to add to glossary    │
                               │  - Prompt improvement recs     │
                               └───────────────────────────────┘
```

## What You'll Do

### 1. AI Review Script

A script (in `action-translation` or the lecture repo) that compares each English source lecture against its Chinese translation and produces structured findings. The script checks:

| Category | What the AI Checks | Example |
|---|---|---|
| **Terminology** | Glossary terms translated correctly and consistently | "data structures" -> "数据结构" (matches glossary) |
| **Localization** | Plot labels, axis titles, legend text translated to Chinese | `label='bank balance'` -> `label='银行余额'` |
| **Font config** | Chinese font setup present in code cells with plots | `# i18n` lines with `SourceHanSerifSC` |
| **Formatting** | Code blocks, math equations, MyST directives preserved | `{exercise-start}`, `$$...$$`, `` ```{code-cell} `` |
| **Completeness** | No content dropped or added; all sections present | All exercises + solutions accounted for |
| **Links** | Cross-references, URLs, Wikipedia links correct | EN Wikipedia vs. ZH Wikipedia availability |
| **Code integrity** | Code logic untouched; only comments/strings translated | Variable names, imports, logic preserved |
| **Register** | Appropriate academic tone for a university textbook | Not too casual, not overly formal |
| **Heading map** | `translation:` frontmatter headings match actual headings | Heading IDs consistent with translated text |

The script outputs its findings as structured markdown, ready to paste into a GitHub issue.

### 2. GitHub Issue Per Lecture

Each of the 25 lectures gets its own GitHub issue in `lecture-python-programming.zh-cn`, created by the AI review script via `gh issue create`. The issue is pre-populated with:

```markdown
## Lecture Review: python_by_example.md

**Source**: lecture-python-programming/lectures/python_by_example.md
**Translation**: lecture-python-programming.zh-cn/lectures/python_by_example.md
**AI Model**: claude-sonnet-4-6
**Generated**: 2026-04-01
**Reviewer**: (assign yourself)

---

### Summary

| Metric | Value |
|---|---|
| Sections | 12 |
| Glossary terms checked | 23 |
| Code cells | 18 |
| Issues found | 5 |
| AI confidence | 8/10 |

---

### Findings

#### F1 [terminology] Correct -- "data structures" -> "数据结构"
**Section**: 概述 (line 48)
**Severity**: info
**Detail**: Matches glossary entry. Used consistently throughout.

- [ ] ✅ Concur
- [ ] ❌ Non-concur
- [ ] 🔧 Needs fix

**RA notes**: _____

---

#### F2 [localization] Good -- Plot labels translated
**Section**: 另一个应用 (line 434)
**Severity**: info
**Detail**: `label='银行余额'` correctly localizes `label='bank balance'`.
Font config with `SourceHanSerifSC` is present.

- [ ] ✅ Concur
- [ ] ❌ Non-concur
- [ ] 🔧 Needs fix

**RA notes**: _____

---

#### F3 [links] Consider -- Wikipedia links not localized
**Section**: 列表 (line 261)
**Severity**: minor
**Detail**: Links to English Wikipedia for "integer", "string", "Boolean".
Chinese Wikipedia equivalents exist. Consider localizing.

- [ ] ✅ Concur -- should localize
- [ ] ❌ Non-concur -- English links are fine for this audience
- [ ] 🔧 Needs fix

**RA notes**: _____

---

#### F4 [code-integrity] Correct -- i18n markers clean
**Section**: 版本一 (line 78-88)
**Severity**: info
**Detail**: Font config lines correctly marked with `# i18n` comments.
Code logic (np.random.randn, plt.plot, plt.show) is unchanged.

- [ ] ✅ Concur
- [ ] ❌ Non-concur
- [ ] 🔧 Needs fix

**RA notes**: _____

---

#### F5 [fluency] Review -- exercise instructions
**Section**: 练习 (line 447+)
**Severity**: review
**Detail**: Exercise phrasing uses formal academic Chinese.
AI assessment: natural and appropriate for textbook register.
Human review recommended for nuance.

- [ ] ✅ Concur -- reads naturally
- [ ] ❌ Non-concur -- needs rephrasing (explain below)
- [ ] 🔧 Needs fix

**RA notes**: _____

---

### RA Additional Findings

<!-- Add any issues the AI missed. Use this format:
#### FA1 [category] severity -- short description
**Section**: ...
**Detail**: ...
-->

---

### Overall Assessment

- [ ] ✅ Ready to publish
- [ ] ⚠️ Needs minor fixes (issues marked 🔧 above)
- [ ] ❌ Needs significant revision

**Overall quality (1-10)**: ___
**RA sign-off**: ___ (name + date)
```

### 3. Review Each Lecture

For each pre-populated issue, the RA:

1. **Opens the English and Chinese files side-by-side** (VS Code diff or GitHub compare)
2. **Reads through each AI finding** and checks the appropriate box
3. **Adds notes** where they disagree or want to elaborate
4. **Records additional findings** the AI missed (these are especially valuable)
5. **Gives an overall assessment** and quality score
6. **Signs off** when done

The checkbox data becomes structured feedback:
- **Concur on "correct"**: Confirms the translation is good here (positive signal)
- **Concur on "issue"**: Confirms the AI found a real problem
- **Non-concur on "correct"**: AI missed a problem (false negative -- high value signal)
- **Non-concur on "issue"**: AI flagged a non-issue (false positive -- calibration signal)

### 4. Fix and Approve

Issues marked "Needs fix" get resolved:

1. RA (or another team member) makes the correction in a branch
2. PR references the review issue (`Fixes finding F3 in #42`)
3. Once all fixes are merged, the issue is updated to "Ready to publish"
4. Project lead gives final approval

### 5. Data Collection

A script parses completed review issues and exports structured JSON:

```json
{
  "lecture": "python_by_example.md",
  "reviewer": "ra-alice",
  "review_date": "2026-04-15",
  "overall_quality": 8,
  "overall_status": "ready_to_publish",
  "findings": [
    {
      "id": "F1",
      "category": "terminology",
      "severity": "info",
      "ai_assessment": "correct",
      "human_concurrence": true,
      "human_notes": ""
    },
    {
      "id": "F3",
      "category": "links",
      "severity": "minor",
      "ai_assessment": "consider_localizing",
      "human_concurrence": false,
      "human_notes": "English Wikipedia links are fine -- our students read English"
    }
  ],
  "additional_findings": [
    {
      "id": "FA1",
      "category": "fluency",
      "severity": "minor",
      "detail": "Line 105: '下面是两个更多的示例' sounds unnatural, should be '下面是另外两个示例'"
    }
  ]
}
```

This data feeds directly into:
- **Prompt improvements**: Fix patterns where AI translations consistently fail
- **Glossary additions**: Terms the AI got wrong -> add to glossary (handoff to Project C)
- **Benchmark test cases**: Interesting failures -> add to benchmark dataset (handoff to Project A)
- **AI review calibration**: Adjust what the review script checks based on false positives/negatives

## Lectures to Review

| # | Lecture | Domain | Difficulty | Status |
|---|---|---|---|---|
| 1 | `about_py.md` | General | Basic | Pending |
| 2 | `getting_started.md` | Setup | Basic | Pending |
| 3 | `python_by_example.md` | Core Python | Basic | Pending |
| 4 | `functions.md` | Core Python | Basic | Pending |
| 5 | `python_essentials.md` | Core Python | Basic | Pending |
| 6 | `oop_intro.md` | OOP | Intermediate | Pending |
| 7 | `python_oop.md` | OOP | Intermediate | Pending |
| 8 | `names.md` | Core Python | Basic | Pending |
| 9 | `python_advanced_features.md` | Advanced Python | Intermediate | Pending |
| 10 | `writing_good_code.md` | Best practices | Intermediate | Pending |
| 11 | `numpy.md` | Scientific computing | Intermediate | Pending |
| 12 | `matplotlib.md` | Visualization | Intermediate | Pending |
| 13 | `scipy.md` | Scientific computing | Intermediate | Pending |
| 14 | `pandas.md` | Data | Intermediate | Pending |
| 15 | `pandas_panel.md` | Data | Intermediate | Pending |
| 16 | `sympy.md` | Symbolic math | Intermediate | Pending |
| 17 | `jax_intro.md` | JAX | Advanced | Pending |
| 18 | `numba.md` | Performance | Advanced | Pending |
| 19 | `need_for_speed.md` | Performance | Intermediate | Pending |
| 20 | `numpy_vs_numba_vs_jax.md` | Performance | Advanced | Pending |
| 21 | `debugging.md` | Tooling | Basic | Pending |
| 22 | `troubleshooting.md` | Tooling | Basic | Pending |
| 23 | `workspace.md` | Setup | Basic | Pending |
| 24 | `status.md` | Meta | Basic | Pending |
| 25 | `intro.md` | Overview | Basic | Pending |

## Week-by-Week Plan

### Weeks 1-2: Setup & First Reviews

- [ ] Read the `action-translation` [README](../../README.md) and [architecture docs](../developer/architecture.md)
- [ ] Get familiar with the review workflow: read this document end-to-end
- [ ] Learn the test tool: review 2-3 test PRs in `test-translation-sync.zh-cn` for practice
- [ ] Run the AI review script on 2-3 lectures to generate initial issues
- [ ] Complete your first full lecture review to calibrate your workflow
- [ ] Estimate: ~30 min per lecture for straightforward ones, ~60 min for complex ones

### Weeks 3-6: Systematic Lecture Reviews

- [ ] Review all 25 lectures (aim for 5-6 per week)
- [ ] Start with the "Basic" difficulty lectures to build confidence
- [ ] Record all findings using the checkbox format
- [ ] Flag any critical issues immediately (open separate fix PRs)
- [ ] Track which lectures are "Ready to publish" vs. "Needs fixes"

### Weeks 7-8: Fix Issues & Pattern Analysis

- [ ] Compile all findings across lectures
- [ ] Identify the top 5 most frequent error patterns
- [ ] Cross-reference term errors against `glossary/zh-cn.json`
- [ ] Work with team to fix issues marked as "Needs fix"
- [ ] Re-review fixed lectures and update issue status

### Weeks 9-10: Data Export & Analysis

- [ ] Run the data export script on all completed review issues
- [ ] Produce analysis report:
  - AI accuracy rate by category (how often did humans concur?)
  - Most common error types
  - False positive rate (AI flagged non-issues)
  - False negative rate (humans found issues AI missed)
- [ ] Identify terms to hand off to Project C (glossary additions)
- [ ] Identify test cases to hand off to Project A (benchmark entries)

### Weeks 11-12: Recommendations & Sign-off

- [ ] Write prioritized improvement recommendations for `action-translation`
- [ ] Final sign-off on all lectures (or document remaining blockers)
- [ ] Summary report: "State of lecture-python-programming.zh-cn"
- [ ] Handoff documentation for applying this process to other lecture series

## Deliverables

1. **25 completed review issues** -- one per lecture, with all findings checked
2. **Fixes merged** -- all "Needs fix" items resolved via PRs
3. **Publication sign-off** -- clear status on which lectures are ready to go live
4. **Concurrence dataset** -- structured JSON of all AI findings + human judgments
5. **Pattern analysis** -- which errors are most common, which are most severe
6. **Improvement recommendations** -- prioritized list for `action-translation` prompt tuning
7. **Cross-project handoffs** -- terms for Project C, test cases for Project A

## Skills You'll Practice

- **Bilingual analysis**: Comparing source and translation for accuracy and fluency
- **Quality assurance**: Systematic review with structured criteria
- **GitHub workflows**: Issues, PRs, cross-referencing
- **Data analysis**: Aggregating findings into actionable patterns
- **Technical writing**: Producing clear, structured reports

## Getting Started

1. Read the `action-translation` [README](../../README.md) to understand what the tool does
2. Open `lecture-python-programming.zh-cn` and browse a few translated lectures
3. Open the same lectures in `lecture-python-programming` (English) for comparison
4. Review the glossary: `glossary/zh-cn.json` (357 terms)
5. Try reviewing one lecture end-to-end informally before using the formal template
6. Run the AI review script and complete your first issue

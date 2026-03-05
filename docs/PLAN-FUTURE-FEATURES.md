# Future Features Planning

**Document Status**: Planning & Design Discussion  
**Last Updated**: December 2025  
**Version**: Draft v0.1

This document outlines potential future features for the `action-translation` system. Each feature is explored with implementation ideas, pros/cons, and design considerations.

---

## Table of Contents

1. [Resync Workflow / Tool](#1-resync-workflow--tool)  
   *Handle non-PR commits and detect translation divergence*
   - [Special Case: Initial Alignment / Onboarding](#special-case-initial-alignment--onboarding)  
     *Strategy for onboarding existing translations like lecture-intro*

2. [Translation Quality Optimization (Benchmark Project)](#2-translation-quality-optimization-benchmark-project)  
   *Use human translations to improve AI translation quality*  
   → **Now a separate project**: See [PROJECT-BENCHMARK.md](projects/PROJECT-BENCHMARK.md)

3. [Multi-Language Hub-Spoke Architecture](#3-multi-language-hub-spoke-architecture)  
   *Design for managing multiple translation repositories*

4. [Bidirectional Sync / Upstream Suggestions](#4-bidirectional-sync--upstream-suggestions)  
   *Enable translators to suggest improvements to English source*

5. [i18n Code Annotation Convention](#5-i18n-code-annotation-convention)  
   *Deterministic preservation of localization code in code cells*

---

## 1. Resync Workflow / Tool

### Problem Statement

The current implementation triggers translation sync on **PR merge events only**. However, occasionally edits are made directly to `main` without going through a PR:

- Direct commits to main (emergency fixes, admin edits)
- Force pushes
- GitHub web UI quick edits
- Automated commits (bots, CI/CD)

This can cause source and target repositories to diverge silently.

### Frequency Assessment

- **~99% of changes** transit through PRs (current workflow handles these)
- **~1% edge cases** could cause divergence
- Impact: Cumulative drift over time if not addressed

### Option A: Scheduled Resync Tool

**Concept**: A scheduled workflow that periodically compares source and target repositories, identifies divergence, and creates sync PRs.

```yaml
# .github/workflows/resync-check.yml
name: Weekly Resync Check

on:
  schedule:
    - cron: '0 6 * * 1'  # Every Monday at 6 AM UTC
  workflow_dispatch:     # Manual trigger

jobs:
  resync:
    runs-on: ubuntu-latest
    steps:
      - uses: QuantEcon/action-translation@v0.8
        with:
          mode: resync
          source-repo: QuantEcon/lecture-python.myst
          target-repo: QuantEcon/lecture-python.zh-cn
          # ...
```

**Implementation Approach**:

1. **Fetch both repositories** at their current HEAD
2. **Compare structure and sections**:
   - File presence check (does target have all source files?)
   - Section count comparison (same number of `##` sections?)
   - Heading-map validation (all source section IDs present in target's heading-map?)
3. **Generate divergence report**:
   - Files in source but not target
   - Files with section differences
   - Files deleted in source but present in target
4. **Action options**:
   - **Report only**: Create issue with divergence summary
   - **Auto-sync**: Create PR with missing translations
   - **Hybrid**: Report + auto-sync for simple cases

**Pros**:
- ✅ Catches all divergence regardless of cause
- ✅ Scheduled = predictable maintenance window
- ✅ Can run weekly/monthly based on change frequency
- ✅ Manual trigger for on-demand checks
- ✅ Non-intrusive to normal workflow

**Cons**:
- ❌ Delayed detection (up to 1 week/month)
- ❌ Bulk changes harder to review than incremental
- ❌ May create large PRs if divergence accumulated
- ❌ Requires additional scheduled workflow

### Option B: Main Branch Commit Filter

**Concept**: Monitor all commits to main (not just PR merges) and trigger sync for content-related changes.

```yaml
# Enhanced workflow trigger
on:
  push:
    branches: [main]
    paths:
      - 'lectures/**/*.md'
      - '_toc.yml'
```

**Implementation Approach**:

1. **Trigger on push to main** (catches direct commits)
2. **Filter commits**:
   - Check if commit came from merged PR (skip - already handled)
   - Check if commit is content-related (not CI/docs/config)
3. **Process non-PR commits** same as merged PR workflow

**Detection Logic**:
```typescript
// Pseudo-code for commit source detection
function isFromMergedPR(commit: Commit): boolean {
  // Check commit message patterns
  if (commit.message.includes('Merge pull request')) return true;
  if (commit.message.includes('(#')) return true;  // Squash merge
  
  // Check associated PRs via API
  const prs = await github.repos.listPullRequestsAssociatedWithCommit();
  return prs.some(pr => pr.merged);
}
```

**Pros**:
- ✅ Real-time detection (immediate sync)
- ✅ Incremental changes = smaller PRs
- ✅ Same workflow file (simpler setup)
- ✅ No accumulation of divergence

**Cons**:
- ❌ More complex trigger logic
- ❌ Potential for duplicate syncs (PR merge + push event)
- ❌ May trigger on non-content commits (need careful filtering)
- ❌ Higher API usage (checking every push)

### Option C: Monitoring & Notification (Lightweight)

**Concept**: Scheduled check that only monitors for divergence and notifies, without automatic fixing.

```yaml
# Creates GitHub issue when divergence detected
- uses: QuantEcon/action-translation@v0.8
  with:
    mode: monitor
    notification: issue  # or: slack, email
```

**Pros**:
- ✅ Simplest implementation
- ✅ Human decides how to fix
- ✅ Good for low-frequency divergence
- ✅ Visibility without automation risk

**Cons**:
- ❌ Manual intervention required
- ❌ May be ignored if frequent false positives

### Recommendation

**Hybrid Approach**: Implement both monitoring and on-demand resync.

1. **Weekly monitoring** (Option C) - Lightweight check, create issue if divergence found
2. **Manual resync command** (Option A) - Run when needed to fix divergence
3. **Future enhancement** (Option B) - Add push-to-main filtering if divergence is frequent

**Suggested Priority**: Medium (rare edge case, but important for long-term maintenance)

### Implementation Considerations

- **New mode**: `mode: resync` or `mode: monitor`
- **Inputs needed**:
  - `resync-strategy`: `report-only` | `auto-sync` | `hybrid`
  - `notification-channel`: `issue` | `slack` | `none`
- **State tracking**: May need to track "last synced commit" per file
- **Conflict handling**: What if target has local-only changes?

### Special Case: Initial Alignment / Onboarding

#### Problem Statement

**Critical use case**: Onboarding existing translation projects that were developed independently.

**Example**: `lecture-intro` series already exists in both English and Mandarin Chinese. The Chinese version has been manually translated, reviewed, and edited by human translators. Now we want to set up automated sync going forward.

**Challenge**: Before enabling automated sync, we need to:
1. Verify the translations are "close enough" to establish baseline
2. Identify divergences (Chinese ahead/behind/different from English)
3. Create initial heading-maps for all documents
4. Establish a clean starting point for incremental sync

**If we just enable sync without alignment**, the action will detect massive "changes" and create enormous PRs trying to "fix" manually-curated translations.

#### Strategic Approaches

##### Strategy 1: Bulk Translate & Compare (Similarity Analysis)

**Concept**: Translate all English content fresh, compare with existing Chinese to measure alignment.

```typescript
// Pseudo-algorithm
for each file in source:
  freshTranslation = translateSection(englishContent, mode: NEW)
  existingTranslation = readFile(targetRepo, samePath)
  
  similarity = compareSections(freshTranslation, existingTranslation)
  
  if (similarity > 90%):
    status = "ALIGNED" - Safe to sync
  else if (similarity > 70%):
    status = "REVIEW" - Manual review needed
  else:
    status = "DIVERGED" - Significant differences
```

**Similarity Metrics**:
- **Structural**: Section count, heading hierarchy, code blocks present
- **Semantic**: Use Claude to assess if translations convey same meaning
- **Heading-map**: Can we auto-generate valid heading-maps?

**Output**: Alignment report
```markdown
## Alignment Report: lecture-intro (en → zh-cn)

### ✅ Well-Aligned Files (Auto-sync ready)
- `intro.md` - 95% similarity, 8/8 sections match
- `python_by_example.md` - 92% similarity, 12/12 sections match

### ⚠️ Review Needed (Manual check)
- `oop_intro.md` - 78% similarity
  - English: 6 sections | Chinese: 7 sections
  - Extra section: "实践练习" (Practice Exercises) - Chinese only
  - Recommendation: Keep Chinese extra section, add to heading-map

### ❌ Significantly Diverged (Manual alignment required)
- `functions.md` - 45% similarity
  - English: Major restructure in v2.0 (2024-11)
  - Chinese: Still based on v1.5 structure (2023-08)
  - Recommendation: Retranslate or manual merge
```

**Pros**:
- ✅ Objective similarity scores
- ✅ Identifies which files are safe to auto-sync
- ✅ Catches structural divergence
- ✅ Can auto-generate initial heading-maps for aligned files

**Cons**:
- ❌ Expensive (translates entire corpus)
- ❌ Fresh translation may not match human translation style
- ❌ False negatives: Good human translation may score low vs. AI translation
- ❌ Doesn't account for intentional localization (Chinese adds context)

##### Strategy 2: Bidirectional Diff Analysis

**Concept**: Detect direction and magnitude of divergence without translation.

```typescript
// Pseudo-algorithm
for each file in both repos:
  englishSections = parseSections(sourceFile)
  chineseSections = parseSections(targetFile)
  
  // Structural comparison
  if (englishSections.length > chineseSections.length):
    status = "TARGET_BEHIND" - Chinese missing sections
  else if (englishSections.length < chineseSections.length):
    status = "TARGET_AHEAD" - Chinese has extra content
  else if (englishSections.length == chineseSections.length):
    // Check if content is substantively different
    englishWordCount = countWords(englishSections)
    chineseCharCount = countCharacters(chineseSections)
    
    expectedRatio = 0.6  // Chinese typically 60% length of English
    actualRatio = chineseCharCount / englishWordCount
    
    if (abs(actualRatio - expectedRatio) < 0.2):
      status = "LIKELY_ALIGNED"
    else:
      status = "CONTENT_DIVERGED"
```

**Git History Analysis** (if available):
```typescript
// Check if repos share common ancestor
sourceCommits = getCommitHistory(sourceRepo, file)
targetCommits = getCommitHistory(targetRepo, file)

lastCommonCommit = findLastCommonCommit(sourceCommits, targetCommits)

if (lastCommonCommit):
  sourceChanges = getChangesSince(lastCommonCommit, sourceRepo)
  targetChanges = getChangesSince(lastCommonCommit, targetRepo)
  
  divergenceMetric = {
    sourceDrift: sourceChanges.length,
    targetDrift: targetChanges.length,
    commonAncestor: lastCommonCommit.date
  }
```

**Output**: Divergence matrix
```markdown
## Divergence Analysis: lecture-intro

| File | Sections (EN/ZH) | Status | Recommendation |
|------|------------------|--------|----------------|
| intro.md | 8/8 | ✅ ALIGNED | Auto-generate heading-map |
| python_by_example.md | 12/13 | ⚠️ TARGET_AHEAD | Review extra section |
| oop_intro.md | 10/8 | ⚠️ TARGET_BEHIND | Translate 2 new sections |
| functions.md | 15/10 | ❌ MAJOR_DIVERGE | Manual merge required |

### Git History Insights
- `functions.md`: Source had major restructure (45 commits since fork)
- `oop_intro.md`: Target has local improvements (8 commits)
```

**Pros**:
- ✅ Fast (no translation needed)
- ✅ Detects direction of divergence (ahead/behind)
- ✅ Uses git history if available
- ✅ Cheap (no API costs)

**Cons**:
- ❌ Heuristic-based (may be inaccurate)
- ❌ Can't detect semantic divergence
- ❌ Requires assumptions (character/word ratios)
- ❌ Git history may not be available (different repo origins)

##### Strategy 3: Hybrid Intelligent Alignment Agent

**Concept**: Combine structural analysis + selective translation + human guidance.

**Phase 1: Fast Structural Scan** (Strategy 2)
- Identify obviously aligned files (same section count, reasonable length ratios)
- Flag diverged files (different structure)

**Phase 2: Selective Translation Sampling** (Strategy 1 variant)
- For "uncertain" files, translate 2-3 representative sections
- Compare sampled translations to assess human translation quality
- Extrapolate to full document

**Phase 3: Interactive Alignment**
```yaml
# Generated alignment config
alignment:
  intro.md:
    status: auto-aligned
    confidence: high
    action: generate-heading-map
  
  python_by_example.md:
    status: needs-review
    confidence: medium
    issue: target-has-extra-section
    suggestion: |
      Chinese version has additional section "实践练习" at end.
      Options:
      1. Keep as localization (mark in heading-map)
      2. Add to English version
      3. Remove from Chinese
    action: human-decision-required
  
  functions.md:
    status: diverged
    confidence: high
    issue: major-restructure
    suggestion: |
      English underwent major restructure (v1.5→v2.0).
      Options:
      1. Retranslate Chinese from scratch
      2. Manual merge of improvements
      3. Keep Chinese on old structure, document version
    action: human-decision-required
```

**Workflow**:
```
1. Run alignment agent (generates alignment.yml)
2. Human reviews alignment.yml, makes decisions
3. Agent executes based on decisions:
   - Auto-aligned: Generate heading-maps, enable sync
   - Needs-review: Create issues with specific questions
   - Diverged: Create manual alignment tasks
4. Human completes manual tasks
5. Re-run agent to verify alignment
6. Enable automated sync
```

**Pros**:
- ✅ Best of both worlds (fast + accurate)
- ✅ Human-in-the-loop for ambiguous cases
- ✅ Minimizes translation costs (selective sampling)
- ✅ Creates clear action plan
- ✅ Gradual rollout (align files incrementally)

**Cons**:
- ❌ More complex implementation
- ❌ Requires interactive workflow
- ❌ Longer time to full alignment

#### Recommended Approach

**For QuantEcon Use Case**: Use **Strategy 3 (Hybrid Agent)** because:

1. **lecture-intro** has high-quality manual translations - don't want false alarms
2. Some localization intentional (Chinese may have extra examples)
3. English may have evolved since Chinese translation
4. Need confidence before enabling automation

**Implementation Plan**:

```yaml
# .github/workflows/alignment-check.yml
name: Initial Alignment Check

on:
  workflow_dispatch:  # Manual trigger only
    inputs:
      source-repo:
        required: true
      target-repo:
        required: true
      target-language:
        required: true

jobs:
  align:
    runs-on: ubuntu-latest
    steps:
      - uses: QuantEcon/action-translation@v0.8
        with:
          mode: align
          source-repo: ${{ github.event.inputs.source-repo }}
          target-repo: ${{ github.event.inputs.target-repo }}
          target-language: ${{ github.event.inputs.target-language }}
          # Phase 1: Fast scan
          alignment-phase: structural-scan
          # Phase 2: Selective sampling (if needed)
          sample-size: 3  # sections per uncertain file
          # Phase 3: Generate report
          output: alignment-report.md
```

**Outputs**:
1. **`alignment-report.md`** - Summary with recommendations
2. **`alignment.yml`** - Machine-readable alignment config
3. **GitHub Issues** - One per file needing human review
4. **Auto-generated heading-maps** - For aligned files

**Success Criteria**:
- ✅ 80%+ files auto-aligned → Enable sync for those
- ⚠️ 10-15% needs review → Create issues, handle incrementally  
- ❌ 5-10% diverged → Manual alignment tasks, defer sync

#### Edge Cases & Considerations

**1. Target has valuable improvements**
- Example: Chinese adds practice problems, better examples
- Solution: Mark as "localization enhancements" in heading-map
- Going forward: Sync English changes, preserve Chinese additions

**2. Competing versions (English evolved significantly)**
- Example: English v2.0, Chinese still v1.5
- Solution: Options menu:
  - Retranslate (lose Chinese improvements)
  - Manual merge (preserve best of both)
  - Dual versions (document divergence)

**3. Translation style mismatch**
- Example: Human translation is formal, AI translation is casual
- Solution: Use human translation as reference, fine-tune prompts
- Action: Extract glossary from human translations

**4. No common history**
- Example: Repos created independently
- Solution: Pure content-based comparison (no git history)

**5. Partial alignment acceptable**
- Example: Enable sync for 80% aligned files, handle rest manually
- Solution: Phased rollout, not all-or-nothing

#### Related: Translation Quality Benchmark

Once alignment is complete, the same `lecture-intro` parallel corpus can be used to **benchmark and improve AI translation quality**. See the dedicated project plan: [PROJECT-BENCHMARK.md](projects/PROJECT-BENCHMARK.md).

---

## 2. Translation Quality Optimization (Benchmark Project)

> **📋 This feature has been elevated to a standalone project.**
> 
> See: **[PROJECT-BENCHMARK.md](projects/PROJECT-BENCHMARK.md)** for the comprehensive plan including:
> - Dataset specification (terms, sentences, paragraphs)
> - Multi-model benchmarking infrastructure
> - RA team coordination (Xiamen University)
> - GitHub Pages dashboard
> - Integration with existing benchmarks (WMT, COMET, XTREME)
>
> The section below is retained for historical context and original design thinking.

### Problem Statement

**Opportunity**: The `lecture-intro` series has both English and high-quality human-translated Chinese versions. This creates a **gold standard corpus** for translation quality optimization.

**Goal**: Use existing human translations as a benchmark to improve AI translation quality through systematic comparison and analysis.

### Use Cases

1. **Prompt Engineering**: Test different prompts, compare AI output to human translations
2. **Model Comparison**: Benchmark Claude Sonnet vs Opus vs GPT-4 vs others
3. **Glossary Extraction**: Mine terminology from human translations
4. **Style Analysis**: Learn translation patterns from human translators
5. **Quality Metrics**: Develop automated quality scoring

### Proposed Workflow

This will be a **standalone CLI tool** (not a GitHub Action mode) for flexibility and local development:

```bash
# Run benchmark locally
npm run benchmark -- \
  --source lectures/python_by_example.md \
  --reference lectures-zh-cn/python_by_example.md \
  --models "sonnet-4-5,opus-4" \
  --output reports/benchmark-report.md
```

Could also be wrapped in a GitHub workflow for CI integration:

```yaml
# .github/workflows/benchmark-quality.yml
name: Translation Quality Benchmark

on:
  workflow_dispatch:

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: cd tool-benchmark-translations && npm ci && npm run benchmark
```

### Analysis Dimensions

**1. Structural Fidelity**
```markdown
Metric: How well does AI preserve document structure?

English: 12 sections, 8 code blocks, 15 math equations
Human:   12 sections, 8 code blocks, 15 math equations ✓
AI:      12 sections, 8 code blocks, 14 math equations ⚠️
```

**2. Terminology Consistency**
```markdown
Compare term translations:

| English | Human Translation | AI Translation | Match? |
|---------|-------------------|----------------|--------|
| utility function | 效用函数 | 效用函数 | ✓ |
| equilibrium | 均衡 | 平衡 | ✗ |
| household | 家庭 | 家户 | ⚠️ |

Extract discrepancies → Update glossary
```

**3. Semantic Equivalence**
```markdown
Use Claude/GPT to assess meaning preservation:

Prompt: "Compare these two Chinese translations of the English text.
Rate semantic equivalence on 1-10 scale."

Section 1: Score 9/10 - Minor phrasing difference
Section 2: Score 7/10 - AI translation too literal
Section 3: Score 10/10 - Perfect equivalence
```

**4. Fluency & Naturalness**
```markdown
Human: Reads naturally, appropriate register for academic content
AI: Sometimes too literal or awkward phrasing

Example:
Human: "这种方法在经济学中被广泛使用"
AI: "这个方法在经济学中广泛地被使用"
(AI adds unnecessary "地", sounds less natural)
```

**5. Localization Decisions**
```markdown
Human translators make contextual adaptations:

- Cultural examples: Human replaces US examples with Chinese equivalents
- Academic conventions: Citations formatted for Chinese readers
- Pedagogical enhancements: Extra practice problems added

AI typically does literal translation without these adaptations.
```

### Benchmark Output Example

```markdown
## Translation Quality Benchmark Report

**Date**: 2025-01-15
**Source**: lecture-intro/python_by_example.md
**Models Tested**: Claude Sonnet 4.5, Claude Opus 4, GPT-4

### Overall Scores (1-10 scale)

| Model | Structure | Terminology | Semantics | Fluency | Overall |
|-------|-----------|-------------|-----------|---------|---------|
| Human (reference) | - | - | - | - | Baseline |
| Claude Sonnet 4.5 | 10 | 8.5 | 8.8 | 7.2 | 8.6 |
| Claude Opus 4 | 10 | 9.2 | 9.1 | 8.5 | 9.2 |
| GPT-4 | 10 | 8.0 | 8.5 | 7.8 | 8.6 |

### Key Findings

**✅ Strengths**:
- All models preserve structure perfectly
- Technical terminology mostly accurate
- Mathematical notation handled correctly

**⚠️ Areas for Improvement**:
- Fluency lags behind human (especially Sonnet)
- Missing localization decisions
- Some terminology inconsistencies

**📝 Recommendations**:
1. Use Opus 4 for better fluency (0.4 cost increase acceptable)
2. Update glossary with 12 terms where AI diverged from human
3. Add prompt instructions for natural phrasing
4. Consider post-editing pass for fluency
```

### Implementation Plan

**Phase 1: Data Collection**
- Extract parallel corpus (English → Human Chinese) from lecture-intro
- Organize into test set (representative samples)

**Phase 2: Automated Benchmark**
- Translate test set with different models/prompts
- Compare outputs to human translations
- Generate similarity scores

**Phase 3: Analysis & Insights**
- Identify patterns in discrepancies
- Extract glossary terms from human translations
- Document best practices from human work

**Phase 4: Optimization**
- Update prompts based on findings
- Enhance glossary
- Fine-tune language configuration
- Re-run benchmarks to measure improvement

### Integration with Main Action

**Separate Tool**: This should be a standalone benchmarking tool, not part of the main sync action.

**Location**: `tool-benchmark-translations/` (similar to `tool-bulk-translator/`)

**Usage**:
```bash
npm run benchmark -- \
  --source lecture-intro \
  --reference lecture-intro.zh-cn \
  --models "sonnet-4-5,opus-4,gpt-4" \
  --output reports/benchmark-2025-01-15.md
```

**Benefits**:
- Continuous quality improvement
- Data-driven prompt engineering
- Glossary enhancement from real translations
- Model selection guidance (cost vs quality)

**Future**: Could be integrated into CI/CD to automatically benchmark new releases.

---

## 3. Multi-Language Hub-Spoke Architecture

### Current Design

The action already supports multiple languages through separate workflow files:

```
lecture-python.myst/              # English (Hub)
├── .github/workflows/
│   ├── sync-translation-zh-cn.yml    # → Chinese
│   ├── sync-translation-fa.yml       # → Farsi
│   └── sync-translation-es.yml       # → Spanish (future)
```

Each workflow independently syncs to its target repository:

```
                    ┌─────────────────────────┐
                    │  lecture-python.myst    │
                    │       (English Hub)     │
                    └───────────┬─────────────┘
                                │
           ┌────────────────────┼────────────────────┐
           │                    │                    │
           ▼                    ▼                    ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ lecture-python   │  │ lecture-python   │  │ lecture-python   │
│     .zh-cn       │  │       .fa        │  │       .es        │
│   (Chinese)      │  │     (Farsi)      │  │    (Spanish)     │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

### Why Hub-Spoke?

**Advantages**:

1. **Single Source of Truth**: English content is authoritative
2. **Independent Language Teams**: Each translation can progress at its own pace
3. **Isolated Failures**: Issue with Chinese sync doesn't affect Farsi
4. **Simple Mental Model**: One-way flow, clear ownership
5. **Scalable**: Add new languages without changing existing workflows
6. **Review Decoupling**: Each language has its own review process

**Trade-offs**:

1. **No cross-language learning**: Good translation in Chinese doesn't help Spanish
2. **Duplication of effort**: Similar phrasing translated multiple times
3. **Hub dependency**: English must be correct first

### Alternative Architectures Considered

#### Alternative A: Mesh / Peer-to-Peer

```
┌──────────────┐     ┌──────────────┐
│   English    │◀───▶│   Chinese    │
└──────┬───────┘     └──────┬───────┘
       │                    │
       │    ┌──────────────┐│
       └───▶│    Farsi     │◀┘
            └──────────────┘
```

**Concept**: All repositories sync with each other. Changes in any language propagate to all others.

**Pros**:
- ✅ Improvements from any language benefit all
- ✅ No single point of dependency

**Cons**:
- ❌ **Complexity explosion**: N languages = N×(N-1) sync relationships
- ❌ **Conflict resolution nightmare**: Which version wins?
- ❌ **Quality control**: Who reviews Chinese → English changes?
- ❌ **Translation chaining errors**: Chinese→English→Farsi accumulates errors
- ❌ **No clear ownership**: Who is authoritative?

**Verdict**: ❌ Not recommended. Complexity is prohibitive for academic content where accuracy matters.

#### Alternative B: Monorepo (All Languages in One Repo)

```
lecture-python/
├── en/
│   └── lectures/
│       └── aiyagari.md
├── zh-cn/
│   └── lectures/
│       └── aiyagari.md
└── fa/
    └── lectures/
        └── aiyagari.md
```

**Concept**: Single repository contains all language versions in folders.

**Pros**:
- ✅ Single PR can update multiple languages
- ✅ Easier to see translation status at a glance
- ✅ Atomic commits across languages
- ✅ Simpler CI/CD (one repo to manage)

**Cons**:
- ❌ **Large repository**: Cloning includes all languages
- ❌ **Permission complexity**: Can't give Chinese team write access to only `zh-cn/`
- ❌ **Build complexity**: Jupyter Book needs separate builds per language
- ❌ **Review noise**: PRs touch files reviewers may not understand
- ❌ **Branch conflicts**: Parallel work on different languages may conflict

**Verdict**: ⚠️ Could work for small projects, but doesn't scale well for large lecture series with independent language teams.

#### Alternative C: Federated Hub (Multiple Hubs)

```
                    ┌─────────────────────────┐
                    │  lecture-python.myst    │
                    │    (English - Primary)  │
                    └───────────┬─────────────┘
                                │
              ┌─────────────────┴─────────────────┐
              │                                   │
              ▼                                   ▼
┌─────────────────────────┐         ┌─────────────────────────┐
│  lecture-python.zh-cn   │         │  lecture-python.ar      │
│  (Chinese - Regional)   │         │  (Arabic - Regional)    │
└───────────┬─────────────┘         └───────────┬─────────────┘
            │                                   │
     ┌──────┴──────┐                     ┌──────┴──────┐
     ▼             ▼                     ▼             ▼
┌─────────┐  ┌─────────┐           ┌─────────┐  ┌─────────┐
│ zh-tw   │  │ zh-hk   │           │  fa     │  │  ur     │
│(Taiwan) │  │(HK)     │           │(Farsi)  │  │(Urdu)   │
└─────────┘  └─────────┘           └─────────┘  └─────────┘
```

**Concept**: Primary hub (English) syncs to regional hubs, which then sync to related languages.

**Use Case**: Chinese Simplified → Chinese Traditional / Hong Kong variants. Arabic → Farsi / Urdu (shared script families).

**Pros**:
- ✅ Regional expertise at intermediate level
- ✅ Shared terminology within language families
- ✅ Reduces load on primary hub maintainers

**Cons**:
- ❌ **Added latency**: Changes propagate through two hops
- ❌ **Intermediate hub dependency**: Regional hub becomes bottleneck
- ❌ **Complexity**: More workflows to manage

**Verdict**: ⚠️ Potentially useful at scale (10+ languages), but premature for current needs.

### Why Hub-Spoke is Right for QuantEcon

| Factor | Hub-Spoke | Mesh | Monorepo | Federated |
|--------|-----------|------|----------|-----------|
| Simplicity | ✅ Best | ❌ Worst | ⚠️ Medium | ⚠️ Medium |
| Clear ownership | ✅ Yes | ❌ No | ⚠️ Partial | ✅ Yes |
| Independent teams | ✅ Yes | ❌ No | ❌ No | ✅ Yes |
| Quality control | ✅ Easy | ❌ Hard | ⚠️ Medium | ✅ Easy |
| Scales to 5-10 langs | ✅ Yes | ❌ No | ⚠️ Barely | ✅ Yes |
| Implementation effort | ✅ Low | ❌ High | ⚠️ Medium | ⚠️ Medium |

**Conclusion**: Hub-spoke is the right choice because:

1. **QuantEcon's content model**: English is authoritative, translations are derivatives
2. **Team structure**: Independent language maintainers, not a centralized translation team
3. **Quality requirements**: Academic content requires careful review, not automatic propagation
4. **Scale**: 3-5 languages is the sweet spot for hub-spoke (no complexity explosion)

**When to reconsider**:
- If QuantEcon expands to 10+ languages → consider Federated Hub
- If language teams want shared ownership → still not Mesh, but add suggestion workflow (Section 4)

### Multi-Language Coordination Scenarios

#### Scenario 1: Simultaneous Language Sync

When a PR is merged in English, all language workflows trigger:

```
English PR Merged
       │
       ├──▶ sync-zh-cn.yml ──▶ Chinese PR created
       ├──▶ sync-fa.yml ────▶ Farsi PR created  
       └──▶ sync-es.yml ────▶ Spanish PR created
```

**Current Behavior**: ✅ Already supported (parallel workflows)

**Consideration**: PRs are created independently, merged independently.

#### Scenario 2: Language-Specific Glossaries

Each language needs its own glossary:

```
glossary/
├── zh-cn.json    # Chinese terminology
├── fa.json       # Farsi terminology
├── es.json       # Spanish terminology (future)
└── README.md
```

**Current Behavior**: ✅ Already supported via `glossary-path` input

#### Scenario 3: Language-Specific Translation Rules

Different languages have different typographic conventions:

```typescript
// language-config.ts already supports this
const languageConfigs: Record<string, LanguageConfig> = {
  'zh-cn': {
    name: '简体中文',
    punctuation: 'chinese',
    spacing: 'no-spaces-around-cjk',
    // ...
  },
  'fa': {
    name: 'فارسی',
    direction: 'rtl',
    punctuation: 'persian',
    // ...
  }
};
```

**Current Behavior**: ✅ Already supported in `language-config.ts`

### Design Documentation

#### Recommended Setup for New Languages

1. **Create target repository**: `{repo}.{lang-code}` (e.g., `lecture-python.es`)
2. **Bootstrap with bulk translator**: Use `tool-bulk-translator/` for initial translation
3. **Add workflow file**: Copy template, update language config
4. **Add glossary**: Create `glossary/{lang-code}.json`
5. **Configure review workflow**: Add review mode to target repo

#### Workflow Template

```yaml
# .github/workflows/sync-translation-{lang}.yml
name: Sync Translation ({Language Name})

on:
  pull_request:
    types: [closed]
    branches: [main]
    paths:
      - 'lectures/**/*.md'
      - '_toc.yml'

jobs:
  sync:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2
      
      - uses: QuantEcon/action-translation@v0.8
        with:
          mode: sync
          target-repo: ${{ github.repository }}.{lang-code}
          target-language: {lang-code}
          docs-folder: lectures/
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.TRANSLATION_PAT }}
```

### Future Enhancements

#### Cross-Language Consistency Checking

**Concept**: Ensure technical terms are translated consistently across all languages.

```
Glossary term: "utility function"
├── zh-cn: "效用函数" ✓
├── fa: "تابع مطلوبیت" ✓
└── es: "función de utilidad" ✓
```

**Implementation**: Glossary validation tool that checks all language files.

#### Translation Status Dashboard

**Concept**: Central view of translation progress across all languages.

```
Lecture: aiyagari.md
├── English: ✓ (source)
├── Chinese: ✓ (synced @ v1.2.3)
├── Farsi: ⚠ (3 sections behind)
└── Spanish: ✗ (not started)
```

**Implementation**: GitHub Action that generates status badge/page.

---

## 4. Bidirectional Sync / Upstream Suggestions

### Problem Statement

Currently, sync is **unidirectional**: English → Other Languages.

But valuable improvements may originate in translations:
- Translator finds error in English original
- Better explanation discovered while translating
- Code bug found during translation review
- Clearer mathematical notation suggested

### Design Philosophy

**QuantEcon's Position**: English is the **source of truth**. Any upstream changes must be:
1. Reviewed by English content maintainers
2. Approved before propagation to other languages
3. Clearly marked as "suggestions" not "corrections"

This is **not automatic bidirectional sync**, but rather a **suggestion workflow**.

### Proposed: Upstream Suggestion System

```
                    ┌─────────────────────────┐
                    │  lecture-python.myst    │
            ┌───────│       (English Hub)     │◀───────┐
            │       └───────────┬─────────────┘        │
            │                   │                      │
         Sync Down          Sync Down           Suggestions Up
            │                   │                      │
            ▼                   ▼                      │
┌──────────────────┐  ┌──────────────────┐            │
│ lecture-python   │  │ lecture-python   │────────────┘
│     .zh-cn       │  │       .fa        │
│   (Chinese)      │  │     (Farsi)      │
└──────────────────┘  └──────────────────┘
```

### Workflow Design

#### Trigger: Label-Based

Translator adds special label to translation PR:

```yaml
# In target repo (e.g., lecture-python.zh-cn)
on:
  pull_request:
    types: [labeled]
    
jobs:
  suggest-upstream:
    if: contains(github.event.label.name, 'suggest-upstream')
    # ...
```

#### Alternative Trigger: Comment Command

```markdown
<!-- In PR comment -->
/suggest-upstream

This translation revealed a potential improvement to the original English:
- Line 45: "Bellman equation" should include the discount factor
- Line 78: Code example has off-by-one error
```

### Suggestion PR Format

When triggered, create PR in English repository:

```markdown
# Suggestion from Chinese Translation

**Source**: lecture-python.zh-cn PR #42
**Translator**: @translator-username
**Language**: Chinese (zh-cn)

## Suggested Changes

The following suggestions were identified during translation of `lectures/aiyagari.md`:

### 1. Mathematical Notation (Line 45)

**Current English**:
```
The Bellman equation is V(s) = max{u(c) + V(s')}
```

**Suggested Improvement**:
```
The Bellman equation is V(s) = max{u(c) + βV(s')}
```

**Reason**: Missing discount factor β

---

### 2. Code Example (Line 78)

**Current Code**:
```python
for i in range(n):
    result[i+1] = compute(i)  # IndexError when i = n-1
```

**Suggested Fix**:
```python
for i in range(n-1):
    result[i+1] = compute(i)
```

---

## Review Instructions

- [ ] Review each suggestion
- [ ] Accept/modify/reject as appropriate
- [ ] Merge to propagate to all languages

**Note**: This PR was auto-generated from translation feedback. 
The Chinese translation PR will be updated once this is resolved.
```

### Implementation Approaches

#### Approach A: Manual Suggestion Entry

Translator manually writes suggestions in PR description or comment.

**Workflow**:
1. Translator adds `suggest-upstream` label to translation PR
2. Action reads PR description for suggestions (structured format)
3. Creates suggestion PR in English repo
4. Links the two PRs

**Pros**:
- ✅ Simple implementation
- ✅ Human-curated suggestions
- ✅ No AI interpretation errors

**Cons**:
- ❌ Requires structured format discipline
- ❌ Extra work for translator

#### Approach B: AI-Assisted Suggestion Extraction

Use Claude to identify potential upstream improvements.

**Workflow**:
1. Translator adds label + freeform comment describing issue
2. Action sends context to Claude
3. Claude formats suggestion PR content
4. Human reviews before creation

**Prompt Example**:
```
You are reviewing a translation from English to Chinese.
The translator has identified potential issues with the English original.

Translator's comment:
"{translator_comment}"

English section:
"{english_content}"

Chinese translation:
"{chinese_content}"

Please identify specific suggestions for improving the English original.
Format as actionable items with line references.
```

**Pros**:
- ✅ Natural language input from translator
- ✅ Consistent formatting
- ✅ Can catch related issues

**Cons**:
- ❌ More complex implementation
- ❌ AI may misinterpret suggestions
- ❌ Additional API costs

#### Approach C: Diff-Based Detection

Automatically detect when translation differs structurally from source.

**Concept**: If Chinese translation has content that doesn't map to English, flag for review.

**Example Detection**:
```
English: "The function returns a value"
Chinese: "该函数返回一个值。注意：原文可能有误，此处应为'返回一个数组'"
         (Note: Original may be wrong, should be 'returns an array')

Detection: Chinese has translator note suggesting English error
```

**Pros**:
- ✅ Catches organic feedback
- ✅ No extra translator action needed

**Cons**:
- ❌ High false positive rate
- ❌ Complex detection logic
- ❌ Translator notes may be internal, not upstream suggestions

### Recommended Implementation

**Phase 1: Manual Workflow** (Low effort, immediate value)

1. Create issue template in English repo for translation suggestions
2. Document process for translators to submit suggestions
3. No automation - just clear process

**Phase 2: Label-Triggered Suggestions** (Medium effort)

1. Add `mode: suggest` to action
2. Trigger on `suggest-upstream` label
3. Parse structured description format
4. Create linked suggestion PR

**Phase 3: AI-Assisted** (Higher effort, nice-to-have)

1. Add Claude-powered suggestion extraction
2. Handle freeform translator comments
3. Smart formatting and deduplication

### Workflow Configuration

```yaml
# .github/workflows/upstream-suggestions.yml (in target repo)
name: Upstream Suggestions

on:
  pull_request:
    types: [labeled]

jobs:
  suggest:
    if: github.event.label.name == 'suggest-upstream'
    runs-on: ubuntu-latest
    steps:
      - uses: QuantEcon/action-translation@v0.9
        with:
          mode: suggest
          source-repo: QuantEcon/lecture-python.myst
          suggestion-format: structured  # or: freeform (AI-assisted)
          github-token: ${{ secrets.TRANSLATION_PAT }}
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│  Target Repo (lecture-python.zh-cn)                         │
│                                                             │
│  Translation PR #42                                         │
│  ├── Label: "suggest-upstream" (added by translator)        │
│  └── Description:                                           │
│      ```                                                    │
│      ## Upstream Suggestions                                │
│      - [ ] Line 45: Missing discount factor β               │
│      - [ ] Line 78: Off-by-one error in loop                │
│      ```                                                    │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          │ Action triggered
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  action-translation (mode: suggest)                         │
│                                                             │
│  1. Parse suggestion items from PR description              │
│  2. Fetch relevant English content                          │
│  3. Format suggestion PR content                            │
│  4. Create PR in source repo                                │
│  5. Add cross-reference comment to original PR              │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Source Repo (lecture-python.myst)                          │
│                                                             │
│  Suggestion PR #123                                         │
│  ├── Title: "Suggestion from zh-cn: aiyagari.md"           │
│  ├── Labels: ["translation-suggestion", "zh-cn"]            │
│  ├── Body: Formatted suggestions with context               │
│  └── Linked: References target PR #42                       │
└─────────────────────────────────────────────────────────────┘
```

### Considerations

1. **Permission Model**: Target repo needs write access to source repo (via PAT)
2. **Spam Prevention**: Limit suggestions per PR, require maintainer approval
3. **Tracking**: Link suggestion PR back to translation PR for updates
4. **Resolution**: When suggestion PR is merged/closed, notify translation PR

---

## 5. i18n Code Annotation Convention

### Problem Statement

Translated documents often contain **extra code inside code cells** that doesn't exist in the English source. This is intentional localization — for example, Chinese translations add matplotlib font configuration so CJK characters render correctly in plot labels, titles, and legends:

```python
# In Chinese translation's code cell (NOT in English source):
from matplotlib import font_manager
fontP = font_manager.FontProperties()
fontP.set_family('SimHei')
fontP.set_size(14)
```

or:

```python
plt.rcParams['font.sans-serif'] = ['SimHei']
plt.rcParams['axes.unicode_minus'] = False
```

During translation sync (both UPDATE and RESYNC modes), the LLM sees that these lines exist in the target but not in the source. Despite prompt instructions to preserve localization, the LLM sometimes removes them — interpreting the lines as "content to clean up" rather than "localization to keep".

**Real example**: PR [QuantEcon/lecture-intro.zh-cn#202](https://github.com/QuantEcon/lecture-intro.zh-cn/pull/202) — the whole-file RESYNC on `pv.md` removed the `font_manager` / SimHei configuration despite explicit preservation rules in the prompt.

### Current Mitigation: Prompt-Based (Option A)

As of v0.9.0, all three translation prompts (UPDATE, section RESYNC, whole-file RESYNC) include an explicit rule:

> **NEVER remove i18n/localization code from code cells.** The translation may contain extra code inside code cells that does NOT exist in the source — this is intentional localization. Always preserve these.

With specific examples of font_manager, rcParams, and SimHei patterns.

**Limitation**: This relies on LLM compliance. The LLM may still remove i18n code for unfamiliar patterns or when the removal rule ("remove content not in source") competes with the preservation rule.

### Proposed Solution: `# i18n` Comment Convention (Option D)

Adopt a convention where translators mark localization code with `# i18n` comments:

```python
from matplotlib import font_manager  # i18n
fontP = font_manager.FontProperties()  # i18n
fontP.set_family('SimHei')  # i18n
fontP.set_size(14)  # i18n
```

or as a block:

```python
# i18n: CJK font configuration
from matplotlib import font_manager
fontP = font_manager.FontProperties()
fontP.set_family('SimHei')
fontP.set_size(14)
```

**Benefits**:
- **Deterministic**: The system can pre-extract and re-inject marked lines without relying on LLM judgment
- **Language-agnostic**: Works for any target language, any type of localization code
- **Self-documenting**: Makes it clear to human translators which lines are localization additions
- **Composable**: Works alongside the prompt-based approach as a fallback

### Implementation Plan

#### Phase 1: Convention & Documentation
- Define the `# i18n` comment convention in user documentation
- Document common patterns per language (zh-cn: SimHei fonts; ja: IPAGothic; ko: NanumGothic)
- Provide a contributor guide section explaining when and how to use `# i18n` markers

#### Phase 2: Pre-extraction / Re-injection
- Before sending code cells to the LLM, scan for `# i18n` marked lines
- Store them with their position (which code cell, which line offset)
- After receiving LLM output, verify marked lines are preserved; re-inject if missing
- This could be implemented in `file-processor.ts` or as a new `i18n-code.ts` module

#### Phase 3: Retroactive Annotation
- Audit existing translations for i18n code patterns
- Script to auto-detect likely i18n code (font config, rcParams, locale imports) and add `# i18n` comments
- Submit as PRs to each translation repository

### Patterns to Detect (for Phase 3 auto-annotation)

| Pattern | Language | Purpose |
|---|---|---|
| `font_manager.FontProperties()` | zh-cn, ja, ko | CJK font setup |
| `fontP.set_family('SimHei')` | zh-cn | Chinese font |
| `plt.rcParams['font.sans-serif']` | zh-cn, ja, ko | Matplotlib CJK |
| `plt.rcParams['axes.unicode_minus']` | zh-cn, ja, ko | Minus sign fix |
| `plt.rcParams['font.family']` | any | Font override |
| `locale.setlocale(...)` | any | Locale setup |
| `matplotlib.font_manager.fontManager.addfont(...)` | any | Custom font |

### Priority & Timeline

- **Phase 1**: Include in v0.10.0 user/developer documentation
- **Phase 2**: Medium priority — implement after forward resync stabilizes
- **Phase 3**: Low priority — can be done incrementally per repository

---

## Summary & Prioritization

| Feature | Priority | Effort | Value | Status |
|---------|----------|--------|-------|--------|
| **Initial Alignment Agent** | **High** | **High** | **Critical** | **Planned** |
| Hub-Spoke Setup Documentation | High | Low | High | **Ready to implement** |
| **i18n Code Annotation (`# i18n`)** | **Medium** | **Low–Medium** | **High** | **Phase 1 planned** |
| Resync Monitoring | Medium | Low | Medium | Planned |
| Upstream Suggestions (Manual) | Medium | Low | Medium | Planned |
| Resync Auto-fix | Low | Medium | Medium | Future |
| Upstream Suggestions (Automated) | Low | High | Medium | Future |

### Separate Project: Translation Quality Benchmark

The **Translation Quality Benchmark Tool** has been elevated to a standalone project with its own comprehensive plan:

📊 **[PROJECT-BENCHMARK.md](projects/PROJECT-BENCHMARK.md)**

**Scope**: 
- Gold-standard EN-ZH dataset (1000+ terms, 500+ sentences, 100+ paragraphs)
- Multi-model benchmarking (Claude, GPT, Gemini)
- GitHub Pages dashboard for visualization
- Integration with `lecture-intro` human translations
- Collaboration with Xiamen University RA Group

This is now tracked separately from the core `action-translation` features.

---

**Notes**:
- **Initial Alignment Agent** is HIGH priority for onboarding existing projects like `lecture-intro`
- The benchmark project will use `lecture-intro` human translations to optimize AI quality
- Both leverage the same corpus but serve different purposes:
  - Alignment Agent: One-time onboarding to enable automated sync
  - Benchmark Tool: Ongoing quality improvement of AI translations

### Recommended Roadmap

**v0.8.0** (Near-term)
- [ ] Document hub-spoke setup guide (Section 3)
- [ ] Add workflow templates for new languages
- [ ] Resync monitoring mode (`mode: monitor`)
- [ ] **Initial Alignment Agent (Phase 1: Structural scan)**
- [ ] **Translation Quality Benchmark Tool (Phase 1: Data collection)**

**v0.9.0** (Medium-term)
- [ ] **Initial Alignment Agent (Phase 2-3: Sampling + Interactive)**
- [ ] **Translation Quality Benchmark Tool (Phase 2-3: Automated comparison + Analysis)**
- [ ] Label-triggered upstream suggestions (`mode: suggest`)
- [ ] Suggestion PR creation and linking
- [ ] Resync auto-fix mode (`mode: resync`)

**v1.0.0** (Future)
- [ ] **Translation Quality Benchmark Tool (Phase 4: Continuous optimization)**
- [ ] AI-assisted suggestion extraction (`suggestion-format: freeform`)
- [ ] Cross-language glossary consistency checking
- [ ] Translation status dashboard

---

## Appendix: Configuration Reference (Proposed)

### Alignment Mode Inputs

```yaml
inputs:
  mode:
    description: 'align'
  source-repo:
    description: 'Source repository (owner/repo)'
    required: true
  target-repo:
    description: 'Target repository (owner/repo)'
    required: true
  target-language:
    description: 'Target language code'
    required: true
  alignment-phase:
    description: 'structural-scan | selective-sample | full-analysis'
    default: 'structural-scan'
  sample-size:
    description: 'Number of sections to sample per uncertain file'
    default: 3
  output-format:
    description: 'markdown | yaml | json'
    default: 'markdown'
  create-issues:
    description: 'Create GitHub issues for files needing review'
    default: true
```

### Resync Mode Inputs

```yaml
inputs:
  mode:
    description: 'resync | monitor'
  resync-strategy:
    description: 'report-only | auto-sync | hybrid'
    default: 'report-only'
  resync-scope:
    description: 'all | changed-since-last-sync'
    default: 'all'
  notification:
    description: 'issue | comment | none'
    default: 'issue'
```

### Suggest Mode Inputs

```yaml
inputs:
  mode:
    description: 'suggest'
  source-repo:
    description: 'English repository (owner/repo)'
    required: true
  suggestion-format:
    description: 'structured | freeform'
    default: 'structured'
  suggestion-labels:
    description: 'Labels for suggestion PRs'
    default: 'translation-suggestion'
```

---

**Document Maintainer**: QuantEcon Team  
**Feedback**: Open an issue or discussion in the repository

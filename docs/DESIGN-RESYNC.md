# PLAN: tool-resync - Two-Step Synchronization Strategy

**Document Status**: PLANNING  
**Created**: January 2025  
**Last Updated**: January 2025  
**Version**: 0.7 (Added complete sync lifecycle and SYNC-WORKFLOW.md)

---

## Deprecation: Replaces tool-onboarding and tool-alignment

This tool **replaces** two previous tools that attempted similar functionality:

### tool-alignment (Already Deprecated)

**Status**: Already deprecated in favor of tool-onboarding

### tool-onboarding (Now Deprecated)

**Status**: Deprecated by this plan

**Why it failed** (see [feedback from Humphrey Yang](https://github.com/QuantEcon/lecture-python-intro/issues/677)):

| Issue | Problem | Impact |
|-------|---------|--------|
| Code block matching | Position-based (1-to-1) | ❌ Breaks when cells added/deleted |
| Hybrid approach | Separate code vs prose analysis | ❌ Loses context, complex to maintain |
| Deterministic code comparison | Tries to be "smart" about diffs | ❌ False positives, fragile |
| Architecture | Standalone 2,300-line tool | ❌ Duplicates action-translation modules |

**Key quote from feedback**:
> "Overall the agent could not match code cells accurately. I think this is because it tries to number the code cells and match them one-to-one. This would break if we add or delete a code cell in the target."

### Why tool-resync is Better

| Aspect | tool-onboarding | tool-resync |
|--------|-----------------|-------------|
| **Unit of analysis** | Individual code blocks | Whole sections (code + prose) |
| **Matching strategy** | Position-based block matching | Section-based via heading-map |
| **Intelligence** | Deterministic rules + AI | AI judgment on whole context |
| **Question asked** | "Do these blocks differ?" | "Is there value to backport?" |
| **Integration** | Standalone tool | Integrated CLI, shares modules |

**The simpler approach** (as noted in [issue #677](https://github.com/QuantEcon/lecture-python-intro/issues/677#issuecomment-2569313456)):
> "I think a simpler approach would be better: 1. review the translation as a whole (alongside git history) to see if there are any suggested back ports to the source (ENGLISH) version, then 2. SYNC any changes or updates from ENGLISH to TRANSLATION"

This is exactly what tool-resync does.

### Migration Path

1. **Archive tool-onboarding** - Keep code for reference, mark deprecated
2. **Archive tool-alignment** - Already deprecated, no action needed
3. **Build tool-resync Phase 0** - Validate on same test case (`cagan_adaptive.md`)
4. **Compare quality** - Verify tool-resync produces better results
5. **Remove deprecated tools** - After tool-resync is proven

---

## Relationship to Existing Plans

This plan **builds on and refines** existing design work documented in:

- **[PLAN-FUTURE-FEATURES.md](docs/PLAN-FUTURE-FEATURES.md)** - Section 1 (Resync Workflow) and Section 4 (Bidirectional Sync / Upstream Suggestions)
- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** - Project lifecycle and mode relationships

### Key Alignment Points

| Concept | Existing Docs | This Plan |
|---------|--------------|-----------|
| SOURCE is truth | ✅ "English is authoritative" | ✅ Same |
| Backports = suggestions | ✅ "Not automatic bidirectional sync, but a suggestion workflow" | ✅ Same |
| Human review required | ✅ "Reviewed by English content maintainers" | ✅ Same |
| Section-based analysis | ✅ Section-level translation | ✅ Same |

### Design Decision: CLI Batch Analysis (Not Label-Triggered)

The existing docs mention a label-triggered approach where translators add `suggest-upstream` labels. After analysis, we've decided **CLI batch analysis is the better approach**:

#### Why Most Translation Changes Are NOT Backport Candidates

| Change Type | Example | Backport? |
|-------------|---------|-----------|
| Better word choice | "效用函数" → "实用函数" | ❌ No - translation style |
| Improved flow | Restructured Chinese sentence | ❌ No - language-specific |
| Grammar/punctuation | Fixed Chinese punctuation | ❌ No - target language only |
| Terminology consistency | Aligned with glossary | ❌ No - translation quality |
| **Bug fix** | Corrected formula error | ✅ **Yes** |
| **New example** | Added context-specific example | ✅ **Maybe** |
| **Clarification** | Revealed English was ambiguous | ✅ **Yes** |

The vast majority of translation changes improve the *translation*, not the *source content*. Backport candidates are rare.

#### Why Batch Analysis Over Label-Triggered

| Aspect | Label-Triggered | Batch Analysis (CLI) |
|--------|----------------|---------------------|
| Burden on translator | High - must identify candidates | None - automatic |
| Signal-to-noise | Low - many false positives | High - LLM filters |
| Consistency | Variable (different translators) | Consistent (same prompts) |
| Coverage | Scattered (only flagged items) | Complete (all changes reviewed) |
| Output | Many small PRs | One consolidated report |
| Reviewer experience | Fragmented | Prioritized, contextualized |

#### Why Not Two-Way Sync?

Two-way automatic sync would create:
- Circular dependencies ("which version is current?")
- Complex merge conflicts  
- Audit trail confusion
- No clear ownership

**SOURCE as truth** with **periodic suggestion reports** is cleaner:
- Clear direction (SOURCE → TARGET)
- Suggestions go through SOURCE review process
- Once accepted, changes propagate to ALL target languages
- Single source of truth maintained

---

## Complete Sync Lifecycle

This tool is part of a larger sync ecosystem. See [docs/SYNC-WORKFLOW.md](docs/SYNC-WORKFLOW.md) for the complete workflow guide.

### All Modes Summary

| Mode | Direction | Trigger | Tool | Status |
|------|-----------|---------|------|--------|
| **PR Diff** | SOURCE → TARGET | Automated (PR merge) | action-translation (sync) | ✅ Implemented |
| **Review** | Evaluates TARGET | Automated (PR open) | action-translation (review) | ✅ Implemented |
| **Backport** | TARGET → SOURCE | Manual/scheduled | resync backport | 📋 Planned |
| **Status** | Diagnostic | Manual | resync status | 📋 Planned |
| **Forward Sync** | SOURCE → TARGET | Manual | resync sync | 📋 Planned |
| **Bulk Translate** | SOURCE → TARGET | Manual (one-time) | tool-bulk-translator | ✅ Implemented |

### Where resync Fits

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TRANSLATION SYNC LIFECYCLE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PHASE 1: ONBOARDING                                                        │
│  ├── Path A: New translation → bulk-translator → Enable PR Diff             │
│  └── Path B: Existing translation → resync backport → resync sync → PR Diff │
│                                                                              │
│  PHASE 2: STEADY STATE                                                       │
│  └── PR Diff (automated) keeps SOURCE → TARGET in sync                      │
│                                                                              │
│  PHASE 3: MAINTENANCE                                                        │
│  ├── resync backport (monthly) → find improvements to suggest               │
│  └── resync status + sync → fix drift from direct commits                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Critical: Order of Operations for Onboarding

When onboarding a repository with existing manual translations, **order matters**:

| Step | Command | Purpose |
|------|---------|---------|
| 1 | `resync status` | Understand current state |
| 2 | `resync backport` | Find improvements BEFORE overwriting |
| 3 | Human review | Accept good suggestions into SOURCE |
| 4 | `resync sync` | Now safe to sync (improvements preserved) |
| 5 | Enable PR Diff | Automated sync going forward |

**⚠️ Warning**: Running `resync sync` before `resync backport` will overwrite TARGET, losing valuable translation improvements.

---

## Executive Summary

This document outlines a new **two-step synchronization strategy** for maintaining alignment between SOURCE (English) and TARGET (translation) repositories. The approach addresses a key limitation of the current workflow: **valuable improvements made in translations may be lost** when syncing from SOURCE to TARGET.

### The Two Commands

| Command | Direction | Purpose |
|---------|-----------|---------|
| `resync backport` | TARGET → SOURCE | Detect and suggest backporting improvements from translations |
| `resync sync` | SOURCE → TARGET | Migrate changes from SOURCE (source of truth) to TARGET |

### CLI Batch Analysis Design

The tool is designed as a **CLI utility** for periodic batch analysis:

- **Scheduled runs** (e.g., monthly cron job to check sync status)
- **LLM-powered filtering** - distinguishes translation improvements from genuine backport candidates
- **Consolidated reports** - one report with prioritized suggestions, not scattered PRs
- **Easy local testing** during development
- **Single-file mode** for quick debugging

### Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     TWO-STEP RESYNC WORKFLOW                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   STEP 1: BACKPORT ANALYSIS (monthly or as-needed)                       │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │  npx resync backport                                              │  │
│   │  • Parse SOURCE and TARGET into sections                          │  │
│   │  • Match sections by position (heading-map for validation)        │  │
│   │  • Annotate with file-level git dates                             │  │
│   │  • LLM evaluates each section:                                    │  │
│   │    "Is this a substantive improvement, or just better translation?"│  │
│   │  • Filter out pure translation improvements                       │  │
│   │  • Generate consolidated report with genuine candidates           │  │
│   └──────────────────────────────────────────────────────────────────┘  │
│                              │                                           │
│                              ▼                                           │
│   Human review of backport suggestions                                   │
│   (manually create PRs for accepted suggestions)                         │
│                              │                                           │
│                              ▼                                           │
│   STEP 2: FORWARD SYNC                                                   │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │  npx resync sync                                                  │  │
│   │  • Compare SOURCE to TARGET sections                              │  │
│   │  • SOURCE is the strict source of truth                           │  │
│   │  • Translate changed sections                                     │  │
│   │  • Generate translation PRs in TARGET repo                        │  │
│   └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Future: Scheduled Resync

```bash
# Monthly cron job example (GitHub Actions or local)
0 0 1 * * cd /repos && npx resync backport -s lecture-python -t lecture-python.zh-cn -o reports/$(date +%Y-%m)
```

---

## Problem Statement

### Current Limitations

1. **Lost Translation Improvements**: Translations often contain valuable improvements:
   - Bug fixes discovered during translation
   - Clarifications to confusing explanations
   - Additional examples added by translators
   - Code improvements (variable naming, comments)
   
2. **One-Way Sync Blindness**: The current `action-translation` SYNC only goes SOURCE → TARGET, meaning improvements in TARGET are overwritten.

3. **Previous Tool Shortcomings**:
   - `tool-alignment`: Code-focused, missed prose context
   - `tool-onboarding`: Hybrid but still separated code/prose analysis
   - Both lacked temporal context (git history) for decision-making

### Key Insight from Previous Tools

From `tool-onboarding`, we learned:
- **Code blocks compared in isolation** miss context (some code comments ARE translated)
- **Prose analysis** needs section-level context, not paragraph-level
- **Date information** is crucial for determining direction (who changed what, when)
- **Decision granularity** should be at the SECTION level, not code-block level

---

## Design Principles

### 1. Section-Based Analysis

Build on the proven `action-translation` parser architecture:

```typescript
interface Section {
  heading: string;        // "## Economic Models"
  level: number;          // 2, 3, 4, 5, or 6
  id: string;             // "economic-models"
  content: string;        // Full section content
  startLine: number;
  endLine: number;
  subsections: Section[];
}
```

**Why sections, not code blocks?**
- Context is preserved (LLM sees entire section)
- Code comments/strings in context of surrounding prose
- Subsections properly nested
- Natural unit for translation/backporting

### 2. File-Level Git Dates (Simple & Reliable)

Use **file-level git dates** rather than complex section-level tracking:

```typescript
interface FileMetadata {
  sourceLastModified: Date;     // git log -1 --format="%ai" <source-file>
  targetLastModified: Date;     // git log -1 --format="%ai" <target-file>
}
```

**Why file-level?**
- **Simple**: One git command per file
- **Reliable**: Line numbers don't shift after edits
- **Sufficient**: Gives LLM temporal context for decision-making
- **Avoids complexity**: Section-level `git log -L` is fragile

The LLM evaluates **content differences**, not dates. Dates are just context:
> "SOURCE last modified 2024-06-15, TARGET last modified 2024-12-20"

### 3. Section Sync Status

Each **section pair** has an explicit status (not file-level):

```typescript
type SectionSyncStatus = 
  | 'SOURCE_ONLY'      // Section exists only in source
  | 'TARGET_ONLY'      // Section exists only in target
  | 'SOURCE_CHANGED'   // Source section differs from what was translated
  | 'TARGET_CHANGED'   // Target section has changes beyond translation
  | 'BOTH_CHANGED'     // SAME SECTION edited in both repos → conflict
  | 'IN_SYNC';         // Sections are aligned (translation matches source)
```

**Important**: `BOTH_CHANGED` only applies when the **same section** has divergent edits, not when different sections in the same file were modified. For example:

| SOURCE Edit | TARGET Edit | Result |
|-------------|-------------|--------|
| Section A changed | Section B changed | No conflict - sync A→target, evaluate B for backport |
| Section A changed | Section A changed | `BOTH_CHANGED` - needs manual review |
| Section A changed | No changes | `SOURCE_CHANGED` - sync to target |
| No changes | Section A changed | `TARGET_CHANGED` - evaluate for backport |

File-level git dates provide **context** for the LLM (e.g., "TARGET file was updated 6 months after SOURCE"), but the actual sync status is determined by **section-level content comparison**.

### 4. LLM-Driven Evaluation

Use LLM with full section context for backport analysis:

**Backport Prompt Strategy**:
```
Given this section:
- SOURCE (English) content: [section content]
- TARGET (Translation) content: [section content]  
- SOURCE last modified: [date]
- TARGET last modified: [date] (6 months later)

Evaluate if TARGET contains improvements worth backporting:
1. Bug fixes or corrections
2. Clarifications to explanations
3. Additional examples
4. Code improvements (beyond i18n changes)

Return: BACKPORT suggestion with specific changes, or NO_BACKPORT with reasoning.
```

### 5. CLI Flexibility

Support both single-file and bulk operations:

```bash
# Single file analysis
npx tool-sync-backports -f lectures/cobweb.md -s SOURCE -t TARGET

# Bulk analysis
npx tool-sync-backports -s SOURCE -t TARGET -d lectures

# Forward sync (after backports reviewed)
npx tool-sync -s SOURCE -t TARGET -d lectures
```

---

## Tool Specifications

### resync backport

**Purpose**: Analyze TARGET for improvements to suggest backporting to SOURCE

**Input**:
- SOURCE repository path
- TARGET repository path
- Docs folder
- Optional: specific file to analyze

**Process**:
1. Parse both SOURCE and TARGET into sections
2. Match sections by position (using heading-map for validation)
3. Get file-level git dates for context
4. For each section pair, determine sync status
5. For `TARGET_NEWER` sections: send to LLM for backport evaluation
6. Generate markdown report with suggestions

**Output** (Phase 0-1: Reports only):
```markdown
## Backport Suggestions: cobweb.md

### Section: The Cobweb Model (HIGH confidence: 0.92)
**Category**: BUG_FIX

The Chinese translation corrected an error in the equilibrium condition.

**Original (English)**:
> The equilibrium price satisfies p* = D(p*)

**Suggested Fix**:
> The equilibrium price satisfies p* = S(p*)

**Reasoning**: The original text incorrectly used the demand function D(p*) 
when it should be the supply function S(p*) for supply-determined equilibrium.

---
```

**LLM Evaluation Categories**:
| Category | Description | Priority |
|----------|-------------|----------|
| **BUG_FIX** | Correction of errors | High - definitely backport |
| **CLARIFICATION** | Better explanation | Medium - consider backport |
| **EXAMPLE** | Additional example | Medium - consider backport |
| **CODE_IMPROVEMENT** | Non-i18n code change | Medium - review for backport |
| **I18N_ONLY** | Font/locale changes | None - no backport needed |
| **NO_CHANGE** | Sections equivalent | None - no action |

### resync sync

**Purpose**: Migrate changes from SOURCE to TARGET (forward sync)

**Input**:
- SOURCE repository path (source of truth)
- TARGET repository path
- Docs folder
- Optional: specific file to sync

**Process**:
1. Parse SOURCE into sections
2. Parse TARGET into sections  
3. Match sections by position (with heading-map)
4. Determine sync status for each section pair
5. For `SOURCE_NEWER` or `SOURCE_ONLY`:
   - Use UPDATE mode translation (provides context of old translation)
   - Preserve heading-map
6. Generate updated TARGET files

**Output**:
- Updated TARGET files with translations
- Summary of changes made

**Note**: This tool treats SOURCE as strict truth. Run `backport` first, review and merge any suggestions, then run `sync`.

---

## Architecture

### Integrated CLI in action-translation

Rather than a separate package, the CLI lives inside `action-translation`:

```
action-translation/
├── src/
│   ├── parser.ts              # SHARED - section parsing
│   ├── heading-map.ts         # SHARED - cross-language mapping  
│   ├── types.ts               # SHARED - extended with CLI types
│   ├── translator.ts          # SHARED - translation logic
│   ├── diff-detector.ts       # Action only - same-language diff
│   ├── file-processor.ts      # Action only - document reconstruction
│   ├── index.ts               # Action entry point (SYNC/REVIEW modes)
│   │
│   └── cli/                   # NEW: CLI tools
│       ├── index.ts           # CLI entry point (commander.js)
│       ├── types.ts           # CLI-specific types
│       ├── section-matcher.ts # Cross-language section matching
│       ├── git-metadata.ts    # File-level git dates
│       ├── backport-evaluator.ts  # LLM backport analysis
│       ├── report-generator.ts    # Markdown report output
│       ├── commands/
│       │   ├── backport.ts    # resync backport command
│       │   └── sync.ts        # resync sync command
│       └── __tests__/
│           ├── section-matcher.test.ts
│           ├── backport.test.ts
│           └── fixtures/
```

### Module Compatibility Analysis

| Module | Use in CLI | Notes |
|--------|------------|-------|
| **parser.ts** | ✅ REUSE | Works identically for any language |
| **heading-map.ts** | ✅ REUSE | Designed for cross-language matching |
| **types.ts** | ✅ EXTEND | Add `SectionPair`, `BackportSuggestion` |
| **translator.ts** | ✅ REUSE | For forward sync translation |
| **diff-detector.ts** | ❌ NO | Wrong abstraction (same-language only) |
| **file-processor.ts** | ⚠️ PARTIAL | Document reconstruction useful for sync |

### New Modules Needed

#### section-matcher.ts (Cross-Language Matching)

The existing `diff-detector.ts` compares **same-language** documents:
- Uses `section1.id === section2.id` for matching
- Exact string content comparison

For backport, we need **cross-language** matching:
- Position-based matching (1st section ↔ 1st section)
- Heading-map lookup for validation
- No content comparison (different languages)

```typescript
interface SectionPair {
  sourceSection: Section | null;   // null if target-only
  targetSection: Section | null;   // null if source-only
  status: SectionSyncStatus;
  sourceHeading?: string;
  targetHeading?: string;
}

function matchSections(
  sourceSections: Section[],
  targetSections: Section[],
  headingMap: HeadingMap
): SectionPair[]
```

#### git-metadata.ts (File-Level Dates)

Simple git date extraction:

```typescript
interface FileGitMetadata {
  lastModified: Date;
  lastCommit: string;
  lastAuthor: string;
}

async function getFileGitMetadata(
  repoPath: string,
  filePath: string
): Promise<FileGitMetadata> {
  // git log -1 --format="%H %ai %an" <filepath>
}
```

#### backport-evaluator.ts (LLM Analysis)

Prompts for backport evaluation with full section context.

---

## LLM Prompt Design

### Backport Evaluation Prompt

```markdown
You are analyzing a translation section to determine if it contains improvements that should be backported to the English source.

## Context
- Source language: English
- Target language: {target_language}
- File: {filename}
- Section: {section_heading}

## Timeline
- SOURCE last modified: {source_date}
- TARGET last modified: {target_date}
- Time difference: TARGET is {days_newer} days newer

## Source Content (English)
```
{source_section_content}
```

## Target Content ({target_language})
```
{target_section_content}
```

## Task
Analyze if the TARGET contains improvements worth backporting to SOURCE.

Consider:
1. **Bug fixes**: Errors corrected in the translation
2. **Clarifications**: Better explanations or wording
3. **Additional examples**: New examples added
4. **Code improvements**: Non-cosmetic code changes (not i18n fonts/locale)

Ignore:
- Language-specific formatting (Chinese punctuation, etc.)
- i18n code changes (fonts, figure size adjustments)
- Translation variations that don't improve meaning

## Response Format
```json
{
  "recommendation": "BACKPORT" | "NO_BACKPORT",
  "category": "BUG_FIX" | "CLARIFICATION" | "EXAMPLE" | "CODE_IMPROVEMENT" | "I18N_ONLY" | "NO_CHANGE",
  "confidence": 0.0-1.0,
  "summary": "Brief description of the improvement",
  "specific_changes": [
    {
      "type": "description of change type",
      "original": "what was in SOURCE",
      "improved": "what is in TARGET (translated back to English if needed)"
    }
  ],
  "reasoning": "Why this should/shouldn't be backported"
}
```
```

### Section-Based vs Code-Block Analysis

**Previous approach (tool-onboarding)**:
```
Code Block 1: Compare in isolation → Miss context
Code Block 2: Compare in isolation → Miss context
Prose: Separate analysis → Disconnected from code
```

**New approach (tool-resync)**:
```
Section (code + prose together):
  - LLM sees full context
  - Code comments understood in context of explanation
  - Translated comments recognized as i18n (not bugs)
  - Natural grouping of related changes
```

---

## Learnings from Previous Tools

### From tool-alignment (Deprecated)

**What worked**:
- Code block extraction patterns
- Normalization logic (comments, strings)
- Structural comparison

**What didn't work**:
- Separate code/prose analysis lost context
- Complex scoring system hard to tune
- No temporal information

### From tool-onboarding

**What worked**:
- Hybrid approach (deterministic + LLM)
- Four clear action types (SYNC, BACKPORT, ACCEPT, MANUAL)
- Document order organization
- i18n detection patterns

**What didn't work**:
- Still separated code/prose
- No git history integration
- Per-block decisions instead of per-section

**Key Quote from README**:
> "Claude can hallucinate about code (reporting issues that don't exist). Deterministic code analysis eliminates this."

**New insight**: With section-level context, LLM has enough information to correctly identify code issues. The hallucination risk came from isolated code blocks without surrounding context.

### From action-translation (SYNC)

**What works well**:
- Section-based parsing (proven in production)
- Heading-map system (language-independent matching)
- Recursive subsection handling
- UPDATE mode translation (preserves context)

**What to reuse**:
- `parser.ts` - Section parsing
- `heading-map.ts` - Section matching
- `translator.ts` - Translation logic
- `diff-detector.ts` - Change detection patterns

---

## CLI Design

### Entry Point

```bash
npx resync <command> [options]

Commands:
  backport    Analyze TARGET for improvements to suggest to SOURCE
  sync        Migrate changes from SOURCE to TARGET
  status      Quick sync status check (no LLM calls)

Common Options:
  -s, --source <path>       Source repository path (required)
  -t, --target <path>       Target repository path (required)
  -d, --docs-folder <dir>   Documentation folder (default: "lectures")
  -l, --language <code>     Target language code (default: "zh-cn")
  -f, --file <filename>     Process single file only
  -o, --output <path>       Output directory for reports (default: "./reports")
  --json                    Output as JSON (for automation/scripting)

Backport Options:
  --min-confidence <n>      Minimum confidence for reporting (default: 0.6)
  --estimate                Show cost estimate without running

Sync Options:
  --dry-run                 Show what would change without making changes

Status Options:
  (uses --json from common options)
```

### Output Formats

**Markdown** (default): Human-readable reports for review
**JSON** (`--json`): Machine-readable for automation

```json
{
  "summary": {
    "filesAnalyzed": 51,
    "suggestionsFound": 3,
    "highConfidence": 1,
    "mediumConfidence": 2
  },
  "suggestions": [
    {
      "file": "cobweb.md",
      "section": "The Cobweb Model",
      "confidence": 0.92,
      "category": "BUG_FIX",
      "summary": "Corrected equilibrium equation",
      "details": { ... }
    }
  ]
}
```

### Example Workflows

**Quick Status Check** (no API cost):
```bash
npx resync status -s ~/repos/lecture-python -t ~/repos/lecture-python.zh-cn
# Output: 51 files, 47 synced, 3 target-newer, 1 source-newer
```

**Single File Backport Analysis**:
```bash
npx resync backport -f cobweb.md \
  -s ~/repos/lecture-python \
  -t ~/repos/lecture-python.zh-cn \
  -o reports

# Output: reports/cobweb-backport.md
```

**Full Backport Analysis with Estimate**:
```bash
npx resync backport --estimate \
  -s ~/repos/lecture-python \
  -t ~/repos/lecture-python.zh-cn

# Output:
# 📊 Backport Analysis Estimate
# Files to analyze: 51
# Sections with TARGET newer: 23
# Estimated LLM calls: 23
# Estimated cost: ~$1.15
# Estimated time: ~3 minutes
# 
# Proceed? [y/N]
```

**Forward Sync (after backports reviewed)**:
```bash
npx resync sync \
  -s ~/repos/lecture-python \
  -t ~/repos/lecture-python.zh-cn \
  --dry-run

# Review dry-run output, then:
npx resync sync \
  -s ~/repos/lecture-python \
  -t ~/repos/lecture-python.zh-cn
```

### Scheduled Resync (Future Use)

The CLI design is intentionally compatible with GitHub Action automation. Monthly scheduled runs can:
- Generate reports for human review
- **Automatically create PRs** for high-confidence suggestions

#### Basic: Monthly Report Generation

```yaml
# .github/workflows/monthly-sync-check.yml
name: Monthly Sync Check
on:
  schedule:
    - cron: '0 0 1 * *'  # First day of each month

jobs:
  check-sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          repository: quantecon/lecture-python
          path: source
      - uses: actions/checkout@v4  
        with:
          repository: quantecon/lecture-python.zh-cn
          path: target
      - run: |
          npx resync backport \
            -s source -t target \
            -o reports/$(date +%Y-%m)
      - uses: actions/upload-artifact@v4
        with:
          name: sync-report
          path: reports/
```

#### Advanced: Automated PR Creation (Future Phase 4)

```yaml
# .github/workflows/monthly-backport-suggestions.yml
name: Monthly Backport Suggestions
on:
  schedule:
    - cron: '0 0 1 * *'

jobs:
  analyze-and-suggest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          repository: quantecon/lecture-python
          path: source
      - uses: actions/checkout@v4
        with:
          repository: quantecon/lecture-python.zh-cn
          path: target
      
      # Run analysis with JSON output
      - name: Analyze backport candidates
        run: |
          npx resync backport --json \
            -s source -t target \
            -o results.json
      
      # Process results by confidence level
      - name: Create PRs for high-confidence suggestions
        uses: actions/github-script@v7
        with:
          script: |
            const results = require('./results.json');
            
            for (const suggestion of results.suggestions) {
              if (suggestion.confidence >= 0.85) {
                // HIGH confidence: Create PR automatically
                await github.rest.pulls.create({
                  owner: 'quantecon',
                  repo: 'lecture-python',
                  title: `[Backport] ${suggestion.file}: ${suggestion.summary}`,
                  body: formatSuggestionBody(suggestion),
                  head: `backport/${suggestion.file}`,
                  base: 'main'
                });
              } else if (suggestion.confidence >= 0.6) {
                // MEDIUM confidence: Create issue for review
                await github.rest.issues.create({
                  owner: 'quantecon',
                  repo: 'lecture-python',
                  title: `[Review] Potential backport: ${suggestion.file}`,
                  body: formatSuggestionBody(suggestion),
                  labels: ['backport-suggestion', 'needs-review']
                });
              }
              // LOW confidence: Report only (no action)
            }
```

#### Confidence-Based Actions

| Confidence | Action | Rationale |
|------------|--------|-----------|
| ≥0.85 (HIGH) | Create PR automatically | Bug fixes, clear improvements |
| 0.6-0.85 (MEDIUM) | Create issue for review | Potential value, needs human judgment |
| <0.6 (LOW) | Include in report only | Likely translation improvement, not backport |
```

---

## Implementation Phases

### Phase 0: Single-File Backport Report (3-4 days)
**Goal**: Validate LLM prompts and report format with minimal scope

- [ ] Set up `src/cli/` directory structure
- [ ] CLI scaffolding with commander.js
- [ ] `section-matcher.ts` - Cross-language section matching
- [ ] `git-metadata.ts` - File-level git dates
- [ ] `backport-evaluator.ts` - LLM prompts
- [ ] `report-generator.ts` - Markdown output
- [ ] Single file backport command: `npx resync backport -f file.md`
- [ ] Test fixtures from real lecture repos

**Deliverable**: Working single-file backport analysis with report output

### Phase 1: Bulk Analysis & Status Command (2-3 days)
**Goal**: Scale to full repository analysis + quick diagnostic mode

- [ ] Bulk file processing with progress indicator
- [ ] Cost estimation (`--estimate` flag)
- [ ] Summary report across all files
- [ ] `status` command implementation:
  - No LLM calls (fast, free)
  - Check heading-map presence
  - Detect structural differences (section count)
  - Report sync status per file (ALIGNED, DRIFT, MISSING_HEADINGMAP)
  - Output: Summary table + detailed per-file status
- [ ] Unit tests for section-matcher and report-generator
- [ ] JSON output (`--json`) for automation

**Deliverable**: Full repository backport analysis + status diagnostic

### Phase 2: Forward Sync (2-3 days)
**Goal**: Implement SOURCE → TARGET sync

- [ ] Integrate `translator.ts` from action-translation
- [ ] Sync command with dry-run support
- [ ] Section-level translation (UPDATE mode)
- [ ] Heading-map preservation
- [ ] Output updated files to target repo

**Deliverable**: Working forward sync for changed sections

### Phase 3: Refinement & Documentation (2-3 days)
**Goal**: Production-ready CLI

- [ ] Integration tests with real repos
- [ ] Prompt tuning based on Phase 0-1 results
- [ ] README documentation
- [ ] Error handling and edge cases
- [ ] Optional: `--create-prs` flag for automated PR creation

**Deliverable**: Documented, tested CLI tool

### Phase 4: GitHub Action Automation (Future - 2-3 days)
**Goal**: Scheduled automation via GitHub Actions

- [ ] Ensure `--json` output is stable and well-documented
- [ ] Create reusable workflow template
- [ ] Implement confidence-threshold PR creation
- [ ] Add issue creation for medium-confidence suggestions
- [ ] Documentation: "Setting up automated resync"

**Deliverable**: GitHub Action workflow that runs monthly and creates PRs

**Note**: This phase can be deferred until manual workflow is proven.

**Estimated Total**: 9-13 days (Phase 0-3), +2-3 days (Phase 4)

---

## Success Metrics

### Quality Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Backport precision | ≥80% | Suggested backports accepted by reviewers |
| Backport recall | ≥70% | Real improvements detected |
| Sync accuracy | ≥95% | Correct section translations |
| False positives | ≤10% | Unnecessary suggestions |

### Operational Metrics

| Metric | Target |
|--------|--------|
| Single file analysis | <30 seconds |
| Full series (51 files) | <10 minutes |
| API cost per file | ~$0.05 (backport) |
| Status check (no LLM) | <5 seconds |

---

## Handling Edge Cases

### BOTH_CHANGED Conflict (Same Section Edited in Both Repos)

This only occurs when the **same section** has divergent edits:

```markdown
## ⚠️ Conflict Detected: cobweb.md > Section "The Model"

The SAME SECTION has been modified in both SOURCE and TARGET.

**SOURCE version**:
- Contains updated equilibrium equation
- Added paragraph about convergence

**TARGET version**:  
- Contains translated additional examples
- Fixed typo in code comment

**Recommendation**: Manual review required
1. Review SOURCE changes - do they need translation?
2. Review TARGET changes - should any be backported?
3. Decide which version to keep or merge manually
```

**Note**: If SOURCE changed Section A and TARGET changed Section B, there is no conflict - each change can be processed independently.

### Determining "Changed" Status

Since SOURCE and TARGET are in different languages, we can't do direct content comparison. The approach:

1. **Heading-map validation**: If section headings match the heading-map, structure is aligned
2. **LLM evaluation**: Ask LLM to assess if TARGET section appears to be a faithful translation of SOURCE, or if it contains additions/changes
3. **Heuristics**: Significant length differences, presence of content not matching SOURCE structure

### Missing Heading-Map

If TARGET lacks a heading-map:
1. Use position-based matching only
2. Warn in report: "No heading-map found, using position matching"
3. Suggest running action-translation SYNC first to generate heading-map

### New Files (SOURCE_ONLY or TARGET_ONLY)

| Case | Report Output |
|------|---------------|
| SOURCE_ONLY | "New file in SOURCE: needs translation" |
| TARGET_ONLY | "File exists only in TARGET: consider adding to SOURCE or removing from TARGET"

---

## Appendix A: Comparison with Existing Tools

| Aspect | tool-alignment | tool-onboarding | resync CLI (proposed) |
|--------|----------------|-----------------|----------------------|
| Status | Deprecated | Active | Proposed |
| Location | Separate package | Separate package | Integrated in action-translation |
| Analysis unit | Code blocks + prose | Regions (code/prose) | Sections (unified) |
| Git history | No | File-level dates | File-level dates |
| LLM usage | Quality scoring | Prose analysis | Backport evaluation |
| Code analysis | Deterministic | Deterministic | LLM with full context |
| Parser | Custom | Custom | Reuse action-translation |
| Heading-map | No | No | Yes (from action) |
| CLI | Yes | Yes | Yes |
| Scheduling | No | No | Yes (designed for cron) |

---

## Appendix B: Design Decisions

### Why File-Level Git Dates (Not Section-Level)?

**Considered**: `git log -L startLine,endLine:file` for section-level tracking

**Rejected because**:
- Line numbers change after any edit to the file
- Complex to handle moved/reordered sections  
- `git blame` alternative adds significant complexity
- Marginal benefit over file-level dates

**Chosen**: File-level dates provide sufficient context for LLM decision-making without complexity.

### Why Integrated CLI (Not Separate Package)?

**Considered**: `tool-resync/` as separate npm package

**Chosen**: `src/cli/` subdirectory because:
- Direct reuse of `parser.ts`, `heading-map.ts`, `translator.ts`
- Single test suite and CI pipeline
- Consistent versioning with action-translation
- Easier maintenance

### Why Reports First (Not PRs)?

**Considered**: Automatic PR creation from the start

**Deferred because**:
- Reports allow prompt iteration before automation
- Human review validates LLM suggestions
- Lower risk during development
- PRs can be added in Phase 3 once confident in quality

---

## Appendix C: Key Learnings Applied

### From tool-onboarding

> "Claude can hallucinate about code (reporting issues that don't exist). Deterministic code analysis eliminates this."

**Applied**: With section-level context (code + surrounding prose), the LLM has enough information to correctly identify code issues. The hallucination risk came from isolated code blocks without context.

### From action-translation

The section-based parser is proven in production:
- Handles arbitrary nesting (##, ###, ####, #####, ######)
- Heading-map enables cross-language section matching
- UPDATE mode translation preserves context

**Applied**: Reuse these modules directly rather than reimplementing.

---

## Appendix D: Terminology Alignment

To maintain consistency with existing documentation:

| This Plan | PLAN-FUTURE-FEATURES.md | Notes |
|-----------|------------------------|-------|
| Backport suggestion | Upstream suggestion | Same concept - improvements from TARGET suggested to SOURCE |
| `resync backport` | (supersedes `mode: suggest`) | CLI batch analysis preferred over label-triggered |
| Suggestion report | - | Consolidated markdown report, not individual PRs |
| TARGET_CHANGED | "Target has valuable improvements" | Section status indicating potential backport |

The core principle is consistent: **backports are suggestions, not automatic changes**. They require human review before inclusion in SOURCE.

**Note**: The existing docs mention a label-triggered `mode: suggest` approach. After analysis, we've determined that **CLI batch analysis is superior** because:
- Most translation changes are improvements to the translation, not backport candidates
- The LLM can filter these automatically in batch mode
- Consolidated reports are easier for reviewers than scattered PRs

---

## References

- [PLAN-FUTURE-FEATURES.md](docs/PLAN-FUTURE-FEATURES.md) - **Section 1**: Resync Workflow, **Section 4**: Bidirectional Sync (note: label-triggered approach superseded by this plan)
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - Project lifecycle, mode relationships, "SOURCE is truth" philosophy
- [Heading-Maps Documentation](docs/HEADING-MAPS.md) - Cross-language section matching
- [tool-onboarding README](tool-onboarding/README.md) - Previous learnings on code/prose analysis
- [tool-onboarding PLAN](tool-onboarding/docs/PLAN.md) - Hybrid analysis approach
- [tool-alignment README](tool-alignment/README.md) - Deprecated, but contains useful patterns

---

## Open Questions

1. **Backport confidence threshold**: What confidence level should be the default for reporting? (Currently 0.6)

2. **Multi-section changes**: If a backport affects multiple sections, group in one suggestion or separate?

3. **TARGET-only files**: Should these be flagged for potential addition to SOURCE, or just reported?

4. **Run frequency**: Monthly batch analysis seems right, but should there be an option for more frequent checks?

---

**Document Maintainer**: QuantEcon Team  
**Next Steps**: Review plan, then proceed with Phase 0 implementation (single-file backport)

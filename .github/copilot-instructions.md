# GitHub Copilot Instructions

## Project Overview

**action-translation** is a GitHub Action that automatically translates and reviews MyST Markdown documents using Claude AI (Anthropic). It uses a **section-based approach** for robust, maintainable translation.

**Two Modes**:
- **Sync Mode**: Runs in SOURCE repo, creates translation PRs in target repo
- **Review Mode**: Runs in TARGET repo, posts quality review comments on translation PRs

**Core Architecture**: Section-based translation with full recursive heading support
**Current Version**: v0.7.0 (Testing & Development)
**Test Coverage**: 266 tests, all passing
**Code Size**: ~3,400 lines core logic across 9 modules
**Glossary**: 357 terms (zh-cn, fa)

## Key Design Principles

1. **Section-Based, Not Block-Based**: Documents are structured into `## Section` blocks. Translations operate at the section level, not individual paragraphs or blocks.

2. **Full Recursive Structure**: Handles all heading levels (##, ###, ####, #####, ######) with arbitrary nesting depth.

3. **Position-Based Matching**: Sections match by position (1st → 1st), not by content matching. This works across languages.

4. **Heading-Map System**: Maps English heading IDs to translated headings for language-independent section matching.

5. **Recursive Subsection Support**: Subsections at any depth are parsed, compared, and integrated into heading-maps (v0.4.7+).

6. **Simple Stack-Based Parsing**: No AST, no `unified`/`remark`. Stack-based recursive parser handles arbitrary nesting.

7. **Incremental Translation**: Only translate changed sections (UPDATE mode), not entire documents.

## Core Concepts

### Section Structure

```typescript
interface Section {
  heading: string;        // "## Economic Models"
  level: number;          // 2, 3, 4, 5, or 6
  id: string;            // "economic-models"
  content: string;        // Direct content (WITHOUT subsections)
  startLine: number;      // Source line number
  endLine: number;        // End line number
  subsections: Section[]; // Recursively nested subsections (any depth)
}
```

### Critical: Recursive Subsection Handling (v0.4.7)

**Design**: Full recursion for arbitrary nesting depth.
- Append subsections from `section.subsections` array

**Why**: Prevents duplication (subsections in both content and array).

### Heading-Map System

```yaml
---
heading-map:
  introduction: "介绍"
  background: "背景"
  economic-models: "经济模型"
  household-problem: "家庭问题"  # Subsection
---
```

**Purpose**: Maps English IDs to translated headings for section matching.

**Features**:
- Flat structure (no nesting)
- Includes sections AND subsections
- Auto-populated on first translation
- Self-maintaining

### Translation Modes

**UPDATE Mode** (incremental):
- For MODIFIED sections
- Provides: old English, new English, current translation
- Maintains translation consistency
- Faster than full re-translation

**NEW Mode** (full):
- For ADDED sections or new files
- Provides: English content + glossary
- Full translation with glossary support

### Review Mode (v0.7.0)

**Purpose**: AI-powered quality assessment of translation PRs

**Evaluates**:
- Translation Quality: accuracy, fluency, terminology, formatting
- Diff Quality: scope, position, structure, heading-map correctness

**Output**: Review comment with scores, strengths, and suggestions
**Verdict**: PASS (≥8), WARN (≥6), FAIL (<6)

## Code Organization

### Module Structure

```
src/
├── index.ts             # GitHub Actions entry point + mode routing (~780 lines)
├── parser.ts            # MyST Markdown parser (282 lines)
├── diff-detector.ts     # Change detection (195 lines)
├── translator.ts        # Claude API - sync mode (305 lines)
├── reviewer.ts          # Claude API - review mode (~700 lines)
├── file-processor.ts    # Translation orchestration (739 lines)
├── heading-map.ts       # Heading-map system (246 lines)
├── language-config.ts   # Language-specific translation rules (102 lines)
├── inputs.ts            # Action inputs + validation (~200 lines)
└── types.ts             # TypeScript types (~250 lines)
```

### Module Responsibilities

**parser.ts**:
- **Stack-based recursive parsing** for all heading levels (##-######)
- Extract subsections at arbitrary depth
- Generate heading IDs from text
- Basic MyST validation

**diff-detector.ts**:
- Detect ADDED/MODIFIED/DELETED sections
- **Recursive comparison** including all nested subsections
- Position-based matching with ID fallback
- Preamble change detection

**translator.ts**:
- Claude API integration (Sonnet 4.5)
- UPDATE mode (incremental)
- NEW mode (full translation)
- Glossary support
- Language-specific prompt customization

**reviewer.ts** (v0.7.0):
- Claude API integration for review mode
- `TranslationReviewer` class for PR workflow
- `parseSourcePRNumber()` - Extract source PR # from translation PR body
- `getSourceDiff()` - Fetch English before/after from source PR
- `evaluateTranslation()` - Assess quality (accuracy, fluency, terminology, formatting)
- `evaluateDiff()` - Verify changes are in correct locations
- `generateReviewComment()` - Format markdown review
- `postReviewComment()` - Post/update comment on GitHub PR
- `identifyChangedSections()` - Detect what changed between source/target

**language-config.ts**:
- Language-specific translation rules
- Extensible configuration for multiple target languages
- Punctuation and typography rules per language
- Easy addition of new target languages

**file-processor.ts**:
- Orchestrate translation workflow
- Parse subsections from translated content
- Reconstruct documents with recursive structure
- **Preserve target headings** and subsections when translation doesn't return full structure

**heading-map.ts**:
- Extract map from frontmatter
- Update map with new translations
- Inject map back into frontmatter
- **Recursive subsection processing** at any depth

**inputs.ts**:
- `getMode()` - Get action mode (sync/review)
- `getInputs()` - Sync mode inputs with validation
- `getReviewInputs()` - Review mode inputs with validation
- `validatePREvent()` - Validate merged PR event (sync)
- `validateReviewPREvent()` - Validate PR event (review)

**index.ts**:
- GitHub Actions entry point
- **Mode routing**: `runSync()` or `runReview()`
- Detect changed files in merged PR (sync mode)
- Create translation PRs in target repo (sync mode)
- Evaluate and post reviews (review mode)
- Handle root-level files (`docs-folder: '.'`)

## Important Implementation Details

### Root-Level File Support

**GitHub Actions Quirk**: Converts `docs-folder: '.'` to `docs-folder: '/'`

**Handling**:
```typescript
if (docsFolder === '.' || docsFolder === '/') {
  docsFolder = '';
}
```

**Filtering root-level files**:
```typescript
if (docsFolder === '') {
  // Root: .md files NOT in subdirectories
  return file.endsWith('.md') && !file.includes('/');
}
```

### No AST Parsing

**Why**: The old block-based approach used `unified` and `remark`:
- Added 700kB to bundle
- Complex AST traversal
- Many dependencies

**Current**: Simple line-by-line parsing:
- No dependencies
- Fast (~1000 lines/ms)
- Easy to debug

### Error Handling

- Parser errors → Include in PR as comment
- Translation errors → Retry with exponential backoff
- Missing frontmatter → Create new frontmatter

## Testing Strategy

**Two Testing Approaches**:

### 1. Local Unit/Integration Tests
**Purpose**: Fast, comprehensive testing of core logic
**Location**: `src/__tests__/*.test.ts`
**Run**: `npm test`
**Coverage**: 266 tests across 12 files

**Test Files**:
- `parser.test.ts` - MyST parsing, frontmatter (15 tests)
- `parser-components.test.ts` - Document component parsing (5 tests)
- `diff-detector.test.ts` - Change detection (24 tests, includes 6 nested subsection tests)
- `file-processor.test.ts` - Section reconstruction (54 tests)
- `heading-map.test.ts` - Map updates (28 tests)
- `language-config.test.ts` - Language-specific config (15 tests)
- `integration.test.ts` - End-to-end (9 tests)
- `e2e-fixtures.test.ts` - End-to-end fixtures (1 test)
- `component-reconstruction.test.ts` - Component assembly (4 tests)
- `reviewer.test.ts` - Review mode (28 tests)

**Key Regression Tests** (v0.4.7):
- Nested subsection change detection (####, #####)
- Recursive section comparison
- Subsection duplication prevention
- Heading-map completeness
- Root-level file handling

**Review Mode Tests** (v0.7.0):
- Change detection (new/deleted/modified/renamed sections)
- Review comment formatting
- Input validation (sync vs review mode)
- Integration scenarios

### 2. GitHub Repository Tests
**Purpose**: Real-world validation with actual PRs and GitHub Actions
**Script**: `tool-test-action-on-github/test-action-on-github.sh`
**Repositories**: `QuantEcon/test-translation-sync` → `QuantEcon/test-translation-sync.zh-cn`
**Features**:
- 24 automated test scenarios
- Automated setup and reset
- TEST mode (no API calls)
- Cross-repo PR creation validation

**Test Scenarios** (24 total):
- New sections, modified sections, deleted sections
- Subsections at all nesting levels (##, ###, ####, #####, ######)
- Code cells, display math, special characters
- Preamble-only changes, section reordering
- Multi-file operations, TOC updates
- Document creation, deletion, renaming
- Deep nesting, empty sections

**See**: `docs/TEST-REPOSITORIES.md` and `tool-test-action-on-github/README.md` for complete list

## Companion Tools

The project includes two independent tools at the root level:

### 1. Bulk Translator (`tool-bulk-translator/`)

**Purpose**: One-time bulk translation of entire lecture series to bootstrap new language repositories

**Use Case**: Creating initial translation (e.g., `lecture-python.zh-cn` from `lecture-python`)

**Key Features**:
- One-lecture-at-a-time translation for quality
- Auto-generates heading-maps
- Preserves complete Jupyter Book structure
- Progress tracking and resume capability

**Location**: `tool-bulk-translator/` (standalone npm package)
**Documentation**: `tool-bulk-translator/README.md`

**When to Use**: Initial repository setup only. After bulk translation, use `action-translation` for incremental updates.

### 2. GitHub Action Test Tool (`tool-test-action-on-github/`)

**Purpose**: Real-world validation of action with actual GitHub repositories and PRs

**Location**: `tool-test-action-on-github/`
**Script**: `tool-test-action-on-github/test-action-on-github.sh`
**Documentation**: `tool-test-action-on-github/README.md`

**Features**:
- 24 automated test scenarios
- Real PR workflow testing
- TEST mode (no API costs)
- **Evaluation submodule** (`evaluate/`): Quality assessment with Opus 4.5

**Workflow**:
1. Run `./test-action-on-github.sh` to create test PRs
2. Run `cd evaluate && npm run evaluate` to assess quality
3. Reports saved to `reports/evaluation-<date>.md`

**When to Use**: Pre-release validation and regression testing

## Common Tasks

### Adding a New Test

1. Choose appropriate test file based on module
2. Follow existing test patterns
3. Use realistic fixtures (from `fixtures/` or inline)
4. Run `npm test` to verify

### Modifying Parser

**Remember**: 
- Line-by-line parsing (no AST)
- Subsections extracted recursively
- Generate IDs consistently

### Modifying Translation

**Remember**:
- Two modes: UPDATE and NEW
- Use glossary for key terms
- Preserve MyST syntax

### Modifying Reconstruction

**CRITICAL**:
- Use `contentWithoutSubsections` (not `content`)
- Append subsections from `section.subsections` array
- Test for duplication!

## Documentation

**Structure**:
```
docs/
├── INDEX.md              # Documentation hub
├── QUICKSTART.md         # Getting started
├── ARCHITECTURE.md       # System architecture
├── IMPLEMENTATION.md     # Technical implementation
├── PROJECT-DESIGN.md     # Design decisions
├── TESTING.md            # Testing guide
├── HEADING-MAPS.md       # Heading-map system
├── TEST-REPOSITORIES.md  # GitHub test setup guide
└── presentations/        # Marp slide deck
```

**Always Update**:
- Test counts when adding tests
- CHANGELOG.md for new features/fixes
- README.md for user-facing changes

**IMPORTANT - Documentation Guidelines**:
❌ **Never create standalone SUMMARY.md files for individual changes**
✅ **Always update CHANGELOG.md for version changes**
✅ **Update README.md for user-facing changes**
✅ **Clean up backup files** - Remove any `.backup` or `-old` files before committing

## What NOT to Do

❌ **Don't use AST parsing** - Keep line-by-line approach
❌ **Don't use block-based approach** - Sections, not blocks
❌ **Don't append subsections from content** - Use array to prevent duplication
❌ **Don't match sections by content** - Use position/ID
❌ **Don't translate entire documents** - Only changed sections

## Helpful Context

### Why Section-Based?

**Problems with block-based**:
- Can't match paragraphs across languages
- Lost context (isolated blocks)
- Complex logic, error-prone
- Fragile (breaks with structure differences)

**Section-based solutions**:
- Position matching (language-independent)
- Full context (Claude sees entire sections)
- Simple logic (add/update/delete sections)
- Robust (works with structural differences)

### Why Heading-Maps?

**Problem**:
```
English: "## Introduction" → ID: "introduction"
Chinese: "## 介绍" → ID: "介绍"  (different!)
```

Can't match by ID alone.

**Solution**: Heading-map bridges the gap:
```yaml
heading-map:
  introduction: "介绍"
```

Now we can match!

### Why Parse Subsections?

**Problem**: Translator returns full content including subsections, but we need to:
1. Track subsections separately
2. Include them in heading-map
3. Prevent duplication in output

**Solution**: Parse translated content to extract subsections, strip them from content, store in array.

## Quick Reference

**Local Testing**:
- `npm test` - Run all unit tests
- `npm test -- parser.test.ts` - Run specific test file
- `npm test -- --watch` - Watch mode for development
- `npm test -- --coverage` - Generate coverage report

**GitHub Testing**:
- `./tool-test-action-on-github/test-action-on-github.sh` - Run all GitHub test scenarios
- Uses TEST mode (no Claude API calls)
- Automatically resets test repositories
- See `docs/TEST-REPOSITORIES.md` for details

**Build**:
- `npm run build` - Compile TypeScript
- `npm run package` - Bundle for distribution

**GitHub CLI Usage**:
When using `gh` commands, write output to `/tmp/` directory to avoid interactive prompts:
```bash
# Good: Write to file for reading
gh pr view 123 > /tmp/pr-details.txt
cat /tmp/pr-details.txt

# Avoid: Direct reading (may have interactive prompts)
gh pr view 123
```

**Key files to check when modifying**:
- Subsection handling → `file-processor.ts:parseTranslatedSubsections`
- Translation → `translator.ts:translateSection`
- Review → `reviewer.ts:TranslationReviewer`
- Parsing → `parser.ts:parseSections`
- Change detection → `diff-detector.ts:detectSectionChanges`
- Heading-maps → `heading-map.ts:updateHeadingMap`

---

**Last Updated**: December 2025

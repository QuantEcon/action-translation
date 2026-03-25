# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **Heading-map MyST role pollution**: Headings with MyST inline roles like `{index}\`Pandas <single: Pandas>\`` were stored verbatim as heading-map keys/values instead of the clean display text (`Pandas`). Added `MystParser.stripMystRoles()` static method using global regex replacement to handle single roles, multiple roles, and mixed role+text headings. Applied across all heading-map paths: parser title extraction, file-processor heading-map updates, `cleanHeading` in `updateHeadingMap`, and `lookupTargetHeading`. Covers `#` titles and `##`+ section/subsection headings. Affects 7 lectures in lecture-python-programming that use `{index}` roles in titles.

### Added
- **19 tests** for MyST role stripping — unit tests for `stripMystRoles` (including mixed role+text headings), title extraction integration, and heading-map operations with role syntax (935 → 954 total)

## [0.12.4] - 2026-03-25

### Added
- **CJK–MyST spacing rule for zh-cn**: New language-config rule instructs Claude to insert a space between Chinese characters and inline MyST directives (`{doc}`, `{ref}`, etc.) or Markdown links, preventing rendering failures (e.g. `请参阅 {doc}` not `请参阅{doc}`)
- **MyST target-label blank-line cleanup**: `reconstructFromComponents` now strips blank lines between MyST target labels (`(label)=`) and headings in post-processing, so targets always attach to their heading correctly
- **1 test** for target-label blank-line removal (934 → 935 total)

## [0.12.3] - 2026-03-24

### Fixed
- **Scope translation PRs to source PR's actual changes**: When a section is unchanged in the source diff but missing from the target (because an earlier translation PR hasn't merged yet), it is now skipped instead of re-translated as new. This prevents each subsequent translation PR from accumulating unmerged content from earlier PRs. Git's 3-way merge combines the PRs when they're merged independently. Recovery via `/translate-resync` if an earlier PR is abandoned.
- **Heading-map corruption when sections are skipped**: Introduced `includedSourceSections` array that stays index-aligned with `resultSections` so `updateHeadingMap()` pairs sections correctly even when some are skipped. Previously, skipping could cause source section A to be mapped to section B's translated heading.
- **Markdown injection in PR body skipped-section headings**: Skipped section headings are now wrapped in backticks (with inner backtick escaping) instead of double quotes to neutralize Markdown syntax.

### Added
- **Skipped sections notice in translation PRs**: When sections are skipped (pending earlier translation PR), the PR body includes a `⚠️ Sections Pending Earlier Translation PR` notice with file/heading list and `/translate-resync` recovery instructions
- **`onSkippedSection` callback in `processSectionBased`**: Optional callback parameter for callers to collect skipped section headings
- **`skippedSections` in `SyncProcessingResult`**: Tracks skipped sections per file through the sync pipeline
- **4 tests**: 1 for superset PR prevention, 3 for `buildPrBody` skipped sections rendering (930 → 934 total)

## [0.12.2] - 2026-03-24

### Fixed
- **Position fallback guard for mismatched section counts**: `findTargetSectionByHeadingMap` no longer uses position-based fallback when source and target have different section counts. Previously, when a new section was added to source but the translation PR hadn't been merged yet, the position fallback would grab the wrong target section (shifted positions), producing incorrect heading-map values (e.g. `Type hints: 装饰器与描述符`). Now unmatched sections fall through to `translateNewSection` instead.
- **Resync uses PR merge commit SHA**: `\translate-resync` now uses the PR's `merge_commit_sha` instead of `github.context.sha` (which points to HEAD of main for `issue_comment` events). Previously, `oldContent` and `newContent` could both reference the current main tip, causing the diff detector to miss the PR's actual changes. Now `oldContent = merge_commit^` and `newContent = merge_commit` correctly reflect the PR's changes.

### Added
- **3 tests for position fallback guard**: Covers source-has-more-sections, source-has-fewer-sections, and equal-counts-still-works scenarios (927 → 930 total)

## [0.12.1] - 2026-03-24

### Fixed
- **Duplicate preamble regression**: Fixed intro extraction in `parseDocumentComponents` that included pre-title content and title in the intro when documents had content before `# title` (e.g. `(label)=` anchors, `{raw}` blocks). This caused duplicated preamble in reconstructed translations. Now extracts intro by slicing lines from `titleEndIndex` to first `##` section. (regression from v0.11.2)
- **Case-insensitive heading-map lookup**: `lookupTargetHeading` now falls back to case-insensitive key matching when exact lookup fails. Prevents heading case changes (e.g. "Iterables and Iterators" → "Iterables and iterators") from breaking section matching and causing full re-translations.
- **Position-based section fallback**: `findTargetSectionByHeadingMap` Strategy 3 (position-based matching) now activates whenever heading-map and ID lookups both fail, not only when the heading-map is empty. Provides defense-in-depth for translated-heading ID mismatches.
- **Label retry on PR creation**: Label application now retries up to 3 times with 2-second delays to handle GitHub API node propagation delays on newly-created PRs. Previously, a single-attempt failure caused the review workflow to skip (no `action-translation` label).
- **Review response parsing with retry**: `evaluateTranslation` and `evaluateDiff` now use a shared `callWithRetry` method with exponential backoff (3 attempts). JSON extraction uses multiple strategies (direct parse, markdown code block extraction, greedy regex fallback). Previously, a single malformed LLM response crashed the entire review workflow.

### Added
- **Test fixture #25**: Added pre-title content scenario (`25-pre-title-content-lecture`) to E2E test suite for `test-translation-sync`
- **Test fixture #26**: Added heading case change scenario (`26-heading-case-change-lecture`) — title-case → sentence-case headings to validate case-insensitive heading-map lookup
- **10 tests for `parseJsonResponse`**: Covers pure JSON, markdown code blocks, multiline, nested objects, leading/trailing text, and error cases (924 → 927 total, excluding skipped)

## [0.12.0] - 2026-03-23

### Added
- **`\translate-resync` comment trigger**: Comment `\translate-resync` on a merged PR to re-trigger translation sync for that PR's files. Supports recovery from transient failures without re-opening PRs. Workflows need `issue_comment` trigger added.
- **Success comments on PRs**: After a successful sync, the action posts a comment on the source PR confirming completion with the target repo, translation PR link, and list of synced files
- **Failure issue creation**: When sync fails, the action automatically opens a GitHub Issue with error details linked to the source PR, with instructions to use `\translate-resync` for recovery
- **6 new tests** for `\translate-resync` comment validation including authorization check (903 → 909 total)

### Fixed
- **Label-adding race condition**: Wrapped `addLabels` call in try/catch so that a GitHub API race condition when adding labels to a newly-created PR no longer fails the entire sync. The PR is already created at that point; label failure is now a non-fatal warning (fixes fa sync failure on `lecture-python-programming` PR #491)

## [0.11.2] - 2026-03-23

### Fixed
- **Pre-title content handling**: Parser now scans past MyST cross-reference targets (`(label)=`) and directive blocks (e.g. `{raw} jupyter`) that appear before the `# title` heading, fixing `Expected # title heading` errors for files like `lectures/python_advanced_features.md` in `lecture-python-programming`

### Added
- **`preTitle` field** in `DocumentComponents`: New field captures content between frontmatter and `# title` (cross-ref targets, raw blocks) and preserves it during reconstruction
- **3 new tests** for pre-title content parsing (900 → 903 total)

## [0.11.1] - 2026-03-20

### Fixed
- **`--write-state` model preservation**: Bootstrap now reads existing state files and preserves the `model` field if it was set by a prior command (e.g. `forward`), instead of always overwriting with `unknown` (PR #38)
- **Stale model names in tests**: Updated mock model references from `claude-sonnet-4.5-20241022` to `claude-sonnet-4-6` for consistency with production defaults

### Added
- **2 new tests** for `--write-state` model preservation (898 → 900 total)

## [0.11.0] - 2026-03-20

### Added
- **`--check-sync` flag** for `translate status`: LLM-based content sync check using forward triage, reports per-file `IDENTICAL`/`CONTENT_CHANGES`/`TARGET_HAS_ADDITIONS`/`I18N_ONLY` verdicts (PR #37, closes #35)
- **`--force` flag** for `translate status --write-state`: Override the sync-date safety check that blocks writing state when source has newer commits
- **`TARGET_HAS_ADDITIONS` verdict** for forward triage: 4th category distinguishing target-side additions from content changes or i18n-only differences (PR #37)
- **16 new tests** for write-state safeguard, check-sync, doctor section-less fix, TARGET_HAS_ADDITIONS parsing (882 → 898 total)

### Fixed
- **Doctor section-less fix**: `translate doctor` no longer warns about missing heading-maps for files with zero `##` sections (e.g. `index.md`, `intro.md`) (PR #37, closes #36)
- **`--write-state` safeguard**: Blocks `--write-state` when source has newer commits than target, preventing silent divergence. Use `--force` to override.

## [0.10.0] - 2026-03-20

### Added
- **`--skip-existing` flag** for `translate init`: Skip lectures that already have `.translate/state/` entries, enabling idempotent re-runs after partial failures (PR #34)
- **`-j, --parallel <n>` flag** for `translate init`, `backward`, `forward`: Concurrent processing with configurable worker count (PR #33)
- **`filterSkipExisting()` helper** (`src/cli/commands/init.ts`): Exported pure function for skip-existing filtering logic
- **`skippedCount` field** in `TranslationStats`: Separate tracking for skipped vs translated files in init reports
- **3 new tests** for `filterSkipExisting` (879 → 882 total)

### Changed
- **Init reporting**: Skipped lectures no longer inflate "Successfully Translated" count or distort average time per lecture

## [0.9.0] - 2026-03-19

Full CLI tool suite, `.translate/` metadata system, GitHub Action state integration, and comprehensive E2E testing across 24 scenarios with 48 target PRs.

### Added

#### Phase 6 — `.translate/` Metadata
- **`translate-state.ts` module** (`src/cli/translate-state.ts`): read/write `.translate/config.yml` and per-file state YAML
  - Pure serializers (`serializeFileState`, `serializeConfig`, `stateFileRelativePath`, `configRelativePath`) shared between CLI and Action
- **`setup` command** (`src/cli/commands/setup.ts`): scaffold target translation repositories
  - Generates GitHub Actions workflow, `.translate/config.yml`, README, `.gitignore`
  - Configurable source repo, target language, docs folder, branch
- **GitHub Action integration**: state files included in translation PRs alongside translated content
  - `StateGenerationConfig` interface in `sync-orchestrator.ts` (opt-in)
  - After translating each file, generates `.translate/state/<file>.yml` and adds to `translatedFiles`
  - `index.ts` fetches existing state file SHAs from target repo for Octokit updates
  - Renamed/removed files clean up their corresponding state files
  - Docs-folder prefix stripped so CLI and Action produce identical state paths
- **`status` command**: uses `source-sha` for exact staleness detection (replaces git date heuristic)
  - `--write-state` flag: bootstrap state for existing projects
- **`backward` command**: skips unchanged files via `source-sha` comparison
- **`forward` command**: writes state after resync

#### Phase 5 — CLI Rename + Init Command
- **CLI renamed**: `resync` → `translate` (`package.json` bin entry, `src/cli/index.ts`)
  - All commands: `npx translate backward`, `npx translate forward`, `npx translate status`, etc.
- **Init command** (`src/cli/commands/init.ts`): Bulk-translate an entire project from a local source repo
  - `npx translate init -s <source> -t <target> --target-language zh-cn`
  - 7-phase pipeline: glossary → TOC parse → setup → copy non-md → translate → heading-maps → report
  - `--dry-run`, `--resume-from`, `-f, --file`, `--batch-delay`, `--glossary`, `--localize` flags
  - Reads `_toc.yml` for lecture discovery (supports `chapters`, `parts`, `root`)
  - Produces `TRANSLATION-REPORT.md` with stats, config, and failure details
  - Retry logic: 3 attempts with exponential backoff, skips permanent failures
  - Progress bar for bulk translation
- **Localization rules** (`src/localization-rules.ts`): Code-cell localization system for `init`
  - `code-comments`: translate Python comments in code cells
  - `figure-labels`: translate matplotlib plot labels, axis titles, legend entries
  - `i18n-font-config`: inject CJK font configuration into first matplotlib cell (`zh-cn` only)
  - All rules ON by default; disable with `--localize none`

#### Phase 4 — Refinement
- **CLI smoke tests**: 11 tests invoking the CLI binary as an external process
- **Prompt snapshot tests**: 5 snapshots across 3 test suites
- **Unicode heading ID support** (`src/parser.ts`, `src/reviewer.ts`): `\p{L}\p{N}` Unicode property escapes for CJK, Arabic, Japanese headings
- **`gh` CLI pre-flight check**: `checkGhAvailable()` with injectable `AuthCheckRunner`
- **Malformed YAML handling**: `parseTocLectures()` catches YAML parse errors with descriptive messages

#### Phase 3b — Forward Resync Command
- **Forward command** (`src/cli/commands/forward.ts`): Resync TARGET translations to match current SOURCE
  - `translate forward -f cobweb.md` — single file resync
  - `translate forward` — bulk resync of all OUTDATED files (via status)
  - `--github <owner/repo>` flag: creates one PR per file in TARGET repo
  - Pipeline: triage → whole-file RESYNC → output
- **Forward triage** (`src/cli/forward-triage.ts`): LLM content-vs-i18n filter (~$0.01/file)
- **Forward PR creator** (`src/cli/forward-pr-creator.ts`): Git ops + PR creation via `gh` CLI
- **Whole-file RESYNC translation** (`src/translator.ts`): New `translateDocumentResync()` method
  - Sends entire SOURCE + TARGET + glossary in one call (~$0.12/file)
  - 2-3× cheaper than section-by-section (glossary sent once, not per section)
- **Section RESYNC mode** (`src/translator.ts`): `translateSectionResync()` (retained for SYNC mode)

#### Phase 3a — Review Command
- **Review command** (`src/cli/commands/review.ts`): Interactive human review of backward suggestions
  - `translate review <report-dir>` with `--dry-run`, `--repo`, `--min-confidence` flags
- **Chalk-styled card formatter** (`src/cli/review-formatter.ts`): Category badges, confidence tiers, Before/After display
- **Ink interactive review session** (`src/cli/components/ReviewSession.tsx`): Accept/Skip/Reject keypresses
- **GitHub Issue generator** (`src/cli/issue-generator.ts`): `[filename § section] summary` titles, structured bodies
- **GitHub Issue creator** (`src/cli/issue-creator.ts`): `gh issue create` with injectable `GhRunner`

#### Phase 2 — Backward Analysis + Status
- **Status command** (`src/cli/commands/status.ts`): Fast, free diagnostic — no LLM calls
  - Per-file sync status: `ALIGNED`, `OUTDATED`, `SOURCE_AHEAD`, `TARGET_AHEAD`, `MISSING_HEADINGMAP`, `SOURCE_ONLY`, `TARGET_ONLY`
  - Console table and JSON output
- **Bulk backward** (`src/cli/commands/backward.ts`): Full-repo backward analysis
  - Two-stage pipeline: Stage 1 triage → Stage 2 per-section evaluation
  - Parallel processing (5 concurrent files), checkpointing, `--resume` flag
  - Per-file reports + aggregate `_summary.md` / `_summary.json`
- **Backward report JSON schema** (`src/cli/schema.ts`): Formal Zod schemas, `loadResyncDirectory()`, `filterActionableSuggestions()`
- **Interleaved commit timeline** (`git-metadata.ts`): SOURCE/TARGET commit history for temporal context in prompts

#### Tests
- **879 tests** (39 suites, 5 snapshots) — up from 316 in v0.8.0

### Changed
- **ESM migration**: Entire codebase now compiles to ESM (`"module": "node16"`)
- **Action bundle moved to `dist-action/`**: Uses esbuild (CJS format) instead of ncc
- **`@anthropic-ai/sdk`** updated from `0.27.0` to `0.78.0`
- **Strengthened i18n code preservation** in all translation prompts (UPDATE, section RESYNC, whole-file RESYNC)
- **New dependencies**: `ink@^4`, `react@^18`, `commander@^14`, `zod`, `esbuild`

### Removed
- **`--estimate` flag** removed from `backward` and `forward` commands (replaced by `--dry-run`)
- **`tool-bulk-translator/`** directory removed — functionality superseded by `translate init`

## [0.8.0] - 2026-02-18

### Added
- **Sync Orchestrator**: Extracted `SyncOrchestrator` class from `index.ts` into new `src/sync-orchestrator.ts` module
  - `Logger` interface decouples processing from `@actions/core` for future CLI reuse
  - `classifyChangedFiles()` categorises files (markdown, toc, renamed, removed)
  - `loadGlossary()` utility for loading target-language glossary
  - `FileToSync` and `SyncProcessingResult` interfaces
- **PR Creator**: Extracted PR creation logic into new `src/pr-creator.ts` module
  - `createTranslationPR()` creates/updates PRs in target repo
  - `buildPrBody()`, `buildPrTitle()`, `buildLabelSet()` pure utility functions
  - `PrCreatorConfig` and `SourcePrInfo` interfaces
- **Retry Logic**: Added exponential backoff retry to `translator.ts`
  - Retries `RateLimitError`, `APIConnectionError`, and 5xx `APIError`
  - Max 3 attempts with 1s/2s/4s delays
  - No retry for permanent failures (`AuthenticationError`, `BadRequestError`)
  - `RETRY_CONFIG` export for testing
- **New Tests**: 133 new tests (183 → 316 total, 15 suites)
  - `inputs.test.ts` (55 tests) — mode, repo format, language, model, PR event validation
  - `translator.test.ts` (28 tests) — token estimation, glossary formatting, error handling
  - `sync-orchestrator.test.ts` (26 tests)
  - `pr-creator.test.ts` (12 tests)
  - `translator-retry.test.ts` (12 tests)

### Changed
- **`index.ts`**: Rewritten from ~766 to ~447 lines — delegates to `SyncOrchestrator` and `createTranslationPR()`

### Removed
- **Deprecated Methods**: Removed 3 dead methods from `file-processor.ts`
  - `findSourceSectionIndex()` (always returned -1)
  - `findTargetSectionIndex()` (deprecated)
  - `findMatchingSectionIndex()` (deprecated)

## [0.7.0] - 2025-12-05

### Added
- **Repository Rename**: Renamed from `action-translation-sync` to `action-translation`
  - Cleaner naming that reflects multi-mode functionality
  - GitHub auto-redirects old URLs
- **Review Mode**: New AI-powered translation quality assessment
  - `mode` input is now **required** (`sync` or `review`)
  - `source-repo` input to specify source repository for English content
  - `max-suggestions` input to control number of suggestions (default: 5)
  - Posts detailed review comments on translation PRs
  - Evaluates translation quality (accuracy, fluency, terminology, formatting)
  - Evaluates diff quality (scope, position, structure, heading-map)
  - Returns verdict: PASS, WARN, or FAIL
  - New outputs: `review-verdict`, `translation-score`, `diff-score`
- **New Module**: `src/reviewer.ts` (~700 lines)
  - `TranslationReviewer` class for PR review workflow
  - `identifyChangedSections()` for change detection
  - Parses source PR reference from translation PR body for accurate diff comparison
  - Fetches actual English before/after from source PR (same approach as evaluator tool)
  - Adapted from `tool-test-action-on-github/evaluate/` for action context
- **New Test Suite**: `src/__tests__/reviewer.test.ts` (28 tests)
  - Helper function tests
  - Change detection tests (new/deleted/modified/renamed documents)
  - Review formatting tests
  - Integration scenarios with real-world content
- **Persian (Farsi) Glossary**: Complete Persian glossary with 357 terms
  - Economic terms (~160): تعادل, تولید ناخالص داخلی, سیاست مالی
  - Mathematical terms (~100): ماتریس, بردار ویژه, همگرایی
  - Statistical terms (~35): توزیع نرمال, رگرسیون, واریانس
  - Economist names (~45): رابرت سولو, میلتون فریدمن
- **Persian (Farsi) Language Support**: Added full Persian language configuration
  - Persian (`fa`) language config with RTL punctuation rules
  - Language-specific prompt customization (formal/academic style)
  - Optimized token expansion factor (1.8x) for verbose RTL translations
- **Smart Token Management**: Hybrid pre-flight validation approach
  - Pre-flight size checks before translation (fail fast for oversized docs)
  - Always use API max tokens (32K) for translatable documents
  - Language-aware output token estimation (Persian: 1.8x, CJK: 1.3x, default: 1.5x)
  - Clear error messages for documents exceeding API limits
- **Incomplete Document Detection**: Validates translation completeness
  - Marker-based detection of truncated translations
  - Directive block balance validation in prompts

### Changed
- **Action Name**: Changed from "Translation Sync" to "Translation Action"
- **Package Name**: Changed from `action-translation-sync` to `action-translation`
- **Input Requirements**: `target-repo` and `target-language` now only required for sync mode
- **Test Count**: Increased from 155 to 183 tests
- **Bulk Translator Improvements**:
  - Always fetch `_toc.yml` from GitHub (consistent behavior in all modes)
  - Use `parseSections()` for heading-map generation
  - Updated cost estimation to be model-aware (Sonnet/Opus/Haiku pricing)
- **Translation Prompt Enhancements**:
  - Added directive block balancing rules (exercise-start/end, solution-start/end)
  - More explicit instructions for complete document translation
  - Language-specific expansion factors for better token estimates

### Fixed
- **Token Limit Issues**: Increased max_tokens from 8K to 32K; improved Persian token estimation (1.6x → 1.8x)

### Removed
- **workflow_dispatch Support**: Removed `workflow_dispatch` trigger from sync mode
  - Use `test-translation` label on PRs for manual testing instead
  - This ensures every translation PR has source PR metadata for accurate review
  - Simplifies architecture: `prNumber` is now always available (never null)

## [0.6.3] - 2025-12-04

### Fixed
- **Test Data Syntax Errors**: Fixed 2 markdown syntax bugs in test fixtures
  - `19-multi-file-lecture.md`: Fixed malformed heading `####Applications` → `#### Applications`
  - `23-special-chars-lecture.md`: Fixed mixed fence markers `$$...``` ` → `$$...$$`
  - These were the exact errors v0.6.2's validation was designed to prevent!

### Changed
- **PR Labels Default**: Simplified from `translation-sync,automated` to `action-translation-sync,automated`
  - Removed redundant `translation-sync` label in favor of more specific `action-translation-sync`
  - Cleaned up hardcoded label duplication in index.ts
  - Labels now sourced solely from `pr-labels` input + source PR labels

## [0.6.2] - 2025-12-04

### Added
- **Enhanced Fence Marker Validation**: Translator now explicitly prevents mixing fence markers
  - Prevents mixing `$$` with ` ``` ` in math blocks (e.g., `$$...````)
  - Enforces consistency: use `$$...$$` OR ` ```{math}...``` `, never mixed
  - Added to all translation modes (UPDATE, NEW, FULL DOCUMENT)
  - Catches common syntax errors before they reach the evaluator
- **Improved Target PR Metadata**: Translation PRs now have better titles and labels
  - Title format: `🌐 [translation-sync] <source PR title>` (mirrors source PR)
  - Automatic labels: `automated`, `action-translation-sync`
  - Copies labels from source PR (except `test-translation`)
  - Makes translation PRs easier to identify and manage
- **Evaluator Model Selection**: New `--model` flag to choose evaluation model
  - Default: `claude-opus-4-5-20251101` (highest quality, $0.30/PR)
  - Alternative: `claude-sonnet-4-5-20250929` (faster, cheaper $0.06/PR)
  - Enables cost/quality comparison for evaluation tasks

### Fixed
- **Evaluator: Renamed File Handling**: Fixed evaluation of renamed files
  - Now fetches "before" content from `previousFilename` field
  - Detects pure renames (no content changes) and marks appropriately
  - Prevents showing all sections as "changed" in rename-only PRs
- **Evaluator: Issue Normalization**: Improved parsing of Claude responses
  - Handles object-style issues with `description`, `location`, `suggestion` fields
  - Better fallback to JSON.stringify for unknown structures
  - Filters out empty/malformed issue strings

### Removed
- **Evaluator: `--dry-run` Flag**: Removed redundant flag
  - Use `npm run evaluate` to save reports (default behavior)
  - Use `npm run evaluate:post` to post reviews to PRs
  - Simpler CLI with clearer intent

## [0.6.1] - 2025-12-04

### Added
- **Markdown Syntax Validation in Prompts**: LLM-based syntax checking
  - Translator prompts (UPDATE, NEW, FULL DOCUMENT) now include explicit syntax rules
  - Evaluator includes "Syntax" as 5th evaluation criterion
  - `syntaxErrors` array in evaluation response for critical markdown errors
  - Syntax errors displayed prominently in PR comments with 🔴 markers
  - Rules: space after `#` in headings, matching code/math delimiters
- **Configurable Max Suggestions**: Evaluator now supports `--max-suggestions` flag
  - Default increased from ~2 to 5 suggestions
  - Prompt explicitly allows 0 suggestions for excellent translations
- **Changed Sections Detection**: Evaluator focuses suggestions on modified content only
  - Computes changed sections by comparing before/after content
  - Supports preamble changes, additions, modifications, deletions
  - Deep nesting support (######), empty sections, special characters

### Fixed  
- **Evaluator**: Changed sections list no longer includes non-existent sections
- **File Rename Handling**: Renamed files now properly handled in translation sync
  - Previously: renamed files were added as new files, leaving orphaned translations
  - Now: existing translation is transferred to new filename, old file is deleted
  - Uses GitHub's `previous_filename` field for rename detection
  - Preserves heading-map and existing translations when files are renamed

### Changed
- **Glossary**: Added 2 game theory terms (357 total, was 355)
  - "folk theorem" → "无名氏定理"
  - "grim trigger strategy" → "冷酷策略"

### Documentation
- Created myst-lint project proposal: QuantEcon/meta#268

## [0.6.0] - 2025-12-03

### Added
- **Opus 4.5 Evaluation Tool**: Quality assessment framework for translations
  - Located in `tool-test-action-on-github/evaluate/`
  - Uses Claude Opus 4.5 for translation quality evaluation
  - Evaluates: Translation quality, diff accuracy, glossary compliance, heading-map handling
  - Posts review comments on GitHub PRs with structured feedback
  - Includes all 355 glossary terms for validation
  - Supports `--list-only` flag for dry-run mode
- **Input Validation**: Language code validation against configured languages in `LANGUAGE_CONFIGS`
  - New functions: `getSupportedLanguages()`, `isLanguageSupported()`, `validateLanguageCode()`
  - Clear error messages with list of supported languages
  - Guidance to add new languages via `LANGUAGE_CONFIGS`
- **Model Validation**: Claude model name validation with warning for unrecognized patterns
  - Validates against known Claude model patterns (sonnet, opus, haiku variants)
  - Warning only (doesn't block) to allow new models
- **Improved API Error Handling**: Specific error messages for Anthropic API failures
  - Authentication errors: Guides to check API key secret
  - Rate limit errors: Informs about automatic retry
  - Connection errors: Suggests checking network
  - Bad request errors: Indicates prompt/content issues
- **8 New Tests**: Validation function test coverage

### Changed
- **Dependencies**: Removed 10 unused AST-related packages (unified, remark-*, mdast-*, diff)
  - Reduced total packages from 527 to 439
  - Removed ~700KB of unnecessary dependencies
  - Packages removed: `unified`, `remark-parse`, `remark-stringify`, `remark-directive`, `remark-math`, `remark-gfm`, `mdast-util-to-string`, `unist-util-visit`, `diff`, `@types/diff`
- **LANGUAGE_CONFIGS**: Now exported for external access and validation

### Fixed
- **translator.ts**: Fixed Claude model default mismatch
  - Changed default from `claude-sonnet-4.5-20241022` to `claude-sonnet-4-5-20250929`
  - Now matches the default specified in `action.yml`

### Documentation
- **TESTING.md**: Updated test count from 125 to 147, expanded test file breakdown
- **ARCHITECTURE.md**: Updated line counts for all 7 modules to reflect current codebase
- **INDEX.md**: Replaced corrupted file with clean version (was severely corrupted with merged/duplicated lines)
- **STATUS-REPORT.md**: Removed references to non-existent TODO.md, updated to use GitHub Issues
- **copilot-instructions.md**: Updated version, line counts, and test coverage metrics

## [0.5.1] - 2025-11-06

### Added
- **Language Configuration System**: New `language-config.ts` module for extensible language-specific translation rules
- Chinese-specific punctuation rules (full-width characters)
- Support for easy addition of new target languages (Japanese, Spanish, etc.)

### Changed
- Translation prompts now automatically include language-specific rules
- Case-insensitive language code lookups

### Documentation
- Added GPT5 comprehensive evaluation results (21 scenarios, 100% pass rate)

## [0.5.0] - 2025-11-06

### Added
- **TOC File Support**: `_toc.yml` files are now automatically synced to target repos
- **File Deletion Handling**: Deleted files are now removed from target repos
- 8 new test scenarios covering document lifecycle operations

### Changed
- Enhanced PR descriptions to include file deletions

## [0.4.10] - 2025-10-31

### Fixed
- Root-level file handling for `docs-folder: '.'` configuration
- GitHub Actions quirk that converts `.` to `/` in inputs

## [0.4.7] - 2025-10-24

### Added
- Full recursive subsection support for arbitrary nesting depth (####, #####, ######)
- Recursive subsection change detection in diff-detector
- Subsection integration into heading-maps

### Fixed
- Subsection duplication prevention in document reconstruction

## [0.4.6] - 2025-10-23

### Added
- Heading-map system for language-independent section matching
- Automatic heading-map population on first translation

## [0.4.5] - 2025-10-22

### Changed
- Improved preamble change detection
- Enhanced section position matching

## [0.4.4] - 2025-10-21

### Added
- UPDATE mode for incremental translation of modified sections
- Glossary support for consistent terminology

## [0.4.3] - 2025-10-20

### Added
- NEW mode for full section translation
- Basic MyST Markdown parsing

## [0.3.0] - 2025-10-15

### Changed
- **Architecture Overhaul**: Migrated from block-based to section-based translation
- Removed AST parsing in favor of simple line-by-line approach

## [0.2.2] - 2025-10-10

### Fixed
- Various bug fixes and stability improvements

## [0.1.2] - 2025-10-05

### Fixed
- Initial bug fixes

## [0.1.1] - 2025-10-03

### Fixed
- Minor fixes after initial release

## [0.1.0] - 2025-10-01

### Added
- Initial release
- Basic translation workflow using Claude AI
- GitHub Actions integration
- Support for MyST Markdown documents

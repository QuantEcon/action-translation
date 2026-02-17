# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

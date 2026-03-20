# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **`--skip-existing` flag** for `translate init`: Skip lectures that already have `.translate/state/` entries, enabling idempotent re-runs after partial failures (PR #34)
- **`-j, --parallel <n>` flag** for `translate init`, `backward`, `forward`: Concurrent processing with configurable worker count (PR #33)
- **`filterSkipExisting()` helper** (`src/cli/commands/init.ts`): Exported pure function for skip-existing filtering logic
- **`skippedCount` field** in `TranslationStats`: Separate tracking for skipped vs translated files in init reports
- **3 new tests** for `filterSkipExisting` (879 → 882 total)

### Changed
- **Init reporting**: Skipped lectures no longer inflate "Successfully Translated" count or distort average time per lecture

### Added (Phase 6 — `.translate/` Metadata)
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
- **41 new tests** (783 → 824 total, 37 suites, 5 snapshots)

### Added (Phase 4 — Refinement)
- **CLI smoke tests** (`src/cli/__tests__/cli-smoke.test.ts`): 11 tests invoking the CLI binary as an external process
  - `--version`, `--help`, all 5 commands (status, init, backward, forward, review)
  - `--dry-run` end-to-end, error exit codes
- **Prompt snapshot tests**: 5 snapshots across 3 test suites
  - `document-comparator.test.ts`: 2 triage prompt snapshots
  - `backward-evaluator.test.ts`: 2 evaluation prompt snapshots
  - `forward-triage.test.ts`: 1 forward triage prompt snapshot
- **Unicode heading ID support** (`src/parser.ts`, `src/reviewer.ts`)
  - `generateHeadingId()` now uses `\p{L}\p{N}` Unicode property escapes instead of `\w`
  - Correctly generates IDs for Chinese (`## 介绍` → `介绍`), Arabic, Japanese, mixed-script headings
  - Same fix applied to `headingToId()` in `reviewer.ts` (replaced hardcoded CJK/Arabic ranges)
- **`gh` CLI pre-flight check** (`src/cli/issue-creator.ts`): `checkGhAvailable()` with injectable `AuthCheckRunner`
  - Fails fast with actionable error messages for "not installed" (ENOENT) and "not authenticated"
  - Wired into `review` command (before interactive session) and `forward --github` path
- **Malformed YAML handling** (`src/cli/commands/init.ts`): `parseTocLectures()` now catches YAML parse errors and empty files with descriptive messages
- **22 new tests** (761 → 783 total, 34 → 35 suites, 5 snapshots)

### Changed (Phase 4)
- **`@anthropic-ai/sdk`** updated from `0.27.0` to `0.78.0` — build clean, all tests pass
- **`.gitignore`**: removed `*.test.ts.snap` so prompt snapshots are tracked in git (CI regression detection)

### Removed (Phase 5b — Cleanup)
- **`tool-bulk-translator/`** directory removed — functionality superseded by `translate init` (preserved in git history)
- **`.gitignore`**: removed stale `tool-bulk-translator/dist/` entry

### Added (Phase 5 — CLI Rename + Init Command)
- **CLI renamed**: `resync` → `translate` (`package.json` bin entry, `src/cli/index.ts`)
  - All commands: `npx translate backward`, `npx translate forward`, `npx translate status`, etc.
- **Init command** (`src/cli/commands/init.ts`): Bulk-translate an entire project from a local source repo
  - `npx translate init -s <source> -t <target> --target-language zh-cn`
  - 7-phase pipeline: glossary → TOC parse → setup → copy non-md → translate → heading-maps → report
  - `--dry-run` flag: preview lectures and non-md files without API calls
  - `--resume-from <file>` flag: resume from a specific lecture (partial match supported)
  - `-f, --file <file>` flag: translate a single lecture file (e.g., `cobweb.md`)
  - `--batch-delay <ms>` flag: rate limiting between lectures (default: 1000ms)
  - `--glossary <path>` flag: explicit glossary JSON path (default: `glossary/<lang>.json`)
  - `--localize <rules>` flag: control code-cell localization (default: `code-comments,figure-labels,i18n-font-config`)
  - Reads `_toc.yml` for lecture discovery (supports `chapters`, `parts`, `root`)
  - Copies all non-markdown files (images, config, data) preserving directory structure
  - Generates heading-maps via position-based section matching
  - Produces `TRANSLATION-REPORT.md` with stats, config, and failure details
  - Retry logic: 3 attempts with exponential backoff, skips permanent failures
  - Progress bar for bulk translation
- **Localization rules** (`src/localization-rules.ts`): Code-cell localization system for `init`
  - `code-comments`: translate Python comments (`# ...`) in code cells
  - `figure-labels`: translate matplotlib plot labels, axis titles, legend entries
  - `i18n-font-config`: inject CJK font configuration into first matplotlib cell (`zh-cn` only)
  - All rules ON by default; disable with `--localize none`
  - Font setup guidance printed after translation completes (creates `_fonts/` dir, prints download instructions)
  - Language-specific: Farsi silently skips font config (no special fonts needed)

### Removed
- **`--estimate` flag** removed from both `backward` and `forward` commands
  - `--dry-run` is the preferred pattern for preview
  - Removed `estimateBulkCost()`, `estimateCost()`, `formatCostEstimate()`, and `CostEstimate` interface

### Added (Phase 5 — Tests)
- **41 new tests** (720 → 761 total, 32 → 34 suites)
  - `init.test.ts` (16 tests) — `parseTocLectures` (9 tests), `copyNonMarkdownFiles` (7 tests)
  - `localization-rules.test.ts` (23 tests) — rule parsing, prompt building, font requirements, constants

### Added (Phase 3b — Forward Resync Command)
- **Forward command** (`src/cli/commands/forward.ts`): Resync TARGET translations to match current SOURCE
  - `translate forward -f cobweb.md` — single file resync
  - `translate forward` — bulk resync of all OUTDATED files (via status)
  - `--github <owner/repo>` flag: creates one PR per file in TARGET repo
  - `--test` flag: deterministic mock responses for CI/testing
  - `--exclude <pattern>` flag: skip files matching pattern
  - Pipeline: triage → whole-file RESYNC → output (simplified from section-by-section after experiment)
  - Progress bar for bulk mode, summary table with file counts
- **Forward triage** (`src/cli/forward-triage.ts`): LLM content-vs-i18n filter (~$0.01/file)
  - `triageForward()`: classifies file pairs as `CONTENT_CHANGES`, `I18N_ONLY`, or `IDENTICAL`
  - Byte-identical shortcut skips LLM entirely
  - Test mode returns deterministic verdicts based on filename patterns
- **Forward PR creator** (`src/cli/forward-pr-creator.ts`): Git ops + PR creation via `gh` CLI
  - Branch naming: `resync/{filename}` (e.g., `resync/cobweb`)
  - PR title: `[action-translation] resync: cobweb.md`
  - PR body includes source repo link, source file link, and triage reason
  - Labels: `action-translation-sync`, `resync`
  - Injectable `GhRunner` pattern for testing
- **Whole-file RESYNC translation** (`src/translator.ts`): New `translateDocumentResync()` method
  - Sends entire SOURCE + TARGET + glossary in one call (~$0.12/file)
  - Preserves cross-section context (localized plot labels, font config)
  - 2-3× cheaper than section-by-section (glossary sent once, not per section)
  - Prompt preserves existing style, terminology, localization wherever meaning hasn't changed
  - `DocumentResyncRequest` type in `src/types.ts`
- **Section RESYNC mode** (`src/translator.ts`): `translateSectionResync()` (retained for SYNC mode)
  - Preserves existing translation style while updating content to match SOURCE
  - Uses `[CURRENT SOURCE]` + `[EXISTING TRANSLATION]` prompt markers
  - `SectionTranslationRequest.mode` extended: `'update' | 'new' | 'resync'`
- **84 new tests** (640 → 724 total, 29 → 32 suites)
  - `forward.test.ts` (12 tests) — triage, whole-file resync, errors, github mode, PR failure, summary
  - `forward-triage.test.ts` (21 tests) — prompt, parsing, test mode, byte-identical
  - `forward-pr-creator.test.ts` (47 tests) — naming, args, body, creation, git operations, parseGitHubRepo, detectSourceRepo
  - `translator.test.ts` (+4 tests) — RESYNC mode
- **Git operations for --github mode** (`src/cli/forward-pr-creator.ts`): `gitPrepareAndPush()` function
  - Creates branch, writes resynced file, stages, commits, pushes with --force
  - Injectable `GitRunner` pattern for testing (parallels `GhRunner`)
  - Full error handling: switches back to original branch on any failure
  - 9 tests for git operations (success, branch cleanup, push failure, etc.)

### Changed
- **Strengthened i18n code preservation in all translation prompts** (`src/translator.ts`)
  - All three translation modes (UPDATE, section RESYNC, whole-file RESYNC) now include explicit
    rules to NEVER remove i18n/localization code from code cells
  - Specific examples: `font_manager`, `FontProperties`, `SimHei`, `rcParams`, `# i18n` markers
  - Resolves issue where whole-file RESYNC removed Chinese font configuration from `pv.md` despite
    existing preservation instructions (rules 4 and 6 were in tension; now unambiguous)

### Added
- **Backward report JSON schema** (`src/cli/schema.ts`): Formal Zod schemas for all backward report formats
  - `SCHEMA_VERSION` constant (`1.0.0`) — semver for the report format
  - `BackwardReportSchema`, `BulkBackwardReportSchema`, `ProgressCheckpointSchema`
  - `parseBackwardReport()` / `parseProgressCheckpoint()` — safe parse with error messages
  - `loadResyncDirectory()` — loads and validates all sidecar JSON from a `.resync/` dir
  - `filterActionableSuggestions()` — filters BACKPORT suggestions by confidence threshold
  - 41 tests including integration tests against real fixture data
- **`schemaVersion` field** on `BackwardReport`, `BulkBackwardReport` (optional, backward-compatible)
- **`zod`** runtime validation dependency

### Changed
- **ESM migration**: Entire codebase now compiles to ESM (`"module": "node16"`)
  - All relative imports use `.js` extensions
  - `package.json` has `"type": "module"`
  - `tsconfig.json`: `module` → `node16`, `moduleResolution` → `node16`, `target` → `ES2022`
  - `jest.config.js`: ts-jest compiles tests to CJS internally via tsconfig override
- **Action bundle moved to `dist-action/`**: Uses esbuild (CJS format) instead of ncc
  - `action.yml` entry point → `dist-action/index.js`
  - `dist/` is now ESM build output (gitignored, rebuild with `npm run build:cli`)
  - `dist-action/` has its own `package.json` with `"type": "commonjs"` for Actions runner compat
  - Glossary files copied to `dist-action/glossary/`
- **New dependencies**: `ink@^4`, `react@^18`, `@types/react@^18` (for Phase 3a review command)
- **New dev dependency**: `esbuild` (replaced `@vercel/ncc` for action bundling)
- **`src/index.ts`**: `__dirname` → `import.meta.url` + `fileURLToPath` (ESM compat)
- **`src/cli/index.ts`**: `require('../../package.json')` → `createRequire(import.meta.url)`

### Added (Phase 3a — Review Command)
- **Review command** (`src/cli/commands/review.ts`, ~210 lines): Interactive human review of backward suggestions
  - `translate review <report-dir>` — walks through each suggestion from a backward report
  - `--dry-run` flag: preview all suggestions without creating Issues
  - `--repo <owner/repo>` flag: target SOURCE repo for GitHub Issue creation
  - `--min-confidence <0-1>` flag: filter suggestions by confidence threshold (default: 0.5)
  - Loads and validates report data via `loadResyncDirectory()` + `filterActionableSuggestions()`
  - Sorts suggestions by confidence (highest first)
- **Chalk-styled card formatter** (`src/cli/review-formatter.ts`, ~230 lines)
  - Category badges (colour-coded: red=BUG_FIX, blue=CLARIFICATION, green=EXAMPLE, yellow=CODE_IMPROVEMENT)
  - Confidence scores with tier labels (high/medium/low)
  - Before/After change display with yellow/green labels
  - Multiline content rendered as indented blocks below labels
  - Collapsible reasoning section (hidden by default, `[D]` to expand)
  - Text wrapping at 72 characters
- **Ink interactive review session** (`src/cli/components/ReviewSession.tsx`, ~110 lines)
  - Card-by-card review with `[A]ccept` / `[S]kip` / `[R]eject` / `[D]etails` keypresses
  - Running tally in status bar: `✓ accepted  ~ skipped  ✗ rejected`
  - Unified session for both `--dry-run` and interactive modes
  - Dynamic import of ink/react to keep ESM out of Jest CJS environment
- **Pure state machine** (`src/cli/review-session.ts`, ~150 lines)
  - `ReviewSession` class tracks accept/skip/reject decisions
  - `toSummary()` returns final counts and accepted suggestion list
  - Tested independently of ink rendering
- **GitHub Issue generator** (`src/cli/issue-generator.ts`, ~200 lines)
  - `getIssueTitle()`: `[filename § section] summary`
  - `getIssueBody()`: Category, confidence, section location, reasoning, specific changes, SOURCE/TARGET excerpts, generation footer
  - `getIssueLabels()`: `translate` namespace — `translate`, `translate:{category}`, `translate:{language}`
  - `extractLanguage()`: extracts language code from target repo name (e.g., `lecture-intro.zh-cn` → `zh-cn`)
  - Adaptive code fences (`pushFencedBlock()`): counts longest backtick run in content, uses fence of `maxRun+1`
- **GitHub Issue creator** (`src/cli/issue-creator.ts`, ~180 lines)
  - `createIssue()`: shells out to `gh issue create` with injectable `GhRunner` for testing
  - `createAcceptedIssues()`: batch creation for all accepted suggestions
  - Graceful fallback when `--repo` not provided (prints to console only)
- **Backward report path scoping**: Reports now saved under `reports/{source-repo}/backward-DATE/`
- **125 new tests** (515 → 640 total, 24 → 29 suites)
  - `review.test.ts` (20 tests) — command loading, filtering, pipeline
  - `review-formatter.test.ts` (33 tests) — card rendering, categories, wrapping
  - `review-session.test.ts` (22 tests) — state machine, decisions, summary
  - `issue-generator.test.ts` (33 tests) — title, body, labels, language extraction
  - `issue-creator.test.ts` (17 tests) — gh arg building, batch creation, error handling

### Added (Phase 2)
- **Resync CLI — Status Command** (`src/cli/commands/status.ts`): Fast, free diagnostic — no LLM calls
  - Per-file sync status: `ALIGNED`, `OUTDATED`, `SOURCE_AHEAD`, `TARGET_AHEAD`, `MISSING_HEADINGMAP`, `SOURCE_ONLY`, `TARGET_ONLY`
  - Console table output (`formatStatusTable`) — like `git status` for translations
  - JSON output via `--json` flag (prints to stdout)
  - File discovery across SOURCE and TARGET repos with `--exclude` filtering
  - `OUTDATED` detection: flags files where SOURCE has newer commits than TARGET
- **Resync CLI — Bulk Backward** (`src/cli/commands/backward.ts`): Full-repo backward analysis
  - Processes all `.md` files in docs folder with two-stage pipeline
  - Timestamped output folder: `reports/backward-YYYY-MM-DD/` — the folder *is* the report
  - Per-file reports + aggregate `_summary.md` / `_summary.json`
  - Incremental checkpointing via `_progress.json` — survives interrupted runs
  - `--resume` flag to continue from checkpoint
  - `--exclude` flag for file filtering (exact match or `*` wildcard suffix)
  - Parallel processing with bounded concurrency (5 concurrent files)
  - TTY progress bar with live file name + stage counts (falls back to simple logging in non-TTY/CI)
  - Buffered logger (`BufferedLogger`) — per-file output flushed atomically to `.resync/_log.txt`
- 56 new tests (409 → 472 total, 21 → 23 suites)
  - `status.test.ts`: 21 tests (file discovery, per-file status, console output)
  - `bulk-backward.test.ts`: 19 tests (checkpointing, cost estimation, parallel orchestration, progress bar)
  - `backward-evaluator.test.ts`: 16 new tests (whole-file evaluation prompt, parsing, test mode)
- **Resync CLI** (`src/cli/`): New CLI tool for backward analysis of translations
  - `resync backward` command — two-stage pipeline to identify translation improvements worth backporting to SOURCE
  - **Stage 1** (`document-comparator.ts`): Whole-document LLM triage, recall-biased, one call per file
  - **Stage 2** (`backward-evaluator.ts`): Per-section LLM evaluation with structured JSON suggestions
  - `section-matcher.ts`: Cross-language position-based section matching with heading-map validation
  - `git-metadata.ts`: File-level git date/author/SHA extraction for temporal context
  - `report-generator.ts`: Markdown and JSON report formatting with confidence labels
  - **Result verdict**: Top-level report status — `✅ IN SYNC`, `📋 N SUGGESTION(S)`, `✅ NO ACTION NEEDED`, `⚠️ SKIPPED`
  - `commands/backward.ts`: Full pipeline orchestrator (read → triage → parse → match → evaluate → report)
  - `types.ts`: CLI-specific types (TriageResult, SectionPair, BackportSuggestion, etc.)
  - `index.ts`: Commander.js entry point with `--test` mode for deterministic mock responses
  - `--test` flag for all commands — no LLM calls, deterministic responses for CI/testing
  - 6 test fixture pairs (aligned, bug-fix, clarification, i18n-only, section-mismatch, no-heading-map)
  - 93 new tests (316 → 409 total, 15 → 21 suites)
- **Interleaved commit timeline** (`git-metadata.ts`): Builds interleaved SOURCE/TARGET commit history
  - `getFileTimeline()` — fetches commit logs from both repos, interleaves by date
  - `formatTimelineForPrompt()` — compact format for inclusion in LLM prompts
  - Timeline identifies estimated sync point (earliest TARGET commit) and counts post-sync SOURCE commits
  - Included in both Stage 1 triage and Stage 2 evaluation prompts to prevent directional reasoning errors
  - Included in Markdown reports under "Commit Timeline" section
  - New types: `TimelineEntry`, `FileTimeline`
- **CLI build**: `npm run build:cli` script, `bin.resync` entry in package.json
- **commander.js** dependency (^14.0.3)

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

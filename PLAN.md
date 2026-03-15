# PLAN: Development Roadmap

**Created**: 2026-02-16  
**Last Updated**: 2026-03-16  
**Sources**: 2026-02-16-REVIEW.md, docs/DESIGN-RESYNC.md  
**Current Version**: v0.8.0  
**Test Status**: 783 tests passing (35 test suites, 5 snapshots)

---

## Overview

This plan combines three work streams into a single prioritized roadmap:

1. **Code Health** — Address technical review findings to strengthen the foundation
2. **Resync CLI** — Build the CLI tool with three commands: `backward`, `backward-sync`, and `forward`
3. **Cleanup** — Remove deprecated tools and improve repo hygiene

### Four-Command Architecture

| Command | Direction | Purpose | Output | Modifies files? |
|---------|-----------|---------|--------|------------------|
| `status` | — | Fast structural diagnostic | Console table | No |
| `backward` | TARGET → SOURCE | Identify improvements worth considering | Suggestion report folder | No |
| `review` | — | Interactive human review of backward suggestions | GitHub Issues | No (creates Issues) |
| `forward` | SOURCE → TARGET | Resync TARGET after drift or failed propagation | Updated translated files | Yes |

**Workflow**: `status` (quick check) → `backward` (discover suggestions) → `review` (human decides, creates Issues) → human edits SOURCE → Action translates forward (incremental) *or* `forward` CLI (drift recovery)

### Two-Stage Backward Architecture

The `backward` command uses a two-stage approach to minimize cost and maximize accuracy:

```
Stage 1: Document-Level Triage (every file, 1 LLM call each)
  Full SOURCE + Full TARGET → "Any substantive changes beyond translation?"
  NO  → skip file (vast majority)
  YES → brief notes on what looks different → proceed to Stage 2

Stage 2: Whole-File Evaluation (flagged files only, 1 LLM call per file)
  All matched section pairs in one prompt → per-section suggestions
  Per-section suggestions with category, confidence, reasoning
```

**Why two stages**: Most translation changes improve the *translation*, not the *source content*. Backport candidates are rare. Stage 1 filters at ~$0.01/file, avoiding unnecessary Stage 2 analysis.

**Why whole-file Stage 2**: Originally Stage 2 made 1 LLM call per section (N calls per file). Refactored to 1 call per file with all sections in one prompt. Real-world comparison on 51-file repo:

| Metric | Section-by-Section | Whole-File |
|--------|-------------------|------------|
| Stage 2 API calls | 182 | 32 |
| High confidence findings | 6 | 7 |
| Medium confidence (noise) | 25 | 17 |
| Total suggestions | 31 | 24 |

The whole-file approach is strictly better: ~6x fewer API calls, better signal-to-noise, and cross-section context helps the LLM make more accurate assessments.

The plan is sequenced so that foundational improvements (especially `index.ts` refactoring) unblock the resync tool work.

---

## Phase 0: Foundation (Pre-Resync Prerequisites) ✅ COMPLETE

**Goal**: Address critical review findings that directly unblock resync CLI development  
**Estimated effort**: 3-4 days

### 0.1 Extract Sync Orchestration from `index.ts` (HIGH PRIORITY) ✅

`index.ts` was 766 lines combining GitHub Action entry point with full sync orchestration logic. Now refactored into three modules.

**Tasks**:
- [x] Create `src/sync-orchestrator.ts` — extracted sync logic (424 lines)
  - File classification (`classifyChangedFiles`)
  - Translation dispatch (section-based vs full)
  - Document reconstruction coordination
  - Error aggregation across files
  - Glossary loading utility (`loadGlossary`)
  - Logger interface for GitHub Action / CLI decoupling
- [x] Create `src/pr-creator.ts` — PR creation logic (323 lines)
  - Branch creation
  - File commits
  - PR body generation (`buildPrBody`, `buildPrTitle`)
  - Label and reviewer assignment (`buildLabelSet`)
- [x] Slim `index.ts` to ~447 lines of GitHub Action glue
  - Mode routing
  - Input fetching
  - GitHub API content fetching (`fetchFileContent`, `fetchAllFileContents`)
  - Delegating to orchestrator and PR creator
- [x] Add tests for `sync-orchestrator.ts` (26 tests)
  - Multi-file processing
  - Error recovery (one file fails, others continue)
  - File filtering logic
  - Glossary loading
- [x] Add tests for `pr-creator.ts` (12 tests)
  - PR title generation
  - PR body formatting
  - Label set deduplication

### 0.2 Add Retry Logic to Translator (MEDIUM PRIORITY) ✅

Translation API calls now have retry with exponential backoff.

**Tasks**:
- [x] Add exponential backoff retry in `translator.ts` (3 attempts: 1s, 2s, 4s)
- [x] Retry on: `RateLimitError`, `APIConnectionError`, transient `APIError` (5xx)
- [x] Skip retry on: `AuthenticationError`, `BadRequestError`, document-too-large
- [x] Add tests for retry behavior (12 tests)

### 0.3 Quick Cleanup ✅

- [x] Remove deprecated `findTargetSectionIndex()` from `file-processor.ts`
- [x] Remove deprecated `findMatchingSectionIndex()` from `file-processor.ts`
- [x] Remove dead `findSourceSectionIndex()` method (always returns -1)
- [x] `coverage/` already in `.gitignore`
- [x] Run tests to confirm no regressions

---

## Phase 1: Resync CLI — Single-File Backward with Two-Stage Architecture ✅ COMPLETE

**Goal**: Validate two-stage triage + section analysis on a single file  
**Prerequisite**: Phase 0 (orchestrator extraction for module reuse) ✅  
**Status**: All modules implemented, 93 CLI tests passing, validated against real QuantEcon repos

### 1.1 Directory Structure & CLI Scaffolding ✅

- [x] Create `src/cli/` directory structure:
  ```
  src/cli/
  ├── index.ts                  # CLI entry point (commander.js)
  ├── types.ts                  # CLI-specific types
  ├── section-matcher.ts        # Cross-language section matching
  ├── git-metadata.ts           # File-level git dates + interleaved timeline
  ├── document-comparator.ts    # Stage 1: whole-document triage
  ├── backward-evaluator.ts     # Stage 2: section-level detail
  ├── report-generator.ts       # Markdown/JSON output
  ├── commands/
  │   └── backward.ts           # resync backward command
  └── __tests__/
      ├── document-comparator.test.ts
      ├── section-matcher.test.ts
      ├── backward-evaluator.test.ts
      ├── report-generator.test.ts
      ├── backward.test.ts
      ├── git-metadata.test.ts
      └── fixtures/              # 6 paired fixture sets
  ```
- [x] Install `commander` dependency
- [x] Configure `package.json` `bin` entry for `resync` command
- [x] Add CLI build script (`npm run build:cli`)

### 1.2 CLI Types (`src/cli/types.ts`) ✅

- [x] `TriageResult` interface (file, verdict, notes, tokenCount)
- [x] `TriageVerdict` type (`CHANGES_DETECTED`, `IN_SYNC`, `SKIPPED_TOO_LARGE`)
- [x] `SectionPair` interface (sourceSection, targetSection, status)
- [x] `SectionSyncStatus` type (`SOURCE_ONLY`, `TARGET_ONLY`, `MATCHED`)
- [x] `BackportSuggestion` interface (category, confidence, summary, changes, reasoning)
- [x] `BackportCategory` type (`BUG_FIX`, `CLARIFICATION`, `EXAMPLE`, `CODE_IMPROVEMENT`, `I18N_ONLY`, `NO_CHANGE`)
- [x] `FileGitMetadata` interface (lastModified, lastCommit, lastAuthor)
- [x] `TimelineEntry` interface (date, repo, sha, message)
- [x] `FileTimeline` interface (entries, counts, estimatedSyncDate, sourceCommitsAfterSync)
- [x] `BackwardReport` interface (file, triageResult, suggestions, metadata, timeline)

### 1.3 Document Comparator — Stage 1 (`src/cli/document-comparator.ts`) ✅

- [x] `triageDocument()` function — single LLM call per file
- [x] Recall-biased prompt (false positives are cheap, false negatives lose backports)
- [x] Pre-flight size check (skip Stage 1 for very large documents)
- [x] `--test` flag support (deterministic mock response)
- [x] Reuse retry logic from `translator.ts`
- [x] Commit timeline context in prompt (prevents directional reasoning errors)
- [x] Unit tests + prompt snapshot tests

### 1.4 Section Matcher (`src/cli/section-matcher.ts`) ✅

- [x] `matchSections()` — position-based matching with heading-map validation
- [x] Handle `SOURCE_ONLY`, `TARGET_ONLY`, `MATCHED` pairs
- [x] Reuse `MystParser` from `parser.ts` for both languages
- [x] Reuse `extractHeadingMap()` from `heading-map.ts`
- [x] Unit tests for section matching

### 1.5 Backward Evaluator — Stage 2 (`src/cli/backward-evaluator.ts`) ✅

- [x] `evaluateSection()` function — per-section cross-language comparison
- [x] Stage 1 notes passed as context to focus analysis
- [x] Commit timeline context in prompt
- [x] Structured JSON response with category, confidence, suggestion
- [x] Respectful suggestion tone (SOURCE is truth)
- [x] Robust JSON parsing (handles Claude's inconsistent formatting)
- [x] Reuse retry logic from `translator.ts`
- [x] Unit tests + prompt snapshot tests

### 1.6 Git Metadata (`src/cli/git-metadata.ts`) ✅

- [x] `getFileGitMetadata()` — last commit date, SHA, author per file
- [x] `getFileTimeline()` — interleaved SOURCE/TARGET commit history
- [x] `getRepoCommits()` — full commit history for a file from one repo
- [x] `parseTimelineEntry()` — parse `git log` output lines
- [x] `formatTimelineForPrompt()` — compact format for LLM prompts
- [x] Estimated sync point detection (earliest TARGET commit)
- [x] Post-sync SOURCE commit counting
- [x] Unit tests against current repo

### 1.7 Report Generator (`src/cli/report-generator.ts`) ✅

- [x] Clear top-level **Result** verdict (IN SYNC / NO ACTION NEEDED / N SUGGESTIONS / SKIPPED)
- [x] Commit Timeline section in Markdown reports
- [x] Stage 1 triage summary
- [x] Per-section suggestions with confidence, category, reasoning
- [x] Confidence labels (HIGH / MEDIUM / LOW)
- [x] JSON report output
- [x] Bulk report support
- [x] Unit tests

### 1.8 Backward Command (`src/cli/commands/backward.ts`) ✅

- [x] Parse CLI arguments: `-f`, `-s`, `-t`, `-o`, `-l`, `--test`, `--json`
- [x] Load and parse SOURCE and TARGET files
- [x] Get git metadata + interleaved timeline
- [x] **Stage 1**: `triageDocument()` — full document comparison with timeline
- [x] **Stage 2**: Extract heading-map, match sections, `evaluateSection()` per pair with timeline
- [x] Generate and write report (Markdown and/or JSON)

### 1.9 Test Fixtures & Validation ✅

- [x] 6 paired fixture sets:
  - `aligned-pair/` — faithful translation, Stage 1 returns `IN_SYNC`
  - `bug-fix-in-target/` — TARGET corrected a formula, flags `BUG_FIX`
  - `clarification-in-target/` — TARGET added context
  - `i18n-only-changes/` — font/punctuation changes only, filters out
  - `section-count-mismatch/` — TARGET has extra sections
  - `no-heading-map/` — position-only matching (graceful degradation)
- [x] Validated against real QuantEcon repos (`lecture-python-intro` ↔ `lecture-intro.zh-cn`)
- [x] Timeline context resolved real false positive (unicode variables on `solow.md`)

### Key Learning from Real-World Testing

Running against `solow.md` revealed a critical false positive: the LLM suggested backporting TARGET's ASCII variable names (`alpha`) to replace SOURCE's unicode names (`α`). But SOURCE had adopted unicode *after* the translation was created. Adding the interleaved commit timeline to prompts eliminated this error — Stage 2 now correctly produces zero backport suggestions for this case.

**Phase 1 Deliverable**: Working `npx resync backward -f file.md` with two-stage triage ✅

---

## Phase 2: Resync CLI — Bulk Analysis & Status (2-3 days) ✅ COMPLETE

**Goal**: Scale backward to full repository + quick diagnostic command  
**Status**: Status command + bulk backward implemented, 45 new tests (456 total)  
**Validated**: Full LLM bulk run on 51-file repo (49 analyzed, 20 suggestions found, 5 high-confidence BUG_FIX)

### 2.1 Status Command (`src/cli/commands/status.ts`) ✅

No LLM calls — fast and free diagnostic. Output goes to the **CLI console** (like `git status`), not report files.

- [x] Check heading-map presence in each TARGET file
- [x] Detect structural differences (section count mismatch)
- [x] Compare file modification dates (git metadata)
- [x] Report per-file sync status:
  - `ALIGNED` — structure matches, heading-map present, no newer SOURCE commits
  - `SOURCE_AHEAD` — SOURCE has more sections than TARGET (sections added upstream)
  - `TARGET_AHEAD` — TARGET has more sections than SOURCE (unexpected divergence)
  - `OUTDATED` — SOURCE has newer commits than TARGET (needs forward sync)
  - `MISSING_HEADINGMAP` — no heading-map in TARGET
  - `SOURCE_ONLY` — file missing in TARGET
  - `TARGET_ONLY` — file missing in SOURCE
- [x] Print summary table to stdout (compact format with `↳` detail lines)
- [x] Support `--file` flag (single file diagnostic)
- [x] Support `--json` flag (prints JSON to stdout)
- [x] Unit tests (21 tests)

### 2.2 Bulk Backward Processing ✅

Bulk mode writes reports into a **date-stamped folder** — the folder *is* the report:
```
reports/backward-2026-03-04/
├── _summary.md           # Aggregate summary
├── _summary.json         # (with --json)
├── .resync/              # Hidden subfolder for machine-readable data
│   ├── _progress.json    # Checkpoint manifest
│   ├── _log.txt          # Detailed per-file processing log
│   ├── cobweb.json       # Per-file JSON sidecar
│   └── solow.json
├── cobweb.md             # Per-file report
├── solow.md
└── ...
```

- [x] File discovery (find all `.md` files in docs folder)
- [x] File filtering:
  - `--exclude <glob>` option (e.g., `--exclude README.md`)
  - Respect `_toc.yml` if present to discover the actual lecture list
- [x] Progress bar (`cli-progress` library, TTY-only):
  - Single updating line: `█████░░░ 24/51 | ✓ 8 sync 📝 5 suggestions ❌ 0 errors | current_file`
  - Clears on completion, replaced by final summary
  - Detailed per-file output goes to `.resync/_log.txt` log file
- [x] Two-stage bulk flow:
  - Stage 1 triage on all files (fast, 1 call each)
  - Stage 2 section analysis only on flagged files
- [x] Parallel processing (5 concurrent files via `Promise.all` batching)
- [x] Buffered logger (`BufferedLogger` class) — collects per-file output, flushes to log file atomically to prevent interleaving
- [x] Fresh start on re-run — wipes output folder unless `--resume` flag is set
- [x] Incremental checkpointing:
  - Write each per-file report to disk as it completes
  - Maintain `.resync/_progress.json` tracking which files are done
  - Support `--resume` to skip already-completed files in the output folder
- [x] Per-file reports (individual Markdown/JSON per analyzed file)
- [x] Aggregate summary report across all files
- [x] Cost estimation (`--estimate` flag)
  - Count files for Stage 1 triage
  - Estimate how many files will be flagged (~5-10% based on experience)
  - Estimate Stage 2 section calls for flagged files
  - Calculate estimated total API cost
  - Calculate estimated time
  - Prompt user to proceed (y/N)
- [x] Robust LLM response parsing (3-strategy approach: code fence → greedy regex → keyword fallback)
- [x] Default model upgrade to `claude-sonnet-4-6`

### 2.3 Output Formats ✅

- [x] Wire `--json` into bulk backward (per-file + aggregate)
- [x] Wire `--json` into status command (stdout)

> **Note**: Stable JSON schema definition and documentation deferred to Phase 4.

**Phase 2 Deliverable**: `npx resync status` (console) + full-repo `npx resync backward` (report folder) ✅

### Key Learnings from Phase 2 Real-World Testing

- **Parallel output interleaving**: Running 5 files concurrently with direct console output was unreadable. Solved with `BufferedLogger` that collects per-file output and flushes atomically to a log file.
- **Progress bar UX**: A single animated progress line (stderr, TTY-only) with counters (sync/suggestions/errors) is far better than scrolling file-by-file output. The log file preserves all detail for debugging.
- **LLM response variability**: The same file can produce 0-2 suggestions across runs. Borderline confidence scores (~0.72) fluctuate. This is expected LLM behavior, not a bug.
- **JSON parsing brittleness**: Claude wraps JSON in code fences, omits them, or returns partial JSON unpredictably. The 3-strategy parsing approach (code fence → greedy regex → keyword fallback) handles all observed formats.
- **Cost validation**: Full 51-file run cost ~$0.85, completed in ~4 minutes with 5-way parallelism. Stage 1 flagged ~67% of files (higher than estimated 5-10%), but Stage 2 filtered effectively — only 20 actionable suggestions from 49 files.
- **High-value findings**: 5 high-confidence BUG_FIX suggestions (confidence 0.85-0.97) represent genuine improvements made in the Chinese translation that should be backported to the English source.

---

## Phase 3a: Resync CLI — Interactive Review (3-4 days) ✅ COMPLETE

**Goal**: Interactive human review of backward suggestions with GitHub Issue creation  
**Status**: All 5 steps implemented, 125 new tests (515 → 640 total, 24 → 29 suites), validated end-to-end on test repos  
**Key insight from Phase 2**: Backward suggestions are rare (5 high-confidence out of 51 files) and need human judgment. Automating backward-sync via LLM is over-engineered — the value is in making the human review loop fast and pleasant.

### Design Decisions

**`backward-sync` deferred**: Originally planned as an LLM reverse-translation step. Deferred because:
- Backport candidates are rare — each gets careful human attention
- Edits are typically small (fix a formula, add a sentence)
- A human reading the backward report can edit SOURCE directly, often faster and higher quality than an LLM round-trip
- Risk of the LLM misunderstanding *why* the translation diverged
- If LLM assistance is needed for a specific edit, it can be done ad-hoc outside this tool

**`review` command (new)**: Interactive CLI that walks through backward report suggestions, lets a human accept/skip/reject each one, and creates GitHub Issues for accepted suggestions. This bridges the gap between "discovery" (backward) and "action" (human edits SOURCE).

**`forward` command — RESYNC mode**: Different from the GitHub Action's forward sync. The Action handles incremental updates triggered by PRs (UPDATE mode with old/new SOURCE diff). The forward CLI handles **drift recovery** — when repos are out of sync due to failed propagation, manual edits, or initial onboarding. Uses a new RESYNC prompt that preserves translation nuances.

### CLI Framework: `ink` v4 (React for CLI)

The `review` command needs rich terminal rendering: syntax-highlighted MyST markdown, panels, interactive prompts. **Decision: `ink` v4** — React-based CLI framework in Node.js, ESM module system.

**Why `ink`**:
- **Unified codebase** — Everything stays TypeScript. The `forward` command imports `translator.ts`, `parser.ts`, `section-matcher.ts` directly. No IPC, no subprocess, no duplication.
- **Component model** — `<SuggestionCard>`, `<MystBlock>`, `<ActionPrompt>` map naturally to the review UI
- `ink-syntax-highlight` for code blocks, custom components for MyST directives
- Testable via `ink-testing-library` (renders to string, asserts output)
- No new runtime dependency — users already need Node.js for the existing CLI
- Production precedent: Gatsby, Prisma, Shopify CLIs

**Why v4 (ESM)**: ink v4 is ESM-only. The existing CLI compiles to CommonJS, but the Node.js ecosystem is firmly moving to ESM. Migrating now avoids a later migration. Requires `tsconfig.json` module changes and import path adjustments for the CLI build.

**Rendering approach**: Custom `<MystRenderer>` component using `chalk` + `cli-highlight` for syntax highlighting, `<Box>` for directive panels, styled `<Text>` for headers/math. Gets ~80% of `rich`'s rendering quality. See "Future: Python Rewrite" section for the path to best-in-class rendering.

**Rejected alternative**: Python with `rich` — superior rendering but requires a full rewrite of the entire CLI to avoid a mixed-language project. Documented in the Future section as a long-term option.

### 3a.0 Prerequisites

#### Formalize Backward Report JSON Schema ✅

The `review` command reads `.resync/*.json` sidecars produced by `backward`. Define the schema contract before building the consumer.

- [x] Document the JSON schema for per-file sidecar files (`.resync/<file>.json`)
- [x] Document the JSON schema for `_summary.json`
- [x] Document the JSON schema for `_progress.json`
- [x] Add TypeScript types or Zod schema for runtime validation — `src/cli/schema.ts` with Zod
- [x] Add schema version field for future compatibility — `SCHEMA_VERSION` constant (`1.0.0`)

Implemented in `src/cli/schema.ts` (Zod schemas, parse/load/filter utilities) with 41 tests. PR #17.

#### ESM Migration for CLI Build ✅

- [x] Update `tsconfig.json` for ESM output — `module: node16`, `moduleResolution: node16`, `target: ES2022`
- [x] Update import paths to include `.js` extensions where needed — all ~50 source + test files
- [x] Install `ink` v4, `react` 18 — installed as runtime deps
- [x] Verify existing CLI commands (`backward`, `status`) still work after migration — 515 tests pass
- [x] Update `build:cli` script — `tsc` for ESM, `esbuild` for CJS action bundle (`dist-action/`)

Also replaced `@vercel/ncc` with `esbuild` for action bundling (CJS format). PR #17.

### 3a.1 Review Command (`review`)

Interactive CLI that reads a backward report folder and walks through each suggestion:

```
npx resync backward ...          # Phase 2 (done) — generates report folder
npx resync review <report-dir>   # Phase 3 (new) — interactive walk-through
```

**Per-suggestion display**:
- File name + section heading
- Category badge + confidence score (e.g., `BUG_FIX 0.92`)
- LLM reasoning (why this was flagged)
- Syntax-highlighted SOURCE and TARGET excerpts for the relevant section
- Suggested change description

**Actions per suggestion**: **[A]ccept** → create Issue · **[S]kip** → move on · **[R]eject** → mark as false positive

**End-of-session summary**: N accepted / N skipped / N rejected, with links to created Issues

#### Build Plan (agreed 2026-03-04)

**Key decisions**:
- Build `--dry-run` first to iterate on human factors before wiring up Issue creation
- Start with basic `chalk`-styled output, add rich rendering incrementally
- Issues target the SOURCE repo (e.g., `lecture-python-intro`), since suggestions are about improving the English source

#### Step 1: Command scaffold + report loading ✅

- [x] Register `resync review <report-dir>` in commander.js (`src/cli/commands/review.ts`)
- [x] Parse CLI arguments: `<report-dir>`, `--repo <owner/repo>` (SOURCE repo for Issues), `--dry-run`
- [x] Load report folder using `loadResyncDirectory()` from `schema.ts`
- [x] Filter to actionable suggestions using `filterActionableSuggestions()` from `schema.ts`
- [x] Flatten to a sorted list of suggestions across all files (highest confidence first)
- [x] Unit tests for loading + filtering pipeline — 20 tests (PR #18)

#### Step 2: `--dry-run` formatter (non-interactive) ✅

Chalk-styled stdout output — no ink yet. Fast iteration on what information matters.

- [x] Per-suggestion display: file name, section heading, category badge + confidence, LLM reasoning, suggested change
- [x] End-of-run summary: total suggestions, breakdown by category/confidence
- [x] Test with real report data from `reports/lecture-python-intro/backward-2026-03-04-section-by-section/`
- [x] Unit tests for formatter output (`review-formatter.test.ts`, 33 tests)

#### Step 3: Issue body generator ✅

- [x] Format GitHub Issue body for a suggestion
- [x] Issue title format: `[filename] brief description of suggestion`
- [x] Issue body includes:
  - Category + confidence
  - Section heading and location in file
  - Full LLM reasoning
  - SOURCE and TARGET excerpts
  - "Generated by `resync backward` on YYYY-MM-DD" footer
- [x] Labels: `translate`, `translate:{category}` (e.g., `translate:bug-fix`), `translate:{language}` (e.g., `translate:zh-cn`)
- [x] `--dry-run` shows Issue preview (title + body + labels) without creating anything
- [x] Unit tests for Issue body generation (`issue-generator.test.ts`, 33 tests)

#### Step 4: Ink interactive mode ✅

Layer ink on top of the dry-run formatter.

- [x] `<ReviewSession>` ink component renders each suggestion with card + Issue preview
- [x] [A]ccept / [S]kip / [R]eject keypresses per suggestion
- [x] Accept queues suggestion for Issue creation
- [x] Track session state (accepted/skipped/rejected counts) in `review-session.ts`
- [x] End-of-session summary with counts + list of accepted suggestions
- [x] Pure state machine `review-session.ts` tested independently of ink rendering
- [x] State machine tests (`review-session.test.ts`, 20 tests)
- [x] Dynamic imports for `ink`/`react` to keep ESM modules out of Jest CJS environment

#### Step 5: `gh` Issue creation ✅

- [x] Wire accepted suggestions to `gh issue create` on SOURCE repo (`--repo` flag)
- [x] Labels: `translate`, `translate:{category}`, `translate:{language}`
- [x] Print Issue URLs in end-of-session summary
- [x] Injectable `GhRunner` type for testability — no subprocess in tests
- [x] `--dry-run` end-to-end shows Issue preview (title + body + labels) without creating
- [x] Unit tests for arg building, single Issue creation, batch creation (`issue-creator.test.ts`, 17 tests)

#### MyST-Aware Terminal Rendering (incremental, across steps 2-4)

Start with basic chalk styling, add richer rendering as needed:

- [ ] Code blocks → syntax-highlighted (language-aware)
- [ ] Math blocks → styled LaTeX source (with optional Unicode symbol substitution: α, β, ∑)
- [ ] Directives (`{note}`, `{code-cell}`) → colored/boxed panels with directive name as header
- [ ] Headers/lists/links → standard markdown styling
- [ ] Frontmatter → YAML syntax highlighting
- [ ] Side-by-side or sequential SOURCE/TARGET display

---

## Phase 3b: Resync CLI — Forward Resync (2-3 days)

**Goal**: Drift recovery via forward resync with RESYNC translation mode + optional GitHub PR creation

**Status**: ✅ Complete. Whole-file RESYNC implemented (§3b.5). Triage validated on real data.

### 3b.0 Triage Experiment Results (5 March 2026)

Ran forward triage on all 49 file pairs between `lecture-python-intro` and `lecture-intro.zh-cn`:

| Verdict | Count | % |
|---------|-------|---|
| 🔄 CONTENT_CHANGES | 9 | 18% |
| 🌐 I18N_ONLY | 36 | 74% |
| ✅ IDENTICAL | 4 | 8% |

**Cost**: ~$2.26 (754K tokens) for 49 files. Higher than the $0.01/file estimate because full documents are sent to the LLM as context.

**The 9 content-change files with LLM-identified reasons**:

| File | Issue |
|------|-------|
| about.md | Missing contributors in Credits section |
| business_cycle.md | Missing developed economies comparison section |
| cagan_adaptive.md | Missing section + different function names + code restructuring |
| equalizing_difference.md | Major code rewrite (namedtuple → class approach) |
| heavy_tails.md | Different API usage (pandas_datareader → wbgapi) |
| intro.md | Added author info in Chinese version |
| pv.md | Incomplete formulas + incorrect vector definition |
| supply_demand_heterogeneity.md | Formula error (^T rendered as ^2) |
| troubleshooting.md | Extra content in Chinese + different issue tracker URL |

**Key findings**:
1. **Triage accuracy is high** — reasons are specific (formula errors, missing sections, API changes), no obvious false positives
2. **The triage reasons alone are valuable** — pv.md formula error and supply_demand_heterogeneity.md ^T→^2 are essentially bug reports
3. **82% of files can be skipped** — massive cost savings by filtering before translation
4. **Cost was 4× estimate** — real documents are large; actual triage cost is ~$0.05/file, not $0.01

### 3b.5 Design Decision: Whole-File vs Section-by-Section RESYNC ✅ DECIDED

**Decision (5 March 2026)**: Use **whole-file RESYNC with glossary** for the `forward` command. Section-by-section remains for SYNC mode (PR-driven) where it's the right design.

**Full experiment report**: `experiments/forward/whole-file-vs-section-by-section/REPORT.md`

#### Experiment Results (pv.md — 7 sections, 458 lines, zh-cn)

| Metric | Whole-file (glossary) | Section-by-section | Fresh translate |
|--------|----------------------|-------------------|----------------|
| Changed lines vs original | **29** | 52 | 188 |
| Total tokens | 23,905 | 72,681 | 10,600 |
| API calls | 1 | 7 | 1 |
| Estimated cost | **$0.137** | $0.281 | $0.098 |

Both approaches made the same 5 correct fixes (formula error, missing content, exercise updates, Wikipedia link). The critical differences:

1. **Localization preservation**: Whole-file preserved Chinese plot labels (`label='股息'`, `ax.set_xlabel('时间')`). Section-by-section reverted **all 4 plotting blocks** back to English — each section was translated in isolation without seeing the document's consistent Chinese localization pattern.

2. **Cost**: Section-by-section used 3× more tokens because the 357-term glossary is sent with every section call (7× overhead).

3. **Unnecessary churn**: Whole-file changed 29 lines (all intentional fixes). Section-by-section changed 52 lines (29 fixes + 23 regressions).

#### Why section-by-section works for SYNC but not forward

| Factor | SYNC (PR-driven) | Forward RESYNC |
|--------|------------------|----------------|
| Change signal | Git diff — exact sections | None — whole document question |
| Sections changed | 1-3 per PR | Unknown |
| Heading-map | Fresh (just updated) | May be stale or missing |
| Cross-section context | Not needed (surgical) | Critical (localization patterns) |
| Reconstruction | Simple (few sections) | Fragile (~300 lines of code) |

#### Risks and mitigations

- **Unwanted edits**: Prompt says "only modify where SOURCE content changed" — experiment showed 29/458 lines changed (94% preserved)
- **All-or-nothing failure**: Retry logic handles transient errors; single call is actually more reliable than N calls + reconstruction
- **Output verification**: `git diff` review before committing; natural workflow with `git restore .` to undo

```
npx resync status                    # identify drifted files (OUTDATED, SOURCE_AHEAD)
npx resync forward -f cobweb.md      # resync specific file (local)
npx resync forward                   # resync all OUTDATED files (local)
npx resync forward --github          # resync all, create one PR per file in TARGET repo
```

**Two execution modes**:
- `-f <file>` — single file
- *(none)* — bulk: all OUTDATED files detected by `status`

**Two output modes**:
- Default — write updated TARGET files to local disk
- `--github` — create one PR per file in TARGET repo's default branch via `gh`

**Per-file pipeline** (whole-file approach — decided in §3b.5):
1. **Forward triage** (LLM, ~$0.05/file) — "Content changes or i18n only?"
   - Content changes → proceed to RESYNC
   - i18n only → skip with brief reason (e.g., "punctuation and terminology style")
2. **Whole-file RESYNC translation** — send current SOURCE + current TARGET + glossary → get back updated TARGET
3. Output: write to disk or create PR

- [x] Parse CLI arguments: `-f <file>`, `-s <source-dir>`, `-t <target-dir>`, `-l <language>`, `--github`
- [x] Support single-file mode (`-f`) and full directory mode
- [x] Integrate with `status` to auto-detect OUTDATED files (when no `-f` given)
- [x] Cost estimation via `--estimate`
- [x] `--github` mode: one PR per file, branch `resync/{filename}`, labels `action-translation-sync`, `resync`
- [x] **Refactor to whole-file RESYNC** — added `translateDocumentResync()`, simplified forward pipeline (572→371 lines)

### 3b.2 Forward Triage (`src/cli/forward-triage.ts`)

LLM-based content-vs-i18n filter. Runs on every file before RESYNC to avoid noise.

```
cobweb.md: RESYNCED (3 sections updated, 1 new, 8 unchanged)
solow.md:  SKIPPED (i18n only — terminology style, full-width punctuation)
```

- [x] `triageForward()` — single LLM call per file, returns verdict + brief reason
- [x] Verdicts: `CONTENT_CHANGES` (proceed), `I18N_ONLY` (skip), `IDENTICAL` (skip)
- [x] Prompt: "Compare SOURCE and TARGET. Are there substantive content differences (structure, formulas, examples, code logic), or only internationalisation differences (punctuation, word choice, terminology style)?"
- [x] Report skip reason in summary (e.g., "punctuation and terminology style differences")
- [x] Unit tests + prompt snapshot tests
- [x] **Validated on real data** — 49 file pairs, results in §3b.0 above

### 3b.3 RESYNC Translation Mode

New translation mode distinct from NEW and UPDATE:

| Mode | Inputs | Use case |
|------|--------|----------|
| **NEW** | SOURCE only | Fresh translation (no prior work) |
| **UPDATE** | Old SOURCE + New SOURCE + Current TARGET | Incremental change (PR-driven, Action) |
| **RESYNC** | Current SOURCE + Current TARGET | Drift recovery (no baseline available) |

RESYNC preserves translation nuances because the LLM sees the existing translation:
- Maintains translator's style, terminology choices, localization decisions
- Only changes what the SOURCE actually changed
- Far less churn than re-translating from scratch

- [x] Add RESYNC mode to `translator.ts` (`translateSectionResync()` method)
- [x] RESYNC prompt: "Update this translation to accurately reflect the current source. Preserve existing translation style, terminology, and localization wherever the meaning hasn't changed."
- [x] Section-by-section implementation (working, tested)
- [x] Handle `SOURCE_ONLY` sections (new — translate with NEW mode)
- [x] Handle `TARGET_ONLY` sections (deleted in SOURCE — flag for removal)
- [x] Preserve heading-map (via `heading-map.ts`)
- [x] Preserve frontmatter
- [x] Unit tests for RESYNC mode (4 tests)
- [x] **Evaluate whole-file RESYNC** — experiment completed, whole-file wins (see §3b.5)
- [x] Add `translateDocumentResync()` method to `translator.ts`
- [x] Refactor `forward.ts` to use whole-file RESYNC (eliminate parse/match/reconstruct)

### 3b.4 Forward Output

**Local mode** (default):
- [x] Write updated TARGET files to disk
- [x] Sync summary: sections resynced / unchanged / new / removed / errors / skipped (i18n)
- [x] No `--dry-run` — use git workflow: run forward, `git diff`, `git restore .`

**GitHub mode** (`--github`):
- [x] Create branch `resync/{filename}` in TARGET repo
- [x] Commit updated file
- [x] Create PR: title `🔄 [resync] filename.md`, body with section change summary
- [x] Labels: `action-translation-sync`, `resync`
- [x] Print PR URL per file
- [x] Injectable `GhRunner` for testability (same pattern as `issue-creator.ts`)

**Phase 3b Deliverable**: Working `npx resync forward` with whole-file RESYNC mode, local + `--github` output

**Remaining**: None — Phase 3b complete.

---

## Phase 4: Refinement & Documentation ✅

**Goal**: Production-ready CLI  
**Status**: Core refinement complete (PR #24). Remaining items moved to Future Work.

### 4.1 Testing (completed)

- [x] Add CLI smoke tests (invoke commands as external processes) — 11 tests in `cli-smoke.test.ts`
- [x] Add LLM prompt snapshot tests (catch unintended prompt drift) — 5 snapshots across 3 suites

### 4.3 Error Handling (completed)

- [x] Malformed frontmatter — `parseTocLectures()` catches YAML parse errors and empty files
- [x] `gh` CLI not available — `checkGhAvailable()` pre-flight in review + forward --github, differentiates ENOENT/ETIMEDOUT/other

### 4.6 Review Actions (completed)

- [x] Update `@anthropic-ai/sdk` to latest version — 0.27.0 → 0.78.0
- [x] Add Unicode heading ID test case — `\p{L}\p{N}` in parser.ts and reviewer.ts

---

## Testing Strategy

The CLI decouples translation logic from GitHub Actions infrastructure, enabling a layered testing approach from fast/cheap to realistic.

### Testing Pyramid

| Layer | Speed | Cost | What It Tests | When to Run |
|-------|-------|------|---------------|-------------|
| **Unit tests** | ~5ms each | Free | Individual functions (comparator, matcher, evaluator, generator) | Every commit |
| **Fixture integration** | ~50ms each | Free | Cross-language pipeline with paired repo fixtures | Every commit |
| **Snapshot tests** | ~10ms each | Free | Report format stability + prompt text stability | Every commit |
| **Git integration** | ~200ms each | Free | Git metadata extraction with temp repos | Every commit |
| **CLI smoke tests** | ~1s each | Free | Full command execution with `--test` flag | Every commit |
| **Real repo tests** | ~30s each | Free (test mode) | Full pipeline against real lecture repos | Pre-release |
| **LLM prompt regression** | ~5s each | ~$0.05 each | Prompt quality (golden responses) | Weekly / pre-release |
| **GitHub Action tests** | ~2min each | Free (test mode) | Full PR workflow via tool-test-action-on-github | Pre-release |

### Layer 1: Unit Tests (existing pattern)

Each CLI module gets a corresponding test file. CLI modules are pure functions (no GitHub API, no Actions context) making them easy to test thoroughly.

**Two-stage specific tests**:
- `document-comparator.test.ts` — Stage 1 triage with mocked LLM, prompt construction
- `backward-evaluator.test.ts` — Stage 2 section analysis with mocked LLM
- Verify Stage 1 `IN_SYNC` result skips Stage 2 entirely
- Verify Stage 1 notes are passed through to Stage 2 prompts

### Layer 2: Paired Fixture Repos (new — biggest opportunity)

Current fixtures are same-language triplets (old English → new English → current Chinese). The CLI needs **cross-language pairs** where both sides are controlled:

```
src/cli/__tests__/fixtures/
├── aligned-pair/              # Stage 1 should return IN_SYNC
│   ├── source/lectures/intro.md
│   └── target/lectures/intro.md  # faithful translation + heading-map
├── bug-fix-in-target/         # Stage 1 flags, Stage 2 detects BUG_FIX
│   ├── source/lectures/cobweb.md
│   └── target/lectures/cobweb.md # fixed formula error
├── i18n-only-changes/         # Stage 1 might flag, Stage 2 filters out (I18N_ONLY)
│   ├── source/lectures/growth.md
│   └── target/lectures/growth.md # only font/punctuation changes
├── missing-heading-map/       # Tests graceful degradation
├── section-count-mismatch/    # TARGET has extra section
└── structural-drift/          # Sections reordered
```

The `status` command can be tested entirely with fixtures. The `backward` command uses fixtures + a mock LLM evaluator.

### Layer 3: Snapshot Tests (new — natural fit for reports + prompts)

Two snapshot targets:

**a) Report output** — `report-generator.ts` produces markdown and JSON reports:

```typescript
it('generates correct markdown report for bug-fix suggestion', () => {
  const report = generateMarkdownReport('cobweb.md', suggestions, metadata);
  expect(report).toMatchSnapshot();
});
```

**b) Prompt text** — catch unintended prompt changes:

```typescript
it('constructs correct Stage 1 triage prompt', () => {
  const prompt = buildTriagePrompt(sourceContent, targetContent, metadata);
  expect(prompt).toMatchSnapshot();
});

it('constructs correct Stage 2 evaluation prompt', () => {
  const prompt = buildEvaluationPrompt(sourceSection, targetSection, metadata, triageNotes);
  expect(prompt).toMatchSnapshot();
});
```

### Layer 4: Git Integration Tests (new — tests real git plumbing)

`git-metadata.ts` calls `git log`. Test with **temporary git repos** created in test setup:

```typescript
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'resync-test-'));
  await exec('git init', { cwd: tmpDir });
  await fs.writeFile(path.join(tmpDir, 'test.md'), 'content');
  await exec('git add . && git commit -m "initial"', { cwd: tmpDir });
});
```

Tests actual git plumbing without needing a GitHub remote. Fast and deterministic.

### Layer 5: CLI Smoke Tests (new — validates full commands)

Test the CLI binary as an external process:

```typescript
it('backward command produces report for single file', async () => {
  const result = await exec(
    `npx resync backward -f intro.md -s ${sourceDir} -t ${targetDir} -o ${tmpDir} --test`
  );
  expect(result.exitCode).toBe(0);
  expect(fs.existsSync(path.join(tmpDir, 'intro-backward.md'))).toBe(true);
});
```

A `--test` flag (like existing TEST mode) skips real LLM calls and uses deterministic responses. Validates argument parsing, file I/O, and full two-stage orchestration.

### Layer 6: Real Repo Tests (extends tool-test-action-on-github)

The CLI makes testing against real repos much easier — no GitHub Actions pipeline needed:

```bash
# Test backward analysis against real lecture repos (local clones)
npx resync backward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn \
  -f cagan_adaptive.md \
  --test \
  -o /tmp/test-reports

# Compare output against known-good baseline
diff /tmp/test-reports/cagan_adaptive-backward.md baseline/
```

Can be scripted into a test suite that runs against real repos without GitHub infrastructure.

### Layer 7: LLM Prompt Regression Tests (new — catches prompt drift)

Two complementary approaches:

**a) Prompt snapshot tests** (free, every commit) — snapshot the *constructed prompt* to catch unintended changes:

```typescript
it('constructs correct backward evaluation prompt', () => {
  const prompt = buildEvaluationPrompt(sourceSection, targetSection, metadata, notes);
  expect(prompt).toMatchSnapshot();
});
```

**b) Golden response tests** (costs ~$0.05/test, weekly) — verify real LLM responses for known fixtures produce expected verdicts:

```typescript
it('Stage 1 correctly flags file with bug fix', async () => {
  const result = await triageDocument(sourceContent, targetContent, metadata);
  expect(result.verdict).toBe('CHANGES_DETECTED');
});

it('Stage 2 correctly identifies bug fix category', async () => {
  const result = await evaluateSection(sourceSection, targetSection, metadata, notes);
  expect(result.recommendation).toBe('BACKPORT');
  expect(result.category).toBe('BUG_FIX');
  expect(result.confidence).toBeGreaterThan(0.8);
});
```

Run as a separate test suite, not on every commit.

### Test Organization

```
src/cli/__tests__/
├── document-comparator.test.ts  # Layer 1: unit + Layer 7a: prompt snapshots
├── section-matcher.test.ts      # Layer 1: unit
├── backward-evaluator.test.ts   # Layer 1: unit + Layer 7a: prompt snapshots
├── git-metadata.test.ts         # Layer 4: temp git repos
├── report-generator.test.ts     # Layer 3: snapshot tests
├── status.test.ts               # Layer 2: fixture integration
├── backward.test.ts             # Layer 2: fixture integration + Layer 5: CLI smoke
├── review.test.ts               # Layer 2: interactive flow tests + Issue generation
├── forward.test.ts              # Layer 2: fixture integration + Layer 5: CLI smoke
├── prompt-regression.test.ts    # Layer 7b: golden responses (separate suite, --test-llm flag)
└── fixtures/
    ├── aligned-pair/
    ├── bug-fix-in-target/
    ├── i18n-only-changes/
    ├── missing-heading-map/
    ├── section-count-mismatch/
    └── structural-drift/
```

### Running Test Suites

```bash
# All fast tests (Layers 1-5, every commit)
npm test

# LLM prompt regression tests (Layer 7b, weekly/pre-release)
npm run test:llm

# Real repo tests (Layer 6, pre-release)
npm run test:real-repos

# GitHub Action tests (Layer 8, pre-release)
./tool-test-action-on-github/test-action-on-github.sh
```

---

## Phase 5: CLI Rename & Init Command

**Goal**: Rename CLI from `resync` to `translate`, integrate bulk translation as `init` command, simplify flags  
**Status**: ✅ Complete (PR #23)

### Design Decisions (6 March 2026)

**CLI rename `resync` → `translate`**: The tool's domain is translation management. `translate` is immediately understandable and works naturally as a prefix for all subcommands: `translate init`, `translate forward`, `translate backward`, `translate status`, `translate review`.

**`init` command**: Incorporates `tool-bulk-translator` functionality directly into the CLI. One-time bulk translation of an entire lecture series from a local source repo. Uses `translateFullDocument()` from `translator.ts` (same as bulk-translator), reads `_toc.yml` for lecture discovery, generates heading-maps, produces a translation report.

**Local paths only**: Unlike `tool-bulk-translator` which fetched from GitHub via Octokit, `init` uses local paths (`-s`/`-t`) consistent with all other CLI commands. No `@octokit/rest` dependency needed. User clones repos first.

**`--dry-run` over `--estimate`**: These tools run infrequently. `--dry-run` (lists what would be done, no API calls, no file writes) is more useful for understanding and debugging than a cost estimate. Remove `--estimate` from `backward` and `forward` commands; add `--dry-run` to `init`.

**`setup` command (Phase 5c)**: Scaffold a new target repo by appending language code to source repo name and using `gh` CLI. Separate from `init` (which does translation). Kept as a follow-up PR to keep Phase 5 scope focused.

### 5.1 CLI Rename (`resync` → `translate`) ✅

- [x] Update `package.json` `bin` entry: `resync` → `translate`
- [x] Update `src/cli/index.ts` `.name('resync')` → `.name('translate')`
- [x] Update `src/cli/index.ts` description
- [x] Update all `npx resync` references in docs (`cli-reference.md`, `README.md`, etc.)
- [x] Update `copilot-instructions.md` CLI references
- [ ] Update PLAN.md `npx resync` references (historical — left as-is in earlier phases)

### 5.2 Init Command (`src/cli/commands/init.ts`) ✅

Adapted from `tool-bulk-translator/src/bulk-translate.ts` with local-path approach.

```
translate init -s /path/to/source -t /path/to/target \
  --target-language zh-cn \
  [--docs-folder lectures] \
  [--model claude-sonnet-4-6] \
  [--batch-delay 1000] \
  [--resume-from cobweb.md] \
  [--dry-run]
```

**Pipeline** (7 phases from bulk-translator, adapted):
1. Load glossary (built-in `glossary/<lang>.json`)
2. Setup target folder
3. Copy non-markdown files from local source (replaces GitHub API fetch)
4. Parse `_toc.yml` from local source for lecture list
5. Translate lectures sequentially (with retry, batch delay)
6. Generate heading-maps per file
7. Generate `TRANSLATION-REPORT.md`

- [x] Create `src/cli/commands/init.ts`
- [x] Register `init` command in `src/cli/index.ts`
- [x] Add `InitOptions` in `src/cli/commands/init.ts`
- [x] Implement local file copy (no Octokit)
- [x] Implement local `_toc.yml` parsing
- [x] Implement sequential translation with progress bar
- [x] Implement heading-map generation (reuse from bulk-translator)
- [x] Implement report generation
- [x] `--dry-run` mode (list lectures, no API calls, no file writes)
- [x] `--resume-from` support
- [x] Add tests (16 tests: `parseTocLectures`, `copyNonMarkdownFiles`)

### 5.3 Remove `--estimate` Flag ✅

- [x] Remove `--estimate` from `backward` command in `index.ts`
- [x] Remove `--estimate` from `forward` command in `index.ts`
- [x] Remove `estimate` from `BackwardOptions` and `ForwardOptions` in `types.ts`
- [x] Remove `estimateBulkCost()` from `backward.ts`
- [x] Remove `estimateCost()` from `forward.ts`
- [x] Update tests that reference `--estimate`
- [x] Update `cli-reference.md`

### 5.4 Documentation ✅

- [x] `cli-reference.md`: full `init` command section with options, pipeline, examples
- [x] `cli-reference.md`: rename all `resync` → `translate`, remove `--estimate`
- [x] `README.md`: update CLI examples
- [x] `quickstart.md`: update CLI references
- [x] `architecture.md`: add `init.ts` to module tree, update CLI references
- [x] `CHANGELOG.md`: Phase 5 entries

---

## Phase 5b: Cleanup & Repo Hygiene ✅

**Goal**: Clean up deprecated tools and repo structure

- [x] Document `tool-onboarding` and `tool-alignment` in `docs/developer/legacy-tools.md`
- [x] Deprecate `tool-onboarding/` (add deprecation notice to README)
- [x] Deprecate `tool-alignment/` (add deprecation notice to README)
- [x] Remove `tool-onboarding/` and `tool-alignment/` from tree (preserved in git history)
- [x] Remove `tool-bulk-translator/` (functionality moved to `translate init`) — git rm -r, preserved in history
- [x] Clean up `.gitignore` — removed stale `tool-bulk-translator/dist/` entry, removed `*.test.ts.snap` (snapshots tracked for CI)
- [x] Remove `coverage/` from tracked files — already untracked (in `.gitignore`, 0 files in git index)
- [x] ~~Clean up `dist/` build output~~ — N/A: `dist-action/` must be committed (GitHub Action entry point)
- [x] Update `copilot-instructions.md` to reflect new CLI structure — test counts updated in PR #24

---

## Phase 6: `.translate/` Metadata Folder

**Goal**: Add minimal persistent metadata to the target repo so the CLI can make exact staleness decisions, skip redundant work, and record translation provenance — without adding complexity.  
**Status**: Not started  
**Prerequisite**: Phase 5 (PR #23)

### Motivation

Today all sync state is either ephemeral (recomputed every run) or approximated from git history. This has three pain points:

1. **Staleness is a guess** — `status` and `backward` estimate sync state from commit timestamps, which breaks if someone edits a target file for non-translation reasons (formatting fix, typo).
2. **No skip optimisation** — `backward` evaluates every file every run, even when source hasn't changed since last evaluation. For a 51-file repo at ~$0.01/file, that's wasted cost on repeated runs.
3. **No provenance** — after translation you can't tell what model produced it, or what source state it was translated from.

### Design Principles

- **Minimum viable metadata** — track only what enables concrete decisions. No speculative fields.
- **Lives in TARGET repo only** — source repo stays untouched.
- **Committed to git** — metadata is part of the translation record (not ephemeral cache).
- **Heading-map stays in frontmatter** — it travels with the document and serves as a quick structural verifier. `.translate/` complements it, doesn't replace it.
- **Graceful absence** — if `.translate/` doesn't exist, all commands work exactly as today (git-heuristic fallback). Existing projects are unaffected.

### Structure

```
.translate/
├── config.yml              # Project-level settings
└── state/
    ├── intro.md.yml        # Per-file sync metadata
    ├── cobweb.md.yml
    └── solow.md.yml
```

**Project config** (`.translate/config.yml`):
```yaml
source-language: en
target-language: zh-cn
docs-folder: lectures
```

This replaces the need to pass `--source-language`, `--target-language`, `--docs-folder` on every CLI invocation. Commands read config as defaults, flags override.

**Per-file state** (`.translate/state/<filename>.yml`):
```yaml
source-sha: abc1234f         # Source file's commit SHA at time of sync
synced-at: 2026-03-06        # Explicit sync timestamp (ISO date)
model: claude-sonnet-4-6   # Model used for translation
mode: RESYNC                 # Translation mode: NEW / UPDATE / RESYNC
section-count: 5             # Source section count at sync time
```

### What this enables

| Capability | Today | With `.translate/` |
|---|---|---|
| "Is this file stale?" | Git timestamp heuristic | Exact: `git log --since` on source-sha |
| "Skip unchanged files" | Can't — re-evaluates all | Compare source-sha to HEAD, skip if unchanged |
| "What model translated this?" | Unknown | Recorded per-file |
| Default CLI flags | Must pass every time | Read from `config.yml` |
| "Translation coverage" | Computed live each run | Instant: count files with state entries |

### How each command uses `.translate/`

- **`translate init`** — Creates `.translate/config.yml` + per-file state entries after each lecture is translated. Natural first producer.
- **`translate status`** — If state exists, uses source-sha for exact comparison instead of git heuristic. Falls back to current behaviour if absent.
- **`translate backward`** — Skips files where source-sha matches current HEAD (source unchanged since last sync). Saves LLM cost on repeated runs.
- **`translate forward`** — Updates state entry after successful resync.
- **GitHub Action (sync mode)** — Reads config for defaults. Updates state after successful translation PR.
- **`translate setup`** — Creates `.translate/config.yml` as part of repo scaffolding.

### Bootstrap / Migration

For existing paired projects that predate `.translate/`, bootstrap state via the `status` command:

```bash
translate status \
  -s /path/to/source \
  -t /path/to/target \
  --target-language zh-cn \
  --write-state
```

`--write-state` adds a one-time side effect to the normal `status` run:
1. Create `.translate/config.yml` from the provided flags
2. For each translated file, find the most recent target commit and use it as `synced-at`
3. Record the source SHA at that point as a best-effort `source-sha`
4. Mark `model: unknown` (not recoverable from history)

After bootstrap, normal commands (`init`, `forward`, Action) maintain state automatically. No new command needed — `status` already walks both repos and compares structure, so it has all the information required.

### Tasks

- [ ] Define `TranslateConfig` and `FileState` types in `src/cli/types.ts`
- [ ] Create `src/cli/translate-state.ts` — read/write `.translate/` config and state
  - `readConfig(targetPath)` → `TranslateConfig | undefined`
  - `readFileState(targetPath, filename)` → `FileState | undefined`
  - `writeFileState(targetPath, filename, state)` → void
  - `writeConfig(targetPath, config)` → void
- [ ] Update `translate init` to write config + per-file state after each lecture
- [ ] Update `translate status` to use source-sha when available
- [ ] Add `--write-state` flag to `translate status` for bootstrap / migration
- [ ] Update `translate backward` to skip unchanged files (source-sha check)
- [ ] Update `translate forward` to write state after resync
- [ ] Update GitHub Action sync mode to write/update state after successful translation
- [ ] Add tests for state read/write, skip logic, bootstrap via `--write-state`
- [ ] Add `.translate/` section to `cli-reference.md`

---

## Phase 6b: Setup Command (Future PR)

**Goal**: Scaffold a new target repo so `translate init` has somewhere to translate into  
**Status**: Not started  
**Prerequisite**: Phase 5 (PR #23)

**Concept**: `translate setup` creates and initialises a target translation repository. It pairs with `init` to provide the complete onboarding workflow: `setup` → `init` → push → configure Action.

```bash
# Create target repo and local clone
translate setup \
  --source QuantEcon/lecture-python-intro \
  --target-language zh-cn

# Then translate into it
translate init \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn \
  --target-language zh-cn
```

### What `setup` would do

1. **Derive target repo name**: `{source-repo}.{lang}` (e.g., `lecture-python-intro.zh-cn`)
2. **Create GitHub repo**: `gh repo create {owner}/{target-name} --public --clone`
3. **Copy repo scaffolding**: `.github/workflows/`, `LICENSE`, `.gitignore`
4. **Create initial `_config.yml`**: Set title, language metadata
5. **Create translation workflow file**: Pre-configured `action-translation` sync workflow
6. **Initial commit and push**

### Tasks

- [ ] Create `src/cli/commands/setup.ts`
- [ ] Register `setup` command in `src/cli/index.ts`
- [ ] Implement repo name derivation
- [ ] Implement `gh repo create` integration (injectable `GhRunner` for testing)
- [ ] Implement scaffolding file generation
- [ ] Implement workflow template generation
- [ ] `--dry-run` mode (show what would be created)
- [ ] Add tests
- [ ] Add docs to `cli-reference.md`

---

## Phase 7: GitHub Action Automation (Future — 1-2 days)

**Goal**: Scheduled backward analysis via GitHub Actions  
**Prerequisite**: Phase 4 (validated CLI)

**Scope reduced**: Originally planned auto-PR creation from backward-sync. With the revised approach (human review via `resync review`), automation is limited to running the analysis and notifying maintainers.

- [ ] Create workflow template: monthly `backward` analysis (two-stage)
- [ ] Create workflow template: monthly `status` check
- [ ] Store backward report as workflow artifact
- [ ] Notification: comment on a tracking Issue or Slack webhook with summary
- [ ] Maintainer runs `translate review` locally on the downloaded report
- [ ] Documentation: "Setting up automated backward analysis"

---

## Phase 8: Whole-File Translation Architecture (Future — Investigation)

**Goal**: Evaluate whether the whole-file LLM evaluation pattern from backward analysis should be applied to the core forward translation pipeline

**Background**: The backward command's Stage 2 was originally designed with 1 LLM call per section (matching the forward sync architecture in `translator.ts`). Refactoring to 1 LLM call per file with all sections in a single prompt produced strictly better results:

| Metric | Per-Section | Per-File |
|--------|------------|----------|
| API calls (51-file repo) | 182 | 32 |
| High-confidence findings | 6 | 7 |
| Noise (medium-confidence) | 25 | 17 |

This raises the question: should `translator.ts` (forward sync) also move to whole-file translation instead of section-by-section?

### Considerations

**Arguments for whole-file forward translation**:
- Cross-section context (terminology consistency, narrative flow)
- Fewer API calls (cost and latency reduction)
- The LLM can see how terminology is used across the document

**Arguments for keeping section-by-section forward translation**:
- Section-level caching — only re-translate changed sections (UPDATE mode). Whole-file would re-translate everything on any change.
- Granular error recovery — if one section fails, others succeed. Whole-file is all-or-nothing.
- Token limits — large documents (30K+ tokens) may not fit source + target + instructions in one call.
- Current architecture is battle-tested in production (GitHub Action sync mode).

### Investigation Tasks

- [ ] Measure current forward sync API call count for typical repos
- [ ] Estimate cost/latency savings from whole-file approach
- [ ] Design hybrid approach: whole-file for initial translation, section-level for UPDATE mode
- [ ] Test whole-file translation quality vs section-by-section on real lectures
- [ ] Determine if context window supports full document + translation + instructions
- [ ] Prototype and compare translation quality

---

## Success Metrics

### Quality

| Metric | Target |
|--------|--------|
| Stage 1 triage recall | ≥95% (never miss a real backport candidate) |
| Stage 1 triage precision | ≥50% (some false positives are acceptable) |
| Stage 2 suggestion precision | ≥80% (suggestions accepted by reviewers) |
| Stage 2 suggestion recall | ≥70% (real improvements detected) |
| Forward sync accuracy | ≥95% (correct translations) |
| False positive rate (end-to-end) | ≤10% |

### Performance

| Metric | Target |
|--------|--------|
| Stage 1 triage per file | <5 seconds |
| Stage 2 analysis per file | <15 seconds |
| Full backward (51 files, 5 parallel) | ~4 minutes |
| API cost — backward (51 files) | ~$0.85 total (real measurement) |
| API cost — backward-sync per file | ~$0.10 |
| API cost — forward per file | ~$0.10 |
| Status check | <5 seconds (no LLM) |

### Code Health

| Metric | Current | Target |
|--------|---------|--------|
| Test count | 783 | 400+ |
| Test suites | 35 | — |
| Snapshots | 5 | — |
| `index.ts` lines | ~447 | ~447 (stable) |
| Deprecated methods | 0 | 0 |
| Dead tool directories | 0 | 0 |

---

## Timeline Summary

| Phase | Duration | Dependencies | Key Deliverable |
|-------|----------|--------------|-----------------|
| **Phase 0**: Foundation | 3-4 days | None | `index.ts` refactored, retry logic |
| **Phase 1**: Single-file backward | 3-4 days | Phase 0 ✅ | `npx resync backward -f file.md` (two-stage) |
| **Phase 2**: Bulk + status | 2-3 days | Phase 1 ✅ | `npx resync status` + bulk backward |
| **Phase 3a**: Interactive review | 3-4 days | Phase 2 ✅ | `npx resync review` with Issue creation |
| **Phase 3b**: Forward resync | 2-3 days | Phase 3a ✅ | `npx resync forward` with RESYNC mode |
| **Phase 4**: Refinement | 2-3 days | Phase 3b ✅ | Production-ready CLI ✅ |
| **Phase 5**: CLI rename + init | 2-3 days | Phase 3b ✅ | `translate init`, rename resync→translate ✅ |
| **Phase 5b**: Cleanup | 1 day | Phase 5 ✅ | Legacy tool deprecation, repo hygiene ✅ |
| **Phase 6**: `.translate/` metadata | 2-3 days | Phase 5 ✅ | Exact staleness, skip optimisation, provenance |
| **Phase 6b**: Setup command | 1-2 days | Phase 6 | `translate setup` — scaffold target repo |
| **Phase 7**: Automation | 1-2 days | Phase 4 | Scheduled backward analysis |
| **Phase 8**: Whole-file translation | TBD | Phase 4 | Evaluate whole-file approach for forward sync |

**Total**: 15-23 days (Phase 0-4), +3-4 days (Phase 5-5b), +2-3 days (Phase 6), +2 days (Phase 7), +TBD (Phase 8)

---

## Open Questions

1. ~~**Stage 1 token limits**: Very large documents (30K+ tokens per side) may exceed context window for single-call triage.~~ **Resolved**: `SKIPPED_TOO_LARGE` verdict handles this. Only 2 files hit the limit in real testing (README.md, tax_smooth.md).
2. ~~**Backport confidence threshold**: Default 0.6~~ **Validated**: 0.6 works well. Real BUG_FIX findings came in at 0.85-0.97. Lower-confidence suggestions (0.6-0.7) are borderline but worth flagging.
3. ~~**Multi-section changes**: Group in one suggestion or separate?~~ **Resolved**: Separate per-section suggestions. Each gets its own category, confidence, and reasoning.
4. ~~**TARGET-only files**: Flag for addition to SOURCE, or just report?~~ **Resolved**: `status` reports only (diagnostic tool). Action on `TARGET_ONLY` / `SOURCE_ONLY` belongs to Phase 3 commands.
5. **Run frequency**: Monthly default, option for more frequent? — Decide in Phase 4
6. ~~**backward-sync PR format**: Should `backward-sync` create PRs directly, or write files for manual PR creation?~~ **Resolved**: `backward-sync` deferred. The `review` command creates GitHub Issues instead. Human edits SOURCE directly.
7. ~~**Report-driven backward-sync**: The `--from-report` flag reads a backward JSON report and syncs only marked suggestions.~~ **Resolved**: Replaced by interactive `review` command that reads the report folder and walks through suggestions with accept/skip/reject.
8. **Stage 1 precision**: Flagging rate was ~67% vs estimated 5-10%. High recall is good, but Stage 1 could be tuned to reduce false positives and save Stage 2 costs. — Address in Phase 4 prompt tuning
9. **Whole-file vs section-by-section translation**: Backward Stage 2 showed ~6x fewer API calls and better quality with whole-file evaluation. Should forward sync (`translator.ts`) adopt the same pattern? Trade-off: better context vs loss of section-level caching in UPDATE mode. — Investigate in Phase 8
10. ~~**CLI framework**: `ink` (Node.js) vs `rich` (Python) for the `review` command's terminal rendering.~~ **Resolved**: `ink` (Node.js). Keeps unified codebase, direct module imports for `forward` command. Python `rich` rewrite documented as a future option (see Future section).

---

## Lessons Learned

### From Phase 1 Real-World Testing

- **Temporal context is critical**: Without the interleaved commit timeline, the LLM makes directional errors (flagging SOURCE's newer code as a TARGET improvement). Adding timeline to prompts eliminated this class of false positive.
- **Two-stage design validated**: Stage 1 correctly flags differences; Stage 2 correctly filters non-actionable ones. The cost savings are real (~$0.01 triage vs ~$0.10-0.50 per-section analysis).
- **Real repo names**: The zh-cn repo for `lecture-python-intro` is `lecture-intro.zh-cn` (not `lecture-python-intro.zh-cn`).

### From Phase 2 Bulk Testing

- **Whole-file evaluation wins**: Refactoring Stage 2 from per-section (182 calls) to per-file (32 calls) produced better results — more high-confidence findings, less noise, and ~6x fewer API calls. Cross-section context helps the LLM avoid false positives.
- **5-way parallelism** is the sweet spot — fast enough to complete 51 files in ~4 minutes, without overwhelming the API.
- **Buffered logging** is essential for parallel work — interleaved output from concurrent files is unreadable.
- **Progress bar** provides much better UX than scrolling output — users see status at a glance, details go to log file.
- **Fresh start by default** (wipe output folder) is more intuitive than accumulating stale results. `--resume` is the opt-in for incremental runs.
- **Date-only folder naming** (`backward-2026-03-04`) is cleaner than timestamped (`backward-2026-03-04_01-38-48`). Same-day re-runs overwrite, which matches the fresh-start default.
- **Stage 1 flagging rate** was ~67% (33/49 files flagged), much higher than the estimated 5-10%. This suggests the Stage 1 prompt has high recall (good — false negatives are worse than false positives) but precision could be improved. Stage 2 effectively filters: only 20 suggestions survived from 33 flagged files.

---

## Future Work

Items moved from completed phases. These are candidates for future development, not committed work.

### Integration Testing

- [ ] Test `backward` + `review` workflow with `lecture-python-intro` ↔ `lecture-intro.zh-cn`
- [ ] Test `forward` resync with `lecture-python` ↔ `lecture-python.zh-cn`
- [ ] Validate RESYNC translation quality (preserves nuances vs full re-translation)
- [ ] Validate forward triage accuracy (content vs i18n classification)
- [ ] Validate two-stage triage accuracy (Stage 1 recall ≥95%)
- [ ] Test review → Issue creation end-to-end
- [ ] Document edge cases found
- [ ] Fix bugs discovered

### Prompt Tuning

- [ ] Review Stage 1 triage accuracy (false negatives are critical failures)
- [ ] Review Stage 2 suggestions from Phase 1-2 runs
- [ ] Identify false positives and false negatives
- [ ] Tune Stage 1 prompt for recall (bias toward flagging)
- [ ] Tune Stage 2 prompt for precision (reduce noise in suggestions)
- [ ] Tune RESYNC prompt for translation preservation quality
- [ ] Re-run validation tests

### Error Handling

- [ ] Missing source/target files
- [ ] API timeout/rate limit
- [ ] Invalid heading-map
- [ ] Oversized documents (Stage 1 token limit exceeded)
- [ ] Graceful degradation with warnings

### Review Command UX Polish

- [ ] Scroll viewport — fixed-height card area with up/down arrow scrolling
- [ ] Truncate long Before/After blocks — show first N lines, `[E]xpand` to see full
- [ ] Syntax highlighting in Before/After code blocks (chalk + cli-highlight)
- [ ] MyST-aware rendering — styled directives, math, headers in card output
- [ ] Colour-coded inline diff (word-level Before→After highlighting)

### Documentation — Restructure into User & Developer Guides

Restructure `docs/` into two clear audiences and deploy via GitHub Pages.

#### User Documentation

- [ ] **Quick Start** — streamlined Action setup for new users
- [ ] **Action Reference** — inputs, outputs, modes (sync/review), examples
- [ ] **CLI Reference** — `status`, `backward`, `review`, `forward` with usage examples and options
- [ ] **Glossary Guide** — how to use and extend the translation glossary
- [ ] **Heading Maps** — user-friendly explanation (what they are, when to edit manually)
- [ ] **FAQ** — common issues, troubleshooting, "how do I..." answers

#### Developer Documentation

- [ ] **Architecture** — module map, data flow diagrams, key design constraints
- [ ] **Sync Workflow** — internal lifecycle, UPDATE/NEW/RESYNC modes
- [ ] **Implementation** — technical reference (parser, diff-detector, translator internals)
- [ ] **Testing Guide** — test pyramid, fixtures, how to add tests
- [ ] **Design: Resync CLI** — two-stage architecture, review workflow, CLI framework decision
- [ ] **Claude Models** — model selection, token limits, retry logic

#### GitHub Pages Deployment

- [ ] Use **mystmd** as the static site generator
- [ ] Configure `docs/` with `mst.yml`
- [ ] Add GitHub Actions workflow: auto-deploy docs on push to `main`
- [ ] Landing page with navigation to User / Developer sections
- [ ] Ensure existing doc links remain functional (redirects or path mapping)
- [ ] Add docs site URL to repo About section and README

#### General

- [ ] Update main README with link to docs site
- [ ] Migrate content from existing `docs/*.md` files into new structure

### Additional Review Actions

- [ ] Use atomic Git commits (Tree API) for multi-file PRs in sync mode
- [ ] Add pre-flight check for section-level translation token limits
- [ ] Refactor `reviewer.ts` to reuse `MystParser` instead of local parsing
- [ ] Simplify `parseTranslatedSubsections()` wrapper approach

---

## Future: Python Rewrite with `rich`

If the `ink`-based CLI proves limiting for MyST rendering quality, the long-term path is a **full rewrite of the CLI in Python** — not a mixed-language project.

### Motivation

`rich` (Python) is the gold standard for terminal rendering: native Markdown, Pygments-powered syntax highlighting, panels, tables, columns, and tree views — all built-in. A `MystRenderable` subclass could provide directive-aware rendering (`{note}`, `{code-cell}` as styled panels). `textual` (built on `rich`) offers a full TUI framework for scrolling, mouse support, and complex interaction.

Python is also a natural fit for the QuantEcon ecosystem — users are Python developers, and a `pip install`-able CLI published to PyPI would feel native.

### What a rewrite involves

To avoid a mixed-language project (two runtimes, two package managers, fragmented testing), a Python rewrite would port **the entire CLI**:

| Module | Lines | Complexity |
|--------|-------|------------|
| `parser.ts` | ~280 | Stack-based MyST parser, battle-tested edge cases |
| `section-matcher.ts` | ~150 | Position-based matching with heading-map |
| `heading-map.ts` | ~250 | Extract/update/inject heading maps |
| `translator.ts` | ~460 | Claude API calls, NEW/UPDATE/RESYNC modes, retry logic |
| `file-processor.ts` | ~670 | Document reconstruction, subsection handling |
| `language-config.ts` | ~100 | Language-specific translation rules |
| `diff-detector.ts` | ~195 | Change detection, recursive subsection comparison |
| CLI commands + types | ~1,500 | backward, status, review, forward, report generator |
| **Total** | **~3,600** | Plus duplicate test suites |

### When to consider this

- If `ink` rendering proves insufficient for reviewing MyST content (math, directives, side-by-side)
- If the QuantEcon team wants to maintain the CLI in Python long-term
- If `textual` TUI capabilities become important (scrollable diff views, etc.)

The GitHub Action itself would remain Node.js (Actions require JavaScript). Only the CLI tool would move to Python.

### Prerequisites

- Phase 4 complete (stable CLI interfaces and JSON schemas)
- Clear rendering gaps identified in `ink` that justify the rewrite cost
- Decision on whether to publish to PyPI

---

*Last updated: 2026-03-06 (Phase 4 + 5b closed out, future work reorganized, PR #24)*

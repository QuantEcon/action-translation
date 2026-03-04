# PLAN: Development Roadmap

**Created**: 2026-02-16  
**Last Updated**: 2026-03-04  
**Sources**: 2026-02-16-REVIEW.md, docs/DESIGN-RESYNC.md  
**Current Version**: v0.8.0  
**Test Status**: 472 tests passing (23 test suites)

---

## Overview

This plan combines three work streams into a single prioritized roadmap:

1. **Code Health** — Address technical review findings to strengthen the foundation
2. **Resync CLI** — Build the CLI tool with three commands: `backward`, `backward-sync`, and `forward`
3. **Cleanup** — Remove deprecated tools and improve repo hygiene

### Three-Command Architecture

| Command | Direction | Purpose | Output | Modifies files? |
|---------|-----------|---------|--------|-----------------|
| `backward` | TARGET → SOURCE | Identify improvements worth considering | Suggestion report | No |
| `backward-sync` | TARGET → SOURCE | Apply accepted improvements to SOURCE | Updated English files | Yes |
| `forward` | SOURCE → TARGET | Translate changes to TARGET | Updated translated files | Yes |

**Workflow**: `backward` (discover) → human review → `backward-sync` (apply selected) → `forward` (propagate to all targets)

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
  - `ALIGNED` — structure matches, heading-map present, no newer commits either side
  - `SOURCE_AHEAD` — SOURCE has newer commits than TARGET (needs forward sync)
  - `TARGET_AHEAD` — TARGET has newer commits than SOURCE (possible backward candidate)
  - `SOURCE_AHEAD | TARGET_AHEAD` — both sides have newer commits (compound flag)
  - `DRIFT` — structural differences detected (section count mismatch)
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

## Phase 3: Resync CLI — Backward-Sync & Forward (2-3 days)

**Goal**: Implement both sync directions via CLI

### 3.1 Backward-Sync Command (`src/cli/commands/backward-sync.ts`)

Applies accepted backward suggestions by reverse-translating TARGET improvements into SOURCE English. Reuses the forward sync machinery with swapped inputs.

- [ ] Parse CLI arguments (reuse common options)
- [ ] Support `--dry-run` flag
- [ ] Support single-file mode (`-f`) with optional section filter (`--section`)
- [ ] Support report-driven mode (`--from-report <report.json>`)
  - Reads a backward report JSON and syncs only accepted suggestions
  - User marks suggestions as accepted before running

### 3.2 Backward-Sync Logic

Reuse modules from action-translation with swapped SOURCE/TARGET roles:

- [ ] Parse TARGET (as source of changes) and SOURCE (as target to update)
- [ ] Match sections (via `section-matcher.ts`)
- [ ] For sections with accepted suggestions:
  - Get current English from SOURCE
  - Translate improvement from TARGET back to English using UPDATE mode (via `translator.ts`)
  - Prompt tone: "Improve this English section based on changes found in the translation"
  - Replace section in SOURCE
- [ ] Preserve frontmatter and document structure
- [ ] **Suggestion PR mode**: Generate output suitable for a suggestion PR
  - PR title: `[Suggestion] {filename}: {brief summary}`
  - PR body: explains what the translation improved and why
  - Respectful tone — these are suggestions, SOURCE is truth

### 3.3 Forward Command (`src/cli/commands/forward.ts`)

Standard SOURCE → TARGET sync (the normal direction):

- [ ] Parse CLI arguments (reuse common options)
- [ ] Support `--dry-run` flag
- [ ] Support single-file mode (`-f`)
- [ ] Support full directory mode

### 3.4 Forward Sync Logic

Reuse modules from action-translation:

- [ ] Parse SOURCE and TARGET sections (via `parser.ts`)
- [ ] Match sections (via `section-matcher.ts`)
- [ ] For `SOURCE_CHANGED` sections:
  - Get old translation from TARGET
  - Translate using UPDATE mode (via `translator.ts`)
  - Replace section in TARGET
- [ ] For `SOURCE_ONLY` sections:
  - Translate using NEW mode
  - Insert at correct position
- [ ] For `TARGET_ONLY` sections (deleted in SOURCE):
  - Remove from TARGET
- [ ] Preserve heading-map (via `heading-map.ts`)
- [ ] Preserve frontmatter

### 3.5 Output

- [ ] Write updated files to disk (SOURCE for backward-sync, TARGET for forward)
- [ ] Sync summary report (sections translated, unchanged, errors)
- [ ] Dry-run mode: diff-style preview without file modification

**Phase 3 Deliverable**: Working `npx resync backward-sync` + `npx resync forward`

---

## Phase 4: Refinement & Documentation (2-3 days)

**Goal**: Production-ready CLI

### 4.1 Integration Testing

- [ ] Test with `lecture-python-intro` ↔ `lecture-intro.zh-cn`
- [ ] Test with `lecture-python` ↔ `lecture-python.zh-cn`
- [ ] Add CLI smoke tests (invoke commands as external processes)
- [ ] Add LLM prompt snapshot tests (catch unintended prompt drift)
- [ ] Validate two-stage triage accuracy (Stage 1 recall ≥95%)
- [ ] Document edge cases found
- [ ] Fix bugs discovered

### 4.2 Prompt Tuning

- [ ] Review Stage 1 triage accuracy (false negatives are critical failures)
- [ ] Review Stage 2 suggestions from Phase 1-2 runs
- [ ] Identify false positives and false negatives
- [ ] Tune Stage 1 prompt for recall (bias toward flagging)
- [ ] Tune Stage 2 prompt for precision (reduce noise in suggestions)
- [ ] Validate backward-sync output quality (translated English reads naturally)
- [ ] Re-run validation tests

### 4.3 Error Handling

- [ ] Missing source/target files
- [ ] Malformed frontmatter
- [ ] API timeout/rate limit
- [ ] Invalid heading-map
- [ ] Oversized documents (Stage 1 token limit exceeded)
- [ ] Graceful degradation with warnings

### 4.4 Documentation

- [ ] CLI README (`src/cli/README.md`)
- [ ] Update main README with resync CLI section
- [ ] Update `docs/INDEX.md`
- [ ] Update `docs/DESIGN-RESYNC.md` to reflect two-stage architecture
- [ ] Update CHANGELOG.md

### 4.5 Additional Review Actions (from 2026-02-16-REVIEW)

These can be addressed opportunistically during refinement:

- [ ] Use atomic Git commits (Tree API) for multi-file PRs in sync mode
- [ ] Add pre-flight check for section-level translation token limits
- [ ] Refactor `reviewer.ts` to reuse `MystParser` instead of local parsing
- [ ] Simplify `parseTranslatedSubsections()` wrapper approach
- [ ] Update `@anthropic-ai/sdk` to latest version
- [ ] Add Unicode heading ID test case

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
├── backward-sync.test.ts        # Layer 2: fixture integration + Layer 5: CLI smoke
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

## Phase 5: Cleanup & Repo Hygiene (1 day)

**Goal**: Clean up deprecated tools and repo structure

- [ ] Archive `tool-onboarding/` (move to separate branch or remove from main)
- [ ] Archive `tool-alignment/` (already deprecated)
- [ ] Ensure `.gitignore` covers `node_modules/` in all tool dirs
- [ ] Remove `coverage/` from tracked files
- [ ] Clean up `dist/` build output (ncc bundle only)
- [ ] Update `copilot-instructions.md` to reflect new CLI structure

---

## Phase 6: GitHub Action Automation (Future — 2-3 days)

**Goal**: Scheduled automation of resync via GitHub Actions  
**Prerequisite**: Phase 4 (validated CLI)

- [ ] Freeze JSON schema for automation
- [ ] Create workflow template: monthly backward report (two-stage)
- [ ] Create workflow template: monthly status check
- [ ] Confidence-based actions:
  - HIGH (≥0.85): Auto-create suggestion PR in SOURCE via `backward-sync`
  - MEDIUM (0.6-0.85): Create issue for review
  - LOW (<0.6): Report only
- [ ] GitHub trigger for translators: Issue template "Suggest upstream improvement"
- [ ] Documentation: "Setting up automated resync"

---

## Phase 7: Whole-File Translation Architecture (Future — Investigation)

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
| Test count | 472 | 400+ |
| `index.ts` lines | ~447 | ~447 (stable) |
| Deprecated methods | 0 | 0 |
| Dead tool directories | 2 | 0 |

---

## Timeline Summary

| Phase | Duration | Dependencies | Key Deliverable |
|-------|----------|--------------|-----------------|
| **Phase 0**: Foundation | 3-4 days | None | `index.ts` refactored, retry logic |
| **Phase 1**: Single-file backward | 3-4 days | Phase 0 ✅ | `npx resync backward -f file.md` (two-stage) |
| **Phase 2**: Bulk + status | 2-3 days | Phase 1 ✅ | `npx resync status` + bulk backward |
| **Phase 3**: Backward-sync + forward | 2-3 days | Phase 1 | `npx resync backward-sync` + `npx resync forward` |
| **Phase 4**: Refinement | 2-3 days | Phase 2, 3 | Production-ready CLI |
| **Phase 5**: Cleanup | 1 day | Any time | Clean repo |
| **Phase 6**: Automation | 2-3 days | Phase 4 | Scheduled GitHub Actions |
| **Phase 7**: Whole-file translation | TBD | Phase 4 | Evaluate whole-file approach for forward sync |

**Total**: 13-20 days (Phase 0-4), +3-4 days (Phase 5-6), +TBD (Phase 7)

---

## Open Questions

1. ~~**Stage 1 token limits**: Very large documents (30K+ tokens per side) may exceed context window for single-call triage.~~ **Resolved**: `SKIPPED_TOO_LARGE` verdict handles this. Only 2 files hit the limit in real testing (README.md, tax_smooth.md).
2. ~~**Backport confidence threshold**: Default 0.6~~ **Validated**: 0.6 works well. Real BUG_FIX findings came in at 0.85-0.97. Lower-confidence suggestions (0.6-0.7) are borderline but worth flagging.
3. ~~**Multi-section changes**: Group in one suggestion or separate?~~ **Resolved**: Separate per-section suggestions. Each gets its own category, confidence, and reasoning.
4. ~~**TARGET-only files**: Flag for addition to SOURCE, or just report?~~ **Resolved**: `status` reports only (diagnostic tool). Action on `TARGET_ONLY` / `SOURCE_ONLY` belongs to Phase 3 commands.
5. **Run frequency**: Monthly default, option for more frequent? — Decide in Phase 4
6. **backward-sync PR format**: Should `backward-sync` create PRs directly, or write files for manual PR creation? — Decide in Phase 3
7. **Report-driven backward-sync**: The `--from-report` flag reads a backward JSON report and syncs only marked suggestions. Exact UX for "marking accepted" TBD. — Decide in Phase 3
8. **Stage 1 precision**: Flagging rate was ~67% vs estimated 5-10%. High recall is good, but Stage 1 could be tuned to reduce false positives and save Stage 2 costs. — Address in Phase 4 prompt tuning
9. **Whole-file vs section-by-section translation**: Backward Stage 2 showed ~6x fewer API calls and better quality with whole-file evaluation. Should forward sync (`translator.ts`) adopt the same pattern? Trade-off: better context vs loss of section-level caching in UPDATE mode. — Investigate in Phase 7

---

## Next Steps

Phase 0, Phase 1, and Phase 2 are complete. **Start Phase 3** with backward-sync and forward commands.

### Lessons from Phase 1 Real-World Testing

- **Temporal context is critical**: Without the interleaved commit timeline, the LLM makes directional errors (flagging SOURCE's newer code as a TARGET improvement). Adding timeline to prompts eliminated this class of false positive.
- **Two-stage design validated**: Stage 1 correctly flags differences; Stage 2 correctly filters non-actionable ones. The cost savings are real (~$0.01 triage vs ~$0.10-0.50 per-section analysis).
- **Real repo names**: The zh-cn repo for `lecture-python-intro` is `lecture-intro.zh-cn` (not `lecture-python-intro.zh-cn`).

### Lessons from Phase 2 Bulk Testing

- **Whole-file evaluation wins**: Refactoring Stage 2 from per-section (182 calls) to per-file (32 calls) produced better results — more high-confidence findings, less noise, and ~6x fewer API calls. Cross-section context helps the LLM avoid false positives.
- **5-way parallelism** is the sweet spot — fast enough to complete 51 files in ~4 minutes, without overwhelming the API.
- **Buffered logging** is essential for parallel work — interleaved output from concurrent files is unreadable.
- **Progress bar** provides much better UX than scrolling output — users see status at a glance, details go to log file.
- **Fresh start by default** (wipe output folder) is more intuitive than accumulating stale results. `--resume` is the opt-in for incremental runs.
- **Date-only folder naming** (`backward-2026-03-04`) is cleaner than timestamped (`backward-2026-03-04_01-38-48`). Same-day re-runs overwrite, which matches the fresh-start default.
- **Stage 1 flagging rate** was ~67% (33/49 files flagged), much higher than the estimated 5-10%. This suggests the Stage 1 prompt has high recall (good — false negatives are worse than false positives) but precision could be improved. Stage 2 effectively filters: only 20 suggestions survived from 33 flagged files.

---

*Last updated: 2026-03-04*

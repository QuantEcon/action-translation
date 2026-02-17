# PLAN: Development Roadmap

**Created**: 2026-02-16  
**Sources**: 2026-02-16-REVIEW.md, docs/DESIGN-RESYNC.md (formerly PLAN-TOOL-RESYNC.md)  
**Current Version**: v0.7.0  
**Test Status**: 316 tests passing (15 test suites)

---

## Overview

This plan combines three work streams into a single prioritized roadmap:

1. **Code Health** — Address technical review findings to strengthen the foundation
2. **Resync Tool** — Build the CLI tool for backward analysis and forward sync
3. **Cleanup** — Remove deprecated tools and improve repo hygiene

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

## Phase 1: Resync CLI — Single-File Backward (3-4 days)

**Goal**: Validate LLM prompts and report format with minimal scope  
**Prerequisite**: Phase 0.1 (orchestrator extraction for module reuse)

### 1.1 Directory Structure & CLI Scaffolding

- [ ] Create `src/cli/` directory structure:
  ```
  src/cli/
  ├── index.ts                  # CLI entry point (commander.js)
  ├── types.ts                  # CLI-specific types
  ├── section-matcher.ts        # Cross-language section matching
  ├── git-metadata.ts           # File-level git dates
  ├── backward-evaluator.ts   # LLM backward analysis
  ├── report-generator.ts       # Markdown/JSON output
  ├── commands/
  │   ├── backward.ts           # resync backward command
  │   ├── forward.ts            # resync forward command
  │   └── status.ts             # resync status command
  └── __tests__/
      ├── section-matcher.test.ts
      ├── backward.test.ts
      └── fixtures/
  ```
- [ ] Install `commander` dependency
- [ ] Configure `package.json` `bin` entry for `resync` command
- [ ] Add CLI build script (separate from action build)

### 1.2 CLI Types (`src/cli/types.ts`)

- [ ] `SectionPair` interface (sourceSection, targetSection, status)
- [ ] `SectionSyncStatus` type (SOURCE_ONLY, TARGET_ONLY, SOURCE_CHANGED, TARGET_CHANGED, BOTH_CHANGED, IN_SYNC)
- [ ] `BackportSuggestion` interface (category, confidence, summary, changes)
- [ ] `BackportCategory` enum (BUG_FIX, CLARIFICATION, EXAMPLE, CODE_IMPROVEMENT, I18N_ONLY, NO_CHANGE)
- [ ] `FileGitMetadata` interface (lastModified, lastCommit, lastAuthor)
- [ ] `BackportReport` interface (file, sections, suggestions, metadata)

### 1.3 Section Matcher (`src/cli/section-matcher.ts`)

Cross-language section matching (different from `diff-detector.ts` which is same-language):

- [ ] `matchSections()` function
  - Position-based matching (1st ↔ 1st)
  - Heading-map lookup for validation
  - Handle SOURCE_ONLY sections
  - Handle TARGET_ONLY sections
  - Handle matched pairs
- [ ] Reuse `MystParser` from `parser.ts` for both languages
- [ ] Reuse `extractHeadingMap()` from `heading-map.ts`
- [ ] Unit tests for section matching

### 1.4 Git Metadata (`src/cli/git-metadata.ts`)

- [ ] `getFileGitMetadata()` function
  - `git log -1 --format="%H %ai %an"` per file
  - Parse date, commit SHA, author
  - Handle missing files gracefully
- [ ] Unit tests

### 1.5 Backward Evaluator (`src/cli/backward-evaluator.ts`)

- [ ] Design backward evaluation prompt (from docs/DESIGN-RESYNC.md Section "LLM Prompt Design")
  - SOURCE content, TARGET content, file dates, section heading
  - Structured JSON response format
- [ ] `evaluateSection()` function
- [ ] Parse and validate LLM JSON response
- [ ] Use retry logic from Phase 0.2
- [ ] Unit tests (mocked LLM)

### 1.6 Report Generator (`src/cli/report-generator.ts`)

- [ ] Markdown report output:
  - File header with metadata
  - Per-section suggestions with confidence and category
  - Original vs suggested text
  - Reasoning explanations
- [ ] JSON report output (for automation)
- [ ] Unit tests

### 1.7 Backward Command (`src/cli/commands/backward.ts`)

- [ ] Parse CLI arguments: `-f`, `-s`, `-t`, `-o`, `-l`
- [ ] Load and parse SOURCE and TARGET files
- [ ] Extract heading-map from TARGET
- [ ] Match sections
- [ ] Get git metadata
- [ ] Evaluate each section pair via LLM
- [ ] Generate and write report

### 1.8 Test Fixtures & Validation

- [ ] Create paired fixture repos (see Testing Strategy below for full structure):
  - `aligned-pair/` — faithful translation, no suggestions expected
  - `bug-fix-in-target/` — TARGET corrected a formula error
  - `i18n-only-changes/` — TARGET has only font/punctuation changes
  - `missing-heading-map/` — tests graceful degradation
  - `section-count-mismatch/` — TARGET has extra or missing sections
- [ ] Validate against `cagan_adaptive.md` (benchmark from previous tool attempts)
- [ ] Compare output quality with tool-onboarding results
- [ ] Add snapshot tests for report-generator output (markdown + JSON)

**Phase 1 Deliverable**: Working `npx resync backward -f file.md` command

---

## Phase 2: Resync CLI — Bulk Analysis & Status (2-3 days)

**Goal**: Scale to full repository analysis + quick diagnostic command

### 2.1 Status Command (`src/cli/commands/status.ts`)

No LLM calls — fast and free diagnostic:

- [ ] Check heading-map presence in each TARGET file
- [ ] Detect structural differences (section count mismatch)
- [ ] Compare file modification dates (git metadata)
- [ ] Report per-file sync status:
  - ALIGNED — structure matches, heading-map present
  - DRIFT — structural differences detected
  - MISSING_HEADINGMAP — no heading-map in TARGET
  - SOURCE_ONLY — file missing in TARGET
  - TARGET_ONLY — file missing in SOURCE
- [ ] Output summary table
- [ ] Support `--json` flag
- [ ] Unit tests

### 2.2 Bulk Backward Processing

- [ ] File discovery (find all `.md` files in docs folder)
- [ ] Progress indicator (console output: `[12/51] analyzing cobweb.md...`)
- [ ] Sequential processing (respect API rate limits)
- [ ] Aggregate results across files
- [ ] Cost estimation (`--estimate` flag)
  - Count sections needing analysis
  - Calculate estimated API cost (~$0.05/file)
  - Calculate estimated time
  - Prompt user to proceed (y/N)
- [ ] Summary report across all files

### 2.3 Output Formats

- [ ] `--json` flag for backward command
- [ ] `--json` flag for status command
- [ ] Define stable JSON schema
- [ ] Document JSON output format

**Phase 2 Deliverable**: `npx resync status` + full-repo `npx resync backward`

---

## Phase 3: Resync CLI — Forward Sync (2-3 days)

**Goal**: Implement SOURCE → TARGET sync via CLI

### 3.1 Forward Command (`src/cli/commands/forward.ts`)

- [ ] Parse CLI arguments (reuse common options)
- [ ] Support `--dry-run` flag
- [ ] Support single-file mode (`-f`)
- [ ] Support full directory mode

### 3.2 Sync Logic

Reuse modules from action-translation:

- [ ] Parse SOURCE and TARGET sections (via `parser.ts`)
- [ ] Match sections (via `section-matcher.ts`)
- [ ] For SOURCE_CHANGED sections:
  - Get old translation from TARGET
  - Translate using UPDATE mode (via `translator.ts`)
  - Replace section in TARGET
- [ ] For SOURCE_ONLY sections:
  - Translate using NEW mode
  - Insert at correct position
- [ ] For TARGET_ONLY sections (deleted in SOURCE):
  - Remove from TARGET
- [ ] Preserve heading-map (via `heading-map.ts`)
- [ ] Preserve frontmatter

### 3.3 Output

- [ ] Write updated TARGET files to disk
- [ ] Sync summary report (sections translated, unchanged, errors)
- [ ] Dry-run mode: diff-style preview without file modification

**Phase 3 Deliverable**: Working `npx resync forward` command

---

## Phase 4: Refinement & Documentation (2-3 days)

**Goal**: Production-ready CLI

### 4.1 Integration Testing

- [ ] Test with `lecture-python-intro` ↔ `lecture-intro.zh-cn`
- [ ] Test with `lecture-python` ↔ `lecture-python.zh-cn`
- [ ] Add CLI smoke tests (invoke commands as external processes)
- [ ] Add LLM prompt snapshot tests (catch unintended prompt drift)
- [ ] Document edge cases found
- [ ] Fix bugs discovered

### 4.2 Prompt Tuning

- [ ] Review backward suggestions from Phase 1-2 runs
- [ ] Identify false positives and false negatives
- [ ] Adjust prompts based on findings
- [ ] Re-run validation tests

### 4.3 Error Handling

- [ ] Missing source/target files
- [ ] Malformed frontmatter
- [ ] API timeout/rate limit
- [ ] Invalid heading-map
- [ ] Graceful degradation with warnings

### 4.4 Documentation

- [ ] CLI README (`src/cli/README.md`)
- [ ] Update main README with resync CLI section
- [ ] Update `docs/INDEX.md`
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
| **Unit tests** | ~5ms each | Free | Individual functions (matcher, evaluator, generator) | Every commit |
| **Fixture integration** | ~50ms each | Free | Cross-language pipeline with paired repo fixtures | Every commit |
| **Snapshot tests** | ~10ms each | Free | Report format stability (markdown + JSON output) | Every commit |
| **Git integration** | ~200ms each | Free | Git metadata extraction with temp repos | Every commit |
| **CLI smoke tests** | ~1s each | Free | Full command execution with `--test` flag | Every commit |
| **Real repo tests** | ~30s each | Free (test mode) | Full pipeline against real lecture repos | Pre-release |
| **LLM prompt regression** | ~5s each | ~$0.05 each | Prompt quality (golden responses) | Weekly / pre-release |
| **GitHub Action tests** | ~2min each | Free (test mode) | Full PR workflow via tool-test-action-on-github | Pre-release |

### Layer 1: Unit Tests (existing pattern)

Each CLI module gets a corresponding test file. CLI modules are pure functions (no GitHub API, no Actions context) making them easy to test thoroughly.

### Layer 2: Paired Fixture Repos (new — biggest opportunity)

Current fixtures are same-language triplets (old English → new English → current Chinese). The CLI needs **cross-language pairs** where both sides are controlled:

```
src/cli/__tests__/fixtures/
├── aligned-pair/              # No suggestions expected
│   ├── source/lectures/intro.md
│   └── target/lectures/intro.md  # faithful translation + heading-map
├── bug-fix-in-target/         # backward should detect BUG_FIX
│   ├── source/lectures/cobweb.md
│   └── target/lectures/cobweb.md # fixed formula error
├── i18n-only-changes/         # backward should filter out (NO_BACKPORT)
│   ├── source/lectures/growth.md
│   └── target/lectures/growth.md # only font/punctuation changes
├── missing-heading-map/       # Tests graceful degradation
├── section-count-mismatch/    # TARGET has extra section
└── structural-drift/          # Sections reordered
```

The `status` command can be tested entirely with fixtures. The `backward` command uses fixtures + a mock LLM evaluator.

### Layer 3: Snapshot Tests (new — natural fit for reports)

The `report-generator.ts` module produces markdown and JSON reports — ideal for snapshot testing:

```typescript
it('generates correct markdown report for bug-fix suggestion', () => {
  const report = generateMarkdownReport('cobweb.md', suggestions, metadata);
  expect(report).toMatchSnapshot();
});
```

Catches unintentional formatting changes; makes report output a reviewable artifact.

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

A `--test` flag (like existing TEST mode) skips real LLM calls and uses deterministic responses. Validates argument parsing, file I/O, and full orchestration.

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
  const prompt = buildBackwardPrompt(sourceSection, targetSection, metadata);
  expect(prompt).toMatchSnapshot();
});
```

**b) Golden response tests** (costs ~$0.05/test, weekly) — verify real LLM responses for known fixtures produce expected verdicts:

```typescript
it('correctly identifies bug fix in cobweb equilibrium equation', async () => {
  const result = await evaluateSection(sourceSection, targetSection, metadata);
  expect(result.recommendation).toBe('BACKPORT');
  expect(result.category).toBe('BUG_FIX');
  expect(result.confidence).toBeGreaterThan(0.8);
});
```

Run as a separate test suite, not on every commit.

### Test Organization

```
src/cli/__tests__/
├── section-matcher.test.ts      # Layer 1: unit
├── git-metadata.test.ts         # Layer 4: temp git repos
├── backward-evaluator.test.ts   # Layer 1: mocked LLM + Layer 7a: prompt snapshots
├── report-generator.test.ts     # Layer 3: snapshot tests
├── status.test.ts               # Layer 2: fixture integration
├── backward.test.ts             # Layer 2: fixture integration + Layer 5: CLI smoke
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
- [ ] Create workflow template: monthly backward report
- [ ] Create workflow template: monthly status check
- [ ] Confidence-based actions:
  - HIGH (≥0.85): Auto-create PR in SOURCE
  - MEDIUM (0.6-0.85): Create issue for review
  - LOW (<0.6): Report only
- [ ] Documentation: "Setting up automated resync"

---

## Success Metrics

### Quality

| Metric | Target |
|--------|--------|
| Backport precision | ≥80% (suggestions accepted by reviewers) |
| Backport recall | ≥70% (real improvements detected) |
| Sync accuracy | ≥95% (correct translations) |
| False positive rate | ≤10% |

### Performance

| Metric | Target |
|--------|--------|
| Single file backward | <30 seconds |
| Full series (51 files) | <10 minutes |
| API cost per file | ~$0.05 (backward), ~$0.10 (forward) |
| Status check | <5 seconds (no LLM) |

### Code Health

| Metric | Current | Target |
|--------|---------|--------|
| Test count | 316 | 380+ |
| `index.ts` lines | 766 | <150 |
| Deprecated methods | 3 | 0 |
| `eslint-disable` comments | 6 | ≤2 |
| Dead tool directories | 2 | 0 |

---

## Timeline Summary

| Phase | Duration | Dependencies | Key Deliverable |
|-------|----------|--------------|-----------------|
| **Phase 0**: Foundation | 3-4 days | None | `index.ts` refactored, retry logic |
| **Phase 1**: Single-file backward | 3-4 days | Phase 0 | `npx resync backward -f file.md` |
| **Phase 2**: Bulk + status | 2-3 days | Phase 1 | `npx resync status` + bulk backward |
| **Phase 3**: Forward | 2-3 days | Phase 1 | `npx resync forward` |
| **Phase 4**: Refinement | 2-3 days | Phase 2, 3 | Production-ready CLI |
| **Phase 5**: Cleanup | 1 day | Any time | Clean repo |
| **Phase 6**: Automation | 2-3 days | Phase 4 | Scheduled GitHub Actions |

**Total**: 13-20 days (Phase 0-4), +3-4 days (Phase 5-6)

---

## Open Questions

1. **Backport confidence threshold**: Default 0.6 — validate with real data in Phase 1
2. **Multi-section changes**: Group in one suggestion or separate? — Decide in Phase 1
3. **TARGET-only files**: Flag for addition to SOURCE, or just report? — Decide in Phase 2
4. **Run frequency**: Monthly default, option for more frequent? — Decide in Phase 4
5. **`index.ts` refactoring scope**: Should PR creation use atomic Git Tree API? — Decide in Phase 0

---

## Next Steps

**Start with Phase 0.3** (quick cleanup) to get easy wins, then proceed to **Phase 0.1** (orchestrator extraction) as the critical path item.

---

*Last updated: 2026-02-18*

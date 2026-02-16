# PLAN: Development Roadmap

**Created**: 2026-02-16  
**Sources**: 2026-02-16-REVIEW.md, docs/DESIGN-RESYNC.md (formerly PLAN-TOOL-RESYNC.md)  
**Current Version**: v0.7.0  
**Test Status**: 266 tests passing

---

## Overview

This plan combines three work streams into a single prioritized roadmap:

1. **Code Health** — Address technical review findings to strengthen the foundation
2. **Resync Tool** — Build the CLI tool for backport analysis and forward sync
3. **Cleanup** — Remove deprecated tools and improve repo hygiene

The plan is sequenced so that foundational improvements (especially `index.ts` refactoring) unblock the resync tool work.

---

## Phase 0: Foundation (Pre-Resync Prerequisites)

**Goal**: Address critical review findings that directly unblock resync CLI development  
**Estimated effort**: 3-4 days

### 0.1 Extract Sync Orchestration from `index.ts` (HIGH PRIORITY)

`index.ts` is 766 lines combining GitHub Action entry point with full sync orchestration logic. This blocks CLI reuse for the resync tool.

**Tasks**:
- [ ] Create `src/sync-orchestrator.ts` — extracted sync logic
  - File classification (markdown, TOC, renamed, removed)
  - Translation dispatch (section-based vs full)
  - Document reconstruction coordination
  - Error aggregation across files
- [ ] Create `src/pr-creator.ts` — PR creation logic
  - Branch creation
  - File commits (consider atomic commits via Git Tree API)
  - PR body generation
  - Label and reviewer assignment
- [ ] Slim `index.ts` to ~100 lines of GitHub Action glue
  - Mode routing
  - Input fetching
  - GitHub API content fetching
  - Delegating to orchestrator and PR creator
- [ ] Add tests for `sync-orchestrator.ts`
  - Multi-file processing
  - Error recovery (one file fails, others continue)
  - File filtering logic

### 0.2 Add Retry Logic to Translator (MEDIUM PRIORITY)

Translation API calls have no retry mechanism. Network blips and rate limits cause hard failures.

**Tasks**:
- [ ] Add exponential backoff retry in `translator.ts` (3 attempts: 1s, 2s, 4s)
- [ ] Retry on: `RateLimitError`, `APIConnectionError`, transient `APIError` (5xx)
- [ ] Skip retry on: `AuthenticationError`, `BadRequestError`, document-too-large
- [ ] Add tests for retry behavior

### 0.3 Quick Cleanup

- [ ] Remove deprecated `findTargetSectionIndex()` from `file-processor.ts`
- [ ] Remove deprecated `findMatchingSectionIndex()` from `file-processor.ts`
- [ ] Remove dead `findSourceSectionIndex()` method (always returns -1)
- [ ] Add `coverage/` to `.gitignore`
- [ ] Run tests to confirm no regressions

---

## Phase 1: Resync CLI — Single-File Backport (3-4 days)

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
  ├── backport-evaluator.ts     # LLM backport analysis
  ├── report-generator.ts       # Markdown/JSON output
  ├── commands/
  │   ├── backport.ts           # resync backport command
  │   ├── sync.ts               # resync sync command
  │   └── status.ts             # resync status command
  └── __tests__/
      ├── section-matcher.test.ts
      ├── backport.test.ts
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

### 1.5 Backport Evaluator (`src/cli/backport-evaluator.ts`)

- [ ] Design backport evaluation prompt (from docs/DESIGN-RESYNC.md Section "LLM Prompt Design")
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

### 1.7 Backport Command (`src/cli/commands/backport.ts`)

- [ ] Parse CLI arguments: `-f`, `-s`, `-t`, `-o`, `-l`
- [ ] Load and parse SOURCE and TARGET files
- [ ] Extract heading-map from TARGET
- [ ] Match sections
- [ ] Get git metadata
- [ ] Evaluate each section pair via LLM
- [ ] Generate and write report

### 1.8 Test Fixtures & Validation

- [ ] Create fixture: aligned file pair (no backports)
- [ ] Create fixture: file with bug fix in TARGET
- [ ] Create fixture: file with i18n-only changes
- [ ] Create fixture: file with missing heading-map
- [ ] Validate against `cagan_adaptive.md` (benchmark from previous tool attempts)
- [ ] Compare output quality with tool-onboarding results

**Phase 1 Deliverable**: Working `npx resync backport -f file.md` command

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

### 2.2 Bulk Backport Processing

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

- [ ] `--json` flag for backport command
- [ ] `--json` flag for status command
- [ ] Define stable JSON schema
- [ ] Document JSON output format

**Phase 2 Deliverable**: `npx resync status` + full-repo `npx resync backport`

---

## Phase 3: Resync CLI — Forward Sync (2-3 days)

**Goal**: Implement SOURCE → TARGET sync via CLI

### 3.1 Sync Command (`src/cli/commands/sync.ts`)

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

**Phase 3 Deliverable**: Working `npx resync sync` command

---

## Phase 4: Refinement & Documentation (2-3 days)

**Goal**: Production-ready CLI

### 4.1 Integration Testing

- [ ] Test with `lecture-python-intro` ↔ `lecture-intro.zh-cn`
- [ ] Test with `lecture-python` ↔ `lecture-python.zh-cn`
- [ ] Document edge cases found
- [ ] Fix bugs discovered

### 4.2 Prompt Tuning

- [ ] Review backport suggestions from Phase 1-2 runs
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
- [ ] Create workflow template: monthly backport report
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
| Single file backport | <30 seconds |
| Full series (51 files) | <10 minutes |
| API cost per file | ~$0.05 (backport), ~$0.10 (sync) |
| Status check | <5 seconds (no LLM) |

### Code Health

| Metric | Current | Target |
|--------|---------|--------|
| Test count | 266 | 320+ |
| `index.ts` lines | 766 | <150 |
| Deprecated methods | 3 | 0 |
| `eslint-disable` comments | 6 | ≤2 |
| Dead tool directories | 2 | 0 |

---

## Timeline Summary

| Phase | Duration | Dependencies | Key Deliverable |
|-------|----------|--------------|-----------------|
| **Phase 0**: Foundation | 3-4 days | None | `index.ts` refactored, retry logic |
| **Phase 1**: Single-file backport | 3-4 days | Phase 0 | `npx resync backport -f file.md` |
| **Phase 2**: Bulk + status | 2-3 days | Phase 1 | `npx resync status` + bulk backport |
| **Phase 3**: Forward sync | 2-3 days | Phase 1 | `npx resync sync` |
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

*Last updated: 2026-02-16*

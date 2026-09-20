# GitHub Action Test Tool

This tool provides automated testing of the `action-translation` GitHub Action using real GitHub repositories.

## Overview

The test script creates and manages test PRs in source and target repositories to validate that the translation sync workflow functions correctly across various scenarios.

**Two-phase workflow:**
1. **Test Phase** (`test-action-on-github.sh`): Run test scenarios, create PRs
2. **Evaluation Phase** (`evaluate/`): Review translation quality with Opus 4.5

**Note**: The evaluation functionality is now also available as the action's **review mode**, which can be run directly in CI/CD workflows.

## Prerequisites

- GitHub CLI (`gh`) installed and authenticated
- Push access to test repositories
- `gh` token carrying the `workflow` scope — the harness writes `.github/workflows/` to all four repos
- For evaluation: `ANTHROPIC_API_KEY` and `GITHUB_TOKEN` environment variables

## Test Repositories

| Repository | Purpose | URL |
|------------|---------|-----|
| **Source** | English content, triggers sync | `QuantEcon/test-translation-sync` |
| **Target (zh-cn)** | Chinese translations (built from source) | `QuantEcon/test-translation-sync.zh-cn` |
| **Target (fa)** | Farsi translations | `QuantEcon/test-translation-sync.fa` |
| **Target (ml)** | Malayalam translations | `QuantEcon/test-translation-sync.ml` |

Each test PR triggers one sync workflow **per language**.

### Which version gets tested

**One ref, every workflow.** The harness writes all nine workflow files across all four repos — one sync workflow per language in the source repo, plus `review-translations.yml` and `rebase-translations.yml` in each target — and pins every one of them to the same ref. It prints a per-workflow census before creating any PRs, so "this run tested version X" is falsifiable rather than asserted.

The ref defaults to `main`, which is the code you are working on. Override it for release gating:

```bash
./test-action-on-github.sh                       # main HEAD (development)
./test-action-on-github.sh --action-ref vX.Y.Z   # a specific release (the gate)
./test-action-on-github.sh --action-ref v0       # the floating tag (post-release smoke)
```

The script fails immediately if the ref does not exist on the remote, rather than letting 26 workflow runs fail at resolution. A raw commit SHA is not accepted — `git ls-remote` cannot verify one, and pinning to a ref the script cannot confirm exists is the failure mode this replaced.

Because every workflow uses the marketplace form `uses: QuantEcon/action-translation@<ref>` rather than checking out and building locally, **uncommitted code cannot be tested — push the branch first**. The committed `dist-action/` bundle is what executes either way, so nothing is lost, and this form additionally exercises ref resolution on every workflow on every run.

### The release sequence

| Step | Command | What it proves |
|---|---|---|
| 1 | `./test-action-on-github.sh` | `main` works before you cut anything |
| 2 | — | cut the release |
| 3 | `./test-action-on-github.sh --action-ref vX.Y.Z` | the *tagged bytes* work — this is the gate |
| 4 | — | move the `v0` alias |
| 5 | `./test-action-on-github.sh --action-ref v0` | the floating tag resolves to the new release |

Step 5 is what keeps [#109](https://github.com/QuantEcon/action-translation/issues/109)'s floating-tag check alive. It used to be embedded in every run by leaving the target-repo workflows permanently on `@v0`, which meant a single run tested two versions at once and a freshly-cut release was never covered by the review half at all ([#202](https://github.com/QuantEcon/action-translation/issues/202)). Moving the check *after* the tag move is the only point where its answer means anything.

### Adding a language

One line in the `LANGUAGES` array in `test-action-on-github.sh`, plus three base fixtures (`base-minimal-<code>.md`, `base-lecture-<code>.md`, `base-toc-<code>.yml`). Everything else — target repo name, sync workflow, reset, PR cleanup, summary — derives from the code. Seed the fixtures with `translate init` so they carry the current `translation:` frontmatter and pass the structural parity guard; do not hand-write them.

### Cost

**TEST mode makes real, billed Claude API calls.** `test-mode` suppresses PR side effects (failure issues, success comments), not model calls. A three-language run is ~78 **sync** runs plus ~78 **review** runs — this PR is what installs `review-translations.yml` in every target, so each translation PR now fires a second billed call. The ~1.4M input tokens measured across two languages **pre-dates that review coverage** and therefore undercounts the current cost; treat it as a floor, not an estimate. Prefer `--action-ref main` during development over re-running the full matrix.

## Usage

### Phase 1: Run Test Scenarios

```bash
cd /path/to/action-translation/tool-test-action-on-github
./test-action-on-github.sh
```

The script will:
1. Reset test repositories to clean state
2. Run 28 automated test scenarios
3. Create PRs in source repository with `test-translation` label
4. Label triggers action → creates translation PRs in **every** target repository
5. Report results

Both source and target PRs remain **open** for evaluation.

### Phase 2: Evaluate Translation Quality

```bash
cd evaluate
npm install
npm run evaluate              # Evaluate all open PR pairs
npm run evaluate -- --pr 123  # Evaluate specific source PR
npm run evaluate:dry-run      # Preview without posting reviews
npm run evaluate:post         # Post reviews to target PRs
```

Evaluation uses **Claude Opus 4.5** to assess:
- **Translation quality**: Accuracy, fluency, terminology, formatting
- **Diff quality**: Scope, position, structure, heading-map correctness

Reports are saved to `reports/evaluation-<date>.md`.

## Test Scenarios (28 total)

The tool tests translation scenarios across four phases:

### Phase 1: Basic Structure (Tests 01–08, minimal doc)
| # | Scenario | Description |
|---|----------|-------------|
| 01 | Intro change | Intro text updated |
| 02 | Title change | Title changed |
| 03 | Section content | Section content updated |
| 04 | Section reorder | Sections reordered and content changed |
| 05 | Add section | New section added |
| 06 | Delete section | Section removed |
| 07 | Subsection change | Subsection content updated |
| 08 | Multi-element | Multiple elements changed |

### Phase 2: Scientific Content (Tests 09–16)
| # | Scenario | Description |
|---|----------|-------------|
| 09 | Real-world lecture | Realistic lecture update |
| 10 | Add `####` | Sub-subsection added |
| 11 | Change `####` | Sub-subsection content changed |
| 12 | Code cells | Code cell comments/titles changed |
| 13 | Display math | Math equations changed |
| 14 | Delete `###` | Subsection deleted (Matrix Operations) |
| 15 | Delete `####` | Sub-subsection deleted (Closure Property) |
| 16 | Pure reorder | Pure section reorder (no content change) |

### Phase 3: Document Lifecycle (Tests 17–20)
| # | Scenario | Description |
|---|----------|-------------|
| 17 | New document | New document added (game-theory.md + TOC) |
| 18 | Delete document | Document deleted (lecture.md + TOC) |
| 19 | Multi-file | Multiple files changed (minimal + lecture) |
| 20 | Rename document | Document renamed (lecture.md → linear-algebra.md + TOC) |

### Phase 4: Edge Cases (Tests 21–26)
| # | Scenario | Description |
|---|----------|-------------|
| 21 | Preamble only | Only frontmatter changed, no content |
| 22 | Deep nesting | `#####` and `######` level subsections |
| 23 | Special characters | Headings with `code`, **bold**, [links], $math$ |
| 24 | Empty sections | Sections with headings but no content |
| 25 | Pre-title content | Anchor (`(label)=`) + `{raw}` block before `# title` |
| 26 | Heading case change | Title-case → sentence-case headings (heading-map lookup) |

### Phase 5: Shared Assets (Test 27)
| # | Scenario | Description |
|---|----------|-------------|
| 27 | Citation backfill | `{cite}` role introduced; the cited key lives in the source's `references.bib` but not the target's, so the sync PR must carry the backfilled entry (#117; verifies action-translation#256 defect 3). The target repos' `_config.yml` + `references.bib` fixtures are what arm the guard — see `base-config.yml`. |
| 28 | Exercise family added | An `## Exercises` section with `{exercise-start}`/`{hint}`/`{solution-start}` blocks is appended to `lecture.md` — the first exercise-family directives in the suite. On `.ml` the sync output must carry every block byte-identical to the source (verbatim-directive policy, `D-2026-09-03-ml-all-exercise-content-stays-english`, enforced by `verbatim-directives.ts` and the `verbatimDirectives` diff-check); on `.zh-cn` and `.fa` the blocks translate as ordinary prose. |

## Directory Structure

```
tool-test-action-on-github/
├── test-action-on-github.sh     # Main test script
├── test-action-on-github-data/  # Test scenario files
│   ├── sync-workflow-template.yml  # ONE sync workflow, rendered per language
│   ├── base-minimal.md          # Base English doc
│   ├── base-minimal-<lang>.md   # Base translated doc, one per LANGUAGES entry
│   ├── 01-intro-change-*.md     # Test scenarios
│   └── ...
├── evaluate/                     # Quality evaluation tool
│   ├── src/
│   │   ├── evaluate.ts          # CLI entry point
│   │   ├── evaluator.ts         # Opus 4.5 evaluation
│   │   ├── github.ts            # PR fetching
│   │   └── types.ts             # TypeScript types
│   ├── package.json
│   └── tsconfig.json
├── reports/                      # Evaluation reports
│   └── evaluation-*.md
└── README.md
```

## Test Mode

The script uses **TEST mode**, which changes exactly two things — see `isTestMode` in `src/index.ts`:
- Uses the PR head commit rather than the merge commit, so an OPEN PR can drive a sync
- Suppresses post-sync notifications (failure issues and success comments)
- **Triggered by adding the `test-translation` label** to source PRs

**It does NOT skip translation and is NOT free.** Every sync and review still makes real, billed Claude calls — measured at 23k–103k input tokens per sync run. The name is misleading; treat a TEST-mode run as a full-price run that keeps its side effects off the source PR.

### Label-Triggered Workflow

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. test-action-on-github.sh creates source PRs                     │
│     PRs are open with `test-translation` label                      │
└───────────────────────────┬─────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  2. Label triggers GitHub Action (no merge required)                │
│     Action creates translation PRs in target repo                   │
└───────────────────────────┬─────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  3. Both source & target PRs remain OPEN for evaluation             │
│     Run `npm run evaluate` to assess translation quality            │
└─────────────────────────────────────────────────────────────────────┘
```

This allows evaluation of PR pairs **before merging** anything.

## Evaluation Details

The evaluation tool (`evaluate/`) uses Claude Opus 4.5 to assess:

### Translation Quality (weighted 35/25/25/15)
- **Accuracy**: Does it convey the English meaning correctly?
- **Fluency**: Does it read naturally in Chinese?
- **Terminology**: Is technical vocabulary consistent?
- **Formatting**: Is MyST/LaTeX/code preserved?

### Diff Quality (binary checks)
- **Scope Correct**: Only intended files modified?
- **Position Correct**: Changes in same document locations?
- **Structure Preserved**: Document hierarchy maintained?
- **Heading-map Correct**: Frontmatter updated properly?

### Verdicts
- **PASS** (✅): Overall ≥8, Diff ≥8
- **WARN** (⚠️): Overall ≥6, Diff ≥6
- **FAIL** (❌): Below thresholds

## Reports

Evaluation reports are saved to `reports/`:
- `evaluation-YYYY-MM-DD.md` - Daily evaluation reports
- `evaluation-github-tests-*.md` - Historical assessments

## Troubleshooting

**Script fails to reset repositories:**
- Check GitHub CLI authentication: `gh auth status`
- Verify repository access permissions

**PRs not created:**
- Check source repository workflow configuration
- Verify GitHub token has correct permissions

**Translation PRs not appearing:**
- Check GitHub Actions logs in source repository
- Verify target repository exists and is accessible

**Evaluation fails:**
- Check `ANTHROPIC_API_KEY` is set
- Check `GITHUB_TOKEN` has repo access
- Verify PRs have `test-translation` label

## See Also

- [Main Documentation](../docs/INDEX.md)
- [Testing Guide](../docs/TESTING.md)
- [Test Repositories Setup](../docs/TEST-REPOSITORIES.md)

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
- Action configured in source repository (zh-cn and fa workflows)
- For evaluation: `ANTHROPIC_API_KEY` and `GITHUB_TOKEN` environment variables

## Test Repositories

| Repository | Purpose | URL |
|------------|---------|-----|
| **Source** | English content, triggers sync | `QuantEcon/test-translation-sync` |
| **Target (zh-cn)** | Chinese translations (built from source) | `QuantEcon/test-translation-sync.zh-cn` |
| **Target (fa)** | Farsi translations (uses published action) | `QuantEcon/test-translation-sync.fa` |

**Note**: The zh-cn workflow checks out & builds `action-translation` from source (for development testing). The fa workflow uses the published action (`@v0.9.0`) to validate the real deployment path. Each test PR triggers **both** workflows.

## Usage

### Phase 1: Run Test Scenarios

```bash
cd /path/to/action-translation/tool-test-action-on-github
./test-action-on-github.sh
```

The script will:
1. Reset test repositories to clean state
2. Run 25 automated test scenarios
3. Create PRs in source repository with `test-translation` label
4. Label triggers action → creates translation PRs in **both** target repositories
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

## Test Scenarios (25 total)

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

### Phase 4: Edge Cases (Tests 21–25)
| # | Scenario | Description |
|---|----------|-------------|
| 21 | Preamble only | Only frontmatter changed, no content |
| 22 | Deep nesting | `#####` and `######` level subsections |
| 23 | Special characters | Headings with `code`, **bold**, [links], $math$ |
| 24 | Empty sections | Sections with headings but no content |
| 25 | Pre-title content | Anchor (`(label)=`) + `{raw}` block before `# title` |

## Directory Structure

```
tool-test-action-on-github/
├── test-action-on-github.sh     # Main test script
├── test-action-on-github-data/  # Test scenario files
│   ├── base-minimal.md          # Base English doc
│   ├── base-minimal-zh-cn.md    # Base Chinese doc
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

The script uses **TEST mode** which:
- Uses PR head commit (not merge commit)
- Skips actual translation (returns placeholder text)
- Validates workflow mechanics without API costs
- **Triggered by adding the `test-translation` label** to source PRs

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

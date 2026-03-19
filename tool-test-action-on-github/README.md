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
2. Run 24 automated test scenarios
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

## Test Scenarios

The tool tests various translation scenarios:

1. **New section added** - Adding new content
2. **Section removed** - Deleting content
3. **Subsection updated** - Modifying nested content
4. **Multiple elements changed** - Complex updates
5. **Real-world lecture** - Realistic content changes
6. **Sub-subsection operations** - Deep nesting (####, #####)
7. **Code cell changes** - Comments and titles
8. **Display math changes** - LaTeX equation updates
9. **Section deletions** - Removing subsections
10. **Pure reordering** - Structure-only changes
11. **New document** - Adding complete files
12. **Document deletion** - Removing files
13. **Multiple files** - Multi-file changes
14. **Document rename** - File renaming
15. **Preamble only** - Metadata changes
16. **Deep nesting** - Complex hierarchies
17. **Special characters** - Edge cases in headings
18. **Empty sections** - Placeholder headings

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

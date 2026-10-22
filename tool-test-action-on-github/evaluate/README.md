# Translation Quality Evaluator

Evaluates translation PRs from the action-translation test suite using Claude Opus.

## Purpose

This tool provides **automated quality assessment** of translation PRs to:
1. Validate translation accuracy, fluency, terminology, and formatting
2. Verify diff correctness (scope, position, structure, heading-map)
3. Generate comprehensive evaluation reports
4. Optionally post reviews directly to GitHub PRs

## Usage

### Prerequisites

```bash
# Install dependencies
npm install

# Set GitHub token
export GITHUB_TOKEN=$(gh auth token)
```

### Commands

```bash
# Evaluate all open PR pairs, save report only
npm run evaluate

# Evaluate and post reviews to PRs
npm run evaluate:post

# Evaluate specific PR
npm run evaluate -- --pr 530

# Save report to specific file
npm run evaluate -- --output custom-report.md

# Adjust max suggestions per PR
npm run evaluate -- --max-suggestions 10
```

## How It Works

### 1. PR Matching

The evaluator automatically matches source and target PRs:

- **Source PRs** (test-translation-sync): Test scenarios with `test-translation` label
- **Target PRs** (test-translation-sync.zh-cn): Translation PRs created by the action with `action-translation` label
- **Matching**: Parses source PR number from target PR body (`### Source PR` section)

### 2. Evaluation Process

For each PR pair:

1. **Fetch source diff**: English before/after from source PR
2. **Fetch target diff**: Chinese before/after from target PR
3. **Identify changed sections**: Which sections were modified
4. **Evaluate translation quality**: Accuracy, fluency, terminology, formatting (focused on changed sections)
5. **Evaluate diff quality**: Scope, position, structure, heading-map correctness
6. **Generate verdict**: PASS (≥8), WARN (≥6), FAIL (<6)
7. **Post review** (optional): Comment on target PR with detailed assessment

### 3. Output

**Report File** (`reports/evaluation-<date>.md`):
- Summary statistics (passed/warned/failed)
- Average scores
- Common issues
- Detailed results for each PR pair

**GitHub Review** (if `--post-reviews` enabled):
- Posted as PR review comment on target PR
- Includes scores, verdict, summary, strengths, issues, suggestions

### 4. Scope runs

A source PR with the `test-sync-scope-existing` label ran under `sync-scope: existing`, the harness's `--sync-scope existing` ([#344](https://github.com/QuantEcon/action-translation/issues/344)). `src/scope-expectations.ts` holds what the run should produce, for every scenario. For 17–20 and the scenarios that change only `lecture.md` (09–15, 22, 23, 25, 26, 28), that is a translation PR: the files it changes and how, and the lectures its body lists under `### Lectures Not Synced`. For the scenarios that change only `lecture-minimal.md` (01–08, 16, 21, 24, 27), it is no translation PR at all. The checks are deterministic and make no model call.

- **17** and **18** translate no lecture, so the check is the whole evaluation.
- **19** and **20** are evaluated on the lecture the expectation names (`lecture.md`, `linear-algebra.md`), not on the first changed `.md`, which for 19 is the lecture the run left out. The diff judge gets only the source files the run was meant to sync, and a note that `sync-scope: existing` left the others out, so 19's `lecture-minimal.md` does not count against scope.
- The scenarios that change only `lecture.md` are held to a PR that changes `lecture.md` and updates `.translate/state/lecture.md.yml`, with no `### Lectures Not Synced` section. They are evaluated on `lecture.md` as usual, and the judge's prompt is the one a run without the label gets.
- A mismatch makes the verdict FAIL, and the review comment and the report list each problem.
- A labelled source PR whose scenario expects a translation PR, and has none, is a failure: the report lists it and the run exits non-zero.
- For the scenarios that change only `lecture-minimal.md`, a translation PR is a failure, decided by the check alone. No translation PR is the expected result only if the source PR's zh-cn sync run passed, because a run that fails opens no PR either. The evaluator reads the check runs of the `sync-translation-zh-cn` job on the source PR's head commit, and ignores the skipped run that the scope label's own labeled event fires. The newest of the rest decides: success is a pass, and any other conclusion, or no run at all, is a failure. A run that has not finished, or check runs the evaluator cannot read (as with a `GITHUB_TOKEN` that cannot read checks), leave the source PR unverified, never passed. The report gives passed, failed and unverified source PRs a row each, and a failed or unverified one makes the run exit non-zero.
- When the model scored no pair, as when every pair is decided by the check alone, the report's average scores read n/a.

The expected results of every scenario are in [`../README.md`](../README.md#scope-runs), "Scope runs".

## Review Posting: GitHub UI Behavior

**Important**: This tool uses `pulls.createReview()` which posts **PR reviews**, not regular comments.

### What This Means

| Aspect | PR Review (this tool) | Issue Comment (action reviewer) |
|--------|----------------------|--------------------------------|
| **API Method** | `pulls.createReview()` | `issues.createComment()` |
| **Appears In** | "Files changed" tab + Timeline | "Conversation" tab |
| **PR List Icon** | ❌ No conversation icon | ✅ Shows conversation icon 💬 |
| **Use Case** | Formal code review assessment | Discussion/feedback thread |
| **Update Behavior** | Creates new review each time | Can update existing comment |

### Why PR Reviews?

PR reviews are the appropriate mechanism for **formal quality assessment**:
- Structured evaluation (not a discussion)
- Appears alongside code changes
- Standard for automated review tools
- Clear separation from conversation threads

The action's reviewer uses issue comments for better visibility in PR lists, since it's meant for ongoing monitoring. The evaluator uses PR reviews since it's a one-time assessment tool.

## Configuration

Hardcoded to QuantEcon test repositories:
- Source: `QuantEcon/test-translation-sync`
- Target: `QuantEcon/test-translation-sync.zh-cn`

To use with different repositories, modify constants in `src/github.ts`:
```typescript
const SOURCE_OWNER = 'QuantEcon';
const SOURCE_REPO = 'test-translation-sync';
const TARGET_OWNER = 'QuantEcon';
const TARGET_REPO = 'test-translation-sync.zh-cn';
```

## Model

Grades with **Claude Opus 4.8** (`claude-opus-4-8`) by default — the judge, not the thing under
test, so it should be the strongest available reviewer.

**When comparing against an existing report, pin the judge to the one that report used**
(its `**Evaluator**:` header records it) — e.g. `--model claude-opus-4-5-20251101` for the
2025-12 baselines. Changing the judge and the translation model together makes a score delta
unattributable to either.

Requires `ANTHROPIC_API_KEY` environment variable (automatically loaded from `.env` if present).

## Output Example

```
Evaluating: Empty sections (heading only) (24 - minimal)
  Source PR #563 → Target PR #530
  Changed sections: ## Microeconomics, ## Macroeconomics, ...
  Evaluating translation quality...
  Evaluating diff quality...
  Posting review to PR...
  PASS: Translation 9.4/10, Diff 10/10
```

## Related Tools

- **Action Reviewer** (`src/reviewer.ts`): Built-in review mode in the action itself
- **Test Script** (`tool-test-action-on-github.sh`): Creates test PRs for evaluation
- **Bulk Translator** (`tool-bulk-translator/`): One-time bulk translation tool

## Development

```bash
# Build TypeScript
npm run build

# Run directly with tsx (no build needed)
npm run evaluate
```

## See Also

- Main documentation: `../../docs/TEST-REPOSITORIES.md`
- Test plan: `../../TEST_PLAN_v0.7.0.md`
- Test script: `../test-action-on-github.sh`

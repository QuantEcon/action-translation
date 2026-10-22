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

The script fails immediately if the ref does not exist on the remote, rather than letting every workflow run fail at resolution. A raw commit SHA is not accepted — `git ls-remote` cannot verify one, and pinning to a ref the script cannot confirm exists is the failure mode this replaced.

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
1. Reset test repositories to clean state — every open PR on the source repo and each target repo is closed, and the script stops if any is still open afterwards (a survivor would be counted as one of this run's PRs)
2. Run 28 automated test scenarios
3. Create PRs in source repository with `test-translation` label
4. Label triggers action → creates translation PRs in **every** target repository
5. Report results

Both source and target PRs remain **open** for evaluation.

### Phase 1b: Rate-check the full-document fixtures

```bash
./rate-check.sh --ref v0.29.2               # at a tag (release checklist 4b)
./rate-check.sh --languages ml --draws 12   # this checkout's build
```

Phase 1 takes **one draw per scenario**. That is the right test of whether the tagged bytes deliver through the action path, but a model-side defect that fails less than always slips through it: scenario 17's new document (`game-theory.md`) was refused by the structural-parity guard on about 40% of draws from v0.28.0 to v0.29.0 and passed three release gates before the rate rose enough to be caught (QuantEcon/action-translation#320). `rate-check.sh` measures the rate directly: it runs the CLI N times (default 12) per fixture and language, counts the draws that produced no output file, prints a table with the refusal reasons, and exits non-zero if any cell shows more than `--max-refusals` (default 1). It costs no GitHub runs — N × fixtures × languages CLI translations against a cached prompt — and `--ref` builds any tag or branch in a temporary worktree with that version's own glossary, so an old release can be measured too. Fixtures default to the files the scenarios introduce as whole new documents (only `game-theory.md` today); add to `--fixtures` when a scenario adds another. Logs, `meta.txt` and `summary.txt` land in `${TMPDIR:-/tmp}/action-translation-rate-check/<timestamp>-<pid>/`, outside the repository; `--summarize <that dir>` re-prints a finished run's table and verdict without new draws. A failing cell is not yet a verdict on the release: AGENTS.md (release checklist step 4b) describes the same-day control at the previous tag that tells a regression from a rate that predates it. Validated on 2026-09-23: v0.29.2 reads 0/12 on `game-theory.md` for `ml`, v0.29.0 (via `--ref`) reads 4/12 and fails — the defect that passed three gates.

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

The tool tests translation scenarios across five phases:

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

### Phase 5: Shared Assets and Directives (Tests 27–28)
| # | Scenario | Description |
|---|----------|-------------|
| 27 | Citation backfill | `{cite}` role introduced; the cited key lives in the source's `references.bib` but not the target's, so the sync PR must carry the backfilled entry (#117; verifies action-translation#256 defect 3). The target repos' `_config.yml` + `references.bib` fixtures are what arm the guard — see `base-config.yml`. |
| 28 | Exercise family added | An `## Exercises` section with `{exercise-start}`/`{hint}`/`{solution-start}` blocks is appended to `lecture.md` — the first exercise-family directives in the suite. On `.ml` the sync output must carry every block byte-identical to the source (verbatim-directive policy, `D-2026-09-03-ml-all-exercise-content-stays-english`, enforced by `verbatim-directives.ts` and the `verbatimDirectives` diff-check); on `.zh-cn` and `.fa` the blocks translate as ordinary prose. |

## Scope runs

`--sync-scope existing` replays the scenarios on a partial edition, the case the action's `sync-scope` input exists for ([#344](https://github.com/QuantEcon/action-translation/issues/344)). Under `existing`, a changed lecture syncs only when the target has its state file, `.translate/state/<file>.yml` (for example `lecture.md.yml`). The others are skipped before any model call, and listed in the PR body under `### Lectures Not Synced` and in the sync run's job summary. Removals and `_toc.yml` sync as under `all`.

```bash
./tool-test-action-on-github/test-action-on-github.sh --sync-scope existing --scenarios 17,19,20
```

The option changes two things:

- **The target reset** lays down one state file in every target, `.translate/state/lecture.md.yml`, and none for `lecture-minimal.md`. `lecture-minimal.md` then plays the English copy on a partial edition's `main` (the Malayalam edition's `intro.md`): present as a `.md`, absent as state, so it must stay out of scope. The state file holds what `init` writes, except `tool-version`: the source commit that last touched `lecture.md`, the date, the default model, `mode: NEW`, and the section count of `base-lecture.md`.
- **Every PR the run creates** carries the `test-sync-scope-existing` label. It goes on when the PR is created, before `test-translation`, so the event that fires the sync already carries it. The sync workflow's mode step turns it into `sync-scope: existing`; without it the workflow passes `all`. The PR body says which scope it runs under. The action copies a source PR's labels, all but `test-translation`, onto its translation PR, so the translation PRs carry the label too. The targets' review workflows ignore it.

The ref must declare the input: v0.30.0 ([#346](https://github.com/QuantEcon/action-translation/issues/346)) or later, or a branch that carries #344. The script reads `action.yml` at the resolved commit and stops if the input is missing. An older ref would log `Unexpected input(s) 'sync-scope'` and sync every lecture, so the run would test nothing it claims to. A default run on an older ref, such as a control at a previous tag, logs the same warning and otherwise runs unchanged.

### Expected results

| Scenarios | Source change | Translation PR under `sync-scope: existing` |
|---|---|---|
| 17 | New `game-theory.md` + `_toc.yml` | Changes only `_toc.yml`, mirrored from the source with `game-theory` in it. The body lists `game-theory.md` under `### Lectures Not Synced`. No `.translate/state/` change. Review gives the "No markdown files to review" PASS. |
| 19 | `lecture-minimal.md` + `lecture.md` | The mixed PR. Changes `lecture.md` and `.translate/state/lecture.md.yml`, an update since the state file exists. Leaves `lecture-minimal.md` alone and lists it under `### Lectures Not Synced`. |
| 20 | Rename `lecture.md` → `linear-algebra.md` + `_toc.yml` | In scope: the previous path has its state file. Adds `linear-algebra.md` and `.translate/state/linear-algebra.md.yml`, deletes `lecture.md` and `.translate/state/lecture.md.yml` (GitHub may show either pair as a rename), and updates `_toc.yml`. No `### Lectures Not Synced` section. |
| 18 | Delete `lecture.md` + `_toc.yml` | Removals follow the `.md`: deletes `lecture.md` and its state file, and updates `_toc.yml`. |
| 01–08, 16, 21, 24, 27 | `lecture-minimal.md` only | No translation PR. The sync run passes, and its job summary lists `lecture-minimal.md` as not synced. |
| 09–15, 22, 23, 25, 26, 28 | `lecture.md` only | As under `all`, except that `.translate/state/lecture.md.yml` is updated rather than added. No `### Lectures Not Synced` section. |

The table assumes every scope read succeeds. When a source PR changes or renames a lecture, the action reads the target repository first, because GitHub answers 404 for a repository the token cannot see, as it does for a missing state file. If that read fails, nothing syncs, not even `_toc.yml` or a removal. A state-file or `.md` read that fails with any status but 404 leaves only that lecture neither synced nor skipped, and the other lectures still sync. Either error fails the sync run, and its job summary lists the error under `### ❌ Scope unknown`. When an error leaves nothing to sync, the run fails at once with no PR, before it reads anything more from the target, and outside test mode it opens the failure issue. Test mode opens no failure issue, so the red sync run is the signal. For the scenarios that expect no translation PR, the evaluator reads that run.

The evaluator holds a source PR with the label to the table (`evaluate/src/scope-expectations.ts`). Every scenario has an expectation, so a source PR with no translation PR is never left out of the report:

- **17–20.** It compares the translation PR's files and its `### Lectures Not Synced` list with the table, and a mismatch makes the verdict FAIL. 17 and 18 translate no lecture, so it makes no model call for them. It evaluates `lecture.md` for 19 and `linear-algebra.md` for 20. The diff judge sees only the source files the run was meant to sync, so 19's `lecture-minimal.md` does not count against scope.
- **09–15, 22, 23, 25, 26, 28.** The same comparison: the translation PR changes `lecture.md`, updates its state file, and has no `### Lectures Not Synced` section. The model evaluates `lecture.md` as under `all`.
- **01–08, 16, 21, 24, 27.** A translation PR is a failure, found without a model call. No translation PR is the expected result only if the source PR's zh-cn sync run passed, since a run that fails opens no PR either. The evaluator reads the check runs of the `sync-translation-zh-cn` job on the source PR's head commit, ignoring the run that the scope label's own labeled event fires, which the job skips. A failed run, or none, is a failure. A run still in progress, or check runs it cannot read, leave the source PR unverified, never passed, and the evaluator exits non-zero.

A source PR whose scenario expects a translation PR, and has none, is a failure: the report lists it, and the evaluator exits non-zero. The evaluator reads only the zh-cn target and its sync run, so check fa and ml by hand.

### Caveats

- **A smoke test, not the release gate.** The gate's lanes stay on the default, `all`, and the census says so under `existing`.
- **Real API spend.** With `--scenarios 17,19,20`, as above, each language makes one billed sync translation (19's) and two billed reviews (19's and 20's); 17 makes no model call. A full scope run, without `--scenarios`, makes 13 billed sync translations per language, for 19 and the twelve scenarios that change only `lecture.md`. It makes 14 billed reviews, for those and 20, whose sync moves the lecture without translating it. 17, 18 and the scenarios that change only `lecture-minimal.md` make no model call.
- **`--languages` still narrows the estate.** The source reset re-renders `.github/` from the narrowed list, so the other languages' sync workflows stay deleted until a run without `--languages`.
- **The next default run undoes the setup.** Its reset deletes `.translate/` in every target, state file included, and its PRs carry no scope label.

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
│   │   ├── scope-expectations.ts  # Expected results of a scope run (#344)
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
- "Reset left open PRs behind": the post-reset check found a PR still open on the repo it names. Close it by hand (or work out why `gh` could not) and run the script again; do not create fixture PRs on top of it

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

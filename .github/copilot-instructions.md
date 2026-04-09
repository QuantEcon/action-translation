# GitHub Copilot Instructions

## Project Overview

**action-translation** is a GitHub Action that automatically translates and reviews MyST Markdown documents using Claude AI. It uses a **section-based approach**: documents are split at `##` headings, only changed sections are translated, and sections are matched by position (not content) so matching works across languages.

**Two Modes**:
- **Sync Mode**: Runs in SOURCE repo, creates translation PRs in target repo
- **Review Mode**: Runs in TARGET repo, posts quality review comments on translation PRs

**Current Version**: v0.14.0 | **Tests**: 972 (39 suites) | **Glossary**: 357 terms (zh-cn, fa)

---

## Module Structure

```
src/
├── index.ts             # GitHub Actions entry point + mode routing + sync notifications
├── sync-orchestrator.ts # Sync processing pipeline — reusable by future CLI
├── pr-creator.ts        # PR creation in target repo
├── parser.ts            # MyST Markdown parser, stack-based, no AST
├── diff-detector.ts     # Change detection, recursive subsection comparison
├── translator.ts        # Claude API — UPDATE/NEW/RESYNC modes, retry logic
├── reviewer.ts          # Claude API — review mode
├── file-processor.ts    # Document reconstruction, subsection handling
├── heading-map.ts       # Heading-map extract/update/inject
├── language-config.ts   # Language-specific translation rules
├── localization-rules.ts # Code-cell localization rules for init command
├── inputs.ts            # Action inputs + validation
├── types.ts             # TypeScript types
├── cli/
│   ├── index.ts              # CLI entry point (commander.js)
│   ├── types.ts              # CLI-specific types
│   ├── schema.ts             # Zod schemas for backward report JSON + load/filter utils
│   ├── document-comparator.ts # Stage 1: whole-document LLM triage
│   ├── backward-evaluator.ts  # Stage 2: per-section LLM evaluation
│   ├── section-matcher.ts     # Cross-language section matching
│   ├── git-metadata.ts        # File-level git metadata + commit timeline
│   ├── report-generator.ts    # Markdown/JSON report formatting
│   ├── review-formatter.ts    # Chalk card renderer for review command
│   ├── review-session.ts      # Pure session state machine (accept/skip/reject)
│   ├── issue-generator.ts     # GitHub Issue title/body/label generator
│   ├── issue-creator.ts       # gh issue create runner with injectable GhRunner
│   ├── forward-triage.ts      # Forward: content-vs-i18n LLM filter
│   ├── forward-pr-creator.ts  # Forward: git ops + PR creation via gh CLI
│   ├── translate-state.ts     # .translate/ config + per-file state read/write + pure serializers
│   ├── components/
│   │   └── ReviewSession.tsx  # Ink interactive review UI component
│   └── commands/
│       ├── backward.ts        # Backward command orchestrator — single + bulk
│       ├── doctor.ts          # Doctor command — health check for target repos
│       ├── forward.ts         # Forward command — whole-file resync TARGET to SOURCE
│       ├── headingmap.ts      # Headingmap command — generate heading-maps (no LLM)
│       ├── init.ts            # Init command — bulk-translate new projects
│       ├── review.ts          # Review command — full pipeline, Steps 1–5
│       ├── setup.ts           # Setup command — scaffold target translation repo
│       └── status.ts          # Status command — fast sync diagnostic
```

Full module responsibilities: `docs/developer/architecture.md`

---

## Critical Constraints

❌ **No AST parsing** — keep line-by-line approach (no `unified`/`remark`)
❌ **No block-based approach** — translate sections, not paragraphs
❌ **Don't append subsections from `content`** — use `section.subsections` array (prevents duplication)
❌ **Don't match sections by content** — use position/ID
❌ **Don't translate entire documents** — only changed sections (UPDATE mode)

### Key Gotchas

**Subsection reconstruction** (`file-processor.ts`):
- Always use `contentWithoutSubsections`, then append from `section.subsections`
- Never read subsections back out of `content` — they'll be duplicated

**Root-level files** — GitHub Actions converts `docs-folder: '.'` → `'/'`:
```typescript
if (docsFolder === '.' || docsFolder === '/') docsFolder = '';
// Then filter: file.endsWith('.md') && !file.includes('/')
```

**Translation metadata** — required because translated headings have different IDs:
```yaml
translation:
  title: 经济学导论
  headings:
    introduction: "介绍"   # English ID → translated heading
```
Title is stored explicitly; headings are flat (no nesting), include all heading levels, auto-populated on first translation. Reads legacy `heading-map:` format, always writes `translation:` format.

**Retry logic** (`translator.ts`) — retries `RateLimitError`, `APIConnectionError`, 5xx; never retries `AuthenticationError` or `BadRequestError`.

**Sync notifications** (`index.ts`) — On success, posts a confirmation comment on the source PR. On failure, opens a GitHub Issue with error details and recovery instructions. Comment `\translate-resync` on a merged PR to re-trigger sync.

---

## Developer Workflow

### Running Tests
```bash
npm test                          # All 873 tests
npm test -- parser.test.ts        # Single file
npm test -- --watch               # Watch mode
npm test -- --coverage            # Coverage report
```

### Build
```bash
npm run build    # Compile TypeScript + bundle dist-action/index.js
```

### Branch & PR Process
- Always work on a branch, never commit directly to `main`
- Use PRs for all changes, including docs
- **Always use create/edit file tools** for file content — never heredoc or shell string escaping
- Multi-line commit messages: write to `.tmp/` first, then use `-F`:
  ```bash
  git commit -F .tmp/msg.txt
  ```

### Using the `gh` CLI

Always write output to the local **`.tmp/`** folder (not `/tmp/`) to keep work repo-scoped:

```bash
# Read PR details
gh pr view 123 > .tmp/pr.txt && cat .tmp/pr.txt

# Create PR (write body with file tool first, then:)
gh pr create --title "..." --body-file .tmp/pr-body.txt --base main > .tmp/pr-result.txt && cat .tmp/pr-result.txt

# Create release (write notes with file tool first, then:)
gh release create vX.Y.Z --title "..." --notes-file .tmp/release-notes.md > .tmp/release-result.txt && cat .tmp/release-result.txt
```

The `.tmp/` folder is committed (via `.gitkeep`) but its contents are git-ignored.

### Addressing Copilot PR Review Comments

After pushing a PR, Copilot may leave review comments. To address them:

1. **Fetch review comments** — get comment IDs:
   ```bash
   gh api repos/QuantEcon/action-translation/pulls/PR_NUM/comments \
     --jq '.[] | {id, path, line, body: (.body | split("\n")[0])}' \
     > .tmp/pr-comments.txt && cat .tmp/pr-comments.txt
   ```
2. **Push fixes** to the PR branch addressing the feedback
3. **Reply to each comment** — write reply to a file, then post:
   ```bash
   gh api repos/QuantEcon/action-translation/pulls/PR_NUM/comments/COMMENT_ID/replies \
     -f body="$(cat .tmp/reply.txt)" 2>&1 | jq -r '.html_url'
   ```
4. **Resolve threads** on the GitHub web interface

---

## E2E Testing Tool (`tool-test-action-on-github/`)

End-to-end testing against real GitHub repos. Creates test PRs that trigger the action workflow.

### Test Repos

| Repo | Role |
|------|------|
| `QuantEcon/test-translation-sync` | Source (English) — PRs created here |
| `QuantEcon/test-translation-sync.zh-cn` | Target (Chinese) — translation PRs land here |
| `QuantEcon/test-translation-sync.fa` | Target (Farsi) — translation PRs land here |

Both target workflows checkout & build `action-translation` from `main` (not a pinned release), so tests always exercise the latest code.

### Running

```bash
./tool-test-action-on-github/test-action-on-github.sh          # Full run (26 test PRs)
./tool-test-action-on-github/test-action-on-github.sh --dry-run # Preview only
```

**What the script does**: resets all 3 repos to clean state (force-push `main`), closes all open PRs, creates 26 draft PRs with `test-translation` label. The label triggers both zh-cn and fa workflows in TEST mode (no Claude API calls).

**⚠ Terminal timeout**: The script creates 26 PRs sequentially and can take 5+ minutes. Set a generous timeout (≥ 600000ms) or run without one.

### Folder Structure

```
tool-test-action-on-github/
├── test-action-on-github.sh           # Main test script
├── README.md                          # Detailed docs (scenarios, evaluation)
├── test-action-on-github-data/        # Test fixtures + workflow templates
│   ├── workflow-template.yml          # zh-cn workflow (checkout from main)
│   ├── workflow-template-fa.yml       # fa workflow (checkout from main)
│   ├── base-*.md / base-*.yml        # Base state files for source + targets
│   └── 01-*.md ... 26-*.md           # Test scenario files (26 total)
├── evaluate/                          # Phase 2: LLM-based quality evaluation
└── reports/                           # Saved evaluation reports
```

### Test Scenarios (26 total, 4 phases)

- **Phase 1 (01–08)**: Basic structure — intro, title, section content, reorder, add/delete section, subsection, multi-element (minimal doc)
- **Phase 2 (09–15)**: Complex structure — real-world lecture, sub-subsections, code cells, math, delete subsection/sub-subsection (lecture doc)
- **Phase 3 (16–20)**: Structural changes — pure reorder, new/deleted/renamed document + TOC, multi-file
- **Phase 4 (21–26)**: Edge cases — preamble-only, deep nesting, special chars, empty sections, pre-title content, heading case change

---

## Documentation Guidelines

✅ Update `CHANGELOG.md` for every release — promote `[Unreleased]` → `[X.Y.Z] - YYYY-MM-DD`
✅ Update `README.md` for user-facing changes
✅ Update test counts in this file when adding tests
✅ Clean up any `.backup` or `-old` files before committing
❌ Never create standalone summary/notes markdown files for individual changes

Docs live in `docs/` — see `docs/index.md` for the full structure.

### Release Checklist

Before creating a release, verify the following:

1. **CHANGELOG is up to date** — all merged PRs and features are listed under `[Unreleased]`; promote `[Unreleased]` → `[X.Y.Z] - YYYY-MM-DD`
2. **Version bumped** — update `package.json`, this file (`copilot-instructions.md`), and `PLAN.md`
3. **Tests pass** — run `npm test` and confirm all tests pass
4. **Build succeeds** — run `npm run build` to compile TypeScript and update `dist-action/`
5. **Commit, tag, push** — commit all changes, create git tag `vX.Y.Z`, push with `--tags`
6. **Create GitHub release** — `gh release create vX.Y.Z --title "..." --notes-file .tmp/release-notes.md`

---

## Key Files by Task

| Task | File → Symbol |
|---|---|
| Subsection reconstruction | `file-processor.ts` → `parseTranslatedSubsections` |
| Translation prompts | `translator.ts` → `translateSection` / `translateNewSection` / `translateSectionResync` / `translateDocumentResync` |
| Review logic | `reviewer.ts` → `TranslationReviewer` |
| Parsing | `parser.ts` → `parseSections` |
| Change detection | `diff-detector.ts` → `detectSectionChanges` |
| Heading-maps | `heading-map.ts` → `updateHeadingMap` |
| File classification | `sync-orchestrator.ts` → `classifyChangedFiles` + `StateGenerationConfig` |
| PR creation | `pr-creator.ts` → `createTranslationPR` |
| Forward resync | `commands/forward.ts` → `resyncSingleFile` / `runForwardBulk` |
| Forward triage | `forward-triage.ts` → `triageForward` |
| Forward PR creation | `forward-pr-creator.ts` → `createForwardPR` |
| .translate/ state | `translate-state.ts` → `readConfig` / `writeFileState` / `isSourceChanged` / `serializeFileState` / `stateFileRelativePath` |
| Repo scaffolding | `commands/setup.ts` → `runSetup` |
| Init (bulk translate) | `commands/init.ts` → `runInit` |
| Health check | `commands/doctor.ts` → `runDoctor` |
| Heading-map generation | `commands/headingmap.ts` → `runHeadingmap` / `buildHeadingMap` |
| Localization rules | `localization-rules.ts` → `buildLocalizationPrompt` / `getFontRequirements` |
| Whole-file RESYNC | `translator.ts` → `translateDocumentResync` |
| Input validation | `inputs.ts` → `getInputs` / `getReviewInputs` |
| Resync trigger | `inputs.ts` → `validatePREvent` (handles `issue_comment` events) |
| Sync notifications | `index.ts` → `postSuccessComment` / `createFailureIssue` |


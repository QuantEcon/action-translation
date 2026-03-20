# GitHub Copilot Instructions

## Project Overview

**action-translation** is a GitHub Action that automatically translates and reviews MyST Markdown documents using Claude AI. It uses a **section-based approach**: documents are split at `##` headings, only changed sections are translated, and sections are matched by position (not content) so matching works across languages.

**Two Modes**:
- **Sync Mode**: Runs in SOURCE repo, creates translation PRs in target repo
- **Review Mode**: Runs in TARGET repo, posts quality review comments on translation PRs

**Current Version**: v0.9.0 | **Tests**: 882 (39 suites) | **Glossary**: 357 terms (zh-cn, fa)

---

## Module Structure

```
src/
├── index.ts             # GitHub Actions entry point + mode routing
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

**Heading-maps** — required because translated headings have different IDs:
```yaml
heading-map:
  introduction: "介绍"   # English ID → translated heading
```
Maps are flat (no nesting), include all heading levels, auto-populated on first translation.

**Retry logic** (`translator.ts`) — retries `RateLimitError`, `APIConnectionError`, 5xx; never retries `AuthenticationError` or `BadRequestError`.

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
npm run build    # Compile TypeScript
npm run package  # Bundle for distribution
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

### GitHub Testing (real PR workflow)
```bash
./tool-test-action-on-github/test-action-on-github.sh
```
Uses TEST mode (no Claude API calls). See `docs/developer/testing.md`.

---

## Documentation Guidelines

✅ Update `CHANGELOG.md` for every release — promote `[Unreleased]` → `[X.Y.Z] - YYYY-MM-DD`
✅ Update `README.md` for user-facing changes
✅ Update test counts in this file when adding tests
✅ Clean up any `.backup` or `-old` files before committing
❌ Never create standalone summary/notes markdown files for individual changes

Docs live in `docs/` — see `docs/index.md` for the full structure.

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


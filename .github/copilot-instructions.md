# GitHub Copilot Instructions

## Project Overview

**action-translation** is a GitHub Action that automatically translates and reviews MyST Markdown documents using Claude AI. It uses a **section-based approach**: documents are split at `##` headings, only changed sections are translated, and sections are matched by position (not content) so matching works across languages.

**Two Modes**:
- **Sync Mode**: Runs in SOURCE repo, creates translation PRs in target repo
- **Review Mode**: Runs in TARGET repo, posts quality review comments on translation PRs

**Current Version**: v0.8.0 | **Tests**: 316 (15 suites) | **Glossary**: 357 terms (zh-cn, fa)

---

## Module Structure

```
src/
├── index.ts             # GitHub Actions entry point + mode routing (~450 lines)
├── sync-orchestrator.ts # Sync processing pipeline — reusable by future CLI (~420 lines)
├── pr-creator.ts        # PR creation in target repo (~320 lines)
├── parser.ts            # MyST Markdown parser, stack-based, no AST (282 lines)
├── diff-detector.ts     # Change detection, recursive subsection comparison (195 lines)
├── translator.ts        # Claude API — UPDATE/NEW modes, retry logic (~460 lines)
├── reviewer.ts          # Claude API — review mode (~700 lines)
├── file-processor.ts    # Document reconstruction, subsection handling (~670 lines)
├── heading-map.ts       # Heading-map extract/update/inject (246 lines)
├── language-config.ts   # Language-specific translation rules (102 lines)
├── inputs.ts            # Action inputs + validation (~200 lines)
└── types.ts             # TypeScript types (~250 lines)
```

Full module responsibilities: `docs/ARCHITECTURE.md`

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
npm test                          # All 316 tests
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
Uses TEST mode (no Claude API calls). See `docs/TEST-REPOSITORIES.md`.

---

## Documentation Guidelines

✅ Update `CHANGELOG.md` for every release — promote `[Unreleased]` → `[X.Y.Z] - YYYY-MM-DD`
✅ Update `README.md` for user-facing changes
✅ Update test counts in this file when adding tests
✅ Clean up any `.backup` or `-old` files before committing
❌ Never create standalone summary/notes markdown files for individual changes

Docs live in `docs/` — see `docs/INDEX.md` for the full structure.

---

## Key Files by Task

| Task | File → Symbol |
|---|---|
| Subsection reconstruction | `file-processor.ts` → `parseTranslatedSubsections` |
| Translation prompts | `translator.ts` → `translateSection` / `translateNewSection` |
| Review logic | `reviewer.ts` → `TranslationReviewer` |
| Parsing | `parser.ts` → `parseSections` |
| Change detection | `diff-detector.ts` → `detectSectionChanges` |
| Heading-maps | `heading-map.ts` → `updateHeadingMap` |
| File classification | `sync-orchestrator.ts` → `classifyChangedFiles` |
| PR creation | `pr-creator.ts` → `createTranslationPR` |
| Input validation | `inputs.ts` → `getInputs` / `getReviewInputs` |


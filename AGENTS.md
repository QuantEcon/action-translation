# AGENTS.md

Guidance for coding agents working in this repository (GitHub Action + `translate` CLI for
translating QuantEcon MyST lectures via the Anthropic API; TypeScript).

## Project notes (`.dev/`)

Working notes — state, decisions, design ideas — live in [`.dev/`](.dev/README.md)
(the QuantEcon `.dev/` convention; this is the pilot repo).

- Read [`.dev/STATE.md`](.dev/STATE.md) before starting; it carries a `verified: <date>`
  first line — trust it less as that ages. It points to [`PLAN.md`](.dev/PLAN.md),
  [`FUTURE.md`](.dev/FUTURE.md), and [`ARCHITECTURE.md`](.dev/ARCHITECTURE.md).
- Finish each session by appending a short log entry to [`.dev/log/`](.dev/log/)
  (`YYYY-MM-DD-<id>.md`) and updating STATE.md if reality changed.
- Record settled decisions in [`.dev/decisions/`](.dev/decisions/) in the same PR that makes
  them (`D-YYYY-MM-DD-<slug>.md`; never edited — supersede with a new file + a note at the
  top of the old one).
- Tag cross-repo findings inline with `#promote`.
- Keep it curated: distill, supersede, or delete — git holds the history.
- `.dev/` is public: no credentials, no unpatched-vulnerability specifics (security
  advisories until fixed).

## Commands

- `npm install` — setup
- `npm run build` — compile TypeScript (`dist/`) + bundle the action (`dist-action/`)
- `npm test` — Jest suite (build first: the CLI smoke tests execute `dist/cli/index.js`)
- `npm run lint` — ESLint

## Rules

- `dist-action/` is committed and must stay in sync with `src/` — always `npm run build`
  after source changes; CI fails on drift.
- Use `.dev/scratch/` (gitignored) for scratch files; never create standalone summary/notes
  markdown files for individual changes.
- Update `CHANGELOG.md` under `[Unreleased]` for user-visible changes.

---

## Module Structure

One module map is maintained, in [`docs/developer/architecture.md`](docs/developer/architecture.md)
(a structural test asserts it names every source module, so it cannot silently drift).
Quick orientation: `src/` is the GitHub Action (entry `index.ts`, pipeline
`sync-orchestrator.ts`, Claude calls in `translator.ts`/`reviewer.ts`), `src/cli/` is the
`translate` CLI (entry `cli/index.ts`, one file per command under `cli/commands/`).

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
npm test                          # Full test suite
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
- **Never trust a bulk find-and-replace; verify the result, not the command's exit code.**
  Scripted edits fail *silently* and look successful. Four real examples from one session:
  a slice whose end marker matched earlier in the file produced `""`, and
  `str.replace("", new)` inserted between every character — 232 lines became 46,677;
  a blanket rename rewrote a path to `.github/AGENTS.md`, which does not exist;
  another rewrote an append-only decision record it should never have touched;
  and a `printf` whose format string held an em-dash aborted, leaving the extracted
  value empty so every branch took the "nothing to do" path and 24 GitHub release
  titles were overwritten instead of migrated. In each case the command reported
  success. After any scripted edit: `grep` for what should be gone, `grep` for what
  should be there, and check the file still parses or renders. Prefer exact-match
  edits over pattern replacement whenever the target is known.
- Multi-line commit messages: write to `.dev/scratch/` first, then use `-F`:
  ```bash
  git commit -F .dev/scratch/msg.txt
  ```

### Using the `gh` CLI

Always write output to the local **`.dev/scratch/`** folder (not `/tmp/`) to keep work repo-scoped:

```bash
# Read PR details
gh pr view 123 > .dev/scratch/pr.txt && cat .dev/scratch/pr.txt

# Create PR (write body with file tool first, then:)
gh pr create --title "..." --body-file .dev/scratch/pr-body.txt --base main > .dev/scratch/pr-result.txt && cat .dev/scratch/pr-result.txt

# Create release (write notes with file tool first; title is the tag alone — see the
# release checklist for why)
gh release create vX.Y.Z --title "vX.Y.Z" --notes-file .dev/scratch/release-notes.md > .dev/scratch/release-result.txt && cat .dev/scratch/release-result.txt
```

The `.dev/scratch/` folder is committed (via `.gitkeep`) but its contents are git-ignored.

### Addressing Copilot PR Review Comments

After pushing a PR, Copilot may leave review comments. To address them:

1. **Fetch review comments** — get comment IDs:
   ```bash
   gh api repos/QuantEcon/action-translation/pulls/PR_NUM/comments \
     --jq '.[] | {id, path, line, body: (.body | split("\n")[0])}' \
     > .dev/scratch/pr-comments.txt && cat .dev/scratch/pr-comments.txt
   ```
2. **Push fixes** to the PR branch addressing the feedback
3. **Reply to each comment** — write reply to a file, then post:
   ```bash
   gh api repos/QuantEcon/action-translation/pulls/PR_NUM/comments/COMMENT_ID/replies \
     -f body="$(cat .dev/scratch/reply.txt)" 2>&1 | jq -r '.html_url'
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
| `QuantEcon/test-translation-sync.ml` | Target (Malayalam) — translation PRs land here |

**Which version gets tested** — the harness writes **every** workflow across all four repos (one sync per language, plus review and rebase in each target) and pins them all to the same ref, printing a per-workflow census before creating any PRs. Read the census rather than assuming. The ref defaults to **`main`**; `--action-ref vX.Y.Z` is the release gate and `--action-ref v0` is the post-release smoke that checks floating-tag resolution (#109/#202). Adding a language is one line in the script's `LANGUAGES` array plus three `base-*-<code>` fixtures — and a target repo that already exists.

### Running

```bash
./tool-test-action-on-github/test-action-on-github.sh                       # main HEAD
./tool-test-action-on-github/test-action-on-github.sh --dry-run             # Preview only
./tool-test-action-on-github/test-action-on-github.sh --action-ref vX.Y.Z   # Release gate
./tool-test-action-on-github/test-action-on-github.sh --action-ref v0       # Post-release smoke
```

**What the script does**: resets all repos to clean state (force-push `main`), closes all open PRs, creates 26 draft PRs with `test-translation` label. The label triggers one sync workflow per configured language.

**⚠ Real API spend**: `test-mode` suppresses PR side effects, not model calls — a run makes real, billed Claude calls. A three-language run is ~78 sync runs **plus ~78 review runs**. The ~1.4M input tokens measured on two languages pre-dates review coverage, so it is a floor, not an estimate.

**⚠ Terminal timeout**: The script creates 26 PRs sequentially and can take 5+ minutes. Set a generous timeout (≥ 600000ms) or run without one.

### Folder Structure

```
tool-test-action-on-github/
├── test-action-on-github.sh           # Main test script
├── README.md                          # Detailed docs (scenarios, evaluation)
├── test-action-on-github-data/        # Test fixtures + workflow templates
│   ├── sync-workflow-template.yml     # ONE sync workflow, rendered per language
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
2. **Version bumped** — update `package.json`, this file (`AGENTS.md`), and `.dev/PLAN.md`
3. **Tests pass** — run `npm test` and confirm all tests pass
4. **Build succeeds** — run `npm run build` to compile TypeScript and update `dist-action/`
4a. **E2E-gate the tagged release** — after tagging and before moving the floating tags:

   ```bash
   ./tool-test-action-on-github/test-action-on-github.sh --action-ref vX.Y.Z
   ```

   The harness defaults to `main`, so the release itself is only gated if you ask for it by
   name. This step verifies the **tagged bytes**, not a branch that may have moved since.
5. **Commit, tag, push** — commit all changes, create git tag `vX.Y.Z`, push with `--tags`; **then move both floating tags** to the release commit:

   ```bash
   git tag -f vX.Y vX.Y.Z && git push -f origin vX.Y   # e.g. v0.16
   git tag -f v0   vX.Y.Z && git push -f origin v0
   ```

   The README quickstart recommends `@v0`; it went stale for 9 releases once (stuck at v0.7.0-era code through v0.16.0).

   Then smoke the moved tag — cheap, and the only check that the alias resolves:

   ```bash
   ./tool-test-action-on-github/test-action-on-github.sh --action-ref v0 --scenarios 01
   ```
6. **Create GitHub release** — the title is **the tag and nothing else**:

   ```bash
   gh release create vX.Y.Z --title "vX.Y.Z" --notes-file .dev/scratch/release-notes.md
   ```

   The repo sidebar and the releases list truncate long titles, so a descriptive
   suffix is cut off exactly where it stops being readable — `v0.24.0 — tech-debt
   Wave…` tells a visitor less than `v0.24.0` does. Put the headline in the **notes
   body** instead, as the first line: it renders in full on the release page, in the
   Atom feed, and in email notifications, none of which truncate.

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
| Input validation | `inputs.ts` → `getInputs` / `getReviewInputs` / `getRebaseInputs` |
| Resync trigger | `inputs.ts` → `validatePREvent` (handles `issue_comment` events) |
| Sync notifications | `index.ts` → `postSuccessComment` / `createFailureIssue` |
| Rebase mode | `index.ts` → `runRebase` / `rebaseSinglePR` |
| PR metadata | `pr-creator.ts` → `TranslationSyncMetadata` / `parseTranslationSyncMetadata` |
| Translation cache | `file-processor.ts` → `processSectionBased` (rebaseCache param) |


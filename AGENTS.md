# AGENTS.md

Guidance for coding agents working in this repository (GitHub Action + `translate` CLI for
translating QuantEcon MyST lectures via the Anthropic API; TypeScript).

## Project notes (`.qe/dev/`)

Working notes — state, decisions, design ideas — live in [`.qe/dev/`](.qe/dev/README.md),
inside [`.qe/`](.qe/README.md), the repository's QuantEcon folder (this repo pilots the
convention; its home is the Project Management Protocols QEP — QuantEcon/qeps QEP-7, in draft).

- Read [`.qe/dev/STATE.md`](.qe/dev/STATE.md) before starting; it carries a `verified: <date>`
  first line — trust it less as that ages. It points to [`PLAN.md`](.qe/dev/PLAN.md),
  [`FUTURE.md`](.qe/dev/FUTURE.md), and [`ARCHITECTURE.md`](.qe/dev/ARCHITECTURE.md). The
  work-plan tracker (#257) is the current-state register; keep STATE.md to orientation and
  the resume checklist rather than restating it.
- Finish each session by appending a short log entry to [`.qe/dev/log/`](.qe/dev/log/)
  (`YYYY-MM-DD-<id>.md`) and updating STATE.md if reality changed. What happened goes in
  the log and in the tracker's revision-log comment, never in the tracker's status section.
- Record settled decisions in [`.qe/dev/decisions/`](.qe/dev/decisions/) in the same PR that
  makes them (`D-YYYY-MM-DD-<slug>.md`; never edited — supersede with a new file + a note at
  the top of the old one). A record explains the choice as of its date and guides the next
  one; to change a decision, write the superseding record.
- Tag cross-repo findings inline with `#promote`; `.qe/dev/` is about this repository only.
- Keep it curated: distill, supersede, or delete — git holds the history.
- `.qe/` is public: no credentials, no unpatched-vulnerability specifics (security
  advisories until fixed). Nothing under it is git-ignored; scratch lives outside the tree.

## Commands

- `npm install` — setup
- `npm run build` — compile TypeScript (`dist/`) + bundle the action (`dist-action/`)
- `npm test` — Jest suite (build first: the CLI smoke tests execute `dist/cli/index.js`)
- `npm run lint` — ESLint

## Rules

- `dist-action/` is committed and must stay in sync with `src/` — always `npm run build`
  after source changes; CI fails on drift.
- Scratch and working files live outside the tree (the agent's own scratchpad, or
  `SCRATCH=$(mktemp -d)`); never create standalone summary/notes markdown files for
  individual changes.
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
    Introduction: "介绍"   # English heading text → translated heading
```
Title is stored explicitly; headings are a flat YAML map (nesting is encoded in the key as `Parent::Child` paths, never as nested YAML), include all heading levels, auto-populated on first translation. Keys are heading text verbatim minus `#` markers and MyST roles — no lowercasing or hyphenation (#91). Reads legacy `heading-map:` format (with a deprecation warning, #53), always writes `translation:` format.

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
- Multi-line commit messages: write to a temporary file outside the repository first
  (`SCRATCH=$(mktemp -d)`), then use `-F`:
  ```bash
  git commit -F $SCRATCH/msg.txt
  ```

### Using the `gh` CLI

Write command output and drafted bodies to a temporary directory outside the repository — `SCRATCH=$(mktemp -d)`, or the agent's own scratchpad — since nothing under `.qe/` is git-ignored and the repository holds no scratch location:

```bash
# Read PR details
gh pr view 123 > $SCRATCH/pr.txt && cat $SCRATCH/pr.txt

# Create PR (write body with file tool first, then:)
gh pr create --title "..." --body-file $SCRATCH/pr-body.txt --base main > $SCRATCH/pr-result.txt && cat $SCRATCH/pr-result.txt

# Create release (write notes with file tool first; title is the tag alone — see the
# release checklist for why)
gh release create vX.Y.Z --title "vX.Y.Z" --notes-file $SCRATCH/release-notes.md > $SCRATCH/release-result.txt && cat $SCRATCH/release-result.txt
```


### Addressing Copilot PR Review Comments

After pushing a PR, Copilot may leave review comments. To address them:

1. **Fetch review comments** — get comment IDs:
   ```bash
   gh api repos/QuantEcon/action-translation/pulls/PR_NUM/comments \
     --jq '.[] | {id, path, line, body: (.body | split("\n")[0])}' \
     > $SCRATCH/pr-comments.txt && cat $SCRATCH/pr-comments.txt
   ```
2. **Push fixes** to the PR branch addressing the feedback
3. **Reply to each comment** — write reply to a file, then post:
   ```bash
   gh api repos/QuantEcon/action-translation/pulls/PR_NUM/comments/COMMENT_ID/replies \
     -f body="$(cat $SCRATCH/reply.txt)" 2>&1 | jq -r '.html_url'
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

1. **CHANGELOG is up to date** — all merged PRs and features are listed under `[Unreleased]`; promote `[Unreleased]` → `[X.Y.Z] - YYYY-MM-DD` and leave a fresh empty `## [Unreleased]` header above it, so the next PR's entry has somewhere to go that is not the released section (adopted v0.28.0, #304)
2. **Version bumped** — update `package.json`, this file (`AGENTS.md`), and `.qe/dev/PLAN.md`
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
   gh release create vX.Y.Z --title "vX.Y.Z" --notes-file $SCRATCH/release-notes.md
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


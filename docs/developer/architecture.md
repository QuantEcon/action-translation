---
title: Architecture
---

# Architecture

**Last Updated**: 6 March 2026 — v0.11.2  

This document covers the complete system architecture: design philosophy, operational modes, module structure, data flow, and key design decisions.

## Design philosophy

### Section-based translation

The core design choice: translate at the **section level** (`##` headings), not the paragraph or document level.

**Why sections?**
- **Minimal retranslation** — When one section changes, only that section is re-translated. The rest of the document is preserved exactly.
- **Context preservation** — A section is large enough for Claude to produce coherent, contextual translations. Paragraphs in isolation lose narrative flow.
- **Robust matching** — Sections map reliably across languages via heading-maps. Paragraph-level matching is fragile.
- **Simpler parsing** — A stack-based line-by-line parser is sufficient. No AST library needed.

**Trade-offs accepted:**
- No cross-section context during UPDATE mode (each section translated independently)
- Section reordering requires heading-map updates
- Very large sections (rare) may approach token limits

### Line-by-line parsing (no AST)

The parser (`parser.ts`) processes documents line by line using a state machine, not an AST library like `unified` or `remark`.

**Why?**
- MyST Markdown has constructs (directives, roles) that remark doesn't handle natively
- We only need structural decomposition (frontmatter, title, sections), not semantic analysis
- Line-by-line approach is 43% less code and produces a 28% smaller bundle
- The parser handles all MyST features: fenced directives, nested code blocks, math blocks, frontmatter

### Hub-spoke repository model

English is the single source of truth. Translations are derivatives in separate repositories:

```
lecture-python-intro (English Hub)
├── → lecture-intro.zh-cn (Chinese)
├── → lecture-intro.fa (Farsi)
└── → lecture-intro.es (Spanish — future)
```

Each language syncs independently. A failure in Chinese translation doesn't affect Farsi. Language teams have independent review workflows.

## Operational modes

The system has five operational modes spanning two tools:

| Mode | Tool | Direction | Trigger | Description |
|------|------|-----------|---------|-------------|
| **SYNC** | GitHub Action | SOURCE → TARGET | PR merge | Incremental section-level translation |
| **REVIEW** | GitHub Action | — | PR opened | AI quality review of translation PRs |
| **BACKWARD** | CLI | TARGET → SOURCE | Manual | Discover improvements worth backporting |
| **FORWARD** | CLI | SOURCE → TARGET | Manual | Drift recovery via whole-file RESYNC |
| **STATUS** | CLI | — | Manual | Structural diagnostic (no LLM) |

### Translation modes

The translator (`translator.ts`) supports three translation modes, each with different inputs and use cases:

| Mode | Inputs | Use case | API calls |
|------|--------|----------|-----------|
| **NEW** | SOURCE only | Fresh translation of a new file | 1 per document |
| **UPDATE** | Old SOURCE + New SOURCE + Current TARGET | Section changed in a PR | 1 per changed section |
| **RESYNC** | Current SOURCE + Current TARGET | Drift recovery | 1 per document (whole-file) |

**NEW** and **UPDATE** are used by the GitHub Action (SYNC mode). **RESYNC** is used by the CLI forward command.

### Project lifecycle

```
┌─────────────┐     ┌────────────────┐     ┌──────────────────┐
│ Onboarding  │ ──▶ │  Steady-State  │ ──▶ │   Recovery       │
│             │     │                │     │                  │
│ bulk/forward│     │ SYNC + REVIEW  │     │ forward (RESYNC) │
│ (NEW mode)  │     │ (UPDATE mode)  │     │ backward+review  │
└─────────────┘     └────────────────┘     └──────────────────┘
```

**Onboarding**: Use the forward CLI or bulk translator to create initial translations of all files.

**Steady-state**: The GitHub Action handles incremental translation as PRs are merged. The review workflow provides quality feedback.

**Recovery**: When translations drift (failed syncs, manual edits), use the CLI tools to diagnose (`status`), analyse (`backward`), and fix (`forward`).

## Module structure

### Core modules (GitHub Action)

```
src/
├── index.ts             # GitHub Actions entry point + mode routing + sync notifications
├── sync-orchestrator.ts # Sync processing pipeline
├── pr-creator.ts        # PR creation in target repo
├── parser.ts            # MyST Markdown parser (stack-based, line-by-line)
├── diff-detector.ts     # Change detection via section comparison
├── translator.ts        # Claude API — UPDATE/NEW/RESYNC modes + retry
├── reviewer.ts          # Claude API — review mode
├── file-processor.ts    # Document reconstruction + subsection handling
├── heading-map.ts       # Heading-map extract/update/inject
├── language-config.ts   # Language-specific translation rules
├── inputs.ts            # Action input validation + resync trigger
└── types.ts             # TypeScript type definitions
```

### CLI modules

```
src/cli/
├── index.ts              # CLI entry point (commander.js)
├── types.ts              # CLI-specific types
├── schema.ts             # Zod schemas for backward report JSON
├── document-comparator.ts # Stage 1: whole-document LLM triage
├── backward-evaluator.ts  # Stage 2: per-section LLM evaluation
├── section-matcher.ts     # Cross-language section matching
├── git-metadata.ts        # File-level git metadata + commit timeline
├── report-generator.ts    # Markdown/JSON report formatting
├── review-formatter.ts    # Chalk card renderer for review command
├── review-session.ts      # Pure state machine (accept/skip/reject)
├── issue-generator.ts     # GitHub Issue title/body/label generator
├── issue-creator.ts       # gh issue create runner
├── forward-triage.ts      # Forward: content-vs-i18n LLM filter
├── forward-pr-creator.ts  # Forward: git ops + PR creation via gh CLI
├── translate-state.ts     # .translate/ config + per-file state
├── components/
│   └── ReviewSession.tsx  # Ink interactive review UI component
└── commands/
    ├── backward.ts        # Backward command orchestrator
    ├── doctor.ts          # Doctor command — health check
    ├── forward.ts         # Forward command — whole-file resync
    ├── headingmap.ts      # Headingmap command — generate heading-maps
    ├── init.ts            # Init command — bulk-translate new projects
    ├── review.ts          # Review command — interactive walk-through
    ├── setup.ts           # Setup command — scaffold target repo
    └── status.ts          # Status command — fast diagnostic
```

### Module dependency map

Which modules are used by which operational modes:

| Module | SYNC | REVIEW | BACKWARD | FORWARD | STATUS |
|--------|------|--------|----------|---------|--------|
| `parser.ts` | ✅ | ✅ | ✅ | — | ✅ |
| `diff-detector.ts` | ✅ | ✅ | ✅ | — | ✅ |
| `translator.ts` | ✅ (UPDATE/NEW) | — | — | ✅ (RESYNC) | — |
| `reviewer.ts` | — | ✅ | — | — | — |
| `heading-map.ts` | ✅ | — | ✅ | — | ✅ |
| `file-processor.ts` | ✅ | — | — | — | — |
| `sync-orchestrator.ts` | ✅ | — | — | — | — |
| `pr-creator.ts` | ✅ | — | — | — | — |
| `language-config.ts` | ✅ | — | — | ✅ | — |

## Data flow

### SYNC mode (GitHub Action)

```
PR merged in SOURCE repo
       │
       ▼
┌─────────────────────────┐
│ index.ts                │  Fetch PR diff, identify changed files
│ (GitHub Action entry)   │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ sync-orchestrator.ts    │  Classify files: new vs existing
│                         │  For each file:
│  ┌────────────────────┐ │
│  │ parser.ts          │ │  Parse old/new SOURCE + current TARGET
│  │ diff-detector.ts   │ │  Find changed sections
│  │ translator.ts      │ │  Translate changed sections (UPDATE)
│  │ file-processor.ts  │ │  Reconstruct full document
│  │ heading-map.ts     │ │  Update heading-map in frontmatter
│  └────────────────────┘ │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ pr-creator.ts           │  Create branch, commit files, open PR
│                         │  in TARGET repo
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ index.ts                │  On success: post comment on source PR
│ (sync notifications)    │  On failure: open Issue with error details
│                         │  + recovery instructions
└─────────────────────────┘
```

### BACKWARD analysis (CLI)

```
npx translate backward -s SOURCE -t TARGET
       │
       ▼
┌─────────────────────────────────────┐
│ Stage 1: Document Triage            │  1 LLM call per file
│ (document-comparator.ts)            │  "Any changes beyond translation?"
│                                     │
│ Verdict: IN_SYNC → skip             │  ~80% filtered here
│ Verdict: CHANGES_DETECTED → Stage 2 │
└───────────────┬─────────────────────┘
                │ (flagged files only)
                ▼
┌─────────────────────────────────────┐
│ Stage 2: Section Evaluation         │  1 LLM call per flagged file
│ (backward-evaluator.ts)             │  All section pairs in one prompt
│                                     │
│ Per-section: category, confidence,  │
│ reasoning, suggested changes        │
└───────────────┬─────────────────────┘
                │
                ▼
┌─────────────────────────────────────┐
│ Report Generation                   │  Markdown + JSON per file
│ (report-generator.ts)               │  Aggregate summary
└─────────────────────────────────────┘
```

### FORWARD resync (CLI)

```
npx translate forward -s SOURCE -t TARGET
       │
       ▼
┌─────────────────────────────────────┐
│ Forward Triage                      │  1 LLM call per file
│ (forward-triage.ts)                 │  "Content changes or i18n only?"
│                                     │
│ CONTENT_CHANGES → proceed           │
│ I18N_ONLY → skip                    │
│ IDENTICAL → skip                    │
└───────────────┬─────────────────────┘
                │ (content changes only)
                ▼
┌─────────────────────────────────────┐
│ Whole-File RESYNC                   │  1 LLM call per file
│ (translator.ts →                    │  Full SOURCE + TARGET + glossary
│  translateDocumentResync)           │  → updated TARGET
└───────────────┬─────────────────────┘
                │
                ▼
        Write to disk (local)
        — or —
        Create PR (--github)
```

## Key design decisions

### Why whole-file RESYNC for forward (not section-by-section)

The forward command was originally designed to RESYNC section-by-section (matching the SYNC architecture). An experiment on `pv.md` (7 sections, 458 lines) showed whole-file is better:

| Metric | Whole-file | Section-by-section |
|--------|-----------|-------------------|
| Changed lines | 29 | 52 |
| API calls | 1 | 7 |
| Cost | $0.137 | $0.281 |
| Localization preserved? | ✅ Yes | ❌ Reverted Chinese plot labels |

Section-by-section failed because each section is translated in isolation — the LLM can't see the document's consistent Chinese localisation pattern, so it reverts translated labels to English.

Section-by-section remains correct for **SYNC mode** (PR-driven) because git diff provides exact change signals and only 1–3 sections change per PR.

### Two-stage backward architecture

The backward command uses two stages to minimize cost:

**Stage 1 (triage):** Full SOURCE + TARGET in one call → "Any substantive changes?" Most files (~80%) are filtered here at ~$0.05/file.

**Stage 2 (evaluation):** All section pairs in one call (not per-section) → detailed suggestions. Originally Stage 2 was 1 call per section, but whole-file evaluation produced better results:

| Metric | Per-section | Per-file |
|--------|------------|----------|
| API calls (51 files) | 182 | 32 |
| High-confidence findings | 6 | 7 |
| Noise (medium-confidence) | 25 | 17 |

### Heading-map design

Heading maps are flat (no nesting), contain all heading levels, and use English IDs as keys. This design was chosen because:
- Flat maps are simpler to parse and update
- English IDs are stable across translations (they're derived from English headings)
- Heading-map entries for subsections prevent false matches when sections move

### i18n code preservation

Translated documents often contain extra code in code cells for localisation (e.g., Chinese font configuration). The system uses prompt-based rules to prevent the LLM from removing this code:

> **NEVER remove i18n/localization code from code cells.** The translation may contain extra code inside code cells that does NOT exist in the source — this is intentional localization.

All three translation modes (UPDATE, section RESYNC, whole-file RESYNC) include this rule with specific examples.

### Retry logic

API calls use exponential backoff retry (3 attempts: 1s, 2s, 4s delays):
- **Retries on**: `RateLimitError`, `APIConnectionError`, transient 5xx errors
- **Never retries on**: `AuthenticationError`, `BadRequestError`, document-too-large errors

### ESM + CJS dual build

The CLI uses ESM (required by `ink` v4 for interactive rendering). The GitHub Action uses CJS (required by the Actions runtime). The build system produces both:
- `npm run build:cli` → ESM via `tsc` (CLI)
- `npm run package` → CJS via `esbuild` (`dist-action/index.js`)

## Parser internals

The parser (`parser.ts`) uses a **stack-based state machine** that processes documents line by line. It tracks:

- **Frontmatter** — YAML between `---` markers
- **Title** — First `#` heading
- **Introduction** — Content between title and first `##`
- **Sections** — Content under `##` headings, with recursive subsections for `###`–`######`

**State tracking:**
- Fence depth (for nested code blocks and directives)
- Current heading level
- Subsection stack (for recursive nesting)

The parser produces a `DocumentComponents` structure:

```typescript
interface DocumentComponents {
  frontmatter: string;
  title: string;
  titleText: string;
  introduction: string;
  sections: Section[];
}
```

Each `Section` contains:
```typescript
interface Section {
  heading: string;
  level: number;
  content: string;           // Content without subsections
  subsections: Section[];    // Recursive children
}
```

**Critical rule:** Always use `contentWithoutSubsections` for reconstruction, then append from `section.subsections`. Never read subsections back out of `content` — they will be duplicated.

## Document reconstruction

After translating changed sections, `file-processor.ts` reconstructs the full document:

1. Start with the target's frontmatter (with updated heading-map)
2. Add the title
3. Add the introduction
4. For each section:
   - If changed: use the translated content
   - If unchanged: use the existing target content
5. Recursively handle subsections at all levels

The reconstruction preserves exact whitespace and formatting for unchanged sections.

## Change detection

`diff-detector.ts` compares old and new source documents to identify changed sections:

1. Parse both documents into sections
2. Match sections by position (with heading-map validation)
3. Compare each pair's content (ignoring whitespace differences)
4. Recursively compare subsections
5. Return a list of changed section indices with their old/new content

Only sections detected as changed are sent to Claude for translation. This typically means 1–3 sections per PR, keeping costs low.

## Build and packaging

```bash
npm run build        # TypeScript compilation
npm run build:cli    # CLI ESM build
npm run package      # Action CJS bundle (dist-action/index.js)
npm test             # Run all 908 tests
```

The action is distributed as a single bundled file (`dist-action/index.js`) with no external dependencies at runtime. Glossary files are included in `dist-action/glossary/`.

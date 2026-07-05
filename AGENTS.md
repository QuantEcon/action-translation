# AGENTS.md

Guidance for coding agents working in this repository (GitHub Action + `translate` CLI for
translating QuantEcon MyST lectures via the Anthropic API; TypeScript).

## Working notes — read first

Maintainer/agent working memory lives in [`.dev/`](.dev/README.md):

- [`.dev/PLAN.md`](.dev/PLAN.md) — the active, phased work plan. Read before starting
  maintenance/roadmap work; tick tasks as you complete them.
- [`.dev/FUTURE.md`](.dev/FUTURE.md) — documented feature ideas awaiting iteration.
- [`.dev/ARCHITECTURE.md`](.dev/ARCHITECTURE.md) — architecture assessment and open design
  questions.
- [`.dev/DECISIONS.md`](.dev/DECISIONS.md) — append-only decision log (micro-ADR entries).
  Read before re-opening a design question; append an entry when one is settled.

Update these files as part of finishing work — they are the cross-session state.

## Commands

- `npm install` — setup
- `npm run build` — compile TypeScript (`dist/`) + bundle the action (`dist-action/`)
- `npm test` — Jest suite (build first: the CLI smoke tests execute `dist/cli/index.js`)
- `npm run lint` — ESLint

## Rules

- `dist-action/` is committed and must stay in sync with `src/` — always `npm run build`
  after source changes; CI fails on drift.
- Use `.tmp/` (gitignored) for scratch files; never create standalone summary/notes markdown
  files for individual changes.
- Update `CHANGELOG.md` under `[Unreleased]` for user-visible changes.
- Detailed conventions, module map, and the release checklist:
  [`.github/copilot-instructions.md`](.github/copilot-instructions.md).

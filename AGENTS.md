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
- Detailed conventions, module map, and the release checklist:
  [`.github/copilot-instructions.md`](.github/copilot-instructions.md).

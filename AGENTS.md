# AGENTS.md

Guidance for coding agents working in this repository (GitHub Action + `translate` CLI for
translating QuantEcon MyST lectures via the Anthropic API; TypeScript).

## Project notes (`.dev/`)

Maintainer/agent working memory lives in [`.dev/`](.dev/README.md) (the QuantEcon `.dev/`
convention — this is the pilot repo). Contract:

- Read [`.dev/STATE.md`](.dev/STATE.md) before starting work; discount it if `verified` is
  stale, and reconfirm. It points to [`PLAN.md`](.dev/PLAN.md) (roadmap),
  [`FUTURE.md`](.dev/FUTURE.md) (feature ideas), and [`ARCHITECTURE.md`](.dev/ARCHITECTURE.md)
  (open design questions).
- On finishing a session: write a summary to [`.dev/log/`](.dev/log/) (`YYYY-MM-DD-<id>.md`,
  a few lines; cross-repo findings go in its `promote:` list).
- Decisions go in [`.dev/decisions/`](.dev/decisions/), one file each, in the same PR that
  makes them; never edited — supersede via `superseded_by`.
- Keep STATE.md ≤1 page; bump `verified` only after reconfirming its claims. Frontmatter is
  limited to `verified`, `scope`, `superseded_by`, `promote` (CI-enforced — see
  [`.dev/README.md`](.dev/README.md)).
- `.dev/` is public: no credentials or sensitive detail; keep unpatched security specifics
  vague until fixed. Validate locally with `node .dev/tools/check.mjs`.

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

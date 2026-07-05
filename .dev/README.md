# `.dev/` — development notes

Internal working memory for this repository, shared by **maintainers and coding agents**.
Nothing in here is published: it is not part of the docs site (`docs/`), the npm package,
or the action bundle. It exists to save state between work sessions — what we're doing now,
what we want to do next, and why we decided what we decided.

## Why `.dev/` (the convention)

This folder name and layout is a deliberate cross-repo pattern for QuantEcon projects:

- **Dot-prefixed** — signals "internal working state, not product", keeps the top level clean,
  and sorts first in GitHub's file listing so it stays discoverable.
- **Tool-agnostic name** — the notes serve humans and any agent (Claude Code, Copilot, etc.),
  so tool-branded homes like `.claude/` or `.ai/` are wrong; those hold *tool config*, not notes.
- **No collision** — no popular tooling claims `.dev/` (nearest neighbours `.devcontainer/`
  and `.devenv/` are distinct).
- **Fixed filenames** — agents and instruction files (`CLAUDE.md`, `AGENTS.md`,
  `.github/copilot-instructions.md`) can point at stable paths: `PLAN.md`, `FUTURE.md`,
  `ARCHITECTURE.md`.

## Structure

| File | Role | Time horizon |
|------|------|--------------|
| [PLAN.md](PLAN.md) | The single **active** work plan — phased, checkbox-tracked | Now |
| [FUTURE.md](FUTURE.md) | Feature ideas, each fully documented for later iteration | Next |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Living architecture assessment, open design questions, decision log | Ongoing |
| [archive/](archive/) | Immutable, date-prefixed records of completed plans and shipped designs | Past |

## Conventions

1. **PLAN.md is the only active plan.** Work phases top-down; tick checkboxes as tasks land.
   When a phase (or a whole plan) completes, move it to `archive/YYYY-MM-<name>.md` and start
   the next plan fresh — don't let the active plan accumulate history.
2. **FUTURE.md ideas graduate into PLAN.md** when they are scheduled for building. Each idea
   uses the same section template (Status / Summary / Motivation / Design sketch /
   Open questions / Effort / References) so it can be iterated on before committing.
3. **ARCHITECTURE.md records decisions.** When a design question is settled, add a dated entry
   to its Decision log (what was decided, why, alternatives rejected) and link any relevant
   archive record. Rejected FUTURE ideas that mattered get a decision-log entry too.
4. **archive/ is immutable.** Files get a one-time "Archived YYYY-MM-DD" banner when they move
   in; after that they are never edited. Date-prefix filenames (`2026-03-...`).
5. **Absolute dates only** ("2026-07-05", never "last week") — these files outlive sessions.

## For agents

- Before starting roadmap/maintenance work, read `PLAN.md`; before proposing features, read
  `FUTURE.md` and `ARCHITECTURE.md` so proposals build on recorded state.
- Update these files as part of finishing work (tick tasks, append decisions) — that is the
  point of the folder.
- Do not cite this folder in user-facing docs; it is internal.

For user-facing and contributor documentation, see [`docs/`](../docs/) and
[`CONTRIBUTING.md`](../CONTRIBUTING.md).

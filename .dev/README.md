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
- **Fixed filenames** — agents and instruction files (`AGENTS.md`, `CLAUDE.md`,
  `.github/copilot-instructions.md`) can point at stable paths.

## Structure

| File | Role | Time horizon |
|------|------|--------------|
| [PLAN.md](PLAN.md) | The single **active** work plan — phased, checkbox-tracked | Now |
| [FUTURE.md](FUTURE.md) | Feature ideas, each fully documented for later iteration | Next |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Living architecture assessment and open design questions | Ongoing |
| [DECISIONS.md](DECISIONS.md) | Append-only log of settled decisions (micro-ADR entries) | Record |

## Conventions

1. **PLAN.md is the only active plan.** Work phases top-down; tick checkboxes as tasks land.
   When the plan completes, distill its outcomes into DECISIONS.md and start the next plan
   fresh — completed plans are **deleted, not archived** (git history preserves the full text;
   the CHANGELOG records what shipped).
2. **FUTURE.md ideas graduate into PLAN.md** when they are scheduled for building. Each idea
   uses the same section template (Status / Summary / Motivation / Design sketch /
   Open questions / Effort / References) so it can be iterated on before committing.
   Rejected ideas get a DECISIONS.md entry and are deleted.
3. **ARCHITECTURE.md holds the open questions.** When one settles, remove it there and add
   the dated entry to DECISIONS.md (what was decided, why, alternatives rejected).
4. **DECISIONS.md is append-only** — newest first, short micro-ADR entries (template at the
   top of the file). Never rewrite an entry; supersede it with a new one that links back.
   This is the distillation gate that replaces an archive folder: nothing gets deleted from
   `.dev/` until its decisions are recorded here. If the file ever outgrows single-file form,
   split it mechanically into a `decisions/` ADR folder.
5. **Absolute dates only** ("2026-07-05", never "last week") — these files outlive sessions.

## For agents

- Before starting roadmap/maintenance work, read `PLAN.md`; before proposing features or
  designs, read `FUTURE.md`, `ARCHITECTURE.md`, and `DECISIONS.md` so proposals build on
  recorded state and don't re-litigate settled questions.
- Update these files as part of finishing work (tick tasks, append decisions) — that is the
  point of the folder.
- Do not cite this folder in user-facing docs; it is internal.

For user-facing and contributor documentation, see [`docs/`](../docs/) and
[`CONTRIBUTING.md`](../CONTRIBUTING.md).

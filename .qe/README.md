# `.qe/` — the repository's QuantEcon folder

Everything QuantEcon-specific about *how this repository is worked* lives here, so that
retiring the overlay, archiving the repository or open-sourcing it is one decision about one
directory. Nothing in it is published or built. Its home is the Project Management Protocols
QEP (QuantEcon/qeps, QEP-7 — in draft); this repository is the pilot.

| Path | What | Written by | Lifecycle |
|---|---|---|---|
| `README.md` | this contract | people | living |
| `project.yml` | declared facts the `qe` skills read: the tracker, the registry slug, the programme | people, once | living |
| `dev/` | the notes record — see [`dev/README.md`](dev/README.md) | people and agents | raw entries append-only; distilled pages rewritten in place |
| `NEXT-STEPS.md` | the reading order across trackers and the gates between them — only in a repository with more than one tracker | people | living |
| `ROADMAP.md`, `DIGEST.md`, `snapshot.json` | views of the tracker drawn by the `qe` workplan skills | the skills | generated — marked as such in their first line; regenerated, never edited |

Not every file is present in every repository; the table is the convention's full set.

**The boundary test:** a file belongs here if it would leave with QuantEcon's way of managing
the project; a file that describes the product stays in `docs/`. `AGENTS.md`, `CLAUDE.md` and
`.claude/` stay at the repository root, where tools find them.

**Rules:** public content only (no credentials, no unpatched-vulnerability specifics);
absolute dates (`YYYY-MM-DD`); nothing under `.qe/` is git-ignored — scratch and working files
live outside the tree, in the agent's own scratchpad or a temporary directory.

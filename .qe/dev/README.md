# `dev/` — project notes

Working notes for this repository — **state, decisions, and design ideas** — maintained
jointly by humans and coding agents, inside [`.qe/`](../README.md), the repository's QuantEcon
folder. Nothing here is published (not in the docs site, npm package, or action bundle). Git
holds the project's history; `dev/` holds the curated, current picture: distill, supersede,
or delete. It is about **this repository only** — a finding about another repository, a
project that spans repositories, or the org is tagged `#promote` and promoted out.

`action-translation` is the **pilot repo** for the QuantEcon notes convention. Its home is the
Project Management Protocols QEP (QuantEcon/qeps, QEP-7 — in draft), which supersedes the
earlier spec in QuantEcon/QuantEcon.manual#103; the pilot's adoption is
QuantEcon/action-translation#73.

## Layout

```
.qe/dev/
├── STATE.md         # orientation and the resume checklist (~1 page);
│                    #   first line "verified: YYYY-MM-DD"; the tracker (#257) holds the state
├── PLAN.md          # current roadmap (not its history)
├── ARCHITECTURE.md  # optional living doc: design deliberation, open questions
├── FUTURE.md        # optional living doc: uncommitted feature ideas
├── decisions/       # D-YYYY-MM-DD-<slug>.md — one settled decision per file
└── log/             # YYYY-MM-DD-<id>.md — short dated session notes
```

**A distillation record.** `log/` and `decisions/` are the *raw* layer: append-only, entries
never edited (stale log files may be deleted once distilled — deletion ≠ editing; a decision
is superseded by a new file with a note at the top of the old one). The pages at the `dev/`
root are the *distilled* layer: rewritten in place, always current, citing the entries they
came from. Knowledge moves one way — raw → distilled → promoted: settled architecture
graduates from `ARCHITECTURE.md` to contributor docs, committed ideas from `FUTURE.md` to
`PLAN.md`, cross-repo findings to a QEP or the org vault via `#promote`.

**No YAML schema, no CI gates.** Structure lives in filenames, git, and three plain-text
conventions:

1. `verified: YYYY-MM-DD` as STATE.md's first line — trust the file less as that date ages.
2. A supersession note at the top of an old decision file, pointing to its replacement
   (decision files are otherwise never edited; date+slug filenames avoid id races between
   parallel agents).
3. Inline `#promote` tags marking cross-repo findings for the org knowledge vault —
   everything stays one `grep -rn "#promote" .qe/dev/` away.

Decision files are a few lines each: **context / decision / consequences** (+ refs). A record
explains the choice as of its date and guides the next one; it binds nothing beyond "read it
before re-litigating" — to change a decision, write the superseding record.

## Maintenance

An occasional **tidy session** is the distillation pass — an agent reads the folder, updates
the distilled pages from the raw entries, flags contradictions and staleness, records what it
distilled, and proposes pruning; a human approves the PR. Run when returning after a gap, or
roughly monthly. Humans curate STATE.md/PLAN.md and approve decisions and pruning; agents
write logs, file decisions, and run tidy passes. If tidy sessions repeatedly surface the same
mechanical problems, that's the evidence to script a check — not before.

## Content rules

- `.qe/` is **public**: no credentials, no unpatched-vulnerability specifics (track those in
  security advisories until fixed).
- Absolute dates only ("2026-07-05", never "last week") — these files outlive sessions.
- Nothing under `.qe/` is git-ignored; scratch and working files live outside the tree.
- The agent contract lives in [`AGENTS.md`](../../AGENTS.md).

For user-facing and contributor documentation, see [`docs/`](../../docs/) and
[`CONTRIBUTING.md`](../../CONTRIBUTING.md).

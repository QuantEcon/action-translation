# `.dev/` — project notes

Working notes for this repository — **state, decisions, and design ideas** — maintained
jointly by humans and coding agents. Nothing here is published (not in the docs site, npm
package, or action bundle). Git holds the project's history; `.dev/` holds the curated,
current picture: distill, supersede, or delete.

`action-translation` is the **pilot repo** for the QuantEcon `.dev/` convention —
spec and rationale: QuantEcon/QuantEcon.manual#103; pilot: QuantEcon/action-translation#73.

## Layout

```
.dev/
├── STATE.md         # where things stand: in flight / blocked / next (~1 page);
│                    #   first line "verified: YYYY-MM-DD"
├── PLAN.md          # current roadmap (not its history)
├── ARCHITECTURE.md  # optional living doc: design deliberation, open questions
├── FUTURE.md        # optional living doc: uncommitted feature ideas
├── decisions/       # D-YYYY-MM-DD-<slug>.md — one settled decision per file
├── log/             # YYYY-MM-DD-<id>.md — short dated session notes
└── scratch/         # gitignored working files (the repo's scratch location)
```

**Lifecycle by location**: anything at the `.dev/` root is *living* (edited in place, always
current); anything under `decisions/` or `log/` is *append-only* (entries never edited; stale
log files may be deleted once distilled — deletion ≠ editing). Settled architecture graduates
from `ARCHITECTURE.md` to contributor docs; committed ideas graduate from `FUTURE.md` to
`PLAN.md`.

**No YAML schema, no CI gates.** Structure lives in filenames, git, and three plain-text
conventions:

1. `verified: YYYY-MM-DD` as STATE.md's first line — trust the file less as that date ages.
2. A supersession note at the top of an old decision file, pointing to its replacement
   (decision files are otherwise never edited; date+slug filenames avoid id races between
   parallel agents).
3. Inline `#promote` tags marking cross-repo findings for the future org knowledge vault —
   everything stays one `grep -rn "#promote" .dev/` away.

Decision files are a few lines each: **context / decision / consequences** (+ refs).

## Maintenance

An occasional **"tidy `.dev/`" session** — an agent reads the folder, flags contradictions and
staleness, proposes pruning; a human approves the PR. Run when returning after a gap, or
roughly monthly. Humans curate STATE.md/PLAN.md and approve decisions and pruning; agents
write logs, file decisions, and run tidy passes. If tidy sessions repeatedly surface the same
mechanical problems, that's the evidence to script a check — not before.

## Content rules

- `.dev/` is **public**: no credentials, no unpatched-vulnerability specifics (track those in
  security advisories until fixed).
- Absolute dates only ("2026-07-05", never "last week") — these files outlive sessions.
- The agent contract lives in [`AGENTS.md`](../AGENTS.md).

For user-facing and contributor documentation, see [`docs/`](../docs/) and
[`CONTRIBUTING.md`](../CONTRIBUTING.md).

---
scope: repo
superseded_by: null
---

# Adopt the pilot `.dev/` layout (STATE + decisions/ + log/ + health check)

**Decision**: Restructure this repo's `.dev/` to the pilot design from
QuantEcon/QuantEcon.manual#103: living `STATE.md` (≤1 page, `verified:` date) and `PLAN.md`;
append-only `decisions/` (one file each, `scope` + `superseded_by` frontmatter, date+slug
filenames) and `log/` (per-session summaries, optional `promote:`); a deterministic pass-1
health check enforcing the 4-key frontmatter schema. `FUTURE.md` and `ARCHITECTURE.md` are
retained as additional *living* docs (see pilot feedback in the 2026-07-05 session log).

**Why**: Machine-checkable staleness and a capped, consumer-justified frontmatter schema
scale better across repos and parallel agents than prose discipline; per-file decisions and
logs let concurrent agents write without collisions.

**Deviations from the spec** (recorded as `promote:` feedback to manual#103): decision ids are
date+slug, not `D-NNN` (collision-free under parallel agents); scratch stays in `.tmp/`
([2026-07-05-scratch-stays-in-tmp](2026-07-05-scratch-stays-in-tmp.md)); `FUTURE.md`/
`ARCHITECTURE.md` kept as additional living docs (the spec's four core files have no home for
multi-page backlog/open-question content).

**Refs**: QuantEcon/QuantEcon.manual#103, QuantEcon/action-translation#73, PR #72;
supersedes [2026-07-05-single-file-decision-log](2026-07-05-single-file-decision-log.md).

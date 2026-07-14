# Adopt the `.dev/` notes convention (pilot repo)

**Context**: Working notes lived in `dev-notes/` (a 1,850-line completed plan, one design
record) with no lifecycle discipline; agent sessions had no durable state or decision record.
QuantEcon needed a cross-repo pattern (design: QuantEcon/QuantEcon.manual#103). An earlier
iteration with YAML frontmatter, CI lint, and metrics was simplified same-day after pilot
feedback — complexity must be earned by observed pain. #promote

**Decision**: `action-translation` is the first pilot of the lightweight `.dev/` convention:
living docs at the root (`STATE.md` with a `verified:` first line, `PLAN.md`, optional
`ARCHITECTURE.md`/`FUTURE.md`), append-only `decisions/` (`D-YYYY-MM-DD-<slug>.md`, superseded
via a note at the top of the old file, never edited) and `log/` (dated session notes), inline
`#promote` tags for cross-repo findings, maintenance via occasional agent "tidy" sessions with
human-approved PRs. No in-repo archive: distill, supersede, or delete — git holds history.

**Consequences**: Contract lives in `AGENTS.md`; scratch moves to `.dev/scratch/`
([D-2026-07-05-scratch-moves-to-dev-scratch](D-2026-07-05-scratch-moves-to-dev-scratch.md));
CI ignores `.dev/**`. Keep/expand/kill judged after a few months of real use: is STATE.md the
thing agents and humans actually read first?

**Refs**: QuantEcon/action-translation#73, QuantEcon/QuantEcon.manual#103, PR #72.

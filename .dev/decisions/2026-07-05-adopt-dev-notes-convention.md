---
scope: org
superseded_by: null
---

# Adopt the `.dev/` working-notes convention

**Decision**: Keep project working notes (plans, state, decisions, session logs) in a
dot-prefixed `.dev/` folder shared by humans and coding agents, integrated via a pointer in
`AGENTS.md` / `CLAUDE.md`. Intended as a cross-repo pattern for QuantEcon projects, with
`action-translation` as the first pilot.

**Why**: Dot-prefixed (internal, sorts first on GitHub, ignored by MyST/Sphinx source
discovery and glob CI), tool-agnostic plain markdown (serves any agent or human), unclaimed by
popular tooling (`.git`, `.github`, `.devcontainer`, `.claude`, `.cursor` etc.). High
signal-to-noise: `.dev/` holds curated *assets*, not a full history — git already provides
that, so nothing here duplicates git. No in-repo archive: completed plans and superseded docs
are deleted once their outcomes are distilled into `decisions/`.

**Rejected**: `.claude/`/`.ai/` (tool-branded config homes, not shared notes); `docs/` subdirs
(leak into the published mystmd site); visible `notes/` (product-level clutter); an in-repo
`archive/` (rot, duplicates git).

**Refs**: pilot QuantEcon/action-translation#73; design QuantEcon/QuantEcon.manual#103; PR #72.

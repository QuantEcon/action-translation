---
scope: repo
superseded_by: null
---

# Scratch stays in `.tmp/`, not `.dev/scratch/`

**Decision**: This repo keeps its established gitignored `.tmp/` scratch directory instead of
adopting the pilot's `.dev/scratch/`.

**Why**: `.tmp/` is already anchored (`.gitkeep`), gitignored, and documented in
`.github/copilot-instructions.md`; two scratch locations would split agent behaviour. Migrating
is cheap but out of scope for the notes-structure pilot, and one scratch dir per repo is the
point.

**Pilot feedback (promote to manual#103)**: the spec's `.dev/scratch/` collides with the
`.tmp/` convention common in Node repos — the convention should either defer to an existing
scratch dir or make `.dev/scratch/` explicitly optional.

**Refs**: `.github/copilot-instructions.md` (`.tmp/` workflow); QuantEcon/QuantEcon.manual#103.

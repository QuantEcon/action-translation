# Scratch moves from `.tmp/` to `.dev/scratch/`

**Context**: The repo's documented scratch location was a gitignored `.tmp/` folder (anchored
by `.gitkeep`, described in copilot-instructions). The `.dev/` convention brings its own
gitignored `scratch/`; two scratch locations would split agent behaviour.

**Decision**: `.dev/scratch/` is the single scratch convention. `.tmp/` is retired: its
`.gitkeep` anchor removed, the path left gitignored so stale local copies stay invisible.
`copilot-instructions.md` and `AGENTS.md` updated.

**Consequences**: Agents write all scratch/working files (PR bodies, command output, drafts)
to `.dev/scratch/`; nothing under `.dev/scratch/` is ever committed.

**Refs**: QuantEcon/action-translation#73 (adoption step 2).

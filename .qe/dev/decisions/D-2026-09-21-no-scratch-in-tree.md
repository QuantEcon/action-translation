# No scratch location in the tree

**Context**: `.dev/scratch/` was git-ignored, so git versioned nothing in it, while it
still cost a `.gitkeep`, an ignore rule, a carve-out in `check-dev-refs.mjs`, and a place
for working files to accumulate — and it created a third state for a file, in the tree but
uncommittable, which is where the 2026-07-28 audit bundle sat for weeks. Ruled 2026-09-21
(@mmcky). #promote

**Decision**: The convention prescribes no scratch location. Working files live in the
agent's own scratchpad or a temporary directory outside the repository; anything worth
keeping is promoted into `.qe/dev/` deliberately. Nothing under `.qe/` is git-ignored.

**Consequences**: `scratch/` removed with its `.gitkeep` and `.gitignore` lines; the `gh`
and commit-message conventions in `AGENTS.md` write to a temporary directory instead.
Supersedes D-2026-07-05-scratch-moves-to-dev-scratch.

**Refs**: QuantEcon/action-translation#73 (adoption step 2, now reversed).

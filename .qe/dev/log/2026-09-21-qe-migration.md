# 2026-09-21 — `.dev/` becomes `.qe/dev/`; no scratch in the tree

**Trigger**: the 2026-09-21 rulings for the Project Management Protocols QEP (QuantEcon/qeps, QEP-7, draft; discussion QuantEcon/qeps#39): one `.qe/` folder per repository, flat at the root, with the notes convention inside it and no git-ignored scratch location.

**Done**: `git mv .dev .qe/dev`; `scratch/` removed; `.qe/README.md` (the folder's contract) and `.qe/project.yml` (tracker #257, registry slug `engine-v027`, programme `translation`) added; pointers updated in `AGENTS.md`, `.gitignore`, `check-dev-refs.mjs`, `ci.yml`, the living notes, and the code comments and reports that cite decision records; two decision records filed (`D-2026-09-21-notes-move-to-qe-dev`, `D-2026-09-21-no-scratch-in-tree`) and the two 2026-07-05 records annotated. Raw entries under `log/` and `decisions/` are unedited and keep their historical `.dev/` paths.

**Not done**: STATE.md is untrimmed — its *In flight* section restates tracker #257, and the two disagree on W1's target release (v0.30.0 against v0.28.0); the next tidy pass brings it to orientation and the resume checklist, per the new rule.

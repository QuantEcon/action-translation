# Working notes move from `.dev/` to `.qe/dev/`

**Context**: The `.dev/` pilot (D-2026-07-05-adopt-dev-notes-convention) proved the notes
convention; what it lacked was a boundary. Everything QuantEcon-specific about how a
repository is worked — notes, decisions, logs, the views the `qe` skills generate, the
declared project facts — was spread over `.dev/`, root files and `.gitignore` lines, so
retiring or open-sourcing the overlay meant a hunt. Ruled 2026-09-21 (@mmcky) for the
Project Management Protocols QEP (QuantEcon/qeps, QEP-7, draft). #promote

**Decision**: One folder, `.qe/`, flat at the root, holds the repository's QuantEcon
overlay: `README.md` (the contract), `project.yml` (declared facts), the generated tracker
views where present, and `dev/` — this convention, moved in unchanged and scoped to this
repository only. `dev/` runs as a distillation record: `log/` and `decisions/` are raw and
append-only; `STATE.md`, `PLAN.md`, `ARCHITECTURE.md` and `FUTURE.md` are distilled and
rewritten in place; a tidy pass promotes upward (to `docs/`, a QEP, the vault). The tracker
(#257) is the current-state register; STATE.md keeps to orientation and the resume
checklist. A decision record explains a choice as of its date and guides the next one; it
binds nothing beyond "read it before re-litigating", and is changed by a superseding record.

**Consequences**: `git mv .dev .qe/dev`; pointers in `AGENTS.md`, `check-dev-refs.mjs`, CI
and the living notes updated; the raw entries under `log/` and `decisions/` keep their
historical `.dev/` mentions unedited. Amends the location half of
D-2026-07-05-adopt-dev-notes-convention (the convention itself stands). Trimming STATE.md to
the new rule is the next tidy pass, not this move.

**Refs**: QuantEcon/qeps#15, QuantEcon/qeps#18 (QEP-6), QuantEcon/qeps#39 (the PMP
discussion), QuantEcon.manual#103 (the spec this supersedes).

---
scope: repo
superseded_by: 2026-07-05-adopt-pilot-dev-structure
---

# Single-file `DECISIONS.md` over a `decisions/` folder

**Decision** (superseded same day): Record decisions in one append-only `DECISIONS.md` file
rather than one file per decision.

**Why (at the time)**: At ~1 decision/month a folder felt like ceremony; a single file loads
the whole history in one read and keeps chronology scannable.

**Superseded by** [2026-07-05-adopt-pilot-dev-structure](2026-07-05-adopt-pilot-dev-structure.md):
adopting the pilot design (QuantEcon/QuantEcon.manual#103) moved decisions into a `decisions/`
folder — one file per decision enables per-decision `superseded_by` links and machine-checkable
frontmatter, which the single-file form could not carry. Kept as a record so the reversal is
self-documenting (this entry demonstrates the `superseded_by` mechanism working).

**Refs**: PR #72 (original single-file `DECISIONS.md`, in git history).

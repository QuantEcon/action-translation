---
scope: repo
superseded_by: null
---

# Heading-maps in `translation:` frontmatter, not `_translation.yml`

**Decision**: Per-file frontmatter block (`translation: {title, headings}`) over a centralized
`_translation.yml`, for v0.x; legacy `heading-map:` format deprecated (removal tracked as
issue #53 / PLAN Phase 8).

**Why**: Metadata travels with the file through renames and PRs; no cross-file sync problem.

**Refs**: issues #3/#51, PR #52. Note: ARCHITECTURE.md Q2 may reopen the storage location
under mystmd (frontmatter validation), toward `.translate/` (R2).

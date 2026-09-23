# Heading-maps in `translation:` frontmatter, not `_translation.yml`

**Context**: Cross-language section matching needs a persistent heading correspondence; the
fork was per-file frontmatter vs a centralized `_translation.yml` (issue #3).

**Decision**: Per-file frontmatter block (`translation: {title, headings}`) for v0.x —
metadata travels with the file through renames and PRs, no cross-file sync problem. Legacy
`heading-map:` format deprecated (removal: issue #53 / PLAN Phase 8).

**Consequences**: ARCHITECTURE.md Q2 may reopen the storage location under mystmd (frontmatter
validation), toward `.translate/` (recommendation R2).

**Refs**: issues #3/#51, PR #52.

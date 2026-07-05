# DECISIONS: append-only decision log

Dated records of settled questions — architecture, tooling, policy, process. Newest first.
**Never rewrite an entry**; if a decision changes, append a new entry that supersedes the old
one and links back. This file is the distillation gate: before deleting a completed plan or a
rejected FUTURE idea, its decision lands here. Raw history lives in git; *why* lives here.

Entry template:

```markdown
## YYYY-MM-DD — Title

**Decision**: what was decided (one or two sentences).
**Why**: the forces that decided it.
**Rejected**: alternatives considered, and why not. (optional)
**Refs**: issues/PRs/files, incl. `git history:` pointers for deleted docs. (optional)
```

If this file ever gets unwieldy or needs per-decision status lifecycle, split it mechanically
into a `decisions/` ADR folder (one entry per file, same template).

---

## 2026-07-05 — `.dev/` keeps no archive; decisions distill into this file

**Decision**: Dropped the `archive/` folder from the `.dev/` convention (deleting the archived
2026-03 resync-CLI plan and the issue-63 design record). Completed plans and superseded docs
are deleted after their outcomes are distilled here; DECISIONS.md is a single append-only file
rather than an ADR-style `decisions/` folder.
**Why**: Git history + CHANGELOG already preserve the *what*; in-repo archives rot unread and
duplicate git's job. The *why* must stay discoverable — hence this mandatory distillation gate.
Single file over folder: agents load the whole history in one read, chronology is scannable,
and low append-friction keeps the log alive; at ~1 decision/month a folder is ceremony.
**Rejected**: `decisions/` ADR folder (right for higher decision traffic / per-decision status
lifecycle — documented above as the graduation path); keeping `archive/` (rot, duplication).
**Refs**: git history: `dev-notes/PLAN.md`, `dev-notes/FIX-ISSUE-63.md`,
`.dev/archive/` (removed this date). Extracted content: auto-merge spec → FUTURE.md idea 1;
experiment data → ARCHITECTURE.md Q3; unfinished test items → PLAN.md Phase 5.

## 2026-07-05 — Adopted the `.dev/` working-notes convention

**Decision**: Replaced `dev-notes/` with `.dev/`: PLAN.md (active phased plan), FUTURE.md
(documented feature ideas), ARCHITECTURE.md (living assessment + open questions), DECISIONS.md
(this file), plus a root AGENTS.md pointing agents here. Intended as a cross-repo pattern for
QuantEcon projects.
**Why**: Dot-prefixed (internal, sorts first on GitHub), tool-agnostic (humans + any agent),
unclaimed by popular tooling, fixed filenames for stable agent pointers.
**Rejected**: `.claude/`/`.ai/` (tool-branded config homes, not shared notes); `docs/` subdirs
(leak into the published mystmd site); visible `notes/` (product-level clutter).

## 2026-06 — Malayalam: keep-English-dominant policy

**Decision**: For `ml`, technical terms stay in English with Malayalam grammatical inflection
around them (`economy-യിലെ`, `bond-ന്റെ`); only everyday connective words are translated.
Policy carried by `language-config.ts` prompt rules; the per-term glossary `treatment` field
was deferred (zero-schema-change v1).
**Why**: Native-reviewer (Adisankar Manoj Thanuja) guidance; en→ml is a low-resource
generation cliff and English-dominant text matches how Malayalam-speaking economists read.
**Refs**: issue #70, PR #71.

## 2026-04 — Rebase-on-merge over queue/batching for sync-PR conflicts

**Decision**: Fix issue #63 (62% translation-PR conflict rate) with a `rebase` action mode:
when a translation PR merges, regenerate sibling PRs against the new main, with a
section-level translation cache making the common case zero-API-cost. Auto-merge + editor
digest (its designed "Stage 2") deliberately deferred — now FUTURE.md idea 1.
**Why**: Translation PRs are full-file snapshots, so 3-way merge is structurally impossible;
regeneration against current main is cheap and idempotent, and order of merges doesn't matter.
**Rejected**: sequential merge queue (adds latency, high complexity); batching (loses per-PR
provenance); auto-merge alone (sidesteps the root cause; race-prone without rebase).
**Refs**: issue #63, PR #64, v0.14–v0.15.0; full design: git history: `dev-notes/FIX-ISSUE-63.md`.

## 2026-03-06 — CLI renamed `resync` → `translate`; `init` command added

**Decision**: The CLI's identity is lifecycle management (`translate`), not just resync; `init`
bulk-bootstraps a whole target repo.
**Refs**: PR #23; 2026-03 plan Phase 5 (git history: `dev-notes/PLAN.md`).

## 2026-03-05 — Whole-file evaluation for backward Stage 2

**Decision**: Backward analysis evaluates one whole file per LLM call instead of one call per
section.
**Why**: Experiment on a 51-file repo: 182 → 32 API calls with *better* results (more
high-confidence findings, less noise) — cross-section context reduces false positives.
**Refs**: `experiments/forward/`; raised ARCHITECTURE.md Q3 (should forward sync follow?).

## 2026-03-04 — `ink` over Python `rich` for the interactive review UI

**Decision**: Keep the CLI single-language TypeScript with ink v4; a full Python/`rich`
rewrite is documented as a conditional fallback (FUTURE.md idea 11).
**Why**: Unified codebase and direct imports of the core engine beat nicer terminal rendering.
**Refs**: 2026-03 plan Phase 3a (git history: `dev-notes/PLAN.md`).

## 2026-03 — Heading-maps in `translation:` frontmatter, not `_translation.yml`

**Decision**: Per-file frontmatter block (`translation: {title, headings}`) over a centralized
`_translation.yml`, for v0.x; legacy `heading-map:` format deprecated (removal tracked as
issue #53 / PLAN Phase 8).
**Why**: Metadata travels with the file through renames and PRs; no cross-file sync problem.
**Refs**: issues #3/#51, PR #52. Note: ARCHITECTURE.md Q2 may reopen the storage location
under mystmd (frontmatter validation), toward `.translate/` (R2).

## 2025-10 — LLM improvements to unchanged translations: accept and monitor

**Decision**: When Claude opportunistically improves an unchanged target section during an
update (e.g. fixing a transliteration), accept it rather than constraining the prompt.
**Why**: Observed improvements were genuine; a strict-preservation flag remains an option if
review cost grows (field evidence of that cost noted in the #63 discussion).
**Refs**: issue #1 (close with pointer here — PLAN Phase 8).

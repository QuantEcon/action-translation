# ARCHITECTURE: assessment, open questions, decisions

**Created**: 2026-07-05 (from the deep technical review). Living document — iterate on the
open questions here *before* anything becomes a PLAN.md phase; record outcomes in the
Decision log at the bottom.

---

## 1. System snapshot (current state)

Two surfaces share one translation engine:

- **GitHub Action** (`src/`, bundled to `dist-action/`): `sync` (merged source PR → section
  diff → translate changed sections → PR in target repo), `review` (AI quality score on
  translation PRs), `rebase` (regenerate sibling translation PRs after one merges, with a
  section-level translation cache).
- **`translate` CLI** (`src/cli/`): repo lifecycle — `init` (bulk bootstrap), `forward`
  (whole-file RESYNC drift recovery), `backward` (find target-side improvements worth
  backporting), `review` (interactive ink UI → GitHub issues), plus `status`/`doctor`/
  `headingmap`/`setup` diagnostics and scaffolding.

**The pipeline hangs off heading text.** `MystParser` splits on `^#{2,6}` regexes; sections
are identified by heading-text slugs; the diff detector, target matching, heading-maps
(`translation:` frontmatter), and the rebase cache all key on those slugs, with positional
fallback when lookups miss.

**State lives in three uncoordinated channels**: `translation:` frontmatter heading-maps
(per file), `.translate/` YAML state (per target repo), and a machine-readable
`translation-sync-metadata` JSON block in PR bodies (sole input to rebase mode).

**Deployment topology**: one English source repo per lecture series; one target repo per
(series × language) (`lecture-python-programming` → `.zh-cn`, `.fa`); the action runs in the
source repo (sync) and target repos (review, rebase) with a cross-repo PAT. Production:
zh-cn + fa; ml in flight (PR #71), fr/ja glossaries drafted (#68/#69).

Known structural weaknesses (evidence in the 2026-07-05 review; fixes tracked in PLAN.md):
no fence awareness in the parser, no parse→reconstruct guarantee, a validation gate that
cannot fire, truncation undetectable, PR-body state human-editable and trusted, duplicated
retry/parse/section logic drifting across five sites.

---

## 2. Recommendations (R1–R7)

### R1. Fence-aware tokenizer now; mystmd AST later; round-trip invariant forever
The recurring one-construct-at-a-time bug family (#5, #6/#40, #49, #50/#54, #65) is the
empirical proof that regex line-parsing of MyST is the wrong foundation. Sequence:
(a) PLAN Phase 2 — fence tracking + anchor ownership + `reconstruct(parse(doc)) === doc`
test; (b) evaluate adopting **mystmd's TypeScript parser** for splitting/validation — same
language as this codebase, real AST, and the same dialect as the future builder (see Q2).
Constructs spanning section boundaries (`exercise-start`/`end`) need pair-integrity checks
regardless of parser.

### R2. Consolidate state into `.translate/`; demote the PR body to a summary
The PR-body channel is the weakest state store (64 KB cap, human-editable — already broke
review mode and needed a CRLF shim; goes stale after rebase force-pushes; trust boundary for
anything that can name a branch `translation-sync-*`) yet it is the *sole* input to rebase.
Move rebase-relevant state (source SHAs, per-file types, target base SHA, cache hints) into
`.translate/` **on the PR branch** — bot-controlled, size-unbounded, versioned with the
content it describes. Keep the PR-body block as a small versioned *read-only summary* for
external consumers (issue #66) — freeze the contract only after this split (see FUTURE.md
idea 3).

### R3. One core; one LLM client; one parser
Layering is inverted in one spot: the action imports from `src/cli/`
(`translate-state`, CLI types) — state is core domain. Extract `src/core/` (or flatten):
state module, one shared Claude-call helper (retry + `stop_reason` + JSON extraction —
replaces 5 drifting copies), one section parser (delete `reviewer.ts`'s private one).
The drift is not hypothetical: CRLF, pagination, and `overloaded`-retry fixes each landed in
one copy and missed the others. Tracked as PLAN Phase 6.

### R4. Give state a target-content identity
`.translate/state` records only `source-sha`, so "has the target changed since sync?" and
"did the sync PR merge?" are inexpressible — the direct cause of the backward-skip and
forward-state bugs (PLAN Phase 3). Add `target-sha`/content hash and a lifecycle status.
This is also the substrate auto-merge and the reviewer web app need.

### R5. Heading identity, not just heading matching
A reworded heading is indistinguishable from delete+add, which re-translates from scratch and
**discards accumulated human refinements** — the project's most expensive asset. Ascending
options: fuzzy candidate-pairing on delete+add pairs; using `(label)=` anchors as stable
section IDs where present (QuantEcon lectures are label-rich — and this pairs naturally with
R1's anchor-ownership fix); path-independent heading-map keys so a parent rename doesn't
invalidate every descendant.

### R6. Decompose `index.ts`; type the GitHub layer; atomic commits
`index.ts` is entrypoint + content-fetch layer + entire rebase pipeline (1,095 lines, 0%
coverage, unreachable from tests/CLI). `octokit: any` everywhere forfeited the typing that
would have flagged the pagination bugs. Per-file `createOrUpdateFileContents` makes N commits
per PR and creates SHA races — a single tree+commit via the Git Data API is atomic and faster.

### R7. Prompts as versioned artifacts
Policy text is duplicated verbatim across six prompt sites with hand-maintained (already
colliding) rule numbering; language rules split between code and glossary JSON; no snapshot
tests, so prompt drift is invisible in review. Centralize fragments, snapshot-test assembled
prompts, and version them so quality changes are attributable. Prompt caching (FUTURE.md
idea 7) falls out of the same restructuring: static prefix first, `cache_control` breakpoint.

---

## 3. Open questions

### Q1. Repo topology: separate repos per language vs mono-repo

**Context.** Today: one repo per (series × language). Under consideration elsewhere in
QuantEcon: reorganizing the English lectures into a central mono-repo. Question: should
translations also consolidate (languages as folders in the source repo), or does the
separate-repo design remain right — especially looking ahead to the mystmd builder?

**What the current design buys (forces for separate repos):**
- **Per-language community autonomy.** Native-speaker reviewers get real repo permissions,
  their own issue tracker and review queue. GitHub permissions are repo-granular; in a
  mono-repo this degrades to CODEOWNERS + branch protection, and every language shares one
  PR/notification firehose with English editorial work.
- **CI and deploy isolation.** Lecture builds execute code and are slow/heavy
  (jupyter-book/sphinx today). Per-language repos build and deploy independently; a mono-repo
  multiplies build matrix and queue contention on every merge, and language sites deploy
  1:1 from their repo today (Pages/domains).
- **Machine-PR noise containment.** Sync generates high-volume bot PRs; the #63 conflict
  storms stayed contained in target repos rather than polluting the source repo.
- **Repo size**: content × N languages plus notebooks/images in one repo.

**What the boundary costs (forces for consolidation):**
- Nearly every hard engineering problem in this codebase is a **compensation for the repo
  boundary**: cross-repo state channels (PR-body metadata, R2), heading-maps as cross-repo
  correspondence tables, rebase mode itself (#63), cross-repo PATs and the machine-user
  question (#61), the rebase trust boundary, `setup`'s workflow scaffolding. Same-repo
  translations would make a translation update an ordinary PR — atomic with its source
  change if desired, no PAT, no body-embedded state.
- Cross-cutting refactors (file renames, TOC restructures) currently require N coordinated
  PRs; drift between repos is structural (that's what `status`/`forward` exist to repair).

**Options considered:**
- **A. Status quo** — repo per (series × language).
- **B. Per-series mono-repo** — languages as folders (`lectures/`, `lectures.zh-cn/`, …) in
  each source repo. Maximal atomicity; worst CI/permissions/noise trade-offs.
- **C. One translations mono-repo** — all languages, separate from English source. Single
  PAT target and state home, English editorial stays clean; still cross-repo, still
  conflict-prone, and mixes language communities with each other.
- **D. Central English mono-repo + one repo per language** (all series inside each) — the
  natural companion to the planned lectures mono-repo. Repo count drops from series×languages
  to languages; sync fan-out becomes 1 source → N language repos; per-language community, CI,
  and deployment isolation all survive.

**Current position (2026-07-05).** The separate-repo boundary is carried by two forces that
are *not* engineering conveniences: per-language community autonomy and heavy executed
builds. Both remain real under mystmd (builds get faster, but execution and per-language
deployment remain). So: **keep the language-repo boundary; evolve toward D as the English
mono-repo lands.** Meanwhile, invest in making sync state topology-agnostic (R2 + R4: state
travels in `.translate/` next to the content, not in PR bodies or workflow config) — that
makes the action indifferent to where the target lives, keeps a future consolidation cheap,
and pays off immediately regardless.

**Revisit triggers**: mystmd grows a first-class i18n/multi-language site story; review
latency stays the bottleneck even after auto-merge (FUTURE idea 1) — the strongest argument
for same-repo translations is eliminating the PR-merge round-trip entirely; per-language
repo count exceeding ops capacity (secrets rotation, workflow version pinning across ~N×6
repos); or the D migration itself (which forces the sync config to become a language matrix —
design that config once, for D).

### Q2. Builder migration: `jupyter-book<2` + `quantecon-book-theme` → `mystmd` + `quantecon-theme.mystmd`

**Principle**: the action translates MyST *source*, not built output — so it is largely
builder-agnostic by design. The exceptions are exactly where it will break:

- **TOC**: mystmd replaces `_toc.yml` with `myst.yml` (project `toc:`). The action hardcodes
  `_toc.yml` (`classifyChangedFiles`) and the dead `toc-file` input doesn't help; the CLI's
  `init` (`parseTocLectures`) and `setup` workflow `paths` filters parse/point at `_toc.yml`
  too. Migration work: support both TOC formats behind one abstraction, auto-detected.
  (PLAN Phase 4 wires the input; the abstraction belongs to the migration.)
- **Frontmatter**: the `translation:` block (title + heading-map) rides in page frontmatter.
  mystmd *validates* frontmatter and warns on unknown keys — verify the key survives cleanly
  (or is configurable) on a pilot repo. If it's noisy, that **accelerates R2**: move
  heading-maps into `.translate/` and out of the published source entirely (the issue-#3
  design fork, revisited).
- **Dialect**: heading/fence/math/code-cell syntax is shared, so the parser keeps working;
  but sphinx-era constructs in lecture content (`{tableofcontents}`, sphinx-only roles,
  substitutions) will be rewritten during migration — expect a wave of "new construct"
  parser edge cases (R1's round-trip test is the safety net; add fixtures from the first
  migrated repo).
- **Opportunities**: mystmd is **TypeScript** — its parser can back R1 (real AST, same
  dialect as the builder) and the structural lint (FUTURE idea 4) could literally be
  `mystmd` parse + custom rules; mystmd's link/xref checking would have caught the #65
  anchor damage at build time in target repos. The docs site already runs mystmd, so team
  familiarity exists.

**Suggested sequencing**: don't couple the action to either builder; land R1 + TOC
abstraction first; pilot sync on the first mystmd-migrated series before migrating the
production language repos.

### Q3. Whole-file vs section-by-section forward translation (carried from archive plan "Phase 9")

Backward Stage 2's move to whole-file evaluation gave ~6× fewer API calls *and* better
results (182→32 calls on a 51-file repo; more high-confidence findings, less noise —
[archive/2026-03-resync-cli-plan.md](archive/2026-03-resync-cli-plan.md), `experiments/forward/`).
Should forward sync (`translator.ts`) follow?

- **For**: cross-section terminology consistency; fewer calls; no section-reconstruction
  bug class (a large slice of PLAN Phase 2 exists because of split/rejoin).
- **Against**: loses section-level caching (UPDATE mode re-translates everything on any
  change — cost and *churn*: unchanged sections get retranslated, discarding human edits,
  which violates the prime directive of preserving target refinements); all-or-nothing error
  recovery; token limits on long lectures (the truncation findings make this worse, not
  better).
- **Likely landing zone (hybrid)**: whole-file for `init`/NEW files and CLI `forward` RESYNC
  (already whole-file); section-based for UPDATE where preserving unchanged target content
  is the point. Prompt caching (FUTURE idea 7) weakens the cost argument for whole-file;
  R5 (stable section identity) weakens the bug-class argument. Decide after Phase 2 ships
  and with real cost numbers.

---

## 4. Decision log

Dated records of settled questions (newest first). Add an entry whenever a Q above closes or
a significant FUTURE idea is rejected.

- **2026-07-05 — Adopted the `.dev/` convention** (this folder): PLAN/FUTURE/ARCHITECTURE +
  immutable archive, replacing `dev-notes/`. Intended as a cross-repo pattern for QuantEcon
  projects.
- **2026-06 — Malayalam keep-English-dominant policy** (issue #70, PR #71): native-reviewer
  decision — technical terms stay English with Malayalam grammatical inflection; policy
  carried by `language-config.ts` prompt rules; glossary `treatment` field deferred
  (zero-schema-change v1).
- **2026-04 — Rebase-on-merge over sequential-queue/batching for #63** (see
  [archive/2026-04-fix-issue-63-rebase-on-merge.md](archive/2026-04-fix-issue-63-rebase-on-merge.md)):
  full-file-snapshot PRs made 3-way merges structurally impossible; regenerating siblings on
  merge with a section cache fixes the root cause. Auto-merge + digest (its Stage 2)
  deliberately deferred — now FUTURE.md idea 1.
- **2026-03-06 — CLI renamed `resync` → `translate`**; `init` command added (archive plan
  Phase 5).
- **2026-03-05 — Whole-file evaluation for backward Stage 2** (archive plan Phase 3b
  experiment): 6× fewer calls, better precision; raised Q3 for forward.
- **2026-03-04 — `ink` over Python `rich` for the review UI**: unified codebase and direct
  module imports won; Python rewrite documented as a conditional fallback (FUTURE.md idea 11).
- **2026-03 — Frontmatter `translation:` block over `_translation.yml`** (issues #3/#51,
  PR #52): per-file frontmatter won for v0.x; legacy `heading-map:` removal is PLAN Phase 8
  (issue #53). Note Q2 may reopen the storage location under mystmd.
- **2025-10 — LLM improvements to unchanged translations: accept and monitor** (issue #1):
  beneficial in observed cases; revisit only if review cost becomes measurable (field
  evidence noted in #63 discussion).

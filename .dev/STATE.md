verified: 2026-07-22

# STATE

Where things stand, ~1 page. Read this first; trust it less as the `verified:` date ages.
Roadmap detail lives in [PLAN.md](PLAN.md), not here.

## In flight

- **PR #71** — Malayalam (`ml`) draft; awaiting native-reviewer calibration batch.
  Glossary PR **#69** (ja) open, awaiting native review + a `LANGUAGE_CONFIGS` entry.

## Recently landed

- **v0.22.0** (2026-07-22) — #144 delivered **reviewer verdict v2**, the machine-readable
  review contract (#103 prerequisite, specified in #66): every review comment now ends with a
  `translation-review-verdict` JSON block carrying per-criterion scores, the composite that was
  computed but never printed, the four diff checks, structured findings, a **categorical
  `auto-merge`/`editor` recommendation from rubric logic rather than the blended score**, the
  reviewer model, the engine version, and the **head SHA the verdict was computed against**.
  New input `auto-merge-mode: off | shadow` records the would-auto-merge decision without acting
  (`active` fails loudly); new outputs `review-recommendation`, `reviewed-head-sha`,
  `would-auto-merge`. `translation-sync-metadata` gains `schemaVersion: 1` from both writers and
  both blocks are documented as a public contract in `docs/user/metadata-contract.md`.
  **Validation is the story**: six live harness runs (driving the built bundle against real PRs,
  per the harness convention) plus an adversarial audit and Copilot's review found **fourteen
  defects across five rounds**, most fail-open — a **verdict forgery** smuggled through
  model-authored prose that beat a first-match parser and yielded `auto-merge` against an
  attacker-chosen SHA; truthiness-tested `diffChecks` where a quoted `"false"` passed all four;
  an empty `diffChecks` object gating nothing; lower-bounded-only floors that a 0–100-scale
  response cleared; a failed source fetch scoring the target against nothing. Every one was the
  same class — untrusted input becoming a typed value without a full shape check — and a fuzz
  pass over the trust boundary now covers the class, not instances. **Consumer rule (breaking if
  ignored): parse the LAST verdict block and fail closed on a malformed one.** Corrects the
  program risk register, which held that prompt injection cannot change a verdict. Also in this
  release: #140 (resync pins target-local data reads and strips model preamble, verifying both)
  and #78 (fr programming-domain glossary, 364 terms). **`auto-merge-mode` defaults to `off`, so
  nothing changes behaviourally on upgrade** — editions emit the block; no gate acts.
- **v0.21.0** (2026-07-22) — #132 closed #131: `forward --github` PRs now carry
  `action-translation`, the label the review workflow template gates on — every CLI resync PR
  had been completing review as `skipped`, silently (all six of the zh-cn post-wave mini-wave).
  #137 resolved #90 defect 2 as **removal-with-visibility**: a fence-aware estate scan (211
  pairs, five editions, `##` and `###`) found **zero** human-authored target-only sections, and
  the one cited case (ifp_egm's 练习) reclassified as upstream drift — the old source's
  Exercises, deleted upstream in b27f1eb0a, correctly removed by the wave. Sync PR bodies now
  enumerate removed target-only sections; target-only **files** documented as the supported
  pattern for edition-specific content; the `translation.additions` design **shelved** in #90
  with its lifecycle costs recorded (build trigger: first real human addition). Parity guard
  deliberately unchanged — the scan shows strict source/output equality is a true corpus
  invariant. **The P0 co-design gate is dissolved: #94 Phase 2 (round-trip invariant + real
  `validateMyST`) is unblocked and next.** Also: init `-f` repo-scoped side effects filed as
  #134; tutorial `SOURCE_ONLY` row corrected to `init -f`.
- **v0.20.0** (2026-07-21) — #128 closed #119 + #65: structural parity guard on every write
  path (directive shapes byte-equal or presence-matched by class; anchors exact). Calibrated
  empirically: byte-equal draft over 211 real pairs → 362 false positives in 3 classes
  (contents/index titles, prf:* titles, code-cell kernel tags) → calibrated guard passes
  200/211, remainder pending-drift artifacts. Found live damage during calibration: sympy.fr
  dropped (sympy)= anchor (restored, .fr#16). First wave after this may loudly fail files
  with pre-existing anchor damage — that is the guard working the backlog. Next P0 item:
  round-trip invariant (#94 Phase 2); nested-directive coverage belongs there.
- **v0.19.0** (2026-07-21) — #124 closed #123: `rebase-stale-siblings` (default off) refreshes
  non-overlapping sibling PRs during waves via update-branch — no re-translation, message-gated
  422s. **Harness-validated pre-release** under the harness-first policy: pinned workflow to the
  PR head, PAT token, two resync PRs, one merged → sibling refreshed and its checks re-triggered
  (run 29799241099). The A/B that decided #125's token question ran the same day on the same
  repo: 13 GITHUB_TOKEN-rebased heads got **zero** workflow runs; the one PAT-refreshed head got
  its review run. Production rollout of the PAT (5 edition repos: org-secret grant + one-line
  workflow edit each) is #125, awaiting maintainer sign-off. Harness targets aligned to
  production shape (both now carry review+rebase on `@v0`, PAT in steady state) — #109.
- **v0.18.1** (2026-07-21) — #121 closed #115: rebase mode ignored `resync/*` PRs, so a
  drift-recovery wave left 60+ PRs going stale with every merge. The prefix turned out to be
  enforced in **three** places, not the two the issue and the first fix assumed —
  `runRebase`'s early return was the third, and missing it made that fix a silent no-op.
  Caught in review, not by the suite: `src/index.ts` has **no unit coverage**, and the drift
  test written for this very class only compared the workflow template against the predicate.
  New `src/branch-naming.ts` owns both prefixes; a structural test now asserts no other source
  file re-spells one, verified against the reintroduced defect. **Carry forward**: the 0%
  coverage on `src/index.ts` is a demonstrated liability now — it holds mode dispatch and
  rebase logic, and Phase 2's guards land next door.
- **v0.18.0** (2026-07-18; tagged + published on merge) — forward-resync integrity day:
  #108 fixed the `forward --github` Tier-1 cluster from the intro.zh-cn drift wave —
  #105 (state + heading map committed with content, target frontmatter carried, stray `---`
  fixed), #104 (resync PRs reviewable via `translation-sync-metadata` fallback), the
  mechanical halves of #106 (flag-based discovery, outcome-based summary), #107 prompt
  hardening (localisation as ground truth — **unvalidated**, needs a wave). #110 closed
  #102 (criterion-score validation; incomplete review = retry/error, never FAIL). #111
  declared node24 + bumped `@actions/*` to the CJS majors — prod advisories now 0.
  Smoke-tested live on test-translation-sync.fa#78 (both halves). Estate pins on v0.16.1 —
  two releases behind; bumping them is the natural next step.
- **v0.17.0** (2026-07-16; tagged + published on merge of #101) — typography-erosion day:
  #99 wired `applyTypography`
  into the sync path (issue #97: every fr sync stripped the seed's NBSP; numba.md 27→14 in
  one merge, restored by .fr#9 backfill), #100 made heading matching typography-insensitive
  (`normalizeHeadingForMatch`, exact-first + ambiguity guard; also forward-resync typesetting,
  headingmap/apply.mjs ping-pong, role-stripped key lookups, the deleted `[0.16.1]` CHANGELOG
  header). #98 fixed duplicate review comments under concurrent runs.
- **Estate upgraded to v0.16.1** — all 9 pins across 4 repos (lecture-python-programming#575,
  .zh-cn#69, .fa#132, .fr#5). First time the estate is on one version; it spanned
  v0.13.0–v0.16.0 that morning. **zh-cn and fa now translate with Sonnet 5.** Deployment
  catalogue: QuantEcon/project-translation#7.
- **v0.16.0 and v0.16.1 released** — v0.16.0 was the Sonnet 5 default + `models.ts` + fr
  typography (`init` path only; sync wiring is #81); v0.16.1 the deep-review fixes (#83).
  `v0`/`v0.16` now move as an explicit, spelled-out release-checklist step — `v0` had sat on
  v0.7.0-era code for 9 releases while the README recommended it.
- **Sonnet 5 validated for zh-cn/fa** — 26/26 correct PRs per language; 9.4/10 translation vs
  the Dec-2025 Sonnet 4.5 baseline's 9.5 (same judge), 9.6 under Opus 4.8. Answers
  QuantEcon/project-translation#5; note 4.6 — what they ran before — was never measured.
  See decisions/D-2026-07-15-sonnet5-validated.md.
- **Harness made trustworthy** (#86, #87) — it had been confidently wrong three ways: rubric
  frozen at the pre-v0.13.0 `heading-map:` format, documents truncated at 4000 chars
  (asymmetric en↔zh), pairs dropped silently. Baselines now committed — `.gitignore`'s bare
  `reports/` had been swallowing them since 2025-12.
- **fr footnote corruption repaired** — lecture-python-programming.fr#4.

## Blocked

- Nothing hard-blocked. Language PRs wait on native-speaker review (external cadence).

## Next

- **Watch the first real zh-cn/fa syncs** — the estate upgrade landed, so the next merged
  lecture PR is the first production Sonnet 5 translation. Two things to expect that look
  like regressions but are not: the new truncation guard may fail a long lecture that
  previously produced silently-truncated output (#83), and pagination now processes >30-file
  PRs completely, so a large PR costs more and produces a bigger diff than before.
- **PLAN Phase 1 remainder**: rebase no-op comments, `context.sha` vs `merge_commit_sha`,
  resync fail-closed, `@actions/*` + SDK major bumps (pair with node24, PLAN 5.8),
  rebase input-validation hardening (1.5).
- **#90 silent data loss in the sync merge path** — five ways translations vanish or English
  leaks in while the run reports success (REVIEW §6.1). Not covered by PLAN Phase 2; the
  Phase 2 round-trip test would catch three of them as a class, so Phase 2 first.
- Smaller review-round follow-ups: **#91** (heading-maps.md documents a key format the action
  has never written — nearly caused a bad rubric fix), **#92** (PR creation reports failure
  when the API times out *after* succeeding; naive retry would duplicate — #96 flags a
  possible second sighting: four `labeled` events recorded for two `addLabels` calls,
  unreproduced, mechanism unknown).
- Earlier review-round issues: **#81** (typography on sync path), **#82** (model-swap
  eval — see REVIEW §7.4 for a concrete deterministic design).

## Health & context

- `main` green; 1,143 tests (47 suites), lint covers all files
  (`--max-warnings 0`) and CI checks formatting.
- Highest-priority known bug: issue **#65** — translator drops `(label)=` anchors
  (PLAN Phase 2), plus the silent-data-loss family documented in REVIEW §6.1.
- Prod dep advisories: **0** (cleared by #111's `@actions/*` CJS majors; the ESM-only
  3.x/9.x lines remain tracked in #89).

## Map

[PLAN.md](PLAN.md) roadmap · [FUTURE.md](FUTURE.md) feature ideas ·
[ARCHITECTURE.md](ARCHITECTURE.md) design questions · [decisions/](decisions/) settled calls ·
[log/](log/) session notes · [README.md](README.md) the convention.

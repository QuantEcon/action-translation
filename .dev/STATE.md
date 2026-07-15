verified: 2026-07-15

# STATE

Where things stand, ~1 page. Read this first; trust it less as the `verified:` date ages.
Roadmap detail lives in [PLAN.md](PLAN.md), not here.

## In flight

- **PR #87** — commit the v0.16.1 harness baselines + fix `.gitignore`'s bare `reports/`
  silently ignoring `tool-test-action-on-github/reports/` (why no baselines exist between
  2025-12 and now).
- **Estate upgrade to v0.16.1** — 9 pins across 4 repos: lecture-python-programming#575
  (3 sync workflows), .zh-cn#69, .fa#132, .fr#5 (rebase + review each). Catalogue:
  QuantEcon/project-translation#7.
- **PR #78** — fr programming-domain glossary terms; awaiting native review.
- **PR #71** — Malayalam (`ml`) draft; awaiting native-reviewer calibration batch.
  Glossary PR **#69** (ja) open, awaiting native review + a `LANGUAGE_CONFIGS` entry.

## Recently landed

- **v0.16.1 released** 2026-07-15 — the #83 fixes; `v0`/`v0.16` moved to it (moving the
  floating tags is now an explicit release-checklist step, both commands spelled out).
- **PR #86** merged — harness trustworthiness: templates pinned to the release under test;
  evaluator judge default → `claude-opus-4-8` (comparisons pin to the baseline's judge,
  recorded in each report's `**Evaluator**:` header); rubric updated to the `translation:`
  frontmatter format (it had described the pre-v0.13.0 `heading-map:` since 2025-12, marking
  every PR down for being correct); dropped pairs no longer vanish silently; documents no
  longer truncated at 4000 chars before the diff judge.
- **Sonnet 5 validated for zh-cn/fa** — 26/26 correct PRs per language on the e2e harness;
  9.4/10 translation, 10/10 diff vs the Dec-2025 Sonnet 4.5 baseline's 9.5/10 (same judge);
  9.6/10 under an Opus 4.8 judge. Answers project-translation#5 — note 4.6 (what they run
  today) was itself never measured. `.dev/decisions/D-2026-07-15-sonnet5-validated.md`.
- **fr footnote corruption repaired** — lecture-python-programming.fr#4 merged.
- **PR #83** merged 2026-07-15 (squash, `bb17926`) — high-severity fixes from the
  2026-07-15 deep review (`REVIEW-FABLE5-2026-07-15.md`): fr typography definition-label
  fix, LICENSE, lint-glob fix + prettier + CI format gate + `--max-warnings 0`,
  PLAN Phase 1 pagination/CRLF/stop_reason/content[0]/glossary fixes, in-range dep
  advisories, docs [H] accuracy fixes. Unreleased on `main` — v0.16.1 is the next chore.
- **v0.16.0** released 2026-07-15 — default model → `claude-sonnet-5` (centralized in
  `src/models.ts`), thinking OFF (settled: D-2026-07-14), deterministic fr typography
  (`init` path only — sync wiring is issue #81), glossary-review tooling + skill.
- **`v0` floating tag moved to v0.16.0** (was stuck at v0.7.0-era, 115 commits behind,
  with README recommending `@v0`). Moving `v0` is now a release step.
- **fr is in production**: `lecture-python-programming.fr` exists with a sync workflow
  pinned `@v0.16.0`. Note: zh-cn/fa workflows pin `@v0.15.0` → those languages translate
  with Sonnet 4.6 while fr uses Sonnet 5 (decide: deliberate staging or drift?).

## Blocked

- Nothing hard-blocked. Language PRs wait on native-speaker review (external cadence).

## Next

- Merge the estate upgrade to v0.16.1 (4 PRs, 9 pins — see In flight). Merging the source
  PR is the moment Sonnet 5 starts producing real zh-cn/fa translations; watch the first
  real sync for the new truncation guard firing on a long lecture (correct behaviour, but
  it surfaces as a loud failure where output was previously silently truncated).
- **PLAN Phase 1 remainder**: rebase no-op comments, `context.sha` vs `merge_commit_sha`,
  resync fail-closed, `@actions/*` + SDK major bumps (pair with node24, PLAN 5.8),
  rebase input-validation hardening (1.5).
- **#89 node24 + `@actions/*` majors** — GitHub already force-runs the action on Node 24
  despite `action.yml` declaring node20 (harness evidence, every run). Also clears the last
  prod advisories (undici via `@actions/*`). PLAN 5.8 + 1.4, one release.
- **#90 silent data loss in the sync merge path** — five ways translations vanish or English
  leaks in while the run reports success (REVIEW §6.1). Not covered by PLAN Phase 2; the
  Phase 2 round-trip test would catch three of them as a class, so Phase 2 first.
- Smaller review-round follow-ups: **#91** (heading-maps.md documents a key format the action
  has never written — nearly caused a bad rubric fix), **#92** (PR creation reports failure
  when the API times out *after* succeeding; naive retry would duplicate).
- Earlier review-round issues: **#81** (typography on sync path), **#82** (model-swap
  eval — see REVIEW §7.4 for a concrete deterministic design).

## Health & context

- `main` green; ~1,068 tests (40 suites), lint now actually covers all 78 files
  (`--max-warnings 0`) and CI checks formatting.
- Highest-priority known bug: issue **#65** — translator drops `(label)=` anchors
  (PLAN Phase 2), plus the silent-data-loss family documented in REVIEW §6.1.
- Prod dep advisories: 1 high / 2 moderate remaining (undici via `@actions/*` majors).

## Map

[PLAN.md](PLAN.md) roadmap · [FUTURE.md](FUTURE.md) feature ideas ·
[ARCHITECTURE.md](ARCHITECTURE.md) design questions · [decisions/](decisions/) settled calls ·
[log/](log/) session notes · [README.md](README.md) the convention.

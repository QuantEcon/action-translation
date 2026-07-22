# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Reviewer verdict v2 — the review is now machine-actionable** (#103 prerequisite, specified in #66): every review comment ends with a `translation-review-verdict` HTML-comment JSON block (the `translation-sync-metadata` pattern) carrying per-criterion scores, the previously-unprinted composite, the four diff checks, structured findings (`severity`/`category`/`file`/`location`/`description`/`suggestion` — the prompt now elicits findings as objects, with severity definitions, instead of prose strings), a **categorical routing recommendation** (`auto-merge` | `editor`) computed from rubric logic rather than the blended score, the reviewer model, the engine version, and the **head SHA the verdict was computed against** (any push invalidates it). Syntax errors and diff issues fold into the findings array too, so one array is the complete issue list — syntax errors as `blocker`/`syntax` (gating), diff-quality issues as `minor`/`structure` (**not** gating: `evaluateDiff` returns free prose with no severity concept and in practice mixes real observations with narration, so the authoritative diff signal is the four `diffChecks` booleans, which gate absolutely, and the strings are their explanation). Harness validation drove that split: recording diff prose at `major` made narration an absolute gate and would have biased the shadow-phase calibration data toward false negatives. New action outputs: `review-recommendation`, `reviewed-head-sha`. Contract documented in `docs/user/metadata-contract.md`; per-criterion floors are provisional (accuracy/terminology 9, fluency/formatting 8) pending shadow-mode calibration.
- **Shadow auto-merge flag** (#103): review-mode input `auto-merge-mode: off | shadow` (default `off`). Shadow computes the gate decision and records it — `wouldAutoMerge` in the verdict block, a workflow notice, and a `would-auto-merge` output — **without acting on it**; `active` does not exist and fails loudly if requested. **Fail-closed throughout** (the #102 polarity): unknown finding severities coerce to `major`, unknown categories to the gating bucket `other`, a malformed or missing findings payload gates the recommendation, and consumers are instructed to treat a missing or unparseable block as `editor`. Comment-terminator sequences (`-->`) in model text are JSON-escaped so hostile content cannot break the block open.
- **`schemaVersion: 1` on `translation-sync-metadata`** (#66): both writers (sync `pr-creator`, CLI `forward --github`) now stamp the block; absence on older PRs means version 1. Field additions are non-breaking; renames/removals/type changes bump the version. The block is now a documented public contract (`docs/user/metadata-contract.md`) rather than an undocumented internal.

### Fixed
- **Resync preserves localisation implemented as a data-source substitution — pinned deterministically, verified after the fact** (#107 validation wave, 2026-07-22): the localisation-as-ground-truth enumeration covered in-line localized values (label dicts, plot strings, rename maps, print/docstrings) — all measured surviving byte-for-byte on `inequality` and `heavy_tails` — but not localisation done by *replacing how a variable is derived*: `long_run_growth`'s hand-fixed `code_to_name` reads the target-only `country_code_cn.csv` and selects its `name_chinese` column, and the resync reverted it to the source's English derivation (legends regress to English country names). A strengthened prompt rule alone **demonstrably does not hold** — the reverted block reproduced on a re-run with the rule in place — so the fix is deterministic, in the parity-guard mold (`src/cli/target-local-reads.ts`): before the model call, forward scans the target's code cells for reads of data files that exist only in the translation repo (basename match across the two docs trees; URLs excluded) and pins those exact lines in the request's custom instructions; after finalization it verifies every pinned line survived and **fails the file loudly** if not — a silent revert merges English legends, a loud failure gets a human. The prompt also names the class (source-side data updates go *through* the localized mechanism), but the guarantee comes from the pin + verify, not the prose.
- **Resync strips model preamble emitted before the document frontmatter, and no second frontmatter block can reach the written bytes** (found by the same wave's re-run): the model prefixed its document with reasoning prose ("Looking at the diff … Let me produce the final output"), and because `splitFrontmatter` anchors at position 0, the real frontmatter went unrecognized — the preamble landed in the body under the carried-forward frontmatter and the written file held **two** frontmatter blocks with leaked deliberation text between them (#105's sibling, one shape over; invisible to the structural parity guard, which only tracks directives and anchors). `finalizeResyncContent` now locates the document's real frontmatter by signature key (`jupytext`/`kernelspec`/`translation` + the target's own top-level keys; fence-aware, so YAML examples in code cells cannot false-positive) and drops everything before it, warning with the line count; after finalization, `resyncSingleFile` fails the file loudly if an embedded frontmatter block survives in the body.

## [0.21.0] - 2026-07-22

### Changed
- **Sync PRs now enumerate removed target-only sections instead of leaving them as bare red diff lines** (#90 defect 2): the sync mirrors the source's structure, so a target section with no source counterpart is removed — correct when upstream deleted it, destructive when a human added it, and only a reviewer can tell which. A 2026-07-22 estate scan (211 source/target pairs across five editions, `##` and `###` level) found **zero** live human-authored additions, and the one previously cited case (`ifp_egm`'s extra `练习`) reclassified as upstream drift — the old source's `## Exercises`, deleted in the optimal-savings reorganize, so the wave resync removed it correctly. Removal-with-visibility is therefore the design: `processSectionBased` reports each dropped section, the run log warns, and the PR body carries a "Target-Only Sections Removed" notice routing human-authored cases to the supported pattern. The declared-additions mechanism (`translation.additions`) is deliberately **not** built — design shelved in #90 pending a first real instance.
- **The supported pattern for human-added content is documented: target-only files.** New FAQ entry ("How do I add content to a translated edition that isn't in the source?"): sync never touches a file without a source counterpart, so edition-specific content belongs in its own file in the target's `_toc.yml`, not as extra sections inside synced files. The resync-drifted tutorial's `TARGET_ONLY` row now distinguishes deliberate additions from orphans, and `forward`'s `TARGET_HAS_ADDITIONS` warning states both provenances (upstream deletion → removal correct; human-authored → move to a target-only file first) instead of implying human content.

### Fixed
- **`forward --github` PRs now carry the `action-translation` label, so the review workflow actually triggers on them** (#131): the CLI hard-coded its label set as `action-translation-sync` + `resync`, while the deployed review workflow template gates on `action-translation` — the label the *action's* pr-creator applies. Every CLI resync PR therefore failed the filter and `Review Translations` completed as `skipped`, silently; all six PRs of the lecture-python.zh-cn post-wave drift mini-wave went unreviewed until the label was added by hand. The CLI now applies `action-translation` alongside its existing labels, keeping the template's label contract single-valued instead of widening the filter in every deployed copy.
- **The resync-drifted tutorial no longer routes `SOURCE_ONLY` files to `forward -f`** (#131): `forward` errors with `Target file not found` for targets that don't exist — a fresh translation is `init`'s job. The drift-category table and the "New files" example now say `init -f <file>`, with a caution that `init` stays repo-scoped even with `-f` — it rewrites `.translate/config.yml` and re-copies non-markdown assets (`_config.yml`, `_toc.yml`) from the source, so run it on a clean tree and review the diff.

## [0.20.0] - 2026-07-21

### Added
- **Structural parity guard on every write path** (#119, #65 — first item of the #120 P0 plan): the silent-corruption class (#118, #119, #65) is structural MyST mutated by a path that should have passed it through verbatim, with the run reporting success every time — eight instances to date, every one discovered weeks later on a downstream strict build. Sync (markdown and renamed-file handlers) and forward resync (post-finalization, checking exactly the bytes that would be written) now extract the structural tokens — top-level fenced-directive openings and `(label)=` target anchors — from source and output, and **fail the file loudly on divergence**. Directive name sequences must match (#118's fence-wrap collapses the sequence and fails on count); structural arguments (`{raw}` format, `{include}`/`{figure}` paths, `{solution}`'s exercise label) must match byte-for-byte (#119's defect); flexible arguments — `{admonition}`/`{prf:*}` titles, `{contents}`/`{index}` display text, `{code-cell}`'s edition-pinned kernel tag — need only presence to match, though a dropped argument still fails; anchor sequences must match exactly, with multiset-diff diagnostics that name dropped or surplus labels (#65). The rules were **calibrated against the real corpus**: a byte-equal-everything draft dry-run over all 211 source/target lecture pairs across five editions produced 362 false positives in exactly the three flexible-arg classes, and the calibrated guard passes 200/211 (the rest are pending-drift artifacts of current-vs-current comparison, which the guard never performs in situ). The dry-run also found live production damage — `sympy.fr` had dropped its `(sympy)=` anchor, restored in lecture-python-programming.fr#16. **Operational note**: files whose *historical* translations already dropped anchors will fail their next sync until repaired — loud by design; resync is the repair tool. Scanning is a top-level stateful fence walk (nested directives are #94 Phase 2's round-trip territory); the guard lives in `src/structural-parity.ts` per the rule that guards go in modules Jest can load.

### Fixed
- Docs and template comments name the CLI invocation correctly as `translate forward --github` (#127) — the bare `forward --github` is not a runnable command.

## [0.19.0] - 2026-07-21

### Added
- **`rebase-stale-siblings` input — rebase mode can refresh non-overlapping sibling PRs** (#123): rebase only acts on PRs whose files overlap the merged PR, because its job is conflict resolution. But `translate forward --github` opens one PR per lecture, and each PR's metadata lists only that lecture plus its own per-lecture state file — so two siblings from the same wave never share a path, never overlap, and were skipped forever while their bases and checks went stale. That staleness is the symptom #115 actually reported ("with 60+ open at once, every stale check has to be re-enqueued by hand"); v0.18.1 made resync PRs *visible* to rebase but the overlap gate still skipped them. With the new input enabled, a non-overlapping sibling is brought current through GitHub's update-branch endpoint — the base merged forward, nothing re-translated, zero model calls. **Off by default**: the cost scales with the wave (60 open PRs means every merge refreshes up to 59 branches and re-runs their checks), and under floating `@v0` delivery a default-on would land that on every repo unannounced. Enable it for the duration of a wave; the template carries a commented-out line. Validated end-to-end on the harness pre-release: the sibling that v0.18.1 skipped was refreshed (`0 rebased, 1 refreshed, 0 skipped, 0 errors`), with a plain merge commit and its checks re-triggered.
- 422 responses from the update-branch endpoint are **message-gated**: GitHub uses that status for "not behind base" (benign, routine mid-wave) but also for merge conflicts and head-SHA mismatches (real problems, and a conflict is reachable for a "non-overlapping" PR because overlap is computed from metadata while branches can carry hand-pushed commits touching unlisted files). Known-benign wordings resolve as "already current"; unknown 422s throw — a loud false alarm beats a silent skip. Refresh failures are handled with refresh-specific messaging rather than the conflict-resolution advice the rebase error path posts.

### Changed
- **Documented: rebase-pushed commits get no CI under the default `GITHUB_TOKEN`** — GitHub's recursion guard means a branch rebased or refreshed with it gets its new commit but no workflow runs on the new head, verified both ways on the harness (13 force-push rebased PRs: zero runs; one PAT-refreshed PR: review workflow triggered). With required status checks that is worse than skipping — the PR goes from stale-but-green to a head with no runs, which blocks merging — and force-pushed re-translated content lands unreviewed. The action reference and the rebase template now state the constraint and point at a PAT/App token, as sync workflows already use; the estate-wide token decision is tracked in #125. Applies to all of rebase mode, not only the new input.
- **Rebase mode is documented in the action reference** — which had described the action as operating in "two modes" for as long as rebase has existed. New mode section and inputs table.
- The helper behind the refresh lives in a new `src/rebase-siblings.ts` rather than `index.ts`, which uses `import.meta.url` and therefore cannot be loaded by Jest's CJS registry at all — the structural reason `index.ts` has no unit coverage, and how a third hard-coded branch prefix survived the first #115 fix. New rebase logic goes in testable modules.

## [0.18.1] - 2026-07-21

### Fixed
- **Rebase mode now rebases CLI resync PRs, not only Action sync PRs** (#115): rebase filtered on the `translation-sync-` branch prefix, but `translate forward --github` creates `resync/{stem}` branches — so merging one resync PR never rebased its siblings. During a drift-recovery wave that leaves a stack of 60+ open PRs whose bases go stale with every merge, each one re-enqueued by hand (observed on the 69-PR lecture-python.zh-cn Track B wave). The prefix was enforced in **three** independent places, and fixing any subset leaves the defect: `runRebase`'s early return on the merged branch (job runs, returns immediately — a silent no-op), the job `if` in `examples/rebase-translations.yml` (job never starts), and the sibling-PR filter (job runs, finds nothing). All three now share one predicate. The root cause was that the prefixes had no owner — sync built one spelling, forward built another, and the filters re-spelled them by hand — so a new `src/branch-naming.ts` holds both prefixes and `isTranslationBranch`, and every builder and filter consumes it. Widening rather than unifying the prefixes is deliberate: unifying changes branch naming for a command already in production use, and an in-flight wave would straddle both conventions mid-migration. `isTranslationBranch` also rejects a bare prefix (`resync/` with nothing after it) — no builder emits one, and every match authorises a force-push during rebase, so the predicate claims fewer branches rather than more.

### Changed
- **Regression guards for the branch-prefix class**, prompted by the first fix for #115 being incomplete in review. Two structural tests: one asserts `branch-naming.ts` is the only source file that spells a prefix as a standalone literal or interpolates one into a template (comments are stripped first, and shapes that merely share an opening substring — `'translation-sync-failure'` is an issue label — are deliberately not flagged); the other reads `examples/rebase-translations.yml` and asserts its `if` lists every prefix the predicate knows, so the workflow and code layers cannot drift apart. Both were verified to fail against the reintroduced defects rather than only to pass in their absence. This matters because `src/index.ts` has no unit coverage, so the full suite passing says nothing about the rebase entry points.
- **`examples/rebase-translations.yml` documents both branch kinds** and pins `@v0` instead of the exact `@v0.15.0` it still carried, matching the convention the docs recommend.
- **`actions/checkout` in the `docs/` workflow templates moved from `@v4` to `@v7`** — the documented templates had fallen behind the editions copying them (`.fa` on v7, `.fr` on v6; only `.zh-cn` still matched at v4), so "mirrors the upstream template" was aspirational rather than true. `examples/` is unaffected: its only workflow is `rebase-translations.yml`, which runs the action without checking out the repo.

## [0.18.0] - 2026-07-18

### Changed
- **Node 24 runtime, declared and built for** (#89): GitHub has been force-running the action on Node 24 while `action.yml` still declared `node20` — the declared and actual runtimes had diverged. Now aligned everywhere: `action.yml` (`using: node24`), CI (`node-version: 24`), the esbuild bundle target, `@types/node` 24, `engines.node >= 24`, and CONTRIBUTING.
- **`@actions/core` 1.11 → 2.0.3 and `@actions/github` 6.0 → 8.0.1** — the majors that clear the last production advisories: `npm audit --omit=dev` now reports **0 vulnerabilities** (was 1 high / 2 moderate, all `undici` reaching the committed bundle through these two packages). Deliberately stopped at 2.x/8.x: the 3.x/9.x lines are ESM-only, which Jest's CJS module registry cannot load — that migration is tracked separately in #89. The new `@octokit/*` majors under `@actions/github@8` are themselves ESM-only, handled at runtime by Node ≥ 22's native `require(esm)` and in Jest by a stub (`src/test-support/actions-github-stub.ts`; tests always replace the octokit instance with a fake). Verified live: a full review-mode run with the new bundle against a real PR (inputs, pagination, content fetch, comment upsert, outputs) passed.

### Fixed
- **Review mode validates criterion scores — an incomplete model response can no longer become an automatic FAIL** (#102): when the model omitted one of the four criteria (observed: `formatting` on lecture-python-programming.fr#12), `undefined * 0.15` produced NaN, which fell through both verdict thresholds and landed on FAIL, rendered as "undefined/10" / "Overall: NaN/10" — a false FAIL on a clean sync PR. `evaluateTranslation` now validates all four scores (coercing numeric strings), retries once on an incomplete response, and throws with the missing criteria named if the retry is also incomplete: an incomplete review is an error or a retry, never a verdict. Matters more now that review runs on resync PRs and is the gate #103's auto-merge routing would hang off.
- **`forward --github` PR branches now carry the `.translate/state/` file and the heading map, and never corrupt frontmatter-less documents** (#105): the PR path committed only the lecture file — state was written untracked into the operator's clone after the PR existed, so a merged resync wave left the target repo exactly as blind to staleness as before it (state is what `status`/discovery read), and the output carried no `translation:` block, leaving every resynced file `MISSING_HEADINGMAP` despite the FAQ's claim that forward includes the map automatically. Resync output is now finalized deterministically before it is written or committed: the **target's** frontmatter is carried forward (the model emits the source's, silently reverting target-side metadata such as jupytext version bumps), a stray lone `---` the model invents on frontmatter-less documents is stripped (it parsed as an unclosed frontmatter delimiter — observed corrupting `about.md`), and the heading map + title are rebuilt from the current source and injected exactly as the action's `processFull()` path does. State is serialized into the same branch commit as the content, mirroring sync mode's atomic commit; local (non-`--github`) runs keep writing state to the working tree.
- **Review mode can now review CLI resync PRs instead of failing the run** (#104): forward PRs carried no `### Source PR` reference, so labeling one `action-translation` made the review workflow throw "Could not find source PR reference" — all 11 PRs of the first intro.zh-cn drift-recovery wave failed review this way. Forward PR bodies now embed the same machine-readable `translation-sync-metadata` block sync PRs carry, with `mode: "resync"`, `sourcePR: 0`, the source **commit** SHA as provenance (a resync has no source PR), the PR's base SHA, and the content + state file paths; the human-readable body links the pinned source commit. When review mode finds no source PR reference it falls back to this block: source content is fetched at the recorded commit, the whole document is treated as the changed scope (a resync realigns the entire file, so diff-scoped suggestions would be wrong), and the diff evaluator is told large target diffs are expected. PRs with neither reference still fail with the existing error.
- **Forward discovery selects by status flags, and the bulk summary reports what actually ran** (#106): bulk discovery filtered on the *primary* status (`OUTDATED`/`SOURCE_AHEAD` only), but status priority ranks `MISSING_HEADINGMAP` above `OUTDATED` — so on an unbootstrapped repo, where every file lacks a heading map, even date-stale files were invisible (the intro.zh-cn wave discovered 12 of 41). Candidates are now selected from the full flag set (`OUTDATED`, `SOURCE_AHEAD`, `TARGET_AHEAD`, `MISSING_HEADINGMAP`) and listed with the flags that selected them; stage-1 triage remains the gate that skips i18n-only files. The summary now buckets by what the pipeline did instead of by triage verdict: `TARGET_HAS_ADDITIONS` files that were resynced were previously reported as "skipped: i18n only" while their PRs existed. The residual gap — content-stale files with matching structure, a heading map, and no `.translate/` state carry no flag — is documented in the resync-drifted tutorial with the `status --check-sync` workaround; teaching forward to consume check-sync output directly stays open in #106.
- **Whole-file resync treats the existing translation's in-code localization as ground truth** (#107): across the 41-PR intro.zh-cn wave the resync localized *fresh* content well but dropped targeted pieces of existing localization — legend/axis-label mappings, CSV column maps, localized print strings and date formatters — forcing hand-fixes on 11 of 41 branches. The resync prompt now states that any localized line in the target's code cells is deliberate and must be preserved or carried into updated code (never reverted to English), enumerates the observed defect classes (label-translation dicts, `DataFrame.rename` maps, plot strings, plotly trace names, localized `print()`/docstrings), and forbids wrapping localized text in math delimiters (the `r"$密度$"` defect class). The output-format instruction no longer tells the model to "start with the frontmatter `---` marker" unconditionally — the instruction that produced #105's stray delimiter on frontmatter-less files.

## [0.17.0] - 2026-07-16

### Fixed
- **Heading matching tolerates typography drift instead of relying on byte equality** (#97 follow-up): matching a frontmatter heading-map value to its body heading was an exact string compare, and typography makes the two sides legitimately diverge — `applyTypography` masks role spans while `stripMystRoles` exposes their display text (so a map value can carry an NBSP its body heading structurally cannot), `apply.mjs` typesets map values independently, and human edits touch one side only. On a mismatch the sync drops unchanged sections from the output or retranslates modified ones from English, discarding human edits. Comparisons now canonicalize both sides: strip `#` markers and MyST roles, fold NBSP/narrow-NBSP, collapse whitespace runs, and drop spaces before `; : ! ?` — every shape the French transform produces, including the zero-gap case where `Quoi?!` gains an NBSP from nothing. Exact matches are tried first and a normalized match is accepted only when unique, so raw-distinct headings that canonicalize identically keep their old positional pairing instead of first-match landing on the wrong section. Written map values stay exactly as typeset — only comparisons normalize. Verified over the full French edition: all 401 real headings now match under every typography variant (one diverged before). Also closes a pre-existing hole the audit surfaced: the body side of the compare never stripped MyST roles while map values always did, so the corpus's role-wrapped headings (`## {index}` + backticked text) could never match by heading map and survived on the positional fallback alone.
- **Role-stripped keys are used everywhere heading-map keys are looked up**: the CLI validator (`section-matcher.ts`) and subsection merging (`mergeSubsectionsWithTargetTranslations`) built lookup keys from raw source headings while keys are stored role-stripped, so role-wrapped headings silently skipped validation or missed their subsection map entries.
- **`translate forward` resync output is typeset before it is written**: the whole-file resync path wrote raw model output, the one remaining write path without deterministic typography — on a French repo every resync stripped the NBSP the seed inserted, exactly the sync-path bug fixed for `mode: sync` below.
- **`translate headingmap` no longer ping-pongs with `apply.mjs`**: its change detection compared the existing (typeset) map against freshly body-derived (plain, where roles masked typography) values byte-for-byte, so it reported `updated` forever and each tool rewrote the other's output. Equality is now typography-insensitive and the existing typeset values are kept.
- **Sync now applies deterministic typography, closing the gap v0.16.0 left open** (#97): `applyTypography()` ran only in the `translate init` seed path, so every sync stripped the non-breaking spaces the seed inserted, leaving the sync path relying on the very prompt instruction #79 was opened to replace, since the model does not follow it. One merged sync of `lecture-python-programming.fr#6` took `numba.md` from 27 × U+00A0 to 14 — invisible in review, since the diff renders as unchanged text. Both sync entry points are now typeset: `processFull` before the heading map is derived (mirroring init), and `processSectionBased` on the reconstructed document before the map is injected. Document-scoped rather than section-scoped, so drift in sections the source PR did not touch is repaired on the next sync of that file; sync PRs may therefore carry whitespace-only changes on lines the source change did not touch. Existing editions still want a one-off `scripts/typography/apply.mjs --lang fr` to reset files that will not be synced soon.
- **The heading map is typeset with the body, never after it**: `applyTypography` skips frontmatter by design, so applying it to already-injected content — the obvious fix, and the one the issue's "shape of the fix" implies — would have left map values plain-spaced while body headings gained non-breaking spaces. Heading lookup was, at the time, an exact string compare with no whitespace normalisation (made typography-insensitive in the follow-up entry above), and the positional fallback is unavailable whenever the section count changes, so that mismatch silently drops unchanged sections and retranslates modified ones from English, discarding human edits. Body, map, and title are now typeset together, as `scripts/typography/apply.mjs` already did. Tests pin the invariant against both the missing transform and the body-only variant.
- **Concurrent review runs no longer post duplicate review comments**: `postReviewComment` listed comments, looked for its own, then created one if absent — a check-then-act with nothing making it atomic, so every concurrent run saw "no comment yet" and created one. Observed on `lecture-python-programming.fr#6`, which carried two "Translation Quality Review" comments a second apart, each subsequently overwritten by a *different* run, leaving scores that matched no single review. Review comments now carry a hidden `<!-- action-translation-review -->` marker, and each run deletes any older marked comment after writing its own. Because ids increase with creation time and every run lists after it writes, the run holding the highest id always sees and removes the rest: exactly one comment survives any interleaving. Pre-existing duplicates (from v0.16.1 and earlier, which have no marker) are cleaned up on the next review of that PR.

### Changed
- **Review comments are identified by marker, not prose**: the old predicate matched any comment containing both "Translation Quality Review" and "action-translation" anywhere in its body — it could match, and overwrite, a human comment quoting a review. Matching is now anchored at the start of the body, so quoted or reposted reviews are never touched.
- **Review workflow templates gained a `concurrency` group** (docs): the action-side fix converges the *comment*, but each racing run still pays for a full review. A per-PR `concurrency` group with `cancel-in-progress` collapses the `opened` and `labeled` events a single sync produces into one review. The `connect-existing` template additionally ignores `labeled` events for labels other than `action-translation` — it triggers on `labeled` (necessary, since labels are applied after the PR is opened), and a sync applying two labels was starting a full review per label. Templates now also declare `permissions` explicitly (`pull-requests: write`, required to remove duplicate comments). Existing target repos should copy these guards; without them a sync bills several reviews of the same diff.

## [0.16.1] - 2026-07-15

### Fixed
- **French typography no longer corrupts footnote/link-reference definitions**: the NBSP pass rewrote `[^id]: text` as `[^id] : text`, which stops the line parsing as a definition — it rendered as literal text and broke every reference (shipped in the fr seed, e.g. `pandas.md`). Definition labels are now masked, and the exact corruption is repaired on contact, so running `scripts/typography/apply.mjs` over an affected repo heals it. The definition text after the colon is still typeset.
- **GitHub API pagination** at all five unpaginated call sites: sync `pulls.listFiles` (PRs touching >30 files were silently truncated), review mode's two `listFiles` calls, rebase's `pulls.list` (sibling PRs beyond 100), and `postReviewComment`'s `listComments` (the existing review comment was missed past 30 comments, accumulating duplicates).
- **Truncation detection**: every Claude call (translator, reviewer, backward evaluator, forward triage, document comparator) now checks `stop_reason` and fails the operation on `max_tokens` instead of using cut-off output — previously a truncated backward analysis parsed as `NO_BACKPORT` and reported the file as *clean*.
- **Empty-response guard**: `response.content[0]` is guarded everywhere; an empty content array (e.g. a refusal stop) produces a clean error instead of a bare `TypeError`.
- **Review mode CRLF**: `parseSourcePRNumber` accepts `\r\n` — GitHub normalizes edited PR bodies to CRLF, which permanently broke review mode for that PR.
- **Glossary terms without a translation** for the target language are skipped with a log line instead of rendering `"term" → "undefined"` into the prompt.
- **Lint/format actually cover the codebase**: the unquoted `src/**/*.ts` glob matched only 32 of 78 files under `/bin/sh`, so the core modules were never linted. Globs quoted, `--max-warnings 0` gate added, prettier applied across src (mechanical), and CI now runs a format check.

### Added
- **LICENSE** (MIT) — claimed in README/package.json since the start, but the file never existed; GitHub reported the repo as unlicensed.
- `REVIEW-FABLE5-2026-07-15.md` — deep technical review (follow-up to 2026-07-05).

### Changed
- **`v0` floating tag now tracks the latest release** (was stuck at v0.7.0-era code, 115 commits behind, while the README quickstart recommends `@v0`). Moving `v0` is a release step from now on.
- `package.json`: `private: true` (publish-unsafe: no files allowlist, colliding bin name, would have shipped `.dev/` and local settings) and `engines: node >= 20`.
- `npm audit fix`: clears the `ws`, `lodash`, and `js-yaml` advisories (js-yaml is a direct prod dep bundled into `dist-action/`). The remaining `undici` pair rides on `@actions/*` majors — deferred to the node24 change (PLAN 1.4/5.8).
- Docs accuracy: examples use the PAT pattern (`GITHUB_TOKEN` cannot push cross-repo) and current pins; the broken `ja` example is now `fr`; docs-site landing page updated from v0.8.0/873-tests; tutorials and legacy-tools added to the site toc (they 404ed); `add-language` marks the `LANGUAGE_CONFIGS` entry required; README lists rebase mode and drops exact test counts.

## [0.16.0] - 2026-07-15

### Added
- **Deterministic French typography** (`src/typography.ts`): inserts the non-breaking space French requires before `; : ! ?`. The translation prompt has asked for this since French support landed and the model reliably ignores it — a measured Opus translation of `python_by_example.md` came back with 0 × U+00A0 and 16 plain spaces before high punctuation. This is a text transform with an exact specification, so it is now applied in code rather than requested. Prose is identified by classifying each line (MyST fences nest — a `{code-cell}` inside a `{note}` is code inside prose) and only substituting where the mark is followed by whitespace or end-of-line, so code (`a ? b : c`), math (`$\{x : x > 0\}$`), frontmatter, MyST anchors (`(sec:intro)=`) and URLs are left alone. Unknown directives are treated as code: a missing space is cosmetic, a corrupted code cell is not. **Scope: the `translate init` (CLI) path only — the action's sync path is not yet wired**, so this release does not change how synced translations are typeset (tracked as follow-up). Runs before heading-map generation, so the map is derived from the same strings that land in the body; note that js-yaml escapes U+00A0 as `\_` in double-quoted scalars, so French heading maps now serialise as `"…LLM\_?"` (valid YAML, round-trips).
- **`scripts/typography/apply.mjs`**: back-applies typography rules to an already-translated repo — for a repo seeded before the rules existed, or when a rule changes later. Refuses to write unless the only difference is spacing before high punctuation (body compared as text, frontmatter as parsed YAML, since re-serialising legitimately changes quoting).
- **`scripts/glossary/`** and the **`glossary-review` skill**: tooling to decide which terminology a new lecture series needs pinned, by translating a sample with two different models and keeping only the terms they disagree on. A term both models already render identically needs no entry — it costs input tokens in every prompt forever and changes no output. On the French programming corpus this cut 176 proposed terms to 11.
- **51 tests** (1005 → 1056, 39 → 40 suites).

### Changed
- **Default Claude model → `claude-sonnet-5`** (was `claude-sonnet-4-6`). Sonnet 5 delivers near-Opus quality on coding/agentic work at Sonnet-tier cost. Applies to sync, review, and all CLI commands; override per-run with the `claude-model` action input or the `--model` CLI flag. To keep the previous model, pin the action to `@v0.15.0` or set the model explicitly. **This is the change action users will actually notice in this release.**
- **Centralized the model default** in `src/models.ts` (`DEFAULT_CLAUDE_MODEL`). All action and CLI defaults now resolve to this single constant, so future upgrades are a one-line change. The `claude-model` default in `action.yml` is kept in sync manually (YAML can't import the constant). Recognized-model validation patterns moved to `src/models.ts` and now include `claude-sonnet-5` and `claude-opus-4-8`.
- **Thinking disabled tool-wide** (`DEFAULT_THINKING` in `src/models.ts`). Sonnet 5 runs adaptive thinking by default, which would place a thinking block first in the response — breaking the `content[0]` text extraction in the translator and reviewer. This was measured rather than assumed: adaptive thinking **self-regulates to ~zero on translation**. A diagnostic confirmed the parameter engages (1607 → ~6000 output tokens on a reasoning prompt), but on a real translation it added only **+24–32 tokens even at `effort: high`**, and an Opus judge scored the variants within noise of each other. Enabling it is a no-op in cost, latency and quality, so off is a settled decision rather than a hold. See `experiments/thinking-sonnet5/REPORT.md`.
- **Centralized `max_tokens` budgets** in `src/models.ts` (`MAX_TOKENS`), sized with headroom for Sonnet 5's tokenizer (~30% more tokens than Sonnet 4.6 for the same text): section translation 8192 → 16384, whole-document 32768 → 64000 (and the pre-flight size gate), review verdicts 1500 → 8192, analytical CLI calls (backward eval, forward triage, doc compare) 1024–4096 → 8192. `max_tokens` is a ceiling, not a charge, so larger caps only prevent truncation.
- **Cost figures in docs refreshed** for Sonnet 5 pricing (standard $3/$15 per M tokens; ~13% lower under the introductory rate through 2026-08-31), reflecting the ~30% tokenizer increase.

### Notes
- **Recommended for bulk seeds: `--model claude-opus-4-8`.** Sonnet 5 remains the default for ongoing sync. On a 5-lecture French trial, Opus showed zero cross-lecture terminology drift where Sonnet 5 drifted on 5 terms, and was correct where Sonnet was not (`mutable`, not `muable`). Output lengths were near-identical, so the 1.66× is purely the price ratio — worth it once for a corpus a native speaker then reviews. See `.dev/decisions/D-2026-07-14-opus-for-bulk-seed.md`. Caveat: n=5 lectures, one language.

## [0.15.0] - 2026-04-14

### Added
- **Rebase mode** (`mode: rebase`): Automatically rebases open translation-sync PRs when a sibling PR is merged. Eliminates the 62% merge conflict rate from issue #63. Runs in the target repo, triggered by `pull_request.closed` events on `translation-sync-` branches. Detects file overlap via PR metadata, re-runs the sync pipeline against updated `main`, and force-pushes the result. Posts success/failure comments on rebased PRs.
- **Translation cache for rebase**: Stores `targetBaseSha` in PR metadata to enable section-level cache during rebase. Before re-translating, compares each section's target content between the original baseline and current `main`. Unchanged sections reuse cached translations from the PR branch — zero Claude API calls in the common case (PRs modifying different sections). Added sections matched via heading map. Graceful fallback to re-translation if cache parsing fails.
- **Structured PR metadata**: Translation-sync PR bodies now include a `<!-- translation-sync-metadata -->` HTML comment block with machine-readable JSON: `sourceRepo`, `sourcePR`, `sourceCommitSha`, `targetBaseSha`, `sourceLanguage`, `targetLanguage`, `claudeModel`, and file list. Used by rebase mode to reconstruct pipeline inputs. Invisible on GitHub. Backward compatible — PRs without metadata are skipped during rebase.
- **Rebase workflow template**: Ready-to-use `examples/rebase-translations.yml` for target repos. Includes concurrency group to prevent overlapping rebases.
- **File type metadata**: PR metadata now includes file types (`markdown`, `renamed`, `removed`, `toc`) and `previousPath` for renamed files. Rebase mode uses this to correctly reconstruct all file types, not just markdown.
- **`RebaseInputs` type**: New action inputs for rebase mode (`anthropic-api-key`, `github-token`, optional `docs-folder` and `glossary-path`).
- **29 tests**: 8 for metadata/rebase inputs, 2 for targetBaseSha, 7 for translation cache, 2 for cache subsections and heading-map correctness, 1 for CRLF metadata parsing, 3 for file type metadata, 6 additional cache and integration tests (976 → 1005 total, 39 suites)

## [0.14.1] - 2026-04-09

### Fixed
- **Heading-map injection for new files**: `processFull()` now builds and injects a `translation:` frontmatter block (heading-map + title) into newly translated files. Previously, only section-based updates via `processSectionBased` got heading-maps; new files were missing them.
- **`MISSING_HEADINGMAP` false positive for title-only files**: `translate status` no longer flags files with no `##` sections as missing a heading-map. These files have only a title — an empty heading-map is expected.

### Added
- **4 tests**: 3 for `processFull` heading-map injection, 1 for title-only status check (972 → 976 total)

## [0.14.0] - 2026-04-09

### Fixed
- **Retry on Anthropic `overloaded_error`**: The `overloaded_error` (APIError with `status: undefined`) is now retried with exponential backoff instead of failing immediately. Narrowed to match `overloaded` in the error message so unrelated status-less errors are not retried. Improved `formatApiError` to show a clear message when retries are exhausted. Updated JSDoc to document the new retry case. Fixes #57

### Added
- **Language-targeted `\translate-resync` command**: `\translate-resync fa` triggers only the Farsi workflow; `\translate-resync zh-cn` triggers only zh-cn. Bare `\translate-resync` (no argument) still triggers all languages for backward compatibility. Language argument is validated against supported languages; unsupported values are ignored with a warning and fall back to all-language resync. Fixes #58
- **Copilot PR review workflow** in `copilot-instructions.md`: Documented the fetch → fix → reply → resolve process for addressing Copilot review comments
- **5 tests**: 2 for overloaded_error retry, 3 for language-targeted resync parsing (967 → 972 total)

## [0.13.1] - 2026-03-26

### Fixed
- **Headingmap CLI MyST role stripping**: `cleanHeading()` in the `headingmap` CLI now strips MyST inline roles via `MystParser.stripMystRoles()`, matching the sync pipeline behavior from v0.12.5. Previously, roles like `` {index}`Mutable <single: Mutable>` `` appeared verbatim in heading-map keys/values when running `npx translate headingmap`.

### Added
- **1 test** for MyST role stripping in `buildHeadingMap` (966 → 967 total)

## [0.13.0] - 2026-03-26

### Changed
- **Heading-map → translation frontmatter**: Replaced flat `heading-map:` YAML block with structured `translation: { title, headings }` format. Title is now stored as an explicit field instead of a heading-map entry, resolving the inconsistency between the sync pipeline and the `headingmap` CLI. Reads both formats (backward compatible); always writes new format. Affected: `heading-map.ts`, `file-processor.ts`, `headingmap` CLI, `init` CLI, reviewer prompts (954 → 966 tests)

## [0.12.5] - 2026-03-26

### Fixed
- **Heading-map MyST role pollution**: Headings with MyST inline roles like `{index}\`Pandas <single: Pandas>\`` were stored verbatim as heading-map keys/values instead of the clean display text (`Pandas`). Added `MystParser.stripMystRoles()` static method using global regex replacement to handle single roles, multiple roles, and mixed role+text headings. Applied across all heading-map paths: parser title extraction, file-processor heading-map updates, `cleanHeading` in `updateHeadingMap`, and `lookupTargetHeading`. Covers `#` titles and `##`+ section/subsection headings. Affects 7 lectures in lecture-python-programming that use `{index}` roles in titles.

### Added
- **19 tests** for MyST role stripping — unit tests for `stripMystRoles` (including mixed role+text headings), title extraction integration, and heading-map operations with role syntax (935 → 954 total)

## [0.12.4] - 2026-03-25

### Added
- **CJK–MyST spacing rule for zh-cn**: New language-config rule instructs Claude to insert a space between Chinese characters and inline MyST directives (`{doc}`, `{ref}`, etc.) or Markdown links, preventing rendering failures (e.g. `请参阅 {doc}` not `请参阅{doc}`)
- **MyST target-label blank-line cleanup**: `reconstructFromComponents` now strips blank lines between MyST target labels (`(label)=`) and headings in post-processing, so targets always attach to their heading correctly
- **1 test** for target-label blank-line removal (934 → 935 total)

## [0.12.3] - 2026-03-24

### Fixed
- **Scope translation PRs to source PR's actual changes**: When a section is unchanged in the source diff but missing from the target (because an earlier translation PR hasn't merged yet), it is now skipped instead of re-translated as new. This prevents each subsequent translation PR from accumulating unmerged content from earlier PRs. Git's 3-way merge combines the PRs when they're merged independently. Recovery via `/translate-resync` if an earlier PR is abandoned.
- **Heading-map corruption when sections are skipped**: Introduced `includedSourceSections` array that stays index-aligned with `resultSections` so `updateHeadingMap()` pairs sections correctly even when some are skipped. Previously, skipping could cause source section A to be mapped to section B's translated heading.
- **Markdown injection in PR body skipped-section headings**: Skipped section headings are now wrapped in backticks (with inner backtick escaping) instead of double quotes to neutralize Markdown syntax.

### Added
- **Skipped sections notice in translation PRs**: When sections are skipped (pending earlier translation PR), the PR body includes a `⚠️ Sections Pending Earlier Translation PR` notice with file/heading list and `/translate-resync` recovery instructions
- **`onSkippedSection` callback in `processSectionBased`**: Optional callback parameter for callers to collect skipped section headings
- **`skippedSections` in `SyncProcessingResult`**: Tracks skipped sections per file through the sync pipeline
- **4 tests**: 1 for superset PR prevention, 3 for `buildPrBody` skipped sections rendering (930 → 934 total)

## [0.12.2] - 2026-03-24

### Fixed
- **Position fallback guard for mismatched section counts**: `findTargetSectionByHeadingMap` no longer uses position-based fallback when source and target have different section counts. Previously, when a new section was added to source but the translation PR hadn't been merged yet, the position fallback would grab the wrong target section (shifted positions), producing incorrect heading-map values (e.g. `Type hints: 装饰器与描述符`). Now unmatched sections fall through to `translateNewSection` instead.
- **Resync uses PR merge commit SHA**: `\translate-resync` now uses the PR's `merge_commit_sha` instead of `github.context.sha` (which points to HEAD of main for `issue_comment` events). Previously, `oldContent` and `newContent` could both reference the current main tip, causing the diff detector to miss the PR's actual changes. Now `oldContent = merge_commit^` and `newContent = merge_commit` correctly reflect the PR's changes.

### Added
- **3 tests for position fallback guard**: Covers source-has-more-sections, source-has-fewer-sections, and equal-counts-still-works scenarios (927 → 930 total)

## [0.12.1] - 2026-03-24

### Fixed
- **Duplicate preamble regression**: Fixed intro extraction in `parseDocumentComponents` that included pre-title content and title in the intro when documents had content before `# title` (e.g. `(label)=` anchors, `{raw}` blocks). This caused duplicated preamble in reconstructed translations. Now extracts intro by slicing lines from `titleEndIndex` to first `##` section. (regression from v0.11.2)
- **Case-insensitive heading-map lookup**: `lookupTargetHeading` now falls back to case-insensitive key matching when exact lookup fails. Prevents heading case changes (e.g. "Iterables and Iterators" → "Iterables and iterators") from breaking section matching and causing full re-translations.
- **Position-based section fallback**: `findTargetSectionByHeadingMap` Strategy 3 (position-based matching) now activates whenever heading-map and ID lookups both fail, not only when the heading-map is empty. Provides defense-in-depth for translated-heading ID mismatches.
- **Label retry on PR creation**: Label application now retries up to 3 times with 2-second delays to handle GitHub API node propagation delays on newly-created PRs. Previously, a single-attempt failure caused the review workflow to skip (no `action-translation` label).
- **Review response parsing with retry**: `evaluateTranslation` and `evaluateDiff` now use a shared `callWithRetry` method with exponential backoff (3 attempts). JSON extraction uses multiple strategies (direct parse, markdown code block extraction, greedy regex fallback). Previously, a single malformed LLM response crashed the entire review workflow.

### Added
- **Test fixture #25**: Added pre-title content scenario (`25-pre-title-content-lecture`) to E2E test suite for `test-translation-sync`
- **Test fixture #26**: Added heading case change scenario (`26-heading-case-change-lecture`) — title-case → sentence-case headings to validate case-insensitive heading-map lookup
- **10 tests for `parseJsonResponse`**: Covers pure JSON, markdown code blocks, multiline, nested objects, leading/trailing text, and error cases (924 → 927 total, excluding skipped)

## [0.12.0] - 2026-03-23

### Added
- **`\translate-resync` comment trigger**: Comment `\translate-resync` on a merged PR to re-trigger translation sync for that PR's files. Supports recovery from transient failures without re-opening PRs. Workflows need `issue_comment` trigger added.
- **Success comments on PRs**: After a successful sync, the action posts a comment on the source PR confirming completion with the target repo, translation PR link, and list of synced files
- **Failure issue creation**: When sync fails, the action automatically opens a GitHub Issue with error details linked to the source PR, with instructions to use `\translate-resync` for recovery
- **6 new tests** for `\translate-resync` comment validation including authorization check (903 → 909 total)

### Fixed
- **Label-adding race condition**: Wrapped `addLabels` call in try/catch so that a GitHub API race condition when adding labels to a newly-created PR no longer fails the entire sync. The PR is already created at that point; label failure is now a non-fatal warning (fixes fa sync failure on `lecture-python-programming` PR #491)

## [0.11.2] - 2026-03-23

### Fixed
- **Pre-title content handling**: Parser now scans past MyST cross-reference targets (`(label)=`) and directive blocks (e.g. `{raw} jupyter`) that appear before the `# title` heading, fixing `Expected # title heading` errors for files like `lectures/python_advanced_features.md` in `lecture-python-programming`

### Added
- **`preTitle` field** in `DocumentComponents`: New field captures content between frontmatter and `# title` (cross-ref targets, raw blocks) and preserves it during reconstruction
- **3 new tests** for pre-title content parsing (900 → 903 total)

## [0.11.1] - 2026-03-20

### Fixed
- **`--write-state` model preservation**: Bootstrap now reads existing state files and preserves the `model` field if it was set by a prior command (e.g. `forward`), instead of always overwriting with `unknown` (PR #38)
- **Stale model names in tests**: Updated mock model references from `claude-sonnet-4.5-20241022` to `claude-sonnet-4-6` for consistency with production defaults

### Added
- **2 new tests** for `--write-state` model preservation (898 → 900 total)

## [0.11.0] - 2026-03-20

### Added
- **`--check-sync` flag** for `translate status`: LLM-based content sync check using forward triage, reports per-file `IDENTICAL`/`CONTENT_CHANGES`/`TARGET_HAS_ADDITIONS`/`I18N_ONLY` verdicts (PR #37, closes #35)
- **`--force` flag** for `translate status --write-state`: Override the sync-date safety check that blocks writing state when source has newer commits
- **`TARGET_HAS_ADDITIONS` verdict** for forward triage: 4th category distinguishing target-side additions from content changes or i18n-only differences (PR #37)
- **16 new tests** for write-state safeguard, check-sync, doctor section-less fix, TARGET_HAS_ADDITIONS parsing (882 → 898 total)

### Fixed
- **Doctor section-less fix**: `translate doctor` no longer warns about missing heading-maps for files with zero `##` sections (e.g. `index.md`, `intro.md`) (PR #37, closes #36)
- **`--write-state` safeguard**: Blocks `--write-state` when source has newer commits than target, preventing silent divergence. Use `--force` to override.

## [0.10.0] - 2026-03-20

### Added
- **`--skip-existing` flag** for `translate init`: Skip lectures that already have `.translate/state/` entries, enabling idempotent re-runs after partial failures (PR #34)
- **`-j, --parallel <n>` flag** for `translate init`, `backward`, `forward`: Concurrent processing with configurable worker count (PR #33)
- **`filterSkipExisting()` helper** (`src/cli/commands/init.ts`): Exported pure function for skip-existing filtering logic
- **`skippedCount` field** in `TranslationStats`: Separate tracking for skipped vs translated files in init reports
- **3 new tests** for `filterSkipExisting` (879 → 882 total)

### Changed
- **Init reporting**: Skipped lectures no longer inflate "Successfully Translated" count or distort average time per lecture

## [0.9.0] - 2026-03-19

Full CLI tool suite, `.translate/` metadata system, GitHub Action state integration, and comprehensive E2E testing across 24 scenarios with 48 target PRs.

### Added

#### Phase 6 — `.translate/` Metadata
- **`translate-state.ts` module** (`src/cli/translate-state.ts`): read/write `.translate/config.yml` and per-file state YAML
  - Pure serializers (`serializeFileState`, `serializeConfig`, `stateFileRelativePath`, `configRelativePath`) shared between CLI and Action
- **`setup` command** (`src/cli/commands/setup.ts`): scaffold target translation repositories
  - Generates GitHub Actions workflow, `.translate/config.yml`, README, `.gitignore`
  - Configurable source repo, target language, docs folder, branch
- **GitHub Action integration**: state files included in translation PRs alongside translated content
  - `StateGenerationConfig` interface in `sync-orchestrator.ts` (opt-in)
  - After translating each file, generates `.translate/state/<file>.yml` and adds to `translatedFiles`
  - `index.ts` fetches existing state file SHAs from target repo for Octokit updates
  - Renamed/removed files clean up their corresponding state files
  - Docs-folder prefix stripped so CLI and Action produce identical state paths
- **`status` command**: uses `source-sha` for exact staleness detection (replaces git date heuristic)
  - `--write-state` flag: bootstrap state for existing projects
- **`backward` command**: skips unchanged files via `source-sha` comparison
- **`forward` command**: writes state after resync

#### Phase 5 — CLI Rename + Init Command
- **CLI renamed**: `resync` → `translate` (`package.json` bin entry, `src/cli/index.ts`)
  - All commands: `npx translate backward`, `npx translate forward`, `npx translate status`, etc.
- **Init command** (`src/cli/commands/init.ts`): Bulk-translate an entire project from a local source repo
  - `npx translate init -s <source> -t <target> --target-language zh-cn`
  - 7-phase pipeline: glossary → TOC parse → setup → copy non-md → translate → heading-maps → report
  - `--dry-run`, `--resume-from`, `-f, --file`, `--batch-delay`, `--glossary`, `--localize` flags
  - Reads `_toc.yml` for lecture discovery (supports `chapters`, `parts`, `root`)
  - Produces `TRANSLATION-REPORT.md` with stats, config, and failure details
  - Retry logic: 3 attempts with exponential backoff, skips permanent failures
  - Progress bar for bulk translation
- **Localization rules** (`src/localization-rules.ts`): Code-cell localization system for `init`
  - `code-comments`: translate Python comments in code cells
  - `figure-labels`: translate matplotlib plot labels, axis titles, legend entries
  - `i18n-font-config`: inject CJK font configuration into first matplotlib cell (`zh-cn` only)
  - All rules ON by default; disable with `--localize none`

#### Phase 4 — Refinement
- **CLI smoke tests**: 11 tests invoking the CLI binary as an external process
- **Prompt snapshot tests**: 5 snapshots across 3 test suites
- **Unicode heading ID support** (`src/parser.ts`, `src/reviewer.ts`): `\p{L}\p{N}` Unicode property escapes for CJK, Arabic, Japanese headings
- **`gh` CLI pre-flight check**: `checkGhAvailable()` with injectable `AuthCheckRunner`
- **Malformed YAML handling**: `parseTocLectures()` catches YAML parse errors with descriptive messages

#### Phase 3b — Forward Resync Command
- **Forward command** (`src/cli/commands/forward.ts`): Resync TARGET translations to match current SOURCE
  - `translate forward -f cobweb.md` — single file resync
  - `translate forward` — bulk resync of all OUTDATED files (via status)
  - `--github <owner/repo>` flag: creates one PR per file in TARGET repo
  - Pipeline: triage → whole-file RESYNC → output
- **Forward triage** (`src/cli/forward-triage.ts`): LLM content-vs-i18n filter (~$0.01/file)
- **Forward PR creator** (`src/cli/forward-pr-creator.ts`): Git ops + PR creation via `gh` CLI
- **Whole-file RESYNC translation** (`src/translator.ts`): New `translateDocumentResync()` method
  - Sends entire SOURCE + TARGET + glossary in one call (~$0.12/file)
  - 2-3× cheaper than section-by-section (glossary sent once, not per section)
- **Section RESYNC mode** (`src/translator.ts`): `translateSectionResync()` (retained for SYNC mode)

#### Phase 3a — Review Command
- **Review command** (`src/cli/commands/review.ts`): Interactive human review of backward suggestions
  - `translate review <report-dir>` with `--dry-run`, `--repo`, `--min-confidence` flags
- **Chalk-styled card formatter** (`src/cli/review-formatter.ts`): Category badges, confidence tiers, Before/After display
- **Ink interactive review session** (`src/cli/components/ReviewSession.tsx`): Accept/Skip/Reject keypresses
- **GitHub Issue generator** (`src/cli/issue-generator.ts`): `[filename § section] summary` titles, structured bodies
- **GitHub Issue creator** (`src/cli/issue-creator.ts`): `gh issue create` with injectable `GhRunner`

#### Phase 2 — Backward Analysis + Status
- **Status command** (`src/cli/commands/status.ts`): Fast, free diagnostic — no LLM calls
  - Per-file sync status: `ALIGNED`, `OUTDATED`, `SOURCE_AHEAD`, `TARGET_AHEAD`, `MISSING_HEADINGMAP`, `SOURCE_ONLY`, `TARGET_ONLY`
  - Console table and JSON output
- **Bulk backward** (`src/cli/commands/backward.ts`): Full-repo backward analysis
  - Two-stage pipeline: Stage 1 triage → Stage 2 per-section evaluation
  - Parallel processing (5 concurrent files), checkpointing, `--resume` flag
  - Per-file reports + aggregate `_summary.md` / `_summary.json`
- **Backward report JSON schema** (`src/cli/schema.ts`): Formal Zod schemas, `loadResyncDirectory()`, `filterActionableSuggestions()`
- **Interleaved commit timeline** (`git-metadata.ts`): SOURCE/TARGET commit history for temporal context in prompts

#### Tests
- **879 tests** (39 suites, 5 snapshots) — up from 316 in v0.8.0

### Changed
- **ESM migration**: Entire codebase now compiles to ESM (`"module": "node16"`)
- **Action bundle moved to `dist-action/`**: Uses esbuild (CJS format) instead of ncc
- **`@anthropic-ai/sdk`** updated from `0.27.0` to `0.78.0`
- **Strengthened i18n code preservation** in all translation prompts (UPDATE, section RESYNC, whole-file RESYNC)
- **New dependencies**: `ink@^4`, `react@^18`, `commander@^14`, `zod`, `esbuild`

### Removed
- **`--estimate` flag** removed from `backward` and `forward` commands (replaced by `--dry-run`)
- **`tool-bulk-translator/`** directory removed — functionality superseded by `translate init`

## [0.8.0] - 2026-02-18

### Added
- **Sync Orchestrator**: Extracted `SyncOrchestrator` class from `index.ts` into new `src/sync-orchestrator.ts` module
  - `Logger` interface decouples processing from `@actions/core` for future CLI reuse
  - `classifyChangedFiles()` categorises files (markdown, toc, renamed, removed)
  - `loadGlossary()` utility for loading target-language glossary
  - `FileToSync` and `SyncProcessingResult` interfaces
- **PR Creator**: Extracted PR creation logic into new `src/pr-creator.ts` module
  - `createTranslationPR()` creates/updates PRs in target repo
  - `buildPrBody()`, `buildPrTitle()`, `buildLabelSet()` pure utility functions
  - `PrCreatorConfig` and `SourcePrInfo` interfaces
- **Retry Logic**: Added exponential backoff retry to `translator.ts`
  - Retries `RateLimitError`, `APIConnectionError`, and 5xx `APIError`
  - Max 3 attempts with 1s/2s/4s delays
  - No retry for permanent failures (`AuthenticationError`, `BadRequestError`)
  - `RETRY_CONFIG` export for testing
- **New Tests**: 133 new tests (183 → 316 total, 15 suites)
  - `inputs.test.ts` (55 tests) — mode, repo format, language, model, PR event validation
  - `translator.test.ts` (28 tests) — token estimation, glossary formatting, error handling
  - `sync-orchestrator.test.ts` (26 tests)
  - `pr-creator.test.ts` (12 tests)
  - `translator-retry.test.ts` (12 tests)

### Changed
- **`index.ts`**: Rewritten from ~766 to ~447 lines — delegates to `SyncOrchestrator` and `createTranslationPR()`

### Removed
- **Deprecated Methods**: Removed 3 dead methods from `file-processor.ts`
  - `findSourceSectionIndex()` (always returned -1)
  - `findTargetSectionIndex()` (deprecated)
  - `findMatchingSectionIndex()` (deprecated)

## [0.7.0] - 2025-12-05

### Added
- **Repository Rename**: Renamed from `action-translation-sync` to `action-translation`
  - Cleaner naming that reflects multi-mode functionality
  - GitHub auto-redirects old URLs
- **Review Mode**: New AI-powered translation quality assessment
  - `mode` input is now **required** (`sync` or `review`)
  - `source-repo` input to specify source repository for English content
  - `max-suggestions` input to control number of suggestions (default: 5)
  - Posts detailed review comments on translation PRs
  - Evaluates translation quality (accuracy, fluency, terminology, formatting)
  - Evaluates diff quality (scope, position, structure, heading-map)
  - Returns verdict: PASS, WARN, or FAIL
  - New outputs: `review-verdict`, `translation-score`, `diff-score`
- **New Module**: `src/reviewer.ts` (~700 lines)
  - `TranslationReviewer` class for PR review workflow
  - `identifyChangedSections()` for change detection
  - Parses source PR reference from translation PR body for accurate diff comparison
  - Fetches actual English before/after from source PR (same approach as evaluator tool)
  - Adapted from `tool-test-action-on-github/evaluate/` for action context
- **New Test Suite**: `src/__tests__/reviewer.test.ts` (28 tests)
  - Helper function tests
  - Change detection tests (new/deleted/modified/renamed documents)
  - Review formatting tests
  - Integration scenarios with real-world content
- **Persian (Farsi) Glossary**: Complete Persian glossary with 357 terms
  - Economic terms (~160): تعادل, تولید ناخالص داخلی, سیاست مالی
  - Mathematical terms (~100): ماتریس, بردار ویژه, همگرایی
  - Statistical terms (~35): توزیع نرمال, رگرسیون, واریانس
  - Economist names (~45): رابرت سولو, میلتون فریدمن
- **Persian (Farsi) Language Support**: Added full Persian language configuration
  - Persian (`fa`) language config with RTL punctuation rules
  - Language-specific prompt customization (formal/academic style)
  - Optimized token expansion factor (1.8x) for verbose RTL translations
- **Smart Token Management**: Hybrid pre-flight validation approach
  - Pre-flight size checks before translation (fail fast for oversized docs)
  - Always use API max tokens (32K) for translatable documents
  - Language-aware output token estimation (Persian: 1.8x, CJK: 1.3x, default: 1.5x)
  - Clear error messages for documents exceeding API limits
- **Incomplete Document Detection**: Validates translation completeness
  - Marker-based detection of truncated translations
  - Directive block balance validation in prompts

### Changed
- **Action Name**: Changed from "Translation Sync" to "Translation Action"
- **Package Name**: Changed from `action-translation-sync` to `action-translation`
- **Input Requirements**: `target-repo` and `target-language` now only required for sync mode
- **Test Count**: Increased from 155 to 183 tests
- **Bulk Translator Improvements**:
  - Always fetch `_toc.yml` from GitHub (consistent behavior in all modes)
  - Use `parseSections()` for heading-map generation
  - Updated cost estimation to be model-aware (Sonnet/Opus/Haiku pricing)
- **Translation Prompt Enhancements**:
  - Added directive block balancing rules (exercise-start/end, solution-start/end)
  - More explicit instructions for complete document translation
  - Language-specific expansion factors for better token estimates

### Fixed
- **Token Limit Issues**: Increased max_tokens from 8K to 32K; improved Persian token estimation (1.6x → 1.8x)

### Removed
- **workflow_dispatch Support**: Removed `workflow_dispatch` trigger from sync mode
  - Use `test-translation` label on PRs for manual testing instead
  - This ensures every translation PR has source PR metadata for accurate review
  - Simplifies architecture: `prNumber` is now always available (never null)

## [0.6.3] - 2025-12-04

### Fixed
- **Test Data Syntax Errors**: Fixed 2 markdown syntax bugs in test fixtures
  - `19-multi-file-lecture.md`: Fixed malformed heading `####Applications` → `#### Applications`
  - `23-special-chars-lecture.md`: Fixed mixed fence markers `$$...``` ` → `$$...$$`
  - These were the exact errors v0.6.2's validation was designed to prevent!

### Changed
- **PR Labels Default**: Simplified from `translation-sync,automated` to `action-translation-sync,automated`
  - Removed redundant `translation-sync` label in favor of more specific `action-translation-sync`
  - Cleaned up hardcoded label duplication in index.ts
  - Labels now sourced solely from `pr-labels` input + source PR labels

## [0.6.2] - 2025-12-04

### Added
- **Enhanced Fence Marker Validation**: Translator now explicitly prevents mixing fence markers
  - Prevents mixing `$$` with ` ``` ` in math blocks (e.g., `$$...````)
  - Enforces consistency: use `$$...$$` OR ` ```{math}...``` `, never mixed
  - Added to all translation modes (UPDATE, NEW, FULL DOCUMENT)
  - Catches common syntax errors before they reach the evaluator
- **Improved Target PR Metadata**: Translation PRs now have better titles and labels
  - Title format: `🌐 [translation-sync] <source PR title>` (mirrors source PR)
  - Automatic labels: `automated`, `action-translation-sync`
  - Copies labels from source PR (except `test-translation`)
  - Makes translation PRs easier to identify and manage
- **Evaluator Model Selection**: New `--model` flag to choose evaluation model
  - Default: `claude-opus-4-5-20251101` (highest quality, $0.30/PR)
  - Alternative: `claude-sonnet-4-5-20250929` (faster, cheaper $0.06/PR)
  - Enables cost/quality comparison for evaluation tasks

### Fixed
- **Evaluator: Renamed File Handling**: Fixed evaluation of renamed files
  - Now fetches "before" content from `previousFilename` field
  - Detects pure renames (no content changes) and marks appropriately
  - Prevents showing all sections as "changed" in rename-only PRs
- **Evaluator: Issue Normalization**: Improved parsing of Claude responses
  - Handles object-style issues with `description`, `location`, `suggestion` fields
  - Better fallback to JSON.stringify for unknown structures
  - Filters out empty/malformed issue strings

### Removed
- **Evaluator: `--dry-run` Flag**: Removed redundant flag
  - Use `npm run evaluate` to save reports (default behavior)
  - Use `npm run evaluate:post` to post reviews to PRs
  - Simpler CLI with clearer intent

## [0.6.1] - 2025-12-04

### Added
- **Markdown Syntax Validation in Prompts**: LLM-based syntax checking
  - Translator prompts (UPDATE, NEW, FULL DOCUMENT) now include explicit syntax rules
  - Evaluator includes "Syntax" as 5th evaluation criterion
  - `syntaxErrors` array in evaluation response for critical markdown errors
  - Syntax errors displayed prominently in PR comments with 🔴 markers
  - Rules: space after `#` in headings, matching code/math delimiters
- **Configurable Max Suggestions**: Evaluator now supports `--max-suggestions` flag
  - Default increased from ~2 to 5 suggestions
  - Prompt explicitly allows 0 suggestions for excellent translations
- **Changed Sections Detection**: Evaluator focuses suggestions on modified content only
  - Computes changed sections by comparing before/after content
  - Supports preamble changes, additions, modifications, deletions
  - Deep nesting support (######), empty sections, special characters

### Fixed  
- **Evaluator**: Changed sections list no longer includes non-existent sections
- **File Rename Handling**: Renamed files now properly handled in translation sync
  - Previously: renamed files were added as new files, leaving orphaned translations
  - Now: existing translation is transferred to new filename, old file is deleted
  - Uses GitHub's `previous_filename` field for rename detection
  - Preserves heading-map and existing translations when files are renamed

### Changed
- **Glossary**: Added 2 game theory terms (357 total, was 355)
  - "folk theorem" → "无名氏定理"
  - "grim trigger strategy" → "冷酷策略"

### Documentation
- Created myst-lint project proposal: QuantEcon/meta#268

## [0.6.0] - 2025-12-03

### Added
- **Opus 4.5 Evaluation Tool**: Quality assessment framework for translations
  - Located in `tool-test-action-on-github/evaluate/`
  - Uses Claude Opus 4.5 for translation quality evaluation
  - Evaluates: Translation quality, diff accuracy, glossary compliance, heading-map handling
  - Posts review comments on GitHub PRs with structured feedback
  - Includes all 355 glossary terms for validation
  - Supports `--list-only` flag for dry-run mode
- **Input Validation**: Language code validation against configured languages in `LANGUAGE_CONFIGS`
  - New functions: `getSupportedLanguages()`, `isLanguageSupported()`, `validateLanguageCode()`
  - Clear error messages with list of supported languages
  - Guidance to add new languages via `LANGUAGE_CONFIGS`
- **Model Validation**: Claude model name validation with warning for unrecognized patterns
  - Validates against known Claude model patterns (sonnet, opus, haiku variants)
  - Warning only (doesn't block) to allow new models
- **Improved API Error Handling**: Specific error messages for Anthropic API failures
  - Authentication errors: Guides to check API key secret
  - Rate limit errors: Informs about automatic retry
  - Connection errors: Suggests checking network
  - Bad request errors: Indicates prompt/content issues
- **8 New Tests**: Validation function test coverage

### Changed
- **Dependencies**: Removed 10 unused AST-related packages (unified, remark-*, mdast-*, diff)
  - Reduced total packages from 527 to 439
  - Removed ~700KB of unnecessary dependencies
  - Packages removed: `unified`, `remark-parse`, `remark-stringify`, `remark-directive`, `remark-math`, `remark-gfm`, `mdast-util-to-string`, `unist-util-visit`, `diff`, `@types/diff`
- **LANGUAGE_CONFIGS**: Now exported for external access and validation

### Fixed
- **translator.ts**: Fixed Claude model default mismatch
  - Changed default from `claude-sonnet-4.5-20241022` to `claude-sonnet-4-5-20250929`
  - Now matches the default specified in `action.yml`

### Documentation
- **TESTING.md**: Updated test count from 125 to 147, expanded test file breakdown
- **ARCHITECTURE.md**: Updated line counts for all 7 modules to reflect current codebase
- **INDEX.md**: Replaced corrupted file with clean version (was severely corrupted with merged/duplicated lines)
- **STATUS-REPORT.md**: Removed references to non-existent TODO.md, updated to use GitHub Issues
- **copilot-instructions.md**: Updated version, line counts, and test coverage metrics

## [0.5.1] - 2025-11-06

### Added
- **Language Configuration System**: New `language-config.ts` module for extensible language-specific translation rules
- Chinese-specific punctuation rules (full-width characters)
- Support for easy addition of new target languages (Japanese, Spanish, etc.)

### Changed
- Translation prompts now automatically include language-specific rules
- Case-insensitive language code lookups

### Documentation
- Added GPT5 comprehensive evaluation results (21 scenarios, 100% pass rate)

## [0.5.0] - 2025-11-06

### Added
- **TOC File Support**: `_toc.yml` files are now automatically synced to target repos
- **File Deletion Handling**: Deleted files are now removed from target repos
- 8 new test scenarios covering document lifecycle operations

### Changed
- Enhanced PR descriptions to include file deletions

## [0.4.10] - 2025-10-31

### Fixed
- Root-level file handling for `docs-folder: '.'` configuration
- GitHub Actions quirk that converts `.` to `/` in inputs

## [0.4.7] - 2025-10-24

### Added
- Full recursive subsection support for arbitrary nesting depth (####, #####, ######)
- Recursive subsection change detection in diff-detector
- Subsection integration into heading-maps

### Fixed
- Subsection duplication prevention in document reconstruction

## [0.4.6] - 2025-10-23

### Added
- Heading-map system for language-independent section matching
- Automatic heading-map population on first translation

## [0.4.5] - 2025-10-22

### Changed
- Improved preamble change detection
- Enhanced section position matching

## [0.4.4] - 2025-10-21

### Added
- UPDATE mode for incremental translation of modified sections
- Glossary support for consistent terminology

## [0.4.3] - 2025-10-20

### Added
- NEW mode for full section translation
- Basic MyST Markdown parsing

## [0.3.0] - 2025-10-15

### Changed
- **Architecture Overhaul**: Migrated from block-based to section-based translation
- Removed AST parsing in favor of simple line-by-line approach

## [0.2.2] - 2025-10-10

### Fixed
- Various bug fixes and stability improvements

## [0.1.2] - 2025-10-05

### Fixed
- Initial bug fixes

## [0.1.1] - 2025-10-03

### Fixed
- Minor fixes after initial release

## [0.1.0] - 2025-10-01

### Added
- Initial release
- Basic translation workflow using Claude AI
- GitHub Actions integration
- Support for MyST Markdown documents

# Deep Technical Review — 2026-07-15

**Reviewer**: Claude (Fable 5) &nbsp;·&nbsp; **Baseline**: `main` @ `5fb9c40` (v0.16.0, released 2026-07-15)
**Predecessor**: the 2026-07-05 deep review, whose findings live in [.dev/PLAN.md](.dev/PLAN.md) / [.dev/ARCHITECTURE.md](.dev/ARCHITECTURE.md). This review does **not** repeat that catalog — it (a) verifies what changed since, (b) reports **new** findings, with emphasis on code that landed after 2026-07-05 (v0.16.0: model upgrade, `typography.ts`, glossary tooling), and (c) audits docs, tests, dependencies, and release/ops state.

**Method**: five parallel line-by-line review agents (action core, LLM pipeline, CLI, tests/CI/build/deps, docs/hygiene) over all 78 source files + docs + GitHub state, with independent spot-verification of every headline claim (reproduced locally or checked against production repos). Severity tags follow PLAN.md: **[H]** wrong output / broken workflow, **[M]** wrong under realistic conditions, **[L]** quality/robustness.

---

## 1. Executive summary

**Overall: a genuinely well-run repository whose safety nets are weaker than they look.** The engineering culture is strong — current CHANGELOG, decision records, a measured (not vibes-based) model upgrade, fresh committed `dist-action/`, green 4.4s CI, honest `.dev/` notes. But this review found that several of the quality gates the project relies on are partially illusory, that one v0.16.0 feature shipped a corruption bug into the production French repo, and that the 2026-07-05 review's high-severity correctness backlog is essentially untouched while feature work continued.

**Top findings** (every [H] independently re-verified — reproduction notes in the Appendix):

1. **[H — shipped defect] `typography.ts` corrupts footnote and link-reference definitions, and the corruption is live in production.** The French NBSP pass rewrites `[^mung]: …` → `[^mung] : …`, which stops the definition parsing under CommonMark/MyST. `lecture-python-programming.fr/lectures/pandas.md:815` contains the broken bytes today (reproduced against `dist/typography.js` and confirmed by hexdump of the production file). The `scripts/typography/apply.mjs` safety net *cannot* catch this class — its normalizer defines the corruption as "pure spacing". → §3.1
2. **[H] The floating `v0` tag points at v0.7.0-era code — 115 commits behind v0.16.0** — with a `claude-sonnet-4-5-20250929` default model. The README quickstart tells every new adopter to use `@v0`. Production repos are unaffected only because they pin exact versions (`zh-cn`/`fa` → v0.15.0, `fr` → v0.16.0 — itself an untracked cross-language model inconsistency). → §3.2
3. **[H] The lint gate has never covered 59% of the codebase.** `"lint": "eslint src/**/*.ts"` runs under `/bin/sh` (no globstar), expanding to 32 of 78 files — every core module (`index.ts`, `translator.ts`, `parser.ts`, `reviewer.ts`, …) has never been linted, locally or in CI. Verified: the sh glob yields 32; `find` yields 78. The same bug in `format` explains why `prettier --check` fails on all 78 files. → §3.3
4. **[H] No LICENSE file exists.** README, `package.json`, and `docs/myst.yml` all claim MIT; GitHub reports the repo as unlicensed. Consumers currently have no license grant. One-file fix. → §3.4
5. **[H] The shipped action bundle contains known-vulnerable dependencies** (`undici` 5.29.0 via stale `@actions/*`, `js-yaml` 4.1.0 — a *direct* prod dep with an in-range fix). `npm audit --omit=dev`: 3 high / 3 moderate. This is PLAN 1.4, unexecuted. → §5
6. **[H — process] Of the 2026-07-05 plan's ~90 items, ~4 landed (2 of them unticked).** Every Phase 1 [H] correctness fix — API pagination, CRLF PR-body parsing, `stop_reason` truncation guards — is still open; v0.16.0 was entirely new-feature work. The typography bug (finding 1) is a fresh instance of exactly the bug family ARCHITECTURE.md R1 predicts. → §4
7. **[M] Test-count theater**: the headline "1056 tests" includes 32 tests that import nothing from the module they claim to test (`translator.test.ts`, `expect(true).toBe(true)`) and 6 fixture-gated tests that have never run in CI (3 of which can't run anywhere — the fixture path is wrong). No coverage threshold is configured; `src/index.ts` is 0% of 1,095 lines. → §5
8. **[M] A family of silent-data-loss paths in the sync merge logic** (new, §6.1): heading-map lookups fail for every `{index}`-role heading (canonicalization asymmetry) and quietly re-translate — discarding human refinements; target-only sections are deleted without warning; per-file fetch failures drop the file from the PR while the run reports success; heading level changes either lose translations or embed untranslated English. All four converge on the same theme: **the pipeline's failure modes are silent**, which is why the no-op `validateMyST` (PLAN Phase 2) matters so much.
9. **[M] Docs have not kept up across two releases**: rebase mode (v0.15.0's headline feature) is absent from every user doc; `docs/index.md` still says v0.8.0 / 873 tests on the live landing page; six tutorials 404 (missing from the site toc); `examples/README.md` uses a token that cannot work cross-repo plus a `ja` example that throws; the documented `npx translate` cannot work (package not on npm). → §7

**The single most important structural observation** (sharpening ARCHITECTURE.md R1): the project keeps shipping deterministic text transforms and regex parsers *without a round-trip/structural gate*, and each one costs a production incident (#5, #6/#40, #49, #50/#54, #65, and now the typography footnote bug). The Phase 2 round-trip invariant test is the highest-leverage unstarted item in the plan — it would have caught this month's bug before release.

---

## 2. What changed since the 2026-07-05 review

Seven commits, +7,864/−2,365 across 89 files: `.dev/` convention (#72), model default → `claude-sonnet-5` with centralized model/token config (#75), thinking-eval concluded + glossary-review tooling (#76), experiment-page publishing (#77), deterministic French typography (#79), v0.16.0 release (#80).

**Assessment of the new work itself:**

- **`src/models.ts` — good.** Single source of truth for model/token config; verified against the current Claude API: `claude-sonnet-5`, `claude-opus-4-8`, `claude-opus-4-7` are all real IDs; the 64000 whole-document `max_tokens` is within Sonnet 5's 128K output cap; the ~30% tokenizer-growth sizing rationale matches reality. Nits: the pattern list still blesses retired model IDs (`claude-3-5-sonnet-*`, `claude-3-opus-*` — now 404) and warns on valid ones (`claude-fable-5`, bare `claude-opus-4-5`); the comment at `src/models.ts:57-63` still calls thinking-off "a deliberate hold … being measured" though `.dev/decisions/D-2026-07-14-thinking-off-sonnet5.md` settled it; `DEFAULT_THINKING: {type:'disabled'}` would 400 on `claude-fable-5` if a user ever passes it (explicit `disabled` is rejected there — omit the param instead).
- **The thinking-off and Opus-for-bulk-seed decisions are well-evidenced** (measured, recorded as decision files) — this is how model choices should be made. The same rigor has **not** been applied to the headline change: the Sonnet 4.6 → Sonnet 5 default swap shipped with no translation-quality regression measurement (now tracked as issue #82). §8.4 proposes a concrete cheap eval.
- **`src/typography.ts` — right idea, one bad mask gap (finding §3.1), wrong integration point.** The transform runs only on the CLI `init` path (`src/cli/commands/init.ts:299`) — the action's sync path, `forward` resync, and rebase never call it (known, tracked as #81), so every post-seed French sync PR regresses to ASCII spacing while the prompt rule (`src/language-config.ts:53`) — the one measured to be ignored — remains the only mechanism. The prompt and the post-processor now *disagree by design*, which is only tenable until sync is wired.
- **`scripts/glossary/` — useful tooling; its "verbatim production prompt" has already drifted** (omits `customInstructions`/localization rules that production `init` injects by default; copies production's rule-numbering collision; cost model silently prices unknown models at $0 and overstates Sonnet 5 spend ~33% by ignoring intro pricing).
- **Release execution was clean** (CHANGELOG complete and correctly dated, dist rebuilt, `v0.16`/`v0.16.0` tags placed) **except the `v0` floating tag was not moved** — see §3.2.

---

## 3. Highest-priority new findings

### 3.1 [H] French typography corrupts footnote/link-reference definitions — shipped to production

`src/typography.ts:150-157, 173-188`: `INLINE_PROTECTED` masks inline links `[x](y)` but not line-leading *definition labels*. So:

- `[^mung]: note text !` → `[^mung] : note text !` — the NBSP between `]` and `:` stops it being a footnote definition; it renders as literal paragraph text and every `[^mung]` reference breaks.
- `[label]: https://…` — same for link-reference definitions.

**Verified twice**: reproduced against `dist/typography.js` (input `[^mung]: …` → output `[^mung] : …`), and the shipped repo `~/work/quantecon/lecture-python-programming.fr/lectures/pandas.md:815` contains `5b 5e 6d 75 6e 67 5d c2 a0 3a` (`[^mung]` + U+00A0 + `:`) with the `[^mung]` reference at line 71.

The repair tool can't catch it: `scripts/typography/apply.mjs:58` `normalize()` strips `[   \t]*([;:!?])` before diffing — i.e. it *defines this corruption as acceptable spacing*.

**Fix order**: (1) mask `^\s*\[[^\]]*\]:` lines in `applyToProse` (same style as the existing `(anchor)=` guard at `src/typography.ts:200`); (2) teach `apply.mjs`'s comparator to exclude definition-label lines from "spacing-only"; (3) repair `lecture-python-programming.fr` (scan for `\] :`); (4) only then wire typography into the sync path (#81) and delete the fr NBSP prompt rule so prompt and post-processor stop disagreeing. A regression fixture with footnotes/link-refs/anchors belongs in `typography.test.ts` — and this whole class is the Phase 2 round-trip test's job to catch.

### 3.2 [H] Release channel: `v0` tag is 115 commits stale; production pins have diverged

- `origin/v0` → `9e92030` ("MAINT: prepare v0.7.0 release"). `README.md:47` and the quickstart tell users `uses: quantecon/action-translation@v0` — a new adopter today gets v0.7.0-era code with default model `claude-sonnet-4-5-20250929` and none of: rebase mode, translation frontmatter, MyST-role stripping, resync command, current glossaries.
- PLAN 1.6 already says "move the `v0`/`v0.15` tags" as a release chore; the v0.16.0 release moved `v0.16`/`v0.16.0` but not `v0`. Either (a) make "move `v0`" a scripted release step (`git tag -f v0 && git push -f origin v0`), or (b) stop documenting `@v0` and standardize on exact pins (PLAN 7's pin-normalization item). Pick one; the current half-state is the worst option.
- **Production drift**: `lecture-python-programming.myst` pins `@v0.15.0` for `zh-cn` and `fa` but `@v0.16.0` for `fr` — so zh-cn/fa currently translate with Sonnet 4.6 while fr uses Sonnet 5. If deliberate staging, record it; if drift, it's evidence for FUTURE idea 2 (per-language model config) and for centralizing the version fan-out (the #61 ops problem).

### 3.3 [H] The lint/format gate covers 32 of 78 files

`package.json:14` — `eslint src/**/*.ts` under `/bin/sh` expands `**` as a single `*`: **32 files** (verified) vs 78 actual `.ts` files. Never linted: all 14 root `src/*.ts` (including every core module), `src/cli/commands/*.ts`, `src/cli/__tests__/*.ts`. CI's green "Lint" job inherits the same bug, and `format` shares it — which is why `npx prettier --check "src/**/*.ts"` currently fails on **78/78 files**.

**Fix**: quote the glob or use `eslint src` / `prettier --check src`. Expect a wave of new warnings/errors from the 46 never-linted files. Sequence: fix glob → one mechanical `prettier --write` commit → add `prettier --check` and `--max-warnings 0` to CI (PLAN 5.7 finally becomes real).

### 3.4 [H] No LICENSE file

`README.md:96`, `package.json:26`, `docs/myst.yml:7`, and CONTRIBUTING all say MIT; no LICENSE/COPYING file is tracked; `gh repo view` shows `license: null`. Until the file exists, "MIT" is an unfulfilled statement of intent and GitHub/consumers/tooling treat the repo as all-rights-reserved. Add the standard MIT text with the QuantEcon copyright line.

### 3.5 [M] Publish safety + broken `npx` documentation

`package.json` has no `private: true` and no `files` allowlist; `npm pack --dry-run` = 428 files / 7.7 MB including `.dev/` internal notes and — because npm-packlist ignores local git excludes — the untracked `.claude/settings.local.json`. Meanwhile the bin name `translate` collides with an unrelated npm package, so the documented `npx translate …` (README:62-66, faq, architecture docs) fetches the wrong package for anyone outside this repo. Either add `private: true` and change docs to a local invocation, or claim a scoped name (`@quantecon/translate`) with a `files` allowlist. Related ops gaps: `main` has no branch protection; repo topics are empty.

---

## 4. Status of the 2026-07-05 plan (verification, not opinion)

Spot-verified against code at `5fb9c40`. Summary: **Phase 1–8 are essentially unstarted**; two items are done-but-unticked; one item partially landed as a side effect of #75.

| Phase | Status | Evidence highlights |
|---|---|---|
| 1.1 Pagination | **Open** | `src/index.ts:573`, `src/reviewer.ts:370,450` still unpaginated |
| 1.2 Small fixes | **Open** | CRLF `\n`-only @ `reviewer.ts:342`; `\translate-resync zh` still fail-open @ `inputs.ts:266-271`; glossary `"undefined"` @ `translator.ts:668-674`; `content[0]` unguarded (now *documented as load-bearing* in `models.ts:57-63`) |
| 1.3 stop_reason | **Open** | zero `stop_reason` refs in `src/`; ironically the new `scripts/glossary/translate-sample.mjs:110` *has* the guard production lacks |
| 1.4 Deps | **Open** (1 sub-item done) | `@actions/core` 1.11.1, `@actions/github` 6.0.1, `@anthropic-ai/sdk` 0.78.0 (latest 0.111.0); audit 3H/3M prod; ✔ `package-lock` self-version now 0.16.0 (untick̶ed); `engines` absent; `.gitignore` "ncc" comment intact |
| 1.5 Rebase hardening | **Open** | unchanged |
| 1.6 Release chores | **Partial** | ✔ CHANGELOG 0.15.0 date fixed in #80 (unticked); `v0` tag *not* moved (§3.2) |
| 2 Parser/validation | **Open** | see §6 (core) — all items re-confirmed present |
| 3 CLI state | **Open** | every item re-confirmed at current line numbers (§6) |
| 4 Action robustness | **Open** | except: review 1500-token cap **FIXED** (now `MAX_TOKENS.review`=8192) and `checkDocumentSize` hardcode **FIXED** (uses `MAX_TOKENS.fullDocument`) — both via #75; NaN validation and the resync double-count remain |
| 5 Test debt/CI | **Open** | translator.test.ts fake tests unchanged; index.ts 0%; fixture skips; no coverage threshold; node20 everywhere (EOL passed) |
| 6 Consolidation | **Open** | retry stacking at all 6 SDK construction sites; reviewer's private parser; inverted `src/cli/` import in the action |
| 7 Docs | **Open** | all items re-confirmed except rebase example (§7) |
| 8 Issue gardening | **Open** | 0 of 11 done; #1 #2 #3 #4 #6 #7 #48 #53 #61 #65 #66 all still open |

**`.dev/` currency** (the convention's first real test): STATE.md went stale within a day of its `verified: 2026-07-14` line — it still says "Released v0.15.0", lists merged #72 as in-flight, and (most substantively) says fr has "no production repo yet" while `lecture-python-programming.fr` exists with a live sync workflow pinned to v0.16.0. New issues #81/#82 and PR #78 aren't reflected; no `.dev/log/` entries exist for the three 2026-07-15 sessions despite the AGENTS.md convention. The notes are good; the *update discipline on release days* is the gap.

---

## 5. Measurements (tests, coverage, lint, deps, build)

- **Tests**: 40 suites; **1,059 defined** = 1,056 passed + 3 skipped locally; in CI 1,053 passed + 6 skipped (the extra 3 are fixture-gated tests whose committed path is wrong — `schema.test.ts:455` points at `reports/backward-2026-03-04-whole-file`; data lives under `reports/lecture-python-intro/…`, so they run on *no* machine). Runtime 4.4s. README says both "1056" and "1005"; docs/index.md says 873.
- **Effective test count is lower than the headline**: −32 `translator.test.ts` no-op tests (never import `../translator`; `expect(true).toBe(true)` at :46/:58) −6 never-run fixture tests. `integration.test.ts:100` declares `expectedChineseContent` and never asserts it — the scenario's output check is gone.
- **Coverage**: 67.2% statements overall, **no threshold configured**. `src/index.ts` **0%** (all 1,095 lines — mode dispatch, whole rebase pipeline), `src/cli/index.ts` 0%, `reviewer.ts` 34.9%, `pr-creator.ts` 55.9% (the actual API function uncovered).
- **Types/lint/format**: `tsc --noEmit` clean. ESLint 0 errors / 13 warnings — *on the 32 files it sees* (§3.3). Prettier fails 78/78.
- **Dependencies**: prod audit 3 high / 3 moderate (`undici` 5.29.0, `ws` 8.19.0, `lodash` 4.17.23, `js-yaml` 4.1.0 — the last is a direct dep with an in-range fix at 4.3.0, and it's bundled into `dist-action/index.js`). Full audit adds 1 critical (dev-only `handlebars` via ts-jest). Major lags: `@actions/core` 1→3, `@actions/github` 6→9, `@anthropic-ai/sdk` 0.78→0.111, eslint 8 (EOL) → 10, jest 29→30, ink 4→7.
- **Node**: `action.yml` `using: node20`, CI node 20, esbuild target node20, no `engines` — Node 20 passed EOL 2026-04. (PLAN 5.8.)
- **Build/dist**: ✅ `dist-action/` is **exactly fresh** (rebuild → zero diff), `action.yml` inputs/outputs match `src/inputs.ts` and the `core.setOutput` calls precisely, branding present, snapshots are meaningful. The bundle ships a 2.6 MB sourcemap and inlines third-party code with no license attribution (the gitignored `licenses.txt` is never generated).
- **CI**: green on main (~1.5 min). Gates missing: prettier, `--max-warnings 0`, coverage threshold, `npm audit --omit=dev`, any PR-time docs build (deploy-docs runs only on push to main, `mystmd` unpinned).

---

## 6. Findings by area

### 6.1 Action core (parser / diff / file-processor / heading-map / index / sync-orchestrator / pr-creator)

**Tracked items — every one re-verified STILL PRESENT at current line numbers** (only three commits touched `src/` since 2026-07-05 and none touched these sites): fence-blind `parseSections` (`src/parser.ts:69`; the preamble scan at `:40` is equally fence-blind), #65 anchor ownership (`parser.ts:112-117`), the non-ASCII anchor-adjacency regex (`file-processor.ts:564` — verified: `(经济_intro)=` doesn't match), no-op `validateMyST` (`parser.ts:223-233`; the gates at `sync-orchestrator.ts:340,410` remain unfireable), merge discarding fresh translations (`file-processor.ts:352-399`), old target heading unconditionally re-attached (`file-processor.ts:319-326`), `updateHeadingMap` neither preserving nor deleting as documented (`heading-map.ts:82-166`; its `titleHeading` param is never passed by the action caller), positional-fallback misfire on add+delete (`file-processor.ts:193,254,739-749`), duplicate-slug corruption in all three places, `${sha}^` old-content fetch (`index.ts:776,314`), `$1`/`$&` heading-replacement corruption (`file-processor.ts:387`), `context.sha` on the primary sync path (`index.ts:544`), rebase success-comments on no-op early returns (`index.ts:375,447` vs `:201-208`), >1 MB `fetchFileContent` (nuance: downstream now fails *loudly but misleadingly* — "No content provided" — rather than committing empty output), dead `toc-file` input (and `endsWith('_toc.yml')` also matches `foo_toc.yml`), rebase force-push 409/races with no retry, PR-body metadata never refreshed after a rebase, and the **Phase 1.5 rebase trust boundary — unchanged and still the priority security item** (verification confirmed sibling selection and PR-body metadata handling still lack the provenance/identity checks PLAN 1.5 calls for; exploitation specifics withheld here per the `.dev/` public-content rule — see §7.6's R2 sharpening for the structural fix).

**New findings** (none previously tracked):

- **[M] Heading-map lookups fail for every role-bearing target heading** — `src/file-processor.ts:713`. Map values are written role-stripped (`heading-map.ts:92-93` via `stripMystRoles`) but Strategy-1 lookup compares against the *raw* target heading. Verified: map value `熊猫` never equals `` {index}`熊猫 <single: 熊猫>` ``. QuantEcon headings carry `{index}` roles routinely, so for those sections the map never matches: with equal section counts the positional fallback masks it; with unequal counts the section is silently skipped or re-translated from scratch — **discarding accumulated human refinements** in zh-cn/fa. (The rebase added-section path at `:226-231` strips both sides correctly — the asymmetry is the bug.)
- **[M] Target-only sections are silently deleted on sync** — `src/file-processor.ts:176-217,436-441`. Reconstruction iterates only `newSource.sections`; any section that exists only in the target (human-added content) is dropped from the output with no warning. The CLI forward path at least warns (`TARGET_HAS_ADDITIONS`); the action path destroys silently.
- **[M] A per-file fetch failure silently drops that file from the sync** — `src/index.ts:805-807` (and `:851,876,900`; rebase `:370-372`): `catch { core.error(...) }` neither records an error nor fails the run. A transient 5xx yields a PR missing one file, a success comment, no failure issue, green check.
- **[M] Heading level promotion/demotion loses translations or leaks English** — `src/diff-detector.ts:94-97` + `file-processor.ts:697-752,377-397`. Promoting `### Setup` → `## Setup` discards the existing nested translation and re-translates; demoting `## Setup` → `### Setup` falls through to "keep source as-is", embedding an untranslated English subsection in the zh-cn/fa document while the run reports success. Not covered by the tracked rewording (R5) or duplicate-slug items.
- **[M→L] `injectHeadingMap` re-types frontmatter scalars** — `src/heading-map.ts:269-301` round-trips the whole target frontmatter through `yaml.load`/`yaml.dump`. Verified with the repo's own js-yaml: `date: 2026-07-15` → `date: 2026-07-15T00:00:00.000Z`, `1.10` → `1.1`. Silent frontmatter rewriting on every processed file containing an implicitly-typed scalar.
- **[L] CRLF/BOM frontmatter cluster** (distinct from the tracked reviewer CRLF item): `parser.ts:29`, `heading-map.ts:31,63,255` all assume `\n`-only; a CRLF-committed target file loses its heading map, has frontmatter treated as body, and `injectHeadingMap` then prepends a *second* `---` block. The heading regex (`parser.ts:69`) also captures trailing `\r` into heading ids.
- **[L]** `pr-creator.ts:260` backtick "escaping" in the skipped-sections notice is a no-op inside code spans (role-bearing skipped headings spill raw markdown into the PR body); `pr-creator.ts:119-120` branch names have one-second resolution (same-second re-run → `createRef` 422 after the translation spend); `index.ts:533` compares the lowercased resync language against the raw-case input (a `target-language: ZH-CN` workflow never matches a targeted resync); rebase runs whatever `claudeModel` the PR body claims (`index.ts:437-443`) — pre-v0.16.0 PRs rebase on the old model, and a retired ID fails every rebase of an old PR; a renamed file whose rename already landed on main re-translates in full (`index.ts:320-331`); a `###` heading before the first `##` folds into the intro blob and never enters the heading map (`parser.ts:40` vs `:69`), and `parseTranslatedSubsections` keeps only `sections[0]`, silently dropping any sibling `##` the model emits — undetected because `validateMyST` is a no-op.

### 6.2 LLM pipeline (translator / reviewer / models / typography / glossaries / scripts)

Status of tracked items is folded into §4. **New findings** beyond §3.1:

- **[M]** Typography runs only on `init` — sync/forward/rebase paths never call `applyTypography` (sole call site `src/cli/commands/init.ts:299`); tracked as #81 but worth stating the consequence: the French corpus will be internally inconsistent (seeded files typeset, synced updates not) and future `apply.mjs` repair runs will produce noisy diffs.
- **[M]** `src/language-config.ts:53` still *asks the model* for NBSP insertion on every fr call — the exact rule `typography.ts`'s header documents as measured-ignored (0/16). Keep until #81 lands, then delete (the guillemets rule at :52 stays — no deterministic equivalent).
- **[M]** Reviewer NaN verdicts remain: `src/reviewer.ts:758-763` computes `accuracy * 0.35 + …` with no numeric validation → missing fields yield an "NaN/10" score and a spurious FAIL (PLAN 4). Cheapest permanent fix: structured outputs (§8.2).
- **[L]** `src/reviewer.ts:673-681, 818-837` wraps whole lectures in ```` ```markdown ```` fences; lecture content always contains fences, so the wrapper closes early — the pipeline's largest prompt-structure/injection surface. The translator's `[SECTION]…[/SECTION]` delimiters are the in-repo fix pattern.
- **[L]** Retry stacking (PLAN 6) re-confirmed at all six `new Anthropic(` sites: SDK default `maxRetries: 2` under manual 3-attempt loops = worst case 9 HTTP attempts, and the manual layer ignores `retry-after`.
- **[L]** `scripts/glossary/lib.mjs`: prompt copy drifted from production (omits `customInstructions`); cost table prices unknown models at $0.000 silently and ignores Sonnet 5 intro pricing (overstates ~33%); `suggest-glossary.mjs:94`/`compare-models.mjs:62` hardcode `t?.fr` as a fallback key in language-generic tooling.
- **Positive**: all three glossaries verified structurally clean — identical 357-term `en` key sets, uniform shape, zero duplicates/empties. (`glossary/README.md` says 364 — stale.) fr has 47 `en == target` cognate entries that are pruning candidates by the README's own token-cost rule.

### 6.3 CLI (`src/cli/`)

Every PLAN Phase 3 item re-verified **still present** at current line numbers (nothing in #75/#79 touched them). New findings:

- **[M]** `translate forward`/`backward`/`status` default `-l` to `'zh-cn'` (`src/cli/index.ts:95,166,248`) and never read `target-language` from `.translate/config.yml`. Running `forward` on the Persian repo without `-l` bulk-overwrites OUTDATED files with prompts targeting Chinese and the zh-cn glossary. (FUTURE idea 8 is the fix; until then, at minimum error-if-ambiguous instead of silently defaulting.)
- **[M]** `forward-pr-creator.ts:192` — `git commit -m` sweeps *everything the user had staged* in the target repo into the resync commit and force-pushes it; `:205-208` ignores the checkout-back result, so a failed switch cascades the previous file's commit into every subsequent PR in bulk mode.
- **[M]** `forward --test` is worse than PLAN recorded: besides writing `[TEST RESYNC]` content over real targets and opening real PRs, it also **writes real `.translate/` state** (`forward.ts:229-246`), permanently masking the file as in-sync from both `status` and backward's skip predicate.
- **[M]** `headingmap` writes positionally-built maps even on `status === 'mismatch'` (`headingmap.ts:206-221`) — a mid-document insertion makes every subsequent mapping wrong, then poisons section matching downstream.
- **[M]** `backward` whole-file evaluation: a `max_tokens`-truncated JSON response falls through both parse strategies and returns **NO_BACKPORT / confidence 0 for every section** (`backward-evaluator.ts:459-514`) — truncation silently reports the file as *clean*. This is the concrete cost of the missing `stop_reason` guard.
- **[M]** `forward-triage` has no size guard (backward's triage has `SKIPPED_TOO_LARGE`; forward sends both full documents unconditionally → BadRequestError → file marked ERROR). And its keyword fallback lacks a negation guard for I18N_ONLY ("these are **not** i18n only differences" → skipped as in-sync) — the same defect class PLAN cites it as the *good* example for.
- **[M]** `review` sessions are unrecoverable: accept/reject decisions live only in memory; if `gh` fails at the end (auth, missing labels), the session's work is lost. Related: `forward`/`review` `gh` calls require labels (`action-translation-sync`, `resync`, `translate`) that nothing — including `setup` — creates; on fresh repos every PR/issue creation exits non-zero after the branch was already force-pushed.
- **[L]** `setup.ts:118-121` docsFolder regex lacks `/g` → `./lectures/` produces a dead `lectures//**/*.md` paths filter (generated sync workflow never triggers); `issue-generator.ts:43-46` splits repo names on the *first* dot (`lecture-python-advanced.myst.zh-cn` → label `translate:myst.zh-cn`); `status --write-state` records `source-sha: 'unknown'` for uncommitted files → flagged OUTDATED forever; branch-name sanitization collides (`intro/overview.md` vs `intro-overview.md` → same `resync/` branch, second force-push destroys the first).
- **Positive**: subprocess injection review clean — all `spawnSync`/`execFile` arg arrays, no shell interpolation, `--` used before paths in git-log; paths with spaces safe throughout. The action and CLI agree on the `.translate/` state schema — but only because the action imports the CLI's serializer (the inverted dependency, PLAN 6/R3).

### 6.4 Tests / CI / build / packaging

Covered in §3.3 and §5. Remaining specifics: `cli-smoke.test.ts` makes fresh-clone `npm test` fail (needs a build first — PLAN 5.5); `jest.config.js` `testMatch` would execute any future helper `.ts` under `__tests__/` as a suite; `deploy-docs.yml` never validates docs on PRs and doesn't pin `mystmd`.

### 6.5 Docs accuracy (user-facing impact ordered)

- **[H]** Rebase mode — a whole action mode, two releases old — is absent from `README.md:9` ("two modes"), all of `docs/user/` (zero grep hits), the architecture doc's modes table, and the FAQ. `examples/rebase-translations.yml` is the only documentation.
- **[H]** `docs/index.md:84-87` — the deployed landing page says **v0.8.0, 873 tests**. `docs/myst.yml` toc omits all six `user/tutorials/*.md` + `developer/legacy-tools.md`, so pages `index.md` links to **404 on the live site**.
- **[H]** `examples/README.md`: sync examples use `secrets.GITHUB_TOKEN` (cannot push cross-repo), `@v0.11` pins, pre-v0.6.3 labels, and a `ja` example that **throws at runtime** (`validateLanguageCode` — ja has no `LANGUAGE_CONFIGS` entry). This is the copy-paste surface for new adopters.
- **[H]** `docs/user/tutorials/add-language.md:389` marks the `LANGUAGE_CONFIGS` entry "(optional)" — it is mandatory (sync throws without it). Exactly the #68/#69 trap PLAN Phase 8 warns about.
- **[M]** `docs/user/action-reference.md:65` documents `target-language` as "required for review" — review mode never reads it (auto-detects from repo suffix). `cli-reference.md` is missing `--source-language`/`-j, --parallel` (backward, forward) and `--source-workflow` (setup). `language-config.md` lists one zh-cn rule (code has two) and doesn't mention `typography.ts`. `glossary.md` shows a phantom top-level `language` field and calls fr a pending draft (merged with native review 2026-07-14). `faq.md:15` omits fr. `testing.md` inventories 32 of 40 suites with several misplaced. `roadmap.md`'s top priority already shipped (the add-language tutorial) and it links a moved file.
- **[M]** `src/cli/README.md` is the most misleading file in the repo: documents 1 of 8 commands under the dead `resync` name, default model two releases stale, and a per-section-pair pipeline description that contradicts the shipped whole-file evaluator. PLAN 7 says retire it; do.
- **[M]** `.github/copilot-instructions.md:105` still says "All 1001 tests" (header says 1056) and its module map omits `models.ts`/`typography.ts`.
- **[L]** Test-count claims drift in five places. Recommendation: stop hand-maintaining exact counts everywhere except the release checklist; elsewhere say "1,000+".

### 6.6 Repo hygiene / GitHub state

- ~55 remote branches; only 3 back open PRs. ~47 are squash-merged/dead and prunable; 6 local branches likewise.
- Committed generated artifacts: `presentations/*.pdf`, built `.html`, `diagrams/workflow.png` (PLAN 7 org decision pending; content still carries the old project name = open issue #7).
- Open PRs: #78 (fr programming terms, needs native review), #71 (ml, draft), #69 (ja, 5 weeks quiet, still lacks its `LANGUAGE_CONFIGS` entry). Issues #74/#81/#82 are new since the last review and not yet in `.dev/`.
- `main` unprotected; no repo topics; description hardcodes "Claude Sonnet" (will date).

---

## 7. Recommendations

Ordered by leverage. R-numbers continue ARCHITECTURE.md's R1–R7 (all of which this review re-endorses; R1 gains fresh evidence from §3.1).

### 7.1 Ship a v0.16.1 patch this week (mostly PLAN Phase 1 + new criticals)

One shippable patch containing: typography definition-label mask + fr repo repair (§3.1) · move `v0` (or de-document it) (§3.2) · lint/format glob + one prettier pass + CI gates (§3.3) · LICENSE (§3.4) · `private: true` or `files` allowlist (§3.5) · `npm audit fix` (ws/lodash/js-yaml) · the five 3-line Phase 1.2 fixes (CRLF, pagination×4, resync fail-closed, glossary-undefined, `content[0]` guard) · per-site `stop_reason` guard (the pattern already exists in `scripts/glossary/translate-sample.mjs:110`; §6.3's "truncation reads as clean" finding shows why this is [H], not hygiene).

### 7.2 R8 — Structured outputs for every JSON-shaped response

Sonnet 5 supports `output_config.format` (JSON schema). Adopting it for the reviewer verdict and the CLI's triage/evaluation calls deletes three defect classes at once: multi-strategy JSON parsing, retry-on-parse-failure loops, and the NaN-score bug (schema-guaranteed numeric fields). This is cheaper and more permanent than validating parsed JSON by hand, and it supersedes several individual PLAN items.

### 7.3 R9 — Prompt caching (FUTURE 7, sharpened with current API facts)

The static prefix (rules + 357-term glossary ≈ 15K tokens) is resent at full price on every call. Restructure to a byte-stable system block with `cache_control: {type:'ephemeral'}`; section-based sync makes many calls per file inside the 5-minute TTL → reads at ~0.1×. Two implementation cautions: keep the prefix byte-identical (glossary serialization already is), and in concurrent fan-out let the first call start streaming before firing siblings (parallel cold writers all pay full price). Do it inside the Phase 6 shared client so it's one implementation. Combined with intro Sonnet 5 pricing this roughly halves marginal translation cost; the Batch API (50% off) is a further lever for `init` bulk seeds and glossary runs, which are latency-insensitive.

### 7.4 R10 — A deterministic model-swap eval (closes issue #82)

The v0.16.0 default-model change shipped unmeasured — and the repo already concluded deterministic checks beat an LLM judge. Concretely: fixed corpus (~5 lectures × zh-cn + fr), translate with candidate model via the existing `scripts/glossary/lib.mjs` harness, score with **deterministic** checks only: balanced fences / `$$` parity / heading counts / `(anchor)=` preservation (these are literally the Phase 2 `validateMyST` checks — build once, use twice), glossary-term adherence %, code-cell byte-fidelity, length-ratio bounds, fr typography compliance. JSON scorecard into `.dev/experiments/model-eval/`; gate `DEFAULT_CLAUDE_MODEL` bumps on no-regression. ~$1.50/run.

### 7.5 R11 — Make the release process mechanical

The v0 tag miss, the unticked-but-done PLAN boxes, five drifting test-count claims, and STATE.md going stale on release day are all the same failure: the release checklist lives in prose. Add `scripts/release.mjs` (or a checklist issue template) that: bumps versions, verifies CHANGELOG has today's date, rebuilds dist, moves `vX`/`vX.Y`/`v0` tags, opens the STATE.md/PLAN.md tick-boxes diff, and greps docs for stale count/version claims. Cheap, and it converts §4's process finding into a non-event.

### 7.6 R12 — One heading canonicalizer; one line classifier; one post-translation stage

Three structural fixes from the core review that each collapse a bug family:

- **`canonicalizeHeading()`** (strip `#`s + `stripMystRoles` + trim + Unicode NFC — NFC matters for fa diacritics), used at every heading-map **write and lookup** site. Fixes §6.1's role-asymmetry finding structurally instead of site-by-site; `updateHeadingMap` is now behaviorally `buildHeadingMap`-minus-warnings and should be deleted rather than fixed.
- **One fence-aware line classifier.** The tree now has *three* independent fence trackers (parser pre-title scan, `typography.ts`'s walker, doctor's regex). `typography.ts:80-147` already handles nested directives and `$$` math — exactly the machinery Phase 2's fence-aware parser and a real `validateMyST` need. Adopt it as the single classifier before Phase 2 adds a fourth.
- **A post-translation pipeline stage in `SyncOrchestrator`** (typography → structural lint → validation), so deterministic transforms run once for action sync, rebase, and CLI alike. This fixes the typography wiring gap (#81) *by construction* and prevents the next "fixed in one path, missed the others" drift — the pattern R3 names, which recurred within a week of the plan naming it.

Two sharpenings of existing recommendations: **R2** — sync already commits `.translate/state/*.yml` per file on the PR branch (`sync-orchestrator.ts:526-549`); rebase could read the file list and source SHAs from the *branch* (bot-controlled) today instead of the PR body (human-editable), converting most of the Phase 1.5 trust fix into a structural one — only `targetBaseSha` still needs a home. **R6** — a single Git Data API tree+commit per PR also eliminates the branch-name second-resolution collision, the per-file stale-SHA refetch in rebase, and makes rebase's reset+recommit atomic. And fail-closed content fetching (`fetchAllFileContents` returning `{files, errors}`, errors treated like processing failures) closes §6.1's silent-partial-sync hole with no happy-path change.

### 7.7 Endorsed as-is from the existing plan

Phase 2 (fence-aware parser + **round-trip invariant test**) remains the highest-leverage correctness work — §3.1 is the fourth production incident in its bug family. Phase 6's shared LLM client is the precondition for R8/R9 landing once instead of six times. The CLI's `-l zh-cn` default (§6.3) upgrades FUTURE idea 8 (config-driven defaults) from convenience to safety fix. Docs: the §6.5 [H] items are a half-day, one-PR fix; rebase-mode docs are the largest genuine content gap.

---

## 8. Questions for the maintainer

1. **`v0` tag**: move-on-release, or drop `@v0` from docs and standardize on exact pins? (Both defensible; the current split is not.)
2. **zh-cn/fa on v0.15.0 vs fr on v0.16.0** — deliberate staged rollout of the Sonnet 5 default, or drift? If staged, is there a planned promotion date (intro pricing ends 2026-08-31)?
3. **npm intent for the CLI**: is `translate` ever meant to be published? (`private: true` vs claiming `@quantecon/translate`.) The docs' `npx translate` currently cannot work for outside users either way.
4. **Node 24**: PLAN 5.8 bundles it with the `@actions/*` major bumps (both force a dist rebuild) — want that in the same patch as 7.1 or its own release?
5. **This file**: AGENTS.md says no standalone summary files — the 2026-07-05 review was distilled into `.dev/` and deleted. Same fate intended for this report once its items are ticked into PLAN.md?

---

## Appendix: verification notes

Every [H] finding was independently reproduced or double-checked rather than taken from a single reviewer pass: typography corruption reproduced against `dist/typography.js` and hex-confirmed in the production fr repo; the `v0` tag peeled via `git ls-remote` (annotated tag → commit `9e92030`) and the v0.7-era default model read from that commit's `action.yml`; production workflow pins fetched from the live `lecture-python-programming.myst` workflows; the lint glob expansion counted under `/bin/sh` (32) vs `find` (78); LICENSE absence confirmed via tracked files and the GitHub API; dist freshness confirmed by rebuild-and-diff (clean tree restored); model IDs/pricing/output caps checked against current Claude API reference documentation. Test/coverage/audit numbers are from local runs at `5fb9c40` on node 26.3.0 (CI numbers noted where they differ). The working tree was left clean.

# PLAN: Maintenance & Hardening

**Created**: 2026-07-05 (from the deep technical review of all source, tests, CI, docs, issues, and PRs)
**Baseline**: v0.15.0 on `main`; PR #71 (Malayalam) open as draft
**Predecessor**: the 2026-02→03 resync-CLI plan — complete; distilled into
[decisions/](decisions/), full text in git history (`dev-notes/PLAN.md`)

How to use this plan: work phases in order — each phase is independently shippable and ends
with a release or a verifiable checkpoint. Tick tasks as they land; when the whole plan
completes, distill outcomes into [decisions/](decisions/) and start the next plan fresh
(git keeps the history). Feature work lives in [FUTURE.md](FUTURE.md); design questions in
[ARCHITECTURE.md](ARCHITECTURE.md).

Severity tags: **[H]** produces wrong output or breaks a workflow, **[M]** wrong under
realistic conditions, **[L]** quality/robustness.

---

## Phase 1 — Patch release v0.15.1 (small, high-confidence fixes)

Everything here is a contained fix with an obvious correct behaviour. Ship as one patch release.

### 1.1 GitHub API pagination
- [x] **[H]** `runSync` truncates PRs with >30 changed files — add `octokit.paginate` to
      `pulls.listFiles` in `src/index.ts:573` (the rebase path at `src/index.ts:153` already
      does this correctly; copy that pattern)
- [x] **[H]** Same unpaginated `listFiles` in review mode: `src/reviewer.ts:448` and `src/reviewer.ts:368`
- [x] **[L]** `pulls.list` capped at 100 in rebase (`src/index.ts:159`) — paginate so sibling
      PRs beyond 100 can be rebased
- [x] **[L]** `issues.listComments` unpaginated in `postReviewComment` (`src/reviewer.ts:1028`) —
      with >30 comments the existing review comment isn't found and duplicates accumulate

### 1.2 Small correctness fixes (action)
- [x] **[H]** CRLF: `parseSourcePRNumber` requires `\n` (`src/reviewer.ts:340`) — GitHub
      normalizes edited PR bodies to `\r\n`, permanently breaking review mode for that PR.
      Use `\r?\n` (as `src/pr-creator.ts:417` already does)
- [ ] **[M]** `runRebase` posts "♻️ Automatically rebased" and counts success even when the
      early returns at `src/index.ts:375` and `src/index.ts:447` mean nothing was pushed —
      return a status and only comment/count on an actual push
- [x] **[M]** Glossary terms missing the target language render as `"term" → "undefined"` in
      prompts (`src/translator.ts:664`) — skip such terms (and log)
- [ ] **[L]** `\translate-resync zh` (unsupported code) proceeds with **all** languages
      (`src/inputs.ts:281`) — fail closed with an explanatory comment instead
- [ ] **[M]** Primary sync path uses `context.sha` (`src/index.ts:544`); for `pull_request:
      closed` events this can be a stale synthetic merge-ref SHA. Use `pr.merge_commit_sha`
      as the resync path already does (`src/index.ts:548-563`)
- [x] **[L]** Guard `response.content[0]` before reading `.text` (`src/translator.ts:279` et al.,
      `src/reviewer.ts:297`) — empty/refusal responses currently throw a bare `TypeError`

### 1.3 Truncation detection (minimal version)
- [x] **[H]** Check `response.stop_reason` after every Anthropic call and **fail the file** on
      `max_tokens` instead of committing truncated output. Sites: `src/translator.ts:279, 361,
      433, 512, 622`; `src/reviewer.ts:755, 863`; CLI: `src/cli/backward-evaluator.ts:594`,
      `src/cli/document-comparator.ts:246`, `src/cli/forward-triage.ts:237`.
      (The full shared-client refactor is Phase 6; this is the per-site guard.)

### 1.4 Dependencies & packaging
- [x] **[H]** `npm audit fix` — clears the two high-severity `ws` advisories (via `ink`, CLI-only)
- [ ] **[H]** Bump `@actions/core` (1.11 → 3.x) and `@actions/github` (6 → 9.x) and rebuild —
      the committed `dist-action/index.js` currently **ships a vulnerable `undici`**
- [ ] Bump `@anthropic-ai/sdk` (0.78 → current 0.110.x) and re-run the retry tests
- [x] Fix `package-lock.json` self-version still saying `0.8.0` (lines 3, 9)
- [x] Add an `engines` field to `package.json` (node >= 20 now; see Phase 5.6 for node24)
- [x] Fix stale `.gitignore:6` comment ("ncc CJS bundle" — the build is esbuild)

### 1.5 Rebase-mode input validation (security — pulled forward from Phase 4)
- [ ] **[H]** Harden rebase mode's handling of PR-embedded metadata: cross-check it against the
      workflow's own configuration and require the expected automation identity before acting.
      Specifics deliberately omitted here per the `.dev/` public-content rule. Land this before
      issue #66 documents the metadata as a public contract.

### 1.6 Release chores
- [x] Fix `CHANGELOG.md:10` date: `[0.15.0] - 2025-07-14` → `2026-04-14`
- [ ] Add `[Unreleased]` entries (Malayalam commit `d5b216e` shipped without one)
- [ ] Release v0.15.1, rebuild `dist-action/`, move the `v0` / `v0.15` tags

**Done when**: v0.15.1 tagged; `npm audit --omit=dev` reports 0 high/critical; a >30-file test
PR syncs completely.

---

## Phase 2 — Parser & validation correctness (v0.16)

The silent-corruption class. These interact, so they ship together with the round-trip test as
the gate. See ARCHITECTURE.md R1 for the longer-term parser direction (mystmd AST).

- [ ] **[H]** Make `parseSections` fence-aware (`src/parser.ts:64-118`): `##` lines inside
      ```` ``` ````/`{code-cell}` blocks are currently parsed as section headings — phantom
      diffs, code sent to Claude as prose, corrupted cells on reconstruction. Fence tracking
      already exists in the same file for pre-title scanning (`src/parser.ts:273-286`)
- [ ] **[H]** Issue **#65** — label-anchor ownership: `(label)=` immediately above `## Heading`
      is stored at the tail of the *previous* section (`src/parser.ts:113-117`), so anchors
      vanish when the previous section is deleted/skipped (broke the zh-cn build). Anchors must
      bind to the following heading and be preserved verbatim through translation
- [ ] **[M]** The anchor-adjacency fixup regex (`src/file-processor.ts:564`) doesn't match
      non-ASCII labels — fix alongside #65
- [ ] **[H]** Replace the no-op `validateMyST` (`src/parser.ts:223-233` — `parseSections` never
      throws, so the gates at `src/sync-orchestrator.ts:340, 410` can never fire) with real
      structural checks: balanced fences, `$$` pairs, `{exercise-start}`/`{exercise-end}`
      pairing, heading-count sanity, anchor preservation. (FUTURE.md "MyST structural lint" is
      the fuller version; implement the checks behind one function so it can swap in)
- [ ] **[H]** Add the **round-trip invariant test**: for every fixture,
      `reconstruct(parse(doc))` must equal `doc` byte-for-byte for unchanged documents
- [ ] **[M]** `mergeSubsectionsWithTargetTranslations` keeps the *old* target content for every
      positional match when Claude's structure mismatches, discarding the fresh translations
      from that same call (`src/file-processor.ts:352-399`) — and the run reports success
- [ ] **[M]** Updated sections always get the *old* target heading re-attached
      (`src/file-processor.ts:319-326`), so reworded English headings never propagate — translate
      and use the new heading (heading-map keyed)
- [ ] **[M]** `updateHeadingMap` doesn't preserve existing mappings (contradicting its docstring)
      and its deletion pass is dead code (`src/heading-map.ts:82-166`); the unused `titleHeading`
      param should go too
- [ ] **[M]** Position fallback mis-fires when one section is added *and* another deleted
      (counts equal but positions shifted) — `src/file-processor.ts:193, 254, 742-749`
- [ ] **[M]** Duplicate heading slugs (two `## Exercises`) corrupt matching in three places:
      change attachment (`src/file-processor.ts:184`), deletion detection
      (`src/diff-detector.ts:123, 140-148`), and the rebase cache keys
      (`src/file-processor.ts:90-91`) — disambiguate IDs (e.g. suffix by occurrence index)
- [ ] **[M]** `${sha}^` old-content fetch is wrong for **rebase-merged** multi-commit PRs
      (`src/index.ts:776`, `src/index.ts:314`) — earlier commits' changes are silently treated
      as unchanged. Fetch the PR's base SHA instead, or detect and reject rebase-merge events
- [ ] **[L]** `doctor` counts `^## ` inside code fences (`src/cli/commands/doctor.ts:173-177`) —
      reuse the fence-aware parser instead of a private regex
- [ ] **[L]** Heading replacement uses `sourceSub.heading.replace(/^(#+\s+).*/,` with an
      interpolated string (`src/file-processor.ts:387`) — headings containing `$1`/`$&` corrupt;
      use a function replacer
- [ ] **[L]** Prompt rule-numbering collisions when custom instructions are appended
      (`src/translator.ts:395, 408-412, 459, 472-480`) — number rules programmatically.
      *2026-07-24 (#163): those line refs are stale, and the live defect was the hand-counted
      `additionalRules` offsets, fixed with a rendered-prompt drift test
      (`translator-prompts.test.ts`); what remains here is only the programmatic-numbering
      refactor, and custom instructions are appended unnumbered today.*

**Done when**: round-trip test green over all fixtures incl. new code-cell-with-`##` and
anchor-before-heading fixtures; #65 closed; a deliberately truncated/malformed model response
fails the file loudly.

---

## Phase 3 — CLI state & lifecycle correctness

The `.translate/` state model needs one schema addition (target SHA) plus predicate fixes.
See ARCHITECTURE.md R4 for the design rationale.

- [ ] **[schema]** Record `target-sha` (or a content hash) alongside `source-sha` in
      `.translate/state/<file>.yml`, written at the same moments state is written today
- [ ] **[H]** `backward` bulk skips files whose *source* is unchanged
      (`src/cli/commands/backward.ts:469-483` via `isSourceChanged`,
      `src/cli/translate-state.ts:232-247`) — but backward hunts for *target-side* edits, so it
      skips exactly the files it exists to analyze. Skip on "target unchanged since sync" instead
- [ ] **[H]** `forward --github` writes new state into the working tree the moment the PR is
      *opened* (`src/cli/commands/forward.ts:228-246`), masking the file as in-sync even if the
      PR is closed unmerged, and leaving the repo dirty. Commit state **on the PR branch** so it
      lands iff the PR merges
- [ ] **[H]** `forward` bulk filters on primary status only (`src/cli/commands/forward.ts:286-289`);
      a file that is OUTDATED **and** MISSING_HEADINGMAP is never resynced (priority ordering at
      `src/cli/commands/status.ts:256-257`). Filter on `e.flags.includes('OUTDATED')`
- [ ] **[M]** Auth failures poison `--resume`: errored files enter the done-set
      (`src/cli/commands/backward.ts:494-515`), so an expired `ANTHROPIC_API_KEY` marks every
      file permanently done. Abort the run on non-retryable auth errors; retry errored files on
      resume; validate checkpoints with the already-written-but-unused `ProgressCheckpointSchema`
      (`src/cli/schema.ts:192-261`) instead of raw `JSON.parse` (`backward.ts:377-387`)
- [ ] **[M]** `backward` bulk analyzes the source∪target **union** (`backward.ts:417-428`), so
      every untranslated file errors ("TARGET file not found") — use the intersection
- [ ] **[M]** `TARGET_HAS_ADDITIONS` files are destructively resynced after only a console
      warning (`src/cli/commands/forward.ts:127-135`; the RESYNC prompt orders removal of
      non-source content, `src/translator.ts:575`) and then reported as "skipped (i18n only)"
      (`forward.ts:359-384`). Gate behind `--force` in bulk mode and report honestly
- [ ] **[M]** `forward --test` mutates real repos — writes `[TEST RESYNC]` content over the
      target (`forward.ts:142-146, 223`) and in `--github` mode pushes and opens real PRs.
      Test mode must be side-effect-free
- [ ] **[M]** `--json` + `--resume` loses completed reports from the aggregate (sidecar path
      mismatch, `backward.ts:339-342` vs `521-532, 727-733`)
- [ ] **[M]** `setup` emits broken templates: hardcoded action version `'0.9.0'`
      (`src/cli/commands/setup.ts:304, 351` — use `getToolVersion()`), TOC path in the workflow
      `paths` filter is repo-root `_toc.yml` instead of `<docsFolder>/_toc.yml` (`setup.ts:139`),
      and no `permissions:` block in either generated workflow
- [ ] **[M]** Triage keyword fallback classifies "not in sync" as IN_SYNC
      (`src/cli/document-comparator.ts:151-154`) — guard the negation like
      `src/cli/forward-triage.ts:139` does
- [ ] **[M]** Cross-repo commit timeline sorted lexically on local-time `%ai` strings
      (`src/cli/git-metadata.ts:174-177`) — wrong by up to a day across timezones, and this
      ordering exists to prevent LLM directional errors. Sort on epoch
- [ ] **[M]** `init -f cobweb.md` can select `extended_cobweb.md` (`src/cli/commands/init.ts:433-445`) —
      exact match must win before substring match
- [ ] **[L]** Non-recursive discovery (`src/cli/commands/status.ts:103-112`) makes nested
      lectures invisible to status/backward/forward/headingmap/doctor, though state and init
      support nesting — recurse
- [ ] **[L]** Non-atomic state writes (`src/cli/translate-state.ts:118-125, 173-179`) — write
      temp + rename; add a `doctor` check for corrupt state YAML (readers currently coerce it
      silently to "no state", `translate-state.ts:164-166`)
- [ ] **[L]** Glossary loading is cwd-dependent (`forward.ts:399-418`, `init.ts:72-92`) — resolve
      relative to the tool install/repo and add `--glossary` to `forward`; dedupe the two loaders
- [ ] **[L]** `status --write-state` overwrites existing `source-language` config with the CLI
      default (`status.ts:350-355`) — status should use `resolveSourceLanguage` like backward/forward
- [ ] **[L]** `-f ../../x.md` path traversal writes state outside the repo
      (`translate-state.ts:136-138`) — apply init's guards (`init.ts:269-272`) everywhere
- [ ] **[L]** Validate `--write-state`/`--check-sync` incompatibility before the repo scan
      (`status.ts:312-318`), not after

**Done when**: a bootstrapped repo with a hand-edited target file is *found* by `backward`;
closing a forward PR unmerged leaves status reporting OUTDATED; `forward --test` leaves both
repos byte-identical.

---

## Phase 4 — Security & robustness (action)

- [ ] **[M]** Refresh (or re-embed) PR-body metadata after a rebase rewrites the branch —
      `targetBaseSha` goes stale after the first rebase and degrades cache decisions
- [ ] **[M]** `fetchFileContent` silently returns `""` for files >1 MB (contents API returns
      `encoding: "none"`; `'content' in data` is still true, `src/index.ts:743`) — detect and
      error (or fetch via blob API)
- [ ] **[M]** `toc-file` input is dead: documented (`action.yml:45-48`), parsed
      (`src/inputs.ts:61`), but `classifyChangedFiles` hardcodes `_toc.yml`
      (`src/sync-orchestrator.ts:183-206`). Wire it — this also matters for the mystmd migration
      (ARCHITECTURE.md Q2)
- [ ] **[M]** Review mode concatenates all files into one blob and pairs sections positionally
      across it (`src/reviewer.ts:528-573`, `:214-235`) — any per-file section-count difference
      (which sync *deliberately produces* via skipped sections) misaligns everything after it.
      Evaluate per file
- [ ] **[M]** Review JSON: raise/handle the 1500-token cap (`src/reviewer.ts:755, 863` —
      truncated JSON → 3 identical retries → review fails) and validate numeric fields
      (`reviewer.ts:756-761` — missing fields yield `NaN/10` scores and a spurious FAIL)
- [ ] **[L]** `VALID_MODEL_PATTERNS` is stale (`src/inputs.ts:9-20`) — every newer valid model
      ID warns; either validate against the Models API or drop the check (interacts with
      FUTURE.md "Per-language model configuration")
- [ ] **[L]** `checkDocumentSize` hardcodes 32768 as "API maximum" (`src/translator.ts:70-85,
      501, 609`) and the resync variant passes source+target combined length (`:604`), rejecting
      documents at ~half the real threshold — recompute against actual model limits
- [ ] **[L]** Language-code case drift: `validateLanguageCode` lowercases but glossary filename
      and term lookup use the raw code (`src/language-config.ts:126`,
      `src/sync-orchestrator.ts:112`, `src/translator.ts:666`) — normalize once at input parsing
- [ ] **[L]** Rebase force-push races: stale blob SHA after `git.updateRef` (`src/index.ts:464-473`)
      → unretried 409; two near-simultaneous merges rebase the same branch concurrently. Add
      retry-on-409 and document the `concurrency` group as required in the workflow template

**Done when**: review mode scores a 3-file PR with different per-file section counts correctly;
oversized files error instead of reading as empty.

---

## Phase 5 — Test debt & CI

- [ ] **[H]** Delete or rewrite `src/__tests__/translator.test.ts` — ~30 tests never import
      `../translator` (they assert on locally-declared literals, e.g. `expect(true).toBe(true)`
      at lines 46/58, re-derived expectations at 276–305). Replace with real tests of prompt
      assembly, marker handling, and size limits, following the excellent
      `translator-retry.test.ts` pattern
- [ ] Add tests for `src/index.ts` (currently **0% of 1,095 lines**): mode dispatch, event
      validation, `runRebase`/`rebaseSinglePR` (incl. the no-op early-return paths),
      `fetchAllFileContents`, failure-issue creation — inject a fake octokit (the CLI's
      `GhRunner`/`GitRunner` fakes show the pattern, `src/cli/__tests__/forward-pr-creator.test.ts:36-41`)
- [ ] Add tests for the `TranslationReviewer` class (`src/reviewer.ts:255-1061`, 34% coverage) —
      verdict computation, NaN handling, comment generation
- [ ] Add octokit-fake tests for `createTranslationPR` (`src/pr-creator.ts:90`)
- [ ] Fix fresh-clone `npm test` (build-dependent `cli-smoke.test.ts:21-27`) — chain a build or
      skip-with-notice
- [ ] Make the 6 fixture-gated skips visible (`schema.test.ts:463-482`, `review.test.ts:314-333`
      silently skip in CI) — commit minimal fixtures or fail loudly when fixtures are expected
- [ ] CI additions (`.github/workflows/ci.yml`): `prettier --check`, coverage threshold
      (statements ≥ 66% to start, ratcheting), `npm audit --omit=dev` gate
- [ ] **node20 → node24** in one change: `action.yml:92` (`using`), `ci.yml:21`,
      `build-action.mjs:23` (esbuild target), `@types/node`, `engines` — Node 20 passed EOL
      April 2026
- [ ] Carried from the previous plan (still unchecked there): backward+review workflow test on
      `lecture-python-intro` ↔ `lecture-intro.zh-cn`; review → Issue creation end-to-end
      (non-dry-run); Stage-1 triage recall validation (≥95%)

**Done when**: coverage report runs in CI with a threshold; test count reflects only real tests;
action runs on node24.

---

## Phase 6 — Consolidation refactors (kill the duplication that keeps re-creating bugs)

Evidence this matters: CRLF was fixed in `pr-creator` but not `reviewer`; pagination in rebase
but not sync; `overloaded` retry in the translator but not the reviewer or any CLI copy.

- [ ] **One shared Claude call helper** (retry + backoff + `retry-after` + `stop_reason` check +
      JSON extraction): replaces `translator.callWithRetry` (`src/translator.ts:153-190`),
      `reviewer.callWithRetry` (`src/reviewer.ts:281-330`), and the three CLI copies
      (`document-comparator.ts:241-286`, `backward-evaluator.ts:277-315, 589-627`,
      `forward-triage.ts:232-277`).
      *2026-07-24 (#164): the retry PREDICATE is now shared (`isRetryableAnthropicError`
      in models.ts, overloaded branch included at all six sites) and the SDK stacking is
      fixed (`maxRetries: 0` on all six clients — the budget is RETRY_CONFIG's 3, not 9).
      What remains here is unifying the loop/backoff/JSON-extraction machinery itself.*
      (worst case today: 9 attempts)
- [ ] **Move `.translate/` state out of `src/cli/`** into core — the action imports backwards
      from the CLI today (`src/index.ts:8`, `src/sync-orchestrator.ts:20-21`) (ARCHITECTURE.md R3)
- [ ] **One section parser**: `reviewer.ts` ships its own `extractPreamble`/`extractSections`/
      `headingToId` (`src/reviewer.ts:87-152`) with different rules from `MystParser` — delete it
- [ ] Dedupe: glossary loaders (action `src/index.ts:61-78` vs `src/sync-orchestrator.ts:105-139`;
      CLI `forward.ts` vs `init.ts`), `GhRunner`/`GitRunner` (3 copies with incompatible
      signatures), the docs-folder normalization blocks (`src/inputs.ts:57, 115, 146`), the
      `languageNames` map (`src/reviewer.ts:650-659` vs `language-config.ts`), and the 3 copied
      batch-concurrency loops (`backward.ts:611`, `forward.ts:314`, `init.ts:582` — replace the
      head-of-line-blocking batcher with a worker pool)
- [ ] Honor the `Logger` abstraction (`src/sync-orchestrator.ts:31-35`) — `FileProcessor`,
      `DiffDetector`, `TranslationService` import `@actions/core` directly; `heading-map.ts`
      uses bare `console`
- [ ] Type octokit (`ReturnType<typeof github.getOctokit>` — already used at `src/reviewer.ts:257`)
      everywhere `octokit: any` appears
- [ ] Extract constants: `max_tokens` values, branch prefix `'translation-sync-'` (4 literals),
      label `'test-translation'`, token-estimation factors
- [ ] Dead-code sweep: `evaluateSection` path (`backward-evaluator.ts:34-315`),
      `computeSummaryStats`, `ResyncSectionResult` plumbing (`src/cli/types.ts:226-242`),
      `matchSections`' ignored `_headingMap` param, `SectionChange.position`,
      `MystParser.findSectionByPosition`, `if (!mode)` after required-input read
      (`src/inputs.ts:40-43`), diff-detector `_preamble` change (never consumed),
      the dead Ctrl+C handler (`src/cli/components/ReviewSession.tsx:69-74`)
- [ ] Decide `localization-rules.ts`: it's never invoked from the action path (translations get
      no code-cell localization while prompts insist it be *preserved*) — wire it in or document
      the asymmetry
- [ ] Consolidate the two version mechanisms (`getToolVersion` walks vs `createRequire`,
      `src/cli/translate-state.ts:37-81` vs `src/cli/index.ts:30-32`) into one build-time constant
- [ ] Break up `processSectionBased` (~420 lines, `src/file-processor.ts:53-473`) — extract the
      nested closures so the Phase 2 merge fixes are testable
- [ ] Simplify `parseTranslatedSubsections` wrapper-line arithmetic (`src/file-processor.ts:630-676`)
      by parsing the raw fragment directly

**Done when**: one retry implementation, one section parser, one state module; grep for
`new Anthropic(` finds one construction site.

---

## Phase 7 — Docs & repo currency

- [x] **[H]** `examples/README.md`: both sync examples use `secrets.GITHUB_TOKEN`, which cannot
      push to a different repo — switch to the PAT pattern (README/quickstart are already
      correct); also fix stale `@v0.11` pins, pre-v0.6.3 label defaults, the old project name,
      and the unconfigured `ja` example
- [x] Add the six tutorials (plus `developer/legacy-tools.md`) to `docs/myst.yml` toc — they 404
      on the live site today while `docs/index.md:63-70` links them
- [x] Refresh `docs/index.md:84-87` (says v0.8.0, 873 tests; contradicts README)
- [ ] **Document rebase mode** in `docs/user/action-reference.md` (inputs, triggers,
      `translation-sync-` branch convention, cache behaviour, failure comments) — v0.15.0's
      headline feature is absent from the docs site; add rebase troubleshooting to the FAQ
- [ ] Issue **#66**: add `schemaVersion: 1` to the metadata interface (`src/pr-creator.ts:44-54`)
      and write the contract docs page (see FUTURE.md idea 3 for the full scope; do after
      Phase 4's trust fix)
- [ ] `glossary/README.md`: list `fa.json` and `ml.json`, document the draft-glossary
      (`0.1.0-draft`) + native-reviewer workflow, and fix the "translate all terms" recipe that
      contradicts the ml keep-English policy; update `docs/user/glossary.md` (phantom top-level
      `language` field at line 37; omits ml), `docs/user/language-config.md`, FAQ
- [ ] Retire `src/cli/README.md` (documents the old `resync` binary, 1 of 8 commands) — replace
      with a pointer to `docs/user/cli-reference.md`
- [ ] `.github/copilot-instructions.md`: reconcile 1005 vs "1001 tests", add ml
- [ ] Fix `tool-test-action-on-github/test-action-on-github.sh:25` header ("9 PRs" → 26)
- [ ] Document `.translate/` state files appearing in translation PRs (action side) in
      `docs/user/action-reference.md`
- [ ] Organization decisions (each small, do deliberately):
  - [ ] `experiments/` → `.dev/experiments/` (single historical experiment write-up)
  - [ ] `docs/projects/` (internal RA planning, excluded from the site toc) → `.dev/projects/`
        or add to the toc deliberately
  - [ ] `presentations/`: stop committing generated artifacts (`.pdf`, built `.html`) or archive
        the directory; content is stale (issue #7 — old project name)
  - [ ] Normalize version-pin style across docs (`@v0` vs `@v0.15` vs `@v0.15.0`)

**Done when**: the deployed docs site has no broken toc links, documents all three modes, and a
new-language adopter can go from zero to a working target repo following only published docs.

---

## Phase 8 — Issue-tracker gardening & ops

- [ ] Close **#4** (all six findings fixed in v0.6.1; residual tracked in QuantEcon/meta#268)
- [ ] Close **#6** (implemented + tested; point to #65 for the translator-side remainder)
- [ ] Close **#48** (all four referenced PRs closed unmerged; superseded by #63/#64)
- [ ] Close **#1** (decision "accept, monitor" — recorded in
      decisions/D-2025-10-01-accept-llm-translation-improvements.md; close with a pointer)
- [ ] Close **#3** (superseded by #51/#52 `translation:` frontmatter + `.translate/`; fold any
      residue into #66)
- [ ] Close or retitle **#2** to the narrow "cross-model (GPT) reviewer" remainder
      (FUTURE.md idea 9)
- [ ] Finish **#53** — legacy `heading-map:` fallback removal (`src/heading-map.ts:41`); the
      self-imposed v0.15.0 deadline has passed and target repos are migrated
- [ ] **#61** — create the `quantecon-services` PAT, grant repo access, rotate secrets in the
      ~6 workflow repos (pure ops; recent translation PRs still author as `mmcky`)
- [ ] **#7** — resolve alongside the `presentations/` decision in Phase 7
- [ ] For PRs **#68** (fr) / **#69** (ja): before merge, add the missing `LANGUAGE_CONFIGS`
      entries (Copilot's catch — a glossary alone does not enable a language), resolve the
      flagged term-choice judgment calls with native speakers, rebase whichever lands second

**Done when**: open-issue list contains only live work; translation PRs author as
`quantecon-services`.

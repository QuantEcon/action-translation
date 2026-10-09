# Whole-codebase review — 2026-10-05 (validated 2026-10-06)

**Baseline:** `main` @ `415cf87` (v0.29.3). **Project it produced:** #349. **Follow-up:**
[`2026-10-06-review-followup.md`](2026-10-06-review-followup.md), which covers what was filed or
commented and the destination of each finding.

## Summary

The engine is in good operational health. 1,590 tests pass, the lint, typecheck and bundle-drift
gates are clean, and its fail-closed conventions and decision records are unusually disciplined.

The live risk sits on paths outside the tested core, and each one turns a failure into
success-shaped wrong output — the class #257 names:

- `translate forward` has sent no glossary terms or language rules since 2026-03-19.
- Rebase writes a PR branch file by file, so it can auto-close the PR or leave it half-written.
- GitHub reads in `src/index.ts` (0% coverage) treat a transient error as "file absent".

The process is mature; the code is uneven. After validation, only two findings warrant a work item
of their own (#349). The rest go to the issues that already own their class.

## Method

1. **Audit.** Five parallel audits, one per area: Action entry and orchestration, the deterministic
   document pipeline, the LLM layer, the CLI, and tests/CI/build/dependencies. Headline claims
   were reproduced against `dist/`.
2. **Cross-check.** Every finding was checked against all open and closed issues, open and recent
   PRs, and `.qe/dev/`. Issue bodies and comments were both read, because several bodies are
   stale.
3. **Validation.** An independent agent re-verified each finding at HEAD, reproducing it against
   `dist/` where that was cheap. It checked the finding against the decision records (especially
   `D-2026-07-24`) and rated it against this deployment's quality bar. Each CORE or FOLD
   candidate was then challenged by two skeptics, one asking "is it worth doing?" and one asking
   "is it correct?". A tie-breaker settled splits.
4. **Design.** Three independent designs were judged, synthesised and audited against QEP-2, QEP-6
   and QEP-7. See the follow-up log.

**The quality bar.** Each finding gets one of four tiers:

| Tier | Meaning |
|---|---|
| **CORE** | Real at HEAD, with material harm in the deployed editions, and a bounded fix. Material harm means silent content loss, wrong output to readers, a policy silently not applied, paid work wasted at scale, or a gate blind to a defect class we ship. |
| **FOLD** | Real, but belongs inside an existing issue or a CORE item. |
| **DEFER** | Real but low value now: latent, dormant, cosmetic, or hygiene with no defect behind it. |
| **REJECT** | Not worth doing as stated. |

## Measured baseline (2026-10-05, `415cf87`)

| Check | Result |
|---|---|
| Tests | 67 suites, 1,590 passed, 0 failed, 0 skipped |
| Coverage | 78.7% statements, 71.2% branches. There is no threshold and CI does not run coverage. `src/index.ts` is at 0%: sync, rebase, resync and failure issues |
| Lint / typecheck | Clean at `--max-warnings 0`; `tsc --noEmit` clean |
| `dist-action/` | Rebuild is byte-identical |
| `npm audit --omit=dev` | 2 high (`js-yaml` 4.3.0, `undici` 6.27.0), both bundled and both fixable in range. The full tree has 43, of which 41 are dev-only |

## What the codebase does well

1. **Fail-closed boundaries where they were designed in:**
   - the verdict block resists forgery: it takes only the last block, escapes `-->`, uses
     `=== true` diff booleans and gates on provenance;
   - structural parity runs the same walker on both sides;
   - every call site refuses `max_tokens` truncation;
   - bibliography writes are append-only.
2. **Process hygiene:**
   - child processes are argv-only, with no shell anywhere;
   - PR and issue bodies go through stdin;
   - no workflow template puts `${{ github.event.* }}` free text into a `run:` step;
   - the resync trust gate is enforced in two places, and a test keeps them in step;
   - the bundle is reproducible.
3. **Single owners for cross-repository contracts**, each with a structural test:
   `branch-naming.ts`, `contracts.ts` and `models.ts`. Decision records also capture what *not* to
   do (`D-2026-07-24`), so a review like this one does not re-propose wrong fixes.

## Results at a glance

52 findings are recorded here.

| Final tier | Count |
|---|---|
| CORE | 2 |
| FOLD | 25 |
| DEFER | 24 |
| REJECT | 1 |

| Existing coverage before this review | Count |
|---|---|
| New: no issue, PR or note | 30 |
| Known only in `.qe/dev/` notes | 8 |
| Partly filed | 9 |
| Filed and open | 4 |
| Filed in an issue closed without the fix | 1 |
| Already fixed, or in an open PR | 0 |

**What validation changed against the first pass:**

- **Upgraded.**
  - **R9, French typography:** it is *live*. The fr `pandas` lecture's indicator table is
    published as a paragraph of literal pipes.
  - **R5, per-file branch writes:** there are four production instances of a rebase auto-closing
    a sync PR (#280).
- **Downgraded to FOLD**, because an existing issue already owns the fix:
  - R2: rebase of `resync/*` PRs belongs to #169's `metadata.mode` dispatch.
  - R3 and R6: GitHub-read error handling belongs to #169 slice 2. Some sites are already
    fail-closed, and the live gaps are narrower than the first pass reported.
  - R11: heading-ID whitespace goes to #90. There has been no whitespace-only heading edit since
    sync went live.
  - R24: the `forward --github` re-run guard goes to #177's trigger. There are no open
    `resync/*` PRs, and no human commits on a resync branch have ever been found.
- **Downgraded to DEFER.**
  - Latent, with no instance in the 240 source lectures and the deployed targets: R8 (duplicate
    headings), R33 (BOM/CRLF), R34 (multi-line `{cite}`) and R52 (rebase-merge `${sha}^`, since
    every one of 585 merges into the source repositories was a squash). Both fixes the first pass
    proposed for R52 would have made things worse.
  - Shadow-only or advisory today: R15 (reviewer prompt boundary, a precondition for #103's
    `active` mode), R16 and R18.
- **Rejected.** R40, the tooling and SDK upgrade: the SDK half is already a step in #342.

## Recommendation

1. **#348 before the next `translate forward` run.** It is a small change that takes effect on
   merge.
2. **#280's single-step rebase write**, released and then rolled out with `queue: max`.

Then pick up the evidence posted on #169, #90 and #325 as those issues are worked; the #325
widening fits the fr release task #346.

## Findings

Severity and tier are the validated values. "Existing coverage" is the state before this review.

| # | Finding | Area | Where | Severity | Tier | Existing coverage |
|---|---|---|---|---|---|---|
| R1 | translate forward resyncs with no glossary and no language rules (language label passed where a code is expected) | CLI | `src/cli/commands/forward.ts`, `src/translator.ts` | High | CORE | New |
| R2 | Rebase ignores metadata.mode: resync/* whole-document PRs are re-run through the section-diff pipeline | Rebase mode | `src/index.ts`, `src/cli/forward-pr-creator.ts`, `forward.ts` | Medium | FOLD | Filed (open) (#169) |
| R3 | Rebase silently drops a file whose source fetch fails, bypassing the throw-before-reset guard | Rebase mode | `src/index.ts` | Medium | FOLD | Filed (open) (#90, PR #193, #169) |
| R4 | Rebase fetches a renamed file's old content from the new path | Rebase mode | `src/index.ts` | Low | FOLD | Filed (open) (#169) |
| R5 | Branch writes are non-atomic: rebase resets to main then commits per file; sync PR creation commits per file | Rebase mode | `src/index.ts`, `src/pr-creator.ts` | High | CORE | Partly filed (#280, #256, #259) |
| R6 | GitHub reads treat every error as 'file not found'; no Octokit retry/throttling | GitHub I/O & triggers | `src/index.ts`, `src/reviewer.ts` | Medium | FOLD | Partly filed (#169, PR #291) |
| R7 | Critical-path tests prove less than the count suggests | Tests, CI & deps | `src/index.ts`, `src/__tests__/translator.test.ts`, `src/__tests__/file-processor.test.ts` | Medium | FOLD | Partly filed (#169, PR #278, #172) |
| R8 | Section matcher returns the first exact/ID match: duplicate or co-translated headings overwrite each other silently | Document pipeline | `src/file-processor.ts` | Low | DEFER | Notes only |
| R9 | fr typography inserts U+00A0 into jupytext `+++ {json}` metadata and table delimiter rows | Document pipeline | `src/typography.ts`, `src/file-processor.ts` | Medium | FOLD | New |
| R10 | Verbatim-directive fence walker misses plain-language fences, so the ml keep-English exercise policy silently stops applying | Document pipeline | `src/verbatim-directives.ts`, `typography.ts` | Medium | FOLD | New |
| R11 | Section IDs are derived from raw heading text: adding a role or trimming whitespace re-translates the section | Document pipeline | `src/parser.ts`, `src/diff-detector.ts` | Medium | FOLD | New |
| R12 | Translator accepts any stop_reason except max_tokens (a refusal with partial text is committed as success) | LLM layer | `src/translator.ts` | Medium | FOLD | Filed (open) (#342, #334) |
| R13 | Retry loops ignore retry-after, have no jitter, and give up after ~3s | LLM layer | `src/translator.ts`, `src/reviewer.ts`, `src/cli/forward-triage.ts` | Low | FOLD | Notes only |
| R14 | Malformed model output defaults to a passing value in three parsers | LLM layer | `src/reviewer.ts`, `src/cli/backward-evaluator.ts`, `src/cli/forward-triage.ts` | Low | DEFER | Partly filed (#165, #173) |
| R15 | Reviewer prompt boundary is weak (```markdown fences closed by the first code-cell; no system prompt) — must close before auto-merge-mode active | LLM layer | `src/reviewer.ts` | Low | DEFER | New |
| R16 | Review mode grades against the glossary from the PR's own checkout | LLM layer | `src/action/review.ts`, `examples/review-translations.yml` | Low | DEFER | New |
| R17 | Reviewer: a failed source fetch for one file is not gated | GitHub I/O & triggers | `src/reviewer.ts` | Medium | FOLD | Filed (closed, not fixed) (#198, #163, PR #188) |
| R18 | Source PR title is copied raw into the target PR title and body | GitHub I/O & triggers | `src/pr-creator.ts` | Low | DEFER | New |
| R19 | `\translate-resync <unknown-lang>` widens to all languages instead of failing closed | GitHub I/O & triggers | `src/inputs.ts` | Low | DEFER | Notes only (#94) |
| R20 | User-facing recovery text says `/translate-resync` (wrong slash); rebase comment points resync PRs at a source PR they don't have | GitHub I/O & triggers | `src/index.ts`, `src/pr-creator.ts`, `src/inputs.ts` | Low | FOLD | New |
| R21 | A merged source PR whose pull_request run receives no secrets never syncs and leaves no artefact (second mechanism for #282) | GitHub I/O & triggers | `src/cli/commands/setup.ts`, `src/inputs.ts` | Low | DEFER | New |
| R22 | Rebase concurrency group can drop intermediate merges' rebases | Rebase mode | `examples/rebase-translations.yml`, `src/index.ts` | Medium | FOLD | New |
| R23 | `translate setup` scaffolds a root `_toc.yml` path filter but the action classifies only `<docs>/_toc.yml` | GitHub I/O & triggers | `src/cli/commands/setup.ts`, `src/sync-orchestrator.ts`, `quickstart.md` | Low | FOLD | Notes only |
| R24 | Re-running `forward --github` force-pushes over open resync PRs | CLI | `src/cli/forward-pr-creator.ts` | Medium | FOLD | New |
| R25 | `gitPrepareAndPush` assumes a clean default branch (detached HEAD stacks PRs; feature-branch commits leak; dirty edits lost) | CLI | `src/cli/forward-pr-creator.ts` | Low | DEFER | New |
| R26 | `status --write-state` safety check compares dates at day granularity | CLI | `src/cli/commands/status.ts` | Medium | FOLD | New |
| R27 | `status --write-state` writes commander defaults (zh-cn, lectures, en) over an existing config | CLI | `src/cli/index.ts`, `src/cli/translate-state.ts` | Low | FOLD | Partly filed (#175, its F11 item) |
| R28 | A typo in `init --resume-from` silently restarts the whole edition | CLI | `src/cli/commands/init.ts` | Low | FOLD | New |
| R29 | Production dependency advisories (js-yaml, undici) and no automation to catch them | Tests, CI & deps | `package-lock.json`, `.github/dependabot.yml` | Low | FOLD | Partly filed (#177) |
| R30 | CI/docs workflows: tag-pinned and stale actions; deploy-docs on Node 20 with unpinned mystmd; no PR docs build | Tests, CI & deps | `.github/workflows/ci.yml`, `.github/workflows/deploy-docs.yml` | Low | FOLD | Partly filed (#177) |
| R31 | Localization rule lookup reaches Object.prototype (`--localize constructor` crashes) | LLM layer | `src/localization-rules.ts` | Low | DEFER | New |
| R32 | `$` patterns in String.replace with model output corrupt headings | Document pipeline | `src/file-processor.ts` | Low | FOLD | Notes only |
| R33 | No BOM/CRLF normalisation at ingress | Document pipeline | `src/heading-map.ts`, `src/structural-parity.ts` | Low | DEFER | New |
| R34 | Citation scan misses `{cite}` roles that wrap across lines | Document pipeline | `src/bibliography.ts` | Low | DEFER | New |
| R35 | Quadratic bibliography parsing/appending | Document pipeline | `src/bibliography.ts` | Low | DEFER | New |
| R36 | CLI state writes swallow errors | CLI | `src/cli/commands/forward.ts`, `init.ts`, `status.ts` | Low | DEFER | New |
| R37 | `setup` ignores git add/commit status and prints `❌ undefined` | CLI | `src/cli/commands/setup.ts`, `src/cli/index.ts` | Low | FOLD | New |
| R38 | `docs-folder: '.'` matches nested .md (incl. .github/); AGENTS.md documents a root-only filter that does not exist | GitHub I/O & triggers | `src/sync-orchestrator.ts`, `sync-orchestrator.test.ts`, `AGENTS.md` | Low | FOLD | Partly filed (#307) |
| R39 | Rebase reads the source bibliography at HEAD instead of sourceCommitSha | Rebase mode | `src/index.ts` | Low | FOLD | New |
| R40 | Dev tooling end-of-life / unsupported combos; SDK lag | Tests, CI & deps | `package.json` | Low | REJECT | Partly filed (#177, #342) |
| R41 | Coverage denominator is skewed | Tests, CI & deps | `src/cli/index.ts`, `src/runtime-paths.ts` | Low | DEFER | New |
| R42 | Nothing checks that the shipped bundle loads | Tests, CI & deps |  | Medium | FOLD | New |
| R43 | Action bundle carries no third-party license notices | Tests, CI & deps | `build-action.mjs` | Low | DEFER | New |
| R44 | `review --repo` cannot create issues on a repo lacking its labels, exits 0, and loses the session | CLI | `src/cli/issue-generator.ts`, `src/cli/commands/review.ts` | Low | DEFER | New |
| R45 | `backward` bulk never exits 0 on a partially translated repo | CLI | `src/cli/commands/backward.ts`, `src/cli/index.ts` | Low | DEFER | Notes only |
| R46 | Argument/path hygiene: `git add` without `--`; forward local-write mode lacks containment check | CLI | `src/cli/forward-pr-creator.ts`, `src/cli/commands/forward.ts` | Low | DEFER | Notes only |
| R47 | Sync is neither serialised nor idempotent | GitHub I/O & triggers | `setup.ts`, `src/pr-creator.ts` | Low | DEFER | New |
| R48 | parentId is wrong for every sibling after the first (dormant) | Document pipeline | `src/parser.ts` | Low | DEFER | New |
| R49 | Model prose in review comments can @-mention users or embed images | LLM layer | `src/review-verdict.ts` | Low | DEFER | New |
| R50 | A CLI smoke test depends on the environment | Tests, CI & deps | `src/__tests__/cli-smoke.test.ts` | Low | DEFER | New |
| R51 | Test-only settings leak into the production build | Tests, CI & deps | `tsconfig.json` | Low | DEFER | New |
| R52 | Old content is fetched at `${sha}^`, wrong for rebase-merged multi-commit PRs | Rebase mode | `src/index.ts` | Medium | DEFER | Notes only |

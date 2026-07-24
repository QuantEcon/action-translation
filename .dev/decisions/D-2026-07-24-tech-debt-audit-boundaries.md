# Technical-debt audit 2026-07: the boundaries remediation must respect

**Context**: A 12-dimension technical-debt audit (2026-07-23) produced 139 verified findings,
re-validated against v0.23.0 and scheduled as issues #158–#176 under milestone 1, with a
trigger-gated backlog in #177. Those issues carry the **actions**. This record carries the
**non-actions** — code that is load-bearing, decisions already settled, and fixes that look
obvious and are wrong — because that guidance otherwise existed only in a gitignored report and
would be rediscovered, and re-proposed, by the next audit or the next agent session.

**Decision**: The following are recorded as settled. Restructure how these are *reached*; do not
edit what they *encode*.

## Load-bearing

- **`structural-parity.ts`** was calibrated empirically against 211 real source/target pairs; 362
  false positives in three classes (contents/index titles, `prf:*` titles, code-cell kernel tags)
  were tuned out. Its blind spots are deliberate and documented at `:19-25` — both sides are
  scanned with the *same* walker, so systematic blind spots cancel. Extract the fence **walk**;
  leave the violation classes alone.
- **`typography.ts`** carries a nesting-aware fence stack that a flat top-level walker cannot
  replace — it is a fifth walker on purpose. Its `RULES` **must stay a `Map`**: as a plain object,
  `applyTypography(content, 'toString')` resolves up the prototype chain and replaces the whole
  document with `[object Undefined]` (`:270-277`). Do not fold `RULES` or `getFontRequirements`
  into `LanguageConfig`.
- **`localization-rules.ts`** encodes rules produced by native-speaker review (fr, ml). Change how
  they reach the model; do not edit their text as part of a refactor.
- **`normalizeHeadingForMatch`** (`heading-map.ts:45`) is *not* a duplicate of `cleanHeadingText` —
  it is deliberately different and `cleanHeadingText`'s docstring at `:56` says so. The `HeadingKey`
  brand gets exactly **two** constructors, not one.
- **The streamed vs non-streamed Anthropic split** is deliberate (`models.ts:30`): non-streamed CLI
  calls stay under the SDK's own non-streaming timeout guard. Preserve it at the call site when
  consolidating clients.
- **The two glossary loaders differ deliberately** — the CLI adds repo-local candidates because it
  runs inside a checkout; the Action does not, because it reaches the target repo over the API and
  uses `glossary-path` (`docs/user/glossary.md:76-86`). v0.23.0 already collapsed four loaders with
  three behaviours down to these two. Unifying further reintroduces CWD-relative lookup in the Action.
- **`chalk` pinned at `^4`** is load-bearing, not stale: `^4` is the last CJS release and the ts-jest
  CJS harness requires it.
- **Inside `backward-evaluator.ts`'s dead range**, `validateCategory`, `parseSpecificChanges` and
  `sleep` are called by the *live* whole-file path. Delete lines 37-187, 222-235, 244-335 — not 192,
  not 169, not 236-239.
- **`translateSectionResync`** (`translator.ts:230`) is a live sync-mode path, unrelated to the dead
  CLI section types. Do not sweep it into that deletion.

## Settled — do not reopen

- **Label-application failure stays non-fatal** (`pr-creator.ts:236`). It was deliberately wrapped
  and downgraded after a GitHub API race failed an otherwise-successful `fa` sync, then given a 3×
  retry and an explicit warning. Fix the *bootstrap* instead.
- **`--test` / `testMode` keep their names.** The public input is `test-mode` in `action.yml`
  regardless, so an internal rename does not remove the collision. Fix the behaviour, not the name.
- **`backward --resume` semantics are a coded choice** (`backward.ts:391`). Changing it is in scope
  (#160) but must be CHANGELOGged as a behaviour change; do not add `--skip-errored`.
- **Search-before-create for failure issues** is refused by [`D-2026-07-16-single-review-comment.md`](D-2026-07-16-single-review-comment.md):
  check-then-act has no conditional-write primitive and races under this repo's concurrency.
  Close-on-recovery only.
- The hard architectural constraints stand: no AST parsing, section-level translation units,
  sections matched by position/ID, only changed sections translated, subsections reconstructed from
  `section.subsections`, `dist-action/` committed on purpose.

## Plausible but wrong

- **Raising `MAX_TOKENS.analysis`** does not fix the truncation — the failure is an unretryable bare
  `Error`; type it into the retryable union instead.
- **`NODE_OPTIONS: --enable-source-maps` in `action.yml`** cannot work: a `node24` action's `runs:`
  block has no `env:` key. An esbuild banner also fails (it runs after the module is compiled). Only
  a separate CJS shim works — measured.
- **"v0.23.0 added another glossary loader"** — it removed two.
- **A `dist-action` execution smoke test instead of splitting `index.ts`** does not substitute for
  the seam; it exercises the bundle, not the branches.
- **Deleting the outer retry loops and setting `maxRetries: 4` on the SDK** loses the streamed paths'
  coverage; the predicate must be the union.
- **Unifying the two token estimators** is explicitly counter-recommended by the finding that
  identified them.
- **`@swc/jest` for speed** buys nothing measurable: the suite runs in ~2.5s.

## The round-trip invariant needs reformulating before Phase 2

`.dev/PLAN.md`'s round-trip invariant is **unachievable as written**. Measured over the corpus:
13/78 files round-trip byte-for-byte, while parity and idempotence hold 78/78. Building Phase 2
against the current formulation ships a gate that fails on ~84% of a healthy corpus. Correct the
formulation first.

**Consequences**:

- Remediation PRs can cite this record instead of re-deriving why a tempting change is refused.
- The list is not exhaustive and is not a substitute for the finding detail in #158–#177; it covers
  only what would otherwise be lost when `.dev/scratch/` is cleared.
- Superseding entries as facts change means a new decision record, not an edit to this one. In
  particular, the glossary-loader entry expires the moment a third consumer appears.

**Refs**: milestone 1 · issues #158–#177 · audit artifacts in `.dev/scratch/tech-debt-audit-2026-07-22/`
(gitignored; `TECH-DEBT-REPORT.md` §6 and `REFUTED-REGISTER.md` are the fuller sources) ·
[`D-2026-07-16-single-review-comment.md`](D-2026-07-16-single-review-comment.md) ·
[`D-2026-07-14-thinking-off-sonnet5.md`](D-2026-07-14-thinking-off-sonnet5.md)

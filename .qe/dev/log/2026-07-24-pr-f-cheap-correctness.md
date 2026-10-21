# 2026-07-24 — #163 (PR F): the cheap-correctness batch

Seven independent small fixes; details in the CHANGELOG entry. Notes that outlive the PR:

- **F93**: the `joinDocsPath` helper lives in `forward-pr-creator.ts` as the stopgap; the
  audit's full fix (one `normalizeDocsFolder` shared by the four independent normalization
  rules in `inputs.ts`/`setup.ts`/`cli/index.ts`) remains open — the metadata contract now
  states the canonical single-slash form, so any future normalizer has a spec.
- **F87**: `TruncatedResponseError` typed into the retry union at the three LIVE sites
  (backward `evaluateFile`, forward-triage, document-comparator). The fourth truncation
  throw at `backward-evaluator.ts` ~:300 is inside the dead per-section path
  (`evaluateSection` cluster, scheduled for deletion per the boundaries record) and was
  deliberately left bare. The full fix (split `MAX_TOKENS.analysis`, stream + bigger cap,
  per-section fallback) remains open as the finding's m-level half.
- **F74**: the drift test (`translator-prompts.test.ts`) reads rendered prompts off the
  mocked SDK; verified it fails 6 ways on pre-fix code via stash round-trip. The
  document-resync builder has a legitimate numbered preamble, so the test scopes to the
  rules block. PLAN.md's `[L]` prompt-numbering entry annotated: its line refs were stale.
- **F70**: `computeVerdict(6, 6, [])` is FAIL, not WARN — IEEE 754 puts `6×0.7+6×0.3` at
  5.999…, so the mathematical WARN boundary has never been reachable at exactly 6/6. Pinned
  as characterization; changing it would be a verdict-behaviour change (Stage-4 relevant).
- **F40**: implemented as throw-before-the-model-calls. This makes the verdict-stage
  `sourceContentMissing` gate unreachable for the total-empty case (it still documents the
  contract; left in place). The finding's granular halves — partial source fetch, symmetric
  target check — remain open as its m-level remainder.

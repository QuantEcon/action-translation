# 2026-07-24 — Wave 1 complete: eleven PRs, 51 findings, one day

#158–#168 all merged (#180, #183–#186, #188, #190, #193, #195–#197). Per-PR logs sit
alongside this entry. Tidy-up done in the same pass: verified-empty `worktree-*` branches
deleted (the locked Malayalam worktree left for its session to clean), `.dev/scratch`
curated down to the measurement artifacts the logs cite (coverage before/after #166,
init-parity corpus measurement, the audit artifacts dir), scratchpad repo clones removed.

What the wave changed about how the repo defends itself, beyond the fixes: tests are
type-checked; smoke tests refuse stale builds; `.dev` line-refs are CI-checked (caught
real drift twice within the wave); the review workflow, labels, branch prefixes, and
model default each have exactly one owner with structural tests; the module map cannot
silently omit a file; docs carry no hand-maintained counts left to rot.

Deliberately NOT done in the wave, standing for next week:
- **No release.** The `[Unreleased]` CHANGELOG is the entire wave; cutting v0.24.0 moves
  `@v0` and deploys everything estate-wide — a decision for Monday, not a tidy-up step.
- **Round-trip invariant** untouched — must be reformulated first (boundaries record:
  byte round-trip 13/78; parity+idempotence 78/78).
- The findings' larger halves inventoried in each PR log (F121's round-trip, F87's cap
  split, F40's partial-fetch checks, F88's cache counters, F93's shared normalizer).
- Wave 2 (#169–#176, backlog #177) unstarted.

#promote: the wave pattern — guardrail PR first and alone, red-by-design PRs at block
starts, deletion PRs by name under type-checking, measurements before behaviour changes —
worked without a single red-CI surprise across eleven PRs. Worth reusing on other repos.

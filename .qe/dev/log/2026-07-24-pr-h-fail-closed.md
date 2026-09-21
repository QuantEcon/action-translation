# 2026-07-24 — #165 (PR H): delete the fake validator, fail everything closed

Details in the CHANGELOG entry; decisions that outlive the PR:

- **validateMyST deleted, not implemented.** The audit offered both; the issue chose
  deletion. The residual hole is real and accepted: a source with no directives and no
  anchors gives `checkStructuralParity` nothing to compare, so a truncated translation of
  such a file passes. That hole belongs to the #94 Phase 2 round-trip invariant — which the
  boundaries record says must be REFORMULATED first (byte-for-byte round-trip holds only
  13/78; parity + idempotence hold 78/78). Do not resurrect a validateMyST-shaped check.
- **Fetch errors**: `fetchAllFileContents` → `{files, errors}`; sync merges them into
  `result.errors` (fail + failure issue, PR still created for fetched files — deliberate:
  partial delivery visible, not silent). Rebase throws before reset (#160 rule extended to
  fetches). The inner benign fallbacks (old-content missing = new file, target missing =
  create) are untouched — those are semantics, not swallows.
- **Parsers**: keyword fallbacks deleted (both remaining defaults were already
  recall-biased and correct); `LlmResponseParseError` (models.ts) is retryable in the
  backward evaluateFile loop only — triage parsers never throw (their defaults are the
  correct recall-biased behaviour), so retry-on-parse there is moot. The dead
  `parseEvaluationResponse`/`evaluateSection` cluster untouched again (scheduled deletion).
- **F85 shape**: the corrupt-state refusal in `status --write-state` had to collect+throw
  AFTER the per-file loop — the loop's catch treats any error as skip-this-file, which is
  exactly the silent path the fix closes. A throw inside the try was swallowed (caught by
  the first test run, kept as a regression test).
- **translate-state.ts untouched** per the audit rec (imported by the Action; widening its
  return type forces rebuild scope for no benefit). The discriminated-union
  corrupt/missing return stays future work.

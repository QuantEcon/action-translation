# 2026-07-24 — #164 (PR G): one retry predicate, no stacking, cost outputs

`isRetryableAnthropicError` (models.ts) now owns the transport-retry union; all six sites
consume it, which lands the `overloaded_error` branch at the five sites 40d63ef missed —
the live one being the reviewer's two streamed calls, where one overload aborted the whole
review. Boundary honoured: the outer loops STAY and the SDK gets `maxRetries: 0` at all six
constructors (the boundaries record refuses the delete-loops-and-let-the-SDK-retry shape:
the streamed paths' coverage lives in the hand-rolled loops). Attempt budget is now exactly
RETRY_CONFIG's 3, not the silent 9.

Predicate design note: `TruncatedResponseError` (PR F) is deliberately NOT in the shared
union — translator/reviewer truncation is unretryable by design (a full-document rerun at
the same cap cannot fit), while the CLI's bounded JSON-analysis sites OR it in locally.
One predicate, two truncation semantics, both intentional.

Usage: both chokepoints accumulate input/output/calls at `finalMessage()` return —
before the stop_reason check, so truncated and parse-failed attempts are counted, which
per-result `tokensUsed` misses. New outputs `input-tokens`/`output-tokens`/`api-calls` on
sync and review paths + an `API usage:` info line. F88's fuller shape (per-result usage
objects, cache_read/cache_creation counters) deliberately not built — it belongs with the
prompt-caching work.

`reviewer-retry.test.ts` is the repo's second SDK-mock suite (mold: translator-retry);
it also pins `maxRetries: 0` via the constructor call and usage accumulation across a
parse-failure retry. Also fixed in passing: PR F had wedged `computeVerdict` between
`validateCriterionScores` and its docstring — docstrings re-attached.

PLAN.md's shared-call-helper entry annotated: predicate + stacking halves done, the
loop/backoff/JSON-extraction unification remains.

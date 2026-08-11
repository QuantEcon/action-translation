# W0 S-fix batch: #230, #234.4, #53, #91 — plus .dev maintenance

2026-08-11, same session as [the #116 pair](2026-08-11-116-trailing-newline.md). Goal:
close out W0 (#258)'s S-size fixes in one batch.

## #230 — claude-opus-5 priced at $0.000

`PRICING` (`scripts/glossary/lib.mjs`) gains `claude-opus-5` {in: 5, out: 25},
`claude-fable-5` {10, 50}, `claude-haiku-4-5` {1, 5} — prices confirmed against
Anthropic's current model documentation at fix time, not recalled. `costUSD` warns once
per unknown model (a Set, not per-call spam) and still returns 0: zero is legitimate
(cache-only responses), so it must not double as the "unknown" sentinel — that ambiguity
is exactly what hid the spend. `VALID_MODEL_PATTERNS` (`src/models.ts`) gains
opus-5/fable-5 in the same change (same cause, per the issue). The issue's third defect —
`translate init` prints no cost line at all — is not addressed here; it is an output
change, not an S-fix.

## #234.4 — resync gate ≠ resync parser

Aligned to the parser's `startsWith`: the scaffolder (`setup.ts`), root README, examples
README, four docs pages, both drift-guard tests, and the harness's
`sync-workflow-template.yml`. Direction deliberate: loosening the parser to `contains`
would make any comment *quoting* the command trigger a full sync. **Accepted residual**:
GitHub's `startsWith` does not trim, the action does — a comment with leading whitespace
before the command passes the parser but no longer fires the workflow. Command-first-at-
column-one is now the documented contract (FAQ + action-reference). Items 1–3 and 5 of
#234 (stalled-run detection, `doctor --stalled`, FAQ failure-mode doc, push-trigger
design question) are W1-shaped and untouched.

## #53 — legacy heading-map: deprecation warning

`extractHeadingMap` warns when it takes the legacy fallback, once per process (the
function has no filename to report, so N repeats add noise, not information). Points at
`npx translate headingmap`. Removal of the fallback itself stays W6. Tests use
`jest.isolateModules` + `require` for a fresh once-flag per test — the module-level flag
would otherwise make the warning test order-dependent.

## #91 — heading-maps.md taught a format no writer ever produced

Keys are heading text verbatim minus `#` markers and MyST roles (`cleanHeading`,
heading-map.ts) with `::` parent paths for nesting — not lowercase-hyphenated MyST IDs.
Fixed: heading-maps.md (prose, both examples, the "ID generation rules" table →
"Key generation rules"), faq.md, fresh-setup.md, AGENTS.md (which also claimed
"no nesting"). `connect-existing.md` already showed the real format. Grepped docs for
the claim afterward: clean. #90's `canonicalizeHeading()` (one code-level answer to
"what is a key") remains open — the docs now match the code, which is #91's scope.

## .dev maintenance

STATE.md rewritten to ~1 page against today's truth (was 5x budget with a pre-#257
"In flight"); FUTURE.md's model-allowlist staleness line marked done-through-opus-5;
stray `lecture-python-programming.ml/` clone removed from the working tree (single
scaffold commit, nothing unpushed, real repo exists at QuantEcon/).

## Verification

Full suite 1516/1516 (three new tests confirmed failing on pre-fix source: the #53
warning test, the two #230 validModels cases), lint + format:check clean,
check-dev-refs 168/168. `dist-action/` rebuilt and committed — heading-map.ts and
models.ts are in the action bundle, so this batch is the rare case where the bundle
legitimately changes.

## W0 after this batch

Remaining in #258, none engineering-blocked: D1 (W2 kickoff), D3 (deferred), #256.3
(external clock — next organic batch), #7 (owner call: rename or wontfix).

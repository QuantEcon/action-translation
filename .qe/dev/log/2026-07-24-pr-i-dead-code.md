# 2026-07-24 — #166 (PR I): ~900 LOC of dead code deleted by name

The deletion PR the wave's guardrails exist for. Numbers: 912 deletions / 38 insertions
across 20 files; tests 1,380 → 1,356 (−1.7%, predicted optical drop); coverage before →
after: Lines 84.6% → 84.78%, Functions 86.3% → 86.38% (scratch/coverage-{before,after}-166.txt).
The rebuilt `dist-action/` bundle is byte-identical — independent proof nothing deleted was
bundle-reachable.

Boundaries honoured exactly: deleted `buildEvaluationPrompt`, `parseEvaluationResponse`,
`mockEvaluationResponse`, `evaluateSection` BY NAME with verified line anchors; preserved
`validateCategory`, `parseSpecificChanges`, `sleep`, `buildSectionPairsBlock` (the named
likeliest casualty — confirmed live via `buildFileEvaluationPrompt`). `translateSectionResync`
untouched. Diffs on both backward-evaluator files verified pure-deletion (zero added lines).

Process note worth remembering: a first deletion attempt used brace-depth counting to find
function ends and was corrupted by template literals containing MyST `{directive}` prose —
prompt-building files cannot be machine-parsed by brace balance. Redone with explicit
docstring/banner line anchors asserted before deleting. A second self-inflicted cut: a
`\n{3,}` whitespace collapse applied file-wide ate a blank line INSIDE the surviving
snapshot entry — snapshot files and template-literal-bearing sources must never get global
whitespace normalization. Both were caught by the suite, not by review.

F115: six never-run tests now run against `src/cli/__tests__/fixtures/resync-reports/`
(anonymised, 3 reports + `_progress.json` + `_log.txt`). PR A's checker caught two `.dev`
refs invalidated by the shrinking files (PLAN backward-evaluator:594 → :364;
FUTURE types.ts range) — exactly the drift class it was built for, on its second week.

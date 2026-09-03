# 2026-09-03 — ml round-2 answers (ml#12) encoded; exercise scope goes deterministic

**Trigger**: Adisankar answered QuantEcon/lecture-python-programming.ml#12 on 2026-09-01. Five of six word choices matched our guesses (*work* did not: he keeps the light-verb form `work ചെയ്യുന്നുണ്ടോ`); line 159 confirmed a typo; the font needs no change. His exercise answer reversed the two-day-old ruling: keep **all** exercise-related content English, byte-for-byte, until he decides per exercise.

**Done**
- `D-2026-09-03-ml-all-exercise-content-stays-english` (supersedes the 09-01 record, note atop it).
- `src/verbatim-directives.ts` — nesting-aware extent walker (backtick/tilde/colon fences, literal bodies opaque, `PROSE_DIRECTIVES` now exported from typography.ts), `applyVerbatimDirectives` wired into sync-orchestrator (both seams), init and forward, each immediately before `checkStructuralParity`; `findVerbatimViolations` → `checkVerbatimDirectives` in diff-checks (optional `targetLanguage` on `runDeterministicDiffChecks`), surfaced in reviewer.ts as a `blocker` / `diff-check` finding — additive, no schemaVersion bump.
- `ml` rules 24 → 23 (two scope rules → one verbatim statement; *For example* joins the connectives; `refer` calque named; headings byte-identical incl. possessives); glossary v0.5.0 (+5).
- E2E scenario 28 `28-add-exercise-lecture` — first exercise-family directives in the suite; README + valid-prefix message updated.
- Suite 1553 green, lint/format/dev-refs clean, `dist/` + `dist-action/` rebuilt.

**Lecture side**: ml#14 restores functions (4/10 blocks) and python_by_example (7/10) to byte-identical English plus the typo; matplotlib (ml#13) was already compliant.

**Withdrawn**: the ex5 "over-read" logged on #296 for the v0.27.0 arm — correct under the new ruling.

**Next**: local-bundle validation against a scenario-28 harness PR on the `.ml` lane (expect the blocks byte-identical and the diff-check green), then PR, then release before round 4 is generated.

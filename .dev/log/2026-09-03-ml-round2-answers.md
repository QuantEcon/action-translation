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

**Addendum, same day — released.** Copilot's three comments on #303 addressed (`8af4de5`); #303 merged `07e7c64`; release PR #304 (`9284fbc`, Copilot's one comment adopted: an empty `[Unreleased]` header now stays above the released section, recorded in the AGENTS.md checklist). §4a gate on `v0.28.0`: 84/84 sync runs, 28/28 delivery + 28/28 verdicts per lane at `engineVersion: 0.28.0`; scenario 28 on `.ml` delivered both blocks byte-identical (test-translation-sync.ml#126), PASS/auto-merge. `v0.28` + `v0` moved to `9284fbc`; alias smoke on scenario 01 reports `engineRef: v0` / `0.28.0` on all lanes. GitHub release published. W1 (#259) retargeted to v0.29.0. Gate-tally recipe: `gh api …/actions/runs?created=>=<gate-start>` grouped by workflow name and conclusion, then the last verdict comment's `engineVersion` per open target PR — the `created` filter is loose, so key the tally on the runs' own timestamps if the numbers look inflated.

**Addendum 2 — round 3 regenerated at v0.28.0.** The editor had not started ml#13, so the seed was regenerated at the release (ml#13 `9e8616b`, v0.27.0 draw kept as the previous commit) and the pair archived as `experiments/ml-benchmark/arms/2026-09-03-round3-matplotlib-v0.28.0/` (#306). Under glossary v0.5.0 the v0.27.0 draw fails the *already* / *name* pins and needed a heading hand-fix; the v0.28.0 draw is clean on both, lints 0/0/0/1, exercise blocks verbatim by construction; draw-to-draw prose 14% identical lines / 0.683 similarity, the round-2 order of variance. #302 and #305 merged (main `37374d7`); #306 open.

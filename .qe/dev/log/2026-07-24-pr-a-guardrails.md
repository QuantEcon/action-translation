# 2026-07-24 — #158 (PR A): type-check the test suite + guardrails

Wave 1 opener of the tech-debt remediation. `isolatedModules: false` in the ts-jest inline
override only (root tsconfig keeps `true` for esbuild), which puts full diagnostics on 55
test files that were previously compiled by nothing. Plus `"root": true` for worktree lint,
lint/format widened to the root `*.mjs` scripts, smoke tests fail on a stale
`dist/cli/index.js` (mtime vs newest non-test file under `src/`), and the new
`check-dev-refs.mjs` CI step that fails when a `.dev/` `path:line` reference points at a
missing file or past end-of-file (the #179 failure shape; all 130 current refs resolve).

**Discrepancy vs the issue**: enabling diagnostics surfaced **four** errors, not the
predicted three. The fourth is in a *production* file — `commands/review.ts`'s lazy
`import('ink')` fails type resolution under the test override's node10 resolution, because
ink v4 is ESM-only with an `exports`-only package. ts-jest checks every file the transform
touches, not just tests; the audit's whole-program tsc measurement counted only test-file
errors. Fixed with a test-scoped `paths` mapping in the same jest.config.js override — no
source change, runtime untouched (tests never execute the ink path). Reported in the PR.

Two measurement corrections for the wave notes: the expected "large mechanical format diff"
does not exist (src/ was already prettier-clean; only `build-action.mjs` reformats), and the
suite cost of full type-checking is ~2.5s → ~8s wall.

Verified before opening the PR: 55/55 suites green (1300 passed, 3 skipped), lint and
format:check clean, zero `dist-action/` drift, freshness guard demonstrated failing on a
touched source file and passing after rebuild, checker self-test demonstrated on both
failure modes (missing file, line past EOF).

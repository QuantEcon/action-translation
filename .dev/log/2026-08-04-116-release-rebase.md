# 2026-08-04 — #116: rebase after the v0.25.0 release

PR #232 was rebased onto release commit `c74e3aaad68bbe8df7d4b29a6adef1cd49bca6e5`.
Because the release consumed the previous changelog heading, the existing #116 entry was moved
into a newly introduced `## [Unreleased]` / `### Fixed` section above v0.25.0.

Validation performed after the rebase:

- `npm run build`, `npm run lint`, and `npm run check-dev-refs` (133 references) passed.
- Prettier passed on both changed TypeScript files.
- The focused `forward.test.ts` suite passed all 13 tests.
- Six affected forward suites passed all 69 tests, including one snapshot.
- The broad Windows suite passed 53/64 suites and 1,409/1,432 tests. A freshly installed,
  built worktree at the exact release commit passed 53/64 suites and 1,407/1,430 tests, with
  the identical 11 failing suites and 23 failing tests. The branch therefore adds exactly two
  passing tests and no additional broad-suite failures.
- `npm audit --omit=dev` reports one moderate `undici` vulnerability on both the branch and the
  exact release baseline; no dependency was changed in this focused fix.

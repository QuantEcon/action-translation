# 2026-07-29 — #116: forward output lacked a trailing newline

The issue was reproducible in both output modes. Test-mode resync returns content without a
final newline, and `resyncSingleFile` previously sent that string unchanged to either
`fs.writeFileSync` or `gitPrepareAndPush`.

- Normalized `outputContent` once, immediately before the local/GitHub output split.
- Preserved content that already ends in LF or CRLF; appended one LF only when absent.
- Added regression assertions for the local file bytes and the GitHub-mode content.
- Added exact-byte preservation cases for existing LF and CRLF endings.
- Kept the change out of the prompt and individual sinks so all generation paths share the
  same deterministic behavior.

Validation performed:

- Before the fix: focused `forward.test.ts` suite had 2 expected failures and 9 passes.
- After the fix and preservation coverage: focused `forward.test.ts` suite passed all 13 tests.
- Six affected forward suites passed all 69 tests, including one snapshot.
- `npm run lint`, `npm run check-dev-refs` (133 references), `npm run build`, and
  `npm audit --omit=dev` (zero vulnerabilities) passed.
- Prettier passed on both changed TypeScript files. The repository-wide format check reports
  all 115 tracked TypeScript/MJS files on this Windows CRLF checkout; that checkout-wide
  baseline condition is unrelated to this diff.
- The broad Windows suite passed 53/64 suites and 1,408/1,431 tests. An untouched, built
  worktree at the pinned baseline produced the identical 11 failing suites and 23 failing
  tests, with 1,406/1,429 passing. The shared failures are pre-existing Windows line-ending,
  path-separator, and symlink-permission incompatibilities; the branch adds exactly two
  passing tests.

# Issue 116 current-main changelog rebase

PR 232 was rebased onto current `main` commit
`842528bea1e66755fb3afbce6651f7be69d5eb73` after PRs 246 and 247 added two
entries at the same `[Unreleased]` / `Fixed` insertion point. The conflict was
resolved by retaining both upstream entries in their existing order and placing
the issue 116 trailing-newline entry after them.

The source change, regression file, and two earlier issue 116 session logs are
byte-identical to the previously reviewed head. Aside from this session log,
the current-main diff adds only the issue 116 changelog entry plus those four
unchanged contribution files.

Validation on Windows 11, Node 24.16.0, and npm 11.13.0:

- `npm ci` and `npm run build` passed; the generated Action bundle remained
  content-identical after checkout line-ending normalization was restored.
- `npm test -- --runInBand src/cli/__tests__/forward.test.ts` passed 13/13.
- The six affected forward suites passed 69/69 with one snapshot.
- Prettier output for both committed TypeScript blobs was byte-identical to the
  blobs when checked through `--stdin-filepath`; `npm run lint` and
  `npm run check-dev-refs` passed. A direct final-worktree Prettier check is not
  a valid oracle in this Windows `core.autocrlf` checkout because Git
  rematerializes those otherwise clean LF blobs as CRLF.
- After rebuilding immediately before the broad run, the branch passed
  1,432/1,455 tests in 53/64 suites. An untouched, freshly installed and built
  worktree at exact current main passed 1,430/1,453 tests in the same 53/64
  suites; both had the same 11 failing Windows-only suites and 23 failing tests.
  The branch therefore adds exactly the two newline-regression passes and no
  broad-suite failure.
- An earlier broad invocation was discarded because targeted Prettier ran after
  the build and correctly triggered the repository's stale-CLI guard; rebuilding
  immediately before the exact rerun removed that validation-order artifact.
- `npm audit --omit=dev` reported the same one moderate `undici` advisory on the
  branch and exact current main. This pull request changes no dependency.

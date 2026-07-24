---
title: Testing
---

# Testing

**Current counts**: run `npm test` — the exact test and suite counts live in CI, not in prose.

## Running tests

```bash
npm test                              # All tests
npm test -- parser.test.ts            # Single file
npm test -- --testNamePattern="name"  # Pattern match
npm test -- --watch                   # Watch mode
npm test -- --coverage                # Coverage report
npm test -- --verbose                 # Detailed output
```

Before committing, always run:
```bash
npm test && npm run build
```

## Test structure

Two test roots, split by what they exercise: `src/__tests__/` covers the Action pipeline
(parser, diff detection, translation, review, sync orchestration, inputs) and
`src/cli/__tests__/` covers the CLI commands and their helpers. Suites are named
`<module>.test.ts` after the module they cover, with focused suites like
`<module>-<aspect>.test.ts` for regressions and cross-cutting behaviours.

The suite inventory is deliberately not enumerated here — the last several releases showed
this page drifts the moment a suite is added. List them directly:

```bash
find src -name '*.test.ts' | sort
```

## Test philosophy

**Tests catch bugs in seconds, not minutes.** Without tests: code → build → push → PR → Actions → check results (10–15 min). With tests: code → `npm test` → results (2 sec).

**What we test:**
- **Unit tests** — individual functions and modules
- **Integration tests** — full pipelines (parse → detect → translate → reconstruct)
- **Regression tests** — previously fixed bugs stay fixed (tagged by version)
- **Edge cases** — unusual inputs, empty documents, malformed frontmatter

**What we mock:**
- GitHub API calls
- Claude API calls
- File system operations (where needed)
- Terminal output formatting

## Writing tests

Follow the Arrange–Act–Assert pattern:

```typescript
describe('ComponentName', () => {
  it('should do something specific', () => {
    // Arrange
    const input = createTestFixture();

    // Act
    const result = processInput(input);

    // Assert
    expect(result).toBe('expected');
  });
});
```

**Guidelines:**
- One behavior per test
- Descriptive test names — the name should explain what's being tested
- No inter-test dependencies
- Test behavior, not implementation details

### Adding regression tests

When fixing a bug:

1. Write a test that reproduces the bug (should fail)
2. Fix the bug
3. Verify the test passes
4. Tag with the version in the test comment

```typescript
it('should not duplicate subsections in output (v0.4.3 regression)', () => {
  const sections = [{
    heading: '## Overview',
    content: '## Overview\n\n### Subsection\n\nText.\n\n',
    subsections: [{ heading: '### Subsection', /* ... */ }]
  }];

  const result = reconstructFromSections(sections);
  expect(result.match(/### Subsection/g)).toHaveLength(1);
});
```

## Key regression tests

### v0.4.3: Subsection duplication

**Bug:** Subsections appeared twice in output — once from `content` and once from `subsections` array.

**Tests:** 5 in `file-processor.test.ts` — verify `reconstructFromSections` produces exactly one copy of each subsection.

**Root cause:** Code read subsections from `section.content` and also appended from `section.subsections`. Fix: always use `contentWithoutSubsections`, then append from `section.subsections`.

### v0.4.3: Incomplete heading-maps

**Bug:** Heading-maps didn't include subsection headings.

**Tests:** 5 in `heading-map.test.ts` — verify `updateHeadingMap` includes subsections at all nesting levels.

### v0.4.6: Section comparison

**Tests:** In `diff-detector.test.ts` — verify recursive subsection comparison works correctly.

## GitHub integration testing

Beyond unit tests, we validate the action end-to-end on real GitHub repositories.

### Test repositories

| Repo | Role |
|------|------|
| `QuantEcon/test-translation-sync` | SOURCE (English) |
| `QuantEcon/test-translation-sync.zh-cn` | TARGET (Chinese) |

### Running integration tests

```bash
./tool-test-action-on-github/test-action-on-github.sh
```

The script automatically:
1. Resets test repositories to a clean state
2. Closes all old PRs
3. Creates 24 test PRs covering different scenarios
4. Triggers GitHub Actions on each PR
5. Validates translations in the target repo

**Scenarios covered:** New files, section updates, deletions, subsections, root-level files, MyST directives, heading-map updates.

### When to use each

| Aspect | `npm test` | GitHub testing |
|--------|-----------|----------------|
| Speed | ~2 seconds | ~2–3 minutes per scenario |
| Scope | Unit + integration | Full end-to-end workflow |
| Cost | Free | ~$0.50 per run (Claude API) |
| Use | Every commit, TDD | Pre-release validation |

### Monitoring test runs

```bash
gh pr list --repo QuantEcon/test-translation-sync --label test-translation
gh pr list --repo QuantEcon/test-translation-sync.zh-cn
gh run list --repo QuantEcon/test-translation-sync
gh run view <run-id> --log
```

For full details on the test harness, see the [test script README](../../tool-test-action-on-github/README.md).

## Coverage

**Not covered (intentionally):**
- GitHub API calls (mocked)
- Claude API calls (mocked)
- Terminal output formatting
- Development-only logging

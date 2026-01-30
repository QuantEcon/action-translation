# Testing Guide

**Current Test Status**: ✅ 266 tests passing | 0 failing | ~4s execution time

---

## Quick Start

```bash
# Run all tests
npm test

# Run specific test file
npm test -- parser.test.ts

# Run with coverage
npm test -- --coverage

# Watch mode (development)
npm test -- --watch
```

---

## Test Structure

```
src/__tests__/
├── parser.test.ts              # MyST parsing & frontmatter
├── parser-components.test.ts   # Document component parsing
├── diff-detector.test.ts       # Change detection
├── file-processor.test.ts      # Section matching & reconstruction
├── heading-map.test.ts         # Heading-map system
├── language-config.test.ts     # Language-specific configuration
├── integration.test.ts         # End-to-end workflows
├── e2e-fixtures.test.ts        # End-to-end fixture tests
├── component-reconstruction.test.ts  # Component assembly
├── reviewer.test.ts            # Review mode functionality
├── translator.test.ts          # Translation service (prompts, validation)
└── inputs.test.ts              # Action input validation
```

**Test Breakdown**:
- Parser: 15 tests
- Parser Components: 5 tests
- Diff Detector: 24 tests (including v0.4.6 section comparison tests)
- File Processor: 54 tests (including subsection duplication regression test)
- Heading-Map: 28 tests (including v0.4.3 subsection regression tests)
- Language Config: 15 tests (v0.5.1, including validation)
- Integration: 9 tests
- E2E Fixtures: 1 test
- Component Reconstruction: 4 tests
- Reviewer: 28 tests (v0.7.0 review mode)
- Translator: 28 tests (prompt structure, token estimation)
- Inputs: 55 tests (mode validation, PR events, input parsing)

---

## Test Philosophy

### Why We Test

Tests catch bugs in **seconds** instead of **minutes** (or hours):

- **Without tests**: Code → Build → Push → PR → Actions → Check results (10-15 minutes)
- **With tests**: Code → `npm test` → Results (2 seconds) ⚡

### What We Test

1. **Unit Tests**: Individual components work correctly
2. **Integration Tests**: Components work together correctly
3. **Regression Tests**: Previously fixed bugs stay fixed
4. **Edge Cases**: Unusual inputs handled gracefully

---

## Regression Tests (v0.4.3)

**Purpose**: Prevent regression of critical subsection handling bugs

### Bug #10: Incomplete Heading-Map
**Problem**: Subsections weren't included in heading-map (v0.4.0-v0.4.2)  
**Tests**: 5 tests in `heading-map.test.ts`  
**Coverage**:
- ✅ Subsections included in heading-map
- ✅ Multiple subsections per section
- ✅ Nested subsections (level 4)
- ✅ Mixed sections (with/without subsections)
- ✅ Demonstrates buggy vs fixed behavior

### Subsection Duplication Bug
**Problem**: Subsections appeared twice in output (v0.4.3-debug)  
**Tests**: 5 tests in `file-processor.test.ts`  
**Coverage**:
- ✅ No subsection duplication
- ✅ Multiple sections with subsections
- ✅ Section.content preserves subsections  
- ✅ Sections without subsections
- ✅ Demonstrates buggy vs fixed behavior

**Example Test**:
```typescript
it('should NOT duplicate subsections in output', () => {
  const sections: Section[] = [{
    heading: '## Overview',
    content: '## Overview\n\n### Subsection\n\nText.\n\n',
    subsections: [{ heading: '### Subsection', ... }]
  }];
  
  const result = reconstructFromSections(sections);
  
  // Should appear EXACTLY ONCE
  expect(result.match(/### Subsection/g)).toHaveLength(1);
});
```

---

## Key Test Scenarios

### 1. Parser Tests (`parser.test.ts`)

**Tests**:
- Basic section parsing
- Frontmatter extraction (YAML)
- Preamble extraction (title + intro)
- Subsection parsing (level 3, 4)
- Code block preservation
- Math equation preservation
- MyST directive preservation

**Example**:
```typescript
it('should extract YAML frontmatter', async () => {
  const content = `---
jupytext:
  format_name: myst
---

# Title`;
  
  const result = await parser.parseSections(content, 'test.md');
  expect(result.frontmatter).toContain('jupytext:');
});
```

### 2. Diff Detector Tests (`diff-detector.test.ts`)

**Tests**:
- ADDED section detection
- MODIFIED section detection
- DELETED section detection
- Section matching by ID (not position!)
- Preamble change detection

**Critical Test** (prevents Bug #1):
```typescript
it('should detect ADDED sections correctly', async () => {
  const oldSections = [
    { id: 'intro', heading: '## Introduction' },
    { id: 'example', heading: '## Example' }
  ];
  
  const newSections = [
    { id: 'intro', heading: '## Introduction' },
    { id: 'models', heading: '## Models' },  // NEW!
    { id: 'example', heading: '## Example' }
  ];
  
  const changes = await detector.detectChanges(old, new, 'test.md');
  
  expect(changes.find(c => c.type === 'ADDED' && c.section.id === 'models'))
    .toBeDefined();
});
```

### 3. File Processor Tests (`file-processor.test.ts`)

**Tests**:
- Section matching by ID (prevents Bug #2)
- Document reconstruction
- Frontmatter preservation (prevents Bug #3)
- Preamble preservation
- Subsection handling (v0.4.3 regression tests)

**Critical Test** (prevents Bug #2):
```typescript
it('should find correct section by ID', () => {
  const targetSections = [
    { id: 'getting-started', ... },
    { id: 'mathematical-example', ... },
    { id: 'python-tools', ... }
  ];
  
  const sourceSection = { id: 'python-tools', ... };
  
  const index = findMatchingSectionIndex(targetSections, sourceSection);
  
  expect(index).toBe(2);  // NOT 0 (the bug!)
});
```

### 4. Heading-Map Tests (`heading-map.test.ts`)

**Tests**:
- Heading-map extraction from frontmatter
- Heading-map updates (add/remove sections)
- Heading-map serialization
- Lookup target headings
- Inject heading-map into frontmatter
- Subsection support (v0.4.3 regression tests)

**Example**:
```typescript
it('should include subsections in heading-map', () => {
  const sourceSections = [{
    heading: '## Overview',
    subsections: [{ heading: '### Setup' }]
  }];
  
  const targetSections = [{
    heading: '## 概述',
    subsections: [{ heading: '### 设置' }]
  }];
  
  const map = updateHeadingMap(new Map(), sourceSections, targetSections);
  
  expect(map.size).toBe(2);  // Section + subsection
  expect(map.get('Overview')).toBe('概述');
  expect(map.get('Setup')).toBe('设置');
});
```

### 5. Integration Tests (`integration.test.ts`)

**Tests**:
- Full workflow: parse → detect → process → reconstruct
- Complex scenarios (ADDED + MODIFIED + DELETED)
- Real-world document structures

**Example**:
```typescript
it('should handle complex scenario', async () => {
  // Test with:
  // - 2 ADDED sections
  // - 1 MODIFIED section  
  // - 1 DELETED section
  
  const result = await processFile(oldContent, newContent);
  
  expect(result.changes.added).toHaveLength(2);
  expect(result.changes.modified).toHaveLength(1);
  expect(result.changes.deleted).toHaveLength(1);
});
```

---

## Running Tests

### During Development

```bash
# Watch mode - tests run on file save
npm test -- --watch

# Run specific test
npm test -- --testNamePattern="should NOT duplicate"

# Verbose output
npm test -- --verbose
```

### Before Committing

```bash
# Run all tests
npm test

# Check coverage
npm test -- --coverage

# Build to catch TypeScript errors
npm run build
```

### In CI/CD

Tests run automatically on:
- Every push to main
- Every pull request
- Before every release

---

## Writing New Tests

### Test Template

```typescript
describe('Component Name', () => {
  describe('Method Name', () => {
    it('should do something specific', () => {
      // Arrange: Set up test data
      const input = 'test data';
      
      // Act: Call the method
      const result = methodUnderTest(input);
      
      // Assert: Verify the result
      expect(result).toBe('expected value');
    });
    
    it('should handle edge case', () => {
      // Test edge cases, error conditions, etc.
    });
  });
});
```

### Best Practices

1. **Test one thing**: Each test should verify one behavior
2. **Clear names**: Test name should describe what it tests
3. **Arrange-Act-Assert**: Follow AAA pattern
4. **No dependencies**: Tests should be independent
5. **Test behavior, not implementation**: Focus on what, not how

### Adding Regression Tests

When fixing a bug:

1. Write a test that fails with the bug
2. Fix the bug
3. Verify the test passes
4. Add test to appropriate test file
5. Document the bug in test comments

**Example**:
```typescript
it('BUG #X: should not do incorrect thing', () => {
  // This test prevents regression of Bug #X where [description]
  // Fixed in vX.Y.Z
  
  const result = methodUnderTest(input);
  expect(result).toBe(correctValue);
});
```

---

## Test Coverage Goals

**Current Coverage** (v0.4.6):
- Core logic: ~90%
- Edge cases: ~80%
- Integration paths: ~85%

**Target for v1.0**:
- Core logic: 95%+
- Edge cases: 90%+
- Integration paths: 90%+

**Not Covered** (intentionally):
- GitHub API calls (mocked in tests)
- Claude API calls (mocked in tests)
- Terminal output formatting
- Development-only logging

---

## Debugging Test Failures

### When a Test Fails

1. **Read the error message**: Jest provides detailed failures
2. **Check recent changes**: What code changed?
3. **Run single test**: `npm test -- --testNamePattern="failing test"`
4. **Add console.log**: Debug the test itself
5. **Check test data**: Is the fixture correct?

### Common Issues

**Issue**: "Cannot find module"  
**Solution**: Check import paths, run `npm install`

**Issue**: "Timeout exceeded"  
**Solution**: Increase timeout or check for infinite loops

**Issue**: "Expected X but got Y"  
**Solution**: Verify test data matches expected format

---

## Related Documentation

- **Test Repositories**: See `TEST-REPOSITORIES.md` for manual testing setup
- **Implementation**: See `IMPLEMENTATION.md` for code details  
- **Architecture**: See `ARCHITECTURE.md` for system design
- **Regression Test Plan**: See `REGRESSION-TESTS-v0.4.3.md` for detailed test specs (reference)

---

## Test Maintenance

### When to Update Tests

Update tests when:
- Adding new features
- Fixing bugs
- Refactoring code
- Changing behavior

### Keeping Tests Fast

- ✅ Use small test fixtures
- ✅ Mock external APIs
- ✅ Avoid file I/O when possible
- ✅ Run tests in parallel (Jest default)

### Test Hygiene

- 🧹 Remove obsolete tests
- 🧹 Update test data when formats change
- 🧹 Keep test names descriptive
- 🧹 Document complex test scenarios

---

**Last Updated**: October 24, 2025 (v0.4.6)

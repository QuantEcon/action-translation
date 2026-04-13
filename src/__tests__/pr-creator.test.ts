/**
 * Tests for PR Creator utilities
 *
 * Tests the pure functions that don't require GitHub API calls:
 * - buildPrBody
 * - buildPrTitle
 * - buildLabelSet
 *
 * GitHub API interaction (createTranslationPR) is tested via
 * integration tests with the real GitHub Action workflow.
 */

import { buildPrBody, buildPrTitle, buildLabelSet, parseTranslationSyncMetadata, PrCreatorConfig } from '../pr-creator.js';
import { TranslatedFile } from '../types.js';

// =============================================================================
// TEST HELPERS
// =============================================================================

const baseConfig: PrCreatorConfig = {
  targetOwner: 'QuantEcon',
  targetRepo: 'lecture-python.zh-cn',
  sourceLanguage: 'en',
  targetLanguage: 'zh-cn',
  claudeModel: 'claude-sonnet-4-20250514',
  sourceRepoOwner: 'QuantEcon',
  sourceRepoName: 'lecture-python',
  prNumber: 42,
  sourceCommitSha: 'abc123def456',
  prLabels: ['action-translation', 'automated'],
  prReviewers: [],
  prTeamReviewers: [],
};

// =============================================================================
// buildPrTitle TESTS
// =============================================================================

describe('buildPrTitle', () => {
  it('should use source PR title when available', () => {
    const files: TranslatedFile[] = [{ path: 'lectures/intro.md', content: 'content' }];
    const title = buildPrTitle(files, [], baseConfig, { title: 'Fix inflation model', labels: [] });

    expect(title).toBe('🌐 [translation-sync] Fix inflation model');
  });

  it('should show single filename when no source PR title', () => {
    const files: TranslatedFile[] = [{ path: 'lectures/intro.md', content: 'content' }];
    const title = buildPrTitle(files, [], baseConfig);

    expect(title).toBe('🌐 [translation-sync] lectures/intro.md');
  });

  it('should show "file + 1 more" for two files', () => {
    const files: TranslatedFile[] = [
      { path: 'lectures/intro.md', content: 'c1' },
      { path: 'lectures/ch1.md', content: 'c2' },
    ];
    const title = buildPrTitle(files, [], baseConfig);

    expect(title).toBe('🌐 [translation-sync] lectures/intro.md + 1 more');
  });

  it('should show file count for 3+ files', () => {
    const files: TranslatedFile[] = [
      { path: 'lectures/intro.md', content: 'c1' },
      { path: 'lectures/ch1.md', content: 'c2' },
      { path: 'lectures/ch2.md', content: 'c3' },
    ];
    const title = buildPrTitle(files, [], baseConfig);

    expect(title).toBe('🌐 [translation-sync] 3 files');
  });

  it('should include deleted files in count', () => {
    const files: TranslatedFile[] = [{ path: 'lectures/intro.md', content: 'c1' }];
    const deleted = [{ path: 'lectures/old.md', sha: 'sha123' }];
    const title = buildPrTitle(files, deleted, baseConfig);

    expect(title).toBe('🌐 [translation-sync] lectures/intro.md + 1 more');
  });
});

// =============================================================================
// buildPrBody TESTS
// =============================================================================

describe('buildPrBody', () => {
  it('should include source PR reference', () => {
    const files: TranslatedFile[] = [{ path: 'lectures/intro.md', content: 'content' }];
    const body = buildPrBody(files, [], baseConfig, { title: 'Test PR', labels: [] });

    expect(body).toContain('#42');
    expect(body).toContain('Test PR');
    expect(body).toContain('QuantEcon/lecture-python');
  });

  it('should list added files (no SHA)', () => {
    const files: TranslatedFile[] = [
      { path: 'lectures/new-file.md', content: 'content' },
    ];
    const body = buildPrBody(files, [], baseConfig);

    expect(body).toContain('### Files Added');
    expect(body).toContain('lectures/new-file.md');
    expect(body).toContain('✅');
  });

  it('should list updated files (with SHA)', () => {
    const files: TranslatedFile[] = [
      { path: 'lectures/existing.md', content: 'content', sha: 'sha123' },
    ];
    const body = buildPrBody(files, [], baseConfig);

    expect(body).toContain('### Files Updated');
    expect(body).toContain('lectures/existing.md');
    expect(body).toContain('✏️');
  });

  it('should list deleted files', () => {
    const deleted = [{ path: 'lectures/removed.md', sha: 'sha456' }];
    const body = buildPrBody([], deleted, baseConfig);

    expect(body).toContain('### Files Deleted');
    expect(body).toContain('lectures/removed.md');
    expect(body).toContain('❌');
  });

  it('should include language and model details', () => {
    const body = buildPrBody([], [], baseConfig);

    expect(body).toContain('**Source Language**: en');
    expect(body).toContain('**Target Language**: zh-cn');
    expect(body).toContain('**Model**: claude-sonnet-4-20250514');
  });

  it('should handle mixed file operations', () => {
    const files: TranslatedFile[] = [
      { path: 'lectures/new.md', content: 'c1' },
      { path: 'lectures/updated.md', content: 'c2', sha: 'sha1' },
    ];
    const deleted = [{ path: 'lectures/removed.md', sha: 'sha2' }];
    const body = buildPrBody(files, deleted, baseConfig);

    expect(body).toContain('### Files Added');
    expect(body).toContain('### Files Updated');
    expect(body).toContain('### Files Deleted');
  });

  it('should include skipped sections notice when provided', () => {
    const skipped = new Map<string, string[]>([
      ['lectures/intro.md', ['Type Hints', 'Advanced Topics']],
    ]);
    const body = buildPrBody([], [], baseConfig, undefined, skipped);

    expect(body).toContain('### ⚠️ Sections Pending Earlier Translation PR');
    expect(body).toContain('`lectures/intro.md`');
    expect(body).toContain('`Type Hints`');
    expect(body).toContain('`Advanced Topics`');
    expect(body).toContain('/translate-resync');
  });

  it('should not include skipped sections notice when empty', () => {
    const body = buildPrBody([], [], baseConfig, undefined, new Map());

    expect(body).not.toContain('Sections Pending');
  });

  it('should escape backticks in skipped section headings', () => {
    const skipped = new Map<string, string[]>([
      ['test.md', ['Code `example` section']],
    ]);
    const body = buildPrBody([], [], baseConfig, undefined, skipped);

    // Heading should be wrapped in backticks with inner backticks escaped
    expect(body).toContain('`Code \\`example\\` section`');
  });
});

// =============================================================================
// buildLabelSet TESTS
// =============================================================================

describe('buildLabelSet', () => {
  it('should include input labels', () => {
    const labels = buildLabelSet(['action-translation', 'automated']);

    expect(labels).toContain('action-translation');
    expect(labels).toContain('automated');
  });

  it('should include source PR labels', () => {
    const labels = buildLabelSet([], ['enhancement', 'documentation']);

    expect(labels).toContain('enhancement');
    expect(labels).toContain('documentation');
  });

  it('should deduplicate labels', () => {
    const labels = buildLabelSet(['automated', 'documentation'], ['documentation', 'enhancement']);

    expect(labels).toHaveLength(3);
    expect(labels).toContain('automated');
    expect(labels).toContain('documentation');
    expect(labels).toContain('enhancement');
  });

  it('should return empty array when no labels', () => {
    const labels = buildLabelSet([]);
    expect(labels).toHaveLength(0);
  });

  it('should handle undefined source labels', () => {
    const labels = buildLabelSet(['action-translation']);
    expect(labels).toEqual(['action-translation']);
  });
});

// =============================================================================
// METADATA BLOCK TESTS
// =============================================================================

describe('buildPrBody metadata block', () => {
  it('should embed translation-sync-metadata HTML comment', () => {
    const files: TranslatedFile[] = [{ path: 'lectures/intro.md', content: 'content' }];
    const body = buildPrBody(files, [], baseConfig);

    expect(body).toContain('<!-- translation-sync-metadata');
    expect(body).toContain('-->');
  });

  it('should include sourceCommitSha in metadata', () => {
    const files: TranslatedFile[] = [{ path: 'lectures/intro.md', content: 'content' }];
    const body = buildPrBody(files, [], baseConfig);

    expect(body).toContain('"sourceCommitSha": "abc123def456"');
  });

  it('should include source repo and PR number in metadata', () => {
    const files: TranslatedFile[] = [{ path: 'lectures/intro.md', content: 'content' }];
    const body = buildPrBody(files, [], baseConfig);

    expect(body).toContain('"sourceRepo": "QuantEcon/lecture-python"');
    expect(body).toContain('"sourcePR": 42');
  });

  it('should include all file paths in metadata', () => {
    const files: TranslatedFile[] = [
      { path: 'lectures/intro.md', content: 'c1' },
      { path: 'lectures/ch1.md', content: 'c2' },
    ];
    const deleted = [{ path: 'lectures/old.md', sha: 'sha1' }];
    const body = buildPrBody(files, deleted, baseConfig);

    expect(body).toContain('"path": "lectures/intro.md"');
    expect(body).toContain('"path": "lectures/ch1.md"');
    expect(body).toContain('"path": "lectures/old.md"');
  });

  it('should produce parseable metadata', () => {
    const files: TranslatedFile[] = [{ path: 'lectures/intro.md', content: 'content' }];
    const body = buildPrBody(files, [], baseConfig, { title: 'Test', labels: [] });
    const metadata = parseTranslationSyncMetadata(body);

    expect(metadata).toBeDefined();
    expect(metadata!.sourceRepo).toBe('QuantEcon/lecture-python');
    expect(metadata!.sourcePR).toBe(42);
    expect(metadata!.sourceCommitSha).toBe('abc123def456');
    expect(metadata!.sourceLanguage).toBe('en');
    expect(metadata!.targetLanguage).toBe('zh-cn');
    expect(metadata!.claudeModel).toBe('claude-sonnet-4-20250514');
    expect(metadata!.files).toEqual([{ path: 'lectures/intro.md' }]);
  });
});

// =============================================================================
// parseTranslationSyncMetadata TESTS
// =============================================================================

describe('parseTranslationSyncMetadata', () => {
  it('should return undefined for body without metadata block', () => {
    const result = parseTranslationSyncMetadata('Just a normal PR body');
    expect(result).toBeUndefined();
  });

  it('should return undefined for malformed JSON', () => {
    const body = '<!-- translation-sync-metadata\n{invalid json}\n-->';
    const result = parseTranslationSyncMetadata(body);
    expect(result).toBeUndefined();
  });

  it('should return undefined for missing required fields', () => {
    const body = '<!-- translation-sync-metadata\n{"sourceRepo": "foo/bar"}\n-->';
    const result = parseTranslationSyncMetadata(body);
    expect(result).toBeUndefined();
  });

  it('should parse valid metadata block', () => {
    const metadata = {
      sourceRepo: 'QuantEcon/lecture-python',
      sourcePR: 100,
      sourceCommitSha: 'deadbeef',
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      claudeModel: 'claude-sonnet-4-20250514',
      files: [{ path: 'lectures/intro.md' }],
    };
    const body = `Some PR text\n<!-- translation-sync-metadata\n${JSON.stringify(metadata, null, 2)}\n-->\nMore text`;
    const result = parseTranslationSyncMetadata(body);

    expect(result).toEqual(metadata);
  });

  it('should handle metadata block surrounded by other content', () => {
    const metadata = {
      sourceRepo: 'Org/repo',
      sourcePR: 5,
      sourceCommitSha: 'aaa111',
      sourceLanguage: 'en',
      targetLanguage: 'zh-cn',
      claudeModel: 'claude-sonnet-4-20250514',
      files: [],
    };
    const body = `## Title\nLots of text here\n\n<!-- translation-sync-metadata\n${JSON.stringify(metadata)}\n-->\n\n*Footer*`;
    const result = parseTranslationSyncMetadata(body);

    expect(result).toBeDefined();
    expect(result!.sourcePR).toBe(5);
  });
});

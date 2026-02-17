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

import { buildPrBody, buildPrTitle, buildLabelSet, PrCreatorConfig } from '../pr-creator';
import { TranslatedFile } from '../types';

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

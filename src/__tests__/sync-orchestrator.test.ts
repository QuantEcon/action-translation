/**
 * Tests for SyncOrchestrator and related utilities
 *
 * Tests:
 * - File classification (classifyChangedFiles)
 * - Glossary loading (loadGlossary)
 * - SyncOrchestrator file processing pipeline
 *   - Markdown files (new + existing)
 *   - Renamed files (with + without existing translation)
 *   - TOC files (copy directly)
 *   - Removed files
 *   - Error recovery (one file fails, others continue)
 *   - Multi-file processing
 */

import { classifyChangedFiles, loadGlossary, SyncOrchestrator, FileToSync, Logger } from '../sync-orchestrator';
import { promises as fs } from 'fs';
import * as path from 'path';

// =============================================================================
// MOCK SETUP
// =============================================================================

// Mock the translator module
jest.mock('../translator', () => ({
  TranslationService: jest.fn().mockImplementation(() => ({
    translateSection: jest.fn(),
    translateDocument: jest.fn(),
  })),
}));

// Mock FileProcessor to avoid actual translation calls
jest.mock('../file-processor', () => ({
  FileProcessor: jest.fn().mockImplementation(() => ({
    processFull: jest.fn().mockImplementation(async (content: string) => {
      return `[TRANSLATED] ${content}`;
    }),
    processSectionBased: jest.fn().mockImplementation(async (_old: string, newContent: string) => {
      return `[UPDATED] ${newContent}`;
    }),
    validateMyST: jest.fn().mockImplementation(async () => ({
      valid: true,
    })),
  })),
}));

// Create a test logger that captures output
function createTestLogger(): Logger & { messages: { level: string; msg: string }[] } {
  const messages: { level: string; msg: string }[] = [];
  return {
    messages,
    info: (msg: string) => messages.push({ level: 'info', msg }),
    error: (msg: string) => messages.push({ level: 'error', msg }),
    warning: (msg: string) => messages.push({ level: 'warning', msg }),
  };
}

// =============================================================================
// classifyChangedFiles TESTS
// =============================================================================

describe('classifyChangedFiles', () => {
  it('should classify markdown files by status', () => {
    const files = [
      { filename: 'lectures/intro.md', status: 'modified' },
      { filename: 'lectures/new-file.md', status: 'added' },
      { filename: 'lectures/old-file.md', status: 'removed' },
      { filename: 'lectures/renamed.md', status: 'renamed', previous_filename: 'lectures/old-name.md' },
    ];

    const result = classifyChangedFiles(files, 'lectures/');

    expect(result.changedMarkdownFiles).toHaveLength(2); // modified + added
    expect(result.removedMarkdownFiles).toHaveLength(1);
    expect(result.renamedMarkdownFiles).toHaveLength(1);
  });

  it('should classify TOC files separately', () => {
    const files = [
      { filename: 'lectures/intro.md', status: 'modified' },
      { filename: 'lectures/_toc.yml', status: 'modified' },
      { filename: 'lectures/_toc.yml', status: 'removed' },
    ];

    const result = classifyChangedFiles(files, 'lectures/');

    expect(result.changedMarkdownFiles).toHaveLength(1);
    expect(result.changedTocFiles).toHaveLength(1); // modified, not removed
    expect(result.removedTocFiles).toHaveLength(1);
  });

  it('should filter by docsFolder prefix', () => {
    const files = [
      { filename: 'lectures/intro.md', status: 'modified' },
      { filename: 'other/readme.md', status: 'modified' },
      { filename: 'README.md', status: 'modified' },
    ];

    const result = classifyChangedFiles(files, 'lectures/');

    expect(result.changedMarkdownFiles).toHaveLength(1);
    expect(result.changedMarkdownFiles[0].filename).toBe('lectures/intro.md');
  });

  it('should handle empty docsFolder (root-level files)', () => {
    const files = [
      { filename: 'intro.md', status: 'modified' },
      { filename: 'sub/nested.md', status: 'modified' },
    ];

    const result = classifyChangedFiles(files, '');

    // Empty prefix matches everything
    expect(result.changedMarkdownFiles).toHaveLength(2);
  });

  it('should return empty arrays when no files match', () => {
    const files = [
      { filename: 'src/index.ts', status: 'modified' },
      { filename: 'package.json', status: 'modified' },
    ];

    const result = classifyChangedFiles(files, 'lectures/');

    expect(result.changedMarkdownFiles).toHaveLength(0);
    expect(result.renamedMarkdownFiles).toHaveLength(0);
    expect(result.changedTocFiles).toHaveLength(0);
    expect(result.removedMarkdownFiles).toHaveLength(0);
    expect(result.removedTocFiles).toHaveLength(0);
  });

  it('should handle mixed file types correctly', () => {
    const files = [
      { filename: 'lectures/intro.md', status: 'added' },
      { filename: 'lectures/ch1.md', status: 'modified' },
      { filename: 'lectures/ch2.md', status: 'renamed', previous_filename: 'lectures/old-ch2.md' },
      { filename: 'lectures/ch3.md', status: 'removed' },
      { filename: 'lectures/_toc.yml', status: 'modified' },
      { filename: 'lectures/sub/_toc.yml', status: 'removed' },
    ];

    const result = classifyChangedFiles(files, 'lectures/');

    expect(result.changedMarkdownFiles).toHaveLength(2); // added + modified
    expect(result.renamedMarkdownFiles).toHaveLength(1);
    expect(result.removedMarkdownFiles).toHaveLength(1);
    expect(result.changedTocFiles).toHaveLength(1);
    expect(result.removedTocFiles).toHaveLength(1);
  });
});

// =============================================================================
// loadGlossary TESTS
// =============================================================================

describe('loadGlossary', () => {
  const glossaryDir = path.join(__dirname, '..', '..', 'glossary');

  it('should load built-in glossary for zh-cn', async () => {
    const glossary = await loadGlossary('zh-cn', glossaryDir);

    expect(glossary).toBeDefined();
    expect(glossary!.terms.length).toBeGreaterThan(0);
  });

  it('should load built-in glossary for fa', async () => {
    const glossary = await loadGlossary('fa', glossaryDir);

    expect(glossary).toBeDefined();
    expect(glossary!.terms.length).toBeGreaterThan(0);
  });

  it('should return undefined for unknown language', async () => {
    const glossary = await loadGlossary('xx-unknown', glossaryDir);
    expect(glossary).toBeUndefined();
  });

  it('should log warning when built-in glossary not found', async () => {
    const logger = createTestLogger();
    await loadGlossary('xx-unknown', glossaryDir, undefined, logger);

    const warnings = logger.messages.filter(m => m.level === 'warning');
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('should fall back to custom glossary path', async () => {
    // Use zh-cn glossary as "custom" path
    const customPath = path.join(glossaryDir, 'zh-cn.json');
    const glossary = await loadGlossary('xx-unknown', glossaryDir, customPath);

    expect(glossary).toBeDefined();
    expect(glossary!.terms.length).toBeGreaterThan(0);
  });

  it('should return undefined when both built-in and custom fail', async () => {
    const glossary = await loadGlossary('xx-unknown', glossaryDir, '/nonexistent/path.json');
    expect(glossary).toBeUndefined();
  });
});

// =============================================================================
// SyncOrchestrator TESTS
// =============================================================================

describe('SyncOrchestrator', () => {
  let orchestrator: SyncOrchestrator;
  let logger: ReturnType<typeof createTestLogger>;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = createTestLogger();
    orchestrator = new SyncOrchestrator({
      sourceLanguage: 'en',
      targetLanguage: 'zh-cn',
      claudeModel: 'claude-sonnet-4-20250514',
      anthropicApiKey: 'test-key',
      debugMode: false,
    }, logger);
  });

  describe('processFiles - markdown files', () => {
    it('should process a new markdown file with full translation', async () => {
      const files: FileToSync[] = [{
        filename: 'lectures/intro.md',
        type: 'markdown',
        newContent: '# Introduction\n\nSome content',
        isNewFile: true,
      }];

      const result = await orchestrator.processFiles(files);

      expect(result.processedFiles).toHaveLength(1);
      expect(result.translatedFiles).toHaveLength(1);
      expect(result.translatedFiles[0].path).toBe('lectures/intro.md');
      expect(result.translatedFiles[0].content).toContain('[TRANSLATED]');
      expect(result.errors).toHaveLength(0);
    });

    it('should process an existing markdown file with section-based update', async () => {
      const files: FileToSync[] = [{
        filename: 'lectures/intro.md',
        type: 'markdown',
        newContent: '# Introduction\n\nUpdated content',
        oldContent: '# Introduction\n\nOld content',
        targetContent: '# 介绍\n\n旧内容',
        existingFileSha: 'abc123',
        isNewFile: false,
      }];

      const result = await orchestrator.processFiles(files);

      expect(result.processedFiles).toHaveLength(1);
      expect(result.translatedFiles).toHaveLength(1);
      expect(result.translatedFiles[0].sha).toBe('abc123');
      expect(result.translatedFiles[0].content).toContain('[UPDATED]');
      expect(result.errors).toHaveLength(0);
    });

    it('should error when no content provided', async () => {
      const files: FileToSync[] = [{
        filename: 'lectures/intro.md',
        type: 'markdown',
        isNewFile: true,
        // No newContent!
      }];

      const result = await orchestrator.processFiles(files);

      expect(result.processedFiles).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('No content provided');
    });
  });

  describe('processFiles - renamed files', () => {
    it('should process a renamed file with existing translation', async () => {
      const files: FileToSync[] = [{
        filename: 'lectures/new-name.md',
        type: 'renamed',
        newContent: '# Content\n\nSome text',
        oldContent: '# Content\n\nSome text',
        targetContent: '# 内容\n\n一些文本',
        previousFilename: 'lectures/old-name.md',
        oldFileSha: 'old-sha-123',
        isNewFile: false,
      }];

      const result = await orchestrator.processFiles(files);

      expect(result.processedFiles).toHaveLength(1);
      expect(result.translatedFiles).toHaveLength(1);
      expect(result.translatedFiles[0].path).toBe('lectures/new-name.md');
      expect(result.translatedFiles[0].sha).toBeUndefined(); // New path, no SHA
      expect(result.filesToDelete).toHaveLength(1);
      expect(result.filesToDelete[0].path).toBe('lectures/old-name.md');
      expect(result.filesToDelete[0].sha).toBe('old-sha-123');
    });

    it('should process a renamed file without existing translation (full translation)', async () => {
      const files: FileToSync[] = [{
        filename: 'lectures/new-name.md',
        type: 'renamed',
        newContent: '# Content\n\nSome text',
        previousFilename: 'lectures/old-name.md',
        isNewFile: true,
      }];

      const result = await orchestrator.processFiles(files);

      expect(result.processedFiles).toHaveLength(1);
      expect(result.translatedFiles).toHaveLength(1);
      expect(result.translatedFiles[0].content).toContain('[TRANSLATED]');
      expect(result.filesToDelete).toHaveLength(0); // No old file to delete
    });
  });

  describe('processFiles - TOC files', () => {
    it('should copy TOC files directly without translation', async () => {
      const files: FileToSync[] = [{
        filename: 'lectures/_toc.yml',
        type: 'toc',
        newContent: 'format: jb-book\nroot: intro',
        existingFileSha: 'toc-sha-123',
        isNewFile: false,
      }];

      const result = await orchestrator.processFiles(files);

      expect(result.processedFiles).toHaveLength(1);
      expect(result.translatedFiles).toHaveLength(1);
      expect(result.translatedFiles[0].content).toBe('format: jb-book\nroot: intro');
      expect(result.translatedFiles[0].sha).toBe('toc-sha-123');
    });
  });

  describe('processFiles - removed files', () => {
    it('should track removed files for deletion', async () => {
      const files: FileToSync[] = [{
        filename: 'lectures/old-lecture.md',
        type: 'removed',
        existingFileSha: 'del-sha-456',
        isNewFile: false,
      }];

      const result = await orchestrator.processFiles(files);

      expect(result.processedFiles).toHaveLength(1);
      expect(result.filesToDelete).toHaveLength(1);
      expect(result.filesToDelete[0].path).toBe('lectures/old-lecture.md');
      expect(result.filesToDelete[0].sha).toBe('del-sha-456');
    });

    it('should skip removal when file does not exist in target', async () => {
      const files: FileToSync[] = [{
        filename: 'lectures/old-lecture.md',
        type: 'removed',
        isNewFile: false,
        // No existingFileSha - file doesn't exist in target
      }];

      const result = await orchestrator.processFiles(files);

      expect(result.processedFiles).toHaveLength(0);
      expect(result.filesToDelete).toHaveLength(0);
    });
  });

  describe('processFiles - error recovery', () => {
    it('should continue processing when one file fails', async () => {
      const files: FileToSync[] = [
        {
          filename: 'lectures/bad-file.md',
          type: 'markdown',
          isNewFile: true,
          // No content - will fail
        },
        {
          filename: 'lectures/good-file.md',
          type: 'markdown',
          newContent: '# Good\n\nContent',
          isNewFile: true,
        },
      ];

      const result = await orchestrator.processFiles(files);

      expect(result.processedFiles).toHaveLength(1);
      expect(result.processedFiles[0]).toBe('lectures/good-file.md');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('bad-file.md');
    });
  });

  describe('processFiles - multi-file processing', () => {
    it('should process a mix of file types correctly', async () => {
      const files: FileToSync[] = [
        {
          filename: 'lectures/intro.md',
          type: 'markdown',
          newContent: '# Intro\n\nNew content',
          oldContent: '# Intro\n\nOld content',
          targetContent: '# 介绍\n\n旧内容',
          existingFileSha: 'sha1',
          isNewFile: false,
        },
        {
          filename: 'lectures/new-lecture.md',
          type: 'markdown',
          newContent: '# New Lecture\n\nContent',
          isNewFile: true,
        },
        {
          filename: 'lectures/_toc.yml',
          type: 'toc',
          newContent: 'format: jb-book\nroot: intro',
          isNewFile: true,
        },
        {
          filename: 'lectures/old-lecture.md',
          type: 'removed',
          existingFileSha: 'del-sha',
          isNewFile: false,
        },
      ];

      const result = await orchestrator.processFiles(files);

      expect(result.processedFiles).toHaveLength(4);
      expect(result.translatedFiles).toHaveLength(3); // 2 markdown + 1 TOC
      expect(result.filesToDelete).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });
  });
});

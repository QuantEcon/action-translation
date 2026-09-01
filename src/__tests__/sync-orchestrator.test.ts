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

import {
  classifyChangedFiles,
  loadGlossary,
  formatGlossaryTerms,
  removeTocFileEntries,
  collectTocFiles,
  SyncOrchestrator,
  FileToSync,
  Logger,
  StateGenerationConfig,
} from '../sync-orchestrator.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';

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
      {
        filename: 'lectures/renamed.md',
        status: 'renamed',
        previous_filename: 'lectures/old-name.md',
      },
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

    const warnings = logger.messages.filter((m) => m.level === 'warning');
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('should use the custom glossary path when given', async () => {
    // Use zh-cn glossary as "custom" path
    const customPath = path.join(glossaryDir, 'zh-cn.json');
    const glossary = await loadGlossary('xx-unknown', glossaryDir, customPath);

    expect(glossary).toBeDefined();
    expect(glossary!.terms.length).toBeGreaterThan(0);
  });

  // A custom glossary is an OVERRIDE, not a fallback (#146). It used to be tried
  // only after the built-in one, so for every language that ships a glossary —
  // the whole estate — `glossary-path` was silently dead.
  it('should prefer the custom glossary over the built-in one', async () => {
    const customPath = path.join(glossaryDir, 'fa.json');
    const builtIn = await loadGlossary('zh-cn', glossaryDir);
    const glossary = await loadGlossary('zh-cn', glossaryDir, customPath);

    expect(glossary).toBeDefined();
    expect(glossary).not.toEqual(builtIn);
    expect(glossary).toEqual(await loadGlossary('fa', glossaryDir));
  });

  it('should report which glossary it used', async () => {
    const logger = createTestLogger();
    await loadGlossary('zh-cn', glossaryDir, path.join(glossaryDir, 'fa.json'), logger);

    const info = logger.messages.filter((m) => m.level === 'info');
    expect(info).toHaveLength(1);
    expect(info[0].msg).toContain('custom glossary');
    expect(info[0].msg).toContain('fa.json');
  });

  it('should throw rather than fall back when the custom path is unreadable', async () => {
    // Silently degrading to different terminology is the failure being removed;
    // a configured-but-missing glossary is a misconfiguration, so fail the run.
    await expect(loadGlossary('zh-cn', glossaryDir, '/nonexistent/path.json')).rejects.toThrow(
      /Could not load custom glossary/
    );
  });

  it('should throw when the custom glossary has no terms array', async () => {
    const tmp = path.join(os.tmpdir(), `glossary-no-terms-${process.pid}.json`);
    fs.writeFileSync(tmp, JSON.stringify({ version: '1.0' }), 'utf-8');
    try {
      await expect(loadGlossary('zh-cn', glossaryDir, tmp)).rejects.toThrow(/no "terms" array/);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('should not double the "Error:" prefix in the thrown message', async () => {
    // run() re-wraps with `Action failed: ${error.message}`, so interpolating the
    // caught Error object put a second "Error:" in the middle of the line.
    const message = await loadGlossary('zh-cn', glossaryDir, '/nonexistent/path.json').then(
      () => 'did not throw',
      (error: Error) => error.message
    );

    expect(message).toContain('ENOENT');
    expect(message).not.toContain(': Error:');
  });

  // The built-in branch validates the same way the custom one does, so a
  // malformed shipped glossary is reported rather than returned and blown up on
  // downstream (it used to log "with undefined terms" and hand the object back).
  it('should warn and return undefined when the built-in glossary is malformed', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'builtin-glossary-'));
    fs.writeFileSync(path.join(dir, 'xx-broken.json'), JSON.stringify({ terms: {} }), 'utf-8');
    const logger = createTestLogger();

    try {
      const glossary = await loadGlossary('xx-broken', dir, undefined, logger);

      expect(glossary).toBeUndefined();
      const warnings = logger.messages.filter((m) => m.level === 'warning');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].msg).toContain('terms');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// =============================================================================
// formatGlossaryTerms TESTS
// =============================================================================

describe('formatGlossaryTerms', () => {
  it('renders one prompt line per term with the target rendering', () => {
    const formatted = formatGlossaryTerms(
      { version: '1.0', terms: [{ en: 'Marginal distribution', 'zh-cn': '边缘分布' }] },
      'zh-cn'
    );

    expect(formatted).toBe('- "Marginal distribution" → "边缘分布"');
  });

  it('appends the disambiguating context when present', () => {
    const formatted = formatGlossaryTerms(
      {
        version: '1.0',
        terms: [{ en: 'Marginal revenue', 'zh-cn': '边际收入', context: 'microeconomics' }],
      },
      'zh-cn'
    );

    expect(formatted).toBe('- "Marginal revenue" → "边际收入" (microeconomics)');
  });

  it('skips a term the glossary has not translated, matching the translator (#163)', () => {
    // The old behaviour — rendering `- "Kernel" → ""` — meant the reviewer
    // judged against a term the translator had filtered out and never saw.
    const formatted = formatGlossaryTerms(
      { version: '1.0', terms: [{ en: 'Kernel' }, { en: 'Matrix', 'zh-cn': '矩阵' }] },
      'zh-cn'
    );

    expect(formatted).toBe('- "Matrix" → "矩阵"');
  });

  it('joins multiple terms one per line', () => {
    const formatted = formatGlossaryTerms(
      {
        version: '1.0',
        terms: [
          { en: 'Eigenvector', 'zh-cn': '特征向量' },
          { en: 'Markov chain', 'zh-cn': '马尔可夫链' },
        ],
      },
      'zh-cn'
    );

    expect(formatted.split('\n')).toHaveLength(2);
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
    orchestrator = new SyncOrchestrator(
      {
        sourceLanguage: 'en',
        targetLanguage: 'zh-cn',
        claudeModel: 'claude-sonnet-4-20250514',
        anthropicApiKey: 'test-key',
        debugMode: false,
      },
      logger
    );
  });

  describe('processFiles - markdown files', () => {
    it('should process a new markdown file with full translation', async () => {
      const files: FileToSync[] = [
        {
          filename: 'lectures/intro.md',
          type: 'markdown',
          newContent: '# Introduction\n\nSome content',
          isNewFile: true,
        },
      ];

      const result = await orchestrator.processFiles(files);

      expect(result.processedFiles).toHaveLength(1);
      expect(result.translatedFiles).toHaveLength(1);
      expect(result.translatedFiles[0].path).toBe('lectures/intro.md');
      expect(result.translatedFiles[0].content).toContain('[TRANSLATED]');
      expect(result.errors).toHaveLength(0);
    });

    it('should process an existing markdown file with section-based update', async () => {
      const files: FileToSync[] = [
        {
          filename: 'lectures/intro.md',
          type: 'markdown',
          newContent: '# Introduction\n\nUpdated content',
          oldContent: '# Introduction\n\nOld content',
          targetContent: '# 介绍\n\n旧内容',
          existingFileSha: 'abc123',
          isNewFile: false,
        },
      ];

      const result = await orchestrator.processFiles(files);

      expect(result.processedFiles).toHaveLength(1);
      expect(result.translatedFiles).toHaveLength(1);
      expect(result.translatedFiles[0].sha).toBe('abc123');
      expect(result.translatedFiles[0].content).toContain('[UPDATED]');
      expect(result.errors).toHaveLength(0);
    });

    it('should error when no content provided', async () => {
      const files: FileToSync[] = [
        {
          filename: 'lectures/intro.md',
          type: 'markdown',
          isNewFile: true,
          // No newContent!
        },
      ];

      const result = await orchestrator.processFiles(files);

      expect(result.processedFiles).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('No content provided');
    });
  });

  describe('processFiles - renamed files', () => {
    it('should process a renamed file with existing translation', async () => {
      const files: FileToSync[] = [
        {
          filename: 'lectures/new-name.md',
          type: 'renamed',
          newContent: '# Content\n\nSome text',
          oldContent: '# Content\n\nSome text',
          targetContent: '# 内容\n\n一些文本',
          previousFilename: 'lectures/old-name.md',
          oldFileSha: 'old-sha-123',
          isNewFile: false,
        },
      ];

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
      const files: FileToSync[] = [
        {
          filename: 'lectures/new-name.md',
          type: 'renamed',
          newContent: '# Content\n\nSome text',
          previousFilename: 'lectures/old-name.md',
          isNewFile: true,
        },
      ];

      const result = await orchestrator.processFiles(files);

      expect(result.processedFiles).toHaveLength(1);
      expect(result.translatedFiles).toHaveLength(1);
      expect(result.translatedFiles[0].content).toContain('[TRANSLATED]');
      expect(result.filesToDelete).toHaveLength(0); // No old file to delete
    });
  });

  describe('processFiles - TOC files', () => {
    it('should copy TOC files directly without translation', async () => {
      const files: FileToSync[] = [
        {
          filename: 'lectures/_toc.yml',
          type: 'toc',
          newContent: 'format: jb-book\nroot: intro',
          existingFileSha: 'toc-sha-123',
          isNewFile: false,
        },
      ];

      const result = await orchestrator.processFiles(files);

      expect(result.processedFiles).toHaveLength(1);
      expect(result.translatedFiles).toHaveLength(1);
      expect(result.translatedFiles[0].content).toBe('format: jb-book\nroot: intro');
      expect(result.translatedFiles[0].sha).toBe('toc-sha-123');
    });
  });

  describe('processFiles - removed files', () => {
    it('should track removed files for deletion', async () => {
      const files: FileToSync[] = [
        {
          filename: 'lectures/old-lecture.md',
          type: 'removed',
          existingFileSha: 'del-sha-456',
          isNewFile: false,
        },
      ];

      const result = await orchestrator.processFiles(files);

      expect(result.processedFiles).toHaveLength(1);
      expect(result.filesToDelete).toHaveLength(1);
      expect(result.filesToDelete[0].path).toBe('lectures/old-lecture.md');
      expect(result.filesToDelete[0].sha).toBe('del-sha-456');
    });

    it('should skip removal when file does not exist in target', async () => {
      const files: FileToSync[] = [
        {
          filename: 'lectures/old-lecture.md',
          type: 'removed',
          isNewFile: false,
          // No existingFileSha - file doesn't exist in target
        },
      ];

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

  // ===========================================================================
  // STATE GENERATION TESTS
  // ===========================================================================

  describe('processFiles - state generation', () => {
    let stateOrchestrator: SyncOrchestrator;
    let stateLogger: ReturnType<typeof createTestLogger>;
    const stateConfig: StateGenerationConfig = {
      sourceCommitSha: 'abc123def456',
      existingStateShas: new Map(),
      docsFolder: 'lectures/',
    };

    beforeEach(() => {
      stateLogger = createTestLogger();
      stateOrchestrator = new SyncOrchestrator(
        {
          sourceLanguage: 'en',
          targetLanguage: 'zh-cn',
          claudeModel: 'claude-sonnet-4-20250514',
          anthropicApiKey: 'test-key',
          debugMode: false,
        },
        stateLogger,
        stateConfig
      );
    });

    it('should generate state file alongside new markdown translation', async () => {
      const files: FileToSync[] = [
        {
          filename: 'lectures/intro.md',
          type: 'markdown',
          newContent:
            '# Introduction\n\n## Section One\n\nContent\n\n## Section Two\n\nMore content',
          isNewFile: true,
        },
      ];

      const result = await stateOrchestrator.processFiles(files);

      // 1 translated file + 1 state file
      expect(result.translatedFiles).toHaveLength(2);
      const stateFile = result.translatedFiles.find((f) => f.path.startsWith('.translate/'));
      expect(stateFile).toBeDefined();
      expect(stateFile!.path).toBe('.translate/state/intro.md.yml');

      // Parse and check state content
      const state = yaml.load(stateFile!.content) as Record<string, unknown>;
      expect(state['source-sha']).toBe('abc123def456');
      expect(state['model']).toBe('claude-sonnet-4-20250514');
      expect(state['mode']).toBe('NEW');
      expect(state['section-count']).toBe(2);
      expect(state['synced-at']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should generate state file with UPDATE mode for existing file', async () => {
      const files: FileToSync[] = [
        {
          filename: 'lectures/intro.md',
          type: 'markdown',
          newContent: '# Introduction\n\n## Section One\n\nUpdated',
          oldContent: '# Introduction\n\n## Section One\n\nOld',
          targetContent: '# 介绍\n\n## 第一节\n\n旧的',
          existingFileSha: 'target-sha',
          isNewFile: false,
        },
      ];

      const result = await stateOrchestrator.processFiles(files);

      const stateFile = result.translatedFiles.find((f) => f.path.startsWith('.translate/'));
      expect(stateFile).toBeDefined();

      const state = yaml.load(stateFile!.content) as Record<string, unknown>;
      expect(state['mode']).toBe('UPDATE');
    });

    it('should use per-file sourceCommitSha when provided', async () => {
      const files: FileToSync[] = [
        {
          filename: 'lectures/intro.md',
          type: 'markdown',
          newContent: '# Introduction\n\nContent',
          isNewFile: true,
          sourceCommitSha: 'per-file-sha-999',
        },
      ];

      const result = await stateOrchestrator.processFiles(files);

      const stateFile = result.translatedFiles.find((f) => f.path.startsWith('.translate/'));
      const state = yaml.load(stateFile!.content) as Record<string, unknown>;
      expect(state['source-sha']).toBe('per-file-sha-999');
    });

    it('should use existing state SHA when updating state file', async () => {
      const existingShas = new Map([['.translate/state/intro.md.yml', 'existing-state-blob-sha']]);
      const orchWithExisting = new SyncOrchestrator(
        {
          sourceLanguage: 'en',
          targetLanguage: 'zh-cn',
          claudeModel: 'claude-sonnet-4-20250514',
          anthropicApiKey: 'test-key',
        },
        stateLogger,
        { sourceCommitSha: 'abc123', existingStateShas: existingShas, docsFolder: 'lectures/' }
      );

      const files: FileToSync[] = [
        {
          filename: 'lectures/intro.md',
          type: 'markdown',
          newContent: '# Introduction\n\nContent',
          existingFileSha: 'target-sha',
          isNewFile: false,
          oldContent: '',
          targetContent: '# 介绍\n\n内容',
        },
      ];

      const result = await orchWithExisting.processFiles(files);

      const stateFile = result.translatedFiles.find((f) => f.path.startsWith('.translate/'));
      expect(stateFile!.sha).toBe('existing-state-blob-sha');
    });

    it('should not generate state files when stateConfig is absent', async () => {
      // Use the default orchestrator (no stateConfig)
      const files: FileToSync[] = [
        {
          filename: 'lectures/intro.md',
          type: 'markdown',
          newContent: '# Introduction\n\nContent',
          isNewFile: true,
        },
      ];

      const result = await orchestrator.processFiles(files);

      // Only the translated file, no state file
      expect(result.translatedFiles).toHaveLength(1);
      expect(result.translatedFiles[0].path).toBe('lectures/intro.md');
    });

    it('should generate state for renamed files and delete old state', async () => {
      const existingShas = new Map([['.translate/state/old-name.md.yml', 'old-state-sha']]);
      const orchWithExisting = new SyncOrchestrator(
        {
          sourceLanguage: 'en',
          targetLanguage: 'zh-cn',
          claudeModel: 'claude-sonnet-4-20250514',
          anthropicApiKey: 'test-key',
        },
        stateLogger,
        { sourceCommitSha: 'abc123', existingStateShas: existingShas, docsFolder: 'lectures/' }
      );

      const files: FileToSync[] = [
        {
          filename: 'lectures/new-name.md',
          type: 'renamed',
          newContent: '# Content\n\n## Section\n\nText',
          oldContent: '# Content\n\nText',
          targetContent: '# 内容\n\n文本',
          previousFilename: 'lectures/old-name.md',
          oldFileSha: 'old-file-sha',
          isNewFile: false,
        },
      ];

      const result = await orchWithExisting.processFiles(files);

      // Should have: translated file + new state file
      const stateFile = result.translatedFiles.find((f) => f.path.startsWith('.translate/'));
      expect(stateFile).toBeDefined();
      expect(stateFile!.path).toBe('.translate/state/new-name.md.yml');

      // Should delete old file AND old state file
      expect(result.filesToDelete).toHaveLength(2);
      expect(result.filesToDelete.map((f) => f.path)).toContain('lectures/old-name.md');
      expect(result.filesToDelete.map((f) => f.path)).toContain('.translate/state/old-name.md.yml');
    });

    it('should delete state file when source file is removed', async () => {
      const existingShas = new Map([['.translate/state/removed.md.yml', 'state-sha-to-delete']]);
      const orchWithExisting = new SyncOrchestrator(
        {
          sourceLanguage: 'en',
          targetLanguage: 'zh-cn',
          claudeModel: 'claude-sonnet-4-20250514',
          anthropicApiKey: 'test-key',
        },
        stateLogger,
        { sourceCommitSha: 'abc123', existingStateShas: existingShas, docsFolder: 'lectures/' }
      );

      const files: FileToSync[] = [
        {
          filename: 'lectures/removed.md',
          type: 'removed',
          existingFileSha: 'del-sha',
          isNewFile: false,
        },
      ];

      const result = await orchWithExisting.processFiles(files);

      // Should delete both the translated file and its state file
      expect(result.filesToDelete).toHaveLength(2);
      expect(result.filesToDelete.map((f) => f.path)).toContain('lectures/removed.md');
      expect(result.filesToDelete.map((f) => f.path)).toContain('.translate/state/removed.md.yml');
    });

    it('should not generate state for TOC files', async () => {
      const files: FileToSync[] = [
        {
          filename: 'lectures/_toc.yml',
          type: 'toc',
          newContent: 'format: jb-book\nroot: intro',
          isNewFile: true,
        },
      ];

      const result = await stateOrchestrator.processFiles(files);

      // Only the TOC file, no state file
      expect(result.translatedFiles).toHaveLength(1);
      expect(result.translatedFiles[0].path).toBe('lectures/_toc.yml');
    });

    it('should count sections correctly including nested sections', async () => {
      const files: FileToSync[] = [
        {
          filename: 'lectures/complex.md',
          type: 'markdown',
          newContent: [
            '# Complex Lecture',
            '',
            '## First Section',
            '',
            'Content',
            '',
            '### Subsection 1.1',
            '',
            'Details',
            '',
            '## Second Section',
            '',
            'More content',
            '',
            '## Third Section',
            '',
            'Final content',
          ].join('\n'),
          isNewFile: true,
        },
      ];

      const result = await stateOrchestrator.processFiles(files);

      const stateFile = result.translatedFiles.find((f) => f.path.startsWith('.translate/'));
      const state = yaml.load(stateFile!.content) as Record<string, unknown>;
      // 3 top-level sections (## headings)
      expect(state['section-count']).toBe(3);
    });
  });
});

// =============================================================================
// removeTocFileEntries TESTS (#156)
// =============================================================================

describe('removeTocFileEntries', () => {
  const flatToc = `format: jb-book
root: intro
chapters:
  - file: intro
  - file: lecture-a
  - file: lecture-b
`;

  const partsToc = `format: jb-book
root: intro
parts:
  - caption: Basics
    chapters:
      - file: intro
      - file: lecture-a
  - caption: Advanced
    chapters:
      - file: lecture-b
      - file: lecture-c
`;

  // The house style of every QuantEcon `_toc.yml`: zero-indent sequences,
  // a `numbered:` key per part, and the stray trailing spaces real files
  // carry.  js-yaml re-indents this on a round trip, so byte-identity here is
  // the property that keeps a one-entry removal a one-line diff.
  const quantEconToc = `format: jb-book
root: intro
parts:
- caption: Tools and Techniques
  numbered: true 
  chapters:
  - file: sir_model
  - file: linear_algebra
  - file: qr_decomp
- caption: Elementary Statistics 
  numbered: true
  chapters:
  - file: prob_matrix  # keep
  - file: "lln_clt"
  - file: prob_meaning
`;

  it('removes matching entries from flat chapters list', () => {
    const result = removeTocFileEntries(flatToc, new Set(['lecture-a']));

    const doc = yaml.load(result) as Record<string, unknown>;
    const chapters = doc.chapters as Array<{ file: string }>;
    expect(chapters.map((c) => c.file)).toEqual(['intro', 'lecture-b']);
  });

  it('removes matching entries from parts chapters lists', () => {
    const result = removeTocFileEntries(partsToc, new Set(['lecture-a', 'lecture-c']));

    const doc = yaml.load(result) as Record<string, unknown>;
    const parts = doc.parts as Array<{ chapters: Array<{ file: string }> }>;
    expect(parts[0].chapters.map((c) => c.file)).toEqual(['intro']);
    expect(parts[1].chapters.map((c) => c.file)).toEqual(['lecture-b']);
  });

  it('returns the original string (same reference) when no entries match or the drop set is empty', () => {
    expect(removeTocFileEntries(flatToc, new Set(['nonexistent']))).toBe(flatToc);
    expect(removeTocFileEntries(flatToc, new Set())).toBe(flatToc);
  });

  it('handles subdirectory file stems correctly', () => {
    const toc = `format: jb-book
root: intro
chapters:
  - file: subdir/lecture-a
  - file: lecture-b
`;
    const result = removeTocFileEntries(toc, new Set(['subdir/lecture-a']));
    const doc = yaml.load(result) as Record<string, unknown>;
    const chapters = doc.chapters as Array<{ file: string }>;
    expect(chapters.map((c) => c.file)).toEqual(['lecture-b']);
  });

  it('is byte-identical to the input apart from the removed line on a QuantEcon-style TOC', () => {
    const result = removeTocFileEntries(quantEconToc, new Set(['linear_algebra']));
    expect(result).toBe(quantEconToc.replace('  - file: linear_algebra\n', ''));
  });

  it('preserves quoting, comments and trailing whitespace when removing several entries', () => {
    const result = removeTocFileEntries(quantEconToc, new Set(['sir_model', 'lln_clt']));
    expect(result).toBe(
      quantEconToc.replace('  - file: sir_model\n', '').replace('  - file: "lln_clt"\n', '')
    );
    // The comment and the trailing spaces survive verbatim.
    expect(result).toContain('  - file: prob_matrix  # keep\n');
    expect(result).toContain('  numbered: true \n');
    expect(result).toContain('- caption: Elementary Statistics \n');
  });

  it("removes an entry's title and nested sections along with it", () => {
    const toc = `format: jb-book
root: intro
chapters:
- file: lecture-a
  title: Lecture A
  sections:
  - file: lecture-a-part-1
  - file: lecture-a-part-2

- file: lecture-b
`;
    const result = removeTocFileEntries(toc, new Set(['lecture-a']));
    expect(result).toBe(`format: jb-book
root: intro
chapters:

- file: lecture-b
`);
  });

  it('removes a nested sections entry under a chapter that stays', () => {
    const toc = `format: jb-book
root: intro
chapters:
- file: lecture-a
  sections:
  - file: lecture-a-part-1
  - file: lecture-a-part-2
- file: lecture-b
`;
    const result = removeTocFileEntries(toc, new Set(['lecture-a-part-2']));
    expect(result).toBe(toc.replace('  - file: lecture-a-part-2\n', ''));
  });

  it('leaves url: and glob: siblings alone', () => {
    const toc = `format: jb-book
root: intro
chapters:
- url: https://example.org
  title: External
- glob: appendix/*
- file: lecture-a
`;
    const result = removeTocFileEntries(toc, new Set(['lecture-a']));
    expect(result).toBe(toc.replace('- file: lecture-a\n', ''));
  });

  it('falls back to a re-serialised document when the layout is not line-spliceable', () => {
    // A dash on its own line is valid YAML the line splice does not recognise;
    // the parse-verified fallback must still remove the entry.
    const toc = `format: jb-book
root: intro
chapters:
-
  file: lecture-a
-
  file: lecture-b
`;
    const result = removeTocFileEntries(toc, new Set(['lecture-a']));
    expect(result).not.toBe(toc);
    const doc = yaml.load(result) as Record<string, unknown>;
    const chapters = doc.chapters as Array<{ file: string }>;
    expect(chapters.map((c) => c.file)).toEqual(['lecture-b']);
  });

  it('returns the input unchanged when it is not parseable YAML', () => {
    const broken = 'chapters:\n  - file: [unclosed\n';
    expect(removeTocFileEntries(broken, new Set(['unclosed']))).toBe(broken);
  });
});

describe('collectTocFiles', () => {
  it('walks chapters, sections and parts in document order', () => {
    const doc = yaml.load(`format: jb-book
root: intro
parts:
- caption: A
  chapters:
  - file: a1
    sections:
    - file: a1-i
      sections:
      - file: a1-i-x
  - file: a2
- caption: B
  chapters:
  - url: https://example.org
  - file: b1
`);
    expect(collectTocFiles(doc)).toEqual(['a1', 'a1-i', 'a1-i-x', 'a2', 'b1']);
  });

  it('returns an empty list for a non-object document', () => {
    expect(collectTocFiles(null)).toEqual([]);
    expect(collectTocFiles('string')).toEqual([]);
  });
});

// =============================================================================
// SyncOrchestrator — TOC filtering for failed new files (#156)
// =============================================================================

describe('SyncOrchestrator — TOC filtering for failed new files (#156)', () => {
  let orchestrator: SyncOrchestrator;
  let logger: ReturnType<typeof createTestLogger>;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = createTestLogger();
    orchestrator = new SyncOrchestrator(
      {
        sourceLanguage: 'en',
        targetLanguage: 'zh-cn',
        claudeModel: 'claude-sonnet-4-20250514',
        anthropicApiKey: 'test-key',
        debugMode: false,
      },
      logger
    );
  });

  it('removes the TOC entry for a new file that failed to translate, touching nothing else', async () => {
    const toc = `format: jb-book
root: intro
chapters:
- file: intro
- file: failed-lecture
- file: good-lecture
`;
    const files: FileToSync[] = [
      {
        filename: 'lectures/good-lecture.md',
        type: 'markdown',
        newContent: '# Good\n\nContent',
        isNewFile: true,
      },
      {
        filename: 'lectures/failed-lecture.md',
        type: 'markdown',
        // no newContent → will throw "No content provided" inside the loop
        isNewFile: true,
      },
      {
        filename: 'lectures/_toc.yml',
        type: 'toc',
        newContent: toc,
        isNewFile: false,
      },
    ];

    const result = await orchestrator.processFiles(files);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('failed-lecture.md');

    const tocEntry = result.translatedFiles.find((f) => f.path === 'lectures/_toc.yml');
    expect(tocEntry!.content).toBe(toc.replace('- file: failed-lecture\n', ''));
    expect(result.failedNewFiles).toEqual(['lectures/failed-lecture.md']);
    expect(result.filteredTocPaths).toEqual(['lectures/_toc.yml']);
  });

  it('keeps the TOC entry for an existing file that errored (file already in target)', async () => {
    const toc = `format: jb-book
root: intro
chapters:
- file: intro
- file: existing-lecture
`;
    const files: FileToSync[] = [
      {
        filename: 'lectures/existing-lecture.md',
        type: 'markdown',
        // no newContent → will throw, but isNewFile is false
        isNewFile: false,
        existingFileSha: 'sha-abc',
      },
      {
        filename: 'lectures/_toc.yml',
        type: 'toc',
        newContent: toc,
        isNewFile: false,
      },
    ];

    const result = await orchestrator.processFiles(files);

    expect(result.errors).toHaveLength(1);
    const tocEntry = result.translatedFiles.find((f) => f.path === 'lectures/_toc.yml');
    expect(tocEntry!.content).toBe(toc);
    expect(result.failedNewFiles).toBeUndefined();
    expect(result.filteredTocPaths).toBeUndefined();
  });

  it('leaves the TOC unchanged when no errors occurred', async () => {
    const toc = `format: jb-book
root: intro
chapters:
- file: intro
- file: lecture-a
`;
    const files: FileToSync[] = [
      {
        filename: 'lectures/lecture-a.md',
        type: 'markdown',
        newContent: '# A\n\nContent',
        isNewFile: true,
      },
      {
        filename: 'lectures/_toc.yml',
        type: 'toc',
        newContent: toc,
        isNewFile: false,
      },
    ];

    const result = await orchestrator.processFiles(files);

    expect(result.errors).toHaveLength(0);
    const tocEntry = result.translatedFiles.find((f) => f.path === 'lectures/_toc.yml');
    expect(tocEntry!.content).toBe(toc);
    expect(result.failedNewFiles).toBeUndefined();
  });

  it('lists every filtered-out file in result.failedNewFiles', async () => {
    const toc = `format: jb-book
root: intro
chapters:
- file: failed-a
- file: failed-b
- file: good
`;
    const files: FileToSync[] = [
      { filename: 'lectures/failed-a.md', type: 'markdown', isNewFile: true },
      { filename: 'lectures/failed-b.md', type: 'markdown', isNewFile: true },
      {
        filename: 'lectures/good.md',
        type: 'markdown',
        newContent: '# Good\n\nContent',
        isNewFile: true,
      },
      { filename: 'lectures/_toc.yml', type: 'toc', newContent: toc, isNewFile: false },
    ];

    const result = await orchestrator.processFiles(files);

    expect(result.failedNewFiles).toEqual(['lectures/failed-a.md', 'lectures/failed-b.md']);
    const tocEntry = result.translatedFiles.find((f) => f.path === 'lectures/_toc.yml');
    expect(tocEntry!.content).toBe('format: jb-book\nroot: intro\nchapters:\n- file: good\n');
  });

  it('also removes entries for new files whose source fetch failed (never reached the loop)', async () => {
    const toc = `format: jb-book
root: intro
chapters:
- file: intro
- file: fetch-failed
- file: good
`;
    const files: FileToSync[] = [
      {
        filename: 'lectures/good.md',
        type: 'markdown',
        newContent: '# Good\n\nContent',
        isNewFile: true,
      },
      { filename: 'lectures/_toc.yml', type: 'toc', newContent: toc, isNewFile: false },
    ];

    const result = await orchestrator.processFiles(files, undefined, undefined, undefined, [
      'lectures/fetch-failed.md',
    ]);

    // The orchestrator itself saw no error — the caller reports the fetch failure.
    expect(result.errors).toHaveLength(0);
    expect(result.failedNewFiles).toEqual(['lectures/fetch-failed.md']);
    expect(result.filteredTocPaths).toEqual(['lectures/_toc.yml']);
    const tocEntry = result.translatedFiles.find((f) => f.path === 'lectures/_toc.yml');
    expect(tocEntry!.content).toBe(toc.replace('- file: fetch-failed\n', ''));
  });

  it('records failedNewFiles with an empty filteredTocPaths when no TOC is in the changeset', async () => {
    const files: FileToSync[] = [
      { filename: 'lectures/failed-lecture.md', type: 'markdown', isNewFile: true },
    ];

    const result = await orchestrator.processFiles(files);

    expect(result.errors).toHaveLength(1);
    expect(result.failedNewFiles).toEqual(['lectures/failed-lecture.md']);
    expect(result.filteredTocPaths).toEqual([]);
    expect(logger.messages.filter((m) => m.level === 'warning')).toHaveLength(0);
  });

  it('emits a warning log entry when TOC entries are removed', async () => {
    const toc = `format: jb-book
root: intro
chapters:
- file: failed-lecture
`;
    const files: FileToSync[] = [
      { filename: 'lectures/failed-lecture.md', type: 'markdown', isNewFile: true },
      { filename: 'lectures/_toc.yml', type: 'toc', newContent: toc, isNewFile: false },
    ];

    await orchestrator.processFiles(files);

    const warnings = logger.messages.filter((m) => m.level === 'warning');
    expect(warnings.some((w) => w.msg.includes('failed-lecture'))).toBe(true);
    expect(warnings.some((w) => w.msg.includes('_toc.yml'))).toBe(true);
  });

  it('handles a parts-style TOC with a failed new file in one part', async () => {
    const toc = `format: jb-book
root: intro
parts:
- caption: Basics
  chapters:
  - file: intro
  - file: failed-lecture
- caption: Advanced
  chapters:
  - file: advanced
`;
    const files: FileToSync[] = [
      { filename: 'lectures/failed-lecture.md', type: 'markdown', isNewFile: true },
      {
        filename: 'lectures/advanced.md',
        type: 'markdown',
        newContent: '# Advanced\n\nContent',
        isNewFile: true,
      },
      { filename: 'lectures/_toc.yml', type: 'toc', newContent: toc, isNewFile: false },
    ];

    const result = await orchestrator.processFiles(files);

    const tocEntry = result.translatedFiles.find((f) => f.path === 'lectures/_toc.yml');
    expect(tocEntry!.content).toBe(toc.replace('  - file: failed-lecture\n', ''));
  });
});

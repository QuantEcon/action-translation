/**
 * Tests for the forward command orchestrator.
 *
 * Uses --test mode (no real LLM calls) and temp directories
 * for file I/O tests.
 *
 * The forward command uses whole-file RESYNC: triage → whole-file RESYNC → output.
 * Section-level matching and reconstruction are no longer performed.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { resyncSingleFile, runForwardBulk } from '../commands/forward.js';
import { ForwardOptions, ForwardFileResult } from '../types.js';

// ── helpers ────────────────────────────────────────────────────────────────

function makeOptions(overrides: Partial<ForwardOptions> = {}): ForwardOptions {
  return {
    source: '/tmp/source',
    target: '/tmp/target',
    docsFolder: 'lectures',
    language: 'zh-cn',
    model: 'claude-sonnet-4-6',
    test: true,
    estimate: false,
    apiKey: 'test-key',
    ...overrides,
  };
}

/** Quiet logger that suppresses output */
const silentLogger = {
  info: (_msg: string) => {},
  warn: (_msg: string) => {},
  error: (_msg: string) => {},
};

/**
 * Create a temp directory with SOURCE and TARGET files.
 */
function createTempFixture(opts: {
  sourceContent: string;
  targetContent: string;
  filename?: string;
  docsFolder?: string;
}): { sourceRepo: string; targetRepo: string; filename: string; cleanup: () => void } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forward-test-'));
  const filename = opts.filename ?? 'test.md';
  const docsFolder = opts.docsFolder ?? 'lectures';

  const sourceDir = path.join(tmpDir, 'source', docsFolder);
  const targetDir = path.join(tmpDir, 'target', docsFolder);
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(targetDir, { recursive: true });

  fs.writeFileSync(path.join(sourceDir, filename), opts.sourceContent, 'utf-8');
  fs.writeFileSync(path.join(targetDir, filename), opts.targetContent, 'utf-8');

  return {
    sourceRepo: path.join(tmpDir, 'source'),
    targetRepo: path.join(tmpDir, 'target'),
    filename,
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
  };
}

// =============================================================================
// resyncSingleFile — test mode triage
// =============================================================================

describe('resyncSingleFile', () => {
  describe('triage phase', () => {
    it('skips files with "aligned" in name (IDENTICAL verdict)', async () => {
      const fixture = createTempFixture({
        sourceContent: '---\ntitle: Test\n---\n\n# Title\n\n## Section\n\nContent',
        targetContent: '---\ntitle: Test\n---\n\n# 标题\n\n## 部分\n\n内容',
        filename: 'aligned-test.md',
      });

      try {
        const options = makeOptions({
          source: fixture.sourceRepo,
          target: fixture.targetRepo,
        });
        const result = await resyncSingleFile(
          fixture.filename,
          fixture.sourceRepo,
          fixture.targetRepo,
          'lectures',
          options,
          silentLogger,
        );

        expect(result.triageResult.verdict).toBe('IDENTICAL');
        expect(result.sections).toHaveLength(0);
        expect(result.summary.resynced).toBe(0);
      } finally {
        fixture.cleanup();
      }
    });

    it('skips files with "i18n" in name (I18N_ONLY verdict)', async () => {
      const fixture = createTempFixture({
        sourceContent: '---\ntitle: Test\n---\n\n# Title\n\n## Intro\n\nContent',
        targetContent: '---\ntitle: Test\n---\n\n# 标题\n\n## 介绍\n\n内容',
        filename: 'i18n-changes.md',
      });

      try {
        const options = makeOptions({
          source: fixture.sourceRepo,
          target: fixture.targetRepo,
        });
        const result = await resyncSingleFile(
          fixture.filename,
          fixture.sourceRepo,
          fixture.targetRepo,
          'lectures',
          options,
          silentLogger,
        );

        expect(result.triageResult.verdict).toBe('I18N_ONLY');
        expect(result.sections).toHaveLength(0);
      } finally {
        fixture.cleanup();
      }
    });

    it('proceeds with CONTENT_CHANGES for regular files', async () => {
      const fixture = createTempFixture({
        sourceContent: '---\ntitle: Test\n---\n\n# Title\n\n## Section A\n\nEnglish content here.',
        targetContent: '---\ntitle: Test\n---\n\n# 标题\n\n## 部分A\n\n中文内容。',
        filename: 'cobweb.md',
      });

      try {
        const options = makeOptions({
          source: fixture.sourceRepo,
          target: fixture.targetRepo,
        });
        const result = await resyncSingleFile(
          fixture.filename,
          fixture.sourceRepo,
          fixture.targetRepo,
          'lectures',
          options,
          silentLogger,
        );

        expect(result.triageResult.verdict).toBe('CONTENT_CHANGES');
        // Whole-file resync: output should contain the test marker
        expect(result.outputContent).toBeDefined();
        expect(result.outputContent).toContain('[TEST RESYNC]');
      } finally {
        fixture.cleanup();
      }
    });
  });

  describe('whole-file resync', () => {
    it('produces output content in test mode', async () => {
      const fixture = createTempFixture({
        sourceContent: '---\ntitle: Test\n---\n\n# Title\n\n## Section A\n\nContent A\n\n## Section B\n\nContent B',
        targetContent: '---\ntitle: Test\n---\n\n# 标题\n\n## A翻译\n\n翻译A\n\n## B翻译\n\n翻译B',
        filename: 'multi-section.md',
      });

      try {
        const options = makeOptions({
          source: fixture.sourceRepo,
          target: fixture.targetRepo,
        });
        const result = await resyncSingleFile(
          fixture.filename,
          fixture.sourceRepo,
          fixture.targetRepo,
          'lectures',
          options,
          silentLogger,
        );

        expect(result.triageResult.verdict).toBe('CONTENT_CHANGES');
        expect(result.outputContent).toBeDefined();
        // Test mode wraps target content with [TEST RESYNC] marker
        expect(result.outputContent).toContain('[TEST RESYNC]');
        expect(result.outputContent).toContain('翻译A');
        expect(result.outputContent).toContain('翻译B');
      } finally {
        fixture.cleanup();
      }
    });

    it('writes output to target file on disk', async () => {
      const fixture = createTempFixture({
        sourceContent: '---\ntitle: Test\n---\n\n# Title\n\n## Section\n\nNew content.',
        targetContent: '---\ntitle: Test\n---\n\n# 标题\n\n## 部分\n\n旧内容。',
        filename: 'disk-write.md',
      });

      try {
        const options = makeOptions({
          source: fixture.sourceRepo,
          target: fixture.targetRepo,
        });
        const result = await resyncSingleFile(
          fixture.filename,
          fixture.sourceRepo,
          fixture.targetRepo,
          'lectures',
          options,
          silentLogger,
        );

        expect(result.outputContent).toBeDefined();

        // Verify file was written to disk
        const targetPath = path.join(fixture.targetRepo, 'lectures', fixture.filename);
        const written = fs.readFileSync(targetPath, 'utf-8');
        expect(written).toContain('[TEST RESYNC]');
      } finally {
        fixture.cleanup();
      }
    });

    it('returns empty sections array (whole-file mode)', async () => {
      const fixture = createTempFixture({
        sourceContent: '---\ntitle: Test\n---\n\n# Title\n\n## A\n\nContent A\n\n## B\n\nContent B',
        targetContent: '---\ntitle: Test\n---\n\n# 标题\n\n## A翻译\n\n翻译A',
        filename: 'sections-empty.md',
      });

      try {
        const options = makeOptions({
          source: fixture.sourceRepo,
          target: fixture.targetRepo,
        });
        const result = await resyncSingleFile(
          fixture.filename,
          fixture.sourceRepo,
          fixture.targetRepo,
          'lectures',
          options,
          silentLogger,
        );

        // Whole-file mode: sections array is always empty
        expect(result.sections).toHaveLength(0);
      } finally {
        fixture.cleanup();
      }
    });
  });

  describe('error handling', () => {
    it('throws on missing source file', async () => {
      const fixture = createTempFixture({
        sourceContent: 'content',
        targetContent: 'content',
        filename: 'exists.md',
      });

      try {
        const options = makeOptions({
          source: fixture.sourceRepo,
          target: fixture.targetRepo,
        });

        await expect(
          resyncSingleFile(
            'nonexistent.md',
            fixture.sourceRepo,
            fixture.targetRepo,
            'lectures',
            options,
            silentLogger,
          ),
        ).rejects.toThrow('Source file not found');
      } finally {
        fixture.cleanup();
      }
    });

    it('throws on missing target file', async () => {
      const fixture = createTempFixture({
        sourceContent: 'content',
        targetContent: 'content',
        filename: 'source-only.md',
      });
      // Remove target file
      const targetPath = path.join(fixture.targetRepo, 'lectures', 'source-only.md');
      fs.unlinkSync(targetPath);

      try {
        const options = makeOptions({
          source: fixture.sourceRepo,
          target: fixture.targetRepo,
        });

        await expect(
          resyncSingleFile(
            'source-only.md',
            fixture.sourceRepo,
            fixture.targetRepo,
            'lectures',
            options,
            silentLogger,
          ),
        ).rejects.toThrow('Target file not found');
      } finally {
        fixture.cleanup();
      }
    });
  });

  describe('github mode', () => {
    it('calls gh runner when --github is specified', async () => {
      const fixture = createTempFixture({
        sourceContent: '---\ntitle: Test\n---\n\n# Title\n\n## Section\n\nContent here.',
        targetContent: '---\ntitle: Test\n---\n\n# 标题\n\n## 部分\n\n翻译内容。',
        filename: 'gh-test.md',
      });

      try {
        let capturedGhArgs: string[] = [];
        const mockGhRunner = (args: string[], _stdin: string) => {
          capturedGhArgs = args;
          return { stdout: 'https://github.com/Org/Repo/pull/1', stderr: '', status: 0 };
        };

        // Mock git runner — returns success for all operations
        const gitCalls: string[][] = [];
        const mockGitRunner = (args: string[], _cwd: string) => {
          gitCalls.push(args);
          // rev-parse --abbrev-ref HEAD → return branch name
          if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') {
            return { stdout: 'main', stderr: '', status: 0 };
          }
          // rev-parse --verify branchName → branch doesn't exist
          if (args[0] === 'rev-parse' && args[1] === '--verify') {
            return { stdout: '', stderr: '', status: 1 };
          }
          // All other git commands succeed
          return { stdout: '', stderr: '', status: 0 };
        };

        const options = makeOptions({
          source: fixture.sourceRepo,
          target: fixture.targetRepo,
          github: 'Org/Repo',
          test: true,
        });
        const result = await resyncSingleFile(
          fixture.filename,
          fixture.sourceRepo,
          fixture.targetRepo,
          'lectures',
          options,
          silentLogger,
          mockGhRunner,
          mockGitRunner,
        );

        // In test mode the file triggers CONTENT_CHANGES and whole-file resync
        // produces output, so PR should be created.
        expect(result.outputContent).toBeDefined();
        expect(result.prUrl).toBe('https://github.com/Org/Repo/pull/1');
        expect(capturedGhArgs).toContain('Org/Repo');

        // Verify git operations were called
        const gitOps = gitCalls.map(c => c[0]);
        expect(gitOps).toContain('rev-parse');    // detect branch
        expect(gitOps).toContain('checkout');      // create branch + switch back
        expect(gitOps).toContain('add');           // stage
        expect(gitOps).toContain('commit');        // commit
        expect(gitOps).toContain('push');          // push
      } finally {
        fixture.cleanup();
      }
    });
  });

  describe('summary counts', () => {
    it('reports resynced=1 for successful whole-file resync', async () => {
      const fixture = createTempFixture({
        sourceContent: '---\ntitle: Test\n---\n\n# Title\n\n## A\n\nContent A\n\n## B\n\nContent B\n\n## C\n\nContent C',
        targetContent: '---\ntitle: Test\n---\n\n# 标题\n\n## A翻译\n\n翻译A\n\n## B翻译\n\n翻译B\n\n## 附加\n\n附加内容',
        filename: 'counting.md',
      });

      try {
        const options = makeOptions({
          source: fixture.sourceRepo,
          target: fixture.targetRepo,
        });
        const result = await resyncSingleFile(
          fixture.filename,
          fixture.sourceRepo,
          fixture.targetRepo,
          'lectures',
          options,
          silentLogger,
        );

        // Whole-file mode: summary shows 1 resynced file
        expect(result.summary.resynced).toBe(1);
        expect(result.summary.errors).toBe(0);
        expect(result.summary.unchanged).toBe(0);
        expect(result.summary.new).toBe(0);
        expect(result.summary.removed).toBe(0);
      } finally {
        fixture.cleanup();
      }
    });

    it('reports resynced=0 for skipped files', async () => {
      const fixture = createTempFixture({
        sourceContent: '---\ntitle: Test\n---\n\n# Title\n\n## Section\n\nContent',
        targetContent: '---\ntitle: Test\n---\n\n# 标题\n\n## 部分\n\n内容',
        filename: 'aligned-skip.md',
      });

      try {
        const options = makeOptions({
          source: fixture.sourceRepo,
          target: fixture.targetRepo,
        });
        const result = await resyncSingleFile(
          fixture.filename,
          fixture.sourceRepo,
          fixture.targetRepo,
          'lectures',
          options,
          silentLogger,
        );

        expect(result.triageResult.verdict).toBe('IDENTICAL');
        expect(result.summary.resynced).toBe(0);
        expect(result.summary.errors).toBe(0);
      } finally {
        fixture.cleanup();
      }
    });
  });
});

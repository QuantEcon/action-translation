/**
 * Tests for backward command (integration)
 * 
 * Uses --test mode (deterministic mock responses, no LLM calls).
 * Tests the full pipeline: file reading → triage → section matching → evaluation → report.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runBackwardSingleFile, BackwardLogger } from '../commands/backward';
import { BackwardOptions } from '../types';

const fixturesDir = path.join(__dirname, 'fixtures');

describe('backward command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resync-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Silent logger for tests
  const silentLogger: BackwardLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
  };

  /**
   * Helper to build options for fixture-based tests
   * 
   * The fixtures use a flat structure (source.md + target.md in the same dir),
   * so we set docsFolder to '' and use the fixture directory as both source and target.
   * The "source" file is under a temp source dir and "target" under a temp target dir.
   */
  function setupFixtureTest(fixtureName: string): { 
    options: BackwardOptions & { apiKey: string };
    sourceDir: string;
    targetDir: string;
  } {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });

    // Copy fixture files
    const fixtureDir = path.join(fixturesDir, fixtureName);
    fs.copyFileSync(
      path.join(fixtureDir, 'source.md'),
      path.join(sourceDir, 'test-lecture.md'),
    );
    fs.copyFileSync(
      path.join(fixtureDir, 'target.md'),
      path.join(targetDir, 'test-lecture.md'),
    );

    return {
      sourceDir,
      targetDir,
      options: {
        source: sourceDir,
        target: targetDir,
        file: 'test-lecture.md',
        docsFolder: '',
        language: 'zh-cn',
        output: path.join(tmpDir, 'reports'),
        model: 'claude-sonnet-4-6',
        json: false,
        test: true,
        minConfidence: 0.6,
        estimate: false,
        apiKey: 'test-key',
      },
    };
  }

  describe('single file mode', () => {
    it('should complete analysis for aligned-pair fixture', async () => {
      const { options } = setupFixtureTest('aligned-pair');

      const report = await runBackwardSingleFile(options, silentLogger);

      expect(report.file).toBe('test-lecture.md');
      expect(report.timestamp).toBeDefined();
      expect(report.triageResult).toBeDefined();
    });

    it('should complete analysis for bug-fix-in-target fixture', async () => {
      const { options } = setupFixtureTest('bug-fix-in-target');

      const report = await runBackwardSingleFile(options, silentLogger);

      expect(report.file).toBe('test-lecture.md');
      // In test mode, non-aligned files get CHANGES_DETECTED
      expect(report.triageResult.verdict).toBe('CHANGES_DETECTED');
      // Stage 2 should have been run
      expect(report.suggestions).toBeDefined();
      expect(report.sectionPairs).toBeDefined();
    });

    it('should write markdown report to output directory', async () => {
      const { options } = setupFixtureTest('bug-fix-in-target');

      await runBackwardSingleFile(options, silentLogger);

      const reportPath = path.join(options.output, 'test-lecture-backward.md');
      expect(fs.existsSync(reportPath)).toBe(true);

      const content = fs.readFileSync(reportPath, 'utf-8');
      expect(content).toContain('# Backward Analysis');

      // JSON sidecar should be in .resync/ subfolder
      const sidecar = path.join(options.output, '.resync', 'test-lecture-backward.json');
      expect(fs.existsSync(sidecar)).toBe(true);
    });

    it('should write JSON report when --json flag is set', async () => {
      const { options } = setupFixtureTest('bug-fix-in-target');
      options.json = true;

      await runBackwardSingleFile(options, silentLogger);

      const reportPath = path.join(options.output, 'test-lecture-backward.json');
      expect(fs.existsSync(reportPath)).toBe(true);

      const content = fs.readFileSync(reportPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.file).toBe('test-lecture.md');
    });

    it('should write directly to .md file path in single-file mode', async () => {
      const { options } = setupFixtureTest('bug-fix-in-target');
      const filePath = path.join(tmpDir, 'custom-report.md');
      options.output = filePath;

      await runBackwardSingleFile(options, silentLogger);

      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('# Backward Analysis');

      // JSON sidecar should be in .resync/ subfolder
      const sidecar = path.join(tmpDir, '.resync', 'custom-report.json');
      expect(fs.existsSync(sidecar)).toBe(true);
    });

    it('should write directly to .json file path in single-file mode', async () => {
      const { options } = setupFixtureTest('bug-fix-in-target');
      const filePath = path.join(tmpDir, 'custom-report.json');
      options.output = filePath;

      await runBackwardSingleFile(options, silentLogger);

      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.file).toBe('test-lecture.md');
    });

    it('should handle section-count-mismatch', async () => {
      const { options } = setupFixtureTest('section-count-mismatch');

      const report = await runBackwardSingleFile(options, silentLogger);

      // Target has more sections — should still complete
      expect(report.sectionPairs).toBeDefined();
      if (report.sectionPairs) {
        const targetOnly = report.sectionPairs.filter(p => p.status === 'TARGET_ONLY');
        expect(targetOnly.length).toBeGreaterThan(0);
      }
    });

    it('should handle no-heading-map fixture', async () => {
      const { options } = setupFixtureTest('no-heading-map');

      const report = await runBackwardSingleFile(options, silentLogger);

      // Should work without heading-map (position-only matching)
      expect(report.file).toBe('test-lecture.md');
      expect(report.triageResult).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should throw when source file does not exist', async () => {
      const { options } = setupFixtureTest('aligned-pair');
      options.file = 'nonexistent.md';

      await expect(
        runBackwardSingleFile(options, silentLogger),
      ).rejects.toThrow('SOURCE file not found');
    });

    it('should throw when target file does not exist', async () => {
      const { options, targetDir } = setupFixtureTest('aligned-pair');
      // Remove the target file
      fs.unlinkSync(path.join(targetDir, 'test-lecture.md'));

      await expect(
        runBackwardSingleFile(options, silentLogger),
      ).rejects.toThrow('TARGET file not found');
    });

    it('should throw when --file is not provided in single-file mode', async () => {
      const { options } = setupFixtureTest('aligned-pair');
      options.file = undefined;

      await expect(
        runBackwardSingleFile(options, silentLogger),
      ).rejects.toThrow('--file');
    });
  });
});

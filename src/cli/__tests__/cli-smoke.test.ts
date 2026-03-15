/**
 * CLI Smoke Tests
 *
 * Invoke the CLI binary as an external process to validate:
 * - Argument parsing
 * - --help output
 * - --version output
 * - --dry-run and --test modes (no LLM calls)
 * - Error exit codes for missing arguments
 *
 * These tests use the compiled dist/cli/index.js — run `npm run build:cli` first.
 */

import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const CLI = path.resolve(__dirname, '../../../dist/cli/index.js');

beforeAll(() => {
  if (!fs.existsSync(CLI)) {
    throw new Error(
      `CLI binary not found at ${CLI}. Run \`npm run build\` before running smoke tests.`
    );
  }
});

function run(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    execFile('node', [CLI, ...args], { timeout: 10_000 }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout?.toString() ?? '',
        stderr: stderr?.toString() ?? '',
        code: error ? (error as any).code ?? 1 : 0,
      });
    });
  });
}

// ============================================================================
// Basic CLI
// ============================================================================

describe('CLI smoke tests', () => {
  it('--version prints version number', async () => {
    const { stdout, code } = await run(['--version']);
    expect(code).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('--help lists all commands', async () => {
    const { stdout, code } = await run(['--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('backward');
    expect(stdout).toContain('forward');
    expect(stdout).toContain('status');
    expect(stdout).toContain('review');
    expect(stdout).toContain('init');
  });

  it('unknown command exits with error', async () => {
    const { stderr, code } = await run(['nonexistent']);
    expect(code).not.toBe(0);
    expect(stderr).toContain('nonexistent');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // status command
  // ──────────────────────────────────────────────────────────────────────────

  describe('status command', () => {
    it('status --help shows options', async () => {
      const { stdout, code } = await run(['status', '--help']);
      expect(code).toBe(0);
      expect(stdout).toContain('--source');
      expect(stdout).toContain('--target');
    });

    it('status handles missing source gracefully', async () => {
      const { code } = await run(['status', '-s', '/nonexistent/path', '-t', '/tmp']);
      // Status command reports 0 files found rather than crashing
      expect(code).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // init command
  // ──────────────────────────────────────────────────────────────────────────

  describe('init command', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-smoke-init-'));
      // Create a minimal source repo with _toc.yml
      const lecturesDir = path.join(tmpDir, 'source', 'lectures');
      fs.mkdirSync(lecturesDir, { recursive: true });
      fs.writeFileSync(path.join(lecturesDir, '_toc.yml'), `
format: jb-book
root: intro
chapters:
  - file: cobweb
`);
      fs.writeFileSync(path.join(lecturesDir, 'intro.md'), '# Intro\n\n## Section\n\nContent.');
      fs.writeFileSync(path.join(lecturesDir, 'cobweb.md'), '# Cobweb\n\n## Model\n\nContent.');
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('init --dry-run lists lectures without translating', async () => {
      const target = path.join(tmpDir, 'target');
      const { stdout, code } = await run([
        'init',
        '-s', path.join(tmpDir, 'source'),
        '-t', target,
        '--target-language', 'zh-cn',
        '--dry-run',
      ]);
      expect(code).toBe(0);
      expect(stdout).toContain('intro.md');
      expect(stdout).toContain('cobweb.md');
      // Target should not be created (dry-run)
      expect(fs.existsSync(target)).toBe(false);
    });

    it('init --help shows all options', async () => {
      const { stdout, code } = await run(['init', '--help']);
      expect(code).toBe(0);
      expect(stdout).toContain('--target-language');
      expect(stdout).toContain('--localize');
      expect(stdout).toContain('--dry-run');
      expect(stdout).toContain('--glossary');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // backward command
  // ──────────────────────────────────────────────────────────────────────────

  describe('backward command', () => {
    it('backward --help shows options', async () => {
      const { stdout, code } = await run(['backward', '--help']);
      expect(code).toBe(0);
      expect(stdout).toContain('--source');
      expect(stdout).toContain('--target');
      expect(stdout).toContain('--file');
    });

    it('backward exits with error when api key missing and not --test', async () => {
      const { code } = await run(['backward', '-s', '/tmp', '-t', '/tmp', '-f', 'x.md', '-o', '/tmp']);
      expect(code).not.toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // forward command
  // ──────────────────────────────────────────────────────────────────────────

  describe('forward command', () => {
    it('forward --help shows options', async () => {
      const { stdout, code } = await run(['forward', '--help']);
      expect(code).toBe(0);
      expect(stdout).toContain('--source');
      expect(stdout).toContain('--target');
      expect(stdout).toContain('--github');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // review command
  // ──────────────────────────────────────────────────────────────────────────

  describe('review command', () => {
    it('review --help shows options', async () => {
      const { stdout, code } = await run(['review', '--help']);
      expect(code).toBe(0);
      expect(stdout).toContain('--repo');
      expect(stdout).toContain('--dry-run');
    });
  });
});

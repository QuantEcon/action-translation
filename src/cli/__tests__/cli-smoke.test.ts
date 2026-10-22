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

import { execFile, execFileSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const CLI = path.resolve(__dirname, '../../../dist/cli/index.js');
const SRC = path.resolve(__dirname, '../../../src');

/**
 * Newest mtime under src/, skipping test files — they are excluded from the
 * build (tsconfig excludes **\/*.test.ts), so editing them cannot stale dist/.
 */
function newestSourceMtime(dir: string): number {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestSourceMtime(full));
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
      newest = Math.max(newest, fs.statSync(full).mtimeMs);
    }
  }
  return newest;
}

beforeAll(() => {
  if (!fs.existsSync(CLI)) {
    throw new Error(
      `CLI binary not found at ${CLI}. Run \`npm run build\` before running smoke tests.`
    );
  }
  // A stale binary makes every test below meaningless: they would validate
  // whatever the last build happened to leave behind, not the current source.
  if (newestSourceMtime(SRC) > fs.statSync(CLI).mtimeMs) {
    throw new Error(`${CLI} is older than src/. Run \`npm run build\` before running smoke tests.`);
  }
});

function run(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    execFile('node', [CLI, ...args], { timeout: 10_000 }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout?.toString() ?? '',
        stderr: stderr?.toString() ?? '',
        code: error ? ((error as any).code ?? 1) : 0,
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

    // The carried-change guard is unit-tested in status.test.ts; this pins the
    // CLI wiring, so a dropped `carried: opts.carried` cannot make --carried a
    // silent no-op (#380).
    it('status --write-state refuses an unverifiable sync point until --carried', async () => {
      const git = (repo: string, args: string[]): string => {
        const env: NodeJS.ProcessEnv = {};
        for (const [key, value] of Object.entries(process.env)) {
          if (!key.startsWith('GIT_')) env[key] = value;
        }
        Object.assign(env, {
          GIT_CONFIG_GLOBAL: os.devNull,
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_AUTHOR_NAME: 'Test',
          GIT_AUTHOR_EMAIL: 'test@example.com',
          GIT_COMMITTER_NAME: 'Test',
          GIT_COMMITTER_EMAIL: 'test@example.com',
        });
        return execFileSync('git', args, { cwd: repo, env, encoding: 'utf-8' });
      };
      const commitFile = (repo: string, rel: string, content: string): void => {
        fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
        fs.writeFileSync(path.join(repo, rel), content, 'utf-8');
        git(repo, ['add', '--all']);
        git(repo, ['commit', '-q', '--no-verify', '--no-gpg-sign', '-m', 'commit']);
      };

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-smoke-carried-'));
      try {
        const source = path.join(tmpDir, 'source');
        const target = path.join(tmpDir, 'target');
        for (const repo of [source, target]) {
          fs.mkdirSync(repo);
          git(repo, ['init', '-q']);
        }
        // Source first, so the date guard passes
        commitFile(source, 'lectures/lecture.md', '# Lecture\n\n## One\n\nText.\n');
        commitFile(target, 'lectures/lecture.md', '# 讲座\n\n## 一\n\n文字。\n');
        // A sync point the source clone does not have: the guard cannot check it
        fs.mkdirSync(path.join(target, '.translate', 'state'), { recursive: true });
        fs.writeFileSync(
          path.join(target, '.translate', 'state', 'lecture.md.yml'),
          "source-sha: 0123456789abcdef0123456789abcdef01234567\nsynced-at: '2026-10-02'\n" +
            'model: claude-sonnet-5\nmode: NEW\nsection-count: 1\n',
          'utf-8'
        );

        const base = ['status', '-s', source, '-t', target, '--write-state'];
        const refused = await run(base);
        expect(refused.code).toBe(1);
        expect(refused.stderr).toContain('--write-state blocked: 1 file(s) have English changes');

        const confirmed = await run([...base, '--carried']);
        expect(confirmed.code).toBe(0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
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
      fs.writeFileSync(
        path.join(lecturesDir, '_toc.yml'),
        `
format: jb-book
root: intro
chapters:
  - file: cobweb
`
      );
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
        '-s',
        path.join(tmpDir, 'source'),
        '-t',
        target,
        '--target-language',
        'zh-cn',
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
      expect(stdout).toContain('--parallel');
      expect(stdout).toContain('--skip-existing');
      // rate-check.sh detects a reporting engine by grepping this help for it.
      expect(stdout).toContain('--report-json');
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
      expect(stdout).toContain('--parallel');
    });

    it('backward exits with error when api key missing and not --test', async () => {
      const { code } = await run([
        'backward',
        '-s',
        '/tmp',
        '-t',
        '/tmp',
        '-f',
        'x.md',
        '-o',
        '/tmp',
      ]);
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
      expect(stdout).toContain('--parallel');
      expect(stdout).toContain('--glossary');
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

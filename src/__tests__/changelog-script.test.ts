/**
 * changelog.mjs: changelog fragments, checked in CI and collected at release
 * (D-2026-11-16-changelog-fragments). The script resolves CHANGELOG.md and
 * changelog.d/ against its working directory, so each test runs it on a
 * fixture folder, as eval-tooling.test.ts does for rate-check-summary.mjs.
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'changelog.mjs');

const PREAMBLE =
  '# Changelog\n\nAll notable changes to this project will be documented in this file.\n';
const RELEASED = '## [0.30.2] - 2026-11-15\n\n### Fixed\n\n- **An old fix** (#1).\n';
const EMPTY = `${PREAMBLE}\n## [Unreleased]\n\n${RELEASED}`;

/** An entry shaped like #389's: nested bullets, a blank line, an indented continuation paragraph. */
const NESTED = [
  '- **Rebase no longer brings back a deleted lecture** (#389). It decides from what it finds:',
  '  - **At the baseline but not on `main`:** a PR merged since deleted the lecture.',
  '  - **Only on the branch:** the PR adds the lecture.',
  '',
  '  A rename is looked up by its old path on `main` and at the baseline.',
].join('\n');

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-script-'));
  fs.mkdirSync(path.join(dir, 'changelog.d'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function write(changelog: string, fragments: Record<string, string>) {
  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), changelog);
  for (const [name, text] of Object.entries(fragments)) {
    fs.writeFileSync(path.join(dir, 'changelog.d', name), text);
  }
}

function run(...args: string[]) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const changelog = () => fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8');
const fragmentNames = () => fs.readdirSync(path.join(dir, 'changelog.d')).sort();

describe('changelog.mjs --check', () => {
  it('passes valid fragments with an empty [Unreleased], skipping README.md and dotfiles', () => {
    write(EMPTY, {
      '134-init-repo-scope.md': '### Fixed\n\n- **A fix** (#134).\n',
      'README.md': '# Not a fragment\n\nFree text.\n',
      '.gitkeep': '',
    });
    const r = run('--check');
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('1 changelog fragment(s) valid');
  });

  it('passes with no changelog.d folder at all', () => {
    fs.rmSync(path.join(dir, 'changelog.d'), { recursive: true });
    write(EMPTY, {});
    expect(run('--check').status).toBe(0);
  });

  it('keeps nested bullets and continuation paragraphs, and trims trailing spaces on a section line', () => {
    write(EMPTY, { '389-rebase.md': `### Fixed  \n\n${NESTED}\n` });
    expect(run('--check').status).toBe(0);
  });

  it('fails an entry written into [Unreleased], naming its line', () => {
    write(`${PREAMBLE}\n## [Unreleased]\n\n### Fixed\n\n- **Direct** (#9).\n\n${RELEASED}`, {});
    const r = run('--check');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/CHANGELOG\.md:7: "## \[Unreleased\]" must stay empty/);
  });

  it.each([
    [
      'an unknown section',
      'x.md',
      '### Notes\n\n- **A note**.\n',
      /x\.md:1: unknown section "Notes"/,
    ],
    [
      'text before the first section',
      'x.md',
      'Intro\n\n### Fixed\n\n- **A**.\n',
      /x\.md:1: text before/,
    ],
    [
      'a version heading inside',
      'x.md',
      '### Fixed\n\n- **A**.\n## [1.0.0]\n',
      /x\.md:4: an unindented line/,
    ],
    [
      'an unindented line that is not an entry',
      'x.md',
      '### Fixed\n\nProse.\n',
      /x\.md:3: an unindented line/,
    ],
    [
      'a section with no entry',
      'x.md',
      '### Fixed\n\n### Added\n\n- **A**.\n',
      /x\.md: section "Fixed" has no entry/,
    ],
    ['no section at all', 'x.md', '\n\n', /x\.md: no "### <Section>" line/],
    [
      'a badly named file',
      'Fix_This.md',
      '### Fixed\n\n- **A**.\n',
      /Fix_This\.md: not a fragment/,
    ],
    ['a file that is not markdown', 'notes.txt', 'text', /notes\.txt: not a fragment/],
    [
      'a section line not at column 1',
      'x.md',
      '  ### Fixed\n\n- **A**.\n',
      /x\.md:1: a "### <Section>" line must start at column 1/,
    ],
  ])('fails %s, naming the file', (_label, name, text, message) => {
    write(EMPTY, { [name]: text });
    const r = run('--check');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(message);
  });

  it('fails a CHANGELOG.md without an [Unreleased] header', () => {
    write(`${PREAMBLE}\n${RELEASED}`, {});
    const r = run('--check');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('expected one "## [Unreleased]" line, found 0');
  });

  it('passes on the repository itself', () => {
    const r = spawnSync(process.execPath, [SCRIPT, '--check'], { cwd: ROOT, encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
});

describe('changelog.mjs --release', () => {
  it('writes the fragments under the version, below a fresh empty [Unreleased], and deletes them', () => {
    write(EMPTY, {
      'dev-deps-audit.md': '### Security\n\n- **Dev dependencies** updated.\n',
      '389-rebase.md': `### Fixed\n\n${NESTED}\n`,
      '90-heading.md':
        '### Fixed\n\n- **A heading fix** (#90).\n\n### Added\n\n- **A feature** (#90).\n',
      'README.md': '# Kept\n',
    });
    const r = run('--release', '0.31.0', '--date', '2026-11-20');
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);

    const sections = [
      '### Added',
      '',
      '- **A feature** (#90).',
      '',
      '### Fixed',
      '',
      '- **A heading fix** (#90).',
      NESTED,
      '',
      '### Security',
      '',
      '- **Dev dependencies** updated.',
    ].join('\n');
    expect(changelog()).toBe(
      `${PREAMBLE}\n## [Unreleased]\n\n## [0.31.0] - 2026-11-20\n\n${sections}\n\n${RELEASED}`
    );
    expect(r.stdout).toBe(`${sections}\n`);
    expect(fragmentNames()).toEqual(['README.md']);
  });

  it('orders issue-numbered fragments numerically, then the rest by name', () => {
    write(EMPTY, {
      'zeta.md': '### Fixed\n\n- **zeta**\n',
      '134-b.md': '### Fixed\n\n- **134**\n',
      '90-a.md': '### Fixed\n\n- **90**\n',
      'alpha.md': '### Fixed\n\n- **alpha**\n',
    });
    expect(run('--release', '1.0.0', '--date', '2026-01-01').status).toBe(0);
    const order = changelog()
      .split('\n')
      .filter((l) => l.startsWith('- **'));
    expect(order).toEqual([
      '- **90**',
      '- **134**',
      '- **alpha**',
      '- **zeta**',
      '- **An old fix** (#1).',
    ]);
  });

  it("defaults the date to today's local date", () => {
    write(EMPTY, { 'a.md': '### Fixed\n\n- **A**.\n' });
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    expect(run('--release', '1.0.0').status).toBe(0);
    expect(changelog()).toContain(`## [1.0.0] - ${today}`);
  });

  it.each([
    ['a version already released', ['--release', '0.30.2'], /already has "## \[0\.30\.2\]"/],
    ['a version that is not X.Y.Z', ['--release', 'v1.0'], /--release needs X\.Y\.Z/],
    ['a bad date', ['--release', '1.0.0', '--date', '20/11/2026'], /--date needs a real/],
    ['an impossible date', ['--release', '1.0.0', '--date', '2026-13-45'], /--date needs a real/],
    [
      'an unknown argument, such as a mistyped --date',
      ['--release', '1.0.0', '--dat', '2026-01-01'],
      /unexpected argument\(s\): --dat 2026-01-01/,
    ],
  ])('refuses %s and writes nothing', (_label, args, message) => {
    write(EMPTY, { 'a.md': '### Fixed\n\n- **A**.\n' });
    const r = run(...args);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(message);
    expect(changelog()).toBe(EMPTY);
    expect(fragmentNames()).toEqual(['a.md']);
  });

  it('refuses when changelog.d/ is not writable, and writes nothing', () => {
    if (process.getuid?.() === 0) return; // root can delete anyway
    write(EMPTY, { 'a.md': '### Fixed\n\n- **A**.\n' });
    fs.chmodSync(path.join(dir, 'changelog.d'), 0o555);
    try {
      const r = run('--release', '1.0.0');
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('changelog.d/ is not writable');
      expect(changelog()).toBe(EMPTY);
    } finally {
      fs.chmodSync(path.join(dir, 'changelog.d'), 0o755);
    }
    expect(fragmentNames()).toEqual(['a.md']);
  });

  it('writes LF from a CRLF fragment, and a fragment without a final newline', () => {
    write(EMPTY, {
      '1-crlf.md': '### Fixed\r\n\r\n- **CRLF entry** (#1).\r\n  - nested\r\n',
      '2-bare.md': '### Fixed\n\n- **No final newline** (#2).',
    });
    expect(run('--release', '1.0.0', '--date', '2026-01-01').status).toBe(0);
    expect(changelog()).not.toContain('\r');
    expect(changelog()).toContain(
      '### Fixed\n\n- **CRLF entry** (#1).\n  - nested\n- **No final newline** (#2).\n\n## [0.30.2]'
    );
  });

  it('merges a section that a fragment repeats', () => {
    write(EMPTY, { 'a.md': '### Fixed\n\n- **One**.\n\n### Fixed\n\n- **Two**.\n' });
    expect(run('--release', '1.0.0', '--date', '2026-01-01').status).toBe(0);
    expect(changelog()).toContain('### Fixed\n\n- **One**.\n- **Two**.\n');
    // One heading for the release, however many the fragment had, plus 0.30.2's.
    expect(changelog().match(/### Fixed/g)).toHaveLength(2);
  });

  it('takes a version that only starts like a released one', () => {
    write(EMPTY, { 'a.md': '### Fixed\n\n- **A**.\n' });
    expect(run('--release', '0.30.20', '--date', '2026-01-01').status).toBe(0);
    expect(changelog()).toContain('## [0.30.20] - 2026-01-01');
  });

  it('refuses when there are no fragments', () => {
    write(EMPTY, {});
    const r = run('--release', '1.0.0');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('nothing to release');
  });

  it('refuses when [Unreleased] holds an entry, or a fragment is invalid, and writes nothing', () => {
    const direct = `${PREAMBLE}\n## [Unreleased]\n\n- **Direct**.\n\n${RELEASED}`;
    write(direct, { 'a.md': '### Notes\n\n- **A**.\n' });
    const r = run('--release', '1.0.0');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('must stay empty');
    expect(r.stderr).toContain('unknown section "Notes"');
    expect(changelog()).toBe(direct);
    expect(fragmentNames()).toEqual(['a.md']);
  });
});

describe('changelog.mjs usage', () => {
  it.each([[[]], [['--check', '--release', '1.0.0']], [['--check', '--date', '2026-01-01']]])(
    'rejects %j',
    (args) => {
      write(EMPTY, {});
      const r = run(...args);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('usage:');
    }
  );
});

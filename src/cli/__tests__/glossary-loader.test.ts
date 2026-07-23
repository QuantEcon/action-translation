/**
 * Tests for CLI glossary resolution (#149).
 *
 * The property that matters is CWD-independence: a resync launched from the
 * target repo, a bench root, or anywhere else must find the same glossary an
 * action-translation checkout finds. The second property is observability —
 * every outcome, including "nothing found", is reported.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadGlossary, resolveGlossary } from '../glossary-loader.js';

const BUILT_IN_DIR = path.join(__dirname, '..', '..', '..', 'glossary');

/** Logger that records what it was told, so silence is testable. */
function createTestLogger() {
  const messages: Array<{ level: 'info' | 'warn'; text: string }> = [];
  return {
    messages,
    info: (text: string) => messages.push({ level: 'info' as const, text }),
    warn: (text: string) => messages.push({ level: 'warn' as const, text }),
  };
}

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'glossary-loader-'));
}

/** Write a minimal but valid glossary file and return its path. */
function writeGlossary(dir: string, name: string, terms: Array<Record<string, string>>): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify({ version: '1.0', terms }), 'utf-8');
  return file;
}

describe('resolveGlossary', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = tempDir();
  });

  afterEach(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  // ── the defect ────────────────────────────────────────────────────────────

  it('finds the built-in glossary from a working directory that has none', () => {
    // The regression: `cwd` is a target repo, which never carries a glossary.
    const result = resolveGlossary('zh-cn', { builtInDir: BUILT_IN_DIR, cwd });

    expect(result.origin).toBe('built-in');
    expect(result.glossary!.terms.length).toBeGreaterThan(0);
  });

  it.each(['zh-cn', 'fa', 'fr'])('resolves the packaged %s glossary', (language) => {
    const result = resolveGlossary(language, { builtInDir: BUILT_IN_DIR, cwd });

    expect(result.origin).toBe('built-in');
    expect(result.glossary!.terms.length).toBeGreaterThan(0);
  });

  // ── precedence ────────────────────────────────────────────────────────────

  it('prefers a repo-local glossary/<lang>.json over the built-in one', () => {
    writeGlossary(path.join(cwd, 'glossary'), 'zh-cn.json', [{ en: 'local', 'zh-cn': '本地' }]);

    const result = resolveGlossary('zh-cn', { builtInDir: BUILT_IN_DIR, cwd });

    expect(result.origin).toBe('repo-local');
    expect(result.glossary!.terms).toHaveLength(1);
  });

  it('accepts the flat glossary-<lang>.json form too', () => {
    writeGlossary(cwd, 'glossary-zh-cn.json', [{ en: 'flat', 'zh-cn': '扁平' }]);

    const result = resolveGlossary('zh-cn', { builtInDir: BUILT_IN_DIR, cwd });

    expect(result.origin).toBe('repo-local');
    expect(result.glossary!.terms).toHaveLength(1);
  });

  it('treats an explicit path as the only candidate', () => {
    // A repo-local glossary exists and must NOT win over an explicit --glossary.
    writeGlossary(path.join(cwd, 'glossary'), 'zh-cn.json', [{ en: 'local', 'zh-cn': '本地' }]);
    const custom = writeGlossary(tempDir(), 'custom.json', [
      { en: 'custom', 'zh-cn': '自定义' },
      { en: 'second', 'zh-cn': '第二' },
    ]);

    const result = resolveGlossary('zh-cn', { builtInDir: BUILT_IN_DIR, cwd, customPath: custom });

    expect(result.origin).toBe('custom');
    expect(result.glossary!.terms).toHaveLength(2);
  });

  // ── loud failure ──────────────────────────────────────────────────────────

  it('throws when an explicit path does not exist', () => {
    expect(() =>
      resolveGlossary('zh-cn', { builtInDir: BUILT_IN_DIR, cwd, customPath: '/no/such.json' })
    ).toThrow(/Glossary not found/);
  });

  it('throws on malformed JSON instead of silently falling through', () => {
    fs.mkdirSync(path.join(cwd, 'glossary'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'glossary', 'zh-cn.json'), '{ not json', 'utf-8');

    expect(() => resolveGlossary('zh-cn', { builtInDir: BUILT_IN_DIR, cwd })).toThrow(
      /not valid JSON/
    );
  });

  it('throws when a glossary has no terms array', () => {
    fs.mkdirSync(path.join(cwd, 'glossary'), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, 'glossary', 'zh-cn.json'),
      JSON.stringify({ version: '1.0' }),
      'utf-8'
    );

    expect(() => resolveGlossary('zh-cn', { builtInDir: BUILT_IN_DIR, cwd })).toThrow(/terms/);
  });

  it('returns no glossary for a language that has none anywhere', () => {
    const result = resolveGlossary('xx-unknown', { builtInDir: BUILT_IN_DIR, cwd });

    expect(result.glossary).toBeUndefined();
    expect(result.candidates.length).toBeGreaterThan(0);
  });
});

describe('loadGlossary reporting', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = tempDir();
  });

  afterEach(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('reports the origin, term count and path on success', () => {
    const logger = createTestLogger();

    loadGlossary('zh-cn', { builtInDir: BUILT_IN_DIR, cwd }, logger);

    const info = logger.messages.filter((m) => m.level === 'info');
    expect(info).toHaveLength(1);
    expect(info[0].text).toContain('built-in');
    expect(info[0].text).toContain('zh-cn');
    expect(info[0].text).toMatch(/\d+ terms/);
  });

  it('warns loudly, and names every path tried, when nothing is found', () => {
    const logger = createTestLogger();

    const glossary = loadGlossary('xx-unknown', { builtInDir: BUILT_IN_DIR, cwd }, logger);

    expect(glossary).toBeUndefined();
    const warnings = logger.messages.filter((m) => m.level === 'warn');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].text).toContain('WITHOUT terminology enforcement');
    expect(warnings[0].text).toContain(path.join(BUILT_IN_DIR, 'xx-unknown.json'));
  });

  it('calls out a missing built-in directory as a wiring bug', () => {
    // A caller that forgets to thread builtInGlossaryDir through reintroduces
    // the CWD-only lookup — say so rather than reporting a plain miss.
    const logger = createTestLogger();

    loadGlossary('zh-cn', { cwd }, logger);

    const warnings = logger.messages.filter((m) => m.level === 'warn');
    expect(warnings[0].text).toContain('wiring bug');
  });

  it('says nothing when no logger is supplied', () => {
    expect(() => loadGlossary('zh-cn', { builtInDir: BUILT_IN_DIR, cwd })).not.toThrow();
  });
});

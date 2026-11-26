/**
 * Tests for .translate/ metadata — read/write config and per-file state
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';
import {
  readConfig,
  writeConfig,
  readFileState,
  inspectFileState,
  writeFileState,
  mergeFileState,
  isSourceChanged,
  serializeFileState,
  serializeConfig,
  stateFileRelativePath,
  configRelativePath,
  getToolVersion,
  listStateFiles,
  readStateExceptions,
} from '../translate-state.js';
import { TranslateConfig, FileState } from '../types.js';

// ============================================================================
// SETUP
// ============================================================================

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'translate-state-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ============================================================================
// CONFIG TESTS
// ============================================================================

describe('config read/write', () => {
  test('writeConfig creates .translate/config.yml', () => {
    const config: TranslateConfig = {
      'source-language': 'en',
      'target-language': 'zh-cn',
      'docs-folder': 'lectures',
    };
    writeConfig(tmpDir, config);

    const configPath = path.join(tmpDir, '.translate', 'config.yml');
    expect(fs.existsSync(configPath)).toBe(true);

    const content = fs.readFileSync(configPath, 'utf-8');
    expect(content).toContain('source-language');
    expect(content).toContain('zh-cn');
    expect(content).toContain('lectures');
  });

  test('readConfig returns written config', () => {
    const config: TranslateConfig = {
      'source-language': 'en',
      'target-language': 'fa',
      'docs-folder': 'docs',
    };
    writeConfig(tmpDir, config);

    const result = readConfig(tmpDir);
    expect(result).toMatchObject(config);
    expect(result?.['tool-version']).toBe(getToolVersion());
  });

  test('readConfig returns undefined when no .translate/ exists', () => {
    expect(readConfig(tmpDir)).toBeUndefined();
  });

  test('readConfig returns undefined for malformed YAML', () => {
    const configDir = path.join(tmpDir, '.translate');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'config.yml'), 'not: valid: yaml: [', 'utf-8');

    expect(readConfig(tmpDir)).toBeUndefined();
  });

  test('readConfig returns undefined for incomplete config', () => {
    const configDir = path.join(tmpDir, '.translate');
    fs.mkdirSync(configDir, { recursive: true });
    // Missing 'docs-folder'
    fs.writeFileSync(
      path.join(configDir, 'config.yml'),
      'source-language: en\ntarget-language: zh-cn\n',
      'utf-8'
    );

    expect(readConfig(tmpDir)).toBeUndefined();
  });

  test('writeConfig overwrites existing config', () => {
    writeConfig(tmpDir, {
      'source-language': 'en',
      'target-language': 'zh-cn',
      'docs-folder': 'lectures',
    });
    writeConfig(tmpDir, {
      'source-language': 'en',
      'target-language': 'fa',
      'docs-folder': 'docs',
    });

    const result = readConfig(tmpDir);
    expect(result?.['target-language']).toBe('fa');
    expect(result?.['docs-folder']).toBe('docs');
  });

  // #243: bootstrap commands rebuild config.yml from the three core fields, so
  // any key they do not know about — the `editors:` routing block being the
  // motivating case — must survive the rewrite rather than being deleted.
  describe('writeConfig merge (#243)', () => {
    const coreConfig: TranslateConfig = {
      'source-language': 'en',
      'target-language': 'zh-cn',
      'docs-folder': 'lectures',
    };

    const configPath = () => path.join(tmpDir, '.translate', 'config.yml');

    const writeRaw = (content: string) => {
      fs.mkdirSync(path.join(tmpDir, '.translate'), { recursive: true });
      fs.writeFileSync(configPath(), content, 'utf-8');
    };

    test('unknown top-level keys survive a writeConfig round trip', () => {
      writeRaw(
        'source-language: en\n' +
          'target-language: zh-cn\n' +
          'docs-folder: lectures\n' +
          'editors:\n' +
          '  primary: HumphreyYang\n' +
          '  secondary:\n' +
          '    - nisha617\n' +
          'custom-flag: strict\n'
      );

      writeConfig(tmpDir, coreConfig);

      const result = yaml.load(fs.readFileSync(configPath(), 'utf-8')) as Record<string, unknown>;
      expect(result['editors']).toEqual({ primary: 'HumphreyYang', secondary: ['nisha617'] });
      expect(result['custom-flag']).toBe('strict');
      expect(result['source-language']).toBe('en');
      expect(result['tool-version']).toBe(getToolVersion());
    });

    test('unknown keys survive even when core fields are missing (mid-repair config)', () => {
      // readConfig would reject this file; the merge read must not.
      writeRaw('editors:\n  primary: Zahra-khanzadeh\n');

      writeConfig(tmpDir, coreConfig);

      const result = readConfig(tmpDir) as unknown as Record<string, unknown>;
      expect(result['editors']).toEqual({ primary: 'Zahra-khanzadeh' });
      expect(result['docs-folder']).toBe('lectures');
    });

    test('caller wins per top-level key, and the merge is shallow', () => {
      writeRaw('docs-folder: old-folder\neditors:\n  primary: Honaminto\n');

      writeConfig(tmpDir, coreConfig);

      const result = yaml.load(fs.readFileSync(configPath(), 'utf-8')) as Record<string, unknown>;
      expect(result['docs-folder']).toBe('lectures');
      expect(result['editors']).toEqual({ primary: 'Honaminto' });
    });

    test('existing key order is preserved (minimal diff churn in committed files)', () => {
      writeRaw('editors:\n  primary: adisankarmt\nsource-language: en\n');

      writeConfig(tmpDir, coreConfig);

      const content = fs.readFileSync(configPath(), 'utf-8');
      expect(content.indexOf('editors:')).toBeLessThan(content.indexOf('source-language:'));
    });

    test('throws on unparseable YAML and leaves the file untouched', () => {
      const broken = 'editors:\n  primary: [unclosed\n';
      writeRaw(broken);

      expect(() => writeConfig(tmpDir, coreConfig)).toThrow(/not valid YAML/);
      expect(fs.readFileSync(configPath(), 'utf-8')).toBe(broken);
    });

    test('throws when the existing file is not a YAML mapping', () => {
      writeRaw('- a\n- b\n');

      expect(() => writeConfig(tmpDir, coreConfig)).toThrow(/not a YAML mapping/);
    });

    test('an empty existing file is treated as an empty mapping', () => {
      writeRaw('');

      writeConfig(tmpDir, coreConfig);

      expect(readConfig(tmpDir)).toMatchObject(coreConfig);
    });

    test('bare-date values in preserved keys round-trip as written (no timestamp coercion)', () => {
      // DEFAULT_SCHEMA would parse this to a JS Date and rewrite it as
      // 2026-08-05T00:00:00.000Z; CORE_SCHEMA keeps it a plain string.
      writeRaw('editors:\n  primary: HumphreyYang\n  since: 2026-08-05\n');

      writeConfig(tmpDir, coreConfig);

      const content = fs.readFileSync(configPath(), 'utf-8');
      expect(content).toContain('since: 2026-08-05\n');
      expect(content).not.toContain('T00:00:00');
    });

    test('throws when the existing file is a bare scalar', () => {
      writeRaw('just a scalar\n');

      expect(() => writeConfig(tmpDir, coreConfig)).toThrow(/not a YAML mapping/);
    });

    test('throws when the existing file is a bare date scalar (not silently rebuilt)', () => {
      // Under DEFAULT_SCHEMA this loads as a Date — an object that passes a
      // typeof guard and spreads to {}, i.e. a silent rebuild. It must throw.
      writeRaw('2026-08-05\n');

      expect(() => writeConfig(tmpDir, coreConfig)).toThrow(/not a YAML mapping/);
    });

    test('throws on typed non-mapping documents rather than merging garbage', () => {
      // Under DEFAULT_SCHEMA !!binary loads as a Uint8Array whose numeric
      // index keys would be spread into the rewritten config. Under
      // CORE_SCHEMA the unknown tag fails the parse — either way, loud.
      writeRaw('!!binary "SGVsbG8="\n');

      expect(() => writeConfig(tmpDir, coreConfig)).toThrow(/not valid YAML|not a YAML mapping/);
    });

    test('YAML comments in the existing file are not preserved (documented limitation)', () => {
      writeRaw('editors:\n  # zh lead\n  primary: HumphreyYang\n');

      writeConfig(tmpDir, coreConfig);

      const content = fs.readFileSync(configPath(), 'utf-8');
      expect(content).toContain('primary: HumphreyYang');
      expect(content).not.toContain('# zh lead');
    });

    // #370: the reasons are values, so they survive the rewrite that drops comments
    test('state-exceptions survives a writeConfig round trip, reasons included', () => {
      writeRaw(
        'source-language: en\ntarget-language: ml\ndocs-folder: lectures\n' +
          'state-exceptions:\n' +
          '  intro.md: English copy until its review round\n' +
          '  _admonition/gpu.md: 2026-12-01\n'
      );
      const before = readStateExceptions(tmpDir);

      writeConfig(tmpDir, coreConfig);

      expect(readStateExceptions(tmpDir)).toEqual(before);
      expect(before.entries.map((e) => e.reason)).toEqual([
        'English copy until its review round',
        '2026-12-01',
      ]);
    });
  });
});

describe('readStateExceptions (#370)', () => {
  const writeRaw = (content: string) => {
    fs.mkdirSync(path.join(tmpDir, '.translate'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.translate', 'config.yml'), content, 'utf-8');
  };
  const CORE = 'source-language: en\ntarget-language: ml\ndocs-folder: lectures\n';

  test.each([
    ['no config', undefined],
    ['no key', CORE],
    ['a key with nothing under it', `${CORE}state-exceptions:\n`],
    ['an empty mapping', `${CORE}state-exceptions: {}\n`],
  ])('reads %s as no exceptions', (_case, content) => {
    if (content !== undefined) writeRaw(content);
    expect(readStateExceptions(tmpDir)).toEqual({ entries: [], problems: [] });
  });

  test('returns each key as written, for the caller to put in its spelling', () => {
    writeRaw(`${CORE}state-exceptions:\n  ./intro.md: a\n  _admonition/gpu.md: b\n`);

    expect(readStateExceptions(tmpDir)).toEqual({
      entries: [
        { key: './intro.md', reason: 'a' },
        { key: '_admonition/gpu.md', reason: 'b' },
      ],
      problems: [],
    });
  });

  test('reads a bare date as the text it was written as (CORE_SCHEMA)', () => {
    writeRaw(`${CORE}state-exceptions:\n  intro.md: 2026-12-01\n`);
    expect(readStateExceptions(tmpDir).entries[0].reason).toBe('2026-12-01');
  });

  test('keeps the entries it can use beside the ones it names as problems', () => {
    writeRaw(`${CORE}state-exceptions:\n  intro.md: English copy\n  cobweb.md: 2026\n`);
    expect(readStateExceptions(tmpDir)).toEqual({
      entries: [{ key: 'intro.md', reason: 'English copy' }],
      problems: ['`cobweb.md`: its reason is a number; write why it has no state file, as text'],
    });
  });

  test('names a repeated key, with its line, and uses no entry', () => {
    writeRaw(`${CORE}state-exceptions:\n  intro.md: a\n  intro.md: b\n`);
    expect(readStateExceptions(tmpDir)).toEqual({
      entries: [],
      problems: [
        '.translate/config.yml: it repeats a key at line 6 (`intro.md: b`), which YAML does ' +
          'not allow, so state-exceptions could not be read',
      ],
    });
  });

  test('names a config that is not a mapping', () => {
    writeRaw('- source-language: en\n');
    expect(readStateExceptions(tmpDir).problems).toEqual([
      '.translate/config.yml is not a YAML mapping, so state-exceptions could not be read',
    ]);
  });
});

// ============================================================================
// PER-FILE STATE TESTS
// ============================================================================

describe('file state read/write', () => {
  const sampleState: FileState = {
    'source-sha': 'abc1234f',
    'synced-at': '2026-03-06',
    model: 'claude-sonnet-4-6',
    mode: 'NEW',
    'section-count': 5,
  };

  test('writeFileState creates state file', () => {
    writeFileState(tmpDir, 'intro.md', sampleState);

    const statePath = path.join(tmpDir, '.translate', 'state', 'intro.md.yml');
    expect(fs.existsSync(statePath)).toBe(true);
  });

  test('readFileState returns written state', () => {
    writeFileState(tmpDir, 'intro.md', sampleState);

    const result = readFileState(tmpDir, 'intro.md');
    expect(result).toMatchObject(sampleState);
    expect(result?.['tool-version']).toBe(getToolVersion());
  });

  test('readFileState returns undefined when file does not exist', () => {
    expect(readFileState(tmpDir, 'nonexistent.md')).toBeUndefined();
    expect(inspectFileState(tmpDir, 'nonexistent.md')).toEqual({ status: 'missing' });
  });

  describe('a hand-written state file (#381)', () => {
    const lines = (overrides: Record<string, string | undefined> = {}): string => {
      const fields: Record<string, string | undefined> = {
        'source-sha': 'abc1234',
        'synced-at': '"2026-10-19"',
        model: 'claude-sonnet-5',
        mode: 'NEW',
        'section-count': '3',
        ...overrides,
      };
      return Object.entries(fields)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}: ${value}\n`)
        .join('');
    };
    const write = (text: string): void => {
      const statePath = path.join(tmpDir, '.translate', 'state', 'intro.md.yml');
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      fs.writeFileSync(statePath, text, 'utf-8');
    };

    test('an unquoted date is read, as the string it was written as', () => {
      write(lines({ 'synced-at': '2026-10-19' }));

      const state = readFileState(tmpDir, 'intro.md');
      expect(state?.['synced-at']).toBe('2026-10-19');
    });

    test('a key the reader does not know is kept', () => {
      write(lines() + 'signed-off-by: editor\n');

      expect(readFileState(tmpDir, 'intro.md')).toMatchObject({ 'signed-off-by': 'editor' });
    });

    test.each([
      [
        'an all-digit source-sha',
        lines({ 'source-sha': '1111111' }),
        '`source-sha` is a number, not a string: quote it',
      ],
      ['a missing model', lines({ model: undefined }), '`model` is missing'],
      [
        'a quoted section count',
        lines({ 'section-count': '"3"' }),
        '`section-count` is a string, not a number: write it without quotes',
      ],
      ['a list', '- a\n- b\n', 'it is not a YAML mapping of keys to values'],
    ])('%s is rejected, with the reason', (_name, text, reason) => {
      write(text);

      expect(inspectFileState(tmpDir, 'intro.md')).toEqual({ status: 'invalid', reason });
      expect(readFileState(tmpDir, 'intro.md')).toBeUndefined();
    });

    test('text that does not parse is rejected as unreadable YAML', () => {
      write('{{{ not yaml at all');

      const read = inspectFileState(tmpDir, 'intro.md');
      expect(read.status).toBe('invalid');
      expect(read.status === 'invalid' && read.reason).toContain('could not be read as YAML');
    });
  });

  test('handles subdirectory paths', () => {
    writeFileState(tmpDir, 'advanced/cobweb.md', sampleState);

    const statePath = path.join(tmpDir, '.translate', 'state', 'advanced', 'cobweb.md.yml');
    expect(fs.existsSync(statePath)).toBe(true);

    const result = readFileState(tmpDir, 'advanced/cobweb.md');
    expect(result).toMatchObject(sampleState);
  });

  test('handles deeply nested paths', () => {
    writeFileState(tmpDir, 'a/b/c.md', sampleState);

    const result = readFileState(tmpDir, 'a/b/c.md');
    expect(result).toMatchObject(sampleState);
  });

  test('different modes are preserved', () => {
    const updateState: FileState = { ...sampleState, mode: 'UPDATE' };
    const resyncState: FileState = { ...sampleState, mode: 'RESYNC' };

    writeFileState(tmpDir, 'file1.md', updateState);
    writeFileState(tmpDir, 'file2.md', resyncState);

    expect(readFileState(tmpDir, 'file1.md')?.mode).toBe('UPDATE');
    expect(readFileState(tmpDir, 'file2.md')?.mode).toBe('RESYNC');
  });

  test('readFileState returns undefined for malformed state file', () => {
    const stateDir = path.join(tmpDir, '.translate', 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, 'bad.md.yml'), 'just-a-string', 'utf-8');

    expect(readFileState(tmpDir, 'bad.md')).toBeUndefined();
  });

  test('readFileState returns undefined for incomplete state', () => {
    const stateDir = path.join(tmpDir, '.translate', 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    // Missing 'section-count'
    fs.writeFileSync(
      path.join(stateDir, 'partial.md.yml'),
      'source-sha: abc\nsynced-at: "2026-01-01"\nmodel: test\nmode: NEW\n',
      'utf-8'
    );

    expect(readFileState(tmpDir, 'partial.md')).toBeUndefined();
  });

  test('overwrites existing state', () => {
    writeFileState(tmpDir, 'intro.md', sampleState);
    const updated: FileState = {
      ...sampleState,
      'source-sha': 'new1234f',
      'synced-at': '2026-03-10',
      mode: 'RESYNC',
    };
    writeFileState(tmpDir, 'intro.md', updated);

    const result = readFileState(tmpDir, 'intro.md');
    expect(result?.['source-sha']).toBe('new1234f');
    expect(result?.mode).toBe('RESYNC');
  });
});

describe('a state file keeps the keys the engine does not own (#290)', () => {
  const state: FileState = {
    'source-sha': 'abc1234f',
    'synced-at': '2026-11-25',
    model: 'claude-sonnet-5',
    mode: 'UPDATE',
    'section-count': 4,
  };
  const withVersion = { ...state, 'tool-version': getToolVersion() };
  const statePath = () => path.join(tmpDir, '.translate', 'state', 'intro.md.yml');
  const seed = (content: string) => {
    fs.mkdirSync(path.dirname(statePath()), { recursive: true });
    fs.writeFileSync(statePath(), content, 'utf-8');
  };
  const REVIEWED = [
    'reviewed:',
    '  by: an-editor',
    '  role: native reviewer',
    '  date: 2026-11-20',
    '  target-sha: 9f8e7d6',
    '  source-sha: "0123456"',
    '  via: approval',
    '  checked: [intro, exercises]',
    '  notes:',
    '    - first round',
    '    - second round',
    'status: reviewed',
    'weight: 3',
    'flag: true',
    'nothing: null',
    '',
  ].join('\n');

  // Existing state files as the engine and its tests have written them: the
  // fixtures of the bundle tests, the e2e harness's seed, a headingmap test's,
  // and every file the CLI writes. None has a key the engine does not own.
  const ENGINE_ONLY_FIXTURES: string[] = [
    'source-sha: 1111111\nsynced-at: "2026-10-01"\nmodel: claude-sonnet-5\nmode: NEW\nsection-count: 1\n',
    "source-sha: abc1234\nsynced-at: '2026-10-01'\nmodel: claude-sonnet-5\nmode: NEW\nsection-count: 1\n",
    'source-sha: abc123\nsynced-at: "2026-01-01"\nmodel: claude-sonnet-4-6\nmode: NEW\nsection-count: 99\ntool-version: 0.8.0\n',
    'source-sha: "0123456"\nsynced-at: 2026-10-19\nmodel: claude-sonnet-5\nmode: RESYNC\nsection-count: 7\ntool-version: 0.33.0\n',
    serializeFileState({ ...state, mode: 'NEW', 'tool-version': '0.30.0' }),
    serializeFileState({ ...state, 'source-sha': 'unknown', mode: 'RESYNC' }),
  ];

  it.each(ENGINE_ONLY_FIXTURES.map((fixture, i) => [i, fixture]))(
    'writes a file with no other key byte for byte as before (fixture %i)',
    (_i, fixture) => {
      expect(mergeFileState(fixture, withVersion, 'x').content).toBe(
        serializeFileState(withVersion)
      );
      seed(fixture);
      expect(writeFileState(tmpDir, 'intro.md', state)).toBeUndefined();
      expect(fs.readFileSync(statePath(), 'utf-8')).toBe(serializeFileState(withVersion));
    }
  );

  it('writes a new file byte for byte as before', () => {
    expect(mergeFileState(undefined, withVersion, 'x')).toEqual({
      content: serializeFileState(withVersion),
    });
    expect(writeFileState(tmpDir, 'intro.md', state)).toBeUndefined();
    expect(fs.readFileSync(statePath(), 'utf-8')).toBe(serializeFileState(withVersion));
  });

  it('keeps the engine keys in the order the writer gives them, as before', () => {
    // headingmap passes the existing state back in, in the file's order.
    const reordered = { model: 'm', mode: 'NEW', 'source-sha': 's', 'synced-at': 'd' };
    const given = { ...reordered, 'section-count': 2 } as FileState;
    expect(mergeFileState('model: x\n', given, 'x').content).toBe(serializeFileState(given));
  });

  it('keeps every other key, its value and its order, after the engine keys', () => {
    seed('source-sha: old\nmode: NEW\n' + REVIEWED);
    expect(writeFileState(tmpDir, 'intro.md', state)).toBeUndefined();
    const written = fs.readFileSync(statePath(), 'utf-8');
    expect(written.startsWith(serializeFileState(withVersion))).toBe(true);
    const loaded = yaml.load(written, { schema: yaml.CORE_SCHEMA }) as Record<string, unknown>;
    const before = yaml.load(REVIEWED, { schema: yaml.CORE_SCHEMA }) as Record<string, unknown>;
    expect(Object.keys(loaded)).toEqual([...Object.keys(withVersion), ...Object.keys(before)]);
    for (const key of Object.keys(before)) expect(loaded[key]).toEqual(before[key]);
    // A bare date stays the text it was, and a quoted all-digit SHA a string.
    expect(written).toContain('  date: 2026-11-20\n');
    expect(written).toContain('  source-sha: "0123456"\n');
    // The engine's values win over the file's.
    expect(loaded['source-sha']).toBe('abc1234f');
    expect(loaded.mode).toBe('UPDATE');
    expect(readFileState(tmpDir, 'intro.md')).toMatchObject(state);
  });

  it('keeps the other keys through a second write unchanged', () => {
    seed(serializeFileState(withVersion) + 'reviewed:\n  by: an-editor\n');
    writeFileState(tmpDir, 'intro.md', state);
    const once = fs.readFileSync(statePath(), 'utf-8');
    writeFileState(tmpDir, 'intro.md', state);
    expect(fs.readFileSync(statePath(), 'utf-8')).toBe(once);
    expect(once).toBe(serializeFileState(withVersion) + 'reviewed:\n  by: an-editor\n');
  });

  it('ignores a key of the given state that the engine does not own', () => {
    const given = { ...withVersion, reviewed: 'stale' } as unknown as FileState;
    expect(mergeFileState('reviewed: kept\n', given, 'x').content).toBe(
      serializeFileState(withVersion) + 'reviewed: kept\n'
    );
  });

  it("keeps a kept key's comments, and drops those in the engine keys' region", () => {
    seed(
      '# signed off by hand\nsource-sha: old # the old one\n# about the sign-off\n' +
        'reviewed: done # the editor\n'
    );
    expect(writeFileState(tmpDir, 'intro.md', state)).toBeUndefined();
    expect(fs.readFileSync(statePath(), 'utf-8')).toBe(
      serializeFileState(withVersion) + '# about the sign-off\nreviewed: done # the editor\n'
    );
  });

  it.each([
    ['unparseable YAML', 'source-sha: [abc\nreviewed: x\n', 'could not be read as YAML'],
    ['a list', '- a\n- b\n', 'was not a YAML mapping'],
    ['a scalar', 'just-a-string\n', 'was not a YAML mapping'],
  ])('overwrites %s with a warning', (_what, content, warning) => {
    seed(content);
    const returned = writeFileState(tmpDir, 'intro.md', state);
    expect(returned).toContain(`.translate/state/intro.md.yml ${warning}`);
    expect(returned).toContain('so it was overwritten');
    expect(returned).toContain('any keys it held besides the ones sync writes are gone');
    expect(fs.readFileSync(statePath(), 'utf-8')).toBe(serializeFileState(withVersion));
    expect(mergeFileState(content, withVersion, 'x').overwritten).toBe(true);
  });

  it('keeps the ruled behaviour for a repeated key: not a mapping, overwritten with a warning', () => {
    const merged = mergeFileState(
      'source-sha: a\nreviewed: x\nreviewed: y\n',
      withVersion,
      '.translate/state/intro.md.yml'
    );
    expect(merged.content).toBe(serializeFileState(withVersion));
    expect(merged.overwritten).toBe(true);
    expect(merged.warning).toBe(
      '.translate/state/intro.md.yml could not be read as YAML (duplicated mapping key (3:1)), ' +
        'so it was overwritten: any keys it held besides the ones sync writes are gone'
    );
  });

  it.each([
    ['an empty file', ''],
    ['a blank file', '\n\n'],
    ['a comment-only file', '# nothing yet\n'],
  ])('overwrites %s with a warning that it held no keys', (_what, content) => {
    seed(content);
    expect(writeFileState(tmpDir, 'intro.md', state)).toBe(
      '.translate/state/intro.md.yml held no keys (it was empty, or only comments), so it was ' +
        'overwritten'
    );
    expect(fs.readFileSync(statePath(), 'utf-8')).toBe(serializeFileState(withVersion));
    // Nothing was lost, so the sync PR body does not name it.
    expect(mergeFileState(content, withVersion, 'x').overwritten).toBeUndefined();
  });

  describe('a kept key is carried as the text it was', () => {
    const engine = () => serializeFileState(withVersion);
    const kept = (existing: string) => {
      const merged = mergeFileState(existing, withVersion, 'x');
      expect(merged.warning).toBeUndefined();
      expect(merged.content.startsWith(engine())).toBe(true);
      return merged.content.slice(engine().length);
    };

    // Each of these a load and dump retyped (#290's review): a leading zero
    // lost, an exponent or a hex number read as a number, a long integer
    // rounded, a trailing zero dropped.
    it.each([
      'target-sha: 0123456',
      'target-sha: 1234e56',
      'n: 1e5',
      'n: 1.10',
      'n: 0x1f',
      'n: 0o17',
      'n: 1_000',
      'n: 1234567890123456789',
      'n: 12345678901234567890123456789012345678901',
      'p: 007',
      't: 1:30',
      'd: 2026-11-25T10:00:00Z',
      'yes: on',
      'b: TRUE',
    ])('keeps `%s` verbatim', (line) => {
      expect(kept(`source-sha: old\n${line}\n`)).toBe(`${line}\n`);
    });

    it('keeps a nested map, a sequence and a block scalar, with their comments', () => {
      const text = [
        '# the sign-off',
        'reviewed:',
        '  by: an-editor # who',
        '  checked: [intro, exercises]',
        '  notes:',
        '    - first round',
        '    # between',
        '    - second round',
        'history:',
        '- {by: a, date: 2026-01-01}',
        '- by: b',
        '  date: 2026-02-02',
        'note: |',
        '  line one',
        '',
        '  trailing  ',
        'folded: >-',
        '  a b',
        '  c',
        '',
      ].join('\n');
      expect(kept('source-sha: old\nmode: NEW\n' + text)).toBe(text);
    });

    it('keeps the kept keys in their order, after the engine keys, wherever they stood', () => {
      expect(kept('2026: year\nsource-sha: old\nz: 1\nmode: NEW\n1: one\n')).toBe(
        '2026: year\nz: 1\n1: one\n'
      );
    });

    it('keeps a `__proto__` key, and keys named like Object methods', () => {
      const text = '__proto__: {a: 1}\nconstructor: x\ntoString: y\n';
      expect(kept('source-sha: old\n' + text)).toBe(text);
      const loaded = yaml.load(mergeFileState(text, withVersion, 'x').content, {
        schema: yaml.CORE_SCHEMA,
      }) as Record<string, unknown>;
      expect(Object.prototype.hasOwnProperty.call(loaded, '__proto__')).toBe(true);
    });

    it('keeps anchors and aliases between kept keys', () => {
      const text = 'base: &b {by: me}\nreviewed:\n  <<: *b\n  date: 2026-01-01\n';
      expect(kept('source-sha: old\n' + text)).toBe(text);
    });

    it('makes CRLF line endings LF, values unchanged', () => {
      expect(kept('source-sha: old\r\nreviewed:\r\n  by: me\r\nnote: |\r\n  a\r\n  b\r\n')).toBe(
        'reviewed:\n  by: me\nnote: |\n  a\n  b\n'
      );
    });

    it('leaves out a document-start marker above the first key', () => {
      expect(kept('---\nsource-sha: old\nreviewed: x\n')).toBe('reviewed: x\n');
    });

    it('is written the same by a second write', () => {
      const first = mergeFileState('reviewed: x # c\nsource-sha: a\n', withVersion, 'x');
      expect(mergeFileState(first.content, withVersion, 'x')).toEqual(first);
    });
  });

  describe('falls back to writing the kept values out again, with a warning, when the text cannot be carried', () => {
    const fallbackWarning =
      'x: the keys it held besides the ones sync writes were kept, but their text could not be ' +
      'carried over as written, so they were written out again: each value keeps its text, but ' +
      'quoting, comments and layout may have changed';

    it.each([
      ['an alias of an anchor in an engine key', 'source-sha: &s abc\nreviewed: *s\n'],
      ['a flow mapping at the top', '{source-sha: abc, reviewed: x}\n'],
      ['a byte-order mark', '\u{feff}source-sha: abc\nreviewed: x\n'],
      ['a tab in a value', 'source-sha: abc\nreviewed: "a\tb"\n'],
      ['a complex key', '? [a, b]\n: c\nsource-sha: abc\n'],
      ['a document-end marker', 'source-sha: abc\nreviewed: x\n...\n'],
      ['a %YAML directive', '%YAML 1.2\n---\nsource-sha: abc\nreviewed: x\n'],
      ['indented top-level keys', '  source-sha: abc\n  reviewed: x\n'],
      ['CR-only line endings', 'source-sha: abc\rreviewed: x\r'],
      // These two split cleanly and only the value check catches them: the comment line
      // is part of the scalar, and the blank lines are part of a kept-chomping one.
      [
        'a block scalar that ends in a comment-like line before an engine key',
        'note: |\n  line\n  # in scalar\nsource-sha: abc\n',
      ],
      [
        'a keep-chomping block scalar at the end of the file',
        'source-sha: abc\nnote: |+\n  line\n\n\n',
      ],
    ])('%s', (_what, existing) => {
      const original = yaml.load(existing, { schema: yaml.CORE_SCHEMA }) as Record<string, unknown>;
      const merged = mergeFileState(existing, withVersion, 'x');
      expect(merged.warning).toBe(fallbackWarning);
      expect(merged.overwritten).toBeUndefined();
      // The values are kept, re-serialised.
      const loaded = yaml.load(merged.content, { schema: yaml.CORE_SCHEMA }) as Record<
        string,
        unknown
      >;
      for (const key of Object.keys(original).filter((k) => k !== 'source-sha')) {
        expect(loaded[key]).toEqual(original[key]);
      }
    });

    it('keeps a `__proto__` key there too', () => {
      const merged = mergeFileState('{__proto__: {a: 1}, b: 2}\n', withVersion, 'x');
      expect(merged.warning).toBe(fallbackWarning);
      expect(merged.content.slice(serializeFileState(withVersion).length)).toBe(
        '__proto__:\n  a: 1\nb: 2\n'
      );
    });

    // A plain scalar that CORE_SCHEMA reads as a number is written back as the
    // text it was: an abbreviated SHA of digits, or of digits and one `e`, is
    // exactly such a value (#290).
    const kept = (existing: string) =>
      mergeFileState(existing, withVersion, 'x').content.slice(
        serializeFileState(withVersion).length
      );
    const TAB = '\t';

    it.each([
      ['a tab', `reviewed: "a${TAB}b"\n`],
      ['a byte-order mark', '\u{feff}'],
      ['a document-end marker', ''],
      ['a %YAML directive', '%YAML 1.2\n---\n'],
      ['CR-only line endings', ''],
    ])('keeps each abbreviated SHA as written, beside %s', (what, extra) => {
      const body = 'signed-off-sha: 1234e56\nhex-sha: 0x1f\nzero-sha: 0123456\n';
      const existing =
        what === 'a document-end marker'
          ? `source-sha: abc\n${body}...\n`
          : what === 'CR-only line endings'
            ? `source-sha: abc\n${body}`.replace(/\n/g, '\r')
            : what === 'a tab'
              ? `source-sha: abc\n${body}${extra}`
              : `${extra}source-sha: abc\n${body}`;
      const merged = mergeFileState(existing, withVersion, 'x');
      expect(merged.warning).toBe(fallbackWarning);
      expect(kept(existing)).toContain(
        'signed-off-sha: 1234e56\nhex-sha: 0x1f\nzero-sha: 0123456\n'
      );
    });

    it('keeps them as written beside indented top-level keys', () => {
      const existing = '  source-sha: abc\n  signed-off-sha: 1234e56\n  zero-sha: 0123456\n';
      expect(mergeFileState(existing, withVersion, 'x').warning).toBe(fallbackWarning);
      expect(kept(existing)).toBe('signed-off-sha: 1234e56\nzero-sha: 0123456\n');
    });

    it('writes plain scalars back as the same plain text, and quoted ones quoted', () => {
      const existing = [
        'source-sha: abc',
        `note: "a${TAB}b"`,
        'flag: true',
        'nothing: null',
        'tilde: ~',
        'empty:',
        'exp: 1e5',
        'octal: 0o17',
        'quoted-flag: "true"',
        "quoted-zero: '0123456'",
        'text: plain words',
        '',
      ].join('\n');
      expect(kept(existing)).toBe(
        [
          // The tab, which sent the file down this path, is written escaped.
          'note: "a\\tb"',
          'flag: true',
          'nothing: null',
          'tilde: ~',
          'empty: null',
          'exp: 1e5',
          'octal: 0o17',
          'quoted-flag: "true"',
          'quoted-zero: "0123456"',
          'text: plain words',
          '',
        ].join('\n')
      );
    });

    it('gives, loaded again, the values the original gave, with numeric text kept', () => {
      const existing = [
        'source-sha: abc',
        `note: "a${TAB}b"`,
        'signed-off-sha: 1234e56',
        'hex: 0x1f',
        'zero: 0123456',
        'flag: true',
        'nothing: null',
        'exp: 1e5',
        'quoted-flag: "true"',
        'reviewed:',
        '  by: [an-editor, 0x2a]',
        '  at:',
        '    - 2026-11-25',
        '    - "2.50"',
        '    - 2.50',
        '    - {sha: 0123456, ok: yes}',
        '',
      ].join('\n');
      const merged = mergeFileState(existing, withVersion, 'x');
      expect(merged.warning).toBe(fallbackWarning);
      const original = yaml.load(existing, { schema: yaml.CORE_SCHEMA }) as Record<string, unknown>;
      const loaded = yaml.load(merged.content, { schema: yaml.CORE_SCHEMA }) as Record<
        string,
        unknown
      >;
      for (const key of Object.keys(original).filter((k) => k !== 'source-sha')) {
        expect(loaded[key]).toEqual(original[key]);
      }
      // Nested maps and sequences round-trip, their numeric text as written.
      expect(kept(existing)).toContain(
        'reviewed:\n  by:\n    - an-editor\n    - 0x2a\n  at:\n    - 2026-11-25\n' +
          '    - "2.50"\n    - 2.50\n    - sha: 0123456\n      ok: "yes"\n'
      );
      // Idempotent: the output carries as text on the next write.
      const again = mergeFileState(merged.content, withVersion, 'x');
      expect(again.warning).toBeUndefined();
      expect(again.content).toBe(merged.content);
    });

    it('dumps the values as a last resort when a kept mapping key reads as a number', () => {
      const merged = mergeFileState(
        `source-sha: abc\nnote: "a${TAB}b"\n0x2a: x\n`,
        withVersion,
        'x'
      );
      expect(merged.warning).toBe(
        'x: the keys it held besides the ones sync writes were kept, but their text could not ' +
          'be carried over as written, so their values were re-serialised: quoting, comments ' +
          'and number formatting may have changed'
      );
      expect(merged.content).toContain('"42": x\n');
    });
  });

  it.each([
    ['!!timestamp', 'reviewed-at: !!timestamp 2026-11-25\n', '!!timestamp'],
    ['!!binary', 'blob: !!binary aGk=\n', '!!binary'],
    ['a custom tag', 'reviewed: !signoff an-editor\n', '!signoff'],
  ])('overwrites a mapping with an explicit %s tag, saying why', (_what, line, tag) => {
    const merged = mergeFileState(`source-sha: abc\n${line}`, withVersion, 'x');
    expect(merged.content).toBe(serializeFileState(withVersion));
    expect(merged.overwritten).toBe(true);
    expect(merged.overwrittenReason).toBe(
      `it uses the YAML tag ${tag}, which state files do not support`
    );
    expect(merged.warning).toBe(
      `x could not be read, since it uses the YAML tag ${tag}, which state files do not ` +
        'support, so it was overwritten: any keys it held besides the ones sync writes are gone'
    );
  });

  it('still fails when the existing file cannot be read', () => {
    fs.mkdirSync(statePath(), { recursive: true });
    expect(() => writeFileState(tmpDir, 'intro.md', state)).toThrow(/EISDIR/);
  });
});

describe('listStateFiles (#370)', () => {
  const stateDir = () => path.join(tmpDir, '.translate', 'state');
  const write = (rel: string, content = 'x: 1\n') => {
    fs.mkdirSync(path.dirname(path.join(stateDir(), rel)), { recursive: true });
    fs.writeFileSync(path.join(stateDir(), rel), content, 'utf-8');
  };

  test('is empty when there is no state folder', () => {
    expect(listStateFiles(tmpDir)).toEqual([]);
  });

  test('lists every file, subfolders and non-state files included, sorted', () => {
    write('intro.md.yml');
    write('_admonition/gpu.md.yml');
    write('.DS_Store');
    write('.hidden/notes.yml');
    write('cobweb.md.yml');

    expect(listStateFiles(tmpDir)).toEqual([
      '.DS_Store',
      '.hidden/notes.yml',
      '_admonition/gpu.md.yml',
      'cobweb.md.yml',
      'intro.md.yml',
    ]);
  });

  // Names come from the folder listing, so a check can compare them as strings
  test('keeps the case each file is written in', () => {
    write('Intro.md.yml');
    expect(listStateFiles(tmpDir)).toEqual(['Intro.md.yml']);
  });

  test('follows links inside the state folder, and leaves out links out of it or to nothing', () => {
    write('intro.md.yml');
    write('_admonition/gpu.md.yml');
    fs.writeFileSync(path.join(tmpDir, 'outside.md.yml'), 'x: 1\n', 'utf-8');
    fs.symlinkSync(path.join(stateDir(), 'intro.md.yml'), path.join(stateDir(), 'linked.md.yml'));
    fs.symlinkSync(path.join(stateDir(), '_admonition'), path.join(stateDir(), 'linked-folder'));
    fs.symlinkSync(path.join(tmpDir, 'outside.md.yml'), path.join(stateDir(), 'leak.md.yml'));
    fs.symlinkSync(
      path.join(stateDir(), 'nothing.md.yml'),
      path.join(stateDir(), 'dangling.md.yml')
    );
    // A link back to a folder being walked is a cycle, not an endless listing
    fs.symlinkSync(stateDir(), path.join(stateDir(), '_admonition', 'loop'));

    expect(listStateFiles(tmpDir)).toEqual([
      '_admonition/gpu.md.yml',
      'intro.md.yml',
      'linked-folder/gpu.md.yml',
      'linked.md.yml',
    ]);
  });
});

// ============================================================================
// STALENESS CHECK TESTS
// ============================================================================

describe('isSourceChanged', () => {
  test('returns true when state is undefined', async () => {
    const result = await isSourceChanged('/fake/path', 'lectures', 'intro.md', undefined);
    expect(result).toBe(true);
  });

  test('returns true when git metadata cannot be retrieved', async () => {
    const state: FileState = {
      'source-sha': 'abc123',
      'synced-at': '2026-03-06',
      model: 'test',
      mode: 'NEW',
      'section-count': 3,
    };
    // Non-existent repo path → getFileGitMetadata returns null
    const result = await isSourceChanged('/nonexistent/repo', 'lectures', 'test.md', state);
    expect(result).toBe(true);
  });
});

// ============================================================================
// PURE SERIALIZATION TESTS (no filesystem)
// ============================================================================

describe('serializeFileState', () => {
  test('produces valid YAML that round-trips', () => {
    const state: FileState = {
      'source-sha': 'abc123def456',
      'synced-at': '2026-03-16',
      model: 'claude-sonnet-4-20250514',
      mode: 'NEW',
      'section-count': 5,
    };
    const yamlStr = serializeFileState(state);
    expect(yamlStr).toContain('source-sha:');
    expect(yamlStr).toContain('abc123def456');
    expect(yamlStr).toContain('section-count: 5');

    // Round-trip via writeFileState/readFileState
    writeFileState(tmpDir, 'test.md', state);
    const roundTripped = readFileState(tmpDir, 'test.md');
    expect(roundTripped).toMatchObject(state);
    expect(roundTripped?.['tool-version']).toBe(getToolVersion());
  });
});

describe('serializeConfig', () => {
  test('produces valid YAML', () => {
    const config: TranslateConfig = {
      'source-language': 'en',
      'target-language': 'zh-cn',
      'docs-folder': 'lectures',
    };
    const yamlStr = serializeConfig(config);
    expect(yamlStr).toContain('source-language:');
    expect(yamlStr).toContain('zh-cn');
  });
});

describe('stateFileRelativePath', () => {
  test('returns correct path for simple filename', () => {
    expect(stateFileRelativePath('intro.md')).toBe('.translate/state/intro.md.yml');
  });

  test('returns correct path for nested filename', () => {
    expect(stateFileRelativePath('lectures/advanced/cobweb.md')).toBe(
      '.translate/state/lectures/advanced/cobweb.md.yml'
    );
  });
});

describe('configRelativePath', () => {
  test('returns correct path', () => {
    expect(configRelativePath()).toBe('.translate/config.yml');
  });
});

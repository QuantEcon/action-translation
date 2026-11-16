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

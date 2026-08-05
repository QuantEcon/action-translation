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
  writeFileState,
  isSourceChanged,
  serializeFileState,
  serializeConfig,
  stateFileRelativePath,
  configRelativePath,
  getToolVersion,
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

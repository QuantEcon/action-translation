/**
 * Tests for .translate/ metadata — read/write config and per-file state
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
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
      'utf-8',
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
      'utf-8',
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
    expect(stateFileRelativePath('lectures/advanced/cobweb.md'))
      .toBe('.translate/state/lectures/advanced/cobweb.md.yml');
  });
});

describe('configRelativePath', () => {
  test('returns correct path', () => {
    expect(configRelativePath()).toBe('.translate/config.yml');
  });
});

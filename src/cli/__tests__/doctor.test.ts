/**
 * Tests for the doctor command
 *
 * Tests health checks for target translation repositories:
 * config validation, state files, heading-maps, workflows,
 * section alignment, and console output formatting.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  checkConfig,
  checkStateFiles,
  checkHeadingMaps,
  checkSectionAlignment,
  checkWorkflow,
  checkSourceAccess,
  runDoctor,
  formatDoctorTable,
  formatDoctorJson,
  DoctorOptions,
} from '../commands/doctor.js';
import { writeConfig, writeFileState } from '../translate-state.js';

// ============================================================================
// HELPERS
// ============================================================================

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeMd(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

const TARGET_WITH_MAP = `---
jupytext:
  text_representation:
    extension: .md
heading-map:
  Section One: 第一节
  Section Two: 第二节
---

# 测试

## 第一节

内容一。

## 第二节

内容二。
`;

const TARGET_WITHOUT_MAP = `---
jupytext:
  text_representation:
    extension: .md
---

# 测试

## 第一节

内容一。

## 第二节

内容二。
`;

const SOURCE_2_SECTIONS = `---
jupytext:
  text_representation:
    extension: .md
---

# Test

## Section One

Content one.

## Section Two

Content two.
`;

const SOURCE_3_SECTIONS = `---
jupytext:
  text_representation:
    extension: .md
---

# Test

## Section One

Content one.

## Section Two

Content two.

## Section Three

Content three.
`;

// ============================================================================
// checkConfig TESTS
// ============================================================================

describe('checkConfig', () => {
  test('passes when config exists and is valid', () => {
    writeConfig(tmpDir, {
      'source-language': 'en',
      'target-language': 'zh-cn',
      'docs-folder': 'lectures',
    });

    const result = checkConfig(tmpDir);
    expect(result.status).toBe('pass');
    expect(result.message).toContain('en');
    expect(result.message).toContain('zh-cn');
  });

  test('fails when config does not exist', () => {
    const result = checkConfig(tmpDir);
    expect(result.status).toBe('fail');
    expect(result.message).toContain('not found');
  });

  test('fails when config is malformed', () => {
    const configDir = path.join(tmpDir, '.translate');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'config.yml'), 'invalid: true\n', 'utf-8');

    const result = checkConfig(tmpDir);
    expect(result.status).toBe('fail');
    expect(result.message).toContain('malformed');
  });
});

// ============================================================================
// checkStateFiles TESTS
// ============================================================================

describe('checkStateFiles', () => {
  test('passes when all files have state entries', () => {
    writeMd(path.join(tmpDir, 'lectures', 'intro.md'), TARGET_WITH_MAP);
    writeFileState(tmpDir, 'intro.md', {
      'source-sha': 'abc123',
      'synced-at': '2026-03-16',
      model: 'claude-sonnet-4-6',
      mode: 'NEW',
      'section-count': 2,
    });

    const result = checkStateFiles(tmpDir, 'lectures');
    expect(result.status).toBe('pass');
    expect(result.message).toContain('1');
  });

  test('warns when some state files missing', () => {
    writeMd(path.join(tmpDir, 'lectures', 'intro.md'), TARGET_WITH_MAP);
    writeMd(path.join(tmpDir, 'lectures', 'cobweb.md'), TARGET_WITH_MAP);
    writeFileState(tmpDir, 'intro.md', {
      'source-sha': 'abc123',
      'synced-at': '2026-03-16',
      model: 'claude-sonnet-4-6',
      mode: 'NEW',
      'section-count': 2,
    });

    const result = checkStateFiles(tmpDir, 'lectures');
    expect(result.status).toBe('warn');
    expect(result.message).toContain('1/2');
    expect(result.details).toBeDefined();
    expect(result.details?.some(d => d.includes('cobweb.md'))).toBe(true);
  });

  test('fails when state directory does not exist', () => {
    writeMd(path.join(tmpDir, 'lectures', 'intro.md'), TARGET_WITH_MAP);

    const result = checkStateFiles(tmpDir, 'lectures');
    expect(result.status).toBe('fail');
    expect(result.message).toContain('not found');
  });

  test('warns when no md files in docs folder', () => {
    fs.mkdirSync(path.join(tmpDir, 'lectures'), { recursive: true });

    const result = checkStateFiles(tmpDir, 'lectures');
    expect(result.status).toBe('warn');
    expect(result.message).toContain('No .md files');
  });
});

// ============================================================================
// checkHeadingMaps TESTS
// ============================================================================

describe('checkHeadingMaps', () => {
  test('passes when all files have heading-maps', () => {
    writeMd(path.join(tmpDir, 'lectures', 'intro.md'), TARGET_WITH_MAP);

    const result = checkHeadingMaps(tmpDir, 'lectures');
    expect(result.status).toBe('pass');
    expect(result.message).toContain('1');
  });

  test('warns when some files missing heading-maps', () => {
    writeMd(path.join(tmpDir, 'lectures', 'intro.md'), TARGET_WITH_MAP);
    writeMd(path.join(tmpDir, 'lectures', 'cobweb.md'), TARGET_WITHOUT_MAP);

    const result = checkHeadingMaps(tmpDir, 'lectures');
    expect(result.status).toBe('warn');
    expect(result.message).toContain('1/2');
  });

  test('fails when no files have heading-maps', () => {
    writeMd(path.join(tmpDir, 'lectures', 'intro.md'), TARGET_WITHOUT_MAP);

    const result = checkHeadingMaps(tmpDir, 'lectures');
    expect(result.status).toBe('fail');
    expect(result.message).toContain('0/1');
  });
});

// ============================================================================
// checkSectionAlignment TESTS
// ============================================================================

describe('checkSectionAlignment', () => {
  test('passes when section counts match', async () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');
    writeMd(path.join(sourceDir, 'lectures', 'intro.md'), SOURCE_2_SECTIONS);
    writeMd(path.join(targetDir, 'lectures', 'intro.md'), TARGET_WITH_MAP);

    const result = await checkSectionAlignment(sourceDir, targetDir, 'lectures');
    expect(result.status).toBe('pass');
  });

  test('warns when section counts differ', async () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');
    writeMd(path.join(sourceDir, 'lectures', 'intro.md'), SOURCE_3_SECTIONS);
    writeMd(path.join(targetDir, 'lectures', 'intro.md'), TARGET_WITH_MAP);

    const result = await checkSectionAlignment(sourceDir, targetDir, 'lectures');
    expect(result.status).toBe('warn');
    expect(result.details?.some(d => d.includes('3 source vs 2 target'))).toBe(true);
  });
});

// ============================================================================
// checkWorkflow TESTS
// ============================================================================

describe('checkWorkflow', () => {
  test('passes when translation workflow exists', () => {
    const workflowDir = path.join(tmpDir, '.github', 'workflows');
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(
      path.join(workflowDir, 'review-translations.yml'),
      'uses: QuantEcon/action-translation@v0.8',
      'utf-8',
    );

    const result = checkWorkflow(tmpDir);
    expect(result.status).toBe('pass');
    expect(result.message).toContain('review-translations.yml');
  });

  test('fails when no workflows directory', () => {
    const result = checkWorkflow(tmpDir);
    expect(result.status).toBe('fail');
    expect(result.message).toContain('No .github/workflows/');
  });

  test('warns when workflows exist but none reference action-translation', () => {
    const workflowDir = path.join(tmpDir, '.github', 'workflows');
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(path.join(workflowDir, 'ci.yml'), 'name: CI', 'utf-8');

    const result = checkWorkflow(tmpDir);
    expect(result.status).toBe('warn');
    expect(result.message).toContain('none reference action-translation');
  });
});

// ============================================================================
// checkSourceAccess TESTS
// ============================================================================

describe('checkSourceAccess', () => {
  test('passes when source has md files', () => {
    const sourceDir = path.join(tmpDir, 'source');
    writeMd(path.join(sourceDir, 'lectures', 'intro.md'), SOURCE_2_SECTIONS);

    const result = checkSourceAccess(sourceDir, 'lectures');
    expect(result.status).toBe('pass');
  });

  test('fails when source path does not exist', () => {
    const result = checkSourceAccess('/nonexistent/path', 'lectures');
    expect(result.status).toBe('fail');
  });

  test('warns when source has no md files', () => {
    const sourceDir = path.join(tmpDir, 'source');
    fs.mkdirSync(path.join(sourceDir, 'lectures'), { recursive: true });

    const result = checkSourceAccess(sourceDir, 'lectures');
    expect(result.status).toBe('warn');
  });
});

// ============================================================================
// runDoctor INTEGRATION TESTS
// ============================================================================

describe('runDoctor', () => {
  test('reports all checks for a healthy repo', async () => {
    // Set up a healthy target repo
    writeConfig(tmpDir, {
      'source-language': 'en',
      'target-language': 'zh-cn',
      'docs-folder': 'lectures',
    });
    writeMd(path.join(tmpDir, 'lectures', 'intro.md'), TARGET_WITH_MAP);
    writeFileState(tmpDir, 'intro.md', {
      'source-sha': 'abc123',
      'synced-at': '2026-03-16',
      model: 'claude-sonnet-4-6',
      mode: 'NEW',
      'section-count': 2,
    });
    const workflowDir = path.join(tmpDir, '.github', 'workflows');
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(
      path.join(workflowDir, 'review-translations.yml'),
      'uses: QuantEcon/action-translation@v0.8',
      'utf-8',
    );

    const result = await runDoctor({
      target: tmpDir,
      checkGh: false,
      json: false,
    });

    expect(result.summary.fail).toBe(0);
    expect(result.summary.pass).toBeGreaterThanOrEqual(3);
    expect(result.checks.find(c => c.name === '.translate/config.yml')?.status).toBe('pass');
    expect(result.checks.find(c => c.name === '.translate/state/')?.status).toBe('pass');
    expect(result.checks.find(c => c.name === 'Heading maps')?.status).toBe('pass');
    expect(result.checks.find(c => c.name === 'Workflow')?.status).toBe('pass');
  });

  test('reports failures for an unconfigured repo', async () => {
    // Empty target repo
    fs.mkdirSync(path.join(tmpDir, 'lectures'), { recursive: true });

    const result = await runDoctor({
      target: tmpDir,
      checkGh: false,
      json: false,
    });

    expect(result.summary.fail).toBeGreaterThan(0);
    expect(result.checks.find(c => c.name === '.translate/config.yml')?.status).toBe('fail');
  });

  test('includes source checks when source provided', async () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');
    writeConfig(targetDir, {
      'source-language': 'en',
      'target-language': 'zh-cn',
      'docs-folder': 'lectures',
    });
    writeMd(path.join(sourceDir, 'lectures', 'intro.md'), SOURCE_2_SECTIONS);
    writeMd(path.join(targetDir, 'lectures', 'intro.md'), TARGET_WITH_MAP);

    const result = await runDoctor({
      target: targetDir,
      source: sourceDir,
      checkGh: false,
      json: false,
    });

    expect(result.checks.some(c => c.name === 'Source repo')).toBe(true);
    expect(result.checks.some(c => c.name === 'Section alignment')).toBe(true);
  });

  test('reads docs-folder from config when not explicitly provided', async () => {
    writeConfig(tmpDir, {
      'source-language': 'en',
      'target-language': 'zh-cn',
      'docs-folder': 'docs',
    });
    writeMd(path.join(tmpDir, 'docs', 'intro.md'), TARGET_WITH_MAP);
    writeFileState(tmpDir, 'intro.md', {
      'source-sha': 'abc123',
      'synced-at': '2026-03-16',
      model: 'claude-sonnet-4-6',
      mode: 'NEW',
      'section-count': 2,
    });

    const result = await runDoctor({
      target: tmpDir,
      checkGh: false,
      json: false,
    });

    // Should find the file in docs/ not lectures/
    expect(result.checks.find(c => c.name === '.translate/state/')?.status).toBe('pass');
  });
});

// ============================================================================
// FORMATTING TESTS
// ============================================================================

describe('formatDoctorTable', () => {
  test('formats healthy results', () => {
    const result = {
      checks: [
        { name: 'Config', status: 'pass' as const, message: 'OK' },
        { name: 'State', status: 'pass' as const, message: 'OK' },
      ],
      summary: { pass: 2, warn: 0, fail: 0, total: 2 },
    };

    const output = formatDoctorTable(result);
    expect(output).toContain('Health Check');
    expect(output).toContain('✅');
    expect(output).toContain('All checks passed');
  });

  test('formats results with failures', () => {
    const result = {
      checks: [
        { name: 'Config', status: 'fail' as const, message: 'Not found', details: ['Fix hint'] },
        { name: 'State', status: 'warn' as const, message: '1/2 tracked' },
      ],
      summary: { pass: 0, warn: 1, fail: 1, total: 2 },
    };

    const output = formatDoctorTable(result);
    expect(output).toContain('❌');
    expect(output).toContain('⚠️');
    expect(output).toContain('Fix hint');
    expect(output).toContain('1 failed');
  });
});

describe('formatDoctorJson', () => {
  test('formats as valid JSON', () => {
    const result = {
      checks: [{ name: 'Config', status: 'pass' as const, message: 'OK' }],
      summary: { pass: 1, warn: 0, fail: 0, total: 1 },
    };

    const output = formatDoctorJson(result);
    const parsed = JSON.parse(output);
    expect(parsed.checks[0].name).toBe('Config');
    expect(parsed.summary.pass).toBe(1);
  });
});

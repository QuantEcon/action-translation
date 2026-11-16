/**
 * Tests for the doctor command
 *
 * Tests health checks for target translation repositories:
 * config validation, the lecture set, state files, heading-maps, workflows,
 * section alignment, and console output formatting. The per-file checks take
 * the lectures the edition's lecture set holds (#449); runDoctor reads it from
 * the fixture's `_toc.yml`.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  checkConfig,
  checkLectureSet,
  checkStateFiles,
  checkHeadingMaps,
  checkSectionAlignment,
  checkWorkflow,
  checkSourceAccess,
  readDoctorLectures,
  runDoctor,
  formatDoctorTable,
  formatDoctorJson,
} from '../commands/doctor.js';
import { writeConfig, writeFileState } from '../translate-state.js';
import { writeToc } from '../../test-support/toc-fixture.js';

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

    const result = checkStateFiles(tmpDir, ['intro.md']);
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

    const result = checkStateFiles(tmpDir, ['intro.md', 'cobweb.md']);
    expect(result.status).toBe('warn');
    expect(result.message).toContain('1/2');
    expect(result.details).toBeDefined();
    expect(result.details?.some((d) => d.includes('cobweb.md'))).toBe(true);
  });

  test('fails when state directory does not exist', () => {
    writeMd(path.join(tmpDir, 'lectures', 'intro.md'), TARGET_WITH_MAP);

    const result = checkStateFiles(tmpDir, ['intro.md']);
    expect(result.status).toBe('fail');
    expect(result.message).toContain('not found');
  });

  test('warns when the lecture set has no files', () => {
    fs.mkdirSync(path.join(tmpDir, 'lectures'), { recursive: true });

    const result = checkStateFiles(tmpDir, []);
    expect(result.status).toBe('warn');
    expect(result.message).toContain('No .md files');
  });

  // #385: a lecture in a subfolder, such as an included admonition, was never checked
  test('checks a lecture in a subfolder at its own state path', () => {
    writeMd(path.join(tmpDir, 'lectures', 'intro.md'), TARGET_WITH_MAP);
    writeMd(path.join(tmpDir, 'lectures', '_admonition', 'gpu.md'), '```{note}\nGPU\n```\n');
    writeFileState(tmpDir, 'intro.md', {
      'source-sha': 'abc123',
      'synced-at': '2026-03-16',
      model: 'claude-sonnet-4-6',
      mode: 'NEW',
      'section-count': 2,
    });

    const result = checkStateFiles(tmpDir, ['intro.md', '_admonition/gpu.md']);
    expect(result.status).toBe('warn');
    expect(result.details).toEqual(['Missing: _admonition/gpu.md']);
  });

  test('reports a corrupt state YAML as corrupt, not missing (#165)', () => {
    // "Missing" sent users to `status --write-state`, which overwrote the
    // corrupt file with current source HEAD and erased the real sync point.
    writeMd(path.join(tmpDir, 'lectures', 'intro.md'), TARGET_WITH_MAP);
    const statePath = path.join(tmpDir, '.translate', 'state', 'intro.md.yml');
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, '{{{ not yaml at all', 'utf-8');

    const result = checkStateFiles(tmpDir, ['intro.md']);
    expect(result.status).toBe('fail');
    expect(result.message).toContain('unreadable');
    expect(result.details?.some((d) => d.includes('Corrupt: intro.md'))).toBe(true);
  });
});

// ============================================================================
// checkHeadingMaps TESTS
// ============================================================================

describe('checkHeadingMaps', () => {
  test('passes when all files have heading-maps', () => {
    writeMd(path.join(tmpDir, 'lectures', 'intro.md'), TARGET_WITH_MAP);

    const result = checkHeadingMaps(tmpDir, 'lectures', ['intro.md']);
    expect(result.status).toBe('pass');
    expect(result.message).toContain('1');
  });

  test('warns when some files missing heading-maps', () => {
    writeMd(path.join(tmpDir, 'lectures', 'intro.md'), TARGET_WITH_MAP);
    writeMd(path.join(tmpDir, 'lectures', 'cobweb.md'), TARGET_WITHOUT_MAP);

    const result = checkHeadingMaps(tmpDir, 'lectures', ['intro.md', 'cobweb.md']);
    expect(result.status).toBe('warn');
    expect(result.message).toContain('1/2');
  });

  test('fails when no files have heading-maps', () => {
    writeMd(path.join(tmpDir, 'lectures', 'intro.md'), TARGET_WITHOUT_MAP);

    const result = checkHeadingMaps(tmpDir, 'lectures', ['intro.md']);
    expect(result.status).toBe('fail');
    expect(result.message).toContain('0/1');
  });

  test('skips section-less files (no ## headings)', () => {
    // File with sections + heading-map → pass
    writeMd(path.join(tmpDir, 'lectures', 'intro.md'), TARGET_WITH_MAP);
    // File with no sections → should be skipped, not flagged
    writeMd(
      path.join(tmpDir, 'lectures', 'status.md'),
      `---
jupytext:
  text_representation:
    extension: .md
---

# Status Page

This file has no ## sections at all.
Just a title and some text.
`
    );

    const result = checkHeadingMaps(tmpDir, 'lectures', ['intro.md', 'status.md']);
    expect(result.status).toBe('pass');
    expect(result.message).toContain('section-less');
  });

  test('passes when all files are section-less', () => {
    writeMd(path.join(tmpDir, 'lectures', 'readme.md'), `# Just a title\n\nNo sections.\n`);

    const result = checkHeadingMaps(tmpDir, 'lectures', ['readme.md']);
    expect(result.status).toBe('pass');
    expect(result.message).toContain('0 sections');
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

    const result = await checkSectionAlignment(
      sourceDir,
      targetDir,
      'lectures',
      ['intro.md'],
      ['intro.md']
    );
    expect(result.status).toBe('pass');
  });

  test('compares only the lectures both lecture sets hold', async () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');
    writeMd(path.join(sourceDir, 'lectures', 'intro.md'), SOURCE_2_SECTIONS);
    writeMd(path.join(targetDir, 'lectures', 'intro.md'), TARGET_WITH_MAP);
    writeMd(path.join(sourceDir, 'lectures', 'draft.md'), SOURCE_3_SECTIONS);
    writeMd(path.join(targetDir, 'lectures', 'draft.md'), TARGET_WITH_MAP);

    const result = await checkSectionAlignment(
      sourceDir,
      targetDir,
      'lectures',
      ['intro.md'],
      ['intro.md']
    );
    expect(result).toMatchObject({
      status: 'pass',
      message: 'All 1 common files have matching section counts',
    });
  });

  test('warns when section counts differ', async () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');
    writeMd(path.join(sourceDir, 'lectures', 'intro.md'), SOURCE_3_SECTIONS);
    writeMd(path.join(targetDir, 'lectures', 'intro.md'), TARGET_WITH_MAP);

    const result = await checkSectionAlignment(
      sourceDir,
      targetDir,
      'lectures',
      ['intro.md'],
      ['intro.md']
    );
    expect(result.status).toBe('warn');
    expect(result.details?.some((d) => d.includes('3 source vs 2 target'))).toBe(true);
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
      'uses: QuantEcon/action-translation@v0',
      'utf-8'
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

  test('warns when the review workflow cannot fire on sync PRs (#161)', () => {
    const workflowDir = path.join(tmpDir, '.github', 'workflows');
    fs.mkdirSync(workflowDir, { recursive: true });
    // The pre-#161 scaffold: label-gated but no `labeled` trigger, so the
    // gate always sees an unlabeled PR and the review never runs.
    fs.writeFileSync(
      path.join(workflowDir, 'review-translations.yml'),
      [
        'on:',
        '  pull_request:',
        '    types: [opened, synchronize]',
        'jobs:',
        '  review:',
        "    if: contains(github.event.pull_request.labels.*.name, 'action-translation')",
        '    steps:',
        '      - uses: QuantEcon/action-translation@v0',
        '        with:',
        '          mode: review',
      ].join('\n'),
      'utf-8'
    );

    const result = checkWorkflow(tmpDir);
    expect(result.status).toBe('warn');
    expect(result.message).toContain('cannot fire');
    expect(result.details?.join('\n')).toContain('review-translations.yml');
  });

  test('is not fooled by an if-guard that mentions labeled without the trigger', () => {
    const workflowDir = path.join(tmpDir, '.github', 'workflows');
    fs.mkdirSync(workflowDir, { recursive: true });
    // A half-fixed workflow: carries the label guard in `if:` (which mentions
    // 'labeled') but never added `labeled` to the trigger types.
    fs.writeFileSync(
      path.join(workflowDir, 'review-translations.yml'),
      [
        'on:',
        '  pull_request:',
        '    types: [opened, synchronize]',
        'jobs:',
        '  review:',
        '    if: >',
        "      contains(github.event.pull_request.labels.*.name, 'action-translation') &&",
        "      (github.event.action != 'labeled' || github.event.label.name == 'action-translation')",
        '    steps:',
        '      - uses: QuantEcon/action-translation@v0',
        '        with:',
        '          mode: review',
      ].join('\n'),
      'utf-8'
    );

    const result = checkWorkflow(tmpDir);
    expect(result.status).toBe('warn');
    expect(result.message).toContain('cannot fire');
  });

  test('accepts the dash-list trigger form', () => {
    const workflowDir = path.join(tmpDir, '.github', 'workflows');
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(
      path.join(workflowDir, 'review-translations.yml'),
      'on:\n  pull_request:\n    types:\n      - opened\n      - labeled\nuses: QuantEcon/action-translation@v0\nmode: review\n',
      'utf-8'
    );

    const result = checkWorkflow(tmpDir);
    expect(result.status).toBe('pass');
  });

  test('warns when the workflow pins a fixed action version (#162)', () => {
    const workflowDir = path.join(tmpDir, '.github', 'workflows');
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(
      path.join(workflowDir, 'review-translations.yml'),
      'on:\n  pull_request:\n    types: [opened, labeled]\nuses: QuantEcon/action-translation@v0.9.0\nmode: review\n',
      'utf-8'
    );

    const result = checkWorkflow(tmpDir);
    expect(result.status).toBe('warn');
    expect(result.message).toContain('@v0');
    expect(result.details?.join('\n')).toContain('review-translations.yml');
  });

  test('passes a review workflow with the labeled trigger', () => {
    const workflowDir = path.join(tmpDir, '.github', 'workflows');
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(
      path.join(workflowDir, 'review-translations.yml'),
      'on:\n  pull_request:\n    types: [opened, synchronize, labeled, reopened]\nuses: QuantEcon/action-translation@v0\nmode: review\n',
      'utf-8'
    );

    const result = checkWorkflow(tmpDir);
    expect(result.status).toBe('pass');
  });
});

// ============================================================================
// checkSourceAccess TESTS
// ============================================================================

describe('checkSourceAccess', () => {
  const check = async (sourceDir: string) =>
    checkSourceAccess(
      sourceDir,
      'lectures',
      await readDoctorLectures(sourceDir, 'lectures', 'SOURCE')
    );

  test('passes when source has md files', async () => {
    const sourceDir = path.join(tmpDir, 'source');
    writeMd(path.join(sourceDir, 'lectures', 'intro.md'), SOURCE_2_SECTIONS);
    writeToc(path.join(sourceDir, 'lectures'), ['intro']);

    const result = await check(sourceDir);
    expect(result.status).toBe('pass');
    expect(result.message).toBe('1 lectures in lectures/: 1 in _toc.yml');
  });

  test('fails when source path does not exist', async () => {
    const result = await check('/nonexistent/path');
    expect(result.status).toBe('fail');
    expect(result.message).toBe('Source path not found: /nonexistent/path');
  });

  // #449, ruling 9: no _toc.yml, no lecture set
  test('fails when the source docs folder has no _toc.yml', async () => {
    const sourceDir = path.join(tmpDir, 'source');
    writeMd(path.join(sourceDir, 'lectures', 'intro.md'), SOURCE_2_SECTIONS);

    const result = await check(sourceDir);
    expect(result.status).toBe('fail');
    expect(result.message).toBe(
      `SOURCE ${path.join(sourceDir, 'lectures')}: the docs folder has no _toc.yml or myst.yml, ` +
        'so it has no lecture set'
    );
  });

  test('warns when no entry in the source ToC has a file behind it', async () => {
    const sourceDir = path.join(tmpDir, 'source');
    writeToc(path.join(sourceDir, 'lectures'), ['index']);

    const result = await check(sourceDir);
    expect(result.status).toBe('warn');
  });
});

// ============================================================================
// checkLectureSet TESTS (#449)
// ============================================================================

describe('checkLectureSet', () => {
  const docs = () => path.join(tmpDir, 'lectures');
  const check = async () => checkLectureSet(await readDoctorLectures(tmpDir, 'lectures', 'TARGET'));

  test('counts the documents and the files they include', async () => {
    writeMd(path.join(docs(), 'intro.md'), '# 介绍\n\n```{include} _admonition/gpu.md\n```\n');
    writeMd(path.join(docs(), '_admonition', 'gpu.md'), '```{note}\nGPU\n```\n');
    writeMd(path.join(docs(), 'README.md'), '# 讲座\n');
    writeToc(docs(), ['intro']);

    expect(await check()).toEqual({
      name: 'Lecture set',
      status: 'pass',
      message: '2 lectures: 1 in _toc.yml, 1 included by them',
    });
  });

  test("counts the entries a partial edition's mirrored ToC lists without a file", async () => {
    writeMd(path.join(docs(), 'intro.md'), TARGET_WITH_MAP);
    writeToc(docs(), ['intro', 'cobweb', 'solow']);

    const result = await check();
    expect(result.status).toBe('pass');
    expect(result.details).toEqual([
      "2 _toc.yml entries have no .md file in the edition (a partial edition's ToC lists " +
        'lectures it has not translated):',
      '  cobweb',
      '  solow',
    ]);
  });

  test('warns when no entry has a file behind it', async () => {
    writeToc(docs(), ['index']);

    expect((await check()).status).toBe('warn');
  });

  test("fails with the reader's message when the docs folder has no _toc.yml", async () => {
    writeMd(path.join(docs(), 'intro.md'), TARGET_WITH_MAP);

    const result = await check();
    expect(result.status).toBe('fail');
    expect(result.message).toBe(
      `TARGET ${docs()}: the docs folder has no _toc.yml or myst.yml, so it has no lecture set`
    );
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
    writeToc(path.join(tmpDir, 'lectures'), ['intro']);
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
      'uses: QuantEcon/action-translation@v0',
      'utf-8'
    );

    const result = await runDoctor({
      target: tmpDir,
      checkGh: false,
      json: false,
    });

    expect(result.summary.fail).toBe(0);
    expect(result.summary.pass).toBeGreaterThanOrEqual(3);
    expect(result.checks.find((c) => c.name === '.translate/config.yml')?.status).toBe('pass');
    expect(result.checks.find((c) => c.name === 'Lecture set')?.status).toBe('pass');
    expect(result.checks.find((c) => c.name === '.translate/state/')?.status).toBe('pass');
    expect(result.checks.find((c) => c.name === 'Heading maps')?.status).toBe('pass');
    expect(result.checks.find((c) => c.name === 'Workflow')?.status).toBe('pass');
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
    expect(result.checks.find((c) => c.name === '.translate/config.yml')?.status).toBe('fail');
  });

  // #449, ruling 9: the checks that need no lecture set still run
  test('fails the lecture set without a _toc.yml, and skips only the checks that need it', async () => {
    writeConfig(tmpDir, {
      'source-language': 'en',
      'target-language': 'zh-cn',
      'docs-folder': 'lectures',
    });
    writeMd(path.join(tmpDir, 'lectures', 'intro.md'), TARGET_WITH_MAP);

    const result = await runDoctor({ target: tmpDir, checkGh: false, json: false });

    expect(result.checks.map((c) => [c.name, c.status])).toEqual([
      ['.translate/config.yml', 'pass'],
      ['Lecture set', 'fail'],
      ['Workflow', 'fail'],
    ]);
    expect(result.checks[1].message).toContain('has no _toc.yml or myst.yml');
  });

  // #385: doctor never saw a lecture in a subfolder
  test('checks an included fragment, and not a README outside the ToC', async () => {
    writeConfig(tmpDir, {
      'source-language': 'en',
      'target-language': 'zh-cn',
      'docs-folder': 'lectures',
    });
    writeMd(
      path.join(tmpDir, 'lectures', 'intro.md'),
      TARGET_WITH_MAP.replace('## 第一节', '```{include} _admonition/gpu.md\n```\n\n## 第一节')
    );
    writeMd(path.join(tmpDir, 'lectures', '_admonition', 'gpu.md'), '```{note}\nGPU\n```\n');
    writeMd(path.join(tmpDir, 'lectures', 'README.md'), '# 讲座\n');
    writeToc(path.join(tmpDir, 'lectures'), ['intro']);
    writeFileState(tmpDir, 'intro.md', {
      'source-sha': 'abc123',
      'synced-at': '2026-03-16',
      model: 'claude-sonnet-4-6',
      mode: 'NEW',
      'section-count': 2,
    });

    const result = await runDoctor({ target: tmpDir, checkGh: false, json: false });

    expect(result.checks.find((c) => c.name === '.translate/state/')).toMatchObject({
      status: 'warn',
      message: '1/2 files tracked (1 missing)',
      details: ['Missing: _admonition/gpu.md'],
    });
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
    writeToc(path.join(sourceDir, 'lectures'), ['intro']);
    writeToc(path.join(targetDir, 'lectures'), ['intro']);

    const result = await runDoctor({
      target: targetDir,
      source: sourceDir,
      checkGh: false,
      json: false,
    });

    expect(result.checks.some((c) => c.name === 'Source repo')).toBe(true);
    expect(result.checks.some((c) => c.name === 'Section alignment')).toBe(true);
  });

  test('reads docs-folder from config when not explicitly provided', async () => {
    writeConfig(tmpDir, {
      'source-language': 'en',
      'target-language': 'zh-cn',
      'docs-folder': 'docs',
    });
    writeMd(path.join(tmpDir, 'docs', 'intro.md'), TARGET_WITH_MAP);
    writeToc(path.join(tmpDir, 'docs'), ['intro']);
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
    expect(result.checks.find((c) => c.name === '.translate/state/')?.status).toBe('pass');
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

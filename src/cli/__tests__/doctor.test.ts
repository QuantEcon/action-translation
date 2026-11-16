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
  checkRequiredState,
  readDeclaredExceptions,
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

  // #370: readConfig reported a repeated key as a config missing its fields
  test('names a repeated key, which YAML refuses', () => {
    const configDir = path.join(tmpDir, '.translate');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, 'config.yml'),
      'source-language: en\ntarget-language: ml\ndocs-folder: lectures\ntarget-language: fa\n',
      'utf-8'
    );

    expect(checkConfig(tmpDir)).toEqual({
      name: '.translate/config.yml',
      status: 'fail',
      message:
        'Config file exists but cannot be read: it repeats a key at line 4 ' +
        '(`target-language: fa`), which YAML does not allow',
    });
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
// checkRequiredState TESTS (--require-state, #370)
// ============================================================================

const VALID_STATE = {
  'source-sha': 'abc123',
  'synced-at': '2026-03-16',
  model: 'claude-sonnet-4-6',
  mode: 'NEW' as const,
  'section-count': 2,
};

/** Every list `--require-state` reports, empty: a test spreads in the ones it expects. */
const NO_FINDINGS = {
  missing: [],
  declaredWithState: [],
  orphaned: [],
  corrupt: [],
  unlisted: [],
  staleExceptions: [],
  exceptionErrors: [],
};

describe('checkRequiredState (--require-state, #370)', () => {
  const docs = () => path.join(tmpDir, 'lectures');
  const lecture = (file: string, content = TARGET_WITH_MAP) =>
    writeMd(path.join(docs(), file), content);
  const state = (file: string) => writeFileState(tmpDir, file, VALID_STATE);
  /** A file under `.translate/state/`, written as given. */
  const rawState = (rel: string, content: string) =>
    writeMd(path.join(tmpDir, '.translate', 'state', rel), content);
  /** The edition's config: its three core keys, then `extra` as written. */
  const config = (extra = '') =>
    writeMd(
      path.join(tmpDir, '.translate', 'config.yml'),
      `source-language: en\ntarget-language: ml\ndocs-folder: lectures\n${extra}`
    );
  const check = async () =>
    checkRequiredState(tmpDir, 'lectures', await readDoctorLectures(tmpDir, 'lectures', 'TARGET'));

  /** Two lectures in the ToC, intro.md and cobweb.md. */
  const twoLectures = () => {
    lecture('intro.md');
    lecture('cobweb.md');
    writeToc(docs(), ['intro', 'cobweb']);
  };

  describe("#370's four cases", () => {
    test('passes when every lecture has a state file', async () => {
      twoLectures();
      state('intro.md');
      state('cobweb.md');
      config();

      expect(await check()).toEqual({
        name: '.translate/state/',
        status: 'pass',
        message: '2 lectures covered: 2 with a state file',
        data: NO_FINDINGS,
      });
    });

    test('fails a lecture without a state file', async () => {
      twoLectures();
      state('intro.md');
      config();

      expect(await check()).toEqual({
        name: '.translate/state/',
        status: 'fail',
        message: '--require-state: 1 lecture without a state file',
        details: [
          'Missing: no state file, and not declared in state-exceptions. Record one with ' +
            '`translate status -f <file> --write-state`, or declare the file:',
          '  cobweb.md',
        ],
        data: { ...NO_FINDINGS, missing: ['cobweb.md'] },
      });
    });

    test('passes a lecture without a state file that state-exceptions declares', async () => {
      twoLectures();
      state('cobweb.md');
      config('state-exceptions:\n  intro.md: English copy until its review round\n');

      expect(await check()).toEqual({
        name: '.translate/state/',
        status: 'pass',
        message: '2 lectures covered: 1 with a state file, 1 declared in state-exceptions',
        data: NO_FINDINGS,
      });
    });

    test('fails an unreadable state file, with the reason', async () => {
      twoLectures();
      state('intro.md');
      rawState('cobweb.md.yml', "source-sha: abc123\nsynced-at: '2026-03-16'\n");
      config();

      const result = await check();
      expect(result.status).toBe('fail');
      expect(result.message).toBe('--require-state: 1 unreadable state file');
      expect(result.details).toEqual([
        'Corrupt: the state file exists but cannot be read. Repair or delete it:',
        '  cobweb.md (`model` is missing)',
      ]);
      expect(result.data?.corrupt).toEqual([{ file: 'cobweb.md', reason: '`model` is missing' }]);
    });
  });

  test('(b) fails a declared exception that has a state file', async () => {
    twoLectures();
    state('intro.md');
    state('cobweb.md');
    config('state-exceptions:\n  intro.md: English copy\n');

    const result = await check();
    expect(result.status).toBe('fail');
    expect(result.message).toBe('--require-state: 1 declared exception with a state file');
    expect(result.details).toEqual([
      "Declared in state-exceptions, but has a state file, which puts it in sync's scope. " +
        'Delete one or the other:',
      '  intro.md',
    ]);
    expect(result.data).toEqual({ ...NO_FINDINGS, declaredWithState: ['intro.md'] });
  });

  test('(c) fails a state file without a lecture, in a subfolder too', async () => {
    twoLectures();
    state('intro.md');
    state('cobweb.md');
    state('old.md');
    state('_admonition/gpu.md');
    config();

    const result = await check();
    expect(result.status).toBe('fail');
    expect(result.message).toBe('--require-state: 2 files in the state folder without a lecture');
    expect(result.details).toEqual([
      'State file without a lecture: the edition has no lecture at its path (no such .md, or ' +
        'one in a folder the book never builds from, such as _build). Restore the lecture, or ' +
        'delete the state file:',
      '  .translate/state/_admonition/gpu.md.yml',
      '  .translate/state/old.md.yml',
    ]);
    expect(result.data?.orphaned).toEqual([
      '.translate/state/_admonition/gpu.md.yml',
      '.translate/state/old.md.yml',
    ]);
  });

  test('(c) fails a file in the state folder that is not a <path>.md.yml', async () => {
    twoLectures();
    state('intro.md');
    state('cobweb.md');
    rawState('.DS_Store', '');
    rawState('notes.yml', 'note: kept by hand\n');
    rawState('intro.ipynb.yml', 'source-sha: abc123\n');
    config();

    const result = await check();
    expect(result.status).toBe('fail');
    expect(result.details).toEqual([
      'Not a state file: sync reads only .translate/state/<path>.md.yml. Delete it:',
      '  .translate/state/.DS_Store',
      '  .translate/state/intro.ipynb.yml',
      '  .translate/state/notes.yml',
    ]);
    expect(result.data?.orphaned).toEqual([
      '.translate/state/.DS_Store',
      '.translate/state/intro.ipynb.yml',
      '.translate/state/notes.yml',
    ]);
  });

  test('counts a state file that is orphaned and unreadable as orphaned', async () => {
    twoLectures();
    state('intro.md');
    state('cobweb.md');
    rawState('old.md.yml', '{{{ not yaml at all');
    config();

    expect((await check()).data).toEqual({
      ...NO_FINDINGS,
      orphaned: ['.translate/state/old.md.yml'],
    });
  });

  // On a case-insensitive filesystem `existsSync` finds Intro.md.yml for
  // intro.md, where a Linux runner and sync's API reads do not. The two files
  // are in different folders, so this fixture is the same on every filesystem.
  test('reads a state file named in another case as missing plus orphaned', async () => {
    lecture('intro.md');
    writeToc(docs(), ['intro']);
    rawState('Intro.md.yml', fs.readFileSync(path.join(docs(), 'intro.md'), 'utf-8'));
    config();

    const result = await check();
    expect(result.status).toBe('fail');
    expect(result.data).toEqual({
      ...NO_FINDINGS,
      missing: ['intro.md'],
      orphaned: ['.translate/state/Intro.md.yml'],
    });
  });

  describe('a lecture outside the lecture set, kept with a state file (ruling 4)', () => {
    test('warns', async () => {
      twoLectures();
      state('intro.md');
      state('cobweb.md');
      lecture('draft.md');
      state('draft.md');
      config();

      expect(await check()).toEqual({
        name: '.translate/state/',
        status: 'warn',
        message:
          '2 lectures covered: 2 with a state file; 1 lecture outside the lecture set kept ' +
          'with a state file',
        details: [
          'Unlisted (a warning): outside the lecture set, kept with a state file, so sync does ' +
            'not update it:',
          '  draft.md',
        ],
        data: { ...NO_FINDINGS, unlisted: ['draft.md'] },
      });
    });

    test('fails when its state file cannot be read', async () => {
      twoLectures();
      state('intro.md');
      state('cobweb.md');
      lecture('draft.md');
      rawState('draft.md.yml', '- not\n- a mapping\n');
      config();

      const result = await check();
      expect(result.status).toBe('fail');
      expect(result.message).toBe('--require-state: 1 unreadable state file');
      expect(result.data).toEqual({
        ...NO_FINDINGS,
        corrupt: [{ file: 'draft.md', reason: 'it is not a YAML mapping of keys to values' }],
        unlisted: ['draft.md'],
      });
    });
  });

  describe('a stale exception', () => {
    test('warns when the edition has no lecture at that path', async () => {
      twoLectures();
      state('intro.md');
      state('cobweb.md');
      config('state-exceptions:\n  gone.md: English copy\n');

      expect(await check()).toEqual({
        name: '.translate/state/',
        status: 'warn',
        message: '2 lectures covered: 2 with a state file; 1 stale exception',
        details: [
          'Stale exception (a warning): declared, but not a lecture of the edition. Remove it ' +
            'from state-exceptions:',
          '  gone.md: the edition has no lecture at that path',
        ],
        data: { ...NO_FINDINGS, staleExceptions: ['gone.md'] },
      });
    });

    // lecture-python-programming.ml: the lectures that include gpu.md are ToC
    // entries it has no file for, so gpu.md is outside its lecture set.
    test('warns on a fragment that no lecture of the edition includes (the ml case)', async () => {
      lecture('intro.md', '# Introduction\n\nAn English copy.\n');
      lecture('_admonition/gpu.md', '```{note}\nGPU\n```\n');
      writeToc(docs(), ['intro', 'autodiff', 'jax_intro']);
      config(
        'state-exceptions:\n' +
          '  intro.md: English copy until its review round\n' +
          '  _admonition/gpu.md: English copy until its review round\n'
      );

      const result = await check();
      expect(result.status).toBe('warn');
      expect(result.message).toBe(
        '1 lecture covered: 0 with a state file, 1 declared in state-exceptions; 1 stale exception'
      );
      expect(result.details).toEqual([
        'Stale exception (a warning): declared, but not a lecture of the edition. Remove it ' +
          'from state-exceptions:',
        '  _admonition/gpu.md: outside the lecture set (no ToC entry lists it, and no lecture ' +
          'of the edition includes it)',
      ]);
      expect(result.data).toEqual({ ...NO_FINDINGS, staleExceptions: ['_admonition/gpu.md'] });
    });
  });

  describe('a malformed state-exceptions', () => {
    // The core keys take lines 1-3, so `state-exceptions:` is line 4.
    test.each([
      ['a list', '\n  - intro.md\n', 'state-exceptions is a list, not a mapping'],
      ['text', ' intro.md\n', 'state-exceptions is a string, not a mapping'],
      ['an empty reason', '\n  intro.md: ""\n', '`intro.md`: its reason is empty'],
      ['no reason', '\n  intro.md:\n', '`intro.md`: its reason is empty'],
      ['a blank reason', "\n  intro.md: '  '\n", '`intro.md`: its reason is blank'],
      ['a number for a reason', '\n  intro.md: 2026\n', '`intro.md`: its reason is a number'],
      ['a list for a reason', '\n  intro.md: [a, b]\n', '`intro.md`: its reason is a list'],
      [
        'an absolute path',
        '\n  /intro.md: English copy\n',
        '`/intro.md`: the path is absolute or leaves the docs folder',
      ],
      [
        'a path out of the docs folder',
        '\n  ../intro.md: English copy\n',
        '`../intro.md`: the path is absolute or leaves the docs folder',
      ],
      [
        'a file that is not .md',
        '\n  intro.ipynb: English copy\n',
        '`intro.ipynb`: not a .md file',
      ],
      ['an empty key', '\n  "": English copy\n', 'an empty key: name the lecture'],
      ['a bare .md key', '\n  .md: English copy\n', '`.md`: not a .md file'],
      [
        'a repeated key',
        '\n  intro.md: English copy\n  intro.md: Still English\n',
        '.translate/config.yml: it repeats a key at line 6 (`intro.md: Still English`), which ' +
          'YAML does not allow, so state-exceptions could not be read',
      ],
      [
        'two spellings of one file',
        '\n  intro.md: English copy\n  ./intro.md: English copy\n',
        '`./intro.md` and `intro.md` both name intro.md; keep one',
      ],
    ])('fails on %s, and names it', async (_shape, body, problem) => {
      twoLectures();
      state('cobweb.md');
      config(`state-exceptions:${body}`);

      const result = await check();
      expect(result.status).toBe('fail');
      expect(result.message).toContain('1 problem in state-exceptions');
      expect(result.data?.exceptionErrors).toHaveLength(1);
      expect(result.data?.exceptionErrors[0]).toContain(problem);
      expect(result.details?.slice(0, 2)).toEqual([
        'state-exceptions in .translate/config.yml, as written:',
        `  ${result.data?.exceptionErrors[0]}`,
      ]);
    });
  });

  test('names a docs-folder-prefixed key as repo-relative for a file outside the set too', async () => {
    twoLectures();
    state('intro.md');
    state('cobweb.md');
    writeMd(path.join(docs(), 'README.md'), '# Readme\n');
    config('state-exceptions:\n  lectures/README.md: not a lecture\n');

    const result = await check();
    expect(result.status).toBe('warn');
    expect(result.details).toContain(
      '  lectures/README.md: the key is relative to the repository; write it relative to the ' +
        'docs folder, as README.md'
    );
  });

  test('matches a ./ key, and names a docs-folder-prefixed one as repo-relative', async () => {
    twoLectures();
    config(
      'state-exceptions:\n' +
        '  ./intro.md: English copy\n' +
        '  lectures/cobweb.md: English copy\n'
    );

    const result = await check();
    expect(result.status).toBe('fail');
    expect(result.message).toBe('--require-state: 1 lecture without a state file');
    expect(result.details).toEqual([
      'Missing: no state file, and not declared in state-exceptions. Record one with ' +
        '`translate status -f <file> --write-state`, or declare the file:',
      '  cobweb.md',
      'Stale exception (a warning): declared, but not a lecture of the edition. Remove it ' +
        'from state-exceptions:',
      '  lectures/cobweb.md: the key is relative to the repository; write it relative to the ' +
        'docs folder, as cobweb.md',
    ]);
    expect(result.data).toEqual({
      ...NO_FINDINGS,
      missing: ['cobweb.md'],
      staleExceptions: ['lectures/cobweb.md'],
    });
  });

  test("puts each key in the lecture set's spelling, keeping it as written", () => {
    config(
      'state-exceptions:\n' +
        '  ./intro.md: a\n' +
        '  cobweb.md/: b\n' +
        "  '_admonition\\gpu.md': c\n" +
        '  advanced//./solow.md: d\n'
    );

    expect(readDeclaredExceptions(tmpDir)).toEqual({
      exceptions: [
        { key: './intro.md', file: 'intro.md', reason: 'a' },
        { key: 'cobweb.md/', file: 'cobweb.md', reason: 'b' },
        { key: '_admonition\\gpu.md', file: '_admonition/gpu.md', reason: 'c' },
        { key: 'advanced//./solow.md', file: 'advanced/solow.md', reason: 'd' },
      ],
      problems: [],
    });
  });

  test('reads a bare date as a reason, as text', async () => {
    twoLectures();
    state('cobweb.md');
    config('state-exceptions:\n  intro.md: 2026-12-01\n');

    expect((await check()).status).toBe('pass');
  });

  test("does not fail the entries a partial edition's mirrored ToC lists without a file", async () => {
    lecture('intro.md');
    state('intro.md');
    writeToc(docs(), ['intro', 'cobweb', 'solow']);
    config();

    expect(await check()).toEqual({
      name: '.translate/state/',
      status: 'pass',
      message: '1 lecture covered: 1 with a state file',
      data: NO_FINDINGS,
    });
  });

  test('checks a fragment in the set, without its state file and then with it', async () => {
    lecture('intro.md', '# 介绍\n\n```{include} _admonition/gpu.md\n```\n');
    lecture('_admonition/gpu.md', '```{note}\nGPU\n```\n');
    writeToc(docs(), ['intro']);
    state('intro.md');
    config();

    const without = await check();
    expect(without.status).toBe('fail');
    expect(without.data?.missing).toEqual(['_admonition/gpu.md']);

    state('_admonition/gpu.md');
    expect(await check()).toMatchObject({
      status: 'pass',
      message: '2 lectures covered: 2 with a state file',
    });
  });

  test('passes with no state folder when every lecture is declared', async () => {
    lecture('intro.md', '# Introduction\n\n```{include} _admonition/gpu.md\n```\n');
    lecture('_admonition/gpu.md', '```{note}\nGPU\n```\n');
    writeToc(docs(), ['intro']);
    config(
      'state-exceptions:\n' + '  intro.md: English copy\n' + '  _admonition/gpu.md: English copy\n'
    );

    expect(fs.existsSync(path.join(tmpDir, '.translate', 'state'))).toBe(false);
    expect(await check()).toEqual({
      name: '.translate/state/',
      status: 'pass',
      message: '2 lectures covered: 0 with a state file, 2 declared in state-exceptions',
      data: NO_FINDINGS,
    });
  });

  test('fails, and checks nothing, when the edition has no lecture set', async () => {
    lecture('intro.md');
    state('intro.md');
    config();

    expect(await check()).toEqual({
      name: '.translate/state/',
      status: 'fail',
      message: '--require-state: the edition has no lecture set, so no state file was checked',
      details: ['The Lecture set check says why'],
      data: NO_FINDINGS,
    });
  });

  test('caps each group at five, and --json lists every one', async () => {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    for (const f of files) lecture(`${f}.md`);
    writeToc(docs(), files);
    config();

    const result = await check();
    expect(result.details).toEqual([
      'Missing: no state file, and not declared in state-exceptions. Record one with ' +
        '`translate status -f <file> --write-state`, or declare the file:',
      '  a.md',
      '  b.md',
      '  c.md',
      '  d.md',
      '  e.md',
      '  …and 2 more',
    ]);
    expect(result.data?.missing).toEqual(files.map((f) => `${f}.md`));
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

  describe('with --require-state (#370)', () => {
    const docs = () => path.join(tmpDir, 'lectures');
    const config = (extra = '') =>
      writeMd(
        path.join(tmpDir, '.translate', 'config.yml'),
        `source-language: en\ntarget-language: ml\ndocs-folder: lectures\n${extra}`
      );

    test('fails a partial gap that is only a warning without it', async () => {
      config();
      writeMd(path.join(docs(), 'intro.md'), TARGET_WITH_MAP);
      writeMd(path.join(docs(), 'cobweb.md'), TARGET_WITH_MAP);
      writeToc(docs(), ['intro', 'cobweb']);
      writeFileState(tmpDir, 'intro.md', VALID_STATE);

      const plain = await runDoctor({ target: tmpDir, checkGh: false, json: false });
      expect(plain).not.toHaveProperty('requireState');
      expect(plain.checks.find((c) => c.name === '.translate/state/')).toEqual({
        name: '.translate/state/',
        status: 'warn',
        message: '1/2 files tracked (1 missing)',
        details: ['Missing: cobweb.md'],
      });

      const required = await runDoctor({
        target: tmpDir,
        checkGh: false,
        json: false,
        requireState: true,
      });
      expect(required.requireState).toBe(true);
      expect(required.checks.find((c) => c.name === '.translate/state/')?.status).toBe('fail');
    });

    test('fails the state check, and the lecture set, without a _toc.yml', async () => {
      config();
      writeMd(path.join(docs(), 'intro.md'), TARGET_WITH_MAP);
      writeFileState(tmpDir, 'intro.md', VALID_STATE);

      const result = await runDoctor({
        target: tmpDir,
        checkGh: false,
        json: false,
        requireState: true,
      });

      expect(result.checks.map((c) => [c.name, c.status])).toEqual([
        ['.translate/config.yml', 'pass'],
        ['Lecture set', 'fail'],
        ['.translate/state/', 'fail'],
        ['Workflow', 'fail'],
      ]);
    });

    // The shape a CI script reads: the mode at the top, every list in the
    // check's `data`, sorted, and `summary` as it was.
    test('--json carries all seven lists', async () => {
      config(
        'state-exceptions:\n' +
          '  intro.md: English copy until its review round\n' +
          '  gone.md: Removed upstream\n'
      );
      for (const f of ['intro', 'cobweb', 'solow', 'lln']) {
        writeMd(path.join(docs(), `${f}.md`), TARGET_WITH_MAP);
      }
      writeMd(path.join(docs(), 'draft.md'), TARGET_WITH_MAP);
      writeToc(docs(), ['intro', 'cobweb', 'solow', 'lln']);
      for (const f of ['intro.md', 'lln.md', 'draft.md', 'old.md']) {
        writeFileState(tmpDir, f, VALID_STATE);
      }
      writeMd(path.join(tmpDir, '.translate', 'state', 'solow.md.yml'), 'source-sha: abc123\n');
      const workflowDir = path.join(tmpDir, '.github', 'workflows');
      fs.mkdirSync(workflowDir, { recursive: true });
      fs.writeFileSync(
        path.join(workflowDir, 'sync.yml'),
        'uses: QuantEcon/action-translation@v0',
        'utf-8'
      );

      const result = await runDoctor({
        target: tmpDir,
        checkGh: false,
        json: true,
        requireState: true,
      });
      const json = JSON.parse(formatDoctorJson(result));

      expect(Object.keys(json)).toEqual(['requireState', 'checks', 'summary']);
      expect(json.requireState).toBe(true);
      expect(json.summary).toEqual({ pass: 4, warn: 0, fail: 1, total: 5 });
      expect(json.checks.find((c: { name: string }) => c.name === '.translate/state/')).toEqual({
        name: '.translate/state/',
        status: 'fail',
        message:
          '--require-state: 1 lecture without a state file, 1 declared exception with a state ' +
          'file, 1 file in the state folder without a lecture, 1 unreadable state file',
        details: [
          'Missing: no state file, and not declared in state-exceptions. Record one with ' +
            '`translate status -f <file> --write-state`, or declare the file:',
          '  cobweb.md',
          "Declared in state-exceptions, but has a state file, which puts it in sync's scope. " +
            'Delete one or the other:',
          '  intro.md',
          'State file without a lecture: the edition has no lecture at its path (no such .md, or ' +
            'one in a folder the book never builds from, such as _build). Restore the lecture, or ' +
            'delete the state file:',
          '  .translate/state/old.md.yml',
          'Corrupt: the state file exists but cannot be read. Repair or delete it:',
          '  solow.md (`synced-at` is missing)',
          'Unlisted (a warning): outside the lecture set, kept with a state file, so sync does ' +
            'not update it:',
          '  draft.md',
          'Stale exception (a warning): declared, but not a lecture of the edition. Remove it ' +
            'from state-exceptions:',
          '  gone.md: the edition has no lecture at that path',
        ],
        data: {
          missing: ['cobweb.md'],
          declaredWithState: ['intro.md'],
          orphaned: ['.translate/state/old.md.yml'],
          corrupt: [{ file: 'solow.md', reason: '`synced-at` is missing' }],
          unlisted: ['draft.md'],
          staleExceptions: ['gone.md'],
          exceptionErrors: [],
        },
      });
    });
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

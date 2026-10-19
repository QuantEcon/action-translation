/**
 * `translate init --report-json` end to end: runInit against a temporary
 * source tree, with the REAL Anthropic SDK behind a fake fetch
 * (test-support/fake-anthropic-api.ts), so the report is checked against what
 * a run actually meets — a clean translation, one the structural parity guard
 * refuses, and a streamed refusal with its stop_details category — and
 * against the one stderr line each failed lecture gets.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { InitOptions, runInit } from '../commands/init.js';
import {
  FakeAnthropicApi,
  FakeContentBlock,
  FakeReply,
  installFakeAnthropicApi,
} from '../../test-support/fake-anthropic-api.js';
import { InitRunReport } from '../run-report.js';

const SOURCE = `# Test Lecture

(intro)=
## Introduction

Some text.

\`\`\`{code-cell} ipython3
print("hi")
\`\`\`
`;
const CLEAN = SOURCE.replace('# Test Lecture', '# 测试讲座')
  .replace('## Introduction', '## 介绍')
  .replace('Some text.', '一些文字。');
const DROPS_ANCHOR = CLEAN.replace('(intro)=\n', '');

const text = (value: string): FakeContentBlock => ({ type: 'text', text: value });
const thinking: FakeContentBlock = { type: 'thinking', thinking: '', signature: 'sig-fake' };

const GOOD: FakeReply = {
  content: [thinking, text(CLEAN)],
  stop_reason: 'end_turn',
  usage: { input_tokens: 2000, output_tokens: 900, thinking_tokens: 300 },
};
const BREAKS_PARITY: FakeReply = {
  content: [thinking, text(DROPS_ANCHOR)],
  stop_reason: 'end_turn',
  usage: { input_tokens: 2000, output_tokens: 850, thinking_tokens: 250 },
};
const REFUSED: FakeReply = {
  content: [text('部分')],
  stop_reason: 'refusal',
  stop_details: { type: 'refusal', category: 'bio', explanation: null },
  usage: { input_tokens: 2000, output_tokens: 5 },
};

const ROOT = path.join(__dirname, '..', '..', '..');
const TOOL_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')).version;
// The SDK's exports map does not export its package.json, so read the installed copy.
const SDK_VERSION = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'node_modules', '@anthropic-ai', 'sdk', 'package.json'), 'utf-8')
).version;

let tmpDir: string;
let api: FakeAnthropicApi;
let logSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'init-report-'));
  api = installFakeAnthropicApi();
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  errorSpy.mockRestore();
  logSpy.mockRestore();
  api.restore();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** A source tree whose _toc.yml lists `lectures` in order, each holding SOURCE. */
function writeSource(lectures: string[]): string {
  const source = path.join(tmpDir, 'source');
  const docs = path.join(source, 'lectures');
  fs.mkdirSync(docs, { recursive: true });
  const [root, ...chapters] = lectures.map((file) => file.replace(/\.md$/, ''));
  fs.writeFileSync(
    path.join(docs, '_toc.yml'),
    `format: jb-book\nroot: ${root}\nchapters:\n${chapters.map((c) => `  - file: ${c}\n`).join('')}`
  );
  for (const lecture of lectures) {
    fs.writeFileSync(path.join(docs, lecture), SOURCE, 'utf-8');
  }
  return source;
}

function options(overrides: Partial<InitOptions>): InitOptions {
  const glossaryPath = path.join(tmpDir, 'glossary.json');
  fs.writeFileSync(
    glossaryPath,
    JSON.stringify({
      version: '1',
      terms: [
        { en: 'supply', 'zh-cn': '供给' },
        { en: 'demand', 'zh-cn': '需求' },
      ],
    })
  );
  return {
    source: path.join(tmpDir, 'source'),
    target: path.join(tmpDir, 'target'),
    targetLanguage: 'zh-cn',
    sourceLanguage: 'en',
    docsFolder: 'lectures',
    model: 'claude-opus-5-5',
    batchDelay: 0,
    parallel: 1,
    glossaryPath,
    localize: [],
    dryRun: false,
    apiKey: 'test-key',
    reportJson: path.join(tmpDir, 'reports', 'run', 'report.json'),
    ...overrides,
  };
}

function readReport(file: string): InitRunReport {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

/** The failure lines runInit printed to stderr. */
function failureLines(): string[] {
  return errorSpy.mock.calls.map((call) => String(call[0])).filter((line) => line.startsWith('✗'));
}

describe('translate init --report-json', () => {
  it('reports each lecture with its outcome and failure class, and the run with its usage, cost and served model', async () => {
    writeSource(['good.md', 'broken.md', 'refused.md']);
    api.reply(GOOD, BREAKS_PARITY, REFUSED);
    const opts = options({});

    const stats = await runInit(opts);

    expect(stats).toMatchObject({ successCount: 1, failureCount: 2 });
    expect(api.requests.map((request) => request.body.model)).toEqual([
      'claude-opus-5-5',
      'claude-opus-5-5',
      'claude-opus-5-5',
    ]);

    const report = readReport(opts.reportJson!);
    expect(report).toMatchObject({
      schema: 'translate-init-report/1',
      toolVersion: TOOL_VERSION,
      // The SDK that ran, as its package states it.
      sdkVersion: SDK_VERSION,
      model: 'claude-opus-5-5',
      requestPolicy: {
        label: 'adaptive/medium',
        thinking: { type: 'adaptive' },
        effort: { section: 'medium', fullDocument: 'medium', review: 'medium', analysis: 'medium' },
        alwaysThinks: true,
      },
      maxTokens: { fullDocument: 128000 },
      sourceLanguage: 'en',
      targetLanguage: 'zh-cn',
      localize: [],
      glossaryTerms: 2,
      parallel: 1,
      // Every call, the refused and the parity-failed ones included (#356).
      usage: {
        inputTokens: 6000,
        outputTokens: 1755,
        thinkingTokens: 550,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        apiCalls: 3,
      },
      servedModels: ['claude-opus-5-5'],
      retries: 0,
      summary: { total: 3, ok: 1, failed: 2, skipped: 0 },
    });
    // (6000 × $4 + 1755 × $20) / 1M
    expect(report.costUSD).toBeCloseTo(0.0591, 10);
    expect(Date.parse(report.finishedAt) - Date.parse(report.startedAt)).toBe(report.elapsedMs);

    const written = fs.readFileSync(path.join(opts.target, 'lectures', 'good.md'), 'utf-8');
    expect(report.lectures).toEqual([
      {
        file: 'good.md',
        outcome: 'ok',
        elapsedMs: expect.any(Number),
        tokensUsed: 2900,
        outputChars: written.length,
        usage: {
          inputTokens: 2000,
          outputTokens: 900,
          thinkingTokens: 300,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          apiCalls: 1,
        },
        retries: 0,
      },
      {
        file: 'broken.md',
        outcome: 'failed',
        failure: {
          kind: 'parity',
          message: expect.stringMatching(
            /^structural parity check failed for broken\.md:\n.*\(intro\)=/
          ),
        },
        elapsedMs: expect.any(Number),
        usage: expect.objectContaining({ outputTokens: 850, thinkingTokens: 250, apiCalls: 1 }),
        retries: 0,
      },
      {
        file: 'refused.md',
        outcome: 'failed',
        failure: {
          kind: 'model-refusal',
          message: expect.stringContaining('category=bio'),
          category: 'bio',
        },
        elapsedMs: expect.any(Number),
        usage: expect.objectContaining({ outputTokens: 5, thinkingTokens: 0, apiCalls: 1 }),
        retries: 0,
      },
    ]);

    // Only the clean translation was written.
    expect(fs.existsSync(path.join(opts.target, 'lectures', 'broken.md'))).toBe(false);
    expect(fs.existsSync(path.join(opts.target, 'lectures', 'refused.md'))).toBe(false);
  });

  it('prints one stderr line per failed lecture, naming its class', async () => {
    writeSource(['good.md', 'broken.md', 'refused.md']);
    api.reply(GOOD, BREAKS_PARITY, REFUSED);

    await runInit(options({}));

    const lines = failureLines();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(
      /^✗ broken\.md: parity — structural parity check failed for broken\.md: - .*\(intro\)=/
    );
    expect(lines[1]).toMatch(
      /^✗ refused\.md: model-refusal \(bio\) — translateFullDocument: model refusal \(stop_reason=refusal, category=bio\)/
    );
    for (const line of lines) {
      expect(line).not.toContain('\n');
    }
  });

  it('writes the report when every lecture failed, the refused attempt counted and priced', async () => {
    writeSource(['refused.md']);
    api.reply(REFUSED);
    const opts = options({ model: 'claude-sonnet-5-5' });

    const stats = await runInit(opts);

    expect(stats.failureCount).toBe(1);
    const report = readReport(opts.reportJson!);
    expect(report).toMatchObject({
      requestPolicy: { label: 'between-tools/high', thinking: { type: 'between_tools' } },
      maxTokens: { fullDocument: 64000 },
      usage: { inputTokens: 2000, outputTokens: 5, apiCalls: 1 },
      servedModels: ['claude-sonnet-5-5'],
      summary: { total: 1, ok: 0, failed: 1, skipped: 0 },
    });
    expect(report.costUSD).toBeCloseTo((2000 * 2 + 5 * 10) / 1e6, 10);
    expect(report.lectures[0].failure).toMatchObject({ kind: 'model-refusal', category: 'bio' });
  });

  it('reports costUSD as null for an unpriced model, and says so', async () => {
    writeSource(['good.md']);
    api.reply(GOOD);
    const opts = options({ model: 'claude-sonnet-6' });

    await runInit(opts);

    const report = readReport(opts.reportJson!);
    expect(report.costUSD).toBeNull();
    expect(report.requestPolicy).toEqual({
      label: 'api-defaults',
      thinking: null,
      effort: null,
      alwaysThinks: false,
    });
    expect(logSpy.mock.calls.map((call) => String(call[0])).join('\n')).toMatch(
      /No list price for model 'claude-sonnet-6'.*unpriced/
    );
  });

  it('gives per-lecture usage only when lectures run one at a time', async () => {
    writeSource(['good.md', 'other.md']);
    api.reply(GOOD, GOOD);
    const opts = options({ parallel: 2 });

    await runInit(opts);

    const report = readReport(opts.reportJson!);
    expect(report.parallel).toBe(2);
    expect(report.usage.apiCalls).toBe(2);
    expect(report.lectures.map((lecture) => lecture.file)).toEqual(['good.md', 'other.md']);
    for (const lecture of report.lectures) {
      expect(lecture.outcome).toBe('ok');
      expect(lecture).not.toHaveProperty('usage');
      expect(lecture).not.toHaveProperty('retries');
    }
  });

  it('writes no report on a dry run', async () => {
    writeSource(['good.md']);
    const opts = options({ dryRun: true });

    await runInit(opts);

    expect(fs.existsSync(opts.reportJson!)).toBe(false);
    expect(api.requests).toHaveLength(0);
  });
});

describe('translate init -f', () => {
  it('prefers the lecture named exactly over an earlier one whose name contains it', async () => {
    writeSource(['jax_intro.md', 'intro.md']);

    await runInit(options({ dryRun: true, file: 'intro.md' }));

    const picked = logSpy.mock.calls
      .map((call) => String(call[0]))
      .find((line) => line.includes('Translating single file:'));
    expect(picked).toContain('Translating single file: intro.md');
    expect(picked).not.toContain('jax_');
  });

  it('still matches a partial name when no lecture is named exactly', async () => {
    writeSource(['jax_intro.md', 'intro.md']);

    await runInit(options({ dryRun: true, file: 'jax' }));

    const picked = logSpy.mock.calls
      .map((call) => String(call[0]))
      .find((line) => line.includes('Translating single file:'));
    expect(picked).toContain('Translating single file: jax_intro.md');
  });
});

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
      fenceUnwraps: 0,
      headRestores: 0,
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
        headRestored: false,
        usage: {
          inputTokens: 2000,
          outputTokens: 900,
          thinkingTokens: 300,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          apiCalls: 1,
        },
        retries: 0,
        fenceUnwraps: 0,
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
        fenceUnwraps: 0,
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
        fenceUnwraps: 0,
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
      expect(lecture).not.toHaveProperty('fenceUnwraps');
    }
  });

  it('counts each response that came wrapped in a code fence, the parity-failed one included (#363)', async () => {
    writeSource(['wrapped.md', 'broken.md']);
    // The wrapper's opening fence is closed by the code cell's own closing
    // fence, so without the unwrap the guard refuses wrapped.md too.
    api.reply(
      { ...GOOD, content: [thinking, text(`\`\`\`markdown\n${CLEAN}\`\`\`\n`)] },
      { ...BREAKS_PARITY, content: [thinking, text(`\`\`\`\n${DROPS_ANCHOR}\`\`\``)] }
    );
    const opts = options({});
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const stats = await runInit(opts);

    const printed = stdout.mock.calls.map((call) => String(call[0]));
    stdout.mockRestore();
    expect(stats).toMatchObject({ successCount: 1, failureCount: 1 });
    const report = readReport(opts.reportJson!);
    expect(report.fenceUnwraps).toBe(2);
    expect(report.lectures).toEqual([
      expect.objectContaining({ file: 'wrapped.md', outcome: 'ok', fenceUnwraps: 1 }),
      expect.objectContaining({
        file: 'broken.md',
        outcome: 'failed',
        failure: expect.objectContaining({ kind: 'parity' }),
        fenceUnwraps: 1,
      }),
    ]);
    // What was written is the translation inside the wrapper.
    const written = fs.readFileSync(path.join(opts.target, 'lectures', 'wrapped.md'), 'utf-8');
    expect(written.startsWith('```')).toBe(false);
    expect(written).toContain('# 测试讲座');
    expect(written.trimEnd().endsWith('```')).toBe(true);
    expect(printed.filter((line) => line.includes('removed a code fence'))).toHaveLength(2);
  });

  it('records each lecture written with the source’s head in place of the response’s (#326)', async () => {
    writeSource(['chatty.md', 'good.md']);
    // Commentary above the title: the source has nothing there, so it goes.
    api.reply(
      { ...GOOD, content: [thinking, text(`I'll translate this lecture now.\n\n${CLEAN}`)] },
      GOOD
    );
    const opts = options({ parallel: 2 });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await runInit(opts);

    const warned = warn.mock.calls.map((call) => String(call[0]));
    warn.mockRestore();
    const report = readReport(opts.reportJson!);
    expect(report.headRestores).toBe(1);
    // Known per lecture whatever --parallel is: the restore is the lecture's own.
    expect(report.lectures).toEqual([
      expect.objectContaining({ file: 'chatty.md', outcome: 'ok', headRestored: true }),
      expect.objectContaining({ file: 'good.md', outcome: 'ok', headRestored: false }),
    ]);
    const written = fs.readFileSync(path.join(opts.target, 'lectures', 'chatty.md'), 'utf-8');
    expect(written).not.toContain('translate this lecture');
    expect(
      warned.filter((line) => line.includes('chatty.md') && line.includes('#326'))
    ).toHaveLength(1);
  });

  it('writes no report on a dry run', async () => {
    writeSource(['good.md']);
    const opts = options({ dryRun: true });

    await runInit(opts);

    expect(fs.existsSync(opts.reportJson!)).toBe(false);
    expect(api.requests).toHaveLength(0);
  });
});

describe('translate init: a state file it cannot write (#378)', () => {
  const stderrText = (): string => errorSpy.mock.calls.map((call) => String(call[0])).join('\n');

  it('fails the lecture with a state-write failure naming the file, keeps the translation, and prints the recovery command', async () => {
    writeSource(['good.md']);
    api.reply(GOOD);
    // A folder where the lecture's state file should be: only that write throws.
    const target = path.join(tmpDir, 'target');
    fs.mkdirSync(path.join(target, '.translate', 'state', 'good.md.yml'), { recursive: true });
    const opts = options({});

    const stats = await runInit(opts);

    expect(stats).toMatchObject({ successCount: 0, failureCount: 1 });
    expect(stats.failures).toEqual([
      {
        file: 'good.md',
        error: expect.stringMatching(
          /^translated, but \.translate\/state\/good\.md\.yml was not written: .*EISDIR/
        ),
      },
    ]);
    // The spent tokens still count.
    expect(stats.usage).toMatchObject({ inputTokens: 2000, outputTokens: 900, apiCalls: 1 });
    expect(fs.existsSync(path.join(target, 'lectures', 'good.md'))).toBe(true);
    const report = readReport(opts.reportJson!);
    expect(report.summary).toMatchObject({ ok: 0, failed: 1 });
    expect(report.lectures[0]).toMatchObject({
      file: 'good.md',
      outcome: 'failed',
      failure: { kind: 'state-write' },
    });
    expect(failureLines()).toEqual([
      expect.stringMatching(/^✗ good\.md: state-write — translated/),
    ]);
    // In full, with the edition's own flags, whatever the failure line's length.
    expect(stderrText()).toContain(
      `  translate status -s ${opts.source} -t ${target} -l zh-cn -d lectures -f good.md --write-state`
    );
    // No state file was written, so none records an unknown source-sha.
    const logged = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(logged).not.toContain('source-sha: unknown');
  });

  it('stops before any model call when the state folder cannot be written', async () => {
    writeSource(['good.md']);
    api.reply(GOOD);
    // A file where the state folder should be: every lecture's write would throw.
    const target = path.join(tmpDir, 'target');
    fs.mkdirSync(path.join(target, '.translate'), { recursive: true });
    fs.writeFileSync(path.join(target, '.translate', 'state'), 'not a folder', 'utf-8');

    await expect(runInit(options({}))).rejects.toThrow(
      /^Cannot write lecture state files in .*\.translate\/state \(.*\), so nothing was translated/
    );
    expect(api.requests).toHaveLength(0);
    expect(fs.existsSync(path.join(target, 'lectures', 'good.md'))).toBe(false);
  });

  // Root passes every access check, so the case cannot be set up as root.
  (process.getuid?.() === 0 ? it.skip : it)(
    'also stops when the state folder can be written but not searched',
    async () => {
      writeSource(['good.md']);
      api.reply(GOOD);
      const stateDir = path.join(tmpDir, 'target', '.translate', 'state');
      fs.mkdirSync(stateDir, { recursive: true });
      fs.chmodSync(stateDir, 0o600);
      try {
        await expect(runInit(options({}))).rejects.toThrow(/^Cannot write lecture state files/);
        expect(api.requests).toHaveLength(0);
      } finally {
        fs.chmodSync(stateDir, 0o700);
      }
    }
  );

  it('warns, after the run, when the source clone has no commit for the lecture', async () => {
    // writeSource makes a plain folder, not a git clone.
    writeSource(['good.md']);
    api.reply(GOOD);

    const stats = await runInit(options({}));

    expect(stats.successCount).toBe(1);
    const warnings = logSpy.mock.calls
      .map((call) => String(call[0]))
      .filter((line) => line.includes('source-sha: unknown'));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(
      'good.md: the source clone has no commit for it, so .translate/state/good.md.yml records'
    );
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

describe("translate init's printed token total (#356)", () => {
  it('counts the refused lecture: one total from the translator, on the console and in TRANSLATION-REPORT.md', async () => {
    writeSource(['good.md', 'broken.md']);
    api.reply(GOOD, BREAKS_PARITY);

    const stats = await runInit(options({ reportJson: undefined }));

    expect(stats).toMatchObject({ successCount: 1, failureCount: 1 });
    expect(stats.usage).toMatchObject({ inputTokens: 4000, outputTokens: 1750, apiCalls: 2 });
    const line = '2 call(s), 4000 input + 1750 output tokens, cache: 0 read + 0 written';
    const logged = logSpy.mock.calls.map((call) => String(call[0]));
    expect(logged).toContain(`  API usage: ${line}`);
    expect(logged.some((l) => /Tokens: /.test(l))).toBe(false);
    const report = fs.readFileSync(path.join(tmpDir, 'target', 'TRANSLATION-REPORT.md'), 'utf-8');
    expect(report).toContain(`- **API Usage**: ${line}\n`);
    expect(report).not.toContain('Total Tokens Used');
  });
});

describe('translate init --resume-from (#384)', () => {
  const logLines = (): string[] => logSpy.mock.calls.map((call) => String(call[0]));

  it('resumes from the lecture named exactly, not an earlier one whose name contains it', async () => {
    writeSource(['intro.md', 'ak_solow.md', 'solow.md', 'cobweb.md']);

    await runInit(options({ dryRun: true, resumeFrom: 'solow' }));

    const lines = logLines();
    expect(lines).toContain('Resuming from: solow.md\n');
    const listed = lines.filter((line) => /^ {2}\d+\. /.test(line));
    expect(listed.map((line) => line.trim().split(' ').slice(0, 2).join(' '))).toEqual([
      '3. solow.md',
      '4. cobweb.md',
    ]);
  });

  it('translates from the resumed lecture on', async () => {
    writeSource(['intro.md', 'ak_solow.md', 'solow.md', 'cobweb.md']);
    api.reply(GOOD, GOOD);

    const stats = await runInit(options({ resumeFrom: 'solow.md' }));

    expect(api.requests).toHaveLength(2);
    expect(stats.successCount).toBe(2);
    const docs = path.join(tmpDir, 'target', 'lectures');
    expect(fs.existsSync(path.join(docs, 'solow.md'))).toBe(true);
    expect(fs.existsSync(path.join(docs, 'cobweb.md'))).toBe(true);
    expect(fs.existsSync(path.join(docs, 'intro.md'))).toBe(false);
    expect(fs.existsSync(path.join(docs, 'ak_solow.md'))).toBe(false);
  });

  it('refuses a name that matches no lecture, before any model call or write', async () => {
    writeSource(['intro.md', 'solow.md', 'cobweb.md']);

    await expect(runInit(options({ resumeFrom: 'sollow.md' }))).rejects.toThrow(
      "sollow.md is not in the source's lecture set"
    );

    expect(api.requests).toHaveLength(0);
    expect(fs.existsSync(path.join(tmpDir, 'target'))).toBe(false);
  });

  it('refuses a name that matches more than one lecture, naming them', async () => {
    writeSource(['intro.md', 'ak_solow.md', 'solow_model.md']);

    await expect(runInit(options({ resumeFrom: 'solow' }))).rejects.toThrow(
      'solow names 2 lectures: ak_solow.md, solow_model.md. Name one by its path in the docs folder.'
    );
    await expect(runInit(options({ dryRun: true, resumeFrom: 'solow' }))).rejects.toThrow(
      /^solow names 2 lectures/
    );

    expect(api.requests).toHaveLength(0);
  });
});

describe('translate init into an existing edition (#134)', () => {
  const MATCHING_CONFIG =
    '# routing notes the edition keeps\nsource-language: en\ntarget-language: zh-cn\n' +
    'docs-folder: lectures\ntool-version: 0.1.0\neditors:\n  - someone\n';

  /** The source plus an edition holding localised build files and its own config. */
  function writeEdition(config: string): string {
    const source = writeSource(['good.md', 'other.md']);
    fs.writeFileSync(path.join(source, 'lectures', '_config.yml'), 'title: Lectures\n');
    fs.mkdirSync(path.join(source, 'lectures', '_static'));
    fs.writeFileSync(path.join(source, 'lectures', '_static', 'new.png'), 'PNG');
    const target = path.join(tmpDir, 'target');
    fs.mkdirSync(path.join(target, 'lectures'), { recursive: true });
    fs.writeFileSync(path.join(target, 'lectures', '_toc.yml'), 'caption: 讲座\n');
    fs.writeFileSync(path.join(target, 'lectures', '_config.yml'), 'title: 讲座\n');
    fs.mkdirSync(path.join(target, '.translate'));
    fs.writeFileSync(path.join(target, '.translate', 'config.yml'), config);
    return target;
  }

  const logLines = (): string[] => logSpy.mock.calls.map((call) => String(call[0]));

  it('an -f round keeps the edition files, its matching config byte for byte, and writes no TRANSLATION-REPORT.md', async () => {
    const target = writeEdition(MATCHING_CONFIG);
    api.reply(GOOD);

    const stats = await runInit(options({ file: 'good.md' }));

    expect(stats).toMatchObject({ successCount: 1, failureCount: 0 });
    expect(fs.readFileSync(path.join(target, 'lectures', '_toc.yml'), 'utf-8')).toBe(
      'caption: 讲座\n'
    );
    expect(fs.readFileSync(path.join(target, 'lectures', '_config.yml'), 'utf-8')).toBe(
      'title: 讲座\n'
    );
    // The one file the edition lacked is copied.
    expect(fs.readFileSync(path.join(target, 'lectures', '_static', 'new.png'), 'utf-8')).toBe(
      'PNG'
    );
    expect(fs.readFileSync(path.join(target, '.translate', 'config.yml'), 'utf-8')).toBe(
      MATCHING_CONFIG
    );
    expect(fs.existsSync(path.join(target, 'TRANSLATION-REPORT.md'))).toBe(false);
    expect(fs.existsSync(path.join(target, '.translate', 'state', 'good.md.yml'))).toBe(true);
    expect(logLines()).toContain(
      `Copied 1 non-markdown file(s), and kept 2 the edition already has\n`
    );
  });

  it('an -f round prints a failure in full, since no TRANSLATION-REPORT.md carries it', async () => {
    const target = writeEdition(MATCHING_CONFIG);
    api.reply(BREAKS_PARITY);

    const stats = await runInit(options({ file: 'good.md' }));

    expect(stats.failureCount).toBe(1);
    expect(fs.existsSync(path.join(target, 'TRANSLATION-REPORT.md'))).toBe(false);
    const stderr = errorSpy.mock.calls.map((call) => String(call[0]));
    expect(stderr).toContain(`\ngood.md failed:\n${stats.failures[0].error}`);
  });

  it('a dry run into an empty target says it would write the config', async () => {
    writeSource(['good.md']);

    await runInit(options({ dryRun: true, file: 'good.md' }));

    expect(logLines()).toEqual(
      expect.arrayContaining([expect.stringContaining('Would write .translate/config.yml')])
    );
  });

  it('a dry run counts what it would copy and keep, and says the config stays', async () => {
    writeEdition(MATCHING_CONFIG);

    await runInit(options({ dryRun: true, file: 'good.md' }));

    expect(logLines()).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'Would copy 1 non-markdown file(s), and keep 2 the edition already has'
        ),
        expect.stringContaining('Would leave .translate/config.yml as it is'),
      ])
    );
  });

  it.each([false, true])(
    'refuses a config that differs from the flags before any model call (dry run: %s)',
    async (dryRun) => {
      const config = MATCHING_CONFIG.replace('docs-folder: lectures', 'docs-folder: book');
      const target = writeEdition(config);
      api.reply(GOOD);

      await expect(runInit(options({ dryRun, file: 'good.md' }))).rejects.toThrow(
        /does not match this run's flags, so nothing was translated or written:\n {2}docs-folder: the config has "book", and this run's -d is "lectures"$/m
      );

      expect(api.requests).toHaveLength(0);
      expect(fs.existsSync(path.join(target, 'lectures', 'good.md'))).toBe(false);
      expect(fs.existsSync(path.join(target, 'lectures', '_static'))).toBe(false);
      expect(fs.readFileSync(path.join(target, '.translate', 'config.yml'), 'utf-8')).toBe(config);
    }
  );

  it('a bulk run into an empty target writes the config and the report, and copies every file', async () => {
    writeSource(['good.md']);
    api.reply(GOOD);
    const opts = options({});

    await runInit(opts);

    expect(fs.readFileSync(path.join(opts.target, '.translate', 'config.yml'), 'utf-8')).toMatch(
      /^source-language: en\ntarget-language: zh-cn\ndocs-folder: lectures\ntool-version: /
    );
    expect(fs.existsSync(path.join(opts.target, 'TRANSLATION-REPORT.md'))).toBe(true);
    expect(fs.existsSync(path.join(opts.target, 'lectures', '_toc.yml'))).toBe(true);
    expect(logLines()).toContain(
      `Copied 1 non-markdown file(s), and kept 0 the edition already has\n`
    );
  });
});

describe('translate init on the lecture set (#449)', () => {
  /** The GPU notice lectures pull in, shaped like lecture-python.myst's: no title, one block. */
  const GPU =
    '```{admonition} GPU\n:class: warning\n\nThis lecture was built using a machine with ' +
    'access to a GPU, although it will also run without one.\n```\n';
  const GPU_ZH =
    '```{admonition} GPU\n:class: warning\n\n本讲座是在一台可以使用 GPU 的机器上构建的，没有 GPU 也能运行。\n```\n';
  const GPU_REPLY: FakeReply = {
    content: [thinking, text(GPU_ZH)],
    stop_reason: 'end_turn',
    usage: { input_tokens: 400, output_tokens: 60 },
  };
  const INCLUDE = '```{include} _admonition/gpu.md\n```';
  const GOOD_INCLUDES: FakeReply = {
    ...GOOD,
    content: [thinking, text(CLEAN.replace('一些文字。', `一些文字。\n\n${INCLUDE}`))],
  };

  const docs = () => path.join(tmpDir, 'source', 'lectures');
  const logLines = (): string[] => logSpy.mock.calls.map((call) => String(call[0]));

  /** A source whose `good.md` includes `_admonition/gpu.md`, beside a README the ToC does not list. */
  function writeSourceWithFragment(toc?: string): string {
    const source = writeSource(['good.md']);
    fs.writeFileSync(
      path.join(docs(), 'good.md'),
      SOURCE.replace('Some text.', `Some text.\n\n${INCLUDE}`),
      'utf-8'
    );
    fs.mkdirSync(path.join(docs(), '_admonition'));
    fs.writeFileSync(path.join(docs(), '_admonition', 'gpu.md'), GPU, 'utf-8');
    fs.writeFileSync(path.join(docs(), 'README.md'), '# Lectures\n', 'utf-8');
    if (toc) fs.writeFileSync(path.join(docs(), '_toc.yml'), toc, 'utf-8');
    return source;
  }

  it('translates the included fragment after the documents, and not the README', async () => {
    writeSourceWithFragment();
    api.reply(GOOD_INCLUDES, GPU_REPLY);
    const opts = options({});

    const stats = await runInit(opts);

    expect(stats).toMatchObject({ totalLectures: 2, successCount: 2, failureCount: 0 });
    expect(api.requests).toHaveLength(2);
    expect(readReport(opts.reportJson!).lectures.map((l) => l.file)).toEqual([
      'good.md',
      '_admonition/gpu.md',
    ]);
    expect(logLines()).toContain('\nFound 2 lectures: 1 in _toc.yml, and 1 file they include');
    expect(fs.existsSync(path.join(opts.target, 'lectures', 'README.md'))).toBe(false);
  });

  it('writes a fragment as translated, with no front matter, and its state file in its folder', async () => {
    writeSourceWithFragment();
    api.reply(GPU_REPLY);
    const opts = options({ file: '_admonition/gpu.md' });

    const stats = await runInit(opts);

    expect(stats).toMatchObject({ successCount: 1, failureCount: 0 });
    expect(JSON.stringify(api.requests[0].body)).toContain(
      'This lecture was built using a machine'
    );
    // No title and no sections: no heading map, so nothing is added above the block
    expect(
      fs.readFileSync(path.join(opts.target, 'lectures', '_admonition', 'gpu.md'), 'utf-8')
    ).toBe(GPU_ZH);
    const state = fs.readFileSync(
      path.join(opts.target, '.translate', 'state', '_admonition', 'gpu.md.yml'),
      'utf-8'
    );
    expect(state).toMatch(/^mode: NEW$/m);
    expect(state).toMatch(/^section-count: 0$/m);
    expect(fs.existsSync(path.join(opts.target, 'lectures', 'good.md'))).toBe(false);
  });

  it('holds a fragment to the parity guard, as any lecture', async () => {
    writeSourceWithFragment();
    api.reply({
      ...GPU_REPLY,
      content: [thinking, text(GPU_ZH.replace('{admonition}', '{note}'))],
    });
    const opts = options({ file: '_admonition/gpu.md' });

    const stats = await runInit(opts);

    expect(stats.failureCount).toBe(1);
    expect(stats.failures[0].error).toMatch(
      /structural parity check failed for _admonition\/gpu\.md/
    );
    expect(fs.existsSync(path.join(opts.target, 'lectures', '_admonition', 'gpu.md'))).toBe(false);
  });

  it('matches a fragment by part of its name with -f', async () => {
    writeSourceWithFragment();

    await runInit(options({ dryRun: true, file: 'gpu.md' }));

    expect(logLines()).toContain('Translating single file: _admonition/gpu.md\n');
  });

  it('refuses -f for a file outside the lecture set, naming it, before any model call', async () => {
    writeSourceWithFragment('format: jb-book\nroot: index\nchapters:\n  - file: good\n');
    api.reply(GOOD);

    await expect(runInit(options({ file: 'README.md' }))).rejects.toThrow(
      "README.md is not in the source's lecture set: _toc.yml does not list it, and no lecture " +
        'it lists includes it.\nAvailable lectures: good.md, _admonition/gpu.md'
    );
    await expect(runInit(options({ file: 'index' }))).rejects.toThrow(
      '_toc.yml lists index, but the docs folder has no index.md.'
    );
    expect(api.requests).toHaveLength(0);
  });

  it('a dry run lists the fragment, and names the ToC entries it cannot translate', async () => {
    writeSourceWithFragment(
      'format: jb-book\nroot: index\nchapters:\n  - file: good\n  - file: notebook\n'
    );
    fs.writeFileSync(path.join(docs(), 'notebook.ipynb'), '{}', 'utf-8');

    const stats = await runInit(options({ dryRun: true }));

    expect(stats.totalLectures).toBe(2);
    const lines = logLines();
    expect(lines).toEqual(
      expect.arrayContaining([
        '⚠ Not translated: 1 _toc.yml entry with no .md file behind it: index',
        'ℹ Not translated: 1 _toc.yml entry backed by a file that is not Markdown, copied with ' +
          'the other non-Markdown files: notebook.ipynb',
        '  1. good.md ✓',
        '  2. _admonition/gpu.md ✓',
      ])
    );
    // The entry with no file is reported once, above, not as a missing lecture
    expect(lines.some((line) => line.includes('✗ missing'))).toBe(false);
    expect(lines.some((line) => line.includes('index.md'))).toBe(false);
  });

  it('stops before any model call when the source has no _toc.yml, with the reader’s message', async () => {
    writeSourceWithFragment();
    fs.rmSync(path.join(docs(), '_toc.yml'));
    api.reply(GOOD_INCLUDES, GPU_REPLY);
    const opts = options({});

    await expect(runInit(opts)).rejects.toThrow(
      `SOURCE ${docs()}: the docs folder has no _toc.yml or myst.yml, so it has no lecture set`
    );
    expect(api.requests).toHaveLength(0);
    expect(fs.existsSync(opts.target)).toBe(false);
  });
});

/**
 * The token total a bulk `translate forward` prints (#356), and the refused
 * output it keeps (#364).
 *
 * The summary summed `tokensUsed`, which only a successful resync set, and left
 * out triage: a file the parity guard refused, or whose triage the model
 * refused, cost money and counted nothing. runForwardBulk runs here against a
 * temporary source and edition, with the real triage, translator and SDK behind
 * a fake fetch (test-support/fake-anthropic-api.ts).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runForwardBulk } from '../commands/forward.js';
import { ForwardOptions } from '../types.js';
import {
  FakeAnthropicApi,
  FakeReply,
  installFakeAnthropicApi,
} from '../../test-support/fake-anthropic-api.js';
import { writeToc } from '../../test-support/toc-fixture.js';

const SOURCE = '# Title\n\n(intro)=\n## Introduction\n\nNew text.\n';
// No heading map, so status flags each lecture MISSING_HEADINGMAP and forward takes it
const TARGET = '# 标题\n\n(intro)=\n## 介绍\n\n旧文字。\n';
const RESYNCED = '# 标题\n\n(intro)=\n## 介绍\n\n新文字。\n';

const triage = (outputTokens: number): FakeReply => ({
  content: [{ type: 'text', text: '{"verdict": "CONTENT_CHANGES", "reason": "new text"}' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 100, output_tokens: outputTokens },
});
const GOOD: FakeReply = {
  content: [{ type: 'text', text: RESYNCED }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 1000, output_tokens: 200 },
};
const BREAKS_PARITY: FakeReply = {
  content: [{ type: 'text', text: RESYNCED.replace('(intro)=\n', '') }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 1000, output_tokens: 150 },
};
const TRIAGE_REFUSED: FakeReply = {
  content: [{ type: 'text', text: '{' }],
  stop_reason: 'refusal',
  stop_details: { type: 'refusal', category: 'bio', explanation: null },
  usage: { input_tokens: 100, output_tokens: 5 },
};

describe('forward bulk summary: API usage (#356)', () => {
  let tmpDir: string;
  let api: FakeAnthropicApi;
  let cwdSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forward-usage-'));
    const lectures = ['good.md', 'broken.md', 'refused.md'];
    for (const [repo, content] of [
      ['source', SOURCE],
      ['target', TARGET],
    ]) {
      const docs = path.join(tmpDir, repo, 'lectures');
      fs.mkdirSync(docs, { recursive: true });
      writeToc(docs, lectures);
      for (const lecture of lectures) {
        fs.writeFileSync(path.join(docs, lecture), content, 'utf-8');
      }
    }
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(path.join(tmpDir, 'target'));
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    api = installFakeAnthropicApi();
  });

  afterEach(() => {
    api.restore();
    stderrSpy.mockRestore();
    logSpy.mockRestore();
    cwdSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('counts every call: triage, a success, a parity refusal and a refused triage', async () => {
    // One file at a time, in the order status lists them: broken, good, refused
    api.reply(triage(10), BREAKS_PARITY, triage(10), GOOD, TRIAGE_REFUSED);
    const lines: string[] = [];
    const logger = {
      info: (m: string) => lines.push(m),
      warn: (m: string) => lines.push(m),
      error: (m: string) => lines.push(m),
    };
    const options: ForwardOptions = {
      source: path.join(tmpDir, 'source'),
      target: path.join(tmpDir, 'target'),
      docsFolder: 'lectures',
      language: 'zh-cn',
      sourceLanguage: 'en',
      model: 'claude-sonnet-5',
      test: false,
      apiKey: 'test-key',
      parallel: 1,
      builtInGlossaryDir: path.join(__dirname, '..', '..', '..', 'glossary'),
    };

    // An earlier run's refusal of good.md, which this run's resync replaces (#364)
    const refusedDir = path.join(tmpDir, 'target', '.translate', 'refused');
    fs.mkdirSync(refusedDir, { recursive: true });
    fs.writeFileSync(path.join(refusedDir, 'good.md'), 'stale');

    const results = await runForwardBulk(options, logger);

    expect(api.requests).toHaveLength(5);
    expect(results.map((r) => [r.file, r.summary.resynced, r.summary.errors])).toEqual([
      ['broken.md', 0, 1],
      ['good.md', 1, 0],
      ['refused.md', 0, 1],
    ]);
    expect(results.map((r) => r.usage?.apiCalls)).toEqual([2, 2, 1]);
    expect(results[0].usage).toMatchObject({ inputTokens: 1100, outputTokens: 160 });
    expect(results[2].usage).toMatchObject({ inputTokens: 100, outputTokens: 5 });
    expect(lines).toContain(
      '  API usage:       5 call(s), 2300 input + 375 output tokens, cache: 0 read + 0 written'
    );
    expect(lines.some((line) => line.includes('Total tokens'))).toBe(false);

    // What the parity guard refused is kept, named, and shown at its ends (#364)
    const kept = fs.readFileSync(path.join(refusedDir, 'broken.md'), 'utf-8');
    expect(kept).toContain('## 介绍');
    expect(kept).not.toContain('(intro)=');
    expect(results[0].refusedOutput).toBe('.translate/refused/broken.md');
    expect(lines).toContain(
      '  The refused output is kept at .translate/refused/broken.md. Its first and last lines:'
    );
    const keptLines = kept.replace(/\n$/, '').split('\n');
    expect(lines).toContain(`    | ${keptLines[0]}`);
    expect(lines).toContain(`    | ${keptLines[keptLines.length - 1]}`);
    expect(lines).toContain('    broken.md (refused output: .translate/refused/broken.md)');
    expect(fs.existsSync(path.join(refusedDir, 'good.md'))).toBe(false);
  });
});

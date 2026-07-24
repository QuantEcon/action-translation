/**
 * init structural-parity guard (#159 — audit F1).
 *
 * init was the one model-output write path with no checkStructuralParity:
 * translateFullDocument → applyTypography → injectHeadingMap → writeFileSync
 * with nothing in between — while seeding an entire edition, when corruption
 * is most expensive and least likely to be noticed. A corrupt seed becomes
 * the baseline the sync guard compares forward from, so nothing downstream
 * can re-examine it. Separate file from init.test.ts, which exercises the
 * pure helpers with no translator involved.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { translateLecture, InitOptions } from '../commands/init.js';
import { TranslationService } from '../../translator.js';

const SOURCE = `# Test Lecture

(intro)=
## Introduction

Some text.

\`\`\`{code-cell} ipython3
print("hi")
\`\`\`
`;

function fakeTranslator(output: string): TranslationService {
  return {
    translateFullDocument: jest.fn().mockResolvedValue({
      success: true,
      translatedSection: output,
      tokensUsed: 10,
    }),
  } as unknown as TranslationService;
}

describe('translateLecture structural-parity guard', () => {
  let tmpDir: string;
  let options: InitOptions;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'init-parity-'));
    fs.mkdirSync(path.join(tmpDir, 'source', 'lectures'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'target', 'lectures'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'source', 'lectures', 'test.md'), SOURCE, 'utf-8');
    options = {
      source: path.join(tmpDir, 'source'),
      target: path.join(tmpDir, 'target'),
      targetLanguage: 'zh-cn',
      sourceLanguage: 'en',
      docsFolder: 'lectures',
      model: 'test-model',
      batchDelay: 0,
      parallel: 1,
      localize: [],
      dryRun: false,
      apiKey: 'test-key',
    };
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function run(output: string): Promise<{ tokensUsed: number; elapsedMs: number }> {
    return translateLecture(
      'test.md',
      options.source,
      options.target,
      'lectures',
      fakeTranslator(output),
      options,
      undefined
    );
  }

  const targetFile = () => path.join(tmpDir, 'target', 'lectures', 'test.md');

  it('fails the file loudly when the model drops a target anchor, writing nothing', async () => {
    const corrupt = SOURCE.replace('(intro)=\n', '').replace('# Test Lecture', '# 测试讲座');
    await expect(run(corrupt)).rejects.toThrow(/missing from output: \(intro\)=/);
    expect(fs.existsSync(targetFile())).toBe(false);
  });

  it('fails the file loudly when a directive name mutates, writing nothing', async () => {
    const corrupt = SOURCE.replace('{code-cell}', '{code-block}');
    await expect(run(corrupt)).rejects.toThrow(/name changed/);
    expect(fs.existsSync(targetFile())).toBe(false);
  });

  it('writes a structurally clean translation', async () => {
    const clean = SOURCE.replace('# Test Lecture', '# 测试讲座')
      .replace('## Introduction', '## 介绍')
      .replace('Some text.', '一些文字。');
    await run(clean);
    const written = fs.readFileSync(targetFile(), 'utf-8');
    expect(written).toContain('(intro)=');
    expect(written).toContain('{code-cell}');
    expect(written).toContain('测试讲座');
  });
});

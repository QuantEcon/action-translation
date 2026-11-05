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
import { unwrapDocumentFence } from '../../whole-document.js';

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

  it("writes the source's front matter and pre-title when the model drops them (#326)", async () => {
    const source = `---
jupytext:
  text_representation:
    format_name: myst
kernelspec:
  name: python3
---

(test)=
# Test Lecture

Some text.
`;
    fs.writeFileSync(path.join(tmpDir, 'source', 'lectures', 'test.md'), source, 'utf-8');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      // Without the restore, the front-matter rule would refuse this draw.
      await run('# 测试讲座\n\n一些文字。');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('#326'));
    } finally {
      warn.mockRestore();
    }
    const written = fs.readFileSync(targetFile(), 'utf-8');
    expect(written).toMatch(
      /^---\njupytext:\n {2}text_representation:\n {4}format_name: myst\nkernelspec:\n {2}name: python3\n/
    );
    expect(written).toContain('translation:\n  title: 测试讲座');
    expect(written).toContain('---\n\n(test)=\n# 测试讲座\n');
  });

  it('refuses front-matter keys below the title, which no head restore reaches (#288)', async () => {
    const corrupt = SOURCE.replace('# Test Lecture', '# 测试讲座').replace(
      'Some text.',
      'Some text.\n\nkernelspec:\n  name: python3'
    );
    await expect(run(corrupt)).rejects.toThrow(/front-matter key `kernelspec:` at output line/);
    expect(fs.existsSync(targetFile())).toBe(false);
  });

  describe('a code-fence wrapper the unwrap declines (#363)', () => {
    // A {raw} block above the title closes the wrapper's opening line, so the
    // head restore finds the H1 and replaces everything above it.
    const source = `---
jupytext:
  text_representation:
    format_name: myst
kernelspec:
  name: python3
---

(test)=
\`\`\`{raw} jupyter
<div id="qe-notebook-header"></div>
\`\`\`

# Test Lecture

Some text.

\`\`\`{code-cell} ipython3
print("hi")
\`\`\`
`;
    const translated = source
      .replace('# Test Lecture', '# 测试讲座')
      .replace('Some text.', '一些文字。');

    beforeEach(() => {
      fs.writeFileSync(path.join(tmpDir, 'source', 'lectures', 'test.md'), source, 'utf-8');
    });

    async function quietly(output: string): Promise<void> {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      try {
        await run(output);
      } finally {
        warn.mockRestore();
      }
    }

    it('refuses it when closed: its closing line would be the document’s last, an open fence', async () => {
      // The translator trims the response, so no newline follows the wrapper.
      await expect(quietly('```text\n' + translated + '```')).rejects.toThrow(
        /output ends inside the fence opened at output line \d+, and the source does not/
      );
      expect(fs.existsSync(targetFile())).toBe(false);
    });

    it('writes the source’s front matter when the model opened it with a fence in place of `---`', async () => {
      // #363's capture: the unwrap removes that first line, as for a wrapper
      // never closed, which leaves the front matter without its opening line.
      // Without the head restore, init would write a `translation:`-only front
      // matter above the orphaned keys, and parity would pass it.
      const draw = translated.replace(/^---\n/, '```\n').trimEnd();
      const unwrapped = unwrapDocumentFence(draw, [source]);
      expect(unwrapped.unwrapped).toBe(true);

      await quietly(unwrapped.text);
      const written = fs.readFileSync(targetFile(), 'utf-8');
      expect(written).toMatch(/^---\njupytext:\n {2}text_representation:\n/);
      expect(written).toContain('kernelspec:\n  name: python3\n');
      expect(written).toContain('translation:\n  title: 测试讲座');
      expect(written).toContain('---\n\n(test)=\n```{raw} jupyter\n');
    });

    it('writes it when never closed: the head restore removes its only line', async () => {
      await quietly('```text\n' + translated.trimEnd());
      const written = fs.readFileSync(targetFile(), 'utf-8');
      expect(written).toMatch(/^---\njupytext:\n/);
      expect(written).toContain('---\n\n(test)=\n```{raw} jupyter\n');
      expect(written).not.toContain('```text');
      expect(written.endsWith('print("hi")\n```\n')).toBe(true);
    });
  });

  it('writes a file that ends with a newline (sibling of #116)', async () => {
    // The real translator trims the model's response, so translateLecture
    // receives unterminated content — mimic that with trimEnd(). Before the
    // fix every seeded edition file was written without a terminator.
    const clean = SOURCE.replace('# Test Lecture', '# 测试讲座')
      .replace('## Introduction', '## 介绍')
      .replace('Some text.', '一些文字。')
      .trimEnd();
    await run(clean);
    const written = fs.readFileSync(targetFile(), 'utf-8');
    expect(written.endsWith('\n')).toBe(true);
    expect(written.endsWith('\n\n')).toBe(false);
  });
});

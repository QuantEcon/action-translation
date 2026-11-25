/**
 * Keeping what the parity guard refused (#364): where it goes, that it stays
 * out of git, that no write leaves `.translate/refused/` or follows a link,
 * and that nothing reading `.translate/` or the docs folder sees it.
 * runInit and runForwardBulk keep it end to end in init-report.test.ts and
 * forward-usage.test.ts; doctor --require-state ignores it in doctor.test.ts.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import {
  REFUSED_DIR,
  describeKeptOutput,
  keepRefusedOutput,
  refusedOutputPreview,
  removeRefusedOutput,
} from '../refused-output.js';
import { listStateFiles, writeFileState } from '../translate-state.js';
import { runStatus } from '../commands/status.js';
import { writeToc } from '../../test-support/toc-fixture.js';

let tmpDir: string;
let target: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refused-output-'));
  target = path.join(tmpDir, 'target');
  fs.mkdirSync(target);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const refused = (...parts: string[]) => path.join(target, '.translate', 'refused', ...parts);

/** Every file under `dir`, relative to it, links included and not followed. */
function filesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string, rel: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(d, entry.name), childRel);
      else out.push(childRel);
    }
  };
  walk(dir, '');
  return out.sort();
}

describe('keepRefusedOutput', () => {
  it('writes the bytes at the lecture path under .translate/refused/, beside a .gitignore of *', () => {
    expect(keepRefusedOutput(target, 'cobweb.md', '```\n# 蛛网\n```\n')).toEqual({
      kept: true,
      path: '.translate/refused/cobweb.md',
    });
    expect(fs.readFileSync(refused('cobweb.md'), 'utf-8')).toBe('```\n# 蛛网\n```\n');
    expect(fs.readFileSync(refused('.gitignore'), 'utf-8')).toBe('*\n');
    expect(REFUSED_DIR).toBe('.translate/refused');
  });

  it('keeps a lecture in a subfolder at the same path, and replaces an earlier refusal', () => {
    expect(keepRefusedOutput(target, '_admonition/gpu.md', 'first')).toEqual({
      kept: true,
      path: '.translate/refused/_admonition/gpu.md',
    });
    keepRefusedOutput(target, '_admonition/gpu.md', 'second');
    expect(fs.readFileSync(refused('_admonition', 'gpu.md'), 'utf-8')).toBe('second');
  });

  it('leaves a .gitignore the folder already has', () => {
    fs.mkdirSync(refused(), { recursive: true });
    fs.writeFileSync(refused('.gitignore'), '# mine\n*\n');
    keepRefusedOutput(target, 'intro.md', 'x');
    expect(fs.readFileSync(refused('.gitignore'), 'utf-8')).toBe('# mine\n*\n');
  });

  it.each([
    ['empty', ''],
    ['without a * line', '# mine\n!keep.md\n'],
  ])('replaces an ignore file that is %s, so the output stays out of git', (_, content) => {
    const git = (...args: string[]) =>
      execFileSync('git', args, {
        cwd: target,
        encoding: 'utf-8',
        env: { ...process.env, GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: '1' },
      });
    git('init', '-q');
    fs.mkdirSync(refused(), { recursive: true });
    fs.writeFileSync(refused('.gitignore'), content);

    expect(keepRefusedOutput(target, 'intro.md', 'x')).toEqual({
      kept: true,
      path: '.translate/refused/intro.md',
    });
    expect(fs.readFileSync(refused('.gitignore'), 'utf-8')).toBe('*\n');
    expect(git('status', '--porcelain', '--untracked-files=all')).toBe('');
  });

  it('keeps nothing when the ignore file is a symbolic link, dangling or not, and writes nothing through it', () => {
    const outside = path.join(tmpDir, 'outside');
    fs.mkdirSync(outside);
    fs.mkdirSync(refused(), { recursive: true });
    fs.symlinkSync(path.join(outside, 'ignore'), refused('.gitignore'));

    expect(keepRefusedOutput(target, 'intro.md', 'x')).toEqual({
      kept: false,
      reason: '.translate/refused/.gitignore is a symbolic link',
    });
    expect(filesUnder(outside)).toEqual([]);
    expect(fs.existsSync(refused('intro.md'))).toBe(false);

    fs.writeFileSync(path.join(outside, 'ignore'), '');
    expect(keepRefusedOutput(target, 'intro.md', 'x')).toMatchObject({ kept: false });
    expect(fs.readFileSync(path.join(outside, 'ignore'), 'utf-8')).toBe('');
  });

  it.each(['.gitignore', 'sub/.gitignore', '.GITIGNORE'])(
    'refuses the lecture path %j, which would replace the folder’s ignore file',
    (lecture) => {
      keepRefusedOutput(target, 'intro.md', 'x');
      expect(keepRefusedOutput(target, lecture, 'model output')).toEqual({
        kept: false,
        reason: `${lecture} would replace .translate/refused/.gitignore`,
      });
      expect(fs.readFileSync(refused('.gitignore'), 'utf-8')).toBe('*\n');
      expect(removeRefusedOutput(target, lecture)).toBe(false);
      expect(fs.readFileSync(refused('.gitignore'), 'utf-8')).toBe('*\n');
    }
  );

  describe('two processes keeping outputs in one target at once', () => {
    // The real module object, which refused-output.ts calls into
    const realFs = jest.requireActual<typeof fs>('fs');
    afterEach(() => jest.restoreAllMocks());

    it('takes a folder the other created first as made', () => {
      const mkdir = realFs.mkdirSync.bind(realFs);
      jest.spyOn(realFs, 'mkdirSync').mockImplementation(((p: fs.PathLike, o?: unknown) => {
        mkdir(p, o as fs.MakeDirectoryOptions); // the other process wins the race
        return mkdir(p, o as fs.MakeDirectoryOptions);
      }) as typeof fs.mkdirSync);

      expect(keepRefusedOutput(target, 'sub/intro.md', 'x')).toEqual({
        kept: true,
        path: '.translate/refused/sub/intro.md',
      });
    });

    it('takes an ignore file the other wrote first as written', () => {
      const write = realFs.writeFileSync.bind(realFs);
      jest.spyOn(realFs, 'writeFileSync').mockImplementation(((
        p: fs.PathOrFileDescriptor,
        data: string,
        o?: fs.WriteFileOptions
      ) => {
        if (String(p).endsWith('.gitignore')) write(p, '*\n'); // the other process wins the race
        return write(p, data, o);
      }) as typeof fs.writeFileSync);

      expect(keepRefusedOutput(target, 'intro.md', 'x')).toEqual({
        kept: true,
        path: '.translate/refused/intro.md',
      });
      expect(fs.readFileSync(refused('.gitignore'), 'utf-8')).toBe('*\n');
    });
  });

  it('keeps it out of git in an edition whose own .gitignore does not name it', () => {
    const git = (...args: string[]) =>
      execFileSync('git', args, {
        cwd: target,
        encoding: 'utf-8',
        env: { ...process.env, GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: '1' },
      });
    git('init', '-q');
    keepRefusedOutput(target, 'lectures/intro.md', 'x');
    expect(git('status', '--porcelain', '--untracked-files=all')).toBe('');
  });

  it.each([
    '../escape.md',
    '../../escape.md',
    'a/../../escape.md',
    '/tmp/escape.md',
    'a//b.md',
    '',
  ])('refuses %j, which is not a path inside the docs folder, and writes nothing', (lecture) => {
    const kept = keepRefusedOutput(target, lecture, 'x');
    expect(kept).toEqual({
      kept: false,
      reason: `${lecture} is not a path inside the docs folder`,
    });
    expect(filesUnder(tmpDir)).toEqual([]);
  });

  it('follows no symbolic link: not the folder, not .translate, not the file', () => {
    const outside = path.join(tmpDir, 'outside');
    fs.mkdirSync(outside);

    fs.mkdirSync(path.join(target, '.translate'));
    fs.symlinkSync(outside, refused());
    expect(keepRefusedOutput(target, 'intro.md', 'x')).toEqual({
      kept: false,
      reason: '.translate/refused is a symbolic link',
    });

    fs.rmSync(path.join(target, '.translate'), { recursive: true });
    fs.symlinkSync(outside, path.join(target, '.translate'));
    expect(keepRefusedOutput(target, 'intro.md', 'x')).toEqual({
      kept: false,
      reason: '.translate is a symbolic link',
    });

    fs.unlinkSync(path.join(target, '.translate'));
    fs.mkdirSync(refused('sub'), { recursive: true });
    fs.symlinkSync(path.join(outside, 'file.md'), refused('sub', 'intro.md'));
    expect(keepRefusedOutput(target, 'sub/intro.md', 'x')).toEqual({
      kept: false,
      reason: '.translate/refused/sub/intro.md is a symbolic link',
    });

    expect(filesUnder(outside)).toEqual([]);
  });

  it('says where the output is, or why it is not kept', () => {
    expect(describeKeptOutput({ kept: true, path: '.translate/refused/a.md' })).toBe(
      'The refused output is kept at .translate/refused/a.md'
    );
    expect(describeKeptOutput({ kept: false, reason: '.translate is a symbolic link' })).toBe(
      'The refused output was not kept: .translate is a symbolic link'
    );
  });
});

describe('removeRefusedOutput', () => {
  it('removes the lecture’s refused output and nothing else', () => {
    keepRefusedOutput(target, 'a.md', 'x');
    keepRefusedOutput(target, 'b.md', 'y');
    expect(removeRefusedOutput(target, 'a.md')).toBe(true);
    expect(filesUnder(refused())).toEqual(['.gitignore', 'b.md']);
    expect(removeRefusedOutput(target, 'a.md')).toBe(false);
    expect(removeRefusedOutput(target, '../b.md')).toBe(false);
  });

  it('does nothing through a symbolic link', () => {
    const outside = path.join(tmpDir, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'a.md'), 'keep me');
    fs.mkdirSync(path.join(target, '.translate'));
    fs.symlinkSync(outside, refused());

    expect(removeRefusedOutput(target, 'a.md')).toBe(false);
    expect(fs.readFileSync(path.join(outside, 'a.md'), 'utf-8')).toBe('keep me');
  });
});

describe('refusedOutputPreview', () => {
  it('shows a short output whole', () => {
    expect(refusedOutputPreview('a\nb\nc\n')).toEqual(['a', 'b', 'c']);
  });

  it('shows the first and last three lines of a longer one', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`);
    expect(refusedOutputPreview(`${lines.join('\n')}\n`)).toEqual([
      'line 1',
      'line 2',
      'line 3',
      '…',
      'line 8',
      'line 9',
      'line 10',
    ]);
  });

  it('starts after the front matter, so a fence that opens the reply is the first line shown', () => {
    const output =
      '---\ntranslation:\n  title: 蛛网\n  headings:\n    Introduction: 介绍\n---\n\n' +
      '```markdown\n# 蛛网\n\n## 介绍\n\n一些文字。\n\n结尾。\n```\n';
    expect(refusedOutputPreview(output)).toEqual([
      '```markdown',
      '# 蛛网',
      '',
      '…',
      '',
      '结尾。',
      '```',
    ]);
  });

  it('shows the front matter when there is nothing after it', () => {
    expect(refusedOutputPreview('---\ntitle: x\n---\n')).toEqual(['---', 'title: x', '---']);
  });

  it('drops a CRLF’s \\r and shows other control characters as U+FFFD, tabs kept', () => {
    expect(refusedOutputPreview('a\r\n\u001b[31mred\tx\u0007\r\nend\r\n')).toEqual([
      'a',
      '�[31mred\tx�',
      'end',
    ]);
  });

  it('clips a long line at 200 characters, saying how many more there were', () => {
    const [line] = refusedOutputPreview(`${'字'.repeat(200_000)}\n`);
    expect(line).toBe(`${'字'.repeat(200)}… [199800 more characters]`);
  });
});

describe('a refused output is no lecture and no state file', () => {
  it('is not a state file, and status does not list it with the docs at the repository root', async () => {
    const source = path.join(tmpDir, 'source');
    const lecture = '# Title\n\n## One\n\nText.\n';
    for (const repo of [source, target]) {
      fs.mkdirSync(repo, { recursive: true });
      fs.writeFileSync(path.join(repo, 'intro.md'), lecture);
      writeToc(repo, ['intro']);
    }
    writeFileState(target, 'intro.md', {
      'source-sha': 'unknown',
      'synced-at': '2026-11-25',
      model: 'unknown',
      mode: 'NEW',
      'section-count': 1,
    });
    const status = () =>
      runStatus({ source, target, docsFolder: '.', language: 'zh-cn', exclude: [] });
    const before = await status();

    keepRefusedOutput(target, 'intro.md', lecture);
    keepRefusedOutput(target, 'draft.md', lecture);

    expect(listStateFiles(target)).toEqual(['intro.md.yml']);
    const after = await status();
    expect(after.entries.map((e) => e.file)).toEqual(['intro.md']);
    expect(after).toEqual(before);
  });
});

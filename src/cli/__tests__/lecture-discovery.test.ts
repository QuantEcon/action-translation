/**
 * Tests for lecture discovery (#449): the lectures `init` and the CLI's bulk
 * modes take from a repository's docs folder, its ToC's documents and then the
 * `.md` files they include, as `src/lecture-set.ts` reads them from disk.
 *
 * The ToC cases are `init`'s old `parseTocLectures` tests, on the reader that
 * replaced it. They differ where the reader does: an entry is a lecture only
 * when a `.md` is behind it, and a ToC with no `root` is refused.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LectureSetError } from '../../lecture-set.js';
import { BULK_TOC_HINT, readBulkLectures, readRepoLectures } from '../lecture-discovery.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lecture-discovery-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

/** A source repository whose docs folder holds `toc` and a `# title` page for each of `files`. */
function writeSource(toc: string, files: string[], docsFolder = 'lectures'): string {
  const source = path.join(tmpDir, 'source');
  writeFile(path.join(source, docsFolder, '_toc.yml'), toc);
  for (const file of files) {
    writeFile(path.join(source, docsFolder, file), `# ${file}\n`);
  }
  return source;
}

async function lecturesOf(source: string, docsFolder = 'lectures'): Promise<string[]> {
  return (await readRepoLectures(source, docsFolder, 'SOURCE')).lectures;
}

describe('readRepoLectures: the ToC documents, in order', () => {
  it('reads chapters from _toc.yml', async () => {
    const source = writeSource(
      'format: jb-book\nroot: intro\nchapters:\n  - file: getting_started\n  - file: cobweb\n  - file: solow\n',
      ['intro.md', 'getting_started.md', 'cobweb.md', 'solow.md']
    );

    expect(await lecturesOf(source)).toEqual([
      'intro.md',
      'getting_started.md',
      'cobweb.md',
      'solow.md',
    ]);
  });

  it('reads parts with chapters', async () => {
    const source = writeSource(
      'format: jb-book\nroot: intro\nparts:\n  - caption: Part 1\n    chapters:\n      - file: chapter1\n' +
        '      - file: chapter2\n  - caption: Part 2\n    chapters:\n      - file: chapter3\n',
      ['intro.md', 'chapter1.md', 'chapter2.md', 'chapter3.md']
    );

    expect(await lecturesOf(source)).toEqual([
      'intro.md',
      'chapter1.md',
      'chapter2.md',
      'chapter3.md',
    ]);
  });

  it('reads nested sections, at any depth, the root first', async () => {
    const source = writeSource(
      'format: jb-book\nroot: intro\nchapters:\n  - file: top\n    sections:\n      - file: mid\n' +
        '        sections:\n          - file: deep\n  - file: alpha\n',
      ['intro.md', 'top.md', 'mid.md', 'deep.md', 'alpha.md']
    );

    expect(await lecturesOf(source)).toEqual([
      'intro.md',
      'top.md',
      'mid.md',
      'deep.md',
      'alpha.md',
    ]);
  });

  it("reads a jb-article's root-level sections", async () => {
    const source = writeSource(
      'format: jb-article\nroot: intro\nsections:\n  - file: one\n  - file: two\n',
      ['intro.md', 'one.md', 'two.md']
    );

    expect(await lecturesOf(source)).toEqual(['intro.md', 'one.md', 'two.md']);
  });

  it('reads a custom docs folder', async () => {
    const source = writeSource('format: jb-book\nroot: page1\n', ['page1.md'], 'docs');

    expect(await lecturesOf(source, 'docs')).toEqual(['page1.md']);
  });

  it('reads an empty chapters list', async () => {
    const source = writeSource('format: jb-book\nroot: intro\nchapters: []\n', ['intro.md']);

    expect(await lecturesOf(source)).toEqual(['intro.md']);
  });

  it('takes an entry with or without its .md, never doubling it', async () => {
    const source = writeSource(
      'format: jb-book\nroot: intro.md\nchapters:\n  - file: chapter1.md\n  - file: chapter2\n',
      ['intro.md', 'chapter1.md', 'chapter2.md']
    );

    expect(await lecturesOf(source)).toEqual(['intro.md', 'chapter1.md', 'chapter2.md']);
  });

  it('leaves out an entry backed by a notebook, rather than naming a .ipynb.md', async () => {
    const source = writeSource(
      'format: jb-book\nroot: intro\nchapters:\n  - file: nb.ipynb\n  - file: other_nb\n',
      ['intro.md', 'nb.ipynb', 'other_nb.ipynb']
    );

    const { lectures, set } = await readRepoLectures(source, 'lectures', 'SOURCE');

    expect(lectures).toEqual(['intro.md']);
    expect(set.otherDocuments).toEqual(['nb.ipynb', 'other_nb.ipynb']);
  });

  it('leaves out an entry with no file behind it, and reports it', async () => {
    const source = writeSource('format: jb-book\nroot: index\nchapters:\n  - file: cobweb\n', [
      'cobweb.md',
    ]);

    const { lectures, set } = await readRepoLectures(source, 'lectures', 'SOURCE');

    expect(lectures).toEqual(['cobweb.md']);
    expect(set.missingEntries).toEqual(['index']);
  });
});

describe('readRepoLectures: the files the documents include', () => {
  const GPU = '```{admonition} GPU\n:class: warning\n\nThis lecture was built with a GPU.\n```\n';

  it('puts the included files after the documents, by their docs-relative path', async () => {
    const source = writeSource('format: jb-book\nroot: intro\nchapters:\n  - file: jv\n', [
      'intro.md',
    ]);
    const docs = path.join(source, 'lectures');
    writeFile(path.join(docs, 'jv.md'), '# Job Search\n\n```{include} _admonition/gpu.md\n```\n');
    writeFile(path.join(docs, '_admonition', 'gpu.md'), GPU);
    writeFile(path.join(docs, 'README.md'), '# Lectures\n');
    writeFile(path.join(docs, 'draft.md'), '# A draft\n');

    const { lectures, markdownFiles } = await readRepoLectures(source, 'lectures', 'SOURCE');

    expect(lectures).toEqual(['intro.md', 'jv.md', '_admonition/gpu.md']);
    // Every .md is listed beside the set, in it or not
    expect(markdownFiles).toEqual([
      'README.md',
      '_admonition/gpu.md',
      'draft.md',
      'intro.md',
      'jv.md',
    ]);
  });

  it('lists only .md files beside the set, skipping build output and dot-folders', async () => {
    const source = writeSource('format: jb-book\nroot: intro\n', ['intro.md']);
    const docs = path.join(source, 'lectures');
    writeFile(path.join(docs, 'data.csv'), 'x,y\n1,2\n');
    writeFile(path.join(docs, '_build', 'html', 'built.md'), 'x');
    writeFile(path.join(docs, '.ipynb_checkpoints', 'intro-checkpoint.md'), 'x');

    const { markdownFiles } = await readRepoLectures(source, 'lectures', 'SOURCE');

    expect(markdownFiles).toEqual(['intro.md']);
  });
});

describe('readRepoLectures: no lecture set', () => {
  it('refuses a docs folder with no _toc.yml, naming the repository and the folder', async () => {
    const source = path.join(tmpDir, 'source');
    writeFile(path.join(source, 'lectures', 'intro.md'), '# Intro\n');

    await expect(readRepoLectures(source, 'lectures', 'SOURCE')).rejects.toThrow(
      new LectureSetError(
        `SOURCE ${path.join(source, 'lectures')}: the docs folder has no _toc.yml or myst.yml, ` +
          'so it has no lecture set'
      )
    );
  });

  it('names the folder once when it does not exist', async () => {
    const missing = path.join(tmpDir, 'nowhere');

    await expect(readRepoLectures(missing, 'lectures', 'TARGET')).rejects.toThrow(
      `TARGET: the docs folder ${path.join(missing, 'lectures')} does not exist`
    );
  });

  it('refuses YAML it cannot parse, an empty ToC, and one with no root', async () => {
    const source = writeSource(
      'format: jb-book\nchapters:\n  - file: intro\n  bad indentation\n  : broken\n',
      []
    );
    await expect(lecturesOf(source)).rejects.toThrow(/_toc\.yml is not valid YAML/);

    writeSource('', []);
    await expect(lecturesOf(source)).rejects.toThrow(/_toc\.yml is empty or not a YAML mapping/);

    // The old parser read this as its chapters alone; the reader refuses it (#449)
    writeSource('format: jb-book\nchapters:\n  - file: only_chapter\n', ['only_chapter.md']);
    await expect(lecturesOf(source)).rejects.toThrow(/_toc\.yml has no root/);
  });

  it('adds a hint, on its own line, when the caller gives one', async () => {
    const source = path.join(tmpDir, 'source');
    fs.mkdirSync(path.join(source, 'lectures'), { recursive: true });

    await expect(readRepoLectures(source, 'lectures', 'SOURCE', 'Try -f.')).rejects.toThrow(
      /so it has no lecture set\nTry -f\.$/
    );
  });
});

describe('readBulkLectures', () => {
  it("reads the source's set, then the edition's own", async () => {
    const source = writeSource('format: jb-book\nroot: intro\nchapters:\n  - file: cobweb\n', [
      'intro.md',
      'cobweb.md',
    ]);
    const target = path.join(tmpDir, 'target');
    // The edition's mirrored ToC lists a lecture it has not translated
    writeFile(
      path.join(target, 'lectures', '_toc.yml'),
      'format: jb-book\nroot: intro\nchapters:\n  - file: cobweb\n'
    );
    writeFile(path.join(target, 'lectures', 'intro.md'), '# 介绍\n');

    const both = await readBulkLectures(source, target, 'lectures');

    expect(both.source.lectures).toEqual(['intro.md', 'cobweb.md']);
    expect(both.target.lectures).toEqual(['intro.md']);
    expect(both.target.set.missingEntries).toEqual(['cobweb']);
  });

  it('refuses an edition with no _toc.yml, with the bulk hint', async () => {
    const source = writeSource('format: jb-book\nroot: intro\n', ['intro.md']);
    const target = path.join(tmpDir, 'target');
    writeFile(path.join(target, 'lectures', 'intro.md'), '# 介绍\n');

    await expect(readBulkLectures(source, target, 'lectures')).rejects.toThrow(
      `TARGET ${path.join(target, 'lectures')}: the docs folder has no _toc.yml or myst.yml, so ` +
        `it has no lecture set\n${BULK_TOC_HINT}`
    );
  });
});

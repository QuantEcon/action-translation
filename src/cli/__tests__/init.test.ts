/**
 * Tests for the init command — bulk project translation
 *
 * Tests the pure functions: parseTocLectures, copyNonMarkdownFiles.
 * Uses temporary directories, no LLM calls.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseTocLectures, copyNonMarkdownFiles } from '../commands/init.js';

// ============================================================================
// HELPERS
// ============================================================================

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'init-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

// ============================================================================
// parseTocLectures
// ============================================================================

describe('parseTocLectures', () => {
  it('should parse chapters from _toc.yml', () => {
    const sourceDir = path.join(tmpDir, 'source');
    writeFile(path.join(sourceDir, 'lectures', '_toc.yml'), `
format: jb-book
root: intro
chapters:
  - file: getting_started
  - file: cobweb
  - file: solow
`);

    const lectures = parseTocLectures(sourceDir, 'lectures');
    expect(lectures).toEqual([
      'intro.md',
      'getting_started.md',
      'cobweb.md',
      'solow.md',
    ]);
  });

  it('should parse parts with chapters', () => {
    const sourceDir = path.join(tmpDir, 'source');
    writeFile(path.join(sourceDir, 'lectures', '_toc.yml'), `
format: jb-book
root: intro
parts:
  - caption: Part 1
    chapters:
      - file: chapter1
      - file: chapter2
  - caption: Part 2
    chapters:
      - file: chapter3
`);

    const lectures = parseTocLectures(sourceDir, 'lectures');
    expect(lectures).toEqual([
      'intro.md',
      'chapter1.md',
      'chapter2.md',
      'chapter3.md',
    ]);
  });

  it('should parse nested sections within chapters', () => {
    const sourceDir = path.join(tmpDir, 'source');
    writeFile(path.join(sourceDir, 'lectures', '_toc.yml'), `
format: jb-book
root: intro
chapters:
  - file: main
    sections:
      - file: sub1
      - file: sub2
`);

    const lectures = parseTocLectures(sourceDir, 'lectures');
    expect(lectures).toEqual([
      'intro.md',
      'main.md',
      'sub1.md',
      'sub2.md',
    ]);
  });

  it('should place root file first', () => {
    const sourceDir = path.join(tmpDir, 'source');
    writeFile(path.join(sourceDir, 'lectures', '_toc.yml'), `
format: jb-book
root: intro
chapters:
  - file: alpha
`);

    const lectures = parseTocLectures(sourceDir, 'lectures');
    expect(lectures[0]).toBe('intro.md');
    expect(lectures[1]).toBe('alpha.md');
  });

  it('should work without root', () => {
    const sourceDir = path.join(tmpDir, 'source');
    writeFile(path.join(sourceDir, 'lectures', '_toc.yml'), `
format: jb-book
chapters:
  - file: only_chapter
`);

    const lectures = parseTocLectures(sourceDir, 'lectures');
    expect(lectures).toEqual(['only_chapter.md']);
  });

  it('should throw if _toc.yml is missing', () => {
    const sourceDir = path.join(tmpDir, 'source');
    fs.mkdirSync(path.join(sourceDir, 'lectures'), { recursive: true });

    expect(() => parseTocLectures(sourceDir, 'lectures')).toThrow('_toc.yml not found');
  });

  it('should handle custom docs folder', () => {
    const sourceDir = path.join(tmpDir, 'source');
    writeFile(path.join(sourceDir, 'docs', '_toc.yml'), `
format: jb-book
chapters:
  - file: page1
`);

    const lectures = parseTocLectures(sourceDir, 'docs');
    expect(lectures).toEqual(['page1.md']);
  });

  it('should handle empty chapters list', () => {
    const sourceDir = path.join(tmpDir, 'source');
    writeFile(path.join(sourceDir, 'lectures', '_toc.yml'), `
format: jb-book
root: intro
chapters: []
`);

    const lectures = parseTocLectures(sourceDir, 'lectures');
    expect(lectures).toEqual(['intro.md']);
  });

  it('should handle deeply nested sections', () => {
    const sourceDir = path.join(tmpDir, 'source');
    writeFile(path.join(sourceDir, 'lectures', '_toc.yml'), `
format: jb-book
chapters:
  - file: top
    sections:
      - file: mid
        sections:
          - file: deep
`);

    const lectures = parseTocLectures(sourceDir, 'lectures');
    expect(lectures).toEqual(['top.md', 'mid.md', 'deep.md']);
  });

  it('should not double-append .md if entry already has extension', () => {
    const sourceDir = path.join(tmpDir, 'source');
    writeFile(path.join(sourceDir, 'lectures', '_toc.yml'), `
format: jb-book
root: intro.md
chapters:
  - file: chapter1.md
  - file: chapter2
`);

    const lectures = parseTocLectures(sourceDir, 'lectures');
    expect(lectures).toEqual(['intro.md', 'chapter1.md', 'chapter2.md']);
  });
});

// ============================================================================
// copyNonMarkdownFiles
// ============================================================================

describe('copyNonMarkdownFiles', () => {
  it('should copy non-md files preserving directory structure', () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');

    writeFile(path.join(sourceDir, 'lectures', '_config.yml'), 'title: Test');
    writeFile(path.join(sourceDir, 'lectures', '_toc.yml'), 'format: jb-book');
    writeFile(path.join(sourceDir, 'lectures', 'images', 'fig1.png'), 'PNG_DATA');
    writeFile(path.join(sourceDir, 'lectures', 'skip.md'), '# Skip me');

    const count = copyNonMarkdownFiles(sourceDir, targetDir, 'lectures');

    expect(count).toBe(3);
    expect(fs.existsSync(path.join(targetDir, 'lectures', '_config.yml'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'lectures', '_toc.yml'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'lectures', 'images', 'fig1.png'))).toBe(true);
    // .md files should NOT be copied
    expect(fs.existsSync(path.join(targetDir, 'lectures', 'skip.md'))).toBe(false);
  });

  it('should skip .git entries', () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');

    writeFile(path.join(sourceDir, 'lectures', '.git', 'config'), 'git stuff');
    writeFile(path.join(sourceDir, 'lectures', '.gitignore'), 'node_modules');
    writeFile(path.join(sourceDir, 'lectures', 'data.csv'), 'a,b,c');

    const count = copyNonMarkdownFiles(sourceDir, targetDir, 'lectures');

    // .git dir and .gitignore are both skipped (startsWith('.git'))
    expect(count).toBe(1);
    expect(fs.existsSync(path.join(targetDir, 'lectures', '.git', 'config'))).toBe(false);
    expect(fs.existsSync(path.join(targetDir, 'lectures', '.gitignore'))).toBe(false);
    expect(fs.existsSync(path.join(targetDir, 'lectures', 'data.csv'))).toBe(true);
  });

  it('should return 0 if source docs folder does not exist', () => {
    const sourceDir = path.join(tmpDir, 'missing');
    const targetDir = path.join(tmpDir, 'target');

    const count = copyNonMarkdownFiles(sourceDir, targetDir, 'lectures');
    expect(count).toBe(0);
  });

  it('should handle nested subdirectories', () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');

    writeFile(path.join(sourceDir, 'lectures', 'a', 'b', 'c', 'deep.json'), '{}');

    const count = copyNonMarkdownFiles(sourceDir, targetDir, 'lectures');

    expect(count).toBe(1);
    expect(fs.existsSync(path.join(targetDir, 'lectures', 'a', 'b', 'c', 'deep.json'))).toBe(true);
  });

  it('should handle empty docs folder', () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');

    fs.mkdirSync(path.join(sourceDir, 'lectures'), { recursive: true });

    const count = copyNonMarkdownFiles(sourceDir, targetDir, 'lectures');
    expect(count).toBe(0);
  });

  it('should copy various file types', () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');

    writeFile(path.join(sourceDir, 'lectures', 'style.css'), 'body {}');
    writeFile(path.join(sourceDir, 'lectures', 'data.csv'), '1,2,3');
    writeFile(path.join(sourceDir, 'lectures', 'script.py'), 'print("hi")');
    writeFile(path.join(sourceDir, 'lectures', 'config.json'), '{}');

    const count = copyNonMarkdownFiles(sourceDir, targetDir, 'lectures');

    expect(count).toBe(4);
    expect(fs.readFileSync(path.join(targetDir, 'lectures', 'style.css'), 'utf-8')).toBe('body {}');
    expect(fs.readFileSync(path.join(targetDir, 'lectures', 'data.csv'), 'utf-8')).toBe('1,2,3');
  });

  it('should preserve file content exactly', () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');

    const content = 'line1\nline2\nline3\n';
    writeFile(path.join(sourceDir, 'lectures', 'data.txt'), content);

    copyNonMarkdownFiles(sourceDir, targetDir, 'lectures');

    const result = fs.readFileSync(path.join(targetDir, 'lectures', 'data.txt'), 'utf-8');
    expect(result).toBe(content);
  });

  it('should skip symbolic links', () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');

    // Create a real file and a symlink
    writeFile(path.join(sourceDir, 'lectures', 'real.txt'), 'real');
    writeFile(path.join(tmpDir, 'outside.txt'), 'outside');
    fs.symlinkSync(
      path.join(tmpDir, 'outside.txt'),
      path.join(sourceDir, 'lectures', 'link.txt'),
    );

    const count = copyNonMarkdownFiles(sourceDir, targetDir, 'lectures');

    expect(count).toBe(1); // Only real.txt
    expect(fs.existsSync(path.join(targetDir, 'lectures', 'real.txt'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'lectures', 'link.txt'))).toBe(false);
  });
});

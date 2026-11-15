/**
 * Tests for the init command — bulk project translation
 *
 * Tests the pure functions: parseTocLectures, copyNonMarkdownFiles, checkEditionConfig.
 * Uses temporary directories, no LLM calls.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  EditionFlags,
  checkEditionConfig,
  copyNonMarkdownFiles,
  filterSkipExisting,
  parseTocLectures,
  planNonMarkdownCopy,
  writeStateCommand,
} from '../commands/init.js';
import { writeFileState } from '../translate-state.js';

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
    writeFile(
      path.join(sourceDir, 'lectures', '_toc.yml'),
      `
format: jb-book
root: intro
chapters:
  - file: getting_started
  - file: cobweb
  - file: solow
`
    );

    const lectures = parseTocLectures(sourceDir, 'lectures');
    expect(lectures).toEqual(['intro.md', 'getting_started.md', 'cobweb.md', 'solow.md']);
  });

  it('should parse parts with chapters', () => {
    const sourceDir = path.join(tmpDir, 'source');
    writeFile(
      path.join(sourceDir, 'lectures', '_toc.yml'),
      `
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
`
    );

    const lectures = parseTocLectures(sourceDir, 'lectures');
    expect(lectures).toEqual(['intro.md', 'chapter1.md', 'chapter2.md', 'chapter3.md']);
  });

  it('should parse nested sections within chapters', () => {
    const sourceDir = path.join(tmpDir, 'source');
    writeFile(
      path.join(sourceDir, 'lectures', '_toc.yml'),
      `
format: jb-book
root: intro
chapters:
  - file: main
    sections:
      - file: sub1
      - file: sub2
`
    );

    const lectures = parseTocLectures(sourceDir, 'lectures');
    expect(lectures).toEqual(['intro.md', 'main.md', 'sub1.md', 'sub2.md']);
  });

  it('should place root file first', () => {
    const sourceDir = path.join(tmpDir, 'source');
    writeFile(
      path.join(sourceDir, 'lectures', '_toc.yml'),
      `
format: jb-book
root: intro
chapters:
  - file: alpha
`
    );

    const lectures = parseTocLectures(sourceDir, 'lectures');
    expect(lectures[0]).toBe('intro.md');
    expect(lectures[1]).toBe('alpha.md');
  });

  it('should work without root', () => {
    const sourceDir = path.join(tmpDir, 'source');
    writeFile(
      path.join(sourceDir, 'lectures', '_toc.yml'),
      `
format: jb-book
chapters:
  - file: only_chapter
`
    );

    const lectures = parseTocLectures(sourceDir, 'lectures');
    expect(lectures).toEqual(['only_chapter.md']);
  });

  it('should throw if _toc.yml is missing', () => {
    const sourceDir = path.join(tmpDir, 'source');
    fs.mkdirSync(path.join(sourceDir, 'lectures'), { recursive: true });

    expect(() => parseTocLectures(sourceDir, 'lectures')).toThrow('_toc.yml not found');
  });

  it('should throw with details on malformed YAML', () => {
    const sourceDir = path.join(tmpDir, 'source');
    writeFile(
      path.join(sourceDir, 'lectures', '_toc.yml'),
      `
format: jb-book
chapters:
  - file: intro
  bad indentation here
  : broken
`
    );
    expect(() => parseTocLectures(sourceDir, 'lectures')).toThrow(/Malformed _toc\.yml/);
  });

  it('should throw if _toc.yml is empty', () => {
    const sourceDir = path.join(tmpDir, 'source');
    writeFile(path.join(sourceDir, 'lectures', '_toc.yml'), '');
    expect(() => parseTocLectures(sourceDir, 'lectures')).toThrow(/empty or not a valid YAML/);
  });

  it('should handle custom docs folder', () => {
    const sourceDir = path.join(tmpDir, 'source');
    writeFile(
      path.join(sourceDir, 'docs', '_toc.yml'),
      `
format: jb-book
chapters:
  - file: page1
`
    );

    const lectures = parseTocLectures(sourceDir, 'docs');
    expect(lectures).toEqual(['page1.md']);
  });

  it('should handle empty chapters list', () => {
    const sourceDir = path.join(tmpDir, 'source');
    writeFile(
      path.join(sourceDir, 'lectures', '_toc.yml'),
      `
format: jb-book
root: intro
chapters: []
`
    );

    const lectures = parseTocLectures(sourceDir, 'lectures');
    expect(lectures).toEqual(['intro.md']);
  });

  it('should handle deeply nested sections', () => {
    const sourceDir = path.join(tmpDir, 'source');
    writeFile(
      path.join(sourceDir, 'lectures', '_toc.yml'),
      `
format: jb-book
chapters:
  - file: top
    sections:
      - file: mid
        sections:
          - file: deep
`
    );

    const lectures = parseTocLectures(sourceDir, 'lectures');
    expect(lectures).toEqual(['top.md', 'mid.md', 'deep.md']);
  });

  it('should not double-append .md if entry already has extension', () => {
    const sourceDir = path.join(tmpDir, 'source');
    writeFile(
      path.join(sourceDir, 'lectures', '_toc.yml'),
      `
format: jb-book
root: intro.md
chapters:
  - file: chapter1.md
  - file: chapter2
`
    );

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

    const { copied: count } = copyNonMarkdownFiles(sourceDir, targetDir, 'lectures');

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

    const { copied: count } = copyNonMarkdownFiles(sourceDir, targetDir, 'lectures');

    // .git dir and .gitignore are both skipped (startsWith('.git'))
    expect(count).toBe(1);
    expect(fs.existsSync(path.join(targetDir, 'lectures', '.git', 'config'))).toBe(false);
    expect(fs.existsSync(path.join(targetDir, 'lectures', '.gitignore'))).toBe(false);
    expect(fs.existsSync(path.join(targetDir, 'lectures', 'data.csv'))).toBe(true);
  });

  it('should return 0 if source docs folder does not exist', () => {
    const sourceDir = path.join(tmpDir, 'missing');
    const targetDir = path.join(tmpDir, 'target');

    const { copied: count } = copyNonMarkdownFiles(sourceDir, targetDir, 'lectures');
    expect(count).toBe(0);
  });

  it('should handle nested subdirectories', () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');

    writeFile(path.join(sourceDir, 'lectures', 'a', 'b', 'c', 'deep.json'), '{}');

    const { copied: count } = copyNonMarkdownFiles(sourceDir, targetDir, 'lectures');

    expect(count).toBe(1);
    expect(fs.existsSync(path.join(targetDir, 'lectures', 'a', 'b', 'c', 'deep.json'))).toBe(true);
  });

  it('should handle empty docs folder', () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');

    fs.mkdirSync(path.join(sourceDir, 'lectures'), { recursive: true });

    const { copied: count } = copyNonMarkdownFiles(sourceDir, targetDir, 'lectures');
    expect(count).toBe(0);
  });

  it('should copy various file types', () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');

    writeFile(path.join(sourceDir, 'lectures', 'style.css'), 'body {}');
    writeFile(path.join(sourceDir, 'lectures', 'data.csv'), '1,2,3');
    writeFile(path.join(sourceDir, 'lectures', 'script.py'), 'print("hi")');
    writeFile(path.join(sourceDir, 'lectures', 'config.json'), '{}');

    const { copied: count } = copyNonMarkdownFiles(sourceDir, targetDir, 'lectures');

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
    fs.symlinkSync(path.join(tmpDir, 'outside.txt'), path.join(sourceDir, 'lectures', 'link.txt'));

    const { copied: count } = copyNonMarkdownFiles(sourceDir, targetDir, 'lectures');

    expect(count).toBe(1); // Only real.txt
    expect(fs.existsSync(path.join(targetDir, 'lectures', 'real.txt'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'lectures', 'link.txt'))).toBe(false);
  });

  // An existing edition's copies are usually localised (#134).
  it('never overwrites a file the edition already has, and counts it as kept', () => {
    const sourceDir = path.join(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target');
    writeFile(path.join(sourceDir, 'lectures', '_toc.yml'), 'caption: Lectures');
    writeFile(path.join(sourceDir, 'lectures', 'images', 'fig1.png'), 'ENGLISH');
    writeFile(path.join(sourceDir, 'lectures', 'images', 'fig2.png'), 'NEW');
    writeFile(path.join(targetDir, 'lectures', '_toc.yml'), 'caption: 讲座');
    writeFile(path.join(targetDir, 'lectures', 'images', 'fig1.png'), 'LOCALISED');
    // A dangling link is something at the path too: copying would write through it.
    fs.symlinkSync(path.join(tmpDir, 'nowhere.css'), path.join(targetDir, 'lectures', 'style.css'));
    writeFile(path.join(sourceDir, 'lectures', 'style.css'), 'body {}');

    expect(planNonMarkdownCopy(sourceDir, targetDir, 'lectures')).toEqual({
      copy: [path.join('images', 'fig2.png')],
      keep: expect.arrayContaining(['_toc.yml', path.join('images', 'fig1.png'), 'style.css']),
    });
    expect(copyNonMarkdownFiles(sourceDir, targetDir, 'lectures')).toEqual({ copied: 1, kept: 3 });

    const read = (rel: string) => fs.readFileSync(path.join(targetDir, 'lectures', rel), 'utf-8');
    expect(read('_toc.yml')).toBe('caption: 讲座');
    expect(read(path.join('images', 'fig1.png'))).toBe('LOCALISED');
    expect(read(path.join('images', 'fig2.png'))).toBe('NEW');
    expect(fs.existsSync(path.join(tmpDir, 'nowhere.css'))).toBe(false);
  });
});

// ============================================================================
// checkEditionConfig
// ============================================================================

describe('checkEditionConfig (#134)', () => {
  const wanted = {
    'source-language': 'en',
    'target-language': 'zh-cn',
    'docs-folder': 'lectures',
  };
  const writeConfigFile = (content: string): string => {
    const targetDir = path.join(tmpDir, 'target');
    writeFile(path.join(targetDir, '.translate', 'config.yml'), content);
    return targetDir;
  };

  it('reports a missing config as absent', () => {
    expect(checkEditionConfig(path.join(tmpDir, 'nothing-here'), wanted)).toBe('absent');
  });

  it.each(['lectures', 'lectures/', './lectures'])(
    'matches a config whose docs-folder is written %s',
    (folder) => {
      const targetDir = writeConfigFile(
        `source-language: en\ntarget-language: zh-cn\ndocs-folder: ${folder}\n`
      );
      expect(checkEditionConfig(targetDir, wanted)).toBe('matches');
    }
  );

  it("matches '.' with '', both the repository root", () => {
    const targetDir = writeConfigFile(
      `source-language: en\ntarget-language: zh-cn\ndocs-folder: ''\n`
    );
    expect(checkEditionConfig(targetDir, { ...wanted, 'docs-folder': '.' })).toBe('matches');
  });

  it('names every key that differs, a missing one included, with both values', () => {
    const targetDir = writeConfigFile('source-language: en\ntarget-language: fa\n');
    expect(() => checkEditionConfig(targetDir, wanted)).toThrow(
      'target-language: the config has "fa", and this run\'s --target-language is "zh-cn"\n' +
        '  docs-folder: the config has no value, and this run\'s -d is "lectures"'
    );
  });

  it.each(['', '# routing notes, keys to follow\n'])(
    'reads an empty or comment-only config (%j) as one with no keys, and names each',
    (content) => {
      const targetDir = writeConfigFile(content);
      expect(() => checkEditionConfig(targetDir, wanted)).toThrow(
        /source-language: the config has no value.*\n.*target-language: the config has no value.*\n.*docs-folder: the config has no value/
      );
    }
  );

  it('shows a value that is not text as YAML read it', () => {
    const targetDir = writeConfigFile(
      'source-language: en\ntarget-language: zh-cn\ndocs-folder: 5\n'
    );
    expect(() => checkEditionConfig(targetDir, wanted)).toThrow(
      'docs-folder: the config has 5, and this run\'s -d is "lectures"'
    );
  });

  it('refuses a config that is not YAML, or not a mapping', () => {
    expect(() => checkEditionConfig(writeConfigFile('a: [unclosed\n'), wanted)).toThrow(
      /config\.yml is not valid YAML \(.*\): fix or remove it, then re-run\.$/
    );
    expect(() => checkEditionConfig(writeConfigFile('- a\n- b\n'), wanted)).toThrow(
      /config\.yml is not a YAML mapping: fix or remove it, then re-run\.$/
    );
  });
});

// ============================================================================
// filterSkipExisting
// ============================================================================

describe('filterSkipExisting', () => {
  const VALID_STATE = [
    'source-sha: abc1234',
    'synced-at: "2026-10-01"',
    'model: claude-sonnet-5',
    'mode: NEW',
    'section-count: 1',
    '',
  ].join('\n');

  const editionAt = (targetDir: string): EditionFlags => ({
    source: '/repos/source',
    target: targetDir,
    targetLanguage: 'fa',
    sourceLanguage: 'en',
    docsFolder: 'lectures',
  });

  /** An edition with one reviewed lecture and the given state file text. */
  function editionWith(lecture: string, stateText?: string): string {
    const targetDir = path.join(tmpDir, 'target');
    writeFile(path.join(targetDir, 'lectures', lecture), '# Reviewed\n');
    if (stateText !== undefined) {
      writeFile(path.join(targetDir, '.translate', 'state', `${lecture}.yml`), stateText);
    }
    return targetDir;
  }

  // #379: each of these was translated again, over the edition's lecture.
  it.each([
    ['no model key', VALID_STATE.replace('model: claude-sonnet-5\n', ''), '`model` is missing'],
    [
      'a quoted section count',
      VALID_STATE.replace('section-count: 1', 'section-count: "1"'),
      '`section-count` is a string, not a number',
    ],
    [
      'an all-digit source-sha',
      VALID_STATE.replace('abc1234', '1111111'),
      '`source-sha` is a number, not a string: quote it',
    ],
    ['text that is not YAML', '{{{ not yaml', 'could not be read as YAML'],
  ])('skips a lecture whose state file has %s, and says why', (_name, stateText, reason) => {
    const targetDir = editionWith('cobweb.md', stateText);

    const result = filterSkipExisting(editionAt(targetDir), ['cobweb.md']);

    expect(result.remaining).toEqual([]);
    expect(result.skipped).toEqual(['cobweb.md']);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('cobweb.md: skipped');
    expect(result.warnings[0]).toContain(reason);
  });

  it('skips a lecture with an unquoted synced-at date, with no warning (#381)', () => {
    const targetDir = editionWith('cobweb.md', VALID_STATE.replace('"2026-10-01"', '2026-10-01'));

    const result = filterSkipExisting(editionAt(targetDir), ['cobweb.md']);

    expect(result.remaining).toEqual([]);
    expect(result.skippedCount).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it('skips a lecture the edition has without a state file, with a warning', () => {
    const targetDir = editionWith('pandas.md');

    const result = filterSkipExisting(editionAt(targetDir), ['pandas.md']);

    expect(result.remaining).toEqual([]);
    expect(result.skipped).toEqual(['pandas.md']);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('no .translate/state/pandas.md.yml');
    expect(result.warnings[0]).toContain('does not overwrite');
    // The edition's own flags: a bare `status --write-state` would reset its config to zh-cn.
    expect(result.warnings[0]).toContain(
      `\`translate status -s /repos/source -t ${targetDir} -l fa -d lectures -f pandas.md --write-state\``
    );
  });

  it('translates a lecture whose state file has no lecture beside it, with a warning', () => {
    const targetDir = path.join(tmpDir, 'target');
    writeFile(path.join(targetDir, '.translate', 'state', 'gone.md.yml'), VALID_STATE);

    const result = filterSkipExisting(editionAt(targetDir), ['gone.md']);

    expect(result.remaining).toEqual(['gone.md']);
    expect(result.skippedCount).toBe(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('the edition has no gone.md');
  });

  it('reads a lecture in a docs subfolder at its own state path', () => {
    const targetDir = editionWith('advanced/cobweb.md', VALID_STATE);

    const result = filterSkipExisting(editionAt(targetDir), ['advanced/cobweb.md']);

    expect(result.skipped).toEqual(['advanced/cobweb.md']);
    expect(result.warnings).toEqual([]);
  });

  it('should skip lectures that have .translate/state entries', () => {
    const targetDir = path.join(tmpDir, 'target');
    fs.mkdirSync(targetDir, { recursive: true });
    writeFile(path.join(targetDir, 'lectures', 'cobweb.md'), '# Cobweb\n');
    writeFile(path.join(targetDir, 'lectures', 'solow.md'), '# Solow\n');

    // Create state for two of three lectures
    writeFileState(targetDir, 'cobweb.md', {
      'source-sha': 'abc123',
      'synced-at': '2026-03-20',
      model: 'claude-sonnet-4-6',
      mode: 'NEW',
      'section-count': 5,
    });
    writeFileState(targetDir, 'solow.md', {
      'source-sha': 'def456',
      'synced-at': '2026-03-20',
      model: 'claude-sonnet-4-6',
      mode: 'NEW',
      'section-count': 3,
    });

    const result = filterSkipExisting(editionAt(targetDir), [
      'intro.md',
      'cobweb.md',
      'solow.md',
      'lake_model.md',
    ]);

    expect(result.skippedCount).toBe(2);
    expect(result.remaining).toEqual(['intro.md', 'lake_model.md']);
    expect(result.warnings).toEqual([]);
  });

  it('should return all lectures when none have state', () => {
    const targetDir = path.join(tmpDir, 'target');
    fs.mkdirSync(targetDir, { recursive: true });

    const lectures = ['intro.md', 'cobweb.md'];
    const result = filterSkipExisting(editionAt(targetDir), lectures);

    expect(result.skippedCount).toBe(0);
    expect(result.remaining).toEqual(['intro.md', 'cobweb.md']);
  });

  it('should return empty when all lectures have state', () => {
    const targetDir = path.join(tmpDir, 'target');
    fs.mkdirSync(targetDir, { recursive: true });
    writeFile(path.join(targetDir, 'lectures', 'intro.md'), '# Intro\n');

    writeFileState(targetDir, 'intro.md', {
      'source-sha': 'aaa',
      'synced-at': '2026-03-20',
      model: 'claude-sonnet-4-6',
      mode: 'NEW',
      'section-count': 1,
    });

    const result = filterSkipExisting(editionAt(targetDir), ['intro.md']);

    expect(result.skippedCount).toBe(1);
    expect(result.remaining).toEqual([]);
  });
});

// ============================================================================
// writeStateCommand
// ============================================================================

describe('writeStateCommand', () => {
  const edition: EditionFlags = {
    source: '/repos/lecture-python-intro',
    target: '/repos/lecture-python-intro.fa',
    targetLanguage: 'fa',
    sourceLanguage: 'en',
    docsFolder: 'lectures',
  };

  it("names the edition's own language and docs folder, since status reads no config", () => {
    expect(writeStateCommand(edition, 'cobweb.md')).toBe(
      'translate status -s /repos/lecture-python-intro -t /repos/lecture-python-intro.fa ' +
        '-l fa -d lectures -f cobweb.md --write-state'
    );
  });

  it('adds a source language other than en, and quotes what the shell would split', () => {
    expect(
      writeStateCommand(
        { ...edition, target: "/repos/my edition's copy", sourceLanguage: 'fr', docsFolder: '' },
        'cobweb.md'
      )
    ).toBe(
      "translate status -s /repos/lecture-python-intro -t '/repos/my edition'\\''s copy' " +
        "-l fa --source-language fr -d '' -f cobweb.md --write-state"
    );
  });
});

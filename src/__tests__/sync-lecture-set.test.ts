/**
 * Tests for sync on the lecture set (#449): which changed files a sync run
 * treats as lectures, and what it lists beside them.
 *
 * The fake source below answers the tree read and file reads per ref, and
 * records each, so a test states what the source holds at the merge commit
 * and at its parent and checks exactly what was read. The fake edition
 * answers by path. The cases that matter most: a changed `.md` outside the
 * set is left out and listed, never failed; a fragment is found by the
 * include scan, which runs only for a changed file that is not a ToC document
 * and stops at the first includer; a ToC or a file list that cannot be read
 * holds the whole run; a lecture the scan cannot read is an error for the one
 * file it decides; and a ToC change lists the lectures it takes out and those
 * it adds with nothing delivered.
 *
 * `runSync` wires these functions together in `src/index.ts`, which no test
 * can import (#169). src/__tests__/action-sync-scope.test.ts runs that wiring
 * in the built bundle against a fake GitHub API.
 */

import {
  findLectureSetGaps,
  formatLectureSetNotice,
  formatLectureSetSummary,
  githubLectureSetSource,
  LectureSetPlacement,
  LectureSetReport,
  MISSING_INCLUDES_HEADING,
  OUTSIDE_SET_HEADING,
  placeOnLectureSet,
  TOC_ADDED_HEADING,
  TOC_REMOVED_HEADING,
  TreeReader,
} from '../sync-lecture-set.js';
import { buildScopeSummary, ContentReader, ScopedFiles } from '../sync-scope.js';
import { classifyChangedFiles } from '../sync-orchestrator.js';

// =============================================================================
// TEST HELPERS
// =============================================================================

const SOURCE = { owner: 'QuantEcon', repo: 'lecture-python.myst' };
const EDITION = { owner: 'QuantEcon', repo: 'lecture-python.zh-cn' };
const EDITION_NAME = 'QuantEcon/lecture-python.zh-cn';
const DOCS = 'lectures/';
/** The merge commit being synced, and its parent. */
const SHA = 'cafe0000aaaa';
const PARENT = `${SHA}^`;

/** A failed read, shaped like an Octokit HTTP error. */
function httpError(status: number, message = `HTTP ${status}`): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

/** A `_toc.yml` with root `intro` and `stems` as chapters. */
function toc(...stems: string[]): string {
  return `format: jb-book\nroot: intro\nchapters:\n${stems.map((s) => `  - file: ${s}\n`).join('')}`;
}

/** A lecture with a title, and `{include}`s of `targets`. */
function lecture(title: string, ...targets: string[]): string {
  const includes = targets.map((t) => `\n\`\`\`{include} ${t}\n\`\`\`\n`).join('');
  return `# ${title}\n\nText.\n${includes}`;
}

/** A file's answer: its text, or the status its read fails with. */
type Answer = string | { status: number };

/** The source's tree at a ref, when it is not the files `source` holds there. */
type TreeAnswer = { truncated?: boolean; status?: number; extra?: string[] };

/**
 * The source repository: `files[ref][path]` is a file's answer at `ref`, path
 * repo-relative. The tree at a ref lists the files held there, plus a folder
 * entry that is not a file; `trees[ref]` truncates or fails it.
 */
function fakeSource(
  files: Record<string, Record<string, Answer>>,
  trees: Record<string, TreeAnswer> = {}
) {
  const log: string[] = [];
  const getTree = jest.fn(async (params: { tree_sha: string; recursive?: string }) => {
    log.push(`tree ${params.tree_sha}`);
    const answer = trees[params.tree_sha] ?? {};
    if (answer.status) throw httpError(answer.status);
    const held = Object.keys(files[params.tree_sha] ?? {});
    return {
      data: {
        tree: [
          { path: 'lectures', type: 'tree' },
          ...[...held, ...(answer.extra ?? [])].map((path) => ({ path, type: 'blob' })),
        ],
        truncated: answer.truncated ?? false,
      },
    };
  });
  const client: TreeReader = { rest: { git: { getTree } } };
  const read = jest.fn(async (path: string, ref: string) => {
    log.push(`read ${path}@${ref}`);
    const answer = files[ref]?.[path];
    if (answer === undefined) throw httpError(404, 'Not Found');
    if (typeof answer === 'object') throw httpError(answer.status);
    return answer;
  });
  /** Every request, in order: `tree <ref>` or `read <path>@<ref>`. */
  const requests = (): string[] => [...log];
  /** The files read, as `<path>@<ref>`. */
  const reads = (): string[] => log.filter((l) => l.startsWith('read ')).map((l) => l.slice(5));
  return { client, getTree, read, requests, reads };
}

type Source = ReturnType<typeof fakeSource>;

/** The edition: `files` maps each path on its default branch to an answer; any other is 404. */
function fakeEdition(files: Record<string, Answer>) {
  const getContent = jest.fn(async (params: { path: string }) => {
    const answer = files[params.path];
    if (answer === undefined) throw httpError(404, 'Not Found');
    if (typeof answer === 'object') throw httpError(answer.status);
    return { data: { type: 'file', path: params.path, content: '' } };
  });
  const get = jest.fn(async () => ({ data: { default_branch: 'main' } }));
  const client: ContentReader = { rest: { repos: { get, getContent } } };
  const reads = (): string[] => getContent.mock.calls.map(([params]) => params.path);
  return { client, reads };
}

function recordingLogger() {
  return { info: jest.fn(), warning: jest.fn(), error: jest.fn() };
}

/** One entry of `pulls.listFiles`. */
function prFile(filename: string, status: string, previousFilename?: string) {
  return previousFilename === undefined
    ? { filename, status }
    : { filename, status, previous_filename: previousFilename };
}

type PrFile = ReturnType<typeof prFile>;

/** Place a source PR's files on the source's lecture set at `SHA`. */
function place(
  source: Source,
  files: PrFile[],
  logger = recordingLogger(),
  docsFolder = DOCS
): Promise<LectureSetPlacement> {
  return placeOnLectureSet(
    source.client,
    SOURCE,
    source.read,
    classifyChangedFiles(files, docsFolder),
    docsFolder,
    SHA,
    EDITION_NAME,
    logger
  );
}

/** The changed and renamed `.md` files a placement keeps. */
function kept(placement: LectureSetPlacement): string[] {
  return [
    ...placement.classified.changedMarkdownFiles,
    ...placement.classified.renamedMarkdownFiles,
  ].map((f) => f.filename);
}

/**
 * The lecture-python.myst shape: `intro` the root, three lectures, and
 * `jv.md` including the GPU admonition, which no ToC entry lists.
 */
const LECTURES: Record<string, Answer> = {
  'lectures/_toc.yml': toc('about', 'jv', 'mle'),
  'lectures/intro.md': lecture('Intro'),
  'lectures/about.md': lecture('About'),
  'lectures/jv.md': lecture('Job Search', '_admonition/gpu.md'),
  'lectures/mle.md': lecture('MLE'),
  'lectures/_admonition/gpu.md': ':::{admonition} GPU\nText.\n:::\n',
  'lectures/README.md': '# Readme\n',
  'lectures/draft.md': lecture('Draft'),
  'README.md': '# Repository\n',
};

// =============================================================================
// THE SOURCE'S FILE LIST
// =============================================================================

describe('githubLectureSetSource', () => {
  it('lists the files under the docs folder, docs-relative, from one recursive tree read', async () => {
    const source = fakeSource({ [SHA]: LECTURES });
    const folder = await githubLectureSetSource(source.client, SOURCE, DOCS, SHA, source.read);

    expect(source.getTree).toHaveBeenCalledTimes(1);
    expect(source.getTree).toHaveBeenCalledWith({
      owner: 'QuantEcon',
      repo: 'lecture-python.myst',
      tree_sha: SHA,
      recursive: 'true',
    });
    // The folder entry and the file outside the docs folder are left out.
    expect([...folder.files].sort()).toEqual([
      'README.md',
      '_admonition/gpu.md',
      '_toc.yml',
      'about.md',
      'draft.md',
      'intro.md',
      'jv.md',
      'mle.md',
    ]);
    expect(await folder.read('jv.md')).toBe(LECTURES['lectures/jv.md']);
    expect(source.read).toHaveBeenCalledWith('lectures/jv.md', SHA);
  });

  it('takes the whole repository for a docs folder at its root', async () => {
    const source = fakeSource({ [SHA]: { '_toc.yml': toc('a'), 'a.md': '# A\n' } });
    const folder = await githubLectureSetSource(source.client, SOURCE, '', SHA, source.read);

    expect([...folder.files].sort()).toEqual(['_toc.yml', 'a.md']);
    await folder.read('a.md');
    expect(source.read).toHaveBeenCalledWith('a.md', SHA);
  });

  it('refuses a tree GitHub truncated, rather than reading a smaller folder', async () => {
    const source = fakeSource({ [SHA]: LECTURES }, { [SHA]: { truncated: true } });
    await expect(
      githubLectureSetSource(source.client, SOURCE, DOCS, SHA, source.read)
    ).rejects.toThrow(
      'GitHub truncated the file list of QuantEcon/lecture-python.myst at cafe000, so the ' +
        'lecture set cannot be read whole'
    );
  });

  it('names the status of a tree read that failed', async () => {
    const source = fakeSource({}, { [PARENT]: { status: 502 } });
    await expect(
      githubLectureSetSource(source.client, SOURCE, DOCS, PARENT, source.read)
    ).rejects.toThrow(
      'could not read the file list of QuantEcon/lecture-python.myst at cafe000^ (status 502): HTTP 502'
    );
  });
});

// =============================================================================
// PLACING CHANGED FILES
// =============================================================================

describe('placeOnLectureSet', () => {
  it('reads nothing on a run with no changed .md and no change to the ToC', async () => {
    const source = fakeSource({ [SHA]: LECTURES });
    const files = [
      prFile('lectures/old.md', 'removed'),
      prFile('lectures/sub/_toc.yml', 'modified'),
    ];

    const placement = await place(source, files);

    expect(source.requests()).toEqual([]);
    expect(placement.classified).toEqual(classifyChangedFiles(files, DOCS));
    expect(placement.sourceFiles).toBeUndefined();
  });

  it('keeps a changed ToC document, reading only the tree and the ToC', async () => {
    const source = fakeSource({ [SHA]: LECTURES });

    const placement = await place(source, [
      prFile('lectures/mle.md', 'modified'),
      prFile('lectures/intro.md', 'modified'),
    ]);

    expect(kept(placement)).toEqual(['lectures/mle.md', 'lectures/intro.md']);
    expect(source.requests()).toEqual([`tree ${SHA}`, `read lectures/_toc.yml@${SHA}`]);
    expect(placement.outside).toEqual([]);
    expect(placement.errors).toEqual([]);
    expect(placement.toc).toEqual({
      path: 'lectures/_toc.yml',
      content: LECTURES['lectures/_toc.yml'],
    });
  });

  it('keeps a changed fragment, found by the include scan at the commit', async () => {
    const source = fakeSource({ [SHA]: LECTURES });

    const placement = await place(source, [prFile('lectures/_admonition/gpu.md', 'modified')]);

    expect(kept(placement)).toEqual(['lectures/_admonition/gpu.md']);
    expect(source.reads()).toEqual(
      expect.arrayContaining([`lectures/jv.md@${SHA}`, `lectures/about.md@${SHA}`])
    );
    expect(placement.outside).toEqual([]);
  });

  it('stops the include scan at the first includer, after the batch it is in', async () => {
    // Twelve lectures, the second including the fragment: the first batch of
    // eight finds it, and the last four are never read.
    const stems = Array.from({ length: 12 }, (_, i) => `l${String(i).padStart(2, '0')}`);
    const files: Record<string, Answer> = {
      'lectures/_toc.yml': toc(...stems),
      'lectures/frag.md': 'x\n',
    };
    for (const [i, stem] of stems.entries()) {
      files[`lectures/${stem}.md`] = i === 1 ? lecture(stem, 'frag.md') : lecture(stem);
    }
    const source = fakeSource({ [SHA]: files });

    const placement = await place(source, [prFile('lectures/frag.md', 'modified')]);

    expect(kept(placement)).toEqual(['lectures/frag.md']);
    const read = source.reads();
    // The root, intro, has no file: the scan starts at the first chapter.
    expect(read).toContain(`lectures/l07.md@${SHA}`);
    expect(read).not.toContain(`lectures/l08.md@${SHA}`);
    expect(read).not.toContain(`lectures/l11.md@${SHA}`);
  });

  it('leaves out and lists a changed draft and README.md, and fails nothing', async () => {
    const source = fakeSource({ [SHA]: LECTURES });
    const logger = recordingLogger();

    const placement = await place(
      source,
      [
        prFile('lectures/draft.md', 'modified'),
        prFile('lectures/mle.md', 'modified'),
        prFile('lectures/README.md', 'added'),
      ],
      logger
    );

    expect(kept(placement)).toEqual(['lectures/mle.md']);
    expect(placement.outside).toEqual([
      { path: 'lectures/draft.md' },
      { path: 'lectures/README.md' },
    ]);
    expect(placement.errors).toEqual([]);
    expect(placement.refused).toBeUndefined();
    expect(logger.info).toHaveBeenCalledWith(
      'lectures/draft.md: not synced — outside the lecture set (lectures/_toc.yml does not list ' +
        'it, and no lecture includes it)'
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('lists a changed README.md at the root of a docs folder of `.`', async () => {
    const source = fakeSource({
      [SHA]: { '_toc.yml': toc('lecture'), 'lecture.md': '# L\n', 'README.md': '# R\n' },
    });

    const placement = await place(
      source,
      [prFile('README.md', 'modified'), prFile('lecture.md', 'modified')],
      recordingLogger(),
      ''
    );

    expect(kept(placement)).toEqual(['lecture.md']);
    expect(placement.outside).toEqual([{ path: 'README.md' }]);
  });

  it('logs a ToC entry with no file behind it, and fails nothing', async () => {
    // The harness's test repositories list `root: index` and have no index.md.
    const source = fakeSource({
      [SHA]: {
        '_toc.yml': 'format: jb-book\nroot: index\nchapters:\n  - file: lecture-minimal\n',
        'lecture-minimal.md': '# M\n',
      },
    });
    const logger = recordingLogger();

    const placement = await place(source, [prFile('lecture-minimal.md', 'modified')], logger, '');

    expect(kept(placement)).toEqual(['lecture-minimal.md']);
    expect(placement.errors).toEqual([]);
    expect(logger.info).toHaveBeenCalledWith(
      "_toc.yml lists 'index', with no file behind it; it is not in the lecture set"
    );
  });

  it('leaves out a lecture renamed to a path outside the set, and warns that the edition keeps it', async () => {
    const source = fakeSource({
      [SHA]: { ...LECTURES, 'lectures/drafts/about.md': lecture('About') },
    });
    const logger = recordingLogger();

    const placement = await place(
      source,
      [prFile('lectures/drafts/about.md', 'renamed', 'lectures/about.md')],
      logger
    );

    expect(kept(placement)).toEqual([]);
    expect(placement.outside).toEqual([
      { path: 'lectures/drafts/about.md', previousPath: 'lectures/about.md' },
    ]);
    expect(logger.warning).toHaveBeenCalledWith(
      `lectures/about.md was renamed to lectures/drafts/about.md, which is outside the lecture ` +
        `set: ${EDITION_NAME} keeps its translation of lectures/about.md, which sync no longer updates`
    );
  });

  it('carries a renamed fragment whose includer names its new path in the same PR', async () => {
    const files: Record<string, Answer> = {
      ...LECTURES,
      'lectures/jv.md': lecture('Job Search', '_admonition/gpu-new.md'),
    };
    delete files['lectures/_admonition/gpu.md'];
    files['lectures/_admonition/gpu-new.md'] = 'x\n';
    const source = fakeSource({ [SHA]: files });

    const placement = await place(source, [
      prFile('lectures/jv.md', 'modified'),
      prFile('lectures/_admonition/gpu-new.md', 'renamed', 'lectures/_admonition/gpu.md'),
    ]);

    expect(kept(placement)).toEqual(['lectures/jv.md', 'lectures/_admonition/gpu-new.md']);
    expect(placement.outside).toEqual([]);
  });

  it('makes a lecture the scan cannot read an error for that file alone', async () => {
    const source = fakeSource({ [SHA]: { ...LECTURES, 'lectures/jv.md': { status: 500 } } });
    const logger = recordingLogger();

    const placement = await place(
      source,
      [prFile('lectures/_admonition/gpu.md', 'modified'), prFile('lectures/mle.md', 'modified')],
      logger
    );

    const error =
      'Fetch failed (lecture set): lectures/_admonition/gpu.md: could not read lectures/jv.md ' +
      'from QuantEcon/lecture-python.myst at cafe000 (status 500): HTTP 500, so whether it is in ' +
      'the lecture set is unknown. It was not synced.';
    expect(placement.errors).toEqual([error]);
    expect(logger.error).toHaveBeenCalledWith(error);
    // Neither synced nor listed; the ToC document still syncs.
    expect(kept(placement)).toEqual(['lectures/mle.md']);
    expect(placement.outside).toEqual([]);
    expect(placement.refused).toBeUndefined();
  });

  describe('a lecture set it cannot read holds the whole run', () => {
    const files = [prFile('lectures/mle.md', 'modified'), prFile('lectures/old.md', 'removed')];

    it.each([
      [
        'no ToC',
        fakeSource({ [SHA]: { 'lectures/mle.md': '# M\n' } }),
        'the docs folder has no _toc.yml or myst.yml, so it has no lecture set',
      ],
      [
        'a ToC that is not YAML',
        fakeSource({ [SHA]: { ...LECTURES, 'lectures/_toc.yml': 'root: [intro\n' } }),
        '_toc.yml is not valid YAML',
      ],
      [
        'a ToC of a layout the reader refuses',
        fakeSource({
          [SHA]: { ...LECTURES, 'lectures/_toc.yml': 'format: jb-other\nroot: intro\n' },
        }),
        "_toc.yml has format 'jb-other'",
      ],
      [
        'a ToC whose read fails',
        fakeSource({ [SHA]: { ...LECTURES, 'lectures/_toc.yml': { status: 503 } } }),
        'could not read lectures/_toc.yml from QuantEcon/lecture-python.myst at cafe000 ' +
          '(status 503): HTTP 503',
      ],
      [
        'a truncated tree',
        fakeSource({ [SHA]: LECTURES }, { [SHA]: { truncated: true } }),
        'GitHub truncated the file list',
      ],
      [
        'a tree read that fails',
        fakeSource({ [SHA]: LECTURES }, { [SHA]: { status: 500 } }),
        'could not read the file list of QuantEcon/lecture-python.myst at cafe000 (status 500)',
      ],
    ])('%s', async (_label, source, detail) => {
      const logger = recordingLogger();
      const placement = await place(source, files, logger);

      expect(placement.refused).toMatch(
        /^Sync refused: the source's lecture set at cafe000 could not be read: /
      );
      expect(placement.refused).toContain(detail);
      expect(placement.refused).toMatch(
        /Without it the run cannot tell which changed files are lectures, so nothing was synced\.$/
      );
      expect(placement.errors).toEqual([placement.refused]);
      expect(logger.error).toHaveBeenCalledWith(placement.refused);
      // It never falls back to the folder.
      expect(placement.outside).toEqual([]);
    });
  });

  describe('a change to the ToC', () => {
    /** Before: about, jv, mle and old. After: about, jv, mle, back and fresh, with old gone from the ToC. */
    const BEFORE: Record<string, Answer> = {
      ...LECTURES,
      'lectures/_toc.yml': toc('about', 'jv', 'mle', 'old'),
      'lectures/old.md': lecture('Old'),
      'lectures/back.md': lecture('Back'),
      'lectures/fresh.md': lecture('Fresh'),
    };
    const AFTER: Record<string, Answer> = {
      ...BEFORE,
      'lectures/_toc.yml': toc('about', 'jv', 'mle', 'back', 'fresh'),
    };
    const TOC_CHANGE = prFile('lectures/_toc.yml', 'modified');

    it('lists a lecture taken out and kept, and those added without a change', async () => {
      const source = fakeSource({ [SHA]: AFTER, [PARENT]: BEFORE });
      const logger = recordingLogger();

      const placement = await place(source, [TOC_CHANGE], logger);

      expect(placement.tocRemoved).toEqual(['lectures/old.md']);
      expect(placement.tocAdded).toEqual(['lectures/back.md', 'lectures/fresh.md']);
      expect(placement.errors).toEqual([]);
      expect(source.requests().slice(0, 4)).toEqual([
        `tree ${SHA}`,
        `read lectures/_toc.yml@${SHA}`,
        `tree ${PARENT}`,
        `read lectures/_toc.yml@${PARENT}`,
      ]);
      expect(logger.info).toHaveBeenCalledWith(
        `lectures/old.md: taken out of lectures/_toc.yml and kept in the docs folder — ` +
          `${EDITION_NAME} keeps its translation, which sync no longer updates`
      );
    });

    it('does not list an added lecture the PR changes, or a removed one it deletes', async () => {
      const after = { ...AFTER };
      delete after['lectures/old.md'];
      const source = fakeSource({ [SHA]: after, [PARENT]: BEFORE });

      const placement = await place(source, [
        TOC_CHANGE,
        prFile('lectures/old.md', 'removed'),
        prFile('lectures/back.md', 'modified'),
      ]);

      expect(placement.tocRemoved).toEqual([]);
      expect(placement.tocAdded).toEqual(['lectures/fresh.md']);
      expect(kept(placement)).toEqual(['lectures/back.md']);
    });

    it('lists a lecture taken out and changed in the same PR once, as taken out', async () => {
      const source = fakeSource({ [SHA]: AFTER, [PARENT]: BEFORE });

      const placement = await place(source, [TOC_CHANGE, prFile('lectures/old.md', 'modified')]);

      expect(placement.tocRemoved).toEqual(['lectures/old.md']);
      expect(placement.outside).toEqual([]);
      expect(kept(placement)).toEqual([]);
    });

    it('lists neither a lecture taken out that a lecture still includes, nor one added that was included', async () => {
      const before = { ...BEFORE, 'lectures/mle.md': lecture('MLE', 'fresh.md') };
      const after = {
        ...AFTER,
        'lectures/jv.md': lecture('Job Search', '_admonition/gpu.md', 'old.md'),
      };
      const source = fakeSource({ [SHA]: after, [PARENT]: before });

      const placement = await place(source, [TOC_CHANGE]);

      expect(placement.tocRemoved).toEqual([]);
      expect(placement.tocAdded).toEqual(['lectures/back.md']);
    });

    it('resolves the ToC before the PR against the tree before it', async () => {
      // `fresh` was listed, with nothing behind it, before the PR added the
      // file; the PR then drops the entry. Against the tree at the merge
      // commit, the old entry would read as a lecture taken out.
      const before: Record<string, Answer> = {
        ...BEFORE,
        'lectures/_toc.yml': toc('about', 'jv', 'mle', 'fresh'),
      };
      delete before['lectures/fresh.md'];
      const after = { ...BEFORE, 'lectures/_toc.yml': toc('about', 'jv', 'mle', 'old') };
      const source = fakeSource({ [SHA]: after, [PARENT]: before });

      const placement = await place(source, [TOC_CHANGE, prFile('lectures/fresh.md', 'added')]);

      expect(placement.tocRemoved).toEqual([]);
      expect(placement.tocAdded).toEqual(['lectures/old.md']);
      expect(placement.outside).toEqual([{ path: 'lectures/fresh.md' }]);
    });

    it('lists nothing, and fails nothing, when there was no ToC before the PR', async () => {
      const before = { ...BEFORE };
      delete before['lectures/_toc.yml'];
      const source = fakeSource({ [SHA]: AFTER, [PARENT]: before });
      const logger = recordingLogger();

      const placement = await place(source, [prFile('lectures/_toc.yml', 'added')], logger);

      expect(placement.tocRemoved).toEqual([]);
      expect(placement.tocAdded).toEqual([]);
      expect(placement.errors).toEqual([]);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringMatching(
          /^lectures\/_toc\.yml before this PR could not be read as a ToC \(the docs folder has no _toc\.yml/
        )
      );
    });

    it('makes a failed read of the tree before the PR an error, and still places the changed files', async () => {
      const source = fakeSource({ [SHA]: AFTER, [PARENT]: BEFORE }, { [PARENT]: { status: 500 } });

      const placement = await place(source, [TOC_CHANGE, prFile('lectures/mle.md', 'modified')]);

      expect(placement.errors).toEqual([
        'Fetch failed (lecture set): lectures/_toc.yml: could not read the file list of ' +
          'QuantEcon/lecture-python.myst at cafe000^ (status 500): HTTP 500, so the lectures this ' +
          'PR adds to it or takes out of it are unknown.',
      ]);
      expect(placement.refused).toBeUndefined();
      expect(kept(placement)).toEqual(['lectures/mle.md']);
    });

    it('makes a lecture the scan cannot read an error for the entry it decides', async () => {
      const source = fakeSource({
        [SHA]: AFTER,
        [PARENT]: { ...BEFORE, 'lectures/jv.md': { status: 500 } },
      });

      const placement = await place(source, [TOC_CHANGE]);

      expect(placement.tocAdded).toEqual([]);
      expect(placement.errors).toEqual([
        'Fetch failed (lecture set): lectures/back.md: could not read lectures/jv.md from ' +
          "QuantEcon/lecture-python.myst at cafe000^ (status 500): HTTP 500, so whether this PR's " +
          'change to lectures/_toc.yml leaves it in the lecture set is unknown.',
        'Fetch failed (lecture set): lectures/fresh.md: could not read lectures/jv.md from ' +
          "QuantEcon/lecture-python.myst at cafe000^ (status 500): HTTP 500, so whether this PR's " +
          'change to lectures/_toc.yml leaves it in the lecture set is unknown.',
      ]);
    });

    it('compares nothing for a _toc.yml in a subfolder, which is not the ToC', async () => {
      const source = fakeSource({ [SHA]: AFTER, [PARENT]: BEFORE });

      const placement = await place(source, [
        prFile('lectures/sub/_toc.yml', 'modified'),
        prFile('lectures/mle.md', 'modified'),
      ]);

      expect(source.requests()).not.toContain(`tree ${PARENT}`);
      expect(placement.tocAdded).toEqual([]);
    });
  });
});

// =============================================================================
// THE GAPS, ONCE THE RUN KNOWS WHAT IT DELIVERS
// =============================================================================

describe('findLectureSetGaps', () => {
  const SOURCE_FILES = new Set(['jv.md', 'mle.md', '_admonition/gpu.md', '_admonition/cpu.md']);

  it('picks the catch-up for each lecture added to the ToC by its state file', async () => {
    const edition = fakeEdition({ '.translate/state/back.md.yml': 'source-sha: x\n' });

    const gaps = await findLectureSetGaps(
      edition.client,
      EDITION,
      DOCS,
      { tocAdded: ['lectures/back.md', 'lectures/fresh.md'], delivered: [] },
      recordingLogger()
    );

    expect(gaps.tocAdded).toEqual([
      { path: 'lectures/back.md', inEdition: true },
      { path: 'lectures/fresh.md', inEdition: false },
    ]);
    expect(edition.reads()).toEqual([
      '.translate/state/back.md.yml',
      '.translate/state/fresh.md.yml',
    ]);
    expect(gaps.errors).toEqual([]);
  });

  it('makes a state-file read that is not a 404 an error for that entry', async () => {
    const edition = fakeEdition({ '.translate/state/back.md.yml': { status: 500 } });

    const gaps = await findLectureSetGaps(
      edition.client,
      EDITION,
      DOCS,
      { tocAdded: ['lectures/back.md'], delivered: [] },
      recordingLogger()
    );

    expect(gaps.tocAdded).toEqual([]);
    expect(gaps.errors).toEqual([
      'Fetch failed (lecture set): lectures/back.md: could not read .translate/state/back.md.yml ' +
        `from ${EDITION_NAME} (status 500): HTTP 500, so the catch-up for this lecture, which ` +
        'this PR adds to the ToC without delivering it, is unknown.',
    ]);
  });

  it('lists each include a delivered lecture names that the edition lacks, once', async () => {
    const edition = fakeEdition({ 'lectures/_admonition/cpu.md': 'x' });
    const logger = recordingLogger();

    const gaps = await findLectureSetGaps(
      edition.client,
      EDITION,
      DOCS,
      {
        tocAdded: [],
        delivered: [
          {
            path: 'lectures/jv.md',
            content: lecture('JV', '_admonition/gpu.md', '_admonition/cpu.md'),
          },
          { path: 'lectures/mle.md', content: lecture('MLE', '/_admonition/gpu.md') },
        ],
        sourceFiles: SOURCE_FILES,
      },
      logger
    );

    expect(gaps.missingIncludes).toEqual([
      { path: 'lectures/_admonition/gpu.md', includedBy: ['lectures/jv.md', 'lectures/mle.md'] },
    ]);
    expect(edition.reads()).toEqual(['lectures/_admonition/gpu.md', 'lectures/_admonition/cpu.md']);
    expect(logger.warning).toHaveBeenCalledWith(
      `lectures/_admonition/gpu.md: lectures/jv.md, lectures/mle.md include it, and ${EDITION_NAME} ` +
        'does not have it'
    );
  });

  it('skips an include this PR delivers, and one the source does not have, without a read', async () => {
    const edition = fakeEdition({});

    const gaps = await findLectureSetGaps(
      edition.client,
      EDITION,
      DOCS,
      {
        tocAdded: [],
        delivered: [
          { path: 'lectures/jv.md', content: lecture('JV', '_admonition/gpu.md', 'nowhere.md') },
          { path: 'lectures/_admonition/gpu.md', content: 'x\n' },
        ],
        sourceFiles: SOURCE_FILES,
      },
      recordingLogger()
    );

    expect(gaps.missingIncludes).toEqual([]);
    expect(edition.reads()).toEqual([]);
  });

  it('makes an edition read that is not a 404 an error for that include', async () => {
    const edition = fakeEdition({ 'lectures/_admonition/gpu.md': { status: 502 } });

    const gaps = await findLectureSetGaps(
      edition.client,
      EDITION,
      DOCS,
      {
        tocAdded: [],
        delivered: [{ path: 'lectures/jv.md', content: lecture('JV', '_admonition/gpu.md') }],
        sourceFiles: SOURCE_FILES,
      },
      recordingLogger()
    );

    expect(gaps.missingIncludes).toEqual([]);
    expect(gaps.errors).toEqual([
      'Fetch failed (lecture set): lectures/_admonition/gpu.md: could not read ' +
        `lectures/_admonition/gpu.md from ${EDITION_NAME} (status 502): HTTP 502, so whether the ` +
        'edition has this file, which lectures/jv.md includes, is unknown.',
    ]);
  });
});

// =============================================================================
// THE PR BODY AND THE JOB SUMMARY
// =============================================================================

/** The `- ` items under `heading`, up to the next heading; undefined without the heading. */
function itemsUnder(markdown: string, heading: string): string[] | undefined {
  const lines = markdown.split('\n');
  const start = lines.indexOf(heading);
  if (start === -1) return undefined;
  const end = lines.findIndex((line, i) => i > start && line.startsWith('#'));
  return lines.slice(start + 1, end === -1 ? undefined : end).filter((l) => l.startsWith('- '));
}

const REPORT: LectureSetReport = {
  docsFolder: DOCS,
  outside: [
    { path: 'lectures/README.md' },
    { path: 'lectures/drafts/about.md', previousPath: 'lectures/about.md' },
  ],
  tocRemoved: ['lectures/old.md'],
  tocAdded: [
    { path: 'lectures/back.md', inEdition: true },
    { path: 'lectures/fresh.md', inEdition: false },
  ],
  missingIncludes: [
    { path: 'lectures/_admonition/gpu.md', includedBy: ['lectures/jv.md', 'lectures/mle.md'] },
  ],
};

const EMPTY_REPORT: LectureSetReport = {
  docsFolder: DOCS,
  outside: [],
  tocRemoved: [],
  tocAdded: [],
  missingIncludes: [],
};

describe('formatLectureSetNotice', () => {
  it('is empty when there is nothing to list', () => {
    expect(formatLectureSetNotice(EMPTY_REPORT)).toBe('');
  });

  it('lists each kind under its own heading, with docs-relative catch-up commands', () => {
    const notice = formatLectureSetNotice(REPORT);

    expect(itemsUnder(notice, OUTSIDE_SET_HEADING)).toEqual([
      '- `lectures/README.md`',
      '- `lectures/drafts/about.md` (renamed from `lectures/about.md`): the edition keeps its ' +
        'translation of `lectures/about.md`, which sync no longer updates',
    ]);
    expect(itemsUnder(notice, TOC_REMOVED_HEADING)).toEqual(['- `lectures/old.md`']);
    expect(itemsUnder(notice, TOC_ADDED_HEADING)).toEqual([
      '- `lectures/back.md`: `translate status -f back.md`, then `translate forward -f back.md`',
      '- `lectures/fresh.md`: `translate init -f fresh.md`',
    ]);
    expect(itemsUnder(notice, MISSING_INCLUDES_HEADING)).toEqual([
      '- `lectures/_admonition/gpu.md` (included by `lectures/jv.md`, `lectures/mle.md`): ' +
        '`translate init -f _admonition/gpu.md`',
    ]);
    expect(notice).toContain('`lectures/_toc.yml` does not list them');
  });

  it('leaves out a heading with nothing under it', () => {
    const notice = formatLectureSetNotice({ ...EMPTY_REPORT, tocRemoved: ['lectures/old.md'] });

    expect(notice).toContain(TOC_REMOVED_HEADING);
    expect(notice).not.toContain(OUTSIDE_SET_HEADING);
    expect(notice).not.toContain(TOC_ADDED_HEADING);
    expect(notice).not.toContain(MISSING_INCLUDES_HEADING);
  });
});

describe('formatLectureSetSummary', () => {
  it('is empty when there is nothing to list and no error', () => {
    expect(formatLectureSetSummary(EMPTY_REPORT, [])).toBe('');
  });

  it('counts each list, and the reads that failed', () => {
    const summary = formatLectureSetSummary(REPORT, ['Fetch failed (lecture set): x']);

    expect(itemsUnder(summary, '### Not synced: outside the lecture set (2)')).toHaveLength(2);
    expect(itemsUnder(summary, '### Not synced: taken out of the ToC (1)')).toEqual([
      '- `lectures/old.md`',
    ]);
    expect(itemsUnder(summary, '### ⚠️ Added to the ToC, nothing delivered (2)')).toHaveLength(2);
    expect(itemsUnder(summary, '### ⚠️ Included, but not in this edition (1)')).toHaveLength(1);
    expect(itemsUnder(summary, '### ❌ Lecture set unknown (1)')).toEqual([
      '- Fetch failed (lecture set): x',
    ]);
    expect(summary.startsWith('### Not synced: outside the lecture set (2)')).toBe(true);
  });
});

describe('buildScopeSummary, on the lecture set (#449)', () => {
  const base = {
    targetLanguage: 'zh-cn',
    targetRepo: EDITION_NAME,
    sourceRepo: 'QuantEcon/lecture-python.myst',
    prNumber: 12,
  };
  const remainingNothing = classifyChangedFiles([], DOCS);

  it('names no scope on an `all` run, and says nothing changed is in the lecture set', () => {
    const summary = buildScopeSummary({
      ...base,
      syncScope: 'all',
      remaining: remainingNothing,
      lectureSet: formatLectureSetSummary({ ...EMPTY_REPORT, outside: REPORT.outside }, []),
      errorCount: 0,
    });

    expect(summary.split('\n')[0]).toBe('## Translation sync (zh-cn)');
    expect(summary).toContain(
      '**No translation PR.** Nothing this source PR changed is in the lecture set.'
    );
    expect(summary).not.toContain('### In scope');
    expect(itemsUnder(summary, '### Not synced: outside the lecture set (2)')).toHaveLength(2);
  });

  it('keeps the scope heading of an `existing` run the lecture set refused, before any scope check', () => {
    const summary = buildScopeSummary({
      ...base,
      syncScope: 'existing',
      lectureSet: formatLectureSetSummary(EMPTY_REPORT, ['Sync refused: no ToC']),
      errorCount: 1,
    });

    expect(summary.split('\n')[0]).toBe('## Translation sync (zh-cn): `sync-scope: existing`');
    expect(summary).toContain(
      '**No translation PR.** The run failed with 1 error(s); see the log.'
    );
    expect(summary).not.toContain('### In scope');
    expect(itemsUnder(summary, '### ❌ Lecture set unknown (1)')).toEqual([
      '- Sync refused: no ToC',
    ]);
  });

  it('puts the lecture set after the scope sections of an `existing` run', () => {
    const scoped: ScopedFiles = {
      classified: remainingNothing,
      inScope: [],
      skipped: [],
      errors: [],
    };
    const summary = buildScopeSummary({
      ...base,
      scoped,
      lectureSet: formatLectureSetSummary({ ...EMPTY_REPORT, outside: REPORT.outside }, []),
      errorCount: 0,
    });

    expect(summary).toContain('**No translation PR.** Nothing this source PR changed is in scope.');
    expect(summary.indexOf('### Not synced: outside the lecture set')).toBeGreaterThan(
      summary.indexOf('### In scope (0)')
    );
  });
});

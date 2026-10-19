/**
 * Tests for sync scope (#344): which changed lectures a run under
 * `sync-scope: existing` may touch.
 *
 * A lecture is in scope when the edition has its state file on its default
 * branch; a rename is decided by its previous path. The fake edition below
 * answers `getContent` by path and records every request, so each test states
 * what the edition holds and checks exactly what was read. The cases that
 * matter most: a `.md` on `main` without a state file stays out (the Malayalam
 * edition's English `intro.md` and `_admonition/gpu.md`), a state file is never
 * parsed, and only a 404 means "absent". Any other failed read is an error for
 * that lecture, which fails the run instead of skipping a reviewed lecture.
 * The edition itself is read first, because GitHub also answers 404 for a
 * repository the token cannot see. When that read fails, nothing syncs, not
 * even a ToC or a removal.
 *
 * `runSync` wires these functions together in `src/index.ts`, which no test
 * can import (#169). src/__tests__/action-sync-scope.test.ts runs that wiring
 * in the built bundle against a fake GitHub API, scope errors included. The
 * end-to-end harness's `--sync-scope existing` run checks the live path on
 * real repositories, for the zh-cn edition only: the files each translation
 * PR changes, the lectures its body lists as not synced, and, for a source PR
 * that should get no translation PR, that it gets none and its sync run
 * passes. No harness scenario is built to make a scope read fail.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  applySyncScope,
  buildScopeSummary,
  ContentReader,
  docsRelativePath,
  formatScopeNotice,
  JobSummary,
  LECTURE_MISSING_HEADING,
  NOT_SYNCED_HEADING,
  nothingToSync,
  refuseUnreadLectures,
  scopeChangedLectures,
  ScopedFiles,
  ScopeSkip,
  ScopeSummaryInput,
  stateFileFor,
  TargetRepo,
  targetHasFile,
  writeJobSummary,
} from '../sync-scope.js';
import { classifyChangedFiles, FileToSync } from '../sync-orchestrator.js';
import { readFileState, writeFileState } from '../cli/translate-state.js';

// =============================================================================
// TEST HELPERS
// =============================================================================

/** A partial edition, built one reviewed lecture at a time. */
const EDITION: TargetRepo = { owner: 'QuantEcon', repo: 'lecture-python-programming.ml' };
/** The edition as a message names it. */
const EDITION_NAME = 'QuantEcon/lecture-python-programming.ml';
const DOCS = 'lectures/';

/** A state file as the tools write it. Scope only checks that one exists. */
const STATE = [
  'source-sha: 4f1c2d9',
  "synced-at: '2026-10-01'",
  'model: claude-sonnet-5',
  'mode: NEW',
  'section-count: 6',
  '',
].join('\n');

/** A failed read, shaped like an Octokit HTTP error. */
function httpError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

/** A way a read can fail. */
type Failure = 403 | 404 | 500 | 'no-status' | 'non-error';

const FAILURES: Record<Failure, () => unknown> = {
  403: () => httpError(403, 'API rate limit exceeded for installation ID 4242.'),
  404: () => httpError(404, 'Not Found'),
  500: () => httpError(500, 'Internal Server Error'),
  'no-status': () => new TypeError('fetch failed'),
  // A rejection that is not an Error at all.
  'non-error': () => 'socket closed',
};

/**
 * Each failed file read that does not mean "absent", with the status and the
 * cause a message must give for it.
 */
const READ_FAILURES: Array<[Failure, string, string]> = [
  [500, 'status 500', 'Internal Server Error'],
  [403, 'status 403', 'API rate limit exceeded for installation ID 4242.'],
  ['no-status', 'status unknown', 'fetch failed'],
  ['non-error', 'status unknown', 'socket closed'],
];

/**
 * Each way the read of the edition itself can fail, likewise. A 404 is one of
 * them: GitHub answers 404 for a repository the token cannot see.
 */
const EDITION_FAILURES: Array<[Failure, string, string]> = [
  [404, 'status 404', 'Not Found'],
  [500, 'status 500', 'Internal Server Error'],
  ['no-status', 'status unknown', 'fetch failed'],
  ['non-error', 'status unknown', 'socket closed'],
];

/** How `requests()` records the read of the edition itself. */
const EDITION_READ = 'repos.get';

/**
 * The edition. `files` maps each path on its default branch to its content;
 * `failures` maps a path to a read that fails, and `editionFailure` fails the
 * read of the repository itself. Every other path answers 404, as GitHub does
 * for a file the branch does not have.
 */
function fakeEdition(
  files: Record<string, string>,
  failures: Record<string, Failure> = {},
  editionFailure?: Failure
) {
  const held = new Map(Object.entries(files));
  const failing = new Map(Object.entries(failures));
  const log: string[] = [];
  const get = jest.fn(async (params: { owner: string; repo: string }) => {
    log.push(EDITION_READ);
    if (editionFailure !== undefined) throw FAILURES[editionFailure]();
    return { data: { full_name: `${params.owner}/${params.repo}`, default_branch: 'main' } };
  });
  const getContent = jest.fn(async (params: { owner: string; repo: string; path: string }) => {
    log.push(params.path);
    const failure = failing.get(params.path);
    if (failure !== undefined) throw FAILURES[failure]();
    const content = held.get(params.path);
    if (content === undefined) throw httpError(404, 'Not Found');
    return {
      data: {
        type: 'file',
        path: params.path,
        sha: `sha-${params.path}`,
        encoding: 'base64',
        content: Buffer.from(content).toString('base64'),
      },
    };
  });
  const client: ContentReader = { rest: { repos: { get, getContent } } };
  /** The paths read, in order. */
  const reads = (): string[] => getContent.mock.calls.map(([params]) => params.path);
  /** Every request, in order: `EDITION_READ` for the repository, else the path read. */
  const requests = (): string[] => [...log];
  return { client, get, getContent, reads, requests };
}

type Edition = ReturnType<typeof fakeEdition>;

/** A logger that records each call. */
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

/** A source PR's files, classified as the action classifies them. */
function classify(files: PrFile[], docsFolder = DOCS) {
  return classifyChangedFiles(files, docsFolder);
}

/** Scope a source PR's files against an edition. */
function scopeFiles(
  edition: Edition,
  files: PrFile[],
  logger = recordingLogger(),
  docsFolder = DOCS
): Promise<ScopedFiles> {
  return scopeChangedLectures(
    edition.client,
    classify(files, docsFolder),
    EDITION,
    docsFolder,
    logger
  );
}

/** The message a promise rejects with. Fails the test if it resolves. */
async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('expected the promise to reject, but it resolved');
}

/** The scope error for `lecture` when reading `read` failed with `status` and `cause`. */
function scopeError(lecture: string, read: string, status: string, cause: string): string {
  return `Fetch failed (scope): ${lecture}: could not read ${read} from ${EDITION_NAME} (${status}): ${cause}`;
}

/** The text under `heading`, up to the next `###` heading. */
function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(heading);
  if (start === -1) return '';
  const next = markdown.indexOf('\n### ', start + heading.length);
  return markdown.slice(start, next === -1 ? undefined : next);
}

/** One lecture of each kind a scoped run leaves out. */
const NOT_IN_EDITION: ScopeSkip = {
  path: 'lectures/intro.md',
  statePath: '.translate/state/intro.md.yml',
  reason: 'not-in-edition',
};
const RENAMED_NOT_IN_EDITION: ScopeSkip = {
  path: 'lectures/names.md',
  previousPath: 'lectures/naming.md',
  statePath: '.translate/state/naming.md.yml',
  reason: 'not-in-edition',
};
const LECTURE_MISSING: ScopeSkip = {
  path: 'lectures/getting_started.md',
  statePath: '.translate/state/getting_started.md.yml',
  reason: 'lecture-missing',
};

// =============================================================================
// STATE FILE PATHS
// =============================================================================

describe('docsRelativePath and stateFileFor', () => {
  it('key a lecture by its path under the docs folder', () => {
    expect(docsRelativePath('lectures/intro.md', 'lectures/')).toBe('intro.md');
    expect(stateFileFor('lectures/intro.md', 'lectures/')).toBe('.translate/state/intro.md.yml');
  });

  it('keep a subfolder in the state path', () => {
    expect(docsRelativePath('lectures/_admonition/gpu.md', 'lectures/')).toBe('_admonition/gpu.md');
    expect(stateFileFor('lectures/_admonition/gpu.md', 'lectures/')).toBe(
      '.translate/state/_admonition/gpu.md.yml'
    );
  });

  it('take the path as it is when the docs folder is the repo root', () => {
    // inputs.ts normalises `docs-folder: .` and `/` to ''.
    expect(docsRelativePath('_admonition/gpu.md', '')).toBe('_admonition/gpu.md');
    expect(stateFileFor('intro.md', '')).toBe('.translate/state/intro.md.yml');
    expect(stateFileFor('_admonition/gpu.md', '')).toBe('.translate/state/_admonition/gpu.md.yml');
  });

  it('keep a path outside the docs folder as it is', () => {
    expect(docsRelativePath('README.md', 'lectures/')).toBe('README.md');
    expect(stateFileFor('drafts/intro.md', 'lectures/')).toBe(
      '.translate/state/drafts/intro.md.yml'
    );
    // A folder whose name only begins like the docs folder's is outside it.
    expect(docsRelativePath('lectures-old/intro.md', 'lectures/')).toBe('lectures-old/intro.md');
  });

  it('read a docs folder without a trailing slash as the same folder', () => {
    expect(docsRelativePath('lectures/intro.md', 'lectures')).toBe('intro.md');
    expect(stateFileFor('lectures/intro.md', 'lectures')).toBe('.translate/state/intro.md.yml');
    expect(docsRelativePath('lectures/_admonition/gpu.md', 'lectures')).toBe('_admonition/gpu.md');
    expect(stateFileFor('lectures/_admonition/gpu.md', 'lectures')).toBe(
      '.translate/state/_admonition/gpu.md.yml'
    );
    // The folder still ends at a slash: `lecturesX/` is outside `lectures`.
    expect(docsRelativePath('lecturesX/a.md', 'lectures')).toBe('lecturesX/a.md');
    expect(stateFileFor('lecturesX/a.md', 'lectures')).toBe('.translate/state/lecturesX/a.md.yml');
  });

  it('name the file the CLI writes for the lecture', () => {
    // `init`, `forward` and `status --write-state` key a state file by the
    // docs-relative lecture path.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-scope-'));
    try {
      writeFileState(dir, '_admonition/gpu.md', {
        'source-sha': '4f1c2d9',
        'synced-at': '2026-10-01',
        model: 'claude-sonnet-5',
        mode: 'NEW',
        'section-count': 3,
      });
      const statePath = stateFileFor('lectures/_admonition/gpu.md', 'lectures/');
      expect(fs.existsSync(path.join(dir, statePath))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// =============================================================================
// targetHasFile
// =============================================================================

describe('targetHasFile', () => {
  it('is true for a file the edition has and false for a 404', async () => {
    const edition = fakeEdition({ 'lectures/functions.md': 'translated' });

    await expect(targetHasFile(edition.client, EDITION, 'lectures/functions.md')).resolves.toBe(
      true
    );
    await expect(targetHasFile(edition.client, EDITION, 'lectures/intro.md')).resolves.toBe(false);
  });

  it.each(READ_FAILURES)(
    'throws on a %s read, naming the path, the edition, the status and the cause',
    async (failure, status, cause) => {
      const edition = fakeEdition({}, { 'lectures/functions.md': failure });

      const message = await rejection(
        targetHasFile(edition.client, EDITION, 'lectures/functions.md')
      );

      expect(message).toBe(
        `could not read lectures/functions.md from QuantEcon/lecture-python-programming.ml (${status}): ${cause}`
      );
    }
  );
});

// =============================================================================
// scopeChangedLectures
// =============================================================================

describe('scopeChangedLectures', () => {
  it('keeps a lecture whose state file the edition has, reading the state file then the lecture', async () => {
    const edition = fakeEdition({
      '.translate/state/functions.md.yml': STATE,
      'lectures/functions.md': 'translated',
    });
    const logger = recordingLogger();
    const classified = classify([prFile('lectures/functions.md', 'modified')]);

    const scoped = await scopeChangedLectures(edition.client, classified, EDITION, DOCS, logger);

    expect(scoped.inScope).toEqual(['lectures/functions.md']);
    expect(scoped.skipped).toEqual([]);
    expect(scoped.errors).toEqual([]);
    expect(scoped.classified.changedMarkdownFiles).toEqual(classified.changedMarkdownFiles);
    expect(edition.requests()).toEqual([
      EDITION_READ,
      '.translate/state/functions.md.yml',
      'lectures/functions.md',
    ]);
    expect(edition.get).toHaveBeenCalledWith({
      owner: 'QuantEcon',
      repo: 'lecture-python-programming.ml',
    });
    // Both file reads go to the edition's default branch: no `ref`.
    expect(edition.getContent).toHaveBeenCalledTimes(2);
    expect(edition.getContent).toHaveBeenNthCalledWith(1, {
      owner: 'QuantEcon',
      repo: 'lecture-python-programming.ml',
      path: '.translate/state/functions.md.yml',
    });
    expect(edition.getContent).toHaveBeenNthCalledWith(2, {
      owner: 'QuantEcon',
      repo: 'lecture-python-programming.ml',
      path: 'lectures/functions.md',
    });
    expect(logger.warning).not.toHaveBeenCalled();
  });

  it('leaves out a lecture with no state file even when its .md is on main, without reading the .md', async () => {
    // The Malayalam edition carries English copies of intro.md and
    // _admonition/gpu.md on main. Neither has a state file, and syncing either
    // would turn an English change into a half-translated page.
    const edition = fakeEdition({
      'lectures/intro.md': 'English copy',
      'lectures/_admonition/gpu.md': 'English copy',
    });
    const logger = recordingLogger();

    const scoped = await scopeFiles(
      edition,
      [prFile('lectures/intro.md', 'modified'), prFile('lectures/_admonition/gpu.md', 'modified')],
      logger
    );

    expect(scoped.inScope).toEqual([]);
    expect(scoped.classified.changedMarkdownFiles).toEqual([]);
    expect(scoped.skipped).toEqual([
      {
        path: 'lectures/intro.md',
        statePath: '.translate/state/intro.md.yml',
        reason: 'not-in-edition',
      },
      {
        path: 'lectures/_admonition/gpu.md',
        statePath: '.translate/state/_admonition/gpu.md.yml',
        reason: 'not-in-edition',
      },
    ]);
    expect(edition.reads()).toEqual([
      '.translate/state/intro.md.yml',
      '.translate/state/_admonition/gpu.md.yml',
    ]);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('.translate/state/intro.md.yml')
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('.translate/state/_admonition/gpu.md.yml')
    );
    expect(logger.warning).not.toHaveBeenCalled();
  });

  describe('a read that fails with anything but a 404', () => {
    // The failing lecture comes first in each source PR, so each test also
    // shows that the lectures after it are still checked: one in scope, one
    // the edition does not have, one with a state file but no lecture, and a
    // rename in scope.
    const HOLDS = {
      '.translate/state/functions.md.yml': STATE,
      'lectures/functions.md': 'translated',
      '.translate/state/getting_started.md.yml': STATE,
      '.translate/state/oop_basics.md.yml': STATE,
      'lectures/oop_basics.md': 'translated',
    };
    const LATER_LECTURES = [
      prFile('lectures/functions.md', 'modified'),
      prFile('lectures/intro.md', 'modified'),
      prFile('lectures/getting_started.md', 'modified'),
      prFile('lectures/oop_intro.md', 'renamed', 'lectures/oop_basics.md'),
    ];
    const LATER_READS = [
      '.translate/state/functions.md.yml',
      'lectures/functions.md',
      '.translate/state/intro.md.yml',
      '.translate/state/getting_started.md.yml',
      'lectures/getting_started.md',
      '.translate/state/oop_basics.md.yml',
      'lectures/oop_basics.md',
    ];

    /** The later lectures, kept and left out as they would be on their own. */
    function expectLaterLecturesScoped(scoped: ScopedFiles): void {
      expect(scoped.inScope).toEqual(['lectures/functions.md', 'lectures/oop_intro.md']);
      expect(scoped.classified.changedMarkdownFiles.map((f) => f.filename)).toEqual([
        'lectures/functions.md',
      ]);
      expect(scoped.classified.renamedMarkdownFiles.map((f) => f.filename)).toEqual([
        'lectures/oop_intro.md',
      ]);
      expect(scoped.skipped.map((s) => [s.path, s.reason])).toEqual([
        ['lectures/intro.md', 'not-in-edition'],
        ['lectures/getting_started.md', 'lecture-missing'],
      ]);
    }

    it.each(READ_FAILURES)(
      'on a state file (%s) is an error for that lecture, which is neither synced nor skipped',
      async (failure, status, cause) => {
        const edition = fakeEdition(HOLDS, {
          '.translate/state/python_by_example.md.yml': failure,
        });
        const logger = recordingLogger();

        const scoped = await scopeFiles(
          edition,
          [prFile('lectures/python_by_example.md', 'modified'), ...LATER_LECTURES],
          logger
        );

        const error = scopeError(
          'lectures/python_by_example.md',
          '.translate/state/python_by_example.md.yml',
          status,
          cause
        );
        expect(scoped.errors).toEqual([error]);
        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith(error);
        expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('python_by_example'));
        expect(logger.warning).not.toHaveBeenCalledWith(
          expect.stringContaining('python_by_example')
        );
        // Its `.md` is never read, and every later lecture is checked as usual.
        expect(edition.reads()).toEqual([
          '.translate/state/python_by_example.md.yml',
          ...LATER_READS,
        ]);
        expectLaterLecturesScoped(scoped);
      }
    );

    it.each(READ_FAILURES)(
      'on the lecture after its state file was found (%s) is the same kind of error',
      async (failure, status, cause) => {
        const edition = fakeEdition(
          { ...HOLDS, '.translate/state/python_by_example.md.yml': STATE },
          { 'lectures/python_by_example.md': failure }
        );
        const logger = recordingLogger();

        const scoped = await scopeFiles(
          edition,
          [prFile('lectures/python_by_example.md', 'modified'), ...LATER_LECTURES],
          logger
        );

        const error = scopeError(
          'lectures/python_by_example.md',
          'lectures/python_by_example.md',
          status,
          cause
        );
        expect(scoped.errors).toEqual([error]);
        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith(error);
        // Not a lecture-missing skip: whether the lecture is there is unknown.
        expect(logger.warning).not.toHaveBeenCalledWith(
          expect.stringContaining('python_by_example')
        );
        expect(edition.reads()).toEqual([
          '.translate/state/python_by_example.md.yml',
          'lectures/python_by_example.md',
          ...LATER_READS,
        ]);
        expectLaterLecturesScoped(scoped);
      }
    );

    it('records one error per lecture, naming a rename by its new path, and checks the rename after it', async () => {
      const edition = fakeEdition(
        {
          '.translate/state/functions.md.yml': STATE,
          'lectures/functions.md': 'translated',
          '.translate/state/naming.md.yml': STATE,
          'lectures/naming.md': 'translated',
        },
        {
          '.translate/state/python_by_example.md.yml': 403,
          '.translate/state/oop_basics.md.yml': 500,
        }
      );

      const scoped = await scopeFiles(edition, [
        prFile('lectures/python_by_example.md', 'modified'),
        prFile('lectures/functions.md', 'modified'),
        prFile('lectures/oop_intro.md', 'renamed', 'lectures/oop_basics.md'),
        prFile('lectures/names.md', 'renamed', 'lectures/naming.md'),
      ]);

      expect(scoped.errors).toEqual([
        'Fetch failed (scope): lectures/python_by_example.md: could not read ' +
          '.translate/state/python_by_example.md.yml from QuantEcon/lecture-python-programming.ml ' +
          '(status 403): API rate limit exceeded for installation ID 4242.',
        'Fetch failed (scope): lectures/oop_intro.md: could not read ' +
          '.translate/state/oop_basics.md.yml from QuantEcon/lecture-python-programming.ml ' +
          '(status 500): Internal Server Error',
      ]);
      // A rename whose read fails does not end the renames: the one after it
      // is checked by its previous path and kept.
      expect(edition.reads()).toEqual([
        '.translate/state/python_by_example.md.yml',
        '.translate/state/functions.md.yml',
        'lectures/functions.md',
        '.translate/state/oop_basics.md.yml',
        '.translate/state/naming.md.yml',
        'lectures/naming.md',
      ]);
      expect(scoped.inScope).toEqual(['lectures/functions.md', 'lectures/names.md']);
      expect(scoped.skipped).toEqual([]);
      expect(scoped.classified.renamedMarkdownFiles.map((f) => f.filename)).toEqual([
        'lectures/names.md',
      ]);
    });
  });

  describe('reads a state file for existence, never its contents', () => {
    let dir: string;

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-scope-'));
    });

    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it.each([
      [
        'missing required keys, with a key the tools do not write',
        'source-sha: 4f1c2d9\nreviewed-by: a reviewer\n',
      ],
      ['malformed YAML', 'source-sha: [4f1c2d9\nmode: NEW\n'],
      ['empty', ''],
    ])('keeps a lecture whose state file is %s', async (_label, content) => {
      // The premise: the CLI's own reader rejects this state file.
      const local = path.join(dir, '.translate', 'state', 'functions.md.yml');
      fs.mkdirSync(path.dirname(local), { recursive: true });
      fs.writeFileSync(local, content);
      expect(readFileState(dir, 'functions.md')).toBeUndefined();

      const edition = fakeEdition({
        '.translate/state/functions.md.yml': content,
        'lectures/functions.md': 'translated',
      });

      const scoped = await scopeFiles(edition, [prFile('lectures/functions.md', 'modified')]);

      expect(scoped.inScope).toEqual(['lectures/functions.md']);
      expect(scoped.skipped).toEqual([]);
    });
  });

  it('leaves out a lecture whose state file has no .md beside it, with a warning', async () => {
    const edition = fakeEdition({ '.translate/state/getting_started.md.yml': STATE });
    const logger = recordingLogger();

    const scoped = await scopeFiles(
      edition,
      [prFile('lectures/getting_started.md', 'modified')],
      logger
    );

    expect(scoped.inScope).toEqual([]);
    expect(scoped.classified.changedMarkdownFiles).toEqual([]);
    expect(scoped.skipped).toEqual([
      {
        path: 'lectures/getting_started.md',
        statePath: '.translate/state/getting_started.md.yml',
        reason: 'lecture-missing',
      },
    ]);
    expect(edition.reads()).toEqual([
      '.translate/state/getting_started.md.yml',
      'lectures/getting_started.md',
    ]);
    expect(logger.warning).toHaveBeenCalledTimes(1);
    const [warning] = logger.warning.mock.calls[0];
    expect(warning).toContain('lectures/getting_started.md');
    expect(warning).toContain('.translate/state/getting_started.md.yml');
    expect(warning).toContain('not translated from scratch');
  });

  it.each([
    ['lectures/', 'lectures/_admonition/gpu.md'],
    ['lectures', 'lectures/_admonition/gpu.md'],
    ['', '_admonition/gpu.md'],
  ])(
    'finds a lecture in a subfolder by its docs-relative state file (docs folder %j)',
    async (docsFolder, lecture) => {
      const edition = fakeEdition({
        '.translate/state/_admonition/gpu.md.yml': STATE,
        [lecture]: 'translated',
      });

      const scoped = await scopeFiles(
        edition,
        [prFile(lecture, 'modified')],
        recordingLogger(),
        docsFolder
      );

      expect(scoped.inScope).toEqual([lecture]);
      expect(edition.reads()).toEqual(['.translate/state/_admonition/gpu.md.yml', lecture]);
    }
  );

  describe('renames', () => {
    const rename = prFile('lectures/oop_intro.md', 'renamed', 'lectures/oop_basics.md');

    it('decides a rename by its previous path, and reads both files there', async () => {
      const edition = fakeEdition({
        '.translate/state/oop_basics.md.yml': STATE,
        'lectures/oop_basics.md': 'translated',
      });

      const scoped = await scopeFiles(edition, [rename]);

      expect(scoped.inScope).toEqual(['lectures/oop_intro.md']);
      expect(scoped.skipped).toEqual([]);
      expect(scoped.classified.renamedMarkdownFiles).toEqual([rename]);
      expect(edition.reads()).toEqual([
        '.translate/state/oop_basics.md.yml',
        'lectures/oop_basics.md',
      ]);
    });

    it('leaves out a rename whose previous path has no state file, naming both paths', async () => {
      const edition = fakeEdition({});

      const scoped = await scopeFiles(edition, [rename]);

      expect(scoped.inScope).toEqual([]);
      expect(scoped.classified.renamedMarkdownFiles).toEqual([]);
      expect(scoped.skipped).toEqual([
        {
          path: 'lectures/oop_intro.md',
          previousPath: 'lectures/oop_basics.md',
          statePath: '.translate/state/oop_basics.md.yml',
          reason: 'not-in-edition',
        },
      ]);
      expect(edition.reads()).toEqual(['.translate/state/oop_basics.md.yml']);
    });

    it('leaves out a rename when only its new path has a state file', async () => {
      // Until this sync moves it, the edition holds a lecture under its old name.
      const edition = fakeEdition({
        '.translate/state/oop_intro.md.yml': STATE,
        'lectures/oop_intro.md': 'translated',
      });

      const scoped = await scopeFiles(edition, [rename]);

      expect(scoped.inScope).toEqual([]);
      expect(scoped.skipped).toEqual([
        {
          path: 'lectures/oop_intro.md',
          previousPath: 'lectures/oop_basics.md',
          statePath: '.translate/state/oop_basics.md.yml',
          reason: 'not-in-edition',
        },
      ]);
      expect(edition.reads()).toEqual(['.translate/state/oop_basics.md.yml']);
    });

    it('leaves out a rename whose previous path has a state file but no lecture', async () => {
      const edition = fakeEdition({ '.translate/state/oop_basics.md.yml': STATE });
      const logger = recordingLogger();

      const scoped = await scopeFiles(edition, [rename], logger);

      expect(scoped.skipped).toEqual([
        {
          path: 'lectures/oop_intro.md',
          previousPath: 'lectures/oop_basics.md',
          statePath: '.translate/state/oop_basics.md.yml',
          reason: 'lecture-missing',
        },
      ]);
      expect(edition.reads()).toEqual([
        '.translate/state/oop_basics.md.yml',
        'lectures/oop_basics.md',
      ]);
      expect(logger.warning).toHaveBeenCalledWith(
        expect.stringContaining('lectures/oop_basics.md')
      );
    });

    it.each([
      ['no previous filename', prFile('lectures/oop_intro.md', 'renamed')],
      ['an empty previous filename', prFile('lectures/oop_intro.md', 'renamed', '')],
    ])('falls back to the new path for a rename with %s', async (_label, file) => {
      const holding = fakeEdition({
        '.translate/state/oop_intro.md.yml': STATE,
        'lectures/oop_intro.md': 'translated',
      });
      const kept = await scopeFiles(holding, [file]);
      expect(kept.inScope).toEqual(['lectures/oop_intro.md']);
      expect(holding.reads()).toEqual([
        '.translate/state/oop_intro.md.yml',
        'lectures/oop_intro.md',
      ]);

      const left = await scopeFiles(fakeEdition({}), [file]);
      expect(left.skipped).toEqual([
        {
          path: 'lectures/oop_intro.md',
          statePath: '.translate/state/oop_intro.md.yml',
          reason: 'not-in-edition',
        },
      ]);
      expect(left.skipped[0]).not.toHaveProperty('previousPath');
    });
  });

  it('passes removals and ToCs through without a request', async () => {
    // Removals follow the `.md`; the ToC stays a mirror of the source. With no
    // lecture to check, the edition itself is not read either.
    const edition = fakeEdition({});
    const classified = classify([
      prFile('lectures/old_lecture.md', 'removed'),
      prFile('lectures/_toc.yml', 'modified'),
      prFile('lectures/extra/_toc.yml', 'removed'),
    ]);

    const scoped = await scopeChangedLectures(
      edition.client,
      classified,
      EDITION,
      DOCS,
      recordingLogger()
    );

    expect(edition.get).not.toHaveBeenCalled();
    expect(edition.getContent).not.toHaveBeenCalled();
    expect(scoped.errors).toEqual([]);
    expect(scoped.classified).toEqual(classified);
    expect(scoped.classified.removedMarkdownFiles.map((f) => f.filename)).toEqual([
      'lectures/old_lecture.md',
    ]);
    expect(scoped.classified.changedTocFiles.map((f) => f.filename)).toEqual(['lectures/_toc.yml']);
    expect(scoped.classified.removedTocFiles.map((f) => f.filename)).toEqual([
      'lectures/extra/_toc.yml',
    ]);
    expect(scoped.inScope).toEqual([]);
    expect(scoped.skipped).toEqual([]);
  });

  it('partitions a mixed source PR, keeping the order within each kind', async () => {
    const edition = fakeEdition({
      'lectures/intro.md': 'English copy',
      'lectures/_admonition/gpu.md': 'English copy',
      '.translate/state/python_by_example.md.yml': STATE,
      'lectures/python_by_example.md': 'translated',
      '.translate/state/functions.md.yml': STATE,
      'lectures/functions.md': 'translated',
      '.translate/state/getting_started.md.yml': STATE,
      '.translate/state/oop_basics.md.yml': STATE,
      'lectures/oop_basics.md': 'translated',
    });
    const classified = classify([
      prFile('lectures/intro.md', 'modified'),
      prFile('lectures/python_by_example.md', 'modified'),
      prFile('lectures/_admonition/gpu.md', 'modified'),
      prFile('lectures/functions.md', 'modified'),
      prFile('lectures/new_lecture.md', 'added'),
      prFile('lectures/getting_started.md', 'modified'),
      prFile('lectures/oop_intro.md', 'renamed', 'lectures/oop_basics.md'),
      prFile('lectures/names.md', 'renamed', 'lectures/naming.md'),
      prFile('lectures/_toc.yml', 'modified'),
      prFile('lectures/old_lecture.md', 'removed'),
    ]);

    const scoped = await scopeChangedLectures(
      edition.client,
      classified,
      EDITION,
      DOCS,
      recordingLogger()
    );

    expect(scoped.inScope).toEqual([
      'lectures/python_by_example.md',
      'lectures/functions.md',
      'lectures/oop_intro.md',
    ]);
    expect(scoped.classified.changedMarkdownFiles.map((f) => f.filename)).toEqual([
      'lectures/python_by_example.md',
      'lectures/functions.md',
    ]);
    expect(scoped.classified.renamedMarkdownFiles.map((f) => f.filename)).toEqual([
      'lectures/oop_intro.md',
    ]);
    expect(scoped.skipped.map((s) => [s.path, s.reason])).toEqual([
      ['lectures/intro.md', 'not-in-edition'],
      ['lectures/_admonition/gpu.md', 'not-in-edition'],
      ['lectures/new_lecture.md', 'not-in-edition'],
      ['lectures/getting_started.md', 'lecture-missing'],
      ['lectures/names.md', 'not-in-edition'],
    ]);
    expect(scoped.classified.changedTocFiles.map((f) => f.filename)).toEqual(['lectures/_toc.yml']);
    expect(scoped.classified.removedMarkdownFiles.map((f) => f.filename)).toEqual([
      'lectures/old_lecture.md',
    ]);
    expect(nothingToSync(scoped.classified)).toBe(false);
    // The classification passed in is left as it was.
    expect(classified.changedMarkdownFiles).toHaveLength(6);
    expect(classified.renamedMarkdownFiles).toHaveLength(2);
  });

  describe('reads the edition itself first', () => {
    it.each([
      ['a changed lecture', [prFile('lectures/functions.md', 'modified')]],
      ['a rename', [prFile('lectures/oop_intro.md', 'renamed', 'lectures/oop_basics.md')]],
      [
        'several lectures and a ToC',
        [
          prFile('lectures/functions.md', 'modified'),
          prFile('lectures/intro.md', 'modified'),
          prFile('lectures/oop_intro.md', 'renamed', 'lectures/oop_basics.md'),
          prFile('lectures/_toc.yml', 'modified'),
        ],
      ],
    ])('once, before any file, for %s', async (_label, files) => {
      const edition = fakeEdition({});

      await scopeFiles(edition, files);

      expect(edition.get).toHaveBeenCalledTimes(1);
      expect(edition.get).toHaveBeenCalledWith({
        owner: 'QuantEcon',
        repo: 'lecture-python-programming.ml',
      });
      expect(edition.requests()[0]).toBe(EDITION_READ);
      expect(edition.getContent).toHaveBeenCalled();
    });

    it.each([
      ['only a ToC', [prFile('lectures/_toc.yml', 'modified')]],
      [
        'only removals',
        [
          prFile('lectures/old_lecture.md', 'removed'),
          prFile('lectures/extra/_toc.yml', 'removed'),
        ],
      ],
      ['nothing under the docs folder', [prFile('README.md', 'modified')]],
    ])('not at all when the source PR changed %s', async (_label, files) => {
      // A read would fail, so a result without an error shows there was none.
      const edition = fakeEdition({}, {}, 500);

      const scoped = await scopeFiles(edition, files);

      expect(edition.get).not.toHaveBeenCalled();
      expect(scoped.errors).toEqual([]);
    });

    it.each(EDITION_FAILURES)(
      'and checks no lecture when that read fails (%s), dropping ToCs and removals too',
      async (failure, status, cause) => {
        // The edition holds the changed lecture: a 404 here is not "absent".
        const edition = fakeEdition(
          { '.translate/state/functions.md.yml': STATE, 'lectures/functions.md': 'translated' },
          {},
          failure
        );
        const logger = recordingLogger();
        const classified = classify([
          prFile('lectures/functions.md', 'modified'),
          prFile('lectures/intro.md', 'modified'),
          prFile('lectures/oop_intro.md', 'renamed', 'lectures/oop_basics.md'),
          prFile('lectures/_toc.yml', 'modified'),
          prFile('lectures/old_lecture.md', 'removed'),
          prFile('lectures/extra/_toc.yml', 'removed'),
        ]);

        const scoped = await scopeChangedLectures(
          edition.client,
          classified,
          EDITION,
          DOCS,
          logger
        );

        const error =
          `Fetch failed (scope): could not read the edition ${EDITION_NAME} (${status}), ` +
          `so nothing was synced: ${cause}`;
        expect(scoped.errors).toEqual([error]);
        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith(error);
        // The one request is the edition read: no file is read.
        expect(edition.requests()).toEqual([EDITION_READ]);
        expect(edition.getContent).not.toHaveBeenCalled();
        // An edition that cannot be read can take no change, so the ToC and
        // the removals are dropped with the lectures.
        expect(scoped.classified).toEqual({
          changedMarkdownFiles: [],
          renamedMarkdownFiles: [],
          changedTocFiles: [],
          removedMarkdownFiles: [],
          removedTocFiles: [],
        });
        expect(scoped.inScope).toEqual([]);
        expect(scoped.skipped).toEqual([]);
        // Nothing is left to sync, yet there is an error: runSync then fails
        // the run at once, before it reads the edition again.
        expect(nothingToSync(scoped.classified)).toBe(true);
        expect(logger.info).not.toHaveBeenCalled();
        expect(logger.warning).not.toHaveBeenCalled();
      }
    );
  });
});

// =============================================================================
// nothingToSync
// =============================================================================

describe('nothingToSync', () => {
  it('is true when every changed lecture is out of scope and nothing else changed', async () => {
    const files = [
      prFile('lectures/intro.md', 'modified'),
      prFile('lectures/names.md', 'renamed', 'lectures/naming.md'),
    ];

    const scoped = await scopeFiles(fakeEdition({}), files);

    expect(nothingToSync(scoped.classified)).toBe(true);
    expect(nothingToSync(classify(files))).toBe(false);
  });

  it.each([
    ['a ToC', prFile('lectures/_toc.yml', 'modified')],
    ['a removed lecture', prFile('lectures/old_lecture.md', 'removed')],
    ['a removed ToC', prFile('lectures/extra/_toc.yml', 'removed')],
  ])('is false when %s is left to sync', async (_label, other) => {
    const scoped = await scopeFiles(fakeEdition({}), [
      prFile('lectures/intro.md', 'modified'),
      other,
    ]);

    expect(scoped.inScope).toEqual([]);
    expect(nothingToSync(scoped.classified)).toBe(false);
  });

  it('is false when a lecture is in scope', async () => {
    const edition = fakeEdition({
      '.translate/state/functions.md.yml': STATE,
      'lectures/functions.md': 'translated',
    });

    const scoped = await scopeFiles(edition, [prFile('lectures/functions.md', 'modified')]);

    expect(nothingToSync(scoped.classified)).toBe(false);
  });

  it('is false when the only change left in scope is a rename', async () => {
    // With no ToC change (a lecture reached through {include}, say), ending
    // the run here would leave the edition's lecture under its old name.
    const edition = fakeEdition({
      '.translate/state/oop_basics.md.yml': STATE,
      'lectures/oop_basics.md': 'translated',
    });

    const scoped = await scopeFiles(edition, [
      prFile('lectures/intro.md', 'modified'),
      prFile('lectures/oop_intro.md', 'renamed', 'lectures/oop_basics.md'),
    ]);

    expect(scoped.classified.changedMarkdownFiles).toEqual([]);
    expect(scoped.classified.renamedMarkdownFiles).toHaveLength(1);
    expect(nothingToSync(scoped.classified)).toBe(false);
  });
});

// =============================================================================
// applySyncScope
// =============================================================================

describe('applySyncScope', () => {
  const HOLDS_FUNCTIONS = {
    '.translate/state/functions.md.yml': STATE,
    'lectures/functions.md': 'translated',
  };

  /** One lecture the edition has, one it does not, and a rename it does not. */
  function changedLectures() {
    return classify([
      prFile('lectures/functions.md', 'modified'),
      prFile('lectures/intro.md', 'modified'),
      prFile('lectures/names.md', 'renamed', 'lectures/naming.md'),
    ]);
  }

  it("returns undefined without a request under 'all', so the run goes on as before", async () => {
    const edition = fakeEdition(HOLDS_FUNCTIONS);
    const logger = recordingLogger();

    await expect(
      applySyncScope('all', edition.client, changedLectures(), EDITION, DOCS, logger)
    ).resolves.toBeUndefined();

    expect(edition.requests()).toEqual([]);
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warning).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("scopes the run under 'existing' and logs the count", async () => {
    const logger = recordingLogger();
    const classified = changedLectures();

    const scoped = await applySyncScope(
      'existing',
      fakeEdition(HOLDS_FUNCTIONS).client,
      classified,
      EDITION,
      DOCS,
      logger
    );

    const direct = await scopeChangedLectures(
      fakeEdition(HOLDS_FUNCTIONS).client,
      classified,
      EDITION,
      DOCS,
      recordingLogger()
    );
    expect(scoped).toEqual(direct);
    expect(scoped?.inScope).toEqual(['lectures/functions.md']);
    expect(scoped?.skipped.map((s) => s.path)).toEqual(['lectures/intro.md', 'lectures/names.md']);
    expect(scoped?.errors).toEqual([]);
    expect(logger.info).toHaveBeenLastCalledWith(
      'sync-scope: existing — 1 changed lecture(s) in scope, 2 not synced'
    );
  });

  it("returns the scope errors under 'existing' instead of throwing, and counts them", async () => {
    const edition = fakeEdition(HOLDS_FUNCTIONS, {
      '.translate/state/intro.md.yml': 500,
      '.translate/state/naming.md.yml': 403,
    });
    const logger = recordingLogger();

    const scoped = await applySyncScope(
      'existing',
      edition.client,
      changedLectures(),
      EDITION,
      DOCS,
      logger
    );

    expect(scoped?.inScope).toEqual(['lectures/functions.md']);
    expect(scoped?.skipped).toEqual([]);
    expect(scoped?.errors).toHaveLength(2);
    expect(logger.info).toHaveBeenLastCalledWith(
      'sync-scope: existing — 1 changed lecture(s) in scope, 0 not synced, 2 scope error(s)'
    );
  });

  it("counts the error when the edition cannot be read under 'existing'", async () => {
    const edition = fakeEdition(HOLDS_FUNCTIONS, {}, 404);
    const logger = recordingLogger();

    const scoped = await applySyncScope(
      'existing',
      edition.client,
      changedLectures(),
      EDITION,
      DOCS,
      logger
    );

    expect(scoped?.errors).toHaveLength(1);
    expect(logger.info).toHaveBeenLastCalledWith(
      'sync-scope: existing — 0 changed lecture(s) in scope, 0 not synced, 1 scope error(s)'
    );
  });
});

// =============================================================================
// refuseUnreadLectures
// =============================================================================

describe('refuseUnreadLectures', () => {
  it('drops an in-scope lecture the fetch marked new, and fails the run', () => {
    const unread: FileToSync = {
      filename: 'lectures/functions.md',
      type: 'markdown',
      newContent: '# Functions',
      targetContent: '',
      isNewFile: true,
    };

    const { files, errors } = refuseUnreadLectures([unread]);

    expect(files).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('lectures/functions.md');
    expect(errors[0]).toContain('not translated from scratch');
  });

  it('names the previous path of a rename it could not read', () => {
    const unread: FileToSync = {
      filename: 'lectures/oop_intro.md',
      type: 'renamed',
      previousFilename: 'lectures/oop_basics.md',
      newContent: '# OOP',
      targetContent: '',
      isNewFile: true,
    };

    const { files, errors } = refuseUnreadLectures([unread]);

    expect(files).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('lectures/oop_intro.md');
    expect(errors[0]).toContain('the edition has lectures/oop_basics.md');
  });

  it('keeps ToCs, removals and the lectures the fetch read, in order', () => {
    const kept: FileToSync[] = [
      // A ToC the edition lacks is still mirrored: it is not a lecture.
      { filename: 'lectures/_toc.yml', type: 'toc', newContent: 'root: intro', isNewFile: true },
      {
        filename: 'lectures/functions.md',
        type: 'markdown',
        existingFileSha: 'sha-functions',
        isNewFile: false,
      },
      {
        filename: 'lectures/old_lecture.md',
        type: 'removed',
        existingFileSha: 'sha-old',
        isNewFile: false,
      },
      {
        filename: 'lectures/oop_intro.md',
        type: 'renamed',
        previousFilename: 'lectures/oop_basics.md',
        oldFileSha: 'sha-oop',
        isNewFile: false,
      },
    ];
    const unread: FileToSync = {
      filename: 'lectures/python_by_example.md',
      type: 'markdown',
      isNewFile: true,
    };

    const { files, errors } = refuseUnreadLectures([kept[0], unread, ...kept.slice(1)]);

    expect(files).toEqual(kept);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('lectures/python_by_example.md');
  });

  it('returns nothing for no files', () => {
    expect(refuseUnreadLectures([])).toEqual({ files: [], errors: [] });
  });
});

// =============================================================================
// formatScopeNotice
// =============================================================================

describe('formatScopeNotice', () => {
  it('is empty when nothing was left out', () => {
    expect(formatScopeNotice([])).toBe('');
  });

  it('lists the lectures the edition does not have yet under their own heading', () => {
    const notice = formatScopeNotice([NOT_IN_EDITION, RENAMED_NOT_IN_EDITION]);

    // It opens with a blank line, as the PR body's other notices do.
    expect(notice.startsWith(`\n\n${NOT_SYNCED_HEADING}\n\n`)).toBe(true);
    expect(notice.split('\n')).toEqual(
      expect.arrayContaining([
        '- `lectures/intro.md`',
        '- `lectures/names.md` (renamed from `lectures/naming.md`)',
      ])
    );
    expect(notice).toContain('sync-scope: existing');
    expect(notice).not.toContain(LECTURE_MISSING_HEADING);
  });

  it('lists a state file without a lecture under its own heading, with the state file', () => {
    const notice = formatScopeNotice([LECTURE_MISSING]);

    expect(notice.startsWith(`\n\n${LECTURE_MISSING_HEADING}\n\n`)).toBe(true);
    expect(notice.split('\n')).toContain(
      '- `lectures/getting_started.md`: `.translate/state/getting_started.md.yml`'
    );
    expect(notice).not.toContain(NOT_SYNCED_HEADING);
  });

  it('keeps each lecture in its own section when both kinds are left out', () => {
    const notice = formatScopeNotice([LECTURE_MISSING, NOT_IN_EDITION, RENAMED_NOT_IN_EDITION]);

    const notSynced = section(notice, NOT_SYNCED_HEADING);
    const missing = section(notice, LECTURE_MISSING_HEADING);
    expect(notSynced).toContain('- `lectures/intro.md`');
    expect(notSynced).toContain('- `lectures/names.md` (renamed from `lectures/naming.md`)');
    expect(notSynced).not.toContain('`lectures/getting_started.md`');
    expect(missing).toContain('- `lectures/getting_started.md`');
    expect(missing).not.toContain('`lectures/intro.md`');
    expect(missing).not.toContain('`lectures/names.md`');
  });
});

// =============================================================================
// buildScopeSummary
// =============================================================================

describe('buildScopeSummary', () => {
  const PR_URL = 'https://github.com/QuantEcon/lecture-python-programming.ml/pull/88';

  /** A run with two lectures in scope and one lecture of each kind left out. */
  function summaryInput(overrides: Partial<ScopeSummaryInput> = {}): ScopeSummaryInput {
    return {
      targetLanguage: 'ml',
      targetRepo: 'QuantEcon/lecture-python-programming.ml',
      sourceRepo: 'QuantEcon/lecture-python-programming',
      prNumber: 512,
      scoped: {
        classified: classify([
          prFile('lectures/functions.md', 'modified'),
          prFile('lectures/python_by_example.md', 'modified'),
        ]),
        inScope: ['lectures/functions.md', 'lectures/python_by_example.md'],
        skipped: [NOT_IN_EDITION, RENAMED_NOT_IN_EDITION, LECTURE_MISSING],
        errors: [],
      },
      errorCount: 0,
      ...overrides,
    };
  }

  /** A run in which nothing the source PR changed was in scope. */
  const NOTHING_IN_SCOPE: ScopedFiles = {
    classified: classify([]),
    inScope: [],
    skipped: [NOT_IN_EDITION],
    errors: [],
  };

  /** Two lectures whose scope could not be read. */
  const SCOPE_ERRORS = [
    scopeError(
      'lectures/python_by_example.md',
      '.translate/state/python_by_example.md.yml',
      'status 500',
      'Internal Server Error'
    ),
    scopeError(
      'lectures/oop_intro.md',
      '.translate/state/oop_basics.md.yml',
      'status unknown',
      'fetch failed'
    ),
  ];

  /** The line under the Scope unknown heading. */
  const SCOPE_UNKNOWN_NOTE =
    'These reads failed, so the lectures they cover were neither synced nor skipped, ' +
    'and the run failed.';

  /** The default run, with `SCOPE_ERRORS` among its errors. */
  function withScopeErrors(overrides: Partial<ScopeSummaryInput> = {}): ScopeSummaryInput {
    const run = summaryInput(overrides);
    return { ...run, scoped: { ...run.scoped, errors: SCOPE_ERRORS } };
  }

  it('names the language, and links the source PR and the edition', () => {
    const summary = buildScopeSummary(summaryInput({ prUrl: PR_URL }));

    expect(summary.split('\n')[0]).toBe('## Translation sync (ml): `sync-scope: existing`');
    expect(summary).toContain(
      '[QuantEcon/lecture-python-programming#512](https://github.com/QuantEcon/lecture-python-programming/pull/512)'
    );
    expect(summary).toContain('`QuantEcon/lecture-python-programming.ml`');
  });

  it('links the translation PR when the run opened one', () => {
    const summary = buildScopeSummary(summaryInput({ prUrl: PR_URL }));

    expect(summary).toContain(`**Translation PR:** ${PR_URL}`);
    expect(summary).not.toContain('The run also failed');
    expect(summary).not.toContain('**No translation PR.**');
  });

  it('reports the errors beside the PR when the run opened one and also failed', () => {
    const summary = buildScopeSummary(summaryInput({ prUrl: PR_URL, errorCount: 2 }));

    expect(summary).toContain(
      `**Translation PR:** ${PR_URL} The run also failed with 2 error(s); see the log.`
    );
  });

  it('reports a failed run that opened no PR', () => {
    const summary = buildScopeSummary(summaryInput({ errorCount: 3 }));

    expect(summary).toContain(
      '**No translation PR.** The run failed with 3 error(s); see the log.'
    );
    expect(summary).not.toContain('**Translation PR:**');
  });

  it('says nothing was in scope when nothing the source PR changed was', () => {
    const summary = buildScopeSummary(summaryInput({ scoped: NOTHING_IN_SCOPE }));

    expect(summary).toContain('**No translation PR.** Nothing this source PR changed is in scope.');
    const inScope = section(summary, '### In scope');
    expect(inScope).toContain('### In scope (0)');
    expect(inScope.split('\n')).toContain('None.');
  });

  it('says the run produced no changes when lectures were in scope but no PR was opened', () => {
    const summary = buildScopeSummary(summaryInput());

    expect(summary).toContain('**No translation PR.** The run produced no changes.');
  });

  it.each([
    ['a ToC', prFile('lectures/_toc.yml', 'modified')],
    ['a removal', prFile('lectures/old_lecture.md', 'removed')],
  ])(
    'says the run produced no changes when no lecture was in scope but %s was, and no PR was opened',
    async (_label, other) => {
      const scoped = await scopeFiles(fakeEdition({}), [
        prFile('lectures/intro.md', 'modified'),
        other,
      ]);
      expect(scoped.inScope).toEqual([]);

      const summary = buildScopeSummary(summaryInput({ scoped }));

      expect(summary).toContain('**No translation PR.** The run produced no changes.');
      expect(summary).not.toContain('Nothing this source PR changed is in scope.');
    }
  );

  it('lists the lectures whose scope could not be read, after those left out', () => {
    const summary = buildScopeSummary(withScopeErrors({ errorCount: 2 }));

    const unknown = section(summary, '### ❌ Scope unknown');
    expect(unknown.split('\n')[0]).toBe('### ❌ Scope unknown (2)');
    expect(unknown.split('\n')).toContain(SCOPE_UNKNOWN_NOTE);
    expect(unknown.split('\n').filter((line) => line.startsWith('- '))).toEqual([
      `- ${SCOPE_ERRORS[0]}`,
      `- ${SCOPE_ERRORS[1]}`,
    ]);
    expect(summary.indexOf('### ❌ Scope unknown')).toBeGreaterThan(
      summary.indexOf('### ⚠️ Not synced: state file without a lecture')
    );
  });

  it('reports a run with scope errors that opened no PR as failed', () => {
    const summary = buildScopeSummary(withScopeErrors({ errorCount: 2 }));

    expect(summary).toContain(
      '**No translation PR.** The run failed with 2 error(s); see the log.'
    );
  });

  it('links the PR of a run with scope errors and reports the failure beside it', () => {
    // The lectures in scope that could be read still sync in a PR. The run's
    // errors are the two scope errors and one more, say a failed translation.
    const summary = buildScopeSummary(withScopeErrors({ prUrl: PR_URL, errorCount: 3 }));

    expect(summary).toContain(
      `**Translation PR:** ${PR_URL} The run also failed with 3 error(s); see the log.`
    );
    expect(summary).toContain('### ❌ Scope unknown (2)');
  });

  it('reports a run that could not read the edition as failed, not as nothing in scope', async () => {
    // Every change is dropped, the ToC and the removal too, so nothing is
    // left to sync, as in a run with nothing in scope; but this run has an
    // error. runSync writes this summary as it fails the run.
    const scoped = await scopeFiles(fakeEdition({}, {}, 404), [
      prFile('lectures/functions.md', 'modified'),
      prFile('lectures/_toc.yml', 'modified'),
      prFile('lectures/old_lecture.md', 'removed'),
    ]);
    expect(nothingToSync(scoped.classified)).toBe(true);
    expect(scoped.errors).toHaveLength(1);

    const summary = buildScopeSummary(summaryInput({ scoped, errorCount: 1 }));

    expect(summary).toContain(
      '**No translation PR.** The run failed with 1 error(s); see the log.'
    );
    expect(summary).not.toContain('Nothing this source PR changed is in scope.');
    expect(section(summary, '### ❌ Scope unknown').split('\n')).toEqual(
      expect.arrayContaining([
        '### ❌ Scope unknown (1)',
        SCOPE_UNKNOWN_NOTE,
        `- ${scoped.errors[0]}`,
      ])
    );
  });

  it('lists the lectures in scope', () => {
    const inScope = section(buildScopeSummary(summaryInput()), '### In scope');

    expect(inScope.split('\n')).toEqual(
      expect.arrayContaining([
        '### In scope (2)',
        '- `lectures/functions.md`',
        '- `lectures/python_by_example.md`',
      ])
    );
    expect(inScope).not.toContain('None.');
  });

  it('lists each kind of lecture left out under its own heading', () => {
    const summary = buildScopeSummary(summaryInput());

    const notInEdition = section(summary, '### Not synced: not in this edition yet');
    expect(notInEdition.split('\n')).toEqual(
      expect.arrayContaining([
        '### Not synced: not in this edition yet (2)',
        '- `lectures/intro.md`',
        '- `lectures/names.md` (renamed from `lectures/naming.md`)',
      ])
    );
    expect(notInEdition).not.toContain('`lectures/getting_started.md`');

    const missing = section(summary, '### ⚠️ Not synced: state file without a lecture');
    expect(missing.split('\n')).toEqual(
      expect.arrayContaining([
        '### ⚠️ Not synced: state file without a lecture (1)',
        '- `lectures/getting_started.md`: `.translate/state/getting_started.md.yml`',
      ])
    );
    expect(missing).not.toContain('`lectures/intro.md`');
  });

  it('leaves out a section with nothing in it', () => {
    const run = summaryInput();

    const summary = buildScopeSummary({ ...run, scoped: { ...run.scoped, skipped: [] } });

    expect(summary).not.toContain('Not synced');
    expect(summary).not.toContain('Scope unknown');
  });
});

// =============================================================================
// writeJobSummary
// =============================================================================

describe('writeJobSummary', () => {
  /** A stand-in for `core.summary` whose `write()` does what `write` says. */
  function fakeJobSummary(write: () => Promise<unknown>) {
    const writer = { write: jest.fn(write) };
    const summary = { addRaw: jest.fn((_text: string, _addEOL?: boolean) => writer) };
    return { summary, writer };
  }

  it('adds the markdown with a line ending, then writes it', async () => {
    const { summary, writer } = fakeJobSummary(async () => undefined);
    const logger = recordingLogger();

    await writeJobSummary(summary, '## Translation sync\n', logger);

    expect(summary.addRaw).toHaveBeenCalledTimes(1);
    expect(summary.addRaw).toHaveBeenCalledWith('## Translation sync\n', true);
    expect(writer.write).toHaveBeenCalledTimes(1);
    expect(logger.warning).not.toHaveBeenCalled();
  });

  it('warns, and does not fail the sync, when the summary cannot be written', async () => {
    const { summary } = fakeJobSummary(async () => {
      throw new Error('EACCES: permission denied');
    });
    const logger = recordingLogger();

    await expect(
      writeJobSummary(summary, '## Translation sync\n', logger)
    ).resolves.toBeUndefined();

    expect(logger.warning).toHaveBeenCalledWith(
      expect.stringContaining('EACCES: permission denied')
    );
  });

  it('warns, and does not fail the sync, when adding to the summary throws', async () => {
    const summary: JobSummary = {
      addRaw: jest.fn(() => {
        throw new Error('summary buffer closed');
      }),
    };
    const logger = recordingLogger();

    await expect(
      writeJobSummary(summary, '## Translation sync\n', logger)
    ).resolves.toBeUndefined();

    expect(logger.warning).toHaveBeenCalledWith(expect.stringContaining('summary buffer closed'));
  });

  describe('with the real core.summary', () => {
    // CI sets GITHUB_STEP_SUMMARY for the job that runs these tests, so each
    // test sets or clears it and the original is put back afterwards.
    const original = process.env.GITHUB_STEP_SUMMARY;
    let dir: string;

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-scope-summary-'));
    });

    afterEach(() => {
      if (original === undefined) delete process.env.GITHUB_STEP_SUMMARY;
      else process.env.GITHUB_STEP_SUMMARY = original;
      fs.rmSync(dir, { recursive: true, force: true });
    });

    /** A fresh `core.summary`: the module caches the file path and keeps a buffer. */
    function freshCoreSummary(): JobSummary {
      let summary: JobSummary | undefined;
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires -- a fresh module instance per test
        summary = require('@actions/core').summary;
      });
      return summary!;
    }

    it('appends the markdown to the step summary file', async () => {
      const file = path.join(dir, 'step-summary.md');
      fs.writeFileSync(file, '');
      process.env.GITHUB_STEP_SUMMARY = file;
      const logger = recordingLogger();

      await writeJobSummary(freshCoreSummary(), '## Translation sync\n', logger);

      expect(fs.readFileSync(file, 'utf8')).toBe(`## Translation sync\n${os.EOL}`);
      expect(logger.warning).not.toHaveBeenCalled();
    });

    it('warns instead of failing when GITHUB_STEP_SUMMARY is not set', async () => {
      delete process.env.GITHUB_STEP_SUMMARY;
      const logger = recordingLogger();

      await expect(
        writeJobSummary(freshCoreSummary(), '## Translation sync\n', logger)
      ).resolves.toBeUndefined();

      expect(logger.warning).toHaveBeenCalledWith(expect.stringContaining('GITHUB_STEP_SUMMARY'));
    });
  });
});

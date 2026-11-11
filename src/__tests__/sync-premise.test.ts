/**
 * Tests for the sync premise check (#420): a lecture in update mode syncs only
 * when the edition's translation starts from the English the source PR
 * changed.
 *
 * The check reads the `source-sha` the edition's state file records, reads the
 * source file at that commit, and compares the text with the old English the
 * run fetched. The fake reader below answers each read from a table and
 * records it, so each test states what the source holds and checks exactly
 * what was read. `runSync` wires the check in `src/index.ts`, which no test
 * can import (#169); src/__tests__/action-sync-scope.test.ts runs that wiring
 * in the built bundle.
 */

import {
  checkSyncPremise,
  editionPath,
  findCarryingPulls,
  formatPremiseError,
  formatPremiseRecovery,
  githubPremiseReader,
  judgePremise,
  OpenPull,
  PremiseFailure,
  PremiseInput,
  PremiseReader,
  recordedSourceSha,
  StateRead,
  takesUpdateMode,
} from '../sync-premise.js';
import { FileToSync, Logger } from '../sync-orchestrator.js';

// =============================================================================
// FIXTURES
// =============================================================================

const SOURCE = { owner: 'QuantEcon', repo: 'lecture-python.myst' };
const EDITION = { owner: 'QuantEcon', repo: 'lecture-python.zh-cn' };
const EDITION_NAME = 'QuantEcon/lecture-python.zh-cn';
const PR = 1105;
/** This run's source commit: the PR's merge commit. */
const MERGE = 'abcdef0123456789';
/** The commit a state file records. */
const STATE_SHA = 'a4fbd86c0ffee000';

const OLD = '# Lecture\n\nOld text.\n';
const NEW = '# Lecture\n\nNew text.\n';
/** English from a change that never reached the edition. */
const OLDER = '# Lecture\n\nOlder text.\n';

function state(sha: string): string {
  return [
    `source-sha: ${sha}`,
    'synced-at: "2026-11-02"',
    'model: claude-sonnet-5',
    'mode: UPDATE',
    'section-count: 4',
    '',
  ].join('\n');
}

const found = (content: string): StateRead => ({ status: 'found', content });

function updated(filename: string, extra: Partial<FileToSync> = {}): FileToSync {
  return {
    filename,
    type: 'markdown',
    newContent: NEW,
    oldContent: OLD,
    targetContent: '# 讲座\n',
    existingFileSha: 't-sha',
    isNewFile: false,
    sourceCommitSha: MERGE,
    ...extra,
  };
}

function renamed(filename: string, previousFilename: string): FileToSync {
  return {
    filename,
    type: 'renamed',
    newContent: NEW,
    oldContent: OLD,
    targetContent: '# 讲座\n',
    previousFilename,
    oldFileSha: 't-old',
    isNewFile: false,
    sourceCommitSha: MERGE,
  };
}

function metadataBody(
  files: unknown[],
  sourcePR = 1101,
  sourceRepo = 'QuantEcon/lecture-python.myst'
) {
  const metadata = {
    sourceRepo,
    sourcePR,
    sourceCommitSha: 'eeee111',
    targetBaseSha: 'ffff222',
    sourceLanguage: 'en',
    targetLanguage: 'zh-cn',
    claudeModel: 'claude-sonnet-5',
    files,
  };
  return `Body\n\n<!-- translation-sync-metadata\n${JSON.stringify(metadata)}\n-->`;
}

function syncPull(number: number, files: unknown[], sourcePR = 1101): OpenPull {
  return {
    number,
    head: { ref: `translation-sync-2026-11-02T00-00-00-pr-${sourcePR}` },
    body: metadataBody(files, sourcePR),
  };
}

/** A fake reader: source text by `<path>@<ref>`, comparisons by `<base>...<head>`. */
function fakeReader(options: {
  source?: Record<string, string>;
  sourceFailure?: Record<string, Error>;
  compare?: Record<string, string | Error>;
  pulls?: OpenPull[] | Error;
}) {
  const calls: string[] = [];
  const reader: PremiseReader = {
    async readSource(path, ref) {
      calls.push(`source ${path}@${ref}`);
      const failure = options.sourceFailure?.[`${path}@${ref}`];
      if (failure) throw failure;
      return options.source?.[`${path}@${ref}`];
    },
    async compareSource(base, head) {
      calls.push(`compare ${base}...${head}`);
      const answer = options.compare?.[`${base}...${head}`];
      if (answer === undefined) throw new Error('no comparison');
      if (answer instanceof Error) throw answer;
      return answer;
    },
    async listOpenPulls() {
      calls.push('list pulls');
      if (options.pulls instanceof Error) throw options.pulls;
      return options.pulls ?? [];
    },
  };
  return { reader, calls };
}

function recordingLogger() {
  const lines: string[] = [];
  const logger: Logger = {
    info: (m) => lines.push(`info: ${m}`),
    warning: (m) => lines.push(`warning: ${m}`),
    error: (m) => lines.push(`error: ${m}`),
  };
  return { logger, lines };
}

function input(files: FileToSync[], reads: Record<string, StateRead>): PremiseInput {
  return {
    files,
    stateReads: new Map(Object.entries(reads)),
    docsFolder: 'lectures/',
    sourceSha: MERGE,
    source: SOURCE,
    prNumber: PR,
    edition: EDITION,
    targetLanguage: 'zh-cn',
  };
}

// =============================================================================
// PURE PARTS
// =============================================================================

describe('recordedSourceSha', () => {
  it('takes a plain or quoted SHA', () => {
    expect(recordedSourceSha(state('a4fbd86'))).toBe('a4fbd86');
    expect(recordedSourceSha(state('"a4fbd86"'))).toBe('a4fbd86');
    expect(recordedSourceSha(state(' "  a4fbd86  "'))).toBe('a4fbd86');
  });

  it('takes no SHA from a missing, empty or `unknown` value', () => {
    expect(recordedSourceSha('synced-at: "2026-11-02"\nmode: NEW\n')).toBeUndefined();
    expect(recordedSourceSha(state('""'))).toBeUndefined();
    expect(recordedSourceSha(state('unknown'))).toBeUndefined();
    expect(recordedSourceSha(state('~'))).toBeUndefined();
  });

  it('takes no SHA that YAML loads as a number, whose leading zeros may be gone', () => {
    expect(recordedSourceSha(state('1111111'))).toBeUndefined();
    expect(recordedSourceSha(state('0123456'))).toBeUndefined();
  });

  it('takes no SHA from text that is not a YAML mapping', () => {
    expect(recordedSourceSha('')).toBeUndefined();
    expect(recordedSourceSha('- a\n- b\n')).toBeUndefined();
    expect(recordedSourceSha('just text')).toBeUndefined();
    expect(recordedSourceSha('source-sha: [unclosed\n')).toBeUndefined();
  });
});

describe('takesUpdateMode and editionPath', () => {
  it('is true for a changed lecture the edition has, and a rename with a translation', () => {
    expect(takesUpdateMode(updated('lectures/a.md'))).toBe(true);
    expect(takesUpdateMode(renamed('lectures/b.md', 'lectures/a.md'))).toBe(true);
  });

  it('is false for a new lecture, a rename without one, a ToC and a removal', () => {
    expect(takesUpdateMode(updated('lectures/a.md', { isNewFile: true }))).toBe(false);
    expect(
      takesUpdateMode({ ...renamed('lectures/b.md', 'lectures/a.md'), targetContent: '' })
    ).toBe(false);
    expect(takesUpdateMode({ filename: 'lectures/_toc.yml', type: 'toc', isNewFile: false })).toBe(
      false
    );
    expect(takesUpdateMode({ filename: 'lectures/a.md', type: 'removed', isNewFile: false })).toBe(
      false
    );
  });

  it('places a renamed lecture under its old path', () => {
    expect(editionPath(updated('lectures/a.md'))).toBe('lectures/a.md');
    expect(editionPath(renamed('lectures/b.md', 'lectures/a.md'))).toBe('lectures/a.md');
  });
});

describe('judgePremise', () => {
  it('holds when the English at the recorded commit is the English this PR changed', () => {
    expect(judgePremise(OLD, NEW, OLD)).toBe('holds');
  });

  it('is carried when it is the English this PR changed to', () => {
    expect(judgePremise(OLD, NEW, NEW)).toBe('carried');
  });

  it('is a mismatch otherwise, by exact text', () => {
    expect(judgePremise(OLD, NEW, OLDER)).toBe('mismatch');
    expect(judgePremise(OLD, NEW, `${OLD}\n`)).toBe('mismatch');
  });

  it('holds for a pure rename, whose old and new English are the same', () => {
    expect(judgePremise(OLD, OLD, OLD)).toBe('holds');
  });
});

describe('findCarryingPulls', () => {
  const sourcePr = { repo: 'QuantEcon/lecture-python.myst', number: PR };

  it('finds open translation PRs that declare the lecture, in number order', () => {
    const pulls = [
      syncPull(312, [{ path: 'lectures/a.md', type: 'markdown' }]),
      syncPull(311, [{ path: 'lectures/other.md', type: 'markdown' }, { path: 'lectures/a.md' }]),
      syncPull(310, [{ path: 'lectures/other.md', type: 'markdown' }]),
    ];
    expect(findCarryingPulls(pulls, ['lectures/a.md'], sourcePr)).toEqual([311, 312]);
  });

  it('matches either name of a rename, on either side', () => {
    const pulls = [
      syncPull(20, [{ path: 'lectures/b.md', type: 'renamed', previousPath: 'lectures/a.md' }]),
      syncPull(21, [{ path: 'lectures/a.md', type: 'markdown' }]),
    ];
    expect(findCarryingPulls(pulls, ['lectures/a.md'], sourcePr)).toEqual([20, 21]);
    expect(findCarryingPulls(pulls, ['lectures/b.md', 'lectures/a.md'], sourcePr)).toEqual([
      20, 21,
    ]);
  });

  it('counts a forward resync PR, on a `resync/` branch', () => {
    const pull: OpenPull = {
      number: 30,
      head: { ref: 'resync/a' },
      body: metadataBody([{ path: 'lectures/a.md', type: 'markdown' }], 0),
    };
    expect(findCarryingPulls([pull], ['lectures/a.md'], sourcePr)).toEqual([30]);
  });

  it('ignores removals, ToCs, other branches, PRs without metadata and this same source PR', () => {
    const pulls: OpenPull[] = [
      syncPull(40, [{ path: 'lectures/a.md', type: 'removed' }]),
      syncPull(41, [{ path: 'lectures/a.md', type: 'toc' }]),
      { number: 42, head: { ref: 'seed/a' }, body: metadataBody([{ path: 'lectures/a.md' }]) },
      { number: 43, head: { ref: 'translation-sync-x-pr-1' }, body: 'no metadata' },
      { number: 44, head: { ref: 'translation-sync-x-pr-1' }, body: null },
      syncPull(45, [{ path: 'lectures/a.md', type: 'markdown' }], PR),
    ];
    expect(findCarryingPulls(pulls, ['lectures/a.md'], sourcePr)).toEqual([]);
  });
});

describe('message wording', () => {
  const failure = (extra: Partial<PremiseFailure>): PremiseFailure => ({
    file: 'lectures/olg_adaptive_money.md',
    statePath: '.translate/state/olg_adaptive_money.md.yml',
    stateSha: STATE_SHA,
    sourceSha: MERGE,
    case: 'behind',
    openPulls: [],
    ...extra,
  });

  it('says a translation is behind an open PR, names it, and says to merge it first', () => {
    expect(
      formatPremiseError(
        failure({ case: 'still-open', openPulls: [`${EDITION_NAME}#311`] }),
        'zh-cn'
      )
    ).toBe(
      "Translation behind: lectures/olg_adaptive_money.md: zh-cn's translation of it is at " +
        "source `a4fbd86`. This PR's change assumes the English that translation PR " +
        'QuantEcon/lecture-python.zh-cn#311 carries, and it is still open in the edition. ' +
        'Merge it, then carry this change. It was not synced, and no model call was made.'
    );
  });

  it('names every open PR that carries the lecture', () => {
    const error = formatPremiseError(
      failure({ case: 'still-open', openPulls: ['o/e#1', 'o/e#2', 'o/e#3'] }),
      'zh-cn'
    );
    expect(error).toContain(
      'translation PRs o/e#1, o/e#2 and o/e#3 carry, and they are still open in the edition. ' +
        'Merge them, then carry this change.'
    );
  });

  it('says a translation is behind a change that never arrived, and to recover first', () => {
    expect(formatPremiseError(failure({}), 'zh-cn')).toBe(
      "Translation behind: lectures/olg_adaptive_money.md: zh-cn's translation of it is at " +
        'source `a4fbd86`. The source changed the lecture after that, and that change never ' +
        'reached the edition. Recover the lecture first; that brings in this change too. ' +
        'It was not synced, and no model call was made.'
    );
  });

  it('says a translation past this change would have later changes undone', () => {
    expect(formatPremiseError(failure({ case: 'ahead' }), 'fa')).toBe(
      "Translation ahead: lectures/olg_adaptive_money.md: fa's translation of it is at source " +
        "`a4fbd86`, which is later than this PR's merge commit `abcdef0`. Carrying this " +
        'change into it would undo the source changes made since (#276). It was not synced, ' +
        'and no model call was made.'
    );
  });

  it('names both paths of a rename', () => {
    expect(
      formatPremiseError(
        failure({ file: 'lectures/mle_intro.md', previousPath: 'lectures/mle.md' }),
        'zh-cn'
      )
    ).toMatch(/^Translation behind: lectures\/mle_intro\.md \(renamed from lectures\/mle\.md\): /);
  });

  it('gives each case its own recovery, and no resync advice', () => {
    const lines = formatPremiseRecovery(
      [
        failure({ case: 'still-open', openPulls: [`${EDITION_NAME}#311`] }),
        failure({ file: 'lectures/mle_intro.md', previousPath: 'lectures/mle.md' }),
        failure({ file: 'lectures/sub/cons_smooth.md' }),
        failure({ file: 'lectures/later.md', case: 'ahead' }),
      ],
      'lectures/',
      'zh-cn'
    );
    expect(lines).toEqual([
      "These lectures were not synced: zh-cn's translation of each does not start from the " +
        'English this PR changed, so its change cannot be carried in.',
      '',
      '- `lectures/olg_adaptive_money.md`: merge QuantEcon/lecture-python.zh-cn#311 in the ' +
        "edition first, then carry this PR's change into the lecture.",
      '- `lectures/mle_intro.md` (renamed from `lectures/mle.md`): recover the lecture first ' +
        "with `translate forward -f mle_intro.md`, after moving the edition's " +
        '`lectures/mle.md` and its state file to the new name, run from a checkout of the ' +
        "source's default branch. That includes this PR's change. A `\\translate-resync` of " +
        'this PR cannot recover it.',
      '- `lectures/sub/cons_smooth.md`: recover the lecture first with `translate forward -f ' +
        "sub/cons_smooth.md`, run from a checkout of the source's default branch. That " +
        "includes this PR's change. A `\\translate-resync` of this PR cannot recover it.",
      "- `lectures/later.md`: if the lecture already has this PR's change, nothing is owed. " +
        'If it does not, bring it up to date with `translate forward -f later.md`, run from a ' +
        "checkout of the source's default branch.",
      '',
      '`translate forward` regenerates the whole lecture. On a lecture that has been natively ' +
        'reviewed, carry the missed changes in by hand instead.',
    ]);
  });

  it('gives no recovery lines when no lecture failed the check', () => {
    expect(formatPremiseRecovery([], 'lectures/', 'zh-cn')).toEqual([]);
  });
});

// =============================================================================
// THE CHECK
// =============================================================================

describe('checkSyncPremise', () => {
  const A = 'lectures/a.md';
  const A_STATE = '.translate/state/a.md.yml';
  const atState = (path: string) => `${path}@${STATE_SHA}`;

  it('keeps a lecture whose translation starts from the old English', async () => {
    const { reader, calls } = fakeReader({ source: { [atState(A)]: OLD } });
    const { logger, lines } = recordingLogger();
    const file = updated(A);
    const result = await checkSyncPremise(
      input([file], { [A_STATE]: found(state(STATE_SHA)) }),
      reader,
      logger
    );
    expect(result).toEqual({ files: [file], failures: [], errors: [] });
    expect(calls).toEqual([`source ${A}@${STATE_SHA}`]);
    expect(lines).toEqual([
      `info: ${A}: premise holds — the translation is at source a4fbd86, whose English is the ` +
        'English this PR changed',
    ]);
  });

  it('holds back a lecture behind a change that never arrived, and lists the open PRs once', async () => {
    const { reader, calls } = fakeReader({
      source: { [atState(A)]: OLDER },
      compare: { [`${STATE_SHA}...${MERGE}`]: 'ahead' },
      pulls: [syncPull(310, [{ path: 'lectures/other.md', type: 'markdown' }])],
    });
    const { logger, lines } = recordingLogger();
    const result = await checkSyncPremise(
      input([updated(A)], { [A_STATE]: found(state(STATE_SHA)) }),
      reader,
      logger
    );
    expect(result.files).toEqual([]);
    expect(result.failures).toEqual([
      {
        file: A,
        statePath: A_STATE,
        stateSha: STATE_SHA,
        sourceSha: MERGE,
        case: 'behind',
        openPulls: [],
      },
    ]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/^Translation behind: lectures\/a\.md: zh-cn's /);
    expect(lines).toContain(`error: ${result.errors[0]}`);
    expect(calls).toEqual([
      `source ${A}@${STATE_SHA}`,
      `compare ${STATE_SHA}...${MERGE}`,
      'list pulls',
    ]);
  });

  it('names the open translation PR that carries a lecture behind', async () => {
    const { reader } = fakeReader({
      source: { [atState(A)]: OLDER },
      compare: { [`${STATE_SHA}...${MERGE}`]: 'ahead' },
      pulls: [syncPull(311, [{ path: A, type: 'markdown' }])],
    });
    const result = await checkSyncPremise(
      input([updated(A)], { [A_STATE]: found(state(STATE_SHA)) }),
      reader,
      recordingLogger().logger
    );
    expect(result.failures.map((f) => [f.case, f.openPulls])).toEqual([
      ['still-open', [`${EDITION_NAME}#311`]],
    ]);
    expect(result.errors[0]).toContain(`translation PR ${EDITION_NAME}#311 carries`);
  });

  it('reports a lecture as behind, without a PR, when the listing fails', async () => {
    const { reader } = fakeReader({
      source: { [atState(A)]: OLDER },
      compare: { [`${STATE_SHA}...${MERGE}`]: 'ahead' },
      pulls: Object.assign(new Error('Server Error'), { status: 502 }),
    });
    const { logger, lines } = recordingLogger();
    const result = await checkSyncPremise(
      input([updated(A)], { [A_STATE]: found(state(STATE_SHA)) }),
      reader,
      logger
    );
    expect(result.failures.map((f) => f.case)).toEqual(['behind']);
    expect(result.errors).toHaveLength(1);
    expect(lines).toContain(
      `warning: Could not list the open PRs in ${EDITION_NAME} (Server Error); the lectures ` +
        'behind are reported without one'
    );
  });

  it('reports a lecture as behind when the comparison fails', async () => {
    const { reader } = fakeReader({ source: { [atState(A)]: OLDER } });
    const result = await checkSyncPremise(
      input([updated(A)], { [A_STATE]: found(state(STATE_SHA)) }),
      reader,
      recordingLogger().logger
    );
    expect(result.failures.map((f) => f.case)).toEqual(['behind']);
  });

  it('holds back a lecture already past this change, and lists no PRs for it', async () => {
    const { reader, calls } = fakeReader({
      source: { [atState(A)]: OLDER },
      compare: { [`${STATE_SHA}...${MERGE}`]: 'behind' },
    });
    const result = await checkSyncPremise(
      input([updated(A)], { [A_STATE]: found(state(STATE_SHA)) }),
      reader,
      recordingLogger().logger
    );
    expect(result.files).toEqual([]);
    expect(result.failures.map((f) => f.case)).toEqual(['ahead']);
    expect(result.errors[0]).toMatch(/^Translation ahead: /);
    expect(calls).not.toContain('list pulls');
  });

  it('keeps a lecture whose translation already carries this change', async () => {
    const { reader, calls } = fakeReader({ source: { [atState(A)]: NEW } });
    const file = updated(A);
    const result = await checkSyncPremise(
      input([file], { [A_STATE]: found(state(STATE_SHA)) }),
      reader,
      recordingLogger().logger
    );
    expect(result).toEqual({ files: [file], failures: [], errors: [] });
    expect(calls).toEqual([`source ${A}@${STATE_SHA}`]);
  });

  describe('a premise it cannot check: the lecture syncs as before', () => {
    const cases: Array<[string, StateRead | undefined, string]> = [
      ['no state file', { status: 'missing' }, `QuantEcon/lecture-python.zh-cn has no ${A_STATE}`],
      ['no state read at all', undefined, `QuantEcon/lecture-python.zh-cn has no ${A_STATE}`],
      ['a state file without source-sha', found('mode: NEW\n'), `${A_STATE} records no usable`],
      ['source-sha: unknown', found(state('unknown')), `${A_STATE} records no usable`],
      ['an unquoted all-digit SHA', found(state('1111111')), `${A_STATE} records no usable`],
    ];
    it.each(cases)('%s: no read, an info line', async (_name, read, why) => {
      const { reader, calls } = fakeReader({});
      const { logger, lines } = recordingLogger();
      const file = updated(A);
      const result = await checkSyncPremise(
        input([file], read ? { [A_STATE]: read } : {}),
        reader,
        logger
      );
      expect(result).toEqual({ files: [file], failures: [], errors: [] });
      expect(calls).toEqual([]);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/^info: lectures\/a\.md: premise not checked — /);
      expect(lines[0]).toContain(why);
      expect(lines[0]).toMatch(/; syncing as before$/);
    });

    it('the source has no such file or commit at the recorded SHA', async () => {
      const { reader, calls } = fakeReader({});
      const { logger, lines } = recordingLogger();
      const file = updated(A);
      const result = await checkSyncPremise(
        input([file], { [A_STATE]: found(state(STATE_SHA)) }),
        reader,
        logger
      );
      expect(result.files).toEqual([file]);
      expect(result.errors).toEqual([]);
      expect(calls).toEqual([`source ${A}@${STATE_SHA}`]);
      expect(lines).toEqual([
        `info: ${A}: premise not checked — the source has no ${A} at a4fbd86; syncing as before`,
      ]);
    });

    it('the source read fails: a warning, never an error', async () => {
      const { reader } = fakeReader({
        sourceFailure: { [atState(A)]: Object.assign(new Error('Bad gateway'), { status: 502 }) },
      });
      const { logger, lines } = recordingLogger();
      const file = updated(A);
      const result = await checkSyncPremise(
        input([file], { [A_STATE]: found(state(STATE_SHA)) }),
        reader,
        logger
      );
      expect(result.files).toEqual([file]);
      expect(result.errors).toEqual([]);
      expect(lines).toEqual([
        `warning: ${A}: premise not checked — could not read ${A} at a4fbd86 from the source ` +
          '(status 502): Bad gateway; syncing as before',
      ]);
    });

    it('the run has no previous English for the lecture', async () => {
      const { reader, calls } = fakeReader({});
      const file = updated(A, { oldContent: '' });
      const result = await checkSyncPremise(
        input([file], { [A_STATE]: found(state(STATE_SHA)) }),
        reader,
        recordingLogger().logger
      );
      expect(result.files).toEqual([file]);
      expect(calls).toEqual([]);
    });
  });

  it('holds back, with an error, a lecture whose state file the edition cannot serve', async () => {
    const { reader, calls } = fakeReader({});
    const { logger, lines } = recordingLogger();
    const result = await checkSyncPremise(
      input([updated(A)], { [A_STATE]: { status: 'error', message: 'status 500: HTTP 500' } }),
      reader,
      logger
    );
    const error =
      `Fetch failed (state): ${A}: could not read ${A_STATE} from ${EDITION_NAME} (status 500: ` +
      "HTTP 500), so whether its translation starts from this PR's English could not be " +
      'checked. It was not synced.';
    expect(result).toEqual({ files: [], failures: [], errors: [error] });
    expect(calls).toEqual([]);
    expect(lines).toEqual([`error: ${error}`]);
  });

  it('reads nothing for a new lecture, a ToC or a removal, even with a state file', async () => {
    const { reader, calls } = fakeReader({});
    const files: FileToSync[] = [
      updated(A, { isNewFile: true, targetContent: '' }),
      { filename: 'lectures/_toc.yml', type: 'toc', newContent: 'x', isNewFile: false },
      { filename: 'lectures/gone.md', type: 'removed', existingFileSha: 't', isNewFile: false },
    ];
    const result = await checkSyncPremise(
      input(files, {
        [A_STATE]: found(state(STATE_SHA)),
        '.translate/state/gone.md.yml': found(state(STATE_SHA)),
      }),
      reader,
      recordingLogger().logger
    );
    expect(result).toEqual({ files, failures: [], errors: [] });
    expect(calls).toEqual([]);
  });

  it('checks a rename by its old name: the old state file, and the old path at that commit', async () => {
    const { reader, calls } = fakeReader({
      source: { [atState('lectures/mle.md')]: OLDER },
      compare: { [`${STATE_SHA}...${MERGE}`]: 'ahead' },
    });
    const result = await checkSyncPremise(
      input([renamed('lectures/mle_intro.md', 'lectures/mle.md')], {
        '.translate/state/mle_intro.md.yml': { status: 'missing' },
        '.translate/state/mle.md.yml': found(state(STATE_SHA)),
      }),
      reader,
      recordingLogger().logger
    );
    expect(calls).toEqual([
      `source lectures/mle.md@${STATE_SHA}`,
      `compare ${STATE_SHA}...${MERGE}`,
      'list pulls',
    ]);
    expect(result.failures).toEqual([
      {
        file: 'lectures/mle_intro.md',
        previousPath: 'lectures/mle.md',
        statePath: '.translate/state/mle.md.yml',
        stateSha: STATE_SHA,
        sourceSha: MERGE,
        case: 'behind',
        openPulls: [],
      },
    ]);
  });

  it('keeps the other files, in order, and lists the open PRs once for two lectures behind', async () => {
    const B = 'lectures/b.md';
    const C = 'lectures/c.md';
    const { reader, calls } = fakeReader({
      source: { [atState(A)]: OLDER, [atState(B)]: OLD, [atState(C)]: OLDER },
      compare: { [`${STATE_SHA}...${MERGE}`]: 'ahead' },
      pulls: [syncPull(311, [{ path: C, type: 'markdown' }])],
    });
    const toc: FileToSync = {
      filename: 'lectures/_toc.yml',
      type: 'toc',
      newContent: 'x',
      isNewFile: false,
    };
    const b = updated(B);
    const result = await checkSyncPremise(
      input([updated(A), b, toc, updated(C)], {
        [A_STATE]: found(state(STATE_SHA)),
        '.translate/state/b.md.yml': found(state(STATE_SHA)),
        '.translate/state/c.md.yml': found(state(STATE_SHA)),
      }),
      reader,
      recordingLogger().logger
    );
    expect(result.files).toEqual([b, toc]);
    expect(result.failures.map((f) => [f.file, f.case])).toEqual([
      [A, 'behind'],
      [C, 'still-open'],
    ]);
    expect(result.errors.map((e) => e.split(':')[0])).toEqual([
      'Translation behind',
      'Translation behind',
    ]);
    expect(calls.filter((call) => call === 'list pulls')).toHaveLength(1);
  });
});

// =============================================================================
// THE GITHUB READER
// =============================================================================

describe('githubPremiseReader', () => {
  function fakeOctokit(answers: {
    content?: unknown;
    contentError?: unknown;
    compare?: unknown;
    pulls?: unknown[];
  }) {
    const requests: Array<[string, unknown]> = [];
    const list = { endpoint: 'pulls.list' };
    const octokit = {
      rest: {
        repos: {
          getContent: async (params: unknown) => {
            requests.push(['getContent', params]);
            if (answers.contentError) throw answers.contentError;
            return { data: answers.content };
          },
          compareCommitsWithBasehead: async (params: unknown) => {
            requests.push(['compare', params]);
            return { data: answers.compare };
          },
        },
        pulls: { list },
      },
      paginate: async (route: unknown, params: unknown) => {
        requests.push(['paginate', { same: route === list, params }]);
        return answers.pulls ?? [];
      },
    };
    return { octokit, requests };
  }

  it('reads the source file at the commit, decoding its content', async () => {
    const { octokit, requests } = fakeOctokit({
      content: { type: 'file', content: Buffer.from('English ✓').toString('base64') },
    });
    const reader = githubPremiseReader(octokit, SOURCE, EDITION);
    await expect(reader.readSource('lectures/a.md', STATE_SHA)).resolves.toBe('English ✓');
    expect(requests).toEqual([
      ['getContent', { ...SOURCE, path: 'lectures/a.md', ref: STATE_SHA }],
    ]);
  });

  it('answers undefined for a 404, a 422 (no such commit) and a directory', async () => {
    for (const status of [404, 422]) {
      const { octokit } = fakeOctokit({ contentError: Object.assign(new Error('x'), { status }) });
      await expect(
        githubPremiseReader(octokit, SOURCE, EDITION).readSource('a', 'b')
      ).resolves.toBeUndefined();
    }
    const { octokit } = fakeOctokit({ content: [{ name: 'a.md' }] });
    await expect(
      githubPremiseReader(octokit, SOURCE, EDITION).readSource('a', 'b')
    ).resolves.toBeUndefined();
  });

  it('throws any other failure', async () => {
    const { octokit } = fakeOctokit({
      contentError: Object.assign(new Error('Server Error'), { status: 500 }),
    });
    await expect(
      githubPremiseReader(octokit, SOURCE, EDITION).readSource('a', 'b')
    ).rejects.toThrow('Server Error');
  });

  it('compares the recorded commit with the merge commit in the source', async () => {
    const { octokit, requests } = fakeOctokit({ compare: { status: 'ahead', files: [] } });
    await expect(
      githubPremiseReader(octokit, SOURCE, EDITION).compareSource(STATE_SHA, MERGE)
    ).resolves.toBe('ahead');
    expect(requests).toEqual([
      ['compare', { ...SOURCE, basehead: `${STATE_SHA}...${MERGE}`, per_page: 1 }],
    ]);
  });

  it("lists the edition's open PRs", async () => {
    const pulls = [syncPull(1, [])];
    const { octokit, requests } = fakeOctokit({ pulls });
    await expect(githubPremiseReader(octokit, SOURCE, EDITION).listOpenPulls()).resolves.toEqual(
      pulls
    );
    expect(requests).toEqual([
      ['paginate', { same: true, params: { ...EDITION, state: 'open', per_page: 100 } }],
    ]);
  });
});

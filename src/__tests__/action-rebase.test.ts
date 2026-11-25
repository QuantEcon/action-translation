/**
 * Rebase mode's write, run end to end in the built bundle (#280).
 *
 * git-commit.test.ts covers the commit module against a mock Octokit. The
 * rebase itself, `runRebase` and `rebaseSinglePR`, lives in `src/index.ts`,
 * which runs the action as soon as it is loaded, so no test can import it
 * (#169). This file runs the built bundle, dist-action/index.js, in a child
 * Node process against the fake GitHub API in
 * src/test-support/action-bundle-runner.cjs, as action-sync-scope.test.ts does
 * for sync mode, and pins what a rebase does:
 *
 * - every read of the edition is made at the `main` SHA pinned when the PR's
 *   rebase began, except the rebase cache's reads of the PR branch and of the
 *   PR's old baseline;
 * - the branch moves once, to one commit whose only parent is that SHA, and
 *   never to the SHA itself, and nothing is written or deleted through the
 *   contents API;
 * - the PR is read back after the move, and one that is no longer open fails
 *   the run;
 * - a rebuilt tree equal to `main`'s closes the PR with a comment, and moves
 *   nothing;
 * - a commit that cannot be built fails the run with the branch untouched.
 *
 * It runs the bundle, so it needs `npm run build` first, as CI does. GitHub
 * and the model host are both fakes, on names that never resolve. The sibling
 * PR carries a ToC change and a removed lecture, which need no model call, and
 * the runner counts every request to the model host.
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..');
const BUNDLE = path.join(ROOT, 'dist-action', 'index.js');
const RUNNER = path.join(ROOT, 'src', 'test-support', 'action-bundle-runner.cjs');
// The runner fakes GitHub with undici's MockAgent; see action-sync-scope.test.ts.
const UNDICI = require.resolve('undici');

// =============================================================================
// SCENARIO FIXTURES
// =============================================================================

const SOURCE_REPO = 'QuantEcon/source';
const EDITION = 'QuantEcon/edition.ml';
/** Hosts that never resolve, so nothing could reach a real service. */
const GITHUB_API = 'https://api.github.invalid';
const MODEL_HOST = 'https://anthropic.invalid';

/** The edition PR whose merge starts the rebase. */
const MERGED_PR = 31;
/** The open sibling PR that shares a file with it. */
const SIBLING_PR = 32;
const SIBLING_BRANCH = 'translation-sync-2026-11-01T00-00-00-pr-12';
/** The source commit the sibling translates. */
const SOURCE_SHA = 'feed0000';
/** The edition's `main` when the sibling was opened: its rebase-cache baseline. */
const OLD_BASE = 'old0000';
/** The edition's `main` now, as the fake reports it, and the tree it points at. */
const BASE = 'base000';
const BASE_TREE = `tree-of-${BASE}`;

const TOC_BEFORE = 'format: jb-book\nroot: intro\nchapters:\n  - file: a\n  - file: old\n';
const TOC_AFTER = 'format: jb-book\nroot: intro\nchapters:\n  - file: a\n';
const OLD_LECTURE = '# പഴയത്\n\nഉള്ളടക്കം.\n';
const STATE = [
  'source-sha: 1111111',
  'synced-at: "2026-10-01"',
  'model: claude-sonnet-5',
  'mode: NEW',
  'section-count: 1',
  '',
].join('\n');

const METADATA = {
  schemaVersion: 1,
  sourceRepo: SOURCE_REPO,
  sourcePR: 12,
  mode: 'sync',
  sourceCommitSha: SOURCE_SHA,
  targetBaseSha: OLD_BASE,
  sourceLanguage: 'en',
  targetLanguage: 'ml',
  claudeModel: 'claude-sonnet-5',
  files: [
    { path: 'lectures/_toc.yml', type: 'toc' },
    { path: 'lectures/old.md', type: 'removed' },
  ],
};
/** A sibling PR's body, carrying `metadata`. */
function bodyFor(metadata: object): string {
  return [
    'Translation sync for source PR #12.',
    '',
    '<!-- translation-sync-metadata',
    JSON.stringify(metadata, null, 2),
    '-->',
    '',
  ].join('\n');
}
const SIBLING_BODY = bodyFor(METADATA);

interface Scenario {
  mergedPrFiles: Array<{ filename: string; status: string }>;
  openPulls: Array<{ number: number; head: { ref: string; sha: string }; body: string }>;
  /** As `target`, without the plain-path and array forms. */
  source: Record<string, string | { status: number }>;
  /** A path absent here answers 404; `{ status }` fails the read with that status. */
  target: Record<string, string | { status: number }>;
  pullStates?: Record<string, string>;
  treeUnchanged?: boolean;
  gitFailures?: { trees?: number; commits?: number; refs?: number };
  /** The model's replies, in turn; with none, every model call fails. */
  modelReplies?: string[];
}

function rebaseScenario(extra: Partial<Scenario> = {}): Scenario {
  return {
    mergedPrFiles: [{ filename: 'lectures/_toc.yml', status: 'modified' }],
    openPulls: [
      { number: SIBLING_PR, head: { ref: SIBLING_BRANCH, sha: 'head000' }, body: SIBLING_BODY },
    ],
    source: { [`lectures/_toc.yml@${SOURCE_SHA}`]: TOC_AFTER },
    target: {
      'lectures/_toc.yml': TOC_BEFORE,
      'lectures/old.md': OLD_LECTURE,
      '.translate/state/old.md.yml': STATE,
    },
    ...extra,
  };
}

// =============================================================================
// RUNNING THE BUNDLE
// =============================================================================

interface RunLog {
  requests: string[];
  writes: unknown[];
  deletes: unknown[];
  comments: Array<{ on: string; body: string }>;
  trees: Array<{ base_tree: string; tree: Array<Record<string, unknown>> }>;
  commits: Array<{ message: string; tree: string; parents: string[] }>;
  refUpdates: Array<{ ref: string; sha: string; force: boolean }>;
  pullUpdates: Array<{ number: number; state?: string }>;
  modelRequests: number;
  modelPrompts: string[];
  unmocked: string[];
  mockKept: boolean;
  crash: string | null;
}

interface BundleRun {
  name: string;
  status: number | null;
  stdout: string;
  stderr: string;
  log?: RunLog;
}

let bundleChecked = false;
let tmpRoot: string | undefined;

afterAll(() => {
  if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
});

/** Newest mtime of a file the build compiles, as action-sync-scope.test.ts reckons it. */
function newestSourceMtime(dir: string): number {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestSourceMtime(full));
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
      newest = Math.max(newest, fs.statSync(full).mtimeMs);
    }
  }
  return newest;
}

/** Fail with the fix when the bundle is missing or older than src/. */
function requireCurrentBundle(): void {
  if (bundleChecked) return;
  if (!fs.existsSync(BUNDLE)) {
    throw new Error(`${BUNDLE} not found. Run \`npm run build\` before running these tests.`);
  }
  if (newestSourceMtime(path.join(ROOT, 'src')) > fs.statSync(BUNDLE).mtimeMs) {
    throw new Error(
      `${BUNDLE} is older than src/. Run \`npm run build\` before running these tests.`
    );
  }
  bundleChecked = true;
}

/**
 * Run the bundle in rebase mode, as the edition's workflow does when the
 * merged PR closes. Its environment is built from scratch, never inherited.
 */
function runRebase(name: string, scenario: Scenario): BundleRun {
  requireCurrentBundle();
  tmpRoot ??= fs.mkdtempSync(path.join(os.tmpdir(), 'action-rebase-'));
  const dir = fs.mkdtempSync(path.join(tmpRoot, `${name}-`));
  const file = (base: string, content: string) => {
    const p = path.join(dir, base);
    fs.writeFileSync(p, content);
    return p;
  };

  const event = {
    action: 'closed',
    pull_request: {
      number: MERGED_PR,
      merged: true,
      head: { ref: 'translation-sync-2026-10-31T00-00-00-pr-11' },
      base: { ref: 'main' },
    },
    repository: { default_branch: 'main' },
  };
  const scenarioPath = file('scenario.json', JSON.stringify(scenario));
  const eventPath = file('event.json', JSON.stringify(event));
  const logPath = path.join(dir, 'log.json');

  const env: NodeJS.ProcessEnv = {
    UNDICI_PATH: UNDICI,
    BUNDLE_PATH: BUNDLE,
    ANTHROPIC_BASE_URL: MODEL_HOST,
    GITHUB_API_URL: GITHUB_API,
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_EVENT_PATH: eventPath,
    // Rebase mode runs in the edition; the runner learns the source separately.
    GITHUB_REPOSITORY: EDITION,
    RUNNER_SOURCE_REPO: SOURCE_REPO,
    'INPUT_TARGET-REPO': EDITION,
    GITHUB_STEP_SUMMARY: file('summary.md', ''),
    GITHUB_OUTPUT: file('output.txt', ''),
    INPUT_MODE: 'rebase',
    'INPUT_DOCS-FOLDER': 'lectures',
    'INPUT_ANTHROPIC-API-KEY': 'test-key',
    'INPUT_GITHUB-TOKEN': 'test-token',
  };
  for (const variable of ['PATH', 'HOME']) {
    const value = process.env[variable];
    if (value !== undefined) env[variable] = value;
  }

  const child = spawnSync(process.execPath, [RUNNER, scenarioPath, logPath], {
    env,
    encoding: 'utf8',
    timeout: 60_000,
    killSignal: 'SIGKILL',
  });

  let log: RunLog | undefined;
  try {
    log = JSON.parse(fs.readFileSync(logPath, 'utf8')) as RunLog;
  } catch {
    log = undefined;
  }
  return {
    name,
    status: child.status,
    stdout: child.stdout ?? '',
    stderr: child.stderr ?? '',
    log,
  };
}

/** The run's own record, to read beside a failed assertion. */
function describeRun(run: BundleRun): string {
  const quote = (text: string) =>
    text.trimEnd() === ''
      ? '│ (empty)'
      : text
          .trimEnd()
          .split('\n')
          .map((line) => `│ ${line}`)
          .join('\n');
  return [
    `── bundle run "${run.name}": exit status ${run.status}`,
    '── requests:',
    quote((run.log?.requests ?? []).join('\n')),
    '── stdout:',
    quote(run.stdout),
    '── stderr:',
    quote(run.stderr),
  ].join('\n');
}

/**
 * The run's log, after the checks every rebase run must pass. A run makes no
 * model call unless the test says how many.
 */
function checkedLog(run: BundleRun, expectedStatus: number, modelRequests = 0): RunLog {
  const where = `\n${describeRun(run)}`;
  if (!run.log) throw new Error(`the runner left no log${where}`);
  if (run.log.crash) throw new Error(`the bundle crashed: ${run.log.crash}${where}`);
  if (run.status !== expectedStatus) {
    throw new Error(`exit status ${run.status}, expected ${expectedStatus}${where}`);
  }
  expect(run.log.unmocked).toEqual([]);
  expect(run.log.mockKept).toBe(true);
  expect(run.log.modelRequests).toBe(modelRequests);
  // Nothing reaches the branch through the contents API any more.
  expect(run.log.writes).toEqual([]);
  expect(run.log.deletes).toEqual([]);
  expect(run.log.requests.filter((line) => /^(PUT|DELETE) /.test(line))).toEqual([]);
  return run.log;
}

const editionReads = (log: RunLog) =>
  log.requests.filter((line) => line.startsWith(`GET /repos/${EDITION}/contents/`));

// =============================================================================
// TESTS
// =============================================================================

describe('rebase mode, run in the built bundle', () => {
  it('reads the edition at the pinned main and moves the branch once, to one commit on it', () => {
    const run = runRebase('moved', rebaseScenario());
    const log = checkedLog(run, 0);

    // Every read of the edition carries a ref; all but the rebase cache's are at BASE.
    const reads = editionReads(log);
    expect(reads.filter((line) => !line.includes('?ref='))).toEqual([]);
    expect(reads.filter((line) => !line.endsWith(`?ref=${BASE}`)).sort()).toEqual(
      [
        `GET /repos/${EDITION}/contents/lectures/_toc.yml?ref=${SIBLING_BRANCH}`,
        `GET /repos/${EDITION}/contents/lectures/_toc.yml?ref=${OLD_BASE}`,
        `GET /repos/${EDITION}/contents/lectures/old.md?ref=${SIBLING_BRANCH}`,
        `GET /repos/${EDITION}/contents/lectures/old.md?ref=${OLD_BASE}`,
      ].sort()
    );
    // The ToC, the removal, its state file, and the bibliography config.
    expect(reads).toEqual(
      expect.arrayContaining([
        `GET /repos/${EDITION}/contents/lectures/_toc.yml?ref=${BASE}`,
        `GET /repos/${EDITION}/contents/lectures/old.md?ref=${BASE}`,
        `GET /repos/${EDITION}/contents/.translate/state/old.md.yml?ref=${BASE}`,
        `GET /repos/${EDITION}/contents/lectures/_config.yml?ref=${BASE}`,
      ])
    );
    // The source is read at the commit the PR translates, bibliography included.
    const sourceReads = log.requests.filter((line) =>
      line.startsWith(`GET /repos/${SOURCE_REPO}/contents/`)
    );
    expect(sourceReads.length).toBeGreaterThan(0);
    for (const line of sourceReads) expect(line).toContain(`?ref=${SOURCE_SHA}`);

    // `main` is read once, before any content.
    const mainReads = log.requests
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line === `GET /repos/${EDITION}/git/ref/heads/main`);
    expect(mainReads).toHaveLength(1);
    const firstContentRead = log.requests.findIndex((line) => line.includes('/contents/'));
    expect(mainReads[0].index).toBeLessThan(firstContentRead);

    // One tree on main's, one commit whose only parent is main, one ref move.
    expect(log.trees).toEqual([
      {
        base_tree: BASE_TREE,
        tree: [
          { path: 'lectures/_toc.yml', mode: '100644', type: 'blob', content: TOC_AFTER },
          { path: 'lectures/old.md', mode: '100644', type: 'blob', sha: null },
          { path: '.translate/state/old.md.yml', mode: '100644', type: 'blob', sha: null },
        ],
      },
    ]);
    expect(log.commits).toHaveLength(1);
    expect(log.commits[0].parents).toEqual([BASE]);
    expect(log.commits[0].tree).toBe('tree-rebased');
    expect(log.commits[0].message).toContain(`after #${MERGED_PR}`);
    expect(log.refUpdates).toEqual([
      { ref: `heads/${SIBLING_BRANCH}`, sha: 'commit-rebased', force: true },
    ]);

    // The move comes after the commit, and the PR is read back after it.
    const at = (line: string) => log.requests.indexOf(line);
    const move = at(`PATCH /repos/${EDITION}/git/refs/heads/${SIBLING_BRANCH}`);
    expect(move).toBeGreaterThan(at(`POST /repos/${EDITION}/git/commits`));
    expect(at(`GET /repos/${EDITION}/pulls/${SIBLING_PR}`)).toBeGreaterThan(move);

    expect(log.pullUpdates).toEqual([]);
    expect(log.comments).toHaveLength(1);
    expect(log.comments[0].on).toBe(`${EDITION}#${SIBLING_PR}`);
    expect(log.comments[0].body).toContain(
      `♻️ **Automatically rebased** after #${MERGED_PR} was merged.`
    );
    expect(run.stdout).toContain('♻️ Rebase complete: 1 rebased, 0 skipped, 0 errors.');
  });

  it("closes the PR with a comment, and moves nothing, when the rebuilt tree is main's own", () => {
    const run = runRebase('unchanged', rebaseScenario({ treeUnchanged: true }));
    const log = checkedLog(run, 0);

    expect(log.trees).toHaveLength(1);
    expect(log.commits).toEqual([]);
    expect(log.refUpdates).toEqual([]);
    expect(log.pullUpdates).toEqual([{ number: SIBLING_PR, state: 'closed' }]);
    expect(log.comments).toHaveLength(1);
    const [comment] = log.comments;
    expect(comment.on).toBe(`${EDITION}#${SIBLING_PR}`);
    expect(comment.body).toContain('Closed: nothing left to carry.');
    expect(comment.body).toContain('- `lectures/_toc.yml`\n- `lectures/old.md`');
    expect(comment.body).not.toContain('Automatically rebased');
    // The comment goes before the close.
    expect(
      log.requests.indexOf(`POST /repos/${EDITION}/issues/${SIBLING_PR}/comments`)
    ).toBeLessThan(log.requests.indexOf(`PATCH /repos/${EDITION}/pulls/${SIBLING_PR}`));
    expect(run.stdout).toContain(
      '♻️ Rebase complete: 0 rebased, 1 closed (nothing left to carry), 0 skipped, 0 errors.'
    );
  });

  it('fails the run, naming the PR and the branch, when the PR is closed after the move', () => {
    const run = runRebase(
      'closed-after',
      rebaseScenario({ pullStates: { [SIBLING_PR]: 'closed' } })
    );
    const log = checkedLog(run, 1);

    expect(log.refUpdates).toHaveLength(1);
    // No attempt to reopen it.
    expect(log.pullUpdates).toEqual([]);
    expect(log.comments).toHaveLength(1);
    expect(log.comments[0].body).toContain(
      `⚠️ **Automatic rebase failed** after #${MERGED_PR} was merged.`
    );
    expect(log.comments[0].body).toContain(
      `PR #${SIBLING_PR} is closed after ${SIBLING_BRANCH} moved to the rebased commit`
    );
    // The recovery advice (#281): the CLI route, and a resync of the source
    // PR, named across repositories, only under #276's precondition.
    expect(log.comments[0].body).toContain('`translate forward -f <file>`');
    expect(log.comments[0].body).toContain(
      `This PR syncs ${SOURCE_REPO}#12. A \`\\translate-resync\` on that PR`
    );
    // Every mention of the command carries its backslash.
    expect(log.comments[0].body).not.toMatch(/(^|[^\\])translate-resync/);
    expect(run.stdout).toContain('Rebase complete: 0 rebased, 0 skipped, 1 errors.');
  });

  it('fails the run with the branch untouched when the commit cannot be built', () => {
    const run = runRebase('unbuilt', rebaseScenario({ gitFailures: { commits: 422 } }));
    const log = checkedLog(run, 1);

    expect(log.commits).toHaveLength(1);
    expect(log.refUpdates).toEqual([]);
    expect(log.pullUpdates).toEqual([]);
    expect(log.comments).toHaveLength(1);
    expect(log.comments[0].body).toContain(
      `could not build the rebased commit on main (${BASE}); branch left untouched`
    );
  });
});

describe('rebase mode, a removed lecture main cannot serve (#396)', () => {
  const target = rebaseScenario().target;

  it('fails the run with the branch untouched when the lecture read fails', () => {
    const run = runRebase(
      'removal-502',
      rebaseScenario({ target: { ...target, 'lectures/old.md': { status: 502 } } })
    );
    const log = checkedLog(run, 1);

    expect(log.trees).toEqual([]);
    expect(log.commits).toEqual([]);
    expect(log.refUpdates).toEqual([]);
    expect(log.comments).toHaveLength(1);
    expect(log.comments[0].body).toContain(
      `⚠️ **Automatic rebase failed** after #${MERGED_PR} was merged.`
    );
    expect(log.comments[0].body).toContain(
      `content fetch failed for 1 file(s); branch left untouched: lectures/old.md: Error: ` +
        `Could not read lectures/old.md from ${EDITION} at ${BASE} (status 502)`
    );
  });

  it('fails the run with the branch untouched when its state file read fails', () => {
    const run = runRebase(
      'removal-state-502',
      rebaseScenario({ target: { ...target, '.translate/state/old.md.yml': { status: 502 } } })
    );
    const log = checkedLog(run, 1);

    expect(log.trees).toEqual([]);
    expect(log.refUpdates).toEqual([]);
    expect(log.comments).toHaveLength(1);
    expect(log.comments[0].body).toContain(
      'state read failed for 1 file(s); branch left untouched: Fetch failed (state): ' +
        `lectures/old.md: could not read .translate/state/old.md.yml from ${EDITION} ` +
        '(status 502: HTTP 502), so whether to delete it is unknown. It was not removed.'
    );
  });

  it('deletes the state file alone when main no longer has the lecture', () => {
    const withoutLecture = Object.fromEntries(
      Object.entries(target).filter(([p]) => p !== 'lectures/old.md')
    );
    const run = runRebase('removal-orphan-state', rebaseScenario({ target: withoutLecture }));
    const log = checkedLog(run, 0);

    expect(log.trees).toEqual([
      {
        base_tree: BASE_TREE,
        tree: [
          { path: 'lectures/_toc.yml', mode: '100644', type: 'blob', content: TOC_AFTER },
          { path: '.translate/state/old.md.yml', mode: '100644', type: 'blob', sha: null },
        ],
      },
    ]);
    expect(log.refUpdates).toHaveLength(1);
    expect(run.stdout).toContain('♻️ Rebase complete: 1 rebased, 0 skipped, 0 errors.');
  });
});

describe('rebase mode, a lecture main does not have (#389, #351)', () => {
  const EN = '# Lecture X\n\nIntro.\n\n## Part One\n\nBody one, revised.\n';
  const EN_BEFORE = '# Lecture X\n\nIntro.\n\n## Part One\n\nBody one.\n';
  const ML = '# പാഠം X\n\nആമുഖം.\n\n## ഭാഗം ഒന്ന്\n\nഉള്ളടക്കം.\n';
  const ML_REVIEWED = '# പാഠം X\n\nആമുഖം.\n\n## ഭാഗം ഒന്ന്\n\nപരിശോധിച്ച ഉള്ളടക്കം.\n';
  const NEW_STATE = STATE.replace('mode: NEW', 'mode: NEW\n# carried');

  /** The sibling PR, its metadata listing `extra` too, with or without a baseline. */
  function siblingWith(
    extra: Array<{ path: string; type: string; previousPath?: string }>,
    baseline = true
  ): Scenario['openPulls'] {
    const metadata = Object.fromEntries(
      Object.entries({ ...METADATA, files: [...METADATA.files, ...extra] }).filter(
        ([key]) => baseline || key !== 'targetBaseSha'
      )
    );
    return [
      {
        number: SIBLING_PR,
        head: { ref: SIBLING_BRANCH, sha: 'head000' },
        body: bodyFor(metadata),
      },
    ];
  }
  const base = rebaseScenario();
  const reads = (log: RunLog, p: string) =>
    editionReads(log).filter((line) => line.includes(`/contents/${p}?`));
  const at = (p: string, ref: string) => `GET /repos/${EDITION}/contents/${p}?ref=${ref}`;

  it('fails, with the branch untouched, for a lecture a PR merged since deleted (#389)', () => {
    const run = runRebase(
      'deleted-since-opened',
      rebaseScenario({
        mergedPrFiles: [
          { filename: 'lectures/_toc.yml', status: 'modified' },
          { filename: 'lectures/x.md', status: 'removed' },
        ],
        openPulls: siblingWith([{ path: 'lectures/x.md', type: 'markdown' }]),
        source: {
          ...base.source,
          [`lectures/x.md@${SOURCE_SHA}`]: EN,
          [`lectures/x.md@${SOURCE_SHA}^`]: EN_BEFORE,
        },
        target: {
          ...base.target,
          [`lectures/x.md@${OLD_BASE}`]: ML,
          [`lectures/x.md@${SIBLING_BRANCH}`]: ML_REVIEWED,
        },
      })
    );
    const log = checkedLog(run, 1);

    // Main, the baseline, which has it, and the branch, which still has it.
    expect(reads(log, 'lectures/x.md')).toEqual([
      at('lectures/x.md', BASE),
      at('lectures/x.md', OLD_BASE),
      at('lectures/x.md', SIBLING_BRANCH),
    ]);
    expect(log.trees).toEqual([]);
    expect(log.commits).toEqual([]);
    expect(log.refUpdates).toEqual([]);
    expect(log.comments).toHaveLength(1);
    const { body } = log.comments[0];
    expect(body).toContain(
      `lectures/x.md: Error: lectures/x.md was on main when this PR opened (${OLD_BASE}) and ` +
        `is not there now (${BASE}): a PR merged since deleted it, so this PR's change to it ` +
        'was not carried'
    );
    expect(body).toContain(
      '`lectures/x.md` is no longer on `main`: it was there when this PR opened, and a PR ' +
        'merged since deleted it. The rebase does not bring a deleted lecture back.'
    );
    // The deleted lecture is not offered for regeneration.
    expect(body).not.toContain('(here: `x.md`)');
  });

  it('fails the same way for a rename whose old path a PR merged since deleted', () => {
    const run = runRebase(
      'renamed-deleted-since-opened',
      rebaseScenario({
        openPulls: siblingWith([
          { path: 'lectures/x-new.md', type: 'renamed', previousPath: 'lectures/x.md' },
        ]),
        source: {
          ...base.source,
          [`lectures/x-new.md@${SOURCE_SHA}`]: EN,
          [`lectures/x-new.md@${SOURCE_SHA}^`]: EN_BEFORE,
        },
        target: {
          ...base.target,
          [`lectures/x.md@${OLD_BASE}`]: ML,
          [`lectures/x-new.md@${SIBLING_BRANCH}`]: ML_REVIEWED,
        },
      })
    );
    const log = checkedLog(run, 1);

    // The old path on main and at the baseline; the new path on main and on the branch.
    expect(reads(log, 'lectures/x.md')).toEqual([
      at('lectures/x.md', BASE),
      at('lectures/x.md', OLD_BASE),
    ]);
    expect(reads(log, 'lectures/x-new.md')).toEqual([
      at('lectures/x-new.md', BASE),
      at('lectures/x-new.md', SIBLING_BRANCH),
    ]);
    expect(log.refUpdates).toEqual([]);
    const { body } = log.comments[0];
    expect(body).toContain(
      `lectures/x-new.md: Error: lectures/x.md was on main when this PR opened (${OLD_BASE})`
    );
    expect(body).toContain(
      '`lectures/x.md` (`lectures/x-new.md` in this PR) is no longer on `main`'
    );
  });

  it('leaves out a lecture deleted since the PR opened once its branch no longer has it', () => {
    const run = runRebase(
      'deleted-and-dropped',
      rebaseScenario({
        openPulls: siblingWith([{ path: 'lectures/x.md', type: 'markdown' }]),
        source: {
          ...base.source,
          [`lectures/x.md@${SOURCE_SHA}`]: EN,
          [`lectures/x.md@${SOURCE_SHA}^`]: EN_BEFORE,
        },
        target: { ...base.target, [`lectures/x.md@${OLD_BASE}`]: ML },
      })
    );
    const log = checkedLog(run, 0);

    expect(log.trees).toEqual([
      {
        base_tree: BASE_TREE,
        tree: [
          { path: 'lectures/_toc.yml', mode: '100644', type: 'blob', content: TOC_AFTER },
          { path: 'lectures/old.md', mode: '100644', type: 'blob', sha: null },
          { path: '.translate/state/old.md.yml', mode: '100644', type: 'blob', sha: null },
        ],
      },
    ]);
    expect(log.refUpdates).toHaveLength(1);
    expect(run.stdout).toContain(
      `lectures/x.md: deleted from main since this PR opened, and lectures/x.md is no longer ` +
        `on ${SIBLING_BRANCH}: nothing to carry`
    );
  });

  it('rebuilds a rename as an update of its new path when main already has it there', () => {
    const run = runRebase(
      'renamed-already-on-main',
      rebaseScenario({
        openPulls: siblingWith([
          { path: 'lectures/x-new.md', type: 'renamed', previousPath: 'lectures/x.md' },
        ]),
        // The English did not change, so the update needs no model call.
        source: {
          ...base.source,
          [`lectures/x-new.md@${SOURCE_SHA}`]: EN,
          [`lectures/x-new.md@${SOURCE_SHA}^`]: EN,
        },
        target: { ...base.target, [`lectures/x-new.md@${BASE}`]: ML },
      })
    );
    const log = checkedLog(run, 0);

    // The old path is read on main only: the new path there settles it.
    expect(reads(log, 'lectures/x.md')).toEqual([at('lectures/x.md', BASE)]);
    expect(reads(log, 'lectures/x-new.md')).toContain(at('lectures/x-new.md', BASE));
    const paths = log.trees[0].tree.map((entry) => entry.path);
    expect(paths).toContain('lectures/x-new.md');
    expect(paths).not.toContain('lectures/x.md');
    expect(run.stdout).toContain(
      'lectures/x-new.md: on main already, and lectures/x.md is not: rebuilt as an update of ' +
        'lectures/x-new.md'
    );
  });

  it('carries a lecture the PR adds, and its state file, unchanged from the branch (#351)', () => {
    const run = runRebase(
      'carried',
      rebaseScenario({
        openPulls: siblingWith([{ path: 'lectures/new.md', type: 'markdown' }]),
        source: { ...base.source, [`lectures/new.md@${SOURCE_SHA}`]: EN },
        target: {
          ...base.target,
          [`lectures/new.md@${SIBLING_BRANCH}`]: ML_REVIEWED,
          [`.translate/state/new.md.yml@${SIBLING_BRANCH}`]: NEW_STATE,
        },
      })
    );
    // No model call: checkedLog fails on one.
    const log = checkedLog(run, 0);

    expect(reads(log, 'lectures/new.md')).toEqual([
      at('lectures/new.md', BASE),
      at('lectures/new.md', OLD_BASE),
      at('lectures/new.md', SIBLING_BRANCH),
    ]);
    expect(log.trees).toEqual([
      {
        base_tree: BASE_TREE,
        tree: [
          { path: 'lectures/_toc.yml', mode: '100644', type: 'blob', content: TOC_AFTER },
          { path: 'lectures/new.md', mode: '100644', type: 'blob', content: ML_REVIEWED },
          { path: '.translate/state/new.md.yml', mode: '100644', type: 'blob', content: NEW_STATE },
          { path: 'lectures/old.md', mode: '100644', type: 'blob', sha: null },
          { path: '.translate/state/old.md.yml', mode: '100644', type: 'blob', sha: null },
        ],
      },
    ]);
    expect(log.refUpdates).toHaveLength(1);
    expect(run.stdout).toContain(
      `lectures/new.md: new to the edition and on ${SIBLING_BRANCH}: carried unchanged, with ` +
        'its state file'
    );
  });

  it('rebases a PR whose only file left to write is the one it carries', () => {
    const run = runRebase(
      'carried-only',
      rebaseScenario({
        openPulls: siblingWith([{ path: 'lectures/new.md', type: 'markdown' }]),
        // The ToC's source cannot be read, so it is skipped, and main no
        // longer has the removed lecture or its state file: nothing is left
        // to rebuild but the carried lecture.
        source: { [`lectures/new.md@${SOURCE_SHA}`]: EN },
        target: {
          [`lectures/new.md@${SIBLING_BRANCH}`]: ML_REVIEWED,
          [`.translate/state/new.md.yml@${SIBLING_BRANCH}`]: NEW_STATE,
        },
      })
    );
    const log = checkedLog(run, 0);

    expect(log.trees).toEqual([
      {
        base_tree: BASE_TREE,
        tree: [
          { path: 'lectures/new.md', mode: '100644', type: 'blob', content: ML_REVIEWED },
          { path: '.translate/state/new.md.yml', mode: '100644', type: 'blob', content: NEW_STATE },
        ],
      },
    ]);
    expect(log.refUpdates).toHaveLength(1);
    expect(run.stdout).toContain('♻️ Rebase complete: 1 rebased, 0 skipped, 0 errors.');
  });

  it('fails for a lecture main lacks when the PR records no baseline', () => {
    const run = runRebase(
      'no-baseline',
      rebaseScenario({
        openPulls: siblingWith([{ path: 'lectures/x.md', type: 'markdown' }], false),
        source: {
          ...base.source,
          [`lectures/x.md@${SOURCE_SHA}`]: EN,
          [`lectures/x.md@${SOURCE_SHA}^`]: EN_BEFORE,
        },
      })
    );
    const log = checkedLog(run, 1);

    expect(reads(log, 'lectures/x.md')).toEqual([at('lectures/x.md', BASE)]);
    expect(log.refUpdates).toEqual([]);
    expect(log.comments[0].body).toContain(
      'lectures/x.md: Error: lectures/x.md is not on main, and this PR records no baseline (it ' +
        'predates the rebase cache), so a lecture deleted since it opened cannot be told from ' +
        'one it adds. It was not translated from scratch'
    );
  });

  it('stops, with no model call and the branch untouched, for a lecture main got first (#467)', () => {
    const run = runRebase(
      'added-on-main-since-opened',
      rebaseScenario({
        mergedPrFiles: [
          { filename: 'lectures/_toc.yml', status: 'modified' },
          { filename: 'lectures/x.md', status: 'added' },
        ],
        openPulls: siblingWith([{ path: 'lectures/x.md', type: 'markdown' }]),
        // New in the source commit: no English before it.
        source: { ...base.source, [`lectures/x.md@${SOURCE_SHA}`]: EN },
        target: {
          ...base.target,
          [`lectures/x.md@${BASE}`]: ML,
          [`lectures/x.md@${SIBLING_BRANCH}`]: ML_REVIEWED,
        },
      })
    );
    // No model call: checkedLog fails on one.
    const log = checkedLog(run, 1);

    // The source parent, which lacks it; main, which has it; the baseline,
    // which lacks it; the branch, which has it.
    expect(
      log.requests.filter((line) =>
        line.startsWith(`GET /repos/${SOURCE_REPO}/contents/lectures/x`)
      )
    ).toEqual([
      `GET /repos/${SOURCE_REPO}/contents/lectures/x.md?ref=${SOURCE_SHA}`,
      `GET /repos/${SOURCE_REPO}/contents/lectures/x.md?ref=${SOURCE_SHA}^`,
    ]);
    expect(reads(log, 'lectures/x.md')).toEqual([
      at('lectures/x.md', BASE),
      at('lectures/x.md', OLD_BASE),
      at('lectures/x.md', SIBLING_BRANCH),
    ]);
    expect(log.trees).toEqual([]);
    expect(log.commits).toEqual([]);
    expect(log.refUpdates).toEqual([]);
    expect(log.pullUpdates).toEqual([]);
    expect(log.comments).toHaveLength(1);
    const { body } = log.comments[0];
    expect(body).toContain(`⚠️ **Automatic rebase failed** after #${MERGED_PR} was merged.`);
    expect(body).toContain(
      `lectures/x.md: Error: lectures/x.md was not on main when this PR opened (${OLD_BASE}) ` +
        `and is there now (${BASE}): a PR merged since added it, and this PR's source change ` +
        'adds it too, so neither translation was replaced'
    );
    expect(body).toContain(
      '`lectures/x.md` is on `main` now but was not when this PR opened: a PR merged since ' +
        "added it, and this PR's source change adds it too"
    );
    expect(body).toContain('Decide which copy wins.');
    // Only the advice for this stop: neither copy is offered for
    // regeneration, and no resync, which would make a third.
    expect(body).not.toContain('translate forward');
    expect(body).not.toContain('translate-resync');
    expect(run.stdout).toContain('Rebase complete: 0 rebased, 0 skipped, 1 errors.');
  });

  it('updates a lecture main got since the PR opened that its source change edits, as a stacked update (#467)', () => {
    // Source PR 11 added x.md and PR 12 then edited its second section; the
    // edition merged PR 11's sync after PR 12's sync opened, which carries
    // x.md too under `sync-scope: all`.
    const EN_TWO =
      '# Lecture X\n\nIntro.\n\n## Part One\n\nBody one.\n\n## Part Two\n\nBody two.\n';
    const EN_TWO_EDITED = EN_TWO.replace('Body two.', 'Body two, changed.');
    const ML_TWO =
      '# ml-title\n\nml-intro.\n\n## ml-one\n\nml-body-one.\n\n## ml-two\n\nml-body-two.\n';
    const run = runRebase(
      'stacked-edit',
      rebaseScenario({
        mergedPrFiles: [{ filename: 'lectures/x.md', status: 'added' }],
        openPulls: siblingWith([{ path: 'lectures/x.md', type: 'markdown' }]),
        source: {
          ...base.source,
          [`lectures/x.md@${SOURCE_SHA}`]: EN_TWO_EDITED,
          [`lectures/x.md@${SOURCE_SHA}^`]: EN_TWO,
        },
        target: {
          ...base.target,
          [`lectures/x.md@${BASE}`]: ML_TWO,
          [`lectures/x.md@${SIBLING_BRANCH}`]: ML_TWO.replace('ml-intro.', 'ml-intro, branch.'),
        },
        modelReplies: ['## ml-two\n\nml-body-two, changed.'],
      })
    );
    // One model call, for the one section the source change edits.
    const log = checkedLog(run, 0, 1);
    expect(log.modelPrompts[0]).toContain(
      '[OLD en VERSION]\n## Part Two\n\nBody two.\n[/OLD en VERSION]'
    );
    expect(log.modelPrompts[0]).toContain(
      '[CURRENT ml TRANSLATION]\n## ml-two\n\nml-body-two.\n[/CURRENT ml TRANSLATION]'
    );

    // The branch is not read: the source parent has the lecture.
    expect(reads(log, 'lectures/x.md')).toEqual([
      at('lectures/x.md', BASE),
      at('lectures/x.md', OLD_BASE),
    ]);
    // The rest of main's copy is kept, and the branch's own copy is not used.
    const written = log.trees[0].tree.find((entry) => entry.path === 'lectures/x.md');
    expect(written?.content).toBe(
      '---\ntranslation:\n  title: ml-title\n  headings:\n    Part One: ml-one\n' +
        '    Part Two: ml-two\n---\n\n' +
        ML_TWO.replace('ml-body-two.', 'ml-body-two, changed.')
    );
    expect(log.refUpdates).toHaveLength(1);
    expect(log.comments[0].body).toContain('Automatically rebased');
    expect(run.stdout).toContain('♻️ Rebase complete: 1 rebased, 0 skipped, 0 errors.');
  });

  it('fails, with the branch untouched, when main got the lecture since and the source parent read fails (#467)', () => {
    const run = runRebase(
      'source-parent-502',
      rebaseScenario({
        openPulls: siblingWith([{ path: 'lectures/x.md', type: 'markdown' }]),
        source: {
          ...base.source,
          [`lectures/x.md@${SOURCE_SHA}`]: EN,
          [`lectures/x.md@${SOURCE_SHA}^`]: { status: 502 },
        },
        target: {
          ...base.target,
          [`lectures/x.md@${BASE}`]: ML,
          [`lectures/x.md@${SIBLING_BRANCH}`]: ML_REVIEWED,
        },
      })
    );
    const log = checkedLog(run, 1);

    // Neither taken as a stop nor as an update: the branch is never read.
    expect(reads(log, 'lectures/x.md')).toEqual([
      at('lectures/x.md', BASE),
      at('lectures/x.md', OLD_BASE),
    ]);
    expect(log.trees).toEqual([]);
    expect(log.refUpdates).toEqual([]);
    expect(log.comments[0].body).toContain(
      `lectures/x.md: Error: Could not read lectures/x.md from ${SOURCE_REPO} at ` +
        `${SOURCE_SHA.slice(0, 7)}^, which says whether this PR's source change adds the ` +
        'lecture (status 502: HTTP 502)'
    );
    expect(log.comments[0].body).not.toContain('Decide which copy wins.');
  });

  it('updates a lecture main and the baseline both have, reading the baseline once for the plan and the cache', () => {
    const run = runRebase(
      'update-with-cache',
      rebaseScenario({
        openPulls: siblingWith([{ path: 'lectures/x.md', type: 'markdown' }]),
        // The English did not change, so the update needs no model call.
        source: {
          ...base.source,
          [`lectures/x.md@${SOURCE_SHA}`]: EN,
          [`lectures/x.md@${SOURCE_SHA}^`]: EN,
        },
        target: {
          ...base.target,
          [`lectures/x.md@${BASE}`]: ML,
          [`lectures/x.md@${OLD_BASE}`]: ML,
          [`lectures/x.md@${SIBLING_BRANCH}`]: ML_REVIEWED,
        },
      })
    );
    const log = checkedLog(run, 0);

    // Main, then the baseline once (the plan's read, which the cache reuses),
    // then the branch for the cache.
    expect(reads(log, 'lectures/x.md')).toEqual([
      at('lectures/x.md', BASE),
      at('lectures/x.md', OLD_BASE),
      at('lectures/x.md', SIBLING_BRANCH),
    ]);
    expect(run.stdout).toContain(
      'lectures/x.md: Loaded rebase cache (previous translation + old baseline)'
    );
    expect(log.refUpdates).toHaveLength(1);
    expect(run.stdout).toContain('♻️ Rebase complete: 1 rebased, 0 skipped, 0 errors.');
  });

  it('fails, with the branch untouched, when main has the lecture and the baseline read fails (#467)', () => {
    const run = runRebase(
      'baseline-read-502',
      rebaseScenario({
        openPulls: siblingWith([{ path: 'lectures/x.md', type: 'markdown' }]),
        source: { ...base.source, [`lectures/x.md@${SOURCE_SHA}`]: EN },
        target: {
          ...base.target,
          [`lectures/x.md@${BASE}`]: ML,
          [`lectures/x.md@${OLD_BASE}`]: { status: 502 },
          [`lectures/x.md@${SIBLING_BRANCH}`]: ML_REVIEWED,
        },
      })
    );
    const log = checkedLog(run, 1);

    // Not taken as missing: the branch is never read.
    expect(reads(log, 'lectures/x.md')).toEqual([
      at('lectures/x.md', BASE),
      at('lectures/x.md', OLD_BASE),
    ]);
    expect(log.trees).toEqual([]);
    expect(log.refUpdates).toEqual([]);
    expect(log.comments[0].body).toContain(
      `lectures/x.md: Error: Could not read lectures/x.md at this PR's baseline ${OLD_BASE} ` +
        '(status 502: HTTP 502)'
    );
    expect(log.comments[0].body).not.toContain('Decide which copy wins.');
  });

  it('fails when the read of main fails, rather than translate the lecture as new', () => {
    const run = runRebase(
      'main-read-502',
      rebaseScenario({
        openPulls: siblingWith([{ path: 'lectures/x.md', type: 'markdown' }]),
        source: {
          ...base.source,
          [`lectures/x.md@${SOURCE_SHA}`]: EN,
          [`lectures/x.md@${SOURCE_SHA}^`]: EN_BEFORE,
        },
        target: { ...base.target, 'lectures/x.md': { status: 502 } },
      })
    );
    const log = checkedLog(run, 1);

    expect(reads(log, 'lectures/x.md')).toEqual([at('lectures/x.md', BASE)]);
    expect(log.refUpdates).toEqual([]);
    expect(log.comments[0].body).toContain(
      `lectures/x.md: Error: Could not read lectures/x.md from ${EDITION} at ${BASE} ` +
        '(status 502: HTTP 502)'
    );
  });
});

describe("rebase mode, a lecture's state file with keys the engine does not own (#290)", () => {
  const EN = '# Lecture X\n\nIntro.\n\n## Part One\n\nBody one.\n';
  const ML = '# പാഠം X\n\nആമുഖം.\n\n## ഭാഗം ഒന്ന്\n\nഉള്ളടക്കം.\n';
  const SIGN_OFF = 'reviewed:\n  by: an-editor\n  date: 2026-11-20\n';
  const base = rebaseScenario();
  /** The sibling PR rebuilds x.md, whose English did not change: no model call. */
  const scenario = (state: string | { status: number }) =>
    rebaseScenario({
      openPulls: [
        {
          number: SIBLING_PR,
          head: { ref: SIBLING_BRANCH, sha: 'head000' },
          body: bodyFor({
            ...METADATA,
            files: [...METADATA.files, { path: 'lectures/x.md', type: 'markdown' }],
          }),
        },
      ],
      source: {
        ...base.source,
        [`lectures/x.md@${SOURCE_SHA}`]: EN,
        [`lectures/x.md@${SOURCE_SHA}^`]: EN,
      },
      target: {
        ...base.target,
        'lectures/x.md': ML,
        [`.translate/state/x.md.yml@${BASE}`]: state,
      },
    });

  it("rebuilds the state file with main's other keys after the engine's", () => {
    const run = runRebase('state-keys-kept', scenario(STATE + SIGN_OFF));
    const log = checkedLog(run, 0);

    const entry = log.trees[0].tree.find((e) => e.path === '.translate/state/x.md.yml');
    expect(entry).toBeDefined();
    const content = String(entry!.content);
    expect(content).toMatch(/^source-sha: feed0000\n/);
    expect(content).toContain('mode: UPDATE\n');
    expect(content.endsWith(SIGN_OFF)).toBe(true);
    // The state file is read once, at the pinned main, as before.
    expect(
      editionReads(log).filter((line) => line.includes('/contents/.translate/state/x.md.yml'))
    ).toEqual([`GET /repos/${EDITION}/contents/.translate/state/x.md.yml?ref=${BASE}`]);
  });

  it("rebuilds the state file from main's copy: a key only the PR's branch holds is not kept", () => {
    // The branch's state file has a sign-off; main's, read at the pinned SHA,
    // has a key added since the PR opened. The rebase regenerates the
    // lecture, and keeps main's keys, not the branch's (#290).
    const added = 'checked-by: a-maintainer\n';
    const run = runRebase(
      'state-keys-main-wins',
      rebaseScenario({
        ...scenario(STATE + added),
        target: {
          ...scenario(STATE + added).target,
          [`.translate/state/x.md.yml@${SIBLING_BRANCH}`]: STATE + SIGN_OFF,
          [`.translate/state/x.md.yml@${OLD_BASE}`]: STATE,
        },
      })
    );
    const log = checkedLog(run, 0);

    const entry = log.trees[0].tree.find((e) => e.path === '.translate/state/x.md.yml');
    const content = String(entry!.content);
    expect(content).toMatch(/\ntool-version: [^\n]+\nchecked-by: a-maintainer\n$/);
    expect(content).not.toContain('reviewed:');
    // The branch's state file is never read.
    expect(
      editionReads(log).filter((line) => line.includes('/contents/.translate/state/x.md.yml'))
    ).toEqual([`GET /repos/${EDITION}/contents/.translate/state/x.md.yml?ref=${BASE}`]);
  });

  it('fails, with the branch untouched, when the state file read fails, and advises a re-run', () => {
    const run = runRebase('state-keys-502', scenario({ status: 502 }));
    const log = checkedLog(run, 1);

    expect(log.trees).toEqual([]);
    expect(log.refUpdates).toEqual([]);
    const { body } = log.comments[0];
    expect(body).toContain(
      'state read failed for 1 file(s); branch left untouched: Fetch failed (state): ' +
        `lectures/x.md: could not read .translate/state/x.md.yml from ${EDITION} ` +
        '(status 502: HTTP 502), so the keys it holds besides the ones sync writes could not ' +
        'be kept. It was not rebased.'
    );
    expect(body).toContain('re-run the failed rebase workflow run');
    expect(body).toContain('- `lectures/x.md`: `.translate/state/x.md.yml` (status 502: HTTP 502)');
    // Not the advice for a lecture that failed to translate.
    expect(body).not.toContain('translate forward');
    expect(body).not.toContain('translate-resync');
  });
});

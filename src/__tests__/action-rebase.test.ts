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
const SIBLING_BODY = [
  'Translation sync for source PR #12.',
  '',
  '<!-- translation-sync-metadata',
  JSON.stringify(METADATA, null, 2),
  '-->',
  '',
].join('\n');

interface Scenario {
  mergedPrFiles: Array<{ filename: string; status: string }>;
  openPulls: Array<{ number: number; head: { ref: string; sha: string }; body: string }>;
  source: Record<string, string>;
  target: Record<string, string>;
  pullStates?: Record<string, string>;
  treeUnchanged?: boolean;
  gitFailures?: { trees?: number; commits?: number; refs?: number };
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

/** The run's log, after the checks every rebase run must pass. */
function checkedLog(run: BundleRun, expectedStatus: number): RunLog {
  const where = `\n${describeRun(run)}`;
  if (!run.log) throw new Error(`the runner left no log${where}`);
  if (run.log.crash) throw new Error(`the bundle crashed: ${run.log.crash}${where}`);
  if (run.status !== expectedStatus) {
    throw new Error(`exit status ${run.status}, expected ${expectedStatus}${where}`);
  }
  expect(run.log.unmocked).toEqual([]);
  expect(run.log.mockKept).toBe(true);
  expect(run.log.modelRequests).toBe(0);
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

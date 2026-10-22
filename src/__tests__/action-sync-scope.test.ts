/**
 * The `sync-scope` wiring in `runSync`, run end to end in the built bundle
 * (#344).
 *
 * sync-scope.test.ts covers each function `runSync` calls. `runSync` itself
 * lives in `src/index.ts`, which runs the action as soon as it is loaded, so no
 * test can import it (#169). This file runs the built bundle,
 * dist-action/index.js, in a child Node process for each scenario, against the
 * fake GitHub API in src/test-support/action-bundle-runner.cjs, and pins what
 * the wiring does:
 *
 * - a changed lecture out of scope costs one state-file read, and none of its
 *   content is fetched, translated or written;
 * - the lectures left out reach the PR body and the job summary, but not the
 *   metadata's `files` or the comment on the source PR;
 * - with nothing in scope, the run passes with no PR, no failure issue and no
 *   comment on the source PR: it writes the job summary, and closes the
 *   failure issues earlier runs opened for the PR;
 * - a scoped run that passes without a PR closes those issues and cites
 *   itself, while a run that opens its PR cites the PR, in the text it has
 *   always used; a test-mode run, a failed run and an `all` run without a PR
 *   leave them open (the scoped half of #387);
 * - a state file that cannot be read fails the run, and its error heads the
 *   failure issue's list, while the lectures that could be read still sync;
 * - an edition that cannot be read fails the run with nothing synced, the ToC
 *   and removals included, and no file in it is read;
 * - an in-scope lecture the content fetch cannot read is not translated from
 *   scratch, and its error is logged;
 * - the job summary of a failed run says that it failed, and with how many
 *   errors;
 * - under `all`, the run makes the requests it made before the input existed,
 *   in the same order, and writes no job summary.
 *
 * It runs the bundle, so it needs `npm run build` first, as CI does before
 * `npm test` (the CLI smoke tests need dist/ the same way). GitHub and the
 * model host are both fakes, on names that never resolve. The runner refuses
 * a request the bundle's Octokit or its Anthropic client sends to any other
 * host, and such a request fails the test, so no request from either client
 * reaches a real service and no model call is billed. (A request made directly
 * with Node's http, https or net modules would bypass both fakes; nothing on
 * runSync's path makes one.) A scenario syncs only pure renames, ToC
 * changes and removals, which need no model call, while the lectures it leaves
 * out carry real changes, so syncing one by mistake would call the model. The
 * runner counts every request to the model host, and the last scenario sends
 * one on purpose to show that the count works.
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseTranslationSyncMetadata } from '../pr-creator.js';
import { LECTURE_MISSING_HEADING, NOT_SYNCED_HEADING } from '../sync-scope.js';

const ROOT = path.join(__dirname, '..', '..');
const BUNDLE = path.join(ROOT, 'dist-action', 'index.js');
const RUNNER = path.join(ROOT, 'src', 'test-support', 'action-bundle-runner.cjs');
// The runner fakes GitHub with undici's MockAgent. undici is not a direct
// dependency: it comes in through @actions/github (and through @actions/core's
// @actions/http-client). The bundle carries its own copy, which reads the same
// global dispatcher slot as this one.
const UNDICI = require.resolve('undici');

// =============================================================================
// SCENARIO FIXTURES
// =============================================================================

const SOURCE_REPO = 'QuantEcon/source';
const EDITION = 'QuantEcon/edition.ml';
/** The source PR's merge commit. Its parent, `cafe0000^`, holds the old content. */
const SHA = 'cafe0000';
const PR_NUMBER = 7;
/** Hosts that never resolve, so nothing could reach a real service. */
const GITHUB_API = 'https://api.github.invalid';
const MODEL_HOST = 'https://anthropic.invalid';
/** The URL the fake answers for the translation PR. */
const PR_URL = `https://github.com/${EDITION}/pull/99`;
/**
 * The server and run ID the run is given. Nothing requests the server: it only
 * names the run's page, which a scoped run that closes a failure issue without
 * a PR links to (#387).
 */
const SERVER = 'https://github.invalid';
const RUN_ID = '4242';
const RUN_URL = `${SERVER}/${SOURCE_REPO}/actions/runs/${RUN_ID}`;

/**
 * Open issues in the source repository: the failure issue an earlier run of
 * this PR opened for this edition's language, and three a run for `ml` leaves
 * alone: one for another language, a pull request with the same title (the
 * issues listing includes pull requests), and one for PR #70, whose title
 * starts with this PR's.
 */
const FAILURE_ISSUE = 42;
const OPEN_ISSUES = [
  { number: FAILURE_ISSUE, title: `Translation sync failed for PR #${PR_NUMBER} (ml)` },
  { number: 43, title: `Translation sync failed for PR #${PR_NUMBER} (zh-cn)` },
  {
    number: 44,
    title: `Translation sync failed for PR #${PR_NUMBER} (ml)`,
    pull_request: { url: `${GITHUB_API}/repos/${SOURCE_REPO}/pulls/44` },
  },
  { number: 45, title: `Translation sync failed for PR #${PR_NUMBER}0 (ml)` },
];

/** A source lecture with one section. */
function lecture(title: string, body = 'Body one.'): string {
  return `# ${title}\n\nIntro text.\n\n## Part One\n\n${body}\n`;
}

/** Its Malayalam translation, with the heading map the sync reads. */
function translated(title: string): string {
  return [
    '---',
    'translation:',
    `  title: ${title} (ml)`,
    '  headings:',
    '    Part One: ഭാഗം ഒന്ന്',
    '---',
    '',
    `# ${title} (ml)`,
    '',
    'ആമുഖം.',
    '',
    '## ഭാഗം ഒന്ന്',
    '',
    'ഉള്ളടക്കം.',
    '',
  ].join('\n');
}

/** A state file in the edition. Scope only checks that one exists. */
const STATE = [
  'source-sha: 1111111',
  'synced-at: "2026-10-01"',
  'model: claude-sonnet-5',
  'mode: NEW',
  'section-count: 1',
  '',
].join('\n');

const TOC_BEFORE =
  'format: jb-book\nroot: intro\nchapters:\n  - file: a\n  - file: b\n  - file: c\n';
const TOC_AFTER =
  'format: jb-book\nroot: intro\nchapters:\n  - file: a-new\n  - file: b\n  - file: c-new\n';

/** Source keys: a path at the merge commit, and at its parent. */
const atMerge = (p: string) => `${p}@${SHA}`;
const atParent = (p: string) => `${p}@${SHA}^`;

/** A source lecture whose section changed, so syncing it would need the model. */
function changedInSource(p: string, title: string): Record<string, string> {
  return { [atMerge(p)]: lecture(title, 'Body one, revised.'), [atParent(p)]: lecture(title) };
}

type EditionAnswer = string | { status: number };

interface Scenario {
  scope: 'all' | 'existing';
  /** Run as a `test-translation` label event with `test-mode: true`. */
  testMode?: boolean;
  /** Status of the read of the edition repository itself; 200 when absent. */
  editionStatus?: number;
  /**
   * Leave the `bibliography` input unset, so the run takes its default mode,
   * which reads the edition's `_config.yml` once the content is fetched.
   * Every other scenario turns it off.
   */
  defaultBibliography?: boolean;
  prFiles: Array<{ filename: string; status: string; previous_filename?: string }>;
  source: Record<string, string>;
  /** A path absent here answers 404. An array answers successive reads in turn. */
  target: Record<string, EditionAnswer | EditionAnswer[]>;
  /** The source repository's open issues; none when absent. */
  issues?: Array<{ number: number; title: string; pull_request?: { url: string } }>;
  /** Leave GITHUB_RUN_ID unset, as outside Actions. */
  noRunId?: boolean;
}

// =============================================================================
// RUNNING THE BUNDLE
// =============================================================================

interface RunLog {
  requests: string[];
  writes: Array<{ path: string; branch: string; sha: string | null; content: string }>;
  deletes: Array<{ path: string; branch: string; sha: string | null }>;
  pulls: Array<{ title: string; head: string; base: string; body: string }>;
  issues: Array<{ title: string; body: string }>;
  comments: Array<{ on: string; body: string }>;
  /** Each update of a source issue: its number, then the fields sent. */
  issueUpdates: Array<{ number: number; state?: string; state_reason?: string }>;
  modelRequests: number;
  unmocked: string[];
  mockKept: boolean;
  crash: string | null;
  exitCode: number | null;
}

interface BundleRun {
  name: string;
  status: number | null;
  signal: string | null;
  spawnError?: string;
  stdout: string;
  stderr: string;
  /** Undefined when the runner left no whole log, as when the timeout killed it. */
  log?: RunLog;
  /**
   * The GitHub requests, as the runner appended them to a side file one by
   * one: all a run killed before it wrote its log leaves behind.
   */
  requestTrail: string[];
  /** What the run wrote to GITHUB_STEP_SUMMARY. */
  summary: string;
  /** What the run wrote to GITHUB_OUTPUT. */
  outputs: Record<string, string>;
}

/**
 * Newest mtime of a file the build compiles: src/**\/*.ts(x), less the tests,
 * which tsconfig excludes. The CLI smoke tests apply the same rule to dist/.
 */
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

let bundleChecked = false;
let tmpRoot: string | undefined;

afterAll(() => {
  if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
});

/** Fail with the fix when the bundle is missing or older than src/. */
function requireCurrentBundle(): void {
  if (bundleChecked) return;
  if (!fs.existsSync(BUNDLE)) {
    throw new Error(`${BUNDLE} not found. Run \`npm run build\` before running these tests.`);
  }
  // A stale bundle would pass or fail on whatever the last build left behind.
  if (newestSourceMtime(path.join(ROOT, 'src')) > fs.statSync(BUNDLE).mtimeMs) {
    throw new Error(
      `${BUNDLE} is older than src/. Run \`npm run build\` before running these tests.`
    );
  }
  bundleChecked = true;
}

/** The branch name with its timestamp left out. */
function withoutTime(branch: string): string {
  return branch.replace(
    /^translation-sync-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-pr-/,
    'translation-sync-<time>-pr-'
  );
}

/** A state file the sync wrote, with the date, model and tool version left out. */
function withoutRunDetails(content: string): string {
  return content
    .replace(/^synced-at: .*$/m, 'synced-at: <date>')
    .replace(/^model: .*$/m, 'model: <model>')
    .replace(/^tool-version: .*$/m, 'tool-version: <version>');
}

function normalise(log: RunLog): RunLog {
  return {
    ...log,
    writes: log.writes.map((w) => ({
      ...w,
      branch: withoutTime(w.branch),
      content: w.path.startsWith('.translate/state/') ? withoutRunDetails(w.content) : w.content,
    })),
    deletes: log.deletes.map((d) => ({ ...d, branch: withoutTime(d.branch) })),
    pulls: log.pulls.map((p) => ({ ...p, head: withoutTime(p.head) })),
  };
}

/** The values a run set with `core.setOutput`. */
function parseOutputs(text: string): Record<string, string> {
  const outputs: Record<string, string> = {};
  for (const m of text.matchAll(/^([\w-]+)<<(\S+)\n([\s\S]*?)\n\2$/gm)) outputs[m[1]] = m[3];
  return outputs;
}

/**
 * Run the bundle on `scenario` in a child process. Its environment is built
 * from scratch, never inherited: a CI runner's GITHUB_STEP_SUMMARY,
 * GITHUB_OUTPUT or proxy settings would otherwise reach the run.
 */
function runBundle(name: string, scenario: Scenario): BundleRun {
  requireCurrentBundle();
  tmpRoot ??= fs.mkdtempSync(path.join(os.tmpdir(), 'action-sync-scope-'));
  const dir = fs.mkdtempSync(path.join(tmpRoot, `${name}-`));
  const file = (base: string, content: string) => {
    const p = path.join(dir, base);
    fs.writeFileSync(p, content);
    return p;
  };

  const pullRequest = { number: PR_NUMBER, base: { ref: 'main' } };
  const event = scenario.testMode
    ? {
        action: 'labeled',
        label: { name: 'test-translation' },
        pull_request: { ...pullRequest, merged: false },
        repository: { default_branch: 'main' },
      }
    : {
        action: 'closed',
        pull_request: { ...pullRequest, merged: true },
        repository: { default_branch: 'main' },
      };
  const scenarioPath = file('scenario.json', JSON.stringify(scenario));
  const eventPath = file('event.json', JSON.stringify(event));
  const summaryPath = file('summary.md', '');
  const outputPath = file('output.txt', '');
  const logPath = path.join(dir, 'log.json');

  const env: NodeJS.ProcessEnv = {
    UNDICI_PATH: UNDICI,
    BUNDLE_PATH: BUNDLE,
    ANTHROPIC_BASE_URL: MODEL_HOST,
    GITHUB_API_URL: GITHUB_API,
    GITHUB_SERVER_URL: SERVER,
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_REPOSITORY: SOURCE_REPO,
    GITHUB_SHA: SHA,
    GITHUB_STEP_SUMMARY: summaryPath,
    GITHUB_OUTPUT: outputPath,
    INPUT_MODE: 'sync',
    'INPUT_TARGET-REPO': EDITION,
    'INPUT_TARGET-LANGUAGE': 'ml',
    'INPUT_DOCS-FOLDER': 'lectures',
    'INPUT_ANTHROPIC-API-KEY': 'test-key',
    'INPUT_GITHUB-TOKEN': 'test-token',
    'INPUT_SYNC-SCOPE': scenario.scope,
    'INPUT_TEST-MODE': scenario.testMode ? 'true' : 'false',
  };
  // No bibliography reads unless the scenario asks for the default mode: they
  // are not scoped, and would only add requests.
  if (!scenario.defaultBibliography) env.INPUT_BIBLIOGRAPHY = 'off';
  if (!scenario.noRunId) env.GITHUB_RUN_ID = RUN_ID;
  for (const variable of ['PATH', 'HOME']) {
    const value = process.env[variable];
    if (value !== undefined) env[variable] = value;
  }

  const child = spawnSync(process.execPath, [RUNNER, scenarioPath, logPath], {
    env,
    encoding: 'utf8',
    timeout: 60_000,
    // A process stuck in a synchronous loop never runs a JavaScript signal
    // handler, so a SIGTERM that one catches (a dependency may install one)
    // would leave spawnSync waiting. SIGKILL cannot be caught.
    killSignal: 'SIGKILL',
  });

  let log: RunLog | undefined;
  try {
    log = normalise(JSON.parse(fs.readFileSync(logPath, 'utf8')) as RunLog);
  } catch {
    // No log, or half of one, as when the timeout killed the run.
    log = undefined;
  }
  const trailPath = `${logPath}.requests`;
  const requestTrail = fs.existsSync(trailPath)
    ? fs
        .readFileSync(trailPath, 'utf8')
        .split('\n')
        .filter((line) => line !== '')
    : [];

  return {
    name,
    status: child.status,
    signal: child.signal,
    spawnError: child.error?.message,
    stdout: child.stdout ?? '',
    stderr: child.stderr ?? '',
    log,
    requestTrail,
    summary: fs.readFileSync(summaryPath, 'utf8'),
    outputs: parseOutputs(fs.readFileSync(outputPath, 'utf8')),
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
    `── bundle run "${run.name}": exit status ${run.status}` +
      (run.signal ? `, signal ${run.signal}` : '') +
      (run.spawnError ? `, ${run.spawnError}` : ''),
    run.log ? '── requests:' : '── requests, as recorded one by one (the runner left no log):',
    quote((run.log?.requests ?? run.requestTrail).join('\n')),
    '── stdout:',
    quote(run.stdout),
    '── stderr:',
    quote(run.stderr),
  ].join('\n');
}

/**
 * Run `assertions` on the run's log. When one fails, the run's requests and
 * output go into the failure, before the stack, so a CI log is enough to see
 * what the bundle did.
 */
function check(run: BundleRun, assertions: (log: RunLog) => void): void {
  try {
    if (!run.log) throw new Error('the runner left no log');
    assertions(run.log);
  } catch (error) {
    const report = `\n\n${describeRun(run)}\n`;
    if (!(error instanceof Error)) throw new Error(`${String(error)}${report}`);
    // Read the stack before changing the message: V8 formats it on first read.
    const stack = error.stack;
    error.message += report;
    if (typeof stack === 'string') {
      // Jest prints `stack`, splitting it at the first frame as this does.
      const frame = stack.search(/\n\s*at\s.*:\d*:\d*/);
      error.stack =
        frame === -1 ? stack + report : stack.slice(0, frame) + report + stack.slice(frame);
    }
    throw error;
  }
}

/** What every run but the model-call check shows: no model call, nothing unfaked, no crash. */
function expectCleanRun(log: RunLog): void {
  expect(log.modelRequests).toBe(0);
  expect(log.unmocked).toEqual([]);
  expect(log.mockKept).toBe(true);
  expect(log.crash).toBeNull();
}

// =============================================================================
// READING WHAT THE RUN PRODUCED
// =============================================================================

const PR_FILES = `GET /repos/${SOURCE_REPO}/pulls/${PR_NUMBER}/files`;
/** The scope check's first read, and later the PR creator's read of the default branch. */
const EDITION_READ = `GET /repos/${EDITION}`;
const readSource = (p: string, ref = SHA) => `GET /repos/${SOURCE_REPO}/contents/${p}?ref=${ref}`;
const readEdition = (p: string) => `GET /repos/${EDITION}/contents/${p}`;
const writeEdition = (p: string) => `PUT /repos/${EDITION}/contents/${p}`;
const deleteEdition = (p: string) => `DELETE /repos/${EDITION}/contents/${p}`;

/** The translation branch, timestamp left out. */
const BRANCH = `translation-sync-<time>-pr-${PR_NUMBER}`;
/** The SHA the fake edition gives each of its files. */
const editionSha = (p: string) => `t-${p}`;
const added = (p: string, content: string) => ({ path: p, branch: BRANCH, sha: null, content });
const updated = (p: string, content: string) => ({
  path: p,
  branch: BRANCH,
  sha: editionSha(p),
  content,
});
const deleted = (p: string) => ({ path: p, branch: BRANCH, sha: editionSha(p) });

/** A state file as the sync writes it for a pure rename, run details left out. */
const STATE_WRITTEN = [
  `source-sha: ${SHA}`,
  'synced-at: <date>',
  'model: <model>',
  'mode: UPDATE',
  'section-count: 1',
  'tool-version: <version>',
  '',
].join('\n');

/** The requests that read or write `lecture` or its state file, in order. */
function requestsFor(log: RunLog, lecture: string): string[] {
  const paths = new Set([lecture, `.translate/state/${lecture.replace(/^lectures\//, '')}.yml`]);
  return log.requests.filter((request) => {
    const m = request.match(/\/contents\/(.+?)(?:\?ref=.*)?$/);
    return m !== null && paths.has(m[1]);
  });
}

/** The `- ` items under `heading`, up to the next heading; undefined without the heading. */
function itemsUnder(markdown: string, heading: string): string[] | undefined {
  const lines = markdown.split('\n');
  const start = lines.indexOf(heading);
  if (start === -1) return undefined;
  const end = lines.findIndex((line, i) => i > start && line.startsWith('#'));
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2));
}

/** The paths a PR-body file section lists. */
function pathsUnder(body: string, heading: string): string[] | undefined {
  return itemsUnder(body, heading)?.map((item) => item.match(/`([^`]+)`/)?.[1] ?? item);
}

/** The `files` the PR declares in its translation-sync metadata. */
function declaredFiles(body: string) {
  const metadata = parseTranslationSyncMetadata(body);
  if (!metadata) throw new Error('the PR body has no readable translation-sync-metadata');
  return metadata.files;
}

/** The errors a failure issue lists. */
function issueErrors(issue: { body: string }): string[] | undefined {
  return itemsUnder(issue.body, '### Errors');
}

/**
 * The requests that open the failure issue: the issue, which the fake numbers
 * 5, then its label.
 */
const OPEN_FAILURE_ISSUE = [
  `POST /repos/${SOURCE_REPO}/issues`,
  `POST /repos/${SOURCE_REPO}/issues/5/labels`,
];

/** The listing of the source repository's open issues, where closing failure issues starts. */
const LIST_ISSUES = `GET /repos/${SOURCE_REPO}/issues`;

/** The requests that close the failure issue: the listing, a comment on it, then its update. */
const CLOSE_FAILURE_ISSUE = [
  LIST_ISSUES,
  `POST /repos/${SOURCE_REPO}/issues/${FAILURE_ISSUE}/comments`,
  `PATCH /repos/${SOURCE_REPO}/issues/${FAILURE_ISSUE}`,
];

/** The update that closes the failure issue. */
const CLOSED = { number: FAILURE_ISSUE, state: 'closed', state_reason: 'completed' };

/** The comment that closes it after a run that opened its PR: the text it had before #387. */
const CLOSED_BY_PR = `✅ A later sync for PR #${PR_NUMBER} (ml) succeeded: ${PR_URL}\n\nClosing this failure report.`;

/** The comment that closes it after a scoped run with nothing to deliver, which cites the run. */
const CLOSED_BY_RUN =
  `✅ A later sync for PR #${PR_NUMBER} (ml) passed with nothing to deliver to this edition ` +
  `(sync-scope: existing): ${RUN_URL}\n\nClosing this failure report.`;

/** The same, from a run with no run ID: the sentence ends without a link. */
const CLOSED_BY_RUN_WITHOUT_LINK =
  `✅ A later sync for PR #${PR_NUMBER} (ml) passed with nothing to deliver to this edition ` +
  `(sync-scope: existing).\n\nClosing this failure report.`;

/** The lines of a text, so that an assertion can match one whole. */
function linesOf(text: string): string[] {
  return text.split('\n');
}

// =============================================================================
// SCENARIOS
// =============================================================================

describe("sync-scope in the built bundle's runSync (#344)", () => {
  describe("'all': a rename, a ToC change and a removal, as before the input existed", () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('all', {
        scope: 'all',
        prFiles: [
          { filename: 'lectures/c-new.md', status: 'renamed', previous_filename: 'lectures/c.md' },
          { filename: 'lectures/_toc.yml', status: 'modified' },
          { filename: 'lectures/f.md', status: 'removed' },
        ],
        source: {
          [atMerge('lectures/c-new.md')]: lecture('Charlie'),
          [atParent('lectures/c.md')]: lecture('Charlie'),
          [atMerge('lectures/_toc.yml')]: TOC_AFTER,
        },
        // No state files: under `all` the run does not ask.
        target: {
          'lectures/c.md': translated('Charlie'),
          'lectures/_toc.yml': TOC_BEFORE,
          'lectures/f.md': translated('Foxtrot'),
        },
      });
    }, 90_000);

    // The list is main's request sequence as of #344: main's bundle, which
    // predates the input, makes the same requests. Update it when runSync's
    // requests change for another reason. The next test pins the rule #344
    // adds, which must hold through any such change.
    it('makes the same requests, in the same order, with no scope read', () => {
      check(run, (log) => {
        expect(log.requests).toEqual([
          PR_FILES,
          readSource('lectures/c-new.md'),
          readSource('lectures/c.md', `${SHA}^`),
          readEdition('lectures/c.md'),
          readSource('lectures/_toc.yml'),
          readEdition('lectures/_toc.yml'),
          readEdition('lectures/f.md'),
          readEdition('.translate/state/c-new.md.yml'),
          readEdition('.translate/state/c.md.yml'),
          readEdition('.translate/state/f.md.yml'),
          `GET /repos/${SOURCE_REPO}/pulls/${PR_NUMBER}`,
          EDITION_READ,
          `GET /repos/${EDITION}/git/ref/heads/main`,
          `POST /repos/${EDITION}/git/refs`,
          writeEdition('lectures/c-new.md'),
          writeEdition('.translate/state/c-new.md.yml'),
          writeEdition('lectures/_toc.yml'),
          deleteEdition('lectures/c.md'),
          deleteEdition('lectures/f.md'),
          `POST /repos/${EDITION}/pulls`,
          `POST /repos/${EDITION}/issues/99/labels`,
          `POST /repos/${SOURCE_REPO}/issues/${PR_NUMBER}/comments`,
          `GET /repos/${SOURCE_REPO}/issues`,
        ]);
      });
    });

    it('reads neither the edition nor a state file before the first source content read', () => {
      check(run, (log) => {
        const firstSourceRead = log.requests.findIndex((request) =>
          request.startsWith(`GET /repos/${SOURCE_REPO}/contents/`)
        );
        expect(firstSourceRead).toBeGreaterThan(0);
        const scopeReads = log.requests
          .slice(0, firstSourceRead)
          .filter(
            (request) =>
              request === EDITION_READ || request.startsWith(readEdition('.translate/state/'))
          );
        expect(scopeReads).toEqual([]);
      });
    });

    it('renames the lecture, mirrors the ToC and deletes the removed lecture', () => {
      check(run, (log) => {
        expect(log.writes).toEqual([
          added('lectures/c-new.md', translated('Charlie')),
          added('.translate/state/c-new.md.yml', STATE_WRITTEN),
          updated('lectures/_toc.yml', TOC_AFTER),
        ]);
        expect(log.deletes).toEqual([deleted('lectures/c.md'), deleted('lectures/f.md')]);
      });
    });

    it('opens the PR with no scope section, declaring every file it delivers', () => {
      check(run, (log) => {
        expect(log.pulls).toHaveLength(1);
        const { body, head } = log.pulls[0];
        expect(head).toBe(BRANCH);
        expect(body).not.toContain(NOT_SYNCED_HEADING);
        expect(body).not.toContain(LECTURE_MISSING_HEADING);
        expect(declaredFiles(body)).toEqual([
          { path: 'lectures/c-new.md', type: 'renamed', previousPath: 'lectures/c.md' },
          { path: 'lectures/_toc.yml', type: 'toc' },
          { path: 'lectures/f.md', type: 'removed' },
        ]);
      });
    });

    it('comments on the source PR and passes, with no failure issue', () => {
      check(run, (log) => {
        expect(log.comments).toHaveLength(1);
        expect(log.comments[0].on).toBe(`${SOURCE_REPO}#${PR_NUMBER}`);
        expect(log.issues).toEqual([]);
        expect(run.status).toBe(0);
        expect(run.outputs['pr-url']).toBe(PR_URL);
        expect(run.outputs['files-synced']).toBe('3');
      });
    });

    it('writes no job summary', () => {
      check(run, () => {
        expect(run.summary).toBe('');
      });
    });

    it('makes no model call, and sends every request to the fake', () => {
      check(run, expectCleanRun);
    });
  });

  describe("'existing': a source PR with lectures in scope and out of it", () => {
    /** The lectures this run leaves out, for either reason, under both names of a rename. */
    const OUT_OF_SCOPE = [
      'lectures/b.md',
      'lectures/_admonition/gpu.md',
      'lectures/c-new.md',
      'lectures/c.md',
      'lectures/d.md',
    ];

    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('existing-mixed', {
        scope: 'existing',
        prFiles: [
          { filename: 'lectures/a-new.md', status: 'renamed', previous_filename: 'lectures/a.md' },
          { filename: 'lectures/b.md', status: 'modified' },
          { filename: 'lectures/c-new.md', status: 'renamed', previous_filename: 'lectures/c.md' },
          { filename: 'lectures/d.md', status: 'modified' },
          { filename: 'lectures/_admonition/gpu.md', status: 'modified' },
          {
            filename: 'lectures/_admonition/sub-new.md',
            status: 'renamed',
            previous_filename: 'lectures/_admonition/sub.md',
          },
          { filename: 'lectures/_toc.yml', status: 'modified' },
          { filename: 'lectures/f.md', status: 'removed' },
        ],
        source: {
          // In scope: pure renames, which need no model call.
          [atMerge('lectures/a-new.md')]: lecture('Alpha'),
          [atParent('lectures/a.md')]: lecture('Alpha'),
          [atMerge('lectures/_admonition/sub-new.md')]: lecture('Sub'),
          [atParent('lectures/_admonition/sub.md')]: lecture('Sub'),
          [atMerge('lectures/_toc.yml')]: TOC_AFTER,
          // Out of scope: real changes, which would need the model if synced.
          ...changedInSource('lectures/b.md', 'Bravo'),
          ...changedInSource('lectures/d.md', 'Delta'),
          ...changedInSource('lectures/_admonition/gpu.md', 'GPU'),
          [atMerge('lectures/c-new.md')]: lecture('Charlie', 'Body one, revised.'),
          [atParent('lectures/c.md')]: lecture('Charlie'),
        },
        target: {
          // Taken by the edition: a state file and the translation.
          '.translate/state/a.md.yml': STATE,
          'lectures/a.md': translated('Alpha'),
          '.translate/state/_admonition/sub.md.yml': STATE,
          'lectures/_admonition/sub.md': translated('Sub'),
          // English copies on main with no state file, as the Malayalam
          // edition carries `intro.md` and `_admonition/gpu.md`.
          'lectures/b.md': lecture('Bravo'),
          'lectures/c.md': lecture('Charlie'),
          'lectures/_admonition/gpu.md': lecture('GPU'),
          // A state file with no lecture beside it. The CLI would reject its
          // contents; scope reads existence only.
          '.translate/state/d.md.yml': 'unexpected-key: 1\n',
          'lectures/_toc.yml': TOC_BEFORE,
          'lectures/f.md': translated('Foxtrot'),
        },
      });
    }, 90_000);

    it('checks every changed lecture against the edition before fetching any content', () => {
      check(run, (log) => {
        expect(log.requests.slice(0, 11)).toEqual([
          PR_FILES,
          EDITION_READ,
          readEdition('.translate/state/b.md.yml'),
          readEdition('.translate/state/d.md.yml'),
          readEdition('lectures/d.md'),
          readEdition('.translate/state/_admonition/gpu.md.yml'),
          readEdition('.translate/state/a.md.yml'),
          readEdition('lectures/a.md'),
          readEdition('.translate/state/c.md.yml'),
          readEdition('.translate/state/_admonition/sub.md.yml'),
          readEdition('lectures/_admonition/sub.md'),
        ]);
      });
    });

    it('costs a lecture out of scope one state-file read, and fetches none of its content', () => {
      check(run, (log) => {
        expect(requestsFor(log, 'lectures/b.md')).toEqual([
          readEdition('.translate/state/b.md.yml'),
        ]);
        expect(requestsFor(log, 'lectures/_admonition/gpu.md')).toEqual([
          readEdition('.translate/state/_admonition/gpu.md.yml'),
        ]);
        // A rename is decided by its previous path.
        expect(requestsFor(log, 'lectures/c.md')).toEqual([
          readEdition('.translate/state/c.md.yml'),
        ]);
        expect(requestsFor(log, 'lectures/c-new.md')).toEqual([]);
        // A state file without its lecture: the lecture is looked for once.
        expect(requestsFor(log, 'lectures/d.md')).toEqual([
          readEdition('.translate/state/d.md.yml'),
          readEdition('lectures/d.md'),
        ]);
      });
    });

    it('renames the lectures in scope, mirrors the ToC and deletes the removed lecture', () => {
      check(run, (log) => {
        expect(log.writes).toEqual([
          added('lectures/a-new.md', translated('Alpha')),
          added('.translate/state/a-new.md.yml', STATE_WRITTEN),
          added('lectures/_admonition/sub-new.md', translated('Sub')),
          added('.translate/state/_admonition/sub-new.md.yml', STATE_WRITTEN),
          updated('lectures/_toc.yml', TOC_AFTER),
        ]);
        expect(log.deletes).toEqual([
          deleted('lectures/a.md'),
          deleted('.translate/state/a.md.yml'),
          deleted('lectures/_admonition/sub.md'),
          deleted('.translate/state/_admonition/sub.md.yml'),
          deleted('lectures/f.md'),
        ]);
      });
    });

    it('lists the lectures left out in the PR body, each kind under its own heading', () => {
      check(run, (log) => {
        expect(log.pulls).toHaveLength(1);
        const { body } = log.pulls[0];
        expect(itemsUnder(body, NOT_SYNCED_HEADING)).toEqual([
          '`lectures/b.md`',
          '`lectures/_admonition/gpu.md`',
          '`lectures/c-new.md` (renamed from `lectures/c.md`)',
        ]);
        expect(itemsUnder(body, LECTURE_MISSING_HEADING)).toEqual([
          '`lectures/d.md`: `.translate/state/d.md.yml`',
        ]);
        expect(pathsUnder(body, '### Files Added')).toEqual([
          'lectures/a-new.md',
          '.translate/state/a-new.md.yml',
          'lectures/_admonition/sub-new.md',
          '.translate/state/_admonition/sub-new.md.yml',
        ]);
        expect(pathsUnder(body, '### Files Updated')).toEqual(['lectures/_toc.yml']);
        expect(pathsUnder(body, '### Files Deleted')).toEqual([
          'lectures/a.md',
          '.translate/state/a.md.yml',
          'lectures/_admonition/sub.md',
          '.translate/state/_admonition/sub.md.yml',
          'lectures/f.md',
        ]);
      });
    });

    it('declares only the files the PR delivers in its metadata', () => {
      check(run, (log) => {
        expect(declaredFiles(log.pulls[0].body)).toEqual([
          { path: 'lectures/a-new.md', type: 'renamed', previousPath: 'lectures/a.md' },
          {
            path: 'lectures/_admonition/sub-new.md',
            type: 'renamed',
            previousPath: 'lectures/_admonition/sub.md',
          },
          { path: 'lectures/_toc.yml', type: 'toc' },
          { path: 'lectures/f.md', type: 'removed' },
        ]);
      });
    });

    it('comments on the source PR with the synced files only', () => {
      check(run, (log) => {
        expect(log.comments).toHaveLength(1);
        const { on, body } = log.comments[0];
        expect(on).toBe(`${SOURCE_REPO}#${PR_NUMBER}`);
        expect(body.split('\n').filter((line) => line.startsWith('- '))).toEqual([
          '- `lectures/a-new.md`',
          '- `lectures/_admonition/sub-new.md`',
          '- `lectures/_toc.yml`',
          '- `lectures/f.md`',
        ]);
        for (const skipped of OUT_OF_SCOPE) expect(body).not.toContain(skipped);
      });
    });

    it('writes a job summary of the lectures in scope and those left out', () => {
      check(run, () => {
        expect(run.summary.match(/^## /gm)).toHaveLength(1);
        expect(linesOf(run.summary)).toContain(`**Translation PR:** ${PR_URL}`);
        expect(itemsUnder(run.summary, '### In scope (2)')).toEqual([
          '`lectures/a-new.md`',
          '`lectures/_admonition/sub-new.md`',
        ]);
        expect(itemsUnder(run.summary, '### Not synced: not in this edition yet (3)')).toEqual([
          '`lectures/b.md`',
          '`lectures/_admonition/gpu.md`',
          '`lectures/c-new.md` (renamed from `lectures/c.md`)',
        ]);
        expect(
          itemsUnder(run.summary, '### ⚠️ Not synced: state file without a lecture (1)')
        ).toEqual(['`lectures/d.md`: `.translate/state/d.md.yml`']);
        expect(run.summary).not.toContain('Scope unknown');
      });
    });

    it('passes, with no failure issue, and warns about the state file without a lecture', () => {
      check(run, (log) => {
        expect(run.status).toBe(0);
        expect(log.issues).toEqual([]);
        expect(run.outputs['pr-url']).toBe(PR_URL);
        expect(run.outputs['files-synced']).toBe('4');
        expect(run.stdout).toContain('::warning::lectures/d.md: not synced');
      });
    });

    it('makes no model call, and sends every request to the fake', () => {
      check(run, expectCleanRun);
    });
  });

  /** A source PR that changes only a lecture the edition has not taken. */
  const NOTHING_IN_SCOPE: Scenario = {
    scope: 'existing',
    prFiles: [{ filename: 'lectures/b.md', status: 'modified' }],
    source: changedInSource('lectures/b.md', 'Bravo'),
    target: { 'lectures/b.md': lecture('Bravo') },
  };

  describe("'existing': nothing the source PR changed is in scope", () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('existing-nothing', NOTHING_IN_SCOPE);
    }, 90_000);

    it('reads the PR files, the edition and one state file, then lists the open issues', () => {
      check(run, (log) => {
        expect(log.requests).toEqual([
          PR_FILES,
          EDITION_READ,
          readEdition('.translate/state/b.md.yml'),
          // For failure issues an earlier run left open (#387). There are none.
          LIST_ISSUES,
        ]);
      });
    });

    it('opens no PR, no failure issue and no comment, and passes', () => {
      check(run, (log) => {
        expect(log.pulls).toEqual([]);
        expect(log.issues).toEqual([]);
        expect(log.comments).toEqual([]);
        expect(log.writes).toEqual([]);
        expect(log.deletes).toEqual([]);
        expect(run.status).toBe(0);
        // The run stops before the content fetch, so it sets no step output:
        // no `pr-url`, and not even the token counts.
        expect(run.outputs).toEqual({});
      });
    });

    it('says so in the job summary', () => {
      check(run, () => {
        expect(run.summary.match(/^## /gm)).toHaveLength(1);
        expect(linesOf(run.summary)).toContain(
          '**No translation PR.** Nothing this source PR changed is in scope.'
        );
        expect(itemsUnder(run.summary, '### In scope (0)')).toEqual([]);
        expect(itemsUnder(run.summary, '### Not synced: not in this edition yet (1)')).toEqual([
          '`lectures/b.md`',
        ]);
      });
    });

    it('makes no model call, and sends every request to the fake', () => {
      check(run, expectCleanRun);
    });
  });

  /** A rename in scope beside a lecture whose state file answers 500. */
  const STATE_UNREADABLE: Scenario = {
    scope: 'existing',
    prFiles: [
      { filename: 'lectures/a-new.md', status: 'renamed', previous_filename: 'lectures/a.md' },
      { filename: 'lectures/e.md', status: 'modified' },
    ],
    source: {
      [atMerge('lectures/a-new.md')]: lecture('Alpha'),
      [atParent('lectures/a.md')]: lecture('Alpha'),
      ...changedInSource('lectures/e.md', 'Echo'),
    },
    target: {
      '.translate/state/a.md.yml': STATE,
      'lectures/a.md': translated('Alpha'),
      '.translate/state/e.md.yml': { status: 500 },
      'lectures/e.md': translated('Echo'),
    },
  };
  const STATE_UNREADABLE_ERROR =
    `Fetch failed (scope): lectures/e.md: could not read .translate/state/e.md.yml ` +
    `from ${EDITION} (status 500): HTTP 500`;

  describe("'existing': a state file the edition cannot serve", () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('existing-state-500', STATE_UNREADABLE);
    }, 90_000);

    it('still syncs the lecture whose scope it could read, in a PR', () => {
      check(run, (log) => {
        expect(log.writes).toEqual([
          added('lectures/a-new.md', translated('Alpha')),
          added('.translate/state/a-new.md.yml', STATE_WRITTEN),
        ]);
        expect(log.deletes).toEqual([
          deleted('lectures/a.md'),
          deleted('.translate/state/a.md.yml'),
        ]);
        expect(log.pulls).toHaveLength(1);
        expect(declaredFiles(log.pulls[0].body)).toEqual([
          { path: 'lectures/a-new.md', type: 'renamed', previousPath: 'lectures/a.md' },
        ]);
      });
    });

    it('neither syncs nor skips the lecture whose scope it could not read', () => {
      check(run, (log) => {
        expect(requestsFor(log, 'lectures/e.md')).toEqual([
          readEdition('.translate/state/e.md.yml'),
        ]);
        expect(log.pulls[0].body).not.toContain(NOT_SYNCED_HEADING);
      });
    });

    it('fails the run and lists the scope error in the failure issue', () => {
      check(run, (log) => {
        expect(run.status).toBe(1);
        expect(log.issues).toHaveLength(1);
        expect(issueErrors(log.issues[0])).toEqual([STATE_UNREADABLE_ERROR]);
        expect(log.comments).toEqual([]);
      });
    });

    it('does not look for failure issues to close, though it opened a PR', () => {
      check(run, (log) => {
        expect(log.requests).not.toContain(LIST_ISSUES);
        expect(log.issueUpdates).toEqual([]);
      });
    });

    it('reports the lecture under Scope unknown in the job summary, and the run as failed', () => {
      check(run, () => {
        expect(linesOf(run.summary)).toContain(
          `**Translation PR:** ${PR_URL} The run also failed with 1 error(s); see the log.`
        );
        expect(itemsUnder(run.summary, '### In scope (1)')).toEqual(['`lectures/a-new.md`']);
        expect(itemsUnder(run.summary, '### ❌ Scope unknown (1)')).toEqual([
          STATE_UNREADABLE_ERROR,
        ]);
      });
    });

    it('makes no model call, and sends every request to the fake', () => {
      check(run, expectCleanRun);
    });
  });

  describe("'existing': a state file the edition cannot serve, in test mode", () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('existing-state-500-test-mode', { ...STATE_UNREADABLE, testMode: true });
    }, 90_000);

    it('opens the PR but no failure issue and no comment, and still fails', () => {
      check(run, (log) => {
        expect(log.pulls).toHaveLength(1);
        expect(log.issues).toEqual([]);
        expect(log.comments).toEqual([]);
        expect(run.status).toBe(1);
        expect(linesOf(run.summary)).toContain(
          `**Translation PR:** ${PR_URL} The run also failed with 1 error(s); see the log.`
        );
        expect(itemsUnder(run.summary, '### ❌ Scope unknown (1)')).toEqual([
          STATE_UNREADABLE_ERROR,
        ]);
      });
    });

    it('makes no model call, and sends every request to the fake', () => {
      check(run, expectCleanRun);
    });
  });

  describe("'existing': a state file and a ToC the edition cannot serve", () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('existing-state-500-toc-500', {
        ...STATE_UNREADABLE,
        // A second error, from the ToC's content fetch. The ToC is listed
        // first in the source PR, so the scope error heads the failure
        // issue's list only if the run puts scope errors first.
        prFiles: [
          { filename: 'lectures/_toc.yml', status: 'modified' },
          ...STATE_UNREADABLE.prFiles,
        ],
        source: { ...STATE_UNREADABLE.source, [atMerge('lectures/_toc.yml')]: TOC_AFTER },
        target: { ...STATE_UNREADABLE.target, 'lectures/_toc.yml': { status: 500 } },
      });
    }, 90_000);

    it('lists the scope error first in the failure issue, then the ToC error', () => {
      check(run, (log) => {
        expect(run.status).toBe(1);
        expect(log.issues).toHaveLength(1);
        const errors = issueErrors(log.issues[0]) ?? [];
        expect(errors).toHaveLength(2);
        expect(errors[0]).toBe(STATE_UNREADABLE_ERROR);
        expect(errors[1]).toMatch(/^Fetch failed \(toc\): lectures\/_toc\.yml: /);
      });
    });

    it('counts both errors in the job summary, and lists only the scope error', () => {
      check(run, () => {
        expect(linesOf(run.summary)).toContain(
          `**Translation PR:** ${PR_URL} The run also failed with 2 error(s); see the log.`
        );
        expect(itemsUnder(run.summary, '### ❌ Scope unknown (1)')).toEqual([
          STATE_UNREADABLE_ERROR,
        ]);
      });
    });

    it('makes no model call, and sends every request to the fake', () => {
      check(run, expectCleanRun);
    });
  });

  describe("'existing': a lecture in scope that the content fetch cannot read", () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('existing-unread-lecture', {
        scope: 'existing',
        prFiles: [
          { filename: 'lectures/a-new.md', status: 'renamed', previous_filename: 'lectures/a.md' },
          { filename: 'lectures/_toc.yml', status: 'modified' },
        ],
        source: {
          [atMerge('lectures/a-new.md')]: lecture('Alpha'),
          [atParent('lectures/a.md')]: lecture('Alpha'),
          [atMerge('lectures/_toc.yml')]: TOC_AFTER,
        },
        target: {
          '.translate/state/a.md.yml': STATE,
          // The scope check reads the lecture; the content fetch then gets a 502.
          'lectures/a.md': [translated('Alpha'), { status: 502 }],
          'lectures/_toc.yml': TOC_BEFORE,
        },
      });
    }, 90_000);

    it('does not translate the lecture from scratch, move it or declare it', () => {
      check(run, (log) => {
        expect(log.writes).toEqual([updated('lectures/_toc.yml', TOC_AFTER)]);
        expect(log.deletes).toEqual([]);
        expect(log.pulls).toHaveLength(1);
        expect(declaredFiles(log.pulls[0].body)).toEqual([
          { path: 'lectures/_toc.yml', type: 'toc' },
        ]);
      });
    });

    it('fails the run with a failure issue that names the lecture', () => {
      check(run, (log) => {
        expect(run.status).toBe(1);
        expect(log.issues).toHaveLength(1);
        const errors = issueErrors(log.issues[0]) ?? [];
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/^Fetch failed \(renamed\): lectures\/a-new\.md: /);
        expect(errors[0]).toContain('lectures/a.md');
        expect(log.comments).toEqual([]);
      });
    });

    it('logs the error, where the job summary sends the reader', () => {
      check(run, (log) => {
        expect(linesOf(run.summary)).toContain(
          `**Translation PR:** ${PR_URL} The run also failed with 1 error(s); see the log.`
        );
        expect(run.stdout).toContain('::error::Fetch failed (renamed): lectures/a-new.md: ');
        // The whole text the failure issue lists, so that a test-mode run,
        // which opens no issue, still shows it.
        expect(log.issues).toHaveLength(1);
        const [error] = issueErrors(log.issues[0]) ?? [];
        expect(linesOf(run.stdout)).toContain(`::error::${error}`);
      });
    });

    it('makes no model call, and sends every request to the fake', () => {
      check(run, expectCleanRun);
    });
  });

  /** The one error of a run whose edition cannot be read. */
  const EDITION_ERROR =
    `Fetch failed (scope): could not read the edition ${EDITION} (status 404), ` +
    'so nothing was synced: Not Found';
  /** The job summary's outcome line for a run that failed with one error and opened no PR. */
  const FAILED_WITH_NO_PR = '**No translation PR.** The run failed with 1 error(s); see the log.';

  describe("'existing': an edition the token cannot read", () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('existing-edition-unreadable', {
        scope: 'existing',
        // GitHub answers 404 for a repository the token cannot see.
        editionStatus: 404,
        prFiles: [{ filename: 'lectures/a.md', status: 'modified' }],
        source: changedInSource('lectures/a.md', 'Alpha'),
        target: {},
      });
    }, 90_000);

    it('reads no file, from the source or the edition', () => {
      check(run, (log) => {
        expect(log.requests).toEqual([PR_FILES, EDITION_READ, ...OPEN_FAILURE_ISSUE]);
      });
    });

    it('fails the run with a failure issue that names the edition, and opens no PR', () => {
      check(run, (log) => {
        expect(run.status).toBe(1);
        expect(log.issues).toHaveLength(1);
        expect(issueErrors(log.issues[0])).toEqual([EDITION_ERROR]);
        expect(log.pulls).toEqual([]);
        expect(log.writes).toEqual([]);
        expect(log.deletes).toEqual([]);
        expect(log.comments).toEqual([]);
      });
    });

    it('reports it under Scope unknown in the job summary, and the run as failed', () => {
      check(run, () => {
        expect(linesOf(run.summary)).toContain(FAILED_WITH_NO_PR);
        expect(run.summary).not.toContain('Nothing this source PR changed is in scope.');
        expect(itemsUnder(run.summary, '### ❌ Scope unknown (1)')).toEqual([EDITION_ERROR]);
      });
    });

    it('makes no model call, and sends every request to the fake', () => {
      check(run, expectCleanRun);
    });
  });

  /**
   * An unreadable edition, beside a ToC change and a removal, with the
   * `bibliography` input left at its default. An edition that cannot be read
   * can take no change, so the ToC and the removal are dropped with the
   * lecture, and the run fails before it reads any file: not the ToC, not the
   * lecture the removal would delete, and not the `_config.yml` the default
   * bibliography mode reads.
   */
  const EDITION_UNREADABLE_WITH_TOC: Scenario = {
    scope: 'existing',
    editionStatus: 404,
    defaultBibliography: true,
    prFiles: [
      { filename: 'lectures/_toc.yml', status: 'modified' },
      { filename: 'lectures/a.md', status: 'modified' },
      { filename: 'lectures/f.md', status: 'removed' },
    ],
    source: {
      ...changedInSource('lectures/a.md', 'Alpha'),
      [atMerge('lectures/_toc.yml')]: TOC_AFTER,
    },
    // GitHub answers 404 for every path in a repository the token cannot see.
    target: {},
  };

  describe("'existing': an unreadable edition, beside a ToC change and a removal", () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('existing-edition-unreadable-toc', EDITION_UNREADABLE_WITH_TOC);
    }, 90_000);

    it('reads no file at all before it opens the failure issue', () => {
      check(run, (log) => {
        expect(log.requests).toEqual([PR_FILES, EDITION_READ, ...OPEN_FAILURE_ISSUE]);
      });
    });

    it('syncs nothing, and fails the run with a failure issue that names the edition', () => {
      check(run, (log) => {
        expect(run.status).toBe(1);
        expect(log.pulls).toEqual([]);
        expect(log.writes).toEqual([]);
        expect(log.deletes).toEqual([]);
        expect(log.comments).toEqual([]);
        expect(log.issues).toHaveLength(1);
        expect(issueErrors(log.issues[0])).toEqual([EDITION_ERROR]);
        // The run stops before the content fetch, so it sets no step output.
        expect(run.outputs).toEqual({});
      });
    });

    it('reports the run as failed in the job summary, not as having nothing in scope', () => {
      check(run, () => {
        expect(linesOf(run.summary)).toContain(FAILED_WITH_NO_PR);
        expect(run.summary).not.toContain('Nothing this source PR changed is in scope.');
        expect(itemsUnder(run.summary, '### ❌ Scope unknown (1)')).toEqual([EDITION_ERROR]);
      });
    });

    it('makes no model call, and sends every request to the fake', () => {
      check(run, expectCleanRun);
    });
  });

  describe("'existing': the same unreadable edition, in test mode", () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('existing-edition-unreadable-toc-test-mode', {
        ...EDITION_UNREADABLE_WITH_TOC,
        testMode: true,
      });
    }, 90_000);

    it('reads no file at all, and opens no failure issue', () => {
      check(run, (log) => {
        expect(log.requests).toEqual([PR_FILES, EDITION_READ]);
        expect(log.issues).toEqual([]);
      });
    });

    it('syncs nothing and fails the run, with the error in the log and the job summary', () => {
      check(run, (log) => {
        expect(run.status).toBe(1);
        expect(log.pulls).toEqual([]);
        expect(log.writes).toEqual([]);
        expect(log.deletes).toEqual([]);
        expect(log.comments).toEqual([]);
        expect(run.outputs).toEqual({});
        expect(linesOf(run.stdout)).toContain(`::error::${EDITION_ERROR}`);
        expect(linesOf(run.summary)).toContain(FAILED_WITH_NO_PR);
        expect(run.summary).not.toContain('Nothing this source PR changed is in scope.');
        expect(itemsUnder(run.summary, '### ❌ Scope unknown (1)')).toEqual([EDITION_ERROR]);
      });
    });

    it('makes no model call, and sends every request to the fake', () => {
      check(run, expectCleanRun);
    });
  });

  // The scoped half of #387. A failure issue an earlier run opened stays open
  // until a later run of the same PR recovers it. A run that opens its PR has
  // always closed it. A scoped run that passes without a PR now closes it too,
  // which on a partial edition is an ordinary outcome. An `all` run without a
  // PR still leaves it open.

  describe("'existing': nothing in scope, with a failure issue open (#387)", () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('existing-nothing-open-issue', { ...NOTHING_IN_SCOPE, issues: OPEN_ISSUES });
    }, 90_000);

    it('closes the failure issue after the scope check, and makes no other request', () => {
      check(run, (log) => {
        expect(log.requests).toEqual([
          PR_FILES,
          EDITION_READ,
          readEdition('.translate/state/b.md.yml'),
          ...CLOSE_FAILURE_ISSUE,
        ]);
      });
    });

    it('says the run passed with nothing to deliver, links the run, and closes only that issue', () => {
      check(run, (log) => {
        expect(log.comments).toEqual([
          { on: `${SOURCE_REPO}#${FAILURE_ISSUE}`, body: CLOSED_BY_RUN },
        ]);
        expect(log.issueUpdates).toEqual([CLOSED]);
      });
    });

    it('opens no PR and no failure issue, and passes', () => {
      check(run, (log) => {
        expect(log.pulls).toEqual([]);
        expect(log.issues).toEqual([]);
        expect(log.writes).toEqual([]);
        expect(log.deletes).toEqual([]);
        expect(run.status).toBe(0);
        expect(run.outputs).toEqual({});
      });
    });

    it('makes no model call, and sends every request to the fake', () => {
      check(run, expectCleanRun);
    });
  });

  describe("'existing': nothing in scope, with a failure issue open, in a run with no run ID", () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('existing-nothing-open-issue-no-run-id', {
        ...NOTHING_IN_SCOPE,
        issues: OPEN_ISSUES,
        noRunId: true,
      });
    }, 90_000);

    it('closes the failure issue with a comment that ends without a link', () => {
      check(run, (log) => {
        expect(log.comments).toEqual([
          { on: `${SOURCE_REPO}#${FAILURE_ISSUE}`, body: CLOSED_BY_RUN_WITHOUT_LINK },
        ]);
        expect(log.issueUpdates).toEqual([CLOSED]);
        expect(run.status).toBe(0);
      });
    });

    it('makes no model call, and sends every request to the fake', () => {
      check(run, expectCleanRun);
    });
  });

  describe("'existing': nothing in scope, with a failure issue open, in test mode", () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('existing-nothing-open-issue-test-mode', {
        ...NOTHING_IN_SCOPE,
        issues: OPEN_ISSUES,
        testMode: true,
      });
    }, 90_000);

    it('makes no issue request at all, and passes', () => {
      check(run, (log) => {
        expect(log.requests).toEqual([
          PR_FILES,
          EDITION_READ,
          readEdition('.translate/state/b.md.yml'),
        ]);
        expect(log.comments).toEqual([]);
        expect(log.issueUpdates).toEqual([]);
        expect(run.status).toBe(0);
      });
    });

    it('makes no model call, and sends every request to the fake', () => {
      check(run, expectCleanRun);
    });
  });

  describe("'existing': a run that opens its PR, with a failure issue open", () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('existing-pr-open-issue', {
        scope: 'existing',
        prFiles: [
          { filename: 'lectures/a-new.md', status: 'renamed', previous_filename: 'lectures/a.md' },
        ],
        source: {
          [atMerge('lectures/a-new.md')]: lecture('Alpha'),
          [atParent('lectures/a.md')]: lecture('Alpha'),
        },
        target: {
          '.translate/state/a.md.yml': STATE,
          'lectures/a.md': translated('Alpha'),
        },
        issues: OPEN_ISSUES,
      });
    }, 90_000);

    it('comments on the source PR, then closes the failure issue', () => {
      check(run, (log) => {
        expect(run.status).toBe(0);
        expect(log.pulls).toHaveLength(1);
        expect(log.requests.slice(-4)).toEqual([
          `POST /repos/${SOURCE_REPO}/issues/${PR_NUMBER}/comments`,
          ...CLOSE_FAILURE_ISSUE,
        ]);
        expect(log.issueUpdates).toEqual([CLOSED]);
      });
    });

    it('cites the translation PR in the closing comment, in the text it had before #387', () => {
      check(run, (log) => {
        expect(log.comments.map((comment) => comment.on)).toEqual([
          `${SOURCE_REPO}#${PR_NUMBER}`,
          `${SOURCE_REPO}#${FAILURE_ISSUE}`,
        ]);
        expect(log.comments[1].body).toBe(CLOSED_BY_PR);
      });
    });

    it('makes no model call, and sends every request to the fake', () => {
      check(run, expectCleanRun);
    });
  });

  /**
   * A source PR whose only change removes a lecture the edition no longer
   * has, with a failure issue open. Removals are not scoped, so a scoped run
   * gets past the scope check, then finds nothing to delete and opens no PR.
   */
  const REMOVES_A_MISSING_LECTURE: Omit<Scenario, 'scope'> = {
    prFiles: [{ filename: 'lectures/gone.md', status: 'removed' }],
    source: {},
    target: {},
    issues: OPEN_ISSUES,
  };

  describe("'existing': a run past the scope check with nothing to deliver, with a failure issue open", () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('existing-removal-open-issue', {
        scope: 'existing',
        ...REMOVES_A_MISSING_LECTURE,
      });
    }, 90_000);

    it('looks for the lecture to delete, then closes the failure issue', () => {
      check(run, (log) => {
        expect(log.requests).toEqual([
          PR_FILES,
          readEdition('lectures/gone.md'),
          ...CLOSE_FAILURE_ISSUE,
        ]);
      });
    });

    it('says the run passed with nothing to deliver, and links the run', () => {
      check(run, (log) => {
        expect(log.comments).toEqual([
          { on: `${SOURCE_REPO}#${FAILURE_ISSUE}`, body: CLOSED_BY_RUN },
        ]);
        expect(log.issueUpdates).toEqual([CLOSED]);
      });
    });

    it('opens no PR and no failure issue, and passes', () => {
      check(run, (log) => {
        expect(log.pulls).toEqual([]);
        expect(log.issues).toEqual([]);
        expect(log.writes).toEqual([]);
        expect(log.deletes).toEqual([]);
        expect(run.status).toBe(0);
        expect(run.outputs['pr-url']).toBeUndefined();
      });
    });

    it('makes no model call, and sends every request to the fake', () => {
      check(run, expectCleanRun);
    });
  });

  describe("'all': the same run, with a failure issue open", () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('all-removal-open-issue', { scope: 'all', ...REMOVES_A_MISSING_LECTURE });
    }, 90_000);

    // The requests main's bundle makes for this run: #387's scoped half leaves
    // `all` as it was.
    it('makes the requests it made before, none of them for an issue', () => {
      check(run, (log) => {
        expect(log.requests).toEqual([PR_FILES, readEdition('lectures/gone.md')]);
      });
    });

    it('leaves the failure issue open, opens no PR, and passes', () => {
      check(run, (log) => {
        expect(log.comments).toEqual([]);
        expect(log.issueUpdates).toEqual([]);
        expect(log.pulls).toEqual([]);
        expect(log.issues).toEqual([]);
        expect(run.status).toBe(0);
      });
    });

    it('makes no model call, and sends every request to the fake', () => {
      check(run, expectCleanRun);
    });
  });

  describe("'existing': the same run past the scope check, in test mode", () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('existing-removal-open-issue-test-mode', {
        scope: 'existing',
        ...REMOVES_A_MISSING_LECTURE,
        testMode: true,
      });
    }, 90_000);

    it('makes no issue request at all, and passes', () => {
      check(run, (log) => {
        expect(log.requests).not.toContain(LIST_ISSUES);
        expect(log.comments).toEqual([]);
        expect(log.issueUpdates).toEqual([]);
        expect(run.status).toBe(0);
      });
    });

    it('makes no model call, and sends every request to the fake', () => {
      check(run, expectCleanRun);
    });
  });

  describe("'existing': a run past the scope check that fails with no PR, with a failure issue open", () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('existing-unread-lecture-open-issue', {
        scope: 'existing',
        prFiles: [
          { filename: 'lectures/a-new.md', status: 'renamed', previous_filename: 'lectures/a.md' },
        ],
        source: {
          [atMerge('lectures/a-new.md')]: lecture('Alpha'),
          [atParent('lectures/a.md')]: lecture('Alpha'),
        },
        target: {
          '.translate/state/a.md.yml': STATE,
          'lectures/a.md': [translated('Alpha'), { status: 502 }],
        },
        issues: OPEN_ISSUES,
      });
    }, 90_000);

    it('opens a new failure issue, and neither lists nor closes the open one', () => {
      check(run, (log) => {
        expect(log.requests.slice(-OPEN_FAILURE_ISSUE.length)).toEqual(OPEN_FAILURE_ISSUE);
        expect(log.requests).not.toContain(LIST_ISSUES);
        expect(log.pulls).toEqual([]);
        expect(log.issues).toHaveLength(1);
        expect(log.comments).toEqual([]);
        expect(log.issueUpdates).toEqual([]);
        expect(run.status).toBe(1);
      });
    });

    it('makes no model call, and sends every request to the fake', () => {
      check(run, expectCleanRun);
    });
  });

  describe("'existing': a scope error, with a failure issue open", () => {
    let run: BundleRun;
    beforeAll(() => {
      // Only the lecture whose state file answers 500, so nothing is in scope.
      run = runBundle('existing-scope-error-open-issue', {
        ...STATE_UNREADABLE,
        prFiles: [{ filename: 'lectures/e.md', status: 'modified' }],
        issues: OPEN_ISSUES,
      });
    }, 90_000);

    it('opens a new failure issue, and neither lists nor closes the open one', () => {
      check(run, (log) => {
        expect(log.requests).toEqual([
          PR_FILES,
          EDITION_READ,
          readEdition('.translate/state/e.md.yml'),
          ...OPEN_FAILURE_ISSUE,
        ]);
        expect(run.status).toBe(1);
        expect(log.issues).toHaveLength(1);
        expect(issueErrors(log.issues[0])).toEqual([STATE_UNREADABLE_ERROR]);
        expect(log.comments).toEqual([]);
        expect(log.issueUpdates).toEqual([]);
      });
    });

    it('makes no model call, and sends every request to the fake', () => {
      check(run, expectCleanRun);
    });
  });

  // The runs above assert no model call. This one makes one, so a runner that
  // stopped seeing model calls would fail here instead of passing above.
  describe('the runner: a changed lecture in scope reaches the fake model', () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('existing-model-call', {
        scope: 'existing',
        prFiles: [{ filename: 'lectures/a.md', status: 'modified' }],
        source: changedInSource('lectures/a.md', 'Alpha'),
        target: {
          '.translate/state/a.md.yml': STATE,
          'lectures/a.md': translated('Alpha'),
        },
      });
    }, 90_000);

    it('counts the model call, and keeps every later GitHub request on the fake', () => {
      check(run, (log) => {
        expect(log.modelRequests).toBeGreaterThan(0);
        // The failure issue is opened after the model call failed.
        expect(log.issues).toHaveLength(1);
        expect(log.unmocked).toEqual([]);
        expect(log.mockKept).toBe(true);
        expect(log.crash).toBeNull();
      });
    });
  });
});

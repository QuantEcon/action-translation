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
 *   and removals included, and no file in it is read, nor any source file but
 *   the lecture set's;
 * - an in-scope lecture the content fetch cannot read is not translated from
 *   scratch, and its error is logged; under `all`, neither is a changed or
 *   renamed lecture whose edition read fails with anything but a 404, while a
 *   404 still makes it a new lecture (#466);
 * - the job summary of a failed run says that it failed, and with how many
 *   errors;
 * - under `all`, the run makes the requests it made before the input existed,
 *   in the same order, besides the lecture set's, and writes no job summary
 *   when it has nothing to list.
 *
 * Every scenario that changes a lecture gives the source a `_toc.yml` that
 * lists it, since sync syncs only the lecture set (#449). The block on the
 * lecture set pins what that adds: a changed fragment is found by the include
 * scan, which stops at the first includer; a changed draft or `README.md` is
 * listed and not synced, under either scope, and a PR that changes only such
 * files passes with no PR; a ToC that cannot be read, or a truncated tree,
 * holds the whole run with a failure issue; a lecture the scan cannot read is
 * an error for the file it decides while the others sync; a lecture renamed
 * out of the set is not carried; a ToC change lists the lectures it takes out
 * and those it adds with nothing delivered; an include a delivered lecture
 * names that the edition lacks is listed; and an `all` run that lists any of
 * these writes the job summary.
 *
 * A later block pins the premise check of update mode (#420), which runs on
 * either scope: a lecture whose translation is behind with no open PR that
 * carries it, or ahead, costs no model call, and its failure issue says which
 * case it is; a lecture behind an open sync PR that carries it is synced, and
 * the PR body or the failure issue names that PR; a lecture whose premise
 * holds, or cannot be checked, reaches the model as before; and the other
 * files of the PR still sync.
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
import {
  MISSING_INCLUDES_HEADING,
  OUTSIDE_SET_HEADING,
  TOC_ADDED_HEADING,
  TOC_REMOVED_HEADING,
} from '../sync-lecture-set.js';

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

/**
 * A state file in the edition. Scope only checks that one exists. Its
 * unquoted all-digit `source-sha` loads as a number, which the premise check
 * of update mode (#420) does not use, so the scope scenarios make no premise
 * read and their request lists are those of the scope check alone. The
 * premise block at the end uses quoted SHAs.
 */
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

/**
 * A `_toc.yml` that lists `stems`, files inside `lectures/` named without
 * `.md`, under the root `intro`, which no fixture has: an entry with nothing
 * behind it is reported in the log and fails nothing.
 */
function tocListing(...stems: string[]): string {
  return `format: jb-book\nroot: intro\nchapters:\n${stems.map((s) => `  - file: ${s}\n`).join('')}`;
}

/**
 * The source's `_toc.yml` at the merge commit, listing `stems`. Sync reads
 * the lecture set there, and a changed `.md` it does not list is left out
 * (#449), so every scenario that changes a lecture lists it.
 */
const listedAtMerge = (...stems: string[]) => ({
  [atMerge('lectures/_toc.yml')]: tocListing(...stems),
});

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
  /** `<path>@<ref>` → its content, or the status its read fails with. */
  source: Record<string, string | { status: number }>;
  /**
   * The source's tree at a ref, when it is not every path `source` holds at
   * that ref: its paths, truncated or not, or a status the read fails with.
   */
  sourceTrees?: Record<
    string,
    string[] | { paths?: string[]; truncated?: boolean; status?: number }
  >;
  /** A path absent here answers 404. An array answers successive reads in turn. */
  target: Record<string, EditionAnswer | EditionAnswer[]>;
  /** The source repository's open issues; none when absent. */
  issues?: Array<{ number: number; title: string; pull_request?: { url: string } }>;
  /** Leave GITHUB_RUN_ID unset, as outside Actions. */
  noRunId?: boolean;
  /** The edition's open PRs, as `pulls.list` lists them; none when absent. */
  openPulls?: Array<{ number: number; head: { ref: string }; body: string }>;
  /** The source's commit comparisons, `<base>...<head>` → status; any other answers 404. */
  compare?: Record<string, string>;
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
/** The source's whole tree at a commit, which the lecture set reads first (#449). */
const readTree = (ref = SHA) => `GET /repos/${SOURCE_REPO}/git/trees/${ref}?recursive=true`;
/** The lecture set's reads at the merge commit: the tree, then the ToC. */
const READ_LECTURE_SET = [readTree(), readSource('lectures/_toc.yml')];
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

/** A failure issue's Recovery section: its text after the heading. */
function recoveryOf(issue: { body: string }): string {
  const at = issue.body.indexOf('### Recovery\n');
  if (at === -1) throw new Error('the failure issue has no Recovery section');
  return issue.body.slice(at + '### Recovery\n'.length);
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
          [atParent('lectures/_toc.yml')]: TOC_BEFORE,
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
    // requests change for another reason, as the lecture set did (#449): it
    // reads the tree and the ToC at the merge commit and, since the PR changes
    // the ToC, at its parent, and the content fetch reuses the ToC it read.
    // The next test pins the rule #344 adds, which must hold through any such
    // change.
    it('makes the same requests, in the same order, with no scope read', () => {
      check(run, (log) => {
        expect(log.requests).toEqual([
          PR_FILES,
          ...READ_LECTURE_SET,
          readTree(`${SHA}^`),
          readSource('lectures/_toc.yml', `${SHA}^`),
          readSource('lectures/c-new.md'),
          readSource('lectures/c.md', `${SHA}^`),
          readEdition('lectures/c.md'),
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

    /** The ToC after the PR, which lists every lecture it changes, fragments included. */
    const MIXED_TOC = tocListing(
      'a-new',
      'b',
      'c-new',
      'd',
      '_admonition/gpu',
      '_admonition/sub-new'
    );

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
          [atMerge('lectures/_toc.yml')]: MIXED_TOC,
          [atParent('lectures/_toc.yml')]: TOC_BEFORE,
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

    // The lecture set comes first (#449): the tree and the ToC, at the merge
    // commit and, since the PR changes the ToC, at its parent.
    it('checks every changed lecture against the edition before fetching any content', () => {
      check(run, (log) => {
        expect(log.requests.slice(0, 15)).toEqual([
          PR_FILES,
          ...READ_LECTURE_SET,
          readTree(`${SHA}^`),
          readSource('lectures/_toc.yml', `${SHA}^`),
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
          updated('lectures/_toc.yml', MIXED_TOC),
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
    source: { ...changedInSource('lectures/b.md', 'Bravo'), ...listedAtMerge('b') },
    target: { 'lectures/b.md': lecture('Bravo') },
  };

  describe("'existing': nothing the source PR changed is in scope", () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('existing-nothing', NOTHING_IN_SCOPE);
    }, 90_000);

    it('reads the PR files, the lecture set, the edition and one state file, then lists the open issues', () => {
      check(run, (log) => {
        expect(log.requests).toEqual([
          PR_FILES,
          ...READ_LECTURE_SET,
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
      ...listedAtMerge('a-new', 'e'),
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
        // issue's list only if the run puts scope errors first. The ToC the
        // PR changes is the one STATE_UNREADABLE lists its lectures in.
        prFiles: [
          { filename: 'lectures/_toc.yml', status: 'modified' },
          ...STATE_UNREADABLE.prFiles,
        ],
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

  describe("'existing': a state file and the bibliography the edition cannot serve (#386)", () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('existing-state-500-bibliography-502', {
        ...STATE_UNREADABLE,
        defaultBibliography: true,
        target: { ...STATE_UNREADABLE.target, 'lectures/_config.yml': { status: 502 } },
      });
    }, 90_000);

    it('holds the lecture in scope too, and opens no PR', () => {
      check(run, (log) => {
        expect(log.writes).toEqual([]);
        expect(log.deletes).toEqual([]);
        expect(log.pulls).toEqual([]);
      });
    });

    it('lists the scope error, then the bibliography error, in the failure issue', () => {
      check(run, (log) => {
        expect(run.status).toBe(1);
        expect(log.issues).toHaveLength(1);
        const errors = issueErrors(log.issues[0]) ?? [];
        expect(errors).toHaveLength(2);
        expect(errors[0]).toBe(STATE_UNREADABLE_ERROR);
        expect(errors[1]).toMatch(
          /^Fetch failed \(bibliography\): Could not read lectures\/_config\.yml /
        );
      });
    });

    it('counts both errors in the job summary, and lists only the scope error', () => {
      check(run, () => {
        expect(linesOf(run.summary)).toContain(
          '**No translation PR.** The run failed with 2 error(s); see the log.'
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
          // The scope check reads the lecture; the content fetch then gets a
          // 404, as if it went in between. (Any other status fails the fetch
          // itself, as under `all`: #466.)
          'lectures/a.md': [translated('Alpha'), { status: 404 }],
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

  // #466: under `all` there is no scope check, so the content fetch's own read
  // decides whether the edition has the lecture. Only a 404 means it does not;
  // any other status used to read as "absent" and translate the lecture from
  // scratch over its reviewed translation.
  describe("'all': a changed lecture whose edition read answers 500 (#466)", () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('all-changed-lecture-500', {
        scope: 'all',
        prFiles: [{ filename: 'lectures/b.md', status: 'modified' }],
        source: { ...changedInSource('lectures/b.md', 'Bravo'), ...listedAtMerge('b') },
        target: { 'lectures/b.md': { status: 500 } },
      });
    }, 90_000);

    it('does not translate the lecture from scratch, write it or open a PR', () => {
      check(run, (log) => {
        expect(log.writes).toEqual([]);
        expect(log.deletes).toEqual([]);
        expect(log.pulls).toEqual([]);
      });
    });

    it('fails the run with a failure issue that names the read', () => {
      check(run, (log) => {
        expect(run.status).toBe(1);
        expect(log.issues).toHaveLength(1);
        const errors = issueErrors(log.issues[0]) ?? [];
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/^Fetch failed \(markdown\): lectures\/b\.md: /);
        expect(errors[0]).toContain(`Could not read lectures/b.md from ${EDITION} (status 500)`);
        expect(log.comments).toEqual([]);
      });
    });

    it('makes no model call, and sends every request to the fake', () => {
      check(run, expectCleanRun);
    });
  });

  describe("'all': a renamed lecture whose old path's edition read answers 500 (#466)", () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('all-renamed-lecture-500', {
        scope: 'all',
        prFiles: [
          { filename: 'lectures/a-new.md', status: 'renamed', previous_filename: 'lectures/a.md' },
        ],
        source: {
          [atMerge('lectures/a-new.md')]: lecture('Alpha'),
          [atParent('lectures/a.md')]: lecture('Alpha'),
          ...listedAtMerge('a-new'),
        },
        target: { 'lectures/a.md': { status: 500 } },
      });
    }, 90_000);

    it('neither translates the new path from scratch nor touches the old one', () => {
      check(run, (log) => {
        expect(log.writes).toEqual([]);
        expect(log.deletes).toEqual([]);
        expect(log.pulls).toEqual([]);
      });
    });

    it('fails the run with a failure issue that names the read', () => {
      check(run, (log) => {
        expect(run.status).toBe(1);
        expect(log.issues).toHaveLength(1);
        const errors = issueErrors(log.issues[0]) ?? [];
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/^Fetch failed \(renamed\): lectures\/a-new\.md: /);
        expect(errors[0]).toContain(`Could not read lectures/a.md from ${EDITION} (status 500)`);
        expect(log.comments).toEqual([]);
        expect(run.stdout).toContain(
          '::error::Error fetching content for renamed file lectures/a-new.md: '
        );
      });
    });

    it('makes no model call, and sends every request to the fake', () => {
      check(run, expectCleanRun);
    });
  });

  describe("'all': a changed lecture the edition answers 404 for (#466)", () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('all-changed-lecture-404', {
        scope: 'all',
        prFiles: [{ filename: 'lectures/b.md', status: 'modified' }],
        source: { ...changedInSource('lectures/b.md', 'Bravo'), ...listedAtMerge('b') },
        target: {},
      });
    }, 90_000);

    it('still takes it as a new lecture and sends it to the model', () => {
      check(run, (log) => {
        expect(log.requests).toContain(readEdition('lectures/b.md'));
        // The fake model answers no call, so the new lecture fails and the run
        // opens a failure issue; what matters is that it reached the model.
        expect(log.modelRequests).toBeGreaterThan(0);
        expect(log.issues).toHaveLength(1);
        expect(issueErrors(log.issues[0])?.[0]).toMatch(/^Error processing lectures\/b\.md: /);
        expect(log.unmocked).toEqual([]);
        expect(log.crash).toBeNull();
      });
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
        source: { ...changedInSource('lectures/a.md', 'Alpha'), ...listedAtMerge('a') },
        target: {},
      });
    }, 90_000);

    // The lecture set comes before scope (#449), so the source's tree and ToC
    // are read; no lecture is.
    it("reads no lecture, from the source or the edition, only the source's lecture set", () => {
      check(run, (log) => {
        expect(log.requests).toEqual([
          PR_FILES,
          ...READ_LECTURE_SET,
          EDITION_READ,
          ...OPEN_FAILURE_ISSUE,
        ]);
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
   * lecture, and the run fails before it reads any file but the source's
   * lecture set (#449): not the edition's ToC, not the lecture the removal
   * would delete, and not the `_config.yml` the default bibliography mode
   * reads. The source had no ToC before this PR, so there is none to read at
   * the parent commit.
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
    source: { ...changedInSource('lectures/a.md', 'Alpha'), ...listedAtMerge('a') },
    // GitHub answers 404 for every path in a repository the token cannot see.
    target: {},
  };

  /** What the run reads of the source's lecture set: at the merge commit, then the tree before it. */
  const READ_LECTURE_SETS = [...READ_LECTURE_SET, readTree(`${SHA}^`)];

  describe("'existing': an unreadable edition, beside a ToC change and a removal", () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('existing-edition-unreadable-toc', EDITION_UNREADABLE_WITH_TOC);
    }, 90_000);

    it("reads no file but the source's lecture set before it opens the failure issue", () => {
      check(run, (log) => {
        expect(log.requests).toEqual([
          PR_FILES,
          ...READ_LECTURE_SETS,
          EDITION_READ,
          ...OPEN_FAILURE_ISSUE,
        ]);
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

    it("reads no file but the source's lecture set, and opens no failure issue", () => {
      check(run, (log) => {
        expect(log.requests).toEqual([PR_FILES, ...READ_LECTURE_SETS, EDITION_READ]);
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
          ...READ_LECTURE_SET,
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
          ...READ_LECTURE_SET,
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
          ...listedAtMerge('a-new'),
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

    // Its 404 counts once the edition reads, and a state file left behind
    // would be deleted (#396).
    it('looks for the lecture and its state file, then closes the failure issue', () => {
      check(run, (log) => {
        expect(log.requests).toEqual([
          PR_FILES,
          readEdition('lectures/gone.md'),
          EDITION_READ,
          readEdition('.translate/state/gone.md.yml'),
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

    // #387's scoped half leaves `all` as it was: no request for an issue.
    // #396 adds the edition read its 404 needs, and the state file's read.
    it('makes no request for an issue', () => {
      check(run, (log) => {
        expect(log.requests).toEqual([
          PR_FILES,
          readEdition('lectures/gone.md'),
          EDITION_READ,
          readEdition('.translate/state/gone.md.yml'),
        ]);
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
          ...listedAtMerge('a-new'),
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
          ...READ_LECTURE_SET,
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
  // #307. Before the fix this run read the edition's root README.md as the
  // lecture's translation, wrote it to lectures/README.md without a model call
  // (the source text did not change), and deleted the edition's README.md.
  describe("'all': a file renamed into the docs folder from outside it (#307)", () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('all-rename-from-outside', {
        scope: 'all',
        prFiles: [
          { filename: 'lectures/README.md', status: 'renamed', previous_filename: 'README.md' },
        ],
        // The ToC lists the moved file, so it is a lecture (#449): left out
        // of the ToC, it would not be synced at all.
        source: {
          [atMerge('lectures/README.md')]: lecture('Readme'),
          [atParent('README.md')]: lecture('Readme'),
          ...listedAtMerge('README'),
        },
        // The edition's own README, which no sync wrote.
        target: { 'README.md': translated('Readme') },
      });
    }, 90_000);

    it("never reads the edition's file at the old path, and deletes nothing", () => {
      check(run, (log) => {
        expect(log.requests).not.toContain(readEdition('README.md'));
        expect(log.requests).not.toContain(deleteEdition('README.md'));
        expect(log.requests).not.toContain(readSource('README.md', `${SHA}^`));
        expect(log.deletes).toEqual([]);
        expect(log.writes).toEqual([]);
      });
    });

    it('takes the file as an addition: a new lecture, sent to the model', () => {
      check(run, (log) => {
        expect(log.requests).toContain(readSource('lectures/README.md'));
        expect(log.requests).toContain(readEdition('lectures/README.md'));
        // The fake model answers no call, so the new lecture fails and the run
        // opens a failure issue; what matters is that it was translated from
        // scratch, not carried from the old path.
        expect(log.modelRequests).toBeGreaterThan(0);
        expect(log.issues).toHaveLength(1);
        expect(log.unmocked).toEqual([]);
        expect(log.crash).toBeNull();
      });
    });
  });

  describe('the runner: a changed lecture in scope reaches the fake model', () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('existing-model-call', {
        scope: 'existing',
        prFiles: [{ filename: 'lectures/a.md', status: 'modified' }],
        source: { ...changedInSource('lectures/a.md', 'Alpha'), ...listedAtMerge('a') },
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

describe("the lecture set in the built bundle's runSync (#449)", () => {
  /** An `{include}` of `target`, as a lecture's body holds one. */
  const include = (target: string) => `\`\`\`{include} ${target}\n\`\`\``;
  /** The job summary's outcome line for a run that failed with one error and opened no PR. */
  const FAILED_WITH_NO_PR = '**No translation PR.** The run failed with 1 error(s); see the log.';
  /** The run's one error when the lecture set could not be read. */
  const refused = (detail: string) =>
    `Sync refused: the source's lecture set at cafe000 could not be read: ${detail}. Without ` +
    'it the run cannot tell which changed files are lectures, so nothing was synced.';

  // A changed fragment is synced as any lecture is, so it reaches the fake
  // model, whose refusal fails the run: what matters is that it was synced,
  // and what the scan read to find that it may be.
  describe("'all': a changed fragment, found by the include scan", () => {
    const stems = Array.from({ length: 10 }, (_, i) => `l${i}`);
    let run: BundleRun;
    beforeAll(() => {
      const source: Scenario['source'] = {
        ...listedAtMerge(...stems),
        ...changedInSource('lectures/_admonition/gpu.md', 'GPU'),
      };
      for (const stem of stems) {
        source[atMerge(`lectures/${stem}.md`)] =
          stem === 'l1' ? lecture('L1', include('_admonition/gpu.md')) : lecture(stem);
      }
      run = runBundle('lecture-set-fragment', {
        scope: 'all',
        prFiles: [{ filename: 'lectures/_admonition/gpu.md', status: 'modified' }],
        source,
        target: { 'lectures/_admonition/gpu.md': translated('GPU') },
      });
    }, 90_000);

    it('reads the ToC documents in batches, and stops after the batch with the includer', () => {
      check(run, (log) => {
        expect(log.requests.slice(0, 11)).toEqual([
          PR_FILES,
          ...READ_LECTURE_SET,
          ...stems.slice(0, 8).map((stem) => readSource(`lectures/${stem}.md`)),
        ]);
        expect(log.requests).not.toContain(readSource('lectures/l8.md'));
        expect(log.requests).not.toContain(readSource('lectures/l9.md'));
      });
    });

    it('syncs the fragment as a lecture, and lists nothing', () => {
      check(run, (log) => {
        expect(requestsFor(log, 'lectures/_admonition/gpu.md')).toEqual([
          readSource('lectures/_admonition/gpu.md'),
          readSource('lectures/_admonition/gpu.md', `${SHA}^`),
          readEdition('lectures/_admonition/gpu.md'),
          readEdition('.translate/state/_admonition/gpu.md.yml'),
        ]);
        expect(log.modelRequests).toBeGreaterThan(0);
        expect(issueErrors(log.issues[0])?.[0]).toMatch(
          /^Error processing lectures\/_admonition\/gpu\.md: /
        );
        expect(run.summary).toBe('');
        expect(log.unmocked).toEqual([]);
        expect(log.crash).toBeNull();
      });
    });
  });

  describe.each(['all', 'existing'] as const)(
    "'%s': a changed draft outside the lecture set, beside a lecture in it",
    (scope) => {
      let run: BundleRun;
      beforeAll(() => {
        run = runBundle(`lecture-set-draft-${scope}`, {
          scope,
          prFiles: [
            {
              filename: 'lectures/a-new.md',
              status: 'renamed',
              previous_filename: 'lectures/a.md',
            },
            { filename: 'lectures/draft.md', status: 'modified' },
          ],
          source: {
            [atMerge('lectures/a-new.md')]: lecture('Alpha'),
            [atParent('lectures/a.md')]: lecture('Alpha'),
            ...changedInSource('lectures/draft.md', 'Draft'),
            ...listedAtMerge('a-new'),
          },
          // The edition has the draft and a state file for it, so syncing it
          // under either scope would call the model.
          target: {
            '.translate/state/a.md.yml': STATE,
            'lectures/a.md': translated('Alpha'),
            '.translate/state/draft.md.yml': STATE,
            'lectures/draft.md': translated('Draft'),
          },
        });
      }, 90_000);

      it('reads nothing of the draft, nor its state file', () => {
        check(run, (log) => {
          expect(requestsFor(log, 'lectures/draft.md')).toEqual([]);
          // The include scan read the ToC's one document, to look for an includer.
          expect(log.requests.slice(0, 4)).toEqual([
            PR_FILES,
            ...READ_LECTURE_SET,
            readSource('lectures/a-new.md'),
          ]);
        });
      });

      it('syncs the lecture, and lists the draft in the PR body but not its metadata', () => {
        check(run, (log) => {
          expect(log.writes.map((w) => w.path)).toEqual([
            'lectures/a-new.md',
            '.translate/state/a-new.md.yml',
          ]);
          expect(log.pulls).toHaveLength(1);
          const { body } = log.pulls[0];
          expect(itemsUnder(body, OUTSIDE_SET_HEADING)).toEqual(['`lectures/draft.md`']);
          expect(body).not.toContain(NOT_SYNCED_HEADING);
          expect(declaredFiles(body)).toEqual([
            { path: 'lectures/a-new.md', type: 'renamed', previousPath: 'lectures/a.md' },
          ]);
          expect(log.comments).toHaveLength(1);
          expect(log.comments[0].body).not.toContain('draft.md');
        });
      });

      it('lists the draft in the job summary', () => {
        check(run, () => {
          expect(run.summary.split('\n')[0]).toBe(
            scope === 'all'
              ? '## Translation sync (ml)'
              : '## Translation sync (ml): `sync-scope: existing`'
          );
          expect(linesOf(run.summary)).toContain(`**Translation PR:** ${PR_URL}`);
          expect(itemsUnder(run.summary, '### Not synced: outside the lecture set (1)')).toEqual([
            '`lectures/draft.md`',
          ]);
          if (scope === 'existing') {
            expect(itemsUnder(run.summary, '### In scope (1)')).toEqual(['`lectures/a-new.md`']);
          } else {
            expect(run.summary).not.toContain('### In scope');
          }
        });
      });

      it('passes, with no failure issue, and no model call', () => {
        check(run, (log) => {
          expect(run.status).toBe(0);
          expect(log.issues).toEqual([]);
          expect(run.stdout).toContain(
            'lectures/draft.md: not synced — outside the lecture set (lectures/_toc.yml does not ' +
              'list it, and no lecture includes it)'
          );
          expectCleanRun(log);
        });
      });
    }
  );

  describe.each(['all', 'existing'] as const)(
    "'%s': a source PR that changes only a README.md, with a failure issue open",
    (scope) => {
      let run: BundleRun;
      beforeAll(() => {
        run = runBundle(`lecture-set-readme-${scope}`, {
          scope,
          prFiles: [{ filename: 'lectures/README.md', status: 'modified' }],
          source: {
            ...changedInSource('lectures/README.md', 'Readme'),
            [atMerge('lectures/a.md')]: lecture('Alpha'),
            ...listedAtMerge('a'),
          },
          target: { 'lectures/README.md': translated('Readme') },
          issues: OPEN_ISSUES,
        });
      }, 90_000);

      it('reads the lecture set, and nothing of the edition', () => {
        check(run, (log) => {
          expect(log.requests).toEqual([
            PR_FILES,
            ...READ_LECTURE_SET,
            readSource('lectures/a.md'),
            // A scoped run that passes with nothing to deliver closes the
            // failure issue, as before (#387); an `all` run leaves it open.
            ...(scope === 'existing' ? CLOSE_FAILURE_ISSUE : []),
          ]);
        });
      });

      it('passes with no PR, no failure issue and no comment on the source PR', () => {
        check(run, (log) => {
          expect(run.status).toBe(0);
          expect(log.pulls).toEqual([]);
          expect(log.issues).toEqual([]);
          expect(log.writes).toEqual([]);
          expect(run.outputs).toEqual({});
          expect(log.issueUpdates).toEqual(scope === 'existing' ? [CLOSED] : []);
          expectCleanRun(log);
        });
      });

      it('says so in the job summary, and lists the README.md', () => {
        check(run, () => {
          expect(linesOf(run.summary)).toContain(
            scope === 'existing'
              ? '**No translation PR.** Nothing this source PR changed is in scope.'
              : '**No translation PR.** Nothing this source PR changed is in the lecture set.'
          );
          expect(itemsUnder(run.summary, '### Not synced: outside the lecture set (1)')).toEqual([
            '`lectures/README.md`',
          ]);
        });
      });
    }
  );

  describe("'all': a ToC that is not YAML", () => {
    const ERROR = refused(
      // js-yaml's message goes on to quote the ToC's lines; only its first
      // line is kept, so the error stays one item of the issue's list.
      '_toc.yml is not valid YAML: unexpected end of the stream within a flow collection (3:1)'
    );
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('lecture-set-toc-unparseable', {
        scope: 'all',
        prFiles: [
          { filename: 'lectures/a.md', status: 'modified' },
          { filename: 'lectures/f.md', status: 'removed' },
        ],
        source: {
          ...changedInSource('lectures/a.md', 'Alpha'),
          [atMerge('lectures/_toc.yml')]: 'format: jb-book\nroot: [intro\n',
        },
        target: { 'lectures/a.md': translated('Alpha'), 'lectures/f.md': translated('Foxtrot') },
      });
    }, 90_000);

    it('reads the tree and the ToC, then opens the failure issue, and syncs nothing', () => {
      check(run, (log) => {
        expect(log.requests).toEqual([PR_FILES, ...READ_LECTURE_SET, ...OPEN_FAILURE_ISSUE]);
        expect(log.writes).toEqual([]);
        expect(log.deletes).toEqual([]);
        expect(log.pulls).toEqual([]);
        expectCleanRun(log);
      });
    });

    it('fails the run, and never falls back to the folder', () => {
      check(run, (log) => {
        expect(run.status).toBe(1);
        expect(issueErrors(log.issues[0])).toEqual([ERROR]);
        expect(recoveryOf(log.issues[0])).toContain(
          "This run synced nothing: it could not read the source's lecture set at the PR's merge commit"
        );
        expect(recoveryOf(log.issues[0])).not.toContain('translate forward -f a.md');
      });
    });

    it('lists the error in the job summary of the `all` run', () => {
      check(run, () => {
        expect(run.summary.split('\n')[0]).toBe('## Translation sync (ml)');
        expect(linesOf(run.summary)).toContain(FAILED_WITH_NO_PR);
        expect(itemsUnder(run.summary, '### ❌ Lecture set unknown (1)')).toEqual([ERROR]);
      });
    });
  });

  describe("'existing': a tree GitHub truncated", () => {
    const ERROR = refused(
      `GitHub truncated the file list of ${SOURCE_REPO} at cafe000, so the lecture set cannot ` +
        'be read whole'
    );
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('lecture-set-tree-truncated', {
        scope: 'existing',
        prFiles: [{ filename: 'lectures/a.md', status: 'modified' }],
        source: { ...changedInSource('lectures/a.md', 'Alpha'), ...listedAtMerge('a') },
        sourceTrees: {
          [SHA]: { paths: ['lectures/_toc.yml', 'lectures/a.md'], truncated: true },
        },
        target: { '.translate/state/a.md.yml': STATE, 'lectures/a.md': translated('Alpha') },
      });
    }, 90_000);

    it('reads nothing after the tree, not even the edition, and fails with a failure issue', () => {
      check(run, (log) => {
        expect(log.requests).toEqual([PR_FILES, readTree(), ...OPEN_FAILURE_ISSUE]);
        expect(run.status).toBe(1);
        expect(issueErrors(log.issues[0])).toEqual([ERROR]);
        expect(log.pulls).toEqual([]);
        expectCleanRun(log);
      });
    });

    it('writes the scoped job summary, with the error and no scope check', () => {
      check(run, () => {
        expect(run.summary.split('\n')[0]).toBe('## Translation sync (ml): `sync-scope: existing`');
        expect(linesOf(run.summary)).toContain(FAILED_WITH_NO_PR);
        expect(run.summary).not.toContain('### In scope');
        expect(itemsUnder(run.summary, '### ❌ Lecture set unknown (1)')).toEqual([ERROR]);
      });
    });
  });

  describe("'all': a lecture the include scan cannot read, beside a lecture that syncs", () => {
    const ERROR =
      'Fetch failed (lecture set): lectures/_admonition/gpu.md: could not read lectures/b.md ' +
      `from ${SOURCE_REPO} at cafe000 (status 500): HTTP 500, so whether it is in the lecture ` +
      'set is unknown. It was not synced.';
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('lecture-set-scan-500', {
        scope: 'all',
        prFiles: [
          { filename: 'lectures/a-new.md', status: 'renamed', previous_filename: 'lectures/a.md' },
          { filename: 'lectures/_admonition/gpu.md', status: 'modified' },
        ],
        source: {
          [atMerge('lectures/a-new.md')]: lecture('Alpha'),
          [atParent('lectures/a.md')]: lecture('Alpha'),
          [atMerge('lectures/b.md')]: { status: 500 },
          ...changedInSource('lectures/_admonition/gpu.md', 'GPU'),
          ...listedAtMerge('a-new', 'b'),
        },
        target: {
          'lectures/a.md': translated('Alpha'),
          'lectures/_admonition/gpu.md': translated('GPU'),
        },
      });
    }, 90_000);

    it('still syncs the lecture whose place it could read, in a PR', () => {
      check(run, (log) => {
        expect(log.writes.map((w) => w.path)).toEqual([
          'lectures/a-new.md',
          '.translate/state/a-new.md.yml',
        ]);
        expect(log.pulls).toHaveLength(1);
        expect(declaredFiles(log.pulls[0].body)).toEqual([
          { path: 'lectures/a-new.md', type: 'renamed', previousPath: 'lectures/a.md' },
        ]);
      });
    });

    it('neither syncs nor lists the file whose place it could not read', () => {
      check(run, (log) => {
        expect(requestsFor(log, 'lectures/_admonition/gpu.md')).toEqual([]);
        expect(log.pulls[0].body).not.toContain(OUTSIDE_SET_HEADING);
      });
    });

    it('fails the run with a failure issue that names the read', () => {
      check(run, (log) => {
        expect(run.status).toBe(1);
        expect(issueErrors(log.issues[0])).toEqual([ERROR]);
        expect(log.comments).toEqual([]);
        expect(linesOf(run.stdout)).toContain(`::error::${ERROR}`);
        expectCleanRun(log);
      });
    });

    it('lists the error in the job summary, beside the PR', () => {
      check(run, () => {
        expect(linesOf(run.summary)).toContain(
          `**Translation PR:** ${PR_URL} The run also failed with 1 error(s); see the log.`
        );
        expect(itemsUnder(run.summary, '### ❌ Lecture set unknown (1)')).toEqual([ERROR]);
      });
    });
  });

  describe("'all': a lecture renamed to a path outside the lecture set", () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('lecture-set-renamed-out', {
        scope: 'all',
        prFiles: [
          {
            filename: 'lectures/drafts/c.md',
            status: 'renamed',
            previous_filename: 'lectures/c.md',
          },
          { filename: 'lectures/_toc.yml', status: 'modified' },
        ],
        source: {
          // A real change, so carrying it would call the model.
          [atMerge('lectures/drafts/c.md')]: lecture('Charlie', 'Body one, revised.'),
          [atParent('lectures/c.md')]: lecture('Charlie'),
          [atMerge('lectures/a.md')]: lecture('Alpha'),
          [atParent('lectures/a.md')]: lecture('Alpha'),
          ...listedAtMerge('a'),
          [atParent('lectures/_toc.yml')]: tocListing('a', 'c'),
        },
        target: {
          'lectures/c.md': translated('Charlie'),
          '.translate/state/c.md.yml': STATE,
          'lectures/_toc.yml': tocListing('a', 'c'),
        },
      });
    }, 90_000);

    it('keeps the old file and its state file in the edition, and mirrors the ToC', () => {
      check(run, (log) => {
        expect(requestsFor(log, 'lectures/c.md')).toEqual([]);
        expect(log.writes).toEqual([updated('lectures/_toc.yml', tocListing('a'))]);
        expect(log.deletes).toEqual([]);
      });
    });

    it('lists the rename in the PR body, beside the warning in the log', () => {
      check(run, (log) => {
        expect(log.pulls).toHaveLength(1);
        const { body } = log.pulls[0];
        expect(itemsUnder(body, OUTSIDE_SET_HEADING)).toEqual([
          '`lectures/drafts/c.md` (renamed from `lectures/c.md`): the edition keeps its ' +
            'translation of `lectures/c.md`, which sync no longer updates',
        ]);
        // The lecture left the folder's ToC with its move, so it is listed once.
        expect(body).not.toContain(TOC_REMOVED_HEADING);
        expect(declaredFiles(body)).toEqual([{ path: 'lectures/_toc.yml', type: 'toc' }]);
        expect(run.stdout).toContain(
          '::warning::lectures/c.md was renamed to lectures/drafts/c.md, which is outside the ' +
            `lecture set: ${EDITION} keeps its translation of lectures/c.md, which sync no ` +
            'longer updates'
        );
        expect(run.status).toBe(0);
        expectCleanRun(log);
      });
    });
  });

  describe("'all': a ToC change that takes a lecture out and adds two it does not change", () => {
    const BEFORE_TOC = tocListing('a', 'b', 'c');
    const AFTER_TOC = tocListing('a', 'c', 'd', 'e');
    let run: BundleRun;
    beforeAll(() => {
      const source: Scenario['source'] = {
        [atMerge('lectures/_toc.yml')]: AFTER_TOC,
        [atParent('lectures/_toc.yml')]: BEFORE_TOC,
      };
      for (const stem of ['a', 'b', 'c', 'd', 'e']) {
        source[atMerge(`lectures/${stem}.md`)] = lecture(stem);
        source[atParent(`lectures/${stem}.md`)] = lecture(stem);
      }
      run = runBundle('lecture-set-toc-change', {
        scope: 'all',
        prFiles: [{ filename: 'lectures/_toc.yml', status: 'modified' }],
        source,
        // `d` was listed before, and the edition kept its state file; `e` is
        // listed for the first time.
        target: { 'lectures/_toc.yml': BEFORE_TOC, '.translate/state/d.md.yml': STATE },
      });
    }, 90_000);

    it('mirrors the ToC, and declares only it', () => {
      check(run, (log) => {
        expect(log.writes).toEqual([updated('lectures/_toc.yml', AFTER_TOC)]);
        expect(declaredFiles(log.pulls[0].body)).toEqual([
          { path: 'lectures/_toc.yml', type: 'toc' },
        ]);
      });
    });

    it('reads one state file per added lecture, after the content fetch and before the PR', () => {
      check(run, (log) => {
        const at = (request: string) => log.requests.indexOf(request);
        const gapReads = [
          readEdition('.translate/state/d.md.yml'),
          readEdition('.translate/state/e.md.yml'),
        ];
        expect(log.requests.filter((r) => gapReads.includes(r))).toEqual(gapReads);
        expect(at(gapReads[0])).toBeGreaterThan(at(readEdition('lectures/_toc.yml')));
        expect(at(gapReads[1])).toBeLessThan(at(`GET /repos/${SOURCE_REPO}/pulls/${PR_NUMBER}`));
      });
    });

    it('lists the lecture taken out as kept, and the added ones with their catch-up', () => {
      check(run, (log) => {
        const { body } = log.pulls[0];
        expect(itemsUnder(body, TOC_REMOVED_HEADING)).toEqual(['`lectures/b.md`']);
        expect(itemsUnder(body, TOC_ADDED_HEADING)).toEqual([
          '`lectures/d.md`: `translate status -f d.md`, then `translate forward -f d.md`',
          '`lectures/e.md`: `translate init -f e.md`',
        ]);
        expect(itemsUnder(run.summary, '### Not synced: taken out of the ToC (1)')).toEqual([
          '`lectures/b.md`',
        ]);
        expect(itemsUnder(run.summary, '### ⚠️ Added to the ToC, nothing delivered (2)')).toEqual([
          '`lectures/d.md`: `translate status -f d.md`, then `translate forward -f d.md`',
          '`lectures/e.md`: `translate init -f e.md`',
        ]);
      });
    });

    it('passes, with no failure issue, and no model call', () => {
      check(run, (log) => {
        expect(run.status).toBe(0);
        expect(log.issues).toEqual([]);
        expectCleanRun(log);
      });
    });
  });

  describe("'all': a delivered lecture that includes a file the edition lacks", () => {
    const INCLUDES = `${include('_admonition/gpu.md')}\n\n${include('_admonition/x-new.md')}`;
    const ALPHA = lecture('Alpha', `Body one.\n\n${INCLUDES}`);
    /** Its translation, which keeps the includes, as structural parity requires. */
    const ALPHA_ML = translated('Alpha').replace('ഉള്ളടക്കം.\n', `ഉള്ളടക്കം.\n\n${INCLUDES}\n`);
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('lecture-set-missing-include', {
        scope: 'all',
        prFiles: [
          { filename: 'lectures/a-new.md', status: 'renamed', previous_filename: 'lectures/a.md' },
          {
            filename: 'lectures/_admonition/x-new.md',
            status: 'renamed',
            previous_filename: 'lectures/_admonition/x.md',
          },
        ],
        // Pure renames, which need no model call: the lecture's text is the
        // same at both commits, though in a real PR its include would change
        // with the fragment's name. The renamed fragment is found by the scan,
        // since the lecture names its new path.
        source: {
          [atMerge('lectures/a-new.md')]: ALPHA,
          [atParent('lectures/a.md')]: ALPHA,
          [atMerge('lectures/_admonition/x-new.md')]: lecture('Xray'),
          [atParent('lectures/_admonition/x.md')]: lecture('Xray'),
          [atMerge('lectures/_admonition/gpu.md')]: lecture('GPU'),
          ...listedAtMerge('a-new'),
        },
        target: {
          'lectures/a.md': ALPHA_ML,
          'lectures/_admonition/x.md': translated('Xray'),
        },
      });
    }, 90_000);

    it('delivers both renames, the fragment found by the scan', () => {
      check(run, (log) => {
        expect(log.writes.map((w) => w.path)).toEqual([
          'lectures/a-new.md',
          '.translate/state/a-new.md.yml',
          'lectures/_admonition/x-new.md',
          '.translate/state/_admonition/x-new.md.yml',
        ]);
        expect(declaredFiles(log.pulls[0].body)).toEqual([
          { path: 'lectures/a-new.md', type: 'renamed', previousPath: 'lectures/a.md' },
          {
            path: 'lectures/_admonition/x-new.md',
            type: 'renamed',
            previousPath: 'lectures/_admonition/x.md',
          },
        ]);
      });
    });

    it('reads the edition for the include it lacks, and not for the one this PR delivers', () => {
      check(run, (log) => {
        expect(log.requests).toContain(readEdition('lectures/_admonition/gpu.md'));
        expect(log.requests).not.toContain(readEdition('lectures/_admonition/x-new.md'));
      });
    });

    it('lists the missing include, with its catch-up, in the PR body and the job summary', () => {
      check(run, (log) => {
        const item =
          '`lectures/_admonition/gpu.md` (included by `lectures/a-new.md`): ' +
          '`translate init -f _admonition/gpu.md`';
        expect(itemsUnder(log.pulls[0].body, MISSING_INCLUDES_HEADING)).toEqual([item]);
        expect(itemsUnder(run.summary, '### ⚠️ Included, but not in this edition (1)')).toEqual([
          item,
        ]);
        expect(run.summary.split('\n')[0]).toBe('## Translation sync (ml)');
      });
    });

    it('passes, with no failure issue, and no model call', () => {
      check(run, (log) => {
        expect(run.status).toBe(0);
        expect(log.issues).toEqual([]);
        expectCleanRun(log);
      });
    });
  });
});

describe("the premise of update mode in the built bundle's runSync (#420)", () => {
  /** The source commit the edition's translation of a lecture was last synced to. */
  const SYNCED_AT = 'beef1234';
  /** A later source commit, past this PR's merge commit. */
  const LATER = 'feed5678';
  /** A state file recording `sha`, quoted as the sync writes one. */
  const stateAt = (sha: string) =>
    [
      `source-sha: "${sha}"`,
      'synced-at: "2026-11-02"',
      'model: claude-sonnet-5',
      'mode: UPDATE',
      'section-count: 1',
      '',
    ].join('\n');
  /** A source key: a path at a given commit. */
  const atCommit = (p: string, sha: string) => `${p}@${sha}`;
  /** The comparison of a recorded commit with this PR's merge commit. */
  const compareFrom = (sha: string) => `GET /repos/${SOURCE_REPO}/compare/${sha}...${SHA}`;
  const LIST_PULLS = `GET /repos/${EDITION}/pulls`;

  /** An open sync PR in the edition that carries `lectures/a.md`, for source PR 6. */
  const OPEN_SYNC_PR = {
    number: 31,
    head: { ref: 'translation-sync-2026-11-02T00-00-00-pr-6' },
    body:
      'Earlier sync.\n\n<!-- translation-sync-metadata\n' +
      JSON.stringify({
        sourceRepo: SOURCE_REPO,
        sourcePR: 6,
        sourceCommitSha: 'cafe0006',
        targetBaseSha: 'base0006',
        sourceLanguage: 'en',
        targetLanguage: 'ml',
        claudeModel: 'claude-sonnet-5',
        files: [{ path: 'lectures/a.md', type: 'markdown' }],
      }) +
      '\n-->',
  };

  /**
   * A source PR that changes `lectures/a.md`, whose translation was synced to
   * `SYNCED_AT`. `englishThen` is the source's `a.md` at that commit: the
   * English this PR changed when the premise holds, an earlier English when
   * the translation is behind.
   */
  function changesA(englishThen: string): Scenario {
    return {
      scope: 'all',
      prFiles: [{ filename: 'lectures/a.md', status: 'modified' }],
      source: {
        ...changedInSource('lectures/a.md', 'Alpha'),
        [atCommit('lectures/a.md', SYNCED_AT)]: englishThen,
        ...listedAtMerge('a'),
      },
      target: {
        'lectures/a.md': translated('Alpha'),
        '.translate/state/a.md.yml': stateAt(SYNCED_AT),
      },
    };
  }

  /** English from before a change that never reached the edition. */
  const OLDER_ALPHA = lecture('Alpha', 'Body zero.');

  /** The requests a lecture behind costs, from the PR files to the failure issue. */
  const BEHIND_REQUESTS = [
    PR_FILES,
    ...READ_LECTURE_SET,
    readSource('lectures/a.md'),
    readSource('lectures/a.md', `${SHA}^`),
    readEdition('lectures/a.md'),
    readEdition('.translate/state/a.md.yml'),
    readSource('lectures/a.md', SYNCED_AT),
    compareFrom(SYNCED_AT),
    LIST_PULLS,
    ...OPEN_FAILURE_ISSUE,
  ];

  describe('a lecture behind an open sync PR that carries it', () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('premise-still-open', {
        ...changesA(OLDER_ALPHA),
        compare: { [`${SYNCED_AT}...${SHA}`]: 'ahead' },
        openPulls: [OPEN_SYNC_PR],
      });
    }, 90_000);

    it('reads the English at the recorded commit, compares and lists the open PRs once', () => {
      check(run, (log) => {
        expect(log.requests).toEqual(BEHIND_REQUESTS);
      });
    });

    it('is not held back: it reaches the model, and logs why it may fail', () => {
      check(run, (log) => {
        // A stacked sync may well succeed. The fake model answers no call, so
        // this one fails, and the run opens the failure issue.
        expect(log.modelRequests).toBeGreaterThan(0);
        expect(log.unmocked).toEqual([]);
        expect(log.crash).toBeNull();
        expect(run.stdout).toContain(
          '::warning::lectures/a.md: the translation is at source beef123, behind the English ' +
            `this PR changed; translation PR ${EDITION}#31, still open in the edition, carries ` +
            'the lecture. Syncing as before'
        );
        expect(run.stdout).not.toContain('::error::Translation behind');
      });
    });

    it("keeps the lecture's own error in the issue, with the diagnosis beside it", () => {
      check(run, (log) => {
        expect(run.status).toBe(1);
        expect(log.pulls).toEqual([]);
        expect(log.issues).toHaveLength(1);
        const errors = issueErrors(log.issues[0]) ?? [];
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/^Error processing lectures\/a\.md: /);
        expect(linesOf(log.issues[0].body)).toContain(
          "  - Translation behind: lectures/a.md: ml's translation of it is at source " +
            "`beef123`. This PR's change assumes the English that translation PR " +
            `${EDITION}#31 carries, and it is still open in the edition. Merge it, then carry ` +
            'this change.'
        );
      });
    });

    it('advises merging the open PR first, in place of the generic line', () => {
      check(run, (log) => {
        const recovery = linesOf(recoveryOf(log.issues[0]));
        expect(recovery).toContain(
          `- \`lectures/a.md\`: merge ${EDITION}#31 in the edition first; it carries the ` +
            "English this PR's change assumes. Then carry this PR's change into the lecture: " +
            '`translate forward -f a.md`, or `\\translate-resync` on this PR under the ' +
            'condition below.'
        );
        expect(recovery).not.toContain('- `lectures/a.md`: `translate forward -f a.md`.');
        expect(recovery).toContain(`    git rev-list --count ${SHA}..origin/main -- <path>`);
      });
    });
  });

  describe('a rename behind an open sync PR that carries it', () => {
    let run: BundleRun;
    beforeAll(() => {
      // A pure rename needs no model call, so the stacked sync succeeds.
      run = runBundle('premise-still-open-rename', {
        scope: 'all',
        prFiles: [
          { filename: 'lectures/c-new.md', status: 'renamed', previous_filename: 'lectures/c.md' },
        ],
        source: {
          [atMerge('lectures/c-new.md')]: lecture('Charlie'),
          [atParent('lectures/c.md')]: lecture('Charlie'),
          [atCommit('lectures/c.md', SYNCED_AT)]: lecture('Charlie', 'Body zero.'),
          ...listedAtMerge('c-new'),
        },
        target: {
          'lectures/c.md': translated('Charlie'),
          '.translate/state/c.md.yml': stateAt(SYNCED_AT),
        },
        compare: { [`${SYNCED_AT}...${SHA}`]: 'ahead' },
        openPulls: [
          {
            ...OPEN_SYNC_PR,
            body: OPEN_SYNC_PR.body.replace('lectures/a.md', 'lectures/c.md'),
          },
        ],
      });
    }, 90_000);

    it('syncs the lecture in a PR whose body says to merge the open PR first', () => {
      check(run, (log) => {
        expect(run.status).toBe(0);
        expect(log.issues).toEqual([]);
        expect(log.writes.map((w) => w.path)).toEqual([
          'lectures/c-new.md',
          '.translate/state/c-new.md.yml',
        ]);
        expect(log.pulls).toHaveLength(1);
        expect(itemsUnder(log.pulls[0].body, '### ⚠️ Earlier Translation PR Still Open')).toEqual([
          `\`lectures/c-new.md\`: translation at source \`beef123\`; ${EDITION}#31 carries earlier changes to it`,
        ]);
        expect(declaredFiles(log.pulls[0].body)).toEqual([
          { path: 'lectures/c-new.md', type: 'renamed', previousPath: 'lectures/c.md' },
        ]);
        expect(log.requests).toContain(LIST_PULLS);
        expectCleanRun(log);
      });
    });
  });

  describe('a lecture behind a change that never reached the edition', () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('premise-behind', {
        ...changesA(OLDER_ALPHA),
        compare: { [`${SYNCED_AT}...${SHA}`]: 'ahead' },
        // An open PR that carries another lecture.
        openPulls: [
          {
            ...OPEN_SYNC_PR,
            body: OPEN_SYNC_PR.body.replace('lectures/a.md', 'lectures/z.md'),
          },
        ],
      });
    }, 90_000);

    it('costs the same requests, and makes no model call', () => {
      check(run, (log) => {
        expect(log.requests).toEqual(BEHIND_REQUESTS);
        expectCleanRun(log);
      });
    });

    it('fails with a failure issue that says to recover the lecture first, not to resync', () => {
      check(run, (log) => {
        expect(run.status).toBe(1);
        expect(log.issues).toHaveLength(1);
        expect(issueErrors(log.issues[0])).toEqual([
          "Translation behind: lectures/a.md: ml's translation of it is at source `beef123`. " +
            'The source changed the lecture after that, and that change never reached the ' +
            'edition. Recover the lecture first; that brings in this change too. It was not ' +
            'synced, and no model call was made.',
        ]);
        const recovery = recoveryOf(log.issues[0]);
        expect(recovery).toContain(
          '- `lectures/a.md`: recover the lecture first with `translate forward -f a.md`'
        );
        expect(recovery).not.toContain('comment `\\translate-resync`');
        expect(run.stdout).toContain('::error::Translation behind: lectures/a.md: ');
      });
    });
  });

  describe('a lecture whose translation is already past this change (a resync of an older PR)', () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('premise-ahead', {
        ...changesA(lecture('Alpha', 'Body two.')),
        target: {
          'lectures/a.md': translated('Alpha'),
          '.translate/state/a.md.yml': stateAt(LATER),
        },
        source: {
          ...changedInSource('lectures/a.md', 'Alpha'),
          [atCommit('lectures/a.md', LATER)]: lecture('Alpha', 'Body two.'),
          ...listedAtMerge('a'),
        },
        compare: { [`${LATER}...${SHA}`]: 'behind' },
      });
    }, 90_000);

    it('does not list the open PRs, makes no model call, and says the translation is ahead', () => {
      check(run, (log) => {
        expect(log.requests).not.toContain(LIST_PULLS);
        expect(log.requests).toContain(compareFrom(LATER));
        expectCleanRun(log);
        expect(run.status).toBe(1);
        expect(issueErrors(log.issues[0])).toEqual([
          "Translation ahead: lectures/a.md: ml's translation of it is at source `feed567`, " +
            "which is later than this PR's merge commit `cafe000`. Carrying this change into " +
            'it would undo the source changes made since (QuantEcon/action-translation#276). ' +
            'It was not synced, and no ' +
            'model call was made.',
        ]);
      });
    });
  });

  describe('a lecture whose translation starts from the English this PR changed', () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('premise-holds', changesA(lecture('Alpha')));
    }, 90_000);

    it('reads the English at the recorded commit once, then reaches the model', () => {
      check(run, (log) => {
        expect(requestsFor(log, 'lectures/a.md')).toEqual([
          readSource('lectures/a.md'),
          readSource('lectures/a.md', `${SHA}^`),
          readEdition('lectures/a.md'),
          readEdition('.translate/state/a.md.yml'),
          readSource('lectures/a.md', SYNCED_AT),
        ]);
        expect(log.requests).not.toContain(compareFrom(SYNCED_AT));
        expect(log.requests).not.toContain(LIST_PULLS);
        expect(log.modelRequests).toBeGreaterThan(0);
        expect(log.unmocked).toEqual([]);
      });
    });

    it('fails on the model, not on the premise', () => {
      check(run, (log) => {
        expect(run.status).toBe(1);
        expect(log.issues).toHaveLength(1);
        const errors = issueErrors(log.issues[0]) ?? [];
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/^Error processing lectures\/a\.md: /);
        expect(run.stdout).toContain('premise holds');
      });
    });

    it('advises the CLI for the lecture, and a resync only under its precondition (#281)', () => {
      check(run, (log) => {
        const recovery = linesOf(recoveryOf(log.issues[0]));
        expect(recovery).toContain('- `lectures/a.md`: `translate forward -f a.md`.');
        expect(recovery).toContain(`    git rev-list --count ${SHA}..origin/main -- <path>`);
        expect(recovery.join('\n')).not.toContain('Once the issue is resolved');
      });
    });
  });

  describe('a lecture with no state file in the edition', () => {
    let run: BundleRun;
    beforeAll(() => {
      const scenario = changesA(lecture('Alpha'));
      run = runBundle('premise-no-state', {
        ...scenario,
        target: { 'lectures/a.md': translated('Alpha') },
      });
    }, 90_000);

    it('reads nothing more for the check, logs that it could not check, and reaches the model', () => {
      check(run, (log) => {
        expect(requestsFor(log, 'lectures/a.md')).toEqual([
          readSource('lectures/a.md'),
          readSource('lectures/a.md', `${SHA}^`),
          readEdition('lectures/a.md'),
          readEdition('.translate/state/a.md.yml'),
        ]);
        expect(log.modelRequests).toBeGreaterThan(0);
        expect(run.stdout).toContain(
          `lectures/a.md: premise not checked — ${EDITION} has no .translate/state/a.md.yml; ` +
            'syncing as before'
        );
        const errors = issueErrors(log.issues[0]) ?? [];
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/^Error processing lectures\/a\.md: /);
      });
    });
  });

  describe('a lecture behind, beside a rename whose premise holds', () => {
    let run: BundleRun;
    beforeAll(() => {
      const behind = changesA(OLDER_ALPHA);
      run = runBundle('premise-behind-beside-rename', {
        ...behind,
        prFiles: [
          { filename: 'lectures/a.md', status: 'modified' },
          { filename: 'lectures/c-new.md', status: 'renamed', previous_filename: 'lectures/c.md' },
        ],
        source: {
          ...behind.source,
          [atMerge('lectures/c-new.md')]: lecture('Charlie'),
          [atParent('lectures/c.md')]: lecture('Charlie'),
          [atCommit('lectures/c.md', SYNCED_AT)]: lecture('Charlie'),
          ...listedAtMerge('a', 'c-new'),
        },
        target: {
          ...behind.target,
          'lectures/c.md': translated('Charlie'),
          '.translate/state/c.md.yml': stateAt(SYNCED_AT),
        },
        compare: { [`${SYNCED_AT}...${SHA}`]: 'ahead' },
      });
    }, 90_000);

    it('syncs the rename in a PR that neither carries nor declares the lecture behind', () => {
      check(run, (log) => {
        expect(log.writes.map((w) => w.path)).toEqual([
          'lectures/c-new.md',
          '.translate/state/c-new.md.yml',
        ]);
        expect(log.deletes.map((d) => d.path)).toEqual([
          'lectures/c.md',
          '.translate/state/c.md.yml',
        ]);
        expect(log.pulls).toHaveLength(1);
        expect(declaredFiles(log.pulls[0].body)).toEqual([
          { path: 'lectures/c-new.md', type: 'renamed', previousPath: 'lectures/c.md' },
        ]);
      });
    });

    it('checks the rename under its old name, and makes no model call', () => {
      check(run, (log) => {
        expect(requestsFor(log, 'lectures/c.md')).toContain(readSource('lectures/c.md', SYNCED_AT));
        expectCleanRun(log);
      });
    });

    it('fails the run with a failure issue for the lecture behind only', () => {
      check(run, (log) => {
        expect(run.status).toBe(1);
        expect(log.issues).toHaveLength(1);
        const errors = issueErrors(log.issues[0]) ?? [];
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/^Translation behind: lectures\/a\.md: /);
        expect(log.comments).toEqual([]);
      });
    });
  });
});

describe("failed reads in the built bundle's runSync (#396, #386)", () => {
  /** The error for a removal the edition answered `status` for. */
  const removalError = (p: string, status: number) =>
    `Fetch failed (removed): ${p}: Error: Could not read ${p} from ${EDITION} ` +
    `(status ${status}): HttpError: HTTP ${status}`;

  describe.each(['all', 'existing'] as const)(
    "'%s': a removal the edition cannot read, with a failure issue open",
    (scope) => {
      let run: BundleRun;
      beforeAll(() => {
        run = runBundle(`removal-500-${scope}`, {
          scope,
          prFiles: [{ filename: 'lectures/f.md', status: 'removed' }],
          source: {},
          target: { 'lectures/f.md': { status: 500 } },
          issues: OPEN_ISSUES,
        });
      }, 90_000);

      it('reads nothing more for it, opens no PR, and leaves the failure issue open', () => {
        check(run, (log) => {
          expect(log.requests).toEqual([
            PR_FILES,
            readEdition('lectures/f.md'),
            ...OPEN_FAILURE_ISSUE,
          ]);
          expect(log.pulls).toEqual([]);
          expect(log.deletes).toEqual([]);
          expect(log.issueUpdates).toEqual([]);
        });
      });

      it('fails the run with a failure issue that names the read', () => {
        check(run, (log) => {
          expect(run.status).toBe(1);
          expect(log.issues).toHaveLength(1);
          expect(issueErrors(log.issues[0])).toEqual([removalError('lectures/f.md', 500)]);
          expect(log.comments).toEqual([]);
          expectCleanRun(log);
        });
      });
    }
  );

  describe('a removal the edition cannot read, beside a ToC change', () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('removal-500-toc', {
        scope: 'all',
        prFiles: [
          { filename: 'lectures/_toc.yml', status: 'modified' },
          { filename: 'lectures/f.md', status: 'removed' },
        ],
        source: { [atMerge('lectures/_toc.yml')]: TOC_AFTER },
        target: { 'lectures/_toc.yml': TOC_BEFORE, 'lectures/f.md': { status: 500 } },
        issues: OPEN_ISSUES,
      });
    }, 90_000);

    it('delivers the ToC in a PR that neither deletes nor declares the lecture', () => {
      check(run, (log) => {
        expect(log.writes).toEqual([updated('lectures/_toc.yml', TOC_AFTER)]);
        expect(log.deletes).toEqual([]);
        expect(log.pulls).toHaveLength(1);
        expect(declaredFiles(log.pulls[0].body)).toEqual([
          { path: 'lectures/_toc.yml', type: 'toc' },
        ]);
      });
    });

    it('fails the run with a failure issue for the removal, and closes none', () => {
      check(run, (log) => {
        expect(run.status).toBe(1);
        expect(log.issues).toHaveLength(1);
        expect(issueErrors(log.issues[0])).toEqual([removalError('lectures/f.md', 500)]);
        expect(log.comments).toEqual([]);
        expect(log.issueUpdates).toEqual([]);
        expectCleanRun(log);
      });
    });
  });

  describe('a removed lecture whose state file the edition cannot serve', () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('removal-state-500', {
        scope: 'all',
        prFiles: [{ filename: 'lectures/f.md', status: 'removed' }],
        source: {},
        target: {
          'lectures/f.md': translated('Foxtrot'),
          '.translate/state/f.md.yml': { status: 500 },
        },
      });
    }, 90_000);

    it('removes neither the lecture nor its state file, and opens no PR', () => {
      check(run, (log) => {
        expect(requestsFor(log, 'lectures/f.md')).toEqual([
          readEdition('lectures/f.md'),
          readEdition('.translate/state/f.md.yml'),
        ]);
        expect(log.deletes).toEqual([]);
        expect(log.pulls).toEqual([]);
      });
    });

    it('fails the run with a failure issue that names the state file', () => {
      check(run, (log) => {
        expect(run.status).toBe(1);
        expect(issueErrors(log.issues[0])).toEqual([
          `Fetch failed (state): lectures/f.md: could not read .translate/state/f.md.yml from ` +
            `${EDITION} (status 500: HTTP 500), so whether to delete it is unknown. ` +
            'It was not removed.',
        ]);
        expectCleanRun(log);
      });
    });
  });

  describe('a removed lecture the edition no longer has, whose state file it still has', () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('removal-orphan-state', {
        scope: 'all',
        prFiles: [{ filename: 'lectures/gone.md', status: 'removed' }],
        source: {},
        target: { '.translate/state/gone.md.yml': STATE },
      });
    }, 90_000);

    it('confirms the edition before it trusts the 404', () => {
      check(run, (log) => {
        expect(log.requests.slice(0, 4)).toEqual([
          PR_FILES,
          readEdition('lectures/gone.md'),
          EDITION_READ,
          readEdition('.translate/state/gone.md.yml'),
        ]);
      });
    });

    it('deletes the state file alone, in a PR that lists it under Files Deleted', () => {
      check(run, (log) => {
        expect(log.writes).toEqual([]);
        expect(log.deletes).toEqual([deleted('.translate/state/gone.md.yml')]);
        expect(log.pulls).toHaveLength(1);
        const { body } = log.pulls[0];
        expect(pathsUnder(body, '### Files Deleted')).toEqual(['.translate/state/gone.md.yml']);
        expect(declaredFiles(body)).toEqual([{ path: 'lectures/gone.md', type: 'removed' }]);
      });
    });

    it('passes, with no failure issue', () => {
      check(run, (log) => {
        expect(run.status).toBe(0);
        expect(log.issues).toEqual([]);
        expect(run.outputs['files-synced']).toBe('1');
        expectCleanRun(log);
      });
    });
  });

  describe('a removal-only PR against an edition the token cannot read', () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('removal-edition-unreadable', {
        scope: 'all',
        editionStatus: 404,
        prFiles: [{ filename: 'lectures/gone.md', status: 'removed' }],
        source: {},
        // GitHub answers 404 for every path in a repository the token cannot see.
        target: {},
      });
    }, 90_000);

    it('does not take the 404 as the lecture gone: it fails the run, naming the edition', () => {
      check(run, (log) => {
        expect(log.requests).toEqual([
          PR_FILES,
          readEdition('lectures/gone.md'),
          EDITION_READ,
          ...OPEN_FAILURE_ISSUE,
        ]);
        expect(run.status).toBe(1);
        expect(log.pulls).toEqual([]);
        expect(issueErrors(log.issues[0])).toEqual([
          `Fetch failed (removed): lectures/gone.md: Error: could not read the target repo ` +
            `${EDITION} (status 404), so its 404 for this file cannot be trusted: ` +
            'HttpError: Not Found',
        ]);
        expectCleanRun(log);
      });
    });
  });

  describe('a removal the edition has nothing left of, beside a ToC change', () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('removal-nothing-left-toc', {
        scope: 'all',
        prFiles: [
          { filename: 'lectures/_toc.yml', status: 'modified' },
          { filename: 'lectures/gone.md', status: 'removed' },
        ],
        source: { [atMerge('lectures/_toc.yml')]: TOC_AFTER },
        target: { 'lectures/_toc.yml': TOC_BEFORE },
      });
    }, 90_000);

    it('delivers the ToC in a PR that neither deletes nor declares the lecture', () => {
      check(run, (log) => {
        expect(requestsFor(log, 'lectures/gone.md')).toEqual([
          readEdition('lectures/gone.md'),
          readEdition('.translate/state/gone.md.yml'),
        ]);
        expect(log.writes).toEqual([updated('lectures/_toc.yml', TOC_AFTER)]);
        expect(log.deletes).toEqual([]);
        expect(log.pulls).toHaveLength(1);
        expect(declaredFiles(log.pulls[0].body)).toEqual([
          { path: 'lectures/_toc.yml', type: 'toc' },
        ]);
        expect(run.status).toBe(0);
        expectCleanRun(log);
      });
    });
  });

  /** A rename of `c.md` to `c-new.md`, whose old state file answers 500. */
  const renameWithOldState500 = (edition: Record<string, EditionAnswer>): Scenario => ({
    scope: 'all',
    prFiles: [
      { filename: 'lectures/c-new.md', status: 'renamed', previous_filename: 'lectures/c.md' },
    ],
    source: {
      [atMerge('lectures/c-new.md')]: lecture('Charlie'),
      [atParent('lectures/c.md')]: lecture('Charlie'),
      ...listedAtMerge('c-new'),
    },
    target: { ...edition, '.translate/state/c.md.yml': { status: 500 } },
  });

  describe('a rename whose old state file the edition cannot serve', () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle(
        'rename-old-state-500',
        renameWithOldState500({ 'lectures/c.md': translated('Charlie') })
      );
    }, 90_000);

    // The premise check reads the same state file, so the error is its own.
    it("fails the run with one error, the premise check's, and moves nothing", () => {
      check(run, (log) => {
        expect(run.status).toBe(1);
        expect(issueErrors(log.issues[0])).toEqual([
          `Fetch failed (state): lectures/c-new.md: could not read .translate/state/c.md.yml ` +
            `from ${EDITION} (status 500: HTTP 500), so whether its translation starts from ` +
            "this PR's English could not be checked. It was not synced.",
        ]);
        expect(log.writes).toEqual([]);
        expect(log.deletes).toEqual([]);
        expect(log.pulls).toEqual([]);
        expectCleanRun(log);
      });
    });
  });

  describe('a rename the edition lacks at its old path, whose old state file it cannot serve', () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('rename-new-old-state-500', renameWithOldState500({}));
    }, 90_000);

    // Without the hold, the lecture would be translated from scratch.
    it('holds the lecture back before any model call, and fails the run', () => {
      check(run, (log) => {
        expect(run.status).toBe(1);
        expect(issueErrors(log.issues[0])).toEqual([
          `Fetch failed (state): lectures/c-new.md: could not read .translate/state/c.md.yml ` +
            `from ${EDITION} (status 500: HTTP 500), so whether to delete it is unknown. ` +
            'It was not synced.',
        ]);
        expect(log.writes).toEqual([]);
        expect(log.pulls).toEqual([]);
        expectCleanRun(log);
      });
    });
  });

  describe('a bibliography the edition cannot serve (#386)', () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('bibliography-502', {
        scope: 'all',
        defaultBibliography: true,
        prFiles: [
          { filename: 'lectures/a.md', status: 'modified' },
          { filename: 'lectures/_toc.yml', status: 'modified' },
          { filename: 'lectures/f.md', status: 'removed' },
          { filename: 'lectures/g.md', status: 'removed' },
        ],
        // The changed ToC lists the lecture, so the hold is what keeps it out.
        source: { ...changedInSource('lectures/a.md', 'Alpha'), ...listedAtMerge('a') },
        target: {
          'lectures/a.md': translated('Alpha'),
          'lectures/_toc.yml': TOC_BEFORE,
          'lectures/f.md': translated('Foxtrot'),
          'lectures/g.md': { status: 500 },
          'lectures/_config.yml': { status: 502 },
        },
      });
    }, 90_000);

    it('holds the whole sync: no lecture, ToC or removal, and no model call', () => {
      check(run, (log) => {
        expect(log.writes).toEqual([]);
        expect(log.deletes).toEqual([]);
        expect(log.pulls).toEqual([]);
        expectCleanRun(log);
      });
    });

    it('fails the run with one failure issue that lists every error, the bibliography last', () => {
      check(run, (log) => {
        expect(run.status).toBe(1);
        expect(log.issues).toHaveLength(1);
        expect(issueErrors(log.issues[0])).toEqual([
          removalError('lectures/g.md', 500),
          `Fetch failed (bibliography): Could not read lectures/_config.yml from ${EDITION} ` +
            '(status 502): HttpError: HTTP 502. Nothing was synced.',
        ]);
        expect(log.comments).toEqual([]);
      });
    });

    it('advises making the bibliography readable, with no recovery line per lecture', () => {
      check(run, (log) => {
        const recovery = recoveryOf(log.issues[0]);
        expect(recovery).toContain(
          'This run synced nothing: it could not read the bibliography a sync needs to carry ' +
            "the entries its citations use (the edition's `lectures/_config.yml`, and the " +
            'files its `bibtex_bibfiles` lists, in the edition and in the source)'
        );
        expect(recovery).toContain('- one the edition has: `translate forward -f <file>`;');
        expect(recovery).toContain(`\`\\translate-resync\` on #${PR_NUMBER}`);
        expect(recovery).not.toContain('translate forward -f a.md');
        expect(recovery).not.toContain('Any other lecture named above');
      });
    });
  });
});

describe("renames out of the docs folder in the built bundle's runSync (#398)", () => {
  // Removals are not scoped, so `existing` deletes the moved lecture too.
  describe.each(['all', 'existing'] as const)(
    "'%s': a lecture moved out of the docs folder, beside a ToC edit",
    (scope) => {
      let run: BundleRun;
      beforeAll(() => {
        run = runBundle(`moved-out-${scope}`, {
          scope,
          prFiles: [
            { filename: 'archive/foo.md', status: 'renamed', previous_filename: 'lectures/foo.md' },
            { filename: 'lectures/_toc.yml', status: 'modified' },
          ],
          source: { [atMerge('lectures/_toc.yml')]: TOC_AFTER },
          target: {
            'lectures/foo.md': translated('Foxtrot'),
            '.translate/state/foo.md.yml': STATE,
            'lectures/_toc.yml': TOC_BEFORE,
          },
        });
      }, 90_000);

      it('deletes the translation and its state file, and mirrors the ToC', () => {
        check(run, (log) => {
          expect(log.writes).toEqual([updated('lectures/_toc.yml', TOC_AFTER)]);
          expect(log.deletes).toEqual([
            deleted('lectures/foo.md'),
            deleted('.translate/state/foo.md.yml'),
          ]);
          expect(log.pulls).toHaveLength(1);
          const { body } = log.pulls[0];
          expect(pathsUnder(body, '### Files Deleted')).toEqual([
            'lectures/foo.md',
            '.translate/state/foo.md.yml',
          ]);
          expect(declaredFiles(body)).toEqual([
            { path: 'lectures/_toc.yml', type: 'toc' },
            { path: 'lectures/foo.md', type: 'removed' },
          ]);
        });
      });

      it('says why in the log, and passes', () => {
        check(run, (log) => {
          expect(run.stdout).toContain(
            'lectures/foo.md was moved to archive/foo.md, out of docs-folder: its translation and ' +
              'state file are deleted'
          );
          expect(run.status).toBe(0);
          expect(log.issues).toEqual([]);
          expectCleanRun(log);
        });
      });
    }
  );

  describe("the docs folder's _toc.yml removed and another added outside it, as for a rewritten move", () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('book-moved-rewritten', {
        scope: 'all',
        prFiles: [
          { filename: 'lectures/_toc.yml', status: 'removed' },
          { filename: 'src/_toc.yml', status: 'added' },
          { filename: 'src/foo.md', status: 'renamed', previous_filename: 'lectures/foo.md' },
        ],
        source: {},
        target: {
          'lectures/foo.md': translated('Foxtrot'),
          '.translate/state/foo.md.yml': STATE,
          'lectures/_toc.yml': TOC_BEFORE,
        },
      });
    }, 90_000);

    it('refuses the run the same way, deleting neither the lectures nor the ToC', () => {
      check(run, (log) => {
        expect(log.requests).toEqual([PR_FILES, ...OPEN_FAILURE_ISSUE]);
        expect(log.deletes).toEqual([]);
        expect(run.status).toBe(1);
        expect(issueErrors(log.issues[0])).toEqual([
          "Sync refused: lectures/_toc.yml was moved to src/_toc.yml, out of docs-folder 'lectures/', " +
            'so the source has moved its book. Nothing was synced.',
        ]);
        expectCleanRun(log);
      });
    });
  });

  describe("the docs folder's _toc.yml moved out of it", () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('book-moved', {
        scope: 'all',
        prFiles: [
          { filename: 'src/_toc.yml', status: 'renamed', previous_filename: 'lectures/_toc.yml' },
          { filename: 'src/foo.md', status: 'renamed', previous_filename: 'lectures/foo.md' },
        ],
        source: {},
        target: { 'lectures/foo.md': translated('Foxtrot'), '.translate/state/foo.md.yml': STATE },
      });
    }, 90_000);

    it('reads nothing, deletes nothing, and fails with a failure issue', () => {
      check(run, (log) => {
        expect(log.requests).toEqual([PR_FILES, ...OPEN_FAILURE_ISSUE]);
        expect(log.deletes).toEqual([]);
        expect(log.pulls).toEqual([]);
        expect(run.status).toBe(1);
        expect(issueErrors(log.issues[0])).toEqual([
          "Sync refused: lectures/_toc.yml was moved to src/_toc.yml, out of docs-folder 'lectures/', " +
            'so the source has moved its book. Nothing was synced.',
        ]);
        expectCleanRun(log);
      });
    });

    it('says to move the edition by hand and point the workflow at the new folder', () => {
      check(run, (log) => {
        const recovery = recoveryOf(log.issues[0]);
        expect(recovery).toContain(
          'The source moved its book: `lectures/_toc.yml` became `src/_toc.yml`, outside ' +
            '`docs-folder` (`lectures/`).'
        );
        expect(recovery).toContain("Set the sync workflow's `docs-folder` input to `src`");
        expect(recovery).toContain('Do not use `\\translate-resync` on this PR');
        expect(recovery).not.toContain('translate forward');
      });
    });
  });

  describe('a lecture renamed to a name that is not .md', () => {
    let run: BundleRun;
    beforeAll(() => {
      run = runBundle('renamed-not-markdown', {
        scope: 'all',
        prFiles: [
          {
            filename: 'lectures/foo.ipynb',
            status: 'renamed',
            previous_filename: 'lectures/foo.md',
          },
        ],
        source: {},
        target: { 'lectures/foo.md': translated('Foxtrot') },
      });
    }, 90_000);

    it('warns that the translation is no longer synced, deletes nothing, and passes', () => {
      check(run, (log) => {
        expect(run.stdout).toContain(
          `::warning::lectures/foo.md was renamed to lectures/foo.ipynb, which is not a .md ` +
            `file: ${EDITION} keeps its translation of lectures/foo.md, which sync no longer updates`
        );
        expect(log.requests).toEqual([PR_FILES]);
        expect(log.deletes).toEqual([]);
        expect(run.status).toBe(0);
        expectCleanRun(log);
      });
    });
  });
});

describe("a fragment with no title in the built bundle's runSync (#449)", () => {
  // `_admonition/gpu.md`: one admonition, no `# title`, included by lectures. The
  // section-based update cannot split it, and used to fail it with "Document must
  // have a # title heading" in every edition holding the file.
  const GPU = 'lectures/_admonition/gpu.md';
  const fragment = (text: string) => `\`\`\`{admonition} GPU\n:class: warning\n\n${text}\n\`\`\`\n`;

  let run: BundleRun;
  beforeAll(() => {
    run = runBundle('fragment-whole-file', {
      scope: 'all',
      prFiles: [{ filename: GPU, status: 'modified' }],
      source: {
        // A lecture includes it, so it is in the lecture set sync reads.
        ...listedAtMerge('l1'),
        [atMerge('lectures/l1.md')]: lecture('L1', '```{include} _admonition/gpu.md\n```'),
        [atMerge(GPU)]: fragment('This lecture was built on a GPU.'),
        [atParent(GPU)]: fragment('This lecture uses a GPU.'),
      },
      target: { [GPU]: fragment('ഈ പ്രഭാഷണം ഒരു GPU ഉപയോഗിക്കുന്നു.') },
    });
  }, 90_000);

  it('updates it whole, so it reaches the model instead of failing on its missing title', () => {
    check(run, (log) => {
      expect(run.stdout).toContain(
        `${GPU} has no # title, so it is updated whole rather than section by section`
      );
      expect(log.modelRequests).toBeGreaterThan(0);
      // The fake model fails every call, so the run still fails, on the model.
      const errors = issueErrors(log.issues[0]) ?? [];
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/^Error processing lectures\/_admonition\/gpu\.md: /);
      expect(errors[0]).not.toContain('must have a # title');
      expect(log.unmocked).toEqual([]);
    });
  });
});

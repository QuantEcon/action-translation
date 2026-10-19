/**
 * Runs the built action bundle against a fake GitHub API and a fake model
 * host, for src/__tests__/action-sync-scope.test.ts.
 *
 *   node action-bundle-runner.cjs <scenario.json> <log.json>
 *
 * The test builds this process's environment from scratch: the INPUT_* and
 * GITHUB_* variables the action reads, ANTHROPIC_BASE_URL, and two paths.
 * UNDICI_PATH is undici's entry module and BUNDLE_PATH the bundle to run.
 * GITHUB_API_URL and ANTHROPIC_BASE_URL name the two hosts this file fakes.
 *
 * The scenario says what the source PR changed and what each repository holds:
 *
 *   prFiles        the source PR's files, as `pulls.listFiles` lists them
 *   source         { "<path>@<ref>": content }
 *   target         { "<path>": content | { status } | [answers, in turn] }
 *   editionStatus  optional status for the read of the target repository
 *   issues         optional: the source repository's open issues, as
 *                  `issues.listForRepo` lists them ([{ number, title }])
 *
 * A path the scenario does not list answers 404. In an array of answers, the
 * last one answers every later read. An update to an issue the source
 * repository does not hold answers 404 too.
 *
 * How requests are caught. The bundle's Octokit sends every request through
 * its own copy of undici, which uses undici's global dispatcher: with no proxy
 * variable set, that is the MockAgent installed below. The Anthropic SDK uses
 * Node's global `fetch` instead, which is the undici built into Node, a
 * different version that need not use that MockAgent (Node 26's undici 8 reads
 * another slot), so `fetch` is replaced. A request either path sends to a host
 * this file does not fake is refused and recorded in the log's `unmocked`. A
 * request made with Node's `http`, `https` or `net` modules directly would
 * bypass both fakes; nothing on runSync's path makes one.
 *
 * The log is written when the process exits, a crash included. The test's
 * timeout kills the process with SIGKILL, which leaves no chance to write it,
 * so each GitHub request is also appended to `<log.json>.requests` as it comes
 * in.
 */
/* eslint-env node, es2020 */
/* eslint-disable @typescript-eslint/no-var-requires */
'use strict';

const fs = require('fs');

const [scenarioPath, logPath] = process.argv.slice(2);
const { UNDICI_PATH, BUNDLE_PATH, GITHUB_API_URL, ANTHROPIC_BASE_URL, GITHUB_EVENT_PATH } =
  process.env;
const SOURCE = process.env.GITHUB_REPOSITORY;
const TARGET = process.env['INPUT_TARGET-REPO'];
if (
  !scenarioPath ||
  !logPath ||
  !UNDICI_PATH ||
  !BUNDLE_PATH ||
  !GITHUB_API_URL ||
  !ANTHROPIC_BASE_URL ||
  !GITHUB_EVENT_PATH ||
  !SOURCE ||
  !TARGET
) {
  console.error(
    'usage: node action-bundle-runner.cjs <scenario.json> <log.json>, with UNDICI_PATH, ' +
      'BUNDLE_PATH, GITHUB_API_URL, ANTHROPIC_BASE_URL, GITHUB_EVENT_PATH, ' +
      'GITHUB_REPOSITORY and INPUT_TARGET-REPO set'
  );
  process.exit(2);
}

const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));
const PR_NUMBER = JSON.parse(fs.readFileSync(GITHUB_EVENT_PATH, 'utf8')).pull_request.number;
/** Each GitHub request, one line apiece, appended as it comes in. */
const REQUEST_TRAIL_PATH = `${logPath}.requests`;

const log = {
  /** Every GitHub request, in order: `METHOD /path`, plus `?ref=` when one was given. */
  requests: [],
  /** Files written, in order. */
  writes: [],
  /** Files deleted, in order. */
  deletes: [],
  pulls: [],
  issues: [],
  comments: [],
  /** Updates to source issues, in order: the issue's number, then each field sent. */
  issueUpdates: [],
  /** Requests to the model host. */
  modelRequests: 0,
  /** Requests nothing here fakes, to GitHub or to any other host. Each one fails. */
  unmocked: [],
  /** Whether the MockAgent still held undici's global dispatcher slot at exit. */
  mockKept: false,
  /** An uncaught error, if the bundle crashed. */
  crash: null,
  exitCode: null,
};

// Node's own undici claims undici's global dispatcher slot when it first
// loads, which the first use of `Response`, `fetch` and the like triggers.
// Load it now, so the MockAgent installed next keeps the slot for the rest of
// the run; `mockKept` in the log checks that it did.
new Response('');

const { MockAgent, setGlobalDispatcher } = require(UNDICI_PATH);
const DISPATCHER_SLOT = Symbol.for('undici.globalDispatcher.1');
const GITHUB_ORIGIN = new URL(GITHUB_API_URL).origin;
const agent = new MockAgent();
agent.disableNetConnect();
// A request to any other host matches no interceptor here, so the MockAgent
// refuses it unseen. Record it on its way in, where every request passes.
const dispatch = agent.dispatch.bind(agent);
agent.dispatch = (options, handler) => {
  const origin = new URL(String(options.origin)).origin;
  if (origin !== GITHUB_ORIGIN) log.unmocked.push(`${options.method} ${origin}${options.path}`);
  return dispatch(options, handler);
};
setGlobalDispatcher(agent);

const json = (statusCode, data) => ({
  statusCode,
  data: JSON.stringify(data),
  responseOptions: { headers: { 'content-type': 'application/json; charset=utf-8' } },
});
const notFound = () => json(404, { message: 'Not Found' });
const base64 = (text) => Buffer.from(text, 'utf8').toString('base64');
const file = (path, content, sha) =>
  json(200, { type: 'file', path, encoding: 'base64', content: base64(content), sha });

function readContents(repo, path, ref) {
  if (repo === SOURCE) {
    const content = scenario.source[`${path}@${ref}`];
    return content === undefined ? notFound() : file(path, content, `s-${path}`);
  }
  if (repo === TARGET) {
    let answer = scenario.target[path];
    if (Array.isArray(answer)) answer = answer.length > 1 ? answer.shift() : answer[0];
    if (answer === undefined) return notFound();
    if (typeof answer === 'object') {
      return json(answer.status, { message: `HTTP ${answer.status}` });
    }
    return file(path, answer, `t-${path}`);
  }
  return notFound();
}

const CONTENTS = /^\/repos\/([^/]+\/[^/]+)\/contents\/(.+)$/;
const ISSUE = /^\/repos\/([^/]+\/[^/]+)\/issues\/(\d+)$/;
const ISSUE_LABELS = /^\/repos\/[^/]+\/[^/]+\/issues\/\d+\/labels$/;
const ISSUE_COMMENTS = /^\/repos\/([^/]+\/[^/]+)\/issues\/(\d+)\/comments$/;
/** The source repository's open issues. */
const OPEN_ISSUES = scenario.issues ?? [];

function answerGitHub(request) {
  const url = new URL(request.path, GITHUB_API_URL);
  const path = decodeURIComponent(url.pathname);
  const method = request.method.toUpperCase();
  const ref = url.searchParams.get('ref');
  const line = `${method} ${path}${ref ? `?ref=${ref}` : ''}`;
  log.requests.push(line);
  fs.appendFileSync(REQUEST_TRAIL_PATH, `${line}\n`);
  const body = request.body ? JSON.parse(String(request.body)) : {};
  const contents = path.match(CONTENTS);
  const issue = path.match(ISSUE);
  const comments = path.match(ISSUE_COMMENTS);

  if (method === 'GET' && contents) return readContents(contents[1], contents[2], ref);
  if (method === 'GET' && path === `/repos/${SOURCE}/pulls/${PR_NUMBER}/files`) {
    return json(200, scenario.prFiles);
  }
  if (method === 'GET' && path === `/repos/${SOURCE}/pulls/${PR_NUMBER}`) {
    return json(200, { number: PR_NUMBER, title: 'Source change', labels: [], merged: true });
  }
  if (method === 'GET' && path === `/repos/${TARGET}`) {
    return scenario.editionStatus
      ? json(scenario.editionStatus, { message: 'Not Found' })
      : json(200, { full_name: TARGET, default_branch: 'main' });
  }
  if (method === 'GET' && path === `/repos/${TARGET}/git/ref/heads/main`) {
    return json(200, { ref: 'refs/heads/main', object: { sha: 'base000' } });
  }
  if (method === 'POST' && path === `/repos/${TARGET}/git/refs`) {
    return json(201, { ref: body.ref, object: { sha: body.sha } });
  }
  if (method === 'PUT' && contents) {
    log.writes.push({
      path: contents[2],
      branch: body.branch,
      sha: body.sha ?? null,
      content: Buffer.from(body.content, 'base64').toString('utf8'),
    });
    return json(200, { content: { path: contents[2], sha: 'written' } });
  }
  if (method === 'DELETE' && contents) {
    log.deletes.push({ path: contents[2], branch: body.branch, sha: body.sha ?? null });
    return json(200, { commit: { sha: 'deleted' } });
  }
  if (method === 'POST' && path === `/repos/${TARGET}/pulls`) {
    log.pulls.push({ title: body.title, head: body.head, base: body.base, body: body.body });
    return json(201, { number: 99, html_url: `https://github.com/${TARGET}/pull/99` });
  }
  if (method === 'GET' && path === `/repos/${SOURCE}/issues`) return json(200, OPEN_ISSUES);
  if (method === 'PATCH' && issue && issue[1] === SOURCE) {
    const number = Number(issue[2]);
    log.issueUpdates.push({ number, ...body });
    const held = OPEN_ISSUES.find((open) => open.number === number);
    return held ? json(200, { ...held, ...body }) : notFound();
  }
  if (method === 'POST' && path === `/repos/${SOURCE}/issues`) {
    log.issues.push({ title: body.title, body: body.body });
    return json(201, { number: 5, html_url: `https://github.com/${SOURCE}/issues/5` });
  }
  if (method === 'POST' && ISSUE_LABELS.test(path)) return json(200, []);
  if (method === 'POST' && comments) {
    log.comments.push({ on: `${comments[1]}#${comments[2]}`, body: body.body });
    return json(201, { id: 1 });
  }
  log.unmocked.push(`${method} ${path}`);
  return json(500, { message: `not faked by action-bundle-runner: ${method} ${path}` });
}

agent
  .get(new URL(GITHUB_API_URL).origin)
  .intercept({ path: () => true, method: () => true })
  .reply(answerGitHub)
  .persist();

// The model host refuses every request with a 400, which the translator does
// not retry, so a model call fails fast and is counted in `modelRequests`.
const modelOrigin = new URL(ANTHROPIC_BASE_URL).origin;
globalThis.fetch = async (input) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.origin === modelOrigin) {
    log.modelRequests += 1;
    return new Response(
      JSON.stringify({
        type: 'error',
        error: { type: 'invalid_request_error', message: 'no model is faked here' },
      }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );
  }
  log.unmocked.push(`fetch ${url.href}`);
  throw new TypeError(`fetch failed: ${url.origin} is not faked by action-bundle-runner`);
};

function writeLog(exitCode) {
  log.exitCode = exitCode;
  log.mockKept = globalThis[DISPATCHER_SLOT] === agent;
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
}

process.on('uncaughtExceptionMonitor', (error, origin) => {
  log.crash = `${origin}: ${error instanceof Error ? error.stack : String(error)}`;
});
process.on('beforeExit', () => writeLog(process.exitCode ?? 0));
process.on('exit', (code) => writeLog(code));

require(BUNDLE_PATH);

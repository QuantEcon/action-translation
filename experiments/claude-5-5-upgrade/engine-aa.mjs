#!/usr/bin/env node
// engine-aa.mjs — R1, deterministic and $0: does the engine under test send Sonnet 5 the request
// v0.29.5 sent, and read the same responses the same way? Both engines' CLIs run `translate init`
// against fake-api.mjs (preloaded; nothing leaves the machine), on the Stage 1 fixtures × languages.
//
// Usage: node experiments/claude-5-5-upgrade/engine-aa.mjs --baseline DIR [--candidate DIR]
//            [--fixtures a.md,b.md] [--languages zh-cn,fa,ml,fr] [--model claude-sonnet-5]
//            [--out DIR] [--eval-root DIR] [--concurrency 6]
//
//   --baseline   an engine directory (dist/, glossary/, node_modules/) at v0.29.5 built with ITS OWN
//                dependencies, so the SDK runtime is compared too (outside this repository):
//                  git worktree add "$T" v0.29.5 && (cd "$T" && npm ci && npx tsc)
//                A baseline sharing this checkout's node_modules compares source only (reported).
//   --candidate  default: this checkout (build it first)
//   --out        default EVAL_ROOT/engine-aa (summarize.mjs reads engine-aa.json there); required
//                when --fixtures, --languages or --model narrow the check below R1
//
// engine-aa.json records the candidate's engine id (lib.mjs engineFingerprint, the id run-stages
// pins), its dist/ hash and clean flag, and the fixtures and languages run: summarize.mjs counts
// R1 only for claude-sonnet-5 on every Stage 1 cell, a v0.29.5 baseline and the pinned engine.
//
// Scenarios, each served identically to both engines: end_turn (the document echoed back as its
// own translation), max_tokens, a refusal with stop_details (category cyber), and a mid-stream
// overloaded_error on every attempt. Checks (README, R1):
//   1. the request bodies are byte-identical (every fixture × language);
//   2. headers differ only in SDK identification (user-agent, x-stainless-*); any other
//      difference is listed for RESULTS.md to explain;
//   3. end_turn, max_tokens and overloaded give the same outcome class and the same number of
//      requests in both;
//   4. the refusal differs only as intended (D-2026-10-19): the candidate fails the file with
//      model-refusal; the baseline's reading is recorded.
// Outcome classes come from rate-check-summary.mjs's classifyFailureMessage (one classifier).
// Exit: 0 PASS, 1 FAIL or EXPLAIN, 2 usage or setup error.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DATA_DIR, ENGINE_LANGUAGES, EXPERIMENT_DIR, IDENTITY_MODULE, REPO_ROOT, UsageError, engineFingerprint, helpText, list, parseArgs, resolveEvalRoot, runMain, sha256, writeJson } from './lib.mjs';

const SPEC = { baseline: 'string', candidate: 'string', fixtures: 'string', languages: 'string', model: 'string', out: 'string', 'eval-root': 'string', concurrency: 'number', help: 'boolean' };
const FAKE_API = path.join(EXPERIMENT_DIR, 'fake-api.mjs');
const SUMMARY_MODULE = path.join(REPO_ROOT, 'tool-test-action-on-github', 'rate-check-summary.mjs');
const SCENARIOS = ['end_turn', 'max_tokens', 'refusal', 'overloaded'];
/** The Stage 1 fixtures (cells.mjs), the cells R1 is pre-registered on. */
const DEFAULT_FIXTURES = ['game-theory.md', '25-pre-title-content-lecture.md', '28-add-exercise-lecture.md'];
const SDK_HEADER = /^(user-agent|x-stainless-.*)$/;

function engineInfo(dir, identity) {
  const cli = path.join(dir, 'dist', 'cli', 'index.js');
  if (!fs.existsSync(cli)) throw new UsageError(`no ${cli}: build the engine first`);
  const sdk = identity.sdkInfo(dir);
  const sha = spawnSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  const help = spawnSync(process.execPath, [cli, 'init', '--help'], { cwd: dir, encoding: 'utf8' });
  const nodeModules = path.join(dir, 'node_modules');
  return {
    dir,
    cli,
    version: sdk.engineVersion,
    sdkVersion: sdk.version,
    sdkLocked: sdk.locked,
    git: sha.status === 0 ? sha.stdout.trim() : null,
    reportJson: `${help.stdout}${help.stderr}`.includes('--report-json'),
    sharedNodeModules: fs.existsSync(nodeModules) && fs.lstatSync(nodeModules).isSymbolicLink() ? fs.realpathSync(nodeModules) : null,
  };
}

function scenarioScript(scenario, fixtureText, file) {
  let script;
  if (scenario === 'end_turn') script = { mode: 'echo', outcomes: ['ok'] };
  else if (scenario === 'max_tokens') script = { mode: 'replies', then: 'repeat-last', replies: [{ text: fixtureText.slice(0, Math.floor(fixtureText.length / 2)), stop_reason: 'max_tokens' }] };
  else if (scenario === 'refusal') script = { mode: 'replies', then: 'repeat-last', replies: [{ text: fixtureText.slice(0, 300), stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber', explanation: 'engine-aa refusal' } }] };
  else script = { mode: 'replies', then: 'repeat-last', replies: [{ text: fixtureText.slice(0, 200), midStreamError: { type: 'overloaded_error', message: 'Overloaded' } }] };
  fs.writeFileSync(file, JSON.stringify(script));
}

function runCli(engine, args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', pathToFileURL(FAKE_API).href, engine.cli, ...args], { cwd: engine.dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('exit', (code) => resolve({ code, out }));
  });
}

/** The failure line init wrote under "## Failures" in TRANSLATION-REPORT.md, or null. */
function failureLine(target, fixture) {
  const file = path.join(target, 'TRANSLATION-REPORT.md');
  if (!fs.existsSync(file)) return { state: 'missing' };
  const text = fs.readFileSync(file, 'utf8');
  const at = text.indexOf('\n## Failures');
  if (at === -1) return { state: 'none' };
  const m = text.slice(at).match(new RegExp(`^- \\*\\*${fixture.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*\\*: (.*)$`, 'm'));
  return m ? { state: 'ok', message: m[1] } : { state: 'none' };
}

async function runCase(job, ctx) {
  const { engineKey, scenario, fixture, language } = job;
  const engine = ctx.engines[engineKey];
  const caseDir = path.join(ctx.work, engineKey, scenario, language, fixture.replace(/\.md$/, ''));
  fs.mkdirSync(caseDir, { recursive: true });
  const script = path.join(caseDir, 'script.json');
  const log = path.join(caseDir, 'requests.jsonl');
  const target = path.join(caseDir, 'out');
  scenarioScript(scenario, fs.readFileSync(path.join(ctx.src, fixture), 'utf8'), script);
  const env = { ...process.env, ANTHROPIC_API_KEY: 'sk-ant-engine-aa-fake', ANTHROPIC_BASE_URL: 'http://127.0.0.1:9', FAKE_API_SCRIPT: script, FAKE_API_LOG: log };
  delete env.ANTHROPIC_AUTH_TOKEN;
  const args = ['init', '-s', ctx.src, '-t', target, '--target-language', language, '-d', '.', '-f', fixture, '--localize', 'none', '-m', ctx.model];
  if (engine.reportJson) args.push('--report-json', path.join(caseDir, 'report.json'));
  const run = await runCli(engine, args, env);
  const requests = fs.existsSync(log)
    ? fs
        .readFileSync(log, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];
  let outcome;
  if (fs.existsSync(path.join(target, fixture))) outcome = { kind: 'ok' };
  else {
    const f = failureLine(target, fixture);
    outcome = f.state === 'ok' ? { ...ctx.classify(f.message), message: f.message.slice(0, 300) } : { kind: f.state === 'missing' ? 'no-report' : 'error', message: run.out.slice(-300) };
  }
  let reportKind = null;
  if (engine.reportJson && fs.existsSync(path.join(caseDir, 'report.json'))) {
    const r = JSON.parse(fs.readFileSync(path.join(caseDir, 'report.json'), 'utf8'));
    reportKind = r.lectures?.[0]?.outcome === 'ok' ? 'ok' : (r.lectures?.[0]?.failure?.kind ?? null);
  }
  return { ...job, exitCode: run.code, requests, outcome, reportKind };
}

function headerDiff(a, b) {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const sdk = [];
  const other = [];
  for (const k of keys) {
    if (k === 'x-api-key') continue;
    if (a[k] === b[k]) continue;
    (SDK_HEADER.test(k) ? sdk : other).push({ header: k, baseline: a[k] ?? null, candidate: b[k] ?? null });
  }
  return { sdk, other };
}

/** The first differing JSON path of two request bodies (for the report). */
function firstDifference(a, b, at = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])]) {
      const d = firstDifference(a[k], b[k], `${at}/${k}`);
      if (d) return d;
    }
  }
  return { path: at || '/', baseline: JSON.stringify(a)?.slice(0, 200) ?? 'absent', candidate: JSON.stringify(b)?.slice(0, 200) ?? 'absent' };
}

async function main() {
  const { flags } = parseArgs(process.argv.slice(2), SPEC);
  if (flags.help) {
    console.log(helpText(import.meta.url));
    return 0;
  }
  if (!flags.baseline) throw new UsageError('--baseline DIR is required (a v0.29.5 engine built with its own npm ci)');
  const identity = await import(pathToFileURL(IDENTITY_MODULE).href);
  const { classifyFailureMessage } = await import(pathToFileURL(SUMMARY_MODULE).href);
  const engines = { baseline: engineInfo(path.resolve(flags.baseline), identity), candidate: engineInfo(path.resolve(flags.candidate ?? REPO_ROOT), identity) };
  const fixtures = list(flags.fixtures) ?? DEFAULT_FIXTURES;
  const languages = list(flags.languages) ?? ENGINE_LANGUAGES;
  const model = flags.model ?? 'claude-sonnet-5';
  // summarize.mjs reads EVAL_ROOT/engine-aa as R1: a narrower or other-model run goes elsewhere
  const partial = fixtures.join(',') !== DEFAULT_FIXTURES.join(',') || languages.join(',') !== ENGINE_LANGUAGES.join(',') || model !== 'claude-sonnet-5';
  if (partial && !flags.out) throw new UsageError('--fixtures, --languages or --model narrow the check below R1 (every Stage 1 fixture × language, claude-sonnet-5): pass --out DIR, outside EVAL_ROOT/engine-aa');
  const outDir = path.resolve(flags.out ?? path.join(resolveEvalRoot(flags['eval-root']), 'engine-aa'));
  // the candidate's engine, as run-stages.mjs pins it: R1 counts only for the engine the stages ran on
  const candidateEngine = await engineFingerprint(engines.candidate.dir);
  Object.assign(engines.candidate, {
    engineId: candidateEngine.id,
    distSha256: candidateEngine.distSha256,
    glossarySha256: candidateEngine.glossarySha256,
    clean: candidateEngine.git.clean,
    dirty: candidateEngine.git.dirty,
    distStale: candidateEngine.distStale,
  });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-aa-'));
  const src = path.join(work, '_src');
  fs.mkdirSync(src);
  for (const fx of fixtures) {
    if (!fs.existsSync(path.join(DATA_DIR, fx))) throw new UsageError(`fixture not found: ${path.join(DATA_DIR, fx)}`);
    fs.copyFileSync(path.join(DATA_DIR, fx), path.join(src, fx));
  }
  fs.writeFileSync(path.join(src, '_toc.yml'), ['format: jb-book', `root: ${fixtures[0].replace(/\.md$/, '')}`, ...(fixtures.length > 1 ? ['chapters:', ...fixtures.slice(1).map((f) => `  - file: ${f.replace(/\.md$/, '')}`)] : [])].join('\n') + '\n');

  const sameSdk = engines.baseline.sdkVersion === engines.candidate.sdkVersion;
  console.log(`baseline  ${engines.baseline.dir} — package ${engines.baseline.version}, SDK ${engines.baseline.sdkVersion}${engines.baseline.sharedNodeModules ? ` (node_modules → ${engines.baseline.sharedNodeModules})` : ''}`);
  console.log(`candidate ${engines.candidate.dir} — package ${engines.candidate.version}, SDK ${engines.candidate.sdkVersion}`);
  if (sameSdk) console.log('⚠ both engines load the same SDK: this compares source only, not the SDK runtime (build the baseline with its own npm ci).');

  const ctx = { engines, src, work, model, classify: classifyFailureMessage };
  const jobs = [];
  for (const engineKey of ['baseline', 'candidate']) for (const scenario of SCENARIOS) for (const language of languages) for (const fixture of fixtures) jobs.push({ engineKey, scenario, fixture, language });
  const results = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      results.push(await runCase(job, ctx));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, flags.concurrency ?? 6) }, worker));

  const get = (engineKey, scenario, fixture, language) => results.find((r) => r.engineKey === engineKey && r.scenario === scenario && r.fixture === fixture && r.language === language);
  const cases = [];
  const problems = [];
  const explain = [];
  for (const language of languages) {
    for (const fixture of fixtures) {
      const row = { fixture, language, scenarios: {} };
      for (const scenario of SCENARIOS) {
        const b = get('baseline', scenario, fixture, language);
        const c = get('candidate', scenario, fixture, language);
        row.scenarios[scenario] = { baseline: { kind: b.outcome.kind, requests: b.requests.length, exit: b.exitCode }, candidate: { kind: c.outcome.kind, reportKind: c.reportKind, requests: c.requests.length, exit: c.exitCode } };
        if (!b.requests.length || !c.requests.length) problems.push(`${fixture} × ${language} ${scenario}: the fake API saw no request from the ${!b.requests.length ? 'baseline' : 'candidate'} (stub not engaged?)`);
        if (scenario === 'refusal') {
          if (c.outcome.kind !== 'model-refusal') problems.push(`${fixture} × ${language} refusal: the candidate read it as ${c.outcome.kind}, not model-refusal`);
          continue;
        }
        if (b.outcome.kind !== c.outcome.kind) problems.push(`${fixture} × ${language} ${scenario}: baseline ${b.outcome.kind}, candidate ${c.outcome.kind}`);
        // README R1: the same number of requests, a requirement (a changed retry budget fails it)
        if (b.requests.length !== c.requests.length) problems.push(`${fixture} × ${language} ${scenario}: ${b.requests.length} requests at baseline, ${c.requests.length} at candidate`);
      }
      const b0 = get('baseline', 'end_turn', fixture, language).requests[0];
      const c0 = get('candidate', 'end_turn', fixture, language).requests[0];
      if (b0 && c0) {
        row.bodyIdentical = b0.rawBody === c0.rawBody;
        row.bodySha256 = { baseline: sha256(b0.rawBody), candidate: sha256(c0.rawBody) };
        if (!row.bodyIdentical) {
          let diff;
          try {
            diff = firstDifference(JSON.parse(b0.rawBody), JSON.parse(c0.rawBody));
          } catch {
            diff = { path: '(unparseable)' };
          }
          row.bodyDifference = diff;
          problems.push(`${fixture} × ${language}: request bodies differ at ${diff?.path ?? '?'}`);
        }
        row.headers = headerDiff(b0.headers, c0.headers);
        for (const h of row.headers.other) explain.push(`${fixture} × ${language}: header ${h.header} ${h.baseline} → ${h.candidate}`);
      }
      // within one engine, every scenario's first request is the same request
      for (const engineKey of ['baseline', 'candidate']) {
        const bodies = new Set(SCENARIOS.map((s) => get(engineKey, s, fixture, language).requests[0]?.rawBody).filter(Boolean));
        if (bodies.size > 1) problems.push(`${fixture} × ${language}: the ${engineKey}'s first request differs between scenarios`);
      }
      cases.push(row);
    }
  }
  const sdkHeaders = [...new Set(cases.flatMap((c) => c.headers?.sdk ?? []).map((h) => h.header))];
  const uniqueExplain = [...new Set(explain)];
  const verdict = problems.length ? 'FAIL' : uniqueExplain.length ? 'EXPLAIN' : 'PASS';
  const reason =
    verdict === 'PASS'
      ? `${cases.length} fixture × language cases: request bodies byte-identical; outcomes identical on end_turn, max_tokens and overload; the refusal fails the file only at the candidate (intended)${sdkHeaders.length ? `; SDK headers differ: ${sdkHeaders.join(', ')}` : ''}`
      : verdict === 'FAIL'
        ? problems.slice(0, 8).join('; ') + (problems.length > 8 ? ` (+${problems.length - 8} more)` : '')
        : `explain in RESULTS.md: ${uniqueExplain.slice(0, 8).join('; ')}`;
  const refusalAtBaseline = [...new Set(cases.map((c) => c.scenarios.refusal.baseline.kind))];
  const report = {
    schema: 'claude-5-5-upgrade/engine-aa/1',
    generatedAt: new Date().toISOString(),
    verdict,
    reason,
    model,
    fixtures,
    languages,
    baseline: engines.baseline,
    candidate: engines.candidate,
    sourceOnly: sameSdk,
    summary: { cases: cases.length, scenarios: SCENARIOS, refusalAtBaseline, sdkHeadersDiffering: sdkHeaders, problems, explain: uniqueExplain },
    cases,
  };
  writeJson(path.join(outDir, 'engine-aa.json'), report);
  // the request bodies as evidence (the API key is the fake one)
  for (const r of results.filter((x) => x.scenario === 'end_turn' && x.requests[0])) {
    const file = path.join(outDir, 'requests', r.engineKey, `${r.fixture.replace(/\.md$/, '')}.${r.language}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, r.requests[0].rawBody);
  }
  fs.rmSync(work, { recursive: true, force: true });
  console.log(`R1 ${verdict}: ${reason}`);
  console.log(`refusal stream at the baseline read as: ${refusalAtBaseline.join(', ')}`);
  console.log(`Wrote ${path.join(outDir, 'engine-aa.json')}`);
  return verdict === 'PASS' ? 0 : 1;
}

runMain(main);

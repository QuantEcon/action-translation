#!/usr/bin/env node
// run-stages.mjs — the experiment's driver: prints the plan with cost estimates, and draws a
// stage through tool-test-action-on-github/rate-check.sh (the release instrument; nothing here
// classifies a draw). The design is cells.mjs; the protocol is README.md.
//
// Usage:
//   node experiments/claude-5-5-upgrade/run-stages.mjs --plan [--stage N]      (no API key, no spend)
//   node experiments/claude-5-5-upgrade/run-stages.mjs --stage N [--units a,b] --yes
//   node experiments/claude-5-5-upgrade/run-stages.mjs --followups --yes        (R2 controls, R3 redraws)
//   node experiments/claude-5-5-upgrade/run-stages.mjs --stage N --rerun a,b --yes   (R0: new attempt, all arms)
//   node experiments/claude-5-5-upgrade/run-stages.mjs --stage N --redraw-infra [--units a,b] --yes
//
//   --eval-root DIR        default $EVAL_ROOT, else ~/.cache/action-translation/claude-5-5-eval
//                          (durable: later stages read earlier drafts). Never inside the repository.
//   --allow-tmp            accept a temporary EVAL_ROOT for Stage 1 and later (the OS cleans it)
//   --allow-dirty          run although src/, glossary/ or package files have uncommitted changes
//                          or dist/ is older than src/ (the engine fingerprint still records it)
//   --units a,b            only these units of the stage (ids from --plan)
//   --arms a,b             only these arms (default: every arm of the unit; R0 wants them together)
//   --ref-deps own|shared  for an arm pinned to a ref (Stage 0b): own = npm ci from the ref's lockfile
//                          (default; needs the npm registry), shared = this checkout's node_modules
//   --parallel-budget N    reserved output tokens per arm (default 256000); each arm runs
//                          floor(N / its full-document max_tokens) draws at a time: 4 for Sonnet, 2 for Opus 5.5
//   --parallel a=J,...     override the per-arm concurrency
//   --concurrent-units K   units drawn at once (default 1; each unit's arms always run together)
//   --max-spend-factor F   stop the invocation when the reports' costUSD passes F × the estimate (default 1.5);
//                          a finished draw with no report (a v0.29.5 arm, a crash) counts at its typical cost
//   --yes                  spend money; without it, a stage command prints its plan and exits
//
// Each unit's arms are launched together (in a seeded random order), one rate-check per arm, into
// <EVAL_ROOT>/stage<N>/<unit>/<arm>/r<k>/ with --resume when that run exists, so a rerun continues it.
// rate-check's exit 1 (a cell UNRELIABLE or INCOMPLETE) is a result; exit 2 stops everything.
// Ctrl-C (SIGINT, SIGTERM, SIGHUP) stops every rate-check and waits for them; a second one kills them.
// Exit: 0 done, 2 usage/setup error or a rate-check setup failure, 3 the spend cap stopped the run,
// 130 interrupted.

import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  ENGINE_LANGUAGES,
  EXPERIMENT_DIR,
  RATE_CHECK,
  REPO_ROOT,
  DATA_DIR,
  UsageError,
  appendJsonl,
  engineFingerprint,
  fmtUSD,
  helpText,
  importDist,
  importStats,
  list,
  loadCorpus,
  parseArgs,
  readJson,
  resolveEvalRoot,
  runMain,
  seededRandom,
  sha256File,
  shuffled,
  table,
  walkFiles,
  writeJson,
} from './lib.mjs';
import { ARMS, COST_ASSUMPTIONS, RULES, buildStages, estimateUnitArm } from './cells.mjs';
import { attemptsFor, buildCells, loadEvalRoot, runDirFor } from './results.mjs';
import { evaluate, indexUnits } from './rules.mjs';

const SPEC = {
  plan: 'boolean',
  stage: 'number',
  units: 'string',
  arms: 'string',
  followups: 'boolean',
  rerun: 'string',
  'redraw-infra': 'boolean',
  'eval-root': 'string',
  'allow-tmp': 'boolean',
  'allow-dirty': 'boolean',
  'ref-deps': 'string',
  'parallel-budget': 'number',
  parallel: 'string',
  'concurrent-units': 'number',
  'max-spend-factor': 'number',
  yes: 'boolean',
  help: 'boolean',
};

const MAX_REFUSALS_NEVER = '1000000'; // the rules decide, not rate-check's 4b threshold
const LANGUAGES = ENGINE_LANGUAGES;

// ─── planning context ────────────────────────────────────────────────────────

async function planContext(flags) {
  const { priceFor } = await importDist('model-pricing.js');
  const { maxTokensFor, requestPolicyFor } = await importDist('models.js');
  const { formatAdditionalRules } = await importDist('language-config.js');
  const { DEFAULT_RULES } = await importDist('localization-rules.js');
  const prefixCache = new Map();
  const prefixTokens = (lang) => {
    if (!prefixCache.has(lang)) {
      const file = path.join(REPO_ROOT, 'glossary', `${lang}.json`);
      const glossary = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { terms: [] };
      // the translator's glossary lines: `  - "en" → "translation" (context)`
      const chars = glossary.terms
        .filter((t) => typeof t[lang] === 'string' && t[lang] !== '')
        .reduce((s, t) => s + 12 + t.en.length + t[lang].length + (t.context ? t.context.length + 3 : 0), 0);
      const rules = formatAdditionalRules(lang).length;
      prefixCache.set(lang, Math.round(COST_ASSUMPTIONS.prefixBaseTokens + (chars + rules) / COST_ASSUMPTIONS.prefixCharsPerToken));
    }
    return prefixCache.get(lang);
  };
  const budget = flags['parallel-budget'] ?? 256000;
  const overrides = Object.fromEntries((list(flags.parallel) ?? []).map((kv) => kv.split('=')).map(([a, j]) => [a, Number(j)]));
  const parallelFor = (armId) => {
    if (overrides[armId]) return overrides[armId];
    return Math.max(1, Math.floor(budget / maxTokensFor(ARMS[armId].model, 'fullDocument')));
  };
  return { priceFor, maxTokensFor, requestPolicyFor, formatAdditionalRules, defaultRules: [...DEFAULT_RULES], prefixTokens, parallelFor };
}

function localizeLabel(unit, ctx) {
  return unit.localize === 'default' ? `default (${ctx.defaultRules.join(',')})` : unit.localize;
}

function estimateJob(unit, armIds, ctx) {
  let typical = 0;
  let worst = 0;
  let draws = 0;
  let unpriced = false;
  for (const armId of armIds) {
    const e = estimateUnitArm(unit, armId, { ...ctx, parallel: ctx.parallelFor(armId) });
    draws += e.draws;
    if (e.typical === null) unpriced = true;
    else {
      typical += e.typical;
      worst += e.worst;
    }
  }
  return { draws, typical: unpriced ? null : typical, worst: unpriced ? null : worst };
}

/**
 * The advisory judge's a-priori cost (judge.mjs --plan prices the actual drafts): pairs s55:s5
 * and o55:s5 plus the A/A pairs s5:s5 and s55:s55, over Stage 1 and the head-raw cells, at most
 * 6 draft pairs × 4 sections × both display orders each.
 */
function estimateJudge(stages, ctx) {
  const model = 'claude-opus-4-8';
  const price = ctx.priceFor(model);
  const cells = stages
    .filter((s) => s.stage === 1 || s.stage === 2)
    .flatMap((s) => s.units.filter((u) => u.role === 'gating').flatMap((u) => u.languages.map((lang) => ({ unit: u, lang, bytes: u.bytes[u.fixtures[0]] }))));
  let calls = 0;
  let cost = 0;
  for (const { unit, lang, bytes } of cells) {
    const sections = unit.stage === 1 ? 4 : 8;
    const sectionBytes = bytes / sections;
    const inputTokens = 450 + sectionBytes * COST_ASSUMPTIONS.inputTokensPerSourceByte + 2 * sectionBytes * COST_ASSUMPTIONS.outputTokensPerSourceByte[lang];
    const conventionTokens = Math.round(ctx.formatAdditionalRules(lang).length / COST_ASSUMPTIONS.prefixCharsPerToken) + 750;
    // head-raw cells have few s5 successes to pair: count them at a third
    const pairsPerType = unit.stage === 1 ? 6 : 2;
    const n = 4 * pairsPerType * 4 * 2; // 4 pair types × pairs × sections × orders
    calls += n;
    cost += (n * (inputTokens * price.in + conventionTokens * price.cacheRead + 150 * price.out) + conventionTokens * price.cacheWrite5m) / 1e6;
  }
  return { model, calls, cost };
}

function armList(unit) {
  return Object.entries(unit.arms)
    .map(([a, n]) => `${a}×${n}`)
    .join(' ');
}

function printPlan(stages, ctx, { stage }) {
  const rows = [];
  let grand = { draws: 0, typical: 0, worst: 0 };
  for (const s of stages) {
    if (stage !== undefined && s.stage !== stage) continue;
    console.log(`\nStage ${s.stage} — ${s.title}${s.optional ? ' [optional]' : ''}`);
    console.log(`  feeds: ${s.rules.join(', ')}`);
    rows.length = 0;
    let total = { draws: 0, typical: 0, worst: 0 };
    for (const unit of s.units) {
      const e = estimateJob(unit, Object.keys(unit.arms), ctx);
      total = { draws: total.draws + e.draws, typical: total.typical + (e.typical ?? 0), worst: total.worst + (e.worst ?? 0) };
      rows.push([
        unit.id,
        unit.role,
        unit.fixtures.length === 1 ? unit.fixtures[0] : `${unit.fixtures.length} lectures`,
        unit.languages.join(','),
        localizeLabel(unit, ctx),
        armList(unit),
        Object.keys(unit.arms)
          .map((a) => `${a}:${ctx.parallelFor(a)}`)
          .join(' '),
        e.draws,
        fmtUSD(e.typical),
        fmtUSD(e.worst),
      ]);
    }
    console.log(
      table(rows, ['unit', 'role', 'documents', 'languages', 'localize', 'arms (draws per cell)', 'parallel', 'draws', '$ typical', '$ worst'])
        .split('\n')
        .map((l) => `  ${l}`)
        .join('\n')
    );
    console.log(`  Stage ${s.stage} total: ${total.draws} draws, ${fmtUSD(total.typical)} typical (spend cap ${fmtUSD(total.typical * 1.5)}), ${fmtUSD(total.worst)} if every draw ran to max_tokens`);
    grand = { draws: grand.draws + total.draws, typical: grand.typical + total.typical, worst: grand.worst + total.worst };
  }
  if (stage === undefined || stage === 4) {
    const j = estimateJudge(stages, ctx);
    console.log(`\nStage 4 judge (judge.mjs, ${j.model}, advisory): ~${j.calls} calls, ~${fmtUSD(j.cost)} (both display orders; A/A pairs included)`);
    grand.typical += stage === undefined ? j.cost : 0;
  }
  if (stage === undefined) {
    const guard = stages.find((s) => s.stage === 1).units.reduce((s, u) => s + (estimateJob({ ...u, arms: { s5: RULES.guardExtraDraws, s55: RULES.guardExtraDraws } }, ['s5', 's55'], ctx).typical ?? 0), 0) / 12;
    console.log(
      `\nFollow-ups, drawn only when a rule calls for them: an R2 control is 2 × ${RULES.guardExtraDraws} draws (~${fmtUSD(guard)} per fixture cell);` +
        ` an R3 redraw is 2 × ${RULES.r3Redraws} draws of one lecture (~$0.10–0.80 a draw by size).`
    );
    console.log('Stage 5 (Matt, needs the workflow scope; not run here): two full harness runs (flip branch and a same-day main baseline),');
    console.log('  each ~84 sync + ~84 review runs, plus evaluate --model claude-opus-4-8: roughly $60 (AGENTS.md calls its 1.4M-token two-language figure a floor).');
    console.log(`\nTotal, Stages 0–4 with the judge: ${grand.draws} draws, ~${fmtUSD(grand.typical)} typical; ${fmtUSD(grand.worst)} if every draw ran to max_tokens.`);
  }
  const a = COST_ASSUMPTIONS;
  console.log(
    `\nAssumptions: output tokens per source byte ${Object.entries(a.outputTokensPerSourceByte)
      .map(([l, v]) => `${l} ${v}`)
      .join(', ')} (fr measured; the rest estimated); input ${a.inputTokensPerSourceByte}/byte + ${a.promptOverheadTokens} tokens;` +
      ` cached prefix (glossary + rules) ${LANGUAGES.map((l) => `${l} ${ctx.prefixTokens(l)}`).join(', ')} tokens, written by each arm's first wave and read after;` +
      ` Opus 5.5: tokenizer ×${a.opusTokenizerFactor}, ${a.alwaysThinksThinkingTokens} thinking tokens per draw (unmeasured). Prices: dist/model-pricing.js.`
  );
}

// ─── engine and corpus checks ────────────────────────────────────────────────

/** Pin the engine on first use; afterwards refuse any other (README: one engine for every stage). */
function pinEngine(evalRoot, fp, flags) {
  if (!flags['allow-dirty'] && (!fp.git.clean || fp.distStale)) {
    throw new UsageError(
      `the engine is not clean: ${fp.git.clean ? '' : `uncommitted changes (${fp.git.dirty.join(', ')})`}${fp.distStale ? ' dist/ is older than src/ (npm run build)' : ''} — pass --allow-dirty to record it anyway`
    );
  }
  const file = path.join(evalRoot, 'engine.json');
  if (!fs.existsSync(file)) {
    writeJson(file, { ...fp, pinnedAt: new Date().toISOString() });
    console.log(`Pinned engine ${fp.id} (git ${fp.git.sha?.slice(0, 12)}, SDK ${fp.sdkVersion}) in ${file}`);
    return fp.id;
  }
  const pinned = readJson(file).value;
  if (!pinned || pinned.id !== fp.id) {
    throw new UsageError(
      `this checkout's engine (${fp.id}) is not the one pinned in ${file} (${pinned?.id ?? 'unreadable'}): every stage runs on one engine. ` +
        'Build the pinned commit, or start a new EVAL_ROOT for a new engine.'
    );
  }
  return fp.id;
}

/** Corpus files a unit needs: Stage 1 reads the in-repo fixtures, the rest fetch-corpus.mjs output. */
function checkSources(units, corpus, evalRoot) {
  const expected = new Map();
  for (const d of corpus.documents) expected.set(`${d.class}/${d.local && d.class === 'reference-ml' ? `${d.id}.md` : path.basename(d.local ?? d.path)}`, d.sha256);
  for (const s of corpus.sweep) for (const f of s.files) expected.set(`${s.class}/${f.file}`, f.sha256);
  const problems = [];
  for (const unit of units) {
    for (const fixture of unit.fixtures) {
      const key = `${unit.sourceClass ?? 'fixture'}/${fixture}`;
      const file = unit.sourceClass ? path.join(evalRoot, 'corpus', unit.sourceClass, fixture) : path.join(DATA_DIR, fixture);
      if (!fs.existsSync(file)) problems.push(`missing ${file}`);
      else if (expected.has(key) && sha256File(file) !== expected.get(key)) problems.push(`${file} does not match corpus.yml's sha256`);
    }
  }
  if (problems.length) {
    throw new UsageError(
      `${problems.slice(0, 5).join('; ')}${problems.length > 5 ? ` (+${problems.length - 5} more)` : ''}. ` +
        `Fetch the pinned corpus first: node ${path.relative(REPO_ROOT, path.join(EXPERIMENT_DIR, 'fetch-corpus.mjs'))} --out ${path.join(evalRoot, 'corpus')} --sweep`
    );
  }
}

/** The rate-check flags this experiment relies on (PR B's rate-check); an older script is refused. */
function checkRateCheck() {
  const r = spawnSync('bash', [RATE_CHECK, '--help'], { encoding: 'utf8' });
  const help = `${r.stdout}${r.stderr}`;
  const missing = ['--source-dir', '--localize', '--run-dir', '--resume', '--redraw-infra', '--ref-deps'].filter((f) => !help.includes(f));
  if (missing.length) throw new UsageError(`${path.relative(REPO_ROOT, RATE_CHECK)} lacks ${missing.join(', ')}: this experiment needs the rate-check of PR B`);
}

// ─── drawing ─────────────────────────────────────────────────────────────────

/**
 * Spend under these runs ([{ dir, perDraw }]): costUSD summed over the reports (null-cost reports
 * counted apart), plus an estimate for every finished draw that wrote no report, charged at its
 * arm's typical cost per draw. Those are the draws of an engine without --report-json (Stage 0b's
 * v0.29.5 arm) and crashes; left out, the cap would never see them.
 */
function spendIn(runs) {
  let usd = 0;
  let unpriced = 0;
  let estimated = 0;
  let estimatedDraws = 0;
  for (const { dir, perDraw } of runs) {
    for (const file of walkFiles(dir, (f) => /\/\d+(\.infra\d+)?\.(json|exit)$/.test(f))) {
      if (file.endsWith('.exit')) {
        if (fs.existsSync(file.replace(/\.exit$/, '.json'))) continue; // its report is counted
        if (perDraw === null) unpriced++;
        else {
          estimated += perDraw;
          estimatedDraws++;
        }
        continue;
      }
      const r = readJson(file).value;
      if (!r || typeof r !== 'object') continue;
      if (typeof r.costUSD === 'number') usd += r.costUSD;
      else unpriced++;
    }
  }
  return { usd, unpriced, estimated, estimatedDraws };
}

/** Spend since `before` (both from spendIn), and how it reads: measured, plus estimated draws. */
function spendSince(now, before) {
  const measured = now.usd - before.usd;
  const estimated = now.estimated - before.estimated;
  const draws = now.estimatedDraws - before.estimatedDraws;
  return {
    spent: measured + estimated,
    text: draws > 0 ? `${fmtUSD(measured + estimated)} (${fmtUSD(measured)} measured + ${fmtUSD(estimated)} estimated for ${draws} report-less draws)` : fmtUSD(measured),
  };
}

function countMarkers(dir) {
  return walkFiles(dir, (f) => /\/\d+\.exit$/.test(f)).length;
}

function rateCheckArgs(job, armId, ctx) {
  const unit = job.unit;
  const arm = ARMS[armId];
  const args = [
    '--model',
    arm.model,
    '--draws',
    String(job.arms[armId]),
    '--fixtures',
    unit.fixtures.join(','),
    '--languages',
    unit.languages.join(','),
    '--localize',
    unit.localize,
    '--run-dir',
    job.runDirs[armId],
    '--max-refusals',
    MAX_REFUSALS_NEVER,
    '--parallel',
    String(ctx.parallelFor(armId)),
  ];
  if (unit.sourceClass) args.push('--source-dir', path.join(ctx.evalRoot, 'corpus', unit.sourceClass));
  if (arm.ref) args.push('--ref', arm.ref, '--ref-deps', ctx.refDeps);
  if (fs.existsSync(path.join(job.runDirs[armId], 'meta.txt'))) args.push(job.redrawInfra ? '--redraw-infra' : '--resume');
  return args;
}

function launchArm(job, armId, ctx) {
  const runDir = job.runDirs[armId];
  fs.mkdirSync(path.dirname(runDir), { recursive: true });
  const log = `${runDir}.log`; // beside the run: rate-check refuses a non-empty new run directory
  const fd = fs.openSync(log, 'a');
  const args = rateCheckArgs(job, armId, ctx);
  const startedAt = new Date().toISOString();
  // detached: its own process group, so a stop (the cap, a signal) reaches its CLIs too
  const child = spawn('bash', [RATE_CHECK, ...args], { cwd: REPO_ROOT, env: process.env, detached: true, stdio: ['ignore', fd, fd] });
  fs.closeSync(fd);
  const done = new Promise((resolve) => {
    child.on('exit', (code, signal) => {
      // a setup error stops the invocation: stop the sibling arms now rather than after their draws
      if (code === 2) ctx.stopAll();
      resolve({ armId, code, signal, startedAt, finishedAt: new Date().toISOString(), args, log });
    });
    child.on('error', (error) => resolve({ armId, code: 2, signal: null, error: error.message, startedAt, finishedAt: new Date().toISOString(), args, log }));
  });
  return { child, done };
}

async function runJob(job, ctx, live) {
  const launch = randomUUID();
  const armIds = shuffled(Object.keys(job.arms), seededRandom(launch));
  appendJsonl(ctx.manifest, { event: 'unit-start', at: new Date().toISOString(), launch, stage: job.unit.stage, unit: job.unit.id, attempt: job.attempt, arms: job.arms, order: armIds, engineId: ctx.engineId });
  console.log(`▶ stage ${job.unit.stage} ${job.unit.id} r${job.attempt}: ${armIds.map((a) => `${a}×${job.arms[a]}`).join(', ')}`);
  const started = armIds.map((armId) => {
    const p = launchArm(job, armId, ctx);
    live.add(p.child);
    return p;
  });
  const results = await Promise.all(started.map((p) => p.done));
  for (const p of started) live.delete(p.child);
  let fatal = false;
  for (const r of results) {
    appendJsonl(ctx.manifest, {
      event: 'arm-exit',
      at: r.finishedAt,
      launch,
      stage: job.unit.stage,
      unit: job.unit.id,
      arm: r.armId,
      model: ARMS[r.armId].model,
      attempt: job.attempt,
      runDir: job.runDirs[r.armId],
      exitCode: r.code,
      signal: r.signal,
      startedAt: r.startedAt,
      engineId: ARMS[r.armId].ref ? `ref:${ARMS[r.armId].ref}` : ctx.engineId,
      log: r.log,
      args: r.args,
    });
    // rate-check exits 130 when stopped (its trap); killed before its trap, it reports the signal
    const stopped = r.signal || r.code === 130 || r.code === 143;
    const what = r.code === 0 ? 'ok' : r.code === 1 ? 'a cell is UNRELIABLE or INCOMPLETE (a result; see the log)' : stopped ? `stopped (${r.signal ?? `exit ${r.code}`})` : `setup error ${r.code}`;
    console.log(`  ${job.unit.id} ${r.armId}: ${what} — ${r.log}`);
    if (r.code === 2 || (r.code !== 0 && r.code !== 1 && !ctx.capHit && !ctx.stopped)) fatal = true;
  }
  if (fatal && !ctx.capHit && !ctx.stopped) {
    // README: exit 2 stops the invocation, every other unit's rate-check included
    ctx.stopped = 'setup-error';
    ctx.stopAll();
    throw new UsageError(`rate-check failed to set up for ${job.unit.id}; see the logs above`);
  }
}

async function runJobs(jobs, ctx, flags) {
  const estimate = jobs.reduce((s, j) => s + (estimateJob(j.unit, Object.keys(j.arms), ctx).typical ?? 0), 0);
  const factor = flags['max-spend-factor'] ?? 1.5;
  const cap = estimate * factor;
  const perDraw = (unit, armId) => {
    const e = estimateUnitArm(unit, armId, { ...ctx, parallel: ctx.parallelFor(armId) });
    return e.typical === null || e.draws === 0 ? null : e.typical / e.draws;
  };
  const runs = jobs.flatMap((j) => Object.entries(j.runDirs).map(([armId, dir]) => ({ dir, perDraw: perDraw(j.unit, armId) })));
  for (const armId of new Set(jobs.flatMap((j) => Object.keys(j.arms)))) {
    if (ARMS[armId].ref) console.log(`  ${armId}: ${ARMS[armId].ref} writes no run report, so its spend is estimated (its typical cost per finished draw), not measured`);
  }
  const before = spendIn(runs);
  const live = new Set();
  ctx.capHit = false;
  ctx.stopped = null;
  // Each rate-check runs in its own process group, which a Ctrl-C at the terminal does not reach:
  // stop them from here, and keep the cap's timer running until the last one has exited.
  const stopAll = (sig = 'SIGTERM') => {
    for (const child of live) {
      try {
        process.kill(-child.pid, sig);
      } catch {
        /* already gone */
      }
    }
  };
  ctx.stopAll = stopAll;
  const onSignal = (sig) => {
    if (ctx.stopped) return stopAll('SIGKILL'); // a second Ctrl-C escalates
    ctx.stopped = sig;
    console.error(`✗ ${sig}: stopping every rate-check (their unfinished draws are drawn on a rerun of the same command)`);
    stopAll();
  };
  const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  for (const s of SIGNALS) process.on(s, onSignal);
  const timer = setInterval(() => {
    const snapshot = spendIn(runs);
    const now = spendSince(snapshot, before);
    const done = runs.reduce((s, r) => s + countMarkers(r.dir), 0);
    process.stdout.write(`  … ${done} draws finished in this batch's runs, ${now.text} spent of a ${fmtUSD(cap)} cap${snapshot.unpriced ? `, ${snapshot.unpriced} unpriced` : ''}\n`);
    if (now.spent > cap && !ctx.capHit) {
      ctx.capHit = true;
      console.error(`✗ spend ${fmtUSD(now.spent)} passed ${factor} × the ${fmtUSD(estimate)} estimate: stopping every rate-check. Review, then rerun the same command to resume.`);
      stopAll();
    }
  }, 20000);
  try {
    const k = Math.max(1, flags['concurrent-units'] ?? 1);
    for (let i = 0; i < jobs.length && !ctx.capHit && !ctx.stopped; i += k) {
      // allSettled: every unit's arms have exited before the next step, a failed unit included
      const settled = await Promise.allSettled(jobs.slice(i, i + k).map((job) => runJob(job, ctx, live)));
      const failed = settled.find((s) => s.status === 'rejected');
      if (failed) throw failed.reason;
    }
  } finally {
    clearInterval(timer);
    for (const s of SIGNALS) process.off(s, onSignal);
  }
  console.log(`Spent ${spendSince(spendIn(runs), before).text} (estimate ${fmtUSD(estimate)}).`);
  return ctx.stopped ? 130 : ctx.capHit ? 3 : 0; // never 0 after an interrupt
}

/** A job: one unit, the arms to draw, the attempt and run directory per arm. */
function makeJob(unit, evalRoot, { arms, newAttempt = false, redrawInfra = false }) {
  const armIds = arms ?? Object.keys(unit.arms);
  const latest = Math.max(0, ...armIds.map((a) => attemptsFor(evalRoot, unit.stage, unit.id, a).at(-1) ?? 0));
  const attempt = newAttempt ? latest + 1 : Math.max(1, latest);
  return {
    unit,
    attempt,
    redrawInfra,
    arms: Object.fromEntries(armIds.map((a) => [a, unit.arms[a]])),
    runDirs: Object.fromEntries(armIds.map((a) => [a, runDirFor(evalRoot, unit.stage, unit.id, a, attempt)])),
  };
}

/** Follow-up units the rules call for, from the results so far. */
async function followupJobs(evalRoot, unitIndex) {
  const stats = await importStats();
  const { priceFor } = await importDist('model-pricing.js');
  const loaded = loadEvalRoot(evalRoot);
  const result = evaluate(buildCells(loaded), { stats, priceFor, unitIndex, engineId: loaded.engine?.id ?? null });
  const jobs = [];
  for (const f of result.followups) {
    // remedy 'rerun' (above 10% infra): a new attempt r<k+1>, both arms in one launch, r<k> kept in
    // the history; otherwise the follow-up resumes. --redraw-infra would not do: the replaced
    // attempts stay in the infra share, so the cell could never get back under 10%.
    const newAttempt = f.remedy === 'rerun';
    if (f.kind === 'control') {
      const base = unitIndex.get(`${f.stage}|${f.baseUnit}`);
      jobs.push(makeJob({ ...base, id: f.unitId, role: 'control', arms: { s5: RULES.guardExtraDraws, s55: RULES.guardExtraDraws } }, evalRoot, { newAttempt }));
    } else if (f.kind === 'redraw') {
      jobs.push(
        makeJob(
          {
            stage: f.stage,
            id: f.unitId,
            role: 'redraw',
            class: f.sourceClass,
            sourceClass: f.sourceClass,
            fixtures: [f.fixture],
            bytes: { [f.fixture]: f.bytes ?? 20000 },
            production: { [f.fixture]: f.production },
            languages: [f.language],
            localize: f.localize,
            arms: { s55: RULES.r3Redraws, s5: RULES.r3Redraws },
          },
          evalRoot,
          { newAttempt }
        )
      );
    }
  }
  return jobs;
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const { flags } = parseArgs(process.argv.slice(2), SPEC);
  if (flags.help) {
    console.log(helpText(import.meta.url));
    return 0;
  }
  const corpus = loadCorpus();
  const stages = buildStages(corpus);
  const unitIndex = indexUnits(stages);
  const ctx = await planContext(flags);

  if (flags.stage !== undefined && !stages.some((s) => s.stage === flags.stage)) {
    throw new UsageError(`no stage ${flags.stage} (stages: ${stages.map((s) => s.stage).join(', ')})`);
  }
  if (flags.plan) {
    printPlan(stages, ctx, { stage: flags.stage });
    return 0;
  }
  if (flags.stage === undefined && !flags.followups) throw new UsageError('give --plan, --stage N or --followups (try --help)');
  const stage = flags.stage === undefined ? null : stages.find((s) => s.stage === flags.stage);
  if (flags.stage !== undefined && !stage) throw new UsageError(`no stage ${flags.stage}`);
  const evalRoot = resolveEvalRoot(flags['eval-root'], { allowTmp: flags['allow-tmp'], requireDurable: flags.followups || (stage && stage.stage >= 1) });
  const refDeps = flags['ref-deps'] ?? 'own';
  if (!['own', 'shared'].includes(refDeps)) throw new UsageError('--ref-deps must be own or shared');

  let jobs;
  if (flags.followups) {
    jobs = await followupJobs(evalRoot, unitIndex);
    if (!jobs.length) {
      console.log('No follow-up owed: no R2 guard control and no R3 redraw is needed by the results so far.');
      return 0;
    }
  } else {
    const wanted = list(flags.units);
    const rerun = list(flags.rerun);
    const pick = rerun ?? wanted;
    const units = pick ? stage.units.filter((u) => pick.includes(u.id)) : stage.units;
    if (pick) {
      const unknown = pick.filter((id) => !stage.units.some((u) => u.id === id));
      if (unknown.length) throw new UsageError(`stage ${stage.stage} has no unit ${unknown.join(', ')} (see --plan)`);
    }
    const arms = list(flags.arms);
    if (arms) for (const a of arms) if (!ARMS[a]) throw new UsageError(`unknown arm ${a}`);
    jobs = units.map((u) => makeJob(u, evalRoot, { arms: arms?.filter((a) => u.arms[a]), newAttempt: !!rerun, redrawInfra: !!flags['redraw-infra'] }));
  }

  console.log(`EVAL_ROOT ${evalRoot}`);
  for (const job of jobs) {
    const e = estimateJob(job.unit, Object.keys(job.arms), ctx);
    console.log(`  stage ${job.unit.stage} ${job.unit.id} r${job.attempt}${job.redrawInfra ? ' (redraw infra)' : ''}: ${Object.entries(job.arms).map(([a, n]) => `${a}×${n}`).join(' ')} — ${e.draws} draws, ~${fmtUSD(e.typical)}`);
  }
  if (!flags.yes) {
    console.log('\nNothing drawn: add --yes to spend.');
    return 0;
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new UsageError('ANTHROPIC_API_KEY must be set to draw (--plan needs none)');
  checkRateCheck();
  fs.mkdirSync(evalRoot, { recursive: true });
  const fp = await engineFingerprint(REPO_ROOT);
  const engineId = pinEngine(evalRoot, fp, flags);
  checkSources(
    jobs.map((j) => j.unit),
    corpus,
    evalRoot
  );
  return runJobs(jobs, { ...ctx, evalRoot, engineId, refDeps, manifest: path.join(evalRoot, 'manifest.jsonl') }, flags);
}

runMain(main);

#!/usr/bin/env node
// judge.mjs — ADVISORY blind pairwise judge over successful drafts. It never gates (#227: no
// LLM-judged metric decides anything); a clear adverse result triggers a native-review check.
//
// Usage: node experiments/claude-5-5-upgrade/judge.mjs [--eval-root DIR] [--stages 1,2]
//            [--arms s5=DIR,s55=DIR,o55=DIR] [--pairs s55:s5,o55:s5] [--aa s5,s55]
//            [--judge-model claude-opus-4-8] [--sections-per-pair 4] [--max-pairs-per-cell 6]
//            [--seed STR] [--out DIR] [--concurrency 4] [--no-structured] [--plan] [--summary-only] [--yes]
//
//   --arms       drafts per arm: a directory searched for rate-check runs (default: the latest
//                attempt of each unit under EVAL_ROOT/stage<N>/ for --stages); needs --out
//   --pairs      candidate:baseline pairs to judge; --aa the arms judged against themselves
//                (two different drafts of one arm), the null calibration the trigger needs
//   --judge-model  refused when it is any judged arm's model; a judge in an arm's model line
//                (e.g. an Opus judging o55) is flagged in the summary as lineage-bias risk
//   --plan       count the comparisons left and estimate their cost; no API key, no spend
//   --summary-only  rebuild the summary from judgements.jsonl, no calls
//
// Design (README "Advisory instruments"): drafts are paired by a seeded shuffle within a cell
// (document × language); source and drafts are split with the engine's MystParser (dist/parser.js)
// and a pair whose section counts differ is skipped and counted (that is structural drift, a
// metric of its own); sections are sampled by a seeded hash; every section is judged in BOTH
// display orders and a win counts only when the two orders agree. The judge sees the edition's
// language rules and the glossary terms of the section, never an arm or model name. One call:
// client.messages.create with modelRequestParams(judge, 'analysis'), maxTokensFor(judge,
// 'analysis') and a JSON-schema output_config.format, then assertCompleteResponse and
// extractResponseText from dist/models.js. A refusal, truncation, API error or unparseable
// verdict is an ERROR row; judgements.jsonl is append-only and a rerun retries ERROR keys.
// Outputs in --out (default EVAL_ROOT/judge/<judge-model>/; required with --arms): judgements.jsonl,
// judge-summary.json (the current task set's verdicts only; staleRows counts the others) and
// judged-drafts.json (sha256 of every draft judged). An unpriced judge model's cost is null.

import fs from 'node:fs';
import path from 'node:path';
import {
  REPO_ROOT,
  UsageError,
  appendJsonl,
  fmtP,
  fmtUSD,
  helpText,
  importDist,
  importSdk,
  importStats,
  list,
  mdTable,
  parseArgs,
  readJsonl,
  resolveEvalRoot,
  runMain,
  seededRandom,
  sha256,
  sha256File,
  shuffled,
  stableHash,
  walkFiles,
  writeJson,
} from './lib.mjs';
import { ARMS } from './cells.mjs';
import { discoverRuns, loadRun } from './results.mjs';

const SPEC = {
  'eval-root': 'string',
  stages: 'string',
  arms: 'string',
  pairs: 'string',
  aa: 'string',
  'judge-model': 'string',
  'sections-per-pair': 'number',
  'max-pairs-per-cell': 'number',
  seed: 'string',
  out: 'string',
  concurrency: 'number',
  'no-structured': 'boolean',
  plan: 'boolean',
  'summary-only': 'boolean',
  yes: 'boolean',
  help: 'boolean',
};

/** Bump when the prompt changes: keys include it, so old verdicts are not reused for a new prompt. */
const PROMPT_VERSION = 'judge/1';

const VERDICT_SCHEMA = {
  type: 'json_schema',
  schema: {
    type: 'object',
    properties: { winner: { type: 'string', enum: ['1', '2', 'tie'] }, reason: { type: 'string' } },
    required: ['winner', 'reason'],
    additionalProperties: false,
  },
};

function family(model) {
  return model?.match(/^claude-(opus|sonnet|fable|haiku|mythos)/)?.[1] ?? null;
}

// ─── drafts ──────────────────────────────────────────────────────────────────

/** Successful drafts of one rate-check run: { arm, fixture, language, file, source, id }. */
function draftsOfRun(run, armLabel) {
  const loaded = loadRun(run);
  const ok = new Map();
  for (const d of loaded.draws) if (d.outcome === 'ok' && !d.replacedInfra) ok.set(`${d.language}/${d.stem}/${d.draw}`, d);
  const out = [];
  for (const langEntry of fs.existsSync(run.dir) ? fs.readdirSync(run.dir, { withFileTypes: true }) : []) {
    if (!langEntry.isDirectory() || /^[._]/.test(langEntry.name)) continue;
    const langDir = path.join(run.dir, langEntry.name);
    for (const stemEntry of fs.readdirSync(langDir, { withFileTypes: true })) {
      if (!stemEntry.isDirectory()) continue;
      const fixture = `${stemEntry.name}.md`;
      const source = path.join(run.dir, '_src', fixture);
      const stemDir = path.join(langDir, stemEntry.name);
      for (const drawEntry of fs.readdirSync(stemDir, { withFileTypes: true })) {
        if (!drawEntry.isDirectory() || !/^\d+$/.test(drawEntry.name)) continue;
        const file = path.join(stemDir, drawEntry.name, fixture);
        const report = ok.get(`${langEntry.name}/${stemEntry.name}/${drawEntry.name}`);
        // with reports, only a draw the report calls ok; a legacy run has only the output file
        if (loaded.classification === 'report' && !report) continue;
        if (!fs.existsSync(file) || !fs.existsSync(source)) continue;
        out.push({
          arm: armLabel,
          model: report?.model ?? ARMS[armLabel]?.model ?? null,
          fixture,
          language: langEntry.name,
          file,
          source,
          // EVAL_ROOT runs: <unit>/<arm>/r<k>, unique there; --arms runs: their path under the arm's directory
          id: `${run.idBase ?? `${path.basename(path.dirname(path.dirname(run.dir)))}/${armLabel}/r${run.attempt}`}/${langEntry.name}/${stemEntry.name}/${drawEntry.name}`,
        });
      }
    }
  }
  return out;
}

/** Drafts by arm, from EVAL_ROOT's latest attempts or from --arms directories. */
function collectDrafts({ evalRoot, stages, armDirs, arms }) {
  const byArm = Object.fromEntries(arms.map((a) => [a, []]));
  if (armDirs) {
    for (const [arm, dir] of Object.entries(armDirs)) {
      if (!byArm[arm]) continue;
      const root = path.resolve(dir);
      const runDirs = walkFiles(root, (f) => path.basename(f) === 'meta.txt').map((f) => path.dirname(f));
      for (const runDir of runDirs) {
        // two runs of one cell (run-a/, run-b/) must not share draft ids, so the id names the run's path
        const rel = path.relative(root, runDir).split(path.sep).join('/') || '.';
        byArm[arm].push(...draftsOfRun({ dir: runDir, attempt: Number(path.basename(runDir).replace(/^r/, '')) || 1, idBase: `${arm}=${rel}` }, arm));
      }
    }
    return byArm;
  }
  const latest = new Map();
  for (const run of discoverRuns(evalRoot)) {
    if (!stages.includes(run.stage) || run.phase !== 'base' || !byArm[run.arm]) continue;
    const key = `${run.stage}|${run.unitId}|${run.arm}`;
    if (!latest.has(key) || latest.get(key).attempt < run.attempt) latest.set(key, run);
  }
  for (const run of latest.values()) byArm[run.arm].push(...draftsOfRun(run, run.arm));
  return byArm;
}

// ─── tasks ───────────────────────────────────────────────────────────────────

function groupByCell(drafts) {
  const cells = new Map();
  for (const d of drafts) {
    const key = `${d.fixture}|${d.language}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(d);
  }
  for (const list of cells.values()) list.sort((a, b) => a.id.localeCompare(b.id));
  return cells;
}

/** Draft pairs for one pair type in one cell, seeded; A/A pairs disjoint drafts of one arm. */
function pairDrafts(pairType, cellKey, xs, ys, { seed, maxPairs }) {
  const [x, y] = pairType.split(':');
  if (x === y) {
    const order = shuffled(xs, seededRandom(`${seed}|${pairType}|${cellKey}`));
    const pairs = [];
    for (let i = 0; i + 1 < order.length && pairs.length < maxPairs; i += 2) pairs.push([order[i], order[i + 1]]);
    return pairs;
  }
  const a = shuffled(xs, seededRandom(`${seed}|${pairType}|${cellKey}|${x}`));
  const b = shuffled(ys, seededRandom(`${seed}|${pairType}|${cellKey}|${y}`));
  const pairs = [];
  for (let i = 0; i < Math.min(a.length, b.length, maxPairs); i++) pairs.push([a[i], b[i]]);
  return pairs;
}

function relevantTerms(glossary, lang, sourceText) {
  if (!glossary) return [];
  const lower = sourceText.toLowerCase();
  return glossary.terms
    .filter((t) => typeof t[lang] === 'string' && t[lang] && lower.includes(String(t.en).toLowerCase()))
    .slice(0, 40)
    .map((t) => `- "${t.en}" → "${t[lang]}"${t.context ? ` (${t.context})` : ''}`);
}

async function buildTasks(byArm, opts, engine) {
  const parser = new engine.MystParser();
  const parseCache = new Map();
  const sections = async (file) => {
    if (!parseCache.has(file)) parseCache.set(file, (await parser.parseSections(fs.readFileSync(file, 'utf8'), file)).sections);
    return parseCache.get(file);
  };
  const glossaries = new Map();
  const glossaryFor = (lang) => {
    if (!glossaries.has(lang)) {
      const file = path.join(engine.repoRoot, 'glossary', `${lang}.json`);
      glossaries.set(lang, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);
    }
    return glossaries.get(lang);
  };
  const tasks = [];
  const skipped = [];
  const judgedDrafts = new Map();
  const pairTypes = [...opts.pairs, ...opts.aa.map((a) => `${a}:${a}`)];
  for (const pairType of pairTypes) {
    const [x, y] = pairType.split(':');
    const cx = groupByCell(byArm[x] ?? []);
    const cy = groupByCell(byArm[y] ?? []);
    for (const [cellKey, xs] of cx) {
      const ys = x === y ? xs : cy.get(cellKey);
      if (!ys?.length) continue;
      const [fixture, language] = cellKey.split('|');
      let pairIndex = 0;
      for (const [da, db] of pairDrafts(pairType, cellKey, xs, ys, { seed: opts.seed, maxPairs: opts.maxPairs })) {
        const [src, sa, sb] = await Promise.all([sections(da.source), sections(da.file), sections(db.file)]);
        if (sa.length !== src.length || sb.length !== src.length) {
          skipped.push({ pairType, fixture, language, drafts: [da.id, db.id], sections: { source: src.length, [da.arm === db.arm ? 'first' : da.arm]: sa.length, [da.arm === db.arm ? 'second' : db.arm]: sb.length }, deviates: [sa.length !== src.length ? da.arm : null, sb.length !== src.length ? db.arm : null].filter(Boolean) });
          continue;
        }
        const indices = shuffled(
          src.map((_, i) => i),
          seededRandom(`${opts.seed}|${pairType}|${cellKey}|${da.id}|${db.id}`)
        )
          .slice(0, opts.sectionsPerPair)
          .sort((p, q) => p - q);
        for (const d of [da, db]) judgedDrafts.set(d.id, { id: d.id, arm: d.arm, model: d.model, file: d.file, sha256: sha256File(d.file) });
        for (const s of indices) {
          const terms = relevantTerms(glossaryFor(language), language, src[s].content);
          for (const order of ['xy', 'yx']) {
            const [first, second] = order === 'xy' ? [sa[s].content, sb[s].content] : [sb[s].content, sa[s].content];
            const key = stableHash({ v: PROMPT_VERSION, judge: opts.judgeModel, pairType, a: da.id, b: db.id, s, order });
            tasks.push({ key, pairType, fixture, language, pairIndex, drafts: [da.id, db.id], arms: [da.arm, db.arm], section: s, order, source: src[s].content, first, second, terms, lengths: [sa[s].content.length, sb[s].content.length] });
          }
        }
        pairIndex++;
      }
    }
  }
  return { tasks, skipped, judgedDrafts: [...judgedDrafts.values()] };
}

// ─── the call ────────────────────────────────────────────────────────────────

function systemPrompt(language, engine) {
  const name = engine.getLanguageConfig(language).name;
  const rules = engine.formatAdditionalRules(language);
  return [
    `You review translations of QuantEcon lecture notes (economics and Python) from English into ${name}.`,
    `You will see one section of an English lecture and two translations of it, 1 and 2. Decide which one a careful native-speaker editor of this edition would rather publish: faithful and complete meaning, correct and natural ${name}, consistent terminology, and the edition's conventions below. MyST and Markdown structure, code, math and links must be preserved; damage to them is a serious fault. Ignore differences that would not matter to a reader. Answer "tie" when neither is clearly better.`,
    rules ? `The edition's conventions for ${name}:\n${rules}` : '',
    'Reply with a JSON object only: {"winner": "1" | "2" | "tie", "reason": "<one sentence naming the decisive difference>"}.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function userPrompt(task) {
  return [
    `<source lang="en">\n${task.source}\n</source>`,
    task.terms.length ? `<glossary>\n${task.terms.join('\n')}\n</glossary>` : '',
    `<translation_1>\n${task.first}\n</translation_1>`,
    `<translation_2>\n${task.second}\n</translation_2>`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * The verdict in a reply: the whole reply first (structured output), then each balanced {...}, with
 * braces inside JSON strings ignored. A reason that quotes MyST, math or code ({math}, $\beta^{t}$)
 * holds braces, and those are the decisive verdicts: they must not become parse errors.
 */
function parseVerdict(text) {
  const accept = (v) => (v && typeof v === 'object' && ['1', '2', 'tie'].includes(String(v.winner)) ? { winner: String(v.winner), reason: String(v.reason ?? '') } : null);
  const tryParse = (s) => {
    try {
      return accept(JSON.parse(s));
    } catch {
      return null;
    }
  };
  const whole = tryParse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  if (whole) return whole;
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) {
        const v = tryParse(text.slice(start, i + 1));
        if (v) return v;
        break;
      }
    }
  }
  return null;
}

async function judgeOne(task, ctx) {
  const { models, client, sdk } = ctx;
  if (task.first === task.second) {
    // identical sections are a tie without a call (A/A pairs of identical drafts cost nothing)
    return { key: task.key, pairType: task.pairType, fixture: task.fixture, language: task.language, pairIndex: task.pairIndex, drafts: task.drafts, arms: task.arms, section: task.section, order: task.order, lengths: task.lengths, judgeModel: ctx.judgeModel, at: new Date().toISOString(), shown: 'tie', winner: 'tie', identical: true, costUSD: 0 };
  }
  const maxTokens = models.maxTokensFor(ctx.judgeModel, 'analysis');
  const params = models.modelRequestParams(ctx.judgeModel, 'analysis');
  const request = {
    model: ctx.judgeModel,
    max_tokens: maxTokens,
    ...params,
    system: [{ type: 'text', text: systemPrompt(task.language, ctx.engine), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userPrompt(task) }],
  };
  if (ctx.structured) request.output_config = { ...(params.output_config ?? {}), format: VERDICT_SCHEMA };
  const base = { key: task.key, pairType: task.pairType, fixture: task.fixture, language: task.language, pairIndex: task.pairIndex, drafts: task.drafts, arms: task.arms, section: task.section, order: task.order, lengths: task.lengths, judgeModel: ctx.judgeModel, at: new Date().toISOString() };
  let message;
  try {
    message = await client.messages.create(request);
  } catch (error) {
    if (error instanceof sdk.APIError) return { ...base, winner: 'ERROR', error: 'api', status: error.status ?? null, message: String(error.message).slice(0, 300) };
    return { ...base, winner: 'ERROR', error: 'exception', message: String(error instanceof Error ? error.message : error).slice(0, 300) };
  }
  const u = message.usage ?? {};
  const cost = ctx.pricing.costUSD(ctx.judgeModel, {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadInputTokens: u.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: u.cache_creation_input_tokens ?? 0,
  });
  const usage = { costUSD: cost, inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0, servedModel: message.model };
  try {
    models.assertCompleteResponse(message, 'judge', maxTokens);
  } catch (error) {
    const kind = error instanceof models.ModelRefusalError ? 'refusal' : error instanceof models.TruncatedResponseError ? 'truncated' : 'unexpected-stop';
    return { ...base, ...usage, winner: 'ERROR', error: kind, category: error.category ?? null, message: String(error.message).slice(0, 300) };
  }
  const text = models.extractResponseText(message);
  const verdict = parseVerdict(text);
  if (!verdict) return { ...base, ...usage, winner: 'ERROR', error: 'parse', message: text.slice(0, 300) };
  // shown '1' is the first-displayed draft; map back to the arm-ordered pair (drafts[0] = x)
  const shownFirst = task.order === 'xy' ? 0 : 1;
  const winnerIndex = verdict.winner === 'tie' ? null : verdict.winner === '1' ? shownFirst : 1 - shownFirst;
  return { ...base, ...usage, shown: verdict.winner, winner: winnerIndex === null ? 'tie' : winnerIndex === 0 ? 'x' : 'y', reason: verdict.reason.slice(0, 500) };
}

// ─── summary ─────────────────────────────────────────────────────────────────

function summarise(rows, { skipped, judgeModel, stats, pairs, aa, armModels }) {
  const latest = new Map();
  for (const r of rows) {
    if (r.winner === 'ERROR' && latest.has(r.key) && latest.get(r.key).winner !== 'ERROR') continue;
    latest.set(r.key, r);
  }
  const done = [...latest.values()];
  const errors = {};
  for (const r of done.filter((x) => x.winner === 'ERROR')) errors[r.error] = (errors[r.error] ?? 0) + 1;
  // costUSD null = a billed call on a judge model with no list price: the total is then unknown,
  // never $0 (#230). Identical sections cost 0; an API-error row carries no costUSD at all.
  const unpricedCalls = rows.filter((r) => r.costUSD === null).length;
  const cost = unpricedCalls ? null : rows.reduce((s, r) => s + (typeof r.costUSD === 'number' ? r.costUSD : 0), 0);
  const groups = new Map();
  for (const r of done) {
    const g = `${r.pairType}|${r.language}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
  }
  const out = [];
  const aaDeviation = {};
  const computeGroup = (pairType, language, list) => {
    // section items: both orders of one (pair, section)
    const items = new Map();
    for (const r of list) {
      const k = `${r.drafts.join('|')}|${r.section}`;
      if (!items.has(k)) items.set(k, { drafts: r.drafts, section: r.section, lengths: r.lengths });
      items.get(k)[r.order] = r;
    }
    let sectionWins = 0;
    let sectionLosses = 0;
    let sectionTies = 0;
    let orderInconsistent = 0;
    let incomplete = 0;
    let firstShownWins = 0;
    let shownDecided = 0;
    const perPair = new Map();
    const decided = [];
    for (const item of items.values()) {
      for (const o of ['xy', 'yx']) {
        const r = item[o];
        if (r && r.winner !== 'ERROR' && r.shown !== 'tie') {
          shownDecided++;
          if (r.shown === '1') firstShownWins++;
        }
      }
      if (!item.xy || !item.yx || item.xy.winner === 'ERROR' || item.yx.winner === 'ERROR') {
        incomplete++;
        continue;
      }
      // a win counts only when both display orders name the same draft
      let outcome;
      if (item.xy.winner === item.yx.winner) outcome = item.xy.winner;
      else {
        outcome = 'tie';
        orderInconsistent++;
      }
      if (outcome === 'x') sectionWins++;
      else if (outcome === 'y') sectionLosses++;
      else sectionTies++;
      const pk = item.drafts.join('|');
      perPair.set(pk, (perPair.get(pk) ?? 0) + (outcome === 'x' ? 1 : outcome === 'y' ? -1 : 0));
      if (outcome !== 'tie') {
        const [lx, ly] = item.lengths;
        decided.push({ d: (lx - ly) / Math.max(1, (lx + ly) / 2), win: outcome === 'x' });
      }
    }
    let pairWins = 0;
    let pairLosses = 0;
    let pairTies = 0;
    for (const v of perPair.values()) {
      if (v > 0) pairWins++;
      else if (v < 0) pairLosses++;
      else pairTies++;
    }
    decided.sort((a, b) => a.d - b.d);
    const terciles = [0, 1, 2].map((t) => {
      const part = decided.slice(Math.floor((t * decided.length) / 3), Math.floor(((t + 1) * decided.length) / 3));
      return part.length ? { n: part.length, meanLengthDiff: part.reduce((s, x) => s + x.d, 0) / part.length, xWinShare: part.filter((x) => x.win).length / part.length } : { n: 0 };
    });
    const decidedPairs = pairWins + pairLosses;
    return {
      pair: pairType,
      language,
      pairWins,
      pairLosses,
      pairTies,
      signP: stats.signTest(pairWins, pairLosses),
      xPairShare: decidedPairs ? pairWins / decidedPairs : null,
      sectionWins,
      sectionLosses,
      sectionTies,
      orderInconsistent,
      incomplete,
      firstShownWinShare: shownDecided ? firstShownWins / shownDecided : null,
      lengthTerciles: terciles,
    };
  };
  for (const a of aa) {
    for (const [g, list] of groups) {
      const [pairType, language] = g.split('|');
      if (pairType !== `${a}:${a}`) continue;
      const row = computeGroup(pairType, language, list);
      row.aa = true;
      out.push(row);
      // an A/A with no decided pair (every pair a tie) shows no judge bias: deviation 0
      const deviation = row.xPairShare === null ? 0 : Math.abs(row.xPairShare - 0.5);
      aaDeviation[language] = Math.max(aaDeviation[language] ?? 0, deviation);
    }
  }
  for (const p of pairs) {
    for (const [g, list] of groups) {
      const [pairType, language] = g.split('|');
      if (pairType !== p) continue;
      const row = computeGroup(pairType, language, list);
      row.aaDeviation = aaDeviation[language] ?? null;
      const [x, y] = p.split(':');
      row.sameFamily = family(judgeModel) !== null && [armModels[x], armModels[y]].some((m) => family(m) === family(judgeModel));
      // the trigger: x loses at the pair level (two-sided sign test p < 0.05), beyond the A/A range
      const losing = row.pairLosses > row.pairWins;
      const beyondAa = row.aaDeviation === null ? null : Math.abs((row.xPairShare ?? 0.5) - 0.5) > row.aaDeviation;
      row.trigger = x === 's55' && y === 's5' && losing && row.signP < 0.05 && beyondAa !== false;
      row.uncalibrated = row.aaDeviation === null;
      out.push(row);
    }
  }
  for (const row of out) {
    row.skippedPairs = skipped.filter((s) => s.pairType === row.pair && s.language === row.language).length;
  }
  const skippedByArm = {};
  for (const s of skipped) for (const arm of s.deviates) skippedByArm[arm] = (skippedByArm[arm] ?? 0) + 1;
  const triggers = out.filter((r) => r.trigger);
  return {
    schema: 'claude-5-5-upgrade/judge-summary/1',
    judgeModel,
    promptVersion: PROMPT_VERSION,
    headline: triggers.length
      ? `TRIGGER: s55 loses to s5 beyond the A/A range in ${triggers.map((t) => t.language).join(', ')} — a native-review check before that edition's default moves`
      : `no trigger (${done.length - Object.values(errors).reduce((s, n) => s + n, 0)} verdicts, ${Object.values(errors).reduce((s, n) => s + n, 0)} errors, ${fmtUSD(cost)})`,
    rows: out,
    skippedPairs: skipped.length,
    skippedByArm,
    errors,
    costUSD: cost,
    unpricedCalls,
    verdicts: done.length,
  };
}

function printSummary(summary) {
  console.log(`judge ${summary.judgeModel}: ${summary.headline}`);
  console.log(
    mdTable(
      ['Pair', 'Lang', 'Pairs W:L:T', 'Sign p', 'A/A dev', 'Sections W:L:T', 'Order-incons.', 'First-shown wins', 'Skipped', 'Flags'],
      summary.rows.map((r) => [
        r.pair,
        r.language,
        `${r.pairWins}:${r.pairLosses}:${r.pairTies}`,
        fmtP(r.signP),
        r.aa ? '(A/A)' : r.aaDeviation === null ? '–' : r.aaDeviation.toFixed(2),
        `${r.sectionWins}:${r.sectionLosses}:${r.sectionTies}`,
        r.orderInconsistent,
        r.firstShownWinShare === null ? '–' : `${(100 * r.firstShownWinShare).toFixed(0)}%`,
        r.skippedPairs,
        [r.trigger ? 'TRIGGER' : '', r.sameFamily ? 'judge in an arm\'s model line' : '', r.uncalibrated && !r.aa ? 'no A/A' : ''].filter(Boolean).join(', '),
      ])
    )
  );
  if (Object.keys(summary.errors).length) console.log(`errors (retried on a rerun): ${JSON.stringify(summary.errors)}`);
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const { flags } = parseArgs(process.argv.slice(2), SPEC);
  if (flags.help) {
    console.log(helpText(import.meta.url));
    return 0;
  }
  const judgeModel = flags['judge-model'] ?? 'claude-opus-4-8';
  const pairs = list(flags.pairs) ?? ['s55:s5', 'o55:s5'];
  const aa = list(flags.aa) ?? ['s5', 's55'];
  for (const p of pairs) if (!/^[^:]+:[^:]+$/.test(p) || p.split(':')[0] === p.split(':')[1]) throw new UsageError(`--pairs takes candidate:baseline pairs of different arms, got ${p}`);
  const arms = [...new Set([...pairs.flatMap((p) => p.split(':')), ...aa])];
  for (const a of arms) if (!ARMS[a]) throw new UsageError(`unknown arm ${a} (known: ${Object.keys(ARMS).join(', ')})`);
  const armDirs = flags.arms ? Object.fromEntries(list(flags.arms).map((kv) => kv.split('='))) : null;
  // EVAL_ROOT/judge/<model>/ holds the experiment's own judgements (summarize.mjs reads them)
  if (armDirs && !flags.out) throw new UsageError("--out is required with --arms: EVAL_ROOT/judge/<model>/ holds the experiment's own judgements");
  const evalRoot = armDirs ? null : resolveEvalRoot(flags['eval-root']);
  const outDir = path.resolve(flags.out ?? path.join(evalRoot, 'judge', judgeModel));
  const opts = {
    judgeModel,
    pairs,
    aa,
    seed: flags.seed ?? 'claude-5-5-upgrade',
    sectionsPerPair: flags['sections-per-pair'] ?? 4,
    maxPairs: flags['max-pairs-per-cell'] ?? 6,
  };

  const stats = await importStats();
  const models = await importDist('models.js');
  const pricing = await importDist('model-pricing.js');
  const { MystParser } = await importDist('parser.js');
  const { getLanguageConfig, formatAdditionalRules } = await importDist('language-config.js');
  const engine = { MystParser, getLanguageConfig, formatAdditionalRules, repoRoot: REPO_ROOT };

  const byArm = collectDrafts({ evalRoot, stages: (list(flags.stages) ?? ['1', '2']).map(Number), armDirs, arms });
  // a draft id keys its tasks and verdicts: two files under one id would merge their judgements
  const idFiles = new Map();
  for (const d of Object.values(byArm).flat()) {
    const prev = idFiles.get(d.id);
    if (prev && prev !== d.file) throw new UsageError(`drafts ${prev} and ${d.file} share the id ${d.id}`);
    idFiles.set(d.id, d.file);
  }
  // the judge must not be a judged arm's model: read the models the drafts were made with
  const armModels = {};
  for (const a of arms) {
    const seen = new Set(byArm[a].map((d) => d.model).filter(Boolean));
    armModels[a] = seen.size ? [...seen][0] : ARMS[a].model;
    for (const m of [...seen, ARMS[a].model]) {
      if (m === judgeModel) throw new UsageError(`the judge model ${judgeModel} is arm ${a}'s model: a judge never grades its own drafts`);
    }
  }
  const { tasks, skipped, judgedDrafts } = await buildTasks(byArm, opts, engine);
  const logFile = path.join(outDir, 'judgements.jsonl');
  const { rows: existing, bad } = readJsonl(logFile);
  if (bad) console.error(`warning: ${bad} unparseable line(s) in ${logFile}`);
  const done = new Set(existing.filter((r) => r.winner !== 'ERROR').map((r) => r.key));
  const todo = tasks.filter((t) => !done.has(t.key));
  console.log(
    `${Object.entries(byArm)
      .map(([a, d]) => `${a}: ${d.length} drafts`)
      .join(', ')}; ${tasks.length} comparisons (${skipped.length} draft pairs skipped for section-count drift), ${todo.length} to run`
  );

  if (flags.plan || (!flags.yes && !flags['summary-only'])) {
    const price = pricing.priceFor(judgeModel);
    const tokens = todo.reduce((s, t) => s + (t.source.length + t.first.length + t.second.length + 1800) / 3.2, 0);
    const est = price ? (tokens * price.in + todo.length * 150 * price.out) / 1e6 : null;
    console.log(`Estimated cost of the ${todo.length} remaining calls on ${judgeModel}: ~${fmtUSD(est)} (input at the uncached price; 150 output tokens a call).`);
    if (!flags.plan) console.log('Nothing called: add --yes to spend.');
    return 0;
  }

  fs.mkdirSync(outDir, { recursive: true });
  writeJson(path.join(outDir, 'judged-drafts.json'), { schema: 'claude-5-5-upgrade/judged-drafts/1', judgeModel, seed: opts.seed, drafts: judgedDrafts, skipped });
  if (!flags['summary-only'] && todo.length) {
    if (!process.env.ANTHROPIC_API_KEY) throw new UsageError('ANTHROPIC_API_KEY must be set (or use --plan / --summary-only)');
    if (!pricing.priceFor(judgeModel)) console.error(`⚠️  No list price for judge model '${judgeModel}' in src/model-pricing.ts — its cost will be reported as unpriced`);
    const sdk = await importSdk();
    const Anthropic = sdk.default;
    const client = new Anthropic({ maxRetries: 4 });
    const ctx = { models, pricing, client, sdk: { APIError: sdk.APIError }, engine, judgeModel, structured: !flags['no-structured'] };
    let cursor = 0;
    let finished = 0;
    const order = shuffled(todo, seededRandom(`${opts.seed}|order`));
    const worker = async () => {
      while (cursor < order.length) {
        const task = order[cursor++];
        const row = await judgeOne(task, ctx);
        appendJsonl(logFile, row);
        finished++;
        if (finished % 50 === 0) console.log(`  ${finished}/${order.length} judged`);
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, flags.concurrency ?? 4) }, worker));
  }
  // The summary covers the current task set only, as judged-drafts.json does: verdicts on drafts
  // no longer selected, or under an older PROMPT_VERSION (its keys differ), stay in the log.
  const current = new Set(tasks.map((t) => t.key));
  const logRows = readJsonl(logFile).rows;
  const counted = logRows.filter((r) => current.has(r.key));
  const summary = summarise(counted, { skipped, judgeModel, stats, pairs, aa, armModels });
  summary.staleRows = logRows.length - counted.length;
  // everything the log records as spent, stale rows included (null when a call was unpriced)
  summary.logCostUSD = logRows.some((r) => r.costUSD === null) ? null : logRows.reduce((s, r) => s + (typeof r.costUSD === 'number' ? r.costUSD : 0), 0);
  summary.judgedDrafts = judgedDrafts.length;
  summary.draftsSha256 = sha256(JSON.stringify(judgedDrafts.map((d) => [d.id, d.sha256])));
  writeJson(path.join(outDir, 'judge-summary.json'), summary);
  printSummary(summary);
  return 0;
}

runMain(main);

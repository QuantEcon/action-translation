#!/usr/bin/env node
// summarize.mjs — read every run under EVAL_ROOT, evaluate the pre-registered decision rules
// (rules.mjs), and write RESULTS.md, results.json and records/ into the experiment directory.
//
// Usage: node experiments/claude-5-5-upgrade/summarize.mjs [--eval-root DIR] [--out DIR]
//            [--no-records] [--quiet]
//        node experiments/claude-5-5-upgrade/summarize.mjs --self-test
//
//   --eval-root  where run-stages.mjs drew (default $EVAL_ROOT, else
//                ~/.cache/action-translation/claude-5-5-eval)
//   --out        where RESULTS.md, results.json and records/ go (default: this directory)
//   --no-records skip copying the machine output into <out>/records/
//   --self-test  build synthetic evaluation roots in a temporary directory and check the rule
//                verdicts and the table orientation end to end (CI runs this)
//
// Counts are rate-check's (summary.json); tokens, cost and latency are read from each draw's
// init run report. records/ keeps what RESULTS.md quotes, so the raw root can be deleted later:
// summaries.json (every summary.json), draws.jsonl (one compact line per draw), engine.json,
// manifest.jsonl, and the judge / ml-lints / engine-aa summaries when present.
// Exit: 0 written, 2 usage or setup error (never 1: a crash must not read as a failed cell).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  EXPERIMENT_DIR,
  REPO_ROOT,
  UsageError,
  fmtP,
  fmtPct,
  fmtUSD,
  gitCommitOf,
  helpText,
  importDist,
  importStats,
  loadCorpus,
  mdTable,
  parseArgs,
  readJson,
  resolveEvalRoot,
  runMain,
  walkFiles,
  writeJson,
} from './lib.mjs';
import { ARMS, RULES, buildStages } from './cells.mjs';
import { buildCells, loadEvalRoot } from './results.mjs';
import { R1_BASELINE_VERSION, evaluate, indexUnits } from './rules.mjs';

const SPEC = { 'eval-root': 'string', out: 'string', 'no-records': 'boolean', quiet: 'boolean', 'self-test': 'boolean', help: 'boolean' };

/** The optional instruments' outputs, if they have been run. */
function readOptional(evalRoot) {
  const engineAaFile = path.join(evalRoot, 'engine-aa', 'engine-aa.json');
  const engineAa = fs.existsSync(engineAaFile) ? readJson(engineAaFile).value ?? null : null;
  const judgeFiles = walkFiles(path.join(evalRoot, 'judge'), (f) => path.basename(f) === 'judge-summary.json');
  const judge = judgeFiles.map((f) => ({ file: f, ...(readJson(f).value ?? {}) }));
  const mlFile = path.join(evalRoot, 'ml-lints', 'ml-lints-summary.json');
  const mlLints = fs.existsSync(mlFile) ? readJson(mlFile).value ?? null : null;
  return { engineAa, engineAaFile, judge: judge.length ? judge : null, judgeFiles, mlLints, mlFile };
}

export async function summarize({ evalRoot, unitIndex, stats, priceFor, baselineRefSha = null }) {
  const loaded = loadEvalRoot(evalRoot);
  const cells = buildCells(loaded);
  const optional = readOptional(evalRoot);
  const result = evaluate(cells, {
    stats,
    priceFor,
    unitIndex,
    engineId: loaded.engine?.id ?? null,
    engineDistSha256: loaded.engine?.distSha256 ?? null,
    baselineRefSha,
    engineAa: optional.engineAa,
    judge: optional.judge,
    mlLints: optional.mlLints,
  });
  const warnings = [...loaded.runs, ...loaded.history].flatMap((r) => r.warnings);
  if (loaded.manifestBad) warnings.push(`manifest.jsonl: ${loaded.manifestBad} unparseable line(s)`);
  return { loaded, cells, optional, result, warnings };
}

// ─── RESULTS.md ──────────────────────────────────────────────────────────────

function armCell(a) {
  if (!a) return '–';
  if (a.legacy) return `${a.draws - a.ok}/${a.draws} no output (legacy)`;
  const ci = a.wilson ? ` [${fmtPct(a.wilson.lo)}–${fmtPct(a.wilson.hi)}]` : '';
  const ref = a.refusals ? `, ${a.refusals} refused` : '';
  // every infra attempt, those --redraw-infra replaced included (they stay in the share)
  const infraAttempts = (a.infra ?? 0) + (a.redrawnInfra ?? 0);
  const infra = infraAttempts ? `, ${infraAttempts} infra${a.redrawnInfra ? ` (${a.redrawnInfra} redrawn)` : ''}` : '';
  return `${a.structural}/${a.valid}${ci}${ref}${infra}`;
}

function renderResults({ evalRoot, loaded, result, warnings, generatedAt }) {
  const r = result.rules;
  const lines = [];
  lines.push('# RESULTS — Claude 5.5 upgrade evaluation');
  lines.push('');
  lines.push(`Generated ${generatedAt} by \`summarize.mjs\` from \`${evalRoot}\`. The protocol is README.md; nothing here edits it.`);
  if (loaded.engine) {
    lines.push('');
    lines.push(
      `Engine: \`${loaded.engine.id}\` — git ${loaded.engine.git?.sha?.slice(0, 12) ?? '?'}${loaded.engine.git?.clean === false ? ' (dirty)' : ''}, package ${loaded.engine.packageVersion ?? '?'}, @anthropic-ai/sdk ${loaded.engine.sdkVersion ?? '?'}, node ${loaded.engine.node ?? '?'}.`
    );
  }
  lines.push('');
  lines.push(`## Decision: ${result.decision.verdict}`);
  lines.push('');
  lines.push(result.decision.text);
  lines.push('');
  lines.push(mdTable(['Rule', 'Verdict', 'Reading'], Object.values(r).map((x) => [x.rule, x.verdict, x.reason])));
  lines.push('');
  lines.push('Rates are structural failures over valid (non-infra) draws, with Wilson 95% intervals; "refused" counts model refusals (R3), which R2 does not count. Per-cell Fisher tests are advisory (#227: 12 v 12 cannot gate).');

  for (const stage of [1, 2, 3, 4, 0]) {
    const rows = result.cells.filter((c) => c.stage === stage);
    if (!rows.length) continue;
    lines.push('');
    lines.push(`## Stage ${stage}`);
    lines.push('');
    const arms = [...new Set(rows.flatMap((c) => Object.keys(c.arms)))];
    const header = ['Cell', 'Role', ...arms.map((a) => `${a} structural`), 's55 v s5 p (one-sided)', ...arms.map((a) => `${a} out tok`), ...arms.map((a) => `${a} $`)];
    lines.push(
      mdTable(
        header,
        rows.map((c) => [
          `${c.fixture} × ${c.language}`,
          c.role ?? 'follow-up',
          ...arms.map((a) => armCell(c.arms[a])),
          c.contrasts.s55 ? fmtP(c.contrasts.s55.structural.greater) : '–',
          ...arms.map((a) => (c.arms[a]?.meanOutputTokens ? Math.round(c.arms[a].meanOutputTokens) : '–')),
          ...arms.map((a) => (c.arms[a] ? fmtUSD(c.arms[a].costUSD) : '–')),
        ])
      )
    );
  }

  lines.push('');
  lines.push('## R2 guard (same-day controls)');
  lines.push('');
  const guard = r['R2-guard'].rows ?? [];
  lines.push(
    guard.length
      ? mdTable(
          ['Cell', 's55', 's5', 'advisory p', 'Triggered', 'Control totals', 'Verdict'],
          guard.map((g) => [g.cell, g.s55, g.s5, fmtP(g.advisoryP), g.triggered ? 'yes' : 'no', g.control ? `s55 ${g.control.s55} v s5 ${g.control.s5}, p ${fmtP(g.control.pGreater)}` : g.note ?? '', g.verdict])
        )
      : 'No gating cell yet.'
  );

  lines.push('');
  lines.push('## R3 (refusals)');
  lines.push('');
  lines.push(r.R3.reason);
  if (r.R3.triggered?.length) {
    lines.push('');
    lines.push(mdTable(['Lecture × language', 'Stage', 'Editions', 's55 refused', 'Redraw', 'Verdict'], r.R3.triggered.map((t) => [t.cell, t.stage, t.production.join(', '), t.s55, t.redraw ? `s55 ${t.redraw.s55}, s5 ${t.redraw.s5}` : t.note, t.verdict])));
  }
  if (r.R3.nonProduction?.length) {
    lines.push('');
    lines.push('Refusals on lectures in no production edition (reported, not blocking):');
    lines.push('');
    lines.push(mdTable(['Lecture × language', 'Stage', 's55 refused', 'Categories'], r.R3.nonProduction.map((t) => [t.cell, t.stage, t.refusals, JSON.stringify(t.categories)])));
  }
  if (r.R3.categories) {
    lines.push('');
    lines.push(`Refusal categories (Stages 2–4): ${Object.entries(r.R3.categories).map(([arm, cats]) => `${arm} ${JSON.stringify(cats)}`).join('; ')}.`);
  }

  for (const key of ['R4', 'R5']) {
    const rule = r[key];
    if (!rule.rows?.length) continue;
    lines.push('');
    lines.push(`## ${key} cells`);
    lines.push('');
    lines.push(
      key === 'R4'
        ? mdTable(['Cell', 's55 out tok', 's5 out tok', 'ratio'], rule.rows.map((x) => [x.cell, x.cand, x.base, x.ratio.toFixed(3)]))
        : mdTable(['Cell', 's55 $/delivered', 's5 $/delivered', 'ratio', 'output-token ratio'], rule.rows.map((x) => [x.cell, fmtUSD(x.cand), fmtUSD(x.base), x.ratio.toFixed(3), x.outputRatio.toFixed(3)]))
    );
    if (key === 'R4' && rule.truncations?.length) {
      lines.push('');
      lines.push(`Truncations (descriptive): ${rule.truncations.map((t) => `${t.cell} ${t.arm} ${t.truncated}`).join('; ')}.`);
    }
  }

  lines.push('');
  lines.push('## Opus 5.5 (informational: #334, no default changes here)');
  lines.push('');
  lines.push(mdTable(['Measure', 'Verdict', 'Reading'], Object.values(result.informational.o55 ?? {}).map((x) => [x.rule, x.verdict, x.reason])));
  lines.push('');
  lines.push('o55 output tokens are on a different tokenizer; read its R5 (dollars), not its R4.');

  if (result.stage0.rows.length) {
    lines.push('');
    lines.push('## Stage 0b (advisory A/A)');
    lines.push('');
    lines.push(result.stage0.note);
    lines.push('');
    lines.push(mdTable(['Cell', 'v0.29.5', 'current', 'two-sided p', 'SDK (v0.29.5 / current)'], result.stage0.rows.map((x) => [x.cell, x.v0295, x.current, fmtP(x.pTwoSided), `${x.sdk.v0295 ?? '?'} / ${x.sdk.current ?? '?'}`])));
  }

  lines.push('');
  lines.push('## Advisory instruments');
  lines.push('');
  const judge = result.advisory.judge;
  if (judge) {
    for (const j of judge) {
      lines.push(`Judge \`${j.judgeModel}\` (${j.file ? path.relative(evalRoot, j.file) : ''}): ${j.headline ?? ''}`);
      if (j.rows?.length) {
        lines.push('');
        lines.push(
          mdTable(
            ['Pair', 'Language', 'Pairs W:L:T', 'Sign p', 'A/A deviation', 'Sections W:L:T', 'Order-inconsistent', 'Skipped pairs', 'Flags'],
            j.rows.map((x) => [
              x.pair,
              x.language,
              `${x.pairWins}:${x.pairLosses}:${x.pairTies}`,
              fmtP(x.signP),
              x.aa ? '(A/A)' : typeof x.aaDeviation === 'number' ? x.aaDeviation.toFixed(2) : '–',
              `${x.sectionWins}:${x.sectionLosses}:${x.sectionTies}`,
              x.orderInconsistent,
              x.skippedPairs ?? 0,
              [x.trigger ? 'TRIGGER' : '', x.sameFamily ? 'judge in an arm\'s model line' : '', x.uncalibrated && !x.aa ? 'no A/A' : ''].filter(Boolean).join(', '),
            ])
          )
        );
      }
      lines.push('');
    }
  } else lines.push('Judge: not run.');
  const ml = result.advisory.mlLints;
  if (ml) {
    lines.push('');
    lines.push(`ml lints: ${ml.headline ?? ''}`);
    if (ml.comparisons?.length) {
      lines.push('');
      lines.push(mdTable(['Contrast', 'Lectures', 'Mean Malayalam share (cand v s5)', 'Stratified Mann–Whitney p', 'Trigger'], ml.comparisons.map((x) => [x.contrast, x.strata, `${x.candMean?.toFixed(3) ?? '–'} v ${x.baseMean?.toFixed(3) ?? '–'}`, fmtP(x.p), x.trigger ? 'YES' : ''])));
    }
  } else lines.push('ml lints: not run.');
  lines.push('');
  lines.push('Neither instrument can clear Sonnet 5.5 for the ml edition (README, "ml").');

  lines.push('');
  lines.push('## Data notes');
  lines.push('');
  lines.push(`${loaded.runs.length} runs read (latest attempt per unit × arm), ${loaded.history.length} earlier attempts kept for the record.`);
  if (loaded.history.length) {
    lines.push('');
    lines.push(mdTable(['Earlier attempt', 'Cells'], loaded.history.map((h) => [`stage ${h.stage} ${h.unitId} ${h.arm} r${h.attempt}`, h.cells.map((c) => `${c.fixture}×${c.language}: ${c.structural ?? c.legacyFailures}/${c.valid ?? c.draws} infra ${c.infra ?? '–'}`).join('; ')])));
  }
  if (warnings.length) {
    lines.push('');
    for (const w of warnings) lines.push(`- ${w}`);
  }
  if (result.followups.length) {
    lines.push('');
    lines.push(`Follow-ups owed (\`run-stages.mjs --followups\`): ${result.followups.map((f) => `stage ${f.stage} ${f.unitId}`).join(', ')}.`);
  }
  lines.push('');
  return lines.join('\n');
}

/** Copy the machine output RESULTS.md quotes into <out>/records/. */
function writeRecords(outDir, { evalRoot, loaded, optional }) {
  const dir = path.join(outDir, 'records');
  fs.mkdirSync(dir, { recursive: true });
  const summaries = {};
  for (const run of [...loaded.runs, ...loaded.history]) {
    const rel = path.relative(evalRoot, run.dir);
    summaries[rel] = { summary: run.summary, meta: run.meta, classification: run.classification, launch: run.launch, lastLaunch: run.lastLaunch, engineId: run.engineId, exitCode: run.exitCode };
  }
  writeJson(path.join(dir, 'summaries.json'), summaries);
  const draws = [...loaded.runs, ...loaded.history].flatMap((run) =>
    run.draws.map((d) => {
      const { file, ...rest } = d;
      return { ...rest, report: path.relative(evalRoot, file) };
    })
  );
  fs.writeFileSync(path.join(dir, 'draws.jsonl'), draws.map((d) => JSON.stringify(d)).join('\n') + (draws.length ? '\n' : ''));
  if (loaded.engine) writeJson(path.join(dir, 'engine.json'), loaded.engine);
  const manifest = path.join(evalRoot, 'manifest.jsonl');
  if (fs.existsSync(manifest)) fs.copyFileSync(manifest, path.join(dir, 'manifest.jsonl'));
  if (optional.engineAa) writeJson(path.join(dir, 'engine-aa.json'), optional.engineAa);
  for (const file of optional.judgeFiles) {
    const name = path.basename(path.dirname(file));
    fs.copyFileSync(file, path.join(dir, `judge-summary.${name}.json`));
    const manifestFile = path.join(path.dirname(file), 'judged-drafts.json');
    if (fs.existsSync(manifestFile)) fs.copyFileSync(manifestFile, path.join(dir, `judged-drafts.${name}.json`));
  }
  if (optional.mlLints) writeJson(path.join(dir, 'ml-lints-summary.json'), optional.mlLints);
  return dir;
}

// ─── self-test ───────────────────────────────────────────────────────────────

/**
 * A synthetic run in rate-check's layout (rate-check-summary/1): per-draw reports, summary.json
 * (failed counts the no-report draws too, and byKind lists them as 'no-report') and a manifest
 * line (unless `manifest: false`). `cells`: [{ fixture, language, outcomes: ['ok' | '<failure
 * kind>[:category]' | 'no-report'], outputTokens, redrawnInfra (infra attempts --redraw-infra
 * replaced, as <i>.infra1.json), window: { start, end } (the draws' marker times) }].
 */
function writeSyntheticRun(root, { stage, unitId, arm, attempt = 1, launch, engineId, cells, distSha256 = 'd', manifest = true }) {
  const dir = path.join(root, `stage${stage}`, unitId, arm, `r${attempt}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'meta.txt'), `MODEL='${ARMS[arm].model}'\nREPORTS='1'\n`);
  const summaryCells = [];
  for (const cell of cells) {
    const stemDir = path.join(dir, cell.language, cell.fixture.replace(/\.md$/, ''));
    fs.mkdirSync(stemDir, { recursive: true });
    const c = { fixture: cell.fixture, language: cell.language, draws: cell.outcomes.length, notRun: 0, ok: 0, failed: 0, infra: 0, noReport: 0, byKind: {}, refusalCategories: {}, servedModels: cell.servedModels ?? [ARMS[arm].model] };
    const report = (kind, category, i) => {
      const ok = kind === 'ok';
      return {
        schema: 'translate-init-report/1',
        model: ARMS[arm].model,
        startedAt: '2026-10-21T00:00:00.000Z',
        usage: { inputTokens: 2500, outputTokens: ok ? (cell.outputTokens ?? 3000) : 200, thinkingTokens: 0, cacheCreationInputTokens: i === 0 ? 12000 : 0, cacheReadInputTokens: i === 0 ? 0 : 12000, apiCalls: 1 },
        costUSD: 0.05,
        servedModels: [ARMS[arm].model],
        retries: 0,
        lectures: [ok ? { file: cell.fixture, outcome: 'ok', elapsedMs: 60000, outputChars: 9000, retries: 0 } : { file: cell.fixture, outcome: 'failed', elapsedMs: 30000, retries: 0, failure: { kind, message: kind, category: category ?? null } }],
      };
    };
    cell.outcomes.forEach((outcome, i) => {
      if (outcome === 'no-report') {
        c.noReport++;
        c.failed++;
        c.byKind['no-report'] = (c.byKind['no-report'] ?? 0) + 1;
        return;
      }
      const [kind, category] = outcome.split(':');
      fs.writeFileSync(path.join(stemDir, `${i + 1}.json`), JSON.stringify(report(kind, category, i)));
      if (kind === 'ok') c.ok++;
      else if (kind === 'infra') c.infra++;
      else {
        c.failed++;
        c.byKind[kind] = (c.byKind[kind] ?? 0) + 1;
        if (kind === 'model-refusal') c.refusalCategories[category ?? 'none'] = (c.refusalCategories[category ?? 'none'] ?? 0) + 1;
      }
    });
    c.redrawnInfra = cell.redrawnInfra ?? 0;
    for (let i = 0; i < c.redrawnInfra; i++) fs.writeFileSync(path.join(stemDir, `${i + 1}.infra1.json`), JSON.stringify(report('infra', null, i)));
    c.completed = c.ok + c.failed + c.infra;
    c.valid = c.ok + c.failed;
    c.attempts = c.completed + c.redrawnInfra;
    c.infraShare = c.attempts ? (c.infra + c.redrawnInfra) / c.attempts : null;
    c.legacy = { refused: c.completed - c.ok, draws: c.completed, verdict: 'ok' };
    if (cell.window) c.drawsDetail = cell.outcomes.map((_, i) => ({ draw: i + 1, attempt: 'current', startedAt: cell.window.start, finishedAt: cell.window.end }));
    summaryCells.push(c);
  }
  fs.writeFileSync(
    path.join(dir, 'summary.json'),
    JSON.stringify({ schema: 'rate-check-summary/1', classification: 'report', engine: { tag: null, sha: 'synthetic', distSha256, translatorSha256: 't', structuralParitySha256: 'p', sdkVersion: '0.131.0' }, model: ARMS[arm].model, cells: summaryCells })
  );
  if (manifest) fs.appendFileSync(path.join(root, 'manifest.jsonl'), `${JSON.stringify({ event: 'arm-exit', stage, unit: unitId, arm, attempt, runDir: dir, launch, engineId, exitCode: 0 })}\n`);
}

const repeat = (n, value) => Array.from({ length: n }, () => value);
const outcomes = (fails, kind = 'parity', n = 12) => [...repeat(fails, kind), ...repeat(n - fails, 'ok')];

/** A compact design: 4 Stage 1 cells, 1 head-raw cell, 1 sweep of 3 lectures (2 in production). */
function syntheticDesign() {
  const unit = (stage, id, fixture, language, role, production = []) => ({
    stage,
    id,
    role,
    class: role === 'sweep' ? 'sweep-x' : 'fixture',
    sourceClass: role === 'sweep' ? 'sweep-x' : null,
    fixtures: [fixture],
    languages: [language],
    localize: 'none',
    bytes: { [fixture]: 6000 },
    production: { [fixture]: production },
    arms: { s5: 12, s55: 12 },
  });
  const units = [
    unit(1, 'a.zh-cn', 'a.md', 'zh-cn', 'gating'),
    unit(1, 'a.fa', 'a.md', 'fa', 'gating'),
    unit(1, 'b.zh-cn', 'b.md', 'zh-cn', 'gating'),
    unit(1, 'b.fa', 'b.md', 'fa', 'gating'),
    unit(2, 'h.fr', 'h.md', 'fr', 'gating', ['fr']),
    {
      ...unit(3, 'sweep.x.zh-cn', 'p1.md', 'zh-cn', 'sweep'),
      fixtures: ['p1.md', 'p2.md', 'np.md'],
      production: { 'p1.md': ['zh-cn'], 'p2.md': ['fa', 'zh-cn'], 'np.md': [] },
      arms: { s55: 1, s5: 1 },
    },
  ];
  return indexUnits([{ stage: 0, units }]);
}

function writeDesign(root, { s55Fails = 0, s5Fails = 0, s55Out = 3000, infraCell = false, crash = false, otherEngine = false, fallbackServed = false, sweepRefusal = null, controls = null, redraw = null }) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'engine.json'), JSON.stringify({ id: 'engine-synthetic' }));
  const engineId = 'engine-synthetic';
  const stage1 = [
    ['a.zh-cn', 'a.md', 'zh-cn'],
    ['a.fa', 'a.md', 'fa'],
    ['b.zh-cn', 'b.md', 'zh-cn'],
    ['b.fa', 'b.md', 'fa'],
  ];
  for (const [unitId, fixture, language] of stage1) {
    const launch = `L-${unitId}`;
    const s5 = outcomes(s5Fails);
    if (infraCell && unitId === 'a.zh-cn') s5.splice(0, 2, 'infra', 'infra');
    const s55 = outcomes(s55Fails);
    if (crash && unitId === 'a.zh-cn') s55.splice(s55.length - 1, 1, 'no-report');
    const distSha256 = otherEngine && unitId === 'b.fa' ? 'other' : 'd';
    writeSyntheticRun(root, { stage: 1, unitId, arm: 's5', launch, engineId, distSha256, cells: [{ fixture, language, outcomes: s5, outputTokens: 3000 }] });
    const served = fallbackServed && unitId === 'a.fa' ? ['claude-sonnet-5-5', 'claude-opus-4-8'] : undefined;
    writeSyntheticRun(root, { stage: 1, unitId, arm: 's55', launch, engineId, distSha256, cells: [{ fixture, language, outcomes: s55, outputTokens: s55Out, servedModels: served }] });
    if (controls) {
      writeSyntheticRun(root, { stage: 1, unitId: `${unitId}~control`, arm: 's5', launch: `C-${unitId}`, engineId, cells: [{ fixture, language, outcomes: outcomes(controls.s5, 'parity', 24) }] });
      writeSyntheticRun(root, { stage: 1, unitId: `${unitId}~control`, arm: 's55', launch: `C-${unitId}`, engineId, cells: [{ fixture, language, outcomes: outcomes(controls.s55, 'parity', 24) }] });
    }
  }
  writeSyntheticRun(root, { stage: 2, unitId: 'h.fr', arm: 's5', launch: 'L-h', engineId, cells: [{ fixture: 'h.md', language: 'fr', outcomes: outcomes(9) }] });
  writeSyntheticRun(root, { stage: 2, unitId: 'h.fr', arm: 's55', launch: 'L-h', engineId, cells: [{ fixture: 'h.md', language: 'fr', outcomes: outcomes(3) }] });
  for (const arm of ['s5', 's55']) {
    writeSyntheticRun(root, {
      stage: 3,
      unitId: 'sweep.x.zh-cn',
      arm,
      launch: 'L-sweep',
      engineId,
      cells: ['p1.md', 'p2.md', 'np.md'].map((fixture) => ({ fixture, language: 'zh-cn', outcomes: [arm === 's55' && sweepRefusal === fixture ? 'model-refusal:bio' : 'ok'] })),
    });
  }
  if (redraw) {
    for (const arm of ['s5', 's55']) {
      writeSyntheticRun(root, {
        stage: 3,
        unitId: `sweep-x.${redraw.fixture.replace(/\.md$/, '')}.zh-cn~redraw`,
        arm,
        launch: 'L-redraw',
        engineId,
        // s55: a number of refusals in 12, or the 12 outcomes themselves
        cells: [{ fixture: redraw.fixture, language: 'zh-cn', outcomes: arm === 's55' ? (Array.isArray(redraw.s55) ? redraw.s55 : outcomes(redraw.s55, 'model-refusal:bio')) : outcomes(0) }],
      });
    }
  }
}

async function selfTest() {
  const stats = await importStats();
  const { priceFor } = await importDist('model-pricing.js');
  const unitIndex = syntheticDesign();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'claude55-summarize-selftest-'));
  let failures = 0;
  const check = (name, fn) => {
    try {
      fn();
      console.log(`✓ ${name}`);
    } catch (error) {
      failures++;
      console.log(`✗ ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const run = async (name, design) => {
    const root = path.join(tmp, name);
    writeDesign(root, design);
    return (await summarize({ evalRoot: root, unitIndex, stats, priceFor })).result;
  };
  try {
    const worse = await run('s55-worse', { s55Fails: 6, s5Fails: 0 });
    check('s55 6/12 v s5 0/12: R2-pooled FAILs', () => assert.equal(worse.rules['R2-pooled'].verdict, 'FAIL'));
    check('s55 6/12 v s5 0/12: per-cell Fisher is oriented "s55 worse" (greater ≈ 0.0069)', () => {
      const row = worse.cells.find((c) => c.stage === 1);
      assert.ok(Math.abs(row.contrasts.s55.structural.greater - 0.0069) < 0.0005, `got ${row.contrasts.s55.structural.greater}`);
    });
    check('s55 6/12 v s5 0/12: R2 guard asks for same-day controls', () => {
      assert.equal(worse.rules['R2-guard'].verdict, 'INCONCLUSIVE');
      assert.ok(worse.followups.some((f) => f.unitId === 'a.zh-cn~control'));
    });
    check('decision is BLOCKED', () => assert.equal(worse.decision.verdict, 'BLOCKED'));

    const controlled = await run('s55-worse-controlled', { s55Fails: 6, s5Fails: 0, controls: { s55: 12, s5: 0 } });
    check('with controls (s55 18/36 v s5 0/36): R2 guard FAILs', () => assert.equal(controlled.rules['R2-guard'].verdict, 'FAIL'));

    const better = await run('s55-better', { s55Fails: 0, s5Fails: 6 });
    check('s55 0/12 v s5 6/12: R2-pooled PASSes', () => assert.equal(better.rules['R2-pooled'].verdict, 'PASS'));
    check('s55 0/12 v s5 6/12: R2 guard PASSes with no control', () => {
      assert.equal(better.rules['R2-guard'].verdict, 'PASS');
      assert.equal(better.followups.filter((f) => f.kind === 'control').length, 0);
    });
    check('s55 0/12 v s5 6/12: per-cell greater = 1 (not "s55 worse")', () => {
      const row = better.cells.find((c) => c.stage === 1);
      assert.equal(row.contrasts.s55.structural.greater, 1);
    });

    const equal = await run('equal', { s55Fails: 0, s5Fails: 0 });
    check('no structural failure in either arm: R2-pooled PASSes on the Wilson bound', () => {
      assert.equal(equal.rules['R2-pooled'].verdict, 'PASS');
      assert.match(equal.rules['R2-pooled'].reason, /Wilson/);
    });
    check('R4 is INCONCLUSIVE with fewer than 6 ratio cells (4 here; the head-raw cell has 3 s5 successes)', () => {
      assert.equal(equal.rules.R4.verdict, 'INCONCLUSIVE');
    });
    check('R3 PASSes on a clean sweep', () => assert.equal(equal.rules.R3.verdict, 'PASS'));
    check('R0 PASSes', () => assert.equal(equal.rules.R0.verdict, 'PASS'));

    const infra = await run('infra', { infraCell: true });
    check('2 infra draws of 12 (17%): R0 FAILs, asks for a whole re-run, and the decision is NOT READY', () => {
      assert.equal(infra.rules.R0.verdict, 'FAIL');
      assert.deepEqual(infra.rules.R0.reruns, [{ stage: 1, unit: 'a.zh-cn', remedy: 'rerun' }]);
      assert.equal(infra.decision.verdict, 'NOT READY');
    });

    const crash = await run('crash', { crash: true });
    check('a draw with no report (a crash) counts as a structural failure', () => {
      const row = crash.cells.find((c) => c.unit === 'a.zh-cn');
      assert.equal(row.arms.s55.structural, 1);
      assert.equal(row.arms.s55.valid, 12);
    });

    const mixed = await run('other-engine', { otherEngine: true });
    check('a gating run on other engine hashes: R0 FAILs', () => {
      assert.equal(mixed.rules.R0.verdict, 'FAIL');
      assert.match(mixed.rules.R0.reason, /engine hashes/);
    });

    const fallback = await run('fallback-served', { fallbackServed: true });
    check('a response served by another model (a fallback): R0 FAILs', () => {
      assert.equal(fallback.rules.R0.verdict, 'FAIL');
      assert.match(fallback.rules.R0.reason, /served by claude-opus-4-8/);
    });

    const refusal = await run('refusal', { sweepRefusal: 'p1.md' });
    check('a production refusal without its redraw: R3 INCONCLUSIVE with a redraw follow-up', () => {
      assert.equal(refusal.rules.R3.verdict, 'INCONCLUSIVE');
      assert.ok(refusal.followups.some((f) => f.unitId === 'sweep-x.p1.zh-cn~redraw'));
    });
    const reproduced = await run('refusal-reproduced', { sweepRefusal: 'p1.md', redraw: { fixture: 'p1.md', s55: 1 } });
    check('the refusal reproduces in the redraw: R3 FAILs', () => assert.equal(reproduced.rules.R3.verdict, 'FAIL'));
    const cleared = await run('refusal-cleared', { sweepRefusal: 'p1.md', redraw: { fixture: 'p1.md', s55: 0 } });
    check('the refusal does not reproduce: R3 PASSes', () => assert.equal(cleared.rules.R3.verdict, 'PASS'));
    const nonProd = await run('refusal-nonproduction', { sweepRefusal: 'np.md' });
    check('a refusal on a lecture in no edition is reported, not blocking', () => {
      assert.equal(nonProd.rules.R3.verdict, 'PASS');
      assert.equal(nonProd.rules.R3.nonProduction.length, 1);
    });
    // "did not reproduce" needs the redraw's draws (#227: above 10% infra, no verdict)
    const redrawInfra = await run('refusal-redraw-all-infra', { sweepRefusal: 'p1.md', redraw: { fixture: 'p1.md', s55: repeat(12, 'infra') } });
    check('a redraw with no valid s55 draw (12 infra of 12): R3 INCONCLUSIVE, the redraw owed again whole', () => {
      assert.equal(redrawInfra.rules.R3.verdict, 'INCONCLUSIVE');
      const owed = redrawInfra.followups.find((f) => f.unitId === 'sweep-x.p1.zh-cn~redraw');
      assert.ok(owed, 'no redraw follow-up');
      assert.equal(owed.remedy, 'rerun');
    });
    const redrawSome = await run('refusal-redraw-some-infra', { sweepRefusal: 'p1.md', redraw: { fixture: 'p1.md', s55: [...repeat(3, 'infra'), ...repeat(9, 'ok')] } });
    check('a redraw with 3 infra of 12 (9 valid): R3 INCONCLUSIVE', () => assert.equal(redrawSome.rules.R3.verdict, 'INCONCLUSIVE'));
    const redrawRefused = await run('refusal-redraw-refused-infra', { sweepRefusal: 'p1.md', redraw: { fixture: 'p1.md', s55: ['model-refusal:bio', ...repeat(11, 'infra')] } });
    check('a refusal that reproduces blocks whatever the infra share (1 refusal, 11 infra): R3 FAILs', () => assert.equal(redrawRefused.rules.R3.verdict, 'FAIL'));

    // R0's per-arm infra share counts rate-check's attempts, the ones --redraw-infra replaced too
    const oneCell = indexUnits([{ stage: 0, units: [...unitIndex.values()].filter((u) => u.id === 'a.zh-cn') }]);
    const redrawnRoot = path.join(tmp, 'redrawn-infra');
    fs.mkdirSync(redrawnRoot, { recursive: true });
    fs.writeFileSync(path.join(redrawnRoot, 'engine.json'), JSON.stringify({ id: 'engine-synthetic' }));
    for (const arm of ['s5', 's55']) {
      writeSyntheticRun(redrawnRoot, { stage: 1, unitId: 'a.zh-cn', arm, launch: 'L', engineId: 'engine-synthetic', cells: [{ fixture: 'a.md', language: 'zh-cn', outcomes: outcomes(0), redrawnInfra: arm === 's55' ? 1 : 0 }] });
    }
    const redrawn = (await summarize({ evalRoot: redrawnRoot, unitIndex: oneCell, stats, priceFor })).result.rules.R0;
    check('R0 keeps an infra attempt --redraw-infra replaced in its arm\'s share (s55 1 of 13)', () => {
      assert.equal(redrawn.verdict, 'PASS');
      assert.ok(Math.abs(redrawn.infraByArm.s55.share - 1 / 13) < 1e-12, `s55 share ${redrawn.infraByArm.s55.share}`);
      assert.ok(Math.abs(redrawn.infraArmDifference - 1 / 13) < 1e-12, `difference ${redrawn.infraArmDifference}`);
    });

    // R0 compares the launch that CREATED each arm's run: a later joint resume or relaunch must not
    // make arms drawn apart read as drawn together. Rows: [event, launch, arms | arm, --resume?].
    const launchCase = async (name, rows) => {
      const root = path.join(tmp, name);
      writeDesign(root, {});
      const file = path.join(root, 'manifest.jsonl');
      const kept = fs.readFileSync(file, 'utf8').split('\n').filter((line) => line && JSON.parse(line).unit !== 'a.zh-cn');
      const runDir = (arm) => path.join(root, 'stage1', 'a.zh-cn', arm, 'r1');
      const written = rows.map(([event, launch, arm, flag]) =>
        event === 'start'
          ? { event: 'unit-start', launch, stage: 1, unit: 'a.zh-cn', attempt: 1, arms: Object.fromEntries(arm.map((a) => [a, 12])) }
          : { event: 'arm-exit', launch, stage: 1, unit: 'a.zh-cn', arm, attempt: 1, runDir: runDir(arm), engineId: 'engine-synthetic', exitCode: 0, args: ['--run-dir', runDir(arm), ...(flag ? [flag] : [])] }
      );
      fs.writeFileSync(file, `${[...kept, ...written.map((r) => JSON.stringify(r))].join('\n')}\n`);
      return (await summarize({ evalRoot: root, unitIndex, stats, priceFor })).result.rules.R0;
    };
    const drawnApart = (r0) => r0.problems.some((p) => p.cell === 'a.md × zh-cn' && /different launches/.test(p.issue) && p.remedy === 'rerun');
    const s5ThenFull = await launchCase('launch-s5-then-full', [['start', 'L1', ['s5']], ['exit', 'L1', 's5'], ['start', 'L2', ['s5', 's55']], ['exit', 'L2', 's5', '--resume'], ['exit', 'L2', 's55']]);
    check('R0: --arms s5, then the full unit (s5 resumed): different launches (rerun)', () => assert.ok(drawnApart(s5ThenFull), JSON.stringify(s5ThenFull.problems)));
    const apartThenNoop = await launchCase('launch-apart-then-noop', [['start', 'L1', ['s5']], ['exit', 'L1', 's5'], ['start', 'L2', ['s55']], ['exit', 'L2', 's55'], ['start', 'L3', ['s5', 's55']], ['exit', 'L3', 's5', '--resume'], ['exit', 'L3', 's55', '--resume']]);
    check('R0: --arms s5, --arms s55, then a no-op joint relaunch: still different launches (rerun)', () => assert.ok(drawnApart(apartThenNoop), JSON.stringify(apartThenNoop.problems)));
    const driverKilled = await launchCase('launch-driver-killed', [['start', 'L1', ['s5']], ['start', 'L2', ['s5', 's55']], ['exit', 'L2', 's5', '--resume'], ['exit', 'L2', 's55']]);
    check('R0: a launch whose driver died before its arm-exit row still counts as the one that created the run', () => assert.ok(drawnApart(driverKilled), JSON.stringify(driverKilled.problems)));
    const together = await launchCase('launch-together-continued', [['start', 'L1', ['s5', 's55']], ['exit', 'L1', 's5'], ['exit', 'L1', 's55'], ['start', 'L2', ['s5', 's55']], ['exit', 'L2', 's5', '--resume'], ['exit', 'L2', 's55', '--resume'], ['start', 'L3', ['s5', 's55']], ['exit', 'L3', 's5', '--redraw-infra'], ['exit', 'L3', 's55', '--redraw-infra']]);
    check('R0: arms drawn together, then resumed and topped up (R0\'s own remedies): PASS', () => assert.equal(together.verdict, 'PASS', JSON.stringify(together.problems)));
    const windowCase = async (name, s55Window) => {
      const root = path.join(tmp, name);
      writeDesign(root, {});
      // the manifest rows say one launch; the draws' own times are the independent check
      for (const [arm, window] of [['s5', { start: '2026-10-21T10:00:00Z', end: '2026-10-21T10:30:00Z' }], ['s55', s55Window]]) {
        writeSyntheticRun(root, { stage: 1, unitId: 'a.zh-cn', arm, launch: 'L-a.zh-cn', engineId: 'engine-synthetic', manifest: false, cells: [{ fixture: 'a.md', language: 'zh-cn', outcomes: outcomes(0), window }] });
      }
      return (await summarize({ evalRoot: root, unitIndex, stats, priceFor })).result.rules.R0;
    };
    const apartInTime = await windowCase('windows-apart', { start: '2026-10-22T10:00:00Z', end: '2026-10-22T10:30:00Z' });
    check('R0: arms whose draws ran on different days FAIL on their windows, whatever the manifest says', () => assert.ok(apartInTime.problems.some((p) => /do not overlap/.test(p.issue) && p.remedy === 'rerun')));
    const overlapping = await windowCase('windows-overlap', { start: '2026-10-21T10:10:00Z', end: '2026-10-21T10:40:00Z' });
    check('R0: overlapping windows PASS', () => assert.equal(overlapping.verdict, 'PASS', JSON.stringify(overlapping.problems)));

    // R4 / R5 need ≥ 6 cells: a wider design with 8 Stage 1 cells.
    const wide = indexUnits([{ stage: 0, units: [...unitIndex.values()].filter((u) => u.stage !== 1).concat(['a', 'b', 'c', 'd'].flatMap((f) => ['zh-cn', 'fa'].map((l) => ({ stage: 1, id: `${f}.${l}`, role: 'gating', fixtures: [`${f}.md`], languages: [l], localize: 'none', bytes: {}, production: {}, arms: { s5: 12, s55: 12 } })))) }]);
    const writeWide = (root, s55Out, extra = {}) => {
      writeDesign(root, { s55Out, ...extra });
      for (const f of ['c', 'd']) {
        for (const l of ['zh-cn', 'fa']) {
          writeSyntheticRun(root, { stage: 1, unitId: `${f}.${l}`, arm: 's5', launch: `L-${f}${l}`, engineId: 'engine-synthetic', cells: [{ fixture: `${f}.md`, language: l, outcomes: outcomes(0), outputTokens: 3000 }] });
          writeSyntheticRun(root, { stage: 1, unitId: `${f}.${l}`, arm: 's55', launch: `L-${f}${l}`, engineId: 'engine-synthetic', cells: [{ fixture: `${f}.md`, language: l, outcomes: outcomes(0), outputTokens: s55Out }] });
        }
      }
    };
    const sameRoot = path.join(tmp, 'wide-same');
    writeWide(sameRoot, 3000);
    const same = (await summarize({ evalRoot: sameRoot, unitIndex: wide, stats, priceFor })).result;
    check('R4 PASSes at an output-token ratio of 1.0; R5 PASSes at equal cost', () => {
      assert.equal(same.rules.R4.verdict, 'PASS');
      assert.equal(same.rules.R5.verdict, 'PASS');
    });
    check('without R1 the decision is INCOMPLETE, never SUPPORTED', () => assert.equal(same.decision.verdict, 'INCOMPLETE'));
    // engine-aa.json as engine-aa.mjs writes it: every Stage 1 cell of the design with all four
    // scenarios, claude-sonnet-5, a v0.29.5 baseline on its own SDK, the pinned engine as candidate
    const scenarios = Object.fromEntries(['end_turn', 'max_tokens', 'refusal', 'overloaded'].map((s) => [s, { baseline: { kind: 'ok' }, candidate: { kind: 'ok' } }]));
    const allCases = [...wide.values()].filter((u) => u.stage === 1).flatMap((u) => u.fixtures.flatMap((fixture) => u.languages.map((language) => ({ fixture, language, scenarios }))));
    const pinnedCandidate = { version: '0.29.5', sdkVersion: '0.131.0', engineId: 'engine-synthetic', distSha256: 'd', clean: true, distStale: false };
    const engineAa = (over = {}) => ({ verdict: 'PASS', reason: 'synthetic', model: 'claude-sonnet-5', sourceOnly: false, baseline: { version: '0.29.5', sdkVersion: '0.78.0', git: null }, candidate: pinnedCandidate, cases: allCases, ...over });
    const aaFile = path.join(sameRoot, 'engine-aa', 'engine-aa.json');
    fs.mkdirSync(path.dirname(aaFile), { recursive: true });
    const withAa = async (report) => {
      fs.writeFileSync(aaFile, JSON.stringify(report));
      return (await summarize({ evalRoot: sameRoot, unitIndex: wide, stats, priceFor })).result;
    };
    const sourceOnly = await withAa(engineAa({ sourceOnly: true, baseline: { version: '0.29.5', sdkVersion: '0.131.0', git: null } }));
    check('an R1 run on one shared SDK is INCONCLUSIVE (source only)', () => assert.equal(sourceOnly.rules.R1.verdict, 'INCONCLUSIVE'));
    const oneCase = await withAa(engineAa({ cases: allCases.slice(0, 1) }));
    check('an R1 PASS covering 1 of the 8 Stage 1 cells is INCONCLUSIVE', () => {
      assert.equal(oneCase.rules.R1.verdict, 'INCONCLUSIVE');
      assert.match(oneCase.rules.R1.reason, /covered 1 of 8 Stage 1 cells/);
    });
    const otherModel = await withAa(engineAa({ model: 'claude-sonnet-5-5' }));
    check('an R1 PASS on another model is INCONCLUSIVE', () => assert.equal(otherModel.rules.R1.verdict, 'INCONCLUSIVE'));
    const otherBaseline = await withAa(engineAa({ baseline: { version: '0.30.0', sdkVersion: '0.78.0', git: null } }));
    check('an R1 PASS against a baseline that is not v0.29.5 is INCONCLUSIVE', () => assert.equal(otherBaseline.rules.R1.verdict, 'INCONCLUSIVE'));
    const otherEngine = await withAa(engineAa({ candidate: { ...pinnedCandidate, engineId: 'engine-other' } }));
    check('an R1 PASS whose candidate is not the engine in engine.json is INCONCLUSIVE', () => {
      assert.equal(otherEngine.rules.R1.verdict, 'INCONCLUSIVE');
      assert.match(otherEngine.rules.R1.reason, /rerun engine-aa from the pinned checkout/);
    });
    const requestCount = await withAa(engineAa({ verdict: 'FAIL', reason: 'a.md × zh-cn overloaded: 3 requests at baseline, 2 at candidate', cases: allCases.slice(0, 1) }));
    check('an R1 FAIL on a request count (partial coverage too) FAILs R1, and the decision is BLOCKED', () => {
      assert.equal(requestCount.rules.R1.verdict, 'FAIL');
      assert.equal(requestCount.decision.verdict, 'BLOCKED');
    });
    const noVerdict = await withAa(engineAa({ verdict: undefined }));
    check('an engine-aa.json with no verdict is INCONCLUSIVE, never read as a pass', () => {
      assert.equal(noVerdict.rules.R1.verdict, 'INCONCLUSIVE');
      assert.notEqual(noVerdict.decision.verdict, 'SUPPORTED');
    });
    const headers = await withAa(engineAa({ verdict: 'EXPLAIN', reason: 'explain in RESULTS.md: a.md × zh-cn: header x-new-header null → 1' }));
    check('an R1 EXPLAIN names the header differences RESULTS.md must explain', () => {
      assert.equal(headers.decision.verdict, 'SUPPORTED');
      assert.match(headers.decision.text, /must explain: a\.md × zh-cn: header x-new-header/);
    });
    const supported = await withAa(engineAa());
    check('every gating rule passing: the decision is SUPPORTED, with the coverage caveat', () => {
      assert.equal(supported.rules.R1.verdict, 'PASS');
      assert.equal(supported.decision.verdict, 'SUPPORTED');
      assert.match(supported.decision.text, /section-level sync path and the reviewer are unmeasured/);
    });
    // the same design with a production refusal whose redraw had no valid s55 draw
    const wideRedrawRoot = path.join(tmp, 'wide-redraw-infra');
    writeWide(wideRedrawRoot, 3000, { sweepRefusal: 'p1.md', redraw: { fixture: 'p1.md', s55: repeat(12, 'infra') } });
    fs.mkdirSync(path.join(wideRedrawRoot, 'engine-aa'), { recursive: true });
    fs.writeFileSync(path.join(wideRedrawRoot, 'engine-aa', 'engine-aa.json'), JSON.stringify(engineAa()));
    const wideRedraw = (await summarize({ evalRoot: wideRedrawRoot, unitIndex: wide, stats, priceFor })).result;
    check('every other rule passing, a refusal redrawn into 12 infra draws: R3 INCONCLUSIVE, the decision not SUPPORTED', () => {
      assert.equal(wideRedraw.rules.R3.verdict, 'INCONCLUSIVE');
      assert.notEqual(wideRedraw.decision.verdict, 'SUPPORTED');
    });
    const longerRoot = path.join(tmp, 'wide-longer');
    writeWide(longerRoot, 4500);
    const longer = (await summarize({ evalRoot: longerRoot, unitIndex: wide, stats, priceFor })).result;
    check('R4 FAILs at an output-token ratio of 1.5; R5 asks for an explanation', () => {
      assert.equal(longer.rules.R4.verdict, 'FAIL');
      assert.equal(longer.rules.R5.verdict, 'EXPLAIN');
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(failures === 0 ? 'summarize self-test: all checks pass' : `summarize self-test: ${failures} FAILED`);
  return failures === 0 ? 0 : 1;
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const { flags } = parseArgs(process.argv.slice(2), SPEC);
  if (flags.help) {
    console.log(helpText(import.meta.url));
    return 0;
  }
  if (flags['self-test']) return selfTest();
  const evalRoot = resolveEvalRoot(flags['eval-root']);
  if (!fs.existsSync(evalRoot)) throw new UsageError(`no evaluation root at ${evalRoot}`);
  const outDir = path.resolve(flags.out ?? EXPERIMENT_DIR);
  const corpus = loadCorpus();
  const unitIndex = indexUnits(buildStages(corpus));
  const stats = await importStats();
  const { priceFor } = await importDist('model-pricing.js');
  // R1's baseline must be the v0.29.5 commit when engine-aa recorded one
  const baselineRefSha = gitCommitOf(`v${R1_BASELINE_VERSION}`);
  const { loaded, optional, result, warnings } = await summarize({ evalRoot, unitIndex, stats, priceFor, baselineRefSha });
  const generatedAt = new Date().toISOString();
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'RESULTS.md'), renderResults({ evalRoot, loaded, result, warnings, generatedAt }));
  writeJson(path.join(outDir, 'results.json'), {
    schema: 'claude-5-5-upgrade/results/1',
    generatedAt,
    evalRoot,
    engine: loaded.engine,
    rulesConstants: RULES,
    decision: result.decision,
    rules: result.rules,
    informational: result.informational,
    stage0: result.stage0,
    cells: result.cells,
    advisory: result.advisory,
    followups: result.followups,
    warnings,
  });
  const recordsDir = flags['no-records'] ? null : writeRecords(outDir, { evalRoot, loaded, optional });
  if (!flags.quiet) {
    for (const rule of Object.values(result.rules)) console.log(`${rule.rule.padEnd(10)} ${rule.verdict.padEnd(12)} ${rule.reason}`);
    console.log('');
    console.log(`Decision: ${result.decision.verdict} — ${result.decision.text}`);
    if (result.followups.length) console.log(`Follow-ups owed: ${result.followups.map((f) => `stage ${f.stage} ${f.unitId}`).join(', ')} (run-stages.mjs --followups)`);
    for (const w of warnings) console.log(`warning: ${w}`);
    console.log(`Wrote ${path.relative(REPO_ROOT, path.join(outDir, 'RESULTS.md')) || 'RESULTS.md'}, results.json${recordsDir ? ', records/' : ''}`);
  }
  return 0;
}

runMain(main);

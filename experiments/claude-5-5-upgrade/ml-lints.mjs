#!/usr/bin/env node
// ml-lints.mjs — ADVISORY: experiments/ml-benchmark/scripts/ml_metrics.py over every successful ml
// draft of each arm (read in place, never edited), and the keep-English comparison README.md
// pre-registers. Neither this nor the judge can clear Sonnet 5.5 for the ml edition: the lints
// encode error classes found in Sonnet 5 drafts and the references are post-edits of Sonnet 5 seeds.
//
// Usage: node experiments/claude-5-5-upgrade/ml-lints.mjs [--eval-root DIR] [--stages 1,4]
//            [--arms s5,s55,o55] [--python python3] [--out DIR]
//
// Per draft: python3 -I ml_metrics.py --output <draft> --source <its English source>
//   --glossary <repo>/glossary/ml.json --json   (run from the repository root; exit 1 only means a
//   FAIL gate fired, which is recorded). The unit of the keep-English comparison is one draft: its
//   mean per-paragraph Malayalam share (script_ratio.output.mean; higher = less kept in English),
//   n = the draws of a lecture per arm (6 in Stage 4, 12 in Stage 1). Each candidate arm is
//   compared with FRESH s5 drafts of the same lectures, never with the s5-derived reference: an
//   exact Mann–Whitney test permuting within each lecture (stats.mjs mannWhitneyStratified),
//   two-sided; p < 0.05 in either direction is the advisory trigger for the ml native-review check.
//   The editor's reference pages (reference-ml cells) are scored once for context.
// Writes <out>/ml-lints.jsonl (one line per draft) and <out>/ml-lints-summary.json
// (default out: EVAL_ROOT/ml-lints/, which summarize.mjs reads).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, UsageError, helpText, importStats, list, loadCorpus, parseArgs, resolveEvalRoot, runMain, writeJson } from './lib.mjs';
import { discoverRuns, loadRun } from './results.mjs';

const SPEC = { 'eval-root': 'string', stages: 'string', arms: 'string', python: 'string', out: 'string', help: 'boolean' };
const ML_METRICS = path.join(REPO_ROOT, 'experiments', 'ml-benchmark', 'scripts', 'ml_metrics.py');
const GLOSSARY = path.join(REPO_ROOT, 'glossary', 'ml.json');

function mlMetrics(python, output, source) {
  const args = ['-I', ML_METRICS, '--output', output, '--glossary', GLOSSARY, '--json'];
  if (source) args.push('--source', source);
  const r = spawnSync(python, args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 && r.status !== 1) throw new Error(`ml_metrics.py failed on ${output} (exit ${r.status}): ${(r.stderr || r.stdout).slice(0, 500)}`);
  const m = JSON.parse(r.stdout);
  const lintCounts = Object.fromEntries(Object.entries(m.lint ?? {}).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]));
  return {
    malayalamShare: m.script_ratio?.output?.mean ?? null,
    paragraphs: m.script_ratio?.output?.n ?? 0,
    lint: lintCounts,
    lintTotal: Object.values(lintCounts).reduce((s, n) => s + n, 0),
    commaSplicePer100: m.comma_splice_rate?.per_100_lines ?? null,
    fail: m.fail ?? [],
    warn: m.warn ?? [],
  };
}

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

async function main() {
  const { flags } = parseArgs(process.argv.slice(2), SPEC);
  if (flags.help) {
    console.log(helpText(import.meta.url));
    return 0;
  }
  const evalRoot = resolveEvalRoot(flags['eval-root']);
  const stages = (list(flags.stages) ?? ['1', '4']).map(Number);
  const arms = list(flags.arms) ?? ['s5', 's55', 'o55'];
  const python = flags.python ?? 'python3';
  const outDir = path.resolve(flags.out ?? path.join(evalRoot, 'ml-lints'));
  if (!fs.existsSync(ML_METRICS)) throw new UsageError(`missing ${ML_METRICS}`);
  const stats = await importStats();

  const latest = new Map();
  for (const run of discoverRuns(evalRoot)) {
    if (!stages.includes(run.stage) || run.phase !== 'base' || !arms.includes(run.arm)) continue;
    const key = `${run.stage}|${run.unitId}|${run.arm}`;
    if (!latest.has(key) || latest.get(key).attempt < run.attempt) latest.set(key, run);
  }
  const rows = [];
  for (const run of latest.values()) {
    const loaded = loadRun(run);
    for (const d of loaded.draws) {
      if (d.language !== 'ml' || d.outcome !== 'ok' || d.replacedInfra) continue;
      const draft = path.join(run.dir, 'ml', d.stem, String(d.draw), d.fixture);
      const source = path.join(run.dir, '_src', d.fixture);
      if (!fs.existsSync(draft)) continue;
      rows.push({ stage: run.stage, unit: run.unitId, arm: run.arm, lecture: d.fixture, draw: d.draw, draft: path.relative(evalRoot, draft), ...mlMetrics(python, draft, fs.existsSync(source) ? source : null) });
    }
  }
  if (!rows.length) {
    console.log(`No successful ml drafts under ${evalRoot} (stages ${stages.join(', ')}).`);
    return 0;
  }

  // The editor's pages, for context only (they are post-edits of Sonnet 5 seeds).
  const reference = [];
  for (const d of loadCorpus().documents.filter((x) => x.class === 'reference-ml')) {
    reference.push({ lecture: `${d.id}.md`, ...mlMetrics(python, path.join(REPO_ROOT, d.reference), path.join(REPO_ROOT, d.local)) });
  }

  const byLecture = [];
  const lectures = [...new Set(rows.map((r) => r.lecture))].sort();
  for (const lecture of lectures) {
    for (const arm of arms) {
      const rs = rows.filter((r) => r.lecture === lecture && r.arm === arm && r.malayalamShare !== null);
      if (!rs.length) continue;
      byLecture.push({
        lecture,
        arm,
        drafts: rs.length,
        malayalamShare: mean(rs.map((r) => r.malayalamShare)),
        lintPerDraft: mean(rs.map((r) => r.lintTotal)),
        commaSplicePer100: mean(rs.map((r) => r.commaSplicePer100).filter((x) => x !== null)),
        failGates: rs.filter((r) => r.fail.length).length,
      });
    }
  }
  const comparisons = [];
  for (const cand of arms.filter((a) => a !== 's5')) {
    const strata = [];
    const candAll = [];
    const baseAll = [];
    for (const lecture of lectures) {
      const xs = rows.filter((r) => r.lecture === lecture && r.arm === cand && r.malayalamShare !== null).map((r) => r.malayalamShare);
      const ys = rows.filter((r) => r.lecture === lecture && r.arm === 's5' && r.malayalamShare !== null).map((r) => r.malayalamShare);
      if (xs.length >= 2 && ys.length >= 2) {
        strata.push([xs, ys]);
        candAll.push(...xs);
        baseAll.push(...ys);
      }
    }
    if (!strata.length) continue;
    const mw = stats.mannWhitneyStratified(strata);
    comparisons.push({ contrast: `${cand} v s5`, strata: strata.length, candMean: mean(candAll), baseMean: mean(baseAll), p: mw.p, method: mw.method, trigger: mw.p < 0.05 });
  }
  const triggered = comparisons.filter((c) => c.trigger);
  const summary = {
    schema: 'claude-5-5-upgrade/ml-lints/1',
    generatedAt: new Date().toISOString(),
    unit: 'per-draft mean Malayalam share of each paragraph (ml_metrics script_ratio.output.mean)',
    headline: triggered.length
      ? `TRIGGER: keep-English share shifted for ${triggered.map((c) => c.contrast).join(', ')} — ml native-review check`
      : `no keep-English shift at p < 0.05 (${rows.length} drafts)`,
    comparisons,
    byLecture,
    reference,
  };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'ml-lints.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  writeJson(path.join(outDir, 'ml-lints-summary.json'), summary);
  console.log(summary.headline);
  for (const c of comparisons) console.log(`  ${c.contrast}: Malayalam share ${c.candMean.toFixed(3)} v ${c.baseMean.toFixed(3)} over ${c.strata} lecture(s), p = ${c.p.toFixed(3)} (${c.method})`);
  console.log(`Wrote ${path.join(outDir, 'ml-lints-summary.json')}`);
  return 0;
}

runMain(main);

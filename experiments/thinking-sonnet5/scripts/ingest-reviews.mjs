#!/usr/bin/env node
/**
 * Ingest native-reviewer JSON (from the packet "Download my review" button),
 * un-blind it via the private key, and combine with the Opus metrics into a
 * per-variant table for REPORT.md.
 *
 * Inputs (defaults):
 *   data/review-key.json          id→variant map (private; written by make-review-packets.mjs)
 *   data/native-reviews/*.json    reviewer downloads (drop Emile's files here)
 *   outputs/metrics.jsonl         Opus scores + cost/latency (written by run-matrix.mjs)
 *
 * Output: a combined table on stdout + data/ingest-summary.{json,md}.
 * Runs without a build (no SDK/dist import). Usage:
 *   node ingest-reviews.mjs [--key ..] [--reviews ..] [--metrics ..] [--lang fr] [--out ..]
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const EXP = path.join(ROOT, 'experiments/thinking-sonnet5');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };

const keyPath = path.resolve(arg('key', path.join(EXP, 'data/review-key.json')));
const reviewsDir = path.resolve(arg('reviews', path.join(EXP, 'data/native-reviews')));
const metricsPath = path.resolve(arg('metrics', path.join(EXP, 'outputs/metrics.jsonl')));
const outDir = path.resolve(arg('out', path.join(EXP, 'data')));

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const push = (o, k, v) => { if (v != null) (o[k] ??= []).push(v); };
const fmt = (x, d = 2) => (x == null ? '—' : (+x).toFixed(d));

// --- key (id → variant, per lecture) ----------------------------------------
if (!fs.existsSync(keyPath)) { console.error(`No key at ${path.relative(ROOT, keyPath)} — generate packets first.`); process.exit(1); }
const key = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
const lang = arg('lang', key.lang || 'fr');
const reviewedRep = key.rep ?? 1;
// lookup[lecture][id] = { variant, label }
const lookup = key.lectures || {};

// --- native reviews ----------------------------------------------------------
const nat = {}; // variant -> { accuracy:[], fluency:[], terminology:[], rank:[], hardErrors:0, comments:[] }
const reviewers = new Set();
let nativeFiles = 0;
if (fs.existsSync(reviewsDir)) {
  for (const f of fs.readdirSync(reviewsDir).filter((f) => f.endsWith('.json'))) {
    let r; try { r = JSON.parse(fs.readFileSync(path.join(reviewsDir, f), 'utf-8')); } catch { console.warn(`skip unreadable ${f}`); continue; }
    const lect = r.lecture; const map = lookup[lect];
    if (!map) { console.warn(`skip ${f} — lecture "${lect}" not in key`); continue; }
    nativeFiles++; if (r.reviewer) reviewers.add(r.reviewer);
    for (const [id, s] of Object.entries(r.scores || {})) {
      const v = map[id]?.variant; if (!v) { console.warn(`  ${f}: id "${id}" not in key for ${lect}`); continue; }
      const o = (nat[v] ??= { accuracy: [], fluency: [], terminology: [], rank: [], hardErrors: 0, comments: [] });
      push(o, 'accuracy', num(s.accuracy)); push(o, 'fluency', num(s.fluency)); push(o, 'terminology', num(s.terminology));
      push(o, 'rank', num(s.rank)); if (s.hardError) o.hardErrors++;
      if (s.comments && s.comments.trim()) o.comments.push(`[${lect} ${v}] ${s.comments.trim()}`);
    }
  }
}

// --- Opus metrics ------------------------------------------------------------
const opus = {}; // variant -> { overall:[], cost:[], latency:[] }  (scoped to reviewed lang + rep)
if (fs.existsSync(metricsPath)) {
  for (const line of fs.readFileSync(metricsPath, 'utf-8').split('\n').filter(Boolean)) {
    let m; try { m = JSON.parse(line); } catch { continue; }
    if (m.lang !== lang || (m.rep ?? 1) !== reviewedRep) continue;
    const o = (opus[m.variant] ??= { overall: [], cost: [], latency: [] });
    if (m.review?.overall != null) o.overall.push(m.review.overall);
    if (m.translate?.costUSD != null) o.cost.push(m.translate.costUSD);
    if (m.translate?.elapsed != null) o.latency.push(m.translate.elapsed);
  }
} else {
  console.warn(`No metrics at ${path.relative(ROOT, metricsPath)} — run the matrix; native columns only.`);
}

// --- combine + report --------------------------------------------------------
const variants = [...new Set([...Object.keys(nat), ...Object.keys(opus)])].sort();
const rows = variants.map((v) => {
  const n = nat[v] || {}, o = opus[v] || {};
  const label = Object.values(lookup).flatMap((m) => Object.values(m)).find((e) => e.variant === v)?.label || '';
  return {
    variant: v, label,
    natRank: mean(n.rank || []), natAcc: mean(n.accuracy || []), natFlu: mean(n.fluency || []), natTerm: mean(n.terminology || []),
    hardErrors: n.hardErrors || 0, opusOverall: mean(o.overall || []),
    translateUSD: mean(o.cost || []), latency: mean(o.latency || []), comments: n.comments || [],
  };
});
// order by native mean rank (best first); fall back to Opus overall
rows.sort((a, b) => (a.natRank ?? 9) - (b.natRank ?? 9) || (b.opusOverall ?? 0) - (a.opusOverall ?? 0));

console.log(`\nThinking-eval — combined review (lang=${lang}, rep=${reviewedRep})`);
console.log(`native files: ${nativeFiles}${reviewers.size ? ` (reviewers: ${[...reviewers].join(', ')})` : ''}\n`);
console.log(`variant  label                       nat-rank  nat-acc  nat-flu  nat-term  hardErr  opus-ovr  $tr    lat`);
for (const r of rows) {
  console.log(
    `${r.variant.padEnd(7)}  ${(r.label || '').padEnd(26)}  ${fmt(r.natRank).padStart(8)}  ${fmt(r.natAcc).padStart(7)}  ${fmt(r.natFlu).padStart(7)}  ${fmt(r.natTerm).padStart(8)}  ${String(r.hardErrors).padStart(7)}  ${fmt(r.opusOverall).padStart(8)}  ${fmt(r.translateUSD, 3).padStart(5)}  ${fmt(r.latency, 1).padStart(5)}`,
  );
}

// agreement check: native rank order vs Opus overall order
const byNat = rows.filter((r) => r.natRank != null).map((r) => r.variant);
const byOpus = [...rows].filter((r) => r.opusOverall != null).sort((a, b) => b.opusOverall - a.opusOverall).map((r) => r.variant);
if (byNat.length && byOpus.length) {
  const agree = JSON.stringify(byNat) === JSON.stringify(byOpus);
  console.log(`\nRanking — native: ${byNat.join(' > ')} | Opus: ${byOpus.join(' > ')} — ${agree ? 'AGREE' : 'DISAGREE (native is ground truth)'}`);
}

// --- write summary -----------------------------------------------------------
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'ingest-summary.json'), JSON.stringify({ lang, reviewedRep, reviewers: [...reviewers], rows }, null, 2));
const md = [
  `# Thinking-eval combined review (${lang}, rep ${reviewedRep})`,
  ``, `Native reviewers: ${[...reviewers].join(', ') || '—'}`, ``,
  `| variant | label | nat-rank | nat-acc | nat-flu | nat-term | hard-err | opus-overall | $tr/file | latency |`,
  `|---|---|--:|--:|--:|--:|--:|--:|--:|--:|`,
  ...rows.map((r) => `| ${r.variant} | ${r.label} | ${fmt(r.natRank)} | ${fmt(r.natAcc)} | ${fmt(r.natFlu)} | ${fmt(r.natTerm)} | ${r.hardErrors} | ${fmt(r.opusOverall)} | ${fmt(r.translateUSD, 3)} | ${fmt(r.latency, 1)} |`),
  ``, `## Reviewer comments`, ``,
  ...rows.flatMap((r) => r.comments.map((c) => `- ${c}`)),
].join('\n');
fs.writeFileSync(path.join(outDir, 'ingest-summary.md'), md + '\n');
console.log(`\nwrote ${path.relative(ROOT, path.join(outDir, 'ingest-summary.md'))} (+ .json) — paste into REPORT.md`);

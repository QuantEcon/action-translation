#!/usr/bin/env node
/**
 * Run the thinking-eval matrix: lectures × languages × variants × reps.
 *
 * For each cell: translate (English → target under the variant's model/thinking),
 * then score the output with the Opus judge (blind — the review prompt never sees
 * the variant). Appends one JSON record per cell to outputs/metrics.jsonl and
 * prints a per-variant/language summary.
 *
 * Prereq: `npm run build:cli` (lib.mjs imports dist/), and ANTHROPIC_API_KEY set.
 *
 * Examples:
 *   node run-matrix.mjs --dry-run
 *   node run-matrix.mjs --langs fr --lectures pv.md --variants A,B,C --reps 1
 *   node run-matrix.mjs                       # core: A–D, both langs, 6 lectures, 2 reps
 *   node run-matrix.mjs --review-only         # re-score existing outputs
 *
 * Flags: --langs, --variants, --lectures, --reps, --out,
 *        --dry-run, --no-review, --review-only, --force
 */
import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import {
  ROOT, SOURCE_DIR, DOCS_FOLDER, VARIANTS, CORE_VARIANTS, DEFAULT_LANGS, DEFAULT_LECTURES,
  MAX_TOKENS_FULL, MAX_TOKENS_REVIEW, REVIEW_MODEL,
  loadGlossary, buildTranslatePrompt, buildReviewPrompt, frTypographyStats, callClaude, costUSD,
} from './lib.mjs';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def;
}
const has = (name) => process.argv.includes(`--${name}`);
const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : null);

const langs = list(arg('langs')) || DEFAULT_LANGS;
const variants = (list(arg('variants')) || CORE_VARIANTS).map((v) => v.toUpperCase());
const lectures = list(arg('lectures')) || DEFAULT_LECTURES;
const reps = parseInt(arg('reps', '2'), 10);
const outDir = path.resolve(arg('out', path.join(ROOT, 'experiments/thinking-sonnet5/outputs')));
const dryRun = has('dry-run');
const doReview = !has('no-review');
const reviewOnly = has('review-only');
const force = has('force');

const unknown = variants.filter((v) => !VARIANTS[v]);
if (unknown.length) { console.error(`Unknown variant(s): ${unknown.join(', ')}. Known: ${Object.keys(VARIANTS).join(',')}`); process.exit(1); }

const cells = [];
for (const lang of langs)
  for (const lecture of lectures)
    for (const v of variants)
      for (let rep = 1; rep <= reps; rep++) cells.push({ lang, lecture, variant: v, rep });

console.log(`Matrix: ${langs.join(',')} × ${lectures.length} lectures × [${variants.join(',')}] × ${reps} rep(s) = ${cells.length} cells`);
console.log(`Review: ${doReview ? `on (${REVIEW_MODEL})` : 'off'}${reviewOnly ? ' [review-only]' : ''}\nOutput: ${outDir}\n`);

if (dryRun) {
  const t = cells.length, r = doReview ? cells.length : 0;
  console.log(`DRY RUN — would make ${t} translation + ${r} review calls.`);
  console.log(`Rough ballpark: ~$${(t * 0.15 + r * 0.1).toFixed(2)} (calibrate by running one cell first).`);
  process.exit(0);
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error('ANTHROPIC_API_KEY not set'); process.exit(1); }
const client = new Anthropic({ apiKey });
fs.mkdirSync(outDir, { recursive: true });
const metricsPath = path.join(outDir, 'metrics.jsonl');

function outFileFor(lang, lecture, variant, rep) {
  const base = lecture.replace(/\.md$/, '');
  const dir = path.join(outDir, lang, base);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${variant}-r${rep}.md`);
}
function parseReviewJson(text) {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  const s = cleaned.indexOf('{'), e = cleaned.lastIndexOf('}');
  if (s < 0 || e < 0) throw new Error('no JSON object in review response');
  return JSON.parse(cleaned.slice(s, e + 1));
}

const summary = {}; // key `${variant}/${lang}` -> {overall:[], cost:[], latency:[]}
const bump = (k, f, val) => { (summary[k] ??= { overall: [], cost: [], latency: [] })[f].push(val); };

for (const [n, cell] of cells.entries()) {
  const { lang, lecture, variant, rep } = cell;
  const V = VARIANTS[variant];
  const tag = `[${n + 1}/${cells.length}] ${lang} ${lecture} ${variant}(${V.label}) r${rep}`;
  const srcPath = path.join(SOURCE_DIR, DOCS_FOLDER, lecture);
  if (!fs.existsSync(srcPath)) { console.warn(`${tag}  SKIP — source not found: ${srcPath}`); continue; }
  const source = fs.readFileSync(srcPath, 'utf-8');
  const glossary = loadGlossary(lang);
  const outFile = outFileFor(lang, lecture, variant, rep);

  const rec = { ts: new Date().toISOString(), lang, lecture, variant, label: V.label, model: V.model, rep };

  try {
    // 1) translate (unless review-only or cached)
    if (reviewOnly || (!force && fs.existsSync(outFile))) {
      if (!fs.existsSync(outFile)) { console.warn(`${tag}  SKIP review — no cached output`); continue; }
    } else {
      const prompt = buildTranslatePrompt(source, lang, glossary);
      const t = await callClaude(client, { model: V.model, thinking: V.thinking, effort: V.effort, maxTokens: MAX_TOKENS_FULL, prompt });
      fs.writeFileSync(outFile, t.text);
      rec.translate = {
        inputTokens: t.usage?.input_tokens ?? 0, outputTokens: t.usage?.output_tokens ?? 0,
        elapsed: t.elapsed, costUSD: +costUSD(V.model, t.usage).toFixed(4),
        stopReason: t.stopReason, incomplete: t.text.includes('INCOMPLETE DOCUMENT'),
        chars: t.text.length, outFile: path.relative(ROOT, outFile),
      };
      bump(`${variant}/${lang}`, 'cost', rec.translate.costUSD);
      bump(`${variant}/${lang}`, 'latency', rec.translate.elapsed);
      console.log(`${tag}  translated ${rec.translate.chars}c ${rec.translate.outputTokens}out ${rec.translate.elapsed}s $${rec.translate.costUSD}${rec.translate.incomplete ? ' ⚠INCOMPLETE' : ''}`);
    }

    // 2) fr typography objective check
    if (lang === 'fr') rec.frTypography = frTypographyStats(fs.readFileSync(outFile, 'utf-8'));

    // 3) Opus review (blind)
    if (doReview) {
      const translation = fs.readFileSync(outFile, 'utf-8');
      const rp = buildReviewPrompt(source, translation, lang, glossary);
      const r = await callClaude(client, { model: REVIEW_MODEL, maxTokens: MAX_TOKENS_REVIEW, prompt: rp });
      const j = parseReviewJson(r.text);
      const overall = +(((j.accuracy + j.fluency + j.terminology + j.formatting) / 4)).toFixed(2);
      rec.review = {
        accuracy: j.accuracy, fluency: j.fluency, terminology: j.terminology, formatting: j.formatting,
        overall, syntaxErrors: (j.syntaxErrors || []).length, elapsed: r.elapsed,
        costUSD: +costUSD(REVIEW_MODEL, r.usage).toFixed(4),
      };
      bump(`${variant}/${lang}`, 'overall', overall);
      console.log(`${tag}  review overall ${overall} (A${j.accuracy}/F${j.fluency}/T${j.terminology}/Fmt${j.formatting}) syntaxErr ${rec.review.syntaxErrors}`);
    }
  } catch (err) {
    rec.error = String(err?.message || err);
    console.error(`${tag}  ERROR: ${rec.error}`);
  }
  fs.appendFileSync(metricsPath, JSON.stringify(rec) + '\n');
}

// --- aggregate summary -------------------------------------------------------
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const fmt = (x, d = 2) => (x == null ? '—' : x.toFixed(d));
console.log(`\n=== Summary (mean per variant × language) ===`);
console.log(`variant/lang            n  overall  $/file  latency`);
for (const k of Object.keys(summary).sort()) {
  const s = summary[k];
  console.log(`${k.padEnd(22)} ${String(s.overall.length).padStart(2)}  ${fmt(mean(s.overall)).padStart(7)}  ${fmt(mean(s.cost), 3).padStart(6)}  ${fmt(mean(s.latency), 1).padStart(6)}s`);
}
console.log(`\nmetrics → ${path.relative(ROOT, metricsPath)}`);
console.log(`Next: anonymize outputs/ into review packets for native review (PLAN §7), then write REPORT.md.`);

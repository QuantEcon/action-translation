#!/usr/bin/env node
/**
 * Propose fr glossary additions from real EN↔FR translations of the programming
 * lectures.
 *
 * For each translated lecture: ask Opus to extract the recurring domain terms and
 * the French rendering actually used. Then, deterministically:
 *   - drop anything already pinned in glossary/fr.json,
 *   - flag DRIFT — the same English term rendered differently across lectures
 *     (direct evidence the term needs pinning),
 *   - rank the rest by how many lectures they appear in.
 *
 * Output: data/glossary-suggestions.{json,md} → review, then open a glossary PR
 * for the native reviewer.
 *
 * Usage (SOURCE_DIR must point at the English corpus):
 *   SOURCE_DIR=~/work/quantecon/lecture-python-programming \
 *     node experiments/fr-glossary-programming/scripts/suggest-glossary.mjs
 * Flags: --lang --outputs --variant --rep --out --model
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };

const lang = arg('lang', 'fr');
const variant = arg('variant', 'A');
const rep = arg('rep', '1');
const outputsDir = path.resolve(arg('outputs', path.join(HERE, 'outputs')));
const outDir = path.resolve(arg('out', path.join(HERE, 'data')));
const MODEL = arg('model', 'claude-opus-4-8');
const home = process.env.HOME || process.env.USERPROFILE;
const SOURCE_DIR = process.env.SOURCE_DIR ? path.resolve(process.env.SOURCE_DIR)
  : home ? path.join(home, 'work/quantecon/lecture-python-programming') : '';
const DOCS_FOLDER = process.env.DOCS_FOLDER || 'lectures';

if (!SOURCE_DIR) { console.error('Set SOURCE_DIR to the English corpus.'); process.exit(1); }
if (!process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY not set'); process.exit(1); }

// --- existing glossary (to filter out already-pinned terms) ------------------
const glossary = JSON.parse(fs.readFileSync(path.join(ROOT, 'glossary', `${lang}.json`), 'utf-8'));
const pinned = new Set(glossary.terms.map((t) => t.en.trim().toLowerCase()));

function buildPrompt(en, fr) {
  return `You are helping build a translation glossary for a Python/scientific-computing lecture series being translated from English to French.

Below is an English lecture and its French translation. Extract the **recurring domain-specific technical terms** that a translator must render **consistently across the whole series**, together with the French rendering actually used in this translation.

Include: programming and scientific-computing vocabulary (data structures, language constructs, library/tooling concepts, numerical-computing terms).
Exclude: generic prose words, code identifiers and API names that stay in English (e.g. \`numpy\`, \`def\`, \`list.append\`), proper nouns, and anything only mentioned once in passing.

For each term give the English term as it appears in prose (singular, lowercase unless a proper noun), the French rendering used, roughly how many times it recurs, and a one-line note if the rendering is uncertain or could reasonably differ.

Respond with ONLY valid JSON (no code fences):
{"terms":[{"en":"...","fr":"...","count":<int>,"note":"..."}]}

## English source
${en}

## French translation
${fr}`;
}

const client = new Anthropic();
const parseJson = (t) => {
  const c = t.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  const s = c.indexOf('{'), e = c.lastIndexOf('}');
  if (s < 0) throw new Error('no JSON in response');
  return JSON.parse(c.slice(s, e + 1));
};

// --- collect per-lecture term proposals --------------------------------------
const langDir = path.join(outputsDir, lang);
if (!fs.existsSync(langDir)) { console.error(`No translations at ${path.relative(ROOT, langDir)} — run the matrix first.`); process.exit(1); }
const lectures = fs.readdirSync(langDir).filter((d) => fs.existsSync(path.join(langDir, d, `${variant}-r${rep}.md`)));
if (!lectures.length) { console.error('No translated lectures found.'); process.exit(1); }
console.log(`Analysing ${lectures.length} lecture(s) with ${MODEL}: ${lectures.join(', ')}\n`);

const byTerm = new Map(); // en(lower) -> { en, renderings: Map<fr, [lectures]>, count, notes[] }
let spend = 0;

for (const base of lectures) {
  const enPath = path.join(SOURCE_DIR, DOCS_FOLDER, `${base}.md`);
  if (!fs.existsSync(enPath)) { console.warn(`skip ${base} — no EN source at ${enPath}`); continue; }
  const en = fs.readFileSync(enPath, 'utf-8');
  const fr = fs.readFileSync(path.join(langDir, base, `${variant}-r${rep}.md`), 'utf-8');

  try {
    const stream = client.messages.stream({
      model: MODEL, max_tokens: 8192,
      messages: [{ role: 'user', content: buildPrompt(en, fr) }],
    });
    const msg = await stream.finalMessage();
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const { terms } = parseJson(text);
    const cost = (msg.usage.input_tokens / 1e6) * 5 + (msg.usage.output_tokens / 1e6) * 25;
    spend += cost;
    console.log(`  ${base}: ${terms.length} terms proposed  ($${cost.toFixed(3)})`);

    for (const t of terms) {
      if (!t?.en || !t?.fr) continue;
      const k = String(t.en).trim().toLowerCase();
      const rec = byTerm.get(k) || { en: String(t.en).trim(), renderings: new Map(), count: 0, notes: [] };
      const frv = String(t.fr).trim();
      rec.renderings.set(frv, [...(rec.renderings.get(frv) || []), base]);
      rec.count += Number(t.count) || 1;
      if (t.note) rec.notes.push(`${base}: ${t.note}`);
      byTerm.set(k, rec);
    }
  } catch (err) {
    console.error(`  ${base}: ERROR ${err.message}`);
  }
}

// --- classify ----------------------------------------------------------------
const rows = [...byTerm.entries()].map(([k, r]) => ({
  key: k, en: r.en,
  alreadyPinned: pinned.has(k),
  renderings: [...r.renderings.entries()].map(([fr, lects]) => ({ fr, lectures: lects })),
  drift: r.renderings.size > 1,
  lectureCount: new Set([...r.renderings.values()].flat()).size,
  count: r.count, notes: r.notes,
}));
const fresh = rows.filter((r) => !r.alreadyPinned);
const drifting = fresh.filter((r) => r.drift).sort((a, b) => b.lectureCount - a.lectureCount);
const stable = fresh.filter((r) => !r.drift).sort((a, b) => b.lectureCount - a.lectureCount || b.count - a.count);

console.log(`\n=== Glossary suggestions (${lang}) ===`);
console.log(`proposed terms: ${rows.length} | already pinned: ${rows.length - fresh.length} | NEW: ${fresh.length}`);
console.log(`  ⚠ DRIFTING (rendered >1 way across lectures — pin these first): ${drifting.length}`);
for (const r of drifting.slice(0, 25)) console.log(`    "${r.en}" → ${r.renderings.map((x) => `"${x.fr}" (${x.lectures.join(',')})`).join('  |  ')}`);
console.log(`  new & consistent (still worth pinning): ${stable.length}`);
for (const r of stable.slice(0, 25)) console.log(`    "${r.en}" → "${r.renderings[0].fr}"  [${r.lectureCount} lecture(s), ~${r.count}×]`);
console.log(`\nOpus spend: $${spend.toFixed(2)}`);

// --- write -------------------------------------------------------------------
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `glossary-suggestions-${variant}.json`), JSON.stringify({ lang, variant, lectures, drifting, stable }, null, 2));
const md = [
  `# fr glossary suggestions — programming lectures`, ``,
  `From real EN↔FR translations of: ${lectures.join(', ')}. Proposed by ${MODEL}; terms already in \`glossary/${lang}.json\` are filtered out.`, ``,
  `## ⚠ Drifting terms (rendered more than one way — pin these first)`, ``,
  drifting.length ? `| en | renderings observed | lectures |\n|---|---|--:|` : `_none_`,
  ...drifting.map((r) => `| ${r.en} | ${r.renderings.map((x) => `\`${x.fr}\` (${x.lectures.join(', ')})`).join(' · ')} | ${r.lectureCount} |`),
  ``, `## New, consistently rendered (worth pinning for the rest of the series)`, ``,
  stable.length ? `| en | fr | lectures | ~count |\n|---|---|--:|--:|` : `_none_`,
  ...stable.map((r) => `| ${r.en} | \`${r.renderings[0].fr}\` | ${r.lectureCount} | ${r.count} |`),
].join('\n');
fs.writeFileSync(path.join(outDir, `glossary-suggestions-${variant}.md`), md + '\n');
console.log(`wrote ${path.relative(ROOT, path.join(outDir, `glossary-suggestions-${variant}.md`))} (+ .json)`);

#!/usr/bin/env node
/**
 * Step 2 of glossary review: for ONE model role, extract the recurring domain
 * terms and the target-language rendering actually used, per lecture.
 *
 * Ask the extract model to read each EN↔target pair and name the terms a
 * translator must render consistently across the series. Then, deterministically:
 *   - drop anything already pinned in glossary/<lang>.json,
 *   - flag DRIFT — the same term rendered >1 way across lectures by this role,
 *   - rank the rest by how many lectures they appear in.
 *
 * Run once per role, then compare-models.mjs does the filtering that matters.
 * On its own this output is far too long to act on (the fr run proposed 176
 * terms); do NOT take it to a reviewer.
 *
 * Usage:
 *   node scripts/glossary/suggest-glossary.mjs --lang fr --role seed \
 *     --source ~/work/quantecon/lecture-python-programming \
 *     --outputs experiments/fr-glossary-programming/outputs
 *
 * Flags: --lang --role --source --outputs --out --model --docs-folder
 */
import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import {
  ROOT, ROLES, EXTRACT_MODEL, arg, resolveSourceDir, docsFolder,
  requireApiKey, loadGlossary, glossaryPath, callClaude, costUSD, parseJsonResponse, languageLabel, langName, rel,
} from './lib.mjs';

const lang = arg('lang');
const role = arg('role', 'seed');
if (!lang) { console.error('--lang is required'); process.exit(1); }
if (!ROLES.includes(role)) { console.error(`--role must be one of: ${ROLES.join(', ')}`); process.exit(1); }
if (!fs.existsSync(glossaryPath(lang))) { console.error(`No glossary/${lang}.json`); process.exit(1); }

const sourceDir = resolveSourceDir();
const folder = docsFolder();
const outputsDir = path.resolve(arg('outputs', path.join(ROOT, `experiments/${lang}-glossary/outputs`)));
const outDir = path.resolve(arg('out', path.join(outputsDir, '..', 'data')));
const model = arg('model', EXTRACT_MODEL);
requireApiKey();

const langLabel = languageLabel(lang);
const glossary = loadGlossary(lang);
const pinned = new Set((glossary?.terms ?? []).map((t) => t.en.trim().toLowerCase()));

function buildPrompt(en, translated) {
  return `You are helping build a translation glossary for a lecture series being translated from English to ${langLabel}.

Below is an English lecture and its ${langLabel} translation. Extract the **recurring domain-specific technical terms** that a translator must render **consistently across the whole series**, together with the ${langLabel} rendering actually used in this translation.

Include: subject-matter vocabulary of this series — the concepts, constructs and named quantities a reader must recognise from lecture to lecture.
Exclude: generic prose words, code identifiers and API names that stay in English (e.g. \`numpy\`, \`def\`, \`list.append\`), proper nouns, and anything only mentioned once in passing.

For each term give the English term as it appears in prose (singular, lowercase unless a proper noun), the ${langLabel} rendering used, roughly how many times it recurs, and a one-line note if the rendering is uncertain or could reasonably differ.

Respond with ONLY valid JSON (no code fences):
{"terms":[{"en":"...","target":"...","count":<int>,"note":"..."}]}

## English source
${en}

## ${langLabel} translation
${translated}`;
}

const langDir = path.join(outputsDir, lang);
if (!fs.existsSync(langDir)) { console.error(`No translations at ${rel(langDir)} — run translate-sample.mjs first.`); process.exit(1); }
const lectures = fs.readdirSync(langDir).filter((d) => fs.existsSync(path.join(langDir, d, `${role}.md`)));
if (!lectures.length) { console.error(`No ${role}.md outputs found under ${rel(langDir)}.`); process.exit(1); }

console.log(`Extracting ${langName(lang)} terms — role: ${role}, model: ${model}`);
console.log(`Lectures (${lectures.length}): ${lectures.join(', ')}\n`);

const client = new Anthropic();
const byTerm = new Map();
const extracted = []; // lectures whose terms are in the output
const failed = []; // { lecture, stopReason, category[, error] } — no terms are taken from these
let spend = 0;

for (const base of lectures) {
  const enPath = path.join(sourceDir, folder, `${base}.md`);
  if (!fs.existsSync(enPath)) { console.warn(`skip ${base} — no EN source at ${enPath}`); continue; }
  const en = fs.readFileSync(enPath, 'utf-8');
  const translated = fs.readFileSync(path.join(langDir, base, `${role}.md`), 'utf-8');

  let r, cost = 0;
  try {
    r = await callClaude(client, { model, operation: 'analysis', prompt: buildPrompt(en, translated) });
    cost = costUSD(model, r.usage); // billed whether or not the lecture is usable
    spend += cost;
    if (r.stopReason !== 'end_turn') {
      // A refusal or a max_tokens stop can still carry partial JSON, and the terms parsed
      // from it would pass for the lecture's full set.
      const category = r.stopDetails?.category ?? null;
      console.error(`  ✗ ${base}: stop_reason=${r.stopReason}${category ? ` category=${category}` : ''}  ($${cost.toFixed(3)})`);
      failed.push({ lecture: base, stopReason: r.stopReason, category });
      continue;
    }
    const { terms } = parseJsonResponse(r.text);
    if (!Array.isArray(terms)) throw new Error('response JSON has no "terms" array');
    console.log(`  ${base}: ${terms.length} terms proposed  ($${cost.toFixed(3)})`);

    for (const t of terms) {
      const target = t?.target ?? t?.fr ?? t?.[lang]; // tolerate a stray key from the model
      if (!t?.en || !target) continue;
      const k = String(t.en).trim().toLowerCase();
      const rec = byTerm.get(k) || { en: String(t.en).trim(), renderings: new Map(), count: 0, notes: [] };
      const v = String(target).trim();
      rec.renderings.set(v, [...(rec.renderings.get(v) || []), base]);
      rec.count += Number(t.count) || 1;
      if (t.note) rec.notes.push(`${base}: ${t.note}`);
      byTerm.set(k, rec);
    }
    extracted.push(base);
  } catch (err) {
    // An API error (r unset) or a response that is not the expected JSON (r.stopReason 'end_turn').
    console.error(`  ✗ ${base}: ERROR ${err.message}${r ? `  ($${cost.toFixed(3)})` : ''}`);
    failed.push({ lecture: base, stopReason: r?.stopReason ?? null, category: null, error: err.message });
  }
}

const rows = [...byTerm.entries()].map(([k, r]) => ({
  key: k, en: r.en,
  alreadyPinned: pinned.has(k),
  renderings: [...r.renderings.entries()].map(([target, lects]) => ({ target, lectures: lects })),
  drift: r.renderings.size > 1,
  lectureCount: new Set([...r.renderings.values()].flat()).size,
  count: r.count, notes: r.notes,
}));
const fresh = rows.filter((r) => !r.alreadyPinned);
const drifting = fresh.filter((r) => r.drift).sort((a, b) => b.lectureCount - a.lectureCount);
const stable = fresh.filter((r) => !r.drift).sort((a, b) => b.lectureCount - a.lectureCount || b.count - a.count);

console.log(`\n=== ${langName(lang)} (${lang}) / ${role} ===`);
console.log(`proposed: ${rows.length} | already pinned: ${rows.length - fresh.length} | new: ${fresh.length}`);
console.log(`  drifting within this role: ${drifting.length}`);
for (const r of drifting.slice(0, 25)) console.log(`    "${r.en}" → ${r.renderings.map((x) => `"${x.target}" (${x.lectures.join(',')})`).join('  |  ')}`);
console.log(`\nGlossary domain gap: ${rows.length - fresh.length}/${rows.length} proposed terms are already pinned.`);
console.log(`Extract spend: $${spend.toFixed(2)}`);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `glossary-suggestions-${role}.json`),
  JSON.stringify({ lang, role, model, lectures: extracted, failed, drifting, stable }, null, 2));
console.log(`wrote ${rel(path.join(outDir, `glossary-suggestions-${role}.json`))}`);
if (failed.length) {
  console.error(`\n✗ ${failed.length} lecture(s) failed and are missing from that file: ${failed.map((f) => f.lecture).join(', ')}`);
  console.error(`compare-models cannot see variation in a lecture that was never extracted; rerun this role before comparing.`);
  process.exit(1);
}
console.log(`\nNext: run the other role, then\n  node scripts/glossary/compare-models.mjs --lang ${lang} --data ${rel(outDir)}`);

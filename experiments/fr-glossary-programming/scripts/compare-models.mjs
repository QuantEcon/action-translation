#!/usr/bin/env node
/**
 * Build the LEAN glossary candidate list: keep only terms showing VARIATION.
 *
 * Two independent variation signals:
 *   1. cross-lecture drift  — one model rendered a term >1 way across lectures
 *   2. cross-model disagreement — Sonnet 5 and Opus 4.8 rendered it differently
 *
 * A term rendered identically by both models across every lecture (e.g.
 * "function" → "fonction", ~67×) needs NO glossary entry — the models already
 * agree, and every pinned term costs input tokens in every translation prompt
 * forever. Those are dropped, and counted so you can see the filter's effect.
 *
 * Usage:
 *   node experiments/fr-glossary-programming/scripts/compare-models.mjs [--a A] [--b O]
 * Output: data/glossary-candidates.{json,md} → the shortlist to put to the
 * native reviewer, who makes the final call on each.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(HERE, '../..');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };

const vA = arg('a', 'A'), vB = arg('b', 'O');
const dataDir = path.join(HERE, 'data');
const load = (v) => {
  const p = path.join(dataDir, `glossary-suggestions-${v}.json`);
  if (!fs.existsSync(p)) { console.error(`Missing ${path.relative(ROOT, p)} — run suggest-glossary.mjs --variant ${v} first.`); process.exit(1); }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
};

const A = load(vA), B = load(vB);
const labelA = `${vA} (sonnet-5)`, labelB = `${vB} (opus-4-8)`;
const index = (s) => new Map([...s.drifting, ...s.stable].map((r) => [r.key, r]));
const ia = index(A), ib = index(B);

// normalise a rendering for comparison: lowercase, trim, drop leading article/quotes
const norm = (s) => String(s).toLowerCase().trim().replace(/^(le |la |les |l')/, '').replace(/^["'`]|["'`]$/g, '');

const rows = [];
let consistent = 0;
for (const key of new Set([...ia.keys(), ...ib.keys()])) {
  const a = ia.get(key), b = ib.get(key);
  const aR = [...new Set((a?.renderings || []).map((x) => norm(x.fr)))];
  const bR = [...new Set((b?.renderings || []).map((x) => norm(x.fr)))];

  const driftWithin = Boolean(a?.drift || b?.drift);
  const bothSeen = aR.length > 0 && bR.length > 0;
  const crossModel = bothSeen && (aR.some((x) => !bR.includes(x)) || bR.some((x) => !aR.includes(x)));

  if (!driftWithin && !crossModel && bothSeen) { consistent++; continue; } // agreed everywhere → don't pin

  const evidence = [driftWithin && 'cross-lecture drift', crossModel && 'cross-model disagreement',
    !bothSeen && `only seen by ${aR.length ? labelA : labelB}`].filter(Boolean);

  rows.push({
    key, en: (a || b).en,
    sonnet: (a?.renderings || []).map((x) => x.fr),
    opus: (b?.renderings || []).map((x) => x.fr),
    evidence,
    strength: (driftWithin ? 2 : 0) + (crossModel ? 2 : 0) + (bothSeen ? 1 : 0),
    count: (a?.count || 0) + (b?.count || 0),
    lectures: Math.max(a?.lectureCount || 0, b?.lectureCount || 0),
    notes: [...(a?.notes || []), ...(b?.notes || [])],
  });
}
rows.sort((x, y) => y.strength - x.strength || y.count - x.count);

const strong = rows.filter((r) => r.evidence.some((e) => e.includes('drift') || e.includes('disagreement')));
const weak = rows.filter((r) => !strong.includes(r));

console.log(`\n=== Lean glossary candidates (variation-driven) ===`);
console.log(`${labelA} terms: ${ia.size} | ${labelB} terms: ${ib.size}`);
console.log(`DROPPED as consistent across both models (no pinning needed): ${consistent}`);
console.log(`\n⚠ CANDIDATES with real variation: ${strong.length}`);
for (const r of strong) {
  console.log(`  "${r.en}"  [${r.evidence.join(' + ')}]`);
  console.log(`      sonnet-5: ${r.sonnet.map((s) => `"${s}"`).join(', ') || '—'}`);
  console.log(`      opus-4-8: ${r.opus.map((s) => `"${s}"`).join(', ') || '—'}`);
}
console.log(`\nseen by only one model (lower confidence): ${weak.length}`);

fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, 'glossary-candidates.json'), JSON.stringify({ labelA, labelB, droppedConsistent: consistent, strong, weak }, null, 2));
const md = [
  `# fr glossary candidates — variation-driven shortlist`, ``,
  `Only terms showing **variation** are proposed. Terms both models rendered identically everywhere are dropped — they need no entry, and every pinned term costs input tokens in **every** translation prompt.`, ``,
  `- ${labelA} proposed: ${ia.size} · ${labelB} proposed: ${ib.size}`,
  `- **dropped as consistent across both models: ${consistent}**`,
  `- **candidates with real variation: ${strong.length}**`, ``,
  `## Candidates (native reviewer decides each)`, ``,
  `| en | sonnet-5 | opus-4-8 | evidence | ~count |`,
  `|---|---|---|---|--:|`,
  ...strong.map((r) => `| **${r.en}** | ${r.sonnet.map((s) => `\`${s}\``).join(' · ') || '—'} | ${r.opus.map((s) => `\`${s}\``).join(' · ') || '—'} | ${r.evidence.join('; ')} | ${r.count} |`),
  ``, `## Seen by only one model (lower confidence)`, ``,
  `| en | sonnet-5 | opus-4-8 | ~count |`, `|---|---|---|--:|`,
  ...weak.slice(0, 60).map((r) => `| ${r.en} | ${r.sonnet.map((s) => `\`${s}\``).join(' · ') || '—'} | ${r.opus.map((s) => `\`${s}\``).join(' · ') || '—'} | ${r.count} |`),
].join('\n');
fs.writeFileSync(path.join(dataDir, 'glossary-candidates.md'), md + '\n');
console.log(`\nwrote ${path.relative(ROOT, path.join(dataDir, 'glossary-candidates.md'))} (+ .json)`);

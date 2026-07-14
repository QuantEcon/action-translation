#!/usr/bin/env node
/**
 * Step 3 of glossary review: build the LEAN candidate shortlist — keep ONLY
 * terms showing VARIATION.
 *
 * Two variation signals:
 *   1. cross-lecture drift      — one role rendered a term >1 way across lectures
 *   2. cross-model disagreement — seed and probe rendered it differently
 *
 * A term rendered identically by both roles across every lecture (e.g.
 * "function" → "fonction", ~67×) needs NO glossary entry — the models already
 * agree, and every pinned term costs input tokens in every translation prompt
 * forever. Those are dropped, and counted so the filter's effect is visible.
 *
 * The output is a SHORTLIST, not a decision. Assess it by hand before taking it
 * to a native reviewer — the mechanical filter cannot tell a real semantic
 * disagreement from a singular/plural or article difference. See
 * .claude/skills/glossary-review/SKILL.md for the assessment criteria.
 *
 * Usage:
 *   node scripts/glossary/compare-models.mjs --lang fr --data experiments/fr-glossary-programming/data
 *
 * Flags: --lang --data --out
 */
import * as fs from 'fs';
import * as path from 'path';
import { ROOT, arg, langName, rel } from './lib.mjs';

const lang = arg('lang');
if (!lang) { console.error('--lang is required'); process.exit(1); }
const dataDir = path.resolve(arg('data', path.join(ROOT, `experiments/${lang}-glossary/data`)));
const outDir = path.resolve(arg('out', dataDir));

const load = (role) => {
  const p = path.join(dataDir, `glossary-suggestions-${role}.json`);
  if (!fs.existsSync(p)) {
    console.error(`Missing ${rel(p)} — run suggest-glossary.mjs --role ${role} first.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
};
const seed = load('seed'), probe = load('probe');
const labelSeed = `seed (${seed.model ?? '?'})`, labelProbe = `probe (${probe.model ?? '?'})`;

// Normalise a rendering before comparing, so "le tableau" vs "tableau" is not
// counted as disagreement. Articles are language-specific; languages without
// articles (zh-cn, ja, fa, ml, hi) fall through to the no-op default.
const ARTICLES = {
  fr: /^(le |la |les |l'|un |une |des )/,
  es: /^(el |la |los |las |un |una |unos |unas )/,
  de: /^(der |die |das |ein |eine )/,
};
const stripArticle = ARTICLES[lang];
const norm = (s) => {
  let v = String(s).toLowerCase().trim().replace(/^["'`]|["'`]$/g, '');
  if (stripArticle) v = v.replace(stripArticle, '');
  return v.trim();
};

const index = (s) => new Map([...s.drifting, ...s.stable].map((r) => [r.key, r]));
const iSeed = index(seed), iProbe = index(probe);
const rendered = (r) => (r?.renderings || []).map((x) => x.target ?? x.fr);

const rows = [];
let consistent = 0;
for (const key of new Set([...iSeed.keys(), ...iProbe.keys()])) {
  const a = iSeed.get(key), b = iProbe.get(key);
  const aR = [...new Set(rendered(a).map(norm))];
  const bR = [...new Set(rendered(b).map(norm))];

  const driftWithin = Boolean(a?.drift || b?.drift);
  const bothSeen = aR.length > 0 && bR.length > 0;
  const crossModel = bothSeen && (aR.some((x) => !bR.includes(x)) || bR.some((x) => !aR.includes(x)));

  if (!driftWithin && !crossModel && bothSeen) { consistent++; continue; } // agreed everywhere → don't pin

  const evidence = [
    driftWithin && 'cross-lecture drift',
    crossModel && 'cross-model disagreement',
    !bothSeen && `only seen by ${aR.length ? labelSeed : labelProbe}`,
  ].filter(Boolean);

  rows.push({
    key, en: (a || b).en,
    seed: rendered(a), probe: rendered(b),
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

console.log(`\n=== ${langName(lang)} (${lang}) — lean glossary candidates ===`);
console.log(`${labelSeed}: ${iSeed.size} terms | ${labelProbe}: ${iProbe.size} terms`);
console.log(`DROPPED as consistent across both roles (no pinning needed): ${consistent}`);
console.log(`\nCANDIDATES with real variation: ${strong.length}`);
for (const r of strong) {
  console.log(`  "${r.en}"  [${r.evidence.join(' + ')}]`);
  console.log(`      seed : ${r.seed.map((s) => `"${s}"`).join(', ') || '—'}`);
  console.log(`      probe: ${r.probe.map((s) => `"${s}"`).join(', ') || '—'}`);
}
console.log(`\nseen by only one role (lower confidence): ${weak.length}`);

// This count is an INPUT to the review-mechanism decision, not the decision. It is
// also PRE-assessment — hand assessment removes more (fr: 11 → 8). The mechanism
// turns on the KIND of question (answerable from a table vs needing rendered
// context; correctness vs preference ranking), which no count can tell you. The
// fr run sent 11 candidates to a PR precisely because all 11 were table questions.
// See .claude/skills/glossary-review/SKILL.md step 5.
console.log(`\n--- Next step ---`);
if (strong.length === 0) {
  console.log(`No variation found. Either the glossary already covers this series, or the sample is too small.`);
} else {
  console.log(`Assess these ${strong.length} by hand (drop singular/plural, article/preposition-only,`);
  console.log(`trivially compositional, and context-dependent terms), then recommend a review`);
  console.log(`mechanism to the user and agree it before building anything.`);
  if (strong.length > 15) console.log(`\nNote: ${strong.length} is high — check whether one lecture is dominating the sample.`);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'glossary-candidates.json'),
  JSON.stringify({ lang, labelSeed, labelProbe, droppedConsistent: consistent, strong, weak }, null, 2));
const md = [
  `# ${lang} glossary candidates — variation-driven shortlist`, ``,
  `Only terms showing **variation** are proposed. Terms both models rendered identically everywhere are dropped — they need no entry, and every pinned term costs input tokens in **every** translation prompt.`, ``,
  `- ${labelSeed} proposed: ${iSeed.size} · ${labelProbe} proposed: ${iProbe.size}`,
  `- **dropped as consistent across both models: ${consistent}**`,
  `- **candidates with real variation: ${strong.length}**`, ``,
  `## Candidates (assess by hand, then the native reviewer decides each)`, ``,
  `| en | ${labelSeed} | ${labelProbe} | evidence | ~count |`,
  `|---|---|---|---|--:|`,
  ...strong.map((r) => `| **${r.en}** | ${r.seed.map((s) => `\`${s}\``).join(' · ') || '—'} | ${r.probe.map((s) => `\`${s}\``).join(' · ') || '—'} | ${r.evidence.join('; ')} | ${r.count} |`),
  ``, `## Seen by only one model (lower confidence)`, ``,
  `| en | ${labelSeed} | ${labelProbe} | ~count |`, `|---|---|---|--:|`,
  ...weak.slice(0, 60).map((r) => `| ${r.en} | ${r.seed.map((s) => `\`${s}\``).join(' · ') || '—'} | ${r.probe.map((s) => `\`${s}\``).join(' · ') || '—'} | ${r.count} |`),
].join('\n');
fs.writeFileSync(path.join(outDir, 'glossary-candidates.md'), md + '\n');
console.log(`\nwrote ${rel(path.join(outDir, 'glossary-candidates.md'))} (+ .json)`);

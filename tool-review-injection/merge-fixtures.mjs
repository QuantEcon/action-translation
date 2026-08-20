#!/usr/bin/env node
/**
 * Turn the crafting workflow's output into `fixtures/fixtures.json`.
 *
 *   node merge-fixtures.mjs <path-to-workflow-result.json>
 *
 * The workflow returns `{accepted, rejected}`. Everything rejected by the
 * adversarial verifier is recorded, not dropped silently (pre-registered rule
 * 8), and two mechanical repairs are applied here rather than asked of the
 * crafting agents:
 *
 *  - `extraFiles` for any variant that introduces a `:load:` include, since the
 *    file it points at has to exist on the branch or the fixture is testing a
 *    broken build rather than an untranslated include.
 *  - de-duplication of ids, which collide across independently-run class agents.
 */

import fs from 'node:fs';
import path from 'node:path';
import { HERE } from './lib.mjs';

const src = process.argv[2];
if (!src) { console.error('usage: node merge-fixtures.mjs <result.json>'); process.exit(2); }
const result = JSON.parse(fs.readFileSync(src, 'utf-8'));
const accepted = result.accepted || [];
const rejected = result.rejected || [];

const LOAD_RE = /:load:\s*(\S+)/;

/** The English-comment module a `:load:` variant points at. Its comments stay
 *  English on purpose — that IS the defect the fixture injects. */
const IO_TABLE_PY = `# Build the labelled input-output table for the three-sector economy
import numpy as np
import pandas as pd

input_output = np.array([
    [0.2, 0.3, 0.1],  # Agriculture inputs
    [0.3, 0.2, 0.2],  # Manufacturing inputs
    [0.1, 0.2, 0.3]   # Services inputs
])

# Final demand vector (in billions)
final_demand = np.array([100, 150, 200])

# Calculate total output using Leontief inverse: x = (I - A)^{-1} * d
I = np.eye(3)
leontief_inverse = np.linalg.inv(I - input_output)
total_output = leontief_inverse @ final_demand

print("Input-Output Matrix:")
print(input_output)
print("\\nLeontief Inverse:")
print(np.round(leontief_inverse, 3))
print("\\nTotal Output Required (billions):")
print(np.round(total_output, 2))

# Label the same matrix so the axes carry economic meaning
sectors = ['Agriculture', 'Manufacturing', 'Services']
io_table = pd.DataFrame(input_output, index=sectors, columns=sectors)
io_table.index.name = 'using_sector'
io_table.columns.name = 'supplying_sector'
print(io_table)
`;

/**
 * Tier each variant by defect class.
 *
 * The four tiers answer different questions and must never be pooled into one
 * headline rate: M0 core is "can the reviewer catch what no script can";
 * deterministic controls are "is the model at least not worse than a script we
 * should write anyway"; negative controls are false-positive measurement; and
 * the regression classes are structure-preservation insurance whose pre-engine
 * volume must not drive priorities.
 */
const M0_CORE = new Set([
  'meaning-error-or-garbled-syntax',
  'mistranslated-technical-term',
  'math-content-corrupted',
  'content-dropped-from-source',
  'sentence-or-list-order-scrambled',
  'over-translation-of-identifiers',
  'shared-include-file-untranslated',
  'cjk-font-block ordering',
  'de-localisation (sync path)',
]);
const DETERMINISTIC = new Set([
  'untranslated-text-left',
  'blank-line-breaks-math',
  'missing-space-at-cjk-inline-math',
  'ascii-punctuation-in-cjk-prose',
  'emphasis-markup-broken-in-cjk',
  'greek-glyph-tofu-in-figure-labels',
  'half-translated-hybrid-token',
  'duplicated-line',
  'label-anchor-integrity',
  'leftover-scaffolding-artifact',
]);
const REGRESSION = new Set([
  'sentence-fragmentation',
  'blank-line-inside-math',
  'math-markup-lost',
  'list-structure-broken',
  'code-cell-legacy-syntax',
]);

function tierOf(cls) {
  if (/^negative-control/.test(cls)) return 'negative-controls';
  if (M0_CORE.has(cls)) return 'm0-core';
  if (DETERMINISTIC.has(cls)) return 'deterministic-controls';
  if (REGRESSION.has(cls)) return 'regression-classes';
  return 'unclassified';
}

const seen = new Map();
const out = [];
for (const v of accepted) {
  // Always derived from the defect class, never inherited. Variants the
  // verifier returned as `fixed` echo back the crafting agent's own group key
  // ('meaning-error', 'math-corrupted', …), which is a prompt label rather than
  // a tier — trusting it would split one tier across a dozen names and, worse,
  // drop negative controls into the injection tier, scoring a required
  // non-finding as a missed catch.
  v.group = tierOf(v.defectClass);
  // Some agents answered with the fixture's filename (`A.zh.lecture.md`) rather
  // than the document path the PR commits to (`lecture.md`). Same document,
  // different name for it; normalise rather than reject a sound fixture over a
  // naming ambiguity in the brief.
  v.file = String(v.file || '').replace(/^[A-E]\.(?:zh|src)\./, '');
  let id = v.id;
  if (seen.has(id)) {
    const n = seen.get(id) + 1;
    seen.set(id, n);
    id = `${id}-${n}`;
  } else {
    seen.set(id, 1);
  }

  const extraFiles = [];
  for (const e of v.edits || []) {
    const m = LOAD_RE.exec(e.replace || '');
    if (m) extraFiles.push({ path: m[1], content: IO_TABLE_PY });
  }

  out.push({ ...v, id, extraFiles, tier: v.group });
}

fs.writeFileSync(path.join(HERE, 'fixtures', 'fixtures.json'), JSON.stringify(out, null, 2) + '\n', 'utf-8');
fs.writeFileSync(
  path.join(HERE, 'fixtures', 'rejected.json'),
  JSON.stringify(rejected, null, 2) + '\n',
  'utf-8'
);

const byTier = {}; const byClass = {};
for (const v of out) { byClass[v.defectClass] = (byClass[v.defectClass] || 0) + 1; byTier[v.tier] = (byTier[v.tier] || 0) + 1; }
console.log(`accepted ${out.length} variant(s) across ${Object.keys(byClass).length} class(es)`);
for (const [k, n] of Object.entries(byTier).sort()) console.log(`  tier ${k}: ${n}`);
for (const [k, n] of Object.entries(byClass).sort()) console.log(`  ${n}  ${k}`);
const withExtras = out.filter((v) => v.extraFiles.length);
if (withExtras.length) console.log(`  ${withExtras.length} variant(s) carry an extra file: ${withExtras.map((v) => v.id).join(', ')}`);
if (rejected.length) {
  console.log(`\nrejected ${rejected.length} by the adversarial verifier:`);
  for (const r of rejected) console.log(`  - ${r.id}: ${(r.why || '').slice(0, 160)}`);
}

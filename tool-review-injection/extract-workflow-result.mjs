#!/usr/bin/env node
/**
 * Pull a workflow's return value out of its journal.
 *
 *   node extract-workflow-result.mjs <transcriptDir> <out.json>
 *
 * The journal records one row per agent result; the workflow's own return value
 * is the last row that is neither a per-agent `variants` payload nor a per-agent
 * `verdict` payload. Reconstructing from the agent rows is the fallback when the
 * return row is absent (a workflow killed mid-flight still leaves every agent
 * result behind, and those are the expensive part).
 */

import fs from 'node:fs';
import path from 'node:path';

const [, , dir, out] = process.argv;
if (!dir || !out) {
  console.error('usage: node extract-workflow-result.mjs <transcriptDir> <out.json>');
  process.exit(2);
}

const rows = fs
  .readFileSync(path.join(dir, 'journal.jsonl'), 'utf-8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l))
  .filter((o) => o.type === 'result')
  .map((o) => o.result ?? o.value ?? {});

const returnRow = [...rows].reverse().find(
  (r) => r && typeof r === 'object' && ('accepted' in r || 'rejected' in r)
);

if (returnRow) {
  fs.writeFileSync(out, JSON.stringify(returnRow, null, 2), 'utf-8');
  console.log(`workflow return value: ${(returnRow.accepted || []).length} accepted, ${(returnRow.rejected || []).length} rejected`);
  process.exit(0);
}

// Fallback: rebuild from the agent rows.
const crafted = rows.filter((r) => r && Array.isArray(r.variants)).flatMap((r) => r.variants);
const reviews = rows.filter((r) => r && typeof r.verdict === 'string' && Array.isArray(r.reasons));
const byId = new Map(reviews.map((r) => [r.id, r]));

const accepted = [];
const rejected = [];
for (const v of crafted) {
  const rev = byId.get(v.id);
  if (!rev) { rejected.push({ id: v.id, why: 'no verifier result recorded' }); continue; }
  if (rev.verdict === 'reject') { rejected.push({ id: v.id, why: (rev.reasons || []).join(' | ') }); continue; }
  const merged = rev.verdict === 'fixed' && rev.fixed ? { ...v, ...rev.fixed } : v;
  accepted.push({ ...merged, verifierVerdict: rev.verdict, verifierReasons: rev.reasons });
}

fs.writeFileSync(out, JSON.stringify({ accepted, rejected }, null, 2), 'utf-8');
console.log(
  `reconstructed from agent rows: ${crafted.length} crafted, ${reviews.length} verified → ` +
    `${accepted.length} accepted, ${rejected.length} rejected`
);

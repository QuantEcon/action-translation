#!/usr/bin/env node
/**
 * Prepare the blind attribution adjudication.
 *
 * Pre-registered rule 1: a gating finding counts as a catch only if it points
 * at the INJECTED defect. Firing on something else in the same document is not
 * a catch.
 *
 * Attribution is adjudicated over **every** finding in the review, indexed into
 * `verdict.findings`, and NOT over the subset that happens to gate. Two reasons,
 * both learned the hard way:
 *
 *  - the gating rule is a scoring decision, and it changed once already during
 *    this build (blocker/major gate in every category, not only the gating
 *    ones); attribution keyed on a filtered subset silently re-indexes when
 *    that rule moves, which mislabels every judgement after the first change;
 *  - "detected but filed below the gate" is a distinct outcome the margin
 *    analysis needs, and it can only be seen by adjudicating non-gating
 *    findings too.
 *
 * The tasks deliberately carry no verdict, no scores, no recommendation and no
 * routing: an adjudicator that could see the outcome could infer the answer it
 * is being asked to supply.
 */

import fs from 'node:fs';
import path from 'node:path';
import { runDir, loadState } from './lib.mjs';

const RUN_ID = process.env.RUN_ID || 'm0';
const dir = runDir(RUN_ID);
const state = loadState(RUN_ID);
const fixtureById = Object.fromEntries(state.fixtures.map((f) => [f.id, f]));

const rows = fs
  .readFileSync(path.join(dir, 'verdicts.jsonl'), 'utf-8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));

const tasks = [];
for (const r of rows) {
  // A run that died posted no verdict, so there is nothing to attribute. It is
  // still scored (as a non-catch that routes to `editor`), just not here.
  if (r.unparseable || r.reviewFailed) continue;
  if (r.kind !== 'injection') continue;
  const f = fixtureById[r.fixtureId] || {};
  tasks.push({
    key: `${r.fixtureId}#${r.replicate}`,
    fixtureId: r.fixtureId,
    defectClass: f.defectClass,
    recipe: f.recipe,
    groundTruth: f.groundTruth,
    defectMarker: f.defectMarker,
    site: f.site,
    file: f.file,
    // Index is the position in verdict.findings — stable regardless of how the
    // gating rule is defined at scoring time. Severity and category are shown
    // because they are part of what the finding SAYS, but the adjudicator is
    // not told which of them gate.
    findings: (r.verdict.findings || []).map((g, i) => ({
      index: i,
      severity: g.severity,
      category: g.category,
      location: g.location,
      description: g.description,
      suggestion: g.suggestion,
    })),
  });
}

fs.writeFileSync(path.join(dir, 'attribution-input.json'), JSON.stringify(tasks, null, 2), 'utf-8');
console.log(`${tasks.length} adjudication task(s) → ${path.join(dir, 'attribution-input.json')}`);
console.log(`  ${tasks.filter((t) => t.findings.length === 0).length} review(s) raised no findings at all`);
console.log(`  ${new Set(tasks.map((t) => t.fixtureId)).size} distinct fixture(s)`);

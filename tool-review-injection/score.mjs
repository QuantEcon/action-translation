#!/usr/bin/env node
/**
 * Scoring for the injected-defect certification.
 *
 * Reads `runs/<RUN_ID>/verdicts.jsonl` plus an optional
 * `runs/<RUN_ID>/attribution.json` (produced by the blind adjudication pass)
 * and emits the three measurements the tracker asks for: per-class catch rate
 * on the operative surface, severity-margin consistency, and false-positive
 * rate on the negative controls.
 *
 * Pre-registered rules this implements (README, "Pre-registered analysis
 * rules") — a gating finding counts only when attributed to the injection;
 * rates carry Wilson intervals; nothing is silently dropped.
 */

import fs from 'node:fs';
import path from 'node:path';
import { HERE, runDir, loadState, isGatingFinding, surfaces } from './lib.mjs';

const RUN_ID = process.env.RUN_ID || 'm0';
const dir = runDir(RUN_ID);

const rawRows = fs
  .readFileSync(path.join(dir, 'verdicts.jsonl'), 'utf-8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));

/**
 * Identity of the review a row describes, for de-duplication.
 *
 * Two capture processes running concurrently can each load state, each see a
 * review as uncaptured, and each append it — the append is not atomic across
 * processes, and it happened once in the 2026-08-20 run.
 *
 * Every row shape needs a key, not just the ones carrying a verdict. A row with
 * no verdict is exactly the row a duplicate is hardest to notice on, because it
 * contributes to the denominator without contributing a finding to look at:
 *
 *  - a normal row is the review at `reviewedHeadSha`;
 *  - a `reviewFailed` row is the run that died at `headSha`;
 *  - an `unparseable` row is the comment revision at `commentUpdatedAt`.
 *
 * Falling back to `fixtureId#replicate` as a last resort is deliberate: the
 * replicate counter is assigned from `captured.length`, so two racing processes
 * can produce the same value — which is what makes it a de-dup key rather than
 * a reason to keep both.
 */
function reviewIdentity(r) {
  const sha = r.verdict?.reviewedHeadSha || r.headSha;
  if (sha) return `${r.fixtureId}@${sha}`;
  if (r.commentUpdatedAt) return `${r.fixtureId}@comment:${r.commentUpdatedAt}`;
  return `${r.fixtureId}#${r.replicate}`;
}

const seenHead = new Set();
const duplicates = [];
const rows = rawRows.filter((r) => {
  const key = reviewIdentity(r);
  if (seenHead.has(key)) { duplicates.push(key); return false; }
  seenHead.add(key);
  return true;
});

const attribution = fs.existsSync(path.join(dir, 'attribution.json'))
  ? JSON.parse(fs.readFileSync(path.join(dir, 'attribution.json'), 'utf-8'))
  : {};

const state = loadState(RUN_ID);
// Tier is joined from the fixture set rather than read off the verdict rows:
// the rows are appended over the life of a run, and a field added to the runner
// mid-run would be present on late rows and absent on early ones — which would
// silently split one tier in two.
const crafted = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'fixtures.json'), 'utf-8'));
const tierById = Object.fromEntries(crafted.map((v) => [v.id, v.tier]));
const fixtureById = Object.fromEntries(
  state.fixtures.map((f) => [f.id, { ...f, tier: f.tier || tierById[f.id] || (f.kind === 'control' ? 'clean-controls' : 'unclassified') }])
);

/** Wilson score interval — small-n honest, unlike the normal approximation. */
function wilson(k, n, z = 1.96) {
  if (n === 0) return [0, 1];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - s) / d), Math.min(1, (c + s) / d)];
}
const pct = (x) => `${(x * 100).toFixed(0)}%`;
const ci = (k, n) => { const [lo, hi] = wilson(k, n); return `[${pct(lo)}, ${pct(hi)}]`; };

// ---------------------------------------------------------------------------
// per-review scoring
// ---------------------------------------------------------------------------

/** Background signature of the site's clean control — rule 2. */
const controlSignatures = {};
for (const r of rows) {
  if (fixtureById[r.fixtureId]?.kind !== 'control' || r.unparseable || r.reviewFailed) continue;
  const site = fixtureById[r.fixtureId]?.site ?? r.site;
  controlSignatures[site] = controlSignatures[site] || [];
  controlSignatures[site].push(surfaces(r.verdict).signature);
}

const scored = rows.map((r) => {
  if (r.unparseable || r.reviewFailed) {
    // Rule 8: a block that would not parse, and a run that died before posting
    // one, are both fail-closed data — not dropped rows. Neither is a catch:
    // no finding fired. Both route to `editor` because a consumer with no
    // verdict must treat it that way, which is the safe outcome and also the
    // reason a reliability failure is not a safety failure.
    return { ...r, caught: false, attributed: false, routed: true };
  }
  // Recomputed from the verdict, never read from the stored row: `surfaces`
  // was serialised at capture time under whatever gating rule was current
  // then, and that rule was corrected mid-build. Deriving it here means the
  // report can never mix two definitions.
  const s = surfaces(r.verdict);
  const key = `${r.fixtureId}#${r.replicate}`;
  const att = attribution[key] ?? attribution[r.fixtureId];
  const all = r.verdict.findings || [];
  // Attribution indexes the FULL findings array, so the gating rule is applied
  // here rather than baked into the adjudication — which is what lets the rule
  // change without re-adjudicating 107 reviews.
  const idx = att?.attributedIndices || [];
  const attributedFindings = idx.map((i) => all[i]).filter(Boolean);
  const attributed = attributedFindings.length > 0;
  const attributedGating = attributedFindings.filter(isGatingFinding);
  return {
    ...r,
    attributedFindings,
    // Rule 1: a catch is an attributed finding that actually gates. Without an
    // adjudication there is no catch — never a default-true.
    caught: attributedGating.length > 0,
    // The reviewer raised a gating finding, but about something else entirely.
    gatingUnattributed: s.operative && attributedGating.length === 0,
    // Detected, and then discarded by the severity/category definitions. NOT a
    // miss: the reviewer saw the defect and the rubric threw it away, which is a
    // different repair from "the reviewer cannot see this class".
    detectedNotGating: attributed && attributedGating.length === 0,
    describesCompliantText: !!att?.describesCompliantText,
    attributed,
    adjudicated: !!att,
    routed: s.routedEditor,
    deterministic: (s.deterministicCheckFail || []).length > 0,
    syntax: s.syntaxErrors > 0,
    floors: (s.floorFail || []).length > 0,
  };
});

// ---------------------------------------------------------------------------
// aggregation
// ---------------------------------------------------------------------------

function group(pred, keyFn) {
  const out = {};
  for (const r of scored.filter(pred)) {
    const k = keyFn(r);
    out[k] = out[k] || [];
    out[k].push(r);
  }
  return out;
}

/**
 * Partition on the fixture, not on whatever the row happened to record.
 *
 * A row written by an older runner — or by a path that did not carry the full
 * fixture identity — has no `kind`, and partitioning on `r.kind` alone drops it
 * from every aggregate: it disappears from the denominator instead of counting
 * as the fail-closed datum it is. `fixtureById` is keyed by `fixtureId`, which
 * every row carries, so it is always the better authority. Rows that need the
 * fallback are counted and reported rather than quietly repaired.
 */
// Counted per ROW, not per lookup: the predicates below are re-evaluated on
// every `group()` call, so a per-lookup counter would report a multiple of the
// real number and read as a much bigger anomaly than it is.
const fellBack = new Set();
const fixtureFieldOf = (r, field) => {
  if (r[field] !== undefined && r[field] !== null) return r[field];
  const f = fixtureById[r.fixtureId];
  if (f && f[field] !== undefined && f[field] !== null) {
    fellBack.add(`${r.fixtureId}#${r.replicate}`);
    return f[field];
  }
  return undefined;
};

const injections = (r) => fixtureFieldOf(r, 'kind') === 'injection';
const negatives = (r) => fixtureFieldOf(r, 'kind') === 'negative';
const controls = (r) => fixtureFieldOf(r, 'kind') === 'control';

const byClass = group(injections, (r) => fixtureFieldOf(r, 'defectClass'));
const byFixture = group(injections, (r) => r.fixtureId);

const lines = [];
const P = (s = '') => lines.push(s);

const tierOf = (r) => fixtureById[r.fixtureId]?.tier ?? 'unclassified';
const surfacesOf = (r) => (r.verdict ? surfaces(r.verdict) : null);

P('## Headline, by tier');
P();
P('The four tiers answer different questions and are never pooled. M0 core is the certification:');
P('classes no deterministic check can cover. The deterministic tier asks only whether the model is');
P('not worse than a script that should be written anyway.');
P();
P('| Tier | Fixtures | Reviews | Caught (gating + attributed) | Wilson 95% | Detected below the gate | Missed |');
P('|---|---|---|---|---|---|---|');
const byTier = group(injections, tierOf);
for (const [tier, rs] of Object.entries(byTier).sort()) {
  const n = rs.length;
  const k = rs.filter((r) => r.caught).length;
  const below = rs.filter((r) => r.detectedNotGating).length;
  const fixtures = new Set(rs.map((r) => r.fixtureId)).size;
  P(`| \`${tier}\` | ${fixtures} | ${n} | ${k} ${pct(k / n)} | ${ci(k, n)} | ${below} | ${n - k - below} |`);
}
P();

P('## Catch rate on the operative surface, by defect class');
P();
P('| Class | Caught (gating + attributed) | Wilson 95% | Detected but below the gate | Missed entirely | Routed to editor |');
P('|---|---|---|---|---|---|');
for (const [cls, rs] of Object.entries(byClass).sort()) {
  const n = rs.length;
  const k = rs.filter((r) => r.caught).length;
  const below = rs.filter((r) => r.detectedNotGating).length;
  const missed = n - k - below;
  const routed = rs.filter((r) => r.routed).length;
  P(`| \`${cls}\` | ${k}/${n} ${pct(k / n)} | ${ci(k, n)} | ${below} | ${missed} | ${routed}/${n} |`);
}
P();
P('"Detected but below the gate" is the reviewer naming the injected defect at a severity or');
P('in a category the gate ignores. It is not a miss, and the repair is different: the reviewer');
P('can see the class, and the severity definitions discard it.');
P();
P('| Class | Categories the reviewer actually used when it fired on the injection |');
P('|---|---|');
for (const [cls, rs] of Object.entries(byClass).sort()) {
  const cats = {};
  for (const r of rs) {
    for (const f of r.attributedFindings || []) {
      cats[`${f.severity}/${f.category}`] = (cats[`${f.severity}/${f.category}`] || 0) + 1;
    }
  }
  const expected = (fixtureById[rs[0].fixtureId] || {}).expectedCategory;
  P(`| \`${cls}\` | ${Object.entries(cats).map(([k, n]) => `\`${k}\`×${n}`).join(', ') || '—'} (expected \`${expected ?? '?'}\`) |`);
}
P();

P('## Per-fixture detail');
P();
P('| Fixture | Class | Site | Reps | Caught | Routed | Signature(s) | Expected cat |');
P('|---|---|---|---|---|---|---|---|');
for (const [id, rs] of Object.entries(byFixture).sort()) {
  const f = fixtureById[id] || {};
  const sigs = [...new Set(rs.map((r) => surfacesOf(r)?.signature || '(unparseable)'))];
  P(
    `| \`${id}\` | \`${f.defectClass ?? ''}\` | ${f.site ?? ''} | ${rs.length} | ` +
      `${rs.filter((r) => r.caught).length} | ${rs.filter((r) => r.routed).length} | ` +
      `${sigs.map((s) => `\`${s || '(none)'}\``).join('<br>')} | ${f.expectedCategory ?? ''} |`
  );
}
P();

P('## Severity-margin consistency');
P();
P('Rule 4: the full severity×category signature, not the binary route. A fixture whose');
P('replicates disagree is a fixture sitting on the decision margin.');
P();
const unstable = Object.entries(byFixture).filter(
  ([, rs]) => new Set(rs.map((r) => surfacesOf(r)?.signature)).size > 1
);
const flipped = Object.entries(byFixture).filter(
  ([, rs]) => new Set(rs.map((r) => r.routed)).size > 1
);
P(`- fixtures with ≥2 replicates: ${Object.values(byFixture).filter((rs) => rs.length > 1).length}`);
P(`- signature varied across replicates: ${unstable.length}${unstable.length ? ' — ' + unstable.map(([id]) => `\`${id}\``).join(', ') : ''}`);
P(`- ROUTE flipped across replicates: ${flipped.length}${flipped.length ? ' — ' + flipped.map(([id]) => `\`${id}\``).join(', ') : ''}`);
P();
const sevCat = {};
for (const f of scored.filter(injections).flatMap((r) => r.verdict ? (r.verdict.findings || []) : [])) {
  const k = `${f.severity}/${f.category}`;
  sevCat[k] = (sevCat[k] || 0) + 1;
}
P('Findings across all injected fixtures, by severity×category:');
P();
P('| severity/category | n | gates? |');
P('|---|---|---|');
for (const [k, n] of Object.entries(sevCat).sort((a, b) => b[1] - a[1])) {
  const [sev, cat] = k.split('/');
  P(`| \`${k}\` | ${n} | ${isGatingFinding({ severity: sev, category: cat }) ? 'yes' : 'no'} |`);
}
P();

P('## False positives');
P();
P('Rule 5: any finding on a negative control or a clean control is a false positive,');
P('however reasonable its prose.');
P();
P('| Fixture kind | Reviews | With ≥1 finding | With a GATING finding | Routed to editor |');
P('|---|---|---|---|---|');
for (const [label, pred] of [['clean control', controls], ['negative control', negatives]]) {
  const rs = scored.filter(pred);
  if (!rs.length) continue;
  const withFinding = rs.filter((r) => surfacesOf(r)?.anyFinding).length;
  const withGating = rs.filter((r) => surfacesOf(r)?.operative).length;
  const routed = rs.filter((r) => r.routed).length;
  P(`| ${label} | ${rs.length} | ${withFinding} ${ci(withFinding, rs.length)} | ${withGating} ${ci(withGating, rs.length)} | ${routed} |`);
}
P();
const negByFixture = group(negatives, (r) => r.fixtureId);
if (Object.keys(negByFixture).length) {
  P('| Negative control | Reviews | Findings raised | Gating | Verdict |');
  P('|---|---|---|---|---|');
  for (const [id, rs] of Object.entries(negByFixture).sort()) {
    const findings = rs.flatMap((r) => r.verdict?.findings || []);
    P(
      `| \`${id}\` | ${rs.length} | ${findings.length} | ${rs.filter((r) => surfacesOf(r)?.operative).length} | ` +
        `${rs.filter((r) => r.routed).length ? 'routed editor' : 'clean'} |`
    );
  }
  P();
}

P('## Integrity');
P();
const unparse = scored.filter((r) => r.unparseable).length;
const failedRuns = scored.filter((r) => r.reviewFailed).length;
const unadjudicated = scored.filter((r) => injections(r) && !r.adjudicated).length;
const unattributed = scored.filter((r) => r.gatingUnattributed).length;
P(`- reviews captured: **${scored.length}**` + (duplicates.length ? ` (after removing ${duplicates.length} duplicate row(s) from a concurrent-capture race: ${duplicates.join(', ')})` : ''));
P(`- unparseable verdict blocks: ${unparse}`);
P(`- review runs that failed before posting a verdict: ${failedRuns}`);
P(`- rows whose fixture identity had to be recovered from the fixture set: ${fellBack.size}`);
P(`- injected reviews with no attribution adjudication: ${unadjudicated}`);
P(`- gating findings that fired but were NOT attributed to the injection: ${unattributed}`);
const engineVersions = [...new Set(scored.map((r) => r.verdict?.engineVersion).filter(Boolean))];
const models = [...new Set(scored.map((r) => r.verdict?.reviewerModel).filter(Boolean))];
P(`- engineVersion(s): ${engineVersions.map((v) => `\`${v}\``).join(', ')}`);
P(`- reviewerModel(s): ${models.map((v) => `\`${v}\``).join(', ')}`);

const out = lines.join('\n') + '\n';
fs.writeFileSync(path.join(dir, 'report.md'), out, 'utf-8');
fs.writeFileSync(path.join(dir, 'scored.json'), JSON.stringify(scored.map(({ commentBody, ...r }) => r), null, 2), 'utf-8');
console.log(out);

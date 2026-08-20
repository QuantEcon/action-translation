#!/usr/bin/env node
/**
 * Injected-defect certification harness — runner.
 *
 * Measures the DEPLOYED reviewer (`@v0`) by putting known defects in front of it
 * and recording what it says. Nothing here builds or patches the engine: the
 * object under test is whatever `QuantEcon/action-translation@v0` resolves to at
 * run time, exercised through the harness's real `review-translations.yml`.
 *
 * Subcommands
 *   plan       apply every fixture's edits to its site control, validate, emit plan.json
 *   sources    open one source PR per site (never labelled, never merged)
 *   targets    open one target PR per fixture, unlabelled
 *   fire       label a wave of target PRs, which is what makes review mode run
 *   capture    poll for review comments, parse with the engine's own parser
 *   replicate  empty-commit re-fire for fixtures still short of their replicate count
 *   status     where the run is
 *
 * Every step is idempotent and keyed on `reviewedHeadSha`, because review mode
 * OVERWRITES its comment in place — a verdict not captured before the next
 * re-fire is gone (action-translation#248, method notes).
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  HERE, SRC_REPO, TGT_REPO, BRANCH_PREFIX, REVIEW_LABEL,
  api, headSha, createBranch, putFile, emptyCommit, createPr, addLabel,
  prBody, findReviewComment, parseVerdict, runDir, loadState, saveState,
  appendJsonl, surfaces, sleep,
} from './lib.mjs';

const SITES = path.join(HERE, 'fixtures', 'sites');
const VARIANTS = path.join(HERE, 'fixtures', 'variants');

const [, , cmd, ...rest] = process.argv;
const RUN_ID = process.env.RUN_ID || 'm0';
const arg = (name, dflt) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : dflt;
};
const flag = (name) => rest.includes(`--${name}`);

// ===========================================================================
// plan
// ===========================================================================

function applyEdits(control, edits, id) {
  let out = control;
  for (const [i, e] of edits.entries()) {
    const n = out.split(e.find).length - 1;
    if (n !== 1) {
      throw new Error(`${id}: edit ${i} anchor occurs ${n}× (need exactly 1): ${JSON.stringify(e.find.slice(0, 90))}`);
    }
    out = out.replace(e.find, e.replace);
  }
  return out;
}

async function cmdPlan() {
  const sites = JSON.parse(fs.readFileSync(path.join(SITES, 'index.json'), 'utf-8'));
  const fixturesFile = path.join(HERE, 'fixtures', 'fixtures.json');
  const crafted = JSON.parse(fs.readFileSync(fixturesFile, 'utf-8'));

  fs.mkdirSync(VARIANTS, { recursive: true });
  const fixtures = [];
  const problems = [];

  // Clean controls first — one per site. These are the false-positive
  // measurement AND the per-site baseline every injected verdict is read
  // against, so they are fixtures in their own right, not scaffolding.
  for (const [key, site] of Object.entries(sites)) {
    fixtures.push({
      id: `control-${key}`,
      kind: 'control',
      defectClass: 'clean-control',
      recipe: 'the correct translation of the source edit, unmodified',
      site: key,
      file: site.file,
      replicates: Number(arg('control-replicates', 3)),
      expectedCategory: null,
      expectedMinSeverity: null,
      groundTruth: 'no defect — a finding here is a false positive',
      defectMarker: '',
      content: fs.readFileSync(path.join(SITES, site.zhFile), 'utf-8'),
      extraFiles: [],
    });
  }

  for (const v of crafted) {
    const site = sites[v.site];
    if (!site) { problems.push(`${v.id}: unknown site ${v.site}`); continue; }
    if (site.file !== v.file) { problems.push(`${v.id}: file ${v.file} != site file ${site.file}`); continue; }
    const control = fs.readFileSync(path.join(SITES, site.zhFile), 'utf-8');
    let content;
    try {
      content = applyEdits(control, v.edits || [], v.id);
    } catch (err) {
      problems.push(String(err.message));
      continue;
    }
    if ((v.edits || []).length > 0 && content === control) {
      problems.push(`${v.id}: edits produced no change`);
      continue;
    }
    if ((v.edits || []).length === 0 && !v.allowNoEdits) {
      // A negative control that needs no edit is legitimate — the clean control
      // already exercises it — but it must not be run twice under two names.
      // `allowNoEdits` is the deliberate exception: a fixture whose whole defect
      // lives in an `extraFiles` entry (a de-localised _toc.yml) leaves the
      // reviewed markdown byte-identical to the control ON PURPOSE, which is
      // what makes the comparison clean.
      v.aliasOfControl = true;
    }
    // The marker normally lives in the reviewed markdown, but a fixture whose
    // whole defect is a sibling file (a de-localised `_toc.yml`) carries it
    // there instead — and that fixture is precisely the one worth running,
    // because the question is whether the reviewer ever sees that file.
    const markerHosts = [content, ...(v.extraFiles || []).map((x) => x.content)];
    if (v.defectMarker && !markerHosts.some((h) => h.includes(v.defectMarker))) {
      problems.push(`${v.id}: defectMarker absent from the injected file and from every extraFile`);
      continue;
    }
    if (v.defectMarker && control.includes(v.defectMarker)) {
      problems.push(`${v.id}: defectMarker also present in the control — cannot attribute`);
      continue;
    }
    fixtures.push({
      id: v.id,
      kind: v.group === 'negative-controls' ? 'negative' : 'injection',
      group: v.group,
      // The four tiers answer different questions and must not be pooled into a
      // single headline rate — see merge-fixtures.mjs.
      tier: v.tier || v.group,
      defectClass: v.defectClass,
      recipe: v.recipe,
      site: v.site,
      file: v.file,
      // A floor, not the crafted number. The clean controls showed the routing
      // decision varying across byte-identical re-reviews on 3 of 5 fixtures,
      // so a single draw is not a catch rate for ANY class — not just the ones
      // predicted to be borderline.
      replicates: Math.max(v.replicates || 1, Number(arg('min-replicates', 1))),
      expectedCategory: v.expectedCategory,
      expectedMinSeverity: v.expectedMinSeverity,
      groundTruth: v.groundTruth,
      defectMarker: v.defectMarker,
      notes: v.notes,
      aliasOfControl: !!v.aliasOfControl,
      content,
      extraFiles: v.extraFiles || [],
    });
  }

  const runnable = fixtures.filter((f) => !f.aliasOfControl);
  for (const f of runnable) {
    fs.writeFileSync(path.join(VARIANTS, `${f.id}.${f.file}`), f.content, 'utf-8');
  }

  const reviews = runnable.reduce((n, f) => n + f.replicates, 0);
  // Re-planning must never orphan PRs that already exist on GitHub: the plan is
  // the only record of which branch belongs to which fixture, and losing it
  // would leave live PRs no step can capture from.
  const prior = loadState(RUN_ID) || {};
  const state = {
    runId: RUN_ID,
    createdAt: prior.createdAt || new Date().toISOString(),
    plannedAt: new Date().toISOString(),
    srcRepo: SRC_REPO,
    tgtRepo: TGT_REPO,
    sites,
    fixtures: runnable.map(({ content, ...rest }) => rest),
    sourcePrs: prior.sourcePrs || {},
    targetPrs: prior.targetPrs || {},
    problems,
  };
  saveState(RUN_ID, state);

  console.log(`plan: ${runnable.length} fixtures, ${reviews} reviews (~$${(reviews * 0.49).toFixed(0)})`);
  const byKind = {};
  for (const f of runnable) byKind[f.kind] = (byKind[f.kind] || 0) + 1;
  console.log('  by kind:', JSON.stringify(byKind));
  const skipped = fixtures.filter((f) => f.aliasOfControl).map((f) => f.id);
  if (skipped.length) console.log(`  aliased to the clean control (not run separately): ${skipped.join(', ')}`);
  if (problems.length) {
    console.log(`\n  ${problems.length} PROBLEM(S):`);
    for (const p of problems) console.log(`   - ${p}`);
  }
}

// ===========================================================================
// sources
// ===========================================================================

async function cmdSources() {
  const state = loadState(RUN_ID);
  const base = headSha(SRC_REPO);
  for (const [key, site] of Object.entries(state.sites)) {
    if (state.sourcePrs[key]) { console.log(`site ${key}: source PR #${state.sourcePrs[key].number} exists`); continue; }
    const branch = `${BRANCH_PREFIX}/src-${key}-${RUN_ID}`;
    createBranch(SRC_REPO, branch, base);
    const content = fs.readFileSync(path.join(SITES, site.srcFile), 'utf-8');
    putFile(SRC_REPO, branch, site.file, content, `Certification site ${key}: edit ${site.section}`);
    const title = `CERT: site ${key} — ${site.section.replace(/^#+\s*/, '')} (project-translation#28)`;
    const pr = createPr(SRC_REPO, {
      title,
      head: branch,
      body: `Source-side edit for the injected-defect certification harness (QuantEcon/project-translation#28).\n\n` +
        `Scope: \`${site.file}\` — ${site.section}\n\n` +
        `**Do not merge and do not add the \`test-translation\` label.** Merging would fire a real sync; ` +
        `the label would do the same on an open PR. This PR exists only so review mode has a source diff ` +
        `to compare against, which is what puts the injection site inside the reviewer's changed-section scope.`,
    });
    state.sourcePrs[key] = { number: pr.number, branch, title, url: pr.html_url };
    saveState(RUN_ID, state);
    console.log(`site ${key}: source PR #${pr.number} ${pr.html_url}`);
  }
}

// ===========================================================================
// targets
// ===========================================================================

async function cmdTargets() {
  const state = loadState(RUN_ID);
  const limit = Number(arg('limit', Infinity));
  const base = headSha(TGT_REPO);
  let made = 0;
  for (const f of state.fixtures) {
    if (state.targetPrs[f.id]) continue;
    if (made >= limit) break;
    const src = state.sourcePrs[f.site];
    if (!src) throw new Error(`no source PR for site ${f.site} — run \`sources\` first`);

    const branch = `${BRANCH_PREFIX}/${RUN_ID}-${f.id}`;
    createBranch(TGT_REPO, branch, base);
    const content = fs.readFileSync(path.join(VARIANTS, `${f.id}.${f.file}`), 'utf-8');
    putFile(TGT_REPO, branch, f.file, content, `[cert] ${f.id}: ${f.defectClass}`);
    for (const extra of f.extraFiles) {
      putFile(TGT_REPO, branch, extra.path, extra.content, `[cert] ${f.id}: ${extra.path}`);
    }
    const pr = createPr(TGT_REPO, {
      title: `🌐 [translation-sync] ${src.title}`,
      head: branch,
      body: prBody({
        sourceRepo: SRC_REPO,
        sourcePr: src.number,
        sourceTitle: src.title,
        fixtureId: f.id,
        defectClass: f.defectClass,
        note: f.recipe,
      }),
    });
    state.targetPrs[f.id] = {
      number: pr.number, branch, url: pr.html_url,
      headSha: pr.head.sha, fired: [], captured: [],
    };
    saveState(RUN_ID, state);
    made++;
    console.log(`${f.id}: target PR #${pr.number}`);
  }
  console.log(`targets: ${Object.keys(state.targetPrs).length}/${state.fixtures.length} created`);
}

// ===========================================================================
// fire
// ===========================================================================

async function cmdFire() {
  const state = loadState(RUN_ID);
  const size = Number(arg('size', 12));
  const only = arg('only');
  let fired = 0;
  for (const f of state.fixtures) {
    if (only && !f.id.startsWith(only)) continue;
    const t = state.targetPrs[f.id];
    if (!t || t.fired.length > 0) continue;
    if (fired >= size) break;
    addLabel(TGT_REPO, t.number);
    t.fired.push({ sha: t.headSha, at: new Date().toISOString(), how: 'label' });
    saveState(RUN_ID, state);
    fired++;
    console.log(`fired ${f.id} (PR #${t.number})`);
    await sleep(1500);
  }
  console.log(`fire: ${fired} PR(s) labelled`);
}

// ===========================================================================
// capture
// ===========================================================================

/**
 * The fixture identity every `verdicts.jsonl` row carries, whatever happened to
 * the review.
 *
 * A row that omits these is not merely thinner — `score.mjs` partitions on
 * `kind` and groups on `defectClass`, so a row without them is excluded from
 * every aggregate and vanishes from the denominator. That is the one outcome
 * pre-registered rule 8 forbids, and the rows most likely to lack them (a review
 * that died, a block that would not parse) are exactly the ones the rule was
 * written for.
 */
function fixtureFields(f) {
  return {
    fixtureId: f.id,
    kind: f.kind,
    tier: f.tier,
    defectClass: f.defectClass,
    recipe: f.recipe,
    site: f.site,
    expectedCategory: f.expectedCategory,
    expectedMinSeverity: f.expectedMinSeverity,
    defectMarker: f.defectMarker,
  };
}

/** Did the review run for this PR's current head sha fail outright? */
function failedRun(t) {
  try {
    const runs = api(
      'GET',
      `repos/${TGT_REPO}/actions/workflows/review-translations.yml/runs?head_sha=${t.headSha}&per_page=10`
    );
    const list = runs.workflow_runs || [];
    if (list.length === 0) return false;
    // `skipped` is the label filter doing its job, not a failure; only a run
    // that started and died counts.
    return list.some((r) => r.status === 'completed' && ['failure', 'timed_out'].includes(r.conclusion));
  } catch {
    return false;
  }
}

async function cmdCapture() {
  const state = loadState(RUN_ID);
  const rounds = Number(arg('rounds', 40));
  const every = Number(arg('every', 30)) * 1000;

  for (let round = 1; round <= rounds; round++) {
    let pending = 0;
    let got = 0;
    for (const f of state.fixtures) {
      const t = state.targetPrs[f.id];
      if (!t || t.fired.length === 0) continue;
      const wanted = t.fired.length;
      if (t.captured.length >= wanted) continue;

      // A review can die without posting anything: `evaluateDiff` retries a
      // malformed model response three times and then fails the run, so the PR
      // carries no verdict block at all. Waiting for a comment that will never
      // arrive stalls the whole drive loop, and silently skipping the fixture
      // would quietly shrink the denominator — so a failed run is recorded as a
      // failed replicate and reported (pre-registered rule 8).
      if (failedRun(t)) {
        t.captured.push({ failedRun: true, sha: t.headSha, at: new Date().toISOString() });
        appendJsonl(RUN_ID, 'verdicts.jsonl', {
          ...fixtureFields(f),
          pr: t.number, replicate: t.captured.length, reviewFailed: true,
          headSha: t.headSha, capturedAt: new Date().toISOString(),
        });
        got++;
        saveState(RUN_ID, state);
        continue;
      }

      const comment = findReviewComment(TGT_REPO, t.number);
      if (!comment) { pending++; continue; }
      const verdict = await parseVerdict(comment.body);
      if (!verdict) {
        // A review comment with no parseable block is itself data: fail-closed
        // consumers must treat it as `editor`, and a certification that quietly
        // dropped it would overstate the reviewer.
        if (!t.captured.some((c) => c.commentUpdatedAt === comment.updated_at)) {
          t.captured.push({ unparseable: true, commentUpdatedAt: comment.updated_at });
          appendJsonl(RUN_ID, 'verdicts.jsonl', {
            ...fixtureFields(f),
            pr: t.number, replicate: t.captured.length, unparseable: true,
            commentUpdatedAt: comment.updated_at, capturedAt: new Date().toISOString(),
          });
          got++;
        }
        continue;
      }
      if (t.captured.some((c) => c.reviewedHeadSha === verdict.reviewedHeadSha)) { pending++; continue; }

      t.captured.push({
        reviewedHeadSha: verdict.reviewedHeadSha,
        commentUpdatedAt: comment.updated_at,
        recommendation: verdict.recommendation,
      });
      appendJsonl(RUN_ID, 'verdicts.jsonl', {
        ...fixtureFields(f),
        pr: t.number,
        replicate: t.captured.length,
        commentId: comment.id,
        commentUpdatedAt: comment.updated_at,
        capturedAt: new Date().toISOString(),
        commentBody: comment.body,
        verdict,
        surfaces: surfaces(verdict),
      });
      got++;
      saveState(RUN_ID, state);
    }
    saveState(RUN_ID, state);
    const done = state.fixtures.reduce((n, f) => {
      const t = state.targetPrs[f.id];
      return n + (t ? Math.min(t.captured.length, t.fired.length) : 0);
    }, 0);
    const fired = state.fixtures.reduce((n, f) => n + (state.targetPrs[f.id]?.fired.length || 0), 0);
    console.log(`round ${round}: +${got} captured, ${done}/${fired} of fired reviews in hand, ${pending} pending`);
    if (done >= fired) { console.log('capture: all fired reviews captured'); return; }
    if (round < rounds) await sleep(every);
  }
  console.log('capture: rounds exhausted with reviews still pending');
}

// ===========================================================================
// replicate
// ===========================================================================

async function cmdReplicate() {
  const state = loadState(RUN_ID);
  const size = Number(arg('size', 12));
  let n = 0;
  for (const f of state.fixtures) {
    const t = state.targetPrs[f.id];
    if (!t) continue;
    // The first run belongs to `fire`, which applies the label. Pushing an empty
    // commit to a PR that has never been labelled produces a run the workflow's
    // label filter SKIPS, and the fixture is then recorded as fired with no
    // verdict it can ever capture — which stalls the whole drive loop behind a
    // review that was never going to happen.
    if (t.fired.length === 0) continue;
    if (t.fired.length >= f.replicates) continue;
    if (t.captured.length < t.fired.length) continue; // never re-fire over an uncaptured verdict
    if (n >= size) break;
    const sha = emptyCommit(TGT_REPO, t.branch, `[cert] replicate ${t.fired.length + 1} for ${f.id}`);
    t.headSha = sha;
    t.fired.push({ sha, at: new Date().toISOString(), how: 'empty-commit' });
    saveState(RUN_ID, state);
    n++;
    console.log(`replicate ${t.fired.length} fired for ${f.id} (PR #${t.number})`);
    await sleep(1500);
  }
  console.log(`replicate: ${n} re-fire(s) pushed`);
}

// ===========================================================================
// status
// ===========================================================================

async function cmdStatus() {
  const state = loadState(RUN_ID);
  const rows = state.fixtures.map((f) => {
    const t = state.targetPrs[f.id];
    return {
      id: f.id, kind: f.kind, want: f.replicates,
      pr: t?.number ?? '-', fired: t?.fired.length ?? 0, captured: t?.captured.length ?? 0,
    };
  });
  const want = rows.reduce((n, r) => n + r.want, 0);
  const fired = rows.reduce((n, r) => n + r.fired, 0);
  const captured = rows.reduce((n, r) => n + r.captured, 0);
  console.log(`run ${RUN_ID}: ${rows.length} fixtures, ${captured}/${fired} captured, target ${want} reviews`);
  if (flag('verbose')) {
    for (const r of rows) console.log(`  ${r.id.padEnd(42)} PR ${String(r.pr).padStart(5)}  ${r.captured}/${r.want}`);
  }
  const short = rows.filter((r) => r.captured < r.want);
  if (short.length) console.log(`  ${short.length} fixture(s) short of their replicate count`);
}

// ===========================================================================
// runs — the silent-failure check
// ===========================================================================

/**
 * A review that never ran and a review still queued look identical from the
 * comment side, and a run parked `action_required` shows no red anywhere
 * (action-translation#234). Passive waiting cannot tell them apart, so the
 * harness counts runs rather than assuming the clock is running.
 */
async function cmdRuns() {
  const state = loadState(RUN_ID);
  const wanted = new Set(Object.values(state.targetPrs).map((t) => t.number));
  // Paginate. A single page of 100 covers barely two waves, so the unpaginated
  // version reported the earliest PRs as "fired but NO run recorded" once their
  // runs scrolled out of the window — a false alarm from the very check that
  // exists to catch silent non-collection. A detector that cries wolf is worse
  // than no detector: it teaches you to ignore the one time it is right.
  const mine = [];
  for (let page = 1; page <= 10; page++) {
    const runs = api(
      'GET',
      `repos/${TGT_REPO}/actions/workflows/review-translations.yml/runs?per_page=100&page=${page}`
    );
    const batch = runs.workflow_runs || [];
    mine.push(...batch.filter((r) => (r.pull_requests || []).some((p) => wanted.has(p.number))));
    if (batch.length < 100) break;
  }
  const byStatus = {};
  for (const r of mine) {
    const k = `${r.status}/${r.conclusion ?? '-'}`;
    byStatus[k] = (byStatus[k] || 0) + 1;
  }
  console.log(`review runs touching this run's PRs: ${mine.length}`);
  console.log('  ', JSON.stringify(byStatus));
  const bad = mine.filter(
    (r) => r.status === 'action_required' || ['failure', 'cancelled', 'timed_out'].includes(r.conclusion)
  );
  for (const r of bad) {
    console.log(`  !! PR ${r.pull_requests.map((p) => p.number).join(',')} run ${r.id}: ${r.status}/${r.conclusion} ${r.html_url}`);
  }
  // Fired but no run at all is the worst case — nothing errors, nothing exists.
  const seen = new Set(mine.flatMap((r) => (r.pull_requests || []).map((p) => p.number)));
  const silent = state.fixtures
    .filter((f) => (state.targetPrs[f.id]?.fired.length || 0) > 0 && !seen.has(state.targetPrs[f.id].number))
    .map((f) => `${f.id}(#${state.targetPrs[f.id].number})`);
  if (silent.length) console.log(`  !! fired but NO run recorded: ${silent.join(', ')}`);
}

const COMMANDS = { plan: cmdPlan, sources: cmdSources, targets: cmdTargets, fire: cmdFire, capture: cmdCapture, replicate: cmdReplicate, status: cmdStatus, runs: cmdRuns };

if (!COMMANDS[cmd]) {
  console.error(`usage: RUN_ID=<id> node run.mjs <${Object.keys(COMMANDS).join('|')}> [flags]`);
  process.exit(2);
}
await COMMANDS[cmd]();

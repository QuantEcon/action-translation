// rules.mjs — the pre-registered decision rules (README.md "Decision rules"), evaluated on the
// cells results.mjs builds, and the follow-up draws they call for (run-stages.mjs --followups).
//
// Orientation, everywhere: a 2×2 table is [[candidate failures, candidate successes],
// [baseline failures, baseline successes]] with candidate = s55 (or o55) and baseline = s5, so
// the one-sided "candidate worse" p is fisherExact(...).greater / stratifiedExact(...).pGreater
// and a risk difference is candidate minus baseline.

import { ARMS, BASELINE, CANDIDATE, INFORMATIONAL, RULES } from './cells.mjs';
import { fmtPct, seededRandom } from './lib.mjs';

const GUARD_STAGES = new Set([1, 2]);

/** Index the planned units: `${stage}|${unitId}` → unit. */
export function indexUnits(stages) {
  const index = new Map();
  for (const s of stages) for (const u of s.units) index.set(`${u.stage}|${u.id}`, u);
  return index;
}

function stem(fixture) {
  return fixture.replace(/\.md$/, '');
}

/** The unit id of an R3 redraw for one lecture × language drawn from a source class. */
export function redrawUnitId(sourceClass, fixture, language) {
  return `${sourceClass ?? 'fixture'}.${stem(fixture)}.${language}~redraw`;
}

function roleOf(cell, unitIndex) {
  return unitIndex.get(`${cell.stage}|${cell.unit}`)?.role ?? null;
}

function unitOf(cell, unitIndex) {
  return unitIndex.get(`${cell.stage}|${cell.unit}`) ?? null;
}

function isGating(cell, unitIndex) {
  return GUARD_STAGES.has(cell.stage) && roleOf(cell, unitIndex) === 'gating';
}

function counts(cell, arm, phase = 'base') {
  return cell.arms[arm]?.[phase] ?? null;
}

/** [[a, b], [c, d]] for a failure measure ('structural' | 'refusals'). */
function table(cand, base, measure) {
  return [
    [cand[measure], cand.valid - cand[measure]],
    [base[measure], base.valid - base[measure]],
  ];
}

function cellLabel(cell) {
  return `${cell.fixture} × ${cell.language}`;
}

/** Mean of the log ratios and a seeded percentile bootstrap over cells. */
export function bootstrapLogMean(logs, seed, reps = RULES.bootstrap) {
  const k = logs.length;
  const mean = logs.reduce((s, x) => s + x, 0) / k;
  const random = seededRandom(seed);
  const means = new Float64Array(reps);
  for (let r = 0; r < reps; r++) {
    let s = 0;
    for (let i = 0; i < k; i++) s += logs[Math.floor(random() * k)];
    means[r] = s / k;
  }
  means.sort();
  const at = (q) => means[Math.min(reps - 1, Math.max(0, Math.ceil(q * reps) - 1))];
  return { mean, lo95: at(0.025), hi95: at(0.975), upper95: at(0.95) };
}

/** A served model ID is the requested one, or a dated snapshot of it (`<id>-YYYYMMDD`). */
export function servedBy(served, requested) {
  return served === requested || (served.startsWith(`${requested}-`) && /^\d{8}$/.test(served.slice(requested.length + 1)));
}

function median(xs) {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ─── R0 ──────────────────────────────────────────────────────────────────────

/** The planned gating cells (stage, unit, fixture, language), whether drawn yet or not. */
function plannedGatingCells(ctx) {
  const out = [];
  for (const unit of ctx.unitIndex.values()) {
    if (!GUARD_STAGES.has(unit.stage) || unit.role !== 'gating') continue;
    for (const fixture of unit.fixtures) for (const language of unit.languages) out.push({ stage: unit.stage, unit: unit.id, fixture, language });
  }
  return out;
}

function ruleR0(cells, ctx) {
  const problems = [];
  const missing = [];
  const infraByArm = {};
  const byKey = new Map(cells.map((c) => [`${c.stage}|${c.unit}|${c.fixture}|${c.language}`, c]));
  const gating = [];
  for (const planned of plannedGatingCells(ctx)) {
    const cell = byKey.get(`${planned.stage}|${planned.unit}|${planned.fixture}|${planned.language}`);
    if (cell) gating.push(cell);
    else missing.push(`${planned.fixture} × ${planned.language} (stage ${planned.stage}, not run)`);
  }
  // remedy: 'rerun' = draw the unit again whole (all arms, a new attempt, ideally another day);
  // 'redraw-infra' = top the cell up to minValid by re-drawing its infra draws (infra ≤ the limit).
  const problem = (cell, arm, issue, remedy) => problems.push({ stage: cell.stage, unit: cell.unit, cell: cellLabel(cell), arm, issue, remedy });
  const signatures = new Map();
  const glossaries = new Map();
  for (const cell of gating) {
    const launches = new Set();
    for (const arm of [BASELINE, CANDIDATE]) {
      const c = counts(cell, arm);
      if (!c) {
        missing.push(`${cellLabel(cell)} (${arm} not run)`);
        continue;
      }
      // over rate-check's attempts: the infra attempts --redraw-infra replaced stay in (it moves
      // aside only draws it classed as infra, so infra + redrawnInfra is rate-check's infraAttempts)
      infraByArm[arm] ??= { infra: 0, attempts: 0 };
      const replaced = c.redrawnInfra ?? 0;
      infraByArm[arm].infra += c.infra + replaced;
      infraByArm[arm].attempts += c.completed + replaced;
      launches.add(c.launch ?? 'unknown');
      if (c.infraShare > RULES.infraMax) problem(cell, arm, `infra ${fmtPct(c.infraShare)} of attempts > ${fmtPct(RULES.infraMax)}`, 'rerun');
      else if (c.valid < RULES.minValid) problem(cell, arm, `${c.valid} valid draws < ${RULES.minValid}`, c.notRun > 0 ? 'resume' : 'redraw-infra');
      if (c.auth > 0) problem(cell, arm, `${c.auth} auth failure(s): the run is invalid`, 'rerun');
      // fallbacks are off, so every response must come from the arm's own model (a dated snapshot of it at most)
      const foreign = (c.servedModels ?? []).filter((m) => !servedBy(m, ARMS[arm].model));
      if (foreign.length) problem(cell, arm, `served by ${foreign.join(', ')}, not ${ARMS[arm].model}`, 'rerun');
      if (c.countsInconsistent) problem(cell, arm, 'summary counts do not add up', 'rerun');
      if (ctx.engineId && c.engineId && c.engineId !== ctx.engineId) problem(cell, arm, `drawn on engine ${c.engineId}, not the pinned ${ctx.engineId}`, 'rerun');
      if (!c.engineId) problem(cell, arm, 'no engine record in manifest.jsonl (not drawn by run-stages.mjs?)', 'rerun');
      if (c.engineSignature) signatures.set(c.engineSignature, [...(signatures.get(c.engineSignature) ?? []), `${cellLabel(cell)} ${arm}`]);
      if (c.glossarySha256) {
        const key = `${cell.language}|${c.glossarySha256}`;
        glossaries.set(key, [...(glossaries.get(key) ?? []), `${cellLabel(cell)} ${arm}`]);
      }
    }
    // `launch` is the launch that created each arm's run (results.mjs), so a later joint resume
    // cannot make arms drawn apart look drawn together
    if (launches.size > 1) problem(cell, 'all', `s5 and s55 drawn in different launches (${[...launches].join(', ')})`, 'rerun');
    // and, whatever the manifest says, the arms' draws must have run at the same time
    const wb = counts(cell, BASELINE)?.window;
    const wc = counts(cell, CANDIDATE)?.window;
    if (wb && wc && (wb.end < wc.start || wc.end < wb.start)) {
      problem(cell, 'all', `s5 and s55 drew in windows that do not overlap (s5 ${wb.start} to ${wb.end}, s55 ${wc.start} to ${wc.end})`, 'rerun');
    }
  }
  if (signatures.size > 1) {
    // #227: every compared run must have run the same dist/, translator, parity guard and SDK.
    const [, ...minority] = [...signatures.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [, where] of minority) for (const w of where) problems.push({ cell: w, issue: 'engine hashes (dist/, translator, parity guard or SDK) differ from the other gating runs', remedy: 'rerun' });
  }
  const glossaryByLang = new Map();
  for (const key of glossaries.keys()) {
    const [lang] = key.split('|');
    glossaryByLang.set(lang, (glossaryByLang.get(lang) ?? 0) + 1);
  }
  for (const [lang, n] of glossaryByLang) if (n > 1) problems.push({ cell: `language ${lang}`, issue: 'glossary hash differs between gating runs', remedy: 'rerun' });
  const perArm = Object.fromEntries(
    Object.entries(infraByArm).map(([arm, v]) => [arm, { ...v, share: v.attempts ? v.infra / v.attempts : 0 }])
  );
  const armShares = Object.values(perArm).map((v) => v.share);
  const verdict = problems.length ? 'FAIL' : gating.length === 0 || missing.length ? 'INCONCLUSIVE' : 'PASS';
  const text = (p) => `${p.cell}${p.arm && p.arm !== 'all' ? ` ${p.arm}` : ''}: ${p.issue} (${p.remedy})`;
  return {
    rule: 'R0',
    verdict,
    reason:
      verdict === 'PASS'
        ? `${gating.length} gating cells: infra ≤ ${fmtPct(RULES.infraMax)}, ≥ ${RULES.minValid} valid draws per arm, arms drawn together on one engine; infra s5 ${fmtPct(perArm[BASELINE]?.share, 1)}, s55 ${fmtPct(perArm[CANDIDATE]?.share, 1)}`
        : verdict === 'FAIL'
          ? `data not ready to read: ${problems.map(text).join('; ')}`
          : `gating cells not yet drawn: ${missing.length ? missing.join('; ') : 'none found'}`,
    problems,
    missing,
    infraByArm: perArm,
    infraArmDifference: armShares.length === 2 ? Math.abs(armShares[0] - armShares[1]) : null,
    reruns: problems.filter((p) => p.unit && p.remedy !== 'resume').map((p) => ({ stage: p.stage, unit: p.unit, remedy: p.remedy })),
  };
}

// ─── R1 ──────────────────────────────────────────────────────────────────────

/** R1's baseline (README "R1"): v0.29.5, built with its own dependencies. */
export const R1_BASELINE_VERSION = '0.29.5';
const R1_SCENARIOS = ['end_turn', 'max_tokens', 'refusal', 'overloaded'];

function ruleR1(ctx) {
  const aa = ctx.engineAa;
  if (!aa) {
    return { rule: 'R1', verdict: 'INCONCLUSIVE', reason: 'engine-aa.mjs has not been run against a v0.29.5 baseline with its own dependencies' };
  }
  const inconclusive = (reason) => ({ rule: 'R1', verdict: 'INCONCLUSIVE', reason, engineAa: aa.summary ?? null });
  // Only the pre-registered check counts, FAIL included: Sonnet 5, a v0.29.5 baseline, and the
  // pinned engine as the candidate.
  if (aa.model !== ARMS[BASELINE].model) return inconclusive(`engine-aa ran ${aa.model ?? 'an unrecorded model'}, not ${ARMS[BASELINE].model}: not the pre-registered check`);
  if (aa.baseline?.version !== R1_BASELINE_VERSION) return inconclusive(`engine-aa's baseline is package ${aa.baseline?.version ?? '?'}, not v${R1_BASELINE_VERSION}`);
  if (ctx.baselineRefSha && aa.baseline?.git && aa.baseline.git !== ctx.baselineRefSha) {
    return inconclusive(`engine-aa's baseline is commit ${aa.baseline.git.slice(0, 12)}, not v${R1_BASELINE_VERSION} (${ctx.baselineRefSha.slice(0, 12)})`);
  }
  const cand = aa.candidate ?? {};
  if (!cand.engineId || !cand.distSha256) return inconclusive('engine-aa recorded no engine id or dist/ hash for its candidate: rerun engine-aa from the pinned checkout');
  if (!ctx.engineId) return inconclusive(`no pinned engine (EVAL_ROOT/engine.json) to hold R1's candidate ${cand.engineId} against`);
  if (cand.engineId !== ctx.engineId || (ctx.engineDistSha256 && cand.distSha256 !== ctx.engineDistSha256)) {
    return inconclusive(`R1 ran on engine ${cand.engineId}, the stages on ${ctx.engineId}: rerun engine-aa from the pinned checkout`);
  }
  if (cand.clean === false || cand.distStale === true) {
    return inconclusive(`engine-aa's candidate ${cand.clean === false ? 'had uncommitted changes' : 'had a dist/ older than src/'}: rerun engine-aa from the pinned checkout, built`);
  }
  // a FAIL of the right check stands, on partial coverage or a shared SDK too
  if (aa.verdict === 'FAIL') return { rule: 'R1', verdict: 'FAIL', reason: aa.reason ?? '', engineAa: aa.summary ?? null };
  const sourceOnly = aa.sourceOnly || (aa.baseline?.sdkVersion && aa.baseline.sdkVersion === aa.candidate?.sdkVersion);
  if (sourceOnly) {
    // R1 is pre-registered against a baseline on its own lockfile: a shared SDK checks the source only.
    return {
      rule: 'R1',
      verdict: 'INCONCLUSIVE',
      reason: `both engines ran SDK ${aa.baseline?.sdkVersion ?? '?'}: the source matches (${aa.verdict}), but R1 needs the v0.29.5 baseline built with its own npm ci (SDK 0.78)`,
      engineAa: aa.summary ?? null,
    };
  }
  // every Stage 1 fixture × language, each with all four scenarios
  const expected = [...new Set([...ctx.unitIndex.values()].filter((u) => u.stage === 1).flatMap((u) => u.fixtures.flatMap((f) => u.languages.map((l) => `${f}|${l}`))))];
  const covered = new Set((aa.cases ?? []).filter((c) => R1_SCENARIOS.every((s) => c.scenarios?.[s])).map((c) => `${c.fixture}|${c.language}`));
  const missing = expected.filter((k) => !covered.has(k));
  if (expected.length === 0 || missing.length) {
    return inconclusive(`engine-aa covered ${expected.length - missing.length} of ${expected.length} Stage 1 cells${missing.length ? ` (missing ${missing.slice(0, 4).map((k) => k.replace('|', ' × ')).join(', ')}${missing.length > 4 ? ', …' : ''})` : ''}`);
  }
  if (aa.verdict !== 'PASS' && aa.verdict !== 'EXPLAIN') return inconclusive(`engine-aa.json gives no verdict (${aa.verdict ?? 'none'})`);
  return { rule: 'R1', verdict: aa.verdict, reason: aa.reason ?? '', engineAa: aa.summary ?? null };
}

/** Stage 0b: the stochastic A/A, both arms scored by the legacy rule (no output file = failure). */
function stage0Advisory(cells, ctx) {
  const rows = [];
  for (const cell of cells.filter((c) => c.stage === 0)) {
    const old = counts(cell, 's5@v0.29.5');
    const cur = counts(cell, BASELINE);
    if (!old || !cur) continue;
    // rate-check writes the no-output-file count into every cell (legacyRefused over legacyDraws,
    // each draw judged on its first attempt; completed draws in an older summary.json); an older
    // summary.txt gives refused/draws.
    const legacy = (c) =>
      c.legacyRefused !== null && c.legacyRefused !== undefined
        ? { k: c.legacyRefused, n: c.legacyDraws ?? c.completed }
        : c.legacy
          ? { k: c.legacyFailures, n: c.draws }
          : { k: c.draws - c.ok, n: c.draws };
    const o = legacy(old);
    const n = legacy(cur);
    const p = ctx.stats.fisherExact(n.k, n.n - n.k, o.k, o.n - o.k);
    rows.push({ cell: cellLabel(cell), v0295: `${o.k}/${o.n}`, current: `${n.k}/${n.n}`, pTwoSided: p.twoSided, sdk: { v0295: old.engineSignature?.split('|')[3] ?? null, current: cur.engineSignature?.split('|')[3] ?? null } });
  }
  return {
    note: 'Advisory, not R1: both arms scored by the legacy no-output-file rule (infra failures count). The SDK column says what each arm loaded: with --ref-deps shared the v0.29.5 arm runs this checkout\'s SDK, so the contrast is source-only.',
    rows,
  };
}

// ─── R2 ──────────────────────────────────────────────────────────────────────

function ruleR2Pooled(cells, ctx, candidate = CANDIDATE) {
  const stage1 = cells.filter((c) => c.stage === 1 && isGating(c, ctx.unitIndex));
  const planned = [...ctx.unitIndex.values()].filter((u) => u.stage === 1).length;
  const tables = [];
  const missing = [];
  for (const cell of stage1) {
    const cand = counts(cell, candidate);
    const base = counts(cell, BASELINE);
    if (!cand || !base) {
      missing.push(cellLabel(cell));
      continue;
    }
    tables.push(table(cand, base, 'structural'));
  }
  const pooled = tables.reduce(
    (acc, t) => ({ a: acc.a + t[0][0], n1: acc.n1 + t[0][0] + t[0][1], c: acc.c + t[1][0], n0: acc.n0 + t[1][0] + t[1][1] }),
    { a: 0, n1: 0, c: 0, n0: 0 }
  );
  if (tables.length < planned || missing.length) {
    return { rule: candidate === CANDIDATE ? 'R2-pooled' : `R2-pooled (${candidate})`, verdict: 'INCONCLUSIVE', reason: `${tables.length} of ${planned} Stage 1 cells have both arms`, pooled };
  }
  const mh = ctx.stats.mhRiskDifference(tables, { zOneSided: RULES.zOneSided });
  let upper = mh.upperOneSided;
  let method = 'Mantel–Haenszel risk difference, Sato–Greenland–Robins variance';
  if (!mh.informative) {
    upper = ctx.stats.wilson(0, pooled.n1, RULES.zOneSided).hi;
    method = `no structural failure in either arm: one-sided 95% Wilson bound of 0/${pooled.n1}`;
  }
  const exact = ctx.stats.stratifiedExact(tables);
  const pass = upper < RULES.delta;
  // o55 is informational: it is measured against the same margin, but nothing it shows gates
  const verdict = candidate === CANDIDATE ? (pass ? 'PASS' : 'FAIL') : 'INFO';
  return {
    rule: candidate === CANDIDATE ? 'R2-pooled' : `R2-pooled (${candidate})`,
    verdict,
    reason: `${candidate === CANDIDATE ? '' : `would ${pass ? 'pass' : 'fail'}: `}structural failure, ${candidate} ${pooled.a}/${pooled.n1} v s5 ${pooled.c}/${pooled.n0}: risk difference ${mh.rd === null ? '–' : (100 * mh.rd).toFixed(1)} points, one-sided 95% upper bound ${(100 * upper).toFixed(1)} points ${pass ? '<' : '≥'} margin ${(100 * RULES.delta).toFixed(1)} (${method})`,
    pooled,
    rates: {
      [candidate]: { rate: pooled.n1 ? pooled.a / pooled.n1 : null, wilson: ctx.stats.wilson(pooled.a, pooled.n1) },
      [BASELINE]: { rate: pooled.n0 ? pooled.c / pooled.n0 : null, wilson: ctx.stats.wilson(pooled.c, pooled.n0) },
    },
    riskDifference: mh,
    upperBound: upper,
    exactStratified: { pGreater: exact.pGreater, twoSided: exact.twoSided, note: 'advisory superiority test' },
  };
}

/**
 * How a follow-up (an R2 control, an R3 redraw) that cannot be read yet is drawn: an unfinished one
 * resumes ('resume'); a finished one above 10% infra in either arm is drawn again whole, a new
 * attempt with both arms in one launch ('rerun'). Never --redraw-infra: the replaced attempts stay
 * in the infra share, so the cell could never get back under 10%.
 */
function followupRemedy(cand, base) {
  if ([cand, base].some((x) => !x || x.notRun > 0)) return 'resume';
  return [cand, base].some((x) => x.infraShare > RULES.infraMax) ? 'rerun' : 'resume';
}

/**
 * The per-cell guard (release step 4b's procedure, D-2026-10-09): a gating cell whose base draws
 * show ≥ guardTrigger s55 structural failures, more than s5's, needs a same-day control of
 * guardExtraDraws more per arm; it blocks when the one-sided Fisher test on the totals gives p < α.
 */
function ruleR2Guard(cells, ctx) {
  const rows = [];
  const followups = [];
  for (const cell of cells.filter((c) => isGating(c, ctx.unitIndex))) {
    const cand = counts(cell, CANDIDATE);
    const base = counts(cell, BASELINE);
    if (!cand || !base) continue;
    const advisory = ctx.stats.fisherExact(cand.structural, cand.valid - cand.structural, base.structural, base.valid - base.structural);
    const row = {
      cell: cellLabel(cell),
      stage: cell.stage,
      s55: `${cand.structural}/${cand.valid}`,
      s5: `${base.structural}/${base.valid}`,
      advisoryP: advisory.greater,
      triggered: cand.structural >= RULES.guardTrigger && cand.structural > base.structural,
      verdict: 'PASS',
    };
    if (row.triggered) {
      const cc = counts(cell, CANDIDATE, 'control');
      const bc = counts(cell, BASELINE, 'control');
      if (!cc || !bc || cc.valid < RULES.guardExtraDraws * (1 - RULES.infraMax) || bc.valid < RULES.guardExtraDraws * (1 - RULES.infraMax)) {
        row.verdict = 'INCONCLUSIVE';
        row.note = 'needs its same-day control (run-stages.mjs --followups)';
        followups.push({ kind: 'control', stage: cell.stage, baseUnit: cell.unit, unitId: `${cell.unit}~control`, remedy: followupRemedy(cc, bc) });
      } else {
        const a = cand.structural + cc.structural;
        const n1 = cand.valid + cc.valid;
        const c = base.structural + bc.structural;
        const n0 = base.valid + bc.valid;
        const p = ctx.stats.fisherExact(a, n1 - a, c, n0 - c).greater;
        row.control = { s55: `${a}/${n1}`, s5: `${c}/${n0}`, pGreater: p };
        row.verdict = p < RULES.alpha ? 'FAIL' : 'PASS';
      }
    }
    rows.push(row);
  }
  const verdict = rows.some((r) => r.verdict === 'FAIL') ? 'FAIL' : rows.some((r) => r.verdict === 'INCONCLUSIVE') || rows.length === 0 ? 'INCONCLUSIVE' : 'PASS';
  const triggered = rows.filter((r) => r.triggered);
  return {
    rule: 'R2-guard',
    verdict,
    reason:
      rows.length === 0
        ? 'no gating cell has both arms yet'
        : triggered.length === 0
          ? `${rows.length} gating cells; none shows ≥ ${RULES.guardTrigger} s55 structural failures above s5's`
          : triggered.map((r) => `${r.cell}: ${r.verdict}${r.control ? ` (totals s55 ${r.control.s55} v s5 ${r.control.s5}, p = ${r.control.pGreater.toFixed(3)})` : ` (${r.note})`}`).join('; '),
    rows,
    followups,
  };
}

// ─── R3 ──────────────────────────────────────────────────────────────────────

function productionOf(cell, unit) {
  return unit?.production?.[cell.fixture] ?? [];
}

function ruleR3(cells, ctx) {
  const triggered = [];
  const nonProduction = [];
  const uncovered = [];
  const followups = [];
  let productionValid = 0;
  let productionRefusals = 0;
  const categories = { [CANDIDATE]: {}, [BASELINE]: {} };
  const byKey = new Map(cells.map((c) => [`${c.stage}|${c.unit}|${c.fixture}|${c.language}`, c]));
  for (const cell of cells) {
    if (cell.stage < 2) continue;
    const unit = unitOf(cell, ctx.unitIndex);
    if (!unit) continue; // follow-up cells are read through their trigger below
    const cand = counts(cell, CANDIDATE);
    const base = counts(cell, BASELINE);
    // refusal categories of every arm (o55's are informational)
    for (const arm of Object.keys(cell.arms)) {
      const c = counts(cell, arm);
      if (!c) continue;
      categories[arm] ??= {};
      for (const [cat, n] of Object.entries(c.refusalCategories ?? {})) categories[arm][cat] = (categories[arm][cat] ?? 0) + n;
    }
    const production = productionOf(cell, unit);
    if (!cand) {
      if (unit.role === 'sweep' && production.length) uncovered.push(`${cellLabel(cell)} (s55 not run)`);
      continue;
    }
    if (production.length) {
      productionValid += cand.valid;
      productionRefusals += cand.refusals;
      if (unit.role === 'sweep' && cand.valid === 0) uncovered.push(`${cellLabel(cell)} (no valid s55 draw: re-draw it)`);
    }
    if (cand.refusals === 0) continue;
    if (!production.length) {
      nonProduction.push({ cell: cellLabel(cell), stage: cell.stage, refusals: `${cand.refusals}/${cand.valid}`, categories: cand.refusalCategories });
      continue;
    }
    const redrawId = redrawUnitId(unit.sourceClass, cell.fixture, cell.language);
    const redrawBase = redrawId.replace(/~redraw$/, '');
    const redraw = byKey.get(`${cell.stage}|${redrawBase}|${cell.fixture}|${cell.language}`);
    const rc = redraw ? counts(redraw, CANDIDATE, 'redraw') : null;
    const rb = redraw ? counts(redraw, BASELINE, 'redraw') : null;
    const row = { cell: cellLabel(cell), stage: cell.stage, production, s55: `${cand.refusals}/${cand.valid}`, categories: cand.refusalCategories };
    if (!rc || !rb) {
      row.verdict = 'INCONCLUSIVE';
      row.note = `needs ${RULES.r3Redraws} more draws per arm (run-stages.mjs --followups)`;
      followups.push({
        kind: 'redraw',
        stage: cell.stage,
        unitId: redrawId,
        sourceClass: unit.sourceClass,
        fixture: cell.fixture,
        language: cell.language,
        localize: unit.localize,
        bytes: unit.bytes?.[cell.fixture],
        production,
      });
    } else {
      const a = cand.refusals + rc.refusals;
      const n1 = cand.valid + rc.valid;
      const c = (base?.refusals ?? 0) + rb.refusals;
      const n0 = (base?.valid ?? 0) + rb.valid;
      const p = ctx.stats.fisherExact(a, n1 - a, c, n0 - c).greater;
      row.redraw = { s55: `${rc.refusals}/${rc.valid}`, s5: `${rb.refusals}/${rb.valid}`, totals: { s55: `${a}/${n1}`, s5: `${c}/${n0}` }, pGreater: p };
      // "Did not reproduce" needs the redraw's draws: 11 valid of 12 per arm, like the R2 guard's
      // 21.6 of 24, and infra ≤ 10% (#227: an unreliable cell gives no verdict). A refusal that
      // reproduced blocks whatever the infra share.
      const floor = RULES.r3Redraws * (1 - RULES.infraMax);
      const unreliable = rc.infraShare > RULES.infraMax || rb.infraShare > RULES.infraMax;
      if (rc.refusals > 0 || p < RULES.alpha) {
        row.verdict = 'FAIL';
        row.note = rc.refusals > 0 ? 'the refusal reproduced: blocked until a mitigation (retry or fallback, with provenance) is decided' : 'more refusals than s5';
      } else if (unreliable || rc.valid < floor || rb.valid < floor) {
        row.verdict = 'INCONCLUSIVE';
        row.note = `redraw not reliable (s55 ${rc.valid} valid, infra ${fmtPct(rc.infraShare)}; s5 ${rb.valid} valid, infra ${fmtPct(rb.infraShare)}): draw it again (run-stages.mjs --followups)`;
        followups.push({
          kind: 'redraw',
          stage: cell.stage,
          unitId: redrawId,
          sourceClass: unit.sourceClass,
          fixture: cell.fixture,
          language: cell.language,
          localize: unit.localize,
          bytes: unit.bytes?.[cell.fixture],
          production,
          remedy: followupRemedy(rc, rb),
        });
      } else {
        row.verdict = 'PASS';
        row.note = 'did not reproduce';
      }
    }
    triggered.push(row);
  }
  const sweepUnits = [...ctx.unitIndex.values()].filter((u) => u.role === 'sweep');
  const sweepCells = cells.filter((c) => unitOf(c, ctx.unitIndex)?.role === 'sweep');
  const sweepDrawn = sweepUnits.every((u) => sweepCells.some((c) => c.unit === u.id && counts(c, CANDIDATE)));
  let verdict;
  if (triggered.some((r) => r.verdict === 'FAIL')) verdict = 'FAIL';
  else if (!sweepDrawn || uncovered.length || triggered.some((r) => r.verdict === 'INCONCLUSIVE')) verdict = 'INCONCLUSIVE';
  else verdict = 'PASS';
  const bound = productionValid > 0 && productionRefusals === 0 ? 1 - Math.pow(RULES.alpha, 1 / productionValid) : null;
  return {
    rule: 'R3',
    verdict,
    reason:
      verdict === 'PASS'
        ? `${productionValid} valid s55 draws on production lectures; ${triggered.length ? `${triggered.length} refusal(s) did not reproduce` : 'no refusal'}${bound !== null ? `; one-sided 95% upper bound on the per-draw refusal rate ${fmtPct(bound, 1)}` : ''}`
        : verdict === 'FAIL'
          ? triggered.filter((r) => r.verdict === 'FAIL').map((r) => `${r.cell}: ${r.note}`).join('; ')
          : !sweepDrawn
            ? 'the Stage 3 sweep is not complete'
            : [...uncovered, ...triggered.filter((r) => r.verdict === 'INCONCLUSIVE').map((r) => `${r.cell}: ${r.note}`)].join('; '),
    productionValid,
    productionRefusals,
    upperBound: bound,
    triggered,
    nonProduction,
    uncovered,
    categories,
    followups,
  };
}

// ─── R4 / R5 ─────────────────────────────────────────────────────────────────

function okRecords(c) {
  return (c?.records ?? []).filter((d) => d.outcome === 'ok' && (d.retries === null || d.retries === 0));
}

function ratioCells(cells, candidate) {
  const out = [];
  for (const cell of cells.filter((c) => c.stage === 1 || c.stage === 2)) {
    const cand = counts(cell, candidate);
    const base = counts(cell, BASELINE);
    if (!cand || !base) continue;
    const okC = okRecords(cand);
    const okB = okRecords(base);
    if (okC.length < RULES.minOkForRatio || okB.length < RULES.minOkForRatio) continue;
    out.push({ cell, cand, base, okC, okB });
  }
  return out;
}

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

function ruleR4(cells, ctx, candidate = CANDIDATE) {
  const rows = ratioCells(cells, candidate).map(({ cell, okC, okB }) => {
    const ratio = mean(okC.map((d) => d.outputTokens)) / mean(okB.map((d) => d.outputTokens));
    return { cell: cellLabel(cell), stage: cell.stage, cand: Math.round(mean(okC.map((d) => d.outputTokens))), base: Math.round(mean(okB.map((d) => d.outputTokens))), ratio };
  });
  const truncations = [];
  for (const cell of cells.filter((c) => c.stage >= 1)) {
    for (const arm of [BASELINE, candidate]) {
      const c = counts(cell, arm);
      const n = c?.byKind?.truncated ?? 0;
      if (n) truncations.push({ cell: cellLabel(cell), stage: cell.stage, arm, truncated: `${n}/${c.valid}` });
    }
  }
  const name = candidate === CANDIDATE ? 'R4' : `R4 (${candidate})`;
  if (rows.length < RULES.minOkForRatio || rows.some((r) => !Number.isFinite(r.ratio) || !(r.ratio > 0))) {
    return { rule: name, verdict: 'INCONCLUSIVE', reason: `${rows.length} cells with ≥ ${RULES.minOkForRatio} clean successes per arm (need ≥ ${RULES.minOkForRatio})`, rows, truncations };
  }
  const boot = bootstrapLogMean(rows.map((r) => Math.log(r.ratio)), `${RULES.bootstrapSeed}/R4/${candidate}`);
  const upper = Math.exp(boot.upper95);
  const verdict = candidate === CANDIDATE ? (upper <= RULES.r4MaxRatio ? 'PASS' : 'FAIL') : 'INFO';
  return {
    rule: name,
    verdict,
    reason: `output tokens ${candidate}/s5: geometric mean ${Math.exp(boot.mean).toFixed(3)} over ${rows.length} cells, one-sided 95% upper bound ${upper.toFixed(3)}${candidate === CANDIDATE ? ` ${verdict === 'PASS' ? '≤' : '>'} ${RULES.r4MaxRatio}` : ''}${candidate !== CANDIDATE ? ' (different tokenizer: compare cost, not tokens)' : ''}`,
    geometricMean: Math.exp(boot.mean),
    upperBound: upper,
    rows,
    truncations,
  };
}

/**
 * All reported spend in a cell × arm, failed and infra attempts included (an attempt that threw
 * before its final message returns no usage, so it adds none), with input priced under one cache
 * assumption: the cacheable prefix (the median cached tokens of a single-call draw) is written once
 * and read by every call after it. Returns { total, ok, perDelivered, actual }.
 */
export function normalizedCellCost(records, price) {
  const single = records.filter((d) => d.apiCalls === 1).map((d) => d.cacheCreationInputTokens + d.cacheReadInputTokens);
  const prefix = median(single);
  let total = prefix * (price.cacheWrite5m - price.cacheRead);
  let actual = 0;
  let actualKnown = true;
  for (const d of records) {
    const calls = Math.max(1, d.apiCalls);
    const prompt = d.inputTokens + d.cacheCreationInputTokens + d.cacheReadInputTokens;
    total += Math.max(0, prompt - calls * prefix) * price.in + calls * prefix * price.cacheRead + d.outputTokens * price.out;
    if (d.costUSD === null) actualKnown = false;
    else actual += d.costUSD;
  }
  const ok = records.filter((d) => d.outcome === 'ok').length;
  return { total: total / 1e6, ok, perDelivered: ok ? total / 1e6 / ok : null, actual: actualKnown ? actual : null, prefix };
}

function ruleR5(cells, ctx, candidate = CANDIDATE) {
  const pc = ctx.priceFor(ARMS[candidate].model);
  const pb = ctx.priceFor(ARMS[BASELINE].model);
  const name = candidate === CANDIDATE ? 'R5' : `R5 (${candidate})`;
  if (!pc || !pb) return { rule: name, verdict: 'INCONCLUSIVE', reason: 'a model has no list price in dist/model-pricing.js' };
  const rows = ratioCells(cells, candidate).map(({ cell, cand, base }) => {
    const c = normalizedCellCost(cand.records, pc);
    const b = normalizedCellCost(base.records, pb);
    const outC = mean(cand.records.map((d) => d.outputTokens)) * (cand.records.length / Math.max(1, c.ok));
    const outB = mean(base.records.map((d) => d.outputTokens)) * (base.records.length / Math.max(1, b.ok));
    return { cell: cellLabel(cell), cand: c.perDelivered, base: b.perDelivered, ratio: c.perDelivered / b.perDelivered, outputRatio: outC / outB, actualCand: c.actual, actualBase: b.actual };
  });
  if (rows.length < RULES.minOkForRatio || rows.some((r) => !Number.isFinite(r.ratio) || !(r.ratio > 0) || !Number.isFinite(r.outputRatio))) {
    return { rule: name, verdict: 'INCONCLUSIVE', reason: `${rows.length} cells with ≥ ${RULES.minOkForRatio} successes per arm and usable usage records`, rows };
  }
  const boot = bootstrapLogMean(rows.map((r) => Math.log(r.ratio)), `${RULES.bootstrapSeed}/R5/${candidate}`);
  const outBoot = bootstrapLogMean(rows.map((r) => Math.log(r.outputRatio)), `${RULES.bootstrapSeed}/R5-output/${candidate}`);
  const gm = Math.exp(boot.mean);
  const verdict = candidate === CANDIDATE ? (gm <= RULES.r5MaxRatio ? 'PASS' : 'EXPLAIN') : 'INFO';
  return {
    rule: name,
    verdict,
    reason: `cost per delivered file ${candidate}/s5: geometric mean ${gm.toFixed(3)} (95% interval ${Math.exp(boot.lo95).toFixed(3)}–${Math.exp(boot.hi95).toFixed(3)}) over ${rows.length} cells${candidate === CANDIDATE ? `, ${verdict === 'PASS' ? '≤' : '>'} ${RULES.r5MaxRatio}` : ''}; output tokens per delivered file ${Math.exp(outBoot.mean).toFixed(3)}`,
    geometricMean: gm,
    interval: [Math.exp(boot.lo95), Math.exp(boot.hi95)],
    outputTokensPerDelivered: Math.exp(outBoot.mean),
    rows,
  };
}

// ─── per-cell tables ─────────────────────────────────────────────────────────

function cellTable(cells, ctx) {
  const rows = [];
  for (const cell of cells) {
    const arms = {};
    for (const [arm, phases] of Object.entries(cell.arms)) {
      const c = phases.base ?? phases.redraw ?? phases.control;
      if (!c) continue;
      const okR = (c.records ?? []).filter((d) => d.outcome === 'ok');
      const all = c.records ?? [];
      arms[arm] = {
        draws: c.draws,
        valid: c.valid,
        ok: c.ok,
        structural: c.structural,
        refusals: c.refusals,
        infra: c.infra,
        redrawnInfra: c.redrawnInfra ?? 0,
        noReport: c.noReport,
        structuralRate: c.valid ? c.structural / c.valid : null,
        wilson: c.legacy ? null : ctx.stats.wilson(c.structural, c.valid),
        byKind: c.byKind,
        refusalCategories: c.refusalCategories,
        meanOutputTokens: okR.length ? mean(okR.map((d) => d.outputTokens)) : null,
        meanThinkingTokens: okR.length ? mean(okR.map((d) => d.thinkingTokens)) : null,
        medianLatencyMs: okR.length ? median(okR.filter((d) => !d.retries).map((d) => d.elapsedMs ?? 0)) : null,
        costUSD: all.length && all.every((d) => d.costUSD !== null) ? all.reduce((s, d) => s + d.costUSD, 0) : null,
        servedModels: c.servedModels,
        legacy: !!c.legacy,
        phases: Object.keys(phases),
      };
    }
    const contrasts = {};
    const base = counts(cell, BASELINE);
    for (const cand of [CANDIDATE, ...INFORMATIONAL]) {
      const c = counts(cell, cand);
      if (!c || !base || c.legacy || base.legacy) continue;
      const p = ctx.stats.fisherExact(c.structural, c.valid - c.structural, base.structural, base.valid - base.structural);
      const r = ctx.stats.fisherExact(c.refusals, c.valid - c.refusals, base.refusals, base.valid - base.refusals);
      contrasts[cand] = { structural: { greater: p.greater, twoSided: p.twoSided }, refusals: { greater: r.greater, twoSided: r.twoSided } };
    }
    rows.push({ stage: cell.stage, unit: cell.unit, role: roleOf(cell, ctx.unitIndex), fixture: cell.fixture, language: cell.language, arms, contrasts });
  }
  return rows.sort((a, b) => a.stage - b.stage || a.unit.localeCompare(b.unit) || a.fixture.localeCompare(b.fixture));
}

// ─── advisory ────────────────────────────────────────────────────────────────

function advisory(ctx) {
  const out = {};
  if (ctx.judge) out.judge = ctx.judge;
  if (ctx.mlLints) out.mlLints = ctx.mlLints;
  return out;
}

function decide(rules) {
  const gating = ['R0', 'R1', 'R2-pooled', 'R2-guard', 'R3', 'R4'];
  const failed = gating.filter((r) => rules[r]?.verdict === 'FAIL');
  // R5 never blocks, but an unknown cost is not a supported flip either
  const open = [...gating, 'R5'].filter((r) => rules[r]?.verdict === 'INCONCLUSIVE');
  if (rules.R0?.verdict === 'FAIL') return { verdict: 'NOT READY', text: 'R0: re-run the unreliable cells before reading any rule.' };
  if (failed.length) return { verdict: 'BLOCKED', text: `The default stays claude-sonnet-5: ${failed.join(', ')} failed.` };
  if (open.length) return { verdict: 'INCOMPLETE', text: `Not decided yet: ${open.join(', ')} inconclusive (draws missing or follow-ups owed).` };
  // engine-aa's EXPLAIN comes only from headers outside SDK identification; name them
  const r1 = rules.R1?.verdict === 'EXPLAIN' ? ` R1 lists header differences that RESULTS.md must explain: ${String(rules.R1.reason ?? '').replace(/^explain in RESULTS\.md: /, '')}.` : '';
  const r5 = rules.R5?.verdict === 'EXPLAIN' ? ' R5 is over +25%: explain the cost before flipping.' : '';
  return {
    verdict: 'SUPPORTED',
    text:
      'The gating rules pass on the whole-document path.' +
      r1 +
      r5 +
      ' The section-level sync path and the reviewer are unmeasured as rates (Stage 5 draws one per scenario), and the ml edition stays pinned to claude-sonnet-5 until a native review of an s55 draft (README, ml).',
  };
}

/**
 * Evaluate every rule. ctx: { stats, priceFor, unitIndex, engineId, engineDistSha256,
 * baselineRefSha, engineAa, judge, mlLints }.
 */
export function evaluate(cells, ctx) {
  const rules = {
    R0: ruleR0(cells, ctx),
    R1: ruleR1(ctx),
    'R2-pooled': ruleR2Pooled(cells, ctx),
    'R2-guard': ruleR2Guard(cells, ctx),
    R3: ruleR3(cells, ctx),
    R4: ruleR4(cells, ctx),
    R5: ruleR5(cells, ctx),
  };
  const informational = {};
  for (const arm of INFORMATIONAL) {
    informational[arm] = {
      'R2-pooled': ruleR2Pooled(cells, ctx, arm),
      R4: ruleR4(cells, ctx, arm),
      R5: ruleR5(cells, ctx, arm),
    };
  }
  return {
    rules,
    decision: decide(rules),
    informational,
    stage0: stage0Advisory(cells, ctx),
    cells: cellTable(cells, ctx),
    advisory: advisory(ctx),
    followups: [...rules['R2-guard'].followups, ...rules.R3.followups],
  };
}

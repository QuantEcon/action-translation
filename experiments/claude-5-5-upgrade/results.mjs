// results.mjs — read an evaluation root into runs, cells and draws (used by summarize.mjs and by
// run-stages.mjs --followups).
//
// Layout (written by run-stages.mjs, inside each run by rate-check.sh):
//   <EVAL_ROOT>/engine.json                      the pinned engine's fingerprint
//   <EVAL_ROOT>/manifest.jsonl                   one line per unit launch and per arm exit
//   <EVAL_ROOT>/stage<N>/<unit>/<arm>/r<k>/      one rate-check run (attempt k of that unit × arm)
//       meta.txt, summary.json (or a legacy summary.txt), <lang>/<stem>/<i>.json (init's run report)
// A unit id ending in ~control is an R2 same-day control; ~redraw an R3 redraw.
//
// Counts come from rate-check's summary.json (its classification is the instrument's, not
// re-derived here). The continuous metrics (tokens, cost, latency) come from the per-draw
// reports, which are init's own record of each draw.

import fs from 'node:fs';
import path from 'node:path';
import { readJson, readJsonl, readMetaTxt } from './lib.mjs';
import { NON_STRUCTURAL_KINDS } from './cells.mjs';

export const PHASES = { '': 'base', '~control': 'control', '~redraw': 'redraw' };

/** 'game-theory.zh-cn~control' → { base: 'game-theory.zh-cn', phase: 'control' }. */
export function splitUnitId(unitId) {
  const m = unitId.match(/^(.*?)(~control|~redraw)?$/);
  return { base: m[1], phase: PHASES[m[2] ?? ''] };
}

export function runDirFor(evalRoot, stage, unitId, arm, attempt) {
  return path.join(evalRoot, `stage${stage}`, unitId, arm, `r${attempt}`);
}

/** Attempt numbers present for one unit × arm, ascending. */
export function attemptsFor(evalRoot, stage, unitId, arm) {
  const dir = path.join(evalRoot, `stage${stage}`, unitId, arm);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^r\d+$/.test(e.name))
    .map((e) => Number(e.name.slice(1)))
    .sort((a, b) => a - b);
}

/** Every run directory under the root. */
export function discoverRuns(evalRoot) {
  const runs = [];
  if (!fs.existsSync(evalRoot)) return runs;
  for (const stageEntry of fs.readdirSync(evalRoot, { withFileTypes: true })) {
    const sm = stageEntry.isDirectory() && stageEntry.name.match(/^stage(\d+)$/);
    if (!sm) continue;
    const stage = Number(sm[1]);
    const stageDir = path.join(evalRoot, stageEntry.name);
    for (const unitEntry of fs.readdirSync(stageDir, { withFileTypes: true })) {
      if (!unitEntry.isDirectory()) continue;
      const unitDir = path.join(stageDir, unitEntry.name);
      for (const armEntry of fs.readdirSync(unitDir, { withFileTypes: true })) {
        if (!armEntry.isDirectory()) continue;
        for (const attempt of attemptsFor(evalRoot, stage, unitEntry.name, armEntry.name)) {
          const { base, phase } = splitUnitId(unitEntry.name);
          runs.push({
            stage,
            unitId: unitEntry.name,
            base,
            phase,
            arm: armEntry.name,
            attempt,
            dir: path.join(unitDir, armEntry.name, `r${attempt}`),
          });
        }
      }
    }
  }
  return runs;
}

const LEGACY_ROW = /^(\S+)\s+(\S+)\s+(\d+)\/(\d+)\s+(\d+)%\s+(\S+)/;

/** A pre-report-mode summary.txt: "fixture language refused/draws rate verdict" rows. */
function parseLegacySummary(text) {
  const cells = [];
  for (const line of text.split('\n')) {
    const m = line.match(LEGACY_ROW);
    if (!m || m[1] === 'fixture') continue;
    cells.push({ fixture: m[1], language: m[2], legacy: true, legacyFailures: Number(m[3]), draws: Number(m[4]), verdict: m[6] });
  }
  return cells;
}

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * One summary.json cell → the counts the rules read. Tolerant of the two readings of `failed`
 * (with or without the no-report draws, which are crashes and count as failures either way):
 * whichever makes ok + failures + infra + not-run equal the draws is taken, and a cell where
 * neither does is flagged.
 */
export function normalizeCell(raw) {
  const ok = num(raw.ok);
  const infra = num(raw.infra);
  const noReport = num(raw.noReport ?? raw.no_report);
  const notRun = num(raw.notRun ?? raw.incomplete ?? raw.missing);
  const failed = num(raw.failed);
  const draws = num(raw.draws);
  let failures;
  let countsInconsistent = false;
  if (ok + failed + infra + notRun === draws) failures = failed;
  else if (ok + failed + noReport + infra + notRun === draws) failures = failed + noReport;
  else {
    failures = failed + noReport;
    countsInconsistent = true;
  }
  const byKind = { ...(raw.byKind ?? {}) };
  // when the cell's draws ran, from their completion markers (UTC, to the second): R0 checks the
  // arms' windows overlap, whatever the manifest says
  const timed = (Array.isArray(raw.drawsDetail) ? raw.drawsDetail : []).filter((d) => d && typeof d.startedAt === 'string' && typeof d.finishedAt === 'string');
  const window = timed.length ? { start: timed.map((d) => d.startedAt).sort()[0], end: timed.map((d) => d.finishedAt).sort().at(-1) } : null;
  const refusals = num(byKind['model-refusal']);
  const auth = num(byKind.auth);
  // Structural = every non-infra failure that is neither a refusal nor an auth failure.
  let excluded = 0;
  for (const kind of NON_STRUCTURAL_KINDS) if (kind !== 'infra') excluded += num(byKind[kind]);
  const structural = Math.max(0, failures - excluded);
  const valid = ok + failures;
  const completed = valid + infra;
  return {
    fixture: raw.fixture,
    language: raw.language,
    draws,
    completed,
    valid,
    ok,
    failures,
    structural,
    refusals,
    auth,
    infra,
    noReport,
    notRun,
    // rate-check's share counts the infra attempts --redraw-infra replaced; ours is the fallback.
    infraShare: typeof raw.infraShare === 'number' ? raw.infraShare : completed > 0 ? infra / completed : 0,
    redrawnInfra: num(raw.redrawnInfra),
    byKind,
    refusalCategories: { ...(raw.refusalCategories ?? {}) },
    verdict: raw.verdict ?? null,
    servedModels: raw.servedModels ?? [],
    // The no-output-file rule applied to this cell (rate-check writes it for every cell), so a
    // report-mode run and a legacy run can be compared on one definition of failure. It judges
    // each draw on its first attempt; legacyDraws is its n (absent from older summaries).
    legacyRefused: typeof raw.legacy?.refused === 'number' ? raw.legacy.refused : null,
    legacyDraws: typeof raw.legacy?.draws === 'number' ? raw.legacy.draws : null,
    window,
    countsInconsistent,
  };
}

/** One init run report (translate-init-report/1) → a draw record. */
export function drawFromReport(report, where) {
  const lecture = Array.isArray(report.lectures) && report.lectures.length > 0 ? report.lectures[0] : null;
  const usage = lecture?.usage ?? report.usage ?? {};
  let outcome;
  let kind = null;
  if (!lecture) {
    outcome = 'failed';
    kind = 'error';
  } else if (lecture.outcome === 'ok') {
    outcome = 'ok';
  } else {
    kind = lecture.failure?.kind ?? 'error';
    outcome = kind === 'infra' ? 'infra' : 'failed';
  }
  return {
    ...where,
    fixture: lecture?.file ? path.basename(lecture.file) : `${where.stem}.md`,
    outcome,
    kind,
    category: lecture?.failure?.category ?? null,
    model: report.model ?? null,
    servedModels: report.servedModels ?? [],
    toolVersion: report.toolVersion ?? null,
    startedAt: report.startedAt ?? null,
    elapsedMs: lecture?.elapsedMs ?? report.elapsedMs ?? null,
    retries: lecture?.retries ?? report.retries ?? null,
    outputChars: lecture?.outputChars ?? null,
    inputTokens: num(usage.inputTokens),
    outputTokens: num(usage.outputTokens),
    thinkingTokens: num(usage.thinkingTokens),
    cacheCreationInputTokens: num(usage.cacheCreationInputTokens),
    cacheReadInputTokens: num(usage.cacheReadInputTokens),
    apiCalls: num(usage.apiCalls),
    costUSD: typeof report.costUSD === 'number' ? report.costUSD : null,
  };
}

/** <i>.json is a draw's current attempt; <i>.infra<k>.json an infra attempt --redraw-infra replaced. */
const REPORT_FILE = /^(\d+)(?:\.infra(\d+))?\.json$/;

/** Every per-draw report of a run, as draw records (unparseable files are listed, not fatal). */
export function readDraws(run) {
  const draws = [];
  const unreadable = [];
  if (!fs.existsSync(run.dir)) return { draws, unreadable };
  for (const langEntry of fs.readdirSync(run.dir, { withFileTypes: true })) {
    // _src/ (the fixtures rate-check copied) and .lock/ hold no draws
    if (!langEntry.isDirectory() || /^[._]/.test(langEntry.name)) continue;
    const langDir = path.join(run.dir, langEntry.name);
    for (const stemEntry of fs.readdirSync(langDir, { withFileTypes: true })) {
      if (!stemEntry.isDirectory()) continue;
      const stemDir = path.join(langDir, stemEntry.name);
      for (const file of fs.readdirSync(stemDir)) {
        const m = file.match(REPORT_FILE);
        if (!m) continue;
        const full = path.join(stemDir, file);
        const parsed = readJson(full);
        if (parsed.error || !parsed.value || typeof parsed.value !== 'object') {
          unreadable.push(full);
          continue;
        }
        draws.push(
          drawFromReport(parsed.value, {
            stage: run.stage,
            unitId: run.unitId,
            base: run.base,
            phase: run.phase,
            arm: run.arm,
            attempt: run.attempt,
            language: langEntry.name,
            stem: stemEntry.name,
            draw: Number(m[1]),
            // 0 for the current attempt; k for the k-th infra attempt it replaced
            replacedInfra: m[2] ? Number(m[2]) : 0,
            file: full,
          })
        );
      }
    }
  }
  return { draws, unreadable };
}

/** Load one run: meta.txt, the normalized cells, and its draws. */
export function loadRun(run) {
  const meta = readMetaTxt(path.join(run.dir, 'meta.txt'));
  const warnings = [];
  let cells = [];
  let summary = null;
  let classification = 'none';
  const summaryJson = path.join(run.dir, 'summary.json');
  const summaryTxt = path.join(run.dir, 'summary.txt');
  if (fs.existsSync(summaryJson)) {
    const parsed = readJson(summaryJson);
    if (parsed.error) warnings.push(`${summaryJson}: ${parsed.error}`);
    else {
      summary = parsed.value;
      classification = summary.classification ?? 'report';
      cells = (summary.cells ?? []).map((c) => {
        const cell = normalizeCell(c);
        if (classification === 'legacy') {
          // The no-output-file rule is the only reading of a legacy run.
          cell.legacy = true;
          cell.legacyFailures = cell.legacyRefused ?? cell.draws - cell.ok;
        }
        return cell;
      });
    }
  } else if (fs.existsSync(summaryTxt)) {
    classification = 'legacy';
    cells = parseLegacySummary(fs.readFileSync(summaryTxt, 'utf8'));
  }
  for (const cell of cells) if (cell.countsInconsistent) warnings.push(`${run.dir}: counts for ${cell.fixture} × ${cell.language} do not add up`);
  const { draws, unreadable } = readDraws(run);
  for (const file of unreadable) warnings.push(`unreadable report ${file} (counted by rate-check as no-report)`);
  return { ...run, meta, summary, classification, cells, draws, warnings, engineSignature: engineSignature(summary?.engine, meta) };
}

/**
 * What a run's requests were made of, as rate-check recorded it (summary.json `engine`, else
 * meta.txt): the dist/ hash, the translator and parity-guard hashes, the SDK it loaded. Two runs
 * with different signatures ran different engines (#227: compare like with like). The glossary
 * is per language and compared separately. Null when the run recorded none (older rate-check).
 */
export function engineSignature(engine, meta = {}) {
  const dist = engine?.distSha256 ?? meta.ENGINE_DIST_SHA256 ?? null;
  if (!dist) return null;
  return [
    dist,
    engine?.translatorSha256 ?? meta.TRANSLATOR_SHA256 ?? '',
    engine?.structuralParitySha256 ?? meta.PARITY_SHA256 ?? '',
    engine?.sdkVersion ?? meta.SDK_VERSION ?? '',
  ].join('|');
}

/** The manifest written by run-stages.mjs. */
export function readManifest(evalRoot) {
  return readJsonl(path.join(evalRoot, 'manifest.jsonl'));
}

/** Engine fingerprint pinned for this evaluation root, or null. */
export function readEngine(evalRoot) {
  const file = path.join(evalRoot, 'engine.json');
  if (!fs.existsSync(file)) return null;
  const parsed = readJson(file);
  return parsed.error ? null : parsed.value;
}

/**
 * Load everything under the root: the latest attempt of each unit × arm (earlier attempts kept
 * under `history`), joined with the manifest: the launch that created each run (`launch`, what R0
 * compares), the latest one (`lastLaunch`) and its engine id and exit code.
 */
export function loadEvalRoot(evalRoot) {
  const runs = discoverRuns(evalRoot);
  const { rows: manifest, bad: manifestBad } = readManifest(evalRoot);
  const exits = new Map();
  // R0 asks whether a cell's arms were drawn in one launch. A later invocation that resumes a run
  // (or relaunches a finished one) must not stand in for the launch that drew it: a run was created
  // by the last arm-exit that started it without --resume or --redraw-infra (rate-check refuses a
  // fresh start on a run that exists), else, if the driver died before writing that row, by the
  // first launch that started it.
  const created = new Map();
  const firstStart = new Map();
  const runKey = (stage, unit, attempt, arm) => `${stage}|${unit}|${attempt}|${arm}`;
  for (const row of manifest) {
    if (row.event === 'arm-exit') {
      exits.set(path.resolve(row.runDir), row);
      const continued = Array.isArray(row.args) && (row.args.includes('--resume') || row.args.includes('--redraw-infra'));
      if (!continued) created.set(runKey(row.stage, row.unit, row.attempt, row.arm), row.launch);
    } else if (row.event === 'unit-start') {
      for (const arm of Object.keys(row.arms ?? {})) {
        const key = runKey(row.stage, row.unit, row.attempt, arm);
        if (!firstStart.has(key)) firstStart.set(key, row.launch);
      }
    }
  }
  const latest = new Map();
  const history = [];
  for (const run of runs) {
    const key = `${run.stage}|${run.unitId}|${run.arm}`;
    const prev = latest.get(key);
    if (!prev || prev.attempt < run.attempt) {
      if (prev) history.push(prev);
      latest.set(key, run);
    } else history.push(run);
  }
  const attach = (run) => {
    const loaded = loadRun(run);
    const exit = exits.get(path.resolve(run.dir));
    const key = runKey(run.stage, run.unitId, run.attempt, run.arm);
    const launch = created.get(key) ?? firstStart.get(key) ?? null;
    return { ...loaded, launch, lastLaunch: exit?.launch ?? null, engineId: exit?.engineId ?? null, exitCode: exit?.exitCode ?? null };
  };
  return {
    evalRoot,
    engine: readEngine(evalRoot),
    manifestRows: manifest.length,
    manifestBad,
    runs: [...latest.values()].map(attach),
    history: history.map(attach),
  };
}

/**
 * Group the latest runs into analysis cells: stage | base unit | fixture | language, each with
 * per-arm counts for the base draws and for any control or redraw follow-up, plus the draws.
 */
export function buildCells(loaded) {
  const cells = new Map();
  for (const run of loaded.runs) {
    for (const c of run.cells) {
      const key = `${run.stage}|${run.base}|${c.fixture}|${c.language}`;
      if (!cells.has(key)) {
        cells.set(key, { key, stage: run.stage, unit: run.base, fixture: c.fixture, language: c.language, arms: {} });
      }
      const cell = cells.get(key);
      cell.arms[run.arm] ??= {};
      cell.arms[run.arm][run.phase] = {
        ...c,
        attempt: run.attempt,
        launch: run.launch,
        engineId: run.engineId,
        engineSignature: run.engineSignature,
        glossarySha256: run.summary?.engine?.glossarySha256?.[c.language] ?? null,
        exitCode: run.exitCode,
        classification: c.legacy ? 'legacy' : run.classification,
        records: run.draws.filter((d) => d.fixture === c.fixture && d.language === c.language),
      };
    }
  }
  return [...cells.values()];
}

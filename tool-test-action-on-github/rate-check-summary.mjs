#!/usr/bin/env node
/**
 * rate-check-summary.mjs — classify and tally a rate-check run directory.
 *
 *   node rate-check-summary.mjs <run-dir>               write summary.txt + summary.json, print the table
 *   node rate-check-summary.mjs --list-infra <run-dir>  print <lang>/<fixture>/<i> for every draw whose
 *                                                       current attempt is an infra failure (--redraw-infra)
 *
 * rate-check.sh calls this after the draws and for --summarize; it reads only the run directory.
 * Exit codes: 0 every cell ok · 1 a cell is FAIL, UNRELIABLE or INCOMPLETE · 2 usage error or a run
 * directory it cannot read (never 1, so a crash cannot read as a failing cell).
 *
 * Two classifications, recorded as summary.json `classification`:
 *
 * - "report" (meta.txt REPORTS=1: the engine has `translate init --report-json`). Each draw's report
 *   says ok or failed, with the failure kind. failed = every non-infra failure, a completed draw
 *   with no readable report (a crash) included. Infra failures (a 429, 5xx, overload or connection
 *   error that outlasted the engine's retries, or a stream cut off part-way by a server error or a
 *   dropped connection, which the engine retries only for an overload) leave both numerator and
 *   denominator.
 *   Verdict, first match wins: failed > threshold → FAIL (more draws can only add failures);
 *   a planned draw never finished → INCOMPLETE; infra above 10% of the cell's attempts →
 *   UNRELIABLE (no verdict: re-run the cell); otherwise ok.
 * - "legacy" (REPORTS=0: an older engine, e.g. --ref v0.29.5). The release-step-4b rule, unchanged:
 *   a draw that wrote no output file is refused, infra included; refused > threshold → FAIL. The
 *   failure line init wrote to <draw>/TRANSLATION-REPORT.md is classified with the same kinds,
 *   for information only — it never changes a legacy verdict.
 *
 * Every cell also carries `legacy: {refused, draws, verdict}` — the no-output-file rule applied to
 * each draw's first attempt — so a reporting run, topped up with --redraw-infra or not, can be
 * compared with a legacy run on one definition of failure.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { wilson } from './lib/stats.mjs';

export const SUMMARY_SCHEMA = 'rate-check-summary/1';
export const REPORT_SCHEMA = 'translate-init-report/1';
/** A cell whose infra share of attempts exceeds this gives no verdict (#227). */
export const INFRA_THRESHOLD = 0.1;

class UsageError extends Error {}

// ─── meta.txt ───────────────────────────────────────────────────────────────

/** Undo the shell quoting meta.txt is written with: 'single' segments, \x escapes, "double" segments. */
function unquoteShell(value) {
  let out = '';
  let i = 0;
  while (i < value.length) {
    const ch = value[i];
    if (ch === "'" || ch === '"') {
      const close = value.indexOf(ch, i + 1);
      if (close < 0) throw new UsageError(`meta.txt: unterminated quote in ${value}`);
      out += value.slice(i + 1, close);
      i = close + 1;
    } else if (ch === '\\' && i + 1 < value.length) {
      out += value[i + 1];
      i += 2;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

/** meta.txt is `KEY='value'` lines (sourced by older rate-check versions, so it stays shell syntax). */
export function parseMeta(text) {
  const meta = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (m) meta[m[1]] = unquoteShell(m[2]);
  }
  return meta;
}

function list(value) {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** "a:sha,b:sha" → {a: sha, b: sha} (null for "missing"). */
function pairs(value) {
  const out = {};
  for (const item of list(value)) {
    const at = item.lastIndexOf(':');
    if (at <= 0) continue;
    const sha = item.slice(at + 1);
    out[item.slice(0, at)] = sha && sha !== 'missing' ? sha : null;
  }
  return out;
}

function intField(meta, key, { min }) {
  const raw = meta[key];
  if (raw === undefined || !/^\d+$/.test(raw) || Number(raw) < min) {
    throw new UsageError(
      `meta.txt: ${key} must be an integer ≥ ${min} (got ${raw === undefined ? 'nothing' : `'${raw}'`})`
    );
  }
  return Number(raw);
}

/** The run's configuration, with defaults for keys that older rate-check versions did not write. */
export function readRunConfig(runDir) {
  const metaPath = path.join(runDir, 'meta.txt');
  if (!fs.existsSync(metaPath)) throw new UsageError(`no meta.txt in ${runDir}`);
  const meta = parseMeta(fs.readFileSync(metaPath, 'utf8'));
  const langs = list(meta.LANGS);
  const fixtures = list(meta.FIXTURES);
  if (langs.length === 0) throw new UsageError('meta.txt: LANGS is empty');
  if (fixtures.length === 0) throw new UsageError('meta.txt: FIXTURES is empty');
  const flag = (key) => (meta[key] === undefined ? null : meta[key] === '1');
  return {
    runDir,
    metaVersion: meta.META_VERSION ?? '1',
    engine: {
      tag: meta.ENGINE_TAG || null,
      sha: meta.ENGINE_SHA || null,
      shaFull: meta.ENGINE_SHA_FULL || null,
      version: meta.ENGINE_VER || null,
      mode: meta.ENGINE_MODE || null,
      ref: meta.REF || null,
      refDeps: meta.REF_DEPS || null,
      clean: flag('ENGINE_CLEAN'),
      reportJson: (meta.REPORTS ?? '0') === '1',
      sdkVersion: meta.SDK_VERSION || null,
      sdkDeclared: meta.SDK_DECLARED || null,
      sdkLocked: meta.SDK_LOCKED || null,
      distSha256: meta.ENGINE_DIST_SHA256 || null,
      translatorSha256: meta.TRANSLATOR_SHA256 || null,
      structuralParitySha256: meta.PARITY_SHA256 || null,
      glossarySha256: meta.GLOSSARY_SHA256 ? pairs(meta.GLOSSARY_SHA256) : null,
    },
    model: meta.MODEL || null,
    draws: intField(meta, 'DRAWS', { min: 1 }),
    threshold: intField(meta, 'MAX_REFUSALS', { min: 0 }),
    langs,
    fixtures,
    fixturesSha256: meta.FIXTURES_SHA256 ? pairs(meta.FIXTURES_SHA256) : null,
    sourceDir: meta.SOURCE_DIR || null,
    localize: meta.LOCALIZE || 'none',
    localizeRules: meta.LOCALIZE_RULES === undefined ? null : list(meta.LOCALIZE_RULES),
    reports: (meta.REPORTS ?? '0') === '1',
    // Runs written before completion markers: every planned draw counts as completed (the old rule).
    markers: (meta.MARKERS ?? '0') === '1',
    startedAt: meta.STARTED_AT || null,
    resumedAt: meta.RESUMED_AT || null,
  };
}

// ─── one attempt ────────────────────────────────────────────────────────────

const ANSI = /\x1b\[[0-9;]*m/g;

/** The draw's completion marker: `exit=N` / `start=…` / `end=…` lines, or a bare exit code. */
function readMarker(base) {
  const file = `${base}.exit`;
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8').trim();
  if (/^\d+$/.test(text)) return { exitCode: Number(text), startedAt: null, finishedAt: null };
  const fields = {};
  for (const line of text.split('\n')) {
    const m = /^(\w+)=(.*)$/.exec(line.trim());
    if (m) fields[m[1]] = m[2];
  }
  return {
    exitCode: /^\d+$/.test(fields.exit ?? '') ? Number(fields.exit) : null,
    startedAt: fields.start || null,
    finishedAt: fields.end || null,
  };
}

/** The first `❌ …` line of a draw's log (the CLI's fatal-error line), else its last non-empty line. */
function logReason(base) {
  const file = `${base}.log`;
  if (!fs.existsSync(file)) return null;
  const lines = fs
    .readFileSync(file, 'utf8')
    .replace(ANSI, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const fatal = lines.find((l) => l.startsWith('❌'));
  if (fatal) return fatal.replace(/^❌\s*/, '');
  return lines.length > 0 ? lines[lines.length - 1] : null;
}

/**
 * The failure line init wrote for `fixture` under "## Failures" in <dir>/TRANSLATION-REPORT.md
 * (`- **file**: message`, continuation lines included).
 */
function readLegacyFailure(dir, fixture) {
  const file = path.join(dir, 'TRANSLATION-REPORT.md');
  if (!fs.existsSync(file)) return { state: 'missing' };
  const text = fs.readFileSync(file, 'utf8');
  const marker = '\n## Failures';
  const start = text.indexOf(marker);
  if (start < 0) return { state: 'none' };
  let section = text.slice(start + marker.length);
  const end = section.search(/\n## /);
  if (end >= 0) section = section.slice(0, end);
  const entries = [];
  let current = null;
  for (const line of section.split('\n')) {
    const m = /^- \*\*(.+?)\*\*: (.*)$/.exec(line);
    if (m) {
      current = { file: m[1], lines: [m[2]] };
      entries.push(current);
    } else if (current && line.trim() !== '') {
      current.lines.push(line);
    }
  }
  const entry = entries.find((e) => e.file === fixture) ?? entries[0];
  return entry ? { state: 'ok', message: entry.lines.join('\n').trim() } : { state: 'none' };
}

/** API error types that are server-side or capacity failures, whether over HTTP or mid-stream. */
const INFRA_ERROR_TYPES = new Set([
  'rate_limit_error',
  'overloaded_error',
  'api_error',
  'timeout_error',
]);

/**
 * The SDK's messages for a stream cut short below the API: a connection dropped mid-body
 * (fetch's `terminated`), or a body that ended before the message did. Infra, as the engine's
 * classifyFailure (src/cli/run-report.ts) reads them.
 */
const STREAM_CUT_SHORT = new Set([
  'terminated',
  'stream ended without producing a Message with role=assistant',
  'request ended without sending any chunks',
]);

/**
 * Classify a failure message with the engine's failure kinds, in its classifyFailure order
 * (refusal, truncated, unexpected stop, parity, auth, infra, other API error, too large,
 * incomplete, no text, error). For engines that write no report: the message is what init put in
 * TRANSLATION-REPORT.md. SDK errors read `<status> <json body>` over HTTP, `<json body>` for an
 * error event mid-stream (status undefined — an `api_error` or `overloaded_error` there is a
 * server failure, so infra), `Connection error.` / `Request timed out.` for transport errors, and
 * one of STREAM_CUT_SHORT for a stream that stopped early.
 */
export function classifyFailureMessage(message) {
  const first = String(message ?? '')
    .trim()
    .split('\n')[0];
  let m = /^\S+: model refusal \(stop_reason=refusal, category=([^)\s]+)\)/.exec(first);
  if (m) return { kind: 'model-refusal', category: m[1] === 'none' ? null : m[1] };
  if (/^(?:\S+: )?[Rr]esponse truncated at max_tokens=\d+/.test(first))
    return { kind: 'truncated' };
  m = /^\S+: unexpected stop_reason=([^;\s]+)/.exec(first);
  if (m) return { kind: 'unexpected-stop', stopReason: m[1] === 'null' ? null : m[1] };
  if (/^structural parity check failed for /.test(first)) return { kind: 'parity' };
  const statusMatch = /^(\d{3})\b/.exec(first);
  const status = statusMatch ? Number(statusMatch[1]) : undefined;
  const errorType = /"type"\s*:\s*"([a-z_]+_error)"/.exec(first)?.[1];
  if (
    status === 401 ||
    status === 403 ||
    errorType === 'authentication_error' ||
    errorType === 'permission_error'
  ) {
    return { kind: 'auth', status, type: errorType };
  }
  if (
    status === 429 ||
    (status !== undefined && status >= 500) ||
    INFRA_ERROR_TYPES.has(errorType) ||
    STREAM_CUT_SHORT.has(first) ||
    /^(Connection error|Request timed out)\.?$/i.test(first) ||
    /\b(ECONNRESET|ETIMEDOUT|EPIPE|socket hang up|fetch failed)\b/.test(first)
  ) {
    return { kind: 'infra', status, type: errorType };
  }
  if (status !== undefined && /^\d{3} (\{|status code)/.test(first))
    return { kind: 'api-error', status, type: errorType };
  if (/^Document too large/.test(first)) return { kind: 'too-large' };
  if (/Document exceeded token limits/.test(first)) return { kind: 'incomplete' };
  if (/response contained no text/.test(first)) return { kind: 'no-text' };
  return { kind: 'error' };
}

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clip(text, max = 300) {
  if (text == null) return null;
  const s = String(text);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Read one attempt. `base` is <run-dir>/<lang>/<fixture-stem>/<i> (or <i>.infra<k> for an attempt
 * --redraw-infra replaced): <base>/ the init target, <base>.log, <base>.json the report, <base>.exit.
 */
function readAttempt(base, fixture, config, warnings) {
  const marker = readMarker(base);
  const record = {
    status: 'not-run',
    kind: null,
    category: null,
    stopReason: null,
    httpStatus: null,
    errorType: null,
    message: null,
    exitCode: marker?.exitCode ?? null,
    startedAt: marker?.startedAt ?? null,
    finishedAt: marker?.finishedAt ?? null,
    elapsedMs: null,
    output: fs.existsSync(path.join(base, fixture)),
    reported: false,
    costUSD: null,
    priced: false,
    usage: null,
    servedModels: [],
    retries: null,
  };
  if (config.markers && !marker) return record; // never finished: excluded, the cell is INCOMPLETE

  if (!config.reports) {
    // Legacy rule: the output file decides; the report line only explains a refusal.
    if (record.output) {
      record.status = 'ok';
      return record;
    }
    const failure = readLegacyFailure(base, fixture);
    let classified;
    if (failure.state === 'ok') {
      classified = classifyFailureMessage(failure.message);
      record.message = clip(failure.message);
    } else {
      classified = { kind: failure.state === 'missing' ? 'no-report' : 'error' };
      record.message = clip(
        logReason(base) ??
          (failure.state === 'missing' ? 'no TRANSLATION-REPORT.md' : 'no failure line')
      );
    }
    record.status = classified.kind === 'infra' ? 'infra' : 'failed';
    record.kind = classified.kind;
    record.category = classified.category ?? null;
    record.stopReason = classified.stopReason ?? null;
    record.httpStatus = classified.status ?? null;
    record.errorType = classified.type ?? null;
    return record;
  }

  const reportPath = `${base}.json`;
  let report = null;
  if (fs.existsSync(reportPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const schema = typeof parsed.schema === 'string' ? parsed.schema : '';
        if (schema === REPORT_SCHEMA) {
          report = parsed;
        } else if (schema.startsWith('translate-init-report/')) {
          warnings.push(
            `${reportPath}: report schema ${schema} is newer than ${REPORT_SCHEMA}; reading the fields it shares`
          );
          report = parsed;
        } else {
          warnings.push(
            `${reportPath}: not a translate init report (schema '${schema}'); counted as no report`
          );
        }
      } else {
        warnings.push(`${reportPath}: not a JSON object; counted as no report`);
      }
    } catch (error) {
      warnings.push(
        `${reportPath}: unparseable (${error instanceof Error ? error.message : error}); counted as no report`
      );
    }
  }

  const lectures = Array.isArray(report?.lectures)
    ? report.lectures.filter((l) => l && typeof l === 'object')
    : [];
  const entry =
    lectures.find(
      (l) => l.file === fixture || (typeof l.file === 'string' && l.file.endsWith(`/${fixture}`))
    ) ?? (lectures.length === 1 ? lectures[0] : null);
  if (!report || !entry) {
    if (report && !entry)
      warnings.push(`${reportPath}: no lecture entry for ${fixture}; counted as no report`);
    record.status = 'failed';
    record.kind = 'no-report';
    record.message = clip(logReason(base) ?? `exit ${record.exitCode ?? '?'} and no report`);
    return record;
  }

  record.reported = true;
  record.costUSD = num(report.costUSD);
  record.priced = record.costUSD !== null;
  const usage = report.usage && typeof report.usage === 'object' ? report.usage : {};
  record.usage = {
    inputTokens: num(usage.inputTokens),
    outputTokens: num(usage.outputTokens),
    thinkingTokens: num(usage.thinkingTokens),
    cacheReadInputTokens: num(usage.cacheReadInputTokens),
    cacheCreationInputTokens: num(usage.cacheCreationInputTokens),
    apiCalls: num(usage.apiCalls),
  };
  record.servedModels = Array.isArray(report.servedModels)
    ? report.servedModels.filter((s) => typeof s === 'string')
    : [];
  record.retries = num(report.retries) ?? num(entry.retries);
  record.elapsedMs = num(entry.elapsedMs);
  if (entry.outcome === 'ok') {
    record.status = 'ok';
    if (!record.output) warnings.push(`${base}: the report says ok but ${fixture} was not written`);
    return record;
  }
  const failure = entry.failure && typeof entry.failure === 'object' ? entry.failure : {};
  const kind = typeof failure.kind === 'string' && failure.kind ? failure.kind : 'error';
  record.status = kind === 'infra' ? 'infra' : 'failed';
  record.kind = kind;
  record.category = typeof failure.category === 'string' ? failure.category : null;
  record.stopReason = typeof failure.stopReason === 'string' ? failure.stopReason : null;
  record.httpStatus = num(failure.status);
  record.errorType = typeof failure.type === 'string' ? failure.type : null;
  record.message = clip(
    typeof failure.message === 'string' ? failure.message : `outcome ${entry.outcome}`
  );
  return record;
}

// ─── one cell ───────────────────────────────────────────────────────────────

function fixtureStem(fixture) {
  return fixture.endsWith('.md') ? fixture.slice(0, -3) : fixture;
}

/** Attempts --redraw-infra moved aside for draw i: <i>.infra<k>.exit markers, oldest first. */
function archivedAttempts(cellDir, i) {
  if (!fs.existsSync(cellDir)) return [];
  const re = new RegExp(`^${i}\\.infra(\\d+)\\.exit$`);
  return fs
    .readdirSync(cellDir)
    .map((name) => re.exec(name))
    .filter(Boolean)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b)
    .map((k) => ({ k, base: path.join(cellDir, `${i}.infra${k}`) }));
}

function mean(values) {
  const xs = values.filter((v) => v !== null);
  return xs.length > 0 ? xs.reduce((s, v) => s + v, 0) / xs.length : null;
}

function sum(values) {
  const xs = values.filter((v) => v !== null);
  return xs.length > 0 ? xs.reduce((s, v) => s + v, 0) : null;
}

function countBy(items, key) {
  const out = {};
  for (const item of items) {
    const k = key(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function summarizeCell(config, lang, fixture, warnings) {
  const cellDir = path.join(config.runDir, lang, fixtureStem(fixture));
  const current = [];
  const archived = [];
  for (let i = 1; i <= config.draws; i++) {
    current.push({
      draw: i,
      attempt: 'current',
      ...readAttempt(path.join(cellDir, String(i)), fixture, config, warnings),
    });
    for (const { k, base } of archivedAttempts(cellDir, i)) {
      archived.push({
        draw: i,
        attempt: `infra${k}`,
        ...readAttempt(base, fixture, { ...config, markers: true }, warnings),
      });
    }
  }
  const completed = current.filter((a) => a.status !== 'not-run');
  const notRun = current.length - completed.length;
  const ok = completed.filter((a) => a.status === 'ok').length;
  const failedAttempts = completed.filter((a) => a.status === 'failed');
  const failed = failedAttempts.length;
  const infra = completed.filter((a) => a.status === 'infra').length;
  const noReport = failedAttempts.filter((a) => a.kind === 'no-report').length;
  const archivedDone = archived.filter((a) => a.status !== 'not-run');
  const attempts = completed.length + archivedDone.length;
  const infraAttempts = infra + archivedDone.filter((a) => a.status === 'infra').length;
  const valid = ok + failed;
  // The legacy rule judges each draw on its FIRST completed attempt, which is all a control at an
  // old tag (no --redraw-infra) ever sees. archived is ordered by draw, then k ascending, so the
  // first archived entry of a draw is its infra1. Counting archived attempts on top of the current
  // ones instead would count a draw redrawn twice twice, and n would stop being the draws.
  const first = new Map();
  for (const a of archivedDone) if (!first.has(a.draw)) first.set(a.draw, a);
  for (const a of completed) if (!first.has(a.draw)) first.set(a.draw, a);
  const legacyDraws = first.size;
  const refused = [...first.values()].filter((a) => !a.output).length;

  let verdict;
  if (config.reports) {
    if (failed > config.threshold) verdict = 'FAIL';
    else if (notRun > 0) verdict = 'INCOMPLETE';
    else if (attempts > 0 && infraAttempts / attempts > INFRA_THRESHOLD) verdict = 'UNRELIABLE';
    else verdict = 'ok';
  } else if (refused > config.threshold) verdict = 'FAIL';
  else if (notRun > 0) verdict = 'INCOMPLETE';
  else verdict = 'ok';

  const all = [...completed, ...archivedDone];
  const reported = all.filter((a) => a.reported);
  const priced = reported.filter((a) => a.priced);
  const okAttempts = completed.filter((a) => a.status === 'ok');
  const tokenTotal = (field) => sum(reported.map((a) => a.usage[field]));
  const costUSDTotal = sum(priced.map((a) => a.costUSD));
  const unpricedDraws = reported.length - priced.length;
  const ci = wilson(failed, valid);

  return {
    fixture,
    language: lang,
    verdict,
    draws: config.draws,
    completed: completed.length,
    notRun,
    attempts,
    ok,
    failed,
    infra,
    noReport,
    valid,
    redrawnInfra: archivedDone.length,
    infraShare: attempts > 0 ? infraAttempts / attempts : null,
    failureRate: valid > 0 ? failed / valid : null,
    wilson: { lo: ci.lo, hi: ci.hi },
    byKind: countBy(failedAttempts, (a) => a.kind),
    infraByStatus: countBy(
      all.filter((a) => a.status === 'infra'),
      (a) => (a.httpStatus === null ? 'no-status' : String(a.httpStatus))
    ),
    refusalCategories: countBy(
      failedAttempts.filter((a) => a.kind === 'model-refusal'),
      (a) => a.category ?? 'none'
    ),
    legacy: { refused, draws: legacyDraws, verdict: refused > config.threshold ? 'FAIL' : 'ok' },
    // per draw: the current attempt of each completed draw; the totals below are all spend in the
    // cell, replaced infra attempts and failures included (cost per delivered file = total / ok)
    meanCostUSD: mean(completed.filter((a) => a.priced).map((a) => a.costUSD)),
    costUSDTotal,
    costUSDOkTotal: sum(okAttempts.filter((a) => a.priced).map((a) => a.costUSD)),
    costUSDPerOk: ok > 0 && costUSDTotal !== null && unpricedDraws === 0 ? costUSDTotal / ok : null,
    pricedDraws: priced.length,
    unpricedDraws,
    unreportedDraws: config.reports ? all.length - reported.length : null,
    meanOutputTokens: mean(completed.filter((a) => a.reported).map((a) => a.usage.outputTokens)),
    meanThinkingTokens: mean(
      completed.filter((a) => a.reported).map((a) => a.usage.thinkingTokens)
    ),
    meanOutputTokensOk: mean(okAttempts.filter((a) => a.reported).map((a) => a.usage.outputTokens)),
    meanLatencyMs: mean(completed.map((a) => a.elapsedMs)),
    meanLatencyMsOk: mean(okAttempts.map((a) => a.elapsedMs)),
    tokens: {
      input: tokenTotal('inputTokens'),
      output: tokenTotal('outputTokens'),
      thinking: tokenTotal('thinkingTokens'),
      cacheRead: tokenTotal('cacheReadInputTokens'),
      cacheWrite: tokenTotal('cacheCreationInputTokens'),
      apiCalls: tokenTotal('apiCalls'),
    },
    retries: sum(reported.map((a) => a.retries)),
    servedModels: [...new Set(all.flatMap((a) => a.servedModels))].sort(),
    drawsDetail: [...current, ...archived].map((a) => ({
      draw: a.draw,
      attempt: a.attempt,
      status: a.status,
      kind: a.kind,
      category: a.category,
      stopReason: a.stopReason,
      httpStatus: a.httpStatus,
      errorType: a.errorType,
      message: a.message,
      exitCode: a.exitCode,
      output: a.output,
      startedAt: a.startedAt,
      finishedAt: a.finishedAt,
      elapsedMs: a.elapsedMs,
      costUSD: a.costUSD,
      inputTokens: a.usage?.inputTokens ?? null,
      outputTokens: a.usage?.outputTokens ?? null,
      thinkingTokens: a.usage?.thinkingTokens ?? null,
      cacheReadInputTokens: a.usage?.cacheReadInputTokens ?? null,
      cacheCreationInputTokens: a.usage?.cacheCreationInputTokens ?? null,
      retries: a.retries,
      servedModels: a.servedModels,
    })),
  };
}

// ─── the run ────────────────────────────────────────────────────────────────

export function summarizeRun(runDir) {
  const config = readRunConfig(runDir);
  const warnings = [];
  const cells = [];
  for (const lang of config.langs) {
    for (const fixture of config.fixtures)
      cells.push(summarizeCell(config, lang, fixture, warnings));
  }
  const tally = (v) => cells.filter((c) => c.verdict === v).length;
  const verdict = ['FAIL', 'INCOMPLETE', 'UNRELIABLE'].find((v) => tally(v) > 0) ?? 'ok';
  const summary = {
    schema: SUMMARY_SCHEMA,
    generatedAt: new Date().toISOString(),
    runDir,
    classification: config.reports ? 'report' : 'legacy',
    engine: config.engine,
    model: config.model,
    localize: config.localize,
    localizeRules: config.localizeRules,
    sourceDir: config.sourceDir,
    languages: config.langs,
    fixtures: config.fixtures,
    fixturesSha256: config.fixturesSha256,
    draws: config.draws,
    threshold: config.threshold,
    infraThreshold: INFRA_THRESHOLD,
    startedAt: config.startedAt,
    resumedAt: config.resumedAt,
    verdict,
    exitCode: verdict === 'ok' ? 0 : 1,
    totals: {
      cells: cells.length,
      ok: tally('ok'),
      fail: tally('FAIL'),
      unreliable: tally('UNRELIABLE'),
      incomplete: tally('INCOMPLETE'),
    },
    warnings,
    cells,
  };
  return { config, summary };
}

// ─── text ───────────────────────────────────────────────────────────────────

function pct(x) {
  return x === null ? '—' : `${(100 * x).toFixed(1)}%`;
}

function usd(x) {
  return x === null ? 'unpriced' : `$${x.toFixed(4)}`;
}

function tokens(x) {
  return x === null ? '—' : Math.round(x).toLocaleString('en-US');
}

function seconds(ms) {
  return ms === null ? '—' : `${(ms / 1000).toFixed(1)} s`;
}

function table(rows) {
  const widths = rows[0].map((_, col) => Math.max(...rows.map((r) => String(r[col]).length)));
  return rows.map((r) =>
    r
      .map((cell, col) => String(cell).padEnd(widths[col]))
      .join('  ')
      .trimEnd()
  );
}

/** "kind ×n" pairs, most frequent first; refusals carry their categories. */
function kindList(cell) {
  return Object.entries(cell.byKind)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([kind, n]) => {
      if (kind !== 'model-refusal') return `${kind} ×${n}`;
      const cats = Object.entries(cell.refusalCategories)
        .map(([c, k]) => `${c} ×${k}`)
        .join(', ');
      return `${kind} ×${n} (${cats})`;
    })
    .join(', ');
}

/**
 * One line per distinct (kind, reason), as the old reasons list did. A parity message's
 * violations are on its continuation lines, so those are folded into the reason.
 */
function reasonLines(cell) {
  const groups = new Map();
  for (const d of cell.drawsDetail) {
    if (d.status !== 'failed' && d.status !== 'infra') continue;
    const head = (d.message ?? '').replace(/:?\s*\n\s*(?:-\s+)?/g, ': ').trim();
    const key = `${d.status === 'infra' ? 'infra' : d.kind}${d.category ? ` (${d.category})` : ''} — ${clip(head, 160)}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  return [...groups.entries()].sort((a, b) => b[1] - a[1]).map(([key, n]) => `      ${n} × ${key}`);
}

export function renderText(summary) {
  const e = summary.engine;
  const lines = [];
  lines.push(
    `engine ${e.tag ?? '(untagged)'} ${e.sha ?? '?'}` +
      `${e.version ? ` · package.json ${e.version}` : ''}${e.sdkVersion ? ` · SDK ${e.sdkVersion}` : ''}` +
      `${e.ref ? ` · --ref ${e.ref}${e.refDeps ? ` (deps ${e.refDeps})` : ''}` : ''}` +
      ` · model ${summary.model ?? '?'} · ${summary.draws} draws per cell · threshold ${summary.threshold}`
  );
  lines.push(
    `localize ${summary.localize}${summary.localizeRules ? ` (${summary.localizeRules.join(', ') || 'no rules'})` : ''}` +
      ` · fixtures from ${summary.sourceDir ?? 'test-action-on-github-data/'}`
  );
  if (summary.classification === 'report') {
    lines.push(
      'classified from init --report-json: failed = every non-infra failure (a draw with no report counts);',
      `infra (429 / 5xx / overload / connection) excluded; a cell above ${100 * INFRA_THRESHOLD}% infra is UNRELIABLE`
    );
  } else {
    lines.push(
      'legacy rule (this engine has no init --report-json): a draw without its output file counts as refused,',
      'infra failures included; the kinds below are read from TRANSLATION-REPORT.md for information'
    );
  }
  lines.push('');

  if (summary.classification === 'report') {
    const rows = [
      [
        'fixture',
        'language',
        'ok',
        'failed',
        'infra',
        'no-rep',
        'failure rate [95% CI]',
        '$/draw',
        'out tok',
        'thinking',
        'latency',
        'verdict',
      ],
    ];
    for (const c of summary.cells) {
      const rate =
        c.valid > 0
          ? `${c.failed}/${c.valid} ${pct(c.failureRate)} [${pct(c.wilson.lo)}, ${pct(c.wilson.hi)}]`
          : 'no valid draws';
      rows.push([
        c.fixture,
        c.language,
        c.ok,
        c.failed,
        c.infra,
        c.noReport,
        rate,
        c.pricedDraws > 0 ? usd(c.meanCostUSD) : c.unpricedDraws > 0 ? 'unpriced' : '—',
        tokens(c.meanOutputTokens),
        tokens(c.meanThinkingTokens),
        seconds(c.meanLatencyMs),
        c.verdict,
      ]);
    }
    const rendered = table(rows);
    lines.push(rendered[0]);
    summary.cells.forEach((c, idx) => {
      lines.push(rendered[idx + 1]);
      if (c.failed > 0) lines.push(`      failed: ${kindList(c)}`);
      if (c.infra > 0 || c.redrawnInfra > 0) {
        lines.push(
          `      infra: ${c.infra + c.drawsDetail.filter((d) => d.attempt !== 'current' && d.status === 'infra').length} of ${c.attempts} attempts (${pct(c.infraShare)})` +
            `${c.redrawnInfra > 0 ? `, ${c.redrawnInfra} redrawn` : ''}`
        );
      }
      if (c.notRun > 0) lines.push(`      ${c.notRun} of ${c.draws} planned draws never finished`);
      lines.push(...reasonLines(c));
    });
  } else {
    const rows = [['fixture', 'language', 'refused/draws', 'rate', 'verdict']];
    for (const c of summary.cells) {
      rows.push([
        c.fixture,
        c.language,
        `${c.legacy.refused}/${c.legacy.draws}`,
        `${Math.trunc((100 * c.legacy.refused) / Math.max(1, c.legacy.draws))}%`,
        c.verdict,
      ]);
    }
    const rendered = table(rows);
    lines.push(rendered[0]);
    summary.cells.forEach((c, idx) => {
      lines.push(rendered[idx + 1]);
      if (c.notRun > 0) lines.push(`      ${c.notRun} of ${c.draws} planned draws never finished`);
      lines.push(...reasonLines(c));
    });
  }
  return lines.join('\n');
}

function closingLines(summary, summaryPath) {
  const out = [];
  const draws = summary.draws;
  const k = summary.threshold;
  if (summary.totals.fail > 0) {
    out.push(
      `✗ A cell is over the threshold. One draw per scenario would have passed this at ~${100 - Math.trunc((100 * k) / draws)}% or better; the gate cannot see it — do not release on the gate alone.`,
      '  Next: a same-day control decides whether this release caused it (AGENTS.md, release checklist step 4b).'
    );
    if (summary.classification === 'report') {
      out.push(
        '  A control at a ref without init --report-json (v0.29.5 and older) is scored by the legacy rule:',
        '  compare the two runs on cells[].legacy (refused of draws) in each summary.json, not on this table.',
        '  legacy judges each draw on its first attempt, so a run topped up with --redraw-infra still compares.'
      );
    }
  }
  if (summary.totals.incomplete > 0) {
    out.push(
      `⚠ INCOMPLETE: a cell has planned draws that never finished (interrupted, or still running).`,
      `  Continue the run with the same flags plus: --run-dir ${summary.runDir} --resume`
    );
  }
  if (summary.totals.unreliable > 0) {
    out.push(
      `⚠ UNRELIABLE: more than ${100 * INFRA_THRESHOLD}% of a cell's attempts hit infrastructure errors (rate limits, overloads,`,
      '  server errors, dropped connections). The count excludes them, so the cell gives no verdict: re-run the cell,',
      '  ideally at another time. --run-dir <dir> --resume --redraw-infra tops up its valid draws, but the replaced',
      '  infra attempts stay in the share.'
    );
  }
  if (summary.verdict === 'ok') out.push(`✓ Every cell within threshold. Summary: ${summaryPath}`);
  return out;
}

function writeAtomic(file, text) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

// ─── main ───────────────────────────────────────────────────────────────────

function main(argv) {
  if (argv[0] === '--list-infra') {
    if (argv.length !== 2)
      throw new UsageError('usage: rate-check-summary.mjs --list-infra <run-dir>');
    const { summary } = summarizeRun(path.resolve(argv[1]));
    for (const c of summary.cells) {
      for (const d of c.drawsDetail) {
        if (d.attempt === 'current' && d.status === 'infra')
          console.log(`${c.language}/${fixtureStem(c.fixture)}/${d.draw}`);
      }
    }
    return 0;
  }
  if (argv.length !== 1 || argv[0].startsWith('-')) {
    throw new UsageError('usage: rate-check-summary.mjs <run-dir> | --list-infra <run-dir>');
  }
  const runDir = path.resolve(argv[0]);
  const { summary } = summarizeRun(runDir);
  const summaryPath = path.join(runDir, 'summary.txt');
  const text = renderText(summary);
  writeAtomic(summaryPath, `${text}\n`);
  writeAtomic(path.join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(text);
  const closing = closingLines(summary, summaryPath);
  if (closing.length > 0) console.log(`\n${closing.join('\n')}`);
  for (const w of summary.warnings) console.error(`warning: ${w}`);
  return summary.exitCode;
}

// Real paths on both sides: run from a symlinked checkout (or under --preserve-symlinks-main), the
// two name one file differently, and a URL comparison made every direct run exit 0 with no summary.
let invokedDirectly = false;
try {
  invokedDirectly =
    Boolean(process.argv[1]) &&
    fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1]);
} catch {
  // imported, or argv[1] is not a file
}
if (invokedDirectly) {
  let code;
  try {
    code = main(process.argv.slice(2));
  } catch (error) {
    console.error(`rate-check-summary: ${error instanceof Error ? error.message : String(error)}`);
    if (!(error instanceof UsageError) && error instanceof Error && error.stack)
      console.error(error.stack);
    code = 2;
  }
  process.exitCode = code;
}

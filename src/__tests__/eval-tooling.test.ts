/**
 * Evaluation tooling — CI coverage for the release rate check (release step 4b) and the
 * statistics it and the evaluation projects report with (#227).
 *
 * - tool-test-action-on-github/lib/stats.mjs --self-test: every function against values computed
 *   independently (exact rationals; R's mantelhaen.test for CMH).
 * - rate-check-summary.mjs on synthetic run directories: the report classification and its
 *   verdicts (FAIL before UNRELIABLE, INCOMPLETE, a crash and an unreadable report counted as
 *   failures), the legacy rule for engines without --report-json, and a meta.txt from before
 *   this change.
 * - rate-check.sh: `bash -n`, usage errors that stop before any draw, and whole runs at no cost —
 *   this checkout's CLI against a fake Anthropic API (a fetch stub preloaded into every child
 *   process), and a fake legacy engine (an `init` without --report-json).
 *
 * The rate-check runs execute dist/cli/index.js: run `npm run build` first (CI does).
 */

import { ChildProcess, spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const REPO = path.resolve(__dirname, '../..');
const TOOL = path.join(REPO, 'tool-test-action-on-github');
const RATE_CHECK = path.join(TOOL, 'rate-check.sh');
const SUMMARIZER = path.join(TOOL, 'rate-check-summary.mjs');
const STATS = path.join(TOOL, 'lib', 'stats.mjs');
const PRELOAD = path.join(__dirname, 'fixtures', 'fake-anthropic-preload.mjs');
const CLI = path.join(REPO, 'dist', 'cli', 'index.js');

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function run(
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; cwd?: string; timeout?: number } = {}
): RunResult {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    cwd: options.cwd ?? REPO,
    // Every child gets the fetch stub: nothing these tests start can reach the API.
    env: {
      ...process.env,
      ANTHROPIC_API_KEY: 'fake-key-for-tests',
      NODE_OPTIONS: `--import ${PRELOAD}`,
      ...options.env,
    },
    timeout: options.timeout ?? 60_000,
  });
  return { code: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

let scratch: string;
beforeAll(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-tooling-'));
});
afterAll(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

function freshDir(name: string): string {
  const dir = path.join(scratch, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readSummary(runDir: string): any {
  return JSON.parse(fs.readFileSync(path.join(runDir, 'summary.json'), 'utf8'));
}

function cell(summary: any, language: string): any {
  return summary.cells.find((c: any) => c.language === language);
}

// ─── synthetic run directories ──────────────────────────────────────────────

const FIXTURE = 'game-theory.md';

/** A meta.txt as rate-check writes it (KEY='value'). */
function writeMeta(runDir: string, fields: Record<string, string>): void {
  const text = Object.entries(fields)
    .map(([key, value]) => `${key}='${value}'`)
    .join('\n');
  fs.writeFileSync(path.join(runDir, 'meta.txt'), `${text}\n`);
}

function reportMeta(draws: number, langs: string, threshold = 1): Record<string, string> {
  return {
    META_VERSION: '2',
    ENGINE_TAG: 'v0.30.0',
    ENGINE_SHA: 'abc1234',
    ENGINE_VER: '0.30.0',
    SDK_VERSION: '0.131.0',
    MODEL: 'claude-sonnet-5-5',
    DRAWS: String(draws),
    MAX_REFUSALS: String(threshold),
    LANGS: langs,
    FIXTURES: FIXTURE,
    LOCALIZE: 'none',
    LOCALIZE_RULES: '',
    SOURCE_DIR: '',
    REPORTS: '1',
    MARKERS: '1',
  };
}

type Draw =
  | { outcome: 'ok'; costUSD?: number | null; elapsedMs?: number; thinkingTokens?: number }
  | {
      outcome: 'failed';
      kind: string;
      category?: string | null;
      costUSD?: number | null;
      elapsedMs?: number;
      thinkingTokens?: number;
    }
  | { outcome: 'crash' } // finished (marker) without a report
  | { outcome: 'garbled' } // a report cut off mid-write
  | { outcome: 'unfinished' }; // started, never finished: no marker

function initReport(language: string, draw: Draw): object {
  const ok = draw.outcome === 'ok';
  const detail = draw as { costUSD?: number | null; elapsedMs?: number; thinkingTokens?: number };
  const failure =
    draw.outcome === 'failed'
      ? {
          kind: draw.kind,
          message: `${draw.kind} for the test`,
          ...(draw.kind === 'model-refusal' ? { category: draw.category ?? null } : {}),
          ...(draw.kind === 'infra' ? { status: 529, type: 'overloaded_error' } : {}),
        }
      : undefined;
  return {
    schema: 'translate-init-report/1',
    toolVersion: '0.30.0',
    startedAt: '2026-10-20T00:00:00.000Z',
    finishedAt: '2026-10-20T00:01:00.000Z',
    elapsedMs: 60_000,
    model: 'claude-sonnet-5-5',
    sourceLanguage: 'en',
    targetLanguage: language,
    localize: [],
    usage: {
      inputTokens: 2000,
      outputTokens: 900,
      thinkingTokens: detail.thinkingTokens ?? 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 1500,
      apiCalls: 1,
    },
    costUSD: detail.costUSD === undefined ? 0.01 : detail.costUSD,
    servedModels: ['claude-sonnet-5-5'],
    retries: 0,
    summary: { total: 1, ok: ok ? 1 : 0, failed: ok ? 0 : 1, skipped: 0 },
    lectures: [
      {
        file: FIXTURE,
        outcome: ok ? 'ok' : 'failed',
        failure,
        elapsedMs: detail.elapsedMs ?? 1000,
      },
    ],
  };
}

function writeDraws(runDir: string, language: string, draws: Draw[]): void {
  const cellDir = path.join(runDir, language, 'game-theory');
  fs.mkdirSync(cellDir, { recursive: true });
  draws.forEach((draw, index) => {
    const base = path.join(cellDir, String(index + 1));
    fs.mkdirSync(base, { recursive: true });
    fs.writeFileSync(`${base}.log`, draw.outcome === 'crash' ? '\n❌ simulated crash\n' : 'log\n');
    if (draw.outcome === 'unfinished') return;
    const exit = draw.outcome === 'ok' ? 0 : 1;
    fs.writeFileSync(
      `${base}.exit`,
      `exit=${exit}\nstart=2026-10-20T00:00:00Z\nend=2026-10-20T00:01:00Z\n`
    );
    if (draw.outcome === 'ok') fs.writeFileSync(path.join(base, FIXTURE), '# translated\n');
    if (draw.outcome === 'crash') return;
    if (draw.outcome === 'garbled') {
      fs.writeFileSync(`${base}.json`, '{"schema": "translate-init-report/1", "lectu');
      return;
    }
    fs.writeFileSync(`${base}.json`, JSON.stringify(initReport(language, draw)));
  });
}

const OK: Draw = { outcome: 'ok' };
const INFRA: Draw = { outcome: 'failed', kind: 'infra' };
const PARITY: Draw = { outcome: 'failed', kind: 'parity' };

describe('lib/stats.mjs', () => {
  it('passes its self-test (reference values, exact or from R)', () => {
    const result = run('node', [STATS, '--self-test']);
    expect(result.stderr).toBe('');
    expect(result.stdout).toMatch(/all \d+ checks pass/);
    expect(result.code).toBe(0);
  });
});

describe('rate-check-summary.mjs — classified from init reports', () => {
  let runDir: string;
  let result: RunResult;
  let summary: any;

  beforeAll(() => {
    runDir = freshDir('report-run');
    writeMeta(runDir, reportMeta(6, 'zh-cn,fa,ml,fr'));
    // ok, parity, refusal (bio), truncated, infra ×1, a crash with no report
    writeDraws(runDir, 'zh-cn', [
      OK,
      PARITY,
      { outcome: 'failed', kind: 'model-refusal', category: 'bio' },
      { outcome: 'failed', kind: 'truncated' },
      INFRA,
      { outcome: 'crash' },
    ]);
    writeDraws(runDir, 'fa', [OK, OK, OK, OK, OK, INFRA]); // 1/6 infra, no failure
    writeDraws(runDir, 'ml', [
      ...Array.from(
        { length: 5 },
        (): Draw => ({
          outcome: 'ok',
          costUSD: 0.01,
          elapsedMs: 1000,
          thinkingTokens: 100,
        })
      ),
      { outcome: 'failed', kind: 'parity', costUSD: 0.03, elapsedMs: 4000, thinkingTokens: 100 },
    ]);
    writeDraws(runDir, 'fr', [OK, OK, OK, OK, OK, { outcome: 'unfinished' }]);
    result = run('node', [SUMMARIZER, runDir]);
    summary = readSummary(runDir);
  });

  it('exits 1 when any cell does not pass, and writes summary.txt', () => {
    expect(result.code).toBe(1);
    expect(fs.readFileSync(path.join(runDir, 'summary.txt'), 'utf8')).toContain('UNRELIABLE');
    expect(result.stdout).toContain('A cell is over the threshold');
    expect(result.stdout).toContain('INCOMPLETE');
  });

  it('classifies every draw, a crash with no report as a failure', () => {
    const c = cell(summary, 'zh-cn');
    expect(c).toMatchObject({ draws: 6, completed: 6, ok: 1, failed: 4, infra: 1, noReport: 1 });
    expect(c.valid).toBe(5);
    expect(c.byKind).toEqual({ parity: 1, 'model-refusal': 1, truncated: 1, 'no-report': 1 });
    expect(c.refusalCategories).toEqual({ bio: 1 });
    expect(c.failureRate).toBeCloseTo(0.8, 10);
    // Wilson 95% for 4/5 (exact reference: 0.3755346270, 0.9637758918)
    expect(c.wilson.lo).toBeCloseTo(0.375534627, 8);
    expect(c.wilson.hi).toBeCloseTo(0.9637758918, 8);
    expect(c.infraShare).toBeCloseTo(1 / 6, 10);
  });

  it('gives FAIL precedence over UNRELIABLE (more draws can only add failures)', () => {
    expect(cell(summary, 'zh-cn').verdict).toBe('FAIL');
  });

  it('marks a cell UNRELIABLE when infra exceeds 10% of its attempts, with no failure', () => {
    const c = cell(summary, 'fa');
    expect(c).toMatchObject({ ok: 5, failed: 0, infra: 1, valid: 5, verdict: 'UNRELIABLE' });
    expect(c.wilson.lo).toBe(0);
  });

  it('passes a cell at the threshold and reports its cost per delivered file', () => {
    const c = cell(summary, 'ml');
    expect(c).toMatchObject({ ok: 5, failed: 1, infra: 0, verdict: 'ok' });
    expect(c.costUSDTotal).toBeCloseTo(0.08, 10);
    expect(c.costUSDOkTotal).toBeCloseTo(0.05, 10);
    expect(c.costUSDPerOk).toBeCloseTo(0.016, 10); // all spend, the failure included, per success
    expect(c.meanCostUSD).toBeCloseTo(0.08 / 6, 10);
    expect(c.unpricedDraws).toBe(0);
    expect(c.meanThinkingTokens).toBe(100);
    expect(c.meanLatencyMs).toBe(1500);
    expect(c.meanLatencyMsOk).toBe(1000);
    expect(c.servedModels).toEqual(['claude-sonnet-5-5']);
  });

  it('marks a cell with an unfinished draw INCOMPLETE and leaves that draw out', () => {
    const c = cell(summary, 'fr');
    expect(c).toMatchObject({ completed: 5, notRun: 1, ok: 5, valid: 5, verdict: 'INCOMPLETE' });
  });

  it('carries the legacy no-output-file count for every cell', () => {
    expect(cell(summary, 'zh-cn').legacy).toEqual({ refused: 5, draws: 6, verdict: 'FAIL' });
    expect(cell(summary, 'fa').legacy).toEqual({ refused: 1, draws: 6, verdict: 'ok' });
  });

  it('writes the summary.json shape other tools read', () => {
    expect(summary).toMatchObject({
      schema: 'rate-check-summary/1',
      classification: 'report',
      model: 'claude-sonnet-5-5',
      localize: 'none',
      localizeRules: [],
      draws: 6,
      threshold: 1,
      infraThreshold: 0.1,
      verdict: 'FAIL',
      exitCode: 1,
      totals: { cells: 4, ok: 1, fail: 1, unreliable: 1, incomplete: 1 },
    });
    expect(summary.engine).toMatchObject({
      tag: 'v0.30.0',
      sha: 'abc1234',
      version: '0.30.0',
      sdkVersion: '0.131.0',
      reportJson: true,
    });
    const keys = [
      'fixture',
      'language',
      'verdict',
      'draws',
      'completed',
      'notRun',
      'attempts',
      'ok',
      'failed',
      'infra',
      'noReport',
      'valid',
      'redrawnInfra',
      'infraShare',
      'failureRate',
      'wilson',
      'byKind',
      'refusalCategories',
      'legacy',
      'meanCostUSD',
      'costUSDTotal',
      'costUSDOkTotal',
      'costUSDPerOk',
      'unpricedDraws',
      'meanOutputTokens',
      'meanThinkingTokens',
      'meanLatencyMs',
      'tokens',
      'servedModels',
      'drawsDetail',
    ];
    for (const c of summary.cells) expect(Object.keys(c)).toEqual(expect.arrayContaining(keys));
    expect(cell(summary, 'zh-cn').drawsDetail[0]).toMatchObject({
      draw: 1,
      attempt: 'current',
      status: 'ok',
      exitCode: 0,
      startedAt: '2026-10-20T00:00:00Z',
    });
  });

  it('lists the infra draws for --redraw-infra', () => {
    const listed = run('node', [SUMMARIZER, '--list-infra', runDir]);
    expect(listed.code).toBe(0);
    expect(listed.stdout.trim().split('\n').sort()).toEqual([
      'fa/game-theory/6',
      'zh-cn/game-theory/5',
    ]);
  });

  it('runs the same way through rate-check.sh --summarize', () => {
    const again = run('bash', [RATE_CHECK, '--summarize', runDir]);
    expect(again.code).toBe(1);
    expect(again.stdout).toContain('UNRELIABLE');
  });
});

describe('rate-check-summary.mjs — edge cases', () => {
  it('counts an unreadable report as a failure, warns, and passes a cell at the threshold', () => {
    const runDir = freshDir('garbled-run');
    writeMeta(runDir, reportMeta(3, 'zh-cn'));
    writeDraws(runDir, 'zh-cn', [OK, OK, { outcome: 'garbled' }]);
    const result = run('node', [SUMMARIZER, runDir]);
    expect(result.code).toBe(0);
    expect(result.stderr).toContain('unparseable');
    expect(result.stdout).toContain('Every cell within threshold');
    expect(cell(readSummary(runDir), 'zh-cn')).toMatchObject({
      ok: 2,
      failed: 1,
      noReport: 1,
      verdict: 'ok',
    });
  });

  it('exits 2 — never 1 — when it cannot read the run', () => {
    expect(run('node', [SUMMARIZER, freshDir('no-meta')]).code).toBe(2);
    const badMeta = freshDir('bad-meta');
    writeMeta(badMeta, { DRAWS: 'twelve', MAX_REFUSALS: '1', LANGS: 'zh-cn', FIXTURES: FIXTURE });
    const bad = run('node', [SUMMARIZER, badMeta]);
    expect(bad.code).toBe(2);
    expect(bad.stderr).toContain('DRAWS');
    expect(run('node', [SUMMARIZER]).code).toBe(2);
  });

  it("scores the legacy rule on each draw's first attempt, as an old-tag control sees it", () => {
    const runDir = freshDir('legacy-first-attempt');
    writeMeta(runDir, reportMeta(1, 'zh-cn', 0));
    writeDraws(runDir, 'zh-cn', [OK]);
    // draw 1's first attempt was an infra failure (no output), moved aside by --redraw-infra
    const replaced = path.join(runDir, 'zh-cn', 'game-theory', '1.infra1');
    fs.mkdirSync(replaced, { recursive: true });
    fs.writeFileSync(`${replaced}.log`, 'log\n');
    fs.writeFileSync(
      `${replaced}.exit`,
      'exit=1\nstart=2026-10-20T00:00:00Z\nend=2026-10-20T00:01:00Z\n'
    );
    fs.writeFileSync(`${replaced}.json`, JSON.stringify(initReport('zh-cn', INFRA)));
    const result = run('node', [SUMMARIZER, runDir]);
    expect(result.code).toBe(1);
    const c = cell(readSummary(runDir), 'zh-cn');
    // the classified counts are unchanged: the redrawn draw is ok, its infra attempt in the share
    expect(c).toMatchObject({ ok: 1, failed: 0, infra: 0, redrawnInfra: 1, attempts: 2 });
    expect(c.infraShare).toBe(0.5);
    expect(c.legacy).toEqual({ refused: 1, draws: 1, verdict: 'FAIL' });
  });
});

describe('rate-check-summary.mjs — legacy engines (no --report-json)', () => {
  function writeLegacyDraw(
    cellDir: string,
    i: number,
    draw: { output?: boolean; failure?: string; log?: string }
  ): void {
    const base = path.join(cellDir, String(i));
    fs.mkdirSync(base, { recursive: true });
    fs.writeFileSync(`${base}.log`, draw.log ?? 'log\n');
    fs.writeFileSync(`${base}.exit`, `exit=${draw.output ? 0 : 1}\n`);
    if (draw.output) fs.writeFileSync(path.join(base, FIXTURE), '# translated\n');
    if (draw.output || draw.failure) {
      const failures = draw.failure ? `\n## Failures\n\n- **${FIXTURE}**: ${draw.failure}\n` : '';
      fs.writeFileSync(
        path.join(base, 'TRANSLATION-REPORT.md'),
        `# Translation Report\n\n## Summary\n\n- **Failed**: ${draw.output ? 0 : 1}\n${failures}\n## Next Steps\n\n1. Review\n`
      );
    }
  }

  it('keeps the release-4b rule: every draw without its output counts, infra included', () => {
    const runDir = freshDir('legacy-run');
    writeMeta(runDir, { ...reportMeta(3, 'zh-cn,fa'), REPORTS: '0' });
    const zh = path.join(runDir, 'zh-cn', 'game-theory');
    writeLegacyDraw(zh, 1, { output: true });
    writeLegacyDraw(zh, 2, {
      failure: `structural parity check failed for ${FIXTURE}:\n  - directive #1 name changed: source line 15 has {raw}, output line 45 has {index}`,
    });
    writeLegacyDraw(zh, 3, {
      failure: '529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
    });
    const fa = path.join(runDir, 'fa', 'game-theory');
    writeLegacyDraw(fa, 1, { output: true });
    writeLegacyDraw(fa, 2, { output: true });
    writeLegacyDraw(fa, 3, { log: '\n❌ File not found in _toc.yml: game-theory.md\n' });

    const result = run('node', [SUMMARIZER, runDir]);
    expect(result.code).toBe(1);
    const summary = readSummary(runDir);
    expect(summary.classification).toBe('legacy');
    // zh-cn: 2 refused of 3 — the infra draw counts under the legacy rule
    expect(cell(summary, 'zh-cn')).toMatchObject({
      verdict: 'FAIL',
      legacy: { refused: 2, verdict: 'FAIL' },
      failed: 1,
      infra: 1,
      byKind: { parity: 1 },
    });
    expect(cell(summary, 'fa')).toMatchObject({
      verdict: 'ok',
      legacy: { refused: 1, verdict: 'ok' },
      byKind: { 'no-report': 1 },
    });
    expect(result.stdout).toContain('refused/draws');
    expect(result.stdout).toContain('File not found in _toc.yml');
  });

  it('reads a stream cut short as infra, as the engine classifies it (run-report.ts)', () => {
    const runDir = freshDir('legacy-stream-cut');
    writeMeta(runDir, { ...reportMeta(3, 'zh-cn'), REPORTS: '0' });
    const zh = path.join(runDir, 'zh-cn', 'game-theory');
    writeLegacyDraw(zh, 1, { failure: 'terminated' });
    writeLegacyDraw(zh, 2, {
      failure: 'stream ended without producing a Message with role=assistant',
    });
    writeLegacyDraw(zh, 3, { failure: 'request ended without sending any chunks' });

    const result = run('node', [SUMMARIZER, runDir]);
    expect(result.code).toBe(1);
    // the legacy verdict still counts every draw without its output; the kinds say infra
    expect(cell(readSummary(runDir), 'zh-cn')).toMatchObject({
      legacy: { refused: 3, verdict: 'FAIL' },
      failed: 0,
      infra: 3,
    });
  });

  it('reads a run directory written before this change (no REPORTS, MARKERS or LOCALIZE)', () => {
    const passing = freshDir('old-format-pass');
    const failing = freshDir('old-format-fail');
    for (const dir of [passing, failing]) {
      fs.writeFileSync(
        path.join(dir, 'meta.txt'),
        [
          "ENGINE_TAG='v0.29.3'",
          "ENGINE_SHA='1a2b3c4'",
          "MODEL='claude-sonnet-5'",
          "DRAWS='2'",
          "MAX_REFUSALS='0'",
          "LANGS='ml'",
          `FIXTURES='${FIXTURE}'`,
          '',
        ].join('\n')
      );
      const out = path.join(dir, 'ml', 'game-theory', '1');
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(path.join(out, FIXTURE), '# translated\n');
      fs.writeFileSync(`${out}.log`, 'log\n');
    }
    // the old script left no markers: draw 2 of `failing` has neither output nor marker
    const second = path.join(passing, 'ml', 'game-theory', '2');
    fs.mkdirSync(second, { recursive: true });
    fs.writeFileSync(path.join(second, FIXTURE), '# translated\n');
    fs.mkdirSync(path.join(failing, 'ml', 'game-theory', '2'), { recursive: true });
    fs.writeFileSync(path.join(failing, 'ml', 'game-theory', '2.log'), '✗ Failed: 1\n');

    const ok = run('bash', [RATE_CHECK, '--summarize', passing]);
    expect(ok.stderr).not.toContain('unbound variable');
    expect(ok.code).toBe(0);
    const fail = run('bash', [RATE_CHECK, '--summarize', failing]);
    expect(fail.stderr).not.toContain('unbound variable');
    expect(fail.code).toBe(1);
    expect(readSummary(failing)).toMatchObject({
      classification: 'legacy',
      engine: { tag: 'v0.29.3', sha: '1a2b3c4' },
      localize: 'none',
      cells: [{ completed: 2, notRun: 0, legacy: { refused: 1 }, verdict: 'FAIL' }],
    });
  });
});

describe('rate-check.sh — arguments', () => {
  it('parses (bash -n)', () => {
    expect(run('bash', ['-n', RATE_CHECK]).code).toBe(0);
  });

  it('stops with exit 2 before any draw on a usage or setup error', () => {
    const outside = path.join(scratch, 'never-created');
    const insideRepo = path.join(REPO, 'rate-check-scratch-must-not-exist');
    const cases: Array<{ args: string[]; env?: NodeJS.ProcessEnv; message: RegExp }> = [
      // relative to the caller's directory (the repository here): refused before anything is made
      { args: ['--run-dir', 'rate-check-scratch-must-not-exist/a/b'], message: /outside the repo/ },
      { args: ['--bogus'], message: /unknown argument/ },
      { args: ['--draws', '0'], message: /--draws/ },
      { args: ['--draws'], message: /needs a value/ },
      { args: ['--resume'], message: /--run-dir/ },
      { args: ['--ref-deps', 'own'], message: /only with --ref/ },
      { args: ['--ref', 'v0.29.5', '--engine-dir', '/tmp'], message: /exclusive/ },
      { args: ['--fixtures', 'lectures/x.md'], message: /plain \.md file names/ },
      { args: ['--fixtures', 'notes.txt'], message: /not a \.md file/ },
      { args: ['--run-dir', insideRepo], message: /outside the repository/ },
      {
        args: ['--run-dir', outside],
        env: { ANTHROPIC_API_KEY: '' },
        message: /ANTHROPIC_API_KEY/,
      },
    ];
    for (const { args, env, message } of cases) {
      const result = run('bash', [RATE_CHECK, ...args], { env });
      expect({ args, code: result.code }).toEqual({ args, code: 2 });
      expect(result.stderr).toMatch(message);
    }
    expect(fs.existsSync(insideRepo)).toBe(false);
    expect(fs.existsSync(outside)).toBe(false);
  });
});

describe('rate-check — never a success-shaped result without a verdict', () => {
  /** A preload that ends one helper (by its file name) at once: exit 0, no output. */
  function silence(name: string): string {
    const file = path.join(scratch, `silence-${name}`);
    fs.writeFileSync(file, `if (process.argv[1]?.endsWith('/${name}')) process.exit(0);\n`);
    return file;
  }

  function failingRun(name: string): string {
    const runDir = freshDir(name);
    writeMeta(runDir, reportMeta(2, 'zh-cn', 0));
    writeDraws(runDir, 'zh-cn', [OK, PARITY]);
    return runDir;
  }

  it('runs from a symlinked checkout (the helpers compare real paths)', () => {
    const link = path.join(freshDir('symlinked'), 'repo');
    fs.symlinkSync(REPO, link);
    const viaLink = path.join(link, 'tool-test-action-on-github');
    const runDir = failingRun('symlinked-run');
    const summarized = run('bash', [path.join(viaLink, 'rate-check.sh'), '--summarize', runDir]);
    expect(summarized.code).toBe(1);
    expect(cell(readSummary(runDir), 'zh-cn')).toMatchObject({ failed: 1, verdict: 'FAIL' });
    const stats = run('node', [path.join(viaLink, 'lib', 'stats.mjs'), '--self-test']);
    expect(stats.stdout).toMatch(/all \d+ checks pass/);
    expect(stats.code).toBe(0);
    const identity = run('node', [
      path.join(viaLink, 'lib', 'run-identity.mjs'),
      '--engine-dir',
      REPO,
      '--languages',
      'zh-cn',
      '--source-dir',
      path.join(TOOL, 'test-action-on-github-data'),
      '--fixtures',
      FIXTURE,
      '--localize',
      'none',
    ]);
    expect(identity.code).toBe(0);
    expect(identity.stdout).toMatch(/^ENGINE_DIST_SHA256='[0-9a-f]{64}'$/m);
  });

  it('exits 2 when the summarizer writes no summary, and leaves no older verdict in place', () => {
    const runDir = failingRun('silent-summarizer');
    fs.writeFileSync(path.join(runDir, 'summary.json'), '{"verdict": "ok", "exitCode": 0}\n');
    fs.writeFileSync(path.join(runDir, 'summary.txt'), 'every cell ok\n');
    const result = run('bash', [RATE_CHECK, '--summarize', runDir], {
      env: { NODE_OPTIONS: `--import ${PRELOAD} --import ${silence('rate-check-summary.mjs')}` },
    });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('wrote no summary.json');
    expect(fs.existsSync(path.join(runDir, 'summary.json'))).toBe(false);
    expect(fs.existsSync(path.join(runDir, 'summary.txt'))).toBe(false);
    // set aside under a name no reader opens, for the record
    expect(fs.readFileSync(path.join(runDir, 'summary.prev.txt'), 'utf8')).toBe('every cell ok\n');
    // and a summarizer that does write replaces it
    expect(run('bash', [RATE_CHECK, '--summarize', runDir]).code).toBe(1);
    expect(readSummary(runDir)).toMatchObject({ verdict: 'FAIL', exitCode: 1 });
    expect(fs.existsSync(path.join(runDir, 'summary.prev.txt'))).toBe(false);
    expect(fs.existsSync(path.join(runDir, 'summary.prev.json'))).toBe(false);
  });

  it('exits 2 before any draw when the engine identity comes back empty', () => {
    const runDir = path.join(freshDir('silent-identity'), 'run');
    const result = run(
      'bash',
      [RATE_CHECK, '--languages', 'zh-cn', '--draws', '1', '--run-dir', runDir],
      {
        env: { NODE_OPTIONS: `--import ${PRELOAD} --import ${silence('run-identity.mjs')}` },
      }
    );
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('run-identity.mjs gave no ENGINE_VER');
    expect(fs.existsSync(path.join(runDir, 'zh-cn'))).toBe(false);
    expect(fs.existsSync(path.join(runDir, '.lock'))).toBe(false);
  });
});

// ─── whole runs, at no cost ─────────────────────────────────────────────────

/** rate-check.sh in its own process group, as a terminal's foreground job is, with the fetch stub. */
function startRateCheck(
  args: string[],
  env: NodeJS.ProcessEnv = {}
): { child: ChildProcess; exited: Promise<number | null> } {
  const child = spawn('bash', [RATE_CHECK, ...args], {
    cwd: REPO,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      ANTHROPIC_API_KEY: 'fake-key-for-tests',
      NODE_OPTIONS: `--import ${PRELOAD}`,
      ...env,
    },
  });
  const exited = new Promise<number | null>((resolve) => child.on('exit', resolve));
  return { child, exited };
}

async function until(ready: () => boolean, what: string, ms = 60_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!ready()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killGroup(child: ChildProcess): void {
  try {
    process.kill(-child.pid!, 'SIGKILL');
  } catch {
    // the group is gone already
  }
}

describe('rate-check.sh — a run of this checkout against a fake API', () => {
  let runDir: string;
  let first: RunResult;
  const args = (): string[] => [
    RATE_CHECK,
    '--draws',
    '2',
    '--languages',
    'zh-cn,fa,ml,fr',
    '--parallel',
    '8',
    '--run-dir',
    runDir,
  ];

  beforeAll(() => {
    if (!fs.existsSync(CLI)) throw new Error(`${CLI} not found: run \`npm run build\` first`);
    runDir = path.join(freshDir('live'), 'run');
    first = run('bash', args(), { timeout: 120_000 });
  }, 130_000);

  it('feature-detects the report and classifies each draw from it', () => {
    expect(first.stderr).toBe('');
    expect(first.code).toBe(1);
    const meta = fs.readFileSync(path.join(runDir, 'meta.txt'), 'utf8');
    expect(meta).toContain("REPORTS='1'");
    expect(meta).toContain("MARKERS='1'");
    expect(meta).toMatch(/^SDK_VERSION='\d+\.\d+\.\d+'$/m);
    expect(meta).toMatch(/^PARITY_SHA256='[0-9a-f]{64}'$/m);
    const summary = readSummary(runDir);
    expect(summary.classification).toBe('report');
    expect(cell(summary, 'zh-cn')).toMatchObject({ ok: 2, failed: 0, verdict: 'ok' });
    expect(cell(summary, 'fa')).toMatchObject({
      failed: 2,
      byKind: { 'model-refusal': 2 },
      refusalCategories: { bio: 2 },
      verdict: 'FAIL',
    });
    // 529 on every attempt: the engine's retries run out, and the draw is infra, not a failure
    expect(cell(summary, 'ml')).toMatchObject({
      infra: 2,
      failed: 0,
      verdict: 'UNRELIABLE',
      legacy: { refused: 2, verdict: 'FAIL' },
    });
    expect(cell(summary, 'fr')).toMatchObject({ failed: 2, byKind: { 'api-error': 2 } });
    expect(cell(summary, 'zh-cn').servedModels).toEqual(['claude-sonnet-5']);
    expect(fs.existsSync(path.join(runDir, 'zh-cn', 'game-theory', '1', FIXTURE))).toBe(true);
    expect(fs.existsSync(path.join(runDir, '.lock'))).toBe(false);
  });

  it('resumes without drawing again, and refuses a resume on another model', () => {
    const again = run('bash', [...args(), '--resume']);
    expect(again.code).toBe(1);
    expect(again.stdout).toContain('0 to draw now');
    const other = run('bash', [...args(), '--resume', '--model', 'claude-sonnet-5-5']);
    expect(other.code).toBe(2);
    expect(other.stderr).toContain('MODEL');
    expect(run('bash', args()).code).toBe(2); // the run exists and no --resume
  });

  it('redraws infra draws, keeping the replaced attempts in the infra share', () => {
    const redraw = run('bash', [...args(), '--redraw-infra'], { timeout: 120_000 });
    expect(redraw.code).toBe(1);
    expect(redraw.stdout).toContain('Moved 2 infra draw(s) aside');
    const ml = cell(readSummary(runDir), 'ml');
    expect(ml).toMatchObject({
      redrawnInfra: 2,
      attempts: 4,
      infraShare: 1,
      verdict: 'UNRELIABLE',
      legacy: { refused: 2, draws: 2 }, // each draw judged on its first attempt, as before
    });
    expect(fs.existsSync(path.join(runDir, 'ml', 'game-theory', '1.infra1.json'))).toBe(true);
  }, 130_000);

  it('leaves the draws a Ctrl-C cut short unfinished, never failed', async () => {
    const interrupted = path.join(freshDir('interrupted'), 'run');
    const cellDir = (lang: string): string => path.join(interrupted, lang, 'game-theory');
    // `de` gets no answer for 60 s (the fake API), so its draws are running when the run is cut
    const child = spawn(
      'bash',
      [RATE_CHECK, '--draws', '2', '--languages', 'zh-cn,de', '--parallel', '4'].concat([
        '--run-dir',
        interrupted,
      ]),
      {
        cwd: REPO,
        detached: true, // its own process group, as a terminal's foreground job is
        stdio: 'ignore',
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: 'fake-key-for-tests',
          NODE_OPTIONS: `--import ${PRELOAD}`,
        },
      }
    );
    const exited = new Promise<number | null>((resolve) => child.on('exit', resolve));
    try {
      const deadline = Date.now() + 60_000;
      const ready = (): boolean =>
        ['1', '2'].every(
          (i) =>
            fs.existsSync(path.join(cellDir('zh-cn'), `${i}.exit`)) &&
            fs.existsSync(path.join(cellDir('de'), `${i}.log`))
        );
      while (!ready()) {
        if (Date.now() > deadline) throw new Error('the draws never started');
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await new Promise((resolve) => setTimeout(resolve, 500)); // let the CLIs reach the API
      process.kill(-child.pid!, 'SIGINT'); // what Ctrl-C does: the whole foreground group
      expect(await exited).toBe(130);
      await new Promise((resolve) => setTimeout(resolve, 1500)); // anything left would write now
    } finally {
      try {
        process.kill(-child.pid!, 'SIGKILL');
      } catch {
        // the group is gone already
      }
    }
    expect(fs.existsSync(path.join(cellDir('de'), '1.exit'))).toBe(false);
    expect(fs.existsSync(path.join(cellDir('de'), '2.exit'))).toBe(false);
    expect(fs.existsSync(path.join(interrupted, '.lock'))).toBe(false);
    const summarized = run('bash', [RATE_CHECK, '--summarize', interrupted]);
    expect(summarized.code).toBe(1);
    expect(cell(readSummary(interrupted), 'de')).toMatchObject({
      completed: 0,
      notRun: 2,
      failed: 0,
      verdict: 'INCOMPLETE',
    });
    expect(cell(readSummary(interrupted), 'zh-cn')).toMatchObject({ ok: 2, verdict: 'ok' });
  }, 90_000);

  it('stops the CLIs on SIGTERM to the script alone, holding the lock until they are gone', async () => {
    const stopped = path.join(freshDir('terminated'), 'run');
    const cellDir = path.join(stopped, 'de', 'game-theory');
    const lock = path.join(stopped, '.lock');
    const pidFile = (i: string): string => path.join(lock, `cli.de.game-theory.${i}`);
    // `de` gets no answer for 60 s, so both draws are in flight when the script is stopped
    const { child, exited } = startRateCheck(
      ['--draws', '2', '--languages', 'de', '--parallel', '2'].concat(['--run-dir', stopped])
    );
    let exitCode: number | null | undefined;
    child.on('exit', (code) => {
      exitCode = code;
    });
    let clis: number[] = [];
    try {
      await until(
        () =>
          ['1', '2'].every(
            (i) => fs.existsSync(pidFile(i)) && fs.existsSync(path.join(cellDir, `${i}.log`))
          ),
        'both draws to start'
      );
      await new Promise((resolve) => setTimeout(resolve, 500)); // let the CLIs reach the API
      clis = ['1', '2'].map((i) => Number(fs.readFileSync(pidFile(i), 'utf8')));
      expect(clis.every(alive)).toBe(true);
      process.kill(child.pid!, 'SIGTERM'); // the script only, not its process group
      let releasedEarly = false;
      while (exitCode === undefined) {
        if (!fs.existsSync(lock) && clis.some(alive)) releasedEarly = true;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(await exited).toBe(130);
      expect(releasedEarly).toBe(false);
      expect(clis.filter(alive)).toEqual([]);
      await new Promise((resolve) => setTimeout(resolve, 1500)); // anything left would write now
    } finally {
      killGroup(child);
      for (const pid of clis.filter(alive)) process.kill(pid, 'SIGKILL');
    }
    expect(fs.existsSync(path.join(cellDir, '1.exit'))).toBe(false);
    expect(fs.existsSync(path.join(cellDir, '2.exit'))).toBe(false);
    expect(fs.existsSync(lock)).toBe(false);
  }, 90_000);

  it('drops the old summary when a resume begins, so an interrupted resume leaves no verdict', async () => {
    const resumed = path.join(freshDir('resumed'), 'run');
    const common = ['--languages', 'zh-cn', '--parallel', '2', '--run-dir', resumed];
    expect(run('bash', [RATE_CHECK, '--draws', '1', ...common], { timeout: 120_000 }).code).toBe(0);
    expect(readSummary(resumed)).toMatchObject({ verdict: 'ok', exitCode: 0 });
    // the resume's new draw gets no answer, so it is in flight when the run is cut
    const { child, exited } = startRateCheck(['--draws', '2', '--resume', ...common], {
      FAKE_ANTHROPIC_HANG: '1',
    });
    try {
      await until(
        () =>
          fs.existsSync(path.join(resumed, '.lock', 'cli.zh-cn.game-theory.2')) &&
          fs.existsSync(path.join(resumed, 'zh-cn', 'game-theory', '2.log')),
        'draw 2 to start'
      );
      // draw 2 is running: the summary of draw 1 alone is gone already
      expect(fs.existsSync(path.join(resumed, 'summary.json'))).toBe(false);
      expect(fs.existsSync(path.join(resumed, 'summary.txt'))).toBe(false);
      await new Promise((resolve) => setTimeout(resolve, 500));
      process.kill(-child.pid!, 'SIGINT'); // Ctrl-C
      expect(await exited).toBe(130);
    } finally {
      killGroup(child);
    }
    expect(fs.existsSync(path.join(resumed, 'summary.json'))).toBe(false);
    expect(fs.existsSync(path.join(resumed, 'summary.txt'))).toBe(false);
    expect(fs.readFileSync(path.join(resumed, 'meta.txt'), 'utf8')).toContain("DRAWS='2'");
    // a later --summarize reads the run as it stands: draw 2 never finished
    expect(run('bash', [RATE_CHECK, '--summarize', resumed]).code).toBe(1);
    expect(cell(readSummary(resumed), 'zh-cn')).toMatchObject({
      ok: 1,
      notRun: 1,
      verdict: 'INCOMPLETE',
    });
  }, 150_000);
});

describe('rate-check.sh — an engine without --report-json (the legacy rule)', () => {
  let engine: string;

  /** Enough of an old engine for rate-check: an init that writes what v0.29.5's did. */
  beforeAll(() => {
    engine = freshDir('legacy-engine');
    fs.mkdirSync(path.join(engine, 'dist', 'cli'), { recursive: true });
    fs.writeFileSync(
      path.join(engine, 'package.json'),
      JSON.stringify({ name: 'legacy-engine', version: '0.29.5', type: 'module' })
    );
    // Every engine since v0.28.0 exports its production default; with no --model, rate-check
    // draws it, as it would from v0.29.5's own dist/models.js.
    fs.writeFileSync(
      path.join(engine, 'dist', 'models.js'),
      "export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5';\n"
    );
    fs.writeFileSync(
      path.join(engine, 'dist', 'localization-rules.js'),
      [
        "export const DEFAULT_RULES = ['code-comments', 'figure-labels'];",
        'export function parseLocalizationRules(input) {',
        "  if (input.trim() === 'none') return [];",
        "  const ids = input.split(',').map((s) => s.trim());",
        '  const bad = ids.filter((id) => !DEFAULT_RULES.includes(id));',
        "  if (bad.length > 0) throw new Error(`Unknown localization rule(s): ${bad.join(', ')}`);",
        '  return ids;',
        '}',
        '',
      ].join('\n')
    );
    fs.writeFileSync(
      path.join(engine, 'dist', 'cli', 'index.js'),
      [
        "import fs from 'node:fs';",
        "import path from 'node:path';",
        'const args = process.argv.slice(2);',
        "if (args.includes('--help')) { console.log('Usage: translate init [options]\\n  --localize <rules>'); process.exit(0); }",
        "console.log('args: ' + args.join(' '));",
        'const opt = (name) => args[args.indexOf(name) + 1];',
        "const out = opt('-t'), fx = opt('-f'), lang = opt('--target-language');",
        'fs.mkdirSync(out, { recursive: true });',
        'const report = (failure) => fs.writeFileSync(path.join(out, "TRANSLATION-REPORT.md"),',
        '  "# Translation Report\\n" + (failure ? "\\n## Failures\\n\\n- **" + fx + "**: " + failure + "\\n" : "") + "\\n## Next Steps\\n");',
        "if (lang === 'zh-cn') { fs.copyFileSync(path.join(opt('-s'), fx), path.join(out, fx)); report(null); process.exit(0); }",
        "if (lang === 'fa') { report('structural parity check failed for ' + fx + ':\\n  - directive #1 name changed'); process.exit(1); }",
        'if (lang === \'ml\') { report(\'529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\'); process.exit(1); }',
        "console.error('\\n❌ simulated crash before the report'); process.exit(1);",
        '',
      ].join('\n')
    );
  });

  it('counts every draw without its output, infra included, and refuses --redraw-infra', () => {
    const cwd = freshDir('legacy-cwd');
    // a relative --run-dir resolves against the caller's directory, not the engine's
    const result = run(
      'bash',
      [
        RATE_CHECK,
        '--engine-dir',
        engine,
        '--draws',
        '2',
        '--languages',
        'zh-cn,fa,ml,fr',
        '--localize',
        'default',
        '--run-dir',
        'rel/run',
      ],
      { cwd }
    );
    const runDir = path.join(fs.realpathSync(cwd), 'rel', 'run');
    expect(result.code).toBe(1);
    const meta = fs.readFileSync(path.join(runDir, 'meta.txt'), 'utf8');
    expect(meta).toContain("REPORTS='0'");
    expect(meta).toContain("ENGINE_MODE='engine-dir'");
    // `default` resolves through the engine's own rules, and init gets no --localize at all
    expect(meta).toContain("LOCALIZE_RULES='code-comments,figure-labels'");
    const log = fs.readFileSync(path.join(runDir, 'zh-cn', 'game-theory', '1.log'), 'utf8');
    expect(log).not.toContain('--localize');
    expect(log).not.toContain('--report-json');

    const summary = readSummary(runDir);
    expect(summary.classification).toBe('legacy');
    expect(cell(summary, 'zh-cn')).toMatchObject({ verdict: 'ok', legacy: { refused: 0 } });
    expect(cell(summary, 'fa')).toMatchObject({ verdict: 'FAIL', byKind: { parity: 2 } });
    expect(cell(summary, 'ml')).toMatchObject({
      verdict: 'FAIL',
      infra: 2,
      legacy: { refused: 2, verdict: 'FAIL' },
    });
    expect(cell(summary, 'fr')).toMatchObject({ verdict: 'FAIL', byKind: { 'no-report': 2 } });

    const redraw = run(
      'bash',
      [RATE_CHECK, '--engine-dir', engine, '--draws', '2', '--languages', 'zh-cn,fa,ml,fr'].concat([
        '--localize',
        'default',
        '--run-dir',
        runDir,
        '--redraw-infra',
      ])
    );
    expect(redraw.code).toBe(2);
    expect(redraw.stderr).toContain('--redraw-infra needs an engine with init --report-json');
  });

  it('checks --localize against the engine once, before any draw', () => {
    const runDir = path.join(freshDir('legacy-localize'), 'run');
    const result = run('bash', [
      RATE_CHECK,
      '--engine-dir',
      engine,
      '--languages',
      'zh-cn',
      '--localize',
      'no-such-rule',
      '--run-dir',
      runDir,
    ]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Unknown localization rule(s): no-such-rule');
    expect(fs.existsSync(path.join(runDir, 'zh-cn'))).toBe(false);
  });

  it('orders the TOC so that init -f finds each fixture before any name containing it', () => {
    const source = freshDir('toc-source');
    for (const name of ['jax_intro.md', 'intro.md']) {
      fs.writeFileSync(path.join(source, name), `# ${name}\n`);
    }
    const runDir = path.join(freshDir('toc-run'), 'run');
    const result = run('bash', [
      RATE_CHECK,
      '--engine-dir',
      engine,
      '--source-dir',
      source,
      '--fixtures',
      'jax_intro.md,intro.md',
      '--languages',
      'zh-cn',
      '--draws',
      '1',
      '--run-dir',
      runDir,
    ]);
    expect(result.code).toBe(0);
    expect(fs.readFileSync(path.join(runDir, '_src', '_toc.yml'), 'utf8')).toBe(
      'format: jb-book\nroot: intro\nchapters:\n  - file: jax_intro\n'
    );
    expect(fs.readFileSync(path.join(runDir, 'meta.txt'), 'utf8')).toContain(
      `SOURCE_DIR='${fs.realpathSync(source)}'`
    );
  });

  /** A copy of the old engine whose dist/models.js exports `model`, or is missing when null. */
  function engineWithDefault(name: string, model: string | null): string {
    const copy = freshDir(name);
    fs.cpSync(engine, copy, { recursive: true });
    const models = path.join(copy, 'dist', 'models.js');
    if (model === null) fs.rmSync(models);
    else fs.writeFileSync(models, `export const DEFAULT_CLAUDE_MODEL = '${model}';\n`);
    return copy;
  }

  it("draws the engine's own DEFAULT_CLAUDE_MODEL when no --model is given", () => {
    const flipped = engineWithDefault('engine-default-5-5', 'claude-sonnet-5-5');
    const runDir = path.join(freshDir('engine-default-run'), 'run');
    const base = [RATE_CHECK, '--engine-dir', flipped, '--languages', 'zh-cn', '--draws', '1'];
    const result = run('bash', [...base, '--run-dir', runDir]);
    expect(result.code).toBe(0);
    expect(fs.readFileSync(path.join(runDir, 'meta.txt'), 'utf8')).toContain(
      "MODEL='claude-sonnet-5-5'"
    );
    // the fake init echoes its arguments: the draw was made with the engine's default
    expect(fs.readFileSync(path.join(runDir, 'zh-cn', 'game-theory', '1.log'), 'utf8')).toContain(
      '-m claude-sonnet-5-5'
    );

    // an explicit --model still wins over the engine's default
    const pinnedDir = path.join(freshDir('engine-default-pinned'), 'run');
    const pinned = run('bash', [...base, '--model', 'claude-sonnet-5', '--run-dir', pinnedDir]);
    expect(pinned.code).toBe(0);
    expect(fs.readFileSync(path.join(pinnedDir, 'meta.txt'), 'utf8')).toContain(
      "MODEL='claude-sonnet-5'"
    );
  });

  it('refuses to guess a model for an engine that exports none, before any draw', () => {
    const old = engineWithDefault('engine-no-default', null);
    const runDir = path.join(freshDir('engine-no-default-run'), 'run');
    const result = run('bash', [
      RATE_CHECK,
      '--engine-dir',
      old,
      '--languages',
      'zh-cn',
      '--draws',
      '1',
      '--run-dir',
      runDir,
    ]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('cannot read DEFAULT_CLAUDE_MODEL');
    expect(result.stderr).toContain('pass --model');
    expect(fs.existsSync(path.join(runDir, 'zh-cn'))).toBe(false);
  });
});

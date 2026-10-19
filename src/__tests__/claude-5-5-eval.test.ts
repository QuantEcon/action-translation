/**
 * The Claude 5.5 upgrade evaluation (experiments/claude-5-5-upgrade/) — CI coverage for its
 * pre-registered machinery, at no cost:
 *
 * - every script parses (`node --check`);
 * - summarize.mjs --self-test: the decision rules end to end on synthetic evaluation roots,
 *   including the table orientation (s55 at 6/12 against s5 at 0/12 fails R2; the reverse passes);
 * - run-stages.mjs --plan: the design in cells.mjs and corpus.yml still renders, with the draw
 *   counts README.md's tables quote;
 * - engine-aa.mjs (R1) with this checkout as both engines, against fake-api.mjs: identical
 *   requests, identical outcomes, and the refusal read as model-refusal; and a candidate whose
 *   retry budget differs, which R1 fails.
 * - run-stages.mjs and judge.mjs against fake-api.mjs (preloaded into every node process they
 *   start): R0's launch reading, a Ctrl-C that stops every rate-check, and the judge's parsing,
 *   draft ids, summary and cost.
 *
 * These execute dist/: run `npm run build` first (CI does).
 */

import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';

const REPO = path.resolve(__dirname, '../..');
const DIR = path.join(REPO, 'experiments', 'claude-5-5-upgrade');
const FAKE_API = path.join(DIR, 'fake-api.mjs');

function node(args: string[], env: NodeJS.ProcessEnv = {}, timeout = 120_000) {
  const result = spawnSync(process.execPath, args, {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, ANTHROPIC_API_KEY: '', NODE_OPTIONS: '', ...env },
    timeout,
  });
  return { code: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** The env of a child that reaches only fake-api.mjs, answering by `script` (written to `file`). */
function fakeApiEnv(file: string, script: object): NodeJS.ProcessEnv {
  fs.writeFileSync(file, JSON.stringify(script));
  return {
    ANTHROPIC_API_KEY: 'sk-ant-test-fake',
    FAKE_API_SCRIPT: file,
    NODE_OPTIONS: `--import=${pathToFileURL(FAKE_API).href}`,
  };
}

function readJsonl(file: string): any[] {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe('claude-5-5-upgrade experiment tooling', () => {
  it('every script parses', () => {
    const scripts = fs.readdirSync(DIR).filter((f) => f.endsWith('.mjs'));
    expect(scripts.length).toBeGreaterThanOrEqual(11);
    for (const script of scripts) {
      const r = node(['--check', path.join(DIR, script)]);
      expect({ script, code: r.code, stderr: r.stderr }).toEqual({ script, code: 0, stderr: '' });
    }
  });

  it('evaluates the decision rules on synthetic roots (summarize.mjs --self-test)', () => {
    const r = node([path.join(DIR, 'summarize.mjs'), '--self-test']);
    expect(r.stdout).toContain('summarize self-test: all checks pass');
    expect(r.stdout).toContain('✓ s55 6/12 v s5 0/12: R2-pooled FAILs');
    expect(r.stdout).toContain('✓ s55 0/12 v s5 6/12: R2-pooled PASSes');
    expect(r.code).toBe(0);
  }, 120_000);

  it('prints the plan with the draw counts README.md quotes, with no key and no spend', () => {
    const r = node([path.join(DIR, 'run-stages.mjs'), '--plan']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Stage 1 total: 432 draws');
    expect(r.stdout).toContain('Stage 2 total: 195 draws');
    expect(r.stdout).toContain('Stage 3 total: 522 draws');
    expect(r.stdout).toContain('Stage 4 total: 54 draws');
    expect(r.stdout).toContain('Total, Stages 0–4 with the judge: 1299 draws');
  }, 120_000);

  it('refuses to fetch the corpus into the repository', () => {
    const r = node([path.join(DIR, 'fetch-corpus.mjs'), '--out', path.join(DIR, 'corpus-out')]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('inside the repository');
    expect(fs.existsSync(path.join(DIR, 'corpus-out'))).toBe(false);
  });

  it('runs R1 against the fake API: identical requests and outcomes, the refusal failing the file', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'claude55-engine-aa-'));
    try {
      const r = node(
        [
          path.join(DIR, 'engine-aa.mjs'),
          '--baseline',
          REPO,
          '--fixtures',
          'game-theory.md',
          '--languages',
          'zh-cn',
          '--out',
          out,
        ],
        {},
        180_000
      );
      expect(r.stdout).toContain('R1 PASS');
      expect(r.code).toBe(0);
      const report = JSON.parse(fs.readFileSync(path.join(out, 'engine-aa.json'), 'utf8'));
      expect(report.sourceOnly).toBe(true);
      expect(report.cases[0].bodyIdentical).toBe(true);
      expect(report.cases[0].scenarios.refusal.candidate.kind).toBe('model-refusal');
      expect(report.cases[0].scenarios.overloaded.candidate.kind).toBe('infra');
      expect(report.cases[0].scenarios.end_turn.candidate.kind).toBe('ok');
      // the candidate's engine, as run-stages pins it, so summarize can hold R1 to the stages' engine
      expect(report.candidate.engineId).toMatch(/^engine-[0-9a-f]{16}$/);
      expect(report.candidate.distSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(report).toMatchObject({ fixtures: ['game-theory.md'], languages: ['zh-cn'] });
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  }, 180_000);

  it('fails R1 when the candidate sends a different number of requests (a changed retry budget)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'claude55-engine-aa-retries-'));
    try {
      const engine = (name: string): string => {
        const dir = path.join(tmp, name);
        fs.cpSync(path.join(REPO, 'dist'), path.join(dir, 'dist'), { recursive: true });
        fs.cpSync(path.join(REPO, 'glossary'), path.join(dir, 'glossary'), { recursive: true });
        for (const file of ['package.json', 'package-lock.json']) {
          fs.copyFileSync(path.join(REPO, file), path.join(dir, file));
        }
        fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(dir, 'node_modules'));
        return dir;
      };
      const baseline = engine('baseline');
      const candidate = engine('candidate');
      const translator = path.join(candidate, 'dist', 'translator.js');
      const source = fs.readFileSync(translator, 'utf8');
      expect(source).toContain('maxRetries: 3,');
      fs.writeFileSync(translator, source.replace('maxRetries: 3,', 'maxRetries: 2,'));
      const out = path.join(tmp, 'out');
      const r = node(
        [path.join(DIR, 'engine-aa.mjs'), '--baseline', baseline, '--candidate', candidate].concat([
          '--fixtures',
          'game-theory.md',
          '--languages',
          'zh-cn',
          '--out',
          out,
        ]),
        {},
        180_000
      );
      expect(r.stdout).toContain('R1 FAIL');
      expect(r.code).toBe(1);
      const report = JSON.parse(fs.readFileSync(path.join(out, 'engine-aa.json'), 'utf8'));
      expect(report.summary.problems).toContain(
        'game-theory.md × zh-cn overloaded: 3 requests at baseline, 2 at candidate'
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 180_000);

  it('refuses a narrowed R1 run into EVAL_ROOT/engine-aa, where summarize reads R1', () => {
    const r = node([path.join(DIR, 'engine-aa.mjs'), '--baseline', REPO, '--languages', 'zh-cn']);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('pass --out DIR');
  });
});

describe('claude-5-5-upgrade — run-stages.mjs against the fake API', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'claude55-run-stages-'));
  });
  afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const stageOne = (root: string, arms: string, parallel = 12): string[] => [
    path.join(DIR, 'run-stages.mjs'),
    '--stage',
    '1',
    '--units',
    'game-theory.fr',
    '--arms',
    arms,
    '--parallel',
    `s5=${parallel},s55=${parallel}`,
    '--yes',
    '--allow-tmp',
    '--allow-dirty',
    '--eval-root',
    root,
  ];

  it("reads R0's launch as the one that created each arm's run, whatever resumed it later", () => {
    const env = fakeApiEnv(path.join(tmp, 'echo.json'), { mode: 'echo', outcomes: ['ok'] });
    const draw = (root: string, arms: string): void => {
      const r = node(stageOne(root, arms), env);
      // the output only when it failed, to say why
      expect({ arms, code: r.code, out: r.code === 0 ? '' : r.stdout + r.stderr }).toEqual({
        arms,
        code: 0,
        out: '',
      });
    };
    const drawnApart = (root: string): boolean => {
      const out = `${root}-results`;
      const r = node([
        path.join(DIR, 'summarize.mjs'),
        '--eval-root',
        root,
        '--out',
        out,
        '--no-records',
        '--quiet',
      ]);
      expect(r.code).toBe(0);
      const results = JSON.parse(fs.readFileSync(path.join(out, 'results.json'), 'utf8'));
      return results.rules.R0.problems.some(
        (p: any) =>
          p.cell === 'game-theory.md × fr' &&
          /different launches/.test(p.issue) &&
          p.remedy === 'rerun'
      );
    };
    // --arms s5, then the full unit: s5 only resumes (nothing to draw), s55 is drawn
    const thenFull = path.join(tmp, 's5-then-full');
    draw(thenFull, 's5');
    draw(thenFull, 's5,s55');
    expect(drawnApart(thenFull)).toBe(true);
    // --arms s5, --arms s55, then a joint relaunch that draws nothing
    const thenNoop = path.join(tmp, 'apart-then-noop');
    draw(thenNoop, 's5');
    draw(thenNoop, 's55');
    draw(thenNoop, 's5,s55');
    expect(drawnApart(thenNoop)).toBe(true);
    // drawn together, then resumed together: one launch
    const together = path.join(tmp, 'together');
    draw(together, 's5,s55');
    draw(together, 's5,s55');
    expect(drawnApart(together)).toBe(false);
  }, 180_000);

  it('stops every rate-check on Ctrl-C and exits 130, with their exits recorded and no draw finished', async () => {
    const root = path.join(tmp, 'interrupted');
    // each reply takes 4 s: the first draws are in flight when the driver is interrupted
    const env = fakeApiEnv(path.join(tmp, 'slow.json'), {
      mode: 'echo',
      outcomes: ['ok'],
      delayMs: 4000,
    });
    const child = spawn(process.execPath, stageOne(root, 's5,s55', 2), {
      cwd: REPO,
      detached: true, // the driver's own group, as at a terminal; each rate-check has its own
      stdio: 'ignore',
      env: { ...process.env, ...env },
    });
    const exited = new Promise<number | null>((resolve) => child.on('exit', resolve));
    const runDir = (arm: string): string => path.join(root, 'stage1', 'game-theory.fr', arm, 'r1');
    const lock = (arm: string): string => path.join(runDir(arm), '.lock');
    try {
      const deadline = Date.now() + 60_000;
      while (
        !['s5', 's55'].every((arm) => fs.existsSync(path.join(lock(arm), 'cli.fr.game-theory.1')))
      ) {
        if (Date.now() > deadline) throw new Error('the draws never started');
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      process.kill(-child.pid!, 'SIGINT'); // Ctrl-C reaches the driver's group, not the rate-checks'
      expect(await exited).toBe(130);
      // a rate-check left running would finish its draws (and start more) within this wait
      await new Promise((resolve) => setTimeout(resolve, 6000));
    } finally {
      for (const arm of ['s5', 's55']) {
        const pid = Number(
          fs.existsSync(path.join(lock(arm), 'pid'))
            ? fs.readFileSync(path.join(lock(arm), 'pid'), 'utf8')
            : NaN
        );
        if (pid) {
          try {
            process.kill(-pid, 'SIGKILL');
          } catch {
            // gone
          }
        }
      }
      try {
        process.kill(-child.pid!, 'SIGKILL');
      } catch {
        // gone
      }
    }
    for (const arm of ['s5', 's55']) {
      expect(fs.existsSync(lock(arm))).toBe(false); // the rate-check exited and released its run
      const markers = fs
        .readdirSync(path.join(runDir(arm), 'fr', 'game-theory'))
        .filter((f) => f.endsWith('.exit'));
      expect({ arm, markers }).toEqual({ arm, markers: [] });
    }
    const exits = readJsonl(path.join(root, 'manifest.jsonl')).filter(
      (row) => row.event === 'arm-exit'
    );
    expect(exits.map((row) => [row.arm, row.exitCode]).sort()).toEqual([
      ['s5', 130],
      ['s55', 130],
    ]);
  }, 120_000);
});

describe('claude-5-5-upgrade — judge.mjs against the fake API', () => {
  it('reads verdicts whose reasons hold braces, keeps --arms drafts apart and counts the current tasks only', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'claude55-judge-'));
    try {
      const lecture = ['A', 'B', 'C', 'D']
        .flatMap((s) => [
          `## Section ${s}`,
          '',
          `The text of section ${s} has the words in the order the author chose.`,
          '',
        ])
        .join('\n');
      // two runs of one cell for s5 (run-a, run-b), one for s55; the s55 drafts are longer
      const writeRun = (dir: string, draft: string): void => {
        fs.mkdirSync(path.join(dir, '_src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'meta.txt'), "REPORTS='0'\n");
        fs.writeFileSync(path.join(dir, '_src', 'lec.md'), lecture);
        for (const i of ['1', '2']) {
          fs.mkdirSync(path.join(dir, 'zh-cn', 'lec', i), { recursive: true });
          fs.writeFileSync(path.join(dir, 'zh-cn', 'lec', i, 'lec.md'), draft);
        }
      };
      const s5 = path.join(tmp, 'arms', 's5');
      const s55 = path.join(tmp, 'arms', 's55');
      writeRun(path.join(s5, 'run-a'), lecture);
      writeRun(path.join(s5, 'run-b'), lecture);
      writeRun(path.join(s55, 'run-a'), lecture.replace(/ the /g, ' the the '));
      const env = fakeApiEnv(path.join(tmp, 'judge.json'), { mode: 'judge', verdict: 'longer' });
      const judge = (...extra: string[]) =>
        node(
          [
            path.join(DIR, 'judge.mjs'),
            '--arms',
            `s5=${s5},s55=${s55}`,
            '--pairs',
            's55:s5',
            ...extra,
          ],
          env
        );

      expect(judge('--yes').stderr).toContain('--out is required with --arms');

      const out = path.join(tmp, 'out');
      const first = judge('--out', out, '--yes');
      expect({ code: first.code, stderr: first.code === 0 ? '' : first.stderr }).toEqual({
        code: 0,
        stderr: '',
      });
      expect(first.stderr).not.toContain('No list price'); // claude-opus-4-8 is priced
      const rows = readJsonl(path.join(out, 'judgements.jsonl'));
      // the fake judge's reasons quote {math} and $\beta^{t}$: every verdict parses
      expect(rows.filter((row) => row.winner === 'ERROR')).toEqual([]);
      expect(rows.some((row) => String(row.reason).includes('{math}'))).toBe(true);
      const summary = JSON.parse(fs.readFileSync(path.join(out, 'judge-summary.json'), 'utf8'));
      expect(summary.verdicts).toBe(rows.length);
      expect(summary.costUSD).toBeGreaterThan(0);
      // one entry per judged file: s5's run-a and run-b drafts keep their own ids
      const drafts = JSON.parse(
        fs.readFileSync(path.join(out, 'judged-drafts.json'), 'utf8')
      ).drafts;
      const files = drafts.map((d: any) => path.relative(tmp, d.file)).sort();
      expect(files).toEqual([
        'arms/s5/run-a/zh-cn/lec/1/lec.md',
        'arms/s5/run-a/zh-cn/lec/2/lec.md',
        'arms/s5/run-b/zh-cn/lec/1/lec.md',
        'arms/s5/run-b/zh-cn/lec/2/lec.md',
        'arms/s55/run-a/zh-cn/lec/1/lec.md',
        'arms/s55/run-a/zh-cn/lec/2/lec.md',
      ]);
      expect(new Set(drafts.map((d: any) => d.id)).size).toBe(drafts.length);

      // without the s55:s55 A/A pairs, their verdicts stay in the log but leave the summary
      const narrower = judge('--out', out, '--aa', 's5', '--summary-only');
      expect(narrower.code).toBe(0);
      const resummarized = JSON.parse(
        fs.readFileSync(path.join(out, 'judge-summary.json'), 'utf8')
      );
      const aaRows = rows.filter((row) => row.pairType === 's55:s55').length;
      expect(aaRows).toBeGreaterThan(0);
      expect(resummarized.staleRows).toBe(aaRows);
      expect(resummarized.verdicts).toBe(rows.length - aaRows);

      // a recognised judge model with no list price: its cost is unpriced, never $0
      const unpricedOut = path.join(tmp, 'out-unpriced');
      const unpriced = judge(
        '--out',
        unpricedOut,
        '--judge-model',
        'claude-opus-4-5-20251101',
        '--yes'
      );
      expect(unpriced.code).toBe(0);
      expect(unpriced.stderr).toContain('No list price');
      const unpricedSummary = JSON.parse(
        fs.readFileSync(path.join(unpricedOut, 'judge-summary.json'), 'utf8')
      );
      expect(unpricedSummary.costUSD).toBeNull();
      expect(unpricedSummary.unpricedCalls).toBeGreaterThan(0);
      expect(unpricedSummary.headline).toContain('unpriced');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 180_000);
});

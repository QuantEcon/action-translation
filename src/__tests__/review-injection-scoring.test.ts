/**
 * The injected-defect scorer (`tool-review-injection/`) and the degraded
 * review (#284).
 *
 * A review whose diff evaluation never parsed posts a verdict with two gating
 * `diff-check` findings that record the engine's failure, not a judgement.
 * Before #284 the same run died and was scored as `reviewFailed`; the scorer
 * must keep scoring it that way, or it reads as `operative` and as a false
 * positive on a control. The tool is plain ESM and does not import from
 * `src/`, so it repeats the fixed phrase, and these tests run it under Node
 * and check that the two literals agree.
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { DIFF_EVALUATION_UNPARSEABLE } from '../review-verdict.js';

const TOOL = path.join(__dirname, '..', '..', 'tool-review-injection');
const LIB = path.join(TOOL, 'lib.mjs');

/** Run an ES module snippet that imports the tool's lib, return its JSON output. */
function runLib(body: string): unknown {
  const script = `import * as lib from ${JSON.stringify('file://' + LIB)};\n${body}`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf-8',
    timeout: 30000,
  });
  if (child.status !== 0) throw new Error(`node exited ${child.status}: ${child.stderr}`);
  return JSON.parse(child.stdout);
}

const DEGRADED_FINDING = {
  severity: 'minor',
  category: 'diff-check',
  file: 'lectures/a.md',
  location: null,
  description: `scopeCorrect: ${DIFF_EVALUATION_UNPARSEABLE}, so this check was not judged.`,
  suggestion: null,
};

describe('tool-review-injection and the unparseable diff evaluation (#284)', () => {
  it("repeats the engine's fixed phrase exactly", () => {
    expect(runLib('console.log(JSON.stringify(lib.DIFF_EVALUATION_UNPARSEABLE));')).toBe(
      DIFF_EVALUATION_UNPARSEABLE
    );
  });

  it('recognises the phrase in a finding or in a reason, and nothing else', () => {
    const cases = {
      finding: { findings: [DEGRADED_FINDING], recommendationReasons: [] },
      reason: {
        findings: [],
        recommendationReasons: [`${DIFF_EVALUATION_UNPARSEABLE} — not judged`],
      },
      modelJudged: {
        findings: [
          {
            ...DEGRADED_FINDING,
            description: 'scopeCorrect: the reviewer reported this check as failed.',
          },
        ],
        recommendationReasons: ['1 minor finding(s) in gating categories'],
      },
      none: null,
    };
    expect(
      runLib(
        `const cases = ${JSON.stringify(cases)};\n` +
          'console.log(JSON.stringify(Object.fromEntries(Object.entries(cases).map(' +
          '([k, v]) => [k, lib.diffEvaluationDegraded(v)]))));'
      )
    ).toEqual({ finding: true, reason: true, modelJudged: false, none: false });
  });

  it('scores a degraded review on a clean control as a failed run, not a false positive', () => {
    const runId = `jest-${process.pid}-${Date.now()}`;
    const dir = path.join(TOOL, 'runs', runId);
    fs.mkdirSync(dir, { recursive: true });
    try {
      fs.writeFileSync(
        path.join(dir, 'state.json'),
        JSON.stringify({ fixtures: [{ id: 'ctl', kind: 'control', site: 'A' }] })
      );
      const verdict = {
        reviewedHeadSha: 'abc',
        verdict: 'PASS',
        recommendation: 'editor',
        recommendationReasons: [`${DIFF_EVALUATION_UNPARSEABLE} — not judged`],
        diffChecks: {
          scopeCorrect: false,
          positionCorrect: false,
          structurePreserved: true,
          headingMapCorrect: true,
        },
        diffCheckSources: {
          scopeCorrect: 'model',
          positionCorrect: 'model',
          structurePreserved: 'deterministic',
          headingMapCorrect: 'deterministic',
        },
        syntaxErrorCount: 0,
        findings: [
          DEGRADED_FINDING,
          {
            ...DEGRADED_FINDING,
            description: `positionCorrect: ${DIFF_EVALUATION_UNPARSEABLE}, so this check was not judged.`,
          },
        ],
      };
      fs.writeFileSync(
        path.join(dir, 'verdicts.jsonl'),
        JSON.stringify({ fixtureId: 'ctl', kind: 'control', replicate: 1, verdict }) + '\n'
      );

      const child = spawnSync(process.execPath, [path.join(TOOL, 'score.mjs')], {
        encoding: 'utf-8',
        timeout: 30000,
        env: { ...process.env, RUN_ID: runId },
      });
      expect(child.stderr).toBe('');
      expect(child.status).toBe(0);

      const report = fs.readFileSync(path.join(dir, 'report.md'), 'utf-8');
      // One review, no finding and no gating finding counted, routed to editor.
      expect(report).toMatch(/\| clean control \| 1 \| 0 \[[^\]]*\] \| 0 \[[^\]]*\] \| 1 \|/);
      expect(report).toContain(
        '- reviews whose diff evaluation returned no parseable verdict (scored as failed runs): 1'
      );

      const [row] = JSON.parse(fs.readFileSync(path.join(dir, 'scored.json'), 'utf-8'));
      expect(row).toMatchObject({ diffDegraded: true, caught: false, routed: true });
      expect(row.verdict).toBeUndefined();
      expect(row.degradedVerdict.findings).toHaveLength(2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      // Leave no empty runs/ behind either; it is not committed.
      const runs = path.join(TOOL, 'runs');
      if (fs.existsSync(runs) && fs.readdirSync(runs).length === 0) fs.rmdirSync(runs);
    }
  });
});

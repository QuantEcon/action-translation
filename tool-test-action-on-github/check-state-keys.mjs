#!/usr/bin/env node
/**
 * check-state-keys.mjs — after a harness run, check that every translation PR
 * kept the target state file's keys the engine does not own (#290).
 *
 * The reset lays down `.translate/state/lecture.md.yml` in every target with a
 * sign-off block after the engine's fields (test-action-on-github.sh, Step 2).
 * This reads each target's `main` and its open translation PRs through `gh api`,
 * makes no model call, and judges them with lib/state-keys.mjs. Run it once the
 * run's sync workflows have finished, before the next reset.
 *
 *   node check-state-keys.mjs --expect-full           # the release gate: zh-cn, fa and ml
 *   node check-state-keys.mjs --languages zh-cn,fa    # a smaller run, judged on its PRs
 *   node check-state-keys.mjs --offline lanes.json    # judge saved lane data (tests)
 *
 * Prints one line per lane and a total. The gate's reads
 * `state keys kept: 42 across 84 PRs — PASS` and goes on the release PR beside
 * the gate tally: `--expect-full` holds each lane to 28 translation PRs with the
 * block in 14 state files, so a check run too early or after the next reset
 * fails instead of passing on what is left. A lane with no translation PR always
 * fails. Exit 0 when every lane passes, 1 when any fails, 2 on a usage or `gh`
 * error.
 *
 * Applies only to engines with #476 (after v0.33.0): an older engine rewrites
 * the state file without the block, which this reports as a failure.
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { LECTURE_STATE, formatLane, judgeLane } from './lib/state-keys.mjs';

const OWNER = 'QuantEcon';
const SOURCE_REPO = 'test-translation-sync';
const SYNC_BRANCH_PREFIX = 'translation-sync-';

const argv = process.argv.slice(2);
const usage = (msg) => {
  console.error(`check-state-keys: ${msg}`);
  console.error(
    'usage: check-state-keys.mjs [--expect-full] [--languages a,b] [--offline lanes.json]'
  );
  process.exit(2);
};
const VALUED = ['--languages', '--offline'];
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const value = argv[i + 1];
  if (value === undefined || value.startsWith('--')) usage(`--${name} needs a value`);
  return value;
};
for (const a of argv) {
  if (a.startsWith('--') && ![...VALUED, '--expect-full'].includes(a)) {
    usage(`unknown option ${a}`);
  }
}
const expectFull = argv.includes('--expect-full');
const languages = (opt('languages') ?? 'zh-cn,fa,ml').split(',').filter(Boolean);
if (languages.length === 0) usage('--languages names no language');

/** `gh api` returning text; `raw` asks for a file's bytes rather than JSON. */
function gh(apiPath, { raw = false, paginate = false } = {}) {
  const args = ['api'];
  if (raw) args.push('-H', 'Accept: application/vnd.github.raw+json');
  if (paginate) args.push('--paginate');
  args.push(apiPath);
  // stderr is captured, not passed through: gh prints hints there on every
  // call. On a failure it is part of the error execFileSync throws.
  return execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** A paginated JSON list; `--paginate` concatenates pages as `][`. */
function ghList(apiPath) {
  const text = gh(apiPath, { paginate: true }).trim();
  return text === '' ? [] : JSON.parse(`[${text.replace(/\]\s*\[/g, ',').slice(1, -1)}]`);
}

function readLane(language) {
  const repo = `${OWNER}/${SOURCE_REPO}.${language}`;
  const mainText = gh(`repos/${repo}/contents/${LECTURE_STATE}`, { raw: true });
  const pulls = ghList(`repos/${repo}/pulls?state=open&per_page=100`).filter((p) =>
    p.head.ref.startsWith(SYNC_BRANCH_PREFIX)
  );
  const prs = pulls.map((p) => {
    const all = ghList(`repos/${repo}/pulls/${p.number}/files?per_page=100`);
    // Lectures the PR adds or changes: root-level .md, since the targets'
    // docs folder is the repository root. Each must come with its state file.
    const lectures = all
      .filter((f) => f.status !== 'removed' && /^[^/]+\.md$/.test(f.filename))
      .map((f) => f.filename);
    const files = all
      .filter((f) => f.filename.startsWith('.translate/state/'))
      .map((f) => ({
        path: f.filename,
        status: f.status,
        previous: f.previous_filename,
        text:
          f.status === 'removed'
            ? undefined
            : gh(`repos/${repo}/contents/${f.filename}?ref=${p.head.sha}`, { raw: true }),
      }));
    return { number: p.number, body: p.body ?? '', lectures, files };
  });
  return { language, mainText, prs };
}

let lanes;
try {
  if (opt('offline')) {
    const all = JSON.parse(fs.readFileSync(opt('offline'), 'utf8'));
    lanes = all.filter((l) => languages.includes(l.language));
  } else {
    lanes = languages.map(readLane);
  }
} catch (error) {
  console.error(`check-state-keys: could not read the lanes: ${error.message}`);
  process.exit(2);
}

let kept = 0;
let prs = 0;
let failed = false;
for (const lane of lanes) {
  const r = judgeLane(lane, { expectFull });
  kept += r.kept;
  prs += r.prs;
  console.log(formatLane(r));
  for (const p of r.problems) console.log(`  ✗ ${p}`);
  if (r.problems.length > 0) failed = true;
}
console.log(`state keys kept: ${kept} across ${prs} PRs — ${failed ? 'FAIL' : 'PASS'}`);
process.exit(failed ? 1 : 0);

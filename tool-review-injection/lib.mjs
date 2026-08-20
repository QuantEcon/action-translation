/**
 * Shared helpers for the injected-defect certification harness.
 *
 * Everything talks to GitHub through `gh api` so the harness inherits the
 * operator's existing auth and needs no token of its own. Content is written
 * through the Contents API rather than a local clone: ~70 short-lived branches
 * on a test repo are cheaper to create and to reason about as API calls than as
 * pushes, and nothing here should ever touch a working tree the operator cares
 * about.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENGINE = path.resolve(HERE, '..');

export const SRC_REPO = 'QuantEcon/test-translation-sync';
export const TGT_REPO = 'QuantEcon/test-translation-sync.zh-cn';

/** Branch prefix. Deliberately NOT `translation-sync-` or `resync/` — those
 *  prefixes are what the target's rebase workflow acts on when a PR merges. */
export const BRANCH_PREFIX = 'inject';

/** The label that makes review mode fire (`review-translations.yml`). */
export const REVIEW_LABEL = 'action-translation';

// ---------------------------------------------------------------------------
// gh plumbing
// ---------------------------------------------------------------------------

export function gh(args, { input, allow404 = false } = {}) {
  try {
    const out = execFileSync('gh', args, {
      input,
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
      // Capture stderr rather than inherit it: the existence probes below expect
      // 404s, and an inherited stderr prints "gh: Not Found" for every one of
      // them, which reads as a run full of errors when it is a run full of
      // successful checks.
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return out.trim() ? JSON.parse(out) : null;
  } catch (err) {
    const stderr = String(err.stderr || '');
    if (allow404 && /HTTP 404|Not Found/i.test(stderr)) return null;
    throw new Error(`gh ${args.join(' ')}\n${stderr || err.message}`);
  }
}

export function api(method, endpoint, body, opts = {}) {
  const args = ['api', '--method', method, endpoint];
  if (body !== undefined) args.push('--input', '-');
  return gh(args, { input: body === undefined ? undefined : JSON.stringify(body), ...opts });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// git objects
// ---------------------------------------------------------------------------

export function headSha(repo, branch = 'main') {
  return api('GET', `repos/${repo}/git/ref/heads/${branch}`).object.sha;
}

export function createBranch(repo, branch, fromSha) {
  const existing = api('GET', `repos/${repo}/git/ref/heads/${branch}`, undefined, { allow404: true });
  if (existing) return { branch, sha: existing.object.sha, reused: true };
  api('POST', `repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: fromSha });
  return { branch, sha: fromSha, reused: false };
}

export function deleteBranch(repo, branch) {
  try {
    api('DELETE', `repos/${repo}/git/refs/heads/${branch}`);
    return true;
  } catch {
    return false;
  }
}

/** Write one file onto a branch. Returns the new commit sha. */
export function putFile(repo, branch, filePath, content, message) {
  const current = api('GET', `repos/${repo}/contents/${filePath}?ref=${branch}`, undefined, {
    allow404: true,
  });
  const body = {
    message,
    content: Buffer.from(content, 'utf-8').toString('base64'),
    branch,
  };
  if (current && current.sha) body.sha = current.sha;
  return api('PUT', `repos/${repo}/contents/${filePath}`, body).commit.sha;
}

/**
 * Push an empty commit onto a branch — the reliable N-times review re-fire.
 *
 * `update-branch` works exactly once and label-cycling is a silent no-op when
 * the remove has not landed, both learned the expensive way on
 * action-translation#248. An empty commit changes the head sha every time,
 * which is what `pull_request: synchronize` keys on.
 */
export function emptyCommit(repo, branch, message) {
  const ref = api('GET', `repos/${repo}/git/ref/heads/${branch}`);
  const parent = ref.object.sha;
  const commit = api('GET', `repos/${repo}/git/commits/${parent}`);
  const created = api('POST', `repos/${repo}/git/commits`, {
    message,
    tree: commit.tree.sha,
    parents: [parent],
  });
  api('PATCH', `repos/${repo}/git/refs/heads/${branch}`, { sha: created.sha, force: false });
  return created.sha;
}

// ---------------------------------------------------------------------------
// pull requests
// ---------------------------------------------------------------------------

export function createPr(repo, { title, head, base = 'main', body }) {
  return api('POST', `repos/${repo}/pulls`, { title, head, base, body });
}

export function addLabel(repo, number, label = REVIEW_LABEL) {
  return api('POST', `repos/${repo}/issues/${number}/labels`, { labels: [label] });
}

export function closePr(repo, number) {
  return api('PATCH', `repos/${repo}/pulls/${number}`, { state: 'closed' });
}

/**
 * The PR body review mode requires.
 *
 * `reviewPR` refuses any PR whose body has neither a `### Source PR` reference
 * nor a resync metadata block, so the shape below is not decoration — it is the
 * precondition. Copied from the engine's own `buildPrBody` so a fixture PR is
 * byte-shaped like one the sync would have opened.
 */
export function prBody({ sourceRepo, sourcePr, sourceTitle, fixtureId, defectClass, note }) {
  const [owner, name] = sourceRepo.split('/');
  return `## Automated Translation Sync

This PR contains automated translations from [${owner}/${name}](https://github.com/${owner}/${name}).

### Source PR
**[#${sourcePr} - ${sourceTitle}](https://github.com/${owner}/${name}/pull/${sourcePr})**

### Details
- **Source Language**: en
- **Target Language**: zh-cn
- **Model**: claude-sonnet-5

---
*Injected-defect certification fixture — QuantEcon/project-translation#28. Not a real translation.*

<!-- injection-fixture
${JSON.stringify({ fixtureId, defectClass, note }, null, 2)}
-->`;
}

// ---------------------------------------------------------------------------
// verdict capture
// ---------------------------------------------------------------------------

const REVIEW_MARKER = '<!-- action-translation-review -->';

let _parse;
/** The engine's own fail-closed parser — never a hand-rolled grep (#248 method). */
export async function parseVerdict(body) {
  if (!_parse) {
    const mod = await import(path.join(ENGINE, 'dist', 'review-verdict.js'));
    _parse = mod.parseReviewVerdict;
  }
  return _parse(body);
}

export function findReviewComment(repo, number) {
  const comments = api('GET', `repos/${repo}/issues/${number}/comments?per_page=100`);
  const hits = (comments || []).filter((c) => (c.body || '').includes(REVIEW_MARKER));
  return hits.length ? hits[hits.length - 1] : null;
}

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------

export function runDir(runId) {
  const dir = path.join(HERE, 'runs', runId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function loadState(runId) {
  const f = path.join(runDir(runId), 'state.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf-8')) : null;
}

export function saveState(runId, state) {
  fs.writeFileSync(
    path.join(runDir(runId), 'state.json'),
    JSON.stringify(state, null, 2) + '\n',
    'utf-8'
  );
}

export function appendJsonl(runId, name, row) {
  fs.appendFileSync(path.join(runDir(runId), name), JSON.stringify(row) + '\n', 'utf-8');
}

// ---------------------------------------------------------------------------
// the gate, re-implemented for scoring
// ---------------------------------------------------------------------------

/**
 * Categories where a `minor` finding gates. Mirrors GATING_CATEGORIES in
 * src/review-verdict.ts. Duplicated deliberately rather than imported: the
 * scoring must state the rule it measures, and a silent change upstream should
 * show up as a disagreement here rather than move the metric underneath it.
 */
export const GATING_CATEGORIES = ['accuracy', 'terminology', 'syntax', 'diff-check', 'other'];

/** Categories the reviewer's PROMPT actually offers the model. */
export const MODEL_CATEGORIES = ['accuracy', 'fluency', 'terminology', 'formatting'];

const RANK = { blocker: 0, major: 1, minor: 2, nit: 3 };

/**
 * Does this finding gate, on the rule `computeRecommendation` actually applies?
 *
 * The tracker describes the operative surface as "any >=minor finding in a
 * gating category", and that is right for `minor` — but `blocker` and `major`
 * gate in EVERY category, through separate `blockers > 0` / `majors > 0` clauses.
 * Requiring a gating category at those severities understates the reviewer:
 * a `blocker/formatting` gates the PR, and scoring it as a miss would have
 * credited the gate with less than it does. `nit` never gates.
 */
export function isGatingFinding(f) {
  if (f.severity === 'blocker' || f.severity === 'major') return true;
  if (f.severity === 'minor') return GATING_CATEGORIES.includes(f.category);
  return false;
}

/**
 * Decompose a verdict into the surfaces the certification reports separately.
 *
 * The issue's metric is catch rate on the OPERATIVE surface — "did a >=minor
 * finding in a gating category fire", not "did a score drop" and not "did the
 * PR route to editor". Those are different questions and a defect can be caught
 * by one and missed by the others, so each is recorded rather than collapsed.
 */
export function surfaces(verdict) {
  if (!verdict) return null;
  const findings = verdict.findings || [];
  const gating = findings.filter(isGatingFinding);
  const deterministicFail = Object.entries(verdict.diffChecks || {}).filter(([name, v]) => {
    const src = verdict.diffCheckSources?.[name];
    return v !== true && src !== 'model';
  });
  const floorFail = (verdict.recommendationReasons || []).filter((r) => /below floor/.test(r));
  return {
    operative: gating.length > 0,
    gatingFindings: gating,
    anyFinding: findings.length > 0,
    deterministicCheckFail: deterministicFail.map(([n]) => n),
    syntaxErrors: verdict.syntaxErrorCount || 0,
    floorFail,
    verdict: verdict.verdict,
    recommendation: verdict.recommendation,
    routedEditor: verdict.recommendation === 'editor',
    signature: findings
      .map((f) => `${f.severity}/${f.category}`)
      .sort()
      .join(','),
  };
}

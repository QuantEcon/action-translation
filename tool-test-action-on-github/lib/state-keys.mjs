/**
 * state-keys.mjs — judge whether a gate run's translation PRs carried the
 * target's kept state-file keys (#290). Pure functions, no I/O, so
 * check-state-keys.mjs can feed them from `gh api` or from a JSON file.
 *
 * The harness reset lays down `.translate/state/lecture.md.yml` in every
 * target: the six fields the engine writes, then a block the engine does not
 * own (an editor sign-off). Every writer must keep that block as written, after
 * its own fields (D-2026-11-25-state-files-keep-keys-the-engine-does-not-own).
 * So in each translation PR:
 *
 * - a state file that comes from lecture.md's (lecture.md.yml modified, or the
 *   new path's file when the PR renames lecture.md) must end with the block,
 *   byte for byte, after exactly the six engine fields;
 * - any other state file the PR adds must hold the six engine fields and
 *   nothing else;
 * - no PR body may list a state file as overwritten.
 */

/** The fields sync writes, in the order `serializeFileState` writes them. */
export const ENGINE_KEYS = [
  'source-sha',
  'synced-at',
  'model',
  'mode',
  'section-count',
  'tool-version',
];

/** The state file the reset lays down, and whose kept block every PR carries. */
export const LECTURE_STATE = '.translate/state/lecture.md.yml';

/** The heading a sync PR body gives state files it had to overwrite (pr-creator.ts). */
export const OVERWRITTEN_HEADING = 'State Files Overwritten';

/** Scenarios that each carry the block in a full run: 12 lecture.md-only, 19 and 20. */
export const FULL_RUN_PRS = 28;
export const FULL_RUN_KEPT = 14;

const ENGINE_LINE = new RegExp(`^(?:${ENGINE_KEYS.join('|')}):`);

/**
 * The kept block: everything after the engine's own fields, which lead the
 * reset's file one line each. Throws when the file has no engine fields, or no
 * top-level key after them, since the check would then prove nothing.
 */
export function expectedTail(mainText) {
  const lines = mainText.split('\n');
  let i = 0;
  while (i < lines.length && ENGINE_LINE.test(lines[i])) i += 1;
  if (i === 0) throw new Error(`${LECTURE_STATE} on main does not start with the engine's fields`);
  // The text after the last engine field's newline, byte for byte.
  const tail = lines.slice(i).join('\n');
  if (!/^[A-Za-z]/m.test(tail)) {
    throw new Error(`${LECTURE_STATE} on main holds no key after the engine's fields`);
  }
  return tail;
}

/** The `source-sha` value of the reset's file, to tell a rewrite from a copy. */
export function mainSourceSha(mainText) {
  const match = /^source-sha: *(\S+)/m.exec(mainText);
  return match ? match[1] : undefined;
}

/**
 * Problems with the engine-owned head of a state file: exactly the six fields,
 * in order, one line each, with a 40-hex `source-sha`. Empty when it is fine.
 */
function engineHeadProblems(head, oldSourceSha) {
  const problems = [];
  const lines = head.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const keys = lines.map((line) => /^([a-z-]+):/.exec(line)?.[1] ?? `(not a field: ${line})`);
  if (keys.join(',') !== ENGINE_KEYS.join(',')) {
    problems.push(`engine fields are [${keys.join(', ')}], expected [${ENGINE_KEYS.join(', ')}]`);
  }
  const sha = /^source-sha: *(\S+)$/m.exec(head)?.[1];
  if (!sha || !/^[0-9a-f]{40}$/.test(sha)) {
    problems.push(`source-sha is ${sha ?? 'missing'}, expected a 40-hex commit`);
  } else if (sha === oldSourceSha) {
    problems.push('source-sha is unchanged from main, so the file was not rewritten');
  }
  return problems;
}

/** Whether a PR file is the state file that comes from lecture.md's. */
function comesFromLecture(file, prFiles) {
  if (file.path === LECTURE_STATE) return file.status === 'modified';
  if (file.status === 'renamed') return file.previous === LECTURE_STATE;
  // GitHub may show a rename as a removal plus an addition.
  return (
    file.status === 'added' &&
    prFiles.some((f) => f.path === LECTURE_STATE && f.status === 'removed')
  );
}

/**
 * Judge one translation PR. `files` lists every state file it touches, as
 * `{ path, status, previous?, text? }` (`text` is the file at the PR's head,
 * absent for a removal). `lectures`, when given, lists the lecture files the
 * PR adds or changes (the targets' docs folder is the repository root), each of
 * which must come with its state file: sync's state write is non-fatal, so a
 * skipped one leaves nothing else to judge. Returns counts and problems.
 */
export function judgePr(pr, tail, oldSourceSha) {
  const result = { kept: 0, plain: 0, problems: [] };
  const say = (msg) => result.problems.push(`PR #${pr.number}: ${msg}`);
  if (typeof pr.body === 'string' && pr.body.includes(OVERWRITTEN_HEADING)) {
    say(`its body lists "${OVERWRITTEN_HEADING}"`);
  }
  const written = new Set(pr.files.filter((f) => f.status !== 'removed').map((f) => f.path));
  for (const lecture of pr.lectures ?? []) {
    if (!written.has(`.translate/state/${lecture}.yml`)) {
      say(`${lecture} changed, but its state file .translate/state/${lecture}.yml was not written`);
    }
  }
  for (const file of pr.files) {
    if (file.status === 'removed') continue;
    if (typeof file.text !== 'string') {
      say(`${file.path}: no content read`);
      continue;
    }
    if (comesFromLecture(file, pr.files)) {
      if (!file.text.endsWith(tail)) {
        say(`${file.path}: the kept block is missing or changed`);
        continue;
      }
      const problems = engineHeadProblems(file.text.slice(0, -tail.length), oldSourceSha);
      if (problems.length > 0) problems.forEach((p) => say(`${file.path}: ${p}`));
      else result.kept += 1;
    } else {
      const problems = engineHeadProblems(file.text, undefined);
      if (problems.length > 0) problems.forEach((p) => say(`${file.path}: ${p}`));
      else result.plain += 1;
    }
  }
  return result;
}

/**
 * Judge one lane: `{ language, mainText, prs: [...] }`. A lane with no
 * translation PR proves nothing and fails (the check ran before the sync runs
 * finished, or after the next reset). With `expectFull`, as the release gate
 * runs it, a lane must hold exactly FULL_RUN_PRS translation PRs with the
 * block in exactly FULL_RUN_KEPT state files; without it, a smaller run (the
 * `@v0` smoke, a `--scenarios` run) is judged on the PRs it has, and a lane
 * that happens to hold FULL_RUN_PRS is still held to FULL_RUN_KEPT.
 */
export function judgeLane(lane, { expectFull = false } = {}) {
  const out = { language: lane.language, prs: lane.prs.length, kept: 0, plain: 0, problems: [] };
  let tail;
  try {
    tail = expectedTail(lane.mainText ?? '');
  } catch (error) {
    out.problems.push(error.message);
    return out;
  }
  if (lane.prs.length === 0) {
    out.problems.push(
      'no open translation PR to judge: run this after the sync runs finish and before the next reset'
    );
    return out;
  }
  const oldSha = mainSourceSha(lane.mainText);
  for (const pr of lane.prs) {
    const r = judgePr(pr, tail, oldSha);
    out.kept += r.kept;
    out.plain += r.plain;
    out.problems.push(...r.problems);
  }
  if (expectFull && lane.prs.length !== FULL_RUN_PRS) {
    out.problems.push(
      `a full run has ${FULL_RUN_PRS} translation PRs per lane; this one has ${lane.prs.length}`
    );
  }
  if ((expectFull || lane.prs.length === FULL_RUN_PRS) && out.kept !== FULL_RUN_KEPT) {
    out.problems.push(
      `a full run carries the block in ${FULL_RUN_KEPT} state files; this one in ${out.kept}`
    );
  }
  return out;
}

/** One line per lane, as the release PR quotes it beside the gate tally. */
export function formatLane(r) {
  const verdict = r.problems.length === 0 ? 'ok' : `${r.problems.length} problem(s)`;
  return `${r.language}: kept ${r.kept}, plain ${r.plain}, across ${r.prs} PR(s) — ${verdict}`;
}

/**
 * Expected results of a scope run: the harness's `--sync-scope existing` (#344).
 *
 * The harness resets every target with a state file for lecture.md and none
 * for lecture-minimal.md, and creates every source PR with SCOPE_LABEL, which
 * the sync workflow turns into `sync-scope: existing`. Under that scope a
 * changed lecture syncs only when the target has its state file, and the PR
 * body lists the lectures left out. Removals and `_toc.yml` sync as before.
 *
 * Every scenario carries one, so a labelled source PR with no translation PR
 * is never dropped from the report:
 * - 17 to 20 each open a translation PR that differs from a plain sync's: 17
 *   leaves its new lecture out, 18 also deletes the lecture's state file, 19
 *   leaves lecture-minimal.md out, and 20 moves the state file with the
 *   lecture. The check reads the PR's file list and body.
 * - The scenarios that change only lecture.md (09 to 15, 22, 23, 25, 26 and
 *   28) sync as under `all`, since the target has the state file, except
 *   that the state file is updated rather than added. The check holds the PR
 *   to those two files, and the model evaluates lecture.md as usual.
 * - The scenarios that change only lecture-minimal.md (01 to 08, 16, 21, 24
 *   and 27) open no translation PR. A matched one is a failure. An unmatched
 *   source PR is the expected result only if its sync run passed, since a
 *   run that fails opens no PR either: the evaluator reads the run's check
 *   (`syncRunVerdict`).
 *
 * The checks are deterministic and make no model call. A labelled source PR
 * whose expectation needs a translation PR, and has none, is a failure.
 */

import type {
  FileDiff,
  ScopeCheckResult,
  SyncCheckRun,
  SyncRunVerdict,
} from './types.js';

/**
 * Runs a source PR under `sync-scope: existing`. test-action-on-github.sh and
 * sync-workflow-template.yml spell it the same way.
 */
export const SCOPE_LABEL = 'test-sync-scope-existing';

/**
 * The PR-body heading over the lectures a scope run left out. A copy of
 * NOT_SYNCED_HEADING in src/sync-scope.ts, since this package does not import
 * the action's source; src/cli/__tests__/workflow-templates.test.ts holds the
 * two together.
 */
export const NOT_SYNCED_HEADING = '### Lectures Not Synced';

/**
 * The check run of the source repo's sync job for the target this evaluator
 * reads (github.ts): the job id `sync-translation-__LANG__` in
 * sync-workflow-template.yml, rendered for zh-cn. The job has no `name:`, so
 * its check run carries the id. workflow-templates.test.ts holds the three
 * together.
 */
export const SYNC_CHECK_NAME = 'sync-translation-zh-cn';

/**
 * How the translation PR changes a file. A GitHub `renamed` entry counts as
 * its previous path `removed` and its new path `added`: whether GitHub pairs
 * the two is a similarity guess, not something the sync decides.
 */
export type FileChange = 'added' | 'modified' | 'removed';

/** A scenario whose run opens a translation PR. */
export interface TargetPRExpectation {
  /** Harness scenario number, as in the source branch `test/<nn>-...`. */
  scenario: string;
  noTargetPR?: false;
  /** Every file the translation PR changes, and how. Any other file is a problem. */
  files: Record<string, FileChange>;
  /** Lectures the body lists under NOT_SYNCED_HEADING. Empty: the section must be absent. */
  notSynced: string[];
  /** The lecture the model evaluates. Absent when the PR translates none: no model call. */
  primaryLecture?: string;
}

/**
 * A scenario whose run opens no translation PR: nothing it changes is in
 * scope, so the sync run's job summary is its only output.
 */
export interface NoTargetPRExpectation {
  /** Harness scenario number, as in the source branch `test/<nn>-...`. */
  scenario: string;
  noTargetPR: true;
  /** Lectures the run leaves out, which its job summary lists. */
  notSynced: string[];
}

export type ScopeExpectation = TargetPRExpectation | NoTargetPRExpectation;

/**
 * The scenarios that change only lecture-minimal.md, in the order of the
 * script's scenario list. workflow-templates.test.ts holds the two together.
 */
export const MINIMAL_ONLY_SCENARIOS = [
  '01', '02', '03', '04', '05', '06', '07', '08', '16', '21', '24', '27',
];

/**
 * The scenarios that change only lecture.md, in the order of the script's
 * scenario list. workflow-templates.test.ts holds the two together.
 */
export const LECTURE_ONLY_SCENARIOS = [
  '09', '10', '11', '12', '13', '14', '15', '22', '23', '25', '26', '28',
];

export const SCOPE_EXPECTATIONS: readonly ScopeExpectation[] = [
  // lecture-minimal.md, the English copy, has no state file, so nothing these
  // source PRs change is in scope: no translation PR, and the run passes.
  ...MINIMAL_ONLY_SCENARIOS.map(
    (scenario): NoTargetPRExpectation => ({
      scenario,
      noTargetPR: true,
      notSynced: ['lecture-minimal.md'],
    })
  ),
  // lecture.md has its state file, so it syncs, and the state file the reset
  // laid down is updated. Nothing is left out.
  ...LECTURE_ONLY_SCENARIOS.map(
    (scenario): TargetPRExpectation => ({
      scenario,
      files: {
        'lecture.md': 'modified',
        '.translate/state/lecture.md.yml': 'modified',
      },
      notSynced: [],
      primaryLecture: 'lecture.md',
    })
  ),
  {
    // New lecture game-theory.md: the target has no state file for it, so
    // only the ToC syncs, mirrored with game-theory in it.
    scenario: '17',
    files: { '_toc.yml': 'modified' },
    notSynced: ['game-theory.md'],
  },
  {
    // Removals are not scoped and follow the .md: the lecture goes, with the
    // state file the reset laid down, and the ToC follows. No lecture is
    // translated, so there is no model call.
    scenario: '18',
    files: {
      'lecture.md': 'removed',
      '.translate/state/lecture.md.yml': 'removed',
      '_toc.yml': 'modified',
    },
    notSynced: [],
  },
  {
    // The mixed PR. lecture.md has its state file, so it syncs and the state
    // file is updated; lecture-minimal.md, the English copy, has none.
    scenario: '19',
    files: {
      'lecture.md': 'modified',
      '.translate/state/lecture.md.yml': 'modified',
    },
    notSynced: ['lecture-minimal.md'],
    primaryLecture: 'lecture.md',
  },
  {
    // A rename is decided by its previous path, which has its state file: the
    // lecture and its state file move, and the ToC follows.
    scenario: '20',
    files: {
      'linear-algebra.md': 'added',
      '.translate/state/linear-algebra.md.yml': 'added',
      'lecture.md': 'removed',
      '.translate/state/lecture.md.yml': 'removed',
      '_toc.yml': 'modified',
    },
    notSynced: [],
    primaryLecture: 'linear-algebra.md',
  },
];

/**
 * The expectation a source PR is held to: it carries SCOPE_LABEL and its
 * scenario, read from the harness branch name, has one.
 */
export function scopeExpectationFor(
  labels: string[],
  branch: string
): ScopeExpectation | undefined {
  if (!labels.includes(SCOPE_LABEL)) return undefined;
  const scenario = branch.match(/^test\/(\d+)-/)?.[1];
  return SCOPE_EXPECTATIONS.find(e => e.scenario === scenario);
}

/** The lectures listed under NOT_SYNCED_HEADING, or undefined when the body has no such section. */
function listedNotSynced(body: string): string[] | undefined {
  const lines = body.split('\n');
  const start = lines.findIndex(line => line.trim() === NOT_SYNCED_HEADING);
  if (start === -1) return undefined;
  const listed: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6} /.test(line) || line.startsWith('<!--')) break;
    // `- \`path\`` or `- \`new\` (renamed from \`old\`)`: the first path is the lecture.
    const item = line.match(/^- `([^`]+)`/);
    if (item) listed.push(item[1]);
  }
  return listed;
}

/**
 * Hold a scope run's translation PR to its expectation: exactly the expected
 * files, each changed the expected way, and exactly the expected lectures
 * listed as not synced. For a scenario that expects no translation PR, the PR
 * itself is the failure, and each file it changes is listed.
 */
export function checkScopeExpectation(
  expectation: ScopeExpectation,
  targetFiles: FileDiff[],
  targetBody: string
): ScopeCheckResult {
  const problems: string[] = [];

  const actual = new Map<string, string>();
  for (const file of targetFiles) {
    if (file.status === 'renamed' && file.previousFilename) {
      actual.set(file.previousFilename, 'removed');
      actual.set(file.filename, 'added');
    } else {
      actual.set(file.filename, file.status);
    }
  }

  if (expectation.noTargetPR) {
    const lectures = expectation.notSynced.map(path => `\`${path}\``).join(', ');
    problems.push(
      `expected no translation PR: there is no state file for ${lectures}, so nothing this scenario changes is in scope`
    );
    for (const [path, got] of actual) problems.push(`\`${path}\`: ${got}, not expected`);
    return { scenario: expectation.scenario, ok: false, problems };
  }

  const expected = new Map(Object.entries(expectation.files));
  for (const [path, change] of expected) {
    const got = actual.get(path);
    if (got === undefined) problems.push(`\`${path}\`: expected ${change}, not in the PR`);
    else if (got !== change) problems.push(`\`${path}\`: expected ${change}, got ${got}`);
  }
  for (const [path, got] of actual) {
    if (!expected.has(path)) problems.push(`\`${path}\`: ${got}, not expected`);
  }

  const listed = listedNotSynced(targetBody);
  const want = [...expectation.notSynced].sort().join(', ');
  if (listed === undefined) {
    if (want) problems.push(`body has no "${NOT_SYNCED_HEADING}" section; expected one listing ${want}`);
  } else if (!want) {
    problems.push(`body has a "${NOT_SYNCED_HEADING}" section listing ${listed.join(', ') || 'nothing'}; expected none`);
  } else {
    const got = [...listed].sort().join(', ');
    if (got !== want) problems.push(`"${NOT_SYNCED_HEADING}" lists ${got || 'nothing'}; expected ${want}`);
  }

  return { scenario: expectation.scenario, ok: problems.length === 0, problems };
}

/** The scope check as a section of a review comment. */
export function formatScopeCheck(check: ScopeCheckResult): string {
  const lines = [`### Sync-scope Check (scenario ${check.scenario})`, ''];
  if (check.ok) {
    lines.push('✅ The PR is what `sync-scope: existing` should produce for this scenario.');
  } else {
    lines.push(
      '❌ The PR is not what `sync-scope: existing` should produce for this scenario:',
      '',
      ...check.problems.map(p => `- ${p}`)
    );
  }
  return lines.join('\n');
}

/**
 * Whether a source PR's zh-cn sync run passed, from the check runs of
 * SYNC_CHECK_NAME on its head commit. A scenario that expects no translation
 * PR needs this: a run that fails opens no PR either, as does one that never
 * fired, so the missing PR alone proves nothing.
 *
 * Skipped runs are ignored. The scope label's own labeled event fires the
 * workflow too, and the job skips that run because it runs only on the
 * test-translation label. Of the rest, the newest decides, so a re-run
 * supersedes the attempt before it. With none left, the sync never ran, which
 * is a failure. A run that has not finished is unverified.
 */
export function syncRunVerdict(runs: readonly SyncCheckRun[]): SyncRunVerdict {
  const fired = runs.filter(run => run.conclusion !== 'skipped');
  if (fired.length === 0) {
    return {
      state: 'failed',
      detail:
        runs.length > 0
          ? `no ${SYNC_CHECK_NAME} run fired (${runs.length} skipped)`
          : `no ${SYNC_CHECK_NAME} run`,
    };
  }
  const newest = fired.reduce((latest, run) => (run.id > latest.id ? run : latest));
  if (newest.status !== 'completed') {
    return { state: 'unverified', detail: `the sync run has not finished (${newest.status})`, url: newest.url };
  }
  if (newest.conclusion === 'success') {
    return { state: 'passed', detail: 'the sync run passed', url: newest.url };
  }
  return {
    state: 'failed',
    detail: `the sync run concluded ${newest.conclusion ?? 'without a conclusion'}`,
    url: newest.url,
  };
}

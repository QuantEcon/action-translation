/**
 * Doctor Command — Health check for a target translation repository
 *
 * Verifies that a target repo is fully configured for action-translation.
 * Like `brew doctor` or `flutter doctor` — traffic-light output.
 *
 * Checks:
 * - .translate/config.yml exists and is valid
 * - The edition's lecture set can be read: its _toc.yml's documents and the
 *   files they include, limited to the .md files it has (#449)
 * - .translate/state/ has entries for every lecture in it; with
 *   --require-state, the four-item check a required CI check runs (#370)
 * - Every lecture in it has a heading-map in frontmatter
 * - Section counts match between source and target
 * - GitHub workflow file exists (.github/workflows/)
 * - Source repo is accessible, with a lecture set (if -s provided)
 * - gh CLI is available and authenticated (if --check-gh)
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { MystParser } from '../../parser.js';
import { extractHeadingMap } from '../../heading-map.js';
import { LectureSetError, normalizeDocsPath } from '../../lecture-set.js';
import {
  readConfig,
  inspectFileState,
  configLoadProblem,
  listStateFiles,
  readStateExceptions,
} from '../translate-state.js';
import { RepoLectures, RepoSide, readRepoLectures } from '../lecture-discovery.js';
import { REVIEW_TRIGGER_LABEL, TARGET_REPO_LABELS } from '../../contracts.js';

// ============================================================================
// TYPES
// ============================================================================

export interface DoctorOptions {
  target: string;
  source?: string; // Optional — enables cross-repo checks
  docsFolder?: string; // Override; otherwise read from config
  checkGh: boolean; // Check gh CLI availability
  json: boolean;
  requireState?: boolean; // The four-item state check, for a required CI check (#370)
}

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface CheckResult {
  name: string;
  status: CheckStatus;
  message: string;
  details?: string[]; // Additional detail lines
  data?: RequiredStateData; // Full lists, for --json (the --require-state check only)
}

/**
 * What `--require-state`'s check found, in full, for `--json` (#370). The
 * details list the first five of each; these lists hold every one, sorted.
 * Lectures and exceptions are docs-relative paths; a state file with no
 * lecture is named by its path in the repository, since it may not name one.
 */
export interface RequiredStateData {
  /** (a) Lectures in the set with no state file, not declared. */
  missing: string[];
  /** (b) Declared exceptions in the set that have a state file. */
  declaredWithState: string[];
  /** (c) Files under `.translate/state/` whose `.md` the edition lacks, or that are not `<path>.md.yml`. */
  orphaned: string[];
  /** (d) Lectures the edition has whose state file cannot be read, with the reason. */
  corrupt: Array<{ file: string; reason: string }>;
  /** Lectures outside the set kept with a state file (#449, ruling 4): a warning. */
  unlisted: string[];
  /** Declared exceptions the edition lacks, or that are outside the set: a warning. */
  staleExceptions: string[];
  /** Problems with `state-exceptions` itself, each a failure. */
  exceptionErrors: string[];
}

export interface DoctorResult {
  /** Set when the run had `--require-state`; absent otherwise. */
  requireState?: true;
  checks: CheckResult[];
  summary: {
    pass: number;
    warn: number;
    fail: number;
    total: number;
  };
}

/**
 * A repository's lecture set as doctor reads it, or the reader's reason it has
 * none (#449). Doctor reports a missing `_toc.yml` as a failed check, beside
 * the checks that need no lecture set, rather than stopping.
 */
export type DoctorLectures = { lectures: RepoLectures } | { error: string };

/** Read a repository's lecture set for doctor; a `LectureSetError` becomes `{ error }`. */
export async function readDoctorLectures(
  repoPath: string,
  docsFolder: string,
  side: RepoSide
): Promise<DoctorLectures> {
  try {
    return { lectures: await readRepoLectures(repoPath, docsFolder, side) };
  } catch (error) {
    if (error instanceof LectureSetError) return { error: error.message };
    throw error;
  }
}

// ============================================================================
// INDIVIDUAL CHECKS
// ============================================================================

/**
 * Check: .translate/config.yml exists and has required fields.
 */
export function checkConfig(targetPath: string): CheckResult {
  const config = readConfig(targetPath);
  if (!config) {
    const configPath = path.join(targetPath, '.translate', 'config.yml');
    if (!fs.existsSync(configPath)) {
      return {
        name: '.translate/config.yml',
        status: 'fail',
        message: 'Config file not found',
        details: ['Run `translate status --write-state` or `translate setup` to create it'],
      };
    }
    // A file that does not load is named as such, a repeated key among them,
    // rather than as one missing its fields (#370).
    const problem = configLoadProblem(targetPath);
    if (problem) {
      return {
        name: '.translate/config.yml',
        status: 'fail',
        message: `Config file exists but cannot be read: ${problem}`,
      };
    }
    return {
      name: '.translate/config.yml',
      status: 'fail',
      message: 'Config file exists but is malformed (missing required fields)',
      details: ['Required fields: source-language, target-language, docs-folder'],
    };
  }

  return {
    name: '.translate/config.yml',
    status: 'pass',
    message: `source=${config['source-language']}, target=${config['target-language']}, docs=${config['docs-folder']}`,
  };
}

/**
 * Check: the edition's lecture set can be read (#449). The state-file,
 * heading-map and section checks run on it, so without one they do not run,
 * and this check fails with the reader's message: a docs folder with no
 * `_toc.yml` has no lecture set (ruling 9). A partial edition's `_toc.yml` is
 * a mirror that lists lectures it lacks; those entries are counted, not failed.
 */
export function checkLectureSet(read: DoctorLectures): CheckResult {
  if ('error' in read) {
    return {
      name: 'Lecture set',
      status: 'fail',
      message: read.error,
      details: [
        'The state-file, heading-map and section-alignment checks run on the lecture set, ' +
          'so they did not run',
      ],
    };
  }

  const { set, lectures } = read.lectures;
  const included = set.fragments.length;
  const result: CheckResult = {
    name: 'Lecture set',
    status: lectures.length > 0 ? 'pass' : 'warn',
    message:
      lectures.length > 0
        ? `${lectures.length} lectures: ${set.documents.length} in ${set.toc}` +
          (included > 0 ? `, ${included} included by them` : '')
        : `No lectures: no entry in ${set.toc} has a .md file behind it`,
  };
  const missing = set.missingEntries;
  if (missing.length > 0) {
    result.details = [
      `${missing.length} ${set.toc} ${missing.length === 1 ? 'entry has' : 'entries have'} ` +
        `no .md file in the edition ` +
        `(a partial edition's ToC lists lectures it has not translated):`,
      ...missing.slice(0, 5).map((entry) => `  ${entry}`),
      ...(missing.length > 5 ? [`  …and ${missing.length - 5} more`] : []),
    ];
  }
  return result;
}

/**
 * Check: .translate/state/ has entries for every lecture in the edition's
 * lecture set (`targetFiles`, docs-relative, subfolders included).
 */
export function checkStateFiles(targetPath: string, targetFiles: readonly string[]): CheckResult {
  if (targetFiles.length === 0) {
    return {
      name: '.translate/state/',
      status: 'warn',
      message: "No .md files in the docs folder's lecture set",
    };
  }

  const stateDir = path.join(targetPath, '.translate', 'state');
  if (!fs.existsSync(stateDir)) {
    return {
      name: '.translate/state/',
      status: 'fail',
      message: `State directory not found (0/${targetFiles.length} files tracked)`,
      details: ['Run `translate status --write-state` to bootstrap state'],
    };
  }

  const missing: string[] = [];
  const corrupt: Array<{ file: string; reason: string }> = [];
  for (const file of targetFiles) {
    const state = inspectFileState(targetPath, file);
    // A state YAML that exists but is unreadable needs repair, not
    // bootstrap — reporting it as "Missing" sent users to
    // `status --write-state`, which overwrote it with current source
    // HEAD and erased the real sync point (#165/F85). The reason names the
    // key to repair (#381).
    if (state.status === 'invalid') {
      corrupt.push({ file, reason: state.reason });
    } else if (state.status === 'missing') {
      missing.push(file);
    }
  }

  if (corrupt.length > 0) {
    return {
      name: '.translate/state/',
      status: 'fail',
      message: `${corrupt.length} state file(s) exist but are unreadable — repair or delete them`,
      details: corrupt
        .slice(0, 5)
        .map(({ file, reason }) => `Corrupt: ${file} (${reason})`)
        .concat(corrupt.length > 5 ? [`…and ${corrupt.length - 5} more`] : []),
    };
  }

  if (missing.length === 0) {
    return {
      name: '.translate/state/',
      status: 'pass',
      message: `All ${targetFiles.length} files have state entries`,
    };
  }

  if (missing.length === targetFiles.length) {
    return {
      name: '.translate/state/',
      status: 'fail',
      message: `No state entries (0/${targetFiles.length} files tracked)`,
      details: missing
        .slice(0, 5)
        .map((f) => `Missing: ${f}`)
        .concat(missing.length > 5 ? [`…and ${missing.length - 5} more`] : []),
    };
  }

  return {
    name: '.translate/state/',
    status: 'warn',
    message: `${targetFiles.length - missing.length}/${targetFiles.length} files tracked (${missing.length} missing)`,
    details: missing
      .slice(0, 5)
      .map((f) => `Missing: ${f}`)
      .concat(missing.length > 5 ? [`…and ${missing.length - 5} more`] : []),
  };
}

/** `n` and the noun that fits it. */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Detail lines for one group: its heading, its first five items, and how many more. */
function detailGroup(heading: string, items: readonly string[]): string[] {
  if (items.length === 0) return [];
  return [
    heading,
    ...items.slice(0, 5).map((item) => `  ${item}`),
    ...(items.length > 5 ? [`  …and ${items.length - 5} more`] : []),
  ];
}

const STATE_FOLDER = '.translate/state/';

/** One declared exception, with the docs-relative file its key names. */
export interface StateException {
  /** The key as the config writes it, such as `./intro.md`. */
  key: string;
  /** The file it names, in the lecture set's spelling: `intro.md`. */
  file: string;
  /** Why the file has no state file. */
  reason: string;
}

/**
 * The edition's declared exceptions (`state-exceptions` in
 * `.translate/config.yml`, #370), each key put in the lecture set's spelling
 * with its reader's normaliser, so `./intro.md`, `intro.md/` and `.\intro.md`
 * all name `intro.md`. Besides the reader's own problems (a config that does
 * not load, a key that is not a mapping, a reason that is not text), each
 * path that is absolute or leaves the docs folder, that is not a `.md` file,
 * or that names a file another key names is a problem; the other entries
 * still apply.
 */
export function readDeclaredExceptions(targetPath: string): {
  exceptions: StateException[];
  problems: string[];
} {
  const read = readStateExceptions(targetPath);
  const exceptions: StateException[] = [];
  const problems = [...read.problems];
  for (const { key, reason } of read.entries) {
    // A trailing `/` would name a folder; drop it, as the key names a file.
    const file = normalizeDocsPath(key.replace(/[\\/]+$/, ''));
    if (file === undefined) {
      problems.push(
        `\`${key}\`: the path is absolute or leaves the docs folder; write it relative to the ` +
          'docs folder'
      );
      continue;
    }
    if (!file.endsWith('.md')) {
      problems.push(`\`${key}\`: not a .md file; only a lecture's .md has a state file`);
      continue;
    }
    const twin = exceptions.find((e) => e.file === file);
    if (twin) {
      problems.push(`\`${key}\` and \`${twin.key}\` both name ${file}; keep one`);
      continue;
    }
    exceptions.push({ key, file, reason });
  }
  return { exceptions, problems };
}

/**
 * Check, with `--require-state`: the state check that every syncing edition
 * is to run as a required CI check before `sync-scope` retires (#370; condition
 * 3 of D-2026-10-19-sync-scope-existing-reads-state-files, run on the lecture
 * set by ruling 7 of D-2026-11-16-the-lecture-set-is-the-toc-and-its-includes,
 * read as D-2026-11-16-require-state-check records). It fails on
 *
 * - (a) a lecture in the edition's lecture set with no state file, unless
 *   `state-exceptions` in `.translate/config.yml` declares it;
 * - (b) a declared exception in the set that has a state file, which puts it
 *   in sync's scope;
 * - (c) a file under `.translate/state/` with no lecture: its `.md` is not in
 *   the edition, or it is not a `<path>.md.yml` at all, which sync never reads;
 * - (d) a state file, of a lecture the edition has, that cannot be read;
 *
 * and on a `state-exceptions` it cannot use as written. It warns on a lecture
 * outside the set kept with its state file (`status`'s UNLISTED, which ruling
 * 4 allows) and on a declared exception the edition lacks or that is outside
 * the set, which is stale and harmless to sync. Every item is reported at once.
 *
 * Each is decided from one listing of the state folder, compared as strings
 * with the lecture set and the edition's `.md` files, so a state file named in
 * another case than its lecture is a missing state file and an orphan on every
 * filesystem. A state file both orphaned and unreadable counts as orphaned,
 * since (d) reads only the state files of the lectures the edition has.
 */
export function checkRequiredState(
  targetPath: string,
  docsFolder: string,
  read: DoctorLectures
): CheckResult {
  const name = '.translate/state/';
  if ('error' in read) {
    return {
      name,
      status: 'fail',
      message: '--require-state: the edition has no lecture set, so no state file was checked',
      details: ['The Lecture set check says why'],
    };
  }

  const { lectures, markdownFiles } = read.lectures;
  const inSet = new Set(lectures);
  const inEdition = new Set(markdownFiles);
  const declared = readDeclaredExceptions(targetPath);
  const exceptionFor = new Map(declared.exceptions.map((e) => [e.file, e]));

  const withState = new Set<string>();
  const orphaned: string[] = [];
  const notStateFiles: string[] = [];
  const corrupt: Array<{ file: string; reason: string }> = [];
  const unlisted: string[] = [];
  for (const entry of listStateFiles(targetPath)) {
    if (!entry.endsWith('.md.yml')) {
      notStateFiles.push(`${STATE_FOLDER}${entry}`);
      continue;
    }
    const file = entry.slice(0, -'.yml'.length);
    if (!inEdition.has(file)) {
      orphaned.push(`${STATE_FOLDER}${entry}`);
      continue;
    }
    withState.add(file);
    const state = inspectFileState(targetPath, file);
    if (state.status === 'invalid') corrupt.push({ file, reason: state.reason });
    if (!inSet.has(file)) unlisted.push(file);
  }

  const sorted = (files: Iterable<string>) => [...files].sort();
  const missing = sorted(lectures.filter((f) => !withState.has(f) && !exceptionFor.has(f)));
  const declaredWithState = declared.exceptions
    .filter((e) => inSet.has(e.file) && withState.has(e.file))
    .sort((a, b) => (a.file < b.file ? -1 : 1));
  const stale = declared.exceptions
    .filter((e) => !inSet.has(e.file))
    .sort((a, b) => (a.file < b.file ? -1 : 1));
  corrupt.sort((a, b) => (a.file < b.file ? -1 : 1));

  // An exception is named as the config writes it, and by the file it names when they differ.
  const shown = (e: { key: string; file: string }) =>
    e.key === e.file ? e.file : `${e.key} (${e.file})`;
  const docsPrefix = normalizeDocsPath(docsFolder.replace(/[\\/]+$/, ''));
  const whyStale = (e: { key: string; file: string }): string => {
    const rest = docsPrefix ? e.file.slice(docsPrefix.length + 1) : '';
    if (docsPrefix && e.file.startsWith(`${docsPrefix}/`) && inSet.has(rest)) {
      return (
        `${shown(e)}: the key is relative to the repository; write it relative to the docs ` +
        `folder, as ${rest}`
      );
    }
    return inEdition.has(e.file)
      ? `${shown(e)}: outside the lecture set (no ToC entry lists it, and no lecture of the ` +
          'edition includes it)'
      : `${shown(e)}: the edition has no such file`;
  };

  const phrases = (counts: Array<[number, string, string]>) =>
    counts.filter(([n]) => n > 0).map(([n, one, many]) => count(n, one, many));
  const failing = phrases([
    [declared.problems.length, 'problem in state-exceptions', 'problems in state-exceptions'],
    [missing.length, 'lecture without a state file', 'lectures without a state file'],
    [
      declaredWithState.length,
      'declared exception with a state file',
      'declared exceptions with a state file',
    ],
    [
      orphaned.length + notStateFiles.length,
      'file in the state folder without a lecture',
      'files in the state folder without a lecture',
    ],
    [corrupt.length, 'unreadable state file', 'unreadable state files'],
  ]);
  const warnings = phrases([
    [
      unlisted.length,
      'lecture outside the lecture set kept with a state file',
      'lectures outside the lecture set kept with a state file',
    ],
    [stale.length, 'stale exception', 'stale exceptions'],
  ]);

  const tracked = lectures.filter((f) => withState.has(f)).length;
  const excused = lectures.filter((f) => !withState.has(f) && exceptionFor.has(f)).length;
  const coverage =
    lectures.length === 0
      ? 'No lectures in the lecture set'
      : `${count(lectures.length, 'lecture', 'lectures')} covered: ${tracked} with a state file` +
        (excused > 0 ? `, ${excused} declared in state-exceptions` : '');

  const details = [
    ...detailGroup('state-exceptions in .translate/config.yml, as written:', declared.problems),
    ...detailGroup(
      'Missing: no state file, and not declared in state-exceptions. Record one with ' +
        '`translate status -f <file> --write-state`, or declare the file:',
      missing
    ),
    ...detailGroup(
      "Declared in state-exceptions, but has a state file, which puts it in sync's scope. " +
        'Delete one or the other:',
      declaredWithState.map(shown)
    ),
    ...detailGroup(
      'State file without a lecture: the edition has no such .md. Restore the lecture, or ' +
        'delete the state file:',
      orphaned
    ),
    ...detailGroup(
      `Not a state file: sync reads only ${STATE_FOLDER}<path>.md.yml. Delete it:`,
      notStateFiles
    ),
    ...detailGroup(
      'Corrupt: the state file exists but cannot be read. Repair or delete it:',
      corrupt.map(({ file, reason }) => `${file} (${reason})`)
    ),
    ...detailGroup(
      'Unlisted (a warning): outside the lecture set, kept with a state file, so sync does ' +
        'not update it:',
      unlisted
    ),
    ...detailGroup(
      'Stale exception (a warning): declared, but not a lecture of the edition. Remove it ' +
        'from state-exceptions:',
      stale.map(whyStale)
    ),
  ];

  const result: CheckResult = {
    name,
    status: failing.length > 0 ? 'fail' : warnings.length > 0 ? 'warn' : 'pass',
    message:
      failing.length > 0
        ? `--require-state: ${failing.join(', ')}`
        : [coverage, ...warnings].join('; '),
    data: {
      missing,
      declaredWithState: declaredWithState.map((e) => e.file),
      orphaned: sorted([...orphaned, ...notStateFiles]),
      corrupt,
      unlisted: sorted(unlisted),
      staleExceptions: stale.map((e) => e.file),
      exceptionErrors: declared.problems,
    },
  };
  if (details.length > 0) result.details = details;
  return result;
}

/**
 * Check: every lecture in the edition's lecture set (`targetFiles`) has a
 * heading-map in frontmatter. Files with 0 sections (no ## headings, such as
 * an included admonition) are expected to have no heading-map.
 */
export function checkHeadingMaps(
  targetPath: string,
  docsFolder: string,
  targetFiles: readonly string[]
): CheckResult {
  if (targetFiles.length === 0) {
    return {
      name: 'Heading maps',
      status: 'warn',
      message: "No .md files in the docs folder's lecture set",
    };
  }

  const missing: string[] = [];
  let sectionlessCount = 0;
  for (const file of targetFiles) {
    const filePath = path.join(targetPath, docsFolder, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Count ## sections — files with no sections don't need heading-maps
    const sectionCount = (content.match(/^## /gm) || []).length;
    if (sectionCount === 0) {
      sectionlessCount++;
      continue;
    }

    const map = extractHeadingMap(content);
    if (map.size === 0) {
      missing.push(file);
    }
  }

  const filesWithSections = targetFiles.length - sectionlessCount;

  if (filesWithSections === 0) {
    return {
      name: 'Heading maps',
      status: 'pass',
      message: `All ${targetFiles.length} files have 0 sections (no heading-maps needed)`,
    };
  }

  if (missing.length === 0) {
    const note = sectionlessCount > 0 ? ` (${sectionlessCount} section-less files skipped)` : '';
    return {
      name: 'Heading maps',
      status: 'pass',
      message: `All ${filesWithSections} files with sections have heading-maps${note}`,
    };
  }

  return {
    name: 'Heading maps',
    status: missing.length === filesWithSections ? 'fail' : 'warn',
    message: `${filesWithSections - missing.length}/${filesWithSections} files with sections have heading-maps (${missing.length} missing)${sectionlessCount > 0 ? ` — ${sectionlessCount} section-less files skipped` : ''}`,
    details: missing
      .slice(0, 5)
      .map((f) => `Missing: ${f}`)
      .concat(missing.length > 5 ? [`…and ${missing.length - 5} more`] : []),
  };
}

/**
 * Check: Section counts match between source and target files, for the
 * lectures both lecture sets hold. Only runs when source path is provided.
 */
export async function checkSectionAlignment(
  sourcePath: string,
  targetPath: string,
  docsFolder: string,
  sourceLectures: readonly string[],
  targetLectures: readonly string[]
): Promise<CheckResult> {
  // Only check files that exist in both repos
  const inTarget = new Set(targetLectures);
  const commonFiles = sourceLectures.filter((f) => inTarget.has(f));

  if (commonFiles.length === 0) {
    return {
      name: 'Section alignment',
      status: 'warn',
      message: 'No common files found between source and target',
    };
  }

  const parser = new MystParser();
  const mismatched: string[] = [];

  for (const file of commonFiles) {
    const sourceContent = fs.readFileSync(path.join(sourcePath, docsFolder, file), 'utf-8');
    const targetContent = fs.readFileSync(path.join(targetPath, docsFolder, file), 'utf-8');

    const sourceParsed = await parser.parseSections(sourceContent, file);
    const targetParsed = await parser.parseSections(targetContent, file);

    if (sourceParsed.sections.length !== targetParsed.sections.length) {
      mismatched.push(
        `${file}: ${sourceParsed.sections.length} source vs ${targetParsed.sections.length} target`
      );
    }
  }

  if (mismatched.length === 0) {
    return {
      name: 'Section alignment',
      status: 'pass',
      message: `All ${commonFiles.length} common files have matching section counts`,
    };
  }

  return {
    name: 'Section alignment',
    status: 'warn',
    message: `${mismatched.length}/${commonFiles.length} files have section count mismatches`,
    details: mismatched
      .slice(0, 5)
      .concat(mismatched.length > 5 ? [`…and ${mismatched.length - 5} more`] : []),
  };
}

/**
 * Check: GitHub workflow file exists in target repo.
 */
export function checkWorkflow(targetPath: string): CheckResult {
  const workflowDir = path.join(targetPath, '.github', 'workflows');

  if (!fs.existsSync(workflowDir)) {
    return {
      name: 'Workflow',
      status: 'fail',
      message: 'No .github/workflows/ directory found',
      details: ['Run `translate setup` to generate workflow files'],
    };
  }

  const files = fs
    .readdirSync(workflowDir)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));

  if (files.length === 0) {
    return {
      name: 'Workflow',
      status: 'fail',
      message: 'No workflow files found in .github/workflows/',
    };
  }

  // Check if any workflow contains action-translation references — the label
  // constant doubles as the action-slug substring, so one match covers both.
  const translationWorkflows = files.filter((f) => {
    const content = fs.readFileSync(path.join(workflowDir, f), 'utf-8');
    return content.includes(REVIEW_TRIGGER_LABEL);
  });

  if (translationWorkflows.length === 0) {
    return {
      name: 'Workflow',
      status: 'warn',
      message: `${files.length} workflow file(s) found, but none reference action-translation`,
      details: files.map((f) => `Found: ${f}`),
    };
  }

  // A review workflow whose trigger list lacks `labeled` can never fire on
  // Action sync PRs: the `action-translation` label is applied after the PR
  // opens, so the label gate always sees an unlabeled PR (#161 — the shape
  // behind six PRs of real translated content merging unreviewed in v0.21.0).
  const unfireable = translationWorkflows.filter((f) => {
    const content = fs.readFileSync(path.join(workflowDir, f), 'utf-8');
    if (!content.includes('mode: review')) return false;
    // `labeled` must appear in a trigger `types:` list (inline or dash form) —
    // an `if:` guard mentioning 'labeled' does not make the workflow fireable.
    const triggerHasLabeled =
      /types:\s*\[[^\]]*\blabeled\b[^\]]*\]/.test(content) || /^\s*-\s*labeled\b/m.test(content);
    return !triggerHasLabeled;
  });
  if (unfireable.length > 0) {
    return {
      name: 'Workflow',
      status: 'warn',
      message: `Review workflow cannot fire on sync PRs — trigger list lacks \`labeled\``,
      details: [
        ...unfireable.map((f) => `Unfireable: ${f}`),
        'The action-translation label is applied after the PR opens, so',
        '`types: [opened, synchronize]` never sees it. Update the workflow from',
        'examples/review-translations.yml in the action-translation repo.',
      ],
    };
  }

  // A version-pinned action (`@v0.9.0`-style) goes stale silently — the
  // floating `@v0` is the supported pin, moved on every release. Built from
  // the constant so the slug cannot drift from the contract's spelling.
  const pinnedPattern = new RegExp(`${REVIEW_TRIGGER_LABEL}@v\\d+\\.\\d`);
  const pinned = translationWorkflows.filter((f) => {
    const content = fs.readFileSync(path.join(workflowDir, f), 'utf-8');
    return pinnedPattern.test(content);
  });
  if (pinned.length > 0) {
    return {
      name: 'Workflow',
      status: 'warn',
      message: 'Workflow pins a fixed action version — use the floating @v0 tag',
      details: pinned.map((f) => `Pinned: ${f}`),
    };
  }

  return {
    name: 'Workflow',
    status: 'pass',
    message: `Translation workflow: ${translationWorkflows.join(', ')}`,
  };
}

/**
 * Check: Source repo is accessible, and its docs folder has a lecture set
 * (`read`, #449) with lectures in it.
 */
export function checkSourceAccess(
  sourcePath: string,
  docsFolder: string,
  read: DoctorLectures
): CheckResult {
  if (!fs.existsSync(sourcePath)) {
    return {
      name: 'Source repo',
      status: 'fail',
      message: `Source path not found: ${sourcePath}`,
    };
  }

  if ('error' in read) {
    return { name: 'Source repo', status: 'fail', message: read.error };
  }

  const { set, lectures } = read.lectures;
  if (lectures.length === 0) {
    return {
      name: 'Source repo',
      status: 'warn',
      message: `Source path exists but no entry in ${docsFolder}/${set.toc} has a .md file behind it`,
    };
  }

  const included = set.fragments.length;
  return {
    name: 'Source repo',
    status: 'pass',
    message:
      `${lectures.length} lectures in ${docsFolder}/: ${set.documents.length} in ${set.toc}` +
      (included > 0 ? `, ${included} included by them` : ''),
  };
}

/**
 * Check: gh CLI is available and authenticated.
 */
export function checkGhCli(): CheckResult {
  try {
    const result = spawnSync('gh', ['auth', 'status'], {
      encoding: 'utf8',
      timeout: 10_000,
    });

    if (result.error) {
      const err = result.error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return {
          name: 'gh CLI',
          status: 'warn',
          message: 'gh CLI not installed (needed for --github modes)',
          details: ['Install from https://cli.github.com/'],
        };
      }
      return {
        name: 'gh CLI',
        status: 'warn',
        message: `gh CLI error: ${err.message}`,
      };
    }

    if (result.status !== 0) {
      return {
        name: 'gh CLI',
        status: 'warn',
        message: 'gh CLI not authenticated',
        details: ['Run `gh auth login` to authenticate'],
      };
    }

    return {
      name: 'gh CLI',
      status: 'pass',
      message: 'Authenticated',
    };
  } catch {
    return {
      name: 'gh CLI',
      status: 'warn',
      message: 'Could not check gh CLI',
    };
  }
}

/**
 * Check: the TARGET repo carries every label the pipeline gates on.
 *
 * `gh pr create --label` fails outright on a missing label, and the Action's
 * label call degrades to a PR the review workflow never fires on — the
 * `action-translation` label is the sole gate in the review workflow, so its
 * absence is a silent review outage. Needs network + gh auth, so it runs only
 * under --check-gh, like checkGhCli.
 */
export function checkLabels(targetPath: string): CheckResult {
  try {
    const repoResult = spawnSync(
      'gh',
      ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'],
      {
        encoding: 'utf8',
        timeout: 15_000,
        cwd: targetPath,
      }
    );
    if (repoResult.error || repoResult.status !== 0) {
      return {
        name: 'Labels',
        status: 'warn',
        message: 'Could not resolve the target GitHub repo (no gh remote?)',
      };
    }
    const repoSlug = repoResult.stdout.trim();

    const labelResult = spawnSync(
      'gh',
      ['label', 'list', '-R', repoSlug, '--json', 'name', '-q', '.[].name'],
      {
        encoding: 'utf8',
        timeout: 15_000,
      }
    );
    if (labelResult.error || labelResult.status !== 0) {
      return {
        name: 'Labels',
        status: 'warn',
        message: `Could not list labels for ${repoSlug}`,
      };
    }

    const existing = new Set(labelResult.stdout.split('\n').map((l) => l.trim()));
    const missing = TARGET_REPO_LABELS.filter((label) => !existing.has(label));
    if (missing.length > 0) {
      return {
        name: 'Labels',
        status: 'warn',
        message: `${repoSlug} is missing ${missing.length} label(s) the pipeline gates on`,
        details: missing.map(
          (label) => `Create it: gh label create ${label} -R ${repoSlug} --force`
        ),
      };
    }

    return {
      name: 'Labels',
      status: 'pass',
      message: `All ${TARGET_REPO_LABELS.length} pipeline labels exist in ${repoSlug}`,
    };
  } catch {
    return {
      name: 'Labels',
      status: 'warn',
      message: 'Could not check labels',
    };
  }
}

// ============================================================================
// MAIN COMMAND
// ============================================================================

/**
 * Run the doctor command — check health of a target translation repo.
 */
export async function runDoctor(options: DoctorOptions): Promise<DoctorResult> {
  const checks: CheckResult[] = [];

  // 1. Config check
  const configResult = checkConfig(options.target);
  checks.push(configResult);

  // Determine docs-folder: explicit option > config > default
  let docsFolder = options.docsFolder ?? 'lectures';
  if (!options.docsFolder && configResult.status === 'pass') {
    const config = readConfig(options.target);
    if (config) {
      docsFolder = config['docs-folder'];
    }
  }

  // 2. The edition's lecture set (#449): the checks below run on it
  const edition = await readDoctorLectures(options.target, docsFolder, 'TARGET');
  checks.push(checkLectureSet(edition));

  // 3. State files and heading maps, for each lecture in it. With
  // --require-state the state check is the four-item check (#370), and with no
  // lecture set it fails rather than being left out, so a required CI check
  // cannot pass on an edition it could not check.
  if (options.requireState) {
    checks.push(checkRequiredState(options.target, docsFolder, edition));
  } else if ('lectures' in edition) {
    checks.push(checkStateFiles(options.target, edition.lectures.lectures));
  }
  if ('lectures' in edition) {
    checks.push(checkHeadingMaps(options.target, docsFolder, edition.lectures.lectures));
  }

  // 4. Workflow check
  checks.push(checkWorkflow(options.target));

  // 5. Source repo checks (only if source provided)
  if (options.source) {
    const source = await readDoctorLectures(options.source, docsFolder, 'SOURCE');
    checks.push(checkSourceAccess(options.source, docsFolder, source));
    if ('lectures' in source && 'lectures' in edition) {
      checks.push(
        await checkSectionAlignment(
          options.source,
          options.target,
          docsFolder,
          source.lectures.lectures,
          edition.lectures.lectures
        )
      );
    }
  }

  // 6. gh CLI + label checks (only if requested — both need network + auth)
  if (options.checkGh) {
    checks.push(checkGhCli());
    checks.push(checkLabels(options.target));
  }

  // Build summary
  const summary = {
    pass: checks.filter((c) => c.status === 'pass').length,
    warn: checks.filter((c) => c.status === 'warn').length,
    fail: checks.filter((c) => c.status === 'fail').length,
    total: checks.length,
  };

  return { ...(options.requireState ? { requireState: true as const } : {}), checks, summary };
}

// ============================================================================
// CONSOLE OUTPUT
// ============================================================================

const STATUS_ICONS: Record<CheckStatus, string> = {
  pass: '✅',
  warn: '⚠️',
  fail: '❌',
};

/**
 * Format doctor results for console display.
 */
export function formatDoctorTable(result: DoctorResult): string {
  const lines: string[] = [];

  lines.push('Translation Repo Health Check');
  lines.push('');

  for (const check of result.checks) {
    const icon = STATUS_ICONS[check.status];
    lines.push(`  ${icon} ${check.name}: ${check.message}`);
    if (check.details) {
      for (const detail of check.details) {
        lines.push(`     ${detail}`);
      }
    }
  }

  lines.push('');

  const s = result.summary;
  if (s.fail === 0 && s.warn === 0) {
    lines.push('All checks passed!');
  } else {
    const parts = [];
    if (s.pass > 0) parts.push(`${s.pass} passed`);
    if (s.warn > 0) parts.push(`${s.warn} warnings`);
    if (s.fail > 0) parts.push(`${s.fail} failed`);
    lines.push(parts.join(', '));
  }

  return lines.join('\n');
}

/**
 * Format doctor results as JSON.
 */
export function formatDoctorJson(result: DoctorResult): string {
  return JSON.stringify(result, null, 2);
}

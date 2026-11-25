/**
 * Status Command
 *
 * Fast, free diagnostic — no LLM calls.
 * Compares SOURCE and TARGET repos to produce a per-file sync status.
 *
 * Output goes to the CLI console (like `git status`), not report files.
 *
 * A bulk run takes its files from both repositories' lecture sets (#449): the
 * docs folder's ToC documents and the `.md` files they include, subfolders
 * included. `-f` names one file and skips that discovery.
 *
 * Primary status (most significant issue):
 * - ALIGNED:            Structure matches, heading-map present, no newer SOURCE commits
 * - OUTDATED:           Structure/heading-map OK, but SOURCE has newer commits than TARGET
 * - SOURCE_AHEAD:       SOURCE has more sections than TARGET (sections added upstream)
 * - TARGET_AHEAD:       TARGET has more sections than SOURCE (unexpected divergence)
 * - MISSING_HEADINGMAP: No heading-map in TARGET file
 * - SOURCE_ONLY:        File exists in SOURCE but not TARGET
 * - TARGET_ONLY:        File exists in TARGET but not SOURCE
 * - UNLISTED:           TARGET file in neither lecture set, with a state file: a
 *                       lecture taken out of the ToC and kept, which sync no
 *                       longer updates (#449, ruling 4)
 * - NOT_FOUND:          File not found in either repo (only with --file)
 *
 * Flags (compound conditions — a file may have multiple):
 * - SOURCE_AHEAD / TARGET_AHEAD: section count mismatch (more sections in one side)
 * - MISSING_HEADINGMAP: no heading-map in TARGET
 * - OUTDATED: SOURCE has newer commits than TARGET (commit-date comparison)
 */

import * as fs from 'fs';
import * as path from 'path';
import { MystParser } from '../../parser.js';
import { extractHeadingMap } from '../../heading-map.js';
import { getFileGitMetadata, fileChangedSince, commitsSince } from '../git-metadata.js';
import {
  inspectFileState,
  readFileState,
  writeFileState,
  writeConfig,
} from '../translate-state.js';
import { triageForward } from '../forward-triage.js';
import { RepoLectures, readBulkLectures } from '../lecture-discovery.js';
import { DEFAULT_CLAUDE_MODEL } from '../../models.js';
import { languageLabel } from '../../language-config.js';

// ============================================================================
// TYPES
// ============================================================================

export type FileSyncStatus =
  | 'ALIGNED'
  | 'OUTDATED'
  | 'SOURCE_AHEAD'
  | 'TARGET_AHEAD'
  | 'MISSING_HEADINGMAP'
  | 'SOURCE_ONLY'
  | 'TARGET_ONLY'
  | 'UNLISTED'
  | 'NOT_FOUND';

export interface FileStatusEntry {
  file: string;
  status: FileSyncStatus; // Primary (most significant) status
  flags: FileSyncStatus[]; // All conditions that apply (compound)
  details?: string; // Human-readable detail (e.g., "7 source vs 6 target sections")
  sourceSections?: number;
  targetSections?: number;
  sourceLastModified?: string; // ISO date
  targetLastModified?: string; // ISO date
  contentSync?: string; // Forward triage verdict (only with --check-sync)
  contentSyncReason?: string; // Reason from triage (only with --check-sync)
}

export interface StatusResult {
  sourceRepo: string;
  targetRepo: string;
  language: string;
  entries: FileStatusEntry[];
  summary: {
    total: number;
    aligned: number;
    outdated: number;
    sourceAhead: number;
    targetAhead: number;
    missingHeadingMap: number;
    sourceOnly: number;
    targetOnly: number;
    unlisted: number;
    notFound: number;
  };
  /** What `--write-state` did; absent without it (#401). */
  writeState?: WriteStateResult;
}

/**
 * What `--write-state` wrote, and what it did not, with why (#401). A file
 * gets a state file only when both repositories have it.
 */
export interface WriteStateResult {
  /** Whether `.translate/config.yml` was written: only once some file is eligible. */
  configWritten: boolean;
  /** The files that got a state file. */
  written: string[];
  /**
   * The files with no state file written: a repository lacks them, or the
   * file is outside the lecture set and keeps the state file it has.
   */
  skipped: Array<{
    file: string;
    reason: 'source only' | 'target only' | 'not found' | 'not in the lecture set';
  }>;
  /** The files whose state could not be written, with the error. */
  failed: Array<{ file: string; error: string }>;
  /**
   * The files among `written` whose existing state file was not a YAML
   * mapping, so it was overwritten rather than merged (#290), with the
   * warning. Absent when there were none.
   */
  overwritten?: Array<{ file: string; warning: string }>;
}

/**
 * Whether a `--write-state` run failed (#401): a write failed, or nothing
 * was written, whether the run named one file with `-f` or ran in bulk.
 */
export function writeStateFailed(result: WriteStateResult): boolean {
  return result.failed.length > 0 || result.written.length === 0;
}

export interface StatusOptions {
  source: string;
  target: string;
  docsFolder: string;
  language: string;
  exclude: string[]; // Docs-relative paths to exclude; `*` at either end matches any text
  file?: string; // Single file to check (relative to docs-folder)
  writeState?: boolean; // Bootstrap .translate/ metadata from current state
  sourceLanguage?: string; // Required when writeState is true
  force?: boolean; // Skip every --write-state safety check (dates, carried changes, unreadable state)
  carried?: boolean; // With --write-state: confirm English changes since each recorded sync point are carried (#380)
  checkSync?: boolean; // LLM-based content sync check (requires ANTHROPIC_API_KEY)
  apiKey?: string; // Anthropic API key (required for --check-sync)
  model?: string; // Claude model (default: DEFAULT_CLAUDE_MODEL — see src/models.ts)
  testMode?: boolean; // Use mock triage responses (for --check-sync)
}

// ============================================================================
// FILE DISCOVERY
// ============================================================================

/**
 * Resolve the set of all files across SOURCE and TARGET, paired by their
 * docs-relative path. Returns a deduplicated sorted list.
 */
export function resolveFilePairs(sourceFiles: string[], targetFiles: string[]): string[] {
  const all = new Set([...sourceFiles, ...targetFiles]);
  return Array.from(all).sort();
}

/**
 * Apply exclude patterns to a list of docs-relative paths. A pattern matches
 * a whole path, and a `*` at either end matches any text there: `README.md`,
 * `_admonition/gpu.md`, `*.yml` (a suffix), `troubleshoot*` and
 * `_admonition/*` (a prefix), `*draft*` (anywhere).
 */
export function applyExcludes(files: string[], excludes: string[]): string[] {
  if (excludes.length === 0) return files;

  const matches = (file: string, pattern: string): boolean => {
    const leading = pattern.startsWith('*');
    const trailing = pattern.length > 1 && pattern.endsWith('*');
    const core = pattern.slice(leading ? 1 : 0, trailing ? -1 : undefined);
    if (leading && trailing) return file.includes(core);
    if (leading) return file.endsWith(core);
    if (trailing) return file.startsWith(core);
    return file === pattern;
  };
  return files.filter((file) => !excludes.some((pattern) => matches(file, pattern)));
}

/**
 * The edition's `.md` files outside both lecture sets that have a state file:
 * lectures taken out of the ToC and kept, with their translation and state
 * file (#449, ruling 4). Sync no longer updates them, so `status` names them,
 * or they would go stale with no tool saying so. A `.md` without a state
 * file, such as a `README.md`, is not a lecture and is left out (ruling 3). A
 * state file counts by existence, a corrupt one too, and its fault is kept:
 * no other check reads a state file outside the set, so this is where it
 * shows.
 */
export function findUnlistedLectures(
  targetRepoPath: string,
  edition: RepoLectures,
  listed: ReadonlySet<string>
): Map<string, string | undefined> {
  const unlisted = new Map<string, string | undefined>();
  for (const file of edition.markdownFiles) {
    if (listed.has(file)) continue;
    const state = inspectFileState(targetRepoPath, file);
    if (state.status === 'missing') continue;
    unlisted.set(file, state.status === 'invalid' ? state.reason : undefined);
  }
  return unlisted;
}

/** The entry for an un-listed lecture: reported, never compared or written. */
function unlistedEntry(file: string, stateFault?: string): FileStatusEntry {
  return {
    file,
    status: 'UNLISTED',
    flags: ['UNLISTED'],
    details:
      'not in the lecture set: kept with its state file, so sync no longer updates it' +
      (stateFault ? `; its state file is unreadable: ${stateFault}` : ''),
  };
}

/** Statuses whose file is not in both repositories' lecture sets, so nothing compares them. */
const NOT_COMPARED: ReadonlySet<FileSyncStatus> = new Set([
  'SOURCE_ONLY',
  'TARGET_ONLY',
  'NOT_FOUND',
  'UNLISTED',
]);

// ============================================================================
// PER-FILE STATUS CHECK
// ============================================================================

/**
 * Determine the sync status of a single file.
 *
 * Builds a list of all applicable flags, then picks the most significant
 * as the primary status. Priority: SOURCE_AHEAD/TARGET_AHEAD > MISSING_HEADINGMAP > OUTDATED > ALIGNED.
 */
export async function checkFileStatus(
  file: string,
  sourceRepoPath: string,
  targetRepoPath: string,
  docsFolder: string,
  stateAware: boolean = false
): Promise<FileStatusEntry> {
  const sourceFilePath = path.join(sourceRepoPath, docsFolder, file);
  const targetFilePath = path.join(targetRepoPath, docsFolder, file);

  const sourceExists = fs.existsSync(sourceFilePath);
  const targetExists = fs.existsSync(targetFilePath);

  // Existence checks — these are exclusive, no compound flags
  if (!sourceExists && targetExists) {
    return { file, status: 'TARGET_ONLY', flags: ['TARGET_ONLY'] };
  }
  if (sourceExists && !targetExists) {
    return { file, status: 'SOURCE_ONLY', flags: ['SOURCE_ONLY'] };
  }
  if (!sourceExists && !targetExists) {
    return {
      file,
      status: 'NOT_FOUND',
      flags: ['NOT_FOUND'],
      details: 'File not found in either repo',
    };
  }

  // Both exist — collect all flags
  const flags: FileSyncStatus[] = [];
  const details: string[] = [];

  // Read content
  const sourceContent = fs.readFileSync(sourceFilePath, 'utf-8');
  const targetContent = fs.readFileSync(targetFilePath, 'utf-8');

  // Parse sections
  const parser = new MystParser();
  const sourceParsed = await parser.parseSections(sourceContent, sourceFilePath);
  const targetParsed = await parser.parseSections(targetContent, targetFilePath);

  const sourceSectionCount = sourceParsed.sections.length;
  const targetSectionCount = targetParsed.sections.length;

  // Check section count mismatch
  if (sourceSectionCount > targetSectionCount) {
    flags.push('SOURCE_AHEAD');
    details.push(`${sourceSectionCount} source vs ${targetSectionCount} target sections`);
  } else if (targetSectionCount > sourceSectionCount) {
    flags.push('TARGET_AHEAD');
    details.push(`${targetSectionCount} target vs ${sourceSectionCount} source sections`);
  }

  // Check heading-map (only flag if the document actually has sections to map)
  const headingMap = extractHeadingMap(targetContent);
  if (headingMap.size === 0 && sourceSectionCount > 0) {
    flags.push('MISSING_HEADINGMAP');
  }

  // Check git dates
  const docsRelPath = docsFolder ? path.join(docsFolder, file) : file;
  const sourceMetadata = await getFileGitMetadata(sourceRepoPath, docsRelPath);
  const targetMetadata = await getFileGitMetadata(targetRepoPath, docsRelPath);

  const sourceDate = sourceMetadata?.lastModified;
  const targetDate = targetMetadata?.lastModified;

  let sourceLastModified: string | undefined;
  let targetLastModified: string | undefined;

  if (sourceDate) {
    sourceLastModified = sourceDate.toISOString().split('T')[0];
  }
  if (targetDate) {
    targetLastModified = targetDate.toISOString().split('T')[0];
  }

  if (sourceDate && targetDate && sourceDate > targetDate) {
    flags.push('OUTDATED');
    details.push(`SOURCE modified ${sourceLastModified}, TARGET modified ${targetLastModified}`);
  }

  // If state exists, use source-sha for exact staleness check
  if (stateAware) {
    const fileState = readFileState(targetRepoPath, file);
    if (fileState && sourceMetadata) {
      // Has the source file changed since last sync? The same commit is the
      // fast path. A different one is asked about content: sync records the
      // source PR's merge commit, which after a merge-commit or rebase merge
      // is not the file's last commit though the file is unchanged (#391).
      // When git cannot tell (the recorded commit is not in the clone), the
      // lecture stays OUTDATED.
      const isStale =
        sourceMetadata.lastCommit !== fileState['source-sha'] &&
        (await fileChangedSince(sourceRepoPath, fileState['source-sha'], docsRelPath)) !== false;
      if (isStale && !flags.includes('OUTDATED')) {
        flags.push('OUTDATED');
        details.push(`source-sha changed since last sync`);
      } else if (!isStale && flags.includes('OUTDATED')) {
        // Git dates said OUTDATED but source-sha matches — not actually stale
        const idx = flags.indexOf('OUTDATED');
        flags.splice(idx, 1);
        // Remove the date-based detail
        const detailIdx = details.findIndex((d) => d.includes('SOURCE modified'));
        if (detailIdx >= 0) details.splice(detailIdx, 1);
      }
    }
  }

  // Pick primary status (highest priority flag, or ALIGNED if no flags)
  const PRIORITY: FileSyncStatus[] = [
    'SOURCE_AHEAD',
    'TARGET_AHEAD',
    'MISSING_HEADINGMAP',
    'OUTDATED',
  ];
  const primary = PRIORITY.find((s) => flags.includes(s)) ?? 'ALIGNED';
  if (primary === 'ALIGNED') {
    flags.push('ALIGNED');
  }

  return {
    file,
    status: primary,
    flags,
    details: details.length > 0 ? details.join('; ') : undefined,
    sourceSections: sourceSectionCount,
    targetSections: targetSectionCount,
    sourceLastModified,
    targetLastModified,
  };
}

// ============================================================================
// --write-state CARRIED-CHANGE GUARD (#380)
// ============================================================================

/** A lecture whose English changed after the sync point its state file records. */
interface UncarriedChange {
  file: string;
  recorded: string; // The state file's source-sha
  sourcePath: string; // The English file, relative to the source clone
  commits?: string[]; // Commits since the recorded one; undefined when it is not in the clone
}

/**
 * Find the lectures whose English changed after the sync point their state
 * file records.
 *
 * The date guard compares last-commit dates only, so any later commit to the
 * lecture (a reviewer's suggestion on a round's branch) let --write-state
 * record the current English commit over English changes the translation never
 * carried, and the lecture then read ALIGNED (#380). A readable state file
 * names the commit the translation was last synced from, so git can answer
 * directly: has the English file's content changed since that commit? Content
 * decides, not commit identity, so a recorded commit that did not touch the
 * file (the merge commit sync records, #391) passes.
 *
 * Checked: each entry that will receive state, whose readable state file
 * records a source-sha other than 'unknown' that differs from the English
 * file's last commit. Left to the date guard alone: lectures without a
 * readable state file (bootstrap; an unreadable one is refused at write time),
 * records of 'unknown', and English with no git history, for which the write
 * records 'unknown' and so claims nothing.
 */
async function findUncarriedChanges(
  entries: FileStatusEntry[],
  source: string,
  target: string,
  docsFolder: string
): Promise<UncarriedChange[]> {
  const uncarried: UncarriedChange[] = [];
  for (const entry of entries) {
    if (NOT_COMPARED.has(entry.status)) continue;

    const recorded = readFileState(target, entry.file)?.['source-sha'];
    if (!recorded || recorded === 'unknown') continue;

    const sourcePath = docsFolder ? path.join(docsFolder, entry.file) : entry.file;
    const current = await getFileGitMetadata(source, sourcePath);
    if (!current || current.lastCommit === recorded) continue;

    const changed = await fileChangedSince(source, recorded, sourcePath);
    if (changed === false) continue;

    uncarried.push({
      file: entry.file,
      recorded,
      sourcePath,
      commits: changed ? await commitsSince(source, recorded, sourcePath) : undefined,
    });
  }
  return uncarried;
}

/** One refusal naming every lecture findUncarriedChanges found. */
function uncarriedChangesError(uncarried: UncarriedChange[]): Error {
  const lines: string[] = [];
  for (const u of uncarried) {
    const recorded = u.recorded.slice(0, 7);
    if (u.commits === undefined) {
      lines.push(`  ${u.file}  (recorded ${recorded}, which is not in the local source clone)`);
      continue;
    }
    lines.push(`  ${u.file}  (recorded ${recorded})`);
    if (u.commits.length > 0) {
      lines.push(...u.commits.map((commit) => `    ${commit}`));
    } else {
      // The content differs, yet git log lists no commit since the recorded
      // one: the recorded commit is not an ancestor of HEAD, or a merge that
      // kept the other side's version hides the change from log's history
      // simplification. The diff still shows what moved.
      lines.push(
        `    (no listed commit; see git diff ${recorded} HEAD -- ${u.sourcePath}, ` +
          `and pull the clone first if the recorded commit is newer than its HEAD)`
      );
    }
  }
  const missing = uncarried.some((u) => u.commits === undefined);
  return new Error(
    `--write-state blocked: ${uncarried.length} file(s) have English changes since the sync point their state file records.\n` +
      `Recording the current English commit would mark those changes as carried into the translation.\n\n` +
      lines.join('\n') +
      '\n\n' +
      (missing
        ? `A recorded commit that is not in the local source clone cannot be checked: ` +
          `pull or unshallow the clone and rerun, or confirm with --carried.\n\n`
        : '') +
      `Options:\n` +
      `  1. Carry each change into the translation and commit it, then rerun with --carried\n` +
      `  2. Use --force to write state anyway (skips every check)`
  );
}

// ============================================================================
// FULL STATUS RUN
// ============================================================================

/**
 * Run the status command across all files in both repos.
 *
 * @param options - Status command options
 * @returns StatusResult with per-file entries and summary
 */
export async function runStatus(options: StatusOptions): Promise<StatusResult> {
  const { source, target, docsFolder, language, exclude, file } = options;

  // Detect if .translate/state/ exists — enables exact staleness checks
  const stateAware = fs.existsSync(path.join(target, '.translate', 'state'));

  let allFiles: string[];
  let unlisted: ReadonlyMap<string, string | undefined> = new Map();

  if (file) {
    // Single-file mode — skip discovery
    allFiles = [file];
  } else {
    // Both lecture sets, paired by path, and the edition's un-listed lectures
    // (#449). Without a ToC on either side this throws, naming it.
    const lectures = await readBulkLectures(source, target, docsFolder);
    const listed = resolveFilePairs(lectures.source.lectures, lectures.target.lectures);
    unlisted = findUnlistedLectures(target, lectures.target, new Set(listed));

    // Apply exclusions
    allFiles = applyExcludes(resolveFilePairs(listed, [...unlisted.keys()]), exclude);
  }

  // Check each file
  const entries: FileStatusEntry[] = [];
  for (const f of allFiles) {
    const entry = unlisted.has(f)
      ? unlistedEntry(f, unlisted.get(f))
      : await checkFileStatus(f, source, target, docsFolder, stateAware);
    entries.push(entry);
  }

  // Reject incompatible flag combination
  if (options.writeState && options.checkSync) {
    throw new Error(
      '--write-state and --check-sync cannot be used together.\n' +
        "Run --check-sync first, then --write-state once you're satisfied."
    );
  }

  // --write-state: bootstrap .translate/ metadata
  let writeState: WriteStateResult | undefined;
  if (options.writeState) {
    // Safety check: warn if SOURCE files are newer than TARGET files
    if (!options.force) {
      const staleFiles: { file: string; sourceDate: string; targetDate: string }[] = [];
      for (const entry of entries) {
        if (
          entry.sourceLastModified &&
          entry.targetLastModified &&
          entry.sourceLastModified > entry.targetLastModified
        ) {
          staleFiles.push({
            file: entry.file,
            sourceDate: entry.sourceLastModified,
            targetDate: entry.targetLastModified,
          });
        }
      }
      if (staleFiles.length > 0) {
        const lines = staleFiles.map(
          (f) => `  ${f.file}  (source: ${f.sourceDate}, target: ${f.targetDate})`
        );
        throw new Error(
          `--write-state blocked: ${staleFiles.length} file(s) have SOURCE commits newer than TARGET.\n` +
            `This means the current SOURCE content may not match what was translated.\n` +
            `Recording current HEAD as baseline would mask this divergence.\n\n` +
            lines.join('\n') +
            '\n\n' +
            `Options:\n` +
            `  1. Run 'translate forward' first to bring TARGET up to date\n` +
            `  2. Use --force to write state anyway (if you're sure translations are current)`
        );
      }

      // A lecture whose state file records a sync point is also held to it
      // (#380). Like the date guard, this refuses before anything is written;
      // --carried, the operator's word that the changes are in the
      // translation, skips this guard and no other.
      if (!options.carried) {
        const uncarried = await findUncarriedChanges(entries, source, target, docsFolder);
        if (uncarried.length > 0) {
          throw uncarriedChangesError(uncarried);
        }
      }
    }

    // An un-listed lecture keeps the state file it has: sync no longer
    // updates it, so recording a new sync point would claim one never made.
    const SKIP_REASONS = {
      SOURCE_ONLY: 'source only',
      TARGET_ONLY: 'target only',
      NOT_FOUND: 'not found',
      UNLISTED: 'not in the lecture set',
    } as const;
    writeState = { configWritten: false, written: [], skipped: [], failed: [] };

    // The config is written only once some file can get a state file, so a
    // run that can write none leaves the edition as it was (#401).
    if (entries.some((entry) => !(entry.status in SKIP_REASONS))) {
      const srcLang = options.sourceLanguage ?? 'en';
      writeConfig(target, {
        'source-language': srcLang,
        'target-language': language,
        'docs-folder': docsFolder,
      });
      writeState.configWritten = true;
    }

    const parser = new MystParser();
    const corruptStateFiles: string[] = [];
    for (const entry of entries) {
      // Only bootstrap state for files that exist in both repos
      if (entry.status in SKIP_REASONS) {
        writeState.skipped.push({
          file: entry.file,
          reason: SKIP_REASONS[entry.status as keyof typeof SKIP_REASONS],
        });
        continue;
      }

      try {
        const docsRelPath = docsFolder ? path.join(docsFolder, entry.file) : entry.file;

        // Best-effort source-sha: use the current HEAD commit for the source file
        // and use the target's last-modified date for synced-at
        const sourceGit = await getFileGitMetadata(source, docsRelPath);
        const targetGit = await getFileGitMetadata(target, docsRelPath);

        const sourceFilePath = path.join(source, docsFolder, entry.file);
        const sourceContent = fs.readFileSync(sourceFilePath, 'utf-8');
        const parsed = await parser.parseSections(sourceContent, sourceFilePath);

        // Preserve model from existing state if it was set by a prior command (e.g. forward)
        const stateRead = inspectFileState(target, entry.file);
        const existingState = stateRead.status === 'valid' ? stateRead.state : undefined;

        // A state file that exists but failed to read is corrupt, not absent.
        // Overwriting it with current source HEAD and mode RESYNC would erase
        // the real sync point (#165/F85) — refuse unless --force. Collected
        // and thrown after the loop: this try's catch treats errors as
        // skip-this-file, which is exactly the silent overwrite path. The
        // reason names the key to repair (#381).
        if (stateRead.status === 'invalid' && !options.force) {
          corruptStateFiles.push(`${entry.file}: ${stateRead.reason}`);
          continue;
        }
        const model =
          existingState?.model && existingState.model !== 'unknown'
            ? existingState.model
            : 'unknown';

        const overwritten = writeFileState(target, entry.file, {
          'source-sha': sourceGit?.lastCommit ?? 'unknown',
          'synced-at':
            targetGit?.lastModified?.toISOString().split('T')[0] ??
            new Date().toISOString().split('T')[0],
          model,
          mode: 'RESYNC',
          'section-count': parsed.sections.length,
        });
        writeState.written.push(entry.file);
        if (overwritten) {
          (writeState.overwritten ??= []).push({ file: entry.file, warning: overwritten });
        }
      } catch (error) {
        // Recorded, not thrown: the other files still get theirs, and the
        // CLI fails the run once the table is printed (#401).
        writeState.failed.push({
          file: entry.file,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (corruptStateFiles.length > 0) {
      throw new Error(
        `--write-state blocked: ${corruptStateFiles.length} state file(s) exist but are unreadable:\n` +
          corruptStateFiles.map((f) => `  ${f}`).join('\n') +
          '\n\nRepair or delete them, or use --force to overwrite them with current HEAD.'
      );
    }
  }

  // --check-sync: LLM-based content sync check
  if (options.checkSync && options.apiKey) {
    const srcLang = options.sourceLanguage ?? 'en';
    for (const entry of entries) {
      // Only triage files that exist in both repos, in the lecture set
      if (NOT_COMPARED.has(entry.status)) continue;

      try {
        const sourceFilePath = path.join(source, docsFolder, entry.file);
        const targetFilePath = path.join(target, docsFolder, entry.file);
        const sourceContent = fs.readFileSync(sourceFilePath, 'utf-8');
        const targetContent = fs.readFileSync(targetFilePath, 'utf-8');

        const triageResult = await triageForward(entry.file, sourceContent, targetContent, {
          apiKey: options.apiKey,
          model: options.model ?? DEFAULT_CLAUDE_MODEL,
          sourceLanguage: languageLabel(srcLang),
          targetLanguage: languageLabel(options.language),
          testMode: options.testMode ?? false,
        });

        entry.contentSync = triageResult.verdict;
        entry.contentSyncReason = triageResult.reason;
      } catch {
        entry.contentSync = 'ERROR';
        entry.contentSyncReason = 'Triage failed';
      }
    }
  }

  // Build summary (count by primary status)
  const summary = {
    total: entries.length,
    aligned: entries.filter((e) => e.status === 'ALIGNED').length,
    outdated: entries.filter((e) => e.status === 'OUTDATED').length,
    sourceAhead: entries.filter((e) => e.status === 'SOURCE_AHEAD').length,
    targetAhead: entries.filter((e) => e.status === 'TARGET_AHEAD').length,
    missingHeadingMap: entries.filter((e) => e.status === 'MISSING_HEADINGMAP').length,
    sourceOnly: entries.filter((e) => e.status === 'SOURCE_ONLY').length,
    targetOnly: entries.filter((e) => e.status === 'TARGET_ONLY').length,
    unlisted: entries.filter((e) => e.status === 'UNLISTED').length,
    notFound: entries.filter((e) => e.status === 'NOT_FOUND').length,
  };

  return {
    sourceRepo: source,
    targetRepo: target,
    language,
    entries,
    summary,
    ...(writeState ? { writeState } : {}),
  };
}

// ============================================================================
// CONSOLE OUTPUT
// ============================================================================

/** Status → display icon mapping */
const STATUS_ICONS: Record<FileSyncStatus, string> = {
  ALIGNED: '✅',
  OUTDATED: '⏳',
  SOURCE_AHEAD: '⚠️',
  TARGET_AHEAD: '⚠️',
  MISSING_HEADINGMAP: '📋',
  SOURCE_ONLY: '➕',
  TARGET_ONLY: '🔸',
  UNLISTED: '📦',
  NOT_FOUND: '❌',
};

/**
 * What `--write-state` did, for the console (#401): the banner only when a
 * state file was written, then each file left without one, and why.
 */
export function formatWriteStateSummary(result: WriteStateResult, target: string): string {
  const lines = [''];
  if (result.written.length > 0) {
    lines.push(
      `📁 .translate/ metadata written to ${target}: ${result.written.length} state file(s)` +
        (result.configWritten ? ' and the config' : '')
    );
  } else {
    lines.push(
      '❌ --write-state wrote no state file' +
        (result.configWritten
          ? ', only .translate/config.yml'
          : ', and left .translate/config.yml as it was')
    );
  }
  for (const skip of result.skipped) {
    // An un-listed lecture has a state file; it is the one left as it is.
    const what =
      skip.reason === 'not in the lecture set' ? 'state file left as it is' : 'no state file';
    lines.push(`  ⊘ ${skip.file}: ${what} (${skip.reason})`);
  }
  for (const failure of result.failed) {
    lines.push(`  ✗ ${failure.file}: state file not written: ${failure.error}`);
  }
  for (const overwrite of result.overwritten ?? []) {
    lines.push(`  ⚠ ${overwrite.file}: ${overwrite.warning}`);
  }
  return lines.join('\n');
}

/**
 * Format a StatusResult as a console-friendly table string.
 */
export function formatStatusTable(result: StatusResult): string {
  const lines: string[] = [];

  lines.push(
    `Sync Status: ${path.basename(result.sourceRepo)} ↔ ${path.basename(result.targetRepo)} (${result.language})`
  );
  lines.push('');

  // Per-file table
  const maxFileLen = Math.max(
    4, // "File" header
    ...result.entries.map((e) => e.file.length)
  );

  const header = `  ${'File'.padEnd(maxFileLen)}  Status`;
  const separator = `  ${'─'.repeat(maxFileLen)}  ${'─'.repeat(20)}`;

  lines.push(header);
  lines.push(separator);

  for (const entry of result.entries) {
    const icon = STATUS_ICONS[entry.status];
    // Show compound flags if there are additional conditions beyond the primary
    const extraFlags = entry.flags.filter((f) => f !== entry.status);
    let statusText = `${icon} ${entry.status}`;
    if (extraFlags.length > 0) {
      statusText += ` + ${extraFlags.map((f) => STATUS_ICONS[f] + ' ' + f).join(' + ')}`;
    }
    if (entry.contentSync) {
      const syncIcon =
        entry.contentSync === 'IDENTICAL'
          ? '🟢'
          : entry.contentSync === 'I18N_ONLY'
            ? '🔵'
            : entry.contentSync === 'TARGET_HAS_ADDITIONS'
              ? '🟡'
              : entry.contentSync === 'CONTENT_CHANGES'
                ? '🔴'
                : '⚪';
      statusText += `  ${syncIcon} ${entry.contentSync}`;
    }
    lines.push(`  ${entry.file.padEnd(maxFileLen)}  ${statusText}`);
    if (entry.details) {
      lines.push(`  ${''.padEnd(maxFileLen)}  ↳ ${entry.details}`);
    }
    if (entry.contentSyncReason) {
      lines.push(`  ${''.padEnd(maxFileLen)}  ↳ ${entry.contentSyncReason}`);
    }
  }

  lines.push('');

  // Summary
  const s = result.summary;
  lines.push('Summary:');
  lines.push(`  ${s.total} files total`);
  if (s.aligned > 0) lines.push(`  ${STATUS_ICONS.ALIGNED} ${s.aligned} aligned`);
  if (s.outdated > 0)
    lines.push(`  ${STATUS_ICONS.OUTDATED} ${s.outdated} outdated (SOURCE newer)`);
  if (s.sourceAhead > 0)
    lines.push(
      `  ${STATUS_ICONS.SOURCE_AHEAD} ${s.sourceAhead} source ahead (sections added upstream)`
    );
  if (s.targetAhead > 0)
    lines.push(
      `  ${STATUS_ICONS.TARGET_AHEAD} ${s.targetAhead} target ahead (extra sections in translation)`
    );
  if (s.missingHeadingMap > 0)
    lines.push(`  ${STATUS_ICONS.MISSING_HEADINGMAP} ${s.missingHeadingMap} missing heading-map`);
  if (s.sourceOnly > 0)
    lines.push(`  ${STATUS_ICONS.SOURCE_ONLY} ${s.sourceOnly} source only (not yet translated)`);
  if (s.targetOnly > 0)
    lines.push(`  ${STATUS_ICONS.TARGET_ONLY} ${s.targetOnly} target only (not in source)`);
  if (s.unlisted > 0)
    lines.push(
      `  ${STATUS_ICONS.UNLISTED} ${s.unlisted} unlisted (out of the ToC, kept with a state file; not synced)`
    );
  if (s.notFound > 0)
    lines.push(`  ${STATUS_ICONS.NOT_FOUND} ${s.notFound} not found (missing from both repos)`);

  return lines.join('\n');
}

/**
 * Format a StatusResult as JSON for --json flag (printed to stdout).
 */
export function formatStatusJson(result: StatusResult): string {
  return JSON.stringify(result, null, 2);
}

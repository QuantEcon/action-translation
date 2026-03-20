/**
 * Status Command
 * 
 * Fast, free diagnostic — no LLM calls.
 * Compares SOURCE and TARGET repos to produce a per-file sync status.
 * 
 * Output goes to the CLI console (like `git status`), not report files.
 * 
 * Primary status (most significant issue):
 * - ALIGNED:            Structure matches, heading-map present, no newer SOURCE commits
 * - OUTDATED:           Structure/heading-map OK, but SOURCE has newer commits than TARGET
 * - SOURCE_AHEAD:       SOURCE has more sections than TARGET (sections added upstream)
 * - TARGET_AHEAD:       TARGET has more sections than SOURCE (unexpected divergence)
 * - MISSING_HEADINGMAP: No heading-map in TARGET file
 * - SOURCE_ONLY:        File exists in SOURCE but not TARGET
 * - TARGET_ONLY:        File exists in TARGET but not SOURCE
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
import { getFileGitMetadata } from '../git-metadata.js';
import { readFileState, writeFileState, writeConfig } from '../translate-state.js';
import { triageForward } from '../forward-triage.js';
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
  | 'NOT_FOUND';

export interface FileStatusEntry {
  file: string;
  status: FileSyncStatus;       // Primary (most significant) status
  flags: FileSyncStatus[];      // All conditions that apply (compound)
  details?: string;             // Human-readable detail (e.g., "7 source vs 6 target sections")
  sourceSections?: number;
  targetSections?: number;
  sourceLastModified?: string;  // ISO date
  targetLastModified?: string;  // ISO date
  contentSync?: string;         // Forward triage verdict (only with --check-sync)
  contentSyncReason?: string;   // Reason from triage (only with --check-sync)
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
    notFound: number;
  };
}

export interface StatusOptions {
  source: string;
  target: string;
  docsFolder: string;
  language: string;
  exclude: string[];    // Glob patterns to exclude
  file?: string;        // Single file to check (relative to docs-folder)
  writeState?: boolean; // Bootstrap .translate/ metadata from current state
  sourceLanguage?: string; // Required when writeState is true
  force?: boolean;      // Skip sync-date safety check for --write-state
  checkSync?: boolean;  // LLM-based content sync check (requires ANTHROPIC_API_KEY)
  apiKey?: string;      // Anthropic API key (required for --check-sync)
  model?: string;       // Claude model (default: claude-sonnet-4-6)
  testMode?: boolean;   // Use mock triage responses (for --check-sync)
}

// ============================================================================
// FILE DISCOVERY
// ============================================================================

/**
 * Find all .md files in a docs folder (non-recursive, flat list).
 * Use --exclude patterns to filter out non-lecture files.
 */
export function discoverMarkdownFiles(repoPath: string, docsFolder: string): string[] {
  const fullPath = path.join(repoPath, docsFolder);
  if (!fs.existsSync(fullPath)) {
    return [];
  }

  return fs.readdirSync(fullPath)
    .filter(f => f.endsWith('.md'))
    .sort();
}

/**
 * Resolve the set of all files across SOURCE and TARGET, paired by filename.
 * Returns a deduplicated sorted list of filenames.
 */
export function resolveFilePairs(
  sourceFiles: string[],
  targetFiles: string[],
): string[] {
  const all = new Set([...sourceFiles, ...targetFiles]);
  return Array.from(all).sort();
}

/**
 * Apply exclude patterns to a list of filenames.
 * Supports simple glob: exact match or leading * wildcard (e.g., "README.md", "*.yml").
 */
export function applyExcludes(files: string[], excludes: string[]): string[] {
  if (excludes.length === 0) return files;

  return files.filter(file => {
    for (const pattern of excludes) {
      if (pattern.startsWith('*')) {
        // Suffix match: *.yml matches foo.yml
        const suffix = pattern.slice(1);
        if (file.endsWith(suffix)) return false;
      } else if (file === pattern) {
        return false;
      }
    }
    return true;
  });
}

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
  stateAware: boolean = false,
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
    return { file, status: 'NOT_FOUND', flags: ['NOT_FOUND'], details: 'File not found in either repo' };
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

  // Check heading-map
  const headingMap = extractHeadingMap(targetContent);
  if (headingMap.size === 0) {
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
      // Exact comparison: has the source file changed since last sync?
      const isStale = sourceMetadata.lastCommit !== fileState['source-sha'];
      if (isStale && !flags.includes('OUTDATED')) {
        flags.push('OUTDATED');
        details.push(`source-sha changed since last sync`);
      } else if (!isStale && flags.includes('OUTDATED')) {
        // Git dates said OUTDATED but source-sha matches — not actually stale
        const idx = flags.indexOf('OUTDATED');
        flags.splice(idx, 1);
        // Remove the date-based detail
        const detailIdx = details.findIndex(d => d.includes('SOURCE modified'));
        if (detailIdx >= 0) details.splice(detailIdx, 1);
      }
    }
  }

  // Pick primary status (highest priority flag, or ALIGNED if no flags)
  const PRIORITY: FileSyncStatus[] = ['SOURCE_AHEAD', 'TARGET_AHEAD', 'MISSING_HEADINGMAP', 'OUTDATED'];
  const primary = PRIORITY.find(s => flags.includes(s)) ?? 'ALIGNED';
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

  if (file) {
    // Single-file mode — skip discovery
    allFiles = [file];
  } else {
    // Discover files
    const sourceFiles = discoverMarkdownFiles(source, docsFolder);
    const targetFiles = discoverMarkdownFiles(target, docsFolder);
    allFiles = resolveFilePairs(sourceFiles, targetFiles);

    // Apply exclusions
    allFiles = applyExcludes(allFiles, exclude);
  }

  // Check each file
  const entries: FileStatusEntry[] = [];
  for (const f of allFiles) {
    const entry = await checkFileStatus(f, source, target, docsFolder, stateAware);
    entries.push(entry);
  }

  // --write-state: bootstrap .translate/ metadata
  if (options.writeState) {
    // Safety check: warn if SOURCE files are newer than TARGET files
    if (!options.force) {
      const staleFiles: { file: string; sourceDate: string; targetDate: string }[] = [];
      for (const entry of entries) {
        if (entry.sourceLastModified && entry.targetLastModified && entry.sourceLastModified > entry.targetLastModified) {
          staleFiles.push({
            file: entry.file,
            sourceDate: entry.sourceLastModified,
            targetDate: entry.targetLastModified,
          });
        }
      }
      if (staleFiles.length > 0) {
        const lines = staleFiles.map(
          f => `  ${f.file}  (source: ${f.sourceDate}, target: ${f.targetDate})`,
        );
        throw new Error(
          `--write-state blocked: ${staleFiles.length} file(s) have SOURCE commits newer than TARGET.\n` +
          `This means the current SOURCE content may not match what was translated.\n` +
          `Recording current HEAD as baseline would mask this divergence.\n\n` +
          lines.join('\n') + '\n\n' +
          `Options:\n` +
          `  1. Run 'translate forward' first to bring TARGET up to date\n` +
          `  2. Use --force to write state anyway (if you're sure translations are current)`,
        );
      }
    }

    const srcLang = options.sourceLanguage ?? 'en';
    writeConfig(target, {
      'source-language': srcLang,
      'target-language': language,
      'docs-folder': docsFolder,
    });

    const parser = new MystParser();
    for (const entry of entries) {
      // Only bootstrap state for files that exist in both repos
      if (entry.status === 'SOURCE_ONLY' || entry.status === 'TARGET_ONLY' || entry.status === 'NOT_FOUND') {
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

        writeFileState(target, entry.file, {
          'source-sha': sourceGit?.lastCommit ?? 'unknown',
          'synced-at': targetGit?.lastModified?.toISOString().split('T')[0] ?? new Date().toISOString().split('T')[0],
          model: 'unknown',
          mode: 'RESYNC',
          'section-count': parsed.sections.length,
        });
      } catch {
        // Non-fatal: skip files where state can't be determined
      }
    }
  }

  // --check-sync: LLM-based content sync check
  if (options.checkSync && options.apiKey) {
    const srcLang = options.sourceLanguage ?? 'en';
    for (const entry of entries) {
      // Only triage files that exist in both repos
      if (entry.status === 'SOURCE_ONLY' || entry.status === 'TARGET_ONLY' || entry.status === 'NOT_FOUND') {
        continue;
      }

      try {
        const sourceFilePath = path.join(source, docsFolder, entry.file);
        const targetFilePath = path.join(target, docsFolder, entry.file);
        const sourceContent = fs.readFileSync(sourceFilePath, 'utf-8');
        const targetContent = fs.readFileSync(targetFilePath, 'utf-8');

        const triageResult = await triageForward(
          entry.file,
          sourceContent,
          targetContent,
          {
            apiKey: options.apiKey,
            model: options.model ?? 'claude-sonnet-4-6',
            sourceLanguage: languageLabel(srcLang),
            targetLanguage: languageLabel(options.language),
            testMode: options.testMode ?? false,
          },
        );

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
    aligned: entries.filter(e => e.status === 'ALIGNED').length,
    outdated: entries.filter(e => e.status === 'OUTDATED').length,
    sourceAhead: entries.filter(e => e.status === 'SOURCE_AHEAD').length,
    targetAhead: entries.filter(e => e.status === 'TARGET_AHEAD').length,
    missingHeadingMap: entries.filter(e => e.status === 'MISSING_HEADINGMAP').length,
    sourceOnly: entries.filter(e => e.status === 'SOURCE_ONLY').length,
    targetOnly: entries.filter(e => e.status === 'TARGET_ONLY').length,
    notFound: entries.filter(e => e.status === 'NOT_FOUND').length,
  };

  return {
    sourceRepo: source,
    targetRepo: target,
    language,
    entries,
    summary,
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
  NOT_FOUND: '❌',
};

/**
 * Format a StatusResult as a console-friendly table string.
 */
export function formatStatusTable(result: StatusResult): string {
  const lines: string[] = [];

  lines.push(`Sync Status: ${path.basename(result.sourceRepo)} ↔ ${path.basename(result.targetRepo)} (${result.language})`);
  lines.push('');

  // Per-file table
  const maxFileLen = Math.max(
    4, // "File" header
    ...result.entries.map(e => e.file.length),
  );

  const header = `  ${'File'.padEnd(maxFileLen)}  Status`;
  const separator = `  ${'─'.repeat(maxFileLen)}  ${'─'.repeat(20)}`;

  lines.push(header);
  lines.push(separator);

  for (const entry of result.entries) {
    const icon = STATUS_ICONS[entry.status];
    // Show compound flags if there are additional conditions beyond the primary
    const extraFlags = entry.flags.filter(f => f !== entry.status);
    let statusText = `${icon} ${entry.status}`;
    if (extraFlags.length > 0) {
      statusText += ` + ${extraFlags.map(f => STATUS_ICONS[f] + ' ' + f).join(' + ')}`;
    }
    if (entry.contentSync) {
      const syncIcon = entry.contentSync === 'IDENTICAL' ? '🟢'
        : entry.contentSync === 'I18N_ONLY' ? '🔵'
        : entry.contentSync === 'TARGET_HAS_ADDITIONS' ? '🟡'
        : entry.contentSync === 'CONTENT_CHANGES' ? '🔴'
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
  if (s.aligned > 0)           lines.push(`  ${STATUS_ICONS.ALIGNED} ${s.aligned} aligned`);
  if (s.outdated > 0)          lines.push(`  ${STATUS_ICONS.OUTDATED} ${s.outdated} outdated (SOURCE newer)`);
  if (s.sourceAhead > 0)       lines.push(`  ${STATUS_ICONS.SOURCE_AHEAD} ${s.sourceAhead} source ahead (sections added upstream)`);
  if (s.targetAhead > 0)       lines.push(`  ${STATUS_ICONS.TARGET_AHEAD} ${s.targetAhead} target ahead (extra sections in translation)`);
  if (s.missingHeadingMap > 0) lines.push(`  ${STATUS_ICONS.MISSING_HEADINGMAP} ${s.missingHeadingMap} missing heading-map`);
  if (s.sourceOnly > 0)        lines.push(`  ${STATUS_ICONS.SOURCE_ONLY} ${s.sourceOnly} source only (not yet translated)`);
  if (s.targetOnly > 0)        lines.push(`  ${STATUS_ICONS.TARGET_ONLY} ${s.targetOnly} target only (not in source)`);
  if (s.notFound > 0)           lines.push(`  ${STATUS_ICONS.NOT_FOUND} ${s.notFound} not found (missing from both repos)`);

  return lines.join('\n');
}

/**
 * Format a StatusResult as JSON for --json flag (printed to stdout).
 */
export function formatStatusJson(result: StatusResult): string {
  return JSON.stringify(result, null, 2);
}

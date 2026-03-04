/**
 * Status Command
 * 
 * Fast, free diagnostic — no LLM calls.
 * Compares SOURCE and TARGET repos to produce a per-file sync status.
 * 
 * Output goes to the CLI console (like `git status`), not report files.
 * 
 * Statuses:
 * - ALIGNED:            Structure matches, heading-map present, no newer SOURCE commits
 * - OUTDATED:           Structure/heading-map OK, but SOURCE has newer commits than TARGET
 * - DRIFT:              Structural differences detected (section count mismatch)
 * - MISSING_HEADINGMAP: No heading-map in TARGET file
 * - SOURCE_ONLY:        File exists in SOURCE but not TARGET
 * - TARGET_ONLY:        File exists in TARGET but not SOURCE
 */

import * as fs from 'fs';
import * as path from 'path';
import { MystParser } from '../../parser';
import { extractHeadingMap } from '../../heading-map';
import { getFileGitMetadata } from '../git-metadata';

// ============================================================================
// TYPES
// ============================================================================

export type FileSyncStatus =
  | 'ALIGNED'
  | 'OUTDATED'
  | 'DRIFT'
  | 'MISSING_HEADINGMAP'
  | 'SOURCE_ONLY'
  | 'TARGET_ONLY';

export interface FileStatusEntry {
  file: string;
  status: FileSyncStatus;
  details?: string;           // Human-readable detail (e.g., "3 vs 5 sections")
  sourceSections?: number;
  targetSections?: number;
  sourceLastModified?: string; // ISO date
  targetLastModified?: string; // ISO date
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
    drift: number;
    missingHeadingMap: number;
    sourceOnly: number;
    targetOnly: number;
  };
}

export interface StatusOptions {
  source: string;
  target: string;
  docsFolder: string;
  language: string;
  exclude: string[];    // Glob patterns to exclude
  file?: string;        // Single file to check (relative to docs-folder)
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
 * Checks (in order):
 * 1. Does the file exist in both repos?
 * 2. Does the TARGET have a heading-map?
 * 3. Do section counts match?
 * 4. Is SOURCE newer than TARGET? (git dates)
 */
export async function checkFileStatus(
  file: string,
  sourceRepoPath: string,
  targetRepoPath: string,
  docsFolder: string,
): Promise<FileStatusEntry> {
  const sourceFilePath = path.join(sourceRepoPath, docsFolder, file);
  const targetFilePath = path.join(targetRepoPath, docsFolder, file);

  const sourceExists = fs.existsSync(sourceFilePath);
  const targetExists = fs.existsSync(targetFilePath);

  // Existence checks
  if (!sourceExists && targetExists) {
    return { file, status: 'TARGET_ONLY' };
  }
  if (sourceExists && !targetExists) {
    return { file, status: 'SOURCE_ONLY' };
  }
  if (!sourceExists && !targetExists) {
    // Shouldn't happen (we discovered from at least one repo), but handle gracefully
    return { file, status: 'SOURCE_ONLY', details: 'File not found in either repo' };
  }

  // Both exist — read content
  const sourceContent = fs.readFileSync(sourceFilePath, 'utf-8');
  const targetContent = fs.readFileSync(targetFilePath, 'utf-8');

  // Check heading-map
  const headingMap = extractHeadingMap(targetContent);
  const hasHeadingMap = headingMap.size > 0;

  // Parse sections
  const parser = new MystParser();
  const sourceParsed = await parser.parseSections(sourceContent, sourceFilePath);
  const targetParsed = await parser.parseSections(targetContent, targetFilePath);

  const sourceSectionCount = sourceParsed.sections.length;
  const targetSectionCount = targetParsed.sections.length;

  // Check for structural drift (section count mismatch)
  if (sourceSectionCount !== targetSectionCount) {
    return {
      file,
      status: 'DRIFT',
      details: `Section count: ${sourceSectionCount} (source) vs ${targetSectionCount} (target)`,
      sourceSections: sourceSectionCount,
      targetSections: targetSectionCount,
    };
  }

  // Check heading-map presence
  if (!hasHeadingMap) {
    return {
      file,
      status: 'MISSING_HEADINGMAP',
      sourceSections: sourceSectionCount,
      targetSections: targetSectionCount,
    };
  }

  // Check git dates — is SOURCE newer?
  const docsRelPath = docsFolder ? path.join(docsFolder, file) : file;
  const sourceMetadata = await getFileGitMetadata(sourceRepoPath, docsRelPath);
  const targetMetadata = await getFileGitMetadata(targetRepoPath, docsRelPath);

  const sourceDate = sourceMetadata?.lastModified;
  const targetDate = targetMetadata?.lastModified;

  const entry: FileStatusEntry = {
    file,
    status: 'ALIGNED',
    sourceSections: sourceSectionCount,
    targetSections: targetSectionCount,
  };

  if (sourceDate) {
    entry.sourceLastModified = sourceDate.toISOString().split('T')[0];
  }
  if (targetDate) {
    entry.targetLastModified = targetDate.toISOString().split('T')[0];
  }

  if (sourceDate && targetDate && sourceDate > targetDate) {
    entry.status = 'OUTDATED';
    entry.details = `SOURCE modified ${entry.sourceLastModified}, TARGET modified ${entry.targetLastModified}`;
  }

  return entry;
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
  for (const file of allFiles) {
    const entry = await checkFileStatus(file, source, target, docsFolder);
    entries.push(entry);
  }

  // Build summary
  const summary = {
    total: entries.length,
    aligned: entries.filter(e => e.status === 'ALIGNED').length,
    outdated: entries.filter(e => e.status === 'OUTDATED').length,
    drift: entries.filter(e => e.status === 'DRIFT').length,
    missingHeadingMap: entries.filter(e => e.status === 'MISSING_HEADINGMAP').length,
    sourceOnly: entries.filter(e => e.status === 'SOURCE_ONLY').length,
    targetOnly: entries.filter(e => e.status === 'TARGET_ONLY').length,
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
  DRIFT: '⚠️',
  MISSING_HEADINGMAP: '📋',
  SOURCE_ONLY: '➕',
  TARGET_ONLY: '🔸',
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
    let line = `  ${entry.file.padEnd(maxFileLen)}  ${icon} ${entry.status}`;
    if (entry.details) {
      line += `  (${entry.details})`;
    }
    lines.push(line);
  }

  lines.push('');

  // Summary
  const s = result.summary;
  lines.push('Summary:');
  lines.push(`  ${s.total} files total`);
  if (s.aligned > 0)           lines.push(`  ${STATUS_ICONS.ALIGNED} ${s.aligned} aligned`);
  if (s.outdated > 0)          lines.push(`  ${STATUS_ICONS.OUTDATED} ${s.outdated} outdated (SOURCE newer)`);
  if (s.drift > 0)             lines.push(`  ${STATUS_ICONS.DRIFT} ${s.drift} structural drift`);
  if (s.missingHeadingMap > 0) lines.push(`  ${STATUS_ICONS.MISSING_HEADINGMAP} ${s.missingHeadingMap} missing heading-map`);
  if (s.sourceOnly > 0)        lines.push(`  ${STATUS_ICONS.SOURCE_ONLY} ${s.sourceOnly} source only (not yet translated)`);
  if (s.targetOnly > 0)        lines.push(`  ${STATUS_ICONS.TARGET_ONLY} ${s.targetOnly} target only (not in source)`);

  return lines.join('\n');
}

/**
 * Format a StatusResult as JSON for --json flag (printed to stdout).
 */
export function formatStatusJson(result: StatusResult): string {
  return JSON.stringify(result, null, 2);
}

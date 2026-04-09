/**
 * Headingmap Command
 * 
 * Generate heading-maps for target files by comparing source and target
 * section headings by position. No LLM calls — free and local-only.
 * 
 * Use cases:
 * - Connect existing target repos that lack heading-maps
 * - Fix missing heading-maps after manual edits
 * - Regenerate heading-maps after structural changes
 */

import * as fs from 'fs';
import * as path from 'path';
import { MystParser } from '../../parser.js';
import { Section } from '../../types.js';
import {
  HeadingMap,
  extractHeadingMap,
  extractTranslationTitle,
  injectHeadingMap,
  buildHeadingMap,
} from '../../heading-map.js';
export { buildHeadingMap } from '../../heading-map.js';
import { discoverMarkdownFiles, resolveFilePairs, applyExcludes } from './status.js';
import { readFileState, writeFileState } from '../translate-state.js';

// ============================================================================
// TYPES
// ============================================================================

export interface HeadingmapOptions {
  source: string;
  target: string;
  docsFolder: string;
  file?: string;        // Single file mode
  exclude: string[];
  dryRun: boolean;
}

export interface HeadingmapFileResult {
  file: string;
  status: 'generated' | 'updated' | 'unchanged' | 'mismatch' | 'skipped';
  matchedSections: number;
  totalSourceSections: number;
  totalTargetSections: number;
  warnings: string[];
  /** The generated heading-map (present when status is generated/updated/mismatch) */
  generatedMap?: HeadingMap;
  /** Translated title text (present when status is generated/updated/mismatch) */
  generatedTitle?: string;
}

export interface HeadingmapResult {
  results: HeadingmapFileResult[];
  summary: {
    total: number;
    generated: number;
    updated: number;
    unchanged: number;
    mismatch: number;
    skipped: number;
  };
}

// ============================================================================
// HEADING-MAP GENERATION
// ============================================================================

/**
 * Generate or update heading-map for a single file pair.
 */
export async function generateHeadingmapForFile(
  file: string,
  sourceRepoPath: string,
  targetRepoPath: string,
  docsFolder: string,
): Promise<HeadingmapFileResult> {
  const sourceFilePath = path.join(sourceRepoPath, docsFolder, file);
  const targetFilePath = path.join(targetRepoPath, docsFolder, file);

  // Check existence
  if (!fs.existsSync(sourceFilePath)) {
    return {
      file,
      status: 'skipped',
      matchedSections: 0,
      totalSourceSections: 0,
      totalTargetSections: 0,
      warnings: ['Source file not found'],
    };
  }
  if (!fs.existsSync(targetFilePath)) {
    return {
      file,
      status: 'skipped',
      matchedSections: 0,
      totalSourceSections: 0,
      totalTargetSections: 0,
      warnings: ['Target file not found'],
    };
  }

  const sourceContent = fs.readFileSync(sourceFilePath, 'utf-8');
  const targetContent = fs.readFileSync(targetFilePath, 'utf-8');

  // Parse sections and extract title
  const parser = new MystParser();
  const sourceParsed = await parser.parseSections(sourceContent, sourceFilePath);
  const targetParsed = await parser.parseSections(targetContent, targetFilePath);
  
  // Extract titles using parseDocumentComponents
  let targetTitle: string | undefined;
  try {
    const targetComponents = await parser.parseDocumentComponents(targetContent, targetFilePath);
    targetTitle = targetComponents.titleText;
  } catch {
    // Document without # title — title will be undefined
  }

  const totalSource = sourceParsed.sections.length;
  const totalTarget = targetParsed.sections.length;

  // Build heading-map
  const { map, warnings } = buildHeadingMap(sourceParsed.sections, targetParsed.sections);

  // Check if section counts mismatch at top level
  const hasMismatch = totalSource !== totalTarget;
  if (hasMismatch) {
    warnings.unshift(`Section count mismatch: ${totalSource} source vs ${totalTarget} target`);
  }

  // Compare with existing heading-map and title
  const existingMap = extractHeadingMap(targetContent);
  const existingTitle = extractTranslationTitle(targetContent);
  const mapsAreEqual = areMapsEqual(existingMap, map) && existingTitle === targetTitle;

  if (mapsAreEqual) {
    return {
      file,
      status: 'unchanged',
      matchedSections: Math.min(totalSource, totalTarget),
      totalSourceSections: totalSource,
      totalTargetSections: totalTarget,
      warnings,
    };
  }

  // Determine status
  const status: HeadingmapFileResult['status'] = hasMismatch
    ? 'mismatch'
    : existingMap.size === 0
      ? 'generated'
      : 'updated';

  return {
    file,
    status,
    matchedSections: Math.min(totalSource, totalTarget),
    totalSourceSections: totalSource,
    totalTargetSections: totalTarget,
    warnings,
    generatedMap: map,
    generatedTitle: targetTitle,
  };
}

/**
 * Compare two heading maps for equality
 */
function areMapsEqual(a: HeadingMap, b: HeadingMap): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    if (b.get(key) !== value) return false;
  }
  return true;
}

// ============================================================================
// FULL HEADINGMAP RUN
// ============================================================================

/**
 * Run heading-map generation across all files or a single file.
 */
export async function runHeadingmap(options: HeadingmapOptions): Promise<HeadingmapResult> {
  const { source, target, docsFolder, file, exclude, dryRun } = options;

  let allFiles: string[];

  if (file) {
    allFiles = [file];
  } else {
    const sourceFiles = discoverMarkdownFiles(source, docsFolder);
    const targetFiles = discoverMarkdownFiles(target, docsFolder);
    allFiles = resolveFilePairs(sourceFiles, targetFiles);
    allFiles = applyExcludes(allFiles, exclude);
  }

  const results: HeadingmapFileResult[] = [];

  for (const f of allFiles) {
    const result = await generateHeadingmapForFile(f, source, target, docsFolder);
    results.push(result);

    // Write the translation metadata to the target file (unless dry-run or skipped/unchanged)
    if (!dryRun && result.status !== 'skipped' && result.status !== 'unchanged' && (result.generatedMap || result.generatedTitle)) {
      const targetFilePath = path.join(target, docsFolder, f);
      const targetContent = fs.readFileSync(targetFilePath, 'utf-8');
      const updatedContent = injectHeadingMap(targetContent, result.generatedMap ?? new Map(), result.generatedTitle);
      fs.writeFileSync(targetFilePath, updatedContent, 'utf-8');

      // Update section-count in .translate/state/ if state exists
      const existingState = readFileState(target, f);
      if (existingState) {
        writeFileState(target, f, {
          ...existingState,
          'section-count': result.totalSourceSections,
        });
      }
    }
  }

  // Build summary
  const summary = {
    total: results.length,
    generated: results.filter(r => r.status === 'generated').length,
    updated: results.filter(r => r.status === 'updated').length,
    unchanged: results.filter(r => r.status === 'unchanged').length,
    mismatch: results.filter(r => r.status === 'mismatch').length,
    skipped: results.filter(r => r.status === 'skipped').length,
  };

  return { results, summary };
}

// ============================================================================
// CONSOLE OUTPUT
// ============================================================================

const STATUS_ICONS: Record<HeadingmapFileResult['status'], string> = {
  generated: '✅',
  updated: '🔄',
  unchanged: '⏭️',
  mismatch: '⚠️',
  skipped: '❌',
};

/**
 * Format headingmap results as a console-friendly table string.
 */
export function formatHeadingmapTable(result: HeadingmapResult, dryRun: boolean): string {
  const lines: string[] = [];

  if (dryRun) {
    lines.push('Heading-Map Generation (dry run — no files modified)');
  } else {
    lines.push('Heading-Map Generation');
  }
  lines.push('');

  const maxFileLen = Math.max(
    4,
    ...result.results.map(r => r.file.length),
  );

  const header = `  ${'File'.padEnd(maxFileLen)}  Status`;
  const separator = `  ${'─'.repeat(maxFileLen)}  ${'─'.repeat(30)}`;

  lines.push(header);
  lines.push(separator);

  for (const entry of result.results) {
    const icon = STATUS_ICONS[entry.status];
    const sectionInfo = entry.status !== 'skipped'
      ? ` (${entry.matchedSections} matched, ${entry.totalSourceSections}s/${entry.totalTargetSections}t)`
      : '';
    lines.push(`  ${entry.file.padEnd(maxFileLen)}  ${icon} ${entry.status}${sectionInfo}`);
    for (const warning of entry.warnings) {
      lines.push(`  ${''.padEnd(maxFileLen)}  ↳ ${warning}`);
    }
  }

  lines.push('');

  const s = result.summary;
  lines.push('Summary:');
  lines.push(`  ${s.total} files total`);
  if (s.generated > 0)  lines.push(`  ${STATUS_ICONS.generated} ${s.generated} generated (new heading-map)`);
  if (s.updated > 0)    lines.push(`  ${STATUS_ICONS.updated} ${s.updated} updated (heading-map changed)`);
  if (s.unchanged > 0)  lines.push(`  ${STATUS_ICONS.unchanged} ${s.unchanged} unchanged`);
  if (s.mismatch > 0)   lines.push(`  ${STATUS_ICONS.mismatch} ${s.mismatch} with section mismatch (partial map generated)`);
  if (s.skipped > 0)    lines.push(`  ${STATUS_ICONS.skipped} ${s.skipped} skipped`);

  return lines.join('\n');
}

/**
 * Format headingmap results as JSON.
 */
export function formatHeadingmapJson(result: HeadingmapResult): string {
  return JSON.stringify(result, null, 2);
}

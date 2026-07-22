/**
 * Target-local data reads: code-cell lines that load data files existing only
 * in the translation repo.
 *
 * The #107 validation wave (2026-07-22) isolated the one localisation class
 * the resync prompt's ground-truth rules do not hold for: localisation done by
 * substituting a variable's *derivation* — e.g. reading the target-only
 * `country_code_cn.csv` and selecting its `name_chinese` column instead of
 * deriving English names from the shared dataset. The file is invisible to the
 * model (it exists only in the target repo), so a prompt rule alone
 * demonstrably does not survive contact: the reverted block reproduced on a
 * re-run with the strengthened rule in place.
 *
 * The deterministic treatment, in the spirit of the structural parity guard:
 *   1. detect such reads in the target before the model call,
 *   2. pin the exact lines in the request's custom instructions,
 *   3. verify after finalization that every pinned line survived — and fail
 *      the file loudly if not. A silent revert merges English legends; a loud
 *      failure gets a human.
 *
 * Lives in its own module per the Stage-2 rule: guards go in modules Jest can
 * load.
 */

import * as fs from 'fs';
import * as path from 'path';

/** A code-cell line that reads a data file, with the file's basename. */
export interface DataFileRead {
  /** The full line, trimmed. */
  line: string;
  /** Basename of the referenced file, e.g. `country_code_cn.csv`. */
  basename: string;
}

/** Opening of any fence: ```lang, ````{directive} arg, ~~~ … (same walk as structural-parity). */
const FENCE_LINE = /^\s*(`{3,}|~{3,})(.*)$/;

/** Quoted path ending in a data extension. URLs are excluded — they are not repo files. */
const DATA_PATH = /["']([^"']*\.(?:csv|json|xlsx|parquet|dta|npz|zip))["']/gi;

/**
 * All lines inside top-level `{code-cell}` fences. Fence walk mirrors
 * structural-parity.ts. Shared by extraction AND survival verification so the
 * two sides look at the same universe — a pinned line reproduced in prose or
 * an example fence must not count as surviving.
 */
export function codeCellLines(content: string): string[] {
  const lines: string[] = [];
  let openFence: { char: string; length: number } | null = null;
  let inCodeCell = false;

  for (const rawLine of content.split('\n')) {
    const fence = FENCE_LINE.exec(rawLine);
    if (openFence) {
      if (
        fence &&
        fence[1][0] === openFence.char &&
        fence[1].length >= openFence.length &&
        fence[2].trim() === ''
      ) {
        openFence = null;
        inCodeCell = false;
        continue;
      }
      if (inCodeCell) lines.push(rawLine);
      continue;
    }
    if (fence) {
      openFence = { char: fence[1][0], length: fence[1].length };
      inCodeCell = fence[2].trim().startsWith('{code-cell}');
    }
  }
  return lines;
}

/**
 * Extract code-cell lines that reference data files by quoted path.
 */
export function extractDataFileReads(content: string): DataFileRead[] {
  const reads: DataFileRead[] = [];
  for (const rawLine of codeCellLines(content)) {
    for (const match of rawLine.matchAll(DATA_PATH)) {
      const ref = match[1];
      if (/^[a-z]+:\/\//i.test(ref)) continue; // URL, not a repo file
      reads.push({ line: rawLine.trim(), basename: path.posix.basename(ref) });
    }
  }
  return reads;
}

/**
 * Classify reads as target-local: the basename exists somewhere under the
 * target docs tree and nowhere under the source docs tree. Basename matching
 * deliberately sidesteps notebook-CWD-relative path resolution (`../lectures/…`).
 * Predicates are injected for testability.
 */
export function classifyTargetLocalReads(
  reads: DataFileRead[],
  existsInTarget: (basename: string) => boolean,
  existsInSource: (basename: string) => boolean
): DataFileRead[] {
  const seen = new Set<string>();
  const targetLocal: DataFileRead[] = [];
  for (const read of reads) {
    if (seen.has(read.line)) continue;
    if (existsInTarget(read.basename) && !existsInSource(read.basename)) {
      seen.add(read.line);
      targetLocal.push(read);
    }
  }
  return targetLocal;
}

/** Recursively collect file basenames under a directory (empty set if absent). */
export function collectBasenames(dir: string): Set<string> {
  const names = new Set<string>();
  if (!fs.existsSync(dir)) return names;
  const walk = (d: string): void => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name.startsWith('.git')) continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else names.add(entry.name);
    }
  };
  walk(dir);
  return names;
}

/**
 * Detect target-local data reads in a target document. Convenience wrapper
 * over the pure pieces, using the two docs trees on disk.
 */
export function findTargetLocalReads(
  targetContent: string,
  sourceDocsDir: string,
  targetDocsDir: string
): DataFileRead[] {
  const reads = extractDataFileReads(targetContent);
  if (reads.length === 0) return []; // most files — skip the disk walks entirely
  const sourceNames = collectBasenames(sourceDocsDir);
  const targetNames = collectBasenames(targetDocsDir);
  return classifyTargetLocalReads(
    reads,
    (b) => targetNames.has(b),
    (b) => sourceNames.has(b)
  );
}

/**
 * Custom-instructions block pinning the detected lines. Appended to the
 * resync request so the model sees the EXACT lines, not just the class rule.
 */
export function buildPreserveInstruction(reads: DataFileRead[]): string {
  if (reads.length === 0) return '';
  const lines = reads.map((r) => `   ${r.line}`).join('\n');
  return (
    `\nIMPORTANT — the following code lines read data files that exist ONLY in the ` +
    `translation repository (deliberate localisation; the files are not in the source repo). ` +
    `Each of these lines MUST appear in your output byte-for-byte, and the column/field ` +
    `selections that consume them must be kept:\n${lines}\n`
  );
}

/**
 * Verify every pinned line survived into the output's `{code-cell}` fences.
 * Returns the missing lines; empty means preserved. Scoped to code cells —
 * the reads were captured from code cells, and a copy of the line in prose or
 * an example fence is not the executable code the localisation lives in.
 */
export function verifyPreservedReads(outputContent: string, reads: DataFileRead[]): string[] {
  if (reads.length === 0) return [];
  const outputLines = new Set(codeCellLines(outputContent).map((l) => l.trim()));
  return reads.filter((r) => !outputLines.has(r.line)).map((r) => r.line);
}

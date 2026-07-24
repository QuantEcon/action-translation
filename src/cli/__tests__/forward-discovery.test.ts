/**
 * Forward bulk discovery and summary accounting (#106).
 *
 * Discovery: candidates are selected by status FLAGS, not the primary
 * status — priority ranks MISSING_HEADINGMAP above OUTDATED, so on an
 * unbootstrapped repo (every file lacks a heading map) date-stale files
 * were invisible to the old primary-status filter.
 *
 * Summary: buckets by what the pipeline actually did — TARGET_HAS_ADDITIONS
 * files get resynced, but the old summary bucketed by verdict and reported
 * them as "skipped: i18n only" while their PRs existed.
 */

import { selectForwardCandidates, printBulkSummary, ForwardLogger } from '../commands/forward.js';
import { FileStatusEntry } from '../commands/status.js';
import { ForwardFileResult } from '../types.js';

function entry(file: string, flags: FileStatusEntry['flags']): FileStatusEntry {
  // Primary status mirrors checkFileStatus priority:
  // SOURCE_AHEAD > TARGET_AHEAD > MISSING_HEADINGMAP > OUTDATED > ALIGNED
  const priority: FileStatusEntry['flags'] = [
    'SOURCE_AHEAD',
    'TARGET_AHEAD',
    'MISSING_HEADINGMAP',
    'OUTDATED',
  ];
  const primary = priority.find((s) => flags.includes(s)) ?? 'ALIGNED';
  return { file, status: primary, flags };
}

describe('selectForwardCandidates (#106)', () => {
  it('finds date-stale files whose primary status is MISSING_HEADINGMAP', () => {
    // The unbootstrapped-repo shape that hid 29 of 41 files: stale by date,
    // but MISSING_HEADINGMAP outranks OUTDATED as the primary status.
    const entries = [entry('lp_intro.md', ['MISSING_HEADINGMAP', 'OUTDATED'])];
    expect(entries[0].status).toBe('MISSING_HEADINGMAP'); // old filter saw only this
    const selected = selectForwardCandidates(entries);
    expect(selected.map((c) => c.file)).toEqual(['lp_intro.md']);
    expect(selected[0].flags).toEqual(['MISSING_HEADINGMAP', 'OUTDATED']);
  });

  it('includes SOURCE_AHEAD, TARGET_AHEAD, and map-less files; excludes ALIGNED', () => {
    const entries = [
      entry('a.md', ['SOURCE_AHEAD']),
      entry('b.md', ['TARGET_AHEAD']),
      entry('c.md', ['MISSING_HEADINGMAP']),
      entry('d.md', ['OUTDATED']),
      entry('e.md', ['ALIGNED']),
    ];
    expect(selectForwardCandidates(entries).map((c) => c.file)).toEqual([
      'a.md',
      'b.md',
      'c.md',
      'd.md',
    ]);
  });

  it('never selects SOURCE_ONLY / TARGET_ONLY / NOT_FOUND files', () => {
    const entries: FileStatusEntry[] = [
      { file: 'new.md', status: 'SOURCE_ONLY', flags: ['SOURCE_ONLY'] },
      { file: 'gone.md', status: 'TARGET_ONLY', flags: ['TARGET_ONLY'] },
      { file: 'ghost.md', status: 'NOT_FOUND', flags: ['NOT_FOUND'] },
    ];
    expect(selectForwardCandidates(entries)).toEqual([]);
  });
});

// ── summary ────────────────────────────────────────────────────────────────

function result(
  file: string,
  verdict: 'CONTENT_CHANGES' | 'TARGET_HAS_ADDITIONS' | 'I18N_ONLY' | 'IDENTICAL',
  resynced: number,
  errors: number,
  reason = ''
): ForwardFileResult {
  return {
    file,
    triageResult: { file, verdict, reason },
    tokensUsed: resynced > 0 ? 1000 : undefined,
    summary: { resynced, unchanged: 0, new: 0, removed: 0, errors },
  };
}

function captureLogger(): { logger: ForwardLogger; lines: string[] } {
  const lines: string[] = [];
  return {
    logger: {
      info: (m) => lines.push(m),
      warn: (m) => lines.push(m),
      error: (m) => lines.push(m),
    },
    lines,
  };
}

describe('printBulkSummary (#106)', () => {
  it('counts resynced TARGET_HAS_ADDITIONS files as processed, not skipped', () => {
    // The wave-1 shape: 9 CONTENT_CHANGES + 2 TARGET_HAS_ADDITIONS resynced,
    // 1 genuinely skipped — the old summary said "processed 9, skipped 3".
    const results = [
      ...Array.from({ length: 9 }, (_, i) => result(`c${i}.md`, 'CONTENT_CHANGES', 1, 0)),
      result('lp_intro.md', 'TARGET_HAS_ADDITIONS', 1, 0, 'major divergence'),
      result('money_inflation_nonlinear.md', 'TARGET_HAS_ADDITIONS', 1, 0, 'extra exercises'),
      result('intro.md', 'I18N_ONLY', 0, 0, 'only translated labels differ'),
    ];
    const { logger, lines } = captureLogger();
    printBulkSummary(results, logger);

    const text = lines.join('\n');
    expect(text).toContain('Files processed: 11');
    expect(text).toContain('Files resynced:  11');
    expect(text).toContain('Files skipped:   1');
    expect(text).not.toContain('lp_intro.md: i18n only');
    expect(text).toContain('intro.md: i18n only');
  });

  it('labels skipped files by their actual verdict', () => {
    const results = [
      result('a.md', 'IDENTICAL', 0, 0),
      result('b.md', 'I18N_ONLY', 0, 0),
      result('c.md', 'TARGET_HAS_ADDITIONS', 0, 0), // e.g. triaged but resync failed upstream of summary
    ];
    const { logger, lines } = captureLogger();
    printBulkSummary(results, logger);

    const text = lines.join('\n');
    expect(text).toContain('a.md: identical');
    expect(text).toContain('b.md: i18n only');
    expect(text).toContain('c.md: target has additions');
  });

  it('counts errored files as processed and lists them', () => {
    const results = [
      result('ok.md', 'CONTENT_CHANGES', 1, 0),
      result('bad.md', 'CONTENT_CHANGES', 0, 1),
    ];
    const { logger, lines } = captureLogger();
    printBulkSummary(results, logger);

    const text = lines.join('\n');
    expect(text).toContain('Files processed: 2');
    expect(text).toContain('Files resynced:  1');
    expect(text).toContain('Files skipped:   0');
    expect(text).toContain('Files errored:   1');
    expect(text).toContain('bad.md');
  });
});

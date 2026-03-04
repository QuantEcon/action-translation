/**
 * Tests for git-metadata module
 * 
 * Tests git log output parsing and date utilities.
 * Also tests getFileGitMetadata against the current repo.
 */

import { 
  parseGitLogOutput, 
  formatDate, 
  daysBetween, 
  getFileGitMetadata,
  parseTimelineEntry,
  getRepoCommits,
  getFileTimeline,
  formatTimelineForPrompt,
} from '../git-metadata.js';
import { FileTimeline } from '../types.js';
import * as path from 'path';

describe('git-metadata', () => {
  describe('parseGitLogOutput', () => {
    it('should parse standard git log output', () => {
      const output = 'abc123def456789012345678901234567890abcd 2024-06-15 10:30:00 -0500 Jane Doe';
      const result = parseGitLogOutput(output);
      
      expect(result).not.toBeNull();
      expect(result!.lastCommit).toBe('abc123def456789012345678901234567890abcd');
      expect(result!.lastAuthor).toBe('Jane Doe');
      expect(result!.lastModified).toBeInstanceOf(Date);
      expect(result!.lastModified.getFullYear()).toBe(2024);
    });

    it('should handle positive timezone offset', () => {
      const output = '1234567890123456789012345678901234567890 2024-01-01 00:00:00 +0800 作者名';
      const result = parseGitLogOutput(output);
      expect(result).not.toBeNull();
      expect(result!.lastAuthor).toBe('作者名');
    });

    it('should return null for empty string', () => {
      expect(parseGitLogOutput('')).toBeNull();
    });

    it('should return null for malformed output', () => {
      expect(parseGitLogOutput('not a valid git log line')).toBeNull();
      expect(parseGitLogOutput('short-sha 2024-01-01 00:00:00 +0000 Name')).toBeNull();
    });
  });

  describe('formatDate', () => {
    it('should format date as ISO date string', () => {
      const date = new Date('2024-06-15T10:30:00Z');
      expect(formatDate(date)).toBe('2024-06-15');
    });
  });

  describe('daysBetween', () => {
    it('should calculate positive days', () => {
      const earlier = new Date('2024-01-01');
      const later = new Date('2024-01-31');
      expect(daysBetween(earlier, later)).toBe(30);
    });

    it('should calculate negative days when reversed', () => {
      const earlier = new Date('2024-01-31');
      const later = new Date('2024-01-01');
      expect(daysBetween(earlier, later)).toBe(-30);
    });

    it('should return 0 for same date', () => {
      const date = new Date('2024-06-15');
      expect(daysBetween(date, date)).toBe(0);
    });
  });

  describe('getFileGitMetadata', () => {
    // These tests run against the current repo
    const repoRoot = path.resolve(__dirname, '..', '..', '..');

    it('should return metadata for a tracked file', async () => {
      const result = await getFileGitMetadata(repoRoot, 'package.json');
      expect(result).not.toBeNull();
      expect(result!.lastCommit).toMatch(/^[0-9a-f]{40}$/);
      expect(result!.lastAuthor).toBeTruthy();
      expect(result!.lastModified).toBeInstanceOf(Date);
    });

    it('should return null for non-existent file', async () => {
      const result = await getFileGitMetadata(repoRoot, 'nonexistent-file-xyz.md');
      expect(result).toBeNull();
    });

    it('should return null for invalid repo path', async () => {
      const result = await getFileGitMetadata('/nonexistent/path', 'file.md');
      expect(result).toBeNull();
    });
  });

  describe('parseTimelineEntry', () => {
    it('should parse a standard git log line', () => {
      const entry = parseTimelineEntry(
        '2024-06-15 10:30:00 -0500|abc123d|Add solow model lecture',
        'SOURCE',
      );
      expect(entry).not.toBeNull();
      expect(entry!.date).toBe('2024-06-15');
      expect(entry!.fullDate).toBe('2024-06-15 10:30:00 -0500');
      expect(entry!.repo).toBe('SOURCE');
      expect(entry!.sha).toBe('abc123d');
      expect(entry!.message).toBe('Add solow model lecture');
    });

    it('should handle commit messages with pipe characters', () => {
      const entry = parseTimelineEntry(
        '2024-01-01 00:00:00 +0800|def456a|Fix: a|b|c regression',
        'TARGET',
      );
      expect(entry).not.toBeNull();
      expect(entry!.sha).toBe('def456a');
      expect(entry!.message).toBe('Fix: a|b|c regression');
      expect(entry!.fullDate).toBe('2024-01-01 00:00:00 +0800');
    });

    it('should return null for malformed line', () => {
      expect(parseTimelineEntry('bad input', 'SOURCE')).toBeNull();
      expect(parseTimelineEntry('no|date|here', 'SOURCE')).toBeNull();
    });

    it('should return null for line with too few parts', () => {
      expect(parseTimelineEntry('only-one-part', 'TARGET')).toBeNull();
    });
  });

  describe('getRepoCommits', () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..');

    it('should return commits for a tracked file', async () => {
      const entries = await getRepoCommits(repoRoot, 'package.json', 'SOURCE');
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].repo).toBe('SOURCE');
      expect(entries[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entries[0].fullDate).toBeTruthy();
      expect(entries[0].sha).toBeTruthy();
      expect(entries[0].message).toBeTruthy();
    });

    it('should return empty array for non-existent file', async () => {
      const entries = await getRepoCommits(repoRoot, 'nonexistent-xyz.md', 'TARGET');
      expect(entries).toEqual([]);
    });

    it('should return empty array for invalid repo path', async () => {
      const entries = await getRepoCommits('/nonexistent/path', 'file.md', 'SOURCE');
      expect(entries).toEqual([]);
    });
  });

  describe('getFileTimeline', () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..');

    it('should build timeline using same repo as both source and target', async () => {
      // Use the current repo as both SOURCE and TARGET to test the function
      const timeline = await getFileTimeline(repoRoot, repoRoot, 'package.json');
      expect(timeline).not.toBeNull();
      expect(timeline!.sourceCommitCount).toBeGreaterThan(0);
      expect(timeline!.targetCommitCount).toBeGreaterThan(0);
      // Entries should be sorted newest-first (by fullDate)
      for (let i = 1; i < timeline!.entries.length; i++) {
        expect(timeline!.entries[i - 1].fullDate >= timeline!.entries[i].fullDate).toBe(true);
      }
    });

    it('should return null when neither repo has commits for file', async () => {
      const timeline = await getFileTimeline(
        '/nonexistent/path1', '/nonexistent/path2', 'file.md',
      );
      expect(timeline).toBeNull();
    });

    it('should calculate estimated sync date from earliest target commit', async () => {
      const timeline = await getFileTimeline(repoRoot, repoRoot, 'package.json');
      expect(timeline).not.toBeNull();
      expect(timeline!.estimatedSyncDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('formatTimelineForPrompt', () => {
    const sampleTimeline: FileTimeline = {
      entries: [
        { date: '2025-12-23', fullDate: '2025-12-23 10:00:00 +0000', repo: 'SOURCE', sha: 'abc123d', message: 'Fix SymPy deprecation + unicode variables' },
        { date: '2025-03-26', fullDate: '2025-03-26 14:00:00 +0000', repo: 'TARGET', sha: 'fed987a', message: 'Update translation syncing' },
        { date: '2025-01-10', fullDate: '2025-01-10 09:00:00 +0000', repo: 'SOURCE', sha: 'bbb222c', message: 'Fix FutureWarning string comparison' },
        { date: '2024-07-22', fullDate: '2024-07-22 08:00:00 +0000', repo: 'TARGET', sha: 'ccc333d', message: 'Translate solow.md to zh-cn' },
        { date: '2024-06-15', fullDate: '2024-06-15 12:00:00 +0000', repo: 'SOURCE', sha: 'ddd444e', message: 'Add solow model lecture' },
      ],
      sourceCommitCount: 3,
      targetCommitCount: 2,
      estimatedSyncDate: '2024-07-22',
      sourceCommitsAfterSync: 2,
    };

    it('should include commit counts', () => {
      const output = formatTimelineForPrompt(sampleTimeline);
      expect(output).toContain('Source has 3 commits');
      expect(output).toContain('Target has 2 commits');
    });

    it('should include estimated sync date', () => {
      const output = formatTimelineForPrompt(sampleTimeline);
      expect(output).toContain('2024-07-22');
      expect(output).toContain('Estimated sync point');
    });

    it('should indicate source commits after sync', () => {
      const output = formatTimelineForPrompt(sampleTimeline);
      expect(output).toContain('SOURCE has 2 commit(s) AFTER');
    });

    it('should show commit entries with date, repo, sha, message', () => {
      const output = formatTimelineForPrompt(sampleTimeline);
      expect(output).toContain('2025-12-23');
      expect(output).toContain('SOURCE');
      expect(output).toContain('abc123d');
      expect(output).toContain('Fix SymPy deprecation');
    });

    it('should respect maxEntries limit', () => {
      const output = formatTimelineForPrompt(sampleTimeline, 2);
      expect(output).toContain('abc123d'); // first entry
      expect(output).toContain('fed987a'); // second entry
      expect(output).not.toContain('bbb222c'); // third entry hidden
      expect(output).toContain('3 older commits');
    });

    it('should handle timeline with no estimated sync date', () => {
      const noSync: FileTimeline = {
        entries: [
          { date: '2024-06-15', fullDate: '2024-06-15 12:00:00 +0000', repo: 'SOURCE', sha: 'aaa111b', message: 'Initial commit' },
        ],
        sourceCommitCount: 1,
        targetCommitCount: 0,
        estimatedSyncDate: null,
        sourceCommitsAfterSync: 0,
      };
      const output = formatTimelineForPrompt(noSync);
      expect(output).toContain('Source has 1 commits');
      expect(output).toContain('Target has 0 commits');
      expect(output).not.toContain('Estimated sync point');
    });
  });
});

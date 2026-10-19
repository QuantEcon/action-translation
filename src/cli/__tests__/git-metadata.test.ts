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
  fileChangedSince,
  commitsSince,
  parseTimelineEntry,
  getRepoCommits,
  getFileTimeline,
  formatTimelineForPrompt,
} from '../git-metadata.js';
import { FileTimeline } from '../types.js';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execFileSync } from 'child_process';

/**
 * Run git in a fixture repository, cut off from the machine's git config and
 * GIT_* environment so that signing, hooks or a GIT_DIR cannot reach it.
 * `date` ("YYYY-MM-DD") sets the author and committer dates, at noon UTC.
 */
function git(repo: string, args: string[], date?: string): string {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_')) env[key] = value;
  }
  Object.assign(env, {
    GIT_CONFIG_GLOBAL: os.devNull,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  });
  if (date) {
    env.GIT_AUTHOR_DATE = `${date} 12:00:00 +0000`;
    env.GIT_COMMITTER_DATE = `${date} 12:00:00 +0000`;
  }
  return execFileSync('git', args, {
    cwd: repo,
    env,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** Write one file and commit it on `date`; returns the commit's sha. */
function commit(
  repo: string,
  file: string,
  content: string,
  date: string,
  message: string
): string {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.writeFileSync(path.join(repo, file), content, 'utf-8');
  git(repo, ['add', '--all']);
  git(repo, ['commit', '-q', '--no-verify', '--no-gpg-sign', '-m', message], date);
  return git(repo, ['rev-parse', 'HEAD']).trim();
}

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

  describe('fileChangedSince / commitsSince (#380)', () => {
    const LECTURE = 'lectures/lecture.md';
    let repo: string;
    let added: string; // creates the lecture
    let fixed: string; // changes it
    let readmeBetween: string; // touches only README.md, before the next lecture change
    let revised: string; // changes it again
    let readmeAfter: string; // touches only README.md, after the last lecture change

    beforeAll(() => {
      repo = fs.mkdtempSync(path.join(os.tmpdir(), 'git-metadata-test-'));
      git(repo, ['init', '-q']);
      added = commit(repo, LECTURE, 'v1\n', '2026-10-01', 'Add lecture');
      fixed = commit(repo, LECTURE, 'v2\n', '2026-10-03', 'FIX: units | labels');
      readmeBetween = commit(repo, 'README.md', 'a\n', '2026-10-04', 'Edit README');
      revised = commit(repo, LECTURE, 'v3\n', '2026-10-05', 'Revise section two');
      readmeAfter = commit(repo, 'README.md', 'b\n', '2026-10-06', 'Edit README again');
    });

    afterAll(() => {
      fs.rmSync(repo, { recursive: true, force: true });
    });

    it('fileChangedSince: true when the content changed after the commit', async () => {
      expect(await fileChangedSince(repo, added, LECTURE)).toBe(true);
      // A commit that did not touch the file still counts what came after it
      expect(await fileChangedSince(repo, readmeBetween, LECTURE)).toBe(true);
    });

    it('fileChangedSince: false when the content is the same at the commit and HEAD', async () => {
      expect(await fileChangedSince(repo, revised, LECTURE)).toBe(false);
      // Content decides, not commit identity: this commit never touched the file
      expect(await fileChangedSince(repo, readmeAfter, LECTURE)).toBe(false);
      // An abbreviated sha resolves like the full one
      expect(await fileChangedSince(repo, revised.slice(0, 7), LECTURE)).toBe(false);
    });

    it('fileChangedSince: undefined when git cannot tell', async () => {
      // Well-formed, but not in this clone
      expect(
        await fileChangedSince(repo, '0123456789abcdef0123456789abcdef01234567', LECTURE)
      ).toBeUndefined();
      // Not a repository
      expect(await fileChangedSince('/nonexistent/path', added, LECTURE)).toBeUndefined();
      // Not a commit name, so git never sees it
      expect(await fileChangedSince(repo, 'unknown', LECTURE)).toBeUndefined();
    });

    it('never passes a recorded value that reads as an option to git', async () => {
      const leak = path.join(repo, 'leak.txt');
      const before = fs.readdirSync(repo).sort();
      expect(await fileChangedSince(repo, `--output=${leak}`, LECTURE)).toBeUndefined();
      expect(await commitsSince(repo, `--output=${leak}`, LECTURE)).toEqual([]);
      // git log would write to `leak.txt..HEAD`, not `leak.txt`: compare the
      // whole listing so a leak under any name fails.
      expect(fs.readdirSync(repo).sort()).toEqual(before);
    });

    it('commitsSince: the commits that change the file after the given one, newest first', async () => {
      const lines = await commitsSince(repo, added, LECTURE);
      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatch(
        new RegExp(`^${revised.slice(0, 4)}[0-9a-f]* 2026-10-05 Revise section two$`)
      );
      expect(lines[1]).toMatch(
        new RegExp(`^${fixed.slice(0, 4)}[0-9a-f]* 2026-10-03 FIX: units \\| labels$`)
      );

      expect(await commitsSince(repo, readmeBetween, LECTURE)).toHaveLength(1);
    });

    it('commitsSince: empty when nothing changed the file, or git fails', async () => {
      expect(await commitsSince(repo, revised, LECTURE)).toEqual([]);
      expect(await commitsSince(repo, readmeAfter, LECTURE)).toEqual([]);
      expect(await commitsSince(repo, '0123456789abcdef0123456789abcdef01234567', LECTURE)).toEqual(
        []
      );
    });
  });

  describe('parseTimelineEntry', () => {
    it('should parse a standard git log line', () => {
      const entry = parseTimelineEntry(
        '2024-06-15 10:30:00 -0500|abc123d|Add solow model lecture',
        'SOURCE'
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
        'TARGET'
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
      const timeline = await getFileTimeline('/nonexistent/path1', '/nonexistent/path2', 'file.md');
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
        {
          date: '2025-12-23',
          fullDate: '2025-12-23 10:00:00 +0000',
          repo: 'SOURCE',
          sha: 'abc123d',
          message: 'Fix SymPy deprecation + unicode variables',
        },
        {
          date: '2025-03-26',
          fullDate: '2025-03-26 14:00:00 +0000',
          repo: 'TARGET',
          sha: 'fed987a',
          message: 'Update translation syncing',
        },
        {
          date: '2025-01-10',
          fullDate: '2025-01-10 09:00:00 +0000',
          repo: 'SOURCE',
          sha: 'bbb222c',
          message: 'Fix FutureWarning string comparison',
        },
        {
          date: '2024-07-22',
          fullDate: '2024-07-22 08:00:00 +0000',
          repo: 'TARGET',
          sha: 'ccc333d',
          message: 'Translate solow.md to zh-cn',
        },
        {
          date: '2024-06-15',
          fullDate: '2024-06-15 12:00:00 +0000',
          repo: 'SOURCE',
          sha: 'ddd444e',
          message: 'Add solow model lecture',
        },
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
          {
            date: '2024-06-15',
            fullDate: '2024-06-15 12:00:00 +0000',
            repo: 'SOURCE',
            sha: 'aaa111b',
            message: 'Initial commit',
          },
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

/**
 * Tests for git-metadata module
 * 
 * Tests git log output parsing and date utilities.
 * Also tests getFileGitMetadata against the current repo.
 */

import { parseGitLogOutput, formatDate, daysBetween, getFileGitMetadata } from '../git-metadata';
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
});

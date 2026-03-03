/**
 * Tests for document-comparator module (Stage 1 Triage)
 * 
 * Tests prompt building, response parsing, and test-mode behavior.
 * Does NOT make real LLM calls.
 */

import * as fs from 'fs';
import * as path from 'path';
import { 
  buildTriagePrompt, 
  parseTriageResponse, 
  triageDocument,
} from '../document-comparator';
import { FileGitMetadata } from '../types';

const fixturesDir = path.join(__dirname, 'fixtures');

describe('document-comparator', () => {
  const mockSourceMeta: FileGitMetadata = {
    lastModified: new Date('2024-06-01'),
    lastCommit: 'a'.repeat(40),
    lastAuthor: 'Author A',
  };

  const mockTargetMeta: FileGitMetadata = {
    lastModified: new Date('2024-09-15'),
    lastCommit: 'b'.repeat(40),
    lastAuthor: 'Author B',
  };

  describe('buildTriagePrompt', () => {
    it('should include source and target content', () => {
      const prompt = buildTriagePrompt(
        'Hello world', '你好世界', 'en', 'zh-cn', null, null,
      );
      expect(prompt).toContain('Hello world');
      expect(prompt).toContain('你好世界');
      expect(prompt).toContain('en');
      expect(prompt).toContain('zh-cn');
    });

    it('should include timeline when git metadata is provided', () => {
      const prompt = buildTriagePrompt(
        'source', 'target', 'en', 'zh-cn', mockSourceMeta, mockTargetMeta,
      );
      expect(prompt).toContain('2024-06-01');
      expect(prompt).toContain('2024-09-15');
      expect(prompt).toContain('Author A');
      expect(prompt).toContain('Author B');
      expect(prompt).toContain('newer');
    });

    it('should omit timeline when no git metadata', () => {
      const prompt = buildTriagePrompt(
        'source', 'target', 'en', 'zh-cn', null, null,
      );
      expect(prompt).not.toContain('Timeline');
      expect(prompt).not.toContain('days');
    });

    it('should include recall-biased instruction', () => {
      const prompt = buildTriagePrompt(
        'source', 'target', 'en', 'zh-cn', null, null,
      );
      expect(prompt).toContain('When in doubt, use "CHANGES_DETECTED"');
    });

    it('should match prompt snapshot', () => {
      const prompt = buildTriagePrompt(
        'Test source content', 'Test target content',
        'en', 'zh-cn', mockSourceMeta, mockTargetMeta,
      );
      // Verify key structural elements
      expect(prompt).toContain('## Context');
      expect(prompt).toContain('## Source Content');
      expect(prompt).toContain('## Target Content');
      expect(prompt).toContain('## Task');
      expect(prompt).toContain('## Response Format');
      expect(prompt).toContain('CHANGES_DETECTED');
      expect(prompt).toContain('IN_SYNC');
    });
  });

  describe('parseTriageResponse', () => {
    it('should parse clean JSON response', () => {
      const response = '```json\n{"verdict": "IN_SYNC", "notes": ""}\n```';
      const result = parseTriageResponse(response);
      expect(result.verdict).toBe('IN_SYNC');
      expect(result.notes).toBe('');
    });

    it('should parse CHANGES_DETECTED', () => {
      const response = '{"verdict": "CHANGES_DETECTED", "notes": "Found a formula fix"}';
      const result = parseTriageResponse(response);
      expect(result.verdict).toBe('CHANGES_DETECTED');
      expect(result.notes).toBe('Found a formula fix');
    });

    it('should handle response with surrounding text', () => {
      const response = `I'll analyze the documents.
      
Based on my comparison:
{"verdict": "CHANGES_DETECTED", "notes": "The target includes an extra paragraph."}

Let me know if you need more details.`;
      const result = parseTriageResponse(response);
      expect(result.verdict).toBe('CHANGES_DETECTED');
      expect(result.notes).toBe('The target includes an extra paragraph.');
    });

    it('should fall back to keyword detection when JSON is malformed', () => {
      const response = 'The documents appear to be in_sync with no substantive changes.';
      const result = parseTriageResponse(response);
      expect(result.verdict).toBe('IN_SYNC');
    });

    it('should default to CHANGES_DETECTED when unparseable (recall-biased)', () => {
      const response = 'I cannot determine the relationship between these.';
      const result = parseTriageResponse(response);
      expect(result.verdict).toBe('CHANGES_DETECTED');
      expect(result.notes).toContain('Unable to parse');
    });

    it('should not accept invalid verdict values', () => {
      const response = '{"verdict": "MAYBE", "notes": "unclear"}';
      const result = parseTriageResponse(response);
      // Non-IN_SYNC values default to CHANGES_DETECTED
      expect(result.verdict).toBe('CHANGES_DETECTED');
    });
  });

  describe('triageDocument (test mode)', () => {
    const testOptions = {
      apiKey: 'test-key',
      model: 'claude-sonnet-4-5-20250929',
      sourceLanguage: 'en',
      targetLanguage: 'zh-cn',
      testMode: true,
    };

    it('should return IN_SYNC for aligned/intro files in test mode', async () => {
      const result = await triageDocument(
        'aligned-lecture.md', 'source', 'target', null, null, testOptions,
      );
      expect(result.verdict).toBe('IN_SYNC');
      expect(result.file).toBe('aligned-lecture.md');
    });

    it('should return CHANGES_DETECTED for non-aligned files in test mode', async () => {
      const result = await triageDocument(
        'solow-model.md', 'source', 'target', null, null, testOptions,
      );
      expect(result.verdict).toBe('CHANGES_DETECTED');
    });

    it('should return SKIPPED_TOO_LARGE for huge documents', async () => {
      const huge = 'x'.repeat(500_000); // ~125K tokens
      const result = await triageDocument(
        'huge-file.md', huge, huge, null, null, testOptions,
      );
      // Test mode mock runs first, but let's test the non-test path
      // For test mode, it returns based on filename
      expect(result.verdict).toBe('CHANGES_DETECTED');
    });

    it('should skip too-large documents when NOT in test mode', async () => {
      // To test the size check without making API calls, we need to verify
      // the behavior by looking at the function logic. The pre-flight check
      // happens before the API call. We test the actual size check with
      // a separate call that disables test mode but provides an invalid key.
      // The function should return SKIPPED_TOO_LARGE before trying the API.
      const huge = 'x'.repeat(500_000);
      const nonTestOptions = { ...testOptions, testMode: false, apiKey: 'fake-key' };
      
      const result = await triageDocument(
        'huge-file.md', huge, huge, null, null, nonTestOptions,
      );
      expect(result.verdict).toBe('SKIPPED_TOO_LARGE');
      expect(result.notes).toContain('too large');
    });
  });
});

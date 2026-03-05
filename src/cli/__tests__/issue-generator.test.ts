/**
 * Tests for the GitHub Issue body generator.
 */

import {
  formatIssueTitle,
  formatIssueBody,
  getIssueLabels,
  extractLanguage,
} from '../issue-generator.js';
import { SuggestionWithContext } from '../commands/review.js';

// ── strip ANSI ─────────────────────────────────────────────────────────────
function strip(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1B\[[0-9;]*m/g, '');
}

// ── fixture factory ────────────────────────────────────────────────────────
function makeSuggestion(overrides: Partial<SuggestionWithContext> = {}): SuggestionWithContext {
  return {
    file: 'ar1_processes.md',
    timestamp: '2026-03-05T12:00:00Z',
    sourceRepo: 'lecture-python-intro',
    targetRepo: 'lecture-intro.zh-cn',
    suggestion: {
      sectionHeading: '## Introduction',
      recommendation: 'BACKPORT',
      category: 'CLARIFICATION',
      confidence: 0.72,
      summary: 'The translation improves the explanation of variable definitions for clarity.',
      specificChanges: [
        {
          type: 'Explicit matrix definition',
          original: 'where $A$ is defined implicitly',
          improved: 'where $A$ is a $(T+2)\\times(T+2)$ matrix',
        },
      ],
      reasoning: 'The target adds context about matrix dimensions that would help English readers.',
    },
    ...overrides,
  };
}

// =============================================================================
// formatIssueTitle
// =============================================================================

describe('formatIssueTitle', () => {
  it('includes the filename in brackets', () => {
    const title = formatIssueTitle(makeSuggestion());
    expect(title).toMatch(/^\[ar1_processes\.md\]/);
  });

  it('includes the summary text', () => {
    const title = formatIssueTitle(makeSuggestion());
    expect(title).toContain('The translation improves the explanation');
  });

  it('truncates long summaries and appends ellipsis', () => {
    const long = 'A'.repeat(100);
    const item = makeSuggestion({ suggestion: { ...makeSuggestion().suggestion, summary: long } });
    const title = formatIssueTitle(item);
    expect(title).toContain('…');
    // The summary portion should be truncated to ≤ 80 chars (excluding "[file] " prefix)
    const summaryPart = title.slice(title.indexOf('] ') + 2);
    expect(summaryPart.replace('…', '').length).toBeLessThanOrEqual(80);
  });

  it('does not truncate short summaries', () => {
    const item = makeSuggestion();
    const title = formatIssueTitle(item);
    expect(title).not.toContain('…');
  });
});

// =============================================================================
// extractLanguage
// =============================================================================

describe('extractLanguage', () => {
  it('extracts "zh-cn" from "lecture-intro.zh-cn"', () => {
    expect(extractLanguage('lecture-intro.zh-cn')).toBe('zh-cn');
  });

  it('extracts "fa" from "lecture-intro.fa"', () => {
    expect(extractLanguage('lecture-intro.fa')).toBe('fa');
  });

  it('falls back to full string when no dot', () => {
    expect(extractLanguage('some-repo')).toBe('some-repo');
  });

  it('takes everything after the first dot', () => {
    expect(extractLanguage('my.repo.zh-cn')).toBe('repo.zh-cn');
  });
});

// =============================================================================
// getIssueLabels
// =============================================================================

describe('getIssueLabels', () => {
  it('always includes "translate"', () => {
    expect(getIssueLabels(makeSuggestion())).toContain('translate');
  });

  it('returns "translate:narrative" for CLARIFICATION', () => {
    expect(getIssueLabels(makeSuggestion())).toContain('translate:narrative');
  });

  it('returns "translate:narrative" for EXAMPLE too', () => {
    const item = makeSuggestion({ suggestion: { ...makeSuggestion().suggestion, category: 'EXAMPLE' } });
    expect(getIssueLabels(item)).toContain('translate:narrative');
  });

  it('returns "translate:bug-fix" for BUG_FIX category', () => {
    const item = makeSuggestion({ suggestion: { ...makeSuggestion().suggestion, category: 'BUG_FIX' } });
    expect(getIssueLabels(item)).toContain('translate:bug-fix');
  });

  it('returns "translate:code" for CODE_IMPROVEMENT category', () => {
    const item = makeSuggestion({ suggestion: { ...makeSuggestion().suggestion, category: 'CODE_IMPROVEMENT' } });
    expect(getIssueLabels(item)).toContain('translate:code');
  });

  it('includes the language label extracted from targetRepo', () => {
    expect(getIssueLabels(makeSuggestion())).toContain('translate:zh-cn');
  });

  it('returns exactly 3 labels when targetRepo is present', () => {
    expect(getIssueLabels(makeSuggestion())).toHaveLength(3);
  });

  it('returns 2 labels when targetRepo is absent', () => {
    const item = makeSuggestion({ targetRepo: undefined });
    expect(getIssueLabels(item)).toHaveLength(2);
    expect(getIssueLabels(item)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^translate:zh/)])
    );
  });

  it('falls back gracefully for unknown categories', () => {
    const item = makeSuggestion({ suggestion: { ...makeSuggestion().suggestion, category: 'CUSTOM_THING' as any } });
    expect(getIssueLabels(item)).toContain('translate:custom-thing');
  });
});

// =============================================================================
// formatIssueBody
// =============================================================================

describe('formatIssueBody', () => {
  const item = makeSuggestion();
  const body = formatIssueBody(item);

  it('contains a Summary section', () => {
    expect(body).toContain('## Summary');
    expect(body).toContain('The translation improves the explanation');
  });

  it('summary is plain text, not a blockquote', () => {
    expect(body).not.toContain('> The translation');
    // Should be plain text directly after the heading
    expect(body).toMatch(/## Summary\n\nThe translation/);
  });

  it('contains a Details table with file', () => {
    expect(body).toContain('**File**');
    expect(body).toContain('`ar1_processes.md`');
  });

  it('contains the section heading in the Details table', () => {
    expect(body).toContain('`## Introduction`');
  });

  it('contains the category label', () => {
    expect(body).toContain('CLARIFICATION');
  });

  it('contains the confidence percentage and tier', () => {
    expect(body).toContain('72%');
    expect(body).toContain('medium');
  });

  it('contains source and target repo', () => {
    expect(body).toContain('lecture-python-intro');
    expect(body).toContain('lecture-intro.zh-cn');
  });

  it('contains the Analysis section with reasoning', () => {
    expect(body).toContain('## Analysis');
    expect(body).toContain('The target adds context about matrix dimensions');
  });

  it('contains "Suggested Change" section', () => {
    expect(body).toContain('## Suggested Change');
  });

  it('contains Before/After blocks', () => {
    expect(body).toContain('**Before:**');
    expect(body).toContain('**After:**');
    expect(body).toContain('where $A$ is defined implicitly');
    expect(body).toContain('where $A$ is a $(T+2)');
  });

  it('uses ``` code fences for changes', () => {
    expect(body).toContain('```\n');
  });

  it('contains the generated-by footer with date', () => {
    expect(body).toContain('Generated by `resync backward`');
    expect(body).toContain('2026-03-05');
  });

  it('omits "Suggested Change" section when specificChanges is empty', () => {
    const empty = makeSuggestion({ suggestion: { ...item.suggestion, specificChanges: [] } });
    const b = formatIssueBody(empty);
    expect(b).not.toContain('## Suggested Change');
    expect(b).not.toContain('**Before:**');
  });

  it('omits repo rows when repos are not set', () => {
    const noRepo = makeSuggestion({ sourceRepo: undefined, targetRepo: undefined });
    const b = formatIssueBody(noRepo);
    expect(b).not.toContain('**Source repo**');
    expect(b).not.toContain('**Target repo**');
  });

  it('uses plural "Suggested Changes" for 2+ changes', () => {
    const multi = makeSuggestion({
      suggestion: {
        ...item.suggestion,
        specificChanges: [
          { type: 'Fix 1', original: 'old1', improved: 'new1' },
          { type: 'Fix 2', original: 'old2', improved: 'new2' },
        ],
      },
    });
    expect(formatIssueBody(multi)).toContain('## Suggested Changes');
  });

  it('uses longer fence when content contains triple backticks', () => {
    const nested = makeSuggestion({
      suggestion: {
        ...item.suggestion,
        specificChanges: [
          {
            type: 'Add code block',
            original: '(none)',
            improved: 'Add this:\n\n```python\nprint("hello")\n```',
          },
        ],
      },
    });
    const b = formatIssueBody(nested);
    // The outer fence must be longer than 3 backticks to avoid collision
    expect(b).toContain('````');
    // The inner ``` should still be present as content
    expect(b).toContain('```python');
  });
});



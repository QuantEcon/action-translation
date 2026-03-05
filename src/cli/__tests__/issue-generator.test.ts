/**
 * Tests for the GitHub Issue body generator.
 */

import {
  formatIssueTitle,
  formatIssueBody,
  getIssueLabels,
  formatIssuePreview,
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
// getIssueLabels
// =============================================================================

describe('getIssueLabels', () => {
  it('always includes "backward-suggestion"', () => {
    expect(getIssueLabels(makeSuggestion())).toContain('backward-suggestion');
  });

  it('includes the category label for CLARIFICATION', () => {
    expect(getIssueLabels(makeSuggestion())).toContain('clarification');
  });

  it('includes the confidence tier label (medium for 0.72)', () => {
    expect(getIssueLabels(makeSuggestion())).toContain('confidence-medium');
  });

  it('returns "bug-fix" for BUG_FIX category', () => {
    const item = makeSuggestion({ suggestion: { ...makeSuggestion().suggestion, category: 'BUG_FIX', confidence: 0.9 } });
    expect(getIssueLabels(item)).toContain('bug-fix');
    expect(getIssueLabels(item)).toContain('confidence-high');
  });

  it('returns "code-improvement" for CODE_IMPROVEMENT category', () => {
    const item = makeSuggestion({ suggestion: { ...makeSuggestion().suggestion, category: 'CODE_IMPROVEMENT' } });
    expect(getIssueLabels(item)).toContain('code-improvement');
  });

  it('returns low confidence label for confidence < 0.6', () => {
    const item = makeSuggestion({ suggestion: { ...makeSuggestion().suggestion, confidence: 0.3 } });
    expect(getIssueLabels(item)).toContain('confidence-low');
  });

  it('returns exactly 3 labels', () => {
    expect(getIssueLabels(makeSuggestion())).toHaveLength(3);
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
});

// =============================================================================
// formatIssuePreview
// =============================================================================

describe('formatIssuePreview', () => {
  const item = makeSuggestion();

  it('contains the Issue title', () => {
    const preview = strip(formatIssuePreview(item));
    expect(preview).toContain('[ar1_processes.md]');
    expect(preview).toContain('The translation improves');
  });

  it('contains all labels', () => {
    const preview = strip(formatIssuePreview(item));
    expect(preview).toContain('backward-suggestion');
    expect(preview).toContain('clarification');
    expect(preview).toContain('confidence-medium');
  });

  it('contains the Issue body preview section header', () => {
    const preview = strip(formatIssuePreview(item));
    expect(preview).toContain('GitHub Issue Preview');
  });

  it('contains the body content (Summary heading)', () => {
    const preview = strip(formatIssuePreview(item));
    expect(preview).toContain('## Summary');
  });

  it('returns a non-empty string', () => {
    expect(formatIssuePreview(item).length).toBeGreaterThan(0);
  });
});

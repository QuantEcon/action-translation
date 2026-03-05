/**
 * Tests for the review dry-run chalk formatter.
 *
 * Chalk auto-disables colours in non-TTY contexts (Jest),
 * so tests check plain-text content rather than ANSI codes.
 */

import {
  wrapText,
  confidenceTier,
  formatConfidence,
  formatSuggestionCard,
  computeSummaryStats,
  CATEGORY_STYLES,
} from '../review-formatter.js';
import { SuggestionWithContext } from '../commands/review.js';

// ============================================================================
// HELPERS
// ============================================================================

/** Strip ANSI escape codes for reliable content assertions. */
function strip(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1B\[[0-9;]*m/g, '');
}

function makeSuggestion(overrides: Partial<SuggestionWithContext> = {}): SuggestionWithContext {
  return {
    file: 'ar1_processes.md',
    timestamp: '2026-03-05T00:00:00Z',
    sourceRepo: 'lecture-python-intro',
    targetRepo: 'lecture-intro.zh-cn',
    suggestion: {
      sectionHeading: '## Introduction',
      recommendation: 'BACKPORT',
      category: 'CLARIFICATION',
      confidence: 0.72,
      summary: 'The translation improves the explanation of variable definitions.',
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

// ============================================================================
// wrapText
// ============================================================================

describe('wrapText', () => {
  it('returns a single line for short text', () => {
    const result = wrapText('Hello world', 80, '  ');
    expect(result).toBe('  Hello world');
  });

  it('wraps long lines at the specified width', () => {
    const long = 'The quick brown fox jumps over the lazy dog and then runs away very fast';
    const result = wrapText(long, 40, '  ');
    const lines = result.split('\n');
    for (const line of lines) {
      expect(strip(line).length).toBeLessThanOrEqual(40);
    }
    // All words must still be present
    expect(strip(result).replace(/\s+/g, ' ').trim()).toBe(long);
  });

  it('preserves existing newlines', () => {
    const text = 'Line one\nLine two\nLine three';
    const result = wrapText(text, 80, '> ');
    const lines = result.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('> Line one');
    expect(lines[1]).toBe('> Line two');
  });

  it('handles empty lines in multi-paragraph text', () => {
    const text = 'First paragraph\n\nSecond paragraph';
    const result = wrapText(text, 80, '  ');
    expect(result).toContain('\n  \n');
  });
});

// ============================================================================
// confidenceTier
// ============================================================================

describe('confidenceTier', () => {
  it('returns high for >= 0.85', () => {
    expect(confidenceTier(0.85)).toBe('high');
    expect(confidenceTier(1.0)).toBe('high');
    expect(confidenceTier(0.9)).toBe('high');
  });

  it('returns medium for 0.60–0.84', () => {
    expect(confidenceTier(0.6)).toBe('medium');
    expect(confidenceTier(0.72)).toBe('medium');
    expect(confidenceTier(0.84)).toBe('medium');
  });

  it('returns low for < 0.60', () => {
    expect(confidenceTier(0.59)).toBe('low');
    expect(confidenceTier(0.0)).toBe('low');
  });
});

// ============================================================================
// formatConfidence
// ============================================================================

describe('formatConfidence', () => {
  it('includes the percentage', () => {
    expect(strip(formatConfidence(0.72))).toContain('72%');
    expect(strip(formatConfidence(0.9))).toContain('90%');
  });

  it('includes the tier label', () => {
    expect(strip(formatConfidence(0.9))).toContain('high');
    expect(strip(formatConfidence(0.72))).toContain('medium');
    expect(strip(formatConfidence(0.3))).toContain('low');
  });
});

// ============================================================================
// CATEGORY_STYLES coverage
// ============================================================================

describe('CATEGORY_STYLES', () => {
  const expected = ['BUG_FIX', 'CLARIFICATION', 'EXAMPLE', 'CODE_IMPROVEMENT', 'I18N_ONLY', 'NO_CHANGE'];

  it.each(expected)('defines style for %s', (cat) => {
    expect(CATEGORY_STYLES[cat]).toBeDefined();
    expect(CATEGORY_STYLES[cat].label).toBeTruthy();
    expect(typeof CATEGORY_STYLES[cat].badge).toBe('function');
    // badge should return a non-empty string
    expect(strip(CATEGORY_STYLES[cat].badge('[test]'))).toContain('[test]');
  });
});

// ============================================================================
// formatSuggestionCard
// ============================================================================

describe('formatSuggestionCard', () => {
  const item = makeSuggestion();

  it('contains the file name', () => {
    const card = strip(formatSuggestionCard(item, 1, 5));
    expect(card).toContain('ar1_processes.md');
  });

  it('contains the section heading', () => {
    const card = strip(formatSuggestionCard(item, 1, 5));
    expect(card).toContain('## Introduction');
  });

  it('contains the counter [1/5]', () => {
    const card = strip(formatSuggestionCard(item, 1, 5));
    expect(card).toContain('[1/5]');
  });

  it('contains the category label', () => {
    const card = strip(formatSuggestionCard(item, 1, 5));
    expect(card).toContain('CLARIFICATION');
  });

  it('contains the confidence percentage', () => {
    const card = strip(formatSuggestionCard(item, 1, 5));
    expect(card).toContain('72%');
  });

  it('contains the summary', () => {
    const card = strip(formatSuggestionCard(item, 1, 5));
    expect(card).toContain('The translation improves the explanation');
  });

  it('contains the reasoning text', () => {
    const card = strip(formatSuggestionCard(item, 1, 5));
    expect(card).toContain('The target adds context about matrix dimensions');
  });

  it('contains the "Before:" and "After:" labels for specific changes', () => {
    const card = strip(formatSuggestionCard(item, 1, 5));
    expect(card).toContain('Before:');
    expect(card).toContain('After:');
    expect(card).toContain('where $A$ is defined implicitly');
    expect(card).toContain('where $A$ is a $(T+2)');
  });

  it('shows "Suggested changes" (plural) for 2+ changes', () => {
    const itemMulti = makeSuggestion({
      suggestion: {
        ...item.suggestion,
        specificChanges: [
          { type: 'Fix 1', original: 'old', improved: 'new' },
          { type: 'Fix 2', original: 'old2', improved: 'new2' },
        ],
      },
    });
    const card = strip(formatSuggestionCard(itemMulti, 2, 5));
    expect(card).toContain('Suggested changes:');
  });

  it('shows "Suggested change" (singular) for 1 change', () => {
    const card = strip(formatSuggestionCard(item, 1, 5));
    expect(card).toContain('Suggested change:');
    expect(card).not.toContain('Suggested changes:');
  });

  it('omits specific changes section when specificChanges is empty', () => {
    const itemNoChanges = makeSuggestion({
      suggestion: { ...item.suggestion, specificChanges: [] },
    });
    const card = strip(formatSuggestionCard(itemNoChanges, 1, 5));
    expect(card).not.toContain('Suggested change');
    expect(card).not.toContain('Before:');
  });

  it('renders all categories without throwing', () => {
    const cats = ['BUG_FIX', 'CLARIFICATION', 'EXAMPLE', 'CODE_IMPROVEMENT', 'I18N_ONLY', 'NO_CHANGE'] as const;
    for (const cat of cats) {
      const i2 = makeSuggestion({ suggestion: { ...item.suggestion, category: cat } });
      expect(() => formatSuggestionCard(i2, 1, 1)).not.toThrow();
    }
  });
});

// ============================================================================
// computeSummaryStats
// ============================================================================

describe('computeSummaryStats', () => {
  it('returns zero stats for empty list', () => {
    const stats = computeSummaryStats([]);
    expect(stats.total).toBe(0);
    expect(stats.byCategory).toEqual({});
    expect(stats.byTier).toEqual({ high: 0, medium: 0, low: 0 });
    expect(stats.filesWithSuggestions).toBe(0);
  });

  it('counts categories correctly', () => {
    const items = [
      makeSuggestion({ suggestion: { ...makeSuggestion().suggestion, category: 'BUG_FIX', confidence: 0.9 } }),
      makeSuggestion({ suggestion: { ...makeSuggestion().suggestion, category: 'CLARIFICATION', confidence: 0.7 } }),
      makeSuggestion({ suggestion: { ...makeSuggestion().suggestion, category: 'CLARIFICATION', confidence: 0.65 } }),
    ];
    const stats = computeSummaryStats(items);
    expect(stats.total).toBe(3);
    expect(stats.byCategory['BUG_FIX']).toBe(1);
    expect(stats.byCategory['CLARIFICATION']).toBe(2);
  });

  it('counts confidence tiers correctly', () => {
    const items = [
      makeSuggestion({ suggestion: { ...makeSuggestion().suggestion, confidence: 0.95 } }), // high
      makeSuggestion({ suggestion: { ...makeSuggestion().suggestion, confidence: 0.85 } }), // high
      makeSuggestion({ suggestion: { ...makeSuggestion().suggestion, confidence: 0.72 } }), // medium
      makeSuggestion({ suggestion: { ...makeSuggestion().suggestion, confidence: 0.3 } }),  // low
    ];
    const stats = computeSummaryStats(items);
    expect(stats.byTier.high).toBe(2);
    expect(stats.byTier.medium).toBe(1);
    expect(stats.byTier.low).toBe(1);
  });

  it('counts unique files correctly', () => {
    const items = [
      makeSuggestion({ file: 'a.md' }),
      makeSuggestion({ file: 'a.md' }),
      makeSuggestion({ file: 'b.md' }),
    ];
    const stats = computeSummaryStats(items);
    expect(stats.filesWithSuggestions).toBe(2);
  });
});



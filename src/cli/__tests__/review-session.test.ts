/**
 * Tests for the review session state machine.
 * Pure logic — no ink components, no rendering.
 */

import {
  initialState,
  applyAction,
  resolveSummary,
  formatProgress,
  formatTallies,
  formatEndSummary,
} from '../review-session.js';
import { SuggestionWithContext } from '../commands/review.js';

// ── fixture helpers ────────────────────────────────────────────────────────

function makeSuggestion(file = 'file.md', heading = '## Intro'): SuggestionWithContext {
  return {
    file,
    timestamp: '2026-01-01T00:00:00Z',
    suggestion: {
      sectionHeading: heading,
      recommendation: 'BACKPORT',
      category: 'CLARIFICATION',
      confidence: 0.7,
      summary: 'Some suggestion',
      specificChanges: [],
      reasoning: 'Because reasons.',
    },
  };
}

const THREE = [
  makeSuggestion('a.md', '## A'),
  makeSuggestion('b.md', '## B'),
  makeSuggestion('c.md', '## C'),
];

// =============================================================================
// initialState
// =============================================================================

describe('initialState', () => {
  it('starts at index 0 with empty lists', () => {
    const s = initialState(3);
    expect(s.currentIndex).toBe(0);
    expect(s.accepted).toEqual([]);
    expect(s.skipped).toEqual([]);
    expect(s.rejected).toEqual([]);
    expect(s.done).toBe(false);
  });

  it('is immediately done when count is 0', () => {
    const s = initialState(0);
    expect(s.done).toBe(true);
  });
});

// =============================================================================
// applyAction — basic transitions
// =============================================================================

describe('applyAction', () => {
  const s0 = initialState(3);

  it('accept increments index and records in accepted[]', () => {
    const s1 = applyAction(s0, 'accept', 3);
    expect(s1.currentIndex).toBe(1);
    expect(s1.accepted).toEqual([0]);
    expect(s1.skipped).toEqual([]);
    expect(s1.rejected).toEqual([]);
    expect(s1.done).toBe(false);
  });

  it('skip increments index and records in skipped[]', () => {
    const s1 = applyAction(s0, 'skip', 3);
    expect(s1.currentIndex).toBe(1);
    expect(s1.skipped).toEqual([0]);
    expect(s1.accepted).toEqual([]);
    expect(s1.done).toBe(false);
  });

  it('reject increments index and records in rejected[]', () => {
    const s1 = applyAction(s0, 'reject', 3);
    expect(s1.currentIndex).toBe(1);
    expect(s1.rejected).toEqual([0]);
    expect(s1.done).toBe(false);
  });

  it('sets done=true after last suggestion', () => {
    let s = initialState(1);
    s = applyAction(s, 'accept', 1);
    expect(s.done).toBe(true);
  });

  it('does not mutate the input state', () => {
    const before = JSON.stringify(s0);
    applyAction(s0, 'accept', 3);
    expect(JSON.stringify(s0)).toBe(before);
  });

  it('is a no-op when already done', () => {
    let s = initialState(1);
    s = applyAction(s, 'skip', 1); // done
    const s2 = applyAction(s, 'accept', 1);
    expect(s2).toBe(s); // same reference
  });
});

// =============================================================================
// applyAction — full 3-item session
// =============================================================================

describe('applyAction full session', () => {
  it('correctly tracks mixed actions across all suggestions', () => {
    let s = initialState(3);
    s = applyAction(s, 'accept', 3);  // 0 → accepted
    s = applyAction(s, 'skip', 3);   // 1 → skipped
    s = applyAction(s, 'reject', 3); // 2 → rejected, done

    expect(s.currentIndex).toBe(3);
    expect(s.accepted).toEqual([0]);
    expect(s.skipped).toEqual([1]);
    expect(s.rejected).toEqual([2]);
    expect(s.done).toBe(true);
  });

  it('accumulates multiple accepts correctly', () => {
    let s = initialState(3);
    s = applyAction(s, 'accept', 3);
    s = applyAction(s, 'accept', 3);
    s = applyAction(s, 'skip',   3);
    expect(s.accepted).toEqual([0, 1]);
    expect(s.skipped).toEqual([2]);
  });
});

// =============================================================================
// resolveSummary
// =============================================================================

describe('resolveSummary', () => {
  it('resolves index arrays back to suggestion objects', () => {
    let s = initialState(3);
    s = applyAction(s, 'accept', 3);  // a.md
    s = applyAction(s, 'skip', 3);   // b.md
    s = applyAction(s, 'reject', 3); // c.md

    const summary = resolveSummary(s, THREE);
    expect(summary.accepted[0].file).toBe('a.md');
    expect(summary.skipped[0].file).toBe('b.md');
    expect(summary.rejected[0].file).toBe('c.md');
  });

  it('returns empty arrays for untouched categories', () => {
    let s = initialState(3);
    s = applyAction(s, 'skip', 3);
    s = applyAction(s, 'skip', 3);
    s = applyAction(s, 'skip', 3);

    const summary = resolveSummary(s, THREE);
    expect(summary.accepted).toEqual([]);
    expect(summary.rejected).toEqual([]);
    expect(summary.skipped).toHaveLength(3);
  });
});

// =============================================================================
// formatProgress
// =============================================================================

describe('formatProgress', () => {
  it('shows "1 / N" at the start', () => {
    const s = initialState(5);
    expect(formatProgress(s, 5)).toBe('1 / 5');
  });

  it('shows the next index after an action', () => {
    let s = initialState(5);
    s = applyAction(s, 'accept', 5);
    expect(formatProgress(s, 5)).toBe('2 / 5');
  });

  it('clamps to N / N when done', () => {
    let s = initialState(1);
    s = applyAction(s, 'accept', 1);
    expect(formatProgress(s, 1)).toBe('1 / 1');
  });
});

// =============================================================================
// formatTallies
// =============================================================================

describe('formatTallies', () => {
  it('starts at zero for all', () => {
    const s = initialState(3);
    expect(formatTallies(s)).toContain('✓ 0');
    expect(formatTallies(s)).toContain('~ 0');
    expect(formatTallies(s)).toContain('✗ 0');
  });

  it('reflects running counts', () => {
    let s = initialState(3);
    s = applyAction(s, 'accept', 3);
    s = applyAction(s, 'skip',   3);
    s = applyAction(s, 'reject', 3);
    expect(formatTallies(s)).toContain('✓ 1');
    expect(formatTallies(s)).toContain('~ 1');
    expect(formatTallies(s)).toContain('✗ 1');
  });
});

// =============================================================================
// formatEndSummary
// =============================================================================

describe('formatEndSummary', () => {
  it('lists accepted files when any were accepted', () => {
    let s = initialState(3);
    s = applyAction(s, 'accept', 3);
    s = applyAction(s, 'skip', 3);
    s = applyAction(s, 'skip', 3);
    const summary = resolveSummary(s, THREE);
    const lines = formatEndSummary(summary, 3);
    const text = lines.join('\n');
    expect(text).toContain('a.md');
    expect(text).toContain('→ will create GitHub Issues');
  });

  it('shows zeros when nothing was accepted', () => {
    let s = initialState(3);
    s = applyAction(s, 'skip', 3);
    s = applyAction(s, 'skip', 3);
    s = applyAction(s, 'skip', 3);
    const summary = resolveSummary(s, THREE);
    const lines = formatEndSummary(summary, 3);
    const text = lines.join('\n');
    expect(text).toContain('Accepted :  0');
    expect(text).not.toContain('→ will create GitHub Issues');
  });

  it('shows the total reviewed count', () => {
    const s = initialState(5);
    const summary = resolveSummary(s, []);
    const lines = formatEndSummary(summary, 5);
    expect(lines.join('\n')).toContain('5 suggestion(s)');
  });
});

/**
 * Pure session state machine for the Review command interactive mode.
 *
 * Separating logic from ink rendering keeps the state machine testable
 * without needing to render ink components in Jest.
 *
 * Session flow:
 *   [A]ccept  — queue suggestion for Issue creation
 *   [S]kip    — skip (do nothing)
 *   [R]eject  — mark explicitly as not worth acting on
 *
 * When `currentIndex >= suggestions.length`, the session is done.
 */

import { SuggestionWithContext } from './commands/review.js';

// ============================================================================
// TYPES
// ============================================================================

export type ReviewAction = 'accept' | 'skip' | 'reject';

export interface SessionState {
  /** Index into the suggestions array (0-based). Equals length when done. */
  currentIndex: number;
  /** Indices of suggestions the user accepted (will become Issues). */
  accepted: number[];
  /** Indices of suggestions the user skipped. */
  skipped: number[];
  /** Indices of suggestions the user explicitly rejected. */
  rejected: number[];
  /** True when currentIndex has advanced past the last suggestion. */
  done: boolean;
}

export interface SessionSummary {
  accepted: SuggestionWithContext[];
  skipped: SuggestionWithContext[];
  rejected: SuggestionWithContext[];
}

// ============================================================================
// STATE MACHINE
// ============================================================================

/**
 * Build the initial session state for a list of suggestions.
 */
export function initialState(count: number): SessionState {
  return {
    currentIndex: 0,
    accepted: [],
    skipped: [],
    rejected: [],
    done: count === 0,
  };
}

/**
 * Apply an action to the current state and return the next state.
 * Does not mutate the input state.
 */
export function applyAction(
  state: SessionState,
  action: ReviewAction,
  count: number,
): SessionState {
  if (state.done) return state;

  const { currentIndex } = state;
  const nextIndex = currentIndex + 1;
  const done = nextIndex >= count;

  return {
    currentIndex: nextIndex,
    accepted:  action === 'accept'  ? [...state.accepted,  currentIndex] : state.accepted,
    skipped:   action === 'skip'    ? [...state.skipped,   currentIndex] : state.skipped,
    rejected:  action === 'reject'  ? [...state.rejected,  currentIndex] : state.rejected,
    done,
  };
}

/**
 * Resolve the accepted/skipped/rejected indices back to full suggestion objects.
 */
export function resolveSummary(
  state: SessionState,
  suggestions: SuggestionWithContext[],
): SessionSummary {
  return {
    accepted:  state.accepted.map(i => suggestions[i]),
    skipped:   state.skipped.map(i  => suggestions[i]),
    rejected:  state.rejected.map(i => suggestions[i]),
  };
}

// ============================================================================
// FORMATTING HELPERS (chalk-free — used by ink component)
// ============================================================================

/**
 * Human-readable progress string, e.g. "2 / 7"
 */
export function formatProgress(state: SessionState, total: number): string {
  return `${Math.min(state.currentIndex + 1, total)} / ${total}`;
}

/**
 * Compact tallies for the footer bar, e.g. "✓ 2  ~ 1  ✗ 0"
 */
export function formatTallies(state: SessionState): string {
  return `✓ ${state.accepted.length}  ~ ${state.skipped.length}  ✗ ${state.rejected.length}`;
}

/**
 * End-of-session summary lines (plain text for chalk display or ink).
 */
export function formatEndSummary(summary: SessionSummary, totalSuggestions: number): string[] {
  const { accepted, skipped, rejected } = summary;
  const lines: string[] = [
    '',
    '── Review complete ──────────────────────────────────────────────────────',
    '',
    `  Reviewed ${totalSuggestions} suggestion(s)`,
    `  [A] Accepted :  ${accepted.length}${accepted.length > 0 ? '  → will create GitHub Issues' : ''}`,
    `  [S] Skipped  :  ${skipped.length}`,
    `  [R] Rejected :  ${rejected.length}`,
    '',
  ];

  if (accepted.length > 0) {
    lines.push('  Accepted suggestions:');
    for (const item of accepted) {
      lines.push(`    • [${item.file}] ${item.suggestion.sectionHeading}`);
    }
    lines.push('');
  }

  return lines;
}

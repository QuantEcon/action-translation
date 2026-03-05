/**
 * Ink-based interactive review session component.
 *
 * Renders the current suggestion as a chalk-styled card,
 * listens for [A]ccept / [S]kip / [R]eject keypresses,
 * and exits when all suggestions have been reviewed.
 *
 * Architecture: this component is intentionally thin — all session
 * state logic lives in `review-session.ts` for testability.
 */

import React, { useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { SuggestionWithContext } from '../commands/review.js';
import {
  initialState,
  applyAction,
  resolveSummary,
  formatProgress,
  formatTallies,
  SessionSummary,
} from '../review-session.js';
import { formatSuggestionCard } from '../review-formatter.js';

// ============================================================================
// PROPS
// ============================================================================

export interface ReviewSessionProps {
  suggestions: SuggestionWithContext[];
  /** When true the session runs identically but Issue creation is skipped at the end. */
  dryRun?: boolean;
  /**
   * Called when the session ends (all suggestions reviewed).
   * Receives the full session summary.
   */
  onDone: (summary: SessionSummary) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ReviewSession({ suggestions, dryRun = false, onDone }: ReviewSessionProps): React.ReactElement {
  const { exit } = useApp();
  const [state, setState] = useState(() => initialState(suggestions.length));

  useInput((input, key) => {
    if (state.done) return;

    const lower = input.toLowerCase();
    if (lower === 'a' || lower === 's' || lower === 'r') {
      const action = lower === 'a' ? 'accept' : lower === 's' ? 'skip' : 'reject';
      const next = applyAction(state, action, suggestions.length);
      setState(next);

      if (next.done) {
        const summary = resolveSummary(next, suggestions);
        onDone(summary);
        exit();
      }
    } else if (key.ctrl && input === 'c') {
      // Intentionally do NOT call onDone — abort means "do nothing".
      // sessionSummary stays null in runReview, so no Issues are created.
      process.stdout.write('\n  Session interrupted.\n');
      exit();
    }
  });

  if (state.done) {
    return <Text color="green">✅  Review complete.</Text>;
  }

  const current = suggestions[state.currentIndex];
  const cardText = formatSuggestionCard(current, state.currentIndex + 1, suggestions.length);

  return (
    <Box flexDirection="column">
      {/* Suggestion card */}
      <Text>{cardText}</Text>

      {/* Controls bar */}
      <Box marginTop={1} paddingX={2}>
        <Text dimColor>
          {formatProgress(state, suggestions.length)}
          {'   '}
          {formatTallies(state)}
          {'   '}
        </Text>
        <Text>
          <Text color="green">[A]</Text>
          <Text dimColor>ccept  </Text>
          <Text color="yellow">[S]</Text>
          <Text dimColor>kip  </Text>
          <Text color="red">[R]</Text>
          <Text dimColor>eject  </Text>
          <Text dimColor>Ctrl+C to abort</Text>
        </Text>
      </Box>
    </Box>
  );
}

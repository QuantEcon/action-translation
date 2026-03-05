/**
 * Chalk-styled formatters for the `review` command.
 *
 * Provides the suggestion card renderer used by both the ink interactive
 * session and any future non-interactive output.
 *
 * All functions are pure (return strings, no console.log side effects)
 * so they can be unit-tested without mocking stdout.
 *
 * Design decisions:
 * - Category badges use colour + letter prefix, not emoji, for terminal compat
 * - Long text (reasoning, specific changes) is wrapped at 80 chars
 * - Works at chalk.level=0 (plain text) so tests don't need colour stripping
 */

import chalk from 'chalk';
import { BackportSuggestionData } from './schema.js';
import { SuggestionWithContext, LoadStats } from './commands/review.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const CARD_WIDTH = 72;
const INDENT = '  ';
const DIVIDER = chalk.dim('─'.repeat(CARD_WIDTH));

// ============================================================================
// CATEGORY STYLING
// ============================================================================

export type CategoryStyle = {
  label: string;
  badge: (text: string) => string;
};

export const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  BUG_FIX:         { label: 'BUG FIX',         badge: (t) => chalk.bold.red(t) },
  CLARIFICATION:   { label: 'CLARIFICATION',   badge: (t) => chalk.bold.blue(t) },
  EXAMPLE:         { label: 'EXAMPLE',          badge: (t) => chalk.bold.green(t) },
  CODE_IMPROVEMENT:{ label: 'CODE IMPROVEMENT', badge: (t) => chalk.bold.yellow(t) },
  I18N_ONLY:       { label: 'I18N ONLY',        badge: (t) => chalk.dim(t) },
  NO_CHANGE:       { label: 'NO CHANGE',        badge: (t) => chalk.dim(t) },
};

function categoryBadge(category: string): string {
  const style = CATEGORY_STYLES[category] ?? { label: category, badge: (t: string) => t };
  return style.badge(`[${style.label}]`);
}

// ============================================================================
// CONFIDENCE STYLING
// ============================================================================

export type ConfidenceTier = 'high' | 'medium' | 'low';

export function confidenceTier(confidence: number): ConfidenceTier {
  if (confidence >= 0.85) return 'high';
  if (confidence >= 0.60) return 'medium';
  return 'low';
}

export function formatConfidence(confidence: number): string {
  const pct = (confidence * 100).toFixed(0) + '%';
  const tier = confidenceTier(confidence);
  if (tier === 'high')   return chalk.green(`${pct} (high)`);
  if (tier === 'medium') return chalk.yellow(`${pct} (medium)`);
  return chalk.dim(`${pct} (low)`);
}

// ============================================================================
// TEXT WRAPPING
// ============================================================================

/**
 * Wrap a string at `width` characters, adding `prefix` to every line.
 * Preserves existing newlines.
 */
export function wrapText(text: string, width: number, prefix: string): string {
  return text
    .split('\n')
    .map(paragraph => {
      if (paragraph.length === 0) return prefix;
      const words = paragraph.split(' ');
      const lines: string[] = [];
      let current = '';
      for (const word of words) {
        if (current.length === 0) {
          current = word;
        } else if (prefix.length + current.length + 1 + word.length <= width) {
          current += ' ' + word;
        } else {
          lines.push(prefix + current);
          current = word;
        }
      }
      if (current.length > 0) lines.push(prefix + current);
      return lines.join('\n');
    })
    .join('\n');
}

// ============================================================================
// SUGGESTION CARD
// ============================================================================

/**
 * Format a single suggestion as a chalk-styled card.
 *
 * @param item    The suggestion with its file context
 * @param index   1-based position in the session (for "[1/N]" header)
 * @param total   Total suggestion count in the session
 * @param options.showReasoning  Whether to show the reasoning section (default: false)
 */
export function formatSuggestionCard(
  item: SuggestionWithContext,
  index: number,
  total: number,
  options: { showReasoning?: boolean } = {},
): string {
  const { showReasoning = false } = options;
  const { file, suggestion } = item;
  const lines: string[] = [];

  // ── Header ────────────────────────────────────────────────────────────────
  const counter = chalk.dim(`[${index}/${total}]`);
  const filename = chalk.bold.white(file);
  const heading  = chalk.cyan(suggestion.sectionHeading);
  lines.push('');
  lines.push(DIVIDER);
  lines.push(`${INDENT}${counter} ${filename}  ${heading}`);
  lines.push(DIVIDER);
  lines.push('');

  // ── Category + Confidence ─────────────────────────────────────────────────
  const badge = categoryBadge(suggestion.category);
  const conf  = formatConfidence(suggestion.confidence);
  lines.push(`${INDENT}${badge}  ${conf}`);
  lines.push('');

  // ── Summary ───────────────────────────────────────────────────────────────
  lines.push(`${INDENT}${chalk.bold('Summary:')} ${suggestion.summary}`);
  lines.push('');

  // ── Specific Changes ──────────────────────────────────────────────────────
  if (suggestion.specificChanges.length > 0) {
    lines.push(`${INDENT}${chalk.bold('Suggested change' + (suggestion.specificChanges.length > 1 ? 's' : '') + ':')}`);
    for (let i = 0; i < suggestion.specificChanges.length; i++) {
      const change = suggestion.specificChanges[i];
      const num = chalk.bold(`${i + 1}.`);
      lines.push(`${INDENT}  ${num} ${chalk.italic(change.type)}`);
      if (change.original) {
        lines.push(`${INDENT}     ${chalk.yellow('Before:')} ${change.original}`);
      }
      if (change.improved) {
        lines.push(`${INDENT}     ${chalk.green('After: ')} ${change.improved}`);
      }
      lines.push('');
    }
  }

  // ── Reasoning ─────────────────────────────────────────────────────────────
  if (showReasoning) {
    lines.push(`${INDENT}${chalk.bold('Reasoning:')}`);
    lines.push(wrapText(chalk.dim(suggestion.reasoning), CARD_WIDTH, INDENT + '  '));
    lines.push('');
  } else {
    lines.push(`${INDENT}${chalk.dim('Press [D] to show reasoning')}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// SESSION SUMMARY
// ============================================================================

export interface SummaryStats {
  total: number;
  byCategory: Record<string, number>;
  byTier: Record<ConfidenceTier, number>;
  filesWithSuggestions: number;
}

/**
 * Compute summary statistics from a flat suggestion list.
 */
export function computeSummaryStats(suggestions: SuggestionWithContext[]): SummaryStats {
  const byCategory: Record<string, number> = {};
  const byTier: Record<ConfidenceTier, number> = { high: 0, medium: 0, low: 0 };
  const filesSet = new Set<string>();

  for (const item of suggestions) {
    const { category, confidence } = item.suggestion;
    byCategory[category] = (byCategory[category] ?? 0) + 1;
    byTier[confidenceTier(confidence)]++;
    filesSet.add(item.file);
  }

  return {
    total: suggestions.length,
    byCategory,
    byTier,
    filesWithSuggestions: filesSet.size,
  };
}



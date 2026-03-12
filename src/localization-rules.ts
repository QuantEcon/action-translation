/**
 * Localization Rules — Language-specific instructions for code-cell localization
 *
 * Rules are injected as custom instructions into translation prompts,
 * instructing the LLM to localize specific elements within code cells
 * (which are normally preserved as-is).
 *
 * Two rules shipped:
 * - code-comments:  Translate comments inside code cells
 * - figure-labels:  Translate plot labels (title, xlabel, ylabel, legend)
 */

// ============================================================================
// TYPES
// ============================================================================

export interface LocalizationRule {
  id: string;
  label: string;
  description: string;
  /** Build language-specific prompt text for this rule */
  buildPrompt(targetLanguage: string): string;
}

/** All available rule IDs */
export type RuleId = 'code-comments' | 'figure-labels';

// ============================================================================
// RULE DEFINITIONS
// ============================================================================

const codeCommentsRule: LocalizationRule = {
  id: 'code-comments',
  label: 'Code Comments',
  description: 'Translate comments inside code cells to the target language',
  buildPrompt(targetLanguage: string): string {
    const example = getCommentExample(targetLanguage);
    return `**Localize code comments**: Translate Python comments (lines starting with #) inside code cells to ${targetLanguage}. Keep variable names, function names, and code unchanged — only translate the human-readable comment text.${example}`;
  },
};

const figureLabelsRule: LocalizationRule = {
  id: 'figure-labels',
  label: 'Figure Labels',
  description: 'Translate plot titles, axis labels, and legend entries',
  buildPrompt(targetLanguage: string): string {
    const example = getFigureLabelExample(targetLanguage);
    return `**Localize figure labels**: Translate user-visible strings in plotting calls — including plt.title(), plt.xlabel(), plt.ylabel(), plt.legend() labels, ax.set_title(), ax.set_xlabel(), ax.set_ylabel(), and label= keyword arguments. Keep code structure, variable names, and non-label strings unchanged.${example}`;
  },
};

// ============================================================================
// RULE REGISTRY
// ============================================================================

const RULES: Record<RuleId, LocalizationRule> = {
  'code-comments': codeCommentsRule,
  'figure-labels': figureLabelsRule,
};

/** All available rule IDs */
export const ALL_RULE_IDS: RuleId[] = Object.keys(RULES) as RuleId[];

/** Default rules (all ON) */
export const DEFAULT_RULES: RuleId[] = [...ALL_RULE_IDS];

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Parse a comma-separated rule string into validated rule IDs.
 * Accepts "none" to disable all rules.
 *
 * @throws Error if any rule ID is unrecognized
 */
export function parseLocalizationRules(input: string): RuleId[] {
  const trimmed = input.trim().toLowerCase();
  if (trimmed === 'none') return [];

  const ids = trimmed.split(',').map(s => s.trim()).filter(Boolean);
  const invalid = ids.filter(id => !RULES[id as RuleId]);
  if (invalid.length > 0) {
    throw new Error(
      `Unknown localization rule(s): ${invalid.join(', ')}. ` +
      `Available: ${ALL_RULE_IDS.join(', ')}, none`
    );
  }
  return ids as RuleId[];
}

/**
 * Build the combined custom-instructions prompt text for the given rules.
 * Returns empty string if no rules are active.
 */
export function buildLocalizationPrompt(rules: RuleId[], targetLanguage: string): string {
  if (rules.length === 0) return '';

  const parts = rules
    .map(id => RULES[id].buildPrompt(targetLanguage));

  return `\n## Code-Cell Localization\n\nThe following localization rules OVERRIDE the default "keep code as-is" rule for specific elements within code cells:\n\n${parts.map((p, i) => `${i + 1}. ${p}`).join('\n\n')}`;
}

// ============================================================================
// LANGUAGE-SPECIFIC EXAMPLES
// ============================================================================

function getCommentExample(targetLanguage: string): string {
  const examples: Record<string, string> = {
    'zh-cn': `
Example:
  Before: # Calculate the steady state
  After:  # 计算稳态`,
    'fa': `
Example:
  Before: # Calculate the steady state
  After:  # محاسبه حالت پایدار`,
  };
  return examples[targetLanguage] || '';
}

function getFigureLabelExample(targetLanguage: string): string {
  const examples: Record<string, string> = {
    'zh-cn': `
Example:
  Before: plt.title('Price Dynamics')
  After:  plt.title('价格动态')
  Before: ax.set_xlabel('Time')
  After:  ax.set_xlabel('时间')`,
    'fa': `
Example:
  Before: plt.title('Price Dynamics')
  After:  plt.title('دینامیک قیمت')
  Before: ax.set_xlabel('Time')
  After:  ax.set_xlabel('زمان')`,
  };
  return examples[targetLanguage] || '';
}

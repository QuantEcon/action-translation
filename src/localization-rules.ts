/**
 * Localization Rules — Language-specific instructions for code-cell localization
 *
 * Rules are injected as custom instructions into translation prompts,
 * instructing the LLM to localize specific elements within code cells
 * (which are normally preserved as-is).
 *
 * Three rules shipped:
 * - code-comments:       Translate comments inside code cells
 * - figure-labels:       Translate plot labels (title, xlabel, ylabel, legend)
 * - i18n-font-config:    Inject CJK/RTL font configuration into first matplotlib cell
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
export type RuleId = 'code-comments' | 'figure-labels' | 'i18n-font-config';

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

const i18nFontConfigRule: LocalizationRule = {
  id: 'i18n-font-config',
  label: 'Font Configuration',
  description: 'Inject font configuration for CJK/RTL scripts into first matplotlib code cell',
  buildPrompt(targetLanguage: string): string {
    const config = getFontConfigSnippet(targetLanguage);
    if (!config) return '';
    return `**Inject font configuration**: In the FIRST code cell that imports matplotlib, append the following lines immediately after the existing imports (before any other code). These lines ensure that ${targetLanguage} characters render correctly in plots. Add them even though they do not exist in the source document — this is intentional localization. Mark the added lines with a \`# i18n\` comment.

Lines to add:
\`\`\`python
${config}
\`\`\``;
  },
};

// ============================================================================
// RULE REGISTRY
// ============================================================================

const RULES: Record<RuleId, LocalizationRule> = {
  'code-comments': codeCommentsRule,
  'figure-labels': figureLabelsRule,
  'i18n-font-config': i18nFontConfigRule,
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
    .map(id => RULES[id].buildPrompt(targetLanguage))
    .filter(Boolean);

  if (parts.length === 0) return '';

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

// Font config snippets per language.
// IMPORTANT: The font path (_fonts/<file>) is hard-coded here and in the
// translated output. If you change the path or filename, update
// getFontRequirements() and docs/user/cli-reference.md to match.
function getFontConfigSnippet(targetLanguage: string): string {
  const snippets: Record<string, string> = {
    'zh-cn': `import matplotlib as mpl  # i18n
FONTPATH = "_fonts/SourceHanSerifSC-SemiBold.otf"  # i18n
mpl.font_manager.fontManager.addfont(FONTPATH)  # i18n
plt.rcParams['font.family'] = ['Source Han Serif SC']  # i18n`,
  };
  return snippets[targetLanguage] || '';
}

/**
 * Font requirements per language for i18n-font-config.
 * Callers (init command) use this to create _fonts/ and guide the user.
 */
export interface FontRequirement {
  filename: string;
  url: string;
  description: string;
}

export function getFontRequirements(targetLanguage: string): FontRequirement[] {
  const reqs: Record<string, FontRequirement[]> = {
    'zh-cn': [
      {
        filename: 'SourceHanSerifSC-SemiBold.otf',
        url: 'https://github.com/adobe-fonts/source-han-serif/releases',
        description: 'Source Han Serif SC (Simplified Chinese)',
      },
    ],
  };
  return reqs[targetLanguage] || [];
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

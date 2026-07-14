/**
 * Central Claude model configuration.
 *
 * `DEFAULT_CLAUDE_MODEL` is the single source of truth for the model used across
 * the GitHub Action (sync, review) and the CLI (init, backward, forward, ...).
 * To upgrade the model, change it here — the one place all defaults resolve to.
 *
 * NOTE: The `claude-model` input default in `action.yml` is a separate literal
 * (YAML cannot import this constant) and must be kept in sync manually.
 *
 * Anthropic does not publish a floating "sonnet-latest" alias; bare IDs like
 * `claude-sonnet-5` pin to a generation, which is intentional — new generations
 * can ship breaking API changes, so upgrades are a deliberate, tested bump here.
 */
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5';

/**
 * Recognized Claude model ID patterns.
 *
 * Used only for a non-fatal validation warning — an unrecognized model is still
 * passed through to the API. Add new aliases here as generations ship.
 */
export const VALID_MODEL_PATTERNS: RegExp[] = [
  /^claude-sonnet-5$/,              // claude-sonnet-5 (current-generation Sonnet)
  /^claude-opus-4-8$/,             // claude-opus-4-8 (current-generation Opus)
  /^claude-sonnet-4-6$/,           // claude-sonnet-4-6 (previous-generation Sonnet)
  /^claude-opus-4-6$/,             // claude-opus-4-6 (previous-generation Opus)
  /^claude-sonnet-4-5-\d{8}$/,     // claude-sonnet-4-5-20250929
  /^claude-opus-4-5-\d{8}$/,       // claude-opus-4-5-20251101
  /^claude-haiku-4-5-\d{8}$/,      // claude-haiku-4-5-20251001
  /^claude-3-5-sonnet-\d{8}$/,     // claude-3-5-sonnet-20241022
  /^claude-3-5-haiku-\d{8}$/,      // claude-3-5-haiku-20241022
  /^claude-3-opus-\d{8}$/,         // claude-3-opus-20240229
  /^claude-3-sonnet-\d{8}$/,       // claude-3-sonnet-20240229
  /^claude-3-haiku-\d{8}$/,        // claude-3-haiku-20240307
];

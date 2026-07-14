import type Anthropic from '@anthropic-ai/sdk';

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
 *
 * Backward compatibility: the released v0.15.0 pins `claude-sonnet-4-6`, so
 * anyone needing the previous model can pin the action to `@v0.15.0` or set the
 * `claude-model` input / `--model` flag explicitly. We therefore target current
 * models and keep a single, uniform thinking policy rather than per-model paths.
 */
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5';

/**
 * Output token budgets (`max_tokens`) per operation class.
 *
 * `max_tokens` caps thinking + output *combined*, but it is a ceiling, not a
 * charge — billing is on tokens actually generated, so generous caps cost
 * nothing until reached. Streamed paths (translation, review) can safely use
 * large caps; non-streamed CLI calls stay <= 16K to avoid SDK HTTP timeouts.
 *
 * Sized with headroom for Sonnet 5's tokenizer, which produces ~30% more tokens
 * than Sonnet 4.6 for the same text, so real content is not truncated.
 */
export const MAX_TOKENS = {
  /** Section-level translation (update / resync / new). Streamed. */
  section: 16384,
  /** Whole-document translation / resync (init, forward RESYNC). Streamed. */
  fullDocument: 64000,
  /** Quality / diff review verdicts. Streamed. */
  review: 8192,
  /** Analytical CLI judgments (backward eval, forward triage, doc compare). Non-streamed. */
  analysis: 8192,
} as const;

/**
 * Thinking policy applied to every Claude call.
 *
 * Thinking is DISABLED tool-wide. Sonnet 5 runs adaptive thinking by default,
 * which would (a) bill thinking tokens on every bulk translation and (b) place
 * a thinking block first in the response — breaking the `content[0]` text
 * extraction in translator.ts / reviewer.ts. Disabling restores the proven
 * Sonnet 4.6 behavior (which also ran thinking-off) and cost profile on a
 * stronger base model. One uniform value is valid on both Sonnet 5 and 4.6, so
 * no per-model branching is needed.
 *
 * Future quality lever: the review path is low-volume and judgment-heavy — a
 * candidate to switch to `{ type: 'adaptive' }`. That also requires reading the
 * text via a `.filter(b => b.type === 'text')` scan instead of `content[0]`.
 */
export const DEFAULT_THINKING: Anthropic.ThinkingConfigParam = { type: 'disabled' };

/**
 * Recognized Claude model ID patterns.
 *
 * Used only for a non-fatal validation warning — an unrecognized model is still
 * passed through to the API. Add new aliases here as generations ship.
 */
export const VALID_MODEL_PATTERNS: RegExp[] = [
  /^claude-sonnet-5$/,              // claude-sonnet-5 (current-generation Sonnet)
  /^claude-opus-4-8$/,             // claude-opus-4-8 (current-generation Opus)
  /^claude-opus-4-7$/,             // claude-opus-4-7 (current-generation Opus)
  /^claude-haiku-4-5$/,            // claude-haiku-4-5 (current-generation Haiku, bare alias)
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

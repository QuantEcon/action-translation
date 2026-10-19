import type Anthropic from '@anthropic-ai/sdk';
import { APIConnectionError, APIError, RateLimitError } from '@anthropic-ai/sdk';

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
 * Request settings that differ by model — thinking, effort, output caps — come
 * from one table (`requestPolicyFor` below), never from the call sites:
 * Sonnet 5.5, Opus 5.5 and Fable reject the disabled thinking that older models
 * are sent, so no single value is valid for every supported model.
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
 *
 * These are the request caps for models that do not think; a model that always
 * thinks is sent `ALWAYS_THINKING_MAX_TOKENS` instead (see `maxTokensFor`).
 * `fullDocument` is also `checkDocumentSize`'s admission budget, for every model.
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

/** An operation class: 'section' | 'fullDocument' | 'review' | 'analysis'. */
export type OperationClass = keyof typeof MAX_TOKENS;

/** An `output_config.effort` level, as the SDK types it. */
export type EffortLevel = NonNullable<Anthropic.OutputConfig['effort']>;

/**
 * Request caps for models whose thinking is always on (`alwaysThinks`).
 *
 * Thinking shares `max_tokens` with the visible output, so each cap leaves room
 * above `MAX_TOKENS` for it. Streamed paths pay only for tokens generated, but a
 * cap still reserves output-token rate limit, so these are not free to inflate.
 * `fullDocument` is the 128K model maximum. `analysis` is non-streamed and must
 * stay <= 21,333: above that the SDK refuses a non-streamed request client-side
 * (D-2026-07-24-tech-debt-audit-boundaries).
 */
export const ALWAYS_THINKING_MAX_TOKENS: Readonly<Record<OperationClass, number>> = {
  section: 32768,
  fullDocument: 128000,
  review: 32768,
  analysis: 16384,
};

/**
 * How every request to one model is shaped: the `thinking` it is sent, its
 * `output_config.effort` per operation class, and whether thinking is always on
 * (then `maxTokensFor` gives the request cap room for it). Resolve one with
 * `requestPolicyFor`; spread its fields with `modelRequestParams`.
 */
export interface ModelRequestPolicy {
  /** Short label for logs/reports, e.g. 'thinking-disabled'. */
  readonly label: string;
  /** Sent as `thinking`; undefined = field omitted (API default). */
  readonly thinking?: Anthropic.ThinkingConfigParam;
  /** Sent as `output_config.effort` per operation; undefined = field omitted. */
  readonly effort?: Readonly<Record<OperationClass, EffortLevel>>;
  /** Thinking is always on and counts toward max_tokens → request caps get headroom. */
  readonly alwaysThinks: boolean;
}

/**
 * Thinking off: every recognized model without its own table entry, and exactly
 * the request the action has always sent. Off is a settled decision on Sonnet 5,
 * not a hold — adaptive thinking self-regulated to ~zero on translation (+24–32
 * output tokens even at effort `high`) with no quality signal
 * (D-2026-07-14-thinking-off-sonnet5; experiments/thinking-sonnet5/REPORT.md).
 */
const THINKING_DISABLED: ModelRequestPolicy = {
  label: 'thinking-disabled',
  thinking: { type: 'disabled' },
  alwaysThinks: false,
};

/**
 * Sonnet 5.5 rejects `disabled` (400). `between_tools` is its lowest setting —
 * no extended thinking — and is accepted only at effort `high` or below, with
 * no other field inside `thinking`. `high` is also its (recalibrated) default.
 */
const BETWEEN_TOOLS_HIGH: ModelRequestPolicy = {
  label: 'between-tools/high',
  thinking: { type: 'between_tools' },
  effort: { section: 'high', fullDocument: 'high', review: 'high', analysis: 'high' },
  alwaysThinks: false,
};

/**
 * Opus 5.5 and Fable always think: `disabled` is a 400 (on Opus 5.5 at every
 * effort) and `adaptive` is equivalent to omitting the field. A response can
 * begin with thinking blocks, and thinking counts toward `max_tokens`. `medium`
 * is Opus 5.5's own default, pinned so that Fable (default `high`) matches it.
 */
const ADAPTIVE_MEDIUM: ModelRequestPolicy = {
  label: 'adaptive/medium',
  thinking: { type: 'adaptive' },
  effort: { section: 'medium', fullDocument: 'medium', review: 'medium', analysis: 'medium' },
  alwaysThinks: true,
};

/**
 * An ID `VALID_MODEL_PATTERNS` does not recognize: send neither field. The API's
 * defaults are always valid for the model; an unknown future model may reject
 * `disabled`, as Sonnet 5.5, Opus 5.5 and Fable do. (Haiku 5.5 accepts it at
 * effort `high` or below, its default `medium` included, so it is recognized
 * with no table entry and keeps thinking disabled.)
 *
 * The trade-off: most current models think when `thinking` is omitted, and an
 * unrecognized ID keeps the `MAX_TOKENS` caps, which have no headroom for that
 * thinking. `alwaysThinks` stays false all the same: an unrecognized older ID
 * with a 64K output limit (a bare `claude-sonnet-4-5` or `claude-opus-4-5`)
 * would get a 400 at the 128,000 full-document cap.
 */
const API_DEFAULTS: ModelRequestPolicy = {
  label: 'api-defaults',
  alwaysThinks: false,
};

/**
 * Exact-ID policies: the recognized models that reject `disabled` thinking.
 * Every other recognized ID is sent thinking disabled; an unrecognized ID gets
 * the API's defaults (`requestPolicyFor`).
 */
export const MODEL_REQUEST_POLICIES: Readonly<Record<string, ModelRequestPolicy>> = {
  'claude-sonnet-5-5': BETWEEN_TOOLS_HIGH,
  'claude-opus-5-5': ADAPTIVE_MEDIUM,
  'claude-fable-5': ADAPTIVE_MEDIUM,
  'claude-fable-5-1': ADAPTIVE_MEDIUM,
};

/**
 * Recognized Claude model ID patterns.
 *
 * An unrecognized model is still passed through to the API, with a non-fatal
 * validation warning (inputs.ts) and the API's default request settings. A
 * recognized ID is sent `thinking: {type: 'disabled'}` unless
 * `MODEL_REQUEST_POLICIES` has an exact entry for it — so adding a model that
 * rejects `disabled` (as Sonnet 5.5, Opus 5.5 and Fable do) needs its policy
 * entry in the same change. models.test.ts pins this list to force that call.
 */
export const VALID_MODEL_PATTERNS: RegExp[] = [
  /^claude-sonnet-5-5$/, // claude-sonnet-5-5 (current-generation Sonnet)
  /^claude-opus-5-5$/, // claude-opus-5-5 (current-generation Opus)
  /^claude-fable-5-1$/, // claude-fable-5-1 (current Fable, highest-capability tier)
  /^claude-haiku-5-5$/, // claude-haiku-5-5 (current-generation Haiku; accepts thinking disabled at effort <= high, so no table entry)
  /^claude-fable-5$/, // claude-fable-5 (previous-generation Fable)
  /^claude-opus-5$/, // claude-opus-5 (previous-generation Opus) — absent until #230: priced at $0.000 by the glossary scripts while passing validation nowhere
  /^claude-sonnet-5$/, // claude-sonnet-5 (previous-generation Sonnet; still DEFAULT_CLAUDE_MODEL)
  /^claude-opus-4-8$/, // claude-opus-4-8 (previous-generation Opus)
  /^claude-opus-4-7$/, // claude-opus-4-7 (previous-generation Opus)
  /^claude-haiku-4-5$/, // claude-haiku-4-5 (previous-generation Haiku, bare alias)
  /^claude-sonnet-4-6$/, // claude-sonnet-4-6 (previous-generation Sonnet)
  /^claude-opus-4-6$/, // claude-opus-4-6 (previous-generation Opus)
  /^claude-sonnet-4-5-\d{8}$/, // claude-sonnet-4-5-20250929
  /^claude-opus-4-5-\d{8}$/, // claude-opus-4-5-20251101
  /^claude-haiku-4-5-\d{8}$/, // claude-haiku-4-5-20251001
  /^claude-3-5-sonnet-\d{8}$/, // claude-3-5-sonnet-20241022
  /^claude-3-5-haiku-\d{8}$/, // claude-3-5-haiku-20241022
  /^claude-3-opus-\d{8}$/, // claude-3-opus-20240229
  /^claude-3-sonnet-\d{8}$/, // claude-3-sonnet-20240229
  /^claude-3-haiku-\d{8}$/, // claude-3-haiku-20240307
];

/** True when one of `VALID_MODEL_PATTERNS` matches the model ID. */
export function isRecognizedModel(model: string): boolean {
  return VALID_MODEL_PATTERNS.some((pattern) => pattern.test(model));
}

/**
 * The request policy for a model ID: its exact `MODEL_REQUEST_POLICIES` entry;
 * else thinking disabled when the ID is recognized; else the API's defaults.
 */
export function requestPolicyFor(model: string): ModelRequestPolicy {
  // Own properties only: a bare index would resolve 'toString' or 'constructor'
  // up the prototype chain.
  if (Object.hasOwn(MODEL_REQUEST_POLICIES, model)) {
    return MODEL_REQUEST_POLICIES[model];
  }
  return isRecognizedModel(model) ? THINKING_DISABLED : API_DEFAULTS;
}

/**
 * The model-specific fields of one request, to spread into it:
 * `{ model, max_tokens, ...modelRequestParams(model, operation), messages }`.
 * Only the keys the policy sets are present (never an `undefined` value), so a
 * thinking-disabled model's request is byte-identical to what it always was.
 */
export function modelRequestParams(
  model: string,
  operation: OperationClass
): { thinking?: Anthropic.ThinkingConfigParam; output_config?: { effort: EffortLevel } } {
  assertOperationClass(operation);
  const policy = requestPolicyFor(model);
  const params: ReturnType<typeof modelRequestParams> = {};
  if (policy.thinking) {
    // A copy: the policy objects are shared by every request.
    params.thinking = { ...policy.thinking };
  }
  if (policy.effort) {
    params.output_config = { effort: policy.effort[operation] };
  }
  return params;
}

/**
 * The `max_tokens` cap for one request: `ALWAYS_THINKING_MAX_TOKENS` for a model
 * whose thinking is always on, `MAX_TOKENS` for every other model.
 */
export function maxTokensFor(model: string, operation: OperationClass): number {
  assertOperationClass(operation);
  return requestPolicyFor(model).alwaysThinks
    ? ALWAYS_THINKING_MAX_TOKENS[operation]
    : MAX_TOKENS[operation];
}

/** A typo from an untyped caller (the glossary scripts import dist/) fails loudly. */
function assertOperationClass(operation: string): void {
  if (!Object.hasOwn(MAX_TOKENS, operation)) {
    throw new Error(
      `Unknown operation class '${operation}' (expected ${Object.keys(MAX_TOKENS).join(' | ')})`
    );
  }
}

/**
 * Model output hit the max_tokens cap and must not be interpreted — a cut-off
 * analysis JSON otherwise falls through the parsers and reads as a clean
 * verdict. Typed so retry loops can treat truncation as retryable (#163/F87):
 * it used to throw as a bare Error, which failed the isRetryable predicate and
 * discarded a whole file's paid analysis on the first occurrence.
 */
export class TruncatedResponseError extends Error {
  constructor(maxTokens: number, operation?: string) {
    super(
      `${operation ? `${operation}: ` : ''}Response truncated at max_tokens=${maxTokens}; refusing to interpret incomplete output`
    );
    this.name = 'TruncatedResponseError';
  }
}

/**
 * A model response that could not be parsed into the expected verdict shape.
 * Typed so the CLI retry loops can re-ask (the Action reviewer already retries
 * parse failures) — and so an unparseable analysis FAILS the file instead of
 * fabricating a benign work-skipping verdict indistinguishable from a clean
 * one (#165/F54: three parsers synthesized IN_SYNC/IDENTICAL/NO_BACKPORT
 * defaults on garbage).
 */
export class LlmResponseParseError extends Error {
  constructor(operation: string, responseText: string) {
    super(`${operation}: could not parse model response. Raw head: ${responseText.slice(0, 200)}`);
    this.name = 'LlmResponseParseError';
  }
}

/**
 * The model declined the request (`stop_reason: 'refusal'`, HTTP 200). Its
 * output is never used — a mid-stream refusal keeps partial text in `content` —
 * and the call is not retried: a refusal is not transient. `category` is the
 * `stop_details` classifier category (an open set: 'cyber', 'bio',
 * 'frontier_llm', ...), null when the API names none.
 */
export class ModelRefusalError extends Error {
  readonly operation: string;
  readonly category: string | null;
  readonly explanation: string | null;
  readonly partialChars: number;

  constructor(
    operation: string,
    category: string | null,
    explanation: string | null,
    partialChars: number
  ) {
    super(
      `${operation}: model refusal (stop_reason=refusal, category=${category ?? 'none'}) — the model declined the request; its output was discarded${partialChars ? ` (${partialChars} chars of partial output)` : ''}${explanation ? `: ${explanation.slice(0, 200)}` : ''}`
    );
    this.name = 'ModelRefusalError';
    this.operation = operation;
    this.category = category;
    this.explanation = explanation;
    this.partialChars = partialChars;
  }
}

/**
 * A stop reason no call here can interpret: `model_context_window_exceeded`, or
 * `stop_sequence` / `tool_use` / `pause_turn`, which no request here asks for.
 */
export class UnexpectedStopReasonError extends Error {
  readonly operation: string;
  readonly stopReason: string | null;

  constructor(operation: string, stopReason: string | null) {
    super(
      `${operation}: unexpected stop_reason=${stopReason ?? 'null'}; refusing to interpret the response`
    );
    this.name = 'UnexpectedStopReasonError';
    this.operation = operation;
    this.stopReason = stopReason;
  }
}

/**
 * A response's text: every `text` block, joined with ''. Never only the first
 * content block — a model that always thinks puts thinking blocks first — and
 * never the SDK's `finalText()`, which joins blocks with ' '.
 */
export function extractResponseText(message: Pick<Anthropic.Message, 'content'>): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

/**
 * Throw unless the response ended naturally (`end_turn`), the only stop whose
 * content may be interpreted. Call it after counting the response's usage:
 * refused and truncated attempts are billed too.
 *
 * - `max_tokens` → TruncatedResponseError (the CLI analysis loops retry it)
 * - `refusal` → ModelRefusalError, carrying the `stop_details` category
 * - anything else, a missing stop reason included → UnexpectedStopReasonError
 */
export function assertCompleteResponse(
  message: Pick<Anthropic.Message, 'content' | 'stop_reason' | 'stop_details'>,
  operation: string,
  maxTokens: number
): void {
  switch (message.stop_reason) {
    case 'end_turn':
      return;
    case 'max_tokens':
      throw new TruncatedResponseError(maxTokens, operation);
    case 'refusal':
      throw new ModelRefusalError(
        operation,
        message.stop_details?.category ?? null,
        message.stop_details?.explanation ?? null,
        extractResponseText(message).length
      );
    default:
      throw new UnexpectedStopReasonError(operation, message.stop_reason ?? null);
  }
}

/** Accumulated API usage across every call an instance makes, retries included. */
export interface ApiUsage {
  /** Uncached input tokens billed at the full input rate. Total prompt size is
   * inputTokens + cacheCreationInputTokens + cacheReadInputTokens (#292). */
  inputTokens: number;
  outputTokens: number;
  /** Output tokens spent thinking (`output_tokens_details.thinking_tokens`).
   * Already inside outputTokens, which stays the billed total; counted apart
   * so a model's thinking overhead can be measured. 0 when the API sends no
   * breakdown. */
  thinkingTokens: number;
  /** Tokens written to the prompt cache (billed at 1.25× the input rate). */
  cacheCreationInputTokens: number;
  /** Tokens served from the prompt cache (billed at ~0.1× the input rate).
   * Zero across a whole run means the cacheable prefix is broken (#292). */
  cacheReadInputTokens: number;
  apiCalls: number;
}

/** A zeroed usage accumulator. */
export function emptyApiUsage(): ApiUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    apiCalls: 0,
  };
}

/**
 * Accumulate one response's usage block into an ApiUsage counter.
 * The cache fields and the output breakdown are optional on the wire — absent
 * means no caching, and no thinking reported.
 */
export function addUsage(
  usage: ApiUsage,
  responseUsage: {
    input_tokens: number;
    output_tokens: number;
    output_tokens_details?: { thinking_tokens: number } | null;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  }
): void {
  usage.inputTokens += responseUsage.input_tokens;
  usage.outputTokens += responseUsage.output_tokens;
  usage.thinkingTokens += responseUsage.output_tokens_details?.thinking_tokens ?? 0;
  usage.cacheCreationInputTokens += responseUsage.cache_creation_input_tokens ?? 0;
  usage.cacheReadInputTokens += responseUsage.cache_read_input_tokens ?? 0;
  usage.apiCalls += 1;
}

/**
 * The one transport-retry predicate for every Anthropic call site (#164/F78).
 *
 * Commit 40d63ef added the `overloaded_error` branch (an APIError with
 * status === undefined on the streamed transport) to translator.ts only; the
 * other five hand-copies never got it, so an overload at the reviewer's
 * streamed calls aborted the whole review. One owner means the next hardening
 * fix lands once. Deliberately excluded: AuthenticationError and
 * BadRequestError (callers throw those before consulting this), and
 * TruncatedResponseError — retrying truncation makes sense for the CLI's
 * bounded JSON-analysis calls, which OR it in locally, but not for the
 * full-document translation and review calls, where a rerun at the same cap
 * cannot fit. ModelRefusalError and UnexpectedStopReasonError are not
 * APIErrors, so no call site retries them: a refusal is not transient.
 */
export function isRetryableAnthropicError(error: unknown): boolean {
  return (
    error instanceof RateLimitError ||
    error instanceof APIConnectionError ||
    (error instanceof APIError &&
      ((error.status !== undefined && error.status >= 500) ||
        (error.status === undefined && error.message?.includes('overloaded'))))
  );
}

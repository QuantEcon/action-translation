/**
 * Per-model request policy and response checks (models.ts) — #342, #334.
 *
 * Sonnet 5.5, Opus 5.5 and Fable reject the `thinking: {type: 'disabled'}`
 * that every call used to send, so each model ID now resolves to a request
 * policy. These pure-function tests pin the request fields per model and
 * operation, the max_tokens caps, the invariants that keep a model from being
 * sent a setting it rejects, and the stop-reason / text checks every call site
 * runs before it interprets a response.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  ALWAYS_THINKING_MAX_TOKENS,
  MAX_TOKENS,
  MODEL_REQUEST_POLICIES,
  ModelRefusalError,
  OperationClass,
  TruncatedResponseError,
  UnexpectedStopReasonError,
  VALID_MODEL_PATTERNS,
  assertCompleteResponse,
  extractResponseText,
  isRecognizedModel,
  isRetryableAnthropicError,
  maxTokensFor,
  modelRequestParams,
  requestPolicyFor,
} from '../models.js';

const OPERATIONS: OperationClass[] = ['section', 'fullDocument', 'review', 'analysis'];

/** Recognized IDs with no table entry: sent thinking disabled, exactly as before. */
const THINKING_DISABLED_MODELS = [
  'claude-sonnet-5',
  // Accepts disabled at effort high or below, its default medium included.
  'claude-haiku-5-5',
  'claude-opus-5',
  'claude-opus-4-8',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
  'claude-sonnet-4-5-20250929',
];
const ALWAYS_THINKING_MODELS = ['claude-opus-5-5', 'claude-fable-5', 'claude-fable-5-1'];
const UNRECOGNIZED_MODELS = ['test-model', 'claude-sonnet-6'];
const ALL_MODELS = [
  ...Object.keys(MODEL_REQUEST_POLICIES),
  ...THINKING_DISABLED_MODELS,
  ...UNRECOGNIZED_MODELS,
];

describe('modelRequestParams', () => {
  it.each(OPERATIONS)("claude-sonnet-5 (%s): exactly today's request — thinking disabled", (op) => {
    expect(modelRequestParams('claude-sonnet-5', op)).toStrictEqual({
      thinking: { type: 'disabled' },
    });
  });

  it.each(OPERATIONS)('claude-sonnet-5-5 (%s): between_tools at effort high', (op) => {
    const params = modelRequestParams('claude-sonnet-5-5', op);
    expect(params).toStrictEqual({
      thinking: { type: 'between_tools' },
      output_config: { effort: 'high' },
    });
    // between_tools takes no other field (display, budget_tokens, ... are a 400)
    expect(Object.keys(params.thinking ?? {})).toEqual(['type']);
  });

  describe.each(ALWAYS_THINKING_MODELS)('%s', (model) => {
    it.each(OPERATIONS)('%s: adaptive at effort medium', (op) => {
      expect(modelRequestParams(model, op)).toStrictEqual({
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
      });
    });
  });

  // claude-sonnet-5 is pinned on its own above
  describe.each(THINKING_DISABLED_MODELS.filter((model) => model !== 'claude-sonnet-5'))(
    '%s',
    (model) => {
      it.each(OPERATIONS)('%s: thinking disabled only, no output_config', (op) => {
        expect(modelRequestParams(model, op)).toStrictEqual({ thinking: { type: 'disabled' } });
      });
    }
  );

  describe.each(UNRECOGNIZED_MODELS)('unrecognized %s', (model) => {
    it.each(OPERATIONS)('%s: neither field — the API defaults', (op) => {
      expect(modelRequestParams(model, op)).toStrictEqual({});
    });
  });

  it('returns a fresh thinking object per call — the policy objects are shared', () => {
    const first = modelRequestParams('claude-sonnet-5', 'section');
    (first.thinking as { type: string }).type = 'adaptive';
    expect(modelRequestParams('claude-sonnet-5', 'section')).toStrictEqual({
      thinking: { type: 'disabled' },
    });
  });

  it('never resolves an ID up the prototype chain', () => {
    for (const model of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
      expect(requestPolicyFor(model).label).toBe('api-defaults');
      expect(modelRequestParams(model, 'section')).toStrictEqual({});
    }
  });

  it('throws on an operation class an untyped caller misspelled', () => {
    const typo = 'fullDoc' as OperationClass;
    expect(() => modelRequestParams('claude-opus-5-5', typo)).toThrow(
      "Unknown operation class 'fullDoc' (expected section | fullDocument | review | analysis)"
    );
    expect(() => maxTokensFor('claude-sonnet-5', typo)).toThrow(
      "Unknown operation class 'fullDoc'"
    );
    expect(() => maxTokensFor('claude-sonnet-5', 'toString' as OperationClass)).toThrow(
      'Unknown operation class'
    );
  });
});

describe('requestPolicyFor', () => {
  it.each([
    ['claude-sonnet-5', 'thinking-disabled', false],
    ['claude-haiku-4-5', 'thinking-disabled', false],
    ['claude-haiku-5-5', 'thinking-disabled', false],
    ['claude-sonnet-5-5', 'between-tools/high', false],
    ['claude-opus-5-5', 'adaptive/medium', true],
    ['claude-fable-5', 'adaptive/medium', true],
    ['claude-fable-5-1', 'adaptive/medium', true],
    ['test-model', 'api-defaults', false],
  ])('%s → %s (alwaysThinks: %s)', (model, label, alwaysThinks) => {
    const policy = requestPolicyFor(model);
    expect(policy.label).toBe(label);
    expect(policy.alwaysThinks).toBe(alwaysThinks);
  });
});

describe('maxTokensFor', () => {
  it.each([...THINKING_DISABLED_MODELS, 'claude-sonnet-5-5', ...UNRECOGNIZED_MODELS])(
    '%s keeps MAX_TOKENS',
    (model) => {
      for (const op of OPERATIONS) {
        expect(maxTokensFor(model, op)).toBe(MAX_TOKENS[op]);
      }
    }
  );

  it.each(ALWAYS_THINKING_MODELS)('%s gets ALWAYS_THINKING_MAX_TOKENS', (model) => {
    for (const op of OPERATIONS) {
      expect(maxTokensFor(model, op)).toBe(ALWAYS_THINKING_MAX_TOKENS[op]);
    }
  });

  it('pins the caps: today’s budgets, and room for thinking above them', () => {
    expect(MAX_TOKENS).toEqual({
      section: 16384,
      fullDocument: 64000,
      review: 8192,
      analysis: 8192,
    });
    expect(ALWAYS_THINKING_MAX_TOKENS).toEqual({
      section: 32768,
      fullDocument: 128000,
      review: 32768,
      analysis: 16384,
    });
    for (const op of OPERATIONS) {
      expect(ALWAYS_THINKING_MAX_TOKENS[op]).toBeGreaterThan(MAX_TOKENS[op]);
    }
  });

  it('every model: analysis <= 21,333 (non-streamed), every cap <= 128,000', () => {
    for (const model of ALL_MODELS) {
      expect(maxTokensFor(model, 'analysis')).toBeLessThanOrEqual(21333);
      for (const op of OPERATIONS) {
        expect(maxTokensFor(model, op)).toBeLessThanOrEqual(128000);
      }
    }
  });

  it('the SDK accepts every analysis cap as a non-streamed request', () => {
    // messages.create refuses client-side when a non-streamed request could
    // run past 10 minutes (max_tokens > 21,333) — the analysis calls are
    // non-streamed, so their caps must stay under the SDK's own guard.
    const client = new Anthropic({ apiKey: 'test-key' });
    for (const model of ALL_MODELS) {
      expect(() =>
        client.calculateNonstreamingTimeout(maxTokensFor(model, 'analysis'))
      ).not.toThrow();
    }
    expect(() => client.calculateNonstreamingTimeout(21334)).toThrow('Streaming is required');
  });
});

describe('policy invariants', () => {
  it('every MODEL_REQUEST_POLICIES key is a recognized model', () => {
    for (const model of Object.keys(MODEL_REQUEST_POLICIES)) {
      expect(isRecognizedModel(model)).toBe(true);
    }
  });

  it('between_tools is sent only to claude-sonnet-5-5, and only at effort low–high', () => {
    for (const model of ALL_MODELS) {
      for (const op of OPERATIONS) {
        const params = modelRequestParams(model, op);
        if (params.thinking?.type !== 'between_tools') continue;
        expect(model).toBe('claude-sonnet-5-5');
        expect(['low', 'medium', 'high']).toContain(params.output_config?.effort);
      }
    }
  });

  it('no policy whose thinking is always on sends disabled', () => {
    for (const policy of Object.values(MODEL_REQUEST_POLICIES)) {
      if (policy.alwaysThinks) {
        expect(policy.thinking?.type).not.toBe('disabled');
      }
    }
  });

  // The API returns a 400 for {type: 'disabled'} on each of these.
  it.each([
    'claude-sonnet-5-5',
    'claude-opus-5-5',
    'claude-fable-5',
    'claude-fable-5-1',
    'claude-mythos-5',
    'claude-mythos-5-1',
  ])('%s is never sent thinking disabled', (model) => {
    for (const op of OPERATIONS) {
      expect(modelRequestParams(model, op).thinking?.type).not.toBe('disabled');
    }
  });

  it('pins VALID_MODEL_PATTERNS — a new pattern must decide its request policy first', () => {
    // A recognized ID is sent thinking disabled unless MODEL_REQUEST_POLICIES
    // has an exact entry for it. Before extending this list, check whether the
    // new model accepts {type: 'disabled'}; if it does not, add its policy
    // entry in the same change, then update this list.
    expect(VALID_MODEL_PATTERNS.map((pattern) => pattern.source)).toEqual([
      '^claude-sonnet-5-5$',
      '^claude-opus-5-5$',
      '^claude-fable-5-1$',
      '^claude-haiku-5-5$',
      '^claude-fable-5$',
      '^claude-opus-5$',
      '^claude-sonnet-5$',
      '^claude-opus-4-8$',
      '^claude-opus-4-7$',
      '^claude-haiku-4-5$',
      '^claude-sonnet-4-6$',
      '^claude-opus-4-6$',
      '^claude-sonnet-4-5-\\d{8}$',
      '^claude-opus-4-5-\\d{8}$',
      '^claude-haiku-4-5-\\d{8}$',
      '^claude-3-5-sonnet-\\d{8}$',
      '^claude-3-5-haiku-\\d{8}$',
      '^claude-3-opus-\\d{8}$',
      '^claude-3-sonnet-\\d{8}$',
      '^claude-3-haiku-\\d{8}$',
    ]);
  });
});

// Typed like the SDK's own response blocks (TextBlock requires `citations`).
const text = (value: string): Anthropic.TextBlock => ({
  type: 'text',
  text: value,
  citations: null,
});
const thinking = (value: string): Anthropic.ThinkingBlock => ({
  type: 'thinking',
  thinking: value,
  signature: 'sig',
});

function response(
  content: Anthropic.ContentBlock[],
  stopReason: Anthropic.StopReason | null,
  stopDetails: Anthropic.RefusalStopDetails | null = null
): Pick<Anthropic.Message, 'content' | 'stop_reason' | 'stop_details'> {
  return { content, stop_reason: stopReason, stop_details: stopDetails };
}

/** Run the check and return what it threw (or undefined). */
function thrownBy(run: () => void): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('extractResponseText', () => {
  it('skips thinking blocks and joins every text block with no separator', () => {
    expect(
      extractResponseText(response([thinking(''), text('Hello, '), text('world')], 'end_turn'))
    ).toBe('Hello, world');
  });

  it('returns "" when there is no text block', () => {
    expect(extractResponseText(response([thinking('')], 'end_turn'))).toBe('');
    expect(extractResponseText(response([], 'end_turn'))).toBe('');
  });
});

describe('assertCompleteResponse', () => {
  it('returns on end_turn', () => {
    expect(() =>
      assertCompleteResponse(response([text('done')], 'end_turn'), 'op', 100)
    ).not.toThrow();
  });

  it('max_tokens → TruncatedResponseError naming the operation and the cap', () => {
    const error = thrownBy(() =>
      assertCompleteResponse(
        response([text('cut off')], 'max_tokens'),
        'translateFullDocument',
        64000
      )
    );
    expect(error).toBeInstanceOf(TruncatedResponseError);
    expect((error as Error).name).toBe('TruncatedResponseError');
    expect((error as Error).message).toBe(
      'translateFullDocument: Response truncated at max_tokens=64000; refusing to interpret incomplete output'
    );
    expect((error as Error).message).toContain('truncated at max_tokens');
  });

  it('TruncatedResponseError keeps its old message when no operation is given', () => {
    expect(new TruncatedResponseError(8192).message).toBe(
      'Response truncated at max_tokens=8192; refusing to interpret incomplete output'
    );
  });

  it('refusal with stop_details → ModelRefusalError carrying category, explanation, partial length', () => {
    const error = thrownBy(() =>
      assertCompleteResponse(
        response([thinking(''), text('Partial…')], 'refusal', {
          type: 'refusal',
          category: 'frontier_llm',
          explanation: 'Declined.',
        }),
        'translateSectionUpdate',
        16384
      )
    );
    expect(error).toBeInstanceOf(ModelRefusalError);
    const refusal = error as ModelRefusalError;
    expect(refusal.name).toBe('ModelRefusalError');
    expect(refusal.operation).toBe('translateSectionUpdate');
    expect(refusal.category).toBe('frontier_llm');
    expect(refusal.explanation).toBe('Declined.');
    expect(refusal.partialChars).toBe(8);
    expect(refusal.message).toBe(
      'translateSectionUpdate: model refusal (stop_reason=refusal, category=frontier_llm) — the model declined the request; its output was discarded (8 chars of partial output): Declined.'
    );
  });

  it('refusal without stop_details → category none, no partial output', () => {
    const error = thrownBy(() =>
      assertCompleteResponse(response([], 'refusal'), 'evaluateDiff', 8192)
    );
    expect(error).toBeInstanceOf(ModelRefusalError);
    const refusal = error as ModelRefusalError;
    expect(refusal.category).toBeNull();
    expect(refusal.explanation).toBeNull();
    expect(refusal.partialChars).toBe(0);
    expect(refusal.message).toBe(
      'evaluateDiff: model refusal (stop_reason=refusal, category=none) — the model declined the request; its output was discarded'
    );
  });

  it('caps a long refusal explanation at 200 characters in the message', () => {
    const error = thrownBy(() =>
      assertCompleteResponse(
        response([], 'refusal', { type: 'refusal', category: null, explanation: 'x'.repeat(500) }),
        'op',
        1
      )
    ) as ModelRefusalError;
    expect(error.explanation).toHaveLength(500);
    expect(error.message.endsWith(`: ${'x'.repeat(200)}`)).toBe(true);
  });

  it.each(['model_context_window_exceeded', 'stop_sequence', 'tool_use', 'pause_turn'] as const)(
    '%s → UnexpectedStopReasonError',
    (stopReason) => {
      const error = thrownBy(() =>
        assertCompleteResponse(response([text('looks fine')], stopReason), 'triageForward', 8192)
      );
      expect(error).toBeInstanceOf(UnexpectedStopReasonError);
      expect((error as UnexpectedStopReasonError).stopReason).toBe(stopReason);
      expect((error as Error).message).toBe(
        `triageForward: unexpected stop_reason=${stopReason}; refusing to interpret the response`
      );
    }
  );

  it('a missing stop_reason → UnexpectedStopReasonError', () => {
    const error = thrownBy(() => assertCompleteResponse(response([text('?')], null), 'op', 1));
    expect(error).toBeInstanceOf(UnexpectedStopReasonError);
    expect((error as UnexpectedStopReasonError).stopReason).toBeNull();
    expect((error as Error).message).toBe(
      'op: unexpected stop_reason=null; refusing to interpret the response'
    );
  });

  it('none of the stop errors is a transport retry', () => {
    expect(isRetryableAnthropicError(new ModelRefusalError('op', 'cyber', null, 0))).toBe(false);
    expect(isRetryableAnthropicError(new UnexpectedStopReasonError('op', null))).toBe(false);
    expect(isRetryableAnthropicError(new TruncatedResponseError(1, 'op'))).toBe(false);
  });
});

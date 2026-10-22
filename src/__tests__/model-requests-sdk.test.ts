/**
 * The per-model request policy through the REAL Anthropic SDK (#342, #334).
 *
 * The other suites mock '@anthropic-ai/sdk' or stub the call, so they see at
 * most the params a call site hands to `messages.stream` / `create`: not the
 * HTTP body SDK 0.131 builds from them, nor the message its accumulator
 * reassembles from server-sent events. Here only `fetch` is fake
 * (test-support/fake-anthropic-api.ts), and the SDK builds, sends and parses
 * every request. That pins what goes over the wire per model (Sonnet 5's
 * request byte for byte as before, Sonnet 5.5's between_tools, Opus 5.5's
 * adaptive thinking and larger caps) and that what comes back reaches the
 * response checks intact: a leading thinking block, a refusal's stop_details.
 */

import { TranslationService, RETRY_CONFIG } from '../translator.js';
import { TranslationReviewer } from '../reviewer.js';
import { triageForward } from '../cli/forward-triage.js';
import { ModelRefusalError, TruncatedResponseError, maxTokensFor } from '../models.js';
import {
  FakeAnthropicApi,
  FakeContentBlock,
  FakeReply,
  RecordedRequest,
  installFakeAnthropicApi,
} from '../test-support/fake-anthropic-api.js';
import {
  FullDocumentTranslationRequest,
  SectionTranslationRequest,
  SectionTranslationResult,
} from '../types.js';

// What each request policy sends, for every operation class — written out
// here rather than read from models.ts, so the test does not grade itself.
const DISABLED = { thinking: { type: 'disabled' } };
const BETWEEN_TOOLS_HIGH = {
  thinking: { type: 'between_tools' },
  output_config: { effort: 'high' },
};
const ADAPTIVE_MEDIUM = { thinking: { type: 'adaptive' }, output_config: { effort: 'medium' } };
const API_DEFAULTS = {};

const NEW_ENGLISH =
  '## Supply\n\nThe supply curve slopes upward: price and quantity rise together.';
const TRANSLATION = '## 供给\n\n供给曲线向上倾斜：价格与数量同向上升。';

const SECTION_UPDATE: SectionTranslationRequest = {
  mode: 'update',
  sourceLanguage: 'en',
  targetLanguage: 'zh-cn',
  oldEnglish: '## Supply\n\nThe supply curve slopes upward.',
  newEnglish: NEW_ENGLISH,
  currentTranslation: '## 供给\n\n供给曲线向上倾斜。',
};

const FULL_DOCUMENT: FullDocumentTranslationRequest = {
  sourceLanguage: 'en',
  targetLanguage: 'zh-cn',
  content: `# Markets\n\n${NEW_ENGLISH}\n`,
};
const TRANSLATED_DOCUMENT = `# 市场\n\n${TRANSLATION}`;

const text = (value: string): FakeContentBlock => ({ type: 'text', text: value });
/** A thinking block: empty under the default display ('omitted'), as Opus 5.5 sends it. */
const thinking = (value = ''): FakeContentBlock => ({
  type: 'thinking',
  thinking: value,
  signature: 'sig-fake',
});
const endTurn = (...content: FakeContentBlock[]): FakeReply => ({
  content,
  stop_reason: 'end_turn',
});

let api: FakeAnthropicApi;
const BASE_DELAY_MS = RETRY_CONFIG.baseDelayMs;

beforeAll(() => {
  // triageForward retries a max_tokens stop with RETRY_CONFIG's backoff
  // (1 s, 2 s): no real sleeps in this suite.
  RETRY_CONFIG.baseDelayMs = 0;
});

afterAll(() => {
  RETRY_CONFIG.baseDelayMs = BASE_DELAY_MS;
});

beforeEach(() => {
  // Before any client exists: the SDK reads fetch in its constructor.
  api = installFakeAnthropicApi();
});

afterEach(() => {
  api.restore();
});

/** The one request the case made (fails on any other count). */
function onlyRequest(): RecordedRequest {
  expect(api.requests).toHaveLength(1);
  return api.requests[0];
}

/** The request-policy fields of a body: thinking and output_config, when sent. */
function policyOf(body: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(body).filter(([key]) => key === 'thinking' || key === 'output_config')
  );
}

/** What the promise rejected with; fails the case if it resolved. */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to reject');
}

interface PromptBlock {
  type: string;
  text: string;
  cache_control?: unknown;
}

/** The content blocks of the single user message a translator request sends. */
function promptBlocks(body: Readonly<Record<string, unknown>>): PromptBlock[] {
  const messages = body.messages as { role: string; content: PromptBlock[] }[];
  expect(messages).toHaveLength(1);
  expect(messages[0].role).toBe('user');
  return messages[0].content;
}

describe('translator (streamed): the request', () => {
  it.each([
    ['claude-sonnet-5', 16384, DISABLED],
    ['claude-sonnet-5-5', 16384, BETWEEN_TOOLS_HIGH],
    ['claude-opus-5-5', 32768, ADAPTIVE_MEDIUM],
    ['test-model', 16384, API_DEFAULTS],
  ])(
    'translateSection (update), %s: max_tokens %d and exactly its policy',
    async (model, maxTokens, fields) => {
      api.reply(endTurn(text(TRANSLATION)));

      const result = await new TranslationService('test-key', model).translateSection(
        SECTION_UPDATE
      );

      expect(result).toMatchObject({ success: true, translatedSection: TRANSLATION });
      const { method, url, headers, body } = onlyRequest();
      expect(method).toBe('POST');
      expect(url).toMatch(/\/v1\/messages$/);
      // Built by the real SDK, and with no beta header: server-side fallbacks stay off.
      expect(headers['user-agent']).toMatch(/^Anthropic\/JS /);
      expect(headers).not.toHaveProperty('anthropic-beta');
      // Exactly these keys, in this order: nothing else rides along (fallbacks,
      // sampling, tool_choice) and no field the policy leaves to the API.
      expect(Object.keys(body)).toEqual([
        'model',
        'max_tokens',
        'messages',
        ...Object.keys(fields),
        'stream',
      ]);
      expect(body.model).toBe(model);
      expect(body.max_tokens).toBe(maxTokens);
      expect(policyOf(body)).toStrictEqual(fields);
      expect(body.stream).toBe(true);

      // The prompt is untouched: the cache breakpoint is still on the stable
      // block, and the per-call block stays outside it (#292).
      const blocks = promptBlocks(body);
      expect(blocks).toHaveLength(2);
      expect(blocks[0].cache_control).toStrictEqual({ type: 'ephemeral' });
      expect(blocks[0].text).toContain('You are updating a translation');
      expect(blocks[0].text).not.toContain(NEW_ENGLISH);
      expect(blocks[1]).not.toHaveProperty('cache_control');
      expect(blocks[1].text).toContain(NEW_ENGLISH);
    }
  );

  it('claude-sonnet-5: byte for byte the request it always sent (#342)', async () => {
    api.reply(endTurn(text(TRANSLATION)));

    const result = await new TranslationService('test-key', 'claude-sonnet-5').translateSection(
      SECTION_UPDATE
    );

    expect(result).toMatchObject({ success: true, translatedSection: TRANSLATION });
    const { body, rawBody } = onlyRequest();
    expect(body).not.toHaveProperty('output_config');
    expect(body.thinking).toStrictEqual({ type: 'disabled' });
    // v0.29.5 sent `{ ...createParams, thinking: { type: 'disabled' } }`; the SDK appends stream.
    expect(rawBody).toBe(
      JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 16384,
        messages: body.messages,
        thinking: { type: 'disabled' },
        stream: true,
      })
    );
  });

  it.each([
    ['claude-sonnet-5', 64000, DISABLED],
    ['claude-sonnet-5-5', 64000, BETWEEN_TOOLS_HIGH],
    ['claude-opus-5-5', 128000, ADAPTIVE_MEDIUM],
  ])('translateFullDocument, %s: max_tokens %d', async (model, maxTokens, fields) => {
    api.reply(endTurn(text(TRANSLATED_DOCUMENT)));

    const result = await new TranslationService('test-key', model).translateFullDocument(
      FULL_DOCUMENT
    );

    expect(result).toMatchObject({ success: true, translatedSection: TRANSLATED_DOCUMENT });
    const { body } = onlyRequest();
    expect(body.max_tokens).toBe(maxTokens);
    expect(policyOf(body)).toStrictEqual(fields);
  });
});

describe('translator (streamed): what comes back', () => {
  it.each([
    ['empty (display omitted, the default)', ''],
    ['with text (streamed as a thinking_delta)', 'Keep 供给 for supply, per the glossary.'],
  ])(
    'claude-opus-5-5, a leading thinking block %s, then text: exactly the text',
    async (_label, thought) => {
      api.reply({
        content: [thinking(thought), text(TRANSLATION)],
        stop_reason: 'end_turn',
        usage: { input_tokens: 900, output_tokens: 300 },
      });

      const result = await new TranslationService('test-key', 'claude-opus-5-5').translateSection(
        SECTION_UPDATE
      );

      // tokensUsed is message_start's input plus message_delta's output: the
      // accumulator merged the streamed usage.
      expect(result).toEqual({ success: true, translatedSection: TRANSLATION, tokensUsed: 1200 });
      expect(api.requests).toHaveLength(1);
    }
  );

  /** Each of the five operations that read a reply, under the name its errors carry. */
  const TRANSLATOR_OPERATIONS: [
    string,
    (service: TranslationService) => Promise<SectionTranslationResult>,
  ][] = [
    ['translateSectionUpdate', (service) => service.translateSection(SECTION_UPDATE)],
    [
      'translateSectionResync',
      (service) =>
        service.translateSection({
          mode: 'resync',
          sourceLanguage: 'en',
          targetLanguage: 'zh-cn',
          newEnglish: NEW_ENGLISH,
          currentTranslation: SECTION_UPDATE.currentTranslation,
        }),
    ],
    [
      'translateNewSection',
      (service) =>
        service.translateSection({
          mode: 'new',
          sourceLanguage: 'en',
          targetLanguage: 'zh-cn',
          englishSection: NEW_ENGLISH,
        }),
    ],
    ['translateFullDocument', (service) => service.translateFullDocument(FULL_DOCUMENT)],
    [
      'translateDocumentResync',
      (service) =>
        service.translateDocumentResync({
          sourceLanguage: 'en',
          targetLanguage: 'zh-cn',
          sourceContent: FULL_DOCUMENT.content,
          targetContent: TRANSLATED_DOCUMENT,
        }),
    ],
  ];

  it.each(TRANSLATOR_OPERATIONS)(
    'claude-opus-5-5, %s: a leading thinking block, then text: exactly the text',
    async (_operation, run) => {
      api.reply(endTurn(thinking(), text(TRANSLATION)));

      const result = await run(new TranslationService('test-key', 'claude-opus-5-5'));

      expect(result).toMatchObject({ success: true, translatedSection: TRANSLATION });
      expect(api.requests).toHaveLength(1);
    }
  );

  it.each(TRANSLATOR_OPERATIONS)(
    'claude-opus-5-5, %s: an end_turn holding only a thinking block fails, never an empty success',
    async (operation, run) => {
      api.reply(endTurn(thinking()));

      const result = await run(new TranslationService('test-key', 'claude-opus-5-5'));

      // toMatchObject: a document resync also reports what its request carried (#348).
      expect(result).toMatchObject({
        success: false,
        error: `${operation}: response contained no text`,
      });
      expect(result.translatedSection).toBeUndefined();
      expect(api.requests).toHaveLength(1);
    }
  );

  /** Sonnet 5.5's classifier stopping the stream after some text. */
  const MID_STREAM_REFUSAL: FakeReply = {
    content: [text('Partial…')],
    stop_reason: 'refusal',
    stop_details: { type: 'refusal', category: 'frontier_llm', explanation: null },
    usage: { input_tokens: 500, output_tokens: 7 },
  };

  it('a mid-stream refusal fails translateSection, naming it and its category, after ONE request', async () => {
    api.reply(MID_STREAM_REFUSAL);
    const service = new TranslationService('test-key', 'claude-sonnet-5-5');

    const result = await service.translateSection(SECTION_UPDATE);

    expect(result.success).toBe(false);
    expect(result.translatedSection).toBeUndefined();
    expect(result.error).toContain('stop_reason=refusal');
    expect(result.error).toContain('category=frontier_llm');
    expect(api.requests).toHaveLength(1);
    // The refused attempt is billed, so it was counted before the stop check threw.
    expect(service.getUsage()).toEqual({
      inputTokens: 500,
      outputTokens: 7,
      thinkingTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      apiCalls: 1,
    });
  });

  it('a mid-stream refusal rejects translateFullDocument with ModelRefusalError: stop_details survived streaming', async () => {
    api.reply(MID_STREAM_REFUSAL);

    const error = await rejectionOf(
      new TranslationService('test-key', 'claude-sonnet-5-5').translateFullDocument(FULL_DOCUMENT)
    );

    expect(error).toBeInstanceOf(ModelRefusalError);
    expect(error).toMatchObject({
      operation: 'translateFullDocument',
      category: 'frontier_llm',
      explanation: null,
      partialChars: 'Partial…'.length,
    });
    expect(api.requests).toHaveLength(1);
  });

  it('an end_turn holding only a thinking block fails, instead of returning an empty translation', async () => {
    api.reply(endTurn(thinking()));

    const result = await new TranslationService('test-key', 'claude-opus-5-5').translateSection(
      SECTION_UPDATE
    );

    expect(result).toEqual({
      success: false,
      error: 'translateSectionUpdate: response contained no text',
    });
    expect(api.requests).toHaveLength(1);
  });

  it('model_context_window_exceeded fails, whatever text arrived', async () => {
    api.reply({
      content: [thinking(), text(TRANSLATION)],
      stop_reason: 'model_context_window_exceeded',
    });

    const result = await new TranslationService('test-key', 'claude-opus-5-5').translateSection(
      SECTION_UPDATE
    );

    expect(result.success).toBe(false);
    expect(result.translatedSection).toBeUndefined();
    expect(result.error).toContain('unexpected stop_reason=model_context_window_exceeded');
    expect(api.requests).toHaveLength(1);
  });

  it('counts the thinking tokens the stream reports, and the model that served each call, refused ones included', async () => {
    api.reply(
      {
        content: [thinking(), text(TRANSLATED_DOCUMENT)],
        stop_reason: 'end_turn',
        usage: { input_tokens: 900, output_tokens: 700, thinking_tokens: 450 },
      },
      MID_STREAM_REFUSAL
    );
    const service = new TranslationService('test-key', 'claude-opus-5-5');

    await service.translateFullDocument(FULL_DOCUMENT);
    await rejectionOf(service.translateFullDocument(FULL_DOCUMENT));

    // output_tokens_details reached the accumulator through message_delta;
    // thinking stays inside outputTokens.
    expect(service.getUsage()).toEqual({
      inputTokens: 1400,
      outputTokens: 707,
      thinkingTokens: 450,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      apiCalls: 2,
    });
    expect(service.getServedModels()).toEqual(['claude-opus-5-5']);
    expect(service.getRetryCount()).toBe(0);
  });

  it('retries a mid-stream overload, and counts the retry', async () => {
    api.reply(
      {
        content: [text('部分')],
        stop_reason: null,
        midStreamError: { type: 'overloaded_error', message: 'Overloaded' },
      },
      endTurn(text(TRANSLATED_DOCUMENT))
    );
    const service = new TranslationService('test-key', 'claude-sonnet-5');

    const result = await service.translateFullDocument(FULL_DOCUMENT);

    expect(result).toMatchObject({ success: true, translatedSection: TRANSLATED_DOCUMENT });
    expect(api.requests).toHaveLength(2);
    expect(service.getRetryCount()).toBe(1);
    // The failed stream returned no usage; only the completed call is counted.
    expect(service.getUsage().apiCalls).toBe(1);
  });
});

describe('reviewer (streamed): callWithRetry', () => {
  const PROMPT = 'Rate this translation. Reply with one JSON object.';

  /** The reviewer's private chokepoint, which every review call goes through. */
  interface ReviewerInternals {
    callWithRetry(
      prompt: string,
      maxTokens: number,
      operationName: string
    ): Promise<Record<string, unknown>>;
    sleep(ms: number): Promise<void>;
  }

  /** One review call, made the way the review sites make it. */
  function review(model: string): Promise<Record<string, unknown>> {
    const reviewer = new TranslationReviewer(
      'test-key',
      'test-token',
      model
    ) as unknown as ReviewerInternals;
    // No case here should retry; if one does, fail on the request count
    // rather than after 1 s + 2 s of backoff.
    reviewer.sleep = () => Promise.resolve();
    return reviewer.callWithRetry(PROMPT, maxTokensFor(model, 'review'), 'evaluateTranslation');
  }

  it('claude-opus-5-5: the verdict after a leading thinking block; adaptive/medium at max_tokens 32768', async () => {
    api.reply(endTurn(thinking(), text('{"ok":true}')));

    await expect(review('claude-opus-5-5')).resolves.toEqual({ ok: true });

    const { body } = onlyRequest();
    // The policy fields sit where `thinking` always did: before messages.
    expect(Object.keys(body)).toEqual([
      'model',
      'max_tokens',
      'thinking',
      'output_config',
      'messages',
      'stream',
    ]);
    expect(body.max_tokens).toBe(32768);
    expect(policyOf(body)).toStrictEqual(ADAPTIVE_MEDIUM);
    expect(body.messages).toEqual([{ role: 'user', content: PROMPT }]);
  });

  it('claude-sonnet-5-5: between_tools at effort high, max_tokens 8192', async () => {
    api.reply(endTurn(text('{"ok":true}')));

    await expect(review('claude-sonnet-5-5')).resolves.toEqual({ ok: true });

    const { body } = onlyRequest();
    expect(Object.keys(body)).toEqual([
      'model',
      'max_tokens',
      'thinking',
      'output_config',
      'messages',
      'stream',
    ]);
    expect(body.max_tokens).toBe(8192);
    expect(policyOf(body)).toStrictEqual(BETWEEN_TOOLS_HIGH);
  });

  it('claude-sonnet-5: byte for byte the request it always sent (#342)', async () => {
    api.reply(endTurn(text('{"ok":true}')));

    await expect(review('claude-sonnet-5')).resolves.toEqual({ ok: true });

    expect(onlyRequest().rawBody).toBe(
      JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 8192,
        thinking: { type: 'disabled' },
        messages: [{ role: 'user', content: PROMPT }],
        stream: true,
      })
    );
  });

  it('a refusal rejects with ModelRefusalError after exactly ONE request', async () => {
    // Its partial JSON would read as a parse failure, which IS retried: the
    // stop reason has to be checked first.
    const partial = '{"accuracy": 9';
    api.reply({
      content: [thinking(), text(partial)],
      stop_reason: 'refusal',
      stop_details: { type: 'refusal', category: 'cyber', explanation: null },
    });

    const error = await rejectionOf(review('claude-opus-5-5'));

    expect(error).toBeInstanceOf(ModelRefusalError);
    expect(error).toMatchObject({
      operation: 'evaluateTranslation',
      category: 'cyber',
      partialChars: partial.length,
    });
    expect(api.requests).toHaveLength(1);
  });
});

describe('CLI analysis (non-streamed): triageForward', () => {
  const VERDICT = '{"verdict": "I18N_ONLY", "reason": "punctuation only"}';
  /** Cut off by the cap mid-JSON. */
  const TRUNCATED: FakeReply = {
    content: [thinking(), text('{"verdict": "I18N_')],
    stop_reason: 'max_tokens',
  };

  function triage(model: string) {
    return triageForward('lectures/supply.md', NEW_ENGLISH, TRANSLATION, {
      apiKey: 'test-key',
      model,
      sourceLanguage: 'English',
      targetLanguage: 'Simplified Chinese',
      testMode: false,
    });
  }

  it.each([
    ['claude-sonnet-5', 8192, DISABLED, [text(VERDICT)]],
    ['claude-sonnet-5-5', 8192, BETWEEN_TOOLS_HIGH, [text(VERDICT)]],
    // Opus 5.5 always thinks: its reply leads with a thinking block.
    ['claude-opus-5-5', 16384, ADAPTIVE_MEDIUM, [thinking(), text(VERDICT)]],
    ['test-model', 8192, API_DEFAULTS, [text(VERDICT)]],
  ])(
    '%s: max_tokens %d and exactly its policy, no stream flag',
    async (model, maxTokens, fields, content) => {
      api.reply(endTurn(...content));

      await expect(triage(model)).resolves.toMatchObject({
        verdict: 'I18N_ONLY',
        reason: 'punctuation only',
      });

      const { body } = onlyRequest();
      expect(Object.keys(body)).toEqual([
        'model',
        'max_tokens',
        ...Object.keys(fields),
        'messages',
      ]);
      expect(body.max_tokens).toBe(maxTokens);
      expect(policyOf(body)).toStrictEqual(fields);
    }
  );

  it('claude-sonnet-5: byte for byte the request it always sent (#342)', async () => {
    api.reply(endTurn(text(VERDICT)));

    await expect(triage('claude-sonnet-5')).resolves.toMatchObject({ verdict: 'I18N_ONLY' });

    const { body, rawBody } = onlyRequest();
    expect(rawBody).toBe(
      JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 8192,
        thinking: { type: 'disabled' },
        messages: body.messages,
      })
    );
  });

  it('a refusal rejects with ModelRefusalError after ONE request: not retried', async () => {
    api.reply({
      content: [],
      stop_reason: 'refusal',
      stop_details: { type: 'refusal', category: 'cyber', explanation: null },
    });

    const error = await rejectionOf(triage('claude-opus-5-5'));

    expect(error).toBeInstanceOf(ModelRefusalError);
    expect(error).toMatchObject({ operation: 'triageForward', category: 'cyber', partialChars: 0 });
    expect(api.requests).toHaveLength(1);
  });

  it('a max_tokens stop is still retried, and a retry that fits is used', async () => {
    api.reply(TRUNCATED, endTurn(thinking(), text(VERDICT)));

    await expect(triage('claude-opus-5-5')).resolves.toMatchObject({ verdict: 'I18N_ONLY' });

    expect(api.requests).toHaveLength(2);
    // The retry re-sends the identical request.
    expect(api.requests[1].rawBody).toBe(api.requests[0].rawBody);
  });

  it('a max_tokens stop on all 3 attempts rejects with TruncatedResponseError', async () => {
    api.reply(TRUNCATED, TRUNCATED, TRUNCATED);

    const error = await rejectionOf(triage('claude-opus-5-5'));

    expect(error).toBeInstanceOf(TruncatedResponseError);
    expect((error as Error).message).toContain(
      'triageForward: Response truncated at max_tokens=16384'
    );
    expect(api.requests).toHaveLength(3);
  });
});

describe('the fake API', () => {
  it('answers a request no reply was queued for with a 400, which fails the call unretried', async () => {
    const result = await new TranslationService('test-key', 'claude-sonnet-5').translateSection(
      SECTION_UPDATE
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('fake-anthropic-api: no reply queued for request 1');
    expect(api.requests).toHaveLength(1);
  });
});

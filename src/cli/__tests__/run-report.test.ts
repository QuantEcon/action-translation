/**
 * Run reports (run-report.ts): the failure classes a failed file is sorted
 * into, the stderr line it gets, and the report file itself.
 *
 * The SDK errors are built with the real SDK — `APIError.generate` is how it
 * builds one from an HTTP error response — and the mid-stream cases go
 * through the real SDK's stream reader (test-support/fake-anthropic-api.ts,
 * or a fetch whose body fails), so the classes are checked against the errors
 * a run can actually meet.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { APIConnectionError, APIError, APIUserAbortError, AnthropicError } from '@anthropic-ai/sdk';
import {
  ModelRefusalError,
  TruncatedResponseError,
  UnexpectedStopReasonError,
  emptyApiUsage,
} from '../../models.js';
import { RETRY_CONFIG, TranslationService } from '../../translator.js';
import {
  FakeAnthropicApi,
  FakeContentBlock,
  installFakeAnthropicApi,
} from '../../test-support/fake-anthropic-api.js';
import {
  INIT_REPORT_SCHEMA,
  InitRunReport,
  StructuralParityError,
  classifyFailure,
  formatFailureLine,
  usageSince,
  writeRunReport,
} from '../run-report.js';

/** An API error body, as the API sends it. */
const errorBody = (type: string, message: string) => ({ type: 'error', error: { type, message } });

/** The SDK's error for an HTTP error response. */
const httpError = (status: number, type: string, message: string) =>
  APIError.generate(status, errorBody(type, message), undefined, new Headers());

/** The SDK's error for an SSE `error` event (core/streaming.js): no HTTP status. */
const streamError = (type: NonNullable<APIError['type']>, message: string) =>
  new APIError(undefined, errorBody(type, message), undefined, undefined, type);

describe('classifyFailure', () => {
  it('model-refusal, carrying the stop_details category', () => {
    const failure = classifyFailure(
      new ModelRefusalError('translateFullDocument', 'bio', null, 12)
    );
    expect(failure).toEqual({
      kind: 'model-refusal',
      message: expect.stringContaining('model refusal (stop_reason=refusal, category=bio)'),
      category: 'bio',
    });
  });

  it('model-refusal with no category: category null', () => {
    expect(classifyFailure(new ModelRefusalError('op', null, null, 0))).toMatchObject({
      kind: 'model-refusal',
      category: null,
    });
  });

  it('truncated', () => {
    expect(classifyFailure(new TruncatedResponseError(64000, 'translateFullDocument'))).toEqual({
      kind: 'truncated',
      message:
        'translateFullDocument: Response truncated at max_tokens=64000; refusing to interpret incomplete output',
    });
  });

  it('unexpected-stop, carrying the stop reason', () => {
    expect(
      classifyFailure(new UnexpectedStopReasonError('op', 'model_context_window_exceeded'))
    ).toMatchObject({ kind: 'unexpected-stop', stopReason: 'model_context_window_exceeded' });
    expect(classifyFailure(new UnexpectedStopReasonError('op', null))).toMatchObject({
      kind: 'unexpected-stop',
      stopReason: null,
    });
  });

  it('parity', () => {
    const error = new StructuralParityError(
      'structural parity check failed for x.md:\n  - anchor missing from output: (intro)='
    );
    expect(error.name).toBe('StructuralParityError');
    expect(classifyFailure(error)).toEqual({ kind: 'parity', message: error.message });
  });

  it.each([
    [401, 'authentication_error'],
    [403, 'permission_error'],
  ])('auth: HTTP %i', (status, type) => {
    expect(classifyFailure(httpError(status, type, 'denied'))).toEqual({
      kind: 'auth',
      // The SDK's message for an HTTP error: the status, then the body.
      message: `${status} ${JSON.stringify(errorBody(type, 'denied'))}`,
      status,
      type,
    });
  });

  it.each([
    [429, 'rate_limit_error'],
    [500, 'api_error'],
    [529, 'overloaded_error'],
  ])('infra: HTTP %i that outlasted the retries', (status, type) => {
    expect(classifyFailure(httpError(status, type, 'try later'))).toEqual({
      kind: 'infra',
      message: `${status} ${JSON.stringify(errorBody(type, 'try later'))}`,
      status,
      type,
    });
  });

  it('infra: a connection error (no status, no type)', () => {
    expect(classifyFailure(new APIConnectionError({ message: 'Connection error.' }))).toEqual({
      kind: 'infra',
      message: 'Connection error.',
    });
  });

  it.each(['overloaded_error', 'api_error', 'rate_limit_error', 'timeout_error'] as const)(
    'infra: a mid-stream %s (an APIError with no status)',
    (type) => {
      expect(classifyFailure(streamError(type, 'server trouble'))).toMatchObject({
        kind: 'infra',
        type,
      });
      expect(classifyFailure(streamError(type, 'server trouble'))).not.toHaveProperty('status');
    }
  );

  it.each([
    [400, 'invalid_request_error'],
    [404, 'not_found_error'],
  ])('api-error: HTTP %i', (status, type) => {
    expect(classifyFailure(httpError(status, type, 'no'))).toEqual({
      kind: 'api-error',
      message: `${status} ${JSON.stringify(errorBody(type, 'no'))}`,
      status,
      type,
    });
  });

  it('infra: a stream cut short below the API — a dropped connection, or a body that ended early', () => {
    const dropped = new AnthropicError('terminated', { cause: new TypeError('terminated') });
    expect(classifyFailure(dropped)).toEqual({ kind: 'infra', message: 'terminated' });
    expect(
      classifyFailure(
        new AnthropicError('stream ended without producing a Message with role=assistant')
      ).kind
    ).toBe('infra');
    expect(
      classifyFailure(new AnthropicError('request ended without sending any chunks')).kind
    ).toBe('infra');
    // Any other SDK-side error is not.
    expect(
      classifyFailure(
        new AnthropicError(
          'Unexpected event order, got message_start before receiving "message_stop"'
        )
      ).kind
    ).toBe('error');
  });

  it('api-error: a mid-stream error of any other type, and an aborted request', () => {
    expect(classifyFailure(streamError('invalid_request_error', 'bad'))).toMatchObject({
      kind: 'api-error',
      type: 'invalid_request_error',
    });
    expect(classifyFailure(new APIUserAbortError())).toEqual({
      kind: 'api-error',
      message: 'Request was aborted.',
    });
  });

  it('too-large, incomplete and no-text: the translator’s own failures, by message', () => {
    expect(
      classifyFailure(
        new Error(
          'Document too large: estimated 70000 tokens exceeds the output budget of 64000 tokens.'
        )
      ).kind
    ).toBe('too-large');
    expect(
      classifyFailure(new Error('Document exceeded token limits and was truncated. ...')).kind
    ).toBe('incomplete');
    expect(
      classifyFailure(new Error('translateFullDocument: response contained no text')).kind
    ).toBe('no-text');
  });

  it('error: anything else, a thrown non-Error included', () => {
    expect(classifyFailure(new Error('Source file not found: /x.md'))).toEqual({
      kind: 'error',
      message: 'Source file not found: /x.md',
    });
    expect(classifyFailure('boom')).toEqual({ kind: 'error', message: 'boom' });
  });

  it('cuts the message at 500 characters', () => {
    expect(classifyFailure(new Error('x'.repeat(2000))).message).toHaveLength(500);
  });
});

const DOCUMENT = { sourceLanguage: 'en', targetLanguage: 'zh-cn', content: '# Markets\n' };

/** What the promise rejected with; fails the case if it resolved. */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to reject');
}

describe('classifyFailure on errors the real SDK raised from a stream', () => {
  let api: FakeAnthropicApi;
  const BASE_DELAY_MS = RETRY_CONFIG.baseDelayMs;
  const text = (value: string): FakeContentBlock => ({ type: 'text', text: value });

  beforeAll(() => {
    RETRY_CONFIG.baseDelayMs = 0;
  });
  afterAll(() => {
    RETRY_CONFIG.baseDelayMs = BASE_DELAY_MS;
  });
  beforeEach(() => {
    api = installFakeAnthropicApi();
  });
  afterEach(() => {
    api.restore();
  });

  it('a server error that cuts a stream short is infra; the engine does not retry it', async () => {
    api.reply({
      content: [text('部分')],
      stop_reason: null,
      midStreamError: { type: 'api_error', message: 'Internal server error' },
    });

    const error = await rejectionOf(
      new TranslationService('test-key', 'claude-sonnet-5-5').translateFullDocument(DOCUMENT)
    );

    expect(error).toBeInstanceOf(APIError);
    expect((error as APIError).status).toBeUndefined();
    expect(api.requests).toHaveLength(1);
    expect(classifyFailure(error)).toEqual({
      kind: 'infra',
      message: expect.stringContaining('Internal server error'),
      type: 'api_error',
    });
  });

  it('a streamed refusal is model-refusal with its category', async () => {
    api.reply({
      content: [text('部分')],
      stop_reason: 'refusal',
      stop_details: { type: 'refusal', category: 'bio', explanation: null },
    });

    const error = await rejectionOf(
      new TranslationService('test-key', 'claude-opus-5-5').translateFullDocument(DOCUMENT)
    );

    expect(classifyFailure(error)).toMatchObject({ kind: 'model-refusal', category: 'bio' });
  });
});

describe('classifyFailure on a stream cut short below the API (real SDK)', () => {
  /** A 200 event stream that starts a message, then drops the connection or just ends. */
  function cutShort(mode: 'drop' | 'end'): Response {
    const start = {
      type: 'message_start',
      message: {
        id: 'msg_cut',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-5',
        content: [],
        container: null,
        diagnostics: null,
        stop_reason: null,
        stop_sequence: null,
        stop_details: null,
        usage: { input_tokens: 10, output_tokens: 1 },
      },
    };
    const bytes = new TextEncoder().encode(
      `event: message_start\ndata: ${JSON.stringify(start)}\n\n`
    );
    let sent = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sent) {
          sent = true;
          controller.enqueue(bytes);
        } else if (mode === 'drop') {
          // What fetch raises when the socket closes mid-body.
          controller.error(new TypeError('terminated'));
        } else {
          controller.close();
        }
      },
    });
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }

  let fetchSpy: jest.SpyInstance;
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it.each([
    ['drop', 'terminated'],
    ['end', 'stream ended without producing a Message with role=assistant'],
  ] as const)('%s: infra, and the engine does not retry it', async (mode, message) => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => cutShort(mode));

    const error = await rejectionOf(
      new TranslationService('test-key', 'claude-sonnet-5').translateFullDocument(DOCUMENT)
    );

    expect(error).toBeInstanceOf(AnthropicError);
    expect(error).not.toBeInstanceOf(APIError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(classifyFailure(error)).toEqual({ kind: 'infra', message });
  });
});

describe('formatFailureLine', () => {
  it('is one line: file, kind, the category of a refusal, then the message', () => {
    expect(
      formatFailureLine('sir_model.md', {
        kind: 'model-refusal',
        message: 'translateFullDocument: model refusal (stop_reason=refusal, category=bio)',
        category: 'bio',
      })
    ).toBe(
      '✗ sir_model.md: model-refusal (bio) — translateFullDocument: model refusal (stop_reason=refusal, category=bio)'
    );
  });

  it('flattens a multi-line message and cuts it at 200 characters', () => {
    const line = formatFailureLine('x.md', {
      kind: 'parity',
      message: `structural parity check failed for x.md:\n  - ${'y'.repeat(400)}`,
    });
    expect(line).not.toContain('\n');
    expect(line.startsWith('✗ x.md: parity — structural parity check failed for x.md: - y')).toBe(
      true
    );
    expect(line).toHaveLength('✗ x.md: parity — '.length + 200);
  });
});

describe('usageSince', () => {
  it('is the field-by-field difference', () => {
    const before = { ...emptyApiUsage(), inputTokens: 100, outputTokens: 50, apiCalls: 1 };
    const after = {
      inputTokens: 350,
      outputTokens: 90,
      thinkingTokens: 30,
      cacheCreationInputTokens: 4000,
      cacheReadInputTokens: 8000,
      apiCalls: 3,
    };
    expect(usageSince(before, after)).toStrictEqual({
      inputTokens: 250,
      outputTokens: 40,
      thinkingTokens: 30,
      cacheCreationInputTokens: 4000,
      cacheReadInputTokens: 8000,
      apiCalls: 2,
    });
  });
});

describe('writeRunReport', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-report-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const REPORT: InitRunReport = {
    schema: INIT_REPORT_SCHEMA,
    toolVersion: '0.0.0',
    sdkVersion: '0.131.0',
    startedAt: '2026-10-20T00:00:00.000Z',
    finishedAt: '2026-10-20T00:00:01.000Z',
    elapsedMs: 1000,
    model: 'claude-sonnet-5',
    requestPolicy: {
      label: 'thinking-disabled',
      thinking: { type: 'disabled' },
      effort: null,
      alwaysThinks: false,
    },
    maxTokens: { fullDocument: 64000 },
    sourceLanguage: 'en',
    targetLanguage: 'fr',
    localize: [],
    glossaryTerms: 0,
    parallel: 1,
    usage: emptyApiUsage(),
    costUSD: 0,
    servedModels: [],
    retries: 0,
    summary: { total: 0, ok: 0, failed: 0, skipped: 0 },
    lectures: [],
  };

  it('creates the directory, writes the JSON, and leaves no temporary file', () => {
    const target = path.join(tmpDir, 'a', 'b', '1.json');

    const written = writeRunReport(target, REPORT);

    expect(written).toBe(path.resolve(target));
    expect(JSON.parse(fs.readFileSync(target, 'utf-8'))).toEqual(REPORT);
    expect(fs.readFileSync(target, 'utf-8').endsWith('}\n')).toBe(true);
    expect(fs.readdirSync(path.dirname(target))).toEqual(['1.json']);
  });

  it('replaces an earlier report at the same path', () => {
    const target = path.join(tmpDir, 'r.json');
    writeRunReport(target, { ...REPORT, toolVersion: 'old' });

    writeRunReport(target, REPORT);

    expect(JSON.parse(fs.readFileSync(target, 'utf-8')).toolVersion).toBe('0.0.0');
  });
});

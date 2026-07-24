/**
 * Reviewer retry behaviour (#164 — audit F52/F78).
 *
 * The reviewer's streamed calls run on every translation PR, over the same
 * transport whose `overloaded_error` (an APIError with status === undefined)
 * motivated commit 40d63ef — but only translator.ts got that fix, so a single
 * overload at either review call aborted the whole review and re-paid both
 * prompts. The predicate is now shared (`isRetryableAnthropicError`); this
 * suite drives the reviewer's real callWithRetry against a mocked SDK, in the
 * mold of translator-retry.test.ts. It also pins `maxRetries: 0` on the
 * client: the SDK default of 2 silently multiplied the hand-rolled 3 into up
 * to 9 HTTP attempts while the log said `attempt N/3`.
 */

import { TranslationReviewer } from '../reviewer.js';

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
}));

const mockFinalMessage = jest.fn();
const mockStream = jest.fn().mockImplementation(() => ({
  finalMessage: mockFinalMessage,
}));

jest.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = jest.fn().mockImplementation(() => ({
    messages: {
      stream: mockStream,
    },
  }));

  class AnthropicError extends Error {}
  class APIError extends AnthropicError {
    readonly status: number | undefined;
    constructor(status: number | undefined, _error: unknown, message: string | undefined) {
      super(message || 'API Error');
      this.status = status;
      this.name = 'APIError';
    }
  }
  class AuthenticationError extends APIError {}
  class RateLimitError extends APIError {}
  class APIConnectionError extends AnthropicError {}
  class BadRequestError extends APIError {}

  return {
    __esModule: true,
    default: MockAnthropic,
    APIError,
    AuthenticationError,
    RateLimitError,
    APIConnectionError,
    BadRequestError,
  };
});

import Anthropic, { APIError, BadRequestError } from '@anthropic-ai/sdk';

const MockAnthropic = Anthropic as unknown as jest.Mock;

function response(json: string) {
  return {
    content: [{ type: 'text', text: json }],
    usage: { input_tokens: 100, output_tokens: 50 },
    stop_reason: 'end_turn',
  };
}

/** The overloaded_error shape: APIError with no HTTP status on the streamed transport. */
function overloadedError() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new (APIError as any)(undefined, undefined, 'overloaded_error: Overloaded');
}

describe('reviewer callWithRetry', () => {
  let reviewer: TranslationReviewer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const call = (r: TranslationReviewer) => (r as any).callWithRetry('prompt', 1000, 'test-op');

  beforeEach(() => {
    jest.useFakeTimers();
    mockStream.mockClear();
    mockFinalMessage.mockReset();
    MockAnthropic.mockClear();
    reviewer = new TranslationReviewer('test-key', 'test-token');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('constructs the client with maxRetries: 0 — the hand-rolled loop owns the budget', () => {
    expect(MockAnthropic).toHaveBeenCalledWith({ apiKey: 'test-key', maxRetries: 0 });
  });

  it('retries an overloaded_error and succeeds — the branch this site lacked', async () => {
    mockFinalMessage
      .mockRejectedValueOnce(overloadedError())
      .mockResolvedValueOnce(response('{"ok": true}'));

    const promise = call(reviewer);
    await jest.runAllTimersAsync();

    await expect(promise).resolves.toEqual({ ok: true });
    expect(mockStream).toHaveBeenCalledTimes(2);
  });

  it('does not retry a BadRequestError', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockFinalMessage.mockRejectedValueOnce(new (BadRequestError as any)(400, undefined, 'bad'));

    await expect(call(reviewer)).rejects.toThrow('bad');
    expect(mockStream).toHaveBeenCalledTimes(1);
  });

  it('accumulates usage across attempts, retries included', async () => {
    mockFinalMessage
      .mockResolvedValueOnce(response('not json at all — parse failure'))
      .mockResolvedValueOnce(response('{"ok": true}'));

    const promise = call(reviewer);
    await jest.runAllTimersAsync();
    await promise;

    // Both attempts were paid for; both must be counted (#164/F53).
    expect(reviewer.getUsage()).toEqual({ inputTokens: 200, outputTokens: 100, apiCalls: 2 });
  });
});

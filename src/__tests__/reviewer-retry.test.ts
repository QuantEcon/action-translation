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

import { TranslationReviewer, ReviewParseExhaustedError } from '../reviewer.js';
import { DIFF_EVALUATION_UNPARSEABLE, parseReviewVerdict } from '../review-verdict.js';

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  notice: jest.fn(),
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
    // The retry predicate tests every error that is no APIError against it.
    AnthropicError,
    APIError,
    AuthenticationError,
    RateLimitError,
    APIConnectionError,
    BadRequestError,
  };
});

import Anthropic, { APIError, BadRequestError } from '@anthropic-ai/sdk';
import { ModelRefusalError, TruncatedResponseError } from '../models.js';

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
    expect(reviewer.getUsage()).toEqual({
      inputTokens: 200,
      outputTokens: 100,
      thinkingTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      apiCalls: 2,
    });
  });

  it('throws a typed parse error once three attempts fail to parse (#284)', async () => {
    mockFinalMessage.mockResolvedValue(response('{\n  ok: true }'));

    const outcome = expect(call(reviewer)).rejects.toBeInstanceOf(ReviewParseExhaustedError);
    await jest.runAllTimersAsync();
    await outcome;
    expect(mockStream).toHaveBeenCalledTimes(3);
    expect(reviewer.getUsage().apiCalls).toBe(3);
  });

  it('takes a SyntaxError from the transport for no parse failure: no reply was parsed', async () => {
    mockFinalMessage.mockRejectedValue(new SyntaxError('Unexpected token in the stream'));

    const outcome = call(reviewer).then(
      () => undefined,
      (error: unknown) => error
    );
    await jest.runAllTimersAsync();
    const error = await outcome;

    expect(error).toBeInstanceOf(SyntaxError);
    expect(error).not.toBeInstanceOf(ReviewParseExhaustedError);
    expect(mockStream).toHaveBeenCalledTimes(1);
  });

  it('keeps the parse error as the cause of the typed error', async () => {
    mockFinalMessage.mockResolvedValue(response('{\n  ok: true }'));

    const outcome = call(reviewer).then(
      () => undefined,
      (error: unknown) => error
    );
    await jest.runAllTimersAsync();
    const error = (await outcome) as ReviewParseExhaustedError;

    expect(error).toBeInstanceOf(ReviewParseExhaustedError);
    expect(error.cause).toBeInstanceOf(SyntaxError);
    expect(error.message).toContain((error.cause as Error).message);
  });

  it('a refusal propagates after exactly one call — neither retried nor a parse failure', async () => {
    mockFinalMessage.mockResolvedValueOnce({
      ...response('{"accuracy": 9'),
      stop_reason: 'refusal',
      stop_details: { type: 'refusal', category: 'cyber', explanation: null },
    });

    const outcome = expect(call(reviewer)).rejects.toBeInstanceOf(ModelRefusalError);
    await jest.runAllTimersAsync();
    await outcome;
    expect(mockStream).toHaveBeenCalledTimes(1);
    // The refused attempt was billed, so it is counted.
    expect(reviewer.getUsage().apiCalls).toBe(1);
  });

  it('an end_turn with no text fails after one call instead of parse-failure retries', async () => {
    mockFinalMessage.mockResolvedValueOnce({
      ...response(''),
      content: [{ type: 'thinking', thinking: '', signature: 'sig' }],
    });

    const outcome = expect(call(reviewer)).rejects.toThrow('test-op: response contained no text');
    await jest.runAllTimersAsync();
    await outcome;
    expect(mockStream).toHaveBeenCalledTimes(1);
  });

  it('reads the verdict after a leading thinking block', async () => {
    mockFinalMessage.mockResolvedValueOnce({
      ...response(''),
      content: [
        { type: 'thinking', thinking: '', signature: 'sig' },
        { type: 'text', text: '{"ok": true}' },
      ],
    });

    await expect(call(reviewer)).resolves.toEqual({ ok: true });
  });

  it.each([
    ['claude-sonnet-5', { thinking: { type: 'disabled' } }],
    [
      'claude-sonnet-5-5',
      { thinking: { type: 'between_tools' }, output_config: { effort: 'high' } },
    ],
    ['claude-opus-5-5', { thinking: { type: 'adaptive' }, output_config: { effort: 'medium' } }],
  ])('sends the review request policy of %s', async (model, fields) => {
    mockFinalMessage.mockResolvedValueOnce(response('{"ok": true}'));
    reviewer = new TranslationReviewer('test-key', 'test-token', model);

    await call(reviewer);

    const params = mockStream.mock.calls[0][0];
    // The policy fields sit where `thinking` always did: before `messages`.
    expect(Object.keys(params)).toEqual([
      'model',
      'max_tokens',
      ...Object.keys(fields),
      'messages',
    ]);
    const sentPolicy = Object.fromEntries(
      Object.entries(params).filter(([key]) => key === 'thinking' || key === 'output_config')
    );
    expect(sentPolicy).toStrictEqual(fields);
  });
});

// #284: `evaluateDiff` returns unparseable JSON about 2% of the time. The
// three retries stay (some parse failures are transient); when all three fail,
// the review degrades instead of dying, keeping the paid translation
// evaluation and posting a verdict that routes to editor.
describe('reviewPR when evaluateDiff never parses (#284)', () => {
  // No `##` headings, so the deterministic heading-map check passes with no map.
  const SOURCE_BEFORE = `# Introduction\n\nAn old overview of the model.\n`;
  const SOURCE_AFTER = `# Introduction\n\nAn overview of the model.\n`;
  const TARGET_BEFORE = `# 介绍\n\n旧的模型概述。\n`;
  const TARGET_AFTER = `# 介绍\n\n模型概述。\n`;
  const b64 = (s: string) => Buffer.from(s, 'utf-8').toString('base64');
  const TRANSLATION_JSON = JSON.stringify({
    accuracy: 9,
    fluency: 9,
    terminology: 9,
    formatting: 9,
    syntaxErrors: [],
    issues: [],
    findings: [],
    strengths: ['good'],
    summary: 'Fine.',
  });
  const DIFF_JSON = JSON.stringify({
    scopeCorrect: true,
    positionCorrect: true,
    structurePreserved: true,
    headingMapCorrect: true,
    issues: [],
    summary: 'Fine.',
    scopeDetails: 'ok',
    positionDetails: 'ok',
    structureDetails: 'ok',
  });
  // The field shape: a property-name error at position 1, every attempt.
  const UNPARSEABLE = '{\n  scopeCorrect: true }';

  let comments: string[];

  function makeReviewer(targetAfter = TARGET_AFTER): TranslationReviewer {
    const reviewer = new TranslationReviewer('test-key', 'test-token');
    comments = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (reviewer as any).octokit = {
      rest: {
        pulls: {
          get: async (p: { repo: string }) =>
            p.repo === 'tgt'
              ? {
                  data: {
                    body: '### Source PR\n**[#5 - Edit](https://example.invalid/5)**\n',
                    head: { sha: 'targethead' },
                    base: { sha: 'targetbase' },
                  },
                }
              : { data: { head: { sha: 'sourcehead' }, base: { sha: 'sourcebase' } } },
          listFiles: 'listFiles',
        },
        repos: {
          getContent: async (p: { repo: string; ref: string }) => {
            const content =
              p.repo === 'tgt'
                ? p.ref === 'targethead'
                  ? targetAfter
                  : TARGET_BEFORE
                : p.ref === 'sourcehead'
                  ? SOURCE_AFTER
                  : SOURCE_BEFORE;
            return { data: { content: b64(content) } };
          },
        },
      },
      paginate: async () => [
        { filename: 'lectures/intro.md', status: 'modified', additions: 1, deletions: 1 },
      ],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (reviewer as any).postReviewComment = async (_n: number, _o: string, _r: string, b: string) => {
      comments.push(b);
    };
    return reviewer;
  }

  async function review(reviewer: TranslationReviewer, mode: 'off' | 'shadow' = 'off') {
    const promise = reviewer.reviewPR(1, 'o/src', 'o', 'tgt', 'lectures', undefined, 'zh-cn', mode);
    // Settle the promise before draining timers, so a rejection is never unhandled.
    const settled = promise.then(
      (value) => ({ value, error: undefined }),
      (error: unknown) => ({ value: undefined, error })
    );
    await jest.runAllTimersAsync();
    return settled;
  }

  const coreMock = jest.requireMock('@actions/core') as {
    warning: jest.Mock;
    error: jest.Mock;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    mockStream.mockClear();
    mockFinalMessage.mockReset();
    coreMock.warning.mockClear();
    coreMock.error.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('posts a verdict that routes to editor, with the fixed phrase, after three unparseable replies', async () => {
    mockFinalMessage
      .mockResolvedValueOnce(response(TRANSLATION_JSON))
      .mockResolvedValueOnce(response(UNPARSEABLE))
      .mockResolvedValueOnce(response(UNPARSEABLE))
      .mockResolvedValueOnce(response(UNPARSEABLE));
    const reviewer = makeReviewer();

    const { value: result, error } = await review(reviewer);

    // The run does not fail: reviewPR resolves and the comment is posted.
    expect(error).toBeUndefined();
    expect(comments).toHaveLength(1);
    expect(mockStream).toHaveBeenCalledTimes(4); // 1 translation + 3 diff attempts
    expect(result?.recommendation).toBe('editor');

    // The paid translation evaluation is kept.
    expect(result?.translationQuality.accuracy).toBe(9);

    const verdict = parseReviewVerdict(comments[0]);
    expect(verdict).not.toBeNull();
    // The model-judged checks are recorded as failed ...
    expect(verdict?.diffChecks.scopeCorrect).toBe(false);
    expect(verdict?.diffChecks.positionCorrect).toBe(false);
    // ... and gate through diff-check findings that carry the fixed phrase.
    const diffCheckFindings = verdict?.findings.filter((f) => f.category === 'diff-check') ?? [];
    expect(diffCheckFindings).toHaveLength(2);
    for (const f of diffCheckFindings) {
      expect(f.description).toContain(DIFF_EVALUATION_UNPARSEABLE);
      expect(f.description).not.toMatch(/the reviewer reported this check as failed/);
    }
    expect(verdict?.recommendationReasons.join('\n')).toMatch(/minor finding\(s\) in gating/);

    // The deterministic checks ran and report as themselves: this pair passes both.
    expect(verdict?.diffCheckSources?.structurePreserved).toBe('deterministic');
    expect(verdict?.diffChecks.structurePreserved).toBe(true);
    expect(verdict?.diffChecks.headingMapCorrect).toBe(true);
    expect(verdict?.recommendationReasons.join('\n')).not.toMatch(/diff check failed/);
    // And the rubric gates on a reason of its own, not only through findings.
    expect(verdict?.recommendationReasons).toContain(
      `${DIFF_EVALUATION_UNPARSEABLE} — scopeCorrect and positionCorrect were not judged`
    );

    // The diff score counts the published checks: two of four pass.
    expect(verdict?.scores.diff).toBe(5);
    expect(result?.diffQuality.score).toBe(5);

    // A workflow warning, not an error annotation.
    const warnings = coreMock.warning.mock.calls.map((c) => String(c[0]));
    expect(warnings.some((w) => w.includes(DIFF_EVALUATION_UNPARSEABLE))).toBe(true);
    expect(coreMock.error).not.toHaveBeenCalled();

    // Every paid attempt counts, the three failed ones included.
    expect(reviewer.getUsage().apiCalls).toBe(4);
  });

  // The cap hole: `sortAndCapFindings` keeps the first twenty findings by
  // severity, translation findings first, so twenty minor model findings push
  // both `diff-check` findings out of the list, and the rubric skips the
  // model-sourced booleans. Without the reason of its own, this recorded
  // auto-merge.
  const TWENTY_MINORS_JSON = JSON.stringify({
    accuracy: 10,
    fluency: 9,
    terminology: 10,
    formatting: 10,
    syntaxErrors: [],
    issues: [],
    findings: Array.from({ length: 20 }, (_, i) => ({
      severity: 'minor',
      category: 'fluency',
      file: 'lectures/intro.md',
      location: null,
      description: `Slightly stiff phrasing ${i + 1}.`,
      suggestion: null,
    })),
    strengths: ['good'],
    summary: 'Fine.',
  });

  it.each(['off', 'shadow'] as const)(
    'routes to editor when twenty minor findings crowd the diff-check findings out (auto-merge-mode %s)',
    async (mode) => {
      mockFinalMessage
        .mockResolvedValueOnce(response(TWENTY_MINORS_JSON))
        .mockResolvedValueOnce(response(UNPARSEABLE))
        .mockResolvedValueOnce(response(UNPARSEABLE))
        .mockResolvedValueOnce(response(UNPARSEABLE));

      const { value: result, error } = await review(makeReviewer(), mode);

      expect(error).toBeUndefined();
      const verdict = parseReviewVerdict(comments[0]);
      // The findings list really is full of the model's minors ...
      expect(verdict?.findings).toHaveLength(20);
      expect(verdict?.findings.some((f) => f.category === 'diff-check')).toBe(false);
      // ... and the PR still routes to editor, by the phrase in the reasons.
      expect(result?.recommendation).toBe('editor');
      expect(verdict?.recommendation).toBe('editor');
      expect(verdict?.recommendationReasons).toEqual([
        `${DIFF_EVALUATION_UNPARSEABLE} — scopeCorrect and positionCorrect were not judged`,
      ]);
      if (mode === 'shadow') {
        expect(result?.wouldAutoMerge).toBe(false);
        expect(verdict?.wouldAutoMerge).toBe(false);
      } else {
        expect(verdict?.wouldAutoMerge).toBeUndefined();
      }
    }
  );

  it('still reports a failed deterministic check as failed when the diff evaluation degrades', async () => {
    mockFinalMessage
      .mockResolvedValueOnce(response(TRANSLATION_JSON))
      .mockResolvedValueOnce(response(UNPARSEABLE))
      .mockResolvedValueOnce(response(UNPARSEABLE))
      .mockResolvedValueOnce(response(UNPARSEABLE));
    // The translation gains a section the source does not have.
    const reviewer = makeReviewer(`${TARGET_AFTER}\n## 额外\n\n多余的内容。\n`);

    const { value: result, error } = await review(reviewer);

    expect(error).toBeUndefined();
    const verdict = parseReviewVerdict(comments[0]);
    expect(verdict?.diffChecks.structurePreserved).toBe(false);
    expect(verdict?.diffCheckSources?.structurePreserved).toBe('deterministic');
    expect(verdict?.recommendationReasons).toContain('diff check failed: structurePreserved');
    // The new `##` heading has no heading-map entry, so that check fails too.
    expect(verdict?.diffChecks.headingMapCorrect).toBe(false);
    expect(verdict?.diffCheckSources?.headingMapCorrect).toBe('deterministic');
    expect(verdict?.recommendationReasons).toContain('diff check failed: headingMapCorrect');
    expect(result?.recommendation).toBe('editor');
    // All four checks failed.
    expect(verdict?.scores.diff).toBe(0);
  });

  it('takes the normal path when the second diff attempt parses', async () => {
    mockFinalMessage
      .mockResolvedValueOnce(response(TRANSLATION_JSON))
      .mockResolvedValueOnce(response(UNPARSEABLE))
      .mockResolvedValueOnce(response(DIFF_JSON));

    const { value: result, error } = await review(makeReviewer());

    expect(error).toBeUndefined();
    expect(mockStream).toHaveBeenCalledTimes(3);
    expect(result?.recommendation).toBe('auto-merge');
    expect(comments[0]).not.toContain(DIFF_EVALUATION_UNPARSEABLE);
  });

  it('still fails the run on an API error in evaluateDiff', async () => {
    mockFinalMessage
      .mockResolvedValueOnce(response(TRANSLATION_JSON))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockRejectedValueOnce(new (BadRequestError as any)(400, undefined, 'bad request'));

    const { error } = await review(makeReviewer());

    expect(error).toBeInstanceOf(BadRequestError);
    expect(comments).toEqual([]);
  });

  it('still fails the run when the evaluateDiff transport rejects with a raw SyntaxError, with no reply', async () => {
    mockFinalMessage
      .mockResolvedValueOnce(response(TRANSLATION_JSON))
      .mockRejectedValue(new SyntaxError('Unexpected end of JSON input'));

    const { error } = await review(makeReviewer());

    expect(error).toBeInstanceOf(SyntaxError);
    expect(error).not.toBeInstanceOf(ReviewParseExhaustedError);
    expect(comments).toEqual([]);
  });

  it('still fails the run on a refusal in evaluateDiff', async () => {
    mockFinalMessage.mockResolvedValueOnce(response(TRANSLATION_JSON)).mockResolvedValueOnce({
      ...response('{"scopeCorrect": tr'),
      stop_reason: 'refusal',
      stop_details: { type: 'refusal', category: 'cyber', explanation: null },
    });

    const { error } = await review(makeReviewer());

    expect(error).toBeInstanceOf(ModelRefusalError);
    expect(comments).toEqual([]);
  });

  it('still fails the run on a truncated evaluateDiff reply', async () => {
    mockFinalMessage
      .mockResolvedValueOnce(response(TRANSLATION_JSON))
      .mockResolvedValueOnce({ ...response('{"scopeCorrect": tr'), stop_reason: 'max_tokens' });

    const { error } = await review(makeReviewer());

    expect(error).toBeInstanceOf(TruncatedResponseError);
    expect(comments).toEqual([]);
  });

  it('still fails the run when evaluateTranslation never parses — the ruling covers evaluateDiff only', async () => {
    mockFinalMessage
      .mockResolvedValueOnce(response(UNPARSEABLE))
      .mockResolvedValueOnce(response(UNPARSEABLE))
      .mockResolvedValueOnce(response(UNPARSEABLE));

    const { error } = await review(makeReviewer());

    expect(error).toBeInstanceOf(ReviewParseExhaustedError);
    expect((error as Error).message).toMatch(
      /evaluateTranslation: the retry budget of 3 attempts ended on a reply that does not parse/
    );
    expect(comments).toEqual([]);
  });
});

describe('review call sites cap output with maxTokensFor(model, "review")', () => {
  const TRANSLATION_VERDICT = {
    accuracy: 9,
    fluency: 9,
    terminology: 9,
    formatting: 9,
    syntaxErrors: [],
    findings: [],
    strengths: [],
    summary: 'Fine.',
  };
  const DIFF_VERDICT = {
    scopeCorrect: true,
    positionCorrect: true,
    structurePreserved: true,
    headingMapCorrect: true,
    issues: [],
    summary: 'Fine.',
  };

  it.each([
    ['claude-sonnet-5', 8192],
    ['claude-opus-5-5', 32768],
  ])('%s → max_tokens %d on both review calls', async (model, expected) => {
    const reviewer = new TranslationReviewer('test-key', 'test-token', model);
    const caps: number[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (reviewer as any).callWithRetry = async (_p: string, maxTokens: number, operation: string) => {
      caps.push(maxTokens);
      return operation === 'evaluateTranslation' ? TRANSLATION_VERDICT : DIFF_VERDICT;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internals = reviewer as any;
    await internals.evaluateTranslation(
      'source',
      'target',
      [],
      ['lectures/x.md'],
      undefined,
      'zh-cn'
    );
    await internals.evaluateDiff('before', 'after', 'target before', 'target after', []);

    expect(caps).toEqual([expected, expected]);
  });
});

/**
 * Tests for the extracted REVIEW mode runner (#169, first slice)
 *
 * These are the first tests to exercise Action entry-point logic: runReview
 * was unreachable inside src/index.ts (no exports, `import.meta.url` at
 * module scope, bare `run()` call) until it moved to src/action/review.ts.
 *
 * Covers:
 * - Target-language detection from repository names
 * - Glossary resolution through the shared loader (built-in dir + custom path)
 * - The no-detectable-language warning path (review proceeds without glossary)
 * - Reviewer construction and reviewPR argument threading
 * - Action outputs, including the shadow-gate `would-auto-merge` conditional
 *   and the #164 usage/cost outputs
 * - Error propagation to the entry shim's catch
 */
import * as core from '@actions/core';
import * as github from '@actions/github';
import { runReview, detectTargetLanguage } from '../review.js';
import { getReviewInputs, validateReviewPREvent } from '../../inputs.js';
import { TranslationReviewer } from '../../reviewer.js';
import { loadGlossary, formatGlossaryTerms } from '../../sync-orchestrator.js';
import { coreLogger } from '../core-logger.js';
import { ReviewInputs } from '../../types.js';

jest.mock('@actions/core');
jest.mock('@actions/github', () => ({
  context: { repo: { owner: 'QuantEcon', repo: 'lecture-python.zh-cn' } },
}));
jest.mock('../../inputs.js', () => ({
  getReviewInputs: jest.fn(),
  validateReviewPREvent: jest.fn(),
}));
jest.mock('../../reviewer.js', () => ({
  TranslationReviewer: jest.fn(),
}));
jest.mock('../../sync-orchestrator.js', () => ({
  loadGlossary: jest.fn(),
  formatGlossaryTerms: jest.fn(),
}));

const mockedCore = core as jest.Mocked<typeof core>;
const mockedGetReviewInputs = getReviewInputs as jest.MockedFunction<typeof getReviewInputs>;
const mockedValidatePREvent = validateReviewPREvent as jest.MockedFunction<
  typeof validateReviewPREvent
>;
const mockedReviewer = TranslationReviewer as jest.MockedClass<typeof TranslationReviewer>;
const mockedLoadGlossary = loadGlossary as jest.MockedFunction<typeof loadGlossary>;
const mockedFormatGlossaryTerms = formatGlossaryTerms as jest.MockedFunction<
  typeof formatGlossaryTerms
>;

const GLOSSARY_DIR = '/bundle/glossary';

const baseInputs: ReviewInputs = {
  sourceRepo: 'QuantEcon/lecture-python.myst',
  maxSuggestions: 5,
  docsFolder: 'lectures/',
  sourceLanguage: 'en',
  glossaryPath: '',
  anthropicApiKey: 'test-key',
  claudeModel: 'claude-sonnet-5',
  githubToken: 'test-token',
  autoMergeMode: 'off',
};

const baseResult = {
  prNumber: 42,
  timestamp: '2026-08-19T00:00:00Z',
  translationQuality: { score: 9 },
  diffQuality: { score: 8 },
  overallScore: 8.5,
  verdict: 'PASS',
  recommendation: 'auto-merge',
  recommendationReasons: [],
  autoMergeMode: 'off',
  reviewedHeadSha: 'abc1234',
};

function setRepoName(repo: string) {
  (github.context.repo as { owner: string; repo: string }).repo = repo;
}

describe('detectTargetLanguage', () => {
  it.each([
    ['lecture-python.zh-cn', 'zh-cn'],
    ['lecture-python-programming.fa', 'fa'],
    ['lecture-python-programming.ml', 'ml'],
    ['repo.en-us', 'en-us'],
  ])('detects %s -> %s', (repoName, expected) => {
    expect(detectTargetLanguage(repoName)).toBe(expected);
  });

  it.each([
    ['lecture-python-programming'], // no suffix at all
    ['lecture-python.abc'], // three letters is not a language code
    ['lecture-python.a1'], // digits never match
    ['lecture-python.ZH-CN'], // uppercase never matches
  ])('returns undefined for %s', (repoName) => {
    expect(detectTargetLanguage(repoName)).toBeUndefined();
  });
});

describe('runReview', () => {
  let mockReviewPR: jest.Mock;
  let mockGetUsage: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    setRepoName('lecture-python.zh-cn');
    mockedGetReviewInputs.mockReturnValue({ ...baseInputs });
    mockedValidatePREvent.mockReturnValue({ prNumber: 42 });
    mockReviewPR = jest.fn().mockResolvedValue({ ...baseResult });
    mockGetUsage = jest.fn().mockReturnValue({ inputTokens: 100, outputTokens: 50, apiCalls: 2 });
    mockedReviewer.mockImplementation(
      () => ({ reviewPR: mockReviewPR, getUsage: mockGetUsage }) as unknown as TranslationReviewer
    );
    mockedLoadGlossary.mockResolvedValue(undefined);
    mockedFormatGlossaryTerms.mockReturnValue('TERM LIST');
  });

  it('constructs the reviewer from inputs and threads reviewPR arguments', async () => {
    await runReview(GLOSSARY_DIR);

    expect(mockedReviewer).toHaveBeenCalledWith('test-key', 'test-token', 'claude-sonnet-5', 5);
    expect(mockReviewPR).toHaveBeenCalledWith(
      42,
      'QuantEcon/lecture-python.myst',
      'QuantEcon',
      'lecture-python.zh-cn',
      'lectures/',
      undefined, // loadGlossary returned undefined -> no terms
      'zh-cn',
      'off'
    );
  });

  it('loads the glossary through the shared loader with the built-in dir and coreLogger', async () => {
    await runReview(GLOSSARY_DIR);

    expect(mockedLoadGlossary).toHaveBeenCalledWith('zh-cn', GLOSSARY_DIR, undefined, coreLogger);
  });

  it('formats and passes glossary terms when the loader finds a glossary', async () => {
    const glossary = { terms: [] };
    mockedLoadGlossary.mockResolvedValue(glossary as never);

    await runReview(GLOSSARY_DIR);

    expect(mockedFormatGlossaryTerms).toHaveBeenCalledWith(glossary, 'zh-cn');
    expect(mockReviewPR).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      'TERM LIST',
      'zh-cn',
      'off'
    );
  });

  it('forwards a custom glossary path, mapping the empty default to undefined', async () => {
    mockedGetReviewInputs.mockReturnValue({ ...baseInputs, glossaryPath: 'my/glossary.json' });

    await runReview(GLOSSARY_DIR);

    expect(mockedLoadGlossary).toHaveBeenCalledWith(
      'zh-cn',
      GLOSSARY_DIR,
      'my/glossary.json',
      coreLogger
    );
  });

  it('warns and reviews without a glossary when no language is detectable', async () => {
    setRepoName('lecture-python-programming');

    await runReview(GLOSSARY_DIR);

    expect(mockedLoadGlossary).not.toHaveBeenCalled();
    expect(mockedCore.warning).toHaveBeenCalledWith(
      expect.stringContaining('reviewing WITHOUT a glossary')
    );
    expect(mockReviewPR).toHaveBeenCalledWith(
      42,
      'QuantEcon/lecture-python.myst',
      'QuantEcon',
      'lecture-python-programming',
      'lectures/',
      undefined,
      undefined,
      'off'
    );
  });

  it('sets the verdict, score, recommendation, head-sha, and usage outputs', async () => {
    await runReview(GLOSSARY_DIR);

    expect(mockedCore.setOutput).toHaveBeenCalledWith('review-verdict', 'PASS');
    expect(mockedCore.setOutput).toHaveBeenCalledWith('translation-score', '9');
    expect(mockedCore.setOutput).toHaveBeenCalledWith('diff-score', '8');
    expect(mockedCore.setOutput).toHaveBeenCalledWith('review-recommendation', 'auto-merge');
    expect(mockedCore.setOutput).toHaveBeenCalledWith('reviewed-head-sha', 'abc1234');
    expect(mockedCore.setOutput).toHaveBeenCalledWith('input-tokens', '100');
    expect(mockedCore.setOutput).toHaveBeenCalledWith('output-tokens', '50');
    expect(mockedCore.setOutput).toHaveBeenCalledWith('api-calls', '2');
  });

  it('omits the would-auto-merge output when the result has none (off mode)', async () => {
    await runReview(GLOSSARY_DIR);

    const outputNames = mockedCore.setOutput.mock.calls.map((c) => c[0]);
    expect(outputNames).not.toContain('would-auto-merge');
  });

  it('emits would-auto-merge when shadow mode recorded a decision', async () => {
    mockReviewPR.mockResolvedValue({
      ...baseResult,
      autoMergeMode: 'shadow',
      wouldAutoMerge: true,
    });

    await runReview(GLOSSARY_DIR);

    expect(mockedCore.setOutput).toHaveBeenCalledWith('would-auto-merge', 'true');
  });

  it('propagates reviewer failures to the entry shim', async () => {
    mockReviewPR.mockRejectedValue(new Error('rate limited'));

    await expect(runReview(GLOSSARY_DIR)).rejects.toThrow('rate limited');
    expect(mockedCore.setOutput).not.toHaveBeenCalledWith('review-verdict', expect.anything());
  });
});

/**
 * Review mode on CLI forward resync PRs (#104).
 *
 * Resync PRs have no source PR — review mode previously threw
 * "Could not find source PR reference" and failed the workflow run.
 * With a translation-sync-metadata block (mode: "resync"), reviewPR must
 * fall back to reviewing the target against the source at the recorded
 * commit SHA.
 */

import { TranslationReviewer } from '../reviewer.js';
import { buildForwardPRBody } from '../cli/forward-pr-creator.js';

const SOURCE_SHA = '450bafecd23db638602150b47f4272b98aad3146';

const SOURCE_CONTENT = `# Cobweb Model\n\nIntro.\n\n## Overview\n\nSource overview.\n`;
const TARGET_BEFORE = `# 蛛网模型\n\n介绍。\n\n## 概述\n\n旧概述。\n`;
const TARGET_AFTER = `# 蛛网模型\n\n介绍。\n\n## 概述\n\n新概述。\n`;

function b64(content: string): string {
  return Buffer.from(content, 'utf-8').toString('base64');
}

function makeResyncBody(): string {
  return buildForwardPRBody(
    'cobweb.md',
    'QuantEcon/lecture-intro',
    'lectures',
    'Content changes detected',
    {
      sourceCommitSha: SOURCE_SHA,
      targetBaseSha: 'basesha',
      sourceLanguage: 'en',
      targetLanguage: 'zh-cn',
      model: 'claude-sonnet-5',
      statePath: '.translate/state/cobweb.md.yml',
    }
  );
}

interface GetContentCall {
  owner: string;
  repo: string;
  path: string;
  ref: string;
}

function makeFakeOctokit(prBody: string, getContentCalls: GetContentCall[]) {
  return {
    rest: {
      pulls: {
        get: async () => ({
          data: { body: prBody, head: { sha: 'headsha' }, base: { sha: 'basesha' } },
        }),
        listFiles: async () => ({ data: [] }),
      },
      repos: {
        getContent: async (params: GetContentCall) => {
          getContentCalls.push(params);
          if (params.repo === 'lecture-intro') {
            // Source repo — only the pinned commit SHA should ever be requested
            return { data: { content: b64(SOURCE_CONTENT) } };
          }
          // Target repo — head vs base
          const content = params.ref === 'headsha' ? TARGET_AFTER : TARGET_BEFORE;
          return { data: { content: b64(content) } };
        },
      },
    },
    paginate: async () => [
      { filename: 'lectures/cobweb.md', status: 'modified', additions: 5, deletions: 3 },
    ],
  };
}

function makeReviewer(prBody: string, getContentCalls: GetContentCall[], prompts: string[]) {
  const reviewer = new TranslationReviewer('fake-key', 'fake-token');
  // Not injectable via the constructor — patch the private clients
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (reviewer as any).octokit = makeFakeOctokit(prBody, getContentCalls);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (reviewer as any).callWithRetry = async (prompt: string, _max: number, operation: string) => {
    prompts.push(prompt);
    if (operation === 'evaluateTranslation') {
      return {
        accuracy: 9,
        fluency: 9,
        terminology: 9,
        formatting: 9,
        syntaxErrors: [],
        issues: [],
        strengths: ['good'],
        summary: 'Fine.',
      };
    }
    return {
      scopeCorrect: true,
      positionCorrect: true,
      structurePreserved: true,
      headingMapCorrect: true,
      issues: [],
      summary: 'Fine.',
      scopeDetails: 'ok',
      positionDetails: 'ok',
      structureDetails: 'ok',
    };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (reviewer as any).postReviewComment = async () => {};
  return reviewer;
}

describe('reviewPR on forward resync PRs (#104)', () => {
  it('reviews against the source at the recorded commit instead of throwing', async () => {
    const getContentCalls: GetContentCall[] = [];
    const prompts: string[] = [];
    const reviewer = makeReviewer(makeResyncBody(), getContentCalls, prompts);

    const result = await reviewer.reviewPR(
      7,
      'QuantEcon/lecture-intro',
      'QuantEcon',
      'lecture-intro.zh-cn',
      'lectures',
      undefined,
      'zh-cn'
    );

    expect(result.verdict).toBe('PASS');
    expect(result.overallScore).toBeGreaterThan(8);

    // Source content was fetched at the pinned commit from the metadata block
    const sourceCalls = getContentCalls.filter((c) => c.repo === 'lecture-intro');
    expect(sourceCalls.length).toBeGreaterThan(0);
    expect(sourceCalls.every((c) => c.ref === SOURCE_SHA)).toBe(true);

    // The quality prompt scopes the review to the whole file, not a diff
    const translationPrompt = prompts[0];
    expect(translationPrompt).toContain('whole-file resync');
    expect(translationPrompt).toContain('Source overview.');
    expect(translationPrompt).toContain('新概述');
  });

  it('still throws for PRs with neither a source PR reference nor metadata', async () => {
    const getContentCalls: GetContentCall[] = [];
    const prompts: string[] = [];
    const reviewer = makeReviewer('A hand-written PR body.', getContentCalls, prompts);

    await expect(
      reviewer.reviewPR(
        7,
        'QuantEcon/lecture-intro',
        'QuantEcon',
        'lecture-intro.zh-cn',
        'lectures',
        undefined,
        'zh-cn'
      )
    ).rejects.toThrow('Could not find source PR reference');
  });
});

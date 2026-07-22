/**
 * Reviewer verdict v2 (#103, #66): the machine-readable block, the categorical
 * recommendation rubric, and the shadow flag.
 *
 * The polarity under test throughout is fail-closed (#102): malformed
 * findings, unknown severities/categories, failed checks — anything
 * unexpected must route to `editor`, and a missing or unparseable block must
 * parse to undefined, never to a permissive default.
 */

import {
  CRITERION_FLOORS,
  REVIEW_VERDICT_SCHEMA_VERSION,
  ReviewVerdictV2,
  buildVerdictBlock,
  computeRecommendation,
  findingToDisplayString,
  getEngineVersion,
  normalizeFindings,
  parseReviewVerdict,
} from '../review-verdict.js';
import { TranslationReviewer } from '../reviewer.js';
import { ReviewFinding } from '../types.js';

const FILES = ['lectures/aiyagari.md', 'lectures/cobweb.md'];

function finding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    severity: 'minor',
    category: 'fluency',
    file: 'lectures/aiyagari.md',
    location: '## Model',
    description: 'Awkward phrasing.',
    suggestion: null,
    ...overrides,
  };
}

// ============================================================================
// normalizeFindings
// ============================================================================

describe('normalizeFindings', () => {
  it('passes well-formed findings through', () => {
    const raw = [
      {
        severity: 'minor',
        category: 'terminology',
        file: 'lectures/cobweb.md',
        location: '## 概述',
        description: 'Inconsistent term.',
        suggestion: '均衡',
      },
    ];
    const { findings, malformed } = normalizeFindings(raw, undefined, FILES);
    expect(malformed).toBe(false);
    expect(findings).toEqual([
      {
        severity: 'minor',
        category: 'terminology',
        file: 'lectures/cobweb.md',
        location: '## 概述',
        description: 'Inconsistent term.',
        suggestion: '均衡',
      },
    ]);
  });

  it('coerces unknown severity to major and unknown category to other (fail-closed)', () => {
    const raw = [{ severity: 'catastrophic', category: 'vibes', description: 'Bad.' }];
    const { findings } = normalizeFindings(raw, undefined, FILES);
    expect(findings[0].severity).toBe('major');
    expect(findings[0].category).toBe('other');
  });

  it('coerces a bare string to a major/other finding', () => {
    const { findings, malformed } = normalizeFindings(['Something is off.'], undefined, FILES);
    expect(malformed).toBe(false);
    expect(findings[0]).toMatchObject({
      severity: 'major',
      category: 'other',
      description: 'Something is off.',
    });
  });

  it('coerces legacy issues conservatively even when items carry severity-like fields', () => {
    const legacy = [{ severity: 'nit', category: 'fluency', description: 'Legacy shape.' }];
    const { findings, malformed } = normalizeFindings(undefined, legacy, FILES);
    expect(malformed).toBe(false);
    expect(findings[0].severity).toBe('major');
    expect(findings[0].category).toBe('other');
  });

  it('flags a non-array findings payload as malformed with no findings', () => {
    const { findings, malformed } = normalizeFindings('not an array', undefined, FILES);
    expect(malformed).toBe(true);
    expect(findings).toEqual([]);
  });

  it('flags a payload with neither findings nor issues as malformed', () => {
    const { findings, malformed } = normalizeFindings(undefined, undefined, FILES);
    expect(malformed).toBe(true);
    expect(findings).toEqual([]);
  });

  it('forces attribution on single-file PRs and nulls unknown files on multi-file PRs', () => {
    const raw = [{ severity: 'minor', category: 'accuracy', file: 'invented.md', description: 'x' }];
    const single = normalizeFindings(raw, undefined, ['lectures/only.md']);
    expect(single.findings[0].file).toBe('lectures/only.md');
    const multi = normalizeFindings(raw, undefined, FILES);
    expect(multi.findings[0].file).toBeNull();
  });

  it('keeps a valid claimed file on multi-file PRs', () => {
    const raw = [
      { severity: 'minor', category: 'accuracy', file: 'lectures/cobweb.md', description: 'x' },
    ];
    const { findings } = normalizeFindings(raw, undefined, FILES);
    expect(findings[0].file).toBe('lectures/cobweb.md');
  });

  it('sorts worst-first so the cap can never drop the most severe finding', () => {
    const raw = [
      ...Array.from({ length: 25 }, (_, i) => ({
        severity: 'nit',
        category: 'fluency',
        description: `nit ${i}`,
      })),
      { severity: 'blocker', category: 'accuracy', description: 'meaning inverted' },
    ];
    const { findings } = normalizeFindings(raw, undefined, FILES);
    expect(findings.length).toBe(20);
    expect(findings[0].severity).toBe('blocker');
  });
});

// ============================================================================
// computeRecommendation
// ============================================================================

const CLEAN_INPUT = {
  verdict: 'PASS' as const,
  scores: { accuracy: 9, fluency: 9, terminology: 9, formatting: 9 },
  diffChecks: {
    scopeCorrect: true,
    positionCorrect: true,
    structurePreserved: true,
    headingMapCorrect: true,
  },
  syntaxErrorCount: 0,
  findings: [] as ReviewFinding[],
  findingsMalformed: false,
};

describe('computeRecommendation', () => {
  it('recommends auto-merge for a clean PASS with floors met', () => {
    const { recommendation, reasons } = computeRecommendation(CLEAN_INPUT);
    expect(recommendation).toBe('auto-merge');
    expect(reasons).toEqual([]);
  });

  it('routes WARN and FAIL verdicts to editor', () => {
    for (const verdict of ['WARN', 'FAIL'] as const) {
      const { recommendation, reasons } = computeRecommendation({ ...CLEAN_INPUT, verdict });
      expect(recommendation).toBe('editor');
      expect(reasons.join()).toContain(verdict);
    }
  });

  it('routes syntax errors to editor', () => {
    const out = computeRecommendation({ ...CLEAN_INPUT, syntaxErrorCount: 2 });
    expect(out.recommendation).toBe('editor');
    expect(out.reasons.join()).toContain('syntax error');
  });

  it('names the failed diff check', () => {
    const out = computeRecommendation({
      ...CLEAN_INPUT,
      diffChecks: { ...CLEAN_INPUT.diffChecks, positionCorrect: false },
    });
    expect(out.recommendation).toBe('editor');
    expect(out.reasons.join()).toContain('positionCorrect');
  });

  it('routes a malformed findings payload to editor (fail-closed)', () => {
    const out = computeRecommendation({ ...CLEAN_INPUT, findingsMalformed: true });
    expect(out.recommendation).toBe('editor');
    expect(out.reasons.join()).toContain('malformed');
  });

  it('blocker and major findings gate in any category', () => {
    for (const severity of ['blocker', 'major'] as const) {
      const out = computeRecommendation({
        ...CLEAN_INPUT,
        findings: [finding({ severity, category: 'formatting' })],
      });
      expect(out.recommendation).toBe('editor');
      expect(out.reasons.join()).toContain(severity);
    }
  });

  it('a minor finding gates in accuracy/terminology/other but not in fluency/formatting', () => {
    for (const category of ['accuracy', 'terminology', 'other'] as const) {
      const out = computeRecommendation({
        ...CLEAN_INPUT,
        findings: [finding({ severity: 'minor', category })],
      });
      expect(out.recommendation).toBe('editor');
    }
    for (const category of ['fluency', 'formatting'] as const) {
      const out = computeRecommendation({
        ...CLEAN_INPUT,
        findings: [finding({ severity: 'minor', category })],
      });
      expect(out.recommendation).toBe('auto-merge');
    }
  });

  it('nit findings never gate', () => {
    const out = computeRecommendation({
      ...CLEAN_INPUT,
      findings: [finding({ severity: 'nit', category: 'accuracy' })],
    });
    expect(out.recommendation).toBe('auto-merge');
  });

  it('enforces the provisional per-criterion floors', () => {
    const out = computeRecommendation({
      ...CLEAN_INPUT,
      scores: { ...CLEAN_INPUT.scores, accuracy: CRITERION_FLOORS.accuracy - 0.5 },
    });
    expect(out.recommendation).toBe('editor');
    expect(out.reasons.join()).toContain('accuracy');
    expect(out.reasons.join()).toContain('below floor');
  });

  it('a NaN criterion score fails its floor (fail-closed)', () => {
    const out = computeRecommendation({
      ...CLEAN_INPUT,
      scores: { ...CLEAN_INPUT.scores, terminology: NaN },
    });
    expect(out.recommendation).toBe('editor');
  });
});

// ============================================================================
// Block serialisation and parsing
// ============================================================================

function makeVerdict(overrides: Partial<ReviewVerdictV2> = {}): ReviewVerdictV2 {
  return {
    schemaVersion: REVIEW_VERDICT_SCHEMA_VERSION,
    engineVersion: '0.22.0',
    reviewerModel: 'claude-sonnet-5',
    reviewedHeadSha: 'abc123',
    targetBaseSha: 'def456',
    sourceRepo: 'QuantEcon/lecture-python-programming',
    prNumber: 42,
    timestamp: '2026-07-22T00:00:00.000Z',
    verdict: 'PASS',
    recommendation: 'editor',
    recommendationReasons: ['1 major finding(s)'],
    autoMergeMode: 'shadow',
    wouldAutoMerge: false,
    scores: {
      accuracy: 9,
      fluency: 9,
      terminology: 8,
      formatting: 10,
      translation: 8.9,
      diff: 10,
      overall: 9.2,
    },
    diffChecks: {
      scopeCorrect: true,
      positionCorrect: true,
      structurePreserved: true,
      headingMapCorrect: true,
    },
    syntaxErrorCount: 0,
    findings: [finding({ severity: 'major', category: 'accuracy' })],
    ...overrides,
  };
}

describe('buildVerdictBlock / parseReviewVerdict', () => {
  it('round-trips a verdict through a comment body', () => {
    const verdict = makeVerdict();
    const comment = `## Review\n\nProse report here.\n\n${buildVerdictBlock(verdict)}`;
    expect(parseReviewVerdict(comment)).toEqual(verdict);
  });

  it('neutralises comment-terminating sequences in model text without altering the data', () => {
    const hostile = finding({
      description: 'The arrow x --> y is wrong',
      suggestion: 'use x --!> y instead',
    });
    const verdict = makeVerdict({ findings: [hostile] });
    const block = buildVerdictBlock(verdict);
    // The only comment terminator is the block's own closing marker
    expect(block.indexOf('-->')).toBe(block.lastIndexOf('-->'));
    expect(block.endsWith('-->')).toBe(true);
    expect(block).not.toContain('--!>');
    const parsed = parseReviewVerdict(block);
    expect(parsed?.findings[0].description).toBe('The arrow x --> y is wrong');
    expect(parsed?.findings[0].suggestion).toBe('use x --!> y instead');
  });

  it('returns undefined for a comment without a block', () => {
    expect(parseReviewVerdict('## Review\n\nNo block here.')).toBeUndefined();
  });

  it('returns undefined for invalid JSON', () => {
    const body = '<!-- translation-review-verdict\n{not json}\n-->';
    expect(parseReviewVerdict(body)).toBeUndefined();
  });

  it('returns undefined for a wrong schema version', () => {
    const comment = buildVerdictBlock(makeVerdict({ schemaVersion: 99 }));
    expect(parseReviewVerdict(comment)).toBeUndefined();
  });

  it('returns undefined when required fields are missing or invalid', () => {
    expect(
      parseReviewVerdict(buildVerdictBlock(makeVerdict({ verdict: 'MAYBE' as never })))
    ).toBeUndefined();
    expect(
      parseReviewVerdict(buildVerdictBlock(makeVerdict({ recommendation: 'merge' as never })))
    ).toBeUndefined();
    expect(
      parseReviewVerdict(buildVerdictBlock(makeVerdict({ reviewedHeadSha: '' })))
    ).toBeUndefined();
    expect(
      parseReviewVerdict(buildVerdictBlock(makeVerdict({ findings: 'none' as never })))
    ).toBeUndefined();
  });
});

describe('findingToDisplayString', () => {
  it('renders severity, category, location and suggestion', () => {
    const s = findingToDisplayString(
      finding({ severity: 'major', category: 'accuracy', suggestion: 'better text' })
    );
    expect(s).toContain('[major · accuracy]');
    expect(s).toContain('lectures/aiyagari.md');
    expect(s).toContain('## Model');
    expect(s).toContain('→ better text');
  });
});

describe('getEngineVersion', () => {
  it('resolves the package version', () => {
    expect(getEngineVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

// ============================================================================
// reviewPR end-to-end: the block on a live-shaped review
// ============================================================================

const SOURCE_CONTENT = '# Aiyagari\n\nIntro.\n\n## Model\n\nSource text.\n';
const TARGET_CONTENT = '# 艾亚加里\n\n介绍。\n\n## 模型\n\n译文。\n';

function b64(content: string): string {
  return Buffer.from(content, 'utf-8').toString('base64');
}

const SYNC_PR_BODY = `## Automated Translation Sync

### Source PR
**[#5 - Update model section](https://github.com/QuantEcon/lecture-python-programming/pull/5)**
`;

function makeFakeOctokit() {
  return {
    rest: {
      pulls: {
        get: async (params: { repo: string }) => ({
          data:
            params.repo === 'lecture-python-programming'
              ? { base: { sha: 'srcbase' }, head: { sha: 'srchead' } }
              : { body: SYNC_PR_BODY, head: { sha: 'headsha' }, base: { sha: 'basesha' } },
        }),
        listFiles: async () => ({ data: [] }),
      },
      repos: {
        getContent: async (params: { repo: string; ref: string }) => ({
          data: {
            content: params.repo === 'lecture-python-programming' ? b64(SOURCE_CONTENT) : b64(TARGET_CONTENT),
          },
        }),
      },
    },
    paginate: async (_fn: unknown, params: { repo: string }) =>
      params.repo === 'lecture-python-programming'
        ? [{ filename: 'lectures/aiyagari.md', status: 'modified', additions: 2, deletions: 1 }]
        : [{ filename: 'lectures/aiyagari.md', status: 'modified', additions: 2, deletions: 1 }],
  };
}

function makeReviewer(
  translationResponse: Record<string, unknown>,
  captured: { comment?: string }
) {
  const reviewer = new TranslationReviewer('fake-key', 'fake-token');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (reviewer as any).octokit = makeFakeOctokit();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (reviewer as any).callWithRetry = async (_p: string, _m: number, operation: string) =>
    operation === 'evaluateTranslation'
      ? translationResponse
      : {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (reviewer as any).postReviewComment = async (
    _pr: number,
    _owner: string,
    _repo: string,
    comment: string
  ) => {
    captured.comment = comment;
  };
  return reviewer;
}

const CLEAN_RESPONSE = {
  accuracy: 9,
  fluency: 9,
  terminology: 9,
  formatting: 9,
  syntaxErrors: [],
  findings: [],
  strengths: ['good'],
  summary: 'Fine.',
};

async function runReview(
  translationResponse: Record<string, unknown>,
  autoMergeMode: 'off' | 'shadow',
  captured: { comment?: string }
) {
  const reviewer = makeReviewer(translationResponse, captured);
  return reviewer.reviewPR(
    42,
    'QuantEcon/lecture-python-programming',
    'QuantEcon',
    'lecture-python-programming.zh-cn',
    'lectures',
    undefined,
    'zh-cn',
    autoMergeMode
  );
}

describe('reviewPR verdict block emission', () => {
  it('embeds a parseable block bound to the reviewed head SHA', async () => {
    const captured: { comment?: string } = {};
    const result = await runReview(CLEAN_RESPONSE, 'off', captured);

    expect(result.verdict).toBe('PASS');
    expect(result.recommendation).toBe('auto-merge');
    expect(result.reviewedHeadSha).toBe('headsha');
    expect(result.autoMergeMode).toBe('off');
    expect(result.wouldAutoMerge).toBeUndefined();

    const block = parseReviewVerdict(captured.comment!);
    expect(block).toBeDefined();
    expect(block!.reviewedHeadSha).toBe('headsha');
    expect(block!.targetBaseSha).toBe('basesha');
    expect(block!.recommendation).toBe('auto-merge');
    expect(block!.autoMergeMode).toBe('off');
    expect(block!.wouldAutoMerge).toBeUndefined();
    expect(block!.scores.overall).toBe(result.overallScore);
    expect(block!.reviewerModel).toBeTruthy();
    expect(block!.engineVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('records the shadow decision without acting', async () => {
    const captured: { comment?: string } = {};
    const result = await runReview(CLEAN_RESPONSE, 'shadow', captured);

    expect(result.wouldAutoMerge).toBe(true);
    const block = parseReviewVerdict(captured.comment!);
    expect(block!.autoMergeMode).toBe('shadow');
    expect(block!.wouldAutoMerge).toBe(true);
    expect(captured.comment).toContain('**Shadow gate**: would auto-merge');
  });

  it('a gating finding flips the shadow decision and the reasons say why', async () => {
    const captured: { comment?: string } = {};
    const result = await runReview(
      {
        ...CLEAN_RESPONSE,
        findings: [
          {
            severity: 'minor',
            category: 'terminology',
            file: 'lectures/aiyagari.md',
            location: '## 模型',
            description: 'Glossary term drifted.',
            suggestion: '模型',
          },
        ],
      },
      'shadow',
      captured
    );

    expect(result.recommendation).toBe('editor');
    expect(result.wouldAutoMerge).toBe(false);
    expect(result.recommendationReasons.join()).toContain('minor finding(s) in gating categories');
    const block = parseReviewVerdict(captured.comment!);
    expect(block!.findings).toHaveLength(1);
    expect(block!.findings[0].category).toBe('terminology');
    expect(captured.comment).toContain('**Routing**: `editor`');
  });
});

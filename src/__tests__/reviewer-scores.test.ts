/**
 * Criterion-score validation in review mode (#102).
 *
 * A model response missing one of the four criteria previously produced
 * `undefined * weight` → NaN → both verdict thresholds false → automatic
 * FAIL on a clean PR, rendered as "undefined/10" / "NaN/10". Incomplete
 * responses must be retried, and a still-incomplete response must be an
 * error — never a verdict.
 */

import { TranslationReviewer, computeVerdict, validateCriterionScores } from '../reviewer.js';

function without(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

const COMPLETE = {
  accuracy: 10,
  fluency: 9,
  terminology: 10,
  formatting: 8,
  syntaxErrors: [],
  issues: [],
  strengths: ['good'],
  summary: 'Fine.',
};

describe('validateCriterionScores', () => {
  it('accepts a complete response', () => {
    const check = validateCriterionScores(COMPLETE);
    expect(check.valid).toBe(true);
    expect(check.scores).toEqual({ accuracy: 10, fluency: 9, terminology: 10, formatting: 8 });
  });

  it('rejects a response missing a criterion, naming it', () => {
    const check = validateCriterionScores(without(COMPLETE, 'formatting'));
    expect(check.valid).toBe(false);
    expect(check.missing).toEqual(['formatting']);
  });

  it('rejects non-numeric and NaN values', () => {
    expect(validateCriterionScores({ ...COMPLETE, accuracy: 'excellent' }).missing).toEqual([
      'accuracy',
    ]);
    expect(validateCriterionScores({ ...COMPLETE, fluency: NaN }).missing).toEqual(['fluency']);
    expect(validateCriterionScores({ ...COMPLETE, terminology: null }).missing).toEqual([
      'terminology',
    ]);
  });

  it('coerces numeric strings', () => {
    const check = validateCriterionScores({ ...COMPLETE, formatting: '8' });
    expect(check.valid).toBe(true);
    expect(check.scores?.formatting).toBe(8);
  });
});

describe('evaluateTranslation criterion validation (#102)', () => {
  function makeReviewer(responses: Array<Record<string, unknown>>) {
    const reviewer = new TranslationReviewer('fake-key', 'fake-token');
    let call = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (reviewer as any).callWithRetry = async () => responses[Math.min(call++, responses.length - 1)];
    return reviewer;
  }

  async function evaluate(reviewer: TranslationReviewer) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (reviewer as any).evaluateTranslation(
      'source',
      'target',
      [],
      ['lectures/x.md'],
      undefined,
      'zh-cn'
    );
  }

  it('computes a numeric score from a complete response', async () => {
    const result = await evaluate(makeReviewer([COMPLETE]));
    // 10*.35 + 9*.25 + 10*.25 + 8*.15 = 9.45 → 9.5 after rounding
    expect(result.score).toBe(9.5);
    expect(Number.isNaN(result.score)).toBe(false);
  });

  it('retries once when a criterion is missing and uses the complete retry', async () => {
    const result = await evaluate(makeReviewer([without(COMPLETE, 'formatting'), COMPLETE]));
    expect(result.score).toBe(9.5);
    expect(result.formatting).toBe(8);
  });

  it('throws — never a NaN verdict — when the retry is also incomplete', async () => {
    const partial = without(COMPLETE, 'formatting');
    await expect(evaluate(makeReviewer([partial, partial]))).rejects.toThrow(
      'missing numeric criterion scores [formatting]'
    );
  });

  it('coerces a non-array strengths to [] instead of crashing the comment builder (#163)', async () => {
    const result = await evaluate(makeReviewer([{ ...COMPLETE, strengths: 'good' }]));
    expect(result.strengths).toEqual([]);
  });
});

describe('computeVerdict thresholds (#163)', () => {
  it('passes a clean review at exactly 8.0', () => {
    // 8.0 * 0.7 + 8.0 * 0.3 = 8.0
    expect(computeVerdict(8, 8, [])).toEqual({ overallScore: 8, verdict: 'PASS' });
  });

  it('holds a high-scoring review at WARN when syntax errors exist', () => {
    // The previously-unasserted interaction term: scores alone would PASS.
    expect(computeVerdict(10, 10, ['unclosed fence']).verdict).toBe('WARN');
  });

  it('warns between the thresholds', () => {
    expect(computeVerdict(7, 7, []).verdict).toBe('WARN');
  });

  it('fails below 6 — including 6/6, which floating point puts a hair under', () => {
    expect(computeVerdict(5.9, 5.9, []).verdict).toBe('FAIL');
    // Characterization, not design: 6*0.7 + 6*0.3 === 5.999999999999999 in
    // IEEE 754, so a review scoring exactly 6 on both axes has always been
    // FAIL. The extraction preserves that; changing it is a behaviour change.
    expect(computeVerdict(6, 6, []).verdict).toBe('FAIL');
  });

  it('weights translation 0.7 and diff 0.3', () => {
    expect(computeVerdict(10, 0, []).overallScore).toBeCloseTo(7);
    expect(computeVerdict(0, 10, []).overallScore).toBeCloseTo(3);
  });
});

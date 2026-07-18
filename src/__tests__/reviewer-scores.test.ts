/**
 * Criterion-score validation in review mode (#102).
 *
 * A model response missing one of the four criteria previously produced
 * `undefined * weight` → NaN → both verdict thresholds false → automatic
 * FAIL on a clean PR, rendered as "undefined/10" / "NaN/10". Incomplete
 * responses must be retried, and a still-incomplete response must be an
 * error — never a verdict.
 */

import { TranslationReviewer, validateCriterionScores } from '../reviewer.js';

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
    return (reviewer as any).evaluateTranslation('source', 'target', [], undefined, 'zh-cn');
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
});

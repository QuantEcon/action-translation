/**
 * The one list-price table (model-pricing.ts).
 *
 * A model missing from a script's own price table was priced at $0.000 for
 * weeks (#230). These invariants make a model the engine can be run on
 * impossible to leave unpriced, and pin the arithmetic, cache tokens included.
 */

import {
  ApiUsage,
  DEFAULT_CLAUDE_MODEL,
  MODEL_REQUEST_POLICIES,
  VALID_MODEL_PATTERNS,
  emptyApiUsage,
} from '../models.js';
import { MODEL_PRICING, costUSD, priceFor } from '../model-pricing.js';

/** The bare IDs VALID_MODEL_PATTERNS names exactly (no dated snapshots). */
const BARE_RECOGNIZED_IDS = VALID_MODEL_PATTERNS.map((pattern) =>
  /^\^(claude-[a-z0-9-]+)\$$/.exec(pattern.source)
)
  .filter((match): match is RegExpExecArray => match !== null)
  .map((match) => match[1]);

describe('MODEL_PRICING coverage', () => {
  it('prices the default model', () => {
    expect(priceFor(DEFAULT_CLAUDE_MODEL)).toBeDefined();
  });

  it.each(Object.keys(MODEL_REQUEST_POLICIES))('prices %s, which has a request policy', (model) => {
    expect(priceFor(model)).toBeDefined();
  });

  it('prices every bare model ID VALID_MODEL_PATTERNS recognizes', () => {
    expect(BARE_RECOGNIZED_IDS.length).toBeGreaterThanOrEqual(12);
    expect(BARE_RECOGNIZED_IDS.filter((model) => !priceFor(model))).toEqual([]);
  });
});

describe('MODEL_PRICING entries', () => {
  it('pins the prices read from each model card', () => {
    expect(MODEL_PRICING['claude-opus-5-5']).toEqual({
      in: 4,
      out: 20,
      cacheRead: 0.2,
      cacheWrite5m: 5,
      cachePricesEstimated: false,
    });
    expect(MODEL_PRICING['claude-sonnet-5-5']).toEqual({
      in: 2,
      out: 10,
      cacheRead: 0.2,
      cacheWrite5m: 2.5,
      cachePricesEstimated: false,
    });
    expect(MODEL_PRICING['claude-sonnet-5']).toEqual(MODEL_PRICING['claude-sonnet-5-5']);
    // Fable 5.1 reads the cache at 0.025× of input, not the 0.1× a derivation gives.
    expect(MODEL_PRICING['claude-fable-5-1']).toEqual({
      in: 10,
      out: 50,
      cacheRead: 0.25,
      cacheWrite5m: 12.5,
      cachePricesEstimated: false,
    });
    expect(MODEL_PRICING['claude-haiku-5-5']).toMatchObject({ in: 0.1, out: 0.5 });
  });

  it('derives an estimated cache price at 0.1× (read) and 1.25× (5-minute write) of input', () => {
    const estimated = Object.entries(MODEL_PRICING).filter(([, p]) => p.cachePricesEstimated);
    expect(estimated.map(([model]) => model).sort()).toEqual([
      'claude-fable-5',
      'claude-haiku-4-5',
      'claude-haiku-5-5',
      'claude-opus-4-6',
      'claude-opus-4-7',
      'claude-opus-4-8',
      'claude-opus-5',
      'claude-sonnet-4-6',
    ]);
    for (const [, price] of estimated) {
      expect(price.cacheRead).toBeCloseTo(price.in * 0.1, 10);
      expect(price.cacheWrite5m).toBeCloseTo(price.in * 1.25, 10);
    }
  });
});

describe('costUSD', () => {
  it('prices input, output, cache reads and cache writes at the list price', () => {
    const usage = {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadInputTokens: 9000,
      cacheCreationInputTokens: 2000,
    };
    // claude-sonnet-5: (1000×2 + 500×10 + 9000×0.2 + 2000×2.5) / 1e6
    expect(costUSD('claude-sonnet-5', usage)).toBeCloseTo(0.0138, 10);
    // claude-opus-5-5: (1000×4 + 500×20 + 9000×0.2 + 2000×5) / 1e6
    expect(costUSD('claude-opus-5-5', usage)).toBeCloseTo(0.0258, 10);
  });

  it('does not price thinking again: it is part of outputTokens', () => {
    const noThinking: ApiUsage = { ...emptyApiUsage(), outputTokens: 1_000_000 };
    const mostlyThinking: ApiUsage = { ...noThinking, thinkingTokens: 600_000 };
    expect(costUSD('claude-opus-5-5', noThinking)).toBe(20);
    expect(costUSD('claude-opus-5-5', mostlyThinking)).toBe(20);
  });

  it('is 0 for a priced model with no usage — zero is a real cost', () => {
    expect(costUSD('claude-sonnet-5', emptyApiUsage())).toBe(0);
  });

  it('is null, not 0, for a model with no price', () => {
    expect(costUSD('claude-sonnet-6', emptyApiUsage())).toBeNull();
    expect(costUSD('claude-sonnet-4-5-20250929', emptyApiUsage())).toBeNull();
    expect(priceFor('claude-sonnet-6')).toBeUndefined();
  });

  it('never resolves an ID up the prototype chain', () => {
    expect(priceFor('toString')).toBeUndefined();
    expect(costUSD('constructor', emptyApiUsage())).toBeNull();
  });
});

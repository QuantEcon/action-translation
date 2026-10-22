/**
 * Claude list prices — the one table every tool prices usage from.
 *
 * Each script used to carry its own copy, and a model missing from one priced
 * every call at $0.000 for weeks without anything looking wrong (#230). So an
 * unpriced model is `null` here, never 0: zero is a legitimate cost (a
 * cache-only response), and callers print "unpriced" loudly instead.
 *
 * USD per million tokens, Anthropic list prices checked 2026-10-19. Cache
 * writes are priced at the 5-minute TTL, the only one the engine requests
 * (`cache_control: {type: 'ephemeral'}` with no `ttl`).
 */

import type { ApiUsage } from './models.js';

/** One model's list prices, USD per million tokens. */
export interface ModelPrice {
  /** Uncached input. */
  in: number;
  /** Output, thinking included. */
  out: number;
  /** Prompt-cache reads. */
  cacheRead: number;
  /** Prompt-cache writes at the 5-minute TTL. */
  cacheWrite5m: number;
  /** True when the cache prices are derived from `in` (reads 0.1×, 5-minute
   * writes 1.25×) rather than read from the model's own price card. */
  cachePricesEstimated: boolean;
}

/** Input and output from the model's price card; cache prices derived from the input price. */
function derivedCachePrices(input: number, output: number): ModelPrice {
  return {
    in: input,
    out: output,
    cacheRead: input / 10,
    cacheWrite5m: input * 1.25,
    cachePricesEstimated: true,
  };
}

/**
 * Exact model ID → list price. model-pricing.test.ts requires an entry for the
 * default model, for every model with a request policy, and for every bare ID
 * `VALID_MODEL_PATTERNS` recognizes.
 */
export const MODEL_PRICING: Readonly<Record<string, ModelPrice>> = {
  // Every price read from the model's own card. Opus 5.5 and Fable 5.1 read
  // the cache below the 0.1× rule (0.05× and 0.025× of input).
  'claude-opus-5-5': {
    in: 4,
    out: 20,
    cacheRead: 0.2,
    cacheWrite5m: 5,
    cachePricesEstimated: false,
  },
  'claude-sonnet-5-5': {
    in: 2,
    out: 10,
    cacheRead: 0.2,
    cacheWrite5m: 2.5,
    cachePricesEstimated: false,
  },
  'claude-sonnet-5': {
    in: 2,
    out: 10,
    cacheRead: 0.2,
    cacheWrite5m: 2.5,
    cachePricesEstimated: false,
  },
  'claude-fable-5-1': {
    in: 10,
    out: 50,
    cacheRead: 0.25,
    cacheWrite5m: 12.5,
    cachePricesEstimated: false,
  },
  'claude-fable-5': derivedCachePrices(10, 50),
  'claude-opus-5': derivedCachePrices(5, 25),
  'claude-opus-4-8': derivedCachePrices(5, 25),
  'claude-opus-4-7': derivedCachePrices(5, 25),
  'claude-opus-4-6': derivedCachePrices(5, 25),
  'claude-sonnet-4-6': derivedCachePrices(3, 15),
  'claude-haiku-4-5': derivedCachePrices(1, 5),
  // The card for prompts of 100K tokens or fewer; a longer prompt is billed
  // $0.50 / $2.50. costUSD prices accumulated usage and cannot see one
  // prompt's length, so it always uses this card; translation prompts stay
  // under 100K.
  'claude-haiku-5-5': derivedCachePrices(0.1, 0.5),
};

/** The list price of a model ID, or undefined when the table has no entry. */
export function priceFor(model: string): ModelPrice | undefined {
  // Own properties only: a bare index would resolve 'toString' up the prototype chain.
  return Object.hasOwn(MODEL_PRICING, model) ? MODEL_PRICING[model] : undefined;
}

/**
 * The USD cost of accumulated usage at a model's list price, or `null` when
 * the model has no price (not 0 — see the module comment). Thinking tokens are
 * part of `outputTokens` and are not priced again.
 */
export function costUSD(
  model: string,
  usage: Pick<
    ApiUsage,
    'inputTokens' | 'outputTokens' | 'cacheReadInputTokens' | 'cacheCreationInputTokens'
  >
): number | null {
  const price = priceFor(model);
  if (!price) {
    return null;
  }
  return (
    (usage.inputTokens * price.in +
      usage.outputTokens * price.out +
      usage.cacheReadInputTokens * price.cacheRead +
      usage.cacheCreationInputTokens * price.cacheWrite5m) /
    1e6
  );
}

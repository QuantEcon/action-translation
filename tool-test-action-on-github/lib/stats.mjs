#!/usr/bin/env node
/**
 * stats.mjs — the statistics behind rate-check and the evaluation projects. Pure ESM, no
 * dependencies. `node stats.mjs --self-test` checks every function against values computed
 * independently (exact rational arithmetic, and R's `mantelhaen.test(UCBAdmissions)`), and
 * exits non-zero on any mismatch. CI runs it (src/__tests__/eval-tooling.test.ts).
 *
 * Orientation of every 2×2 table: [[a, b], [c, d]], ROWS are the arms and COLUMNS are
 * (failures, successes):
 *
 *     a = candidate failures   b = candidate successes
 *     c = baseline failures    d = baseline successes
 *
 * so the one-sided "candidate worse" p-value is `greater` (fisherExact) or `pGreater`
 * (cmh, stratifiedExact), and `mhRiskDifference` reports candidate minus baseline.
 *
 * Doctrine (#227): rates carry Wilson 95% intervals, contrasts carry an exact test, and a
 * cell sized below its stated power is advisory. A p-value of 1 from a table with no
 * information (`informative: false`) is not evidence of "no difference".
 */

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ─── internals ──────────────────────────────────────────────────────────────

const LOG_FACTORIAL = [0];

/** ln(n!), from a cached running sum (exact enough for n up to ~1e6). */
function logFactorial(n) {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`logFactorial: bad argument ${n}`);
  for (let i = LOG_FACTORIAL.length; i <= n; i++) {
    LOG_FACTORIAL.push(LOG_FACTORIAL[i - 1] + Math.log(i));
  }
  return LOG_FACTORIAL[n];
}

function logChoose(n, k) {
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

function assertCounts(name, values) {
  for (const v of values) {
    if (!Number.isInteger(v) || v < 0) {
      throw new RangeError(
        `${name}: counts must be non-negative integers, got ${values.join(', ')}`
      );
    }
  }
}

/** A 2×2 table given as [[a, b], [c, d]] → [a, b, c, d], validated. */
function unpackTable(name, table) {
  if (
    !Array.isArray(table) ||
    table.length !== 2 ||
    !table.every((r) => Array.isArray(r) && r.length === 2)
  ) {
    throw new TypeError(`${name}: each stratum must be [[a, b], [c, d]]`);
  }
  const cells = [table[0][0], table[0][1], table[1][0], table[1][1]];
  assertCounts(name, cells);
  return cells;
}

/**
 * The conditional distribution of a (row-1 failures) given the margins: hypergeometric with
 * row totals n1, n2 and column total m. Computed in log space and normalised by its own sum,
 * so a pooled table of hundreds of draws neither overflows nor underflows.
 */
function hypergeometric(n1, n2, m) {
  const lo = Math.max(0, m - n2);
  const hi = Math.min(n1, m);
  const logs = [];
  let max = -Infinity;
  for (let k = lo; k <= hi; k++) {
    const l = logChoose(n1, k) + logChoose(n2, m - k);
    logs.push(l);
    if (l > max) max = l;
  }
  const weights = logs.map((l) => Math.exp(l - max));
  const total = weights.reduce((s, w) => s + w, 0);
  return { lo, pmf: weights.map((w) => w / total) };
}

/** R's tolerance for "as or less likely than observed" (fisher.test's relErr). */
const REL_ERR = 1 + 1e-7;

/** Tail sums and the minimum-likelihood two-sided p of a discrete distribution at `observed`. */
function discreteTests(lo, pmf, observed) {
  const pObs = pmf[observed - lo];
  let greater = 0;
  let less = 0;
  let twoSided = 0;
  pmf.forEach((p, i) => {
    const k = lo + i;
    if (k >= observed) greater += p;
    if (k <= observed) less += p;
    if (p <= pObs * REL_ERR) twoSided += p;
  });
  return {
    twoSided: Math.min(1, twoSided),
    greater: Math.min(1, greater),
    less: Math.min(1, less),
  };
}

/** Standard normal Φ(x) by Marsaglia's series (2004); accurate where |x| ≤ 3. */
function phiSeries(x) {
  let s = x;
  let t = 0;
  let b = x;
  const q = x * x;
  let i = 1;
  while (s !== t) {
    t = s;
    i += 2;
    b *= q / i;
    s = t + b;
  }
  return 0.5 + s * Math.exp(-0.5 * q - 0.91893853320467274178);
}

/** Standard normal upper tail P(Z ≥ z), with relative accuracy in the far tail too. */
export function normalSf(z) {
  if (Number.isNaN(z)) return NaN;
  if (z < 0) return 1 - normalSf(-z);
  if (z <= 3) return phiSeries(-z);
  // Mills ratio by its continued fraction, evaluated backwards: sf(z) = φ(z) / (z + 1/(z + 2/(z + …))).
  let f = z;
  for (let k = 300; k >= 1; k--) f = z + k / f;
  return Math.exp(-0.5 * z * z - 0.91893853320467274178) / f;
}

// ─── rates ──────────────────────────────────────────────────────────────────

/**
 * Wilson score interval for k successes (or failures) in n trials. n = 0 carries no
 * information: {lo: 0, hi: 1}.
 */
export function wilson(k, n, z = 1.959964) {
  assertCounts('wilson', [k, n]);
  if (k > n) throw new RangeError(`wilson: k (${k}) exceeds n (${n})`);
  if (n === 0) return { lo: 0, hi: 1 };
  const p = k / n;
  const z2 = z * z;
  const den = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const half = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { lo: Math.max(0, (centre - half) / den), hi: Math.min(1, (centre + half) / den) };
}

// ─── 2×2 contrasts ──────────────────────────────────────────────────────────

/**
 * Fisher's exact test for [[a, b], [c, d]] (rows = arms, columns = failures/successes).
 *   greater  = P(row-1 failures ≥ a | margins) — one-sided "row 1 worse"
 *   less     = P(row-1 failures ≤ a | margins)
 *   twoSided = sum of P(x) over every x no more likely than the observed table
 *              (R's convention, relative tolerance 1e-7), capped at 1
 */
export function fisherExact(a, b, c, d) {
  assertCounts('fisherExact', [a, b, c, d]);
  const { lo, pmf } = hypergeometric(a + b, c + d, a + c);
  return discreteTests(lo, pmf, a);
}

/**
 * The exact conditional test across strata (Birch; Mehta et al.): the null distribution of
 * Σ a_k is the convolution of each stratum's hypergeometric given its margins. No continuity
 * correction and no large-sample approximation, so it is valid for 12-draw cells. One stratum
 * gives exactly fisherExact. Strata whose margins fix a (an empty row, or no/all failures) carry
 * no information and are skipped.
 * @param tables  [[[a, b], [c, d]], …]
 */
export function stratifiedExact(tables) {
  let dist = [1];
  let lo = 0;
  let observed = 0;
  let expected = 0;
  let strataUsed = 0;
  let strataSkipped = 0;
  for (const table of tables) {
    const [a, b, c, d] = unpackTable('stratifiedExact', table);
    const n1 = a + b;
    const n2 = c + d;
    const m = a + c;
    const total = n1 + n2;
    if (n1 === 0 || n2 === 0 || m === 0 || m === total) {
      strataSkipped++;
      continue;
    }
    const h = hypergeometric(n1, n2, m);
    const next = new Array(dist.length + h.pmf.length - 1).fill(0);
    for (let i = 0; i < dist.length; i++) {
      if (dist[i] === 0) continue;
      for (let j = 0; j < h.pmf.length; j++) next[i + j] += dist[i] * h.pmf[j];
    }
    dist = next;
    lo += h.lo;
    observed += a;
    expected += (n1 * m) / total;
    strataUsed++;
  }
  if (strataUsed === 0) {
    return {
      twoSided: 1,
      pGreater: 1,
      pLess: 1,
      observed,
      expected,
      strataUsed,
      strataSkipped,
      informative: false,
    };
  }
  const { twoSided, greater, less } = discreteTests(lo, dist, observed);
  return {
    twoSided,
    pGreater: greater,
    pLess: less,
    observed,
    expected,
    strataUsed,
    strataSkipped,
    informative: true,
  };
}

/**
 * Cochran–Mantel–Haenszel test over 2×2 strata, as R's mantelhaen.test (2×2×K, correct = TRUE):
 * D = Σ(a_k − E[a_k]); the 0.5 continuity correction applies only when |D| ≥ 0.5;
 * statistic = (|D| − correction)² / Σ Var(a_k), chi-square on 1 df for the two-sided p; the
 * one-sided p-values use z = sign(D)·√statistic (pGreater = candidate worse). Strata with a zero
 * margin are skipped and counted.
 */
export function cmh(tables, { correct = true } = {}) {
  let deviation = 0;
  let variance = 0;
  let strataUsed = 0;
  let strataSkipped = 0;
  for (const table of tables) {
    const [a, b, c, d] = unpackTable('cmh', table);
    const n1 = a + b;
    const n2 = c + d;
    const m1 = a + c;
    const total = n1 + n2;
    if (n1 === 0 || n2 === 0 || m1 === 0 || m1 === total) {
      strataSkipped++;
      continue;
    }
    deviation += a - (n1 * m1) / total;
    variance += (n1 * n2 * m1 * (total - m1)) / (total * total * (total - 1));
    strataUsed++;
  }
  if (strataUsed === 0 || !(variance > 0)) {
    return {
      statistic: null,
      pTwoSided: 1,
      pGreater: 1,
      pLess: 1,
      deviation,
      variance,
      strataUsed,
      strataSkipped,
      informative: false,
    };
  }
  const yates = correct && Math.abs(deviation) >= 0.5 ? 0.5 : 0;
  const statistic = (Math.abs(deviation) - yates) ** 2 / variance;
  const z = Math.sign(deviation) * Math.sqrt(statistic);
  return {
    statistic,
    pTwoSided: Math.min(1, 2 * normalSf(Math.sqrt(statistic))),
    pGreater: normalSf(z),
    pLess: normalSf(-z),
    deviation,
    variance,
    strataUsed,
    strataSkipped,
    informative: true,
  };
}

/**
 * Mantel–Haenszel risk difference (candidate minus baseline) with the Sato, Greenland and
 * Robins (1989) variance, which holds both for many small strata and for a few large ones
 * (the formula metafor's rma.mh uses). For a non-inferiority reading, compare
 * `upperOneSided` (the one-sided 95% upper bound by default) with a margin fixed in advance.
 * The variance is zero when no stratum has a failure, so such data are `informative: false`
 * and give no bound worth reading.
 */
export function mhRiskDifference(tables, { zTwoSided = 1.959964, zOneSided = 1.6448536 } = {}) {
  let num = 0;
  let den = 0;
  let p = 0;
  let q = 0;
  let events = 0;
  let strataUsed = 0;
  let strataSkipped = 0;
  for (const table of tables) {
    const [a, b, c, d] = unpackTable('mhRiskDifference', table);
    const n1 = a + b;
    const n2 = c + d;
    const total = n1 + n2;
    if (n1 === 0 || n2 === 0) {
      strataSkipped++;
      continue;
    }
    num += (a * n2) / total - (c * n1) / total;
    den += (n1 * n2) / total;
    p +=
      c * (n1 / total) ** 2 - a * (n2 / total) ** 2 + ((n1 / total) * (n2 / total) * (n2 - n1)) / 2;
    q += (a * (n2 - c)) / total + (c * (n1 - a)) / total;
    events += a + c;
    strataUsed++;
  }
  if (strataUsed === 0) {
    return {
      rd: null,
      se: null,
      lo: null,
      hi: null,
      upperOneSided: null,
      strataUsed,
      strataSkipped,
      informative: false,
    };
  }
  const rd = num / den;
  const se = Math.sqrt(Math.max(0, (rd * p + q / 2) / (den * den)));
  return {
    rd,
    se,
    lo: rd - zTwoSided * se,
    hi: rd + zTwoSided * se,
    upperOneSided: rd + zOneSided * se,
    strataUsed,
    strataSkipped,
    informative: events > 0,
  };
}

// ─── paired / ordinal tests ─────────────────────────────────────────────────

/** Two-sided exact sign test (binomial, p = ½), ties already dropped; clamped to 1; (0, 0) → 1. */
export function signTest(wins, losses) {
  assertCounts('signTest', [wins, losses]);
  const n = wins + losses;
  if (n === 0) return 1;
  const k = Math.min(wins, losses);
  const logHalfPowN = n * Math.LN2;
  let tail = 0;
  for (let i = 0; i <= k; i++) tail += Math.exp(logChoose(n, i) - logHalfPowN);
  return Math.min(1, 2 * tail);
}

/** Midranks (1-based) of the pooled values, and the tie-group sizes. */
function midranks(values) {
  const order = values.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
  const ranks = new Array(values.length);
  const ties = [];
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const rank = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) ranks[order[k][1]] = rank;
    ties.push(j - i + 1);
    i = j + 1;
  }
  return { ranks, ties };
}

function assertNumbers(name, xs) {
  if (!Array.isArray(xs) || xs.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
    throw new TypeError(`${name}: expected an array of finite numbers`);
  }
}

/**
 * One Mann–Whitney stratum: U of xs (pairs with x > y, plus half the ties), its null mean and
 * tie-corrected variance, and — when n1 + n2 ≤ exactMax — the exact permutation distribution
 * of 2U given the tie pattern (all C(N, n1) splits, counted by dynamic programming over the
 * doubled midranks, which are integers).
 */
function mwStratum(xs, ys, exactMax) {
  const n1 = xs.length;
  const n2 = ys.length;
  const total = n1 + n2;
  const { ranks, ties } = midranks([...xs, ...ys]);
  const r1 = ranks.slice(0, n1).reduce((s, r) => s + r, 0);
  const u = r1 - (n1 * (n1 + 1)) / 2;
  const mean = (n1 * n2) / 2;
  const tieSum = ties.reduce((s, t) => s + (t ** 3 - t), 0);
  const variance = total > 1 ? ((n1 * n2) / 12) * (total + 1 - tieSum / (total * (total - 1))) : 0;
  if (total > exactMax) return { u, mean, variance, dist: null };
  // ways[j][s]: subsets of size j whose doubled-midrank sum is s.
  const weights = ranks.map((r) => Math.round(2 * r));
  const maxSum = weights.reduce((s, w) => s + w, 0);
  const ways = Array.from({ length: n1 + 1 }, () => new Float64Array(maxSum + 1));
  ways[0][0] = 1;
  weights.forEach((w, i) => {
    for (let j = Math.min(i + 1, n1); j >= 1; j--) {
      const from = ways[j - 1];
      const to = ways[j];
      for (let s = maxSum; s >= w; s--) if (from[s - w] !== 0) to[s] += from[s - w];
    }
  });
  const counts = ways[n1];
  const splits = counts.reduce((s, c) => s + c, 0);
  // 2U = (doubled rank sum) − n1(n1 + 1); index the distribution by 2U.
  const shift = n1 * (n1 + 1);
  const lo2u = 0;
  const hi2u = 2 * n1 * n2;
  const dist = new Array(hi2u - lo2u + 1).fill(0);
  for (let s = 0; s <= maxSum; s++) {
    if (counts[s] !== 0) dist[s - shift - lo2u] += counts[s] / splits;
  }
  return { u, mean, variance, dist };
}

/** Two-sided p of T around its mean from an exact distribution indexed by 2T − lo2t. */
function twoSidedFromDist(dist, lo2t, t, mean) {
  const observed = Math.abs(t - mean);
  let p = 0;
  dist.forEach((prob, i) => {
    if (prob !== 0 && Math.abs((lo2t + i) / 2 - mean) >= observed - 1e-9) p += prob;
  });
  return Math.min(1, p);
}

function normalTwoSided(t, mean, variance) {
  if (!(variance > 0)) return 1;
  const z = Math.max(0, Math.abs(t - mean) - 0.5) / Math.sqrt(variance);
  return Math.min(1, 2 * normalSf(z));
}

/**
 * Mann–Whitney (Wilcoxon rank-sum) test, two-sided. `u` is the U of xs: pairs with x > y, plus
 * half the ties (so u > n1·n2/2 means xs tend to be larger). Exact permutation p when
 * n1 + n2 ≤ exactMax (default 50 — small samples with ties are where the normal approximation
 * misleads); otherwise the normal approximation with the tie-corrected variance and a 0.5
 * continuity correction on |U − n1·n2/2|.
 */
export function mannWhitney(xs, ys, { exactMax = 50 } = {}) {
  assertNumbers('mannWhitney', xs);
  assertNumbers('mannWhitney', ys);
  if (xs.length === 0 || ys.length === 0) return { u: 0, p: 1, method: 'empty' };
  const s = mwStratum(xs, ys, exactMax);
  if (s.dist) return { u: s.u, p: twoSidedFromDist(s.dist, 0, s.u, s.mean), method: 'exact' };
  return { u: s.u, p: normalTwoSided(s.u, s.mean, s.variance), method: 'normal' };
}

/**
 * Stratified Mann–Whitney: permutation within each stratum (e.g. per lecture), statistic
 * T = Σ U_k (unweighted). Exact by convolving each stratum's permutation distribution when
 * every stratum has n1 + n2 ≤ exactMax; otherwise the normal approximation on T with the summed
 * tie-corrected variances and a 0.5 continuity correction.
 * @param strata  [[xs, ys], …]
 */
export function mannWhitneyStratified(strata, { exactMax = 50 } = {}) {
  const used = strata.filter(([xs, ys]) => {
    assertNumbers('mannWhitneyStratified', xs);
    assertNumbers('mannWhitneyStratified', ys);
    return xs.length > 0 && ys.length > 0;
  });
  if (used.length === 0) return { u: 0, expected: 0, p: 1, method: 'empty', strata: 0 };
  const parts = used.map(([xs, ys]) => mwStratum(xs, ys, exactMax));
  const t = parts.reduce((s, x) => s + x.u, 0);
  const mean = parts.reduce((s, x) => s + x.mean, 0);
  if (parts.some((x) => x.dist === null)) {
    const variance = parts.reduce((s, x) => s + x.variance, 0);
    return {
      u: t,
      expected: mean,
      p: normalTwoSided(t, mean, variance),
      method: 'normal',
      strata: parts.length,
    };
  }
  let dist = [1];
  for (const part of parts) {
    const next = new Array(dist.length + part.dist.length - 1).fill(0);
    for (let i = 0; i < dist.length; i++) {
      if (dist[i] === 0) continue;
      for (let j = 0; j < part.dist.length; j++) next[i + j] += dist[i] * part.dist[j];
    }
    dist = next;
  }
  return {
    u: t,
    expected: mean,
    p: twoSidedFromDist(dist, 0, t, mean),
    method: 'exact',
    strata: parts.length,
  };
}

// ─── self-test ──────────────────────────────────────────────────────────────

/**
 * Reference values: exact rationals (Python `fractions`) for the discrete tests and the
 * Wilson bounds; R's mantelhaen.test(UCBAdmissions) for CMH (X² = 1.4269, p = 0.2323);
 * metafor's rma.mh RD formula for the risk difference; math.erfc for the normal tail.
 */
const SELF_TEST = [
  // Wilson
  ['wilson(0,12).lo', () => wilson(0, 12).lo, 0],
  ['wilson(0,12).hi', () => wilson(0, 12).hi, 0.2424940096],
  ['wilson(1,12).lo', () => wilson(1, 12).lo, 0.0148650942],
  ['wilson(1,12).hi', () => wilson(1, 12).hi, 0.3538799137],
  ['wilson(4,5).lo', () => wilson(4, 5).lo, 0.375534627],
  ['wilson(12,12).hi', () => wilson(12, 12).hi, 1],
  ['wilson(3,36).hi', () => wilson(3, 36).hi, 0.2182669139],
  ['wilson(0,0).lo', () => wilson(0, 0).lo, 0],
  ['wilson(0,0).hi', () => wilson(0, 0).hi, 1],
  // Fisher — orientation pinned: a = candidate failures, so greater = "candidate worse"
  ['fisher [[0,12],[5,7]] twoSided', () => fisherExact(0, 12, 5, 7).twoSided, 0.0372670807],
  ['fisher [[0,12],[5,7]] greater', () => fisherExact(0, 12, 5, 7).greater, 1],
  ['fisher [[0,12],[5,7]] less', () => fisherExact(0, 12, 5, 7).less, 0.0186335404],
  ['fisher [[5,7],[0,12]] greater', () => fisherExact(5, 7, 0, 12).greater, 0.0186335404],
  ['fisher [[5,7],[0,12]] less', () => fisherExact(5, 7, 0, 12).less, 1],
  ['fisher [[1,11],[7,5]] twoSided', () => fisherExact(1, 11, 7, 5).twoSided, 0.027190739],
  ['fisher [[1,11],[7,5]] less', () => fisherExact(1, 11, 7, 5).less, 0.0135953695],
  // unequal rows: the minimum-likelihood two-sided p (R) differs from doubling (0.0672)
  ['fisher [[1,23],[4,8]] twoSided', () => fisherExact(1, 23, 4, 8).twoSided, 0.0336134454],
  // a pooled table of 288 draws — a factorial-space implementation overflows here
  ['fisher [[15,129],[5,139]] twoSided', () => fisherExact(15, 129, 5, 139).twoSided, 0.0346030158],
  ['fisher [[15,129],[5,139]] greater', () => fisherExact(15, 129, 5, 139).greater, 0.0173015079],
  ['fisher [[5,139],[15,129]] less', () => fisherExact(5, 139, 15, 129).less, 0.0173015079],
  ['fisher [[0,0],[3,4]] twoSided (empty row)', () => fisherExact(0, 0, 3, 4).twoSided, 1],
  // exact stratified test (convolution of hypergeometrics)
  [
    'stratifiedExact one stratum = fisher less',
    () =>
      stratifiedExact([
        [
          [1, 11],
          [7, 5],
        ],
      ]).pLess,
    0.0135953695,
  ],
  [
    'stratifiedExact one stratum = fisher twoSided',
    () =>
      stratifiedExact([
        [
          [1, 11],
          [7, 5],
        ],
      ]).twoSided,
    0.027190739,
  ],
  [
    'stratifiedExact 2 strata pGreater',
    () =>
      stratifiedExact([
        [
          [3, 9],
          [1, 11],
        ],
        [
          [2, 10],
          [0, 12],
        ],
      ]).pGreater,
    0.0948555225,
  ],
  [
    'stratifiedExact 2 strata twoSided',
    () =>
      stratifiedExact([
        [
          [3, 9],
          [1, 11],
        ],
        [
          [2, 10],
          [0, 12],
        ],
      ]).twoSided,
    0.1897110451,
  ],
  [
    'stratifiedExact 3 strata pGreater',
    () =>
      stratifiedExact([
        [
          [2, 10],
          [0, 12],
        ],
        [
          [1, 11],
          [1, 11],
        ],
        [
          [3, 9],
          [0, 12],
        ],
      ]).pGreater,
    0.055714227,
  ],
  [
    'stratifiedExact skips a no-failure stratum',
    () =>
      stratifiedExact([
        [
          [0, 12],
          [0, 12],
        ],
        [
          [5, 7],
          [0, 12],
        ],
      ]).pGreater,
    0.0186335404,
  ],
  // CMH — R: mantelhaen.test(UCBAdmissions): X-squared = 1.4269, p-value = 0.2323
  ['cmh UCBAdmissions statistic', () => cmh(UCB).statistic, 1.4269462286],
  ['cmh UCBAdmissions pTwoSided', () => cmh(UCB).pTwoSided, 0.2322634628],
  ['cmh UCBAdmissions pLess', () => cmh(UCB).pLess, 0.1161317314],
  ['cmh UCBAdmissions deviation', () => cmh(UCB).deviation, -15.357166583],
  // by hand: strata [[3,9],[1,11]] and [[2,10],[0,12]] — E = 2 and 1, so D = 2; Var = 20/23 + 11/23
  // = 31/23; statistic = (2 − ½)² / (31/23) = 51.75/31 = 1.6693548387
  [
    'cmh hand statistic',
    () =>
      cmh([
        [
          [3, 9],
          [1, 11],
        ],
        [
          [2, 10],
          [0, 12],
        ],
      ]).statistic,
    1.6693548387,
  ],
  [
    'cmh hand pGreater',
    () =>
      cmh([
        [
          [3, 9],
          [1, 11],
        ],
        [
          [2, 10],
          [0, 12],
        ],
      ]).pGreater,
    0.0981724854,
  ],
  // |D| = 1/7 < ½: R applies no correction (a naive (|D| − ½)² gives 0.3125)
  [
    'cmh |D|<0.5 statistic',
    () =>
      cmh([
        [
          [1, 2],
          [1, 3],
        ],
      ]).statistic,
    0.05,
  ],
  [
    'cmh |D|<0.5 pTwoSided',
    () =>
      cmh([
        [
          [1, 2],
          [1, 3],
        ],
      ]).pTwoSided,
    0.8230632738,
  ],
  [
    'cmh skips zero-margin strata',
    () =>
      cmh([
        [
          [0, 12],
          [0, 12],
        ],
        [
          [3, 9],
          [1, 11],
        ],
        [
          [12, 0],
          [12, 0],
        ],
      ]).strataSkipped,
    2,
  ],
  [
    'cmh no information',
    () =>
      cmh([
        [
          [0, 12],
          [0, 12],
        ],
      ]).pGreater,
    1,
  ],
  // MH risk difference, Sato–Greenland–Robins variance
  [
    'mhRiskDifference hand rd',
    () =>
      mhRiskDifference([
        [
          [3, 9],
          [1, 11],
        ],
        [
          [2, 10],
          [0, 12],
        ],
      ]).rd,
    0.1666666667,
  ],
  [
    'mhRiskDifference hand se',
    () =>
      mhRiskDifference([
        [
          [3, 9],
          [1, 11],
        ],
        [
          [2, 10],
          [0, 12],
        ],
      ]).se,
    0.0916035136,
  ],
  [
    'mhRiskDifference hand upperOneSided',
    () =>
      mhRiskDifference([
        [
          [3, 9],
          [1, 11],
        ],
        [
          [2, 10],
          [0, 12],
        ],
      ]).upperOneSided,
    0.3173410358,
  ],
  [
    'mhRiskDifference uneven upperOneSided',
    () =>
      mhRiskDifference([
        [
          [5, 7],
          [2, 14],
        ],
        [
          [1, 23],
          [4, 8],
        ],
        [
          [0, 12],
          [0, 12],
        ],
      ]).upperOneSided,
    0.1182231691,
  ],
  // one stratum reduces to the Wald variance: √(½·½/12) = 0.1443375673
  [
    'mhRiskDifference one stratum se',
    () =>
      mhRiskDifference([
        [
          [6, 6],
          [0, 12],
        ],
      ]).se,
    0.1443375673,
  ],
  // sign test
  ['signTest(55,45)', () => signTest(55, 45), 0.3682016173],
  ['signTest(5,5) clamps to 1', () => signTest(5, 5), 1],
  ['signTest(0,0)', () => signTest(0, 0), 1],
  ['signTest(10,0)', () => signTest(10, 0), 0.001953125],
  ['signTest(600,500) (log space)', () => signTest(600, 500), 0.002819545],
  // Mann–Whitney: u is the U of xs; exact permutation p at small n
  ['mannWhitney ties u', () => mannWhitney([0, 0, 0, 1, 2, 3], [0, 0, 0, 0, 0, 1]).u, 25],
  [
    'mannWhitney ties exact p',
    () => mannWhitney([0, 0, 0, 1, 2, 3], [0, 0, 0, 0, 0, 1]).p,
    0.303030303,
  ],
  [
    'mannWhitney no ties exact p',
    () => mannWhitney([0.52, 0.55, 0.58, 0.6, 0.61, 0.66], [0.49, 0.5, 0.51, 0.53, 0.54, 0.56]).p,
    0.025974026,
  ],
  ['mannWhitney 3 v 3 separated', () => mannWhitney([1, 2, 3], [4, 5, 6]).p, 0.1],
  [
    'mannWhitney normal approximation (N = 62)',
    () =>
      mannWhitney(
        Array.from({ length: 30 }, (_, i) => i % 7),
        Array.from({ length: 32 }, (_, i) => (i % 5) + 1)
      ).p,
    0.819367667,
  ],
  [
    'mannWhitneyStratified exact p',
    () =>
      mannWhitneyStratified([
        [
          [0, 0, 1, 2],
          [0, 0, 0, 1],
        ],
        [
          [1, 2, 3],
          [0, 1, 1],
        ],
      ]).p,
    0.1571428571,
  ],
  [
    'mannWhitneyStratified T',
    () =>
      mannWhitneyStratified([
        [
          [0, 0, 1, 2],
          [0, 0, 0, 1],
        ],
        [
          [1, 2, 3],
          [0, 1, 1],
        ],
      ]).u,
    18.5,
  ],
  // normal tail
  ['normalSf(1.959964)', () => normalSf(1.959964), 0.0249999991],
  ['normalSf(3.5)', () => normalSf(3.5), 0.000232629079],
  ['normalSf(-1)', () => normalSf(-1), 0.8413447461],
];

/** UCBAdmissions per department: [[admitted male, rejected male], [admitted female, rejected female]]. */
const UCB = [
  [
    [512, 313],
    [89, 19],
  ],
  [
    [353, 207],
    [17, 8],
  ],
  [
    [120, 205],
    [202, 391],
  ],
  [
    [138, 279],
    [131, 244],
  ],
  [
    [53, 138],
    [94, 299],
  ],
  [
    [22, 351],
    [24, 317],
  ],
];

/** Far-tail checks are relative: an absolute tolerance would accept 0 for 6e-16. */
const RELATIVE_TAIL = [
  ['normalSf(6)', () => normalSf(6), 9.865876450377014e-10],
  ['normalSf(8)', () => normalSf(8), 6.2209605742718204e-16],
  ['normalSf(20)', () => normalSf(20), 2.7536241186063314e-89],
];

export function selfTest({ log = console.log } = {}) {
  let failures = 0;
  for (const [name, fn, want] of SELF_TEST) {
    let got;
    try {
      got = fn();
    } catch (error) {
      got = `threw ${error instanceof Error ? error.message : String(error)}`;
    }
    const ok = typeof got === 'number' && Math.abs(got - want) <= 1e-8;
    if (!ok) failures++;
    log(
      `${ok ? '✓' : '✗'} ${name}: ${typeof got === 'number' ? got.toPrecision(10) : got} (want ${want})`
    );
  }
  for (const [name, fn, want] of RELATIVE_TAIL) {
    const got = fn();
    const ok = Math.abs(got - want) <= 1e-9 * want;
    if (!ok) failures++;
    log(`${ok ? '✓' : '✗'} ${name}: ${got.toPrecision(12)} (want ${want})`);
  }
  log(
    failures === 0
      ? `stats self-test: all ${SELF_TEST.length + RELATIVE_TAIL.length} checks pass`
      : `stats self-test: ${failures} FAILED`
  );
  return failures;
}

// Real paths on both sides: run from a symlinked checkout (or under --preserve-symlinks-main), the
// two name one file differently, and a URL comparison made --self-test exit 0 having checked nothing.
let invokedDirectly = false;
try {
  invokedDirectly =
    Boolean(process.argv[1]) &&
    realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
} catch {
  // imported, or argv[1] is not a file
}
if (invokedDirectly) {
  if (process.argv.includes('--self-test')) {
    process.exit(selfTest() === 0 ? 0 : 1);
  }
  console.error(
    'usage: node stats.mjs --self-test   (the functions are imported by the evaluation tooling)'
  );
  process.exit(2);
}

// cells.mjs — the experiment's design as data: arms, stages, units (one rate-check call per arm),
// the decision-rule constants and the cost assumptions. README.md's tables are written from
// `node run-stages.mjs --plan`, which reads this file; change the design here, never in prose only.
//
// A *unit* is what one rate-check invocation per arm draws: its documents × its languages ×
// that arm's draws. A *cell* (the unit of analysis) is one document × one language. Every
// unit except the sweeps holds one document, so all arms of a cell are drawn in the same window.

import path from 'node:path';

/** Arms: the model each one requests. All run on the one pinned engine, except s5@v0.29.5. */
export const ARMS = {
  s5: { model: 'claude-sonnet-5', role: 'production baseline' },
  s55: { model: 'claude-sonnet-5-5', role: 'candidate default' },
  o55: { model: 'claude-opus-5-5', role: 'candidate for bulk seeds and review (#334 Part B); informational' },
  // Stage 0b only: v0.29.5, compiled by rate-check --ref in a temporary worktree. run-stages'
  // default --ref-deps own installs v0.29.5's own lockfile (SDK 0.78); --ref-deps shared borrows
  // this checkout's node_modules (SDK 0.131), and the contrast is then source only.
  's5@v0.29.5': { model: 'claude-sonnet-5', ref: 'v0.29.5', role: 'Stage 0b A/A baseline' },
};

export const BASELINE = 's5';
export const CANDIDATE = 's55';
export const INFORMATIONAL = ['o55'];

/** Pre-registered constants of the decision rules (README.md "Decision rules"). */
export const RULES = {
  /** R0: largest infra share (infra / completed draws) a gating cell may show. */
  infraMax: 0.1,
  /** R0, R2: valid (non-infra) draws each arm needs in a gating cell. */
  minValid: 12,
  /** R2-pooled: non-inferiority margin on the structural-failure risk difference (s55 − s5). */
  delta: 0.065,
  /** R2 guard: s55 structural failures in a cell's base draws that call for a same-day control. */
  guardTrigger: 2,
  /** R2 guard: extra draws per arm (s5 and s55) in the control. */
  guardExtraDraws: 24,
  /** R3: extra draws per arm (s55 and s5) on a production lecture s55 refused. */
  r3Redraws: 12,
  /** R4: largest one-sided 95% upper bound of the geometric-mean s55/s5 output-token ratio. */
  r4MaxRatio: 1.1,
  /** R5: largest geometric-mean s55/s5 cost per delivered file before the flip needs an explanation. */
  r5MaxRatio: 1.25,
  /** R4, R5: successful draws each arm needs for a cell to enter the ratio. */
  minOkForRatio: 6,
  /** Significance level of every one-sided test in the rules. */
  alpha: 0.05,
  /** One-sided 95% normal quantile. */
  zOneSided: 1.6448536,
  /** Cell-level bootstrap resamples (R4, R5) and its seed. */
  bootstrap: 10000,
  bootstrapSeed: 'claude-5-5-upgrade',
};

/**
 * Failure kinds that count against R2 ("structural"): every non-infra failure except a model
 * refusal (R3's metric) and an auth failure (an invalid run, R0). A draw with no report (a crash)
 * counts here too.
 */
export const NON_STRUCTURAL_KINDS = new Set(['model-refusal', 'auth', 'infra']);

/**
 * Planning assumptions for --plan (live spend is read from the run reports; run-stages stops a
 * stage at --max-spend-factor × its estimate). Output tokens per source byte on Sonnet's
 * tokenizer: fr is measured (pv.md, 9,715 tokens from 17,177 bytes, experiments/thinking-sonnet5);
 * zh-cn and fa scale it by the engine's admission factors (1.3 and 1.8 against 1.5); ml is a
 * guess on the high side. Opus 5.5 uses a different tokenizer (about 1×–1.35× Sonnet's token
 * counts) and always thinks.
 */
export const COST_ASSUMPTIONS = {
  outputTokensPerSourceByte: { fr: 0.566, 'zh-cn': 0.49, fa: 0.68, ml: 0.75 },
  inputTokensPerSourceByte: 0.33,
  /** Instructions around the document in the uncached suffix. */
  promptOverheadTokens: 700,
  /** The localization rules' instructions, when --localize is not none. */
  localizeTokens: 600,
  /** Glossary and rules text in the cached prefix: characters per token (fr's 25K-character
   * glossary section measured at about 15K tokens on 2026-07-14). */
  prefixCharsPerToken: 1.8,
  prefixBaseTokens: 400,
  opusTokenizerFactor: 1.2,
  /** Opus 5.5 thinking tokens per whole-document draw (adaptive at effort medium): unmeasured. */
  alwaysThinksThinkingTokens: 2000,
};

const LANGS = ['zh-cn', 'fa', 'ml', 'fr'];
const FIXTURES = ['game-theory', '25-pre-title-content-lecture', '28-add-exercise-lecture'];

/** The corpus document with this id (corpus.yml `documents`). */
function doc(corpus, id) {
  const found = corpus.documents.find((d) => d.id === id);
  if (!found) throw new Error(`corpus.yml has no document '${id}'`);
  return found;
}

/** The file name rate-check is given (-f): reference-ml sources are renamed <lecture>.md. */
export function fixtureName(document) {
  if (document.local && document.class === 'reference-ml') return `${document.id}.md`;
  return path.basename(document.local ?? document.path);
}

/** Source directory class for a document: null = rate-check's own test-action-on-github-data/. */
function sourceClass(document) {
  return document.class === 'fixture' ? null : document.class;
}

function unitFor(stage, corpus, id, language, arms, extra = {}) {
  const d = doc(corpus, id);
  return {
    stage,
    id: `${id}.${language}`,
    class: d.class,
    sourceClass: sourceClass(d),
    fixtures: [fixtureName(d)],
    bytes: { [fixtureName(d)]: d.bytes },
    production: { [fixtureName(d)]: d.production ?? [] },
    languages: [language],
    localize: d.localize,
    arms,
    ...extra,
  };
}

/**
 * Every stage and its units. `gating` names the rules the stage's cells feed; `role` says how
 * a cell is read. Follow-up units (R2 controls, R3 redraws, R0 re-runs) are derived from the
 * results by rules.mjs, never listed here.
 */
export function buildStages(corpus) {
  const stage1 = [];
  for (const id of FIXTURES) for (const lang of LANGS) stage1.push(unitFor(1, corpus, id, lang, { s5: 12, s55: 12, o55: 12 }, { role: 'gating' }));

  const stage2 = [
    ...[
      ['python_essentials', 'fr'],
      ['python_oop', 'fr'],
      ['prospects_bounded_rationality', 'zh-cn'],
    ].map(([id, lang]) => unitFor(2, corpus, id, lang, { s5: 12, s55: 12, o55: 12 }, { role: 'gating' })),
    ...['sir_model', 'autodiff', 'jax_intro', 'jax_nn', 'keras'].map((id) =>
      unitFor(2, corpus, id, 'zh-cn', { s55: 6, o55: 6, s5: 3 }, { role: 'probe' })
    ),
    ...['zh-cn', 'fa'].map((lang) => unitFor(2, corpus, 'two_computation', lang, { s5: 2, s55: 2, o55: 2 }, { role: 'descriptive' })),
  ];

  const stage3 = [];
  for (const sweep of corpus.sweep) {
    for (const lang of sweep.languages) {
      stage3.push({
        stage: 3,
        id: `sweep.${sweep.repo}.${lang}`,
        class: sweep.class,
        sourceClass: sweep.class,
        fixtures: sweep.files.map((f) => f.file),
        bytes: Object.fromEntries(sweep.files.map((f) => [f.file, f.bytes])),
        production: Object.fromEntries(sweep.files.map((f) => [f.file, f.production ?? []])),
        languages: [lang],
        localize: sweep.localize,
        arms: { s55: 1, s5: 1 },
        role: 'sweep',
      });
    }
  }

  const stage4 = ['functions', 'matplotlib', 'numpy'].map((id) =>
    unitFor(4, corpus, id, 'ml', { s5: 6, s55: 6, o55: 6 }, { role: 'advisory' })
  );

  const stage0 = [
    {
      stage: 0,
      id: 'game-theory.aa',
      class: 'fixture',
      sourceClass: null,
      fixtures: ['game-theory.md'],
      bytes: { 'game-theory.md': doc(corpus, 'game-theory').bytes },
      production: { 'game-theory.md': [] },
      languages: LANGS,
      localize: 'none',
      arms: { 's5@v0.29.5': 12, s5: 12 },
      role: 'advisory',
    },
  ];

  return [
    {
      stage: 0,
      title: 'Engine A/A: R1 is the deterministic engine-aa.mjs check ($0); 0b is the optional stochastic A/A (advisory)',
      optional: true,
      rules: ['R1 (engine-aa.mjs)', 'advisory'],
      units: stage0,
    },
    { stage: 1, title: 'Harness fixtures, localize none', rules: ['R0', 'R2-pooled', 'R2 guard', 'R4', 'R5'], units: stage1 },
    {
      stage: 2,
      title: 'Real lectures: head-raw (gating), safety probes, long tail',
      rules: ['R0', 'R2 guard', 'R3', 'R4', 'R5', 'descriptive'],
      units: stage2,
    },
    { stage: 3, title: 'Production refusal sweep (every lecture of the three source repos)', rules: ['R3'], units: stage3 },
    { stage: 4, title: 'Quality, advisory: reference-ml drafts (+ judge.mjs, ml-lints.mjs)', rules: ['advisory'], units: stage4 },
  ];
}

/** Whether the arm requests a model with Opus's tokenizer (planning only). */
function opusTokenizer(model) {
  return /^claude-(opus|fable)/.test(model);
}

/**
 * Estimated cost of one unit × arm: { draws, typical, worst } in USD, or nulls when the model is
 * unpriced. ctx: { priceFor, maxTokensFor, requestPolicyFor, prefixTokens(lang), parallel }.
 */
export function estimateUnitArm(unit, armId, ctx) {
  const arm = ARMS[armId];
  const n = unit.arms[armId];
  const price = ctx.priceFor(arm.model);
  const draws = n * unit.fixtures.length * unit.languages.length;
  if (!price) return { draws, typical: null, worst: null };
  const a = COST_ASSUMPTIONS;
  const tokFactor = opusTokenizer(arm.model) ? a.opusTokenizerFactor : 1;
  const thinks = ctx.requestPolicyFor(arm.model).alwaysThinks;
  const cap = ctx.maxTokensFor(arm.model, 'fullDocument');
  let typical = 0;
  let worst = 0;
  for (const lang of unit.languages) {
    const prefix = ctx.prefixTokens(lang) * tokFactor;
    // Draws of one cell×arm run `parallel` at a time: the first wave each writes the cache.
    const writes = Math.min(n, ctx.parallel ?? n);
    for (const fixture of unit.fixtures) {
      const bytes = unit.bytes[fixture];
      const input = (bytes * a.inputTokensPerSourceByte + a.promptOverheadTokens + (unit.localize === 'none' ? 0 : a.localizeTokens)) * tokFactor;
      const output = Math.min(cap, bytes * a.outputTokensPerSourceByte[lang] * tokFactor + (thinks ? a.alwaysThinksThinkingTokens : 0));
      const cache = writes * prefix * price.cacheWrite5m + (n - writes) * prefix * price.cacheRead;
      typical += (cache + n * (input * price.in + output * price.out)) / 1e6;
      worst += (cache + n * (input * price.in + cap * price.out)) / 1e6;
    }
  }
  return { draws, typical, worst };
}

/**
 * Reviewer verdict v2 — the machine-readable review contract (#103, #66).
 *
 * Review mode has always posted a prose report with nothing a collector can
 * parse: no data payload in the comment, the composite score never printed,
 * action outputs per-run only. This module makes the verdict machine-actionable:
 *
 *   - a structured JSON block embedded in the review comment (HTML-comment
 *     wrapper, the `translation-sync-metadata` pattern),
 *   - a categorical routing recommendation (`auto-merge` | `editor`) computed
 *     from rubric logic, never from the blended scalar score, and
 *   - a shadow flag that records "would auto-merge" without acting.
 *
 * Fail-closed throughout (#102 polarity): malformed findings, unknown
 * severities/categories, failed checks — anything unexpected routes to
 * `editor`, never toward a merge. Downstream consumers must treat a missing
 * or unparseable block the same way.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ReviewFinding, FindingSeverity, FindingCategory } from './types.js';

/** Marker naming the verdict block inside the review comment. */
export const REVIEW_VERDICT_MARKER = 'translation-review-verdict';

/** Schema version of the verdict block. Bump on breaking changes (#66). */
export const REVIEW_VERDICT_SCHEMA_VERSION = 1;

/** Findings kept in the block, worst first — bounds the comment size. */
const MAX_FINDINGS = 20;

/** Free-text fields are truncated to this many characters. */
const MAX_FIELD_LENGTH = 400;

const SEVERITIES: readonly FindingSeverity[] = ['blocker', 'major', 'minor', 'nit'];
const CATEGORIES: readonly FindingCategory[] = [
  'accuracy',
  'fluency',
  'terminology',
  'formatting',
  'syntax',
  'structure',
  'other',
];

/**
 * Categories where even a `minor` finding gates auto-merge. `accuracy` and
 * `terminology` carry the fluent-but-wrong class; `syntax` is structural and
 * can break the build; `other` is the fail-closed bucket for anything the
 * model labelled outside the known set. `blocker`/`major` gate everywhere.
 *
 * `fluency`, `formatting` and `structure` are absent deliberately: a minor
 * finding there is a style note, and for `structure` the authoritative signal
 * is the `diffChecks` booleans, which gate absolutely on their own.
 */
const GATING_CATEGORIES: readonly FindingCategory[] = [
  'accuracy',
  'terminology',
  'syntax',
  'other',
];

/** Highest score any criterion may report. Anything above is a scale error. */
const MAX_CRITERION_SCORE = 10;

/** The four diff checks, enumerated so a missing key gates rather than vanishing. */
const DIFF_CHECK_NAMES = [
  'scopeCorrect',
  'positionCorrect',
  'structurePreserved',
  'headingMapCorrect',
] as const;

/**
 * Per-criterion floors for the auto-merge recommendation. PROVISIONAL:
 * deliberately conservative until Stage 4 shadow-mode data calibrates them
 * (#103 — floors are set empirically, not a priori).
 */
export const CRITERION_FLOORS: Record<
  'accuracy' | 'fluency' | 'terminology' | 'formatting',
  number
> = {
  accuracy: 9,
  terminology: 9,
  fluency: 8,
  formatting: 8,
};

/**
 * The verdict v2 block, as serialised into the review comment.
 * Field additions are non-breaking; renames/removals/type changes bump
 * `schemaVersion` (#66 contract rules).
 */
export interface ReviewVerdictV2 {
  schemaVersion: number;
  engineVersion: string;
  reviewerModel: string;
  /** Head SHA of the PR the verdict was computed against — any push invalidates it. */
  reviewedHeadSha: string;
  targetBaseSha: string;
  sourceRepo: string;
  prNumber: number;
  timestamp: string;
  verdict: 'PASS' | 'WARN' | 'FAIL';
  recommendation: 'auto-merge' | 'editor';
  /** Why the recommendation is `editor`; empty when `auto-merge`. */
  recommendationReasons: string[];
  autoMergeMode: 'off' | 'shadow';
  /** Present only in shadow mode: the decision the gate would have taken. */
  wouldAutoMerge?: boolean;
  scores: {
    accuracy: number;
    fluency: number;
    terminology: number;
    formatting: number;
    /** Weighted translation composite (0.35/0.25/0.25/0.15). */
    translation: number;
    /** Diff-quality score: (passed checks / 4) × 10. */
    diff: number;
    /** translation × 0.7 + diff × 0.3 — trending signal only, never a gate. */
    overall: number;
  };
  diffChecks: {
    scopeCorrect: boolean;
    positionCorrect: boolean;
    structurePreserved: boolean;
    headingMapCorrect: boolean;
  };
  syntaxErrorCount: number;
  findings: ReviewFinding[];
}

// ============================================================================
// ENGINE VERSION
// ============================================================================

let _cachedEngineVersion: string | undefined;

/**
 * Engine version from package.json, for verdict provenance. The action runs
 * from its tag checkout so package.json sits beside dist-action/; in Jest,
 * __dirname is src/. Memoized; 'unknown' when it cannot be located — a
 * missing version must never fail a review.
 */
export function getEngineVersion(): string {
  if (_cachedEngineVersion !== undefined) return _cachedEngineVersion;

  if (typeof __dirname === 'string') {
    try {
      const pkgPath = path.resolve(__dirname, '../package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.name === 'action-translation' && typeof pkg.version === 'string') {
        _cachedEngineVersion = pkg.version;
        return _cachedEngineVersion!;
      }
    } catch {
      /* fall through */
    }
    try {
      const pkgPath = path.resolve(__dirname, '../../package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.name === 'action-translation' && typeof pkg.version === 'string') {
        _cachedEngineVersion = pkg.version;
        return _cachedEngineVersion!;
      }
    } catch {
      /* fall through */
    }
  }

  _cachedEngineVersion = 'unknown';
  return _cachedEngineVersion;
}

// ============================================================================
// FINDINGS NORMALISATION
// ============================================================================

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Truncate a free-text field to the contract's bound.
 *
 * Exported because the reviewer builds syntax and diff findings directly
 * rather than through `normalizeFindings`, and those bypassed the bound: 25
 * long syntax errors produced a ~400 KB block against GitHub's 65,536-char
 * comment limit, so the post failed and the PR got no verdict at all.
 */
export function truncateField(value: unknown): string {
  return truncate(value);
}

function truncate(value: unknown): string {
  const s = typeof value === 'string' ? value : String(value);
  return s.length > MAX_FIELD_LENGTH ? `${s.slice(0, MAX_FIELD_LENGTH - 1)}…` : s;
}

function asOptionalText(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  return truncate(value);
}

/** Compose a description from the looser shapes models emit (see normalizeIssues). */
function describeLooseObject(obj: Record<string, unknown>): string {
  const description = obj.description || obj.issue || obj.problem || obj.message;
  if (description) return truncate(description);
  const original = obj.original || obj.current || obj.translated || obj.text;
  const suggestion = obj.suggestion || obj.recommended || obj.fix || obj.correction;
  if (original && suggestion) return truncate(`"${original}" → "${suggestion}"`);
  return truncate(JSON.stringify(obj));
}

function severityRank(severity: FindingSeverity): number {
  return SEVERITIES.indexOf(severity);
}

/**
 * Normalise the model's findings payload into ReviewFinding[].
 *
 * Coercions are fail-closed: an unknown severity becomes `major` (gates), an
 * unknown category becomes `other` (gates at minor+), a bare string becomes a
 * `major`/`other` finding. A payload that is not an array at all — or absent
 * entirely, with no legacy `issues` array either — sets `malformed`, which
 * the recommendation treats as gating. Findings are sorted worst-first and
 * capped at MAX_FINDINGS so the worst always survive the cap.
 *
 * `validFiles` are the PR's reviewed markdown paths; a single-file PR forces
 * attribution (the common sync case), otherwise a claimed file must be one of
 * the valid paths or it is nulled.
 */
export function normalizeFindings(
  rawFindings: unknown,
  legacyIssues: unknown,
  validFiles: string[]
): { findings: ReviewFinding[]; malformed: boolean } {
  const soleFile = validFiles.length === 1 ? validFiles[0] : null;

  const toFinding = (item: unknown, forceConservative: boolean): ReviewFinding => {
    if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
      const obj = item as Record<string, unknown>;
      const severity =
        !forceConservative && SEVERITIES.includes(obj.severity as FindingSeverity)
          ? (obj.severity as FindingSeverity)
          : 'major';
      const category =
        !forceConservative && CATEGORIES.includes(obj.category as FindingCategory)
          ? (obj.category as FindingCategory)
          : 'other';
      const claimedFile = typeof obj.file === 'string' ? obj.file : null;
      const file =
        soleFile ?? (claimedFile && validFiles.includes(claimedFile) ? claimedFile : null);
      return {
        severity,
        category,
        file,
        location: asOptionalText(obj.location),
        description: describeLooseObject(obj),
        suggestion: asOptionalText(obj.suggestion),
      };
    }
    return {
      severity: 'major',
      category: 'other',
      file: soleFile,
      location: null,
      description: truncate(item),
      suggestion: null,
    };
  };

  let items: unknown[];
  let forceConservative = false;
  let malformed = false;

  if (Array.isArray(rawFindings) && rawFindings.length > 0) {
    items = rawFindings;
  } else if (
    Array.isArray(rawFindings) &&
    rawFindings.length === 0 &&
    Array.isArray(legacyIssues) &&
    legacyIssues.length > 0
  ) {
    // The model answered in both shapes and left `findings` empty. Trusting
    // the empty array would read as a clean review while real issues sit in
    // the legacy field, so fall back to those, rated conservatively.
    items = legacyIssues;
    forceConservative = true;
  } else if (Array.isArray(rawFindings)) {
    items = rawFindings;
  } else if (rawFindings === undefined && Array.isArray(legacyIssues)) {
    // Legacy `issues` shape with no `findings` key at all: the response
    // ignored the requested schema, so its items are coerced conservatively
    // AND the payload is marked malformed. An empty legacy array is the case
    // that forces this — it is indistinguishable from "the model did not
    // understand what was asked", and reading it as a confident clean review
    // would open the gate on a schema violation.
    items = legacyIssues;
    forceConservative = true;
    malformed = true;
  } else {
    // Non-array findings, or both fields absent: unusable payload. No findings
    // are recorded, and `malformed` gates the recommendation instead — an
    // empty list must never read as "clean review".
    items = [];
    malformed = true;
  }

  const findings = items
    .map((item) => toFinding(item, forceConservative))
    .filter((f) => f.description !== '' && f.description !== '{}')
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .slice(0, MAX_FINDINGS);

  // Items went in and nothing came out: every one was empty or unreadable
  // (`[{}]`, `[null]`, `['']`). Returning a trusted empty list would read as
  // "the model found nothing wrong" when in fact it said nothing usable.
  if (items.length > 0 && findings.length === 0) {
    malformed = true;
  }

  return { findings, malformed };
}

/**
 * Sort worst-first and cap, so the block obeys its documented invariant.
 *
 * `normalizeFindings` already does this for the model's own findings, but the
 * reviewer then concatenates syntax and diff findings onto the end; without
 * re-applying it the assembled array is neither ordered nor bounded.
 */
export function sortAndCapFindings(findings: ReviewFinding[]): ReviewFinding[] {
  return [...findings]
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .slice(0, MAX_FINDINGS);
}

/** Render a finding for the human-readable review comment. */
export function findingToDisplayString(finding: ReviewFinding): string {
  const tag = `**[${finding.severity} · ${finding.category}]**`;
  const where = [finding.file, finding.location].filter(Boolean).join(' — ');
  const suggestion = finding.suggestion ? ` → ${finding.suggestion}` : '';
  return where
    ? `${tag} ${where}: ${finding.description}${suggestion}`
    : `${tag} ${finding.description}${suggestion}`;
}

// ============================================================================
// RECOMMENDATION RUBRIC
// ============================================================================

export interface RecommendationInput {
  verdict: 'PASS' | 'WARN' | 'FAIL';
  scores: { accuracy: number; fluency: number; terminology: number; formatting: number };
  diffChecks: {
    scopeCorrect: boolean;
    positionCorrect: boolean;
    structurePreserved: boolean;
    headingMapCorrect: boolean;
  };
  syntaxErrorCount: number;
  findings: ReviewFinding[];
  findingsMalformed: boolean;
  /** Source content could not be fetched: the comparison was against nothing. */
  sourceContentMissing?: boolean;
  /** `max-suggestions: 0` asked the model for no findings, so an empty list proves nothing. */
  findingsSuppressed?: boolean;
}

/**
 * Categorical routing recommendation — rubric logic, not the blended score
 * (#103 Decision 1: a weighted overall can average away a meaning inversion).
 *
 * `auto-merge` requires ALL of: verdict PASS, zero syntax errors, all four
 * diff checks passing, a well-formed findings payload, zero blocker/major
 * findings, zero minor findings in gating categories (accuracy/terminology/
 * other), and every criterion at or above its provisional floor. `nit`
 * findings never gate. Anything else — including anything malformed — is
 * `editor`, with the reasons recorded for shadow-mode calibration.
 */
export function computeRecommendation(input: RecommendationInput): {
  recommendation: 'auto-merge' | 'editor';
  reasons: string[];
} {
  const reasons: string[] = [];

  if (input.verdict !== 'PASS') {
    reasons.push(`verdict ${input.verdict} (auto-merge requires PASS)`);
  }
  if (input.syntaxErrorCount > 0) {
    reasons.push(`${input.syntaxErrorCount} syntax error(s)`);
  }
  // Two hazards here, both fail-open if handled loosely.
  //
  // Strict identity, not truthiness: `evaluateDiff` reads these straight off
  // model JSON, and a quoted "false" is a truthy string, so `!passed` would
  // admit it as a passing check.
  //
  // And a fixed list of names, not `Object.entries(input.diffChecks)`: that
  // enumerates the object's own keys, so `{}` — or any object missing a key —
  // never enters the loop and reports no failures at all. Absent must gate.
  for (const check of DIFF_CHECK_NAMES) {
    if (input.diffChecks?.[check] !== true) reasons.push(`diff check failed: ${check}`);
  }
  if (input.findingsMalformed) {
    reasons.push('findings payload missing or malformed (fail-closed)');
  }
  if (input.sourceContentMissing) {
    reasons.push('source content could not be fetched — the review compared against nothing');
  }
  if (input.findingsSuppressed) {
    reasons.push(
      'findings suppressed by max-suggestions=0 — the findings half of the gate is blind'
    );
  }

  const blockers = input.findings.filter((f) => f.severity === 'blocker').length;
  const majors = input.findings.filter((f) => f.severity === 'major').length;
  const gatingMinors = input.findings.filter(
    (f) => f.severity === 'minor' && GATING_CATEGORIES.includes(f.category)
  ).length;
  if (blockers > 0) reasons.push(`${blockers} blocker finding(s)`);
  if (majors > 0) reasons.push(`${majors} major finding(s)`);
  if (gatingMinors > 0) {
    reasons.push(
      `${gatingMinors} minor finding(s) in gating categories (${GATING_CATEGORIES.join('/')})`
    );
  }

  // Bounded on both sides. A response on a 0-100 scale (accuracy: 85) clears
  // every floor while meaning nothing of the sort, so an out-of-range score is
  // a scale error and gates rather than passing.
  // `input.scores` is read defensively rather than indexed directly: a null or
  // non-object value threw a TypeError out of the gate. Throwing is not the
  // same as gating — a caller that catches must not be able to interpret the
  // failure as anything but `editor`, so an unusable score set gates here.
  const scores: Record<string, unknown> = isPlainObject(input.scores) ? input.scores : {};
  for (const [criterion, floor] of Object.entries(CRITERION_FLOORS)) {
    const score = scores[criterion];
    if (typeof score !== 'number' || !Number.isFinite(score)) {
      reasons.push(`${criterion} score missing or non-numeric`);
    } else if (!(score >= floor)) {
      reasons.push(`${criterion} ${score} below floor ${floor}`);
    } else if (!(score <= MAX_CRITERION_SCORE)) {
      reasons.push(`${criterion} ${score} above the ${MAX_CRITERION_SCORE}-point scale`);
    }
  }

  return { recommendation: reasons.length === 0 ? 'auto-merge' : 'editor', reasons };
}

// ============================================================================
// BLOCK SERIALISATION
// ============================================================================

/**
 * Neutralise HTML-comment openings in model-authored prose before it is
 * rendered into the review comment body.
 *
 * The reviewer summarises lecture content an attacker may control, and its
 * summaries, strengths and finding descriptions are rendered verbatim into the
 * comment. Without this, crafted content could induce the model to emit a
 * literal `<!-- translation-review-verdict … -->` block inside a description;
 * that forged block lands *earlier* in the body than the real one, and a
 * consumer parsing the comment would read the attacker's verdict —
 * `recommendation: "auto-merge"` against a SHA of their choosing — instead of
 * the engine's. Escaping the opening `<` to `&lt;` makes the sequence render
 * as literal text and, decisively, leaves the raw body with no verdict marker
 * the engine did not itself write.
 *
 * Applies to the prose only. The JSON payload keeps the original text: `<!--`
 * is inert inside a JSON string value, and `buildVerdictBlock` separately
 * escapes the sequences that could close the block early.
 */
export function sanitizeCommentText(text: string): string {
  return text.replace(/<!--/g, '&lt;!--');
}

/**
 * Serialise the verdict into its HTML-comment block.
 *
 * Model-authored text can contain `-->` (or the HTML5 `--!>` variant), which
 * would terminate the comment early and dump raw JSON into the rendered
 * review. Those sequences can only occur inside JSON string values, so they
 * are re-escaped as `>` — the parsed data is unchanged.
 */
export function buildVerdictBlock(verdict: ReviewVerdictV2): string {
  const json = JSON.stringify(verdict, null, 2)
    .replace(/-->/g, '--\\u003e')
    .replace(/--!>/g, '--!\\u003e');
  return `<!-- ${REVIEW_VERDICT_MARKER}\n${json}\n-->`;
}

/**
 * Parse a verdict block out of a review comment body.
 *
 * Takes the **last** block in the body, never the first. `buildVerdictBlock`
 * appends the real verdict at the end of the comment, so any earlier block is
 * either a forgery smuggled through model-authored prose (see
 * `sanitizeCommentText`) or a stale fragment. Selecting the last one is
 * defence in depth: if sanitisation is ever bypassed, the engine's own block
 * still wins. A malformed last block returns undefined rather than falling
 * back to an earlier one — that fallback is exactly how a forgery would win.
 *
 * Returns undefined for a missing, unparseable, or wrong-shape block —
 * consumers must fail closed and treat that as an `editor` route.
 */
export function parseReviewVerdict(commentBody: string): ReviewVerdictV2 | undefined {
  const matches = [
    ...commentBody.matchAll(
      new RegExp(`<!-- ${REVIEW_VERDICT_MARKER}\\r?\\n([\\s\\S]*?)\\r?\\n-->`, 'g')
    ),
  ];
  if (matches.length === 0) return undefined;
  const match = matches[matches.length - 1];

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;

  return isWellFormedVerdict(parsed) ? (parsed as ReviewVerdictV2) : undefined;
}

const isString = (v: unknown): boolean => typeof v === 'string';
const isNonEmptyString = (v: unknown): boolean => typeof v === 'string' && v !== '';
const isFiniteNumber = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v);
const isNullableString = (v: unknown): boolean => v === null || typeof v === 'string';

/**
 * Whether a parsed payload is a structurally complete verdict.
 *
 * Every required field is checked for presence *and* type, not just the few
 * the routing decision reads. Two failures motivate the completeness: a block
 * carrying only the routing fields parses, and then a consumer reading
 * `scores.overall` throws on `undefined`; and an unchecked `autoMergeMode`
 * can arrive as `"active"` — outside the declared union — which a downstream
 * router could act on. A partially-valid block is a wrong-shape block, and the
 * contract promises those are rejected.
 */
function isWellFormedVerdict(parsed: unknown): boolean {
  if (!isPlainObject(parsed)) return false;
  const b = parsed;

  if (b.schemaVersion !== REVIEW_VERDICT_SCHEMA_VERSION) return false;
  if (!['PASS', 'WARN', 'FAIL'].includes(b.verdict as string)) return false;
  if (!['auto-merge', 'editor'].includes(b.recommendation as string)) return false;
  if (!['off', 'shadow'].includes(b.autoMergeMode as string)) return false;
  if (b.wouldAutoMerge !== undefined && typeof b.wouldAutoMerge !== 'boolean') return false;

  if (!isNonEmptyString(b.reviewedHeadSha)) return false;
  if (!isString(b.engineVersion) || !isString(b.reviewerModel)) return false;
  if (!isString(b.targetBaseSha) || !isString(b.sourceRepo) || !isString(b.timestamp)) return false;
  if (!isFiniteNumber(b.prNumber) || !isFiniteNumber(b.syntaxErrorCount)) return false;

  if (!Array.isArray(b.recommendationReasons) || !b.recommendationReasons.every(isString)) {
    return false;
  }

  const scores = b.scores;
  if (!isPlainObject(scores)) return false;
  for (const key of [
    'accuracy',
    'fluency',
    'terminology',
    'formatting',
    'translation',
    'diff',
    'overall',
  ]) {
    if (!isFiniteNumber(scores[key])) return false;
  }

  const diffChecks = b.diffChecks;
  if (!isPlainObject(diffChecks)) return false;
  for (const key of DIFF_CHECK_NAMES) {
    if (typeof diffChecks[key] !== 'boolean') return false;
  }

  if (!Array.isArray(b.findings)) return false;
  for (const f of b.findings) {
    if (!isPlainObject(f)) return false;
    if (!SEVERITIES.includes(f.severity as FindingSeverity)) return false;
    if (!CATEGORIES.includes(f.category as FindingCategory)) return false;
    if (!isNullableString(f.file) || !isNullableString(f.location)) return false;
    if (!isString(f.description) || !isNullableString(f.suggestion)) return false;
  }

  return true;
}

/**
 * Cross-boundary contract constants.
 *
 * These strings cross a process or repo boundary — a label the review workflow
 * gates on, a default another artefact re-declares — so producer and consumer
 * must agree on bytes, not intent. The last drift in this class merged six PRs
 * of real translated content unreviewed (v0.21.0, #131). This module is the
 * one owner, in the mold of `src/branch-naming.ts` (the pattern that has held
 * since #115): every code consumer imports from here, and the structural tests
 * in `src/__tests__/contracts.test.ts` fail when a literal is re-spelled in
 * source or when `action.yml` / the canonical templates / the written spec
 * disagree with these values.
 *
 * The written contract lives in docs/user/metadata-contract.md ("Labels");
 * the parity test asserts that page names every label owned here.
 */

/**
 * The canonical detection label: review workflows gate on it, and every
 * PR-creating path applies it. A PR without it is silently never reviewed.
 */
export const REVIEW_TRIGGER_LABEL = 'action-translation';

/** Default labels the Action's sync mode applies (action.yml `pr-labels`). */
export const SYNC_PR_LABELS: readonly string[] = [REVIEW_TRIGGER_LABEL, 'automated'];

/** Labels `translate forward --github` applies to CLI resync PRs (#131). */
export const RESYNC_PR_LABELS: readonly string[] = [
  REVIEW_TRIGGER_LABEL,
  'action-translation-sync',
  'resync',
];

/** Label on the issue a failed sync opens in the SOURCE repo (best-effort). */
export const FAILURE_ISSUE_LABEL = 'translation-sync-failure';

/**
 * Every PR label the tooling applies in a TARGET repo — the set `translate
 * setup` bootstraps and `translate doctor --check-gh` verifies, because
 * `gh pr create --label` fails outright on a missing label and the Action's
 * label call degrades to an unreviewed PR.
 */
export const TARGET_REPO_LABELS: readonly string[] = [
  ...new Set([...SYNC_PR_LABELS, ...RESYNC_PR_LABELS]),
];

/** Valid `auto-merge-mode` values; first entry is the default. */
export const AUTO_MERGE_MODES = ['off', 'shadow'] as const;
export type AutoMergeMode = (typeof AUTO_MERGE_MODES)[number];

// The model default's owner stays src/models.ts; re-exported here so contract
// consumers (and the action.yml parity test) have a single import site.
export { DEFAULT_CLAUDE_MODEL } from './models.js';

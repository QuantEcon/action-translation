/**
 * Branch naming for translation PRs — the single source of truth.
 *
 * Two commands create translation PRs, and they use different branch prefixes:
 *
 *   - the GitHub Action's sync mode creates `translation-sync-{timestamp}-pr-{n}`
 *     (see `createTranslationPR` in pr-creator.ts)
 *   - the CLI's `forward --github` creates `resync/{stem}`
 *     (see `buildBranchName` in cli/forward-pr-creator.ts)
 *
 * Rebase mode has to recognise **both**, because a wave of resync PRs goes stale
 * exactly the same way a wave of sync PRs does. Before these constants existed the
 * prefixes were string literals in three places and the rebase filter matched only
 * the first one, so `resync/*` PRs were silently never rebased — with 60+ open at
 * once during a drift-recovery wave, every stale check had to be re-enqueued by
 * hand. See https://github.com/QuantEcon/action-translation/issues/115.
 *
 * Keep the workflow-level filter in `examples/rebase-translations.yml` in step with
 * `isTranslationBranch` below: that `if` decides whether the job runs at all, and
 * this predicate decides which open PRs it then considers. A branch prefix that
 * passes one but not the other is a no-op run.
 */

/** Branch prefix used by the Action's sync mode. */
export const SYNC_BRANCH_PREFIX = 'translation-sync-';

/** Branch prefix used by the CLI's `forward --github` resync mode. */
export const RESYNC_BRANCH_PREFIX = 'resync/';

/** Every branch prefix that identifies a translation PR this tool created. */
export const TRANSLATION_BRANCH_PREFIXES = [SYNC_BRANCH_PREFIX, RESYNC_BRANCH_PREFIX] as const;

/**
 * True when `ref` is a branch created by this tool for a translation PR —
 * either a sync branch or a resync branch.
 *
 * A bare prefix with nothing after it (`resync/`, `translation-sync-`) is NOT a
 * match: no builder emits one, so such a ref did not come from us. `startsWith`
 * alone would accept them, and every match here authorises a force-push during
 * rebase — so the predicate errs towards claiming fewer branches, not more.
 *
 * @param ref - A git branch name (a PR's `head.ref`), without any `refs/heads/` prefix.
 */
export function isTranslationBranch(ref: string): boolean {
  return TRANSLATION_BRANCH_PREFIXES.some(
    (prefix) => ref.startsWith(prefix) && ref.length > prefix.length
  );
}

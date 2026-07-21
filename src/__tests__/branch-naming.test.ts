/**
 * Tests for translation branch naming.
 *
 * These cover the defect in issue #115: rebase mode filtered open PRs on the
 * `translation-sync-` prefix alone, so the CLI's `resync/*` PRs were never
 * rebased. The regression is cheap to reintroduce — the prefixes are consumed
 * by a workflow `if` in examples/rebase-translations.yml as well as by this
 * predicate — so the last test here reads that workflow and asserts the two
 * layers still agree.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  SYNC_BRANCH_PREFIX,
  RESYNC_BRANCH_PREFIX,
  TRANSLATION_BRANCH_PREFIXES,
  isTranslationBranch,
} from '../branch-naming.js';
import { buildBranchName } from '../cli/forward-pr-creator.js';

describe('isTranslationBranch', () => {
  it('accepts sync-mode branches', () => {
    expect(isTranslationBranch('translation-sync-2026-07-21T10-00-00-pr-42')).toBe(true);
  });

  it('accepts resync branches from the CLI', () => {
    expect(isTranslationBranch('resync/cobweb')).toBe(true);
  });

  it('rejects unrelated branches', () => {
    expect(isTranslationBranch('main')).toBe(false);
    expect(isTranslationBranch('feature/add-lecture')).toBe(false);
    expect(isTranslationBranch('dependabot/npm_and_yarn/foo-1.2.3')).toBe(false);
  });

  it('anchors at the start of the ref, not anywhere within it', () => {
    // A branch that merely mentions a prefix must not be treated as ours —
    // rebasing someone else's PR would rewrite history they did not expect.
    expect(isTranslationBranch('wip/resync/cobweb')).toBe(false);
    expect(isTranslationBranch('revert-translation-sync-2026-01-01')).toBe(false);
  });

  it('rejects the bare prefixes with nothing after them', () => {
    // `resync/` alone is not a branch a builder ever emits; treat it as foreign.
    expect(isTranslationBranch('resync')).toBe(false);
  });
});

describe('branch builders use the shared prefixes', () => {
  it('buildBranchName emits a ref that isTranslationBranch accepts', () => {
    // The bug in #115 was precisely that a builder and a filter disagreed.
    const ref = buildBranchName('cobweb.md');
    expect(ref).toBe(`${RESYNC_BRANCH_PREFIX}cobweb`);
    expect(isTranslationBranch(ref)).toBe(true);
  });

  it('accepts a sync branch built to the documented shape', () => {
    const ref = `${SYNC_BRANCH_PREFIX}2026-07-21T10-00-00-pr-7`;
    expect(isTranslationBranch(ref)).toBe(true);
  });
});

describe('the distributed workflow template agrees with this predicate', () => {
  // Layer 1 (the workflow `if`) decides whether the rebase job runs at all;
  // layer 2 (isTranslationBranch) decides which open PRs it then considers.
  // A prefix present in one but not the other is a silent no-op — which is
  // the exact shape of #115. Fail loudly if they drift.
  it('lists every prefix in examples/rebase-translations.yml', () => {
    const templatePath = path.join(__dirname, '..', '..', 'examples', 'rebase-translations.yml');
    const template = fs.readFileSync(templatePath, 'utf8');

    for (const prefix of TRANSLATION_BRANCH_PREFIXES) {
      expect(template).toContain(`startsWith(github.event.pull_request.head.ref, '${prefix}')`);
    }
  });
});

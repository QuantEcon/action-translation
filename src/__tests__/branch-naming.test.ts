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
    // No builder emits a bare prefix, so such a ref did not come from us. This
    // matters because every match authorises a force-push during rebase.
    for (const prefix of TRANSLATION_BRANCH_PREFIXES) {
      expect(isTranslationBranch(prefix)).toBe(false);
    }
    // ...and the near-misses either side of the boundary.
    expect(isTranslationBranch('resync')).toBe(false);
    expect(isTranslationBranch('resync/x')).toBe(true);
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

describe('no source file re-spells a branch prefix by hand', () => {
  // The original defect (#115) was a prefix literal duplicated in a filter that
  // then drifted from the builders. The first fix for it missed a THIRD copy —
  // an early return in runRebase that this suite could not see, because
  // src/index.ts has no unit coverage. Reviewing for it by eye had already failed
  // twice, so assert it structurally instead: branch-naming.ts is the only file
  // allowed to contain these literals.
  const SOURCE_DIRS = ['src', path.join('src', 'cli')];

  /**
   * Drop block and line comments so documentation prose does not trip the scan.
   * Doc comments legitimately write `resync/*` in markdown backticks, which is
   * describing the prefix rather than re-implementing it.
   */
  const stripComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('keeps the prefix literals confined to branch-naming.ts', () => {
    const offenders: string[] = [];

    for (const dir of SOURCE_DIRS) {
      const abs = path.join(__dirname, '..', '..', dir);
      for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
        if (entry.name === 'branch-naming.ts') continue;

        const code = stripComments(fs.readFileSync(path.join(abs, entry.name), 'utf8'));
        for (const prefix of TRANSLATION_BRANCH_PREFIXES) {
          // Two shapes mean the prefix is being re-implemented rather than merely
          // sharing an opening substring: the exact prefix as a standalone literal
          // (how the #115 filters were written), or a template literal that starts
          // with it and interpolates (how a branch name gets built).
          //
          // Anything else is left alone — `'translation-sync-failure'` is an issue
          // label that happens to start the same way, and is not this concept.
          const exact = [`'${prefix}'`, `"${prefix}"`];
          const built = `\`${prefix}\${`;
          if (exact.some((literal) => code.includes(literal)) || code.includes(built)) {
            offenders.push(`${dir}/${entry.name} re-spells '${prefix}'`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
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

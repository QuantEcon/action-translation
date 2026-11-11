/**
 * Tests for the recovery advice the Action prints (#281): the sync failure
 * issue's Recovery section and the comment on a PR whose rebase failed.
 *
 * Both used to prescribe `\translate-resync` with no condition, and the rebase
 * comment spelt it with a forward slash, which triggers nothing. Under the
 * 2026-08-20 ruling on #276 the documented recovery is the CLI
 * (`translate forward` for a lecture the edition has, `translate init -f` for
 * one it does not), and a resync is allowed only when no file of the source
 * PR has changed on the source's default branch since it merged.
 */

import * as fs from 'fs';
import * as path from 'path';
import { RESYNC_COMMAND } from '../inputs.js';
import { TranslationSyncMetadata } from '../pr-creator.js';
import {
  buildFailureIssueBody,
  failureIssueTitle,
  failureRecoveryLines,
  rebaseFailureComment,
} from '../recovery-advice.js';
import { HeldBackLecture, StillOpenLecture } from '../sync-premise.js';

const MERGE = '0123456789abcdef0123456789abcdef01234567';

const BASE = {
  prNumber: 1105,
  targetRepo: 'QuantEcon/lecture-python.zh-cn',
  targetLanguage: 'zh-cn',
  docsFolder: 'lectures/',
  mergeSha: MERGE,
};

const PARITY_ERROR = 'Error processing lectures/mix_model.md: Error: structural parity ...';

/** The section of a body under `heading`, up to the next `### ` heading. */
function section(body: string, heading: string): string {
  const start = body.indexOf(`${heading}\n`);
  if (start === -1) throw new Error(`no ${heading}`);
  const rest = body.slice(start + heading.length + 1);
  const end = rest.indexOf('\n### ');
  return end === -1 ? rest : rest.slice(0, end);
}

describe('failure issue (#281)', () => {
  it('keeps its title, which a later success closes it by', () => {
    expect(failureIssueTitle(1105, 'zh-cn')).toBe('Translation sync failed for PR #1105 (zh-cn)');
  });

  it('keeps its header and error list', () => {
    const body = buildFailureIssueBody({ ...BASE, errors: [PARITY_ERROR, 'second'] });
    expect(body.startsWith('### Translation sync failure\n\n**Source PR**: #1105\n')).toBe(true);
    expect(body).toContain('**Target repo**: QuantEcon/lecture-python.zh-cn');
    expect(body).toContain('**Target language**: zh-cn');
    expect(section(body, '### Errors')).toBe(`\n- ${PARITY_ERROR}\n- second\n`);
  });

  it('names the CLI route per failed lecture: forward for one the edition has, init for a new one', () => {
    const lines = failureRecoveryLines({
      ...BASE,
      errors: [PARITY_ERROR, 'Error processing lectures/new.md: ...'],
      failedLectures: [
        { file: 'lectures/mix_model.md', inEdition: true },
        { file: 'lectures/sub/new.md', inEdition: false },
        { file: 'lectures/b_new.md', previousPath: 'lectures/b.md', inEdition: true },
      ],
    });
    expect(lines.slice(0, 7)).toEqual([
      "Recover a lecture from a checkout of the source's default branch, not by re-running " +
        'this sync:',
      '',
      '- `lectures/mix_model.md`: `translate forward -f mix_model.md`.',
      '- `lectures/sub/new.md`: `translate init -f sub/new.md`; the edition does not have it yet.',
      '- `lectures/b_new.md` (renamed from `lectures/b.md`): `translate forward -f b_new.md`, ' +
        "after moving the edition's `lectures/b.md` and its state file to the new name.",
      '',
      'Any other lecture named above:',
    ]);
  });

  it('states both CLI constraints: no regeneration of a reviewed lecture, init only when absent', () => {
    const body = buildFailureIssueBody({ ...BASE, errors: [PARITY_ERROR] });
    const recovery = section(body, '### Recovery');
    expect(recovery).toContain('- one the edition has: `translate forward -f <file>`;');
    expect(recovery).toContain('- one the edition does not have yet: `translate init -f <file>`.');
    expect(recovery).toContain(
      'do not run it on a lecture that has been natively reviewed: carry the change into that ' +
        'one by hand.'
    );
    expect(recovery).toContain(
      '`translate init -f` overwrites a translation without asking, so use it only for a ' +
        'lecture the edition does not have.'
    );
  });

  it('allows a resync only under the #276 precondition, over every file of the PR', () => {
    const recovery = section(
      buildFailureIssueBody({ ...BASE, errors: [PARITY_ERROR] }),
      '### Recovery'
    );
    expect(recovery).toContain(
      `\`${RESYNC_COMMAND}\` on #1105 re-runs this sync from the PR's merge-time snapshot, for ` +
        'every file the PR changed, not only those named above. Use it only when none of those ' +
        "files has changed on the source's default branch since the PR merged; otherwise it " +
        'reverts the later changes (QuantEcon/action-translation#276).'
    );
    expect(recovery).toContain(`    git rev-list --count ${MERGE}..origin/main -- <path>`);
    expect(recovery).toContain('A structural-parity failure repeats exactly on a resync');
    // The old unconditional line is gone.
    expect(recovery).not.toContain('Once the issue is resolved');
  });

  it('writes a placeholder when the merge commit is unknown', () => {
    const lines = failureRecoveryLines({ ...BASE, mergeSha: undefined, errors: ['x'] });
    expect(lines).toContain('    git rev-list --count <merge commit>..origin/main -- <path>');
  });

  describe('with lectures held back by the premise check (#420)', () => {
    const behind: HeldBackLecture = {
      file: 'lectures/mle_intro.md',
      statePath: '.translate/state/mle_intro.md.yml',
      stateSha: '0066783aaaa',
      sourceSha: MERGE,
      case: 'behind',
    };

    it('gives only their advice when they are the only errors, with no resync line', () => {
      const lines = failureRecoveryLines({
        ...BASE,
        errors: ['Translation behind: lectures/mle_intro.md: ...'],
        heldBack: [behind],
      });
      expect(lines[0]).toMatch(/^These lectures were not synced: /);
      expect(lines.join('\n')).not.toContain('git rev-list');
      expect(lines.join('\n')).not.toContain(`\`${RESYNC_COMMAND}\` on #`);
    });

    it('puts their advice first, then the route for the other errors', () => {
      const lines = failureRecoveryLines({
        ...BASE,
        errors: ['Translation behind: lectures/mle_intro.md: ...', PARITY_ERROR],
        heldBack: [behind],
        failedLectures: [{ file: 'lectures/mix_model.md', inEdition: true }],
      });
      const text = lines.join('\n');
      expect(text.indexOf('These lectures were not synced')).toBe(0);
      expect(text).toContain('\n\n**For the other errors:**\n\n');
      expect(text.indexOf('**For the other errors:**')).toBeLessThan(
        text.indexOf('`translate forward -f mix_model.md`')
      );
      expect(text).toContain('git rev-list --count');
    });
  });

  describe('with a failed lecture the premise check found behind an open PR (#420)', () => {
    const stillOpen: StillOpenLecture = {
      file: 'lectures/mix_model.md',
      statePath: '.translate/state/mix_model.md.yml',
      stateSha: '0066783aaaa',
      sourceSha: MERGE,
      case: 'still-open',
      openPulls: ['QuantEcon/lecture-python.zh-cn#311'],
    };
    const DIAGNOSIS =
      "Translation behind: lectures/mix_model.md: zh-cn's translation of it is at source " +
      "`0066783`. This PR's change assumes the English that translation PR " +
      'QuantEcon/lecture-python.zh-cn#311 carries, and it is still open in the edition. ' +
      'Merge it, then carry this change.';

    it('keeps the error the lecture recorded, and puts the diagnosis beside it', () => {
      const body = buildFailureIssueBody({
        ...BASE,
        errors: ['Fetch failed: lectures/other.md', PARITY_ERROR, 'second'],
        stillOpen: [stillOpen],
      });
      expect(section(body, '### Errors')).toBe(
        `\n- Fetch failed: lectures/other.md\n- ${PARITY_ERROR}\n  - ${DIAGNOSIS}\n- second\n`
      );
    });

    it('lists the diagnosis as its own error when the lecture recorded none', () => {
      const body = buildFailureIssueBody({ ...BASE, errors: ['other'], stillOpen: [stillOpen] });
      expect(section(body, '### Errors')).toBe(`\n- other\n- ${DIAGNOSIS}\n`);
    });

    it('advises merging the open PR first, in place of the generic line', () => {
      const lines = failureRecoveryLines({
        ...BASE,
        errors: [PARITY_ERROR, 'Error processing lectures/b.md: ...'],
        failedLectures: [
          { file: 'lectures/mix_model.md', inEdition: true },
          { file: 'lectures/b.md', inEdition: true },
        ],
        stillOpen: [stillOpen],
      });
      expect(lines.slice(2, 4)).toEqual([
        '- `lectures/mix_model.md`: merge QuantEcon/lecture-python.zh-cn#311 in the edition ' +
          "first; it carries the English this PR's change assumes. Then carry this PR's change " +
          `into the lecture: \`translate forward -f mix_model.md\`, or \`${RESYNC_COMMAND}\` on ` +
          'this PR under the condition below.',
        '- `lectures/b.md`: `translate forward -f b.md`.',
      ]);
      expect(lines.join('\n')).toContain('git rev-list --count');
    });
  });
});

describe('rebase-failure comment (#281)', () => {
  const metadata = (sourcePR: number): TranslationSyncMetadata => ({
    sourceRepo: 'QuantEcon/lecture-python.myst',
    sourcePR,
    sourceCommitSha: 'abc',
    targetBaseSha: 'def',
    sourceLanguage: 'en',
    targetLanguage: 'zh-cn',
    claudeModel: 'claude-sonnet-5',
    files: [],
  });
  const input = {
    mergedPrNumber: 311,
    error: 'translation produced 1 error(s); branch left untouched: ...',
    overlapping: ['lectures/a.md', 'lectures/_toc.yml', 'lectures/sub/b.md'],
    docsFolder: 'lectures/',
  };

  it('on a sync PR, names its source PR across repositories, and a resync only with the precondition', () => {
    const comment = rebaseFailureComment({ ...input, metadata: metadata(1101) });
    expect(comment).toBe(
      [
        '⚠️ **Automatic rebase failed** after #311 was merged.',
        '',
        'Error: translation produced 1 error(s); branch left untouched: ...',
        '',
        'Resolve the conflicts by hand, or regenerate the overlapping lectures with `translate ' +
          "forward -f <file>` (here: `a.md`, `sub/b.md`), run from a checkout of the source's " +
          "default branch, where `<file>` is the lecture's path inside the docs folder. " +
          '`translate forward` regenerates the whole lecture, so on a lecture that has been ' +
          'natively reviewed, carry the changes in by hand instead.',
        '',
        `This PR syncs QuantEcon/lecture-python.myst#1101. A \`${RESYNC_COMMAND}\` on that PR ` +
          'rebuilds every file it changed from its merge-time snapshot, so use it only when ' +
          "none of those files has changed on the source's default branch since the PR merged " +
          '(QuantEcon/action-translation#276).',
      ].join('\n')
    );
    // No bare `#1101`, which in the edition would link the edition's own PR.
    expect(comment).not.toMatch(/(^|[^\w/.-])#1101/);
  });

  it('on a forward resync PR, names no source PR and offers no resync', () => {
    const comment = rebaseFailureComment({ ...input, metadata: metadata(0) });
    expect(comment).toContain('`translate forward -f <file>` (here: `a.md`, `sub/b.md`)');
    expect(comment).not.toContain('translate-resync');
    expect(comment).not.toContain('This PR syncs');
    expect(comment).not.toContain('#0');
  });

  it('without metadata or lecture overlaps, still names the CLI route', () => {
    const comment = rebaseFailureComment({ ...input, overlapping: ['lectures/_toc.yml'] });
    expect(comment).toContain(
      'regenerate the overlapping lectures with `translate forward -f <file>`, run'
    );
    expect(comment).not.toContain('translate-resync');
  });
});

describe('the resync command is spelt with a backslash everywhere (#281)', () => {
  // Built from parts so that this file does not match itself.
  const WRONG = ['/', 'translate-resync'].join('');
  const ROOT = path.join(__dirname, '..', '..');

  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return /\.(ts|tsx|cjs|mjs|js)$/.test(entry.name) ? [full] : [];
    });
  }

  it('in src/', () => {
    const offenders = sourceFiles(path.join(ROOT, 'src')).filter((file) =>
      fs.readFileSync(file, 'utf8').includes(WRONG)
    );
    expect(offenders).toEqual([]);
  });

  it('in the committed action bundle', () => {
    const bundle = path.join(ROOT, 'dist-action', 'index.js');
    expect(fs.readFileSync(bundle, 'utf8').includes(WRONG)).toBe(false);
  });
});

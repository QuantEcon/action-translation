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

  it('when the source moved its book, gives only the move advice (#398)', () => {
    const lines = failureRecoveryLines({
      ...BASE,
      errors: ['Sync refused: ...'],
      failedLectures: [{ file: 'lectures/mix_model.md', inEdition: true }],
      folderMoved: { from: 'lectures/_toc.yml', to: '_toc.yml' },
    });
    expect(lines[0]).toBe(
      'The source moved its book: `lectures/_toc.yml` became `_toc.yml`, outside ' +
        '`docs-folder` (`lectures/`). A sync carries changes into the lectures the edition ' +
        'already has, by path, so it cannot follow the move, and nothing was synced.'
    );
    // Moved to the repository root, whose `docs-folder` is `.`.
    expect(lines).toContain(
      "2. Set the sync workflow's `docs-folder` input to `.`, and its `paths:` filter to match."
    );
    const text = lines.join('\n');
    expect(text).not.toContain('translate forward');
    expect(text).not.toContain('git rev-list');
  });

  it('when the bibliography could not be read, says nothing synced and gives no line per lecture (#386)', () => {
    const lines = failureRecoveryLines({
      ...BASE,
      errors: ['Fetch failed (bibliography): ... Nothing was synced.'],
      failedLectures: [{ file: 'lectures/mix_model.md', inEdition: true }],
      bibliographyUnread: true,
    });
    expect(lines.slice(0, 5)).toEqual([
      'This run synced nothing: it could not read the bibliography a sync needs to carry the ' +
        "entries its citations use (the edition's `lectures/_config.yml`, and the files its " +
        '`bibtex_bibfiles` lists, in the edition and in the source). No lecture was translated ' +
        'and nothing in QuantEcon/lecture-python.zh-cn changed. Make the file the error names ' +
        "readable (a transient error needs nothing), then sync this PR's changes again: with " +
        `\`${RESYNC_COMMAND}\` under the condition below, or lecture by lecture from a ` +
        "checkout of the source's default branch:",
      '',
      '- one the edition has: `translate forward -f <file>`;',
      '- one the edition does not have yet: `translate init -f <file>`.',
      '',
    ]);
    expect(lines.join('\n')).not.toContain('translate forward -f mix_model.md');
    expect(lines).toContain(`    git rev-list --count ${MERGE}..origin/main -- <path>`);
  });

  it('when the lecture set could not be read, says nothing synced and when a resync helps (#449)', () => {
    const lines = failureRecoveryLines({
      ...BASE,
      errors: ["Sync refused: the source's lecture set at cafe000 could not be read: ..."],
      failedLectures: [{ file: 'lectures/mix_model.md', inEdition: true }],
      lectureSetUnread: true,
    });
    expect(lines.slice(0, 5)).toEqual([
      "This run synced nothing: it could not read the source's lecture set at the PR's merge " +
        'commit (`lectures/_toc.yml`, the lectures it lists and the files they include), which ' +
        'says which changed files are lectures. No lecture was translated and nothing in ' +
        'QuantEcon/lecture-python.zh-cn changed. If the read failed for a transient reason, ' +
        `sync this PR's changes again with \`${RESYNC_COMMAND}\` under the condition below. If ` +
        'the ToC is missing or broken at that commit, a resync fails the same way: fix the ToC ' +
        "in the source, then carry this PR's lectures from a checkout of the source's default " +
        'branch:',
      '',
      '- one the edition has: `translate forward -f <file>`;',
      '- one the edition does not have yet: `translate init -f <file>`.',
      '',
    ]);
    expect(lines.join('\n')).not.toContain('translate forward -f mix_model.md');
    expect(lines).toContain(`    git rev-list --count ${MERGE}..origin/main -- <path>`);
  });

  it("names the held PR's removals, which no later sync deletes, with their state files (#449)", () => {
    const lines = failureRecoveryLines({
      ...BASE,
      errors: ["Sync refused: the source's lecture set at cafe000 could not be read: ..."],
      lectureSetUnread: true,
      heldRemovals: ['lectures/old.md', 'lectures/_admonition/gpu.md'],
    });
    expect(lines.slice(1, 8)).toEqual([
      '',
      'This PR also removed or renamed lectures, and no later sync deletes them from ' +
        'QuantEcon/lecture-python.zh-cn: the change that removed them is this one. Delete each ' +
        'from the edition by hand, with its state file, where the edition has it:',
      '',
      '- `lectures/old.md` and `.translate/state/old.md.yml`',
      '- `lectures/_admonition/gpu.md` and `.translate/state/_admonition/gpu.md.yml`',
      '',
      'Then carry the lectures this PR changed:',
    ]);
    // Only a held run names them: any other run deletes its removals itself.
    expect(
      failureRecoveryLines({ ...BASE, errors: ['x'], heldRemovals: ['lectures/old.md'] }).join('\n')
    ).not.toContain('Delete each from the edition by hand');
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

  it('for a lecture deleted since the PR opened, says so, and does not offer to regenerate it (#389)', () => {
    const comment = rebaseFailureComment({
      ...input,
      deletedSinceOpened: [{ editionPath: 'lectures/a.md', path: 'lectures/a.md' }],
    });
    expect(comment.split('\n').slice(4, 6)).toEqual([
      '`lectures/a.md` is no longer on `main`: it was there when this PR opened, and a PR ' +
        'merged since deleted it. The rebase does not bring a deleted lecture back. If the ' +
        "deletion stands, remove the lecture and its state file from this PR's branch (the " +
        'next rebase then leaves it out), or close the PR if nothing else is left in it. If ' +
        'the lecture should stay in the edition, restore it on `main` first, then resolve ' +
        'this PR by hand.',
      '',
    ]);
    expect(comment).toContain('`translate forward -f <file>` (here: `sub/b.md`)');
  });

  it('names several deleted lectures together', () => {
    const comment = rebaseFailureComment({
      ...input,
      deletedSinceOpened: [
        { editionPath: 'lectures/a.md', path: 'lectures/a.md' },
        { editionPath: 'lectures/sub/b.md', path: 'lectures/sub/b.md' },
      ],
    });
    expect(comment).toContain(
      '`lectures/a.md` and `lectures/sub/b.md` are no longer on `main`: they were there when ' +
        'this PR opened, and a PR merged since deleted them.'
    );
    expect(comment).toContain(
      "remove those lectures and their state files from this PR's branch (the next rebase " +
        'then leaves them out)'
    );
    expect(comment).not.toContain('(here:');
  });

  it("names a deleted rename's old path with its path in the PR, and does not offer it to forward", () => {
    const comment = rebaseFailureComment({
      ...input,
      overlapping: ['lectures/a-new.md', 'lectures/sub/b.md'],
      deletedSinceOpened: [{ editionPath: 'lectures/a.md', path: 'lectures/a-new.md' }],
    });
    expect(comment).toContain(
      '`lectures/a.md` (`lectures/a-new.md` in this PR) is no longer on `main`'
    );
    expect(comment).toContain('`translate forward -f <file>` (here: `sub/b.md`)');
  });

  it('for a lecture main got first, says to pick a copy, and does not offer to regenerate it (#467)', () => {
    const comment = rebaseFailureComment({
      ...input,
      addedOnMainSinceOpened: [{ editionPath: 'lectures/a.md', path: 'lectures/a.md' }],
    });
    expect(comment.split('\n').slice(4, 6)).toEqual([
      '`lectures/a.md` is on `main` now but was not when this PR opened: a PR merged since ' +
        "added it, and this PR's source change adds it too, so the edition has two translations " +
        'of it. The rebase does not choose between them, and changed neither. Decide which ' +
        "copy wins. To keep `main`'s, make the lecture and its state file on this PR's branch " +
        "match `main`, or close the PR if nothing else is left in it. To keep this PR's, " +
        "resolve the conflict on its branch by hand, keeping the branch's copy. Until this PR " +
        "merges or closes, a later rebase of it stops here again, whatever the branch's copy " +
        "then holds: this PR's baseline lacks the lecture, and its branch has it.",
      '',
    ]);
    // Another overlapping lecture still gets the general advice.
    expect(comment).toContain('`translate forward -f <file>` (here: `sub/b.md`)');
  });

  it('for lectures main got first and nothing else, gives only that advice (#467)', () => {
    const comment = rebaseFailureComment({
      ...input,
      metadata: metadata(1101),
      addedOnMainSinceOpened: [
        { editionPath: 'lectures/a.md', path: 'lectures/a.md' },
        { editionPath: 'lectures/sub/b.md', path: 'lectures/sub/b.md' },
      ],
    });
    expect(comment).toContain(
      '`lectures/a.md` and `lectures/sub/b.md` are on `main` now but were not when this PR ' +
        "opened: a PR merged since added them, and this PR's source change adds them too, so " +
        'the edition has two translations of each.'
    );
    expect(comment).toContain("this PR's baseline lacks them, and its branch has them.");
    // Regenerating or resyncing would make a third translation.
    expect(comment).not.toContain('translate forward');
    expect(comment).not.toContain('translate-resync');
    expect(comment.endsWith('its branch has them.')).toBe(true);
  });

  it('for a lecture main got first beside a deleted one, keeps the general advice', () => {
    const comment = rebaseFailureComment({
      ...input,
      overlapping: ['lectures/a.md', 'lectures/sub/b.md'],
      deletedSinceOpened: [{ editionPath: 'lectures/sub/b.md', path: 'lectures/sub/b.md' }],
      addedOnMainSinceOpened: [{ editionPath: 'lectures/a.md', path: 'lectures/a.md' }],
    });
    expect(comment).toContain('Decide which copy wins.');
    expect(comment).toContain('Resolve the conflicts by hand');
    expect(comment).not.toContain('(here:');
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

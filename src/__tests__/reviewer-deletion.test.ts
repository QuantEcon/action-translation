/**
 * Review mode on translation PRs that DELETE documents (#210).
 *
 * A source PR that removes a lecture produces a translation PR that removes
 * the corresponding target file. There is no source content for that path by
 * definition — `getSourceDiff` skips the fetch deliberately — but the F40
 * guard (#163) read the resulting empty `sourceEnglish` as a failed fetch and
 * aborted the run. Every deletion therefore failed review in every language.
 *
 * The fix must be narrow: a deletion the SOURCE PR performed is expected and
 * reviewable-as-nothing; anything else that leaves source content empty is
 * still the F40 case and must stay fatal.
 */

import { TranslationReviewer } from '../reviewer.js';
import { parseReviewVerdict } from '../review-verdict.js';
import { buildForwardPRBody } from '../cli/forward-pr-creator.js';

const SOURCE_REPO = 'QuantEcon/lecture-source';
const TARGET_OWNER = 'QuantEcon';
const TARGET_REPO = 'lecture-source.zh-cn';
const DOCS = 'lectures';
const SOURCE_PR = 716;

const TARGET_HEAD = 'targethead';
const TARGET_BASE = 'targetbase';
const SOURCE_HEAD = 'sourcehead';
const SOURCE_BASE = 'sourcebase';

const SOURCE_INTRO = `# Introduction\n\nAn overview of the model.\n`;
const TARGET_INTRO_AFTER = `# 介绍\n\n模型概述。\n`;
const TARGET_INTRO_BEFORE = `# 介绍\n\n旧的模型概述。\n`;

function b64(content: string): string {
  return Buffer.from(content, 'utf-8').toString('base64');
}

const PR_BODY = `Translation of source changes.\n\n### Source PR\n**[#${SOURCE_PR} - Remove the lecture](https://github.com/${SOURCE_REPO}/pull/${SOURCE_PR})**\n`;

function resyncBody(sha: string): string {
  return buildForwardPRBody('intro.md', SOURCE_REPO, DOCS, 'Content changes detected', {
    sourceCommitSha: sha,
    targetBaseSha: TARGET_BASE,
    sourceLanguage: 'en',
    targetLanguage: 'zh-cn',
    model: 'test-model',
    statePath: '.translate/state/intro.md.yml',
  });
}

interface PrFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
}

interface Harness {
  /** Files the TARGET (translation) PR changed. */
  targetFiles: PrFile[];
  /** Files the SOURCE PR changed. */
  sourceFiles: PrFile[];
  /** Paths that exist in the source repo, by ref. Absent ⇒ getContent 404s. */
  sourceContent?: Record<string, string>;
  /** Paths that exist in the target repo at head. */
  targetHeadContent?: Record<string, string>;
  /** Paths that exist in the target repo at base. */
  targetBaseContent?: Record<string, string>;
  /** Make listing the source PR blow up, as a transient API failure would. */
  failSourceListing?: boolean;
  /** Throw this instead of serving target content — a non-404 API failure. */
  targetFetchError?: Error;
  /**
   * Throw this instead of serving source content for these paths — a non-404
   * API failure on one file's source read (#261).
   */
  sourceFetchError?: { error: Error; paths: string[]; ref?: string };
  /** Make the translation PR a CLI forward resync PR pinned to this commit. */
  resyncSha?: string;
  /**
   * Serve these paths as GitHub serves a file over 1 MB: `content: ""` with
   * the file's real `size`.
   */
  omittedContent?: { side: 'source' | 'target'; paths: string[]; ref?: string };
}

interface Recorder {
  comments: string[];
  modelCalls: string[];
  warnings: string[];
}

class NotFound extends Error {
  status = 404;
  constructor() {
    super('Not Found');
    this.name = 'HttpError';
  }
}

function makeReviewer(h: Harness, rec: Recorder): TranslationReviewer {
  const reviewer = new TranslationReviewer('fake-key', 'fake-token');

  const octokit = {
    rest: {
      pulls: {
        get: async (p: { repo: string }) => {
          if (p.repo === TARGET_REPO) {
            const body = h.resyncSha ? resyncBody(h.resyncSha) : PR_BODY;
            return {
              data: { body, head: { sha: TARGET_HEAD }, base: { sha: TARGET_BASE } },
            };
          }
          return { data: { head: { sha: SOURCE_HEAD }, base: { sha: SOURCE_BASE } } };
        },
        listFiles: 'listFiles',
      },
      repos: {
        getContent: async (p: { repo: string; path: string; ref: string }) => {
          if (h.targetFetchError && p.repo === TARGET_REPO) throw h.targetFetchError;
          if (
            h.sourceFetchError &&
            p.repo !== TARGET_REPO &&
            h.sourceFetchError.paths.includes(p.path) &&
            (h.sourceFetchError.ref === undefined || h.sourceFetchError.ref === p.ref)
          ) {
            throw h.sourceFetchError.error;
          }
          const table =
            p.repo === TARGET_REPO
              ? p.ref === TARGET_HEAD
                ? (h.targetHeadContent ?? {})
                : (h.targetBaseContent ?? {})
              : (h.sourceContent ?? {});
          const content = table[p.path];
          if (content === undefined) throw new NotFound();
          const size = Buffer.byteLength(content, 'utf-8');
          const omit = h.omittedContent;
          if (
            omit &&
            (omit.side === 'target') === (p.repo === TARGET_REPO) &&
            omit.paths.includes(p.path) &&
            (omit.ref === undefined || omit.ref === p.ref)
          ) {
            return { data: { content: '', encoding: 'none', size } };
          }
          return { data: { content: b64(content), size } };
        },
      },
    },
    paginate: async (_route: unknown, p: { repo: string }) => {
      if (p.repo === TARGET_REPO) return h.targetFiles;
      if (h.failSourceListing) throw new Error('API rate limit exceeded');
      return h.sourceFiles;
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (reviewer as any).octokit = octokit;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (reviewer as any).callWithRetry = async (_prompt: string, _max: number, operation: string) => {
    rec.modelCalls.push(operation);
    if (operation === 'evaluateTranslation') {
      return {
        accuracy: 9,
        fluency: 9,
        terminology: 9,
        formatting: 9,
        syntaxErrors: [],
        issues: [],
        findings: [],
        strengths: ['good'],
        summary: 'Fine.',
      };
    }
    return {
      scopeCorrect: true,
      positionCorrect: true,
      structurePreserved: true,
      headingMapCorrect: true,
      issues: [],
      summary: 'Fine.',
      scopeDetails: 'ok',
      positionDetails: 'ok',
      structureDetails: 'ok',
    };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (reviewer as any).postReviewComment = async (
    _n: number,
    _o: string,
    _r: string,
    body: string
  ) => {
    rec.comments.push(body);
  };

  return reviewer;
}

function run(reviewer: TranslationReviewer) {
  return reviewer.reviewPR(42, SOURCE_REPO, TARGET_OWNER, TARGET_REPO, DOCS, undefined, 'zh-cn');
}

function newRecorder(): Recorder {
  return { comments: [], modelCalls: [], warnings: [] };
}

const removed = (filename: string): PrFile => ({
  filename,
  status: 'removed',
  additions: 0,
  deletions: 175,
});
const modified = (filename: string): PrFile => ({
  filename,
  status: 'modified',
  additions: 5,
  deletions: 3,
});
const added = (filename: string): PrFile => ({
  filename,
  status: 'added',
  additions: 175,
  deletions: 0,
});

describe('reviewPR on deletion PRs (#210)', () => {
  it('does not abort when the only changed file was deleted by the source PR', async () => {
    const rec = newRecorder();
    const reviewer = makeReviewer(
      {
        targetFiles: [removed('lectures/lecture.md')],
        sourceFiles: [removed('lectures/lecture.md')],
        // Deleted on both sides: nothing exists at either head.
        sourceContent: {},
        targetHeadContent: {},
      },
      rec
    );

    const result = await run(reviewer);

    expect(result.verdict).toBe('PASS');
    expect(result.recommendation).toBe('editor');
  });

  it('spends nothing on a deletion PR — neither model call is made', async () => {
    const rec = newRecorder();
    const reviewer = makeReviewer(
      {
        targetFiles: [removed('lectures/lecture.md')],
        sourceFiles: [removed('lectures/lecture.md')],
        sourceContent: {},
        targetHeadContent: {},
      },
      rec
    );

    await run(reviewer);

    expect(rec.modelCalls).toEqual([]);
  });

  it('posts a comment that says nothing was evaluated, not a quality PASS', async () => {
    const rec = newRecorder();
    const reviewer = makeReviewer(
      {
        targetFiles: [removed('lectures/lecture.md')],
        sourceFiles: [removed('lectures/lecture.md')],
        sourceContent: {},
        targetHeadContent: {},
      },
      rec
    );

    await run(reviewer);

    expect(rec.comments).toHaveLength(1);
    const comment = rec.comments[0];
    expect(comment).toContain('deletion only');
    expect(comment).toContain('lectures/lecture.md');
    expect(comment).toContain(`#${SOURCE_PR}`);
    // The F40 failure mode was a "✅ PASS" header over a comparison that never
    // happened. The comment must state the absence outright.
    expect(comment).toMatch(/No translation quality evaluation was performed/i);
    // Machine-readable verdict is still published, and it routes to a human.
    expect(comment).toContain('"recommendation": "editor"');
  });

  it('reviews the surviving files when a PR both deletes and edits', async () => {
    const rec = newRecorder();
    const reviewer = makeReviewer(
      {
        targetFiles: [removed('lectures/lecture.md'), modified('lectures/intro.md')],
        sourceFiles: [removed('lectures/lecture.md'), modified('lectures/intro.md')],
        sourceContent: { 'lectures/intro.md': SOURCE_INTRO },
        targetHeadContent: { 'lectures/intro.md': TARGET_INTRO_AFTER },
        targetBaseContent: { 'lectures/intro.md': TARGET_INTRO_BEFORE },
      },
      rec
    );

    const result = await run(reviewer);

    // The edited file was really reviewed — both model calls ran.
    expect(rec.modelCalls).toContain('evaluateTranslation');
    expect(rec.modelCalls).toContain('evaluateDiff');
    expect(result.verdict).toBe('PASS');
    // The deleted file is not attributed as a reviewed file.
    expect(result.reviewComment).not.toContain('deletion only');
  });

  it('flags a target deletion the source PR did not make', async () => {
    const rec = newRecorder();
    const reviewer = makeReviewer(
      {
        // The translation drops the file; the source PR only edits it.
        targetFiles: [removed('lectures/intro.md')],
        sourceFiles: [modified('lectures/intro.md')],
        sourceContent: { 'lectures/intro.md': SOURCE_INTRO },
        targetHeadContent: {},
        targetBaseContent: { 'lectures/intro.md': TARGET_INTRO_BEFORE },
      },
      rec
    );

    const result = await run(reviewer);

    const verdict = parseReviewVerdict(result.reviewComment);
    const blockers = verdict?.findings.filter((f) => f.severity === 'blocker') ?? [];
    expect(blockers).toHaveLength(1);
    expect(blockers[0].file).toBe('lectures/intro.md');
    expect(blockers[0].description).toMatch(/does not delete it/);
    // A blocker routes to a human, so the defect cannot be auto-merged past.
    expect(result.recommendation).toBe('editor');
  });

  it('takes a lecture the source PR moved out of the docs folder as deleted (#398)', async () => {
    const rec = newRecorder();
    // GitHub lists the move under its new path, outside the docs folder; sync
    // deletes the translation at the old path, as for a removal.
    const movedOut = {
      filename: 'archive/lecture.md',
      previous_filename: 'lectures/lecture.md',
      status: 'renamed',
      additions: 0,
      deletions: 0,
    };
    const reviewer = makeReviewer(
      {
        targetFiles: [removed('lectures/lecture.md')],
        sourceFiles: [movedOut],
        sourceContent: {},
        targetHeadContent: {},
      },
      rec
    );

    const result = await run(reviewer);

    expect(result.verdict).toBe('PASS');
    expect(result.recommendation).toBe('editor');
    expect(rec.modelCalls).toEqual([]);
    expect(rec.comments).toHaveLength(1);
    expect(rec.comments[0]).toContain('deletion only');
  });

  it('reviews the other lectures, with no blocker, beside a lecture moved out of the folder', async () => {
    const rec = newRecorder();
    const movedOut = {
      filename: 'archive/lecture.md',
      previous_filename: 'lectures/lecture.md',
      status: 'renamed',
      additions: 0,
      deletions: 0,
    };
    const reviewer = makeReviewer(
      {
        targetFiles: [removed('lectures/lecture.md'), modified('lectures/intro.md')],
        sourceFiles: [movedOut, modified('lectures/intro.md')],
        sourceContent: { 'lectures/intro.md': SOURCE_INTRO },
        targetHeadContent: { 'lectures/intro.md': TARGET_INTRO_AFTER },
        targetBaseContent: { 'lectures/intro.md': TARGET_INTRO_BEFORE },
      },
      rec
    );

    const result = await run(reviewer);

    expect(rec.modelCalls).toContain('evaluateTranslation');
    expect(result.verdict).toBe('PASS');
    const verdict = parseReviewVerdict(result.reviewComment);
    expect(verdict?.findings.filter((f) => f.severity === 'blocker')).toHaveLength(0);
  });

  it('still flags a deletion when the source PR moved the lecture within the docs folder', async () => {
    const rec = newRecorder();
    // A move within the folder is a rename the sync carries across; a
    // translation PR that only deletes the old path has dropped the lecture.
    const movedWithin = {
      filename: 'lectures/archive/lecture.md',
      previous_filename: 'lectures/lecture.md',
      status: 'renamed',
      additions: 0,
      deletions: 0,
    };
    const reviewer = makeReviewer(
      {
        targetFiles: [removed('lectures/lecture.md')],
        sourceFiles: [movedWithin],
        sourceContent: {},
        targetHeadContent: {},
        targetBaseContent: { 'lectures/lecture.md': TARGET_INTRO_BEFORE },
      },
      rec
    );

    // Not excused as a deletion, so the missing source stays fatal (F40).
    await expect(run(reviewer)).rejects.toThrow(/Review aborted: no source content/);
    expect(rec.comments).toEqual([]);
  });

  it('reviews a rename reported as delete+add, skipping only the vanished old path', async () => {
    const rec = newRecorder();
    const reviewer = makeReviewer(
      {
        // Heavy edits defeat GitHub's rename detection, so the same move is
        // reported as a removal plus an addition rather than `renamed`. The
        // old path is absent from both heads — the deletion case again.
        targetFiles: [removed('lectures/old.md'), added('lectures/new.md')],
        sourceFiles: [removed('lectures/old.md'), added('lectures/new.md')],
        sourceContent: { 'lectures/new.md': SOURCE_INTRO },
        targetHeadContent: { 'lectures/new.md': TARGET_INTRO_AFTER },
        targetBaseContent: {},
      },
      rec
    );

    const result = await run(reviewer);

    expect(rec.modelCalls).toContain('evaluateTranslation');
    expect(result.verdict).toBe('PASS');
    const verdict = parseReviewVerdict(result.reviewComment);
    expect(verdict?.findings.filter((f) => f.severity === 'blocker')).toHaveLength(0);
  });

  it('fails the run when the target fetch fails for a reason other than 404', async () => {
    const rec = newRecorder();
    // Narrowing the per-file catch created a new way to review against
    // nothing: with the source fetch no longer skipped, a rate-limited target
    // fetch would leave a real document compared to an empty target and get
    // reported as a catastrophic translation defect. Infrastructure failures
    // must not be laundered into review verdicts.
    const rateLimited = Object.assign(new Error('API rate limit exceeded'), { status: 403 });
    const reviewer = makeReviewer(
      {
        targetFiles: [modified('lectures/intro.md')],
        sourceFiles: [modified('lectures/intro.md')],
        sourceContent: { 'lectures/intro.md': SOURCE_INTRO },
        targetFetchError: rateLimited,
      },
      rec
    );

    await expect(run(reviewer)).rejects.toThrow(/rate limit/);
    expect(rec.modelCalls).toEqual([]);
  });

  // #244 wiring for the deletion-path block: without this, deleting
  // `engineRef: getEngineRef()` from the deletion verdict construction leaves
  // the suite green (Jest has no GITHUB_ACTION_REF, so the field is absent
  // either way).
  it('wires engineRef and the suffixed engineVersion into the deletion verdict (#244)', async () => {
    const savedRef = process.env.GITHUB_ACTION_REF;
    process.env.GITHUB_ACTION_REF = 'main';
    try {
      const rec = newRecorder();
      const reviewer = makeReviewer(
        {
          targetFiles: [removed('lectures/lecture.md')],
          sourceFiles: [removed('lectures/lecture.md')],
          sourceContent: {},
          targetHeadContent: {},
        },
        rec
      );

      const result = await run(reviewer);

      const verdict = parseReviewVerdict(result.reviewComment);
      expect(verdict?.engineRef).toBe('main');
      expect(verdict?.engineVersion).toMatch(/^\d+\.\d+\.\d+\+main$/);
    } finally {
      if (savedRef === undefined) delete process.env.GITHUB_ACTION_REF;
      else process.env.GITHUB_ACTION_REF = savedRef;
    }
  });

  it('still aborts when source content is missing for a file that was NOT deleted (F40)', async () => {
    const rec = newRecorder();
    const reviewer = makeReviewer(
      {
        targetFiles: [modified('lectures/intro.md')],
        // Source PR does not mention the file, and fetching it 404s — a
        // genuine failed fetch, which is the case F40 exists to catch.
        sourceFiles: [],
        sourceContent: {},
        targetHeadContent: { 'lectures/intro.md': TARGET_INTRO_AFTER },
      },
      rec
    );

    await expect(run(reviewer)).rejects.toThrow(/no source content could be fetched/);
    expect(rec.modelCalls).toEqual([]);
  });

  it('fails closed when the source PR cannot be listed — an unreadable diff excuses nothing', async () => {
    const rec = newRecorder();
    const reviewer = makeReviewer(
      {
        targetFiles: [removed('lectures/lecture.md')],
        sourceFiles: [removed('lectures/lecture.md')],
        // The deletion is real, but we could not read the source PR to learn
        // that. An empty `removed` set must not be read as "nothing was
        // deleted on purpose" in the permissive direction.
        failSourceListing: true,
        sourceContent: {},
        targetHeadContent: {},
      },
      rec
    );

    await expect(run(reviewer)).rejects.toThrow(/no source content could be fetched/);
  });
});

// The per-file source-fetch gate (#261). A source read that fails with
// anything but a 404 used to read as "file absent": the file dropped out of
// the review, and the run could PASS having reviewed less than the PR. Only a
// 404 means absent (D-2026-11-15-only-a-404-means-absent).
describe('reviewPR per-file source-fetch gate (#261)', () => {
  const FILES = ['lectures/a.md', 'lectures/b.md', 'lectures/c.md'];
  const serverError = () => Object.assign(new Error('Server Error'), { status: 500 });
  const allSources = Object.fromEntries(FILES.map((f) => [f, SOURCE_INTRO]));
  const without = (table: Record<string, string>, path: string) =>
    Object.fromEntries(Object.entries(table).filter(([k]) => k !== path));
  const threeFiles = (over: Partial<Harness> = {}): Harness => ({
    targetFiles: FILES.map(modified),
    sourceFiles: FILES.map(modified),
    sourceContent: allSources,
    targetHeadContent: Object.fromEntries(FILES.map((f) => [f, TARGET_INTRO_AFTER])),
    targetBaseContent: Object.fromEntries(FILES.map((f) => [f, TARGET_INTRO_BEFORE])),
    ...over,
  });

  it('reviews all three files when every read succeeds', async () => {
    const rec = newRecorder();
    const result = await run(makeReviewer(threeFiles(), rec));

    expect(rec.modelCalls).toEqual(['evaluateTranslation', 'evaluateDiff']);
    expect(result.recommendationReasons.join('\n')).not.toMatch(/source content/);
    expect(result.recommendation).toBe('auto-merge');
  });

  it("fails the run, naming the file, when one file's source read at head returns 500", async () => {
    const rec = newRecorder();
    const reviewer = makeReviewer(
      threeFiles({
        sourceFetchError: { error: serverError(), paths: ['lectures/b.md'], ref: SOURCE_HEAD },
      }),
      rec
    );

    await expect(run(reviewer)).rejects.toThrow(
      /Could not read source lectures\/b\.md @ sourceh: Server Error/
    );
    // Before any model call, and nothing posted: a rerun reviews the whole PR.
    expect(rec.modelCalls).toEqual([]);
    expect(rec.comments).toEqual([]);
  });

  it("fails the run, naming the file, when one file's source read at base returns 500", async () => {
    const rec = newRecorder();
    const reviewer = makeReviewer(
      threeFiles({
        sourceFetchError: { error: serverError(), paths: ['lectures/b.md'], ref: SOURCE_BASE },
      }),
      rec
    );

    await expect(run(reviewer)).rejects.toThrow(/Could not read source lectures\/b\.md @ sourceb/);
    expect(rec.modelCalls).toEqual([]);
  });

  it("fails a resync PR's run, naming the file, when one source read returns 500", async () => {
    const rec = newRecorder();
    const reviewer = makeReviewer(
      threeFiles({
        resyncSha: '450bafecd23db638602150b47f4272b98aad3146',
        sourceFetchError: { error: serverError(), paths: ['lectures/b.md'] },
      }),
      rec
    );

    await expect(run(reviewer)).rejects.toThrow(
      /Could not read source lectures\/b\.md @ 450bafe: Server Error/
    );
    expect(rec.modelCalls).toEqual([]);
    expect(rec.comments).toEqual([]);
  });

  it('routes a 404 on one file to editor, naming the file in the reasons and the comment', async () => {
    const rec = newRecorder();
    const others = without(allSources, 'lectures/b.md');
    const result = await run(makeReviewer(threeFiles({ sourceContent: others }), rec));

    // The other two files were reviewed.
    expect(rec.modelCalls).toEqual(['evaluateTranslation', 'evaluateDiff']);
    expect(result.recommendation).toBe('editor');
    expect(result.recommendationReasons).toContain(
      'source content could not be fetched for lectures/b.md — the review compared that file against nothing'
    );
    expect(result.reviewComment).toContain('source content could not be fetched for lectures/b.md');
    const verdict = parseReviewVerdict(result.reviewComment);
    expect(verdict?.recommendation).toBe('editor');
    expect(verdict?.recommendationReasons.join('\n')).toContain('lectures/b.md');
  });

  it('routes a 404 on one file of a resync PR to editor, naming the file', async () => {
    const rec = newRecorder();
    const others = without(allSources, 'lectures/c.md');
    const result = await run(
      makeReviewer(
        threeFiles({
          resyncSha: '450bafecd23db638602150b47f4272b98aad3146',
          sourceContent: others,
        }),
        rec
      )
    );

    expect(result.recommendation).toBe('editor');
    expect(result.recommendationReasons.join('\n')).toMatch(
      /source content could not be fetched for lectures\/c\.md/
    );
  });

  it('leaves out a file the translation PR removes — the deletion blocker covers it', async () => {
    const rec = newRecorder();
    const result = await run(
      makeReviewer(
        {
          targetFiles: [modified('lectures/a.md'), removed('lectures/b.md')],
          sourceFiles: [modified('lectures/a.md')],
          // The source has no b.md either, so its source read is a 404.
          sourceContent: { 'lectures/a.md': SOURCE_INTRO },
          targetHeadContent: { 'lectures/a.md': TARGET_INTRO_AFTER },
          targetBaseContent: { 'lectures/a.md': TARGET_INTRO_BEFORE },
        },
        rec
      )
    );

    expect(result.recommendation).toBe('editor');
    expect(result.recommendationReasons.join('\n')).not.toMatch(
      /source content could not be fetched/
    );
    expect(result.recommendationReasons.join('\n')).toMatch(/blocker/);
  });

  it('names a file a resync PR removes whose source read is a 404: no deletion blocker runs there', async () => {
    const rec = newRecorder();
    const result = await run(
      makeReviewer(
        {
          resyncSha: '450bafecd23db638602150b47f4272b98aad3146',
          targetFiles: [modified('lectures/a.md'), removed('lectures/b.md')],
          sourceFiles: [],
          sourceContent: { 'lectures/a.md': SOURCE_INTRO },
          targetHeadContent: { 'lectures/a.md': TARGET_INTRO_AFTER },
          targetBaseContent: {
            'lectures/a.md': TARGET_INTRO_BEFORE,
            'lectures/b.md': TARGET_INTRO_BEFORE,
          },
        },
        rec
      )
    );

    expect(result.recommendation).toBe('editor');
    expect(result.recommendationReasons).toContain(
      'source content could not be fetched for lectures/b.md \u{2014} the review compared that file against nothing'
    );
  });

  // GitHub returns a file over 1 MB with `content: ""` and its real size.
  // Decoded as is, that was an empty document: neither failed nor named, so a
  // multi-file PR could still record auto-merge. It is not a 404 — the file
  // exists — so it fails the run like any other failed read.
  const SIZE = Buffer.byteLength(SOURCE_INTRO, 'utf-8');

  it.each([
    ['head', SOURCE_HEAD, 'sourceh'],
    ['base', SOURCE_BASE, 'sourceb'],
  ])(
    'fails the run, naming the file and its size, when a source read at %s comes back without content',
    async (_side, ref, short) => {
      const rec = newRecorder();
      const reviewer = makeReviewer(
        threeFiles({ omittedContent: { side: 'source', paths: ['lectures/b.md'], ref } }),
        rec
      );

      await expect(run(reviewer)).rejects.toThrow(
        `Could not read source lectures/b.md @ ${short}: the contents API returned no content ` +
          `for this ${SIZE}-byte file`
      );
      expect(rec.modelCalls).toEqual([]);
      expect(rec.comments).toEqual([]);
    }
  );

  it("fails a resync PR's run, naming the file, when a source read comes back without content", async () => {
    const rec = newRecorder();
    const reviewer = makeReviewer(
      threeFiles({
        resyncSha: '450bafecd23db638602150b47f4272b98aad3146',
        omittedContent: { side: 'source', paths: ['lectures/b.md'] },
      }),
      rec
    );

    await expect(run(reviewer)).rejects.toThrow(
      `Could not read source lectures/b.md @ 450bafe: the contents API returned no content ` +
        `for this ${SIZE}-byte file`
    );
    expect(rec.modelCalls).toEqual([]);
  });

  it.each([
    ['head', TARGET_HEAD],
    ['base', TARGET_BASE],
  ])(
    'fails the run, naming the file, when a target read at %s comes back without content',
    async (_side, ref) => {
      const rec = newRecorder();
      const reviewer = makeReviewer(
        threeFiles({ omittedContent: { side: 'target', paths: ['lectures/b.md'], ref } }),
        rec
      );

      await expect(run(reviewer)).rejects.toThrow(
        /Could not read target lectures\/b\.md @ \w+: the contents API returned no content for this \d+-byte file/
      );
      expect(rec.modelCalls).toEqual([]);
      expect(rec.comments).toEqual([]);
    }
  );

  it('reviews a genuinely empty source file (size 0) as empty, as before', async () => {
    const rec = newRecorder();
    const result = await run(
      makeReviewer(threeFiles({ sourceContent: { ...allSources, 'lectures/b.md': '' } }), rec)
    );

    // Not a failed read and not a missing file: the run reviews all three.
    expect(rec.modelCalls).toEqual(['evaluateTranslation', 'evaluateDiff']);
    expect(result.recommendationReasons.join('\n')).not.toMatch(/source content/);
  });
});

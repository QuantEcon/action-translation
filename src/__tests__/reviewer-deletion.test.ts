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
            return {
              data: { body: PR_BODY, head: { sha: TARGET_HEAD }, base: { sha: TARGET_BASE } },
            };
          }
          return { data: { head: { sha: SOURCE_HEAD }, base: { sha: SOURCE_BASE } } };
        },
        listFiles: 'listFiles',
      },
      repos: {
        getContent: async (p: { repo: string; path: string; ref: string }) => {
          const table =
            p.repo === TARGET_REPO
              ? p.ref === TARGET_HEAD
                ? (h.targetHeadContent ?? {})
                : (h.targetBaseContent ?? {})
              : (h.sourceContent ?? {});
          const content = table[p.path];
          if (content === undefined) throw new NotFound();
          return { data: { content: b64(content) } };
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

const removed = (filename: string): PrFile => ({ filename, status: 'removed', additions: 0, deletions: 175 });
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

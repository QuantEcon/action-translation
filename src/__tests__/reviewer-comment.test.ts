/**
 * Tests for review comment posting (issue #96)
 *
 * Concurrent review runs are routine — one sync fires `opened` plus a `labeled` event per
 * label — and the old list-then-create left one comment per run that lost the race. These
 * tests drive several reviewers against a shared fake comments API and assert the invariant
 * that matters: whatever the interleaving, the PR ends up with exactly one review comment.
 */

import * as github from '@actions/github';
import { TranslationReviewer, isActionReviewComment, REVIEW_COMMENT_MARKER } from '../reviewer.js';

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('@actions/github', () => ({
  getOctokit: jest.fn(),
}));

// =============================================================================
// TEST HELPERS
// =============================================================================

interface Comment {
  id: number;
  body: string;
}

/** The 404 Octokit raises for a comment another run already deleted. */
function notFound(): Error {
  return Object.assign(new Error('Not Found'), { status: 404 });
}

/**
 * In-memory stand-in for the GitHub issue-comments API.
 *
 * Ids increase with creation order, as GitHub's do — the de-duplication relies on that.
 * Every method is async, so concurrent reviewers interleave at each `await` and reproduce
 * the real race: all of them list before any of them creates.
 */
class FakeCommentsApi {
  comments: Comment[] = [];
  createdIds: number[] = [];
  private nextId = 100;

  listComments = jest.fn(async () => ({ data: [...this.comments] }));

  createComment = jest.fn(async ({ body }: { body: string }) => {
    const comment = { id: this.nextId++, body };
    this.comments.push(comment);
    this.createdIds.push(comment.id);
    return { data: comment };
  });

  updateComment = jest.fn(async ({ comment_id, body }: { comment_id: number; body: string }) => {
    const comment = this.comments.find((c) => c.id === comment_id);
    if (!comment) throw notFound();
    comment.body = body;
    return { data: comment };
  });

  deleteComment = jest.fn(async ({ comment_id }: { comment_id: number }) => {
    const index = this.comments.findIndex((c) => c.id === comment_id);
    if (index === -1) throw notFound();
    this.comments.splice(index, 1);
    return { data: undefined };
  });

  /** Seed a comment that predates this API's id range (an earlier run's, or a human's). */
  seed(body: string): Comment {
    const comment = { id: this.nextId++, body };
    this.comments.push(comment);
    return comment;
  }

  get octokit() {
    return {
      rest: {
        issues: {
          listComments: this.listComments,
          createComment: this.createComment,
          updateComment: this.updateComment,
          deleteComment: this.deleteComment,
        },
      },
      paginate: async (
        endpoint: (params: unknown) => Promise<{ data: Comment[] }>,
        params: unknown
      ) => (await endpoint(params)).data,
    };
  }
}

const REVIEW_BODY = `## ✅ Translation Quality Review

**Verdict**: PASS | **Model**: claude-sonnet-5

---
*This review was generated automatically by [action-translation](https://github.com/quantecon/action-translation) review mode.*`;

/** A review comment as v0.16.1 and earlier posted it: no marker. */
const LEGACY_BODY = REVIEW_BODY;

function newReviewer(api: FakeCommentsApi): TranslationReviewer {
  (github.getOctokit as jest.Mock).mockReturnValue(api.octokit);
  return new TranslationReviewer('test-anthropic-key', 'test-github-token');
}

/** postReviewComment is private — drive it directly rather than run a whole review. */
function postReview(reviewer: TranslationReviewer, body: string = REVIEW_BODY): Promise<void> {
  const post = (
    reviewer as unknown as {
      postReviewComment(pr: number, owner: string, repo: string, comment: string): Promise<void>;
    }
  ).postReviewComment;
  return post.call(reviewer, 6, 'QuantEcon', 'lecture-python-programming.fr', body);
}

/** One reviewer per concurrent workflow run, all against the same PR. */
function postReviewsConcurrently(api: FakeCommentsApi, runs: number): Promise<void[]> {
  const reviewers = Array.from({ length: runs }, () => newReviewer(api));
  return Promise.all(
    reviewers.map((reviewer, i) => postReview(reviewer, `${REVIEW_BODY}\nrun ${i}`))
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

// =============================================================================
// COMMENT IDENTIFICATION
// =============================================================================

describe('isActionReviewComment', () => {
  it('should match a comment carrying the marker', () => {
    expect(isActionReviewComment(`${REVIEW_COMMENT_MARKER}\n${REVIEW_BODY}`)).toBe(true);
  });

  it('should match a legacy comment posted before the marker existed', () => {
    expect(isActionReviewComment(LEGACY_BODY)).toBe(true);
  });

  it('should not match an unrelated comment', () => {
    expect(isActionReviewComment('LGTM, merging once CI is green.')).toBe(false);
  });

  it('should not match a comment quoting a review', () => {
    const quoted = `> ## ✅ Translation Quality Review
> **Verdict**: PASS — generated by action-translation

The terminology score looks too high to me.`;

    expect(isActionReviewComment(quoted)).toBe(false);
  });

  it('should not match a comment that reproduces a review below its own text', () => {
    const reposted = `For the record, here is what the bot said:

${REVIEW_COMMENT_MARKER}
${REVIEW_BODY}`;

    expect(isActionReviewComment(reposted)).toBe(false);
  });

  it('should not match empty or missing bodies', () => {
    expect(isActionReviewComment('')).toBe(false);
    expect(isActionReviewComment(undefined)).toBe(false);
    expect(isActionReviewComment(null)).toBe(false);
  });
});

// =============================================================================
// POSTING
// =============================================================================

describe('postReviewComment', () => {
  it('should post a comment carrying the marker when the PR has none', async () => {
    const api = new FakeCommentsApi();

    await postReview(newReviewer(api));

    expect(api.comments).toHaveLength(1);
    expect(api.comments[0].body.startsWith(REVIEW_COMMENT_MARKER)).toBe(true);
    expect(api.comments[0].body).toContain('Translation Quality Review');
  });

  it('should update the existing comment in place on re-review', async () => {
    const api = new FakeCommentsApi();
    await postReview(newReviewer(api));
    const originalId = api.comments[0].id;

    await postReview(newReviewer(api), `${REVIEW_BODY}\nsecond pass`);

    expect(api.comments).toHaveLength(1);
    expect(api.comments[0].id).toBe(originalId);
    expect(api.comments[0].body).toContain('second pass');
    expect(api.createComment).toHaveBeenCalledTimes(1);
  });

  it('should leave other comments on the PR alone', async () => {
    const api = new FakeCommentsApi();
    const human = api.seed('Please hold off, I want to check the glossary terms first.');

    await postReview(newReviewer(api));

    expect(api.comments.map((c) => c.id)).toContain(human.id);
    expect(api.comments).toHaveLength(2);
  });

  // ---------------------------------------------------------------------------
  // Issue #96: five events (opened + one labeled per label) → five concurrent runs
  // ---------------------------------------------------------------------------

  it('should leave exactly one comment when five runs review the same PR at once', async () => {
    const api = new FakeCommentsApi();

    await postReviewsConcurrently(api, 5);

    expect(api.comments).toHaveLength(1);
    expect(api.comments[0].body.startsWith(REVIEW_COMMENT_MARKER)).toBe(true);
  });

  it('should keep the newest comment, holding one run verbatim rather than an interleaving', async () => {
    const api = new FakeCommentsApi();

    await postReviewsConcurrently(api, 5);

    // On the PR that prompted issue #96 the two surviving comments had each been overwritten
    // by a *different* run than the one that created them. The survivor must be one run's
    // review, and the newest — that ordering is what makes the de-duplication converge.
    const survivor = api.comments[0];
    const runsFound = [0, 1, 2, 3, 4].filter((i) => survivor.body.includes(`run ${i}`));
    expect(runsFound).toHaveLength(1);
    expect(survivor.id).toBe(Math.max(...api.createdIds));
  });

  it('should converge when a second run starts after the first has finished', async () => {
    const api = new FakeCommentsApi();
    await postReview(newReviewer(api));

    await postReviewsConcurrently(api, 3);

    expect(api.comments).toHaveLength(1);
  });

  it('should clean up duplicates left by earlier versions of the action', async () => {
    // The shape observed on lecture-python-programming.fr#6: two marker-less duplicates.
    const api = new FakeCommentsApi();
    api.seed(LEGACY_BODY);
    const newer = api.seed(LEGACY_BODY);

    await postReview(newReviewer(api));

    expect(api.comments).toHaveLength(1);
    expect(api.comments[0].id).toBe(newer.id);
    expect(api.comments[0].body.startsWith(REVIEW_COMMENT_MARKER)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Failure handling
  // ---------------------------------------------------------------------------

  it('should retry the update when a concurrent run deletes the comment first', async () => {
    const api = new FakeCommentsApi();
    const stale = api.seed(`${REVIEW_COMMENT_MARKER}\n${REVIEW_BODY}`);
    api.updateComment.mockImplementationOnce(async () => {
      api.comments = api.comments.filter((c) => c.id !== stale.id);
      throw notFound();
    });

    await postReview(newReviewer(api), `${REVIEW_BODY}\nretried`);

    expect(api.comments).toHaveLength(1);
    expect(api.comments[0].body).toContain('retried');
  });

  it('should still report the review when a duplicate cannot be deleted', async () => {
    const api = new FakeCommentsApi();
    api.seed(LEGACY_BODY);
    api.seed(LEGACY_BODY);
    api.deleteComment.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));

    await expect(postReview(newReviewer(api))).resolves.toBeUndefined();
  });

  it('should surface a failure to post at all', async () => {
    const api = new FakeCommentsApi();
    api.createComment.mockRejectedValue(Object.assign(new Error('Server Error'), { status: 500 }));

    await expect(postReview(newReviewer(api))).rejects.toThrow('Server Error');
  });
});

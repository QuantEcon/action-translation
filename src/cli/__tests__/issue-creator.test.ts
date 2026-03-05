/**
 * Tests for the GitHub Issue creator.
 *
 * The gh CLI runner is injectable, so tests mock it without calling gh.
 */

import {
  buildGhArgs,
  createIssue,
  createIssuesForAccepted,
  GhRunner,
  IssueResult,
} from '../issue-creator.js';
import { SuggestionWithContext } from '../commands/review.js';

// ── fixture ────────────────────────────────────────────────────────────────

function makeSuggestion(overrides: Partial<SuggestionWithContext> = {}): SuggestionWithContext {
  return {
    file: 'ar1_processes.md',
    timestamp: '2026-03-05T12:00:00Z',
    sourceRepo: 'lecture-python-intro',
    targetRepo: 'lecture-intro.zh-cn',
    suggestion: {
      sectionHeading: '## Introduction',
      recommendation: 'BACKPORT',
      category: 'BUG_FIX',
      confidence: 0.9,
      summary: 'Matrix definition needs explicit dimensions.',
      specificChanges: [
        {
          type: 'Add matrix size',
          original: 'where $A$ is defined implicitly',
          improved: 'where $A$ is a $(T+2)\\times(T+2)$ matrix',
        },
      ],
      reasoning: 'The English source omits dimensions, causing confusion.',
    },
    ...overrides,
  };
}

/** Mock runner that always succeeds and returns a fake URL. */
function successRunner(url = 'https://github.com/Org/Repo/issues/42'): GhRunner {
  return (_args, _stdin) => ({ stdout: url, stderr: '', status: 0 });
}

/** Mock runner that always fails. */
function failRunner(stderr = 'Not Found'): GhRunner {
  return (_args, _stdin) => ({ stdout: '', stderr, status: 1 });
}

// =============================================================================
// buildGhArgs
// =============================================================================

describe('buildGhArgs', () => {
  const item = makeSuggestion();
  const args = buildGhArgs(item, 'QuantEcon/lecture-python-intro');

  it('starts with "issue create"', () => {
    expect(args[0]).toBe('issue');
    expect(args[1]).toBe('create');
  });

  it('includes --repo with the supplied repo', () => {
    const repoIdx = args.indexOf('--repo');
    expect(repoIdx).toBeGreaterThan(-1);
    expect(args[repoIdx + 1]).toBe('QuantEcon/lecture-python-intro');
  });

  it('includes --title with non-empty value', () => {
    const titleIdx = args.indexOf('--title');
    expect(titleIdx).toBeGreaterThan(-1);
    expect(args[titleIdx + 1].length).toBeGreaterThan(0);
  });

  it('includes the filename in the title', () => {
    const titleIdx = args.indexOf('--title');
    expect(args[titleIdx + 1]).toContain('ar1_processes.md');
  });

  it('uses --body-file with "-" for stdin', () => {
    const idx = args.indexOf('--body-file');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe('-');
  });

  it('includes all 3 labels via --label flags', () => {
    const labelIndices: number[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--label') labelIndices.push(i + 1);
    }
    expect(labelIndices).toHaveLength(3);
    const labels = labelIndices.map(i => args[i]);
    expect(labels).toContain('translate');
    expect(labels).toContain('translate:bug-fix');
    expect(labels).toContain('translate:zh-cn');
  });

  it('does not include shell-unsafe chars in the arg list itself', () => {
    // Args should be an array — no shell expansion needed
    expect(Array.isArray(args)).toBe(true);
  });
});

// =============================================================================
// createIssue
// =============================================================================

describe('createIssue', () => {
  it('returns success=true and the URL when runner succeeds', () => {
    const item = makeSuggestion();
    const result = createIssue(item, 'Org/Repo', successRunner());
    expect(result.success).toBe(true);
    expect(result.url).toBe('https://github.com/Org/Repo/issues/42');
    expect(result.error).toBeUndefined();
  });

  it('returns success=false and an error message when runner fails', () => {
    const item = makeSuggestion();
    const result = createIssue(item, 'Org/Repo', failRunner('Not Found'));
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not Found');
    expect(result.url).toBeUndefined();
  });

  it('passes the Issue body as stdin to the runner', () => {
    const item = makeSuggestion();
    let capturedStdin = '';
    const capturingRunner: GhRunner = (_args, stdin) => {
      capturedStdin = stdin;
      return { stdout: 'https://github.com/Org/Repo/issues/99', stderr: '', status: 0 };
    };
    createIssue(item, 'Org/Repo', capturingRunner);
    expect(capturedStdin).toContain('## Summary');          // Issue body markdown
    expect(capturedStdin).toContain('ar1_processes.md');
  });

  it('passes the correct args to the runner', () => {
    const item = makeSuggestion();
    let capturedArgs: string[] = [];
    const capturingRunner: GhRunner = (args, _stdin) => {
      capturedArgs = args;
      return { stdout: 'https://github.com/Org/Repo/issues/1', stderr: '', status: 0 };
    };
    createIssue(item, 'Org/Repo', capturingRunner);
    expect(capturedArgs).toContain('--repo');
    expect(capturedArgs[capturedArgs.indexOf('--repo') + 1]).toBe('Org/Repo');
  });

  it('handles gh stderr gracefully when stdout is empty', () => {
    const item = makeSuggestion();
    const runner: GhRunner = () => ({ stdout: '', stderr: '', status: 1 });
    const result = createIssue(item, 'Org/Repo', runner);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// =============================================================================
// createIssuesForAccepted
// =============================================================================

describe('createIssuesForAccepted', () => {
  it('returns empty array immediately when no suggestions are accepted', async () => {
    const results = await createIssuesForAccepted([], 'Org/Repo', successRunner());
    expect(results).toEqual([]);
  });

  it('creates one Issue per accepted suggestion', async () => {
    const items = [makeSuggestion({ file: 'a.md' }), makeSuggestion({ file: 'b.md' })];
    let callCount = 0;
    const countingRunner: GhRunner = (_args, _stdin) => {
      callCount++;
      return { stdout: `https://github.com/Org/Repo/issues/${callCount}`, stderr: '', status: 0 };
    };
    const results = await createIssuesForAccepted(items, 'Org/Repo', countingRunner);
    expect(callCount).toBe(2);
    expect(results).toHaveLength(2);
  });

  it('marks all as success when runner always succeeds', async () => {
    const items = [makeSuggestion(), makeSuggestion({ file: 'b.md' })];
    const results = await createIssuesForAccepted(items, 'Org/Repo', successRunner());
    expect(results.every(r => r.success)).toBe(true);
  });

  it('captures failure results without throwing', async () => {
    const items = [makeSuggestion()];
    const results = await createIssuesForAccepted(items, 'Org/Repo', failRunner('auth error'));
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('auth error');
  });

  it('continues after a failed Issue creation', async () => {
    const items = [makeSuggestion({ file: 'a.md' }), makeSuggestion({ file: 'b.md' })];
    let callCount = 0;
    const partialRunner: GhRunner = (_args, _stdin) => {
      callCount++;
      if (callCount === 1) return { stdout: '', stderr: 'error', status: 1 };
      return { stdout: 'https://github.com/Org/Repo/issues/10', stderr: '', status: 0 };
    };
    const results = await createIssuesForAccepted(items, 'Org/Repo', partialRunner);
    expect(callCount).toBe(2);
    expect(results[0].success).toBe(false);
    expect(results[1].success).toBe(true);
  });
});

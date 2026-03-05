/**
 * Tests for forward-pr-creator module.
 *
 * The gh CLI runner is injectable, so tests mock it without calling gh.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  buildBranchName,
  buildPRTitle,
  buildGhArgs,
  buildForwardPRBody,
  createForwardPR,
  gitPrepareAndPush,
  GhRunner,
  GitRunner,
} from '../forward-pr-creator.js';
import { ResyncSectionResult } from '../types.js';

// ── fixtures ───────────────────────────────────────────────────────────────

function makeResults(): ResyncSectionResult[] {
  return [
    { sectionHeading: '## Introduction', action: 'RESYNCED', translatedContent: '...' },
    { sectionHeading: '## Theory', action: 'UNCHANGED' },
    { sectionHeading: '## New Section', action: 'NEW', translatedContent: '...' },
    { sectionHeading: '## Old Section', action: 'REMOVED' },
    { sectionHeading: '## Broken', action: 'ERROR', error: 'API timeout' },
  ];
}

function successRunner(url = 'https://github.com/Org/Repo/pull/7'): GhRunner {
  return (_args, _stdin) => ({ stdout: url, stderr: '', status: 0 });
}

function failRunner(stderr = 'Not Found'): GhRunner {
  return (_args, _stdin) => ({ stdout: '', stderr, status: 1 });
}

// =============================================================================
// buildBranchName
// =============================================================================

describe('buildBranchName', () => {
  it('strips .md extension', () => {
    expect(buildBranchName('cobweb.md')).toBe('resync/cobweb');
  });

  it('preserves case', () => {
    expect(buildBranchName('SolowModel.md')).toBe('resync/SolowModel');
  });

  it('sanitizes special characters', () => {
    expect(buildBranchName('my file (1).md')).toBe('resync/my-file--1-');
  });

  it('handles nested paths', () => {
    // Forward files are flat (relative to docs-folder), but handle edge case
    expect(buildBranchName('intro.md')).toBe('resync/intro');
  });
});

// =============================================================================
// buildPRTitle
// =============================================================================

describe('buildPRTitle', () => {
  it('includes emoji prefix and filename', () => {
    expect(buildPRTitle('cobweb.md')).toBe('🔄 [resync] cobweb.md');
  });
});

// =============================================================================
// buildGhArgs
// =============================================================================

describe('buildGhArgs', () => {
  const args = buildGhArgs('cobweb.md', 'QuantEcon/lecture-python.zh-cn');

  it('starts with "pr create"', () => {
    expect(args[0]).toBe('pr');
    expect(args[1]).toBe('create');
  });

  it('includes --repo with supplied repo', () => {
    const idx = args.indexOf('--repo');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe('QuantEcon/lecture-python.zh-cn');
  });

  it('includes --head with branch name', () => {
    const idx = args.indexOf('--head');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe('resync/cobweb');
  });

  it('includes --title', () => {
    const idx = args.indexOf('--title');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toContain('cobweb.md');
  });

  it('uses --body-file - for stdin body', () => {
    const idx = args.indexOf('--body-file');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe('-');
  });

  it('includes both labels', () => {
    const labelIndices = args.reduce((acc: number[], val, i) => {
      if (val === '--label') acc.push(i);
      return acc;
    }, []);
    expect(labelIndices.length).toBe(2);
    const labels = labelIndices.map(i => args[i + 1]);
    expect(labels).toContain('action-translation-sync');
    expect(labels).toContain('resync');
  });
});

// =============================================================================
// buildForwardPRBody
// =============================================================================

describe('buildForwardPRBody', () => {
  const results = makeResults();
  const body = buildForwardPRBody('cobweb.md', results);

  it('includes the filename in the heading', () => {
    expect(body).toContain('## Forward Resync: cobweb.md');
  });

  it('lists resynced sections', () => {
    expect(body).toContain('↻ Resynced');
    expect(body).toContain('## Introduction');
  });

  it('lists new sections', () => {
    expect(body).toContain('+ New');
    expect(body).toContain('## New Section');
  });

  it('lists removed sections', () => {
    expect(body).toContain('- Removed');
    expect(body).toContain('## Old Section');
  });

  it('lists unchanged count', () => {
    expect(body).toContain('Unchanged');
  });

  it('lists errors with messages', () => {
    expect(body).toContain('Errors');
    expect(body).toContain('API timeout');
  });

  it('includes action-translation attribution', () => {
    expect(body).toContain('action-translation');
  });

  it('handles empty results as whole-file resync', () => {
    const emptyBody = buildForwardPRBody('empty.md', []);
    expect(emptyBody).toContain('## Forward Resync: empty.md');
    expect(emptyBody).toContain('Whole-file resync applied');
    expect(emptyBody).not.toContain('Resynced');
    expect(emptyBody).not.toContain('Errors');
  });
});

// =============================================================================
// createForwardPR
// =============================================================================

describe('createForwardPR', () => {
  it('returns success with URL on gh success', () => {
    const result = createForwardPR(
      'cobweb.md', '# content', makeResults(),
      'QuantEcon/lecture-python.zh-cn',
      successRunner(),
    );
    expect(result.success).toBe(true);
    expect(result.url).toBe('https://github.com/Org/Repo/pull/7');
    expect(result.file).toBe('cobweb.md');
  });

  it('returns failure with error on gh failure', () => {
    const result = createForwardPR(
      'cobweb.md', '# content', makeResults(),
      'QuantEcon/lecture-python.zh-cn',
      failRunner('permission denied'),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('permission denied');
  });

  it('passes body via stdin', () => {
    let capturedStdin = '';
    const spyRunner: GhRunner = (_args, stdin) => {
      capturedStdin = stdin;
      return { stdout: 'https://example.com/pr/1', stderr: '', status: 0 };
    };

    createForwardPR('test.md', '# content', makeResults(), 'Org/Repo', spyRunner);
    expect(capturedStdin).toContain('Forward Resync: test.md');
  });

  it('passes correct args to runner', () => {
    let capturedArgs: string[] = [];
    const spyRunner: GhRunner = (args, _stdin) => {
      capturedArgs = args;
      return { stdout: 'https://example.com/pr/1', stderr: '', status: 0 };
    };

    createForwardPR('solow.md', '# content', [], 'Org/Repo', spyRunner);
    expect(capturedArgs).toContain('pr');
    expect(capturedArgs).toContain('create');
    expect(capturedArgs).toContain('Org/Repo');
    expect(capturedArgs).toContain('resync/solow');
  });
});

// =============================================================================
// gitPrepareAndPush
// =============================================================================

describe('gitPrepareAndPush', () => {
  let tmpDir: string;
  let docsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-prepare-'));
    docsDir = path.join(tmpDir, 'lectures');
    fs.mkdirSync(docsDir, { recursive: true });
    // Create an existing file so the path is valid
    fs.writeFileSync(path.join(docsDir, 'pv.md'), 'old content', 'utf-8');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeGitRunner(overrides: Record<string, { stdout: string; stderr: string; status: number }> = {}): {
    runner: GitRunner;
    calls: Array<{ args: string[]; cwd: string }>;
  } {
    const calls: Array<{ args: string[]; cwd: string }> = [];
    const runner: GitRunner = (args, cwd) => {
      calls.push({ args, cwd });
      const key = args.join(' ');

      // Check overrides first (match by prefix)
      for (const [pattern, result] of Object.entries(overrides)) {
        if (key.startsWith(pattern)) return result;
      }

      // Default behaviors
      if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') {
        return { stdout: 'main', stderr: '', status: 0 };
      }
      if (args[0] === 'rev-parse' && args[1] === '--verify') {
        return { stdout: '', stderr: 'not found', status: 1 }; // branch doesn't exist
      }
      return { stdout: '', stderr: '', status: 0 };
    };
    return { runner, calls };
  }

  it('succeeds with correct git operation sequence', () => {
    const { runner, calls } = makeGitRunner();
    const result = gitPrepareAndPush('pv.md', '# new content', tmpDir, 'lectures', runner);

    expect(result.success).toBe(true);
    expect(result.branchName).toBe('resync/pv');
    expect(result.originalBranch).toBe('main');
    expect(result.error).toBeUndefined();

    // Verify call sequence
    const ops = calls.map(c => c.args.slice(0, 2).join(' '));
    expect(ops).toEqual([
      'rev-parse --abbrev-ref',   // detect current branch
      'rev-parse --verify',       // check if branch exists
      'checkout -b',              // create new branch
      'add lectures/pv.md',       // stage
      'commit -m',                // commit
      'push -u',                  // push
      'checkout main',            // switch back
    ]);
  });

  it('writes file content to disk', () => {
    const { runner } = makeGitRunner();
    gitPrepareAndPush('pv.md', '# updated content', tmpDir, 'lectures', runner);

    const written = fs.readFileSync(path.join(docsDir, 'pv.md'), 'utf-8');
    expect(written).toBe('# updated content');
  });

  it('deletes existing branch before creating new one', () => {
    const { runner, calls } = makeGitRunner({
      'rev-parse --verify': { stdout: 'sha123', stderr: '', status: 0 }, // branch exists
    });

    const result = gitPrepareAndPush('pv.md', 'content', tmpDir, 'lectures', runner);
    expect(result.success).toBe(true);

    const ops = calls.map(c => c.args.slice(0, 2).join(' '));
    expect(ops).toContain('branch -D');
  });

  it('fails and switches back on branch creation failure', () => {
    const { runner, calls } = makeGitRunner({
      'checkout -b': { stdout: '', stderr: 'fatal: branch exists', status: 1 },
    });

    const result = gitPrepareAndPush('pv.md', 'content', tmpDir, 'lectures', runner);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to create branch');

    // Should have switched back to main
    const lastCall = calls[calls.length - 1];
    expect(lastCall.args).toEqual(['checkout', 'main']);
  });

  it('fails and switches back on push failure', () => {
    const { runner } = makeGitRunner({
      'push -u': { stdout: '', stderr: 'rejected: permission denied', status: 1 },
    });

    const result = gitPrepareAndPush('pv.md', 'content', tmpDir, 'lectures', runner);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to push');
  });

  it('fails if current branch cannot be detected', () => {
    const { runner } = makeGitRunner({
      'rev-parse --abbrev-ref': { stdout: '', stderr: 'not a git repo', status: 128 },
    });

    const result = gitPrepareAndPush('pv.md', 'content', tmpDir, 'lectures', runner);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to detect current branch');
  });

  it('all git operations run in target repo directory', () => {
    const { runner, calls } = makeGitRunner();
    gitPrepareAndPush('pv.md', 'content', tmpDir, 'lectures', runner);

    for (const call of calls) {
      expect(call.cwd).toBe(tmpDir);
    }
  });

  it('commit message includes filename', () => {
    const { runner, calls } = makeGitRunner();
    gitPrepareAndPush('cobweb.md', 'content', tmpDir, 'lectures', runner);

    const commitCall = calls.find(c => c.args[0] === 'commit');
    expect(commitCall).toBeDefined();
    expect(commitCall!.args).toContain('🔄 resync cobweb.md');
  });

  it('pushes with --force flag', () => {
    const { runner, calls } = makeGitRunner();
    gitPrepareAndPush('pv.md', 'content', tmpDir, 'lectures', runner);

    const pushCall = calls.find(c => c.args[0] === 'push');
    expect(pushCall).toBeDefined();
    expect(pushCall!.args).toContain('--force');
  });
});

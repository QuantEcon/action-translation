/**
 * Tests for the setup command
 *
 * Tests repo name derivation, workflow template generation, dry-run mode,
 * and the scaffolding pipeline using injected gh/git runners.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  deriveTargetRepoName,
  generateSourceWorkflowYaml,
  generateTargetWorkflowYaml,
  loadWorkflowTemplate,
  runSetup,
  SetupOptions,
  GhRunner,
  GitRunner,
} from '../commands/setup.js';
import { readConfig } from '../translate-state.js';

/** The packaged canonical templates — what the CLI entry threads in. */
const EXAMPLES_DIR = path.join(__dirname, '..', '..', '..', 'examples');
const REVIEW_TEMPLATE = loadWorkflowTemplate(EXAMPLES_DIR, 'review-translations.yml');

// ============================================================================
// SETUP
// ============================================================================

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'translate-setup-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ============================================================================
// REPO NAME DERIVATION
// ============================================================================

describe('deriveTargetRepoName', () => {
  test('appends language to repo name', () => {
    expect(deriveTargetRepoName('QuantEcon/lecture-python-intro', 'zh-cn')).toBe(
      'lecture-python-intro.zh-cn'
    );
  });

  test('handles different languages', () => {
    expect(deriveTargetRepoName('QuantEcon/lecture-python-intro', 'fa')).toBe(
      'lecture-python-intro.fa'
    );
  });

  test('handles repo name without owner', () => {
    expect(deriveTargetRepoName('lecture-python-intro', 'zh-cn')).toBe(
      'lecture-python-intro.zh-cn'
    );
  });
});

// ============================================================================
// WORKFLOW TEMPLATE
// ============================================================================

describe('generateSourceWorkflowYaml', () => {
  test('generates a workflow that can fire on merges and resync comments', () => {
    const yaml = generateSourceWorkflowYaml(
      'QuantEcon/lecture-python-intro.zh-cn',
      'zh-cn',
      'lectures'
    );

    expect(yaml).toContain('name: Sync Translations');
    expect(yaml).toContain('pull_request:');
    expect(yaml).toContain('types: [closed]');
    expect(yaml).toContain('issue_comment:');
    expect(yaml).toContain('types: [created]');
    expect(yaml).toContain("contains(github.event.comment.body, '\\translate-resync')");
    expect(yaml).toContain('github.event.pull_request.merged == true');
    expect(yaml).toContain('paths:');
    expect(yaml).toContain("'lectures/**/*.md'");
    expect(yaml).toContain('target-repo: QuantEcon/lecture-python-intro.zh-cn');
    expect(yaml).toContain('target-language: zh-cn');
    expect(yaml).toContain('docs-folder: lectures');
    expect(yaml).toContain('QuantEcon/action-translation@v0\n');
    expect(yaml).toContain('actions/checkout@v7');
    expect(yaml).toContain('mode: sync');
    expect(yaml).toContain('${{ secrets.TRANSLATION_PAT }}');
    expect(yaml).not.toContain('repository_dispatch');
  });

  test('uses custom docs-folder in paths filter', () => {
    const yaml = generateSourceWorkflowYaml('Owner/repo.fa', 'fa', 'docs');
    expect(yaml).toContain("'docs/**/*.md'");
    expect(yaml).toContain('docs-folder: docs');
  });

  test('normalizes root-level and decorated docs-folders in paths filter', () => {
    for (const root of ['.', '/', '']) {
      const yaml = generateSourceWorkflowYaml('Owner/repo.fa', 'fa', root);
      expect(yaml).toContain("'**/*.md'");
      expect(yaml).not.toContain("'./**/*.md'");
    }
    // `./lectures/` used to emit a broken `lectures//**/*.md` — the strip
    // regex was missing its `g` flag, so only one decoration came off.
    for (const decorated of ['lectures', 'lectures/', './lectures/', '/lectures/']) {
      const yaml = generateSourceWorkflowYaml('Owner/repo.fa', 'fa', decorated);
      expect(yaml).toContain("'lectures/**/*.md'");
      expect(yaml).not.toContain('//');
    }
  });
});

describe('generateTargetWorkflowYaml', () => {
  test('renders the canonical template with substituted inputs', () => {
    const yaml = generateTargetWorkflowYaml(
      REVIEW_TEMPLATE,
      'QuantEcon/lecture-python-programming',
      'docs',
      'fr'
    );

    expect(yaml).toContain('name: Review Translations');
    expect(yaml).toContain('types: [opened, synchronize, labeled, reopened]');
    expect(yaml).toContain("github.event.label.name == 'action-translation'");
    expect(yaml).toContain('pull-requests: write');
    expect(yaml).toContain('group: review-translations-${{ github.event.pull_request.number }}');
    expect(yaml).toContain('mode: review');
    expect(yaml).toContain("source-repo: 'QuantEcon/lecture-python-programming'");
    expect(yaml).toContain("source-language: 'fr'");
    expect(yaml).toContain("docs-folder: 'docs'");
    expect(yaml).toContain('QuantEcon/action-translation@v0\n');
    expect(yaml).toContain('actions/checkout@v7');
    // Review mode has no target-language input — it detects from the repo suffix.
    expect(yaml).not.toContain('target-language');
  });

  test('rendering the template with its own example values is the identity', () => {
    const yaml = generateTargetWorkflowYaml(
      REVIEW_TEMPLATE,
      'QuantEcon/lecture-python-intro',
      'lectures',
      'en'
    );
    expect(yaml).toBe(REVIEW_TEMPLATE);
  });

  test('throws when the template loses a substitution key', () => {
    const broken = REVIEW_TEMPLATE.replace(/^\s*source-repo:.*$/m, '');
    expect(() => generateTargetWorkflowYaml(broken, 'Owner/repo', 'lectures')).toThrow(
      /no `source-repo:` line/
    );
  });
});

// ============================================================================
// DRY RUN
// ============================================================================

describe('runSetup dry-run', () => {
  test('dry run does not create files', async () => {
    const options: SetupOptions = {
      source: 'QuantEcon/lecture-python-intro',
      targetLanguage: 'zh-cn',
      sourceLanguage: 'en',
      docsFolder: 'lectures',
      visibility: 'public',
      dryRun: true,
      examplesDir: EXAMPLES_DIR,
    };

    const result = await runSetup(options);

    expect(result.success).toBe(true);
    expect(result.repoName).toBe('lecture-python-intro.zh-cn');
    expect(result.repoFullName).toBe('QuantEcon/lecture-python-intro.zh-cn');
    expect(result.filesCreated).toContain('.translate/config.yml');
    expect(result.filesCreated).toContain('.github/workflows/review-translations.yml');
    expect(result.filesCreated).toContain('.github/workflows/rebase-translations.yml');

    // No actual files created in dry run
    expect(fs.existsSync(path.join(result.localPath, '.translate'))).toBe(false);
  });
});

// ============================================================================
// FULL SETUP WITH MOCK RUNNERS
// ============================================================================

describe('runSetup with mock runners', () => {
  /** Mock gh runner that simulates gh repo create --clone */
  function mockGhRunner(cloneDir: string): GhRunner {
    return (args: string[]) => {
      // gh repo create → create the local directory (simulating --clone)
      if (args[0] === 'repo' && args[1] === 'create') {
        fs.mkdirSync(cloneDir, { recursive: true });
        // Simulate git init
        fs.mkdirSync(path.join(cloneDir, '.git'), { recursive: true });
      }
      return { stdout: '', stderr: '', status: 0 };
    };
  }

  /** Mock git runner that just succeeds */
  const mockGitRunner: GitRunner = () => ({ stdout: '', stderr: '', status: 0 });

  test('creates repo and scaffolding files', async () => {
    const repoDir = path.join(tmpDir, 'lecture-python-intro.zh-cn');

    const options: SetupOptions = {
      source: 'QuantEcon/lecture-python-intro',
      targetLanguage: 'zh-cn',
      sourceLanguage: 'en',
      docsFolder: 'lectures',
      visibility: 'public',
      dryRun: false,
      examplesDir: EXAMPLES_DIR,
    };

    // Override cwd so path.resolve lands inside tmpDir
    const origCwd = process.cwd();
    process.chdir(tmpDir);

    try {
      const result = await runSetup(options, mockGhRunner(repoDir), mockGitRunner);

      expect(result.success).toBe(true);
      expect(result.repoName).toBe('lecture-python-intro.zh-cn');

      // Check .translate/config.yml was created
      const config = readConfig(repoDir);
      expect(config).toBeDefined();
      expect(config?.['target-language']).toBe('zh-cn');
      expect(config?.['docs-folder']).toBe('lectures');

      // Check workflow file (review workflow in target repo)
      const workflowPath = path.join(repoDir, '.github', 'workflows', 'review-translations.yml');
      expect(fs.existsSync(workflowPath)).toBe(true);
      const workflowContent = fs.readFileSync(workflowPath, 'utf-8');
      expect(workflowContent).toContain("source-repo: 'QuantEcon/lecture-python-intro'");
      expect(workflowContent).toContain('mode: review');
      expect(workflowContent).toContain('types: [opened, synchronize, labeled, reopened]');

      // The rebase workflow is written verbatim from the canonical template
      const rebasePath = path.join(repoDir, '.github', 'workflows', 'rebase-translations.yml');
      expect(fs.existsSync(rebasePath)).toBe(true);
      expect(fs.readFileSync(rebasePath, 'utf-8')).toBe(
        loadWorkflowTemplate(EXAMPLES_DIR, 'rebase-translations.yml')
      );
      expect(result.filesCreated).toContain('.github/workflows/rebase-translations.yml');

      // Check .gitignore
      expect(fs.existsSync(path.join(repoDir, '.gitignore'))).toBe(true);

      // Check README
      const readme = fs.readFileSync(path.join(repoDir, 'README.md'), 'utf-8');
      expect(readme).toContain('zh-cn translation');
      expect(readme).toContain('QuantEcon/lecture-python-intro');
    } finally {
      process.chdir(origCwd);
    }
  });

  test('reports error on gh repo create failure', async () => {
    const failGhRunner: GhRunner = () => ({
      stdout: '',
      stderr: 'repository already exists',
      status: 1,
    });

    const options: SetupOptions = {
      source: 'QuantEcon/lecture-python-intro',
      targetLanguage: 'zh-cn',
      sourceLanguage: 'en',
      docsFolder: 'lectures',
      visibility: 'public',
      dryRun: false,
      examplesDir: EXAMPLES_DIR,
    };

    const origCwd = process.cwd();
    process.chdir(tmpDir);

    try {
      const result = await runSetup(options, failGhRunner, mockGitRunner);

      expect(result.success).toBe(false);
      expect(result.error).toContain('repository already exists');
    } finally {
      process.chdir(origCwd);
    }
  });

  test('returns success: false when git push fails', async () => {
    const repoDir = path.join(tmpDir, 'lecture-python-intro.zh-cn');

    const options: SetupOptions = {
      source: 'QuantEcon/lecture-python-intro',
      targetLanguage: 'zh-cn',
      sourceLanguage: 'en',
      docsFolder: 'lectures',
      visibility: 'public',
      dryRun: false,
      examplesDir: EXAMPLES_DIR,
    };

    const origCwd = process.cwd();
    process.chdir(tmpDir);

    // Git runner that fails on push commands
    const failPushGitRunner: GitRunner = (args: string[]) => {
      if (args[0] === 'push') {
        return { stdout: '', stderr: 'push failed', status: 1 };
      }
      return { stdout: '', stderr: '', status: 0 };
    };

    try {
      const result = await runSetup(options, mockGhRunner(repoDir), failPushGitRunner);
      expect(result.success).toBe(false);
    } finally {
      process.chdir(origCwd);
    }
  });

  test('writes source workflow when --source-workflow is set', async () => {
    const repoDir = path.join(tmpDir, 'lecture-python-intro.zh-cn');
    const sourceWorkflowPath = path.join(
      tmpDir,
      'source-repo',
      '.github',
      'workflows',
      'sync-translations.yml'
    );

    const options: SetupOptions = {
      source: 'QuantEcon/lecture-python-intro',
      targetLanguage: 'zh-cn',
      sourceLanguage: 'en',
      docsFolder: 'lectures',
      visibility: 'public',
      dryRun: false,
      sourceWorkflow: sourceWorkflowPath,
      examplesDir: EXAMPLES_DIR,
    };

    const origCwd = process.cwd();
    process.chdir(tmpDir);

    try {
      const result = await runSetup(options, mockGhRunner(repoDir), mockGitRunner);

      expect(result.success).toBe(true);

      // Check source workflow was written
      expect(fs.existsSync(sourceWorkflowPath)).toBe(true);
      const content = fs.readFileSync(sourceWorkflowPath, 'utf-8');
      expect(content).toContain('name: Sync Translations');
      expect(content).toContain('pull_request:');
      expect(content).toContain('types: [closed]');
      expect(content).toContain('target-repo: QuantEcon/lecture-python-intro.zh-cn');
      expect(content).toContain('mode: sync');
    } finally {
      process.chdir(origCwd);
    }
  });
});

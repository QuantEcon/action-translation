/**
 * Setup Command — Scaffold a new target translation repository
 *
 * Creates a GitHub repo, copies scaffolding files, plants .translate/config.yml,
 * creates the translation sync workflow, and makes an initial commit.
 *
 * Usage:
 *   translate setup --source QuantEcon/lecture-python-intro --target-language zh-cn
 *   translate setup --source QuantEcon/lecture-python-intro --target-language zh-cn --dry-run
 *
 * Pairs with `translate init` for the complete onboarding workflow:
 *   setup → init → push → configure Action
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { writeConfig } from '../translate-state.js';
import { TranslateConfig } from '../types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface SetupOptions {
  source: string; // GitHub owner/repo (e.g., "QuantEcon/lecture-python-intro")
  targetLanguage: string; // Target language code (e.g., "zh-cn")
  sourceLanguage: string; // Source language code (default: "en")
  docsFolder: string; // Documentation folder within repos (default: "lectures")
  visibility: 'public' | 'private'; // Repo visibility (default: "public")
  dryRun: boolean; // Preview without creating
  sourceWorkflow?: string; // Path to write source workflow file (optional)
  examplesDir?: string; // Packaged canonical workflow templates (<package-root>/examples)
}

export interface SetupResult {
  repoName: string; // e.g., "lecture-python-intro.zh-cn"
  repoFullName: string; // e.g., "QuantEcon/lecture-python-intro.zh-cn"
  localPath: string; // Local clone path
  filesCreated: string[]; // Files written to the repo
  success: boolean;
  error?: string;
}

/**
 * Injectable runner for `gh` CLI calls (testability).
 */
export type GhRunner = (args: string[]) => {
  stdout: string;
  stderr: string;
  status: number | null;
};

/**
 * Injectable runner for `git` CLI calls (testability).
 */
export type GitRunner = (
  args: string[],
  opts?: { cwd?: string }
) => { stdout: string; stderr: string; status: number | null };

// ============================================================================
// RUNNERS (I/O)
// ============================================================================

export function realGhRunner(args: string[]): ReturnType<GhRunner> {
  const result = spawnSync('gh', args, { encoding: 'utf8', timeout: 30_000 }) as {
    stdout: string;
    stderr: string;
    status: number | null;
    error?: Error;
  };
  if (result.error) {
    const err = result.error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT')
      throw new Error('`gh` CLI not found. Install from https://cli.github.com/');
    throw result.error;
  }
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status };
}

export function realGitRunner(args: string[], opts?: { cwd?: string }): ReturnType<GitRunner> {
  const result = spawnSync('git', args, { encoding: 'utf8', cwd: opts?.cwd, timeout: 30_000 }) as {
    stdout: string;
    stderr: string;
    status: number | null;
    error?: Error;
  };
  if (result.error) throw result.error;
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status };
}

// ============================================================================
// REPO NAME DERIVATION
// ============================================================================

/**
 * Derive target repo name from source repo + language.
 * "lecture-python-intro" + "zh-cn" → "lecture-python-intro.zh-cn"
 */
export function deriveTargetRepoName(sourceRepo: string, language: string): string {
  // sourceRepo is "owner/repo" — extract the repo part
  const repoName = sourceRepo.includes('/') ? sourceRepo.split('/')[1] : sourceRepo;
  return `${repoName}.${language}`;
}

/**
 * Extract owner from "owner/repo" format.
 */
function extractOwner(sourceRepo: string): string {
  if (!sourceRepo.includes('/')) {
    throw new Error(`Source must be in owner/repo format (got "${sourceRepo}")`);
  }
  return sourceRepo.split('/')[0];
}

// ============================================================================
// WORKFLOW TEMPLATES
// ============================================================================

/**
 * Generate the SOURCE repository workflow YAML.
 * Triggers on merged PRs that touch docs files — creates translation PRs in TARGET.
 */

// Normalize docsFolder for workflow path filters.
// When docs are at repo root, emit '**/*.md' instead of broken patterns.
function normalizePathsFilter(docsFolder: string): string {
  // The `g` flag matters: without it only the first of a leading `./` and a
  // trailing `/` is stripped, and `./lectures/` emits a broken `lectures//**/*.md`.
  const trimmed = docsFolder.replace(/^\.?\/+|\/$/g, '');
  return trimmed === '' || trimmed === '.' ? '**/*.md' : `${trimmed}/**/*.md`;
}

export function generateSourceWorkflowYaml(
  targetRepo: string,
  targetLanguage: string,
  docsFolder: string
): string {
  const pathsFilter = normalizePathsFilter(docsFolder);
  return `# Auto-generated by \`translate setup\`
# Place this file in the SOURCE repository: .github/workflows/sync-translations.yml
name: Sync Translations

on:
  pull_request:
    types: [closed]
    paths:
      - '${pathsFilter}'
      - '_toc.yml'
  issue_comment:
    types: [created]

jobs:
  sync:
    # Merged PRs sync; the issue_comment trigger lets \`\\translate-resync\`
    # on a merged PR retry a failed sync.
    if: >
      (github.event_name == 'pull_request' && github.event.pull_request.merged == true) ||
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '\\translate-resync'))
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 2

      - uses: QuantEcon/action-translation@v0
        with:
          mode: sync
          target-repo: ${targetRepo}
          target-language: ${targetLanguage}
          docs-folder: ${docsFolder}
          anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}
          github-token: \${{ secrets.TRANSLATION_PAT }}
`;
}

/**
 * Read a canonical workflow template from the packaged examples/ directory.
 * The templates are the single source the docs quote and the drift test locks.
 */
export function loadWorkflowTemplate(examplesDir: string, name: string): string {
  const templatePath = path.join(examplesDir, name);
  try {
    return fs.readFileSync(templatePath, 'utf-8');
  } catch {
    throw new Error(`Cannot read canonical workflow template ${templatePath}`);
  }
}

/**
 * Render the TARGET repository review workflow from the canonical template
 * (examples/review-translations.yml), substituting the per-repo inputs.
 * The target language is deliberately NOT an input: review mode detects it
 * from the repository-name suffix.
 */
export function generateTargetWorkflowYaml(
  template: string,
  sourceRepo: string,
  docsFolder: string,
  sourceLanguage: string = 'en'
): string {
  const substitutions: Array<[string, string]> = [
    ['source-repo', sourceRepo],
    ['source-language', sourceLanguage],
    ['docs-folder', docsFolder],
  ];
  let rendered = template;
  for (const [key, value] of substitutions) {
    const pattern = new RegExp(`^(\\s*${key}:).*$`, 'm');
    if (!pattern.test(rendered)) {
      throw new Error(`Canonical review workflow template has no \`${key}:\` line to substitute`);
    }
    rendered = rendered.replace(pattern, `$1 '${value}'`);
  }
  return rendered;
}

// ============================================================================
// SCAFFOLDING FILES
// ============================================================================

/**
 * Generate .gitignore content for a translation repo.
 */
function generateGitignore(): string {
  return `# Build outputs
_build/
__pycache__/

# OS files
.DS_Store
Thumbs.db

# Environment
.env
`;
}

// ============================================================================
// MAIN COMMAND
// ============================================================================

/**
 * Run the setup command — scaffold a new target translation repository.
 */
export async function runSetup(
  options: SetupOptions,
  ghRunner: GhRunner = realGhRunner,
  gitRunner: GitRunner = realGitRunner
): Promise<SetupResult> {
  const owner = extractOwner(options.source);
  const targetRepoName = deriveTargetRepoName(options.source, options.targetLanguage);
  const targetFullName = `${owner}/${targetRepoName}`;
  const localPath = path.resolve(targetRepoName);
  const filesCreated: string[] = [];

  if (options.dryRun) {
    console.log(`\n🔍 DRY RUN — would create:\n`);
    console.log(`  Repository: ${targetFullName} (${options.visibility})`);
    console.log(`  Local clone: ${localPath}`);
    console.log(`  Target repo files:`);
    console.log(`    .translate/config.yml`);
    console.log(`    .github/workflows/review-translations.yml`);
    console.log(`    .github/workflows/rebase-translations.yml`);
    console.log(`    .gitignore`);
    console.log(`    README.md`);
    if (options.sourceWorkflow) {
      console.log(`  Source repo workflow:`);
      console.log(`    ${options.sourceWorkflow}`);
    }
    console.log('');
    return {
      repoName: targetRepoName,
      repoFullName: targetFullName,
      localPath,
      filesCreated: [
        '.translate/config.yml',
        '.github/workflows/review-translations.yml',
        '.github/workflows/rebase-translations.yml',
        '.gitignore',
        'README.md',
      ],
      success: true,
    };
  }

  // The canonical workflow templates ship in <package-root>/examples — resolved
  // by the entry point (import.meta cannot load under the Jest CJS registry, so
  // the directory is threaded in as an option, like the glossary dir).
  if (!options.examplesDir) {
    throw new Error('examplesDir is not set — the CLI entry point must thread it in');
  }
  const reviewTemplate = loadWorkflowTemplate(options.examplesDir, 'review-translations.yml');
  const rebaseTemplate = loadWorkflowTemplate(options.examplesDir, 'rebase-translations.yml');

  // Step 1: Create GitHub repo and clone
  console.log(`\n📦 Creating repository ${targetFullName}…`);
  const createResult = ghRunner([
    'repo',
    'create',
    targetFullName,
    `--${options.visibility}`,
    '--clone',
    '--description',
    `${options.targetLanguage} translation of ${options.source}`,
  ]);

  if (createResult.status !== 0) {
    return {
      repoName: targetRepoName,
      repoFullName: targetFullName,
      localPath,
      filesCreated,
      success: false,
      error: `gh repo create failed: ${createResult.stderr.trim()}`,
    };
  }

  // Step 2: Write scaffolding files
  console.log(`📁 Writing scaffolding files…`);

  // .translate/config.yml
  const config: TranslateConfig = {
    'source-language': options.sourceLanguage,
    'target-language': options.targetLanguage,
    'docs-folder': options.docsFolder,
  };
  writeConfig(localPath, config);
  filesCreated.push('.translate/config.yml');

  // .github/workflows/review-translations.yml (TARGET repo)
  const workflowDir = path.join(localPath, '.github', 'workflows');
  fs.mkdirSync(workflowDir, { recursive: true });
  const targetWorkflowContent = generateTargetWorkflowYaml(
    reviewTemplate,
    options.source,
    options.docsFolder,
    options.sourceLanguage
  );
  fs.writeFileSync(
    path.join(workflowDir, 'review-translations.yml'),
    targetWorkflowContent,
    'utf-8'
  );
  filesCreated.push('.github/workflows/review-translations.yml');

  // .github/workflows/rebase-translations.yml (TARGET repo) — verbatim from
  // the canonical template; it has no per-repo values to substitute.
  fs.writeFileSync(path.join(workflowDir, 'rebase-translations.yml'), rebaseTemplate, 'utf-8');
  filesCreated.push('.github/workflows/rebase-translations.yml');

  // .gitignore
  fs.writeFileSync(path.join(localPath, '.gitignore'), generateGitignore(), 'utf-8');
  filesCreated.push('.gitignore');

  // README.md
  const readmeContent = `# ${targetRepoName}\n\n${options.targetLanguage} translation of [${options.source}](https://github.com/${options.source}).\n\nGenerated by [\`translate setup\`](https://github.com/QuantEcon/action-translation).\n`;
  fs.writeFileSync(path.join(localPath, 'README.md'), readmeContent, 'utf-8');
  filesCreated.push('README.md');

  // Step 3: Initial commit
  console.log(`📝 Making initial commit…`);
  gitRunner(['add', '.'], { cwd: localPath });
  gitRunner(['commit', '-m', `Initial scaffold for ${options.targetLanguage} translation`], {
    cwd: localPath,
  });

  // Step 4: Push
  console.log(`🚀 Pushing to origin…`);
  const pushResult = gitRunner(['push', '-u', 'origin', 'main'], { cwd: localPath });
  if (pushResult.status !== 0) {
    // Try HEAD (in case default branch isn't main)
    const fallbackResult = gitRunner(['push', '-u', 'origin', 'HEAD'], { cwd: localPath });
    if (fallbackResult.status !== 0) {
      console.error(`❌ Push failed. You may need to push manually from ${localPath}`);
      return {
        repoName: targetRepoName,
        repoFullName: targetFullName,
        localPath,
        filesCreated,
        success: false,
      };
    }
  }

  console.log(`\n✅ Repository created: ${targetFullName}`);
  console.log(`   Local path: ${localPath}`);

  // Step 5 (optional): Write source workflow file
  if (options.sourceWorkflow) {
    const sourceWorkflowContent = generateSourceWorkflowYaml(
      targetFullName,
      options.targetLanguage,
      options.docsFolder
    );
    const sourceWorkflowPath = path.resolve(options.sourceWorkflow);
    fs.mkdirSync(path.dirname(sourceWorkflowPath), { recursive: true });
    fs.writeFileSync(sourceWorkflowPath, sourceWorkflowContent, 'utf-8');
    filesCreated.push(options.sourceWorkflow);
    console.log(`   Source workflow written to: ${sourceWorkflowPath}`);
  }

  console.log(`\nNext steps:`);
  console.log(`  1. Translate content:`);
  console.log(
    `     translate init -s /path/to/${options.source.split('/')[1]} -t ${localPath} --target-language ${options.targetLanguage}`
  );
  console.log(`  2. Add secrets to SOURCE repo (${options.source}):`);
  console.log(`     gh secret set ANTHROPIC_API_KEY -R ${options.source}`);
  console.log(`     gh secret set TRANSLATION_PAT -R ${options.source}`);
  console.log(`  3. Add secrets to TARGET repo (${targetFullName}):`);
  console.log(`     gh secret set ANTHROPIC_API_KEY -R ${targetFullName}`);
  if (!options.sourceWorkflow) {
    console.log(`  4. Add sync workflow to SOURCE repo:`);
    console.log(`     Copy the workflow template from docs/user/quickstart.md into`);
    console.log(`     ${options.source}/.github/workflows/sync-translations.yml`);
    console.log(`     Or re-run setup with --source-workflow on the initial invocation.`);
  }
  console.log('');

  return {
    repoName: targetRepoName,
    repoFullName: targetFullName,
    localPath,
    filesCreated,
    success: true,
  };
}

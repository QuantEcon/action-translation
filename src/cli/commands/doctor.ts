/**
 * Doctor Command — Health check for a target translation repository
 *
 * Verifies that a target repo is fully configured for action-translation.
 * Like `brew doctor` or `flutter doctor` — traffic-light output.
 *
 * Checks:
 * - .translate/config.yml exists and is valid
 * - .translate/state/ has entries for all target .md files
 * - All target files have heading-map in frontmatter
 * - Section counts match between source and target
 * - GitHub workflow file exists (.github/workflows/)
 * - Source repo is accessible (if -s provided)
 * - gh CLI is available and authenticated (if --check-gh)
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { MystParser } from '../../parser.js';
import { extractHeadingMap } from '../../heading-map.js';
import { readConfig, readFileState } from '../translate-state.js';
import { discoverMarkdownFiles } from './status.js';

// ============================================================================
// TYPES
// ============================================================================

export interface DoctorOptions {
  target: string;
  source?: string;          // Optional — enables cross-repo checks
  docsFolder?: string;      // Override; otherwise read from config
  checkGh: boolean;         // Check gh CLI availability
  json: boolean;
}

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface CheckResult {
  name: string;
  status: CheckStatus;
  message: string;
  details?: string[];     // Additional detail lines
}

export interface DoctorResult {
  checks: CheckResult[];
  summary: {
    pass: number;
    warn: number;
    fail: number;
    total: number;
  };
}

// ============================================================================
// INDIVIDUAL CHECKS
// ============================================================================

/**
 * Check: .translate/config.yml exists and has required fields.
 */
export function checkConfig(targetPath: string): CheckResult {
  const config = readConfig(targetPath);
  if (!config) {
    const configPath = path.join(targetPath, '.translate', 'config.yml');
    if (!fs.existsSync(configPath)) {
      return {
        name: '.translate/config.yml',
        status: 'fail',
        message: 'Config file not found',
        details: ['Run `translate status --write-state` or `translate setup` to create it'],
      };
    }
    return {
      name: '.translate/config.yml',
      status: 'fail',
      message: 'Config file exists but is malformed (missing required fields)',
      details: ['Required fields: source-language, target-language, docs-folder'],
    };
  }

  return {
    name: '.translate/config.yml',
    status: 'pass',
    message: `source=${config['source-language']}, target=${config['target-language']}, docs=${config['docs-folder']}`,
  };
}

/**
 * Check: .translate/state/ has entries for all target .md files.
 */
export function checkStateFiles(targetPath: string, docsFolder: string): CheckResult {
  const targetFiles = discoverMarkdownFiles(targetPath, docsFolder);

  if (targetFiles.length === 0) {
    return {
      name: '.translate/state/',
      status: 'warn',
      message: 'No .md files found in docs folder',
    };
  }

  const stateDir = path.join(targetPath, '.translate', 'state');
  if (!fs.existsSync(stateDir)) {
    return {
      name: '.translate/state/',
      status: 'fail',
      message: `State directory not found (0/${targetFiles.length} files tracked)`,
      details: ['Run `translate status --write-state` to bootstrap state'],
    };
  }

  const missing: string[] = [];
  for (const file of targetFiles) {
    const state = readFileState(targetPath, file);
    if (!state) {
      missing.push(file);
    }
  }

  if (missing.length === 0) {
    return {
      name: '.translate/state/',
      status: 'pass',
      message: `All ${targetFiles.length} files have state entries`,
    };
  }

  if (missing.length === targetFiles.length) {
    return {
      name: '.translate/state/',
      status: 'fail',
      message: `No state entries (0/${targetFiles.length} files tracked)`,
      details: missing.slice(0, 5).map(f => `Missing: ${f}`).concat(
        missing.length > 5 ? [`…and ${missing.length - 5} more`] : [],
      ),
    };
  }

  return {
    name: '.translate/state/',
    status: 'warn',
    message: `${targetFiles.length - missing.length}/${targetFiles.length} files tracked (${missing.length} missing)`,
    details: missing.slice(0, 5).map(f => `Missing: ${f}`).concat(
      missing.length > 5 ? [`…and ${missing.length - 5} more`] : [],
    ),
  };
}

/**
 * Check: All target .md files have heading-map in frontmatter.
 * Files with 0 sections (no ## headings) are expected to have no heading-map.
 */
export function checkHeadingMaps(targetPath: string, docsFolder: string): CheckResult {
  const targetFiles = discoverMarkdownFiles(targetPath, docsFolder);

  if (targetFiles.length === 0) {
    return {
      name: 'Heading maps',
      status: 'warn',
      message: 'No .md files found in docs folder',
    };
  }

  const missing: string[] = [];
  let sectionlessCount = 0;
  for (const file of targetFiles) {
    const filePath = path.join(targetPath, docsFolder, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Count ## sections — files with no sections don't need heading-maps
    const sectionCount = (content.match(/^## /gm) || []).length;
    if (sectionCount === 0) {
      sectionlessCount++;
      continue;
    }

    const map = extractHeadingMap(content);
    if (map.size === 0) {
      missing.push(file);
    }
  }

  const filesWithSections = targetFiles.length - sectionlessCount;

  if (filesWithSections === 0) {
    return {
      name: 'Heading maps',
      status: 'pass',
      message: `All ${targetFiles.length} files have 0 sections (no heading-maps needed)`,
    };
  }

  if (missing.length === 0) {
    const note = sectionlessCount > 0
      ? ` (${sectionlessCount} section-less files skipped)`
      : '';
    return {
      name: 'Heading maps',
      status: 'pass',
      message: `All ${filesWithSections} files with sections have heading-maps${note}`,
    };
  }

  return {
    name: 'Heading maps',
    status: missing.length === filesWithSections ? 'fail' : 'warn',
    message: `${filesWithSections - missing.length}/${filesWithSections} files with sections have heading-maps (${missing.length} missing)${sectionlessCount > 0 ? ` — ${sectionlessCount} section-less files skipped` : ''}`,
    details: missing.slice(0, 5).map(f => `Missing: ${f}`).concat(
      missing.length > 5 ? [`…and ${missing.length - 5} more`] : [],
    ),
  };
}

/**
 * Check: Section counts match between source and target files.
 * Only runs when source path is provided.
 */
export async function checkSectionAlignment(
  sourcePath: string,
  targetPath: string,
  docsFolder: string,
): Promise<CheckResult> {
  const sourceFiles = discoverMarkdownFiles(sourcePath, docsFolder);
  const targetFiles = discoverMarkdownFiles(targetPath, docsFolder);

  // Only check files that exist in both repos
  const commonFiles = sourceFiles.filter(f => targetFiles.includes(f));

  if (commonFiles.length === 0) {
    return {
      name: 'Section alignment',
      status: 'warn',
      message: 'No common files found between source and target',
    };
  }

  const parser = new MystParser();
  const mismatched: string[] = [];

  for (const file of commonFiles) {
    const sourceContent = fs.readFileSync(path.join(sourcePath, docsFolder, file), 'utf-8');
    const targetContent = fs.readFileSync(path.join(targetPath, docsFolder, file), 'utf-8');

    const sourceParsed = await parser.parseSections(sourceContent, file);
    const targetParsed = await parser.parseSections(targetContent, file);

    if (sourceParsed.sections.length !== targetParsed.sections.length) {
      mismatched.push(
        `${file}: ${sourceParsed.sections.length} source vs ${targetParsed.sections.length} target`,
      );
    }
  }

  if (mismatched.length === 0) {
    return {
      name: 'Section alignment',
      status: 'pass',
      message: `All ${commonFiles.length} common files have matching section counts`,
    };
  }

  return {
    name: 'Section alignment',
    status: 'warn',
    message: `${mismatched.length}/${commonFiles.length} files have section count mismatches`,
    details: mismatched.slice(0, 5).concat(
      mismatched.length > 5 ? [`…and ${mismatched.length - 5} more`] : [],
    ),
  };
}

/**
 * Check: GitHub workflow file exists in target repo.
 */
export function checkWorkflow(targetPath: string): CheckResult {
  const workflowDir = path.join(targetPath, '.github', 'workflows');

  if (!fs.existsSync(workflowDir)) {
    return {
      name: 'Workflow',
      status: 'fail',
      message: 'No .github/workflows/ directory found',
      details: ['Run `translate setup` to generate workflow files'],
    };
  }

  const files = fs.readdirSync(workflowDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

  if (files.length === 0) {
    return {
      name: 'Workflow',
      status: 'fail',
      message: 'No workflow files found in .github/workflows/',
    };
  }

  // Check if any workflow contains action-translation references
  const translationWorkflows = files.filter(f => {
    const content = fs.readFileSync(path.join(workflowDir, f), 'utf-8');
    return content.includes('action-translation');
  });

  if (translationWorkflows.length === 0) {
    return {
      name: 'Workflow',
      status: 'warn',
      message: `${files.length} workflow file(s) found, but none reference action-translation`,
      details: files.map(f => `Found: ${f}`),
    };
  }

  return {
    name: 'Workflow',
    status: 'pass',
    message: `Translation workflow: ${translationWorkflows.join(', ')}`,
  };
}

/**
 * Check: Source repo is accessible (directory exists with .md files).
 */
export function checkSourceAccess(sourcePath: string, docsFolder: string): CheckResult {
  if (!fs.existsSync(sourcePath)) {
    return {
      name: 'Source repo',
      status: 'fail',
      message: `Source path not found: ${sourcePath}`,
    };
  }

  const files = discoverMarkdownFiles(sourcePath, docsFolder);
  if (files.length === 0) {
    return {
      name: 'Source repo',
      status: 'warn',
      message: `Source path exists but no .md files in ${docsFolder}/`,
    };
  }

  return {
    name: 'Source repo',
    status: 'pass',
    message: `${files.length} .md files in ${docsFolder}/`,
  };
}

/**
 * Check: gh CLI is available and authenticated.
 */
export function checkGhCli(): CheckResult {
  try {
    const result = spawnSync('gh', ['auth', 'status'], {
      encoding: 'utf8',
      timeout: 10_000,
    });

    if (result.error) {
      const err = result.error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return {
          name: 'gh CLI',
          status: 'warn',
          message: 'gh CLI not installed (needed for --github modes)',
          details: ['Install from https://cli.github.com/'],
        };
      }
      return {
        name: 'gh CLI',
        status: 'warn',
        message: `gh CLI error: ${err.message}`,
      };
    }

    if (result.status !== 0) {
      return {
        name: 'gh CLI',
        status: 'warn',
        message: 'gh CLI not authenticated',
        details: ['Run `gh auth login` to authenticate'],
      };
    }

    return {
      name: 'gh CLI',
      status: 'pass',
      message: 'Authenticated',
    };
  } catch {
    return {
      name: 'gh CLI',
      status: 'warn',
      message: 'Could not check gh CLI',
    };
  }
}

// ============================================================================
// MAIN COMMAND
// ============================================================================

/**
 * Run the doctor command — check health of a target translation repo.
 */
export async function runDoctor(options: DoctorOptions): Promise<DoctorResult> {
  const checks: CheckResult[] = [];

  // 1. Config check
  const configResult = checkConfig(options.target);
  checks.push(configResult);

  // Determine docs-folder: explicit option > config > default
  let docsFolder = options.docsFolder ?? 'lectures';
  if (!options.docsFolder && configResult.status === 'pass') {
    const config = readConfig(options.target);
    if (config) {
      docsFolder = config['docs-folder'];
    }
  }

  // 2. State files check
  checks.push(checkStateFiles(options.target, docsFolder));

  // 3. Heading maps check
  checks.push(checkHeadingMaps(options.target, docsFolder));

  // 4. Workflow check
  checks.push(checkWorkflow(options.target));

  // 5. Source repo checks (only if source provided)
  if (options.source) {
    checks.push(checkSourceAccess(options.source, docsFolder));
    checks.push(await checkSectionAlignment(options.source, options.target, docsFolder));
  }

  // 6. gh CLI check (only if requested)
  if (options.checkGh) {
    checks.push(checkGhCli());
  }

  // Build summary
  const summary = {
    pass: checks.filter(c => c.status === 'pass').length,
    warn: checks.filter(c => c.status === 'warn').length,
    fail: checks.filter(c => c.status === 'fail').length,
    total: checks.length,
  };

  return { checks, summary };
}

// ============================================================================
// CONSOLE OUTPUT
// ============================================================================

const STATUS_ICONS: Record<CheckStatus, string> = {
  pass: '✅',
  warn: '⚠️',
  fail: '❌',
};

/**
 * Format doctor results for console display.
 */
export function formatDoctorTable(result: DoctorResult): string {
  const lines: string[] = [];

  lines.push('Translation Repo Health Check');
  lines.push('');

  for (const check of result.checks) {
    const icon = STATUS_ICONS[check.status];
    lines.push(`  ${icon} ${check.name}: ${check.message}`);
    if (check.details) {
      for (const detail of check.details) {
        lines.push(`     ${detail}`);
      }
    }
  }

  lines.push('');

  const s = result.summary;
  if (s.fail === 0 && s.warn === 0) {
    lines.push('All checks passed!');
  } else {
    const parts = [];
    if (s.pass > 0) parts.push(`${s.pass} passed`);
    if (s.warn > 0) parts.push(`${s.warn} warnings`);
    if (s.fail > 0) parts.push(`${s.fail} failed`);
    lines.push(parts.join(', '));
  }

  return lines.join('\n');
}

/**
 * Format doctor results as JSON.
 */
export function formatDoctorJson(result: DoctorResult): string {
  return JSON.stringify(result, null, 2);
}

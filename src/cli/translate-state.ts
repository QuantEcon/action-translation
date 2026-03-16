/**
 * .translate/ metadata — read/write config and per-file state
 *
 * Structure:
 *   .translate/
 *   ├── config.yml              # Project-level settings
 *   └── state/
 *       ├── intro.md.yml        # Per-file sync metadata
 *       └── advanced/
 *           └── cobweb.md.yml   # Mirrors docs-folder subdirectory structure
 *
 * All YAML files use js-yaml for serialization.
 * Graceful absence: returns undefined when files don't exist.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { TranslateConfig, FileState } from './types.js';

const TRANSLATE_DIR = '.translate';
const CONFIG_FILE = 'config.yml';
const STATE_DIR = 'state';

// ============================================================================
// CONFIG
// ============================================================================

/**
 * Read .translate/config.yml from the target repo.
 * Returns undefined if the file doesn't exist or is malformed.
 */
export function readConfig(targetPath: string): TranslateConfig | undefined {
  const configPath = path.join(targetPath, TRANSLATE_DIR, CONFIG_FILE);
  if (!fs.existsSync(configPath)) return undefined;

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = yaml.load(raw);
    if (!parsed || typeof parsed !== 'object') return undefined;

    const obj = parsed as Record<string, unknown>;
    if (
      typeof obj['source-language'] === 'string' &&
      typeof obj['target-language'] === 'string' &&
      typeof obj['docs-folder'] === 'string'
    ) {
      return obj as unknown as TranslateConfig;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Write .translate/config.yml to the target repo.
 * Creates the .translate/ directory if it doesn't exist.
 */
export function writeConfig(targetPath: string, config: TranslateConfig): void {
  const dir = path.join(targetPath, TRANSLATE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const configPath = path.join(dir, CONFIG_FILE);
  const content = yaml.dump(config, { lineWidth: -1, quotingType: '"' });
  fs.writeFileSync(configPath, content, 'utf-8');
}

// ============================================================================
// PER-FILE STATE
// ============================================================================

/**
 * Resolve the path to a per-file state YAML.
 * filename is relative to docs-folder (e.g., "intro.md" or "advanced/cobweb.md").
 * Result: .translate/state/intro.md.yml or .translate/state/advanced/cobweb.md.yml
 */
function stateFilePath(targetPath: string, filename: string): string {
  return path.join(targetPath, TRANSLATE_DIR, STATE_DIR, `${filename}.yml`);
}

/**
 * Read per-file state from .translate/state/<filename>.yml.
 * Returns undefined if the file doesn't exist or is malformed.
 */
export function readFileState(targetPath: string, filename: string): FileState | undefined {
  const filePath = stateFilePath(targetPath, filename);
  if (!fs.existsSync(filePath)) return undefined;

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = yaml.load(raw);
    if (!parsed || typeof parsed !== 'object') return undefined;

    const obj = parsed as Record<string, unknown>;
    if (
      typeof obj['source-sha'] === 'string' &&
      typeof obj['synced-at'] === 'string' &&
      typeof obj['model'] === 'string' &&
      typeof obj['mode'] === 'string' &&
      typeof obj['section-count'] === 'number'
    ) {
      return obj as unknown as FileState;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Write per-file state to .translate/state/<filename>.yml.
 * Creates intermediate directories as needed.
 */
export function writeFileState(targetPath: string, filename: string, state: FileState): void {
  const filePath = stateFilePath(targetPath, filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const content = serializeFileState(state);
  fs.writeFileSync(filePath, content, 'utf-8');
}

// ============================================================================
// SERIALIZATION (pure, no filesystem)
// ============================================================================

/**
 * Serialize a FileState to YAML string.
 * Pure function — no filesystem access. Used by both CLI (writeFileState)
 * and GitHub Action (generates content for Octokit commits).
 */
export function serializeFileState(state: FileState): string {
  return yaml.dump(state, { lineWidth: -1, quotingType: '"' });
}

/**
 * Serialize a TranslateConfig to YAML string.
 * Pure function — no filesystem access.
 */
export function serializeConfig(config: TranslateConfig): string {
  return yaml.dump(config, { lineWidth: -1, quotingType: '"' });
}

/**
 * Compute the .translate/state/ path for a given filename.
 * Returns the path relative to repo root (e.g., ".translate/state/intro.md.yml").
 * Used by the GitHub Action to construct Octokit commit paths.
 */
export function stateFileRelativePath(filename: string): string {
  return `${TRANSLATE_DIR}/${STATE_DIR}/${filename}.yml`;
}

/**
 * Path to the config file relative to repo root.
 */
export function configRelativePath(): string {
  return `${TRANSLATE_DIR}/${CONFIG_FILE}`;
}

// ============================================================================
// STALENESS CHECK
// ============================================================================

/**
 * Check whether a source file has changed since the last sync.
 * Compares the recorded source-sha against the current HEAD SHA for that file.
 *
 * @param sourceRepoPath - Path to the source git repository
 * @param docsFolder - Documentation folder within repos
 * @param filename - Filename relative to docs-folder
 * @param state - Previously recorded file state
 * @returns true if the source file has changed (or state is absent), false if unchanged
 */
export async function isSourceChanged(
  sourceRepoPath: string,
  docsFolder: string,
  filename: string,
  state: FileState | undefined,
): Promise<boolean> {
  if (!state) return true; // No state = always consider changed

  // Get current HEAD SHA for this file
  const { getFileGitMetadata } = await import('./git-metadata.js');
  const filePath = docsFolder ? path.join(docsFolder, filename) : filename;
  const metadata = await getFileGitMetadata(sourceRepoPath, filePath);
  if (!metadata) return true; // Can't determine = treat as changed

  return metadata.lastCommit !== state['source-sha'];
}

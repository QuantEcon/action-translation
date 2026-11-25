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
// TOOL VERSION
// ============================================================================

let _cachedVersion: string | undefined;

/**
 * Read the tool version from package.json (single source of truth).
 * Works in both CJS (Jest, `__dirname` available) and ESM (CLI runtime).
 * Falls back to 'unknown' if package.json cannot be located.
 * Result is memoized to avoid repeated filesystem reads.
 */
export function getToolVersion(): string {
  if (_cachedVersion !== undefined) return _cachedVersion;

  // Strategy 1: CJS context — __dirname available (Jest / esbuild bundle)
  if (typeof __dirname === 'string') {
    try {
      const pkgPath = path.resolve(__dirname, '../../package.json');
      _cachedVersion = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).version as string;
      return _cachedVersion!;
    } catch {
      /* fall through */
    }
  }

  // Strategy 2: walk up from process.argv[1] (ESM / CLI runtime)
  try {
    let dir = path.dirname(process.argv[1]);
    for (let i = 0; i < 5; i++) {
      const pkgPath = path.join(dir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.name === 'action-translation') {
          _cachedVersion = pkg.version as string;
          return _cachedVersion!;
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    /* fall through */
  }

  // Strategy 3: walk up from cwd (works with npx bin shims where argv[1] is a wrapper)
  try {
    let dir = process.cwd();
    for (let i = 0; i < 5; i++) {
      const pkgPath = path.join(dir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.name === 'action-translation') {
          _cachedVersion = pkg.version as string;
          return _cachedVersion!;
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    /* fall through */
  }

  _cachedVersion = 'unknown';
  return _cachedVersion;
}

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
 *
 * Read-modify-write (#243): top-level keys the caller does not pass — e.g. a
 * hand-maintained `editors:` block — survive bootstrap rewrites. The merge is
 * shallow with the caller winning per key, so the core fields stay
 * authoritative and removing a key is a hand edit, never a bootstrap side
 * effect. The read here is deliberately lenient, unlike readConfig: a config
 * mid-repair (core field missing or mistyped) still contributes its extra
 * keys. An existing file that cannot be parsed as a YAML mapping fails the
 * write loudly — rebuilding it would silently delete whatever the operator
 * had there, and a vanished block is indistinguishable from one never added.
 *
 * Both load and dump use CORE_SCHEMA: DEFAULT_SCHEMA would re-type a bare
 * date like `since: 2026-08-05` into a JS Date and rewrite it as a full ISO
 * timestamp, silently mutating hand-maintained values; under CORE_SCHEMA
 * scalars round-trip as written, and typed documents (`!!binary` etc.) fail
 * the parse loudly instead of merging as garbage. Known limitation: YAML
 * comments and formatting in the existing file are NOT preserved — js-yaml
 * round-trips values only — so routing rationale belongs in commit messages,
 * not comments the next bootstrap run deletes.
 */
export function writeConfig(targetPath: string, config: TranslateConfig): void {
  const dir = path.join(targetPath, TRANSLATE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const configPath = path.join(dir, CONFIG_FILE);

  let existing: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf-8');
    let parsed: unknown;
    try {
      parsed = yaml.load(raw, { schema: yaml.CORE_SCHEMA });
    } catch (err) {
      throw new Error(
        `${configPath} exists but is not valid YAML — fix or remove it, then re-run the command ` +
          `(refusing to overwrite it: rebuilding would silently delete its contents). ` +
          `Parse error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    if (parsed !== undefined && parsed !== null) {
      // Plain-mapping check, not just typeof: schema-typed scalars (a Date
      // under DEFAULT_SCHEMA, a !!binary Uint8Array) are objects that would
      // pass typeof and then spread to {} or numeric-index garbage — the
      // silent outcomes the throw exists to prevent.
      const proto = Object.getPrototypeOf(parsed);
      if (
        typeof parsed !== 'object' ||
        Array.isArray(parsed) ||
        (proto !== Object.prototype && proto !== null)
      ) {
        throw new Error(
          `${configPath} exists but is not a YAML mapping — fix or remove it, then re-run the command ` +
            `(refusing to overwrite it: rebuilding would silently delete its contents).`
        );
      }
      existing = parsed as Record<string, unknown>;
    }
  }

  const merged = { ...existing, ...config, 'tool-version': getToolVersion() };
  const content = yaml.dump(merged, {
    lineWidth: -1,
    quotingType: '"',
    schema: yaml.CORE_SCHEMA,
  });
  fs.writeFileSync(configPath, content, 'utf-8');
}

/** What a YAML value that should have been non-empty text is, for a message. */
function shapeOf(value: unknown): string {
  if (value === null || value === '') return 'empty';
  if (typeof value === 'string') return 'blank';
  if (Array.isArray(value)) return 'a list';
  if (typeof value === 'object') return 'a mapping';
  return `a ${typeof value}`;
}

/** A plain YAML mapping: not a list, and not a typed object such as a `!!binary` value. */
function isPlainMapping(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Why YAML text did not load, in one line. js-yaml refuses a duplicate key,
 * which `readConfig` reports only as a config with no usable fields, so it is
 * named here, with its line.
 */
function yamlLoadProblem(error: unknown, raw: string): string {
  if (error instanceof yaml.YAMLException && error.reason === 'duplicated mapping key') {
    const line = error.mark ? raw.split(/\r?\n/)[error.mark.line] : undefined;
    return line === undefined
      ? 'it repeats a key, which YAML does not allow'
      : `it repeats a key at line ${error.mark.line + 1} (\`${line.trim()}\`), which YAML does not allow`;
  }
  const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
  return `it could not be read as YAML (${message})`;
}

/**
 * Why `.translate/config.yml` does not load as YAML, or `undefined` when it
 * loads or does not exist. Loaded with CORE_SCHEMA, as `writeConfig` loads it.
 */
export function configLoadProblem(targetPath: string): string | undefined {
  const configPath = path.join(targetPath, TRANSLATE_DIR, CONFIG_FILE);
  if (!fs.existsSync(configPath)) return undefined;
  const raw = fs.readFileSync(configPath, 'utf-8');
  try {
    yaml.load(raw, { schema: yaml.CORE_SCHEMA });
    return undefined;
  } catch (error) {
    return yamlLoadProblem(error, raw);
  }
}

/** One entry of `state-exceptions`, as the config writes it. */
export interface StateExceptionEntry {
  /** The key, a docs-relative path as written, such as `./intro.md`. */
  key: string;
  /** Why the file has no state file. */
  reason: string;
}

/** `state-exceptions` as read: the entries whose reason is text, and a message for each problem. */
export interface StateExceptionsRead {
  entries: StateExceptionEntry[];
  problems: string[];
}

/**
 * Read `state-exceptions` from `.translate/config.yml`: the lectures meant to
 * have no state file, such as an English copy in a partial edition, each with
 * its reason (#370). No config, no key, or a key with nothing under it is no
 * exceptions. Each key is returned as written: `doctor --require-state` puts
 * it in the lecture set's spelling and checks the path.
 *
 * Loaded with CORE_SCHEMA, as `writeConfig` loads the file, so a bare reason
 * such as `2026-12-01` is the text it was written as, not a date. Each problem
 * is named, and the entries without one are still returned: a config that
 * does not load (a repeated key among them, which YAML refuses), a key that is
 * not a mapping, and a reason that is not non-empty text.
 */
export function readStateExceptions(targetPath: string): StateExceptionsRead {
  const none: StateExceptionsRead = { entries: [], problems: [] };
  const shown = `${TRANSLATE_DIR}/${CONFIG_FILE}`;
  const configPath = path.join(targetPath, TRANSLATE_DIR, CONFIG_FILE);
  if (!fs.existsSync(configPath)) return none;

  const raw = fs.readFileSync(configPath, 'utf-8');
  let parsed: unknown;
  try {
    parsed = yaml.load(raw, { schema: yaml.CORE_SCHEMA });
  } catch (error) {
    const problem = `${shown}: ${yamlLoadProblem(error, raw)}, so state-exceptions could not be read`;
    return { entries: [], problems: [problem] };
  }
  if (parsed === undefined || parsed === null) return none;
  if (!isPlainMapping(parsed)) {
    const problem = `${shown} is not a YAML mapping, so state-exceptions could not be read`;
    return { entries: [], problems: [problem] };
  }

  const declared = parsed['state-exceptions'];
  if (declared === undefined || declared === null) return none;
  if (!isPlainMapping(declared)) {
    const shape = Array.isArray(declared) ? 'a list' : `a ${typeof declared}`;
    const problem =
      `state-exceptions is ${shape}, not a mapping of docs-relative path to reason ` +
      '(`intro.md: English copy until its review round`)';
    return { entries: [], problems: [problem] };
  }

  const entries: StateExceptionEntry[] = [];
  const problems: string[] = [];
  for (const [key, reason] of Object.entries(declared)) {
    if (typeof reason !== 'string' || reason.trim() === '') {
      problems.push(
        `\`${key}\`: its reason is ${shapeOf(reason)}; write why it has no state file, as text`
      );
      continue;
    }
    entries.push({ key, reason });
  }
  return { entries, problems };
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
 * What `.translate/state/<filename>.yml` holds: nothing, a usable record, or a
 * file that exists and cannot be used, with the reason.
 */
export type FileStateRead =
  | { status: 'missing' }
  | { status: 'valid'; state: FileState }
  | { status: 'invalid'; reason: string };

/** The keys a state file must carry, and the type each must load as. */
const REQUIRED_STATE_KEYS: ReadonlyArray<[keyof FileState & string, 'string' | 'number']> = [
  ['source-sha', 'string'],
  ['synced-at', 'string'],
  ['model', 'string'],
  ['mode', 'string'],
  ['section-count', 'number'],
];

/**
 * Read per-file state, telling a missing file from one that exists and is
 * rejected, and saying which key rejected it (#381).
 *
 * Loaded with CORE_SCHEMA, as the config is: the default schema turns a bare
 * `synced-at: 2026-10-19`, the natural way to write a date by hand, into a
 * `Date`, which then failed the string check. A value YAML still retypes, such
 * as an all-digit `source-sha`, is rejected with the advice to quote it.
 */
export function inspectFileState(targetPath: string, filename: string): FileStateRead {
  const filePath = stateFilePath(targetPath, filename);
  if (!fs.existsSync(filePath)) return { status: 'missing' };

  let parsed: unknown;
  try {
    parsed = yaml.load(fs.readFileSync(filePath, 'utf-8'), { schema: yaml.CORE_SCHEMA });
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    return { status: 'invalid', reason: `it could not be read as YAML (${message})` };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { status: 'invalid', reason: 'it is not a YAML mapping of keys to values' };
  }

  const obj = parsed as Record<string, unknown>;
  for (const [key, expected] of REQUIRED_STATE_KEYS) {
    const value = obj[key];
    if (value === undefined || value === null) {
      return { status: 'invalid', reason: `\`${key}\` is missing` };
    }
    if (typeof value !== expected) {
      const fix = expected === 'string' ? 'quote it' : 'write it without quotes';
      return {
        status: 'invalid',
        reason: `\`${key}\` is a ${typeof value}, not a ${expected}: ${fix}`,
      };
    }
  }
  return { status: 'valid', state: obj as unknown as FileState };
}

/**
 * Read per-file state from .translate/state/<filename>.yml.
 * Returns undefined if the file doesn't exist or is malformed; use
 * `inspectFileState` to tell the two apart.
 */
export function readFileState(targetPath: string, filename: string): FileState | undefined {
  const read = inspectFileState(targetPath, filename);
  return read.status === 'valid' ? read.state : undefined;
}

/**
 * Write per-file state to .translate/state/<filename>.yml, keeping every key
 * the existing file holds that the engine does not own (#290; see
 * `mergeFileState`). Creates intermediate directories as needed.
 *
 * Returns a warning when an existing file was not a YAML mapping and was
 * overwritten, for the caller to print; undefined otherwise. A file that
 * cannot be read or written still throws, and fails the caller's run
 * (`D-2026-11-15-a-failed-cli-state-write-is-a-failure`).
 */
export function writeFileState(
  targetPath: string,
  filename: string,
  state: FileState
): string | undefined {
  const filePath = stateFilePath(targetPath, filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const withVersion = { ...state, 'tool-version': getToolVersion() };
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : undefined;
  const merged = mergeFileState(existing, withVersion, stateFileRelativePath(filename));
  fs.writeFileSync(filePath, merged.content, 'utf-8');
  return merged.warning;
}

/**
 * The keys the engine owns in a state file: every write sets them from what
 * it did, and never carries a value of one from the file it replaces.
 */
export const ENGINE_STATE_KEYS: ReadonlySet<string> = new Set([
  'source-sha',
  'synced-at',
  'model',
  'mode',
  'section-count',
  'tool-version',
]);

/** A state file's new text, and a warning when the old one was overwritten unread. */
export interface MergedFileState {
  content: string;
  warning?: string;
}

/**
 * The text of a state file written over `existing` (undefined: no file), from
 * the engine's `state` (#290). Pure: both the CLI's `writeFileState` and the
 * Action's sync and rebase use it.
 *
 * The engine's keys come first, in the order `state` gives them, written by
 * `serializeFileState` exactly as before: a file with no other key is written
 * byte for byte as it was before this merge existed. Every other top-level
 * key of the existing file follows, in its order, with its value, such as an
 * editor's `reviewed:` sign-off block. A key of `state` the engine does not
 * own is ignored: such keys come from the existing file.
 *
 * As in `writeConfig`, the existing file is loaded and the kept keys dumped
 * with CORE_SCHEMA, so a bare `date: 2026-11-25` stays the text it was, and
 * values round-trip as written; YAML comments and quoting in the existing file
 * are not kept (js-yaml keeps values only). Unlike `writeConfig`, an existing
 * file that is not a YAML mapping (unparseable, empty, a list or a scalar) is
 * overwritten with a warning rather than refused: it has no keys to keep, and
 * `translate status --write-state` is the documented repair for one.
 */
export function mergeFileState(
  existing: string | undefined,
  state: FileState,
  shownPath: string
): MergedFileState {
  const engine: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    if (ENGINE_STATE_KEYS.has(key)) engine[key] = value;
  }
  const content = serializeFileState(engine as unknown as FileState);
  if (existing === undefined) return { content };

  let parsed: unknown;
  try {
    parsed = yaml.load(existing, { schema: yaml.CORE_SCHEMA });
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    return {
      content,
      warning:
        `${shownPath} could not be read as YAML (${message}), so it was overwritten: any keys ` +
        'it held besides the ones sync writes are gone',
    };
  }
  if (!isPlainMapping(parsed)) {
    return {
      content,
      warning:
        `${shownPath} was not a YAML mapping of keys to values, so it was overwritten: any ` +
        'keys it held besides the ones sync writes are gone',
    };
  }

  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!ENGINE_STATE_KEYS.has(key)) kept[key] = value;
  }
  if (Object.keys(kept).length === 0) return { content };
  return {
    content:
      content + yaml.dump(kept, { lineWidth: -1, quotingType: '"', schema: yaml.CORE_SCHEMA }),
  };
}

/**
 * Every file under `.translate/state/`, subfolders included, as paths relative
 * to it with `/` (`intro.md.yml`, `_admonition/gpu.md.yml`), sorted. Anything
 * else there, such as a `.DS_Store`, is listed too, for the caller to judge.
 * No state folder is an empty listing.
 *
 * Symbolic links are followed, as the lecture set's `fileSystemSource` follows
 * them, when their target is inside the state folder; a link out of it or to
 * nothing is left out. No folder is skipped: a file sync would never read is
 * still a file the caller should hear about.
 *
 * `doctor --require-state` compares this listing with the lecture set as
 * strings (#370), not with `fs.existsSync`: on a case-insensitive filesystem,
 * such as a macOS clone, `existsSync` finds `Intro.md.yml` for `intro.md`,
 * and neither a Linux CI runner nor sync's reads through the GitHub API do.
 */
export function listStateFiles(targetPath: string): string[] {
  const root = path.join(targetPath, TRANSLATE_DIR, STATE_DIR);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];
  const realRoot = fs.realpathSync(root);
  const inside = (real: string) => real === realRoot || real.startsWith(realRoot + path.sep);
  const files: string[] = [];
  // The folders being walked, by real path: a link back to one of them is a cycle.
  const ancestors = new Set<string>();
  const walk = (dir: string, rel: string): void => {
    const real = fs.realpathSync(dir);
    if (ancestors.has(real)) return;
    ancestors.add(real);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      let stat: fs.Stats;
      try {
        if (entry.isSymbolicLink() && !inside(fs.realpathSync(full))) continue;
        stat = fs.statSync(full);
      } catch {
        continue; // a link to nothing
      }
      if (stat.isDirectory()) walk(full, childRel);
      else if (stat.isFile()) files.push(childRel);
    }
    ancestors.delete(real);
  };
  walk(root, '');
  return files.sort();
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
 * Compares the recorded source-sha against the last commit that touched the
 * file; when they differ, compares the file's content at the recorded commit
 * with HEAD, so a recorded commit that did not touch the file (the merge
 * commit sync records after a merge-commit or rebase merge, #391) reads as
 * unchanged. A recorded commit git cannot find in the clone reads as changed.
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
  state: FileState | undefined
): Promise<boolean> {
  if (!state) return true; // No state = always consider changed

  // Get current HEAD SHA for this file
  const { getFileGitMetadata, fileChangedSince } = await import('./git-metadata.js');
  const filePath = docsFolder ? path.join(docsFolder, filename) : filename;
  const metadata = await getFileGitMetadata(sourceRepoPath, filePath);
  if (!metadata) return true; // Can't determine = treat as changed

  if (metadata.lastCommit === state['source-sha']) return false;
  // undefined (git cannot tell) counts as changed
  return (await fileChangedSince(sourceRepoPath, state['source-sha'], filePath)) !== false;
}

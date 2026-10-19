// lib.mjs — plumbing shared by the Claude 5.5 upgrade evaluation scripts (README.md).
//
// Nothing here knows about models or rules: paths, argument parsing, YAML, hashing, the
// evaluation root, and the one way each script turns an error into an exit code
// (2 = usage or setup error, the convention rate-check.sh uses).

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const EXPERIMENT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(EXPERIMENT_DIR, '..', '..');
export const DATA_DIR = path.join(REPO_ROOT, 'tool-test-action-on-github', 'test-action-on-github-data');
export const RATE_CHECK = path.join(REPO_ROOT, 'tool-test-action-on-github', 'rate-check.sh');
export const STATS_MODULE = path.join(REPO_ROOT, 'tool-test-action-on-github', 'lib', 'stats.mjs');
export const IDENTITY_MODULE = path.join(REPO_ROOT, 'tool-test-action-on-github', 'lib', 'run-identity.mjs');
export const CORPUS_FILE = path.join(EXPERIMENT_DIR, 'corpus.yml');
/** The languages the evaluation draws, and whose glossaries an engine id covers. */
export const ENGINE_LANGUAGES = ['zh-cn', 'fa', 'ml', 'fr'];

/** Durable by default: the stages run over several days and later ones read earlier output. */
export const DEFAULT_EVAL_ROOT = path.join(os.homedir(), '.cache', 'action-translation', 'claude-5-5-eval');

const requireFromRepo = createRequire(path.join(REPO_ROOT, 'package.json'));

/** A usage or setup error: the script prints it and exits 2. */
export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

/**
 * Run an async main and map its outcome to an exit code: the number it returns (default 0),
 * 2 for a UsageError or any unexpected error. A crash must never read as "a cell fails" (1).
 */
export function runMain(main) {
  main().then(
    (code) => {
      process.exitCode = typeof code === 'number' ? code : 0;
    },
    (error) => {
      if (error instanceof UsageError) {
        console.error(`error: ${error.message}`);
      } else {
        console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
      }
      process.exitCode = 2;
    }
  );
}

/**
 * Minimal flag parser. `spec` maps a flag name (without --) to 'string' | 'boolean' | 'number'.
 * Unknown flags and missing values are usage errors. Returns { flags, positional }.
 */
export function parseArgs(argv, spec) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    if (!Object.hasOwn(spec, name)) throw new UsageError(`unknown flag --${name} (try --help)`);
    const type = spec[name];
    if (type === 'boolean') {
      if (eq !== -1) throw new UsageError(`--${name} takes no value`);
      flags[name] = true;
      continue;
    }
    let value;
    if (eq !== -1) value = arg.slice(eq + 1);
    else {
      value = argv[++i];
      if (value === undefined) throw new UsageError(`--${name} needs a value`);
    }
    if (type === 'number') {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new UsageError(`--${name} needs a number, got '${value}'`);
      flags[name] = n;
    } else {
      flags[name] = value;
    }
  }
  return { flags, positional };
}

/** Comma list → trimmed non-empty strings. */
export function list(value) {
  return value === undefined ? undefined : String(value).split(',').map((s) => s.trim()).filter(Boolean);
}

/** The header comment of a script (lines after the first, up to the first blank line), for --help. */
export function helpText(scriptUrl) {
  const lines = fs.readFileSync(fileURLToPath(scriptUrl), 'utf8').split('\n');
  const out = [];
  for (const line of lines.slice(1)) {
    if (!line.startsWith('//')) break;
    out.push(line.replace(/^\/\/ ?/, ''));
  }
  return out.join('\n');
}

export function loadYaml(file) {
  const yaml = requireFromRepo('js-yaml');
  return yaml.load(fs.readFileSync(file, 'utf8'));
}

export function loadCorpus() {
  const corpus = loadYaml(CORPUS_FILE);
  if (!corpus || corpus.schema !== 'claude-5-5-upgrade/corpus/1') {
    throw new UsageError(`${path.relative(REPO_ROOT, CORPUS_FILE)} has an unexpected schema`);
  }
  return corpus;
}

/** Import an engine module from this checkout's dist/ ("import, don't re-implement"). */
export async function importDist(relative) {
  const file = path.join(REPO_ROOT, 'dist', relative);
  if (!fs.existsSync(file)) {
    throw new UsageError(`missing ${path.relative(REPO_ROOT, file)} — run 'npm run build' first`);
  }
  return import(pathToFileURL(file).href);
}

/** The shared statistics module (tool-test-action-on-github/lib/stats.mjs). */
export async function importStats() {
  if (!fs.existsSync(STATS_MODULE)) {
    throw new UsageError(`missing ${path.relative(REPO_ROOT, STATS_MODULE)}`);
  }
  const stats = await import(pathToFileURL(STATS_MODULE).href);
  for (const name of ['wilson', 'fisherExact', 'stratifiedExact', 'mhRiskDifference', 'signTest', 'mannWhitneyStratified']) {
    if (typeof stats[name] !== 'function') {
      throw new UsageError(`${path.relative(REPO_ROOT, STATS_MODULE)} does not export ${name}()`);
    }
  }
  return stats;
}

/** The SDK, resolved from the repository's node_modules. */
export async function importSdk() {
  const entry = requireFromRepo.resolve('@anthropic-ai/sdk');
  return import(pathToFileURL(entry).href);
}

export function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function sha256File(file) {
  return sha256(fs.readFileSync(file));
}

/** A short stable hash of any JSON-able value (key order normalised). */
export function stableHash(value, length = 16) {
  return sha256(stableStringify(value)).slice(0, length);
}

/** The commit a ref (a tag, say) names in this repository, or null when git cannot resolve it. */
export function gitCommitOf(ref) {
  const r = spawnSync('git', ['-C', REPO_ROOT, 'rev-parse', '--verify', '-q', `${ref}^{commit}`], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

/**
 * What an engine directory is made of (rate-check's own identity helpers), and an id over the
 * parts that shape a request: dist/, the glossaries, the SDK it loads. run-stages.mjs pins it in
 * EVAL_ROOT/engine.json; engine-aa.mjs records it for its candidate, so R1 can show that it
 * checked the engine the stages ran on. One function, so the two ids cannot drift apart.
 */
export async function engineFingerprint(dir) {
  const identity = await import(pathToFileURL(IDENTITY_MODULE).href);
  const git = (args) => {
    const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
    return r.status === 0 ? r.stdout.trimEnd() : null; // porcelain lines start with a space
  };
  const sdk = identity.sdkInfo(dir);
  const dirty = git(['status', '--porcelain', '--untracked-files=no', '--', 'src', 'glossary', 'package.json', 'package-lock.json']);
  const fp = {
    git: { sha: git(['rev-parse', 'HEAD']), clean: dirty === '', dirty: dirty ? dirty.split('\n') : [] },
    packageVersion: sdk.engineVersion,
    sdkVersion: sdk.version,
    sdkLocked: sdk.locked,
    node: process.version,
    distSha256: identity.distSha256(dir),
    translatorSha256: identity.sha256File(path.join(dir, 'dist', 'translator.js')),
    structuralParitySha256: identity.sha256File(path.join(dir, 'dist', 'structural-parity.js')),
    glossarySha256: Object.fromEntries(ENGINE_LANGUAGES.map((l) => [l, identity.sha256File(path.join(dir, 'glossary', `${l}.json`))])),
    distStale: identity.distStale(dir),
  };
  fp.id = `engine-${stableHash({ dist: fp.distSha256, glossary: fp.glossarySha256, sdk: fp.sdkVersion })}`;
  return fp;
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * A seeded generator (mulberry32 over a sha256 of the seed): reproducible choices for the
 * judge's sampling and the bootstrap.
 */
export function seededRandom(seed) {
  let state = parseInt(sha256(String(seed)).slice(0, 8), 16) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates with a seeded generator; returns a new array. */
export function shuffled(items, random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function realpathOrSelf(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** True for a path the OS may clean: os.tmpdir(), /tmp, /var/folders (macOS purges these). */
export function isTemporaryPath(p) {
  const resolved = realpathOrSelf(p);
  const roots = [os.tmpdir(), '/tmp', '/private/tmp', '/var/folders', '/private/var/folders'].map(realpathOrSelf);
  return roots.some((root) => isInside(resolved, root));
}

/**
 * The evaluation root: --eval-root, else $EVAL_ROOT, else ~/.cache/action-translation/claude-5-5-eval.
 * Never inside the repository (D-2026-09-21-no-scratch-in-tree). A temporary directory is refused
 * for the paid stages unless allowTmp: the OS cleans it, and later stages read earlier drafts.
 */
export function resolveEvalRoot(flagValue, { allowTmp = false, requireDurable = false } = {}) {
  const chosen = flagValue ?? process.env.EVAL_ROOT ?? DEFAULT_EVAL_ROOT;
  const root = path.resolve(chosen);
  const repo = realpathOrSelf(REPO_ROOT);
  // The root may not exist yet: check its nearest existing ancestor's real path too.
  let probe = root;
  while (!fs.existsSync(probe) && path.dirname(probe) !== probe) probe = path.dirname(probe);
  const real = path.join(realpathOrSelf(probe), path.relative(probe, root));
  if (isInside(real, repo) || isInside(root, REPO_ROOT)) {
    throw new UsageError(`EVAL_ROOT ${root} is inside the repository; scratch lives outside the tree`);
  }
  if (requireDurable && !allowTmp && isTemporaryPath(real)) {
    throw new UsageError(
      `EVAL_ROOT ${root} is a temporary directory, which the OS cleans; later stages read earlier drafts. ` +
        `Use a durable path (default ${DEFAULT_EVAL_ROOT}) or pass --allow-tmp.`
    );
  }
  return root;
}

/** Every file under dir (recursive) whose path satisfies the predicate. Missing dir → []. */
export function walkFiles(dir, predicate = () => true) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && predicate(full)) out.push(full);
    }
  }
  return out.sort();
}

/** Parse JSON, returning { value } or { error } (a half-written or corrupt file is data, not a crash). */
export function readJson(file) {
  try {
    return { value: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** rate-check's meta.txt (KEY='value' lines) → object. */
export function readMetaTxt(file) {
  const meta = {};
  if (!fs.existsSync(file)) return meta;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(?:'([^']*)'|"([^"]*)"|(.*))$/);
    if (m) meta[m[1]] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return meta;
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

export function appendJsonl(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`);
}

/** Read a JSONL file, skipping (and counting) lines that do not parse. */
export function readJsonl(file) {
  const rows = [];
  let bad = 0;
  if (!fs.existsSync(file)) return { rows, bad };
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      bad++;
    }
  }
  return { rows, bad };
}

export function fmtUSD(x) {
  if (x === null || x === undefined || Number.isNaN(x)) return 'unpriced';
  return `$${x < 10 ? x.toFixed(2) : x.toFixed(0)}`;
}

export function fmtPct(x, digits = 0) {
  if (x === null || x === undefined || Number.isNaN(x)) return '–';
  return `${(100 * x).toFixed(digits)}%`;
}

export function fmtP(p) {
  if (p === null || p === undefined || Number.isNaN(p)) return '–';
  if (p < 0.001) return p.toExponential(1);
  return p.toFixed(3);
}

/** Left-pad a table of strings into aligned columns. */
export function table(rows, header) {
  const all = header ? [header, ...rows] : rows;
  const widths = [];
  for (const row of all) row.forEach((cell, i) => (widths[i] = Math.max(widths[i] ?? 0, String(cell).length)));
  return all.map((row) => row.map((cell, i) => String(cell).padEnd(widths[i])).join('  ').trimEnd()).join('\n');
}

/** A Markdown table. */
export function mdTable(header, rows) {
  const esc = (v) => String(v).replace(/\|/g, '\\|');
  return [`| ${header.map(esc).join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n');
}

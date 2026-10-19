#!/usr/bin/env node
/**
 * run-identity.mjs — what rate-check records about an engine and a run's inputs, so that two
 * runs (or a run and its resume) can be shown to have used the same bytes.
 *
 *   node run-identity.mjs --engine-dir DIR --languages a,b --source-dir DIR --fixtures x.md,y.md \
 *                         --localize none|default|<rules>
 *
 * Prints meta.txt lines (KEY='value'):
 *   ENGINE_VER          the engine's package.json version
 *   SDK_VERSION         the @anthropic-ai/sdk the engine's CLI actually resolves from its dist/ —
 *                       a --ref worktree that borrows this checkout's node_modules runs THIS
 *                       checkout's SDK, whatever the ref declares
 *   SDK_DECLARED        the engine's package.json range for it
 *   SDK_LOCKED          the version the engine's package-lock.json pins (what `npm ci` installs)
 *   ENGINE_DIST_SHA256  every dist/**\/*.js, hashed by relative path and content
 *   TRANSLATOR_SHA256   dist/translator.js
 *   PARITY_SHA256       dist/structural-parity.js (#227: every run records the guard it ran)
 *   GLOSSARY_SHA256     lang:sha per language (glossary/<lang>.json; "missing" when absent)
 *   FIXTURES_SHA256     fixture:sha per fixture in the source directory
 *   LOCALIZE_RULES      the rules --localize resolves to, read from the engine's own
 *                       dist/localization-rules.js ("default" = its DEFAULT_RULES), so the
 *                       record holds the list that version actually used
 *   DIST_STALE          1 when a src/ file is newer than dist/cli/index.js (build first)
 *
 * Exit 0, or 2 when --localize names a rule the engine does not know (checked once, here,
 * rather than failing every draw) or an argument is missing.
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function sha256File(file) {
  return fs.existsSync(file)
    ? createHash('sha256').update(fs.readFileSync(file)).digest('hex')
    : null;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Relative paths ('/'-separated) of every file under `dir` whose name passes `keep`. */
function walk(dir, keep, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, keep, base, out);
    else if (keep(entry.name)) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

/** One hash over every dist/**\/*.js: sorted relative paths, each with its content hash. */
export function distSha256(engineDir) {
  const dist = path.join(engineDir, 'dist');
  if (!fs.existsSync(dist)) return null;
  const hash = createHash('sha256');
  for (const rel of walk(dist, (name) => name.endsWith('.js')).sort()) {
    hash.update(`${rel}\0${sha256File(path.join(dist, rel))}\n`);
  }
  return hash.digest('hex');
}

/** The SDK the engine's CLI resolves (as Node would from dist/cli/), and what the engine declares. */
export function sdkInfo(engineDir) {
  let version = null;
  try {
    const require = createRequire(path.join(engineDir, 'dist', 'cli', 'index.js'));
    let dir = path.dirname(require.resolve('@anthropic-ai/sdk'));
    while (dir !== path.dirname(dir)) {
      const pkg = readJson(path.join(dir, 'package.json'));
      if (pkg?.name === '@anthropic-ai/sdk') {
        version = pkg.version ?? null;
        break;
      }
      dir = path.dirname(dir);
    }
  } catch {
    version = null;
  }
  const pkg = readJson(path.join(engineDir, 'package.json'));
  const lock = readJson(path.join(engineDir, 'package-lock.json'));
  return {
    engineVersion: pkg?.version ?? null,
    version,
    declared: pkg?.dependencies?.['@anthropic-ai/sdk'] ?? null,
    locked: lock?.packages?.['node_modules/@anthropic-ai/sdk']?.version ?? null,
  };
}

/** True when a non-test src/ file is newer than the built CLI (the cli-smoke tests' staleness rule). */
export function distStale(engineDir) {
  const cli = path.join(engineDir, 'dist', 'cli', 'index.js');
  const src = path.join(engineDir, 'src');
  if (!fs.existsSync(cli) || !fs.existsSync(src)) return null;
  const built = fs.statSync(cli).mtimeMs;
  return walk(src, (name) => /\.tsx?$/.test(name) && !name.endsWith('.test.ts')).some(
    (rel) => fs.statSync(path.join(src, rel)).mtimeMs > built
  );
}

/** The rule list `--localize mode` gives this engine; throws on a rule it does not know. */
export async function resolveLocalize(engineDir, mode) {
  const file = path.join(engineDir, 'dist', 'localization-rules.js');
  if (!fs.existsSync(file))
    return { rules: null, warning: `${file} not found; --localize not checked` };
  const rules = await import(pathToFileURL(file).href);
  if (mode === 'default') return { rules: [...rules.DEFAULT_RULES] };
  return { rules: rules.parseLocalizationRules(mode) };
}

function list(value) {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** A shell single-quoted word: meta.txt stays sourceable by older rate-check versions. */
function quote(value) {
  return `'${String(value ?? '').replace(/'/g, `'\\''`)}'`;
}

export async function identity({ engineDir, languages, sourceDir, fixtures, localize }) {
  const sdk = sdkInfo(engineDir);
  const loc = await resolveLocalize(engineDir, localize);
  const stale = distStale(engineDir);
  return {
    values: {
      ENGINE_VER: sdk.engineVersion ?? 'unknown',
      SDK_VERSION: sdk.version ?? 'unresolved',
      SDK_DECLARED: sdk.declared ?? '',
      SDK_LOCKED: sdk.locked ?? '',
      ENGINE_DIST_SHA256: distSha256(engineDir) ?? 'missing',
      TRANSLATOR_SHA256: sha256File(path.join(engineDir, 'dist', 'translator.js')) ?? 'missing',
      PARITY_SHA256: sha256File(path.join(engineDir, 'dist', 'structural-parity.js')) ?? 'missing',
      GLOSSARY_SHA256: languages
        .map(
          (lang) =>
            `${lang}:${sha256File(path.join(engineDir, 'glossary', `${lang}.json`)) ?? 'missing'}`
        )
        .join(','),
      FIXTURES_SHA256: fixtures
        .map((fx) => `${fx}:${sha256File(path.join(sourceDir, fx)) ?? 'missing'}`)
        .join(','),
      LOCALIZE_RULES: loc.rules === null ? '?' : loc.rules.join(','),
      DIST_STALE: stale === null ? '' : stale ? '1' : '0',
    },
    warnings: loc.warning ? [loc.warning] : [],
  };
}

async function main(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith('--') || value === undefined)
      throw new Error(`bad arguments near '${key ?? ''}'`);
    opts[key.slice(2)] = value;
  }
  for (const key of ['engine-dir', 'languages', 'source-dir', 'fixtures', 'localize']) {
    if (opts[key] === undefined) throw new Error(`--${key} is required`);
  }
  const { values, warnings } = await identity({
    engineDir: path.resolve(opts['engine-dir']),
    languages: list(opts.languages),
    sourceDir: path.resolve(opts['source-dir']),
    fixtures: list(opts.fixtures),
    localize: opts.localize,
  });
  for (const w of warnings) console.error(`warning: ${w}`);
  for (const [key, value] of Object.entries(values)) console.log(`${key}=${quote(value)}`);
}

// Real paths on both sides: run from a symlinked checkout (or under --preserve-symlinks-main), the
// two name one file differently, and a URL comparison made every direct run exit 0 with no output.
let invokedDirectly = false;
try {
  invokedDirectly =
    Boolean(process.argv[1]) &&
    fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1]);
} catch {
  // imported, or argv[1] is not a file
}
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`run-identity: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  });
}

/**
 * Glossary resolution for the CLI commands.
 *
 * The built-in glossaries ship inside *this* package — no edition repository
 * carries `glossary/<lang>.json`. Resolving candidates against `process.cwd()`
 * alone therefore meant any run launched from outside an action-translation
 * checkout — the target repo, a bench root, anywhere a globally installed CLI
 * is naturally invoked — translated with no glossary at all. Nothing was logged
 * either way, so a run that dropped terminology enforcement looked identical to
 * one that applied it (#149).
 *
 * Resolution here is package-relative, ordered, reported, and loud on failure:
 * a candidate that exists but cannot be parsed is an error, never a silent
 * fall-through to a different glossary.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Glossary } from '../types.js';

/** Which candidate supplied a resolved glossary. */
export type GlossaryOrigin = 'custom' | 'repo-local' | 'built-in';

export interface GlossaryResolution {
  /** The loaded glossary, or undefined when no candidate exists. */
  glossary?: Glossary;
  /** Where it came from. */
  origin?: GlossaryOrigin;
  /** Absolute path it was read from. */
  path?: string;
  /** Every path considered, in order — reported when nothing is found. */
  candidates: string[];
}

export interface GlossaryLookupOptions {
  /** Explicit `--glossary` path. When set it is the ONLY candidate. */
  customPath?: string;
  /** Directory holding the packaged glossaries (`<package-root>/glossary`). */
  builtInDir?: string;
  /** Working directory for repo-local candidates (default: `process.cwd()`). */
  cwd?: string;
}

/** Minimal logger surface — structurally compatible with the command loggers. */
export interface GlossaryLogger {
  info(message: string): void;
  warn(message: string): void;
}

interface Candidate {
  origin: GlossaryOrigin;
  file: string;
}

/**
 * Candidate paths in precedence order.
 *
 * An explicit `--glossary` is exclusive: if the operator named a file, falling
 * back to some other glossary would translate against terminology they did not
 * ask for. Otherwise a repo-local glossary wins over the packaged one, so a
 * project can override the estate defaults by carrying its own.
 */
function candidatesFor(language: string, options: GlossaryLookupOptions): Candidate[] {
  if (options.customPath) {
    return [{ origin: 'custom', file: path.resolve(options.customPath) }];
  }

  const cwd = options.cwd ?? process.cwd();
  const candidates: Candidate[] = [
    { origin: 'repo-local', file: path.join(cwd, 'glossary', `${language}.json`) },
    { origin: 'repo-local', file: path.join(cwd, `glossary-${language}.json`) },
  ];

  if (options.builtInDir) {
    candidates.push({
      origin: 'built-in',
      file: path.join(options.builtInDir, `${language}.json`),
    });
  }

  return candidates;
}

/**
 * Read and validate one glossary file. Throws rather than returning undefined —
 * a malformed glossary is an operator error, and swallowing it reintroduces the
 * silence this module exists to remove.
 */
function readGlossaryFile(file: string): Glossary {
  const raw = fs.readFileSync(file, 'utf-8');

  let parsed: Glossary;
  try {
    parsed = JSON.parse(raw) as Glossary;
  } catch (error) {
    throw new Error(
      `Glossary at ${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!parsed || !Array.isArray(parsed.terms)) {
    throw new Error(`Glossary at ${file} has no "terms" array — it cannot be used.`);
  }

  return parsed;
}

/**
 * Resolve the glossary for a language without reporting.
 *
 * @throws if an explicit `--glossary` path is missing, or if any candidate
 *         exists but is malformed.
 */
export function resolveGlossary(
  language: string,
  options: GlossaryLookupOptions = {}
): GlossaryResolution {
  const candidates = candidatesFor(language, options);
  const tried = candidates.map((c) => c.file);

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate.file)) continue;
    return {
      glossary: readGlossaryFile(candidate.file),
      origin: candidate.origin,
      path: candidate.file,
      candidates: tried,
    };
  }

  if (options.customPath) {
    throw new Error(`Glossary not found at ${path.resolve(options.customPath)} (--glossary)`);
  }

  return { candidates: tried };
}

/**
 * Resolve the glossary and report the outcome — on success *and* on failure.
 *
 * A run that translates without terminology enforcement must never look like a
 * run that applies it; that indistinguishability is the defect (#149), not just
 * the missed lookup. Returns undefined only for a language with no glossary
 * anywhere, which is legitimate — the packaged languages always resolve.
 */
export function loadGlossary(
  language: string,
  options: GlossaryLookupOptions = {},
  logger?: GlossaryLogger
): Glossary | undefined {
  const resolution = resolveGlossary(language, options);

  if (resolution.glossary) {
    logger?.info(
      `✓ Loaded ${resolution.origin} glossary for ${language} — ` +
        `${resolution.glossary.terms.length} terms (${resolution.path})`
    );
    return resolution.glossary;
  }

  const notes = options.builtInDir
    ? ''
    : ' No built-in glossary directory was supplied to the loader — this is a wiring bug.';
  logger?.warn(
    `No glossary found for ${language} — translating WITHOUT terminology enforcement. ` +
      `Tried: ${resolution.candidates.join(', ')}.${notes}`
  );

  return undefined;
}

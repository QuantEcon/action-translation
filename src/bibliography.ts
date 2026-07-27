/**
 * Bibliography backfill — shared citation assets across the sync boundary (#117)
 *
 * ## The defect
 *
 * `sync` and `forward` translate lecture bodies, including any `{cite}` roles
 * upstream added, but the bibliography those keys resolve against is a separate
 * shared file that never crosses: `sync-orchestrator.ts` filters changed files
 * to `.endsWith('.md')`, so `_static/quant-econ.bib` is not part of the sync
 * surface at all. Under a strict build (`-n -W`) Sphinx turns "could not find
 * bibtex key" into a hard failure, so the target repo stops building on a file
 * nobody edited. Field record: four lectures in one resync wave, then a 70-key
 * backfill, then 21 more keys on 2026-07-27 — three manual repairs of a
 * mechanism that did not exist.
 *
 * ## Why the trigger is demand-driven, not diff-driven
 *
 * The obvious design — "when the source PR touches the .bib, carry it" — misses
 * the larger class. `lecture-python-intro/lectures/msy_fishery.md` cites five
 * keys that `lecture-intro.zh-cn`'s bibliography lacks, and no source PR
 * touches the bib: the target simply has not translated that lecture yet. The
 * moment it does, five citations dangle. So the trigger here is the set of keys
 * a run *introduces into the target*, whatever the source diff happened to
 * contain.
 *
 * ## Why the fence walk has a stack
 *
 * 45 of 872 `{cite}` roles in `lecture-python.myst` — 5.2% — live inside
 * non-code fenced containers such as `{note}`, `{exercise}` and `{admonition}`.
 * A walker that skips every fence body would miss one citation in twenty. So
 * this walker descends into directive fences and only goes opaque inside ones
 * that hold verbatim text (code cells, raw, math). Do not "simplify" it back
 * into `extractStructuralTokens`.
 *
 * There are three fence walkers in this codebase and they differ deliberately:
 *
 * - `structural-parity.ts:126` — flat, skips every fence body. Correct there
 *   because parity compares two scans of the *same* walker, so a shared blind
 *   spot cancels out.
 * - `cli/target-local-reads.ts:48` — code cells only, because it is looking for
 *   filesystem reads in executable code.
 * - this one — stack-based and selectively transparent, because a citation in a
 *   `{note}` is a real citation and breaks a real build.
 */

// =============================================================================
// MODE
// =============================================================================

export type BibliographyMode = 'backfill' | 'lint' | 'off';

export const BIBLIOGRAPHY_MODES: readonly BibliographyMode[] = ['backfill', 'lint', 'off'];

export const DEFAULT_BIBLIOGRAPHY_MODE: BibliographyMode = 'backfill';

/**
 * Parse the `bibliography` input.
 *
 * Throws on an unrecognised value rather than falling back to the default: a
 * typo must not silently disable the guard. A disabled guard looks exactly like
 * a passing one until a build breaks weeks later, which is the failure mode
 * this module exists to remove.
 */
export function parseBibliographyMode(raw: string): BibliographyMode {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return DEFAULT_BIBLIOGRAPHY_MODE;
  if ((BIBLIOGRAPHY_MODES as readonly string[]).includes(trimmed)) {
    return trimmed as BibliographyMode;
  }
  throw new Error(
    `Unknown bibliography mode: '${raw}'. Expected one of: ${BIBLIOGRAPHY_MODES.join(', ')}.`
  );
}

// =============================================================================
// TYPES
// =============================================================================

export interface CitationRef {
  key: string;
  /** 1-based line number in the document the role appeared on. */
  line: number;
}

export interface BibEntry {
  type: string;
  key: string;
  /** The entry verbatim, from `@` through its matching close brace. */
  raw: string;
  /** 1-based line number of the entry head. */
  line: number;
}

export interface ParsedBib {
  entries: BibEntry[];
  /** More than one entry for a key means the bibliography has a duplicate. */
  byKey: Map<string, BibEntry[]>;
  /** Keys whose head parsed but whose braces never balanced before EOF. */
  unterminated: string[];
}

export interface BibFile {
  path: string;
  content: string;
  sha?: string;
}

export interface BibliographySources {
  /** Configured target bibliographies, in `bibtex_bibfiles` order. Keys resolve against the union. */
  targets: BibFile[];
  /** Source bibliographies at the same docs-relative paths. */
  sources: BibFile[];
}

/** One document this run produced: what will be committed, and what the target had before. */
export interface CitationDoc {
  file: string;
  /** Target content before this run. Empty string for a file the run creates. */
  before: string;
  /** Target content this run will commit. */
  after: string;
}

export interface CitationPlan {
  /** Repo-relative path the append lands on; undefined when nothing is appended. */
  bibPath?: string;
  /** Full merged bibliography content; undefined means no write. */
  mergedBib?: string;
  /** Blob SHA of the bibliography being appended to, carried through for the commit. */
  bibSha?: string;
  /** file → keys appended on its behalf */
  backfilled: Map<string, string[]>;
  /** file → introduced keys that resolve nowhere, or were blocked from appending */
  unresolved: Map<string, string[]>;
  /** file → keys that were already dangling before this run touched anything */
  preExisting: Map<string, string[]>;
  /** One line per unresolved key. Empty means clean. */
  errors: string[];
  /** Never fatal: duplicate/collision skips, pre-existing dangling keys, unterminated entries. */
  warnings: string[];
}

// =============================================================================
// CITATION EXTRACTION
// =============================================================================

/** Opening of any fence: ```lang, ````{directive} arg, ~~~ … (mirrors structural-parity.ts:112) */
const FENCE_LINE = /^\s*(`{3,}|~{3,})(.*)$/;
/** The directive form of a fence info string. */
const DIRECTIVE_INFO = /^\{([A-Za-z0-9_+:.-]+)\}\s*(.*)$/;

/**
 * Directives whose bodies are verbatim text, where a `{cite}`-looking string is
 * not a citation. Everything else — `{note}`, `{exercise}`, `{admonition}`,
 * `{prf:theorem}`, `{tab-item}`, … — is transparent and still scanned.
 */
const OPAQUE_DIRECTIVES = new Set([
  'code-cell',
  'code-block',
  'code',
  'literalinclude',
  'raw',
  'math',
  'mermaid',
]);

/** `{cite}`, `{cite:t}`, `{cite:p}`, `{footcite}` … followed by a backtick payload. */
const CITE_ROLE = /\{(?:foot)?cite(?::[a-zA-Z]+)?\}`([^`]*)`/g;

/**
 * Extract every citation key referenced by a document, in order.
 *
 * Keys are returned once per occurrence, not deduplicated — callers that want a
 * set can build one, and the line numbers are what make an error message
 * actionable.
 */
export function extractCitationKeys(content: string): CitationRef[] {
  const refs: CitationRef[] = [];
  const stack: Array<{ char: string; length: number }> = [];
  /** Stack depth at which opacity began; null when we are scanning. */
  let opaqueFrom: number | null = null;

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = FENCE_LINE.exec(line);

    if (fence) {
      const marker = fence[1];
      const info = (fence[2] || '').trim();
      const char = marker[0];
      const top = stack[stack.length - 1];

      // A closing fence matches the top marker, is at least as long, and carries
      // no info string.
      if (top && char === top.char && marker.length >= top.length && info === '') {
        stack.pop();
        if (opaqueFrom !== null && stack.length < opaqueFrom) {
          opaqueFrom = null;
        }
        continue;
      }

      stack.push({ char, length: marker.length });
      if (opaqueFrom === null) {
        const directive = DIRECTIVE_INFO.exec(info);
        const isOpaque = directive ? OPAQUE_DIRECTIVES.has(directive[1]) : true;
        if (isOpaque) {
          // Depth *after* the push: opacity lifts once we pop back below it.
          opaqueFrom = stack.length;
        }
      }
      continue;
    }

    if (opaqueFrom !== null) continue;

    CITE_ROLE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CITE_ROLE.exec(line)) !== null) {
      for (const raw of match[1].split(',')) {
        const key = raw.trim();
        if (key) refs.push({ key, line: i + 1 });
      }
    }
  }

  return refs;
}

// =============================================================================
// BIBTEX PARSING
// =============================================================================

/**
 * Entry head: `@article{Key,` with optional leading whitespace.
 *
 * The `[ \t]*` prefix is mandatory and load-bearing. An `^@`-anchored pattern
 * finds 493 of the 501 entries in `quant-econ.bib` — eight entries in the
 * estate's own bibliography are indented. Anchoring would report those eight
 * keys as missing and re-append them, producing the duplicate-key `-W` failure
 * this module exists to prevent.
 */
const ENTRY_HEAD = /^[ \t]*@([A-Za-z]+)[ \t]*[{(][ \t]*([^,\s{}()]+)[ \t]*,/gm;

/** Entry types that declare no citable key. */
const NON_ENTRY_TYPES = new Set(['string', 'comment', 'preamble']);

/**
 * Parse a BibTeX file into entries.
 *
 * Only entry heads and their brace-balanced bodies are read; anything between
 * entries is ignored. This is not a general BibTeX parser and does not need to
 * be — it answers two questions: which keys exist, and what are the bytes of
 * the entry declaring one.
 */
export function parseBib(content: string): ParsedBib {
  const entries: BibEntry[] = [];
  const byKey = new Map<string, BibEntry[]>();
  const unterminated: string[] = [];

  ENTRY_HEAD.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = ENTRY_HEAD.exec(content)) !== null) {
    const type = match[1].toLowerCase();
    const key = match[2];
    if (NON_ENTRY_TYPES.has(type)) continue;

    const atIndex = content.indexOf('@', match.index);
    const openIndex = atIndex + 1 + match[1].length;
    // Find the actual opening delimiter (there may be whitespace after the type).
    let open = -1;
    for (let i = openIndex; i < content.length; i++) {
      const c = content[i];
      if (c === '{' || c === '(') {
        open = i;
        break;
      }
      if (c !== ' ' && c !== '\t') break;
    }
    if (open === -1) continue;

    const closer = content[open] === '{' ? '}' : ')';
    const opener = content[open];
    let depth = 0;
    let end = -1;
    for (let i = open; i < content.length; i++) {
      const c = content[i];
      if (c === '\\') {
        i++; // escaped character, including \{ and \}
        continue;
      }
      if (c === opener) depth++;
      else if (c === closer) {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }

    if (end === -1) {
      unterminated.push(key);
      continue;
    }

    const entry: BibEntry = {
      type,
      key,
      raw: content.slice(atIndex, end + 1),
      line: content.slice(0, atIndex).split('\n').length,
    };
    entries.push(entry);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(entry);
    else byKey.set(key, [entry]);
  }

  return { entries, byKey, unterminated };
}

/** The set of keys a parsed bibliography declares. */
export function bibKeySet(parsed: ParsedBib): Set<string> {
  return new Set(parsed.byKey.keys());
}

/**
 * Append entries to a bibliography, preserving everything already there.
 *
 * Append-only by construction: existing bytes are never rewritten, so an
 * edition that has localised an entry cannot have that entry clobbered — a key
 * that resolves in the target is never a candidate in the first place.
 */
export function appendBibEntries(targetBib: string, entries: BibEntry[]): string {
  if (entries.length === 0) return targetBib;
  const base = targetBib.replace(/\s*$/, '');
  const block = entries.map((e) => e.raw.trim()).join('\n\n');
  const header = '% --- Entries below added automatically by action-translation (#117) ---';
  const needsHeader = !targetBib.includes(header);
  return `${base}\n\n${needsHeader ? `${header}\n\n` : ''}${block}\n`;
}

/**
 * Read `bibtex_bibfiles` out of a jupyter-book `_config.yml`.
 *
 * Deliberately a narrow line scan rather than a YAML parse: this runs against
 * whatever a target repo happens to contain, and an unparseable config must
 * degrade to "no bibliographies configured" rather than throwing. Never throws.
 */
export function parseBibtexBibfiles(configYaml: string): string[] {
  const lines = configYaml.split('\n');
  const paths: string[] = [];
  let inBlock = false;
  let indent = 0;

  for (const line of lines) {
    if (!inBlock) {
      const m = /^(\s*)bibtex_bibfiles\s*:\s*(.*)$/.exec(line);
      if (!m) continue;
      const inline = m[2].trim();
      if (inline.startsWith('[')) {
        // Flow sequence: [a.bib, b.bib]
        for (const item of inline.replace(/^\[|\]$/g, '').split(',')) {
          const v = item.trim().replace(/^['"]|['"]$/g, '');
          if (v) paths.push(v);
        }
        return paths;
      }
      inBlock = true;
      indent = m[1].length;
      continue;
    }

    if (!line.trim()) continue;
    const itemMatch = /^(\s*)-\s*(.+?)\s*$/.exec(line);
    if (itemMatch && itemMatch[1].length > indent) {
      paths.push(itemMatch[2].replace(/^['"]|['"]$/g, ''));
      continue;
    }
    // A non-item line at or below the key's indent ends the block.
    const lineIndent = line.length - line.trimStart().length;
    if (lineIndent <= indent) break;
  }

  return paths;
}

// =============================================================================
// PLANNING
// =============================================================================

/**
 * Decide what to backfill for the documents a run produced.
 *
 * The safety model, in one sentence: a key that already resolves in the target
 * is never a candidate, so nothing an edition has localised can be touched.
 * Everything else is append-only, and anything ambiguous is reported rather
 * than guessed.
 */
export function planCitationBackfill(input: {
  docs: CitationDoc[];
  bib: BibliographySources;
  mode: Exclude<BibliographyMode, 'off'>;
  /** Keys already scheduled elsewhere in this wave (local bulk runs only). */
  ledger?: Set<string>;
}): CitationPlan {
  const { docs, bib, mode, ledger } = input;

  const plan: CitationPlan = {
    backfilled: new Map(),
    unresolved: new Map(),
    preExisting: new Map(),
    errors: [],
    warnings: [],
  };

  const targetParsed = bib.targets.map((t) => parseBib(t.content));
  const sourceParsed = bib.sources.map((s) => parseBib(s.content));

  const targetKeys = new Set<string>();
  const targetKeysLower = new Map<string, string>();
  for (const parsed of targetParsed) {
    for (const key of parsed.byKey.keys()) {
      targetKeys.add(key);
      targetKeysLower.set(key.toLowerCase(), key);
    }
    for (const key of parsed.unterminated) {
      plan.warnings.push(
        `target bibliography has an unterminated entry for '${key}' — it is not counted as present`
      );
    }
  }

  const sourceByKey = new Map<string, BibEntry[]>();
  for (const parsed of sourceParsed) {
    for (const [key, list] of parsed.byKey) {
      const existing = sourceByKey.get(key);
      if (existing) existing.push(...list);
      else sourceByKey.set(key, [...list]);
    }
  }

  const toAppend: BibEntry[] = [];
  const appended = new Set<string>();

  for (const doc of docs) {
    const beforeKeys = new Set(extractCitationKeys(doc.before).map((r) => r.key));
    const afterRefs = extractCitationKeys(doc.after);

    // Deduplicate per document, keeping the first line each key appeared on.
    const introduced = new Map<string, number>();
    const carried = new Map<string, number>();
    for (const ref of afterRefs) {
      const bucket = beforeKeys.has(ref.key) ? carried : introduced;
      if (!bucket.has(ref.key)) bucket.set(ref.key, ref.line);
    }

    // Keys the document already cited and that still do not resolve are
    // reported but never block this run — the run did not introduce them.
    for (const [key, line] of carried) {
      if (!targetKeys.has(key) && !appended.has(key)) {
        push(plan.preExisting, doc.file, key);
        plan.warnings.push(
          `${doc.file}:${line}: '${key}' was already dangling before this run — not introduced here, left alone`
        );
      }
    }

    for (const [key, line] of introduced) {
      if (targetKeys.has(key) || appended.has(key)) continue;

      if (ledger?.has(key)) {
        // Another file in this wave already scheduled it.
        continue;
      }

      const sourceEntries = sourceByKey.get(key);

      if (!sourceEntries || sourceEntries.length === 0) {
        push(plan.unresolved, doc.file, key);
        const near = nearestKey(key, targetKeysLower, sourceByKey);
        plan.errors.push(
          `${doc.file}:${line}: citation '${key}' resolves in neither the target nor the source bibliography` +
            (near ? ` (nearest existing key: '${near}')` : '')
        );
        continue;
      }

      if (sourceEntries.length > 1) {
        push(plan.unresolved, doc.file, key);
        plan.errors.push(
          `${doc.file}:${line}: citation '${key}' is declared ${sourceEntries.length} times in the source bibliography — resolve the duplicate upstream before it can be copied`
        );
        continue;
      }

      const collision = targetKeysLower.get(key.toLowerCase());
      if (collision && collision !== key) {
        push(plan.unresolved, doc.file, key);
        plan.errors.push(
          `${doc.file}:${line}: citation '${key}' differs only in case from '${collision}' already in the target bibliography — appending would create an ambiguous reference`
        );
        continue;
      }

      if (mode === 'backfill') {
        toAppend.push(sourceEntries[0]);
        appended.add(key);
        ledger?.add(key);
        push(plan.backfilled, doc.file, key);
      } else {
        push(plan.unresolved, doc.file, key);
        plan.errors.push(
          `${doc.file}:${line}: citation '${key}' is missing from the target bibliography (bibliography mode is 'lint', so it was not copied)`
        );
      }
    }
  }

  if (toAppend.length > 0 && bib.targets.length > 0) {
    const primary = bib.targets[0];
    plan.bibPath = primary.path;
    plan.bibSha = primary.sha;
    plan.mergedBib = appendBibEntries(primary.content, toAppend);
  }

  return plan;
}

function push(map: Map<string, string[]>, file: string, key: string): void {
  const list = map.get(file);
  if (list) list.push(key);
  else map.set(file, [key]);
}

/** Nearest case-insensitive match, to turn a typo'd key into an actionable message. */
function nearestKey(
  key: string,
  targetLower: Map<string, string>,
  sourceByKey: Map<string, BibEntry[]>
): string | undefined {
  const lower = key.toLowerCase();
  const inTarget = targetLower.get(lower);
  if (inTarget) return inTarget;
  for (const candidate of sourceByKey.keys()) {
    if (candidate.toLowerCase() === lower) return candidate;
  }
  return undefined;
}

// =============================================================================
// REPORTING
// =============================================================================

/** Human-readable summary of why a run failed on citations. */
export function formatCitationErrors(plan: CitationPlan): string {
  if (plan.errors.length === 0) return '';
  return [
    `Unresolved citation key(s) — the target would not build:`,
    ...plan.errors.map((e) => `  - ${e}`),
  ].join('\n');
}

export interface CitationNotices {
  bibPath: string;
  backfilled: Map<string, string[]>;
  preExisting: Map<string, string[]>;
}

/**
 * Markdown for the PR body. Returns '' when there is nothing to say, so callers
 * can concatenate unconditionally.
 */
export function buildCitationNotice(n: CitationNotices): string {
  const parts: string[] = [];

  if (n.backfilled.size > 0) {
    const total = [...n.backfilled.values()].reduce((sum, keys) => sum + keys.length, 0);
    parts.push(
      `### Bibliography\n\n${total} citation ${total === 1 ? 'entry' : 'entries'} copied from the source bibliography into \`${n.bibPath}\`, for citations this sync introduced (#117):\n`
    );
    for (const [file, keys] of n.backfilled) {
      parts.push(`- \`${file}\` — ${keys.map((k) => `\`${k}\``).join(', ')}`);
    }
  }

  if (n.preExisting.size > 0) {
    const total = [...n.preExisting.values()].reduce((sum, keys) => sum + keys.length, 0);
    parts.push(
      `\n### Pre-existing dangling citations\n\n${total} citation ${total === 1 ? 'key' : 'keys'} referenced by these files ${total === 1 ? 'does' : 'do'} not resolve, and were **not** introduced by this sync — they were already there. Left untouched:\n`
    );
    for (const [file, keys] of n.preExisting) {
      parts.push(`- \`${file}\` — ${keys.map((k) => `\`${k}\``).join(', ')}`);
    }
  }

  return parts.length > 0 ? parts.join('\n') : '';
}

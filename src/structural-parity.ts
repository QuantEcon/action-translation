/**
 * Structural parity between a source document and its translated output.
 *
 * The silent-corruption class (#118, #119, #65) is structural MyST mutated by a
 * path that should have passed it through verbatim: a `{raw} jupyter` directive
 * argument stripped to `{raw}` (#119), `(label)=` target anchors dropped before
 * headings (#65), an entire document wrapped in a code fence (#118). Every
 * instance reported success at run time and surfaced weeks later on a cold
 * strict build downstream.
 *
 * The guard here is cheap and deterministic: extract the structural tokens —
 * fenced-directive openings and target anchors — from both sides and require
 * them to correspond. Directive names and structural arguments are never
 * legitimately translated, so any divergence is a defect by definition. The
 * one nuance is title-bearing directives (`admonition`, `exercise`, …), whose
 * argument IS display prose and legitimately changes under translation — for
 * those, only the presence of an argument must match.
 *
 * Scanning is a stateful fence walk, not a parse: inside an open fence nothing
 * is recorded, so directives nested inside `{tab-set}`-style containers and
 * directive syntax quoted in documentation examples are invisible to the
 * guard. That is deliberate — both sides are scanned with the SAME walker, so
 * systematic blind spots cancel out, and a top-level-only comparison already
 * catches all three defect shapes above (#118 destroys the whole top-level
 * sequence; #119 and #65 are top-level tokens).
 *
 * Lives outside index.ts / file-processor.ts on the Stage-2 rule: guards go in
 * modules Jest can load. See https://github.com/QuantEcon/action-translation/issues/119
 * and issues/65; ordering rationale in issues/120.
 */

/** A fenced-directive opening at fence depth 0, e.g. ```{code-cell} ipython3 */
export interface DirectiveToken {
  /** Directive name inside the braces, e.g. `code-cell`, `raw`, `admonition`. */
  name: string;
  /** Trimmed text after the closing brace — argument/title; '' when absent. */
  arg: string;
  /** 1-based line number, for violation messages. */
  line: number;
}

/** A MyST target anchor at fence depth 0, e.g. `(sec:intro)=`. */
export interface AnchorToken {
  /** The label between the parentheses. */
  label: string;
  /** 1-based line number. */
  line: number;
}

export interface StructuralTokens {
  directives: DirectiveToken[];
  anchors: AnchorToken[];
}

export interface ParityViolation {
  /** Human-readable description, with source/output line references. */
  message: string;
}

export interface ParityResult {
  ok: boolean;
  violations: ParityViolation[];
}

/**
 * Directives whose argument legitimately differs between source and
 * translation. For these only the PRESENCE of an argument must match: a
 * translation may not drop an argument the source has, nor invent one the
 * source lacks. Two sub-classes, one rule:
 *
 * - **Display prose** (titles, index terms): `admonition`, `exercise`,
 *   `prf:*`, `contents` (its argument is the ToC's display title —
 *   `Contents` → `目录` is correct translation, confirmed corpus-wide),
 *   `index` (a Chinese edition's index entries should be Chinese).
 * - **Edition-pinned**: `code-cell`'s argument is the kernel/lexer name, and
 *   editions legitimately pin different kernels (`python3` upstream vs
 *   `ipython3` across lecture-python.zh-cn) — target frontmatter is ground
 *   truth by design (#105/#108), and the kernel tag follows it. Presence still
 *   catches the defect shape: a `{code-cell}` with its language dropped fails.
 *
 * Deliberately byte-equal instead: `solution` (its argument is the target
 * exercise's LABEL — a cross-reference), `raw` (output format — the #119
 * defect), `include`/`literalinclude`/`figure`/`image` (paths). When unsure a
 * name stays out of this set: a false violation is loud and cheap, a false
 * pass is the silent-corruption class again.
 *
 * Calibrated against the real corpus (2026-07-21): 211 source/target pairs
 * across five editions; the byte-equal-everything draft produced 362 false
 * positives in exactly the three classes now admitted here.
 */
const FLEXIBLE_ARG_DIRECTIVES = new Set([
  'admonition',
  'dropdown',
  'card',
  'grid-item-card',
  'tab-item',
  'exercise',
  'exercise-start',
  'contents',
  'index',
  'code-cell',
]);

/** `prf:theorem Title`, `prf:definition Title`, … — the whole family takes titles. */
const FLEXIBLE_ARG_PREFIX = 'prf:';

function isFlexibleArgDirective(name: string): boolean {
  return FLEXIBLE_ARG_DIRECTIVES.has(name) || name.startsWith(FLEXIBLE_ARG_PREFIX);
}

/** Opening of any fence: ```lang, ````{directive} arg, ~~~ … */
const FENCE_LINE = /^\s*(`{3,}|~{3,})(.*)$/;
/** The directive form of a fence info string: `{name}` then optional argument. */
const DIRECTIVE_INFO = /^\{([A-Za-z0-9_+:.-]+)\}\s*(.*)$/;
/** A target anchor line: `(label)=` and nothing else. */
const ANCHOR_LINE = /^\(([^()\s]+)\)=\s*$/;

/**
 * Extract top-level structural tokens with a stateful fence walk.
 *
 * Fence semantics are CommonMark-ish: an opening fence of N marker characters
 * is closed by a line of >= N of the same character and nothing else. While a
 * fence is open, lines are not inspected. Imperfections against full MyST
 * nesting are acceptable because parity compares two scans of the SAME walker.
 */
export function extractStructuralTokens(content: string): StructuralTokens {
  const directives: DirectiveToken[] = [];
  const anchors: AnchorToken[] = [];

  let openFence: { char: string; length: number } | null = null;
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = FENCE_LINE.exec(line);

    if (openFence) {
      if (
        fence &&
        fence[1][0] === openFence.char &&
        fence[1].length >= openFence.length &&
        fence[2].trim() === ''
      ) {
        openFence = null;
      }
      continue;
    }

    if (fence) {
      openFence = { char: fence[1][0], length: fence[1].length };
      const info = DIRECTIVE_INFO.exec(fence[2].trim());
      if (info) {
        directives.push({ name: info[1], arg: info[2].trim(), line: i + 1 });
      }
      continue;
    }

    const anchor = ANCHOR_LINE.exec(line);
    if (anchor) {
      anchors.push({ label: anchor[1], line: i + 1 });
    }
  }

  return { directives, anchors };
}

/**
 * Compare the structural tokens of a source document and its translated
 * output. Returns every violation rather than the first — a corrupted file
 * usually diverges in several places at once (#118 was 13 findings downstream)
 * and the full list is what makes the failure diagnosable.
 */
export function checkStructuralParity(sourceContent: string, outputContent: string): ParityResult {
  const source = extractStructuralTokens(sourceContent);
  const output = extractStructuralTokens(outputContent);
  const violations: ParityViolation[] = [];

  // ── Directives: same sequence of names; structural args byte-equal ────────
  if (source.directives.length !== output.directives.length) {
    violations.push({
      message:
        `directive count differs: source has ${source.directives.length}, ` +
        `output has ${output.directives.length} — a wholesale mismatch usually means ` +
        `the document was re-fenced or truncated`,
    });
  }

  const pairCount = Math.min(source.directives.length, output.directives.length);
  for (let i = 0; i < pairCount; i++) {
    const s = source.directives[i];
    const o = output.directives[i];

    if (s.name !== o.name) {
      violations.push({
        message:
          `directive #${i + 1} name changed: source line ${s.line} has {${s.name}}, ` +
          `output line ${o.line} has {${o.name}}`,
      });
      continue; // arg comparison is meaningless across different names
    }

    if (isFlexibleArgDirective(s.name)) {
      const sHas = s.arg !== '';
      const oHas = o.arg !== '';
      if (sHas !== oHas) {
        violations.push({
          message:
            `directive #${i + 1} {${s.name}} ${sHas ? 'lost' : 'gained'} its argument: ` +
            `source line ${s.line} has ${sHas ? `"${s.arg}"` : 'no argument'}, ` +
            `output line ${o.line} has ${oHas ? `"${o.arg}"` : 'none'}`,
        });
      }
    } else if (s.arg !== o.arg) {
      violations.push({
        message:
          `directive #${i + 1} {${s.name}} argument changed: ` +
          `source line ${s.line} has "${s.arg}", output line ${o.line} has "${o.arg}" — ` +
          `structural arguments are never translated`,
      });
    }
  }

  // ── Anchors: exact sequence — labels are cross-reference targets ──────────
  const sourceLabels = source.anchors.map((a) => a.label);
  const outputLabels = output.anchors.map((a) => a.label);

  if (sourceLabels.join('\n') !== outputLabels.join('\n')) {
    // Diagnose with a multiset diff, not includes(): a duplicated label with one
    // copy dropped would otherwise report as "different order", which misleads.
    // (Duplicate labels are themselves a source defect, but the guard's diagnosis
    // must not depend on the source being clean.)
    const counts = (labels: string[]): Map<string, number> => {
      const m = new Map<string, number>();
      for (const l of labels) m.set(l, (m.get(l) ?? 0) + 1);
      return m;
    };
    const describe = (label: string, n: number): string =>
      n > 1 ? `(${label})= ×${n}` : `(${label})=`;

    const sourceCounts = counts(sourceLabels);
    const outputCounts = counts(outputLabels);
    const missing: string[] = [];
    const invented: string[] = [];
    for (const [label, n] of sourceCounts) {
      const d = n - (outputCounts.get(label) ?? 0);
      if (d > 0) missing.push(describe(label, d));
    }
    for (const [label, n] of outputCounts) {
      const d = n - (sourceCounts.get(label) ?? 0);
      if (d > 0) invented.push(describe(label, d));
    }

    const parts: string[] = [];
    if (missing.length > 0) {
      parts.push(`missing from output: ${missing.join(', ')}`);
    }
    if (invented.length > 0) {
      parts.push(`not in source: ${invented.join(', ')}`);
    }
    if (parts.length === 0) {
      // Multisets genuinely match, so the only divergence left is ordering.
      parts.push(
        `same labels, different order — source: ${sourceLabels.join(', ')}; ` +
          `output: ${outputLabels.join(', ')}`
      );
    }
    violations.push({
      message: `target anchors diverge — ${parts.join('; ')}`,
    });
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Format a parity failure for an Error message / log line: one bullet per
 * violation, prefixed so downstream log-grepping can find the class.
 */
export function formatParityViolations(filename: string, result: ParityResult): string {
  const bullets = result.violations.map((v) => `  - ${v.message}`).join('\n');
  return `structural parity check failed for ${filename}:\n${bullets}`;
}

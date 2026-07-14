/**
 * Deterministic typography post-processing for translated MyST Markdown.
 *
 * Some language rules are stated in the translation prompt and the model
 * reliably ignores them anyway. French non-breaking spaces before high
 * punctuation are the measured case: a real `python_by_example.md` translation
 * came back with 0 × U+00A0, 0 × U+202F and 16 regular spaces before `; : ! ?`,
 * despite the rule sitting in `language-config.ts`. Escalating the prompt is the
 * wrong tool — this is a pure text transform with an exact specification, so we
 * apply it deterministically and stop asking the model.
 *
 * The hard part is NOT the substitution, it is knowing where prose ends. Code
 * (`a ? b : c`), math (`$\{x : x > 0\}$`), YAML frontmatter (`key: value`),
 * MyST anchors (`(sec:intro)=`) and URLs (`https://`) all contain the same
 * characters and must never be touched. Two independent defences:
 *
 *   1. classify every line as prose-eligible or not, then mask inline
 *      constructs within the eligible ones, and
 *   2. only substitute where the mark is followed by whitespace or end-of-line,
 *      which alone rules out `sec:intro`, `14:30` and `![alt](x)`.
 *
 * Line classification is a stateful walk rather than a regex, because fences
 * nest: a ```{code-cell} inside a ```` ```{note} ```` is code inside prose, and no
 * single regex gets that right.
 *
 * Unknown directives are treated as CODE. Missing a non-breaking space is
 * cosmetic; corrupting a code cell is a real bug, so the conservative default
 * is to leave things alone.
 */

/**
 * U+00A0. French typography also admits U+202F (narrow) before ; ! ?, but
 * U+00A0 renders reliably in both HTML and PDF and matches the wording of the
 * prompt rule in language-config.ts. Kept as one constant so a native reviewer
 * can change the convention in one place.
 */
const NBSP = '\u00A0';

/** Any existing non-breaking space counts as already-correct. */
const EXISTING_NBSP = /[\u00A0\u202F]/;

/**
 * MyST directives whose body is prose to be typeset, not code. Anything not
 * listed here is treated as code and left untouched.
 */
const PROSE_DIRECTIVES = new Set([
  'admonition', 'attention', 'caution', 'danger', 'error', 'hint', 'important',
  'note', 'seealso', 'tip', 'warning',
  'exercise', 'exercise-start', 'exercise-end',
  'solution', 'solution-start', 'solution-end',
  'epigraph', 'margin', 'sidebar', 'topic', 'card', 'grid-item-card',
  'proof', 'theorem', 'lemma', 'corollary', 'definition', 'remark', 'conjecture',
]);

const FENCE_OPEN = /^(\s{0,3})(`{3,}|~{3,}|:{3,})\s*(?:\{([\w:-]+)\})?/;
const DIRECTIVE_OPTION = /^\s*:[a-zA-Z][\w-]*:/;
/**
 * Display-math delimiters are counted, not matched whole-line. A block may open
 * with content on the same line:
 *
 *     $$ \mathbb E \max\{ S_n - K, 0 \}
 *         \approx ...
 *         $$
 *
 * Matching only a bare `$$` line misses that opener and then reads the closer as
 * an opener, leaving the parser convinced the rest of the file is math — which
 * silently suppressed every substitution after it in scipy.md.
 */
const MATH_DELIM = /\$\$/g;

interface Fence {
  marker: string;
  prose: boolean;
}

/** Decide, line by line, which lines may carry prose typography. */
function classifyLines(lines: string[]): boolean[] {
  const eligible: boolean[] = new Array(lines.length).fill(false);
  const stack: Fence[] = [];
  let inFrontmatter = false;
  let inMathBlock = false;
  let awaitingOptions = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Leading YAML frontmatter — includes the translation heading map.
    if (i === 0 && line.trim() === '---') { inFrontmatter = true; continue; }
    if (inFrontmatter) {
      if (line.trim() === '---') inFrontmatter = false;
      continue;
    }

    const top = stack[stack.length - 1];
    const open = FENCE_OPEN.exec(line);

    // Inside a code fence, look only for its closer. This must come before the
    // math check: a `$$` inside a code cell is code, and toggling math state on
    // it would desync everything downstream.
    if (top && !top.prose) {
      if (open) {
        const [, , marker, directive] = open;
        if (!directive && marker[0] === top.marker[0] && marker.length >= top.marker.length) stack.pop();
      }
      continue;
    }

    // Display math. Toggle once per delimiter, so a block that opens with
    // content on the same line is tracked correctly and a self-contained
    // `$$ x $$` nets out to no state change. A line carrying any delimiter is
    // math, never prose.
    const delimiters = (line.match(MATH_DELIM) || []).length;
    if (inMathBlock || delimiters > 0) {
      if (delimiters % 2 === 1) inMathBlock = !inMathBlock;
      continue;
    }

    if (open) {
      const [, , marker, directive] = open;
      // A closing fence uses the same character, at least as long, and carries
      // no directive name.
      if (top && !directive && marker[0] === top.marker[0] && marker.length >= top.marker.length) {
        stack.pop();
        continue;
      }
      const prose = Boolean(directive) && PROSE_DIRECTIVES.has(directive.toLowerCase());
      stack.push({ marker, prose });
      awaitingOptions = prose;
      continue;
    }

    if (!top) { eligible[i] = true; continue; }

    // Directive options (`:name: fig-one`) sit directly under the opener.
    if (awaitingOptions) {
      if (DIRECTIVE_OPTION.test(line)) continue;
      if (line.trim() === '') continue;
      awaitingOptions = false;
    }
    eligible[i] = true;
  }

  return eligible;
}

/** Inline constructs that must survive untouched inside an otherwise-prose line. */
const INLINE_PROTECTED: RegExp[] = [
  /\$[^$\n]+\$/g, // inline math
  /`[^`\n]+`/g, // inline code — also covers MyST roles: {doc}`intro <sec:intro>`
  /!?\[[^\]]*\]\([^)]*\)/g, // links and images, including the URL
  /<[^>\n]+>/g, // HTML tags and autolinks
  /&(?:[a-zA-Z]+\d*|#\d+|#x[0-9a-fA-F]+);/g, // HTML entities — &nbsp; ends in ;
  /https?:\/\/\S+/g, // bare URLs
];

const PLACEHOLDER = '\u0000';

/**
 * French: a non-breaking space before ; : ! ?
 *
 * Applied only where the mark is followed by whitespace, end-of-line, or a
 * closing delimiter — i.e. terminal punctuation in prose, rather than a
 * separator inside an identifier, ratio or time.
 */
function applyFrenchSpacing(text: string): string {
  return text.replace(
    /(\S)([ \t]*)([;:!?])(?=[\s)\]»"'.,]|$)/g,
    (match, before: string, gap: string, punct: string) => {
      if (EXISTING_NBSP.test(before)) return match; // already correct
      if (before === '\\') return match; // escaped
      if (before === punct) return match; // ?? !! :: — space the first only
      if (gap.length === 0 && /\d/.test(before) && punct === ':') return match; // 14:30
      return `${before}${NBSP}${punct}`;
    }
  );
}

function applyToProse(line: string, rule: (text: string) => string): string {
  const chunks: string[] = [];
  let masked = line;
  for (const pattern of INLINE_PROTECTED) {
    masked = masked.replace(pattern, (m) => {
      chunks.push(m);
      return `${PLACEHOLDER}${chunks.length - 1}${PLACEHOLDER}`;
    });
  }
  // MyST anchors — a whole-line construct: (sec:intro)=
  if (/^\s*\([^)\n]*\)=\s*$/.test(masked)) return line;

  let out = rule(masked);
  for (let i = 0; i < INLINE_PROTECTED.length + 1; i++) {
    const next = out.replace(
      new RegExp(`${PLACEHOLDER}(\\d+)${PLACEHOLDER}`, 'g'),
      (_, idx) => chunks[Number(idx)] ?? ''
    );
    if (next === out) break;
    out = next;
  }
  return out;
}

const RULES: Record<string, (text: string) => string> = {
  fr: applyFrenchSpacing,
};

/**
 * Apply deterministic typography rules for `language` to translated MyST
 * content. A no-op for languages with no rules, and idempotent — running it
 * twice produces the same result, so it is safe on already-processed files.
 */
export function applyTypography(content: string, language: string): string {
  const rule = RULES[language];
  if (!rule) return content;

  const lines = content.split('\n');
  const eligible = classifyLines(lines);
  return lines.map((line, i) => (eligible[i] ? applyToProse(line, rule) : line)).join('\n');
}

/** Languages with a deterministic typography pass. */
export function hasTypographyRules(language: string): boolean {
  return language in RULES;
}

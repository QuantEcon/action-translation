/**
 * Shared helpers for the thinking-on-Sonnet-5 experiment.
 *
 * Faithfulness: the translate + review prompts below are copied verbatim from
 * production (src/translator.ts `translateFullDocument` and src/reviewer.ts
 * `evaluateTranslation`) so we measure the real path, and the language rules are
 * imported from the compiled `dist/` so the zh/fr specifics are the real ones.
 * If you change those prompts or language-config.ts, re-sync here.
 *
 * Prerequisite: run `npm run build:cli` first (this imports from dist/).
 *
 * max_tokens is pinned here as an experiment control (identical across variants)
 * so the only differences are model + thinking, not budget.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { getLanguageConfig, languageLabel } from '../../../dist/language-config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../../..');
export const SOURCE_DIR = path.resolve(
  process.env.SOURCE_DIR || path.join(process.env.HOME, 'work/quantecon/lecture-python-intro'),
);
export const DOCS_FOLDER = process.env.DOCS_FOLDER || 'lectures';

// --- Experiment controls -----------------------------------------------------

// Pinned budgets (match production MAX_TOKENS; held constant across variants).
export const MAX_TOKENS_FULL = 64000;   // whole-file translation (streamed)
export const MAX_TOKENS_REVIEW = 8192;  // Opus judge (streamed)

export const TRANSLATOR_MODELS = { sonnet5: 'claude-sonnet-5', sonnet46: 'claude-sonnet-4-6' };
export const REVIEW_MODEL = 'claude-opus-4-8'; // independent judge (different family than translator)

// Thinking variants. `thinking`/`effort` are passed straight to the SDK; because
// these are .mjs there is no TS type friction on the params.
export const VARIANTS = {
  A: { id: 'A', label: 'sonnet5-off',              model: TRANSLATOR_MODELS.sonnet5,  thinking: { type: 'disabled' } },
  B: { id: 'B', label: 'sonnet5-adaptive-medium',  model: TRANSLATOR_MODELS.sonnet5,  thinking: { type: 'adaptive' }, effort: 'medium' },
  C: { id: 'C', label: 'sonnet5-adaptive-high',    model: TRANSLATOR_MODELS.sonnet5,  thinking: { type: 'adaptive' }, effort: 'high' },
  D: { id: 'D', label: 'sonnet46-off',             model: TRANSLATOR_MODELS.sonnet46, thinking: { type: 'disabled' } },
  E: { id: 'E', label: 'sonnet46-adaptive',        model: TRANSLATOR_MODELS.sonnet46, thinking: { type: 'adaptive' }, effort: 'high' },
};
export const CORE_VARIANTS = ['A', 'B', 'C', 'D'];

export const DEFAULT_LANGS = ['zh-cn', 'fr'];
export const DEFAULT_LECTURES = [
  'pv.md', 'geom_series.md', 'inflation_history.md',
  'lln_clt.md', 'cons_smooth.md', 'networks.md',
];

// Standard per-M-token pricing (USD). Sonnet 5 intro rate ($2/$10 through
// 2026-08-31) is ~13% lower; we report standard for durable numbers.
export const PRICING = {
  'claude-sonnet-5':   { in: 3, out: 15 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-opus-4-8':   { in: 5, out: 25 },
};
export function costUSD(model, usage) {
  const p = PRICING[model] || { in: 0, out: 0 };
  return ((usage?.input_tokens ?? 0) / 1e6) * p.in + ((usage?.output_tokens ?? 0) / 1e6) * p.out;
}

// --- Glossary (replicated from src/translator.ts formatGlossary) -------------

export function loadGlossary(lang) {
  const p = path.join(ROOT, 'glossary', `${lang}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : null;
}
export function formatGlossary(glossary, lang) {
  if (!glossary?.terms?.length) return '';
  const terms = glossary.terms
    .map((t) => {
      const context = t.context ? ` (${t.context})` : '';
      return `  - "${t.en}" → "${t[lang]}"${context}`;
    })
    .join('\n');
  return `GLOSSARY:\n${terms}\n`;
}

// --- Prompts (verbatim from production) --------------------------------------

const INCOMPLETE_DOCUMENT_MARKER = '-----> INCOMPLETE DOCUMENT <------';

/** Copied from src/translator.ts translateFullDocument. sourceLanguage defaults to 'en' (init). */
export function buildTranslatePrompt(content, targetLanguage, glossary, sourceLanguage = 'en') {
  const cfg = getLanguageConfig(targetLanguage);
  const additionalRules = cfg.additionalRules.length
    ? cfg.additionalRules.map((rule, i) => `${8 + i}. ${rule}`).join('\n')
    : '';
  const glossarySection = glossary ? formatGlossary(glossary, targetLanguage) : '';

  return `You are translating a complete technical lecture from ${sourceLanguage} to ${targetLanguage}.

RULES:
1. Translate all prose content
2. Preserve all MyST Markdown directives and structure exactly
3. DO NOT translate code blocks (keep code as-is)
4. DO NOT translate mathematical equations (keep LaTeX as-is)
5. DO NOT translate URLs, file paths, or technical identifiers
6. Use the provided glossary for consistent terminology
7. Maintain the exact same heading structure and anchors
8. MARKDOWN SYNTAX: Ensure proper markdown syntax in your output:
   - Headings MUST have a space after # (e.g., "## Title" not "##Title")
   - Code blocks must have matching \`\`\` delimiters
   - Math blocks must have matching $$ delimiters
   - CRITICAL: Do NOT mix fence markers - use $$...$$ for math OR \`\`\`{math}...\`\`\` for directive math, but NEVER $$...\`\`\` or \`\`\`...$$
9. DIRECTIVE BLOCKS: MyST directive blocks MUST be balanced:
   - Every \`\`\`{exercise-start} MUST have matching \`\`\`{exercise-end}
   - Every \`\`\`{solution-start} MUST have matching \`\`\`{solution-end}
   - Every \`\`\`{code-cell} MUST have closing \`\`\`
${additionalRules}
${glossarySection}

IMPORTANT: You MUST translate the ENTIRE document. Do not stop mid-sentence or mid-code.
If you are approaching token limits and cannot complete the translation, print:
"${INCOMPLETE_DOCUMENT_MARKER}"

CONTENT:
${content}

Provide the complete translated document maintaining exact MyST structure.`;
}

/** Review rubric adapted from src/reviewer.ts evaluateTranslation (fresh-translate: no diff score). */
export function buildReviewPrompt(sourceContent, translationContent, lang, glossary) {
  const langName = languageLabel(lang);
  const glossarySection = glossary ? formatGlossary(glossary, lang) : '';
  return `You are an expert reviewer evaluating a ${langName} translation of an English quantitative-economics lecture. Be a rigorous, calibrated judge.

Reference glossary (the translation should follow this terminology):
${glossarySection}

## English Source
${sourceContent}

## ${langName} Translation
${translationContent}

## Evaluation Criteria
Rate each criterion from 1-10:
1. Accuracy: does the translation convey the source meaning? Technical terms correct, nothing missing/added, math concepts preserved.
2. Fluency: does it read naturally in ${langName}? Natural structure, academic register, no awkward phrasing.
3. Terminology: is technical terminology consistent and correct, following the reference glossary?
4. Formatting: is MyST/Markdown formatting preserved? LaTeX math intact, code blocks preserved, headings/lists/structure maintained, links correct.
5. Syntax: list any markdown/MyST syntax errors (unbalanced fences, headings missing space after #, mismatched $$; MyST directive errors). These are critical.

## Response Format
Respond with ONLY valid JSON (no markdown code fences):
{
  "accuracy": <1-10>,
  "fluency": <1-10>,
  "terminology": <1-10>,
  "formatting": <1-10>,
  "syntaxErrors": ["error with location", "..."],
  "issues": ["issue with location + suggestion", "..."],
  "strengths": ["strength", "..."],
  "summary": "one-paragraph assessment"
}
"syntaxErrors" is [] if none found.`;
}

// --- French typography objective check (PLAN §6) -----------------------------

/** Rough adherence signal for fr: guillemets used, and NBSP before high punctuation. */
export function frTypographyStats(text) {
  const guillemets = (text.match(/[«»]/g) || []).length;
  const straightQuotedRuns = (text.match(/"[^"\n]{2,}"/g) || []).length; // should trend to 0 in fr
  // high punctuation ; : ! ? that should be preceded by a non-breaking space (  or  )
  const highPunct = text.match(/\S[   ]?[;:!?]/g) || [];
  const withNbsp = highPunct.filter((m) => /[  ][;:!?]$/.test(m)).length;
  return {
    guillemets,
    straightQuotedRuns,
    highPunctTotal: highPunct.length,
    highPunctWithNbsp: withNbsp,
    nbspAdherence: highPunct.length ? +(withNbsp / highPunct.length).toFixed(3) : null,
  };
}

// --- SDK call ----------------------------------------------------------------

/** One streamed call; extracts text blocks only (a thinking block lands first when thinking is on). */
export async function callClaude(client, { model, thinking, effort, maxTokens, prompt }) {
  const params = { model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] };
  if (thinking) params.thinking = thinking;
  if (effort) params.output_config = { effort };

  const start = Date.now();
  const stream = client.messages.stream(params);
  const msg = await stream.finalMessage();
  const elapsed = +((Date.now() - start) / 1000).toFixed(1);

  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { text, usage: msg.usage, elapsed, stopReason: msg.stop_reason, model: msg.model };
}

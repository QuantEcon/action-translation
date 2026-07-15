/**
 * Shared helpers for glossary review of a new lecture series.
 *
 * See .claude/skills/glossary-review/SKILL.md for the workflow these back.
 *
 * FAITHFULNESS: buildTranslatePrompt below is copied VERBATIM from production
 * (src/translator.ts `translateFullDocument`, which builds it inline and does not
 * export it). Language rules come from the compiled dist/ so they are the real
 * ones. If you change that prompt or language-config.ts, RE-SYNC HERE — otherwise
 * you will be pinning glossary terms based on a prompt production no longer uses.
 *
 * Prerequisite: `npm run build:cli` (this imports from dist/).
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { getLanguageConfig, languageLabel } from '../../dist/language-config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..');

export { languageLabel };

/** Just the name — languageLabel() already appends "(code)", so it double-prints in logs. */
export const langName = (lang) => getLanguageConfig(lang).name;

/** Repo-relative path, but fall back to absolute when the target is outside the repo. */
export function rel(p) {
  const r = path.relative(ROOT, p);
  return r.startsWith('..') ? p : r;
}

// --- Model roles -------------------------------------------------------------
//
// The two-model comparison is NOT a bake-off. It is the entire candidate-finding
// signal, and cutting it to save cost silently breaks the method:
//
//   seed  — the model that will actually do the bulk translation (Opus 4.8, per
//           .dev/decisions/D-2026-07-14-opus-for-bulk-seed.md).
//   probe — a DIFFERENT-family model, run only to disagree with the seed.
//
// Why a probe is needed: on the fr programming run, the seed model showed ZERO
// cross-lecture drift across 5 lectures. Drift alone would have produced zero
// candidates. All 11 candidates came from seed↔probe disagreement. A term both
// models render identically everywhere needs no glossary entry — they already
// agree, and every pinned term costs input tokens in every prompt forever.
export const SEED_MODEL = 'claude-opus-4-8';
export const PROBE_MODEL = 'claude-sonnet-5';
export const EXTRACT_MODEL = 'claude-opus-4-8'; // term extraction from an EN↔target pair
export const ROLES = ['seed', 'probe'];

export const MAX_TOKENS_FULL = 64000; // matches production MAX_TOKENS.fullDocument
export const MAX_TOKENS_EXTRACT = 8192;

// Standard per-M-token pricing (USD).
export const PRICING = {
  'claude-sonnet-5': { in: 3, out: 15 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-opus-4-7': { in: 5, out: 25 },
};
export function costUSD(model, usage) {
  const p = PRICING[model] || { in: 0, out: 0 };
  return ((usage?.input_tokens ?? 0) / 1e6) * p.in + ((usage?.output_tokens ?? 0) / 1e6) * p.out;
}

// --- CLI arg helpers ---------------------------------------------------------

export function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def;
}
export const hasFlag = (name) => process.argv.includes(`--${name}`);
export const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : null);

/** Resolve the English corpus. --source wins, then $SOURCE_DIR. No silent default. */
export function resolveSourceDir(required = true) {
  const v = arg('source', process.env.SOURCE_DIR);
  if (!v) {
    if (!required) return '';
    console.error('No English corpus. Pass --source <path> or set SOURCE_DIR.');
    process.exit(1);
  }
  const p = path.resolve(v);
  if (!fs.existsSync(p)) { console.error(`Corpus not found: ${p}`); process.exit(1); }
  return p;
}
export const docsFolder = () => arg('docs-folder', process.env.DOCS_FOLDER || 'lectures');

export function requireApiKey() {
  if (!process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY not set'); process.exit(1); }
}

// --- Glossary (replicated from src/translator.ts formatGlossary) -------------

export function glossaryPath(lang) {
  return path.join(ROOT, 'glossary', `${lang}.json`);
}
export function loadGlossary(lang) {
  const p = glossaryPath(lang);
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

// --- Prompt (VERBATIM from src/translator.ts translateFullDocument) ----------

const INCOMPLETE_DOCUMENT_MARKER = '-----> INCOMPLETE DOCUMENT <------';

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

// --- SDK call ----------------------------------------------------------------

/** One streamed call; extracts text blocks only (a thinking block lands first if thinking is on). */
export async function callClaude(client, { model, maxTokens, prompt, thinking }) {
  const params = { model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] };
  if (thinking) params.thinking = thinking;
  const start = Date.now();
  const msg = await client.messages.stream(params).finalMessage();
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { text, usage: msg.usage, elapsed: +((Date.now() - start) / 1000).toFixed(1), stopReason: msg.stop_reason };
}

export const parseJsonResponse = (t) => {
  const c = t.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  const s = c.indexOf('{'), e = c.lastIndexOf('}');
  if (s < 0) throw new Error('no JSON in response');
  return JSON.parse(c.slice(s, e + 1));
};

#!/usr/bin/env node
/**
 * Apply the deterministic typography rules to an ALREADY-translated repo.
 *
 * `translate init` now applies typography as part of translation, so fresh
 * seeds need nothing. This is the repair path, for two cases:
 *   - a repo seeded before the rule existed (the fr programming seed), and
 *   - a typography rule that changes later and must be back-applied.
 *
 * It typesets the body AND the `translation.headings` / `translation.title`
 * values in frontmatter. Both matter: init derives the heading map from the
 * already-typeset text, so a repair that fixed only the body would leave the map
 * describing headings that no longer match it.
 *
 * The transform is idempotent and only ever changes whitespace before the
 * target language's high punctuation, so re-running it is safe.
 *
 * Prereq: `npm run build:cli`.
 *
 * Usage:
 *   node scripts/typography/apply.mjs --repo ~/work/quantecon/lecture-python-programming.fr --lang fr
 *   node scripts/typography/apply.mjs --repo <path> --lang fr --dry-run
 *
 * Flags: --repo --lang --docs-folder --dry-run
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { applyTypography, hasTypographyRules } from '../../dist/typography.js';
import { extractHeadingMap, extractTranslationTitle, injectHeadingMap } from '../../dist/heading-map.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(`--${n}`);

const repo = arg('repo') ? path.resolve(arg('repo')) : null;
const lang = arg('lang');
const folder = arg('docs-folder', 'lectures');
const dryRun = has('dry-run');

if (!repo || !lang) { console.error('Usage: --repo <path> --lang <code> [--docs-folder lectures] [--dry-run]'); process.exit(1); }
if (!fs.existsSync(repo)) { console.error(`Repo not found: ${repo}`); process.exit(1); }
if (!hasTypographyRules(lang)) { console.error(`No typography rules for '${lang}' — nothing to do.`); process.exit(1); }

const dir = path.join(repo, folder);
if (!fs.existsSync(dir)) { console.error(`No ${folder}/ in ${repo}`); process.exit(1); }

/**
 * Prove we only ever touched spacing before high punctuation.
 *
 * `\\_` is js-yaml's escape for U+00A0 in a double-quoted scalar, so a typeset
 * heading map serialises as "\u2026LLM\\_?". That parses straight back to a
 * non-breaking space (verified against extractHeadingMap), so for comparison it
 * counts as one \u2014 otherwise this check would flag every file whose frontmatter
 * it had correctly updated.
 */
const normalize = (s) => s.replace(/\\_/g, ' ').replace(/[ \u00A0\u202F\t]*([;:!?])/g, '$1');

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
const stripFrontmatter = (s) => { const m = s.match(FRONTMATTER); return m ? s.slice(m[0].length) : s; };
const parseFrontmatter = (s) => {
  const m = s.match(FRONTMATTER);
  if (!m) return null;
  try { return yaml.load(m[1]); } catch { return undefined; } // undefined ≠ null → mismatch → fails loudly
};

/** Deep equality over parsed YAML, with every string normalized. */
function deepEqualNormalized(a, b) {
  if (typeof a === 'string' && typeof b === 'string') return normalize(a) === normalize(b);
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => kb.includes(k) && deepEqualNormalized(a[k], b[k]));
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
console.log(`${dryRun ? 'DRY RUN — ' : ''}typography (${lang}) over ${files.length} file(s) in ${path.relative(ROOT, dir) || dir}\n`);

let changed = 0, failed = 0;
for (const f of files) {
  const p = path.join(dir, f);
  const src = fs.readFileSync(p, 'utf-8');

  // 1. Body (frontmatter is skipped by applyTypography).
  let out = applyTypography(src, lang);

  // 2. Frontmatter heading map + title, so they match the body they describe.
  const map = extractHeadingMap(src);
  const title = extractTranslationTitle(src);
  if (map.size > 0 || title) {
    const typesetMap = new Map([...map].map(([en, target]) => [en, applyTypography(target, lang)]));
    const typesetTitle = title ? applyTypography(title, lang) : undefined;
    out = injectHeadingMap(out, typesetMap, typesetTitle);
  }

  // 3. Safety net: nothing but spacing before high punctuation may differ.
  //
  // Body and frontmatter are checked differently on purpose. The body is
  // compared as text, because that is where corruption would actually hurt.
  // Frontmatter is compared as PARSED YAML, because re-serialising it
  // legitimately changes quoting (js-yaml quotes a scalar once it contains a
  // non-breaking space) — a textual diff there is noise, not a defect.
  if (normalize(stripFrontmatter(src)) !== normalize(stripFrontmatter(out))) {
    console.error(`  ✗ ${f} — body changed beyond spacing; NOT written`);
    failed++;
    continue;
  }
  if (!deepEqualNormalized(parseFrontmatter(src), parseFrontmatter(out))) {
    console.error(`  ✗ ${f} — frontmatter changed beyond spacing; NOT written`);
    failed++;
    continue;
  }
  if (applyTypography(out, lang) !== out) {
    console.error(`  ✗ ${f} — not idempotent; NOT written`);
    failed++;
    continue;
  }

  if (out === src) { console.log(`  · ${f} — already correct`); continue; }
  const added = (out.match(/\u00A0/g) || []).length - (src.match(/\u00A0/g) || []).length;
  console.log(`  ✓ ${f} — ${added} non-breaking space(s)`);
  if (!dryRun) fs.writeFileSync(p, out, 'utf-8');
  changed++;
}

console.log(`\n${dryRun ? 'Would change' : 'Changed'}: ${changed}/${files.length}${failed ? ` · FAILED: ${failed}` : ''}`);
if (failed) process.exit(1);

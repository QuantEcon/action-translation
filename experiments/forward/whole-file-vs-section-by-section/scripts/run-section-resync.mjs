#!/usr/bin/env node
/**
 * Section-by-section RESYNC experiment — replicates the forward pipeline.
 *
 * Steps (same as src/cli/commands/forward.ts):
 *   1. Parse SOURCE + TARGET into document components
 *   2. Match sections by position
 *   3. RESYNC each matched section individually via Claude
 *   4. Reconstruct the full document from translated sections
 *
 * Includes the zh-cn glossary (357 terms) in each per-section prompt.
 *
 * Usage:
 *   node experiments/forward/whole-file-vs-section-by-section/scripts/run-section-resync.mjs pv.md
 *
 * Environment:
 *   ANTHROPIC_API_KEY  — required
 *   SOURCE_DIR         — defaults to ~/work/quantecon/lecture-python-intro
 *   TARGET_DIR         — defaults to ~/work/quantecon/lecture-intro.zh-cn
 *   DOCS_FOLDER        — defaults to "lectures"
 */

import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';

const SOURCE = path.resolve(process.env.SOURCE_DIR || path.join(process.env.HOME, 'work/quantecon/lecture-python-intro'));
const TARGET = path.resolve(process.env.TARGET_DIR || path.join(process.env.HOME, 'work/quantecon/lecture-intro.zh-cn'));
const DOCS_FOLDER = process.env.DOCS_FOLDER || 'lectures';
const MODEL = 'claude-sonnet-4-6';

// Glossary path — look in the action-translation repo root
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const GLOSSARY_PATH = path.resolve(SCRIPT_DIR, '../../../../glossary/zh-cn.json');

// ─── Glossary ─────────────────────────────────────────────────────────────
function loadGlossary() {
  const raw = fs.readFileSync(GLOSSARY_PATH, 'utf-8');
  const glossary = JSON.parse(raw);
  if (!glossary.terms || glossary.terms.length === 0) return '';
  const terms = glossary.terms
    .map(t => {
      const zh = t['zh-cn'];
      const ctx = t.context ? ` (${t.context})` : '';
      return `  - "${t.en}" → "${zh}"${ctx}`;
    })
    .join('\n');
  return `GLOSSARY:\n${terms}\n`;
}

// ─── Parser (reimplemented from src/parser.ts) ───────────────────────────
function parseSections(content) {
  const lines = content.split('\n');
  let contentStartIndex = 0;

  // Frontmatter
  let frontmatter = '';
  if (lines[0] === '---') {
    const endIndex = lines.slice(1).findIndex(l => l === '---');
    if (endIndex !== -1) {
      frontmatter = lines.slice(0, endIndex + 2).join('\n');
      contentStartIndex = endIndex + 2;
    }
  }

  // Title (# heading)
  let title = '';
  let titleText = '';
  let titleEnd = contentStartIndex;
  while (titleEnd < lines.length && lines[titleEnd].trim() === '') titleEnd++;
  if (titleEnd < lines.length) {
    const m = lines[titleEnd].match(/^#\s+(.+)$/);
    if (m) {
      title = lines[titleEnd];
      titleText = m[1];
      titleEnd++;
    }
  }

  // Intro (content between title and first ##)
  let intro = '';
  const firstSectionIdx = lines.slice(titleEnd).findIndex(l => l.match(/^##\s+/));
  if (firstSectionIdx > 0) {
    intro = lines.slice(titleEnd, titleEnd + firstSectionIdx).join('\n').trim();
    contentStartIndex = titleEnd + firstSectionIdx;
  } else if (firstSectionIdx === 0) {
    contentStartIndex = titleEnd;
  } else {
    // No ## sections
    intro = lines.slice(titleEnd).join('\n').trim();
    contentStartIndex = lines.length;
  }

  // Sections — simple: split at ## headings (flat, no subsection nesting needed for this experiment)
  const sections = [];
  let current = null;

  for (let i = contentStartIndex; i < lines.length; i++) {
    const headingMatch = lines[i].match(/^(#{2,6})\s+(.+)$/);
    if (headingMatch && headingMatch[1].length === 2) {
      // New ## section — save previous
      if (current) {
        current.content = current.content.trimEnd();
        sections.push(current);
      }
      current = {
        heading: lines[i],
        level: 2,
        content: lines[i] + '\n',
      };
    } else if (current) {
      current.content += lines[i] + '\n';
    }
  }
  if (current) {
    current.content = current.content.trimEnd();
    sections.push(current);
  }

  return { frontmatter, title, titleText, intro, sections };
}

// ─── Section matcher (by position) ────────────────────────────────────────
function matchSections(sourceSections, targetSections) {
  const pairs = [];
  const maxLen = Math.max(sourceSections.length, targetSections.length);
  for (let i = 0; i < maxLen; i++) {
    const source = i < sourceSections.length ? sourceSections[i] : null;
    const target = i < targetSections.length ? targetSections[i] : null;
    if (source && target) {
      pairs.push({ status: 'MATCHED', source, target });
    } else if (source) {
      pairs.push({ status: 'SOURCE_ONLY', source, target: null });
    } else {
      pairs.push({ status: 'TARGET_ONLY', source: null, target });
    }
  }
  return pairs;
}

// ─── RESYNC prompt (same as src/translator.ts translateSectionResync) ─────
function buildResyncPrompt(sourceSection, targetSection, glossarySection) {
  return `You are resyncing a Chinese (zh-cn) translation to match the current English source.

TASK: The English source may have changed since the translation was made. Update the Chinese (zh-cn) translation to accurately reflect the current source content.

CRITICAL RULES:
1. Preserve the existing Chinese (zh-cn) translation style, terminology choices, and localization decisions wherever the meaning hasn't changed
2. Only modify parts of the translation where the English source has different content
3. Preserve all MyST Markdown formatting, code blocks, math equations, and directives
4. DO NOT translate code, math, URLs, or technical identifiers
5. Use the glossary for consistent terminology
6. MARKDOWN SYNTAX: Ensure proper markdown syntax:
   - Headings MUST have a space after # (e.g., "## Title" not "##Title")
   - Code blocks must have matching \`\`\` delimiters
   - Math blocks must have matching $$ delimiters
   - CRITICAL: Do NOT mix fence markers - use $$...$$ for math OR \`\`\`{math}...\`\`\` for directive math, but NEVER $$...\`\`\` or \`\`\`...$$
7. Return ONLY the updated Chinese (zh-cn) section, no explanations

${glossarySection}

[CURRENT English SOURCE]
${sourceSection}
[/CURRENT English SOURCE]

[EXISTING Chinese (zh-cn) TRANSLATION]
${targetSection}
[/EXISTING Chinese (zh-cn) TRANSLATION]

Provide ONLY the resynced Chinese (zh-cn) translation. Preserve the existing translation's style and only change what's needed to match the current source. Do not include any markers, explanations, or comments.`;
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node run-section-resync.mjs <filename.md>');
    process.exit(1);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.error('ANTHROPIC_API_KEY not set'); process.exit(1); }

  const sourceFile = path.join(SOURCE, DOCS_FOLDER, file);
  const targetFile = path.join(TARGET, DOCS_FOLDER, file);
  if (!fs.existsSync(sourceFile)) { console.error(`Source not found: ${sourceFile}`); process.exit(1); }
  if (!fs.existsSync(targetFile)) { console.error(`Target not found: ${targetFile}`); process.exit(1); }

  const sourceContent = fs.readFileSync(sourceFile, 'utf-8');
  const targetContent = fs.readFileSync(targetFile, 'utf-8');
  const glossarySection = loadGlossary();

  // Parse
  const sourceParsed = parseSections(sourceContent);
  const targetParsed = parseSections(targetContent);
  const pairs = matchSections(sourceParsed.sections, targetParsed.sections);

  const matched = pairs.filter(p => p.status === 'MATCHED').length;
  const sourceOnly = pairs.filter(p => p.status === 'SOURCE_ONLY').length;
  const targetOnly = pairs.filter(p => p.status === 'TARGET_ONLY').length;

  console.log(`File:     ${file}`);
  console.log(`Source:   ${sourceParsed.sections.length} sections`);
  console.log(`Target:   ${targetParsed.sections.length} sections`);
  console.log(`Matched:  ${matched}  New: ${sourceOnly}  Removed: ${targetOnly}`);
  console.log(`Glossary: ${glossarySection ? glossarySection.split('\n').length - 2 : 0} terms`);
  console.log(`Model:    ${MODEL}`);
  console.log('');

  const client = new Anthropic({ apiKey });
  const startTime = Date.now();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const translatedSections = [];

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];

    if (pair.status === 'TARGET_ONLY') {
      console.log(`  [${i + 1}/${pairs.length}] REMOVED: ${pair.target.heading}`);
      translatedSections.push(null); // Will be excluded
      continue;
    }

    if (pair.status === 'SOURCE_ONLY') {
      // New section — translate fresh
      console.log(`  [${i + 1}/${pairs.length}] NEW: ${pair.source.heading}`);
      const prompt = `You are translating a section of a quantitative economics lecture from English to Chinese (zh-cn).

${glossarySection}

Translate the following section. Preserve all MyST Markdown formatting, code blocks, math equations, and directives exactly. DO NOT translate code, math, URLs, or technical identifiers.

[ENGLISH SECTION]
${pair.source.content}
[/ENGLISH SECTION]

Provide ONLY the translated Chinese (zh-cn) section. No explanations.`;

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 8192,
        messages: [{ role: 'user', content: prompt }],
      });

      totalInputTokens += response.usage?.input_tokens ?? 0;
      totalOutputTokens += response.usage?.output_tokens ?? 0;
      const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
      translatedSections.push(text);
      continue;
    }

    // MATCHED — RESYNC
    console.log(`  [${i + 1}/${pairs.length}] RESYNC: ${pair.source.heading}`);
    const prompt = buildResyncPrompt(pair.source.content, pair.target.content, glossarySection);

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    });

    totalInputTokens += response.usage?.input_tokens ?? 0;
    totalOutputTokens += response.usage?.output_tokens ?? 0;
    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    translatedSections.push(text);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // ─── Reconstruct document ────────────────────────────────────────────
  const parts = [];

  // Frontmatter (from TARGET — preserve)
  parts.push(targetParsed.frontmatter);
  parts.push('');

  // Title (from TARGET — preserve translated title)
  parts.push(targetParsed.title);

  // Intro (from TARGET — preserve)
  if (targetParsed.intro) {
    parts.push('');
    parts.push(targetParsed.intro);
  }

  // Sections
  for (let i = 0; i < pairs.length; i++) {
    if (translatedSections[i] !== null && translatedSections[i] !== undefined) {
      parts.push('');
      parts.push(translatedSections[i]);
    }
  }

  const output = parts.join('\n') + '\n';

  console.log(`\nDone in ${elapsed}s`);
  console.log(`Tokens: ${totalInputTokens.toLocaleString()} input + ${totalOutputTokens.toLocaleString()} output = ${(totalInputTokens + totalOutputTokens).toLocaleString()} total`);
  console.log(`API calls: ${pairs.filter(p => p.status !== 'TARGET_ONLY').length} sections`);

  const cost = (totalInputTokens * 3 + totalOutputTokens * 15) / 1_000_000;
  console.log(`Est. cost: $${cost.toFixed(3)}`);

  const baseName = file.replace('.md', '');
  const outputFile = `output/resync-${baseName}-section.md`;
  fs.mkdirSync('output', { recursive: true });
  fs.writeFileSync(outputFile, output, 'utf-8');
  console.log(`\nOutput: ${outputFile} (${output.length.toLocaleString()} chars, ${output.split('\n').length} lines)`);
}

main().catch(e => { console.error(e); process.exit(1); });

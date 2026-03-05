#!/usr/bin/env node
/**
 * Whole-file RESYNC experiment — with GLOSSARY context.
 *
 * Same as run-whole-file-resync.mjs but adds the zh-cn glossary (357 terms)
 * to the prompt for consistent terminology. This is the recommended approach.
 *
 * Usage:
 *   node experiments/forward/whole-file-vs-section-by-section/scripts/run-whole-file-resync-glossary.mjs pv.md
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
  return `GLOSSARY (use these translations for consistent terminology):\n${terms}\n`;
}

function buildPrompt(sourceContent, targetContent, glossarySection) {
  return `You are a professional translator specialising in quantitative economics.

You are given:
1. The **current English source** document (authoritative)
2. The **current Chinese (zh-cn) translation** (may be outdated or have errors)

Your task: produce an **updated Chinese (zh-cn) translation** that accurately reflects the current English source.

## Critical rules

1. **Preserve the existing translation's style, terminology, and localization choices** wherever the meaning hasn't changed. Do NOT re-translate sections that are already correct — keep them exactly as-is.
2. **Fix any errors** in the translation — missing content, incorrect formulas, wrong code, structural differences.
3. **Add any missing content** that exists in the source but not in the translation.
4. **Remove any content** that exists in the translation but not in the source (unless it's appropriate localization like Chinese font configuration or locale-specific links).
5. **Preserve all MyST Markdown syntax** exactly — directives, roles, code blocks, math blocks, cross-references, frontmatter.
6. **Preserve localization additions** that are appropriate for the target language:
   - Chinese font configuration in matplotlib (e.g., \`plt.rcParams['font.family']\`, SimHei, SourceHanSerifSC)
   - Locale-appropriate reference links
   - Full-width punctuation where conventionally used
7. **Preserve the frontmatter (YAML between --- markers) from the TARGET translation** — do not replace it with the source frontmatter. Only update the heading-map if section headings changed.
8. **Use the glossary below for consistent terminology** — when a term from the glossary appears, use the specified translation.

## ${glossarySection}

## Output format

Return ONLY the complete updated Chinese (zh-cn) document. No explanations, no commentary, no code fences wrapping the document. Start directly with the frontmatter \`---\` marker.

## Current English Source

${sourceContent}

## Current Chinese (zh-cn) Translation

${targetContent}`;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node run-whole-file-resync-glossary.mjs <filename.md>');
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

  const glossaryTermCount = glossarySection ? glossarySection.split('\n').length - 2 : 0;
  console.log(`File:     ${file}`);
  console.log(`Source:   ${sourceContent.length.toLocaleString()} chars`);
  console.log(`Target:   ${targetContent.length.toLocaleString()} chars`);
  console.log(`Glossary: ${glossaryTermCount} terms`);
  console.log(`Model:    ${MODEL}`);
  console.log(`\nSending whole-file RESYNC + glossary…\n`);

  const prompt = buildPrompt(sourceContent, targetContent, glossarySection);
  console.log(`Prompt:   ${prompt.length.toLocaleString()} chars`);

  const client = new Anthropic({ apiKey });
  const startTime = Date.now();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16384,
    messages: [{ role: 'user', content: prompt }],
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const resultText = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;

  console.log(`Done in ${elapsed}s`);
  console.log(`Tokens: ${inputTokens.toLocaleString()} input + ${outputTokens.toLocaleString()} output = ${(inputTokens + outputTokens).toLocaleString()} total`);
  console.log(`Stop reason: ${response.stop_reason}`);

  const cost = (inputTokens * 3 + outputTokens * 15) / 1_000_000;
  console.log(`Est. cost: $${cost.toFixed(3)}`);

  const baseName = file.replace('.md', '');
  const outputFile = `output/resync-${baseName}-whole-glossary.md`;
  fs.mkdirSync('output', { recursive: true });
  fs.writeFileSync(outputFile, resultText, 'utf-8');
  console.log(`\nOutput: ${outputFile} (${resultText.length.toLocaleString()} chars, ${resultText.split('\n').length} lines)`);
}

main().catch(e => { console.error(e); process.exit(1); });

#!/usr/bin/env node
/**
 * Whole-file RESYNC experiment — single file test (no glossary).
 * 
 * Sends current SOURCE + current TARGET to Claude with a whole-file RESYNC prompt.
 * Saves the complete translated output for review.
 *
 * Usage:
 *   node experiments/forward/whole-file-vs-section-by-section/scripts/run-whole-file-resync.mjs pv.md
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

function buildWholeFileResyncPrompt(sourceContent, targetContent, sourceLanguage, targetLanguage) {
  return `You are a professional translator specialising in quantitative economics.

You are given:
1. The **current English source** document (authoritative)
2. The **current ${targetLanguage} translation** (may be outdated or have errors)

Your task: produce an **updated ${targetLanguage} translation** that accurately reflects the current English source.

## Critical rules

1. **Preserve the existing translation's style, terminology, and localization choices** wherever the meaning hasn't changed. Do NOT re-translate sections that are already correct — keep them exactly as-is.
2. **Fix any errors** in the translation — missing content, incorrect formulas, wrong code, structural differences.
3. **Add any missing content** that exists in the source but not in the translation.
4. **Remove any content** that exists in the translation but not in the source (unless it's appropriate localization like Chinese font configuration or locale-specific links).
5. **Preserve all MyST Markdown syntax** exactly — directives, roles, code blocks, math blocks, cross-references, frontmatter.
6. **Preserve localization additions** that are appropriate for the target language:
   - Chinese font configuration in matplotlib (e.g., \`plt.rcParams['font.family']\`)
   - Locale-appropriate reference links (e.g., Baidu instead of Wikipedia)
   - Full-width punctuation where conventionally used
7. **Preserve the frontmatter (YAML between --- markers) from the TARGET translation** — do not replace it with the source frontmatter. Only update the heading-map if section headings changed.

## Output format

Return ONLY the complete updated ${targetLanguage} document. No explanations, no commentary, no code fences wrapping the document. Start directly with the frontmatter \`---\` marker.

## Current English Source

${sourceContent}

## Current ${targetLanguage} Translation

${targetContent}`;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node run-whole-file-resync.mjs <filename.md>');
    process.exit(1);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not set');
    process.exit(1);
  }

  const sourceFile = path.join(SOURCE, DOCS_FOLDER, file);
  const targetFile = path.join(TARGET, DOCS_FOLDER, file);

  if (!fs.existsSync(sourceFile)) { console.error(`Source not found: ${sourceFile}`); process.exit(1); }
  if (!fs.existsSync(targetFile)) { console.error(`Target not found: ${targetFile}`); process.exit(1); }

  const sourceContent = fs.readFileSync(sourceFile, 'utf-8');
  const targetContent = fs.readFileSync(targetFile, 'utf-8');

  console.log(`File:   ${file}`);
  console.log(`Source: ${sourceContent.length.toLocaleString()} chars`);
  console.log(`Target: ${targetContent.length.toLocaleString()} chars`);
  console.log(`Model:  ${MODEL}`);
  console.log(`\nSending whole-file RESYNC request…\n`);

  const prompt = buildWholeFileResyncPrompt(sourceContent, targetContent, 'English', 'Chinese (zh-cn)');

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

  // Estimate cost (Sonnet: $3/M input, $15/M output)
  const cost = (inputTokens * 3 + outputTokens * 15) / 1_000_000;
  console.log(`Est. cost: $${cost.toFixed(3)}`);

  // Save result
  const baseName = file.replace('.md', '');
  const outputFile = `output/resync-${baseName}-whole-file.md`;
  fs.mkdirSync('output', { recursive: true });
  fs.writeFileSync(outputFile, resultText, 'utf-8');
  console.log(`\nOutput saved: ${outputFile} (${resultText.length.toLocaleString()} chars)`);

  // Also save the original target for easy comparison
  const origFile = `output/resync-${baseName}-original.md`;
  fs.writeFileSync(origFile, targetContent, 'utf-8');
  console.log(`Original:    ${origFile}`);

  // Quick diff stats
  const sourceLines = sourceContent.split('\n').length;
  const targetLines = targetContent.split('\n').length;
  const resultLines = resultText.split('\n').length;
  console.log(`\nLine counts: source=${sourceLines}, original target=${targetLines}, resync result=${resultLines}`);
}

main().catch(e => { console.error(e); process.exit(1); });

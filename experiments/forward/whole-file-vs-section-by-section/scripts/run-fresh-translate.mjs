#!/usr/bin/env node
/**
 * Fresh translation experiment — translate English source from scratch.
 *
 * Baseline comparison: shows what happens when you translate without
 * seeing the existing translation at all. Used to measure how well
 * RESYNC preserves existing translation style/localization.
 *
 * Usage:
 *   node experiments/forward/whole-file-vs-section-by-section/scripts/run-fresh-translate.mjs pv.md
 *
 * Environment:
 *   ANTHROPIC_API_KEY  — required
 *   SOURCE_DIR         — defaults to ~/work/quantecon/lecture-python-intro
 *   DOCS_FOLDER        — defaults to "lectures"
 */

import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';

const SOURCE = path.resolve(process.env.SOURCE_DIR || path.join(process.env.HOME, 'work/quantecon/lecture-python-intro'));
const DOCS_FOLDER = process.env.DOCS_FOLDER || 'lectures';
const MODEL = 'claude-sonnet-4-6';

function buildFreshTranslatePrompt(sourceContent, targetLanguage) {
  return `You are a professional translator specialising in quantitative economics.

Translate the following English document into ${targetLanguage}.

## Rules

1. Translate all prose, headings, comments, and labels into ${targetLanguage}.
2. **Preserve all MyST Markdown syntax** exactly — directives, roles, code blocks, math blocks, cross-references, frontmatter structure.
3. **Do not translate code** — keep Python code as-is. Only translate comments within code blocks.
4. **Preserve all mathematical notation** exactly as-is (LaTeX).
5. Add Chinese font configuration for matplotlib where plots with Chinese labels are generated.
6. Use full-width punctuation where conventionally appropriate in Chinese.
7. Translate Wikipedia links to Chinese equivalents (e.g., Baidu Baike) where appropriate.

## Output format

Return ONLY the complete ${targetLanguage} document. No explanations, no commentary, no code fences wrapping the document. Start directly with the frontmatter \`---\` marker.

## English Source Document

${sourceContent}`;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node run-fresh-translate.mjs <filename.md>');
    process.exit(1);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.error('ANTHROPIC_API_KEY not set'); process.exit(1); }

  const sourceFile = path.join(SOURCE, DOCS_FOLDER, file);
  if (!fs.existsSync(sourceFile)) { console.error(`Source not found: ${sourceFile}`); process.exit(1); }

  const sourceContent = fs.readFileSync(sourceFile, 'utf-8');

  console.log(`File:   ${file}`);
  console.log(`Source: ${sourceContent.length.toLocaleString()} chars`);
  console.log(`Model:  ${MODEL}`);
  console.log(`\nSending fresh translation request…\n`);

  const prompt = buildFreshTranslatePrompt(sourceContent, 'Chinese (zh-cn)');

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
  const outputFile = `output/resync-${baseName}-fresh.md`;
  fs.mkdirSync('output', { recursive: true });
  fs.writeFileSync(outputFile, resultText, 'utf-8');
  console.log(`\nOutput saved: ${outputFile} (${resultText.length.toLocaleString()} chars, ${resultText.split('\n').length} lines)`);
}

main().catch(e => { console.error(e); process.exit(1); });

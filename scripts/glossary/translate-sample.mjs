#!/usr/bin/env node
/**
 * Step 1 of glossary review: produce two independent renderings of a sample of
 * lectures — one per model role (see lib.mjs "Model roles").
 *
 * Two entry modes:
 *
 *   fresh    — translate the sample with BOTH the seed and probe models.
 *              Use for a language with no seeded repo yet. Cost: 2 translations
 *              per lecture (~$0.80/lecture for fr; glossary-dominated).
 *
 *   existing — the target repo is already seeded, so its COMMITTED translation
 *              is the seed rendering (free); only the probe model runs.
 *              Halves the cost. Note the committed text may predate the current
 *              prompt/glossary — that is usually fine (we are looking for
 *              contestable terms, not grading the model), but if the glossary
 *              changed a lot since the seed, prefer fresh.
 *
 * Prereq: `npm run build:cli`, ANTHROPIC_API_KEY set.
 *
 * Examples:
 *   node scripts/glossary/translate-sample.mjs --lang fr \
 *     --source ~/work/quantecon/lecture-python-programming \
 *     --lectures python_by_example.md,functions.md,numpy.md \
 *     --out experiments/fr-glossary-programming/outputs
 *
 *   node scripts/glossary/translate-sample.mjs --lang zh-cn \
 *     --source ~/work/quantecon/lecture-python-programming \
 *     --existing ~/work/quantecon/lecture-python-programming.zh-cn \
 *     --lectures python_by_example.md,functions.md
 *
 * Flags: --lang --source --existing --lectures --out --seed-model --probe-model
 *        --docs-folder --dry-run --force
 */
import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import {
  ROOT, SEED_MODEL, PROBE_MODEL, MAX_TOKENS_FULL, arg, hasFlag, list, resolveSourceDir,
  docsFolder, requireApiKey, loadGlossary, glossaryPath, buildTranslatePrompt, callClaude,
  costUSD, langName, rel,
} from './lib.mjs';

const lang = arg('lang');
if (!lang) { console.error('--lang is required (e.g. --lang fr)'); process.exit(1); }

const sourceDir = resolveSourceDir();
const folder = docsFolder();
const existingRepo = arg('existing') ? path.resolve(arg('existing')) : null;
const lectures = list(arg('lectures'));
const outDir = path.resolve(arg('out', path.join(ROOT, `experiments/${lang}-glossary/outputs`)));
const seedModel = arg('seed-model', SEED_MODEL);
const probeModel = arg('probe-model', PROBE_MODEL);
const dryRun = hasFlag('dry-run');
const force = hasFlag('force');

if (!lectures?.length) { console.error('--lectures is required (comma-separated, e.g. --lectures a.md,b.md)'); process.exit(1); }
if (seedModel === probeModel) {
  console.error(`--seed-model and --probe-model must differ: two identical models cannot disagree, and\ndisagreement is the entire candidate signal. See lib.mjs "Model roles".`);
  process.exit(1);
}
if (existingRepo && !fs.existsSync(existingRepo)) { console.error(`--existing repo not found: ${existingRepo}`); process.exit(1); }
if (!fs.existsSync(glossaryPath(lang))) {
  console.error(`No glossary/${lang}.json. Add the language first — glossary review refines an existing glossary.`);
  process.exit(1);
}
if (!dryRun) requireApiKey();

const glossary = loadGlossary(lang);
const mode = existingRepo ? 'existing' : 'fresh';
console.log(`Glossary sample — ${langName(lang)} (${lang}), mode: ${mode}`);
console.log(`  seed  : ${existingRepo ? `committed translations in ${existingRepo}` : seedModel}`);
console.log(`  probe : ${probeModel}`);
console.log(`  glossary: ${glossary?.terms?.length ?? 0} terms · lectures: ${lectures.length}\n`);

const client = dryRun ? null : new Anthropic();
let spend = 0;

for (const lecture of lectures) {
  const base = lecture.replace(/\.md$/, '');
  const enPath = path.join(sourceDir, folder, `${base}.md`);
  if (!fs.existsSync(enPath)) { console.warn(`skip ${base} — no EN source at ${enPath}`); continue; }
  const en = fs.readFileSync(enPath, 'utf-8');
  const dir = path.join(outDir, lang, base);
  fs.mkdirSync(dir, { recursive: true });

  const jobs = [{ role: 'probe', model: probeModel }];
  if (existingRepo) {
    const committed = path.join(existingRepo, folder, `${base}.md`);
    const dest = path.join(dir, 'seed.md');
    if (!fs.existsSync(committed)) {
      console.warn(`skip ${base} — no committed translation at ${committed}`);
      continue;
    }
    if (!dryRun) fs.copyFileSync(committed, dest);
    console.log(`  ${base}  seed: ${dryRun ? 'would copy' : 'copied'} committed translation ($0.000)`);
  } else {
    jobs.unshift({ role: 'seed', model: seedModel });
  }

  for (const { role, model } of jobs) {
    const dest = path.join(dir, `${role}.md`);
    if (fs.existsSync(dest) && !force) { console.log(`  ${base}  ${role}: exists, skipping (--force to redo)`); continue; }
    if (dryRun) { console.log(`  ${base}  ${role}: would translate with ${model}`); continue; }
    try {
      const r = await callClaude(client, {
        model, maxTokens: MAX_TOKENS_FULL,
        prompt: buildTranslatePrompt(en, lang, glossary),
      });
      if (r.stopReason === 'max_tokens') console.warn(`    ! ${base}/${role} hit max_tokens — translation may be truncated`);
      fs.writeFileSync(dest, r.text);
      const c = costUSD(model, r.usage);
      spend += c;
      console.log(`  ${base}  ${role}: ${model}  ${r.elapsed}s  $${c.toFixed(3)}`);
    } catch (err) {
      console.error(`  ${base}  ${role}: ERROR ${err.message}`);
    }
  }
}

console.log(`\nTranslation spend: $${spend.toFixed(2)}`);
console.log(`Outputs: ${rel(path.join(outDir, lang))}/<lecture>/{seed,probe}.md`);
console.log(`\nNext: node scripts/glossary/suggest-glossary.mjs --lang ${lang} --outputs ${rel(outDir)} --role seed   (then --role probe)`);

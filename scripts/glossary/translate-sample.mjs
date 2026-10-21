#!/usr/bin/env node
/**
 * Step 1 of glossary review: produce two independent renderings of a sample of
 * lectures — one per model role (see lib.mjs "Model roles").
 *
 * Two entry modes:
 *
 *   fresh    — translate the sample with BOTH the seed and probe models.
 *              Use for a language with no seeded repo yet. Cost: 2 translations
 *              per lecture (~$0.80/lecture for fr with an Opus 4.8 seed; glossary-dominated).
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
  ROOT, SEED_MODEL, PROBE_MODEL, arg, hasFlag, list, resolveSourceDir,
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
const failed = []; // `<base>/<role>` of every sample that was not written

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
      const r = await callClaude(client, { model, operation: 'fullDocument', prompt: buildTranslatePrompt(en, lang, glossary) });
      const c = costUSD(model, r.usage); // billed whether or not the sample is usable
      spend += c;
      if (r.stopReason !== 'end_turn') {
        // A refusal or a max_tokens stop can still carry partial text. Writing it would pass
        // it off as a translation, and every rerun would then skip the sample as done.
        const category = r.stopDetails?.category;
        console.error(`  ✗ ${base}/${role}: stop_reason=${r.stopReason}${category ? ` category=${category}` : ''}  ${model}  ${r.elapsed}s  $${c.toFixed(3)}`);
        // dest exists here only under --force: it is the earlier sample this run was asked to
        // redo. Remove it, so the sample is "not written" and a plain rerun retries it.
        fs.rmSync(dest, { force: true });
        failed.push(`${base}/${role}`);
        continue;
      }
      if (!r.text.trim()) {
        // A model that always thinks (the Opus 5.5 seed) can end its turn with thinking blocks and no text.
        // An empty file would pass for a translation, and every rerun would skip it as done.
        console.error(`  ✗ ${base}/${role}: response contained no text  ${model}  ${r.elapsed}s  $${c.toFixed(3)}`);
        fs.rmSync(dest, { force: true });
        failed.push(`${base}/${role}`);
        continue;
      }
      fs.writeFileSync(dest, r.text);
      console.log(`  ${base}  ${role}: ${model}  ${r.elapsed}s  $${c.toFixed(3)}`);
    } catch (err) {
      console.error(`  ✗ ${base}/${role}: ERROR ${err.message}`);
      fs.rmSync(dest, { force: true });
      failed.push(`${base}/${role}`);
    }
  }
}

console.log(`\nTranslation spend: $${spend.toFixed(2)}`);
console.log(`Outputs: ${rel(path.join(outDir, lang))}/<lecture>/{seed,probe}.md`);
if (failed.length) {
  console.error(`\n✗ ${failed.length} sample(s) failed and were not written: ${failed.join(', ')}`);
  console.error(`Rerun to retry them (existing outputs are skipped unless --force).`);
  process.exit(1);
}
console.log(`\nNext: node scripts/glossary/suggest-glossary.mjs --lang ${lang} --outputs ${rel(outDir)} --role seed   (then --role probe)`);

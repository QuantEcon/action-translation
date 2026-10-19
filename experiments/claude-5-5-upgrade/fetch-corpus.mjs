#!/usr/bin/env node
// fetch-corpus.mjs — materialise the pinned corpus (corpus.yml) as one flat directory per class,
// verifying every file's sha256 against the pin. No API key; network: raw.githubusercontent.com.
//
// Usage: node experiments/claude-5-5-upgrade/fetch-corpus.mjs --out DIR [--class a,b] [--sweep] [--force]
//
//   --out DIR    where to write (run-stages.mjs reads <EVAL_ROOT>/corpus); outside the repository
//   --class a,b  only these document classes (default: every class in `documents`)
//   --sweep      also fetch the Stage 3 sweep: every lecture of each production source repository,
//                into its own directory sweep-<repo>/ (file names repeat across repositories)
//   --force      download again even when a file is present with the right hash
//
// Repository files come from https://raw.githubusercontent.com/QuantEcon/<repo>/<sha>/<path> at the
// pinned commit; `local:` entries are copied from this checkout (a reference-ml source
// <lecture>.en.md becomes <lecture>.md, the name rate-check is given). Any sha256 or size mismatch
// aborts before lock.json is written. File names must be unique within each output directory.
// Writes <out>/lock.json: what was fetched, from where, and its hash.
// Exit: 0 fetched and verified, 1 a download or verification failed, 2 usage error.

import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, UsageError, helpText, list, loadCorpus, parseArgs, runMain, sha256, sha256File, writeJson } from './lib.mjs';
import { fixtureName } from './cells.mjs';

const SPEC = { out: 'string', class: 'string', sweep: 'boolean', force: 'boolean', help: 'boolean' };
const CONCURRENCY = 8;

function rawUrl(repo, sha, file) {
  return `https://raw.githubusercontent.com/QuantEcon/${repo}/${sha}/${file}`;
}

async function download(url, attempts = 3) {
  let lastError;
  for (let i = 1; i <= attempts; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (i < attempts) await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
  throw new Error(`${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

/** Every file to materialise, with its pin. */
function plan(corpus, { classes, sweep }) {
  const items = [];
  for (const d of corpus.documents) {
    if (classes && !classes.includes(d.class)) continue;
    if (d.class === 'fixture') continue; // rate-check reads these from test-action-on-github-data/ itself
    items.push({
      id: d.id,
      class: d.class,
      dir: d.class,
      file: fixtureName(d),
      sha256: d.sha256,
      bytes: d.bytes,
      production: d.production ?? [],
      source: d.local ? { local: d.local } : { repo: d.repo, sha: d.sha, path: d.path, url: rawUrl(d.repo, d.sha, d.path) },
      reference: d.reference ? { local: d.reference, sha256: d.reference_sha256 } : undefined,
    });
  }
  if (sweep) {
    for (const s of corpus.sweep) {
      for (const f of s.files) {
        const file = `${s.dir}/${f.file}`;
        items.push({
          id: `${s.repo}/${f.file}`,
          class: s.class,
          dir: s.class,
          file: f.file,
          sha256: f.sha256,
          bytes: f.bytes,
          production: f.production ?? [],
          source: { repo: s.repo, sha: s.sha, path: file, url: rawUrl(s.repo, s.sha, file) },
        });
      }
    }
  }
  return items;
}

function checkUnique(items) {
  const seen = new Map();
  for (const item of items) {
    const key = `${item.dir}/${item.file}`;
    if (seen.has(key)) throw new UsageError(`two corpus entries write ${key}: ${seen.get(key)} and ${item.id}`);
    seen.set(key, item.id);
  }
}

async function materialise(item, outDir, force) {
  const target = path.join(outDir, item.dir, item.file);
  if (!force && fs.existsSync(target) && sha256File(target) === item.sha256) return { ...item, target, status: 'present' };
  let data;
  if (item.source.local) data = fs.readFileSync(path.join(REPO_ROOT, item.source.local));
  else data = await download(item.source.url);
  const got = sha256(data);
  if (got !== item.sha256 || data.length !== item.bytes) {
    throw new Error(`${item.id}: sha256 ${got} (${data.length} bytes) does not match the pin ${item.sha256} (${item.bytes} bytes)`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, data);
  return { ...item, target, status: 'fetched' };
}

async function main() {
  const { flags } = parseArgs(process.argv.slice(2), SPEC);
  if (flags.help) {
    console.log(helpText(import.meta.url));
    return 0;
  }
  if (!flags.out) throw new UsageError('--out DIR is required');
  const outDir = path.resolve(flags.out);
  const rel = path.relative(REPO_ROOT, outDir);
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) throw new UsageError(`--out ${outDir} is inside the repository (no scratch in the tree)`);
  const corpus = loadCorpus();
  const classes = list(flags.class);
  if (classes) {
    const known = new Set(corpus.documents.map((d) => d.class));
    const unknown = classes.filter((c) => !known.has(c));
    if (unknown.length) throw new UsageError(`unknown class ${unknown.join(', ')} (corpus.yml has ${[...known].join(', ')})`);
  }
  const items = plan(corpus, { classes, sweep: flags.sweep });
  checkUnique(items);

  // Reference pages are read in place by ml-lints.mjs; check their pins too.
  for (const item of items) {
    if (item.reference && sha256File(path.join(REPO_ROOT, item.reference.local)) !== item.reference.sha256) {
      throw new Error(`${item.reference.local} does not match corpus.yml's reference_sha256`);
    }
  }

  const results = [];
  const failures = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      try {
        results.push(await materialise(item, outDir, flags.force));
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (failures.length) {
    for (const f of failures) console.error(`✗ ${f}`);
    console.error(`${failures.length} of ${items.length} files failed; lock.json not written.`);
    if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY && failures.some((f) => f.includes('fetch failed'))) {
      console.error("HTTPS_PROXY is set but Node's fetch ignores it: rerun with NODE_USE_ENV_PROXY=1.");
    }
    return 1;
  }
  // Merge into an existing lock: a --class run must not drop the record of the other classes.
  const lockFile = path.join(outDir, 'lock.json');
  const corpusSha256 = sha256File(path.join(REPO_ROOT, 'experiments', 'claude-5-5-upgrade', 'corpus.yml'));
  const previous = fs.existsSync(lockFile) ? JSON.parse(fs.readFileSync(lockFile, 'utf8')) : null;
  const entries = new Map(previous?.corpusSha256 === corpusSha256 ? previous.files.map((f) => [f.path, f]) : []);
  for (const { target, status, ...rest } of results) entries.set(path.relative(outDir, target), { ...rest, path: path.relative(outDir, target), status });
  writeJson(lockFile, {
    schema: 'claude-5-5-upgrade/corpus-lock/1',
    fetchedAt: new Date().toISOString(),
    corpusSha256,
    files: [...entries.values()].sort((a, b) => a.path.localeCompare(b.path)),
  });
  const byDir = {};
  for (const r of results) byDir[r.dir] = (byDir[r.dir] ?? 0) + 1;
  const fetched = results.filter((r) => r.status === 'fetched').length;
  console.log(`✓ ${results.length} files verified against corpus.yml (${fetched} fetched, ${results.length - fetched} already present) in ${outDir}`);
  for (const [dir, n] of Object.entries(byDir)) console.log(`  ${dir}/  ${n}`);
  return 0;
}

runMain(main);

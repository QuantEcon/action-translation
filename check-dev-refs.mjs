/**
 * Check that `path:line` references in .qe/ notes still resolve.
 *
 * Scans .qe/**\/*.md for references of
 * the form `path/to/file.ext:12` or `file.ext:12-18`. A reference fails if the
 * file does not exist, or if the referenced line (range end) is past its end.
 * Bare basenames (`heading-map.ts:45`) resolve against git-tracked files.
 *
 * This cannot verify a reference still points at the *right* code — only that
 * it points at code that exists. It catches drift and typos, which is what a
 * decision record actually shipped once (#179, then #158).
 *
 * Runs in CI on source changes: what invalidates a .qe reference is source
 * moving underneath it, so .qe-only PRs (which skip CI) never need it.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Leading `./`/`../` and dotfile names (`.eslintrc.json`) are part of the path —
// without them the match starts mid-name and reports a mangled reference.
const REF_PATTERN =
  /(?<ref>(?:\.{1,2}\/)?\.?[A-Za-z0-9_@][A-Za-z0-9_./-]*\.(?:ts|tsx|js|mjs|cjs|json|ya?ml|md)):(?<start>\d+)(?:-(?<end>\d+))?/g;

const trackedFiles = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);

function findMarkdownFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findMarkdownFiles(full));
    } else if (entry.name.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

function lineCount(file) {
  return fs.readFileSync(file, 'utf8').split('\n').length;
}

const failures = [];
let checked = 0;

for (const mdFile of findMarkdownFiles('.qe')) {
  const lines = fs.readFileSync(mdFile, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const match of line.matchAll(REF_PATTERN)) {
      const { ref, start, end } = match.groups;
      const lastLine = Number(end ?? start);
      const candidates = ref.includes('/')
        ? [ref, path.join(path.dirname(mdFile), ref)].filter((f) => fs.existsSync(f))
        : trackedFiles.filter((f) => path.basename(f) === ref);
      checked++;

      const where = `${mdFile}:${i + 1}`;
      if (candidates.length === 0) {
        failures.push(`${where} — \`${ref}:${start}\` — no such file`);
      } else if (!candidates.some((f) => lineCount(f) >= lastLine)) {
        failures.push(
          `${where} — \`${match[0]}\` — line ${lastLine} is past end-of-file (${candidates
            .map((f) => `${f}: ${lineCount(f)} lines`)
            .join(', ')})`
        );
      }
    }
  });
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} stale reference(s) in .qe/ — update the note or the code:`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`✓ ${checked} .qe/ file references resolve`);

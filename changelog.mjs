/**
 * Changelog fragments: check them, and collect them into CHANGELOG.md at a release.
 *
 * A PR with a user-visible change adds its entry as a file of its own in
 * `changelog.d/`, named after its branch without the type prefix
 * (`fix/134-init-repo-scope` → `changelog.d/134-init-repo-scope.md`). No two
 * PRs then edit the same lines, which is what made every merge of the
 * 2026-11-15 batch conflict every open PR (D-2026-11-16-changelog-fragments).
 * The format is in `changelog.d/README.md`.
 *
 *   node changelog.mjs --check
 *       Validate every fragment, and that CHANGELOG.md's `## [Unreleased]`
 *       is empty: an entry belongs in a fragment until the release. Exits 1
 *       naming each problem. Runs in CI.
 *   node changelog.mjs --release X.Y.Z [--date YYYY-MM-DD]
 *       Validate the same, then write the fragments under
 *       `## [X.Y.Z] - <date>` below a fresh empty `## [Unreleased]`, delete
 *       them, and print the release's sections on stdout: the draft for the
 *       release notes. The date defaults to today's local date. Nothing is
 *       written unless every check passes; `git checkout -- CHANGELOG.md
 *       changelog.d` undoes a run.
 *
 * Paths are relative to the working directory, like check-dev-refs.mjs, so a
 * test can run the script on a fixture folder.
 */

import * as fs from 'fs';
import * as path from 'path';

const CHANGELOG = 'CHANGELOG.md';
const FRAGMENT_DIR = 'changelog.d';
const UNRELEASED = '## [Unreleased]';

/** Keep a Changelog's sections, plus `Documentation`, which this file already uses; in output order. */
const SECTIONS = [
  'Added',
  'Changed',
  'Deprecated',
  'Removed',
  'Fixed',
  'Security',
  'Documentation',
];

const FRAGMENT_NAME = /^[a-z0-9][a-z0-9._-]*\.md$/;

/**
 * Issue-numbered names first, in numeric order (`90-…` before `134-…`), then
 * the rest by name. A pure function of the folder, so a run is reproducible.
 */
function compareFragmentNames(a, b) {
  const na = /^\d+/.exec(a);
  const nb = /^\d+/.exec(b);
  if (na && nb && Number(na[0]) !== Number(nb[0])) return Number(na[0]) - Number(nb[0]);
  if (na && !nb) return -1;
  if (!na && nb) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Parse one fragment into its sections. A fragment is one or more
 * `### <Section>` lines, each followed by entries exactly as they will appear
 * in CHANGELOG.md: an unindented line starts an entry (`- `), and indented
 * and blank lines (nested bullets, continuation paragraphs) are free.
 */
function parseFragment(name, text, problems) {
  const sections = [];
  let current = null;
  text.split('\n').forEach((raw, i) => {
    const where = `${FRAGMENT_DIR}/${name}:${i + 1}`;
    const line = raw.startsWith('### ') ? raw.trimEnd() : raw;
    if (line.trim() === '') {
      if (current) current.lines.push('');
      return;
    }
    if (line.startsWith('### ')) {
      const title = line.slice(4);
      if (!SECTIONS.includes(title)) {
        problems.push(`${where}: unknown section "${title}" (use one of ${SECTIONS.join(', ')})`);
      }
      current = { title, lines: [] };
      sections.push(current);
      return;
    }
    if (/^\s+###\s/.test(line)) {
      problems.push(`${where}: a "### <Section>" line must start at column 1`);
      return;
    }
    if (!current) {
      problems.push(`${where}: text before the first "### <Section>" line`);
      return;
    }
    if (!/^\s/.test(line) && !line.startsWith('- ')) {
      problems.push(
        `${where}: an unindented line must start an entry with "- " (indent a continuation line)`
      );
    }
    current.lines.push(raw);
  });
  if (sections.length === 0 && problems.every((p) => !p.startsWith(`${FRAGMENT_DIR}/${name}`))) {
    problems.push(`${FRAGMENT_DIR}/${name}: no "### <Section>" line`);
  }
  for (const section of sections) {
    while (section.lines.length && section.lines[0] === '') section.lines.shift();
    while (section.lines.length && section.lines[section.lines.length - 1] === '')
      section.lines.pop();
    if (section.lines.length === 0) {
      problems.push(`${FRAGMENT_DIR}/${name}: section "${section.title}" has no entry`);
    }
  }
  return sections;
}

function readFragments(problems) {
  if (!fs.existsSync(FRAGMENT_DIR)) return [];
  const fragments = [];
  const names = fs
    .readdirSync(FRAGMENT_DIR, { withFileTypes: true })
    .filter((e) => !e.name.startsWith('.') && e.name !== 'README.md')
    .map((e) => {
      if (!e.isFile() || !FRAGMENT_NAME.test(e.name)) {
        problems.push(
          `${FRAGMENT_DIR}/${e.name}: not a fragment (a file named like "134-init-repo-scope.md")`
        );
        return null;
      }
      return e.name;
    })
    .filter(Boolean)
    .sort(compareFragmentNames);
  for (const name of names) {
    // A Windows or autocrlf checkout writes CRLF; CHANGELOG.md has none.
    const text = fs.readFileSync(path.join(FRAGMENT_DIR, name), 'utf8').replace(/\r\n?/g, '\n');
    fragments.push({ name, sections: parseFragment(name, text, problems) });
  }
  return fragments;
}

/** The index of the `## [Unreleased]` line, after checking nothing but blank lines sits under it. */
function findUnreleased(lines, problems) {
  const at = lines.map((l, i) => (l.trimEnd() === UNRELEASED ? i : -1)).filter((i) => i >= 0);
  if (at.length !== 1) {
    problems.push(`${CHANGELOG}: expected one "${UNRELEASED}" line, found ${at.length}`);
    return -1;
  }
  for (let i = at[0] + 1; i < lines.length && !lines[i].startsWith('## '); i++) {
    if (lines[i].trim() !== '') {
      problems.push(
        `${CHANGELOG}:${i + 1}: "${UNRELEASED}" must stay empty; move this entry into a fragment in ${FRAGMENT_DIR}/`
      );
      break;
    }
  }
  return at[0];
}

/** The release's sections, in canonical order; each fragment's entries kept verbatim and contiguous. */
function assemble(fragments) {
  const blocks = [];
  for (const title of SECTIONS) {
    const bodies = fragments.flatMap((f) =>
      f.sections.filter((s) => s.title === title).map((s) => s.lines.join('\n'))
    );
    if (bodies.length) blocks.push(`### ${title}\n\n${bodies.join('\n')}`);
  }
  return blocks.join('\n\n');
}

function localDate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fail(problems) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(1);
}

const USAGE = 'usage: node changelog.mjs --check | --release X.Y.Z [--date YYYY-MM-DD]';

function main(argv) {
  const check = argv.includes('--check');
  const releaseAt = argv.indexOf('--release');
  const dateAt = argv.indexOf('--date');
  const version = releaseAt >= 0 ? argv[releaseAt + 1] : undefined;
  const date = dateAt >= 0 ? argv[dateAt + 1] : localDate();
  // `--release` writes, so a typo (`--dat`) must stop it rather than be ignored,
  // and so must a flag that this mode would ignore (`--check --date …`).
  const known = new Set([argv.indexOf('--check')]);
  if (releaseAt >= 0) {
    for (const at of [releaseAt, dateAt]) if (at >= 0) known.add(at).add(at + 1);
  }
  const unknown = argv.filter((_a, i) => !known.has(i));
  if (check === releaseAt >= 0 || unknown.length) {
    fail([
      unknown.length ? `unexpected argument(s): ${unknown.join(' ')}` : USAGE,
      ...(unknown.length ? [USAGE] : []),
    ]);
  }

  const problems = [];
  if (!fs.existsSync(CHANGELOG)) fail([`${CHANGELOG} not found in ${process.cwd()}`]);
  const lines = fs.readFileSync(CHANGELOG, 'utf8').split('\n');
  const unreleased = findUnreleased(lines, problems);
  const fragments = readFragments(problems);

  if (check) {
    if (problems.length) fail(problems);
    console.log(`✓ ${fragments.length} changelog fragment(s) valid; ${UNRELEASED} is empty`);
    return;
  }

  if (!/^\d+\.\d+\.\d+$/.test(version ?? ''))
    problems.push(`--release needs X.Y.Z, got "${version ?? ''}"`);
  const [y, m, d] = (date ?? '').split('-').map(Number);
  const real = new Date(y, m - 1, d);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ||
    real.getFullYear() !== y ||
    real.getMonth() !== m - 1 ||
    real.getDate() !== d
  ) {
    problems.push(`--date needs a real YYYY-MM-DD date, got "${date ?? ''}"`);
  }
  // Deleting a fragment needs write access to the folder, not to the file.
  try {
    if (fragments.length) fs.accessSync(FRAGMENT_DIR, fs.constants.W_OK);
  } catch {
    problems.push(`${FRAGMENT_DIR}/ is not writable, so its fragments could not be deleted`);
  }
  if (version && lines.some((l) => l.startsWith(`## [${version}]`))) {
    problems.push(`${CHANGELOG} already has "## [${version}]"`);
  }
  if (fragments.length === 0) problems.push(`no fragments in ${FRAGMENT_DIR}/: nothing to release`);
  if (problems.length) fail(problems);

  // Everything is checked: write CHANGELOG.md, then delete the fragments.
  const sections = assemble(fragments);
  let next = unreleased + 1;
  while (next < lines.length && !lines[next].startsWith('## ')) next++;
  const tail = lines.slice(next);
  const out = [
    ...lines.slice(0, unreleased + 1),
    '',
    `## [${version}] - ${date}`,
    '',
    sections,
    ...(tail.length ? ['', ...tail] : ['']),
  ];
  fs.writeFileSync(CHANGELOG, out.join('\n'));
  const left = [];
  for (const f of fragments) {
    try {
      fs.unlinkSync(path.join(FRAGMENT_DIR, f.name));
    } catch (e) {
      left.push(`${FRAGMENT_DIR}/${f.name} (${e.code ?? e.message})`);
    }
  }
  if (left.length) {
    // A fragment left behind would be released again by the next run.
    fail([
      `${CHANGELOG} was written, but these fragments could not be deleted: ${left.join(', ')}`,
      `delete them by hand, or undo the run with: git checkout -- ${CHANGELOG} ${FRAGMENT_DIR}`,
    ]);
  }
  process.stdout.write(`${sections}\n`);
}

main(process.argv.slice(2));

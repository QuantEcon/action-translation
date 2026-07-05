#!/usr/bin/env node
// .dev/ health check — pass 1 (deterministic, dependency-free).
//
// Enforces the `.dev/` convention's minimal frontmatter schema and flags staleness.
// Policy (the thresholds) lives here, not in the notes files.
//
//   ERRORS  (exit 1): schema violations — unknown/missing frontmatter keys, bad values,
//                     dangling `superseded_by` ids. These should block PRs that touch `.dev/`.
//   WARNINGS (exit 0): staleness/size/signal — advisory, surfaced but non-blocking.
//
// Pass 2 (an LLM contradiction pass over STATE.md vs recent logs vs repo reality) is separate.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEV_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const REPO_ROOT = join(DEV_DIR, '..');

// --- policy ----------------------------------------------------------------
const STALE_DAYS = 30; // STATE.md `verified` older than this → warning
const PROMOTE_STALE_DAYS = 30; // unresolved `promote:` item older than this → warning
const MAX_STATE_LINES = 100; // STATE.md "max one page"

const ALLOWED = {
  state: { required: ['verified'], optional: [] },
  decision: { required: ['scope', 'superseded_by'], optional: [] },
  log: { required: [], optional: ['promote'] },
  other: { required: [], optional: ['verified'] }, // PLAN, FUTURE, ARCHITECTURE, README
};

const errors = [];
const warnings = [];
const rel = (p) => relative(REPO_ROOT, p);
const err = (file, msg) => errors.push(`${rel(file)}: ${msg}`);
const warn = (file, msg) => warnings.push(`${rel(file)}: ${msg}`);

// --- helpers ---------------------------------------------------------------
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'tools' || name === 'scratch') continue; // not notes
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.md')) out.push(p);
  }
  return out;
}

// Minimal frontmatter parser for the controlled 4-key subset:
//   key: value            (scalar; "" allowed)
//   key:                  followed by "  - item" lines (list)
// Returns { keys: {name: {value|list}}, bodyStart } or null if no frontmatter.
function parseFrontmatter(text, file) {
  const lines = text.split('\n');
  if (lines[0] !== '---') return { keys: {}, body: text };
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') { end = i; break; }
  }
  if (end === -1) { err(file, 'unterminated frontmatter (no closing `---`)'); return { keys: {}, body: text }; }

  const keys = {};
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    if (/^\s+-\s+/.test(line)) continue; // list item, consumed by its key below
    const m = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (!m) { err(file, `unparseable frontmatter line: "${line}"`); continue; }
    const [, key, raw] = m;
    if (raw === '' || raw === '[]') {
      // possible block list
      const list = [];
      for (let j = i + 1; j < end; j++) {
        const lm = lines[j].match(/^\s+-\s+(.*)$/);
        if (!lm) break;
        list.push(lm[1].replace(/^["']|["']$/g, ''));
      }
      keys[key] = list.length || raw === '[]' ? { list } : { value: '' };
    } else {
      keys[key] = { value: raw.replace(/^["']|["']$/g, '') };
    }
  }
  return { keys, body: lines.slice(end + 1).join('\n') };
}

function categoryOf(file) {
  const r = rel(file);
  if (r === join('.dev', 'STATE.md')) return 'state';
  if (r.includes(join('.dev', 'decisions') + '/')) return 'decision';
  if (r.includes(join('.dev', 'log') + '/')) return 'log';
  return 'other';
}

function daysSince(isoDate) {
  const d = new Date(isoDate + 'T00:00:00Z');
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

// --- checks ----------------------------------------------------------------
const decisionStems = new Set(
  existsSync(join(DEV_DIR, 'decisions'))
    ? readdirSync(join(DEV_DIR, 'decisions'))
        .filter((f) => f.endsWith('.md'))
        .map((f) => basename(f, '.md'))
    : []
);

for (const file of walk(DEV_DIR)) {
  const cat = categoryOf(file);
  const text = readFileSync(file, 'utf8');
  const { keys } = parseFrontmatter(text, file);
  const spec = ALLOWED[cat];
  const present = Object.keys(keys);

  // key allowlist
  for (const k of present) {
    if (!spec.required.includes(k) && !spec.optional.includes(k)) {
      err(file, `frontmatter key "${k}" not allowed for ${cat} files (allowed: ${[...spec.required, ...spec.optional].join(', ') || 'none'})`);
    }
  }
  // required keys
  for (const k of spec.required) {
    if (!present.includes(k)) err(file, `missing required frontmatter key "${k}"`);
  }

  // value checks
  if (keys.verified) {
    const v = keys.verified.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) err(file, `verified must be YYYY-MM-DD, got "${v}"`);
    else if (cat === 'state') {
      const age = daysSince(v);
      if (age !== null && age > STALE_DAYS) warn(file, `verified is ${age}d old (> ${STALE_DAYS}d) — reconfirm STATE.md and bump verified`);
    }
  }
  if (cat === 'decision') {
    const scope = keys.scope?.value;
    if (scope && !['repo', 'org'].includes(scope)) err(file, `scope must be "repo" or "org", got "${scope}"`);
    const sb = keys.superseded_by?.value;
    if (sb !== undefined && sb !== 'null' && sb !== '') {
      if (sb === basename(file, '.md')) err(file, 'superseded_by points at itself');
      else if (!decisionStems.has(sb)) err(file, `superseded_by "${sb}" has no matching decisions/${sb}.md`);
    }
  }

  // STATE.md size (warning)
  if (cat === 'state') {
    const n = text.split('\n').length;
    if (n > MAX_STATE_LINES) warn(file, `${n} lines (> ${MAX_STATE_LINES}) — distill, promote, or move detail to PLAN/decisions`);
  }

  // log checks (warnings)
  if (cat === 'log') {
    const dateFromName = basename(file).slice(0, 10);
    const age = daysSince(dateFromName);
    if (keys.promote?.list?.length) {
      for (const item of keys.promote.list) {
        if (!item.includes('→ vault:') && age !== null && age > PROMOTE_STALE_DAYS) {
          warn(file, `promote item unresolved after ${age}d (no "→ vault:" link): "${item.slice(0, 60)}…"`);
        }
      }
    }
    // deterministic signal-floor proxy: body should reference a change (SHA / #PR / path)
    const body = text.replace(/^---[\s\S]*?\n---\n/, '');
    const hasSignal = /#\d+/.test(body) || /\b[0-9a-f]{7,40}\b/.test(body) || /[\w./-]+\.(md|ts|js|mjs|yml|json)/.test(body);
    if (!hasSignal) warn(file, 'log entry references no PR/issue, commit, or file path — possible no-signal entry');
  }
}

// --- report ----------------------------------------------------------------
const line = '─'.repeat(60);
console.log(`.dev/ health check — ${errors.length} error(s), ${warnings.length} warning(s)`);
if (warnings.length) {
  console.log(`\n${line}\nWARNINGS (advisory)\n${line}`);
  for (const w of warnings) console.log(`  ⚠ ${w}`);
}
if (errors.length) {
  console.log(`\n${line}\nERRORS (schema — blocking)\n${line}`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  process.exit(1);
}
console.log('\n✓ schema valid');

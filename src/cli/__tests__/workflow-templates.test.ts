/**
 * Drift guard for the review-workflow template (#161 — audit F7/F136).
 *
 * The review workflow existed in six divergent copies, five of which could
 * never fire on Action sync PRs: the `action-translation` label is applied
 * after the PR opens, so `types: [opened, synchronize]` never sees it. That
 * is the shape behind the v0.21.0 incident where six PRs of real translated
 * content merged unreviewed. examples/review-translations.yml is now the one
 * canonical template — the scaffolder renders it and the docs quote it — and
 * this test fails loudly when any copy drifts. Same mold as
 * branch-naming.test.ts's guard over examples/rebase-translations.yml.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..', '..');
const CANONICAL = fs.readFileSync(path.join(ROOT, 'examples', 'review-translations.yml'), 'utf8');

/**
 * The lines that make the workflow fireable and safe. A copy missing any of
 * them regresses to the unfireable (or multi-billed, or unauthorized) shape.
 */
const STRUCTURAL_LINES = [
  'types: [opened, synchronize, labeled, reopened]',
  "contains(github.event.pull_request.labels.*.name, 'action-translation')",
  "github.event.action != 'labeled' || github.event.label.name == 'action-translation'",
  'pull-requests: write',
  'group: review-translations-${{ github.event.pull_request.number }}',
  'cancel-in-progress: true',
  'actions/checkout@v7',
  'QuantEcon/action-translation@v0',
];

/** The floating tag, not a pinned @v0.x — the old scaffold shipped @v0.9.0. */
const PINNED_TAG = /action-translation@v0\.\d/;

/**
 * The E2E harness renders every workflow it deploys from a template carrying a
 * substituted ref, so no version is ever hand-maintained. One template now
 * serves all languages; its predecessors were per-language copies that pinned a
 * hard-coded `ref: v0.16.1` for eight releases while two doc pages claimed the
 * harness tracked `main` — so a "full E2E run" silently validated stale code.
 */
const HARNESS_SYNC_TEMPLATE =
  'tool-test-action-on-github/test-action-on-github-data/sync-workflow-template.yml';
const HARNESS_SCRIPT = 'tool-test-action-on-github/test-action-on-github.sh';

/** Languages the harness drives; each needs three base fixtures. */
const HARNESS_LANGUAGES = ['zh-cn', 'fa', 'ml'];

/** Doc pages that quote the review workflow. */
const DOC_PAGES = [
  'docs/user/quickstart.md',
  'docs/user/action-reference.md',
  'docs/user/tutorials/fresh-setup.md',
  'docs/user/tutorials/add-language.md',
  'docs/user/tutorials/connect-existing.md',
];

describe('the canonical review workflow template', () => {
  it('carries every structural line', () => {
    for (const line of STRUCTURAL_LINES) {
      expect(CANONICAL).toContain(line);
    }
  });

  it('has no target-language input — review mode detects it from the repo suffix', () => {
    expect(CANONICAL).not.toContain('target-language');
  });

  it('uses the floating @v0 tag, not a pinned version', () => {
    expect(CANONICAL).not.toMatch(PINNED_TAG);
  });
});

describe('every documented copy of the review workflow', () => {
  it.each(DOC_PAGES)('%s carries every structural line', (page) => {
    const content = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const missing = STRUCTURAL_LINES.filter((line) => !content.includes(line));
    expect(missing).toEqual([]);
    expect(content).not.toMatch(PINNED_TAG);
  });

  it.each(DOC_PAGES)('%s does not re-teach the dead review target-language knob', (page) => {
    const content = fs.readFileSync(path.join(ROOT, page), 'utf8');
    // target-language legitimately appears in sync-mode blocks; the review
    // block is identified by its mode line and scanned to the fence close.
    for (const match of content.matchAll(/^\s*mode: review$/gm)) {
      const rest = content.slice(match.index);
      const block = rest.slice(0, rest.indexOf('```'));
      expect(block).not.toContain('target-language');
    }
  });
});

describe('the E2E harness workflow rendering', () => {
  const template = fs.readFileSync(path.join(ROOT, HARNESS_SYNC_TEMPLATE), 'utf8');
  const script = fs.readFileSync(path.join(ROOT, HARNESS_SCRIPT), 'utf8');

  it('takes its action ref from the placeholder, and hard-codes no version', () => {
    expect(template).toContain('uses: QuantEcon/action-translation@__ACTION_REF__');
    // Comments explain the v0.16.1 history, so scan the `uses:` lines only.
    const pins = [...template.matchAll(/^\s*(?:- )?uses:\s*QuantEcon\/action-translation@(\S+)/gm)];
    expect(pins.map((m) => m[1])).toEqual(['__ACTION_REF__']);
    expect(template).not.toMatch(/^\s*ref:\s*v\d/m);
  });

  it('is language-parameterised rather than copied per language', () => {
    expect(template).toContain('__LANG__');
    expect(template).toContain('__LANG_NAME__');
    // The per-language copies this replaced drifted three separate ways.
    expect(
      fs.existsSync(
        path.join(
          ROOT,
          'tool-test-action-on-github/test-action-on-github-data/workflow-template-fa.yml'
        )
      )
    ).toBe(false);
  });

  it('substitutes the ref into the source and target workflows alike', () => {
    expect(script).toContain('s|__ACTION_REF__|$ACTION_REF|g');
    // Target-repo workflows are rendered from examples/, so one knob reaches
    // all of them rather than leaving five permanently on the floating tag.
    expect(script).toContain(
      'QuantEcon/action-translation@v0|QuantEcon/action-translation@$ACTION_REF'
    );
    expect(script).toContain('assert_no_placeholders');
  });

  it('defaults to main, not the package.json version', () => {
    // package.json holds the LAST RELEASED version between releases, so that
    // default tested the previous release instead of the code under change.
    expect(script).toMatch(/ACTION_REF="main"/);
    expect(script).not.toContain("require('$REPO_ROOT/package.json').version");
  });

  it('enters the source clone before running git in the main shell', () => {
    // Steps 1-2 subshell their work, so the main shell's cwd is still the
    // caller's directory. Steps 3-4 then run `git branch -D`, `git commit` and
    // `git push -f` — against the CALLER'S repo unless something cd's first.
    // The code this replaced relied on a trailing `cd ..; cd "$SOURCE_REPO"`
    // from the last reset block, which the subshells removed.
    // Scope to Step 3 onward: the helper functions defined above it also run
    // git, but each is invoked inside a subshell that cd's for itself.
    const mainShell = script.slice(script.indexOf('# STEP 3'));
    const guardIdx = mainShell.indexOf('cd "$WORK_DIR/$SOURCE_REPO"');
    expect(guardIdx).toBeGreaterThan(-1);

    const destructive = /^\s*git (branch .*-D|commit|push|checkout|mv|rm) /gm;
    const before = [...mainShell.matchAll(destructive)].filter((m) => m.index! < guardIdx);
    expect(before.map((m) => m[0].trim())).toEqual([]);
  });

  it('refuses to run git if the source clone is missing', () => {
    // Without this, a failed clone would silently hand the scenario loop the
    // caller's working tree.
    expect(script).toContain('is not a git clone — refusing to run git here');
  });

  it('deletes .github/ only where it also re-renders it', () => {
    // The fa reset used to delete .github/ without rewriting it, which
    // destroyed that target's review and rebase workflows on every run.
    const deletions = [...script.matchAll(/^\s*rm -rf .*\.github\/.*$/gm)];
    expect(deletions.length).toBeGreaterThan(0);
    for (const del of deletions) {
      const after = script.slice(del.index!);
      const block = after.slice(0, after.indexOf('commit_and_push'));
      expect(block).toMatch(/render_(sync|target)_workflows?|render_sync_workflow/);
    }
  });

  it.each(HARNESS_LANGUAGES)('%s has all three base fixtures', (lang) => {
    const dir = 'tool-test-action-on-github/test-action-on-github-data';
    for (const f of [
      `base-minimal-${lang}.md`,
      `base-lecture-${lang}.md`,
      `base-toc-${lang}.yml`,
    ]) {
      expect(fs.existsSync(path.join(ROOT, dir, f))).toBe(true);
    }
  });

  it.each(HARNESS_LANGUAGES)('%s fixtures use the current translation: format', (lang) => {
    const dir = 'tool-test-action-on-github/test-action-on-github-data';
    for (const f of [`base-minimal-${lang}.md`, `base-lecture-${lang}.md`]) {
      const content = fs.readFileSync(path.join(ROOT, dir, f), 'utf8');
      // `heading-map:` is the legacy key; the writer deletes it on rewrite, so
      // a fixture using it mutates the harness baseline on the first sync.
      expect(content).not.toMatch(/^heading-map:/m);
      expect(content).toMatch(/^translation:/m);
      expect(content).toMatch(/^ {2}headings:/m);
      expect(content.endsWith('\n')).toBe(true);
    }
  });

  it.each(HARNESS_LANGUAGES)('%s lecture fixture matches source structure', (lang) => {
    const dir = path.join(ROOT, 'tool-test-action-on-github/test-action-on-github-data');
    const src = fs.readFileSync(path.join(dir, 'base-lecture.md'), 'utf8');
    const tgt = fs.readFileSync(path.join(dir, `base-lecture-${lang}.md`), 'utf8');
    const count = (s: string, rx: RegExp) => (s.match(rx) ?? []).length;
    // A structurally divergent baseline is the corruption the #159 guard
    // exists to prevent, and it would poison every later sync comparison.
    expect(count(tgt, /^#{1,6} /gm)).toBe(count(src, /^#{1,6} /gm));
    expect(count(tgt, /^```/gm)).toBe(count(src, /^```/gm));
    expect(count(tgt, /^\$\$/gm)).toBe(count(src, /^\$\$/gm));
    expect(count(tgt, /^```\{[a-z-]+\}/gm)).toBe(count(src, /^```\{[a-z-]+\}/gm));
  });
});

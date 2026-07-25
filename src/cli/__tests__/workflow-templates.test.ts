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
 * The E2E harness's sync-workflow templates. Their `ref:` is substituted at run
 * time from package.json, so it cannot go stale — it read a hard-coded v0.16.1
 * for eight releases while two doc pages claimed the harness tracked `main`,
 * which meant a "full E2E run" silently validated eight-release-old code.
 */
const HARNESS_TEMPLATES = [
  'tool-test-action-on-github/test-action-on-github-data/workflow-template.yml',
  'tool-test-action-on-github/test-action-on-github-data/workflow-template-fa.yml',
];

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

describe('the E2E harness sync-workflow templates', () => {
  it.each(HARNESS_TEMPLATES)('%s takes its action ref from the placeholder', (template) => {
    const content = fs.readFileSync(path.join(ROOT, template), 'utf8');
    expect(content).toContain('ref: __ACTION_REF__');
  });

  it.each(HARNESS_TEMPLATES)('%s hard-codes no action version', (template) => {
    const content = fs.readFileSync(path.join(ROOT, template), 'utf8');
    // Comments explain the v0.16.1 history, so scan the ref: line itself.
    const refs = [...content.matchAll(/^\s*ref:\s*(\S+)/gm)].map((m) => m[1]);
    expect(refs).toEqual(['__ACTION_REF__']);
  });

  it('are substituted by the harness script, which defaults to package.json', () => {
    const script = fs.readFileSync(
      path.join(ROOT, 'tool-test-action-on-github', 'test-action-on-github.sh'),
      'utf8'
    );
    expect(script).toContain('s|__ACTION_REF__|$ACTION_REF|g');
    expect(script).toContain("require('$REPO_ROOT/package.json').version");
  });
});

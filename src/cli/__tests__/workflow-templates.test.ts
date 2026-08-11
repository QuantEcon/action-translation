/**
 * Drift guards for the workflow templates this repo publishes (#161 — audit
 * F7/F136; #192 for the sync half).
 *
 * The review workflow existed in six divergent copies, five of which could
 * never fire on Action sync PRs: the `action-translation` label is applied
 * after the PR opens, so `types: [opened, synchronize]` never sees it. That
 * is the shape behind the v0.21.0 incident where six PRs of real translated
 * content merged unreviewed. examples/review-translations.yml is now the one
 * canonical template — the scaffolder renders it and the docs quote it — and
 * this test fails loudly when any copy drifts. Same mold as
 * branch-naming.test.ts's guard over examples/rebase-translations.yml.
 *
 * The sync workflow has no single canonical file (the scaffolder generates it
 * and the docs quote it), so its guard works the other way round: it sweeps
 * every publishable surface, parses each workflow it finds, and requires the
 * `\translate-resync` gate on every job that carries one. That shape is what
 * #192 needed — the trust condition was missing from all twelve documented
 * copies at once, and an enumerated whitelist would not have covered the
 * thirteenth.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { generateSourceWorkflowYaml } from '../commands/setup.js';

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

  it('AGENTS.md documents exactly the harness languages', () => {
    // Doubles as a corruption tripwire. A scripted edit to this file's
    // predecessor (.github/copilot-instructions.md, since merged into AGENTS.md)
    // once produced an empty match and `str.replace('', new)`, which inserts
    // between every character — 232 lines became 46,677 and no test noticed,
    // because nothing read that file at all.
    const doc = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8');
    expect(doc.split('\n').length).toBeLessThan(1000);

    // Exact set, not a subset: a documented target repo the harness does not
    // drive is misleading guidance in the same way a missing one is, and the
    // test name promises "exactly".
    const documented = [
      ...new Set(
        [...doc.matchAll(/`QuantEcon\/test-translation-sync\.([a-z-]+)`/g)].map((m) => m[1])
      ),
    ].sort();
    expect(documented).toEqual([...HARNESS_LANGUAGES].sort());
  });

  it('gives the rendered rebase workflow a root docs-folder', () => {
    // examples/rebase-translations.yml carries no docs-folder, so substitution
    // no-ops and the workflow inherits action.yml's `lectures/` default — while
    // the harness repos keep lectures at the root. Rebase would then filter on
    // a prefix no test file has and rebase nothing while reporting success.
    const rebaseTemplate = fs.readFileSync(
      path.join(ROOT, 'examples', 'rebase-translations.yml'),
      'utf8'
    );
    expect(rebaseTemplate).not.toMatch(/^\s*docs-folder:/m); // the premise
    expect(script).toMatch(/docs-folder: %c\.%c/); // the insert that compensates
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

// ============================================================================
// THE SYNC WORKFLOW'S RESYNC GATE (#192)
// ============================================================================

/**
 * The roots that can hold a workflow a user might copy. Directories are swept
 * recursively, so a new doc page is covered the day it lands — the #192
 * exposure was twelve copies deep precisely because each new page copied the
 * shape from an older one and no test knew the set had grown. Deliberately
 * NOT a repo-wide walk: the `test-translation-sync*` clones are gitignored but
 * present in a working tree, and a test that reads them passes or fails by
 * what happens to be on disk.
 */
const SYNC_WORKFLOW_ROOTS = [
  'README.md',
  'examples',
  'docs',
  'tool-test-action-on-github',
  '.github',
];

/** Every copy of the gate lived at a different indent, so match on content. */
const RESYNC_GATE = {
  'requires a comment on a PR, not a bare issue': 'github.event.issue.pull_request',
  'requires the resync command': "startsWith(github.event.comment.body, '\\translate-resync')",
  'requires a trusted commenter': `contains(fromJSON('["OWNER", "MEMBER", "COLLABORATOR"]'), github.event.comment.author_association)`,
};

/** The pre-#192 shape, in the form every copy carried it. */
const UNGATED = "github.event_name == 'issue_comment' && contains(github.event.comment.body,";

interface SyncJob {
  where: string;
  condition: string;
  permissions: unknown;
}

function walk(target: string): string[] {
  const abs = path.join(ROOT, target);
  if (!fs.existsSync(abs)) return [];
  if (fs.statSync(abs).isFile()) return [target];
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .flatMap((e) => walk(path.join(target, e.name)));
}

/** Workflow YAML as published: whole `.yml` files, fenced blocks in `.md`. */
function workflowSources(relPath: string): string[] {
  const text = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const blocks = relPath.endsWith('.md')
    ? [...text.matchAll(/```yaml\n([\s\S]*?)```/g)].map((m) => m[1])
    : /\.ya?ml$/.test(relPath)
      ? [text]
      : [];
  // Frontmatter samples are also fenced `yaml` and are multi-document, which
  // js-yaml rejects — discriminate on content rather than swallowing errors,
  // so a genuinely broken workflow block still fails loudly below.
  return blocks.filter((b) => /^jobs:/m.test(b));
}

/** Placeholders the harness substitutes at render time; `on` is unaffected. */
function render(source: string): string {
  return source
    .replace(/__ACTION_REF__/g, 'main')
    .replace(/__LANG_NAME__/g, 'Farsi')
    .replace(/__LANG__/g, 'fa');
}

function syncJobsIn(where: string, source: string): SyncJob[] {
  // A parse error here is the failure, not something to skip: the #192 fix
  // rewrote a folded `if:` in fourteen places and a mis-folded one would
  // silently stop the workflow firing on merges at all.
  const doc = yaml.load(render(source)) as { jobs?: Record<string, Record<string, unknown>> };
  return Object.entries(doc?.jobs ?? {})
    .filter(([, job]) => typeof job?.if === 'string' && job.if.includes('issue_comment'))
    .map(([name, job]) => ({
      where: `${where} :: ${name}`,
      condition: job.if as string,
      permissions: job.permissions,
    }));
}

const DOCUMENTED_SYNC_JOBS: SyncJob[] = SYNC_WORKFLOW_ROOTS.flatMap(walk).flatMap((f) =>
  workflowSources(f).flatMap((src) => syncJobsIn(f, src))
);

/** The scaffolder's output is a fifteenth copy that lives in TypeScript. */
const SCAFFOLDED_SYNC_JOBS = syncJobsIn(
  'src/cli/commands/setup.ts (generated)',
  generateSourceWorkflowYaml('QuantEcon/lecture-python-intro.zh-cn', 'zh-cn', 'lectures')
);

const ALL_SYNC_JOBS = [...DOCUMENTED_SYNC_JOBS, ...SCAFFOLDED_SYNC_JOBS];

describe('the \\translate-resync trigger gate', () => {
  it('finds the sync jobs at all', () => {
    // Without this the suite passes vacuously the day the extractor breaks or
    // a fence is renamed — every assertion below is per-job.
    expect(DOCUMENTED_SYNC_JOBS.length).toBeGreaterThanOrEqual(13);
    expect(SCAFFOLDED_SYNC_JOBS).toHaveLength(1);
  });

  describe.each(Object.entries(RESYNC_GATE))('%s', (_label, clause) => {
    it.each(ALL_SYNC_JOBS.map((j) => [j.where, j] as const))('%s', (_where, job) => {
      // Folding collapses the newlines a reader sees into single spaces, so
      // compare against what GitHub actually evaluates.
      expect(job.condition.replace(/\s+/g, ' ')).toContain(clause);
    });
  });

  it.each(ALL_SYNC_JOBS.map((j) => [j.where, j] as const))(
    '%s keeps the ambient GITHUB_TOKEN read-only',
    (_where, job) => {
      // The action authenticates with the PAT input; checkout is the only
      // consumer of the job token, so nothing needs write.
      expect(job.permissions).toEqual({ contents: 'read' });
    }
  );

  it('leaves no copy of the pre-#192 ungated form anywhere', () => {
    const offenders = SYNC_WORKFLOW_ROOTS.flatMap(walk).filter((f) =>
      fs.readFileSync(path.join(ROOT, f), 'utf8').includes(UNGATED)
    );
    expect(offenders).toEqual([]);
  });

  it('matches the association set the action enforces internally', () => {
    // A workflow that admitted CONTRIBUTOR would start a billed run that
    // inputs.ts then no-ops — the two gates have to agree, and the tighter
    // one has to be the outer one.
    const inputs = fs.readFileSync(path.join(ROOT, 'src', 'inputs.ts'), 'utf8');
    const declared = inputs.match(/TRUSTED_ASSOCIATIONS = new Set\(\[([^\]]*)\]\)/);
    expect(declared).not.toBeNull();
    const enforced = [...declared![1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    expect(enforced).toEqual(['OWNER', 'MEMBER', 'COLLABORATOR']);
    for (const job of ALL_SYNC_JOBS) {
      for (const association of enforced) {
        expect(job.condition).toContain(`"${association}"`);
      }
    }
  });
});

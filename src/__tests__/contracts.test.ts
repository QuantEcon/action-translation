/**
 * Structural tests for the cross-boundary contract constants (#162).
 *
 * Two guarantees, in the mold of branch-naming.test.ts (which has held since
 * #115): (a) no source file re-spells a contract literal by hand — the shape
 * that merged six PRs unreviewed when a copy drifted — and (b) the artefacts
 * that cannot import TypeScript (action.yml, the canonical workflow template,
 * the written spec) agree with the constants byte-for-byte.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  AUTO_MERGE_MODES,
  DEFAULT_CLAUDE_MODEL,
  FAILURE_ISSUE_LABEL,
  RESYNC_PR_LABELS,
  REVIEW_TRIGGER_LABEL,
  SYNC_PR_LABELS,
  TARGET_REPO_LABELS,
} from '../contracts.js';
import { buildGhArgs } from '../cli/forward-pr-creator.js';

const ROOT = path.join(__dirname, '..', '..');

describe('the label sets are coherent', () => {
  it('every PR label set carries the trigger label', () => {
    expect(SYNC_PR_LABELS).toContain(REVIEW_TRIGGER_LABEL);
    expect(RESYNC_PR_LABELS).toContain(REVIEW_TRIGGER_LABEL);
    expect(TARGET_REPO_LABELS).toContain(REVIEW_TRIGGER_LABEL);
  });

  it('the CLI resync PR applies exactly the resync label set', () => {
    const args = buildGhArgs('cobweb.md', 'Owner/repo');
    const labels = args.filter((_, i) => args[i - 1] === '--label');
    expect(labels).toEqual([...RESYNC_PR_LABELS]);
  });
});

describe('no source file re-spells a contract literal', () => {
  // The npm package name shares bytes with the trigger label but is a
  // different concept — `pkg.name === 'action-translation'` in these files is
  // not the label contract and must not be forced through the constant.
  const PACKAGE_NAME_FILES = new Set(['review-verdict.ts', 'translate-state.ts']);

  const CONFINED = [REVIEW_TRIGGER_LABEL, 'action-translation-sync', FAILURE_ISSUE_LABEL];

  const stripComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  /** Every production source file under src/, recursively — tests excluded. */
  function sourceFiles(dir: string): string[] {
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') results.push(...sourceFiles(full));
      } else if (/\.tsx?$/.test(entry.name) && !/\.(test|d)\.ts$/.test(entry.name)) {
        results.push(full);
      }
    }
    return results;
  }

  it('keeps the label literals confined to contracts.ts', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(path.join(ROOT, 'src'))) {
      const name = path.basename(file);
      if (name === 'contracts.ts' || PACKAGE_NAME_FILES.has(name)) continue;

      const code = stripComments(fs.readFileSync(file, 'utf8'));
      for (const literal of CONFINED) {
        if (code.includes(`'${literal}'`) || code.includes(`"${literal}"`)) {
          offenders.push(`${path.relative(ROOT, file)} re-spells '${literal}'`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe('artefacts that cannot import TypeScript agree with the constants', () => {
  it('action.yml pr-labels default is the sync label set', () => {
    const actionYml = fs.readFileSync(path.join(ROOT, 'action.yml'), 'utf8');
    expect(actionYml).toContain(`default: '${SYNC_PR_LABELS.join(',')}'`);
  });

  it('action.yml claude-model default is DEFAULT_CLAUDE_MODEL', () => {
    const actionYml = fs.readFileSync(path.join(ROOT, 'action.yml'), 'utf8');
    expect(actionYml).toContain(`default: '${DEFAULT_CLAUDE_MODEL}'`);
  });

  it('the auto-merge-mode input description names every valid mode', () => {
    // Scoped to the input's own block — the description also mentions
    // "active" deliberately (the mode that fails loudly), so whole-file
    // exactness is neither achievable nor the contract. What must hold is
    // that every mode the code accepts is documented where the input is.
    const actionYml = fs.readFileSync(path.join(ROOT, 'action.yml'), 'utf8');
    const block = actionYml.match(/^ {2}auto-merge-mode:\n(?: {4}.*\n)+/m)?.[0];
    expect(block).toBeDefined();
    for (const mode of AUTO_MERGE_MODES) {
      expect(block).toContain(`"${mode}"`);
    }
  });

  it('the canonical review workflow gates on the trigger label in both clauses', () => {
    const template = fs.readFileSync(
      path.join(ROOT, 'examples', 'review-translations.yml'),
      'utf8'
    );
    expect(template).toContain(
      `contains(github.event.pull_request.labels.*.name, '${REVIEW_TRIGGER_LABEL}')`
    );
    expect(template).toContain(`github.event.label.name == '${REVIEW_TRIGGER_LABEL}'`);
  });

  it('the written spec names every label the code owns', () => {
    const spec = fs.readFileSync(path.join(ROOT, 'docs', 'user', 'metadata-contract.md'), 'utf8');
    for (const label of [...TARGET_REPO_LABELS, FAILURE_ISSUE_LABEL]) {
      expect(spec).toContain(`\`${label}\``);
    }
  });
});

/**
 * Deterministic diff checks (#148).
 *
 * These replace two of the four model-asserted `diffChecks` booleans, so the
 * property that matters is that they are computable from the documents alone
 * and cannot be talked out of a failure. The second property is that they do
 * not gate documents production actually contains — a new engine false-gate
 * would be strictly worse than the model false-gate being removed.
 */

import { MystParser } from '../parser.js';
import {
  checkStructurePreserved,
  checkHeadingMapCorrect,
  runDeterministicDiffChecks,
  ReviewedFilePair,
} from '../diff-checks.js';

const parser = new MystParser();

const SOURCE = `# Aiyagari

Intro.

## Model

Source text.

### Details

More.
`;

/** A realistically-shaped target: frontmatter heading map, translated prose. */
const TARGET = `---
translation:
  title: 艾亚加里
  headings:
    Model: 模型
    Model::Details: 细节
---

# 艾亚加里

介绍。

## 模型

译文。

### 细节

更多。
`;

function pair(source: string, target: string, filename = 'lectures/aiyagari.md'): ReviewedFilePair {
  return { filename, source, target };
}

describe('checkStructurePreserved', () => {
  it('passes a faithful translation', async () => {
    const result = await checkStructurePreserved(parser, [pair(SOURCE, TARGET)]);

    expect(result.passed).toBe(true);
    expect(result.details).toEqual([]);
  });

  it('fails when the target flattens a heading level', async () => {
    const flattened = TARGET.replace('### 细节', '## 细节');

    const result = await checkStructurePreserved(parser, [pair(SOURCE, flattened)]);

    expect(result.passed).toBe(false);
    expect(result.details.join()).toContain('heading level sequence differs');
  });

  it('fails when the target drops a section entirely', async () => {
    const truncated = TARGET.replace('### 细节\n\n更多。\n', '');

    const result = await checkStructurePreserved(parser, [pair(SOURCE, truncated)]);

    expect(result.passed).toBe(false);
  });

  it('fails when a directive argument is stripped (the #119 shape)', async () => {
    const source = `# T\n\n\`\`\`{raw} jupyter\n<br>\n\`\`\`\n`;
    const target = `# T\n\n\`\`\`{raw}\n<br>\n\`\`\`\n`;

    const result = await checkStructurePreserved(parser, [pair(source, target)]);

    expect(result.passed).toBe(false);
  });

  it('reports the filename so a multi-file PR is actionable', async () => {
    const flattened = TARGET.replace('### 细节', '## 细节');

    const result = await checkStructurePreserved(parser, [
      pair(SOURCE, flattened, 'lectures/x.md'),
    ]);

    expect(result.details.join()).toContain('lectures/x.md');
  });
});

describe('checkHeadingMapCorrect', () => {
  it('passes when the recorded map matches the documents', async () => {
    const result = await checkHeadingMapCorrect(parser, [pair(SOURCE, TARGET)]);

    expect(result.passed).toBe(true);
  });

  it('fails when the frontmatter has no map at all', async () => {
    const noMap = TARGET.replace(/^---\n[\s\S]*?\n---\n\n/, '');

    const result = await checkHeadingMapCorrect(parser, [pair(SOURCE, noMap)]);

    expect(result.passed).toBe(false);
    expect(result.details.join()).toContain('no heading map');
  });

  it('fails when an entry is missing', async () => {
    const partial = TARGET.replace('    Model::Details: 细节\n', '');

    const result = await checkHeadingMapCorrect(parser, [pair(SOURCE, partial)]);

    expect(result.passed).toBe(false);
    expect(result.details.join()).toContain('Details');
  });

  it('fails when an entry disagrees with the body heading', async () => {
    const stale = TARGET.replace('    Model: 模型', '    Model: 旧模型');

    const result = await checkHeadingMapCorrect(parser, [pair(SOURCE, stale)]);

    expect(result.passed).toBe(false);
    expect(result.details.join()).toContain('旧模型');
  });

  // Frontmatter values and body headings legitimately disagree on typography —
  // applyTypography and scripts/typography/apply.mjs typeset them independently.
  // Gating on that would fail every French PR.
  it('tolerates typography differences between map value and heading', async () => {
    const source = `# T\n\n## Solution\n\nx\n`;
    const target =
      // The frontmatter value carries a non-breaking space before the colon
      // while the body heading has a plain one — real French output, both
      // shapes, and normalizeHeadingForMatch folds them together.
      `---\ntranslation:\n  headings:\n    Solution: "Solution\u00A0: la voilà"\n---\n\n` +
      `# T\n\n## Solution : la voilà\n\nx\n`;

    const result = await checkHeadingMapCorrect(parser, [pair(source, target)]);

    expect(result.passed).toBe(true);
  });

  it('does not require a map for a document with no sections', async () => {
    const source = `# Title only\n\nJust prose.\n`;
    const target = `# 仅标题\n\n只是散文。\n`;

    const result = await checkHeadingMapCorrect(parser, [pair(source, target)]);

    expect(result.passed).toBe(true);
  });
});

describe('runDeterministicDiffChecks', () => {
  it('reports both checks for a clean pair', async () => {
    const result = await runDeterministicDiffChecks(parser, [pair(SOURCE, TARGET)]);

    expect(result.structurePreserved.passed).toBe(true);
    expect(result.headingMapCorrect.passed).toBe(true);
  });

  it('treats a check that throws as failed, not skipped', async () => {
    // A guard that vanishes when it errors is the defect class this module
    // exists to remove, so the error path must gate rather than pass.
    const exploding = {
      parseSections: async () => {
        throw new Error('parser exploded');
      },
    } as unknown as MystParser;

    const result = await runDeterministicDiffChecks(exploding, [pair(SOURCE, TARGET)]);

    expect(result.structurePreserved.passed).toBe(false);
    expect(result.structurePreserved.details.join()).toContain('parser exploded');
    expect(result.headingMapCorrect.passed).toBe(false);
  });

  it('passes vacuously when no file pair could be assembled', async () => {
    // Source fetch failures are gated separately by `sourceContentMissing`;
    // these checks must not double-gate on the same condition.
    const result = await runDeterministicDiffChecks(parser, []);

    expect(result.structurePreserved.passed).toBe(true);
    expect(result.headingMapCorrect.passed).toBe(true);
  });
});

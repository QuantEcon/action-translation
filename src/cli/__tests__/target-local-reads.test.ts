/**
 * Tests for target-local data read detection, pinning, and verification (#107).
 *
 * The fixture lines mirror the real defect: lecture-intro.zh-cn's
 * long_run_growth.md reads country_code_cn.csv (target-only) and the 2026-07-22
 * validation wave showed the resync reverting that read to the source's
 * English derivation.
 */

import {
  extractDataFileReads,
  classifyTargetLocalReads,
  buildPreserveInstruction,
  verifyPreservedReads,
  DataFileRead,
} from '../target-local-reads.js';

const DOC = `---
title: test
---

# 长期增长

Some prose mentioning "data.csv" outside any code cell.

\`\`\`{code-cell} ipython3
code_to_name = pd.read_csv("../lectures/datasets/country_code_cn.csv").set_index('code')
shared = pd.read_csv("datasets/gdp.csv")
remote = pd.read_csv("https://example.org/remote.csv")
config = json.load(open('mappings/labels_cn.json'))
\`\`\`

\`\`\`python
ignored = pd.read_csv("plain-fence.csv")
\`\`\`
`;

describe('extractDataFileReads', () => {
  const reads = extractDataFileReads(DOC);

  it('finds quoted data paths inside {code-cell} fences only', () => {
    const basenames = reads.map((r) => r.basename);
    expect(basenames).toContain('country_code_cn.csv');
    expect(basenames).toContain('gdp.csv');
    expect(basenames).toContain('labels_cn.json');
    // Prose mention and plain (non-code-cell) fence are not code reads
    expect(basenames).not.toContain('data.csv');
    expect(basenames).not.toContain('plain-fence.csv');
  });

  it('excludes URLs — remote files are not repo assets', () => {
    expect(reads.map((r) => r.basename)).not.toContain('remote.csv');
  });

  it('captures the full trimmed line for pinning', () => {
    const csvRead = reads.find((r) => r.basename === 'country_code_cn.csv');
    expect(csvRead?.line).toBe(
      `code_to_name = pd.read_csv("../lectures/datasets/country_code_cn.csv").set_index('code')`
    );
  });
});

describe('classifyTargetLocalReads', () => {
  const reads = extractDataFileReads(DOC);
  const targetHas = (b: string) => ['country_code_cn.csv', 'gdp.csv', 'labels_cn.json'].includes(b);
  const sourceHas = (b: string) => b === 'gdp.csv'; // shared dataset exists upstream

  it('keeps only reads whose file exists in target and not in source', () => {
    const local = classifyTargetLocalReads(reads, targetHas, sourceHas);
    expect(local.map((r) => r.basename).sort()).toEqual(['country_code_cn.csv', 'labels_cn.json']);
  });

  it('dedupes repeated lines', () => {
    const dup: DataFileRead[] = [
      { line: 'x = read("a_cn.csv")', basename: 'a_cn.csv' },
      { line: 'x = read("a_cn.csv")', basename: 'a_cn.csv' },
    ];
    const local = classifyTargetLocalReads(
      dup,
      () => true,
      () => false
    );
    expect(local).toHaveLength(1);
  });
});

describe('buildPreserveInstruction', () => {
  it('returns empty string for no reads', () => {
    expect(buildPreserveInstruction([])).toBe('');
  });

  it('names every pinned line and states the byte-for-byte requirement', () => {
    const instruction = buildPreserveInstruction([
      {
        line: 'code_to_name = pd.read_csv("country_code_cn.csv")',
        basename: 'country_code_cn.csv',
      },
    ]);
    expect(instruction).toContain('ONLY in the translation repository');
    expect(instruction).toContain('byte-for-byte');
    expect(instruction).toContain('code_to_name = pd.read_csv("country_code_cn.csv")');
  });
});

describe('verifyPreservedReads', () => {
  const reads: DataFileRead[] = [
    {
      line: `code_to_name = pd.read_csv("../lectures/datasets/country_code_cn.csv").set_index('code')`,
      basename: 'country_code_cn.csv',
    },
  ];

  it('passes when the pinned line survives (any indentation)', () => {
    const output = `intro\n    code_to_name = pd.read_csv("../lectures/datasets/country_code_cn.csv").set_index('code')\nrest`;
    expect(verifyPreservedReads(output, reads)).toEqual([]);
  });

  it('reports the exact missing line on a revert — the observed defect', () => {
    const reverted = `code_to_name = data[\n    ['countrycode', 'country']].drop_duplicates()`;
    const missing = verifyPreservedReads(reverted, reads);
    expect(missing).toHaveLength(1);
    expect(missing[0]).toContain('country_code_cn.csv');
  });

  it('is a no-op with no pinned reads', () => {
    expect(verifyPreservedReads('anything', [])).toEqual([]);
  });
});

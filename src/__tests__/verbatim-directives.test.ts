import {
  applyVerbatimDirectives,
  extractVerbatimBlocks,
  findVerbatimViolations,
  hasVerbatimDirectivePolicy,
} from '../verbatim-directives.js';
import { checkVerbatimDirectives, runDeterministicDiffChecks } from '../diff-checks.js';
import { MystParser } from '../parser.js';

const SOURCE = [
  '---',
  'jupytext: {}',
  '---',
  '# Functions',
  '',
  'Some prose.',
  '',
  '```{exercise-start}',
  ':label: ex1',
  '```',
  '',
  'Write a function `factorial` such that `factorial(n)` returns $n!$.',
  '',
  '```{code-cell} python3',
  '# ```{hint} inside a cell is code, not a directive',
  'x = 1',
  '```',
  '',
  '```{hint}',
  'Use a loop.',
  '```',
  '',
  '```{exercise-end}',
  '```',
  '',
  '```{solution-start} ex1',
  ':class: dropdown',
  '```',
  '',
  "Here's one solution:",
  '',
  '```{solution-end}',
  '```',
  '',
  ':::{exercise}',
  ':label: ex2',
  'Colon-fenced exercise body.',
  ':::',
  '',
  'Trailing prose.',
  '',
].join('\n');

function translated(replacements: Record<string, string>): string {
  let out = SOURCE;
  for (const [from, to] of Object.entries(replacements)) out = out.replace(from, to);
  return out;
}

describe('extractVerbatimBlocks', () => {
  it('finds gated, simple and colon-fenced blocks as outermost regions', () => {
    const blocks = extractVerbatimBlocks(SOURCE);
    expect(blocks.map((b) => b.kind)).toEqual(['exercise-start', 'solution-start', 'exercise']);
    const lines = SOURCE.split('\n');
    expect(lines[blocks[0].start]).toBe('```{exercise-start}');
    expect(lines[blocks[0].end]).toBe('```');
    expect(lines[blocks[0].end - 1]).toBe('```{exercise-end}');
    expect(lines[blocks[2].start]).toBe(':::{exercise}');
    expect(lines[blocks[2].end]).toBe(':::');
  });

  it('does not open a region on a directive-looking line inside a code cell', () => {
    const doc = ['```{code-cell}', '```{hint}', 'not a hint', '```', ''].join('\n');
    expect(extractVerbatimBlocks(doc)).toEqual([]);
  });

  it('drops an unterminated region', () => {
    const doc = ['```{exercise-start}', '```', 'never closed', ''].join('\n');
    expect(extractVerbatimBlocks(doc)).toEqual([]);
  });
});

describe('applyVerbatimDirectives', () => {
  const drifted = translated({
    'Write a function `factorial`': '`factorial` എന്ന് പേരുള്ള ഒരു function എഴുതുക',
    'Use a loop.': 'ഒരു loop ഉപയോഗിക്കുക.',
    'Colon-fenced exercise body.': 'Colon-fenced exercise body-യുടെ വിവർത്തനം.',
    'Some prose.': 'കുറച്ച് prose.',
  });

  it('is a no-op for languages without the policy', () => {
    expect(hasVerbatimDirectivePolicy('zh-cn')).toBe(false);
    const r = applyVerbatimDirectives(SOURCE, drifted, 'zh-cn');
    expect(r.content).toBe(drifted);
    expect(r.replaced).toBe(0);
  });

  it('restores every family block from the source for ml and leaves prose alone', () => {
    expect(hasVerbatimDirectivePolicy('ml')).toBe(true);
    const r = applyVerbatimDirectives(SOURCE, drifted, 'ml');
    expect(r.mismatch).toBeNull();
    expect(r.replaced).toBe(2); // exercise-start region (hint rides inside) + colon exercise
    expect(r.content).toContain('കുറച്ച് prose.');
    expect(r.content).toContain('Write a function `factorial`');
    expect(r.content).toContain('Use a loop.');
    expect(r.content).toContain('Colon-fenced exercise body.');
    expect(findVerbatimViolations(SOURCE, r.content)).toEqual([]);
  });

  it('is idempotent and leaves a compliant document byte-identical', () => {
    const r = applyVerbatimDirectives(SOURCE, SOURCE, 'ml');
    expect(r.content).toBe(SOURCE);
    expect(r.replaced).toBe(0);
  });

  it('refuses to guess when the block sequence differs', () => {
    const missing = SOURCE.replace(
      ':::{exercise}\n:label: ex2\nColon-fenced exercise body.\n:::\n',
      ''
    );
    const r = applyVerbatimDirectives(SOURCE, missing, 'ml');
    expect(r.content).toBe(missing);
    expect(r.replaced).toBe(0);
    expect(r.mismatch).toMatch(/block sequence differs/);
  });
});

describe('findVerbatimViolations / checkVerbatimDirectives', () => {
  it('names each divergent block with its target line', () => {
    const drifted = translated({ 'Use a loop.': 'ഒരു loop ഉപയോഗിക്കുക.' });
    const v = findVerbatimViolations(SOURCE, drifted);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatch(/\{exercise-start\} block at target line 8/);
  });

  it('passes for a language without the policy, fails for ml with details', async () => {
    const drifted = translated({ 'Use a loop.': 'ഒരു loop ഉപയോഗിക്കുക.' });
    const pairs = [{ filename: 'lectures/functions.md', source: SOURCE, target: drifted }];
    expect((await checkVerbatimDirectives(pairs, 'zh-cn')).passed).toBe(true);
    expect((await checkVerbatimDirectives(pairs, undefined)).passed).toBe(true);
    const ml = await checkVerbatimDirectives(pairs, 'ml');
    expect(ml.passed).toBe(false);
    expect(ml.details[0]).toMatch(/lectures\/functions\.md: \{exercise-start\} block/);
  });

  it('is carried by runDeterministicDiffChecks only when a policy language is given', async () => {
    const parser = new MystParser();
    const pairs = [{ filename: 'a.md', source: SOURCE, target: SOURCE }];
    const plain = await runDeterministicDiffChecks(parser, pairs);
    expect(plain.verbatimDirectives).toBeUndefined();
    const ml = await runDeterministicDiffChecks(parser, pairs, 'ml');
    expect(ml.verbatimDirectives?.passed).toBe(true);
  });
});

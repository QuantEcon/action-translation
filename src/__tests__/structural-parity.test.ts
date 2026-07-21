/**
 * Structural parity guard (#119, #65; ordering in #120 P0).
 *
 * Each confirmed production defect in the silent-corruption class appears here
 * as a test named for its issue, using the defect's actual shape. The
 * legitimate-translation cases (admonition titles, prf: titles) are tested
 * just as hard — a guard that cries wolf on every translated title would be
 * disabled within a week, which is worse than no guard.
 */

import {
  extractStructuralTokens,
  checkStructuralParity,
  formatParityViolations,
} from '../structural-parity.js';

describe('extractStructuralTokens', () => {
  it('collects top-level directives with name and argument', () => {
    const doc = [
      '# Title',
      '',
      '```{code-cell} ipython3',
      'x = 1',
      '```',
      '',
      '```{raw} jupyter',
      '<div></div>',
      '```',
    ].join('\n');

    const tokens = extractStructuralTokens(doc);
    expect(tokens.directives).toEqual([
      { name: 'code-cell', arg: 'ipython3', line: 3 },
      { name: 'raw', arg: 'jupyter', line: 7 },
    ]);
  });

  it('collects target anchors and ignores anchor-like prose', () => {
    const doc = [
      '(sec:intro)=',
      '# Intro',
      '',
      'Some (parenthetical)= looking text with spaces (a b)=',
      '',
      '(fig-cobweb)=',
    ].join('\n');

    const tokens = extractStructuralTokens(doc);
    expect(tokens.anchors.map((a) => a.label)).toEqual(['sec:intro', 'fig-cobweb']);
  });

  it('is blind inside open fences — quoted directive examples do not count', () => {
    // Documentation that SHOWS directive syntax inside a plain code fence must
    // not register: it is content, not structure.
    const doc = [
      '````',
      '```{code-cell} ipython3',
      'quoted example',
      '```',
      '````',
      '',
      '```{note}',
      'real directive',
      '```',
    ].join('\n');

    const tokens = extractStructuralTokens(doc);
    expect(tokens.directives.map((d) => d.name)).toEqual(['note']);
  });

  it('does not record anchors inside fences', () => {
    const doc = ['```', '(not-an-anchor)=', '```', '(real)='].join('\n');
    expect(extractStructuralTokens(doc).anchors.map((a) => a.label)).toEqual(['real']);
  });

  it('handles tilde fences', () => {
    const doc = ['~~~{warning}', 'body', '~~~'].join('\n');
    expect(extractStructuralTokens(doc).directives).toEqual([
      { name: 'warning', arg: '', line: 1 },
    ]);
  });
});

describe('checkStructuralParity — the confirmed defect shapes', () => {
  const SOURCE = [
    '(sec:model)=',
    '# The Model',
    '',
    '```{raw} jupyter',
    '<div class="cell"></div>',
    '```',
    '',
    '```{code-cell} ipython3',
    'import numpy as np',
    '```',
  ].join('\n');

  it('passes a faithful translation', () => {
    const output = SOURCE.replace('# The Model', '# 模型').replace('import numpy', 'import numpy');
    expect(checkStructuralParity(SOURCE, output).ok).toBe(true);
  });

  it('#119: a stripped directive argument ({raw} jupyter -> {raw}) fails', () => {
    const output = SOURCE.replace('```{raw} jupyter', '```{raw}');
    const result = checkStructuralParity(SOURCE, output);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.message.includes('{raw}'))).toBe(true);
    expect(result.violations.some((v) => v.message.includes('never translated'))).toBe(true);
  });

  it('#65: a dropped (label)= anchor fails, naming the label', () => {
    const output = SOURCE.replace('(sec:model)=\n', '');
    const result = checkStructuralParity(SOURCE, output);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.message.includes('(sec:model)='))).toBe(true);
    expect(result.violations.some((v) => v.message.includes('missing from output'))).toBe(true);
  });

  it('#118: a document wrapped whole in a code fence fails on count', () => {
    // The resync wrapped 1,465 lines in one fence; every real directive
    // becomes invisible content and the top-level sequence collapses.
    const output = '```\n' + SOURCE + '\n```';
    const result = checkStructuralParity(SOURCE, output);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.message.includes('directive count differs'))).toBe(true);
  });

  it('a renamed directive (note -> warning) fails even with args empty', () => {
    const src = '```{note}\nbody\n```';
    const out = '```{warning}\nbody\n```';
    const result = checkStructuralParity(src, out);
    expect(result.ok).toBe(false);
    expect(result.violations[0].message).toContain('name changed');
  });

  it('an invented anchor fails — the output cannot add cross-reference targets', () => {
    const output = SOURCE + '\n(sec:invented)=\n';
    const result = checkStructuralParity(SOURCE, output);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.message.includes('not in source'))).toBe(true);
  });

  it('reordered anchors fail even when the label set matches', () => {
    const src = '(a)=\n# One\n\n(b)=\n## Two';
    const out = '(b)=\n# 一\n\n(a)=\n## 二';
    const result = checkStructuralParity(src, out);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.message.includes('different order'))).toBe(true);
  });

  it('a dropped DUPLICATE anchor is reported as missing, not as reordering', () => {
    // includes()-based diffing would see every label present and mislabel this
    // as "different order". The multiset diff must name the dropped copy.
    const src = '(a)=\n# One\n\n(a)=\n## Two\n\n(b)=\n### Three';
    const out = '(a)=\n# 一\n\n(b)=\n### 三';
    const result = checkStructuralParity(src, out);
    expect(result.ok).toBe(false);
    const anchorViolation = result.violations.find((v) => v.message.includes('anchors diverge'));
    expect(anchorViolation?.message).toContain('missing from output: (a)=');
    expect(anchorViolation?.message).not.toContain('different order');
  });

  it('a duplicated-in-output anchor is reported as not-in-source with its count', () => {
    const src = '(a)=\n# One';
    const out = '(a)=\n# 一\n\n(a)=\n## 二\n\n(a)=\n### 三';
    const result = checkStructuralParity(src, out);
    expect(result.ok).toBe(false);
    const anchorViolation = result.violations.find((v) => v.message.includes('anchors diverge'));
    expect(anchorViolation?.message).toContain('not in source: (a)= ×2');
  });
});

describe('checkStructuralParity — legitimate translation must pass', () => {
  it('a translated admonition title passes (presence matches)', () => {
    const src = '```{admonition} Exercise 1\nTry it.\n```';
    const out = '```{admonition} 练习 1\n试一试。\n```';
    expect(checkStructuralParity(src, out).ok).toBe(true);
  });

  it('a translated prf:theorem title passes', () => {
    const src = '```{prf:theorem} Contraction Mapping\nbody\n```';
    const out = '```{prf:theorem} 压缩映射\nbody\n```';
    expect(checkStructuralParity(src, out).ok).toBe(true);
  });

  it('a DROPPED admonition title still fails — presence must match', () => {
    const src = '```{admonition} Exercise 1\nTry it.\n```';
    const out = '```{admonition}\n试一试。\n```';
    const result = checkStructuralParity(src, out);
    expect(result.ok).toBe(false);
    expect(result.violations[0].message).toContain('lost its argument');
  });

  it('a solution argument is structural — changing it fails', () => {
    // {solution} takes the target exercise's LABEL, not a title.
    const src = '```{solution} ex-cobweb\nbody\n```';
    const out = '```{solution} ex-蛛网\nbody\n```';
    const result = checkStructuralParity(src, out);
    expect(result.ok).toBe(false);
    expect(result.violations[0].message).toContain('argument changed');
  });

  it('an untranslated structural doc passes byte-for-byte', () => {
    const doc = '```{include} _admonition/gpu.md\n```';
    expect(checkStructuralParity(doc, doc).ok).toBe(true);
  });
});

describe('formatParityViolations', () => {
  it('names the file and lists every violation', () => {
    const src = '(a)=\n```{raw} jupyter\nx\n```';
    const out = '```{raw}\nx\n```';
    const result = checkStructuralParity(src, out);
    const text = formatParityViolations('cobweb.md', result);
    expect(text).toContain('cobweb.md');
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
    for (const v of result.violations) {
      expect(text).toContain(v.message);
    }
  });
});

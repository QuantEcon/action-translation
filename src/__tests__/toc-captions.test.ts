/**
 * Tests for TOC part-caption preservation (#254).
 */

import * as yaml from 'js-yaml';
import { mergeTargetCaptions, matchPartsByOverlap } from '../toc-captions.js';

function testLogger(): {
  info: (m: string) => void;
  warning: (m: string) => void;
  messages: { level: string; msg: string }[];
} {
  const messages: { level: string; msg: string }[] = [];
  return {
    messages,
    info: (msg) => messages.push({ level: 'info', msg }),
    warning: (msg) => messages.push({ level: 'warning', msg }),
  };
}

// The house style of every QuantEcon `_toc.yml`: zero-indent sequences, a
// `numbered:` key per part, a comment, a quoted caption and the stray trailing
// spaces the real files carry.  js-yaml re-indents this on a round trip, so
// byte-identity apart from caption lines is the property under test.
const sourceToc = `format: jb-book
root: intro
parts:
- caption: Tools and Techniques
  numbered: true 
  chapters:
  - file: sir_model
  - file: linear_algebra
  - file: qr_decomp
- caption: "Elementary Statistics"
  numbered: true
  chapters:
  - file: prob_matrix  # keep this comment
  - file: lln_clt
- caption: Statistics and Information 
  chapters:
  - file: prob_meaning
`;

const targetToc = `format: jb-book
root: intro
parts:
- caption: 基础工具
  numbered: true
  chapters:
  - file: sir_model
  - file: linear_algebra
  - file: qr_decomp
- caption: 基础统计学
  numbered: true
  chapters:
  - file: prob_matrix
  - file: lln_clt
- caption: 统计与信息论
  chapters:
  - file: prob_meaning
`;

function captionsOf(text: string): string[] {
  const doc = yaml.load(text) as { parts: Array<{ caption: string }> };
  return doc.parts.map((p) => p.caption);
}

describe('mergeTargetCaptions', () => {
  it('carries every target caption forward when membership is unchanged, changing only caption lines', () => {
    const result = mergeTargetCaptions(sourceToc, targetToc);
    expect(result).toBe(
      sourceToc
        .replace('- caption: Tools and Techniques\n', '- caption: 基础工具\n')
        .replace('- caption: "Elementary Statistics"\n', '- caption: 基础统计学\n')
        .replace('- caption: Statistics and Information \n', '- caption: 统计与信息论 \n')
    );
    // Everything that is not a caption line survives byte-for-byte.
    expect(result).toContain('  numbered: true \n');
    expect(result).toContain('  - file: prob_matrix  # keep this comment\n');
    expect(captionsOf(result)).toEqual(['基础工具', '基础统计学', '统计与信息论']);
  });

  it('keeps the caption of a part that gained a lecture (the lecture-adding sync, #254)', () => {
    const source = sourceToc.replace(
      '  - file: qr_decomp\n',
      '  - file: qr_decomp\n  - file: eig_circulant\n'
    );
    const result = mergeTargetCaptions(source, targetToc);
    expect(captionsOf(result)).toEqual(['基础工具', '基础统计学', '统计与信息论']);
    expect(result).toContain('  - file: eig_circulant\n');
  });

  it('keeps the caption of a part that lost a lecture', () => {
    const source = sourceToc.replace('  - file: linear_algebra\n', '');
    expect(captionsOf(mergeTargetCaptions(source, targetToc))).toEqual([
      '基础工具',
      '基础统计学',
      '统计与信息论',
    ]);
  });

  it('keeps the caption of a part whose lectures were reordered', () => {
    const source = sourceToc.replace(
      '  - file: sir_model\n  - file: linear_algebra\n',
      '  - file: linear_algebra\n  - file: sir_model\n'
    );
    expect(captionsOf(mergeTargetCaptions(source, targetToc))[0]).toBe('基础工具');
  });

  it('follows parts that moved position', () => {
    // Source reorders parts 2 and 3; captions must follow membership, not index.
    const source = `format: jb-book
root: intro
parts:
- caption: Tools and Techniques
  chapters:
  - file: sir_model
- caption: Statistics and Information
  chapters:
  - file: prob_meaning
- caption: Elementary Statistics
  chapters:
  - file: prob_matrix
`;
    expect(captionsOf(mergeTargetCaptions(source, targetToc))).toEqual([
      '基础工具',
      '统计与信息论',
      '基础统计学',
    ]);
  });

  it('gives a new part the source caption and warns that it has no counterpart', () => {
    const logger = testLogger();
    const source =
      sourceToc +
      `- caption: Linear Programming\n  chapters:\n  - file: lp_intro\n  - file: opt_transport\n`;
    const result = mergeTargetCaptions(source, targetToc, logger);
    expect(captionsOf(result)).toEqual([
      '基础工具',
      '基础统计学',
      '统计与信息论',
      'Linear Programming',
    ]);
    expect(
      result.endsWith(
        '- caption: Linear Programming\n  chapters:\n  - file: lp_intro\n  - file: opt_transport\n'
      )
    ).toBe(true);
    expect(
      logger.messages.some(
        (m) =>
          m.level === 'warning' &&
          m.msg.includes('"Linear Programming"') &&
          m.msg.includes('no counterpart')
      )
    ).toBe(true);
    expect(logger.messages.some((m) => m.msg.includes('Preserved 3'))).toBe(true);
  });

  it('does not guess from position when a part has no shared files', () => {
    // Same part count, same index, entirely different lectures: attaching the
    // target's caption would label the wrong topic in the reader's language.
    const source = sourceToc.replace('  - file: prob_meaning\n', '  - file: networks\n');
    expect(captionsOf(mergeTargetCaptions(source, targetToc))[2]).toBe(
      'Statistics and Information'
    );
  });

  it('pairs each target part at most once when a source part was split', () => {
    const source = `format: jb-book
root: intro
parts:
- caption: Tools
  chapters:
  - file: sir_model
  - file: linear_algebra
- caption: More Tools
  chapters:
  - file: qr_decomp
- caption: Elementary Statistics
  chapters:
  - file: prob_matrix
  - file: lln_clt
- caption: Statistics and Information
  chapters:
  - file: prob_meaning
`;
    // The larger overlap wins the target caption; the remainder keeps English.
    expect(captionsOf(mergeTargetCaptions(source, targetToc))).toEqual([
      '基础工具',
      'More Tools',
      '基础统计学',
      '统计与信息论',
    ]);
  });

  it('ignores target-only parts (the source is the structural authority)', () => {
    const target = targetToc + `- caption: 只在目标\n  chapters:\n  - file: target_only\n`;
    const result = mergeTargetCaptions(sourceToc, target);
    expect(captionsOf(result)).toEqual(['基础工具', '基础统计学', '统计与信息论']);
    expect(result).not.toContain('target_only');
  });

  it('returns the source by reference when every target caption equals the source (never localised)', () => {
    const logger = testLogger();
    const target = sourceToc.replace(
      '  - file: prob_matrix  # keep this comment\n',
      '  - file: prob_matrix\n'
    );
    expect(mergeTargetCaptions(sourceToc, target, logger)).toBe(sourceToc);
    expect(logger.messages.some((m) => m.level === 'info' && m.msg.includes('not localised'))).toBe(
      true
    );
  });

  it('returns the source by reference when neither side has parts', () => {
    const flat = `format: jb-book\nroot: intro\nchapters:\n- file: a\n- file: b\n`;
    expect(mergeTargetCaptions(flat, flat.replace('- file: b\n', ''))).toBe(flat);
    expect(mergeTargetCaptions(sourceToc, flat)).toBe(sourceToc);
    expect(mergeTargetCaptions(flat, targetToc)).toBe(flat);
  });

  it('returns the source by reference when the target YAML is malformed, and warns', () => {
    const logger = testLogger();
    expect(mergeTargetCaptions(sourceToc, 'parts:\n  - caption: [unclosed\n', logger)).toBe(
      sourceToc
    );
    expect(
      logger.messages.some((m) => m.level === 'warning' && m.msg.includes('Could not parse'))
    ).toBe(true);
  });

  it('quotes a substituted caption only when YAML requires it', () => {
    // The target must itself be valid YAML, so these captions are quoted there.
    const target = targetToc
      .replace('基础工具', "'Outils : bases'")
      .replace('基础统计学', "'Stats #1'");
    const result = mergeTargetCaptions(sourceToc, target);
    expect(result).toContain("- caption: 'Outils : bases'\n");
    expect(result).toContain("- caption: 'Stats #1'\n");
    expect(captionsOf(result).slice(0, 2)).toEqual(['Outils : bases', 'Stats #1']);
  });

  it('skips a commented-out caption line when counting parts', () => {
    const source = sourceToc.replace('parts:\n', 'parts:\n# - caption: Old Part\n');
    const result = mergeTargetCaptions(source, targetToc);
    expect(result).toContain('# - caption: Old Part\n');
    expect(captionsOf(result)).toEqual(['基础工具', '基础统计学', '统计与信息论']);
  });

  it('falls back to re-serialising when the captions cannot be substituted in place', () => {
    // A caption given as a block scalar spans two lines; the line substitution
    // cannot express the change, so the parse-verified fallback must take over
    // and still produce the intended document.
    const source = `format: jb-book
root: intro
parts:
- caption: >-
    Tools and
    Techniques
  chapters:
  - file: sir_model
`;
    const logger = testLogger();
    const result = mergeTargetCaptions(source, targetToc, logger);
    expect(captionsOf(result)).toEqual(['基础工具']);
    expect(yaml.load(result)).toEqual({
      format: 'jb-book',
      root: 'intro',
      parts: [{ caption: '基础工具', chapters: [{ file: 'sir_model' }] }],
    });
    expect(
      logger.messages.some((m) => m.level === 'warning' && m.msg.includes('re-serialising'))
    ).toBe(true);
  });
});

describe('matchPartsByOverlap', () => {
  const s = (...files: string[]) => new Set(files);

  it('prefers the largest overlap and uses each target once', () => {
    const matched = matchPartsByOverlap(
      [s('a', 'b', 'c'), s('c', 'd')],
      [s('a', 'b'), s('c', 'd', 'e')]
    );
    expect([...matched.entries()]).toEqual([
      [0, 0],
      [1, 1],
    ]);
  });

  it('breaks overlap ties by proximity of position', () => {
    const matched = matchPartsByOverlap([s('x'), s('x', 'y')], [s('y', 'x'), s('x')]);
    // (1,0) has overlap 2 and wins first; source 0 then takes the remaining target 1.
    expect(matched.get(1)).toBe(0);
    expect(matched.get(0)).toBe(1);
  });

  it('leaves parts with no shared files unmatched', () => {
    expect(matchPartsByOverlap([s('a'), s('b')], [s('a'), s('z')]).has(1)).toBe(false);
  });
});

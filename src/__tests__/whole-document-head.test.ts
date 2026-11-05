/**
 * The head region and the front-matter rule (#326, #288): `restoreHead`, which
 * takes a whole-document translation's front matter and pre-title from the
 * request's documents, and `checkFrontMatter` / `checkWrittenDocument`, which
 * every write path runs on the bytes it writes.
 *
 * Each damaged head below is one a written file or a draw has shown:
 * - front matter dropped, the anchor moved above the H1 (fr, 2026-09-23, #326);
 * - commentary, then the model's own front matter (Haiku 5.5, `cobweb`);
 * - a second front matter wrapped in a stray code-cell fence, with a `#` code
 *   comment taken for the title (Haiku 5.5, `commod_price`);
 * - a second block below the first without its opening `---` (`hoist_failure`,
 *   2026-08-20), and one whose heading map does not parse (`ge_arrow`, 2026-10-09);
 * - a code-fence wrapper the unwrap declines (```` ```text ````), whose closing
 *   line the head restore leaves as the document's last (#363's capture).
 */

import { checkStructuralParity } from '../structural-parity.js';
import {
  checkFenceEnd,
  checkFrontMatter,
  checkWrittenDocument,
  restoreHead,
  unwrapDocumentFence,
} from '../whole-document.js';

const FRONT_MATTER = `---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
kernelspec:
  display_name: Python 3
  language: python
  name: python3
---`;

const PRE_TITLE = `(python_essentials)=
\`\`\`{raw} jupyter
<div id="qe-notebook-header" align="right" style="text-align:right;">
</div>
\`\`\``;

const SOURCE = `${FRONT_MATTER}

${PRE_TITLE}

# Python Essentials

## Data Types

Computer programs typically keep track of a range of data types.

\`\`\`{code-cell} python3
# a comment, not a title
x = True
\`\`\`
`;

/** The model's text from its H1 on. */
const BODY = `# Les bases de Python

## Types de données

Les programmes informatiques manipulent toute une gamme de types de données.

\`\`\`{code-cell} python3
# un commentaire, pas un titre
x = True
\`\`\`
`;

/** What a faithful draw returns: the source's head, then the translation. */
const FAITHFUL = `${FRONT_MATTER}

${PRE_TITLE}

${BODY}`;

describe('restoreHead', () => {
  it('leaves a draw that kept the head as it is', () => {
    expect(restoreHead(FAITHFUL, SOURCE)).toEqual({ text: FAITHFUL, replaced: false });
  });

  it('restores front matter the model dropped, and the anchor it moved above the H1', () => {
    const draw = `\`\`\`{raw} jupyter
<div id="qe-notebook-header" align="right" style="text-align:right;">
</div>
\`\`\`

(python_essentials)=
${BODY}`;

    expect(restoreHead(draw, SOURCE)).toEqual({ text: FAITHFUL, replaced: true });
  });

  it('drops commentary and the model’s own front matter above the title', () => {
    const draw = `I'm going to translate this document now, following the rules and the glossary.

---
jupytext:
  text_representation:
    format_name: myst
---

${PRE_TITLE}

${BODY}`;

    expect(restoreHead(draw, SOURCE)).toEqual({ text: FAITHFUL, replaced: true });
  });

  it('finds the real H1 past a stray fence, never a code comment', () => {
    // commod_price: the parser took this comment for the title, and wrote it
    // into translation.title.
    const draw = `\`\`\`{code-cell} ipython3
---
jupytext:
  text_representation:
    format_name: myst
---
# 将价格数组转换为价格函数
\`\`\`

${BODY}`;

    expect(restoreHead(draw, SOURCE)?.text).toBe(FAITHFUL);
  });

  it('keeps the head byte for byte, blank lines and an anchor right above the H1 included', () => {
    const source = `${FRONT_MATTER}


(intro)=
# Introduction

Text.
`;
    const draw = '# Introducción\n\nTexto.\n';

    expect(restoreHead(draw, source)?.text).toBe(`${FRONT_MATTER}\n\n\n(intro)=\n${draw}`);
  });

  it('is idempotent', () => {
    const once = restoreHead(BODY, SOURCE)!;
    expect(restoreHead(once.text, SOURCE)).toEqual({ text: once.text, replaced: false });
  });

  it('gives null when either side has no H1, so the output is written as it is', () => {
    expect(restoreHead('Texte sans titre.\n', SOURCE)).toBeNull();
    expect(restoreHead(BODY, '```{admonition} GPU\nText.\n```\n')).toBeNull();
    // A `#` line inside a fence is not an H1.
    expect(restoreHead('```python\n# not a title\n```\n', SOURCE)).toBeNull();
  });

  it('for a resync, keeps the existing translation’s front matter and takes the pre-title from the source', () => {
    const target = `---
jupytext:
  text_representation:
    format_name: myst
  jupytext_version: 1.16.1
kernelspec:
  name: python3
translation:
  title: Les bases de Python
---

${BODY}`;
    // The model's resync moved the anchor below the {raw} block.
    const merged = target.replace(
      BODY,
      `\`\`\`{raw} jupyter\n</div>\n\`\`\`\n\n(python_essentials)=\n${BODY}`
    );

    const restored = restoreHead(merged, SOURCE, merged);

    expect(restored?.replaced).toBe(true);
    expect(restored?.text).toBe(target.replace(BODY, `${PRE_TITLE}\n\n${BODY}`));
  });

  it('for a resync of a page with no front matter, starts with the pre-title', () => {
    const source = '(about)=\n# About\n\nText.\n';
    const merged = '---\n# À propos\n\nTexte.\n';

    expect(restoreHead(merged, source, merged)?.text).toBe('(about)=\n# À propos\n\nTexte.\n');
  });
});

describe('checkFrontMatter', () => {
  it('accepts one front-matter block that keeps the source’s notebook keys', () => {
    expect(checkFrontMatter(SOURCE, FAITHFUL)).toEqual([]);
  });

  it('refuses a front matter holding only `translation:` (#326)', () => {
    const written = `---\ntranslation:\n  title: Les bases de Python\n---\n\n${PRE_TITLE}\n\n${BODY}`;

    expect(checkFrontMatter(SOURCE, written).map((v) => v.message)).toEqual([
      expect.stringMatching(
        /^front matter lost `jupytext` and `kernelspec`, which the source's has/
      ),
    ]);
  });

  it('refuses a second block below the first that was never opened (hoist_failure)', () => {
    const written = `${FRONT_MATTER}
jupytext:
  text_representation:
    format_name: myst
kernelspec:
  name: python3
translation:
  title: old
---

${BODY}`;

    const violations = checkFrontMatter(SOURCE, written);

    expect(violations).toHaveLength(1);
    expect(violations[0].message).toMatch(
      /^front-matter key `jupytext:` at output line 11 is outside the front matter \(3 such lines\)/
    );
  });

  it('refuses a second block whose YAML does not parse, below model commentary (ge_arrow)', () => {
    const written = `${FRONT_MATTER}

I'll produce a comprehensive rewrite of this document given the extensive changes in the source.

---
jupytext:
  text_representation:
    format_name: myst
translation:
  headings:
    Examples::Example 1: a constant aggregate endowment: 示例 1
---

${BODY}`;

    expect(checkFrontMatter(SOURCE, written)).toHaveLength(1);
  });

  it('refuses a front matter that was opened and never closed', () => {
    const written = `${FRONT_MATTER.replace(/\n---$/, '')}\n\n${BODY}`;

    expect(checkFrontMatter(SOURCE, written).map((v) => v.message)).toEqual([
      expect.stringMatching(/^front-matter key `jupytext:` at output line 2 .* unclosed/),
      expect.stringMatching(/^front matter lost `jupytext` and `kernelspec`/),
    ]);
  });

  it('ignores front-matter keys inside a code fence', () => {
    const written = FAITHFUL.replace(
      'x = True',
      'x = True\n```\n\n```yaml\nkernelspec:\n  name: python3'
    );

    expect(checkFrontMatter(SOURCE, written)).toEqual([]);
  });

  it('asks nothing of a page whose source has no front matter', () => {
    const source = '# About\n\nText.\n';
    expect(checkFrontMatter(source, '# À propos\n\nTexte.\n')).toEqual([]);
    expect(
      checkFrontMatter(source, '---\ntranslation:\n  title: À propos\n---\n\n# À propos\n')
    ).toEqual([]);
  });
});

describe('checkFenceEnd', () => {
  /** FAITHFUL ends in a newline, so this is the 1-based line just past it. */
  const LAST_LINE = FAITHFUL.split('\n').length;

  it('refuses the closing line of a wrapper the unwrap declined, which the head restore leaves last', () => {
    // A ```text wrapper is closed by the {raw} block's closing fence, so the
    // restore finds the H1 and replaces the head, wrapper line and all; the
    // wrapper's closing line then opens a fence that runs to the end.
    const draw = '```text\n' + FAITHFUL + '```';
    const restored = restoreHead(draw, SOURCE)?.text;
    expect(restored).toBe(FAITHFUL + '```');

    // What the guard saw before this rule: nothing.
    expect(checkStructuralParity(SOURCE, restored!).ok).toBe(true);
    expect(checkFrontMatter(SOURCE, restored!)).toEqual([]);

    const violations = checkFenceEnd(SOURCE, restored!);
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toMatch(
      new RegExp(`^output ends inside the fence opened at output line ${LAST_LINE}, `)
    );
    expect(checkWrittenDocument(SOURCE, restored!).ok).toBe(false);
  });

  it('passes the same wrapper never closed, which the head restore alone repairs', () => {
    const restored = restoreHead('```text\n' + FAITHFUL.trimEnd(), SOURCE)?.text;
    expect(restored).toBe(FAITHFUL.trimEnd());
    expect(checkWrittenDocument(SOURCE, restored!)).toEqual({ ok: true, violations: [] });
  });

  it('refuses a document whose last closing fence was left out, naming the line that opened it', () => {
    const cut = FAITHFUL.replace(/```\n$/, '');
    const opened = cut.split('\n').indexOf('```{code-cell} python3') + 1;

    expect(checkStructuralParity(SOURCE, cut).ok).toBe(true);
    expect(checkFenceEnd(SOURCE, cut)[0]?.message).toMatch(
      new RegExp(`^output ends inside the fence opened at output line ${opened}, `)
    );
  });

  it('asks nothing of a document whose source ends inside a fence too', () => {
    const source = SOURCE.replace(/```\n$/, '');
    expect(checkFenceEnd(source, FAITHFUL.replace(/```\n$/, ''))).toEqual([]);
    expect(checkFenceEnd(source, FAITHFUL)).toEqual([]);
  });

  it('passes a faithful translation', () => {
    expect(checkFenceEnd(SOURCE, FAITHFUL)).toEqual([]);
  });
});

describe('the head restore after the unwrap', () => {
  it('writes the source’s head when the front matter opened with a fence in place of `---` (#363’s capture)', () => {
    // The response the capture saw: no wrapper, but its first line a fence
    // where the front matter's `---` belongs, and its last line the document's
    // own closing fence. The unwrap reads it as a wrapper never closed.
    const draw = FAITHFUL.replace(/^---\n/, '```\n');
    const unwrapped = unwrapDocumentFence(draw, [SOURCE]);
    expect(unwrapped.unwrapped).toBe(true);
    expect(unwrapped.text.startsWith('jupytext:\n')).toBe(true);

    // Parity passes the front matter without its opening line; the
    // front-matter rule refuses it, for a page the restore cannot reach.
    expect(checkStructuralParity(SOURCE, unwrapped.text).ok).toBe(true);
    expect(checkFrontMatter(SOURCE, unwrapped.text)).not.toEqual([]);

    const restored = restoreHead(unwrapped.text, SOURCE);
    expect(restored).toEqual({ text: FAITHFUL.trimEnd(), replaced: true });
    expect(checkWrittenDocument(SOURCE, restored!.text)).toEqual({ ok: true, violations: [] });
  });
});

describe('checkWrittenDocument', () => {
  it('reports parity and the front-matter rule together', () => {
    const written = `---\ntranslation:\n  title: x\n---\n\n${BODY}`;

    const result = checkWrittenDocument(SOURCE, written);

    expect(result.ok).toBe(false);
    const messages = result.violations.map((v) => v.message);
    // Parity: the anchor and {raw} are gone with the pre-title.
    expect(messages.some((m) => m.includes('(python_essentials)='))).toBe(true);
    expect(messages.some((m) => m.startsWith('front matter lost'))).toBe(true);
  });

  it('passes a faithful translation', () => {
    expect(checkWrittenDocument(SOURCE, FAITHFUL)).toEqual({ ok: true, violations: [] });
  });
});

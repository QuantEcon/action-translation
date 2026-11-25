import { applyTypography, hasTypographyRules } from '../typography.js';

const NBSP = '\u00A0';

describe('applyTypography', () => {
  describe('languages without rules', () => {
    it('leaves content untouched', () => {
      const src = 'Hello! Is this right? Yes: it is.';
      expect(applyTypography(src, 'en')).toBe(src);
      expect(applyTypography(src, 'zh-cn')).toBe(src);
    });

    it('reports which languages have rules', () => {
      expect(hasTypographyRules('fr')).toBe(true);
      expect(hasTypographyRules('en')).toBe(false);
    });
  });

  describe('French high punctuation', () => {
    it.each([
      ['Bonjour !', `Bonjour${NBSP}!`],
      ['Vraiment ?', `Vraiment${NBSP}?`],
      ['Voici :', `Voici${NBSP}:`],
      ['Un ; deux', `Un${NBSP}; deux`],
    ])('inserts NBSP in %p', (src, expected) => {
      expect(applyTypography(src, 'fr')).toBe(expected);
    });

    it('handles the no-space case', () => {
      expect(applyTypography('Bonjour!', 'fr')).toBe(`Bonjour${NBSP}!`);
    });

    it('is idempotent', () => {
      const once = applyTypography('Bonjour ! Ça va ?', 'fr');
      expect(applyTypography(once, 'fr')).toBe(once);
    });

    it('leaves an existing narrow NBSP alone', () => {
      const src = `Bonjour\u202F!`;
      expect(applyTypography(src, 'fr')).toBe(src);
    });

    it('applies before a closing delimiter', () => {
      expect(applyTypography('(Bonjour !)', 'fr')).toBe(`(Bonjour${NBSP}!)`);
    });

    // A run must be spaced once, in front of the group — never split by putting
    // the space between the marks, which corrupts the author's punctuation.
    describe('consecutive high-punctuation runs', () => {
      it.each([
        ['Quoi?!', `Quoi${NBSP}?!`],
        ['Quoi ?!', `Quoi${NBSP}?!`],
        ['Non!!', `Non${NBSP}!!`],
        ['Hein !?', `Hein${NBSP}!?`],
        ['Vraiment ?!?', `Vraiment${NBSP}?!?`],
      ])('spaces %p as a group', (src, expected) => {
        expect(applyTypography(src, 'fr')).toBe(expected);
      });

      it('never inserts a space inside a run', () => {
        const out = applyTypography('Quoi?! Et alors!!', 'fr');
        expect(out).not.toContain(`?${NBSP}!`);
        expect(out).not.toContain(`!${NBSP}!`);
        expect(out).toBe(`Quoi${NBSP}?! Et alors${NBSP}!!`);
      });

      it('is idempotent over runs', () => {
        const once = applyTypography('Quoi?! Non!!', 'fr');
        expect(applyTypography(once, 'fr')).toBe(once);
      });
    });
  });

  // `[^id]: text` / `[label]: url` require the colon immediately after `]`;
  // an inserted NBSP stops the line parsing as a definition (shipped as broken
  // footnotes in the fr seed — pandas.md).
  describe('footnote and link-reference definitions', () => {
    it('never spaces a footnote definition label', () => {
      const src = '[^mung]: Wikipédia définit le munging !';
      expect(applyTypography(src, 'fr')).toBe(`[^mung]: Wikipédia définit le munging${NBSP}!`);
    });

    it('never spaces a link-reference definition label', () => {
      const src = '[pandas]: https://pandas.pydata.org/';
      expect(applyTypography(src, 'fr')).toBe(src);
    });

    it('allows up to three leading spaces on a definition', () => {
      const src = '   [^note]: Texte de la note.';
      expect(applyTypography(src, 'fr')).toBe(src);
    });

    it('repairs a label the earlier transform corrupted', () => {
      const corrupted = `[^mung]${NBSP}: Wikipédia définit le munging${NBSP}!`;
      expect(applyTypography(corrupted, 'fr')).toBe(
        `[^mung]: Wikipédia définit le munging${NBSP}!`
      );
    });

    it('is idempotent over definitions', () => {
      const once = applyTypography('[^a]: Un texte ! Vraiment ?', 'fr');
      expect(applyTypography(once, 'fr')).toBe(once);
    });

    it('still spaces a footnote reference used in prose', () => {
      // Mid-line `[^ref]` followed by ` : ` is prose, not a definition.
      const src = 'Voir la note [^mung] : elle explique tout.';
      expect(applyTypography(src, 'fr')).toBe(`Voir la note [^mung]${NBSP}: elle explique tout.`);
    });

    it('does not collapse a regular space before the colon (prose, not definition)', () => {
      const src = '[Un mot] : une glose.';
      expect(applyTypography(src, 'fr')).toBe(`[Un mot]${NBSP}: une glose.`);
    });
  });

  describe('language lookup is not prototype-polluted', () => {
    // `language` comes from user input (--target-language). An object lookup
    // would resolve Object.prototype.toString and call it as a rule, replacing
    // the document with "[object Undefined]".
    it.each(['toString', 'constructor', 'hasOwnProperty', '__proto__', 'valueOf'])(
      'treats %p as an unknown language and returns content unchanged',
      (lang) => {
        const src = 'Bonjour! Ça va?';
        expect(applyTypography(src, lang)).toBe(src);
        expect(hasTypographyRules(lang)).toBe(false);
      }
    );
  });

  describe('does not corrupt non-prose', () => {
    it('leaves code fences alone', () => {
      const src = [
        'Texte :',
        '',
        '```python',
        'x = a if b else c  # a ? b : c',
        'd = {"k": 1}',
        '```',
      ].join('\n');
      const out = applyTypography(src, 'fr');
      expect(out).toContain('# a ? b : c');
      expect(out).toContain('d = {"k": 1}');
      expect(out).toContain(`Texte${NBSP}:`);
    });

    it('leaves MyST code-cell directives alone', () => {
      const src = [
        '```{code-cell} ipython3',
        'print("ratio: 3:1")',
        'y = x if x > 0 else -x',
        '```',
      ].join('\n');
      expect(applyTypography(src, 'fr')).toBe(src);
    });

    it('leaves inline code alone', () => {
      const src = 'Utilisez `dict(a=1) : valeur` ici !';
      const out = applyTypography(src, 'fr');
      expect(out).toContain('`dict(a=1) : valeur`');
      expect(out).toContain(`ici${NBSP}!`);
    });

    it('leaves math alone', () => {
      const src = 'Soit $\\{x : x > 0\\}$ et donc :\n\n$$\na : b\n$$';
      const out = applyTypography(src, 'fr');
      expect(out).toContain('$\\{x : x > 0\\}$');
      expect(out).toContain('a : b');
      expect(out).toContain(`donc${NBSP}:`);
    });

    it('leaves YAML frontmatter alone', () => {
      const src = [
        '---',
        'title: Introduction',
        'kernelspec:',
        '  name: python3',
        '---',
        '',
        'Bonjour !',
      ].join('\n');
      const out = applyTypography(src, 'fr');
      expect(out).toContain('title: Introduction');
      expect(out).toContain('kernelspec:');
      expect(out).toContain(`Bonjour${NBSP}!`);
    });

    it('leaves URLs and links alone', () => {
      const src = 'Voir [le site](https://example.com/a?b=1&c=2) et https://x.org/p?q=1 !';
      const out = applyTypography(src, 'fr');
      expect(out).toContain('(https://example.com/a?b=1&c=2)');
      expect(out).toContain('https://x.org/p?q=1');
      expect(out).toContain(`!`);
      expect(out).not.toContain(`https${NBSP}:`);
    });

    it('leaves MyST anchors and directive options alone', () => {
      const src = [
        '(sec:intro)=',
        '# Titre',
        '',
        '```{figure} a.png',
        ':width: 100px',
        ':name: fig:one',
        '```',
      ].join('\n');
      const out = applyTypography(src, 'fr');
      expect(out).toContain('(sec:intro)=');
      expect(out).toContain(':width: 100px');
      expect(out).toContain(':name: fig:one');
    });

    it('leaves MyST roles alone', () => {
      const src = 'Voir {doc}`intro <sec:intro>` maintenant !';
      const out = applyTypography(src, 'fr');
      expect(out).toContain('{doc}`intro <sec:intro>`');
      expect(out).toContain(`maintenant${NBSP}!`);
    });

    it('leaves HTML entities alone', () => {
      const src = 'Un &nbsp; espace et &#8212; un tiret !';
      const out = applyTypography(src, 'fr');
      expect(out).toContain('&nbsp;');
      expect(out).toContain('&#8212;');
      expect(out).not.toContain(`&nbsp${NBSP};`);
    });

    it('leaves images alone', () => {
      const src = 'Regardez ![une image](a.png) !';
      const out = applyTypography(src, 'fr');
      expect(out).toContain('![une image](a.png)');
    });

    it('leaves times and ratios alone', () => {
      const src = 'Le ratio 3:1 à 14:30 est correct !';
      const out = applyTypography(src, 'fr');
      expect(out).toContain('3:1');
      expect(out).toContain('14:30');
      expect(out).toContain(`correct${NBSP}!`);
    });

    it('handles ::: colon fences', () => {
      // {note} is a prose directive, so its body IS typeset; a code fence
      // nested inside it is not.
      const src = [
        ':::{note}',
        'Regardez ceci :',
        '',
        '```python',
        'x = a if b else c  # a ? b : c',
        '```',
        ':::',
        '',
        'Fini !',
      ].join('\n');
      const out = applyTypography(src, 'fr');
      expect(out).toContain('x = a if b else c  # a ? b : c');
      expect(out).toContain(`Regardez ceci${NBSP}:`);
      expect(out).toContain(`Fini${NBSP}!`);
    });

    it('leaves a code directive in a ::: fence alone', () => {
      const src = [':::{code-cell} python', 'x = a if b else c  # a ? b : c', ':::'].join('\n');
      expect(applyTypography(src, 'fr')).toBe(src);
    });
  });

  // #325: lines that are not prose although they sit where prose may appear.
  describe('raw HTML literal blocks (#325)', () => {
    // English getting_started.md: the fr edition shipped `width : 70% ;` with
    // U+00A0, which is not CSS whitespace, so the declarations were dropped.
    const styleBlock = [
      '<style>',
      '  .auto {',
      '    width: 70%;',
      '    height: auto;',
      '  }',
      '  .terminal {',
      '    width: 80%;',
      '    height: auto;',
      '  }',
      '</style>',
    ];

    it('leaves a multi-line <style> block byte-identical', () => {
      const src = ['Voici :', '', ...styleBlock, '', 'Fini !'].join('\n');
      const out = applyTypography(src, 'fr');
      expect(out).toContain(styleBlock.join('\n'));
      expect(out).not.toMatch(/width\s+:/);
    });

    it('still typesets prose immediately before and after the block', () => {
      const src = ['Voici :', ...styleBlock, 'Fini !'].join('\n');
      const out = applyTypography(src, 'fr');
      expect(out).toBe([`Voici${NBSP}:`, ...styleBlock, `Fini${NBSP}!`].join('\n'));
    });

    it('leaves a single-line <style> span alone', () => {
      const src = '<style>.a { width: 1px; }</style>';
      expect(applyTypography(src, 'fr')).toBe(src);
    });

    it('masks a one-line <style> span mid-line and typesets the prose around it', () => {
      const src = 'Avant : <style>.a { width: 1px; }</style> après !';
      expect(applyTypography(src, 'fr')).toBe(
        `Avant${NBSP}: <style>.a { width: 1px; }</style> après${NBSP}!`
      );
    });

    it('matches the tag case-insensitively', () => {
      const src = ['<STYLE type="text/css">', 'p { margin: 0; }', '</Style>', 'Fini !'].join('\n');
      expect(applyTypography(src, 'fr')).toBe(
        ['<STYLE type="text/css">', 'p { margin: 0; }', '</Style>', `Fini${NBSP}!`].join('\n')
      );
    });

    it.each(['script', 'pre', 'textarea'])('leaves a <%s> block alone', (tag) => {
      const src = [`<${tag}>`, 'a ? b : c;', 'Quoi !', `</${tag}>`, 'Fini !'].join('\n');
      expect(applyTypography(src, 'fr')).toBe(
        [`<${tag}>`, 'a ? b : c;', 'Quoi !', `</${tag}>`, `Fini${NBSP}!`].join('\n')
      );
    });

    it('leaves a <style> block inside a {note} alone, typesetting the note prose', () => {
      const src = ['```{note}', 'Voici :', ...styleBlock, 'Fini !', '```', 'Après !'].join('\n');
      expect(applyTypography(src, 'fr')).toBe(
        ['```{note}', `Voici${NBSP}:`, ...styleBlock, `Fini${NBSP}!`, '```', `Après${NBSP}!`].join(
          '\n'
        )
      );
    });

    it('treats fences and $$ inside the block as literal text', () => {
      const src = ['<pre>', '```', '$$', 'a : b', '</pre>', 'Fini !'].join('\n');
      expect(applyTypography(src, 'fr')).toBe(
        ['<pre>', '```', '$$', 'a : b', '</pre>', `Fini${NBSP}!`].join('\n')
      );
    });

    it('runs an unclosed block to the end of the document, as CommonMark does', () => {
      const src = ['Avant !', '<style>', 'p { margin: 0; }', '', 'Après !'].join('\n');
      expect(applyTypography(src, 'fr')).toBe(
        [`Avant${NBSP}!`, '<style>', 'p { margin: 0; }', '', 'Après !'].join('\n')
      );
    });

    it('does not take a longer tag name for an opener', () => {
      // `<prefix>` is not `<pre>`; the line is prose with an inline tag.
      expect(applyTypography('<prefix> Voici :', 'fr')).toBe(`<prefix> Voici${NBSP}:`);
    });

    it('leaves a <style> block inside a code fence to the fence', () => {
      const src = ['```html', '<style>', '```', 'Fini !'].join('\n');
      // The fence closes on line 3; `<style>` inside code never opens a block.
      expect(applyTypography(src, 'fr')).toBe(
        ['```html', '<style>', '```', `Fini${NBSP}!`].join('\n')
      );
    });

    it('does not heal an already-damaged <style> block', () => {
      // The edition repair is a separate, one-off PR (#325); the engine only stops
      // writing new damage.
      const damaged = ['<style>', `  width${NBSP}: 70%${NBSP};`, '</style>'].join('\n');
      expect(applyTypography(damaged, 'fr')).toBe(damaged);
    });
  });

  describe('MyST cell breaks (#325)', () => {
    it('leaves a +++ line with JSON metadata alone', () => {
      const src = ['Avant :', '+++ {"user_expressions": []}', 'Après !'].join('\n');
      expect(applyTypography(src, 'fr')).toBe(
        [`Avant${NBSP}:`, '+++ {"user_expressions": []}', `Après${NBSP}!`].join('\n')
      );
    });

    it('leaves a +++ line inside a {note} alone', () => {
      const src = ['```{note}', '+++ {"tags": ["x"]}', 'Voici !', '```'].join('\n');
      expect(applyTypography(src, 'fr')).toBe(
        ['```{note}', '+++ {"tags": ["x"]}', `Voici${NBSP}!`, '```'].join('\n')
      );
    });

    it('leaves a bare +++ alone', () => {
      expect(applyTypography('+++', 'fr')).toBe('+++');
    });
  });

  describe('GFM table delimiter rows (#325)', () => {
    const table = (delimiter: string) =>
      ['Le tableau :', '', '| A | B |', delimiter, '| x : y | z ! |', '', 'Fini !'].join('\n');
    const typesetTable = (delimiter: string) =>
      [
        `Le tableau${NBSP}:`,
        '',
        '| A | B |',
        delimiter,
        `| x${NBSP}: y | z${NBSP}! |`,
        '',
        `Fini${NBSP}!`,
      ].join('\n');

    it.each([
      '| :-: | ---: |',
      '| :--- | ---: |',
      '| :---: | :---: |',
      '| :-: | :-: |',
      '|:--|--:|',
      '|-----|----:|',
      ':-: | --:',
      '   | --- | --- |',
    ])('leaves %p alone and still typesets the rows and prose around it', (delimiter) => {
      expect(applyTypography(table(delimiter), 'fr')).toBe(typesetTable(delimiter));
    });

    it('leaves a delimiter row inside a {note} alone', () => {
      const src = ['```{note}', '| A | B |', '| :-: | ---: |', '```'].join('\n');
      expect(applyTypography(src, 'fr')).toBe(src);
    });

    it.each([
      [`| :-${NBSP}: | :-${NBSP}: |`, '| :-: | :-: |'], // the fr pandas.md row
      [`| :---${NBSP}: | ---\u202F: |`, '| :---: | ---: |'],
    ])('repairs the damaged row %p', (damaged, repaired) => {
      expect(applyTypography(table(damaged), 'fr')).toBe(typesetTable(repaired));
    });

    it('leaves a damaged-looking row inside a code fence alone', () => {
      const src = ['```text', `| :-${NBSP}: |`, '```'].join('\n');
      expect(applyTypography(src, 'fr')).toBe(src);
    });

    it.each([
      // A thematic break and a bare colon-dash run carry no pipe: never repaired,
      // and, holding no words, never spaced either (`:---:` used to become `:---\u00A0:`).
      ['---', '---'],
      [':---:', ':---:'],
      [`:---${NBSP}:`, `:---${NBSP}:`],
      // Prose with a pipe or a dash is still prose.
      ['- item : un', `- item${NBSP}: un`],
      ['a | b : c', `a | b${NBSP}: c`],
      // A thematic break with a stray NBSP is not a delimiter row, so it is not "repaired".
      [`---${NBSP}`, `---${NBSP}`],
    ])('does not treat %p as a delimiter row', (line, expected) => {
      expect(applyTypography(['Avant.', '', line].join('\n'), 'fr')).toBe(
        ['Avant.', '', expected].join('\n')
      );
    });

    it('does not repair a delimiter row in a language without rules', () => {
      const src = `| :-${NBSP}: |`;
      expect(applyTypography(src, 'zh-cn')).toBe(src);
    });
  });

  describe('idempotence over every line class', () => {
    it('applying twice equals applying once', () => {
      const src = [
        '---',
        'title: Essai',
        '---',
        'Voici : un essai ! Vraiment ?',
        '<style>',
        '  .auto { width: 70%; }',
        '</style>',
        '<style>.a { width: 1px; }</style>',
        '+++ {"user_expressions": []}',
        '| A | B |',
        `| :-${NBSP}: | ---: |`,
        '| x : y | z ! |',
        '[^a]: Une note ! Vraiment ?',
        '```{note}',
        '<pre>',
        'a : b',
        '</pre>',
        'Dans la note ?!',
        '```',
      ].join('\n');
      const once = applyTypography(src, 'fr');
      expect(applyTypography(once, 'fr')).toBe(once);
    });
  });

  describe('display math state tracking', () => {
    // Regression: a $$ block opening with content on the same line was missed,
    // so its closing $$ read as an opener and every later line in the file was
    // treated as math. Observed in scipy.md — 2 real occurrences suppressed.
    it('tracks a math block that opens with content on the same line', () => {
      const src = [
        'Par la loi des grands nombres,',
        '',
        '$$ \\mathbb E \\max\\{ S_n - K, 0 \\}',
        '    \\approx',
        '    \\frac{1}{M} \\sum_{m=1}^M \\max \\{S_n^m - K, 0 \\}',
        '    $$',
        '',
        'Voici une solution :',
      ].join('\n');
      const out = applyTypography(src, 'fr');
      expect(out).toContain(`Voici une solution${NBSP}:`);
      expect(out).toContain('$$ \\mathbb E \\max\\{ S_n - K, 0 \\}');
    });

    it('does not let $$ inside a code fence desync math state', () => {
      const src = ['```python', 'print("$$")', '```', '', 'Ensuite :'].join('\n');
      const out = applyTypography(src, 'fr');
      expect(out).toContain('print("$$")');
      expect(out).toContain(`Ensuite${NBSP}:`);
    });

    it('handles self-contained $$ x $$ on one line', () => {
      const src = ['$$ a : b $$', '', 'Donc :'].join('\n');
      const out = applyTypography(src, 'fr');
      expect(out).toContain('$$ a : b $$');
      expect(out).toContain(`Donc${NBSP}:`);
    });

    it('recovers prose after a balanced math block', () => {
      const src = ['$$', 'x : y', '$$', '', 'Fini !'].join('\n');
      const out = applyTypography(src, 'fr');
      expect(out).toContain('x : y');
      expect(out).toContain(`Fini${NBSP}!`);
    });
  });

  describe('MyST prose directives', () => {
    it('typesets prose inside an admonition', () => {
      const src = ['```{hint}', 'Vos indices sont les suivants :', '```'].join('\n');
      expect(applyTypography(src, 'fr')).toContain(`suivants${NBSP}:`);
    });

    it.each(['note', 'warning', 'tip', 'exercise', 'solution', 'important'])(
      'typesets prose inside {%s}',
      (directive) => {
        const src = ['```{' + directive + '}', 'Attention !', '```'].join('\n');
        expect(applyTypography(src, 'fr')).toContain(`Attention${NBSP}!`);
      }
    );

    it('leaves directive options alone but typesets the body', () => {
      const src = ['```{exercise}', ':label: ex:one', '', 'Calculez ceci :', '```'].join('\n');
      const out = applyTypography(src, 'fr');
      expect(out).toContain(':label: ex:one');
      expect(out).toContain(`ceci${NBSP}:`);
    });

    it('does not touch code nested inside a prose directive', () => {
      const src = [
        '````{note}',
        'Regardez ce code :',
        '',
        '```{code-cell} python',
        'y = a if a > 0 else b  # positif ? oui',
        '```',
        '',
        'Fini !',
        '````',
      ].join('\n');
      const out = applyTypography(src, 'fr');
      expect(out).toContain('y = a if a > 0 else b  # positif ? oui');
      expect(out).toContain(`ce code${NBSP}:`);
      expect(out).toContain(`Fini${NBSP}!`);
    });

    it('treats unknown directives as code', () => {
      const src = ['```{some-future-thing}', 'a ? b : c', '```'].join('\n');
      expect(applyTypography(src, 'fr')).toBe(src);
    });
  });

  describe('realistic document', () => {
    it('fixes prose without touching structure', () => {
      const src = [
        '---',
        'title: Les fonctions',
        '---',
        '',
        '(sec:fn)=',
        '# Les fonctions',
        '',
        'Voici un exemple : une fonction simple. Compris ?',
        '',
        '```{code-cell} python',
        'def f(x):',
        '    return x if x > 0 else 0  # positif ? oui',
        '```',
        '',
        'Notez bien : $f : X \\to Y$ est défini !',
      ].join('\n');
      const out = applyTypography(src, 'fr');

      expect(out).toContain(`exemple${NBSP}: une fonction simple. Compris${NBSP}?`);
      expect(out).toContain(`Notez bien${NBSP}: $f : X \\to Y$ est défini${NBSP}!`);
      expect(out).toContain('    return x if x > 0 else 0  # positif ? oui');
      expect(out).toContain('title: Les fonctions');
      expect(out).toContain('(sec:fn)=');
      expect(out).toContain('def f(x):');
    });
  });
});

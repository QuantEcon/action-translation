import { applyTypography, hasTypographyRules } from '../typography';

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
  });

  describe('does not corrupt non-prose', () => {
    it('leaves code fences alone', () => {
      const src = ['Texte :', '', '```python', 'x = a if b else c  # a ? b : c', 'd = {"k": 1}', '```'].join('\n');
      const out = applyTypography(src, 'fr');
      expect(out).toContain('# a ? b : c');
      expect(out).toContain('d = {"k": 1}');
      expect(out).toContain(`Texte${NBSP}:`);
    });

    it('leaves MyST code-cell directives alone', () => {
      const src = ['```{code-cell} ipython3', 'print("ratio: 3:1")', 'y = x if x > 0 else -x', '```'].join('\n');
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
      const src = ['---', 'title: Introduction', 'kernelspec:', '  name: python3', '---', '', 'Bonjour !'].join('\n');
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
      const src = ['(sec:intro)=', '# Titre', '', '```{figure} a.png', ':width: 100px', ':name: fig:one', '```'].join('\n');
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
      const src = [
        '```python',
        'print("$$")',
        '```',
        '',
        'Ensuite :',
      ].join('\n');
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

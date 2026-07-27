/**
 * Tests for bibliography backfill (#117).
 *
 * The two traps these pin down, both measured against the live estate:
 *
 * - **Indented entries.** `quant-econ.bib` has 8 entries that do not start at
 *   column 0. An `^@`-anchored parser finds 493 of 501 and would re-append
 *   those 8, producing the duplicate-key `-W` failure the module prevents.
 * - **Citations inside admonitions.** 71 of 922 citations in
 *   `lecture-python.myst` (7.7%) sit inside `{note}`, `{exercise}`, `{warning}`
 *   or `{prf:*}` fences. A walker that skips every fence body misses all of them.
 */

import {
  appendBibEntries,
  bibKeySet,
  buildCitationNotice,
  extractCitationKeys,
  parseBib,
  parseBibliographyMode,
  parseBibtexBibfiles,
  planCitationBackfill,
  BibliographySources,
} from '../bibliography.js';

// =============================================================================
// MODE
// =============================================================================

describe('parseBibliographyMode', () => {
  it('accepts the three modes, case-insensitively', () => {
    expect(parseBibliographyMode('backfill')).toBe('backfill');
    expect(parseBibliographyMode('LINT')).toBe('lint');
    expect(parseBibliographyMode(' off ')).toBe('off');
  });

  it('defaults on empty input', () => {
    expect(parseBibliographyMode('')).toBe('backfill');
  });

  it('throws on a typo rather than silently disabling the guard', () => {
    expect(() => parseBibliographyMode('backfil')).toThrow(/Unknown bibliography mode/);
  });
});

// =============================================================================
// CITATION EXTRACTION
// =============================================================================

describe('extractCitationKeys', () => {
  it('finds the common role spellings and splits multi-key payloads', () => {
    const md = [
      'See {cite}`Sargent1993` and {cite:t}`Lucas1976`.',
      'Also {cite:p}`A2000,B2001` plus {footcite}`C1999`.',
    ].join('\n');
    expect(extractCitationKeys(md).map((r) => r.key)).toEqual([
      'Sargent1993',
      'Lucas1976',
      'A2000',
      'B2001',
      'C1999',
    ]);
  });

  it('reports 1-based line numbers', () => {
    const md = 'intro\n\nsee {cite}`Key1`\n';
    expect(extractCitationKeys(md)).toEqual([{ key: 'Key1', line: 3 }]);
  });

  it('ignores citations inside code cells', () => {
    const md = [
      '```{code-cell} ipython3',
      '# {cite}`NotACitation`',
      '```',
      '',
      'Real {cite}`Real2020`.',
    ].join('\n');
    expect(extractCitationKeys(md).map((r) => r.key)).toEqual(['Real2020']);
  });

  it('still finds citations inside admonitions — 7.7% of the corpus lives there', () => {
    const md = [
      '```{note}',
      'As shown in {cite}`InsideNote`.',
      '```',
      '',
      '```{exercise}',
      'See {cite}`InsideExercise`.',
      '```',
    ].join('\n');
    expect(extractCitationKeys(md).map((r) => r.key)).toEqual(['InsideNote', 'InsideExercise']);
  });

  it('handles a code cell nested inside an admonition', () => {
    const md = [
      '````{note}',
      'Cited {cite}`Outer`.',
      '```{code-cell} ipython3',
      '# {cite}`Hidden`',
      '```',
      'And {cite}`AfterCode`.',
      '````',
    ].join('\n');
    expect(extractCitationKeys(md).map((r) => r.key)).toEqual(['Outer', 'AfterCode']);
  });

  it('treats a bare fence as opaque', () => {
    const md = ['```', '{cite}`InPlainFence`', '```', '{cite}`Outside`'].join('\n');
    expect(extractCitationKeys(md).map((r) => r.key)).toEqual(['Outside']);
  });
});

// =============================================================================
// BIBTEX PARSING
// =============================================================================

describe('parseBib', () => {
  const BIB = [
    '@article{Alpha2020,',
    '  title = {A},',
    '  year = {2020}',
    '}',
    '',
    '  @book{Indented1999,',
    '  title = {Indented entry},',
    '  year = {1999}',
    '}',
  ].join('\n');

  it('finds indented entries — an anchored parser misses 8 of 501 in the real bib', () => {
    const parsed = parseBib(BIB);
    expect(bibKeySet(parsed)).toEqual(new Set(['Alpha2020', 'Indented1999']));
  });

  it('captures the entry verbatim', () => {
    const entry = parseBib(BIB).byKey.get('Indented1999')![0];
    expect(entry.raw).toContain('@book{Indented1999,');
    expect(entry.raw.trim().endsWith('}')).toBe(true);
    expect(entry.type).toBe('book');
  });

  it('skips @string, @comment and @preamble', () => {
    const parsed = parseBib('@string{jan = "January"}\n@comment{ignore}\n@article{Real,\n}\n');
    expect(bibKeySet(parsed)).toEqual(new Set(['Real']));
  });

  it('records unterminated entries instead of emitting a truncated one', () => {
    const parsed = parseBib('@article{Broken,\n  title = {No close brace}\n');
    expect(parsed.unterminated).toEqual(['Broken']);
    expect(parsed.entries).toHaveLength(0);
  });

  it('detects duplicate keys', () => {
    const parsed = parseBib('@article{Dup,\n}\n@book{Dup,\n}\n');
    expect(parsed.byKey.get('Dup')).toHaveLength(2);
  });

  it('tolerates braces inside field values', () => {
    const parsed = parseBib(
      '@article{Nested,\n  title = {A {Nested} Title},\n  year = {2000}\n}\n'
    );
    expect(bibKeySet(parsed)).toEqual(new Set(['Nested']));
  });
});

describe('appendBibEntries', () => {
  it('preserves existing bytes and appends', () => {
    const before = '@article{Existing,\n  year = {1999}\n}\n';
    const entry = parseBib('@book{New2020,\n  year = {2020}\n}\n').entries[0];
    const after = appendBibEntries(before, [entry]);
    expect(after).toContain('@article{Existing,');
    expect(after).toContain('@book{New2020,');
    expect(after.indexOf('Existing')).toBeLessThan(after.indexOf('New2020'));
  });

  it('is a no-op for an empty entry list', () => {
    expect(appendBibEntries('@article{A,\n}\n', [])).toBe('@article{A,\n}\n');
  });
});

describe('parseBibtexBibfiles', () => {
  it('reads a block sequence', () => {
    expect(parseBibtexBibfiles('bibtex_bibfiles:\n   - _static/quant-econ.bib\n')).toEqual([
      '_static/quant-econ.bib',
    ]);
  });

  it('reads a flow sequence', () => {
    expect(parseBibtexBibfiles('bibtex_bibfiles: [a.bib, b.bib]')).toEqual(['a.bib', 'b.bib']);
  });

  it('returns [] when the key is absent, and never throws on junk', () => {
    expect(parseBibtexBibfiles('title: Something\n')).toEqual([]);
    expect(parseBibtexBibfiles('!!! not yaml : [[[')).toEqual([]);
  });
});

// =============================================================================
// PLANNING
// =============================================================================

const SOURCE_BIB = [
  '@article{Present,\n  year = {2000}\n}',
  '@book{NewKey,\n  year = {2021}\n}',
  '@article{AlsoNew,\n  year = {2022}\n}',
].join('\n\n');

function sources(targetBib: string, sourceBib = SOURCE_BIB): BibliographySources {
  return {
    targets: [{ path: 'lectures/_static/quant-econ.bib', content: targetBib, sha: 'sha123' }],
    sources: [{ path: 'lectures/_static/quant-econ.bib', content: sourceBib }],
  };
}

describe('planCitationBackfill', () => {
  it('does nothing when every introduced key already resolves', () => {
    const plan = planCitationBackfill({
      docs: [{ file: 'lectures/a.md', before: '', after: 'x {cite}`Present`' }],
      bib: sources('@article{Present,\n  year = {2000}\n}\n'),
      mode: 'backfill',
    });
    expect(plan.mergedBib).toBeUndefined();
    expect(plan.errors).toEqual([]);
    expect(plan.backfilled.size).toBe(0);
  });

  it('appends an entry for a key the run introduces', () => {
    const plan = planCitationBackfill({
      docs: [{ file: 'lectures/a.md', before: '', after: 'x {cite}`NewKey`' }],
      bib: sources('@article{Present,\n  year = {2000}\n}\n'),
      mode: 'backfill',
    });
    expect(plan.backfilled.get('lectures/a.md')).toEqual(['NewKey']);
    expect(plan.mergedBib).toContain('@book{NewKey,');
    expect(plan.mergedBib).toContain('@article{Present,');
    expect(plan.bibPath).toBe('lectures/_static/quant-econ.bib');
    expect(plan.bibSha).toBe('sha123');
    expect(plan.errors).toEqual([]);
  });

  it('errors when a key resolves in neither bibliography', () => {
    const plan = planCitationBackfill({
      docs: [{ file: 'lectures/a.md', before: '', after: 'x {cite}`Nowhere`' }],
      bib: sources('@article{Present,\n}\n'),
      mode: 'backfill',
    });
    expect(plan.unresolved.get('lectures/a.md')).toEqual(['Nowhere']);
    expect(plan.errors[0]).toMatch(/resolves in neither/);
    expect(plan.mergedBib).toBeUndefined();
  });

  it('reports a pre-existing dangling key as a warning, not an error', () => {
    const plan = planCitationBackfill({
      docs: [
        { file: 'lectures/a.md', before: 'old {cite}`Dangling`', after: 'new {cite}`Dangling`' },
      ],
      bib: sources('@article{Present,\n}\n'),
      mode: 'backfill',
    });
    expect(plan.errors).toEqual([]);
    expect(plan.preExisting.get('lectures/a.md')).toEqual(['Dangling']);
    expect(plan.warnings.join('\n')).toMatch(/already dangling/);
  });

  it('never treats a resolving key as a candidate, so a localised entry is safe', () => {
    // The target's entry text differs from the source's — an edition that has
    // translated the title. The key resolves, so it must not be touched.
    const localised = '@article{Present,\n  title = {已本地化的标题}\n}\n';
    const plan = planCitationBackfill({
      docs: [{ file: 'lectures/a.md', before: '', after: '{cite}`Present`' }],
      bib: sources(localised),
      mode: 'backfill',
    });
    expect(plan.mergedBib).toBeUndefined();
    expect(plan.backfilled.size).toBe(0);
  });

  it('blocks a case-collision rather than creating an ambiguous reference', () => {
    const plan = planCitationBackfill({
      docs: [{ file: 'lectures/a.md', before: '', after: '{cite}`newkey`' }],
      bib: sources('@article{NEWKEY,\n}\n', '@book{newkey,\n}\n'),
      mode: 'backfill',
    });
    expect(plan.errors[0]).toMatch(/differs only in case/);
    expect(plan.mergedBib).toBeUndefined();
  });

  it('blocks a key the source declares twice', () => {
    const plan = planCitationBackfill({
      docs: [{ file: 'lectures/a.md', before: '', after: '{cite}`Dup`' }],
      bib: sources('@article{Present,\n}\n', '@article{Dup,\n}\n@book{Dup,\n}\n'),
      mode: 'backfill',
    });
    expect(plan.errors[0]).toMatch(/declared 2 times/);
    expect(plan.mergedBib).toBeUndefined();
  });

  it('lint mode reports without copying', () => {
    const plan = planCitationBackfill({
      docs: [{ file: 'lectures/a.md', before: '', after: '{cite}`NewKey`' }],
      bib: sources('@article{Present,\n}\n'),
      mode: 'lint',
    });
    expect(plan.mergedBib).toBeUndefined();
    expect(plan.errors[0]).toMatch(/bibliography mode is 'lint'/);
  });

  it('appends a key once when several documents introduce it', () => {
    const plan = planCitationBackfill({
      docs: [
        { file: 'lectures/a.md', before: '', after: '{cite}`NewKey`' },
        { file: 'lectures/b.md', before: '', after: '{cite}`NewKey`' },
      ],
      bib: sources('@article{Present,\n}\n'),
      mode: 'backfill',
    });
    expect(plan.mergedBib!.match(/@book\{NewKey,/g)).toHaveLength(1);
    expect(plan.backfilled.get('lectures/a.md')).toEqual(['NewKey']);
    expect(plan.backfilled.get('lectures/b.md')).toBeUndefined();
  });

  it('skips a key another file in the wave already scheduled', () => {
    const ledger = new Set(['NewKey']);
    const plan = planCitationBackfill({
      docs: [{ file: 'lectures/a.md', before: '', after: '{cite}`NewKey`' }],
      bib: sources('@article{Present,\n}\n'),
      mode: 'backfill',
      ledger,
    });
    expect(plan.mergedBib).toBeUndefined();
    expect(plan.errors).toEqual([]);
  });
});

// =============================================================================
// REPORTING
// =============================================================================

describe('buildCitationNotice', () => {
  it('is empty when there is nothing to report', () => {
    expect(
      buildCitationNotice({ bibPath: 'b.bib', backfilled: new Map(), preExisting: new Map() })
    ).toBe('');
  });

  it('names the file and keys it copied', () => {
    const notice = buildCitationNotice({
      bibPath: 'lectures/_static/quant-econ.bib',
      backfilled: new Map([['lectures/a.md', ['K1', 'K2']]]),
      preExisting: new Map(),
    });
    expect(notice).toContain('2 citation entries');
    expect(notice).toContain('`lectures/a.md`');
    expect(notice).toContain('`K1`');
  });

  it('separates pre-existing dangling keys from what it copied', () => {
    const notice = buildCitationNotice({
      bibPath: 'b.bib',
      backfilled: new Map(),
      preExisting: new Map([['lectures/a.md', ['Old']]]),
    });
    expect(notice).toContain('Pre-existing dangling citations');
    expect(notice).toContain('not** introduced by this sync');
  });
});

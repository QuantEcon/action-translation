/**
 * Tests for deterministic typography in the sync path (issue #97).
 *
 * `applyTypography()` used to run only in the `translate init` seed path, so every
 * sync stripped the non-breaking spaces the seed inserted. These tests pin the fix
 * and, more importantly, the invariant that makes it safe: the body and the
 * frontmatter heading map must be typeset together. Heading lookup is an exact
 * string compare, so a map/body mismatch silently drops unchanged sections and
 * retranslates modified ones from English.
 */

import { FileProcessor } from '../file-processor.js';
import { TranslationService } from '../translator.js';
import { extractHeadingMap, extractTranslationTitle } from '../heading-map.js';

const NBSP = '\u00A0';

describe('FileProcessor typography (issue #97)', () => {
  let processor: FileProcessor;
  let mockTranslator: jest.Mocked<TranslationService>;

  beforeEach(() => {
    mockTranslator = {
      translateSection: jest.fn(),
      translateFullDocument: jest.fn(),
    } as any;
    processor = new FileProcessor(mockTranslator, false);
  });

  describe('processFull', () => {
    // The model does not honour the nbsp prompt rule — that is why #79 made the
    // transform deterministic. Every fixture here returns plain spacing.
    const modelOutput = `---
title: Fonctions
---

# Fonctions

Voici une solution :

## Pourquoi écrire des fonctions ?

Parce que c'est utile !`;

    const source = `---
title: Functions
---

# Functions

Here is a solution:

## Why Write Functions?

Because it is useful!`;

    it('typesets prose the model left with plain spacing', async () => {
      mockTranslator.translateFullDocument.mockResolvedValue({
        success: true,
        translatedSection: modelOutput,
      });

      const out = await processor.processFull(source, 'functions.md', 'en', 'fr');

      expect(out).toContain(`Voici une solution${NBSP}:`);
      expect(out).toContain(`Parce que c'est utile${NBSP}!`);
    });

    it('derives the heading map from the typeset body, not the raw model output', async () => {
      mockTranslator.translateFullDocument.mockResolvedValue({
        success: true,
        translatedSection: modelOutput,
      });

      const out = await processor.processFull(source, 'functions.md', 'en', 'fr');

      // The regression this guards: body typeset but map left plain.
      expect(out).toContain(`## Pourquoi écrire des fonctions${NBSP}?`);
      const map = extractHeadingMap(out);
      expect([...map.values()]).toContain(`Pourquoi écrire des fonctions${NBSP}?`);
    });

    it('leaves languages without typography rules untouched', async () => {
      mockTranslator.translateFullDocument.mockResolvedValue({
        success: true,
        translatedSection: modelOutput,
      });

      const out = await processor.processFull(source, 'functions.md', 'en', 'zh-cn');

      expect(out).not.toContain(NBSP);
      expect(out).toContain('Voici une solution :');
    });
  });

  describe('processSectionBased', () => {
    const oldSource = `---
title: Test
---

# Test Lecture

Intro text.

## Stable Section

Unchanged content.

## Changed Section

Old content.`;

    const newSource = oldSource.replace('Old content.', 'New content.');

    /** Target seeded by `translate init` — correctly typeset, map and body agree. */
    const seededTarget = `---
title: Test
translation:
  title: Leçon de test
  headings:
    Stable Section: "Section stable${NBSP}: généralités"
    Changed Section: Section modifiée
---

# Leçon de test

Texte d'introduction.

## Section stable${NBSP}: généralités

Contenu inchangé${NBSP}: rien à voir.

## Section modifiée

Ancien contenu.`;

    it('typesets a freshly translated section and its map entry together', async () => {
      mockTranslator.translateSection.mockResolvedValue({
        success: true,
        translatedSection: '## Section modifiée\n\nNouveau contenu : enfin !',
      });

      const out = await processor.processSectionBased(
        oldSource,
        newSource,
        seededTarget,
        'test.md',
        'en',
        'fr'
      );

      expect(out).toContain(`Nouveau contenu${NBSP}: enfin${NBSP}!`);
    });

    // A heading the *model* produces fresh is the only way map and body can drift:
    // modified sections reuse the existing target heading, so they cannot desync.
    // An added section writes the model's plain-spaced heading to both body and map.
    const sourceWithAddedSection = `${newSource}

## Why Bother?

Because it pays off.`;

    const addedSectionTranslation = "## Pourquoi s'embêter ?\n\nParce que ça paye : vraiment.";

    it('keeps the frontmatter map byte-identical to the body headings', async () => {
      mockTranslator.translateSection.mockResolvedValue({
        success: true,
        translatedSection: addedSectionTranslation,
      });

      const out = await processor.processSectionBased(
        newSource,
        sourceWithAddedSection,
        seededTarget,
        'test.md',
        'en',
        'fr'
      );

      // The trap: applyTypography skips frontmatter, so typesetting only the body
      // would leave this map value plain-spaced while the body heading gained an
      // nbsp. Every value must appear verbatim as a body heading.
      const map = extractHeadingMap(out);
      expect(map.get('Why Bother?')).toBe(`Pourquoi s'embêter${NBSP}?`);
      for (const value of map.values()) {
        expect(out).toContain(`## ${value}`);
      }
    });

    it('lets a second sync still match a section added by an earlier one', async () => {
      // The real failure mode of a map/body mismatch: the next sync cannot find the
      // target, so it either drops the section or retranslates it from English,
      // discarding human edits.
      mockTranslator.translateSection.mockResolvedValue({
        success: true,
        translatedSection: addedSectionTranslation,
      });

      const firstSync = await processor.processSectionBased(
        newSource,
        sourceWithAddedSection,
        seededTarget,
        'test.md',
        'en',
        'fr'
      );

      // Stand in for a human edit landing on the added section after the first sync.
      const edited = firstSync.replace('Parce que ça paye', 'Parce que cela paye');
      expect(edited).toContain('Parce que cela paye');

      // The second sync adds a further section, so the source and target section
      // counts differ. That removes the positional fallback and leaves the heading
      // map as the only way to locate the previously added section — which is
      // precisely when a map/body mismatch becomes destructive.
      const newerSource = `${sourceWithAddedSection}

## One More Thing

A postscript.`;
      mockTranslator.translateSection.mockResolvedValue({
        success: true,
        translatedSection: '## Encore une chose\n\nUn post-scriptum.',
      });

      const skipped: string[] = [];
      const secondSync = await processor.processSectionBased(
        sourceWithAddedSection,
        newerSource,
        edited,
        'test.md',
        'en',
        'fr',
        undefined,
        (h) => skipped.push(h)
      );

      // Nothing dropped, and the human edit on the untouched added section survived.
      expect(skipped).toEqual([]);
      expect(secondSync).toContain(`## Pourquoi s'embêter${NBSP}?`);
      expect(secondSync).toContain('Parce que cela paye');
      expect(secondSync).toContain('Un post-scriptum.');
    });

    it('repairs drift in sections the source PR did not touch', async () => {
      // Document-scoped: a section that lost its nbsp to an earlier sync is healed
      // on the next sync of the file, even though the source change is elsewhere.
      const driftedTarget = seededTarget
        .replace(`Contenu inchangé${NBSP}: rien à voir.`, 'Contenu inchangé : rien à voir.')
        .replace(`Section stable${NBSP}: généralités`, 'Section stable : généralités');

      mockTranslator.translateSection.mockResolvedValue({
        success: true,
        translatedSection: '## Section modifiée\n\nNouveau contenu.',
      });

      const out = await processor.processSectionBased(
        oldSource,
        newSource,
        driftedTarget,
        'test.md',
        'en',
        'fr'
      );

      expect(out).toContain(`Contenu inchangé${NBSP}: rien à voir.`);
      expect(out).toContain(`## Section stable${NBSP}: généralités`);
      const map = extractHeadingMap(out);
      expect(map.get('Stable Section')).toBe(`Section stable${NBSP}: généralités`);
    });

    it('typesets the translation title in frontmatter', async () => {
      const titledTarget = seededTarget
        .replace('title: Leçon de test', 'title: "Leçon de test : introduction"')
        .replace('# Leçon de test', '# Leçon de test : introduction');

      mockTranslator.translateSection.mockResolvedValue({
        success: true,
        translatedSection: '## Section modifiée\n\nNouveau contenu.',
      });

      const out = await processor.processSectionBased(
        oldSource,
        newSource,
        titledTarget,
        'test.md',
        'en',
        'fr'
      );

      expect(extractTranslationTitle(out)).toBe(`Leçon de test${NBSP}: introduction`);
      expect(out).toContain(`# Leçon de test${NBSP}: introduction`);
    });

    it('leaves languages without typography rules untouched', async () => {
      mockTranslator.translateSection.mockResolvedValue({
        success: true,
        translatedSection: '## Section modifiée\n\nNouveau contenu : enfin !',
      });

      const out = await processor.processSectionBased(
        oldSource,
        newSource,
        seededTarget.split(NBSP).join(' '),
        'test.md',
        'en',
        'zh-cn'
      );

      expect(out).not.toContain(NBSP);
    });
  });
});

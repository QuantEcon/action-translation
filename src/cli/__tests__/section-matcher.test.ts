/**
 * Tests for section-matcher module
 * 
 * Tests position-based cross-language section matching
 * with heading-map validation.
 */

import * as fs from 'fs';
import * as path from 'path';
import { MystParser } from '../../parser';
import { extractHeadingMap } from '../../heading-map';
import { matchSections, validateMatchesWithHeadingMap, getMatchingSummary } from '../section-matcher';
import { Section } from '../../types';

const fixturesDir = path.join(__dirname, 'fixtures');

/** Helper to create a minimal Section for testing */
function makeSection(heading: string, content: string, id: string): Section {
  return { heading, content, level: 2, id, startLine: 0, endLine: 0, subsections: [] };
}

describe('section-matcher', () => {
  const parser = new MystParser();

  describe('matchSections', () => {
    it('should match equal-length section arrays by position', () => {
      const source: Section[] = [
        makeSection('## Introduction', 'intro content', 'intro'),
        makeSection('## Methods', 'methods content', 'methods'),
      ];
      const target: Section[] = [
        makeSection('## 介绍', '介绍内容', 'intro'),
        makeSection('## 方法', '方法内容', 'methods'),
      ];

      const pairs = matchSections(source, target);
      expect(pairs).toHaveLength(2);
      expect(pairs[0].status).toBe('MATCHED');
      expect(pairs[0].sourceHeading).toBe('## Introduction');
      expect(pairs[0].targetHeading).toBe('## 介绍');
      expect(pairs[1].status).toBe('MATCHED');
    });

    it('should handle SOURCE_ONLY when source has more sections', () => {
      const source: Section[] = [
        makeSection('## A', 'a', 'a'),
        makeSection('## B', 'b', 'b'),
        makeSection('## C', 'c', 'c'),
      ];
      const target: Section[] = [
        makeSection('## 甲', '甲', 'a'),
        makeSection('## 乙', '乙', 'b'),
      ];

      const pairs = matchSections(source, target);
      expect(pairs).toHaveLength(3);
      expect(pairs[0].status).toBe('MATCHED');
      expect(pairs[1].status).toBe('MATCHED');
      expect(pairs[2].status).toBe('SOURCE_ONLY');
      expect(pairs[2].sourceSection).not.toBeNull();
      expect(pairs[2].targetSection).toBeNull();
    });

    it('should handle TARGET_ONLY when target has more sections', () => {
      const source: Section[] = [
        makeSection('## A', 'a', 'a'),
      ];
      const target: Section[] = [
        makeSection('## 甲', '甲', 'a'),
        makeSection('## 乙', '乙', 'b'),
      ];

      const pairs = matchSections(source, target);
      expect(pairs).toHaveLength(2);
      expect(pairs[0].status).toBe('MATCHED');
      expect(pairs[1].status).toBe('TARGET_ONLY');
      expect(pairs[1].sourceSection).toBeNull();
      expect(pairs[1].targetSection).not.toBeNull();
    });

    it('should handle empty section arrays', () => {
      expect(matchSections([], [])).toHaveLength(0);
      
      const source: Section[] = [
        makeSection('## A', 'a', 'a'),
      ];
      const pairs = matchSections(source, []);
      expect(pairs).toHaveLength(1);
      expect(pairs[0].status).toBe('SOURCE_ONLY');
    });

    it('should match sections from fixture files', async () => {
      const sourceContent = fs.readFileSync(
        path.join(fixturesDir, 'aligned-pair', 'source.md'), 'utf-8'
      );
      const targetContent = fs.readFileSync(
        path.join(fixturesDir, 'aligned-pair', 'target.md'), 'utf-8'
      );

      const sourceParsed = await parser.parseSections(sourceContent, 'source.md');
      const targetParsed = await parser.parseSections(targetContent, 'target.md');

      const pairs = matchSections(sourceParsed.sections, targetParsed.sections);
      const summary = getMatchingSummary(pairs);

      expect(summary.matched).toBe(sourceParsed.sections.length);
      expect(summary.sourceOnly).toBe(0);
      expect(summary.targetOnly).toBe(0);
    });

    it('should detect section-count-mismatch from fixtures', async () => {
      const sourceContent = fs.readFileSync(
        path.join(fixturesDir, 'section-count-mismatch', 'source.md'), 'utf-8'
      );
      const targetContent = fs.readFileSync(
        path.join(fixturesDir, 'section-count-mismatch', 'target.md'), 'utf-8'
      );

      const sourceParsed = await parser.parseSections(sourceContent, 'source.md');
      const targetParsed = await parser.parseSections(targetContent, 'target.md');

      const pairs = matchSections(sourceParsed.sections, targetParsed.sections);
      const summary = getMatchingSummary(pairs);

      // Target has an extra section
      expect(summary.targetOnly).toBeGreaterThan(0);
    });
  });

  describe('validateMatchesWithHeadingMap', () => {
    it('should produce no warnings for correct heading-map matches', async () => {
      const targetContent = fs.readFileSync(
        path.join(fixturesDir, 'aligned-pair', 'target.md'), 'utf-8'
      );
      const sourceContent = fs.readFileSync(
        path.join(fixturesDir, 'aligned-pair', 'source.md'), 'utf-8'
      );

      const sourceParsed = await parser.parseSections(sourceContent, 'source.md');
      const targetParsed = await parser.parseSections(targetContent, 'target.md');
      const headingMap = extractHeadingMap(targetContent);

      const pairs = matchSections(sourceParsed.sections, targetParsed.sections, headingMap);
      const warnings = validateMatchesWithHeadingMap(pairs, headingMap);

      expect(warnings).toHaveLength(0);
    });

    it('should warn when heading-map doesn\'t match position-aligned sections', () => {
      const source: Section[] = [
        makeSection('## Introduction', 'intro', 'introduction'),
      ];
      const target: Section[] = [
        makeSection('## 结论', '结论', 'conclusion'),
      ];

      // Heading-map says "Introduction" → "介绍" but we got "结论"
      const headingMap: Map<string, string> = new Map([['Introduction', '介绍']]);

      const pairs = matchSections(source, target, headingMap);
      const warnings = validateMatchesWithHeadingMap(pairs, headingMap);

      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('Introduction');
      expect(warnings[0]).toContain('结论');
    });
  });

  describe('getMatchingSummary', () => {
    it('should correctly count match types', () => {
      const source: Section[] = [
        makeSection('## A', 'a', 'a'),
        makeSection('## B', 'b', 'b'),
        makeSection('## C', 'c', 'c'),
      ];
      const target: Section[] = [
        makeSection('## X', 'x', 'x'),
        makeSection('## Y', 'y', 'y'),
      ];

      const pairs = matchSections(source, target);
      const summary = getMatchingSummary(pairs);

      expect(summary).toEqual({
        matched: 2,
        sourceOnly: 1,
        targetOnly: 0,
        total: 3,
      });
    });
  });
});

/**
 * E2E Fixture-Based Tests
 * 
 * These tests use real markdown fixture files to validate the complete
 * translation workflow. Each scenario has 4 files:
 * - old-en.md: English before changes
 * - new-en.md: English after changes  
 * - current-zh.md: Chinese current state
 * - expected-zh.md: Chinese expected result (for manual verification)
 * 
 * Tests use MOCKED translations for deterministic results.
 */

import { FileProcessor } from '../file-processor.js';
import { TranslationService } from '../translator.js';
import * as fs from 'fs';
import * as path from 'path';

// Mock translator that returns predictable Chinese
class MockTranslator extends TranslationService {
  constructor() {
    super('test-key', 'claude-sonnet-4-6', false);
  }

  async translateSection(request: any): Promise<any> {
    const content = request.newEnglish || request.englishSection || '';
    
    // Extract the heading and content
    const lines = content.split('\n');
    const heading = lines[0] || '';
    const body = lines.slice(1).join('\n');
    
    // Create a mock Chinese translation preserving structure
    const translatedHeading = heading.replace(/^##+ /, (match: string) => match) + ' [已翻译]';
    const translatedBody = `[模拟翻译内容]`;
    
    const translatedContent = `${translatedHeading}\n\n${translatedBody}`;
    
    return {
      success: true,
      translatedSection: translatedContent,
      tokensUsed: 100,
    };
  }

  async translateFullDocument(request: any): Promise<any> {
    const translatedContent = `[FULL TRANSLATION: ${request.content.substring(0, 100)}...]`;
    
    return {
      success: true,
      translatedSection: translatedContent,
      tokensUsed: 500,
    };
  }
}

describe('E2E Fixture-Based Tests', () => {
  let processor: FileProcessor;
  let translator: MockTranslator;
  const fixturesDir = path.join(__dirname, 'fixtures', 'e2e');

  beforeEach(() => {
    translator = new MockTranslator();
    processor = new FileProcessor(translator, false);
  });

  /**
   * Helper to load fixture files for a scenario
   */
  function loadFixtures(scenarioPrefix: string) {
    const oldEn = fs.readFileSync(
      path.join(fixturesDir, `${scenarioPrefix}-old-en.md`),
      'utf-8'
    );
    const newEn = fs.readFileSync(
      path.join(fixturesDir, `${scenarioPrefix}-new-en.md`),
      'utf-8'
    );
    const currentZh = fs.readFileSync(
      path.join(fixturesDir, `${scenarioPrefix}-current-zh.md`),
      'utf-8'
    );

    return { oldEn, newEn, currentZh };
  }

  describe('Scenario 01: Intro Change Only', () => {
    it('should translate intro only and preserve all sections', async () => {
      const { oldEn, newEn, currentZh } = loadFixtures('01-intro-change');

      const result = await processor.processSectionBased(
        oldEn,
        newEn,
        currentZh,
        'test.md',
        'en',
        'zh-cn'
      );

      // Verify structure is complete
      expect(result).toContain('---'); // Frontmatter
      expect(result).toContain('# 经济学讲座'); // Title preserved
      expect(result).toContain('## 供给与需求'); // Section 1 preserved
      expect(result).toContain('### 市场均衡'); // Subsection preserved
      expect(result).toContain('## 经济模型'); // Section 2 preserved

      // Verify translation metadata exists
      expect(result).toContain('translation:');

      // Count sections - should have 2
      const sectionMatches = result.match(/^## /gm);
      expect(sectionMatches).toHaveLength(2);
    });
  });

  describe('Scenario 02: Title Change Only', () => {
    it('should translate title only and preserve all other elements', async () => {
      const { oldEn, newEn, currentZh } = loadFixtures('02-title-change');

      const result = await processor.processSectionBased(
        oldEn,
        newEn,
        currentZh,
        'test.md',
        'en',
        'zh-cn'
      );

      // Verify frontmatter preserved
      expect(result).toContain('---');
      expect(result).toContain('jupytext:');

      // Title should be translated (mocked with marker)
      expect(result).toContain('[已翻译]');

      // Intro preserved
      expect(result).toContain('这是介绍段落');

      // Sections preserved
      expect(result).toContain('## 供给与需求');
      expect(result).toContain('## 经济模型');

      // Count sections - should have 2
      const sectionMatches = result.match(/^## /gm);
      expect(sectionMatches).toHaveLength(2);
    });
  });

  describe('Scenario 03: Section Content Change', () => {
    it('should translate changed section only', async () => {
      const { oldEn, newEn, currentZh } = loadFixtures('03-section-content');

      const result = await processor.processSectionBased(
        oldEn,
        newEn,
        currentZh,
        'test.md',
        'en',
        'zh-cn'
      );

      // Title and intro preserved
      expect(result).toContain('# 经济学讲座');
      expect(result).toContain('这是介绍段落');

      // Changed section should have translated content (mock translation marker in body)
      expect(result).toContain('[模拟翻译内容]');

      // Both sections should have Chinese headings preserved
      expect(result).toContain('## 供给与需求');
      expect(result).toContain('## 经济模型');

      // Count sections - should have 2
      const sectionMatches = result.match(/^## /gm);
      expect(sectionMatches).toHaveLength(2);
    });
  });

  describe('Scenario 04: Section Reordering', () => {
    it('should reorder sections according to new source order', async () => {
      const { oldEn, newEn, currentZh } = loadFixtures('04-section-reorder');

      const result = await processor.processSectionBased(
        oldEn,
        newEn,
        currentZh,
        'test.md',
        'en',
        'zh-cn'
      );

      // All 3 sections should be present
      const sectionMatches = result.match(/^## .+$/gm);
      expect(sectionMatches).toHaveLength(3);

      // Verify new order: Economic Models, Supply and Demand, Market Equilibrium
      const economicModelsIndex = result.indexOf('## 经济模型');
      const supplyDemandIndex = result.indexOf('## 供给与需求');
      const marketEquilibriumIndex = result.indexOf('## 市场均衡');

      expect(economicModelsIndex).toBeLessThan(supplyDemandIndex);
      expect(supplyDemandIndex).toBeLessThan(marketEquilibriumIndex);
    });
  });

  describe('Scenario 05: Add New Section', () => {
    it('should translate and add new section', async () => {
      const { oldEn, newEn, currentZh } = loadFixtures('05-add-section');

      const result = await processor.processSectionBased(
        oldEn,
        newEn,
        currentZh,
        'test.md',
        'en',
        'zh-cn'
      );

      // Should have 2 sections (1 existing + 1 new)
      const sectionMatches = result.match(/^## /gm);
      expect(sectionMatches).toHaveLength(2);

      // Existing section preserved
      expect(result).toContain('## 供给与需求');

      // New section added (mocked translation with marker)
      expect(result).toContain('[已翻译]');
    });
  });

  describe('Scenario 06: Delete Section', () => {
    it('should remove deleted section', async () => {
      const { oldEn, newEn, currentZh } = loadFixtures('06-delete-section');

      const result = await processor.processSectionBased(
        oldEn,
        newEn,
        currentZh,
        'test.md',
        'en',
        'zh-cn'
      );

      // Should have only 1 section (Economic Models deleted)
      const sectionMatches = result.match(/^## /gm);
      expect(sectionMatches).toHaveLength(1);

      // Remaining section preserved
      expect(result).toContain('## 供给与需求');

      // Deleted section should not be present
      expect(result).not.toContain('## 经济模型');
    });
  });

  describe('Scenario 07: Subsection Change', () => {
    it('should translate changed subsection within parent section', async () => {
      const { oldEn, newEn, currentZh } = loadFixtures('07-subsection-change');

      const result = await processor.processSectionBased(
        oldEn,
        newEn,
        currentZh,
        'test.md',
        'en',
        'zh-cn'
      );

      // Both sections present
      expect(result).toContain('## 供给与需求');
      expect(result).toContain('## 经济模型');

      // Subsection structure mismatch: translator doesn't return subsection,
      // so we merge source structure with target Chinese heading
      expect(result).toContain('### 市场均衡');

      // Count main sections - should have 2
      const sectionMatches = result.match(/^## /gm);
      expect(sectionMatches).toHaveLength(2);
    });
  });

  describe('Scenario 08: Multi-Element Change', () => {
    it('should handle multiple simultaneous changes', async () => {
      const { oldEn, newEn, currentZh } = loadFixtures('08-multi-element');

      const result = await processor.processSectionBased(
        oldEn,
        newEn,
        currentZh,
        'test.md',
        'en',
        'zh-cn'
      );

      // Frontmatter preserved
      expect(result).toContain('---');

      // Should have 3 sections now (2 old + 1 new)
      const sectionMatches = result.match(/^## /gm);
      expect(sectionMatches).toHaveLength(3);

      // Translation metadata should exist
      expect(result).toContain('translation:');
    });
  });
});

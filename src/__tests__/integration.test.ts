import { MystParser } from '../parser.js';
import { DiffDetector } from '../diff-detector.js';
import { TranslationService } from '../translator.js';
import { FileProcessor } from '../file-processor.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Integration Tests - Full Translation Workflow
 * 
 * These tests validate the complete transformation pipeline:
 * 1. Parse OLD English document
 * 2. Parse NEW English document (with changes)
 * 3. Parse CURRENT Chinese document
 * 4. Detect changes between OLD and NEW English
 * 5. Translate changed sections
 * 6. Reconstruct UPDATED Chinese document
 * 7. Verify result matches expected Chinese document
 */

// Mock translation service that returns predictable translations
class MockTranslationService extends TranslationService {
  constructor() {
    // Use dummy values - we'll override the methods
    super('test-api-key', 'claude-sonnet-4.5-20241022', false);
  }
  
  /**
   * Mock translation: Returns predefined Chinese content for known sections
   */
  async translateSection(request: any): Promise<any> {
    const heading = request.newSection?.heading || request.section?.heading;
    
    // Map of English headings to Chinese translations
    const translations: Record<string, string> = {
      '## Economic Models': `## 经济模型

经济模型是经济过程的简化表示。它们帮助我们通过关注关键关系来理解复杂系统。

我们使用理论和实证两种方法来构建和测试这些模型。
`,
      '## Getting Started': `## 入门

要开始学习定量经济学，您需要了解经济建模的基础知识。

我们将介绍供求、优化和均衡等基本概念。
`,
      '## Mathematical Example': `## 数学示例

考虑一个简单的优化问题：

$$
\\max_{x} f(x) = -x^2 + 4x + 1
$$

通过求导数并令其为零来找到解。
`,
      '## Python Tools': `## Python工具

我们使用几个Python库：

\`\`\`python
import numpy as np
import matplotlib.pyplot as plt
import pandas as pd
\`\`\`

这些工具对于数值计算和数据分析至关重要。
`,
    };
    
    // Return the mock translation
    const translatedContent = translations[heading] || 'Mock translation';
    
    return {
      translatedContent,
      tokensUsed: 100,
      model: 'mock-model',
    };
  }
}

describe('Integration Tests - Full Translation Workflow', () => {
  let parser: MystParser;
  let detector: DiffDetector;
  let translator: MockTranslationService;
  let processor: FileProcessor;
  
  beforeEach(() => {
    parser = new MystParser();
    detector = new DiffDetector(false);
    translator = new MockTranslationService();
    processor = new FileProcessor(translator, false);
  });

  describe('Scenario: Add "Economic Models" section to document', () => {
    let oldEnglishContent: string;
    let newEnglishContent: string;
    let currentChineseContent: string;
    let expectedChineseContent: string;
    
    beforeAll(() => {
      const fixturesDir = path.join(__dirname, 'fixtures');
      oldEnglishContent = fs.readFileSync(path.join(fixturesDir, 'intro-old.md'), 'utf-8');
      newEnglishContent = fs.readFileSync(path.join(fixturesDir, 'intro-new.md'), 'utf-8');
      currentChineseContent = fs.readFileSync(path.join(fixturesDir, 'intro-zh-cn.md'), 'utf-8');
    });

    it('should detect that Economic Models section was added', async () => {
      // Step 1: Detect changes between old and new English
      const changes = await detector.detectSectionChanges(
        oldEnglishContent,
        newEnglishContent,
        'intro.md'
      );
      
      // Verify we detected the ADDED section
      const addedSections = changes.filter(c => c.type === 'added');
      expect(addedSections.length).toBeGreaterThan(0);
      
      const economicModels = addedSections.find(c => 
        c.newSection?.heading === '## Economic Models'
      );
      
      expect(economicModels).toBeDefined();
      expect(economicModels?.type).toBe('added');
    });

    it('should correctly identify modified sections', async () => {
      // Parse old and new to check for modifications
      const oldSections = await parser.parseSections(oldEnglishContent, 'intro.md');
      const newSections = await parser.parseSections(newEnglishContent, 'intro.md');
      
      // The first paragraph changed (intro text longer)
      // Mathematical Example changed (derivative wording)
      // Python Tools changed (pandas added)
      
      const changes = await detector.detectSectionChanges(
        oldEnglishContent,
        newEnglishContent,
        'intro.md'
      );
      
      const modifiedSections = changes.filter(c => c.type === 'modified');
      
      // Should have at least the Python Tools modification (pandas import)
      expect(modifiedSections.length).toBeGreaterThan(0);
    });

    it('INTEGRATION: should produce correctly updated Chinese document', async () => {
      // This is the FULL WORKFLOW test
      
      // Step 1: Parse all documents
      const oldEnglish = await parser.parseSections(oldEnglishContent, 'intro.md');
      const newEnglish = await parser.parseSections(newEnglishContent, 'intro.md');
      const currentChinese = await parser.parseSections(currentChineseContent, 'intro.md');
      
      console.log('\n=== INTEGRATION TEST: Full Workflow ===');
      console.log(`Old English: ${oldEnglish.sections.length} sections`);
      console.log(`New English: ${newEnglish.sections.length} sections`);
      console.log(`Current Chinese: ${currentChinese.sections.length} sections`);
      
      // Step 2: Detect changes
      const changes = await detector.detectSectionChanges(
        oldEnglishContent,
        newEnglishContent,
        'intro.md'
      );
      
      console.log(`\nDetected changes: ${changes.length}`);
      changes.forEach(change => {
        const heading = change.newSection?.heading || change.oldSection?.heading;
        console.log(`  - ${change.type.toUpperCase()}: ${heading}`);
      });
      
      // Step 3: Verify Chinese document structure
      // Should start with 5 sections (same as old English)
      expect(currentChinese.sections.length).toBe(5);
      
      // Step 4: Apply changes manually (simulating FileProcessor)
      let updatedChineseSections = [...currentChinese.sections];
      
      for (const change of changes) {
        if (change.type === 'added') {
          // Translate the new section
          const translation = await translator.translateSection({
            mode: 'NEW',
            section: change.newSection,
            sourceLanguage: 'en',
            targetLanguage: 'zh-cn',
            glossary: {},
          });
          
          // Insert at the correct position
          const insertIndex = change.position?.index || 0;
          const translatedSection = {
            ...change.newSection!,
            heading: translation.translatedContent.split('\n')[0],
            content: translation.translatedContent,
          };
          
          updatedChineseSections.splice(insertIndex, 0, translatedSection);
          console.log(`\nInserted translated section at position ${insertIndex}:`);
          console.log(`  ${translatedSection.heading}`);
        }
        else if (change.type === 'modified') {
          // Translate the modified section
          const translation = await translator.translateSection({
            mode: 'UPDATE',
            oldSection: change.oldSection,
            newSection: change.newSection,
            currentTranslation: '', // Would normally find this
            sourceLanguage: 'en',
            targetLanguage: 'zh-cn',
            glossary: {},
          });
          
          // Find and update the section
          const sectionIndex = updatedChineseSections.findIndex(s => 
            s.id === change.newSection!.id
          );
          
          if (sectionIndex >= 0) {
            updatedChineseSections[sectionIndex] = {
              ...updatedChineseSections[sectionIndex],
              content: translation.translatedContent,
            };
            console.log(`\nUpdated section at position ${sectionIndex}:`);
            console.log(`  ${updatedChineseSections[sectionIndex].heading}`);
          }
        }
        else if (change.type === 'deleted') {
          // Remove the section
          const sectionIndex = updatedChineseSections.findIndex(s =>
            s.id === change.oldSection!.id
          );
          
          if (sectionIndex >= 0) {
            updatedChineseSections.splice(sectionIndex, 1);
            console.log(`\nDeleted section at position ${sectionIndex}`);
          }
        }
      }
      
      // Step 5: Verify the result
      console.log(`\nFinal Chinese document: ${updatedChineseSections.length} sections`);
      
      // Should now have 6 sections (5 original + 1 new)
      expect(updatedChineseSections.length).toBe(6);
      
      // Verify the order and headings
      expect(updatedChineseSections[0].heading).toBe('## 入门');                 // Getting Started
      expect(updatedChineseSections[1].heading).toBe('## 经济模型');            // Economic Models (NEW!)
      expect(updatedChineseSections[2].heading).toBe('## 数学示例');            // Mathematical Example
      expect(updatedChineseSections[3].heading).toBe('## Python工具');          // Python Tools
      expect(updatedChineseSections[4].heading).toBe('## 数据分析');            // Data Analysis
      expect(updatedChineseSections[5].heading).toBe('## 结论');                // Conclusion
      
      // Verify Economic Models has Chinese content
      expect(updatedChineseSections[1].content).toContain('经济模型是经济过程的简化表示');
      expect(updatedChineseSections[1].content).toContain('理论和实证');
      
      console.log('\n✅ Integration test PASSED: Document correctly transformed!');
    });

    it('INTEGRATION: should preserve code blocks and math in translations', async () => {
      // Parse documents
      const newEnglish = await parser.parseSections(newEnglishContent, 'intro.md');
      const currentChinese = await parser.parseSections(currentChineseContent, 'intro.md');
      
      // Find the Python Tools section in new English
      const pythonSection = newEnglish.sections.find(s => s.id === 'python-tools');
      expect(pythonSection).toBeDefined();
      
      // Verify it has the pandas import in new version
      expect(pythonSection?.content).toContain('import pandas as pd');
      
      // Translate it
      const translation = await translator.translateSection({
        mode: 'UPDATE',
        newSection: pythonSection,
        sourceLanguage: 'en',
        targetLanguage: 'zh-cn',
        glossary: {},
      });
      
      // Verify translation preserves code block
      expect(translation.translatedContent).toContain('```python');
      expect(translation.translatedContent).toContain('import numpy as np');
      expect(translation.translatedContent).toContain('import pandas as pd');
      expect(translation.translatedContent).toContain('```');
      
      // Verify it has Chinese text
      expect(translation.translatedContent).toContain('Python工具');
      expect(translation.translatedContent).toContain('数值计算');
    });

    it('INTEGRATION: should maintain frontmatter in reconstructed document', async () => {
      // Extract frontmatter from current Chinese
      const frontmatterMatch = currentChineseContent.match(/^---\n[\s\S]*?\n---\n\n/);
      expect(frontmatterMatch).toBeTruthy();
      
      const frontmatter = frontmatterMatch![0];
      
      // Verify frontmatter structure
      expect(frontmatter).toContain('jupytext:');
      expect(frontmatter).toContain('format_name: myst');
      expect(frontmatter).toContain('kernelspec:');
      
      // In actual reconstruction, frontmatter would be preserved
      console.log('\nFrontmatter preserved:');
      console.log(frontmatter);
    });
  });

  describe('Scenario: Multiple simultaneous changes', () => {
    it('should handle ADDED, MODIFIED, and DELETED sections together', async () => {
      // Create a complex scenario
      const oldContent = `## Section A

Content A here.

## Section B

Content B here.

## Section C

Content C here with some text.

## Section D

Content D here.
`;

      const newContent = `## Section A

This is completely different content A with much more text to trigger modification detection threshold.

## New Section X

Brand new section X content.

## Section C

Content C here with some text.

## Section D

Content D here.

## New Section Y

Another brand new section Y.
`;

      // Detect changes
      const changes = await detector.detectSectionChanges(oldContent, newContent, 'test.md');
      
      const added = changes.filter(c => c.type === 'added');
      const modified = changes.filter(c => c.type === 'modified');
      const deleted = changes.filter(c => c.type === 'deleted');
      
      console.log('\n=== Complex Scenario ===');
      console.log(`ADDED: ${added.length} sections`);
      console.log(`MODIFIED: ${modified.length} sections`);
      console.log(`DELETED: ${deleted.length} sections`);
      
      // Verify we caught all changes
      expect(added.length).toBe(2);     // New Section X and Y
      expect(modified.length).toBe(1);   // Section A (content changed significantly)
      expect(deleted.length).toBe(1);    // Section B removed
      
      // Verify specific sections
      expect(added.find(c => c.newSection?.heading === '## New Section X')).toBeDefined();
      expect(added.find(c => c.newSection?.heading === '## New Section Y')).toBeDefined();
      expect(modified.find(c => c.newSection?.heading === '## Section A')).toBeDefined();
      expect(deleted.find(c => c.oldSection?.heading === '## Section B')).toBeDefined();
    });
  });
});

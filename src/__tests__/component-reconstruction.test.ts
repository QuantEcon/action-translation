/**
 * Tests for component-based document reconstruction
 * 
 * These tests verify that the new component-based approach always
 * reconstructs complete documents: CONFIG + TITLE + INTRO + SECTIONS
 */

import { FileProcessor } from '../file-processor.js';
import { TranslationService } from '../translator.js';

describe('Component-Based Reconstruction', () => {
  let processor: FileProcessor;
  let mockTranslator: jest.Mocked<TranslationService>;

  beforeEach(() => {
    // Create mock translator
    mockTranslator = {
      translateSection: jest.fn(),
      translateFullDocument: jest.fn(),
    } as any;

    processor = new FileProcessor(mockTranslator, true);
  });

  it('should preserve all sections when only intro changes', async () => {
    const oldContent = `---
config: test
---

# Introduction to Economics

This is a comprehensive test lecture.

## Basic Concepts

Economics is the study of resources.

## Mathematical Framework

The production function is key.`;

    const newContent = `---
config: test
---

# Introduction to Economics

This is a simple test lecture.

## Basic Concepts

Economics is the study of resources.

## Mathematical Framework

The production function is key.`;

    const targetContent = `---
config: test
---

# 经济学导论

这是一个全面的测试讲座。

## 基本概念

经济学是资源的研究。

## 数学框架

生产函数是关键。`;

    // Mock translation for intro change
    mockTranslator.translateSection.mockResolvedValue({
      success: true,
      translatedSection: '这是一个简单的测试讲座。',
    });

    const result = await processor.processSectionBased(
      oldContent,
      newContent,
      targetContent,
      'test.md',
      'en',
      'zh-cn'
    );

    // Verify structure is complete
    expect(result).toContain('---');  // CONFIG
    expect(result).toContain('# 经济学导论');  // TITLE
    expect(result).toContain('这是一个简单的测试讲座');  // INTRO (translated)
    expect(result).toContain('## 基本概念');  // SECTION 1
    expect(result).toContain('## 数学框架');  // SECTION 2

    // Count sections - should have both
    const sectionMatches = result.match(/^## /gm);
    expect(sectionMatches).toHaveLength(2);

    // Verify only intro was translated (1 call)
    expect(mockTranslator.translateSection).toHaveBeenCalledTimes(1);
  });

  it('should preserve intro when only section changes', async () => {
    const oldContent = `---
config: test
---

# Title

Introduction paragraph here.

## Section One

Old content.`;

    const newContent = `---
config: test
---

# Title

Introduction paragraph here.

## Section One

New content here with actual changes.`;

    const targetContent = `---
config: test
---

# 标题

介绍段落在这里。

## 第一部分

旧内容。`;

    // Mock translation for section change
    mockTranslator.translateSection.mockResolvedValue({
      success: true,
      translatedSection: '## 第一部分\n\n新内容在这里，有实际的变化。',
    });

    const result = await processor.processSectionBased(
      oldContent,
      newContent,
      targetContent,
      'test.md',
      'en',
      'zh-cn'
    );

    // Verify complete structure
    expect(result).toContain('---');
    expect(result).toContain('# 标题');
    expect(result).toContain('介绍段落在这里');  // Intro preserved
    expect(result).toContain('## 第一部分');
    expect(result).toContain('新内容在这里，有实际的变化');  // Section updated

    // Only section was translated
    expect(mockTranslator.translateSection).toHaveBeenCalledTimes(1);
  });

  it('should handle documents with empty intro', async () => {
    const oldContent = `---
config: test
---

# Title

## Section

Content.`;

    const newContent = `---
config: test
---

# Title

## Section

New content.`;

    const targetContent = `---
config: test
---

# 标题

## 部分

内容。`;

    mockTranslator.translateSection.mockResolvedValue({
      success: true,
      translatedSection: '## 部分\n\n新内容。',
    });

    const result = await processor.processSectionBased(
      oldContent,
      newContent,
      targetContent,
      'test.md',
      'en',
      'zh-cn'
    );

    // Verify structure
    expect(result).toContain('# 标题');
    expect(result).toContain('## 部分');
    
    // No double empty lines where intro should be
    expect(result).not.toMatch(/\n\n\n\n/);
  });

  it('should handle title changes', async () => {
    const oldContent = `---
config: test
---

# Introduction

Text.

## Section

Content.`;

    const newContent = `---
config: test
---

# Introduction to Economics

Text.

## Section

Content.`;

    const targetContent = `---
config: test
---

# 介绍

文本。

## 部分

内容。`;

    // Mock title translation
    mockTranslator.translateSection.mockResolvedValueOnce({
      success: true,
      translatedSection: '# 经济学导论',
    });

    const result = await processor.processSectionBased(
      oldContent,
      newContent,
      targetContent,
      'test.md',
      'en',
      'zh-cn'
    );

    // Verify title changed
    expect(result).toContain('# 经济学导论');
    expect(result).not.toContain('# 介绍');
    
    // But intro and sections preserved
    expect(result).toContain('文本');
    expect(result).toContain('## 部分');
  });

  it('should handle documents with no sections (only title + intro)', async () => {
    const oldContent = `---
config: test
---

# Title

This is just intro text with no sections.

More intro.`;

    const newContent = `---
config: test
---

# Title

This is updated intro text with no sections.

More intro.`;

    const targetContent = `---
config: test
---

# 标题

这只是没有部分的介绍文本。

更多介绍。`;

    mockTranslator.translateSection.mockResolvedValue({
      success: true,
      translatedSection: '这是更新的没有部分的介绍文本。\n\n更多介绍。',
    });

    const result = await processor.processSectionBased(
      oldContent,
      newContent,
      targetContent,
      'test.md',
      'en',
      'zh-cn'
    );

    // Verify structure
    expect(result).toContain('# 标题');
    expect(result).toContain('这是更新的没有部分的介绍文本');
    
    // No sections
    expect(result).not.toContain('##');
  });
});

/**
 * Element Isolation Tests
 * 
 * Systematically test each document element in isolation to ensure
 * changes to one element don't affect others.
 */
describe('Element Isolation Tests', () => {
  let processor: FileProcessor;
  let mockTranslator: jest.Mocked<TranslationService>;

  beforeEach(() => {
    mockTranslator = {
      translateSection: jest.fn(),
      translateFullDocument: jest.fn(),
    } as any;

    processor = new FileProcessor(mockTranslator, false);
  });

  describe('1. YAML Frontmatter Changes Only', () => {
    it('should handle added frontmatter field without translating content', async () => {
      const oldContent = `---
config: test
---

# Title

Intro text.

## Section

Content.`;

      const newContent = `---
config: test
newfield: value
---

# Title

Intro text.

## Section

Content.`;

      const targetContent = `---
config: test
---

# 标题

介绍文本。

## 部分

内容。`;

      const result = await processor.processSectionBased(
        oldContent,
        newContent,
        targetContent,
        'test.md',
        'en',
        'zh-cn'
      );

      // New frontmatter field added
      expect(result).toContain('config: test');
      expect(result).toContain('newfield: value');
      
      // Content unchanged - no translation calls needed
      expect(result).toContain('# 标题');
      expect(result).toContain('介绍文本');
      expect(result).toContain('## 部分');
      
      // No translations should occur
      expect(mockTranslator.translateSection).not.toHaveBeenCalled();
    });

    it('should handle modified frontmatter field', async () => {
      const oldContent = `---
version: 1.0
---

# Title

Text.`;

      const newContent = `---
version: 2.0
---

# Title

Text.`;

      const targetContent = `---
version: 1.0
---

# 标题

文本。`;

      const result = await processor.processSectionBased(
        oldContent,
        newContent,
        targetContent,
        'test.md',
        'en',
        'zh-cn'
      );

      // Note: YAML parser may normalize "2.0" to "2"
      expect(result).toMatch(/version:\s+2(\.0)?/);
      expect(result).toContain('# 标题');
      expect(mockTranslator.translateSection).not.toHaveBeenCalled();
    });
  });

  describe('2. Title Changes Only', () => {
    it('should translate title only when title changes', async () => {
      const oldContent = `---
config: test
---

# Introduction

Intro text here.

## Section One

Content.`;

      const newContent = `---
config: test
---

# Introduction to Economics

Intro text here.

## Section One

Content.`;

      const targetContent = `---
config: test
---

# 介绍

这里是介绍文本。

## 第一部分

内容。`;

      mockTranslator.translateSection.mockResolvedValueOnce({
        success: true,
        translatedSection: '# 经济学导论',
      });

      const result = await processor.processSectionBased(
        oldContent,
        newContent,
        targetContent,
        'test.md',
        'en',
        'zh-cn'
      );

      // Title translated
      expect(result).toContain('# 经济学导论');
      expect(result).not.toContain('# 介绍');
      
      // Intro and sections preserved
      expect(result).toContain('这里是介绍文本');
      expect(result).toContain('## 第一部分');
      expect(result).toContain('内容');
      
      // Only title translated
      expect(mockTranslator.translateSection).toHaveBeenCalledTimes(1);
      expect(mockTranslator.translateSection).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'update',
          oldEnglish: '# Introduction',
          newEnglish: '# Introduction to Economics',
          currentTranslation: '# 介绍',
        })
      );
    });

    it('should update heading-map with new title', async () => {
      const oldContent = `---
config: test
heading-map:
  "Introduction": "介绍"
  "Section": "部分"
---

# Introduction

Text.

## Section

Content.`;

      const newContent = `---
config: test
heading-map:
  "Introduction": "介绍"
  "Section": "部分"
---

# Introduction to Economics

Text.

## Section

Content.`;

      const targetContent = `---
config: test
heading-map:
  "Introduction": "介绍"
  "Section": "部分"
---

# 介绍

文本。

## 部分

内容。`;

      mockTranslator.translateSection.mockResolvedValue({
        success: true,
        translatedSection: '# 经济学导论',
      });

      const result = await processor.processSectionBased(
        oldContent,
        newContent,
        targetContent,
        'test.md',
        'en',
        'zh-cn'
      );

      // Title updated
      expect(result).toContain('# 经济学导论');
      
      // Heading map contains section heading
      expect(result).toContain('heading-map:');
      expect(result).toMatch(/Section:\s+部分/);
    });
  });

  describe('3. Intro Text Changes Only', () => {
    it('should translate intro only when intro changes', async () => {
      const oldContent = `---
config: test
---

# Title

This is the old introduction paragraph.

## Section

Content here.`;

      const newContent = `---
config: test
---

# Title

This is the new introduction paragraph with different text.

## Section

Content here.`;

      const targetContent = `---
config: test
---

# 标题

这是旧的介绍段落。

## 部分

这里是内容。`;

      mockTranslator.translateSection.mockResolvedValue({
        success: true,
        translatedSection: '这是新的介绍段落，内容不同。',
      });

      const result = await processor.processSectionBased(
        oldContent,
        newContent,
        targetContent,
        'test.md',
        'en',
        'zh-cn'
      );

      // Intro translated
      expect(result).toContain('这是新的介绍段落，内容不同');
      expect(result).not.toContain('这是旧的介绍段落');
      
      // Title and sections preserved
      expect(result).toContain('# 标题');
      expect(result).toContain('## 部分');
      expect(result).toContain('这里是内容');
      
      // Only intro translated
      expect(mockTranslator.translateSection).toHaveBeenCalledTimes(1);
    });

    it('should preserve all sections when intro changes', async () => {
      const oldContent = `---
config: test
---

# Title

Old intro.

## Section A

Content A.

## Section B

Content B.

## Section C

Content C.`;

      const newContent = `---
config: test
---

# Title

New intro.

## Section A

Content A.

## Section B

Content B.

## Section C

Content C.`;

      const targetContent = `---
config: test
---

# 标题

旧介绍。

## 部分 A

内容 A。

## 部分 B

内容 B。

## 部分 C

内容 C。`;

      mockTranslator.translateSection.mockResolvedValue({
        success: true,
        translatedSection: '新介绍。',
      });

      const result = await processor.processSectionBased(
        oldContent,
        newContent,
        targetContent,
        'test.md',
        'en',
        'zh-cn'
      );

      // All three sections preserved
      const sectionMatches = result.match(/^## /gm);
      expect(sectionMatches).toHaveLength(3);
      expect(result).toContain('## 部分 A');
      expect(result).toContain('## 部分 B');
      expect(result).toContain('## 部分 C');
    });
  });

  describe('4. Section Heading Changes Only', () => {
    it('should translate section heading only', async () => {
      const oldContent = `---
config: test
---

# Title

Intro.

## Basic Concepts

This section covers basic concepts.`;

      const newContent = `---
config: test
---

# Title

Intro.

## Fundamental Concepts

This section covers basic concepts.`;

      const targetContent = `---
config: test
---

# 标题

介绍。

## 基本概念

本节介绍基本概念。`;

      mockTranslator.translateSection.mockResolvedValue({
        success: true,
        translatedSection: '## 基础概念\n\n本节介绍基本概念。',
      });

      const result = await processor.processSectionBased(
        oldContent,
        newContent,
        targetContent,
        'test.md',
        'en',
        'zh-cn'
      );

      // Heading changed
      expect(result).toContain('## 基础概念');
      
      // Content preserved
      expect(result).toContain('本节介绍基本概念');
      
      // Intro preserved
      expect(result).toContain('介绍');
    });
  });

  describe('5. Section Content Changes Only', () => {
    it('should translate section content only', async () => {
      const oldContent = `---
config: test
---

# Title

Intro.

## Section

Old content in this section.`;

      const newContent = `---
config: test
---

# Title

Intro.

## Section

New content in this section with updates.`;

      const targetContent = `---
config: test
---

# 标题

介绍。

## 部分

本节中的旧内容。`;

      mockTranslator.translateSection.mockResolvedValue({
        success: true,
        translatedSection: '## 部分\n\n本节中的新内容，包含更新。',
      });

      const result = await processor.processSectionBased(
        oldContent,
        newContent,
        targetContent,
        'test.md',
        'en',
        'zh-cn'
      );

      // Content updated
      expect(result).toContain('本节中的新内容，包含更新');
      expect(result).not.toContain('本节中的旧内容');
      
      // Heading preserved (same heading)
      expect(result).toContain('## 部分');
      
      // Intro preserved
      expect(result).toContain('介绍');
    });

    it('should handle code blocks in changed content', async () => {
      const oldContent = `---
config: test
---

# Title

Intro.

## Code Example

Some text before code.

\`\`\`python
x = 1
\`\`\``;

      const newContent = `---
config: test
---

# Title

Intro.

## Code Example

Some text before code with changes.

\`\`\`python
x = 2
y = 3
\`\`\``;

      const targetContent = `---
config: test
---

# 标题

介绍。

## 代码示例

代码前的一些文本。

\`\`\`python
x = 1
\`\`\``;

      mockTranslator.translateSection.mockResolvedValue({
        success: true,
        translatedSection: '## 代码示例\n\n代码前有变化的一些文本。\n\n```python\nx = 2\ny = 3\n```',
      });

      const result = await processor.processSectionBased(
        oldContent,
        newContent,
        targetContent,
        'test.md',
        'en',
        'zh-cn'
      );

      // Code updated
      expect(result).toContain('x = 2');
      expect(result).toContain('y = 3');
    });
  });

  describe('6. Subsection Changes', () => {
    it('should detect and translate subsection content changes', async () => {
      const oldContent = `---
config: test
---

# Title

Intro.

## Main Section

Main content here.

### Subsection

Old subsection content here.`;

      const newContent = `---
config: test
---

# Title

Intro.

## Main Section

Main content here with changes.

### Subsection

New subsection content here.`;

      const targetContent = `---
config: test
---

# 标题

介绍。

## 主要部分

这里是主要内容。

### 子部分

这里是旧的子部分内容。`;

      mockTranslator.translateSection.mockResolvedValue({
        success: true,
        translatedSection: '## 主要部分\n\n这里是有变化的主要内容。\n\n### 子部分\n\n这里是新的子部分内容。',
      });

      const result = await processor.processSectionBased(
        oldContent,
        newContent,
        targetContent,
        'test.md',
        'en',
        'zh-cn'
      );

      // Subsection updated
      expect(result).toContain('这里是新的子部分内容');
      expect(result).not.toContain('这里是旧的子部分内容');
      
      // Main section also changed so it's updated
      expect(result).toContain('## 主要部分');
    });
  });

  describe('7. Section Reordering', () => {
    it('should reorder sections to match English order', async () => {
      const oldContent = `---
config: test
heading-map:
  "Section A": "部分 A"
  "Section B": "部分 B"
  "Section C": "部分 C"
---

# Title

Intro.

## Section A

Content A.

## Section B

Content B.

## Section C

Content C.`;

      const newContent = `---
config: test
heading-map:
  "Section A": "部分 A"
  "Section B": "部分 B"
  "Section C": "部分 C"
---

# Title

Intro.

## Section C

Content C.

## Section A

Content A.

## Section B

Content B.`;

      const targetContent = `---
config: test
heading-map:
  "Section A": "部分 A"
  "Section B": "部分 B"
  "Section C": "部分 C"
---

# 标题

介绍。

## 部分 A

内容 A。

## 部分 B

内容 B。

## 部分 C

内容 C。`;

      const result = await processor.processSectionBased(
        oldContent,
        newContent,
        targetContent,
        'test.md',
        'en',
        'zh-cn'
      );

      // Check order: C, A, B
      const sections = result.match(/## 部分 [ABC]/g);
      expect(sections).toEqual(['## 部分 C', '## 部分 A', '## 部分 B']);
      
      // No translations needed
      expect(mockTranslator.translateSection).not.toHaveBeenCalled();
    });

    it('should maintain content when reordering', async () => {
      const oldContent = `---
config: test
heading-map:
  "First": "第一"
  "Second": "第二"
---

# Title

Text.

## First

First content.

## Second

Second content.`;

      const newContent = `---
config: test
heading-map:
  "First": "第一"
  "Second": "第二"
---

# Title

Text.

## Second

Second content.

## First

First content.`;

      const targetContent = `---
config: test
heading-map:
  "First": "第一"
  "Second": "第二"
---

# 标题

文本。

## 第一

第一内容。

## 第二

第二内容。`;

      const result = await processor.processSectionBased(
        oldContent,
        newContent,
        targetContent,
        'test.md',
        'en',
        'zh-cn'
      );

      // Verify order and content
      const firstPos = result.indexOf('## 第二');
      const secondPos = result.indexOf('## 第一');
      expect(firstPos).toBeLessThan(secondPos); // Second now comes first
      
      expect(result).toContain('第一内容');
      expect(result).toContain('第二内容');
    });
  });

  describe('8. Complex Multi-Element Changes', () => {
    it('should handle title + intro changes together', async () => {
      const oldContent = `---
config: test
---

# Economics

Introduction to economics.

## Section

Content.`;

      const newContent = `---
config: test
---

# Economics 101

Advanced introduction to economics.

## Section

Content.`;

      const targetContent = `---
config: test
---

# 经济学

经济学介绍。

## 部分

内容。`;

      mockTranslator.translateSection
        .mockResolvedValueOnce({
          success: true,
          translatedSection: '# 经济学101',
        })
        .mockResolvedValueOnce({
          success: true,
          translatedSection: '经济学高级介绍。',
        });

      const result = await processor.processSectionBased(
        oldContent,
        newContent,
        targetContent,
        'test.md',
        'en',
        'zh-cn'
      );

      // Both title and intro translated
      expect(result).toContain('# 经济学101');
      expect(result).toContain('经济学高级介绍');
      
      // Section preserved
      expect(result).toContain('## 部分');
      
      // Two translation calls
      expect(mockTranslator.translateSection).toHaveBeenCalledTimes(2);
    });

    it('should handle section heading + content changes', async () => {
      const oldContent = `---
config: test
---

# Title

Intro.

## Old Heading

Old content.`;

      const newContent = `---
config: test
---

# Title

Intro.

## New Heading

New content.`;

      const targetContent = `---
config: test
---

# 标题

介绍。

## 旧标题

旧内容。`;

      mockTranslator.translateSection.mockResolvedValue({
        success: true,
        translatedSection: '## 新标题\n\n新内容。',
      });

      const result = await processor.processSectionBased(
        oldContent,
        newContent,
        targetContent,
        'test.md',
        'en',
        'zh-cn'
      );

      // Both heading and content changed
      expect(result).toContain('## 新标题');
      expect(result).toContain('新内容');
      expect(result).not.toContain('旧标题');
      expect(result).not.toContain('旧内容');
    });
  });
});

import { DiffDetector } from '../diff-detector.js';
import { MystParser } from '../parser.js';
import * as fs from 'fs';
import * as path from 'path';

describe('DiffDetector', () => {
  let detector: DiffDetector;
  let parser: MystParser;
  
  beforeEach(() => {
    detector = new DiffDetector();
    parser = new MystParser();
  });

  describe('Section Matching - sectionsMatch()', () => {
    it('should match sections with same ID', () => {
      const section1 = {
        id: 'test.md:section-a',
        heading: '## Section A',
        level: 2,
        content: 'Content A',
        startLine: 1,
        endLine: 3,
        subsections: []
      };
      const section2 = {
        id: 'test.md:section-a',
        heading: '## Section A',
        level: 2,
        content: 'Different content',
        startLine: 1,
        endLine: 3,
        subsections: []
      };
      
      // Use reflection to test private method
      const match = (detector as any).sectionsMatch(section1, section2);
      expect(match).toBe(true);
    });

    it('should NOT match sections with different IDs (Bug #1 fix)', () => {
      // This was the bug - sectionsMatch was matching by level + subsection count
      // instead of by ID, causing false matches
      const section1 = {
        id: 'test.md:economic-models',
        heading: '## Economic Models',
        level: 2,
        content: 'Economic content',
        startLine: 10,
        endLine: 15,
        subsections: []
      };
      const section2 = {
        id: 'test.md:mathematical-example',
        heading: '## Mathematical Example',
        level: 2,
        content: 'Math content',
        startLine: 16,
        endLine: 20,
        subsections: []
      };
      
      const match = (detector as any).sectionsMatch(section1, section2);
      expect(match).toBe(false);
    });

    it('should NOT match sections even if they have same level and subsection count', () => {
      // Verify the fix - sections with same structure but different IDs don't match
      const section1 = {
        id: 'test.md:section-a',
        heading: '## Section A',
        level: 2,
        content: 'Content',
        startLine: 1,
        endLine: 5,
        subsections: [
          { id: 'test.md:section-a:sub1', heading: '### Sub 1', level: 3, content: '', startLine: 3, endLine: 4, subsections: [] }
        ]
      };
      const section2 = {
        id: 'test.md:section-b',
        heading: '## Section B',
        level: 2,
        content: 'Content',
        startLine: 10,
        endLine: 14,
        subsections: [
          { id: 'test.md:section-b:sub1', heading: '### Sub 1', level: 3, content: '', startLine: 12, endLine: 13, subsections: [] }
        ]
      };
      
      const match = (detector as any).sectionsMatch(section1, section2);
      expect(match).toBe(false);
    });
  });

  describe('Change Detection - detectSectionChanges()', () => {
    it('should detect added sections', async () => {
      const oldContent = `## Section A

Content A.

## Section B

Content B.
`;
      const newContent = `## Section A

Content A.

## New Section

New content.

## Section B

Content B.
`;
      
      const changes = await detector.detectSectionChanges(oldContent, newContent, 'test.md');
      
      const addedSections = changes.filter((c: any) => c.type === 'added');
      expect(addedSections).toHaveLength(1);
      expect(addedSections[0].newSection?.heading).toBe('## New Section');
    });

    it('should detect MODIFIED sections', async () => {
      const oldContent = `## Section A

Short old content.
`;
      const newContent = `## Section A

Much longer new content with different text.
`;
      
      const changes = await detector.detectSectionChanges(oldContent, newContent, 'test.md');
      
      const modifiedSections = changes.filter((c: any) => c.type === 'modified');
      expect(modifiedSections).toHaveLength(1);
      expect(modifiedSections[0].oldSection?.content).toContain('Short old');
      expect(modifiedSections[0].newSection?.content).toContain('Much longer');
    });

    it('should detect subtle content changes (typo fixes, added words)', async () => {
      const oldContent = `## Section A

This is the orignal content with a typo.
`;
      const newContent = `## Section A

This is the original content with a typo fix.
`;
      
      const changes = await detector.detectSectionChanges(oldContent, newContent, 'test.md');
      
      // Should detect the change even though it's just 2 character differences
      const modifiedSections = changes.filter((c: any) => c.type === 'modified');
      expect(modifiedSections).toHaveLength(1);
      expect(modifiedSections[0].oldSection?.heading).toBe('## Section A');
      expect(modifiedSections[0].newSection?.heading).toBe('## Section A');
    });

    it('should detect added phrases in sections', async () => {
      const oldContent = `## Economic Models

Economic models are used to analyze markets.
`;
      const newContent = `## Economic Models

Economic models are used to analyze markets, with updated examples from recent research.
`;
      
      const changes = await detector.detectSectionChanges(oldContent, newContent, 'test.md');
      
      // Should detect the added phrase
      const modifiedSections = changes.filter((c: any) => c.type === 'modified');
      expect(modifiedSections).toHaveLength(1);
    });

    it('should detect deleted sections', async () => {
      const oldContent = `## Section A

Content A.

## Section B

Content B.
`;
      const newContent = `## Section A

Content A.
`;
      
      const changes = await detector.detectSectionChanges(oldContent, newContent, 'test.md');
      
      const deletedSections = changes.filter((c: any) => c.type === 'deleted');
      expect(deletedSections).toHaveLength(1);
      expect(deletedSections[0].oldSection?.heading).toBe('## Section B');
    });

    it('should correctly identify added section when inserted in middle (Bug #1 scenario)', async () => {
      // This is the exact scenario that triggered Bug #1
      // When "Economic Models" was inserted at position 1, the old code
      // matched it with "Mathematical Example" and called it modified
      const fixturePath = path.join(__dirname, 'fixtures');
      const oldContent = fs.readFileSync(path.join(fixturePath, 'intro-old.md'), 'utf-8');
      const newContent = fs.readFileSync(path.join(fixturePath, 'intro-new.md'), 'utf-8');
      
      const changes = await detector.detectSectionChanges(oldContent, newContent, 'intro.md');
      
      // Should detect "Economic Models" as added, not modified
      const addedSections = changes.filter((c: any) => c.type === 'added');
      const economicModels = addedSections.find((c: any) => c.newSection?.heading === '## Economic Models');
      
      expect(economicModels).toBeDefined();
      expect(economicModels?.type).toBe('added');
      
      // Should NOT have a false modified change for Mathematical Example
      const modifiedSections = changes.filter((c: any) => c.type === 'modified');
      const mathExample = modifiedSections.find((c: any) => 
        c.oldSection?.heading === '## Mathematical Example' ||
        c.newSection?.heading === '## Mathematical Example'
      );
      
      // If it exists, verify content actually changed
      if (mathExample) {
        expect(mathExample.oldSection?.content).not.toBe(mathExample.newSection?.content);
      }
    });

    it('should detect multiple changes of different types', async () => {
      const oldContent = `## Section A

Short content for section A.

## Section B

Short content for section B.

## Section C

Short content for section C.
`;
      const newContent = `## Section A

This is significantly longer content for section A that will trigger the modification detection since it exceeds the length threshold.

## Section D

Brand new section D with some content.

## Section C

Short content for section C.
`;
      
      const changes = await detector.detectSectionChanges(oldContent, newContent, 'test.md');
      
      expect(changes.filter((c: any) => c.type === 'added')).toHaveLength(1);
      expect(changes.filter((c: any) => c.type === 'modified')).toHaveLength(1);
      expect(changes.filter((c: any) => c.type === 'deleted')).toHaveLength(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle no changes', async () => {
      const content = `## Section A

Content.
`;
      
      const changes = await detector.detectSectionChanges(content, content, 'test.md');
      expect(changes).toHaveLength(0);
    });

    it('should handle empty old content (all sections are added)', async () => {
      const newContent = `## Section A

Content A.

## Section B

Content B.
`;
      
      const changes = await detector.detectSectionChanges('', newContent, 'test.md');
      
      expect(changes).toHaveLength(2);
      expect(changes.every((c: any) => c.type === 'added')).toBe(true);
    });

    it('should handle empty new content (all sections are deleted)', async () => {
      const oldContent = `## Section A

Content A.

## Section B

Content B.
`;
      
      const changes = await detector.detectSectionChanges(oldContent, '', 'test.md');
      
      expect(changes).toHaveLength(2);
      expect(changes.every((c: any) => c.type === 'deleted')).toBe(true);
    });
  });

  describe('Preamble Change Detection', () => {
    it('should detect preamble changes (title and intro)', async () => {
      const oldContent = `---
jupytext:
  format_name: myst
---

# Introduction to Economics

This is a test lecture.

## Section One

Content here.
`;

      const newContent = `---
jupytext:
  format_name: myst
---

# Introduction to Quantitative Economics

This is a comprehensive test lecture with more details.

## Section One

Content here.
`;

      const changes = await detector.detectSectionChanges(oldContent, newContent, 'test.md');
      
      // Should detect preamble change
      const preambleChange = changes.find((c: any) => c.newSection?.id === '_preamble');
      expect(preambleChange).toBeDefined();
      expect(preambleChange?.type).toBe('modified');
      expect(preambleChange?.oldSection?.content).toContain('Introduction to Economics');
      expect(preambleChange?.newSection?.content).toContain('Introduction to Quantitative Economics');
      expect(preambleChange?.newSection?.content).toContain('comprehensive test lecture');
    });

    it('should not detect preamble change when only frontmatter changes', async () => {
      const oldContent = `---
jupytext:
  format_name: myst
---

# Title

Intro text.

## Section One

Content.
`;

      const newContent = `---
jupytext:
  format_name: myst
  format_version: 0.13
---

# Title

Intro text.

## Section One

Content.
`;

      const changes = await detector.detectSectionChanges(oldContent, newContent, 'test.md');
      
      // Preamble unchanged, so no preamble change detected
      const preambleChange = changes.find((c: any) => c.newSection?.id === '_preamble');
      expect(preambleChange).toBeUndefined();
    });

    it('should detect when preamble is added', async () => {
      const oldContent = `## Section One

Content.
`;

      const newContent = `# New Title

New intro paragraph.

## Section One

Content.
`;

      const changes = await detector.detectSectionChanges(oldContent, newContent, 'test.md');
      
      // Preamble was added
      const preambleChange = changes.find((c: any) => c.newSection?.id === '_preamble');
      expect(preambleChange).toBeDefined();
      expect(preambleChange?.newSection?.content).toContain('New Title');
      expect(preambleChange?.newSection?.content).toContain('New intro paragraph');
    });

    it('should detect when preamble is removed', async () => {
      const oldContent = `# Title

Intro text.

## Section One

Content.
`;

      const newContent = `## Section One

Content.
`;

      const changes = await detector.detectSectionChanges(oldContent, newContent, 'test.md');
      
      // Preamble was removed
      const preambleChange = changes.find((c: any) => c.oldSection?.id === '_preamble');
      expect(preambleChange).toBeDefined();
      expect(preambleChange?.type).toBe('modified');
      expect(preambleChange?.oldSection?.content).toContain('Title');
    });

    it('should handle preamble change along with section changes', async () => {
      const oldContent = `# Old Title

Old intro.

## Section A

Content A.

## Section B

Content B.
`;

      const newContent = `# New Title

New intro with more details.

## Section A

Content A.

## New Section C

New content.

## Section B

Content B.
`;

      const changes = await detector.detectSectionChanges(oldContent, newContent, 'test.md');
      
      // Should have preamble change + section addition
      const preambleChange = changes.find((c: any) => c.newSection?.id === '_preamble');
      const sectionAddition = changes.find((c: any) => c.type === 'added' && c.newSection?.heading === '## New Section C');
      
      expect(preambleChange).toBeDefined();
      expect(sectionAddition).toBeDefined();
    });
  });

  describe('Nested Subsection Changes (#### and deeper)', () => {
    it('should detect #### sub-subsection added to ### subsection', async () => {
      const oldContent = `## Vector Spaces

Introduction to vector spaces.

### Basic Properties

Vector spaces have properties.

The sum of vectors is defined.
`;

      const newContent = `## Vector Spaces

Introduction to vector spaces.

### Basic Properties

Vector spaces have properties.

#### Closure Property

The closure property is important.

$$
\\alpha \\mathbf{u} + \\beta \\mathbf{v} \\in V
$$

This is crucial for economics.

The sum of vectors is defined.
`;

      const changes = await detector.detectSectionChanges(oldContent, newContent, 'test.md');
      
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('modified');
      expect(changes[0].newSection?.heading).toBe('## Vector Spaces');
    });

    it('should detect #### content modification within ### subsection', async () => {
      const oldContent = `## Economics

Introduction.

### Models

Economic models.

#### Growth Model

Old growth model description.

Some equations here.
`;

      const newContent = `## Economics

Introduction.

### Models

Economic models.

#### Growth Model

Updated growth model with new insights and better equations.

Some equations here.
`;

      const changes = await detector.detectSectionChanges(oldContent, newContent, 'test.md');
      
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('modified');
      expect(changes[0].newSection?.heading).toBe('## Economics');
    });

    it('should detect ##### deeply nested changes', async () => {
      const oldContent = `## Main Topic

Content.

### Subtopic A

Content A.

#### Detail 1

Detail content.

##### Fine Point 1

Original fine point.
`;

      const newContent = `## Main Topic

Content.

### Subtopic A

Content A.

#### Detail 1

Detail content.

##### Fine Point 1

Modified fine point with additional information.
`;

      const changes = await detector.detectSectionChanges(oldContent, newContent, 'test.md');
      
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('modified');
      expect(changes[0].newSection?.heading).toBe('## Main Topic');
    });

    it('should detect multiple #### subsections added', async () => {
      const oldContent = `## Section

Content.

### Subsection

Text.
`;

      const newContent = `## Section

Content.

### Subsection

Text.

#### Part A

New part A.

#### Part B

New part B.

#### Part C

New part C.
`;

      const changes = await detector.detectSectionChanges(oldContent, newContent, 'test.md');
      
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('modified');
    });

    it('should handle mixed depth changes (#### added, ### modified)', async () => {
      const oldContent = `## Main

Content.

### Sub1

Text 1.

### Sub2

Text 2.
`;

      const newContent = `## Main

Content.

### Sub1

Modified text 1.

### Sub2

Text 2.

#### SubSub2A

New deep section.
`;

      const changes = await detector.detectSectionChanges(oldContent, newContent, 'test.md');
      
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('modified');
      expect(changes[0].newSection?.heading).toBe('## Main');
    });

    it('should NOT detect change when #### content unchanged', async () => {
      const content = `## Section

Content.

### Subsection

Text.

#### SubSubsection

Deep content.

More deep content.
`;

      const changes = await detector.detectSectionChanges(content, content, 'test.md');
      
      expect(changes).toHaveLength(0);
    });
  });
});

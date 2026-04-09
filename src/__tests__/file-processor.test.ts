import { Section } from '../types.js';
import { FileProcessor } from '../file-processor.js';
import { TranslationService } from '../translator.js';
import { extractHeadingMap, extractTranslationTitle } from '../heading-map.js';

/**
 * Tests for FileProcessor key methods
 * 
 * These tests verify the critical bug fixes:
 * - Bug #2: findMatchingSectionIndex() must match by ID, not position
 */

describe('FileProcessor - Section Matching Logic', () => {
  /**
   * Simulates the FIXED findMatchingSectionIndex logic
   * This matches sections by ID, not position
   */
  function findMatchingSectionIndex(targetSections: Section[], sourceSection: Section): number {
    for (let i = 0; i < targetSections.length; i++) {
      if (targetSections[i].id === sourceSection.id) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Simulates the OLD BUGGY logic for comparison
   * This always returned 0 for the first matching level
   */
  function findMatchingSectionIndexBuggy(targetSections: Section[], sourceSection: Section): number {
    for (let i = 0; i < targetSections.length; i++) {
      const targetSection = targetSections[i];
      
      // BUG: This matched on level and subsection count, always returning first match
      if (targetSection.level === sourceSection.level) {
        const subsectionDiff = Math.abs(targetSection.subsections.length - sourceSection.subsections.length);
        if (subsectionDiff <= 1) {
          return i;  // Always returned 0 for level-2 sections
        }
      }
    }
    return -1;
  }

  describe('Bug #2 Fix - findMatchingSectionIndex()', () => {
    const targetSections: Section[] = [
      { id: 'intro.md:getting-started', heading: '## Getting Started', level: 2, content: '', startLine: 1, endLine: 5, subsections: [] },
      { id: 'intro.md:mathematical-example', heading: '## Mathematical Example', level: 2, content: '', startLine: 6, endLine: 10, subsections: [] },
      { id: 'intro.md:python-tools', heading: '## Python Tools', level: 2, content: '', startLine: 11, endLine: 15, subsections: [] },
      { id: 'intro.md:data-analysis', heading: '## Data Analysis', level: 2, content: '', startLine: 16, endLine: 20, subsections: [] }
    ];

    it('FIXED: should find correct section by ID', () => {
      // Test finding each section correctly
      expect(findMatchingSectionIndex(targetSections, targetSections[0])).toBe(0);
      expect(findMatchingSectionIndex(targetSections, targetSections[1])).toBe(1);
      expect(findMatchingSectionIndex(targetSections, targetSections[2])).toBe(2);
      expect(findMatchingSectionIndex(targetSections, targetSections[3])).toBe(3);
    });

    it('BUG: old code always returned 0 for level-2 sections', () => {
      // Demonstrate the bug - all level-2 sections matched the first one
      expect(findMatchingSectionIndexBuggy(targetSections, targetSections[0])).toBe(0); // Correct by accident
      expect(findMatchingSectionIndexBuggy(targetSections, targetSections[1])).toBe(0); // WRONG! Should be 1
      expect(findMatchingSectionIndexBuggy(targetSections, targetSections[2])).toBe(0); // WRONG! Should be 2
      expect(findMatchingSectionIndexBuggy(targetSections, targetSections[3])).toBe(0); // WRONG! Should be 3
    });

    it('should return -1 when section not found', () => {
      const newSection: Section = {
        id: 'intro.md:new-section',
        heading: '## New Section',
        level: 2,
        content: '',
        startLine: 25,
        endLine: 30,
        subsections: []
      };
      
      expect(findMatchingSectionIndex(targetSections, newSection)).toBe(-1);
    });

    it('should handle first section correctly (not always return 0)', () => {
      // Verify we correctly identify first section vs incorrectly always returning 0
      const firstSection = targetSections[0];
      const thirdSection = targetSections[2];
      
      expect(findMatchingSectionIndex(targetSections, firstSection)).toBe(0);
      expect(findMatchingSectionIndex(targetSections, thirdSection)).toBe(2); // NOT 0!
    });
  });

  describe('Document Reconstruction Logic', () => {
    /**
     * Simulates reconstructDocument - assembles sections back into a document
     */
    function reconstructDocument(sections: Section[], frontmatter: string): string {
      let result = frontmatter;
      
      for (const section of sections) {
        result += section.heading + section.content;
        
        // Add subsections
        for (const subsection of section.subsections) {
          result += subsection.heading + subsection.content;
        }
      }
      
      return result.trim();
    }

    it('should preserve section order', () => {
      const sections: Section[] = [
        { id: 'test.md:intro', heading: '# Title', level: 1, content: '\n\nIntro.\n\n', startLine: 1, endLine: 3, subsections: [] },
        { id: 'test.md:a', heading: '## A', level: 2, content: '\n\nContent A.\n\n', startLine: 4, endLine: 6, subsections: [] },
        { id: 'test.md:b', heading: '## B', level: 2, content: '\n\nContent B.\n\n', startLine: 7, endLine: 9, subsections: [] }
      ];
      
      const doc = reconstructDocument(sections, '');
      
      expect(doc.indexOf('# Title')).toBeLessThan(doc.indexOf('## A'));
      expect(doc.indexOf('## A')).toBeLessThan(doc.indexOf('## B'));
    });

    it('should include subsections in correct order', () => {
      const sections: Section[] = [
        {
          id: 'test.md:parent',
          heading: '## Parent',
          level: 2,
          content: '\n\nParent content.\n\n',
          startLine: 1,
          endLine: 5,
          subsections: [
            {
              id: 'test.md:parent:child',
              heading: '### Child',
              level: 3,
              content: '\n\nChild content.\n\n',
              startLine: 3,
              endLine: 5,
              subsections: []
            }
          ]
        }
      ];
      
      const doc = reconstructDocument(sections, '');
      
      expect(doc).toContain('## Parent');
      expect(doc).toContain('### Child');
      expect(doc.indexOf('## Parent')).toBeLessThan(doc.indexOf('### Child'));
    });
  });

  describe('Bug #3 Fix - Frontmatter and Preamble Preservation', () => {
    /**
     * Simulates reconstructFromSections with frontmatter and preamble
     */
    function reconstructWithFrontmatter(
      sections: Section[],
      frontmatter?: string,
      preamble?: string
    ): string {
      const parts: string[] = [];

      if (frontmatter) {
        parts.push(frontmatter);
        parts.push('');
      }

      if (preamble) {
        parts.push(preamble);
        parts.push('');
      }

      for (const section of sections) {
        parts.push(section.content);
        parts.push('');
      }

      return parts.join('\n').trim() + '\n';
    }

    it('should preserve YAML frontmatter during reconstruction', () => {
      const frontmatter = `---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
kernelspec:
  display_name: Python 3
  name: python3
---`;

      const sections: Section[] = [
        {
          id: 'section-a',
          heading: '## Section A',
          level: 2,
          content: '## Section A\n\nContent here.',
          startLine: 1,
          endLine: 3,
          subsections: []
        }
      ];

      const doc = reconstructWithFrontmatter(sections, frontmatter);

      // Frontmatter should be at the start
      expect(doc.startsWith('---')).toBe(true);
      expect(doc).toContain('jupytext:');
      expect(doc).toContain('format_name: myst');
      expect(doc).toContain('kernelspec:');
      
      // Section should come after frontmatter
      expect(doc.indexOf('---')).toBeLessThan(doc.indexOf('## Section A'));
    });

    it('should preserve document title and intro (preamble) during reconstruction', () => {
      const frontmatter = '---\njupytext:\n  format_name: myst\n---';
      const preamble = '# Introduction to Economics\n\nThis is a test lecture for translation sync action.';

      const sections: Section[] = [
        {
          id: 'basic-concepts',
          heading: '## Basic Concepts',
          level: 2,
          content: '## Basic Concepts\n\nEconomics is the study of resources.',
          startLine: 1,
          endLine: 3,
          subsections: []
        }
      ];

      const doc = reconstructWithFrontmatter(sections, frontmatter, preamble);

      // Should contain frontmatter
      expect(doc).toContain('jupytext:');
      
      // Should contain preamble (title + intro)
      expect(doc).toContain('# Introduction to Economics');
      expect(doc).toContain('This is a test lecture');
      
      // Should contain sections
      expect(doc).toContain('## Basic Concepts');
      
      // Order should be: frontmatter → preamble → sections
      const frontmatterIndex = doc.indexOf('---');
      const titleIndex = doc.indexOf('# Introduction to Economics');
      const sectionIndex = doc.indexOf('## Basic Concepts');
      
      expect(frontmatterIndex).toBeLessThan(titleIndex);
      expect(titleIndex).toBeLessThan(sectionIndex);
    });

    it('BUG #3: without preservation, frontmatter and preamble are lost', () => {
      // This simulates the old buggy behavior
      function reconstructBuggy(sections: Section[]): string {
        const parts: string[] = [];
        for (const section of sections) {
          parts.push(section.content);
          parts.push('');
        }
        return parts.join('\n').trim() + '\n';
      }

      const sections: Section[] = [
        {
          id: 'section-a',
          heading: '## Section A',
          level: 2,
          content: '## Section A\n\nContent.',
          startLine: 1,
          endLine: 2,
          subsections: []
        }
      ];

      const buggyDoc = reconstructBuggy(sections);

      // Buggy version loses frontmatter and title
      expect(buggyDoc).not.toContain('---');
      expect(buggyDoc).not.toContain('jupytext:');
      expect(buggyDoc).not.toContain('# Introduction');
      
      // Only has the section
      expect(buggyDoc).toContain('## Section A');
    });

    it('should handle documents without frontmatter or preamble', () => {
      const sections: Section[] = [
        {
          id: 'section-a',
          heading: '## Section A',
          level: 2,
          content: '## Section A\n\nContent.',
          startLine: 1,
          endLine: 2,
          subsections: []
        }
      ];

      // No frontmatter, no preamble
      const doc = reconstructWithFrontmatter(sections);

      expect(doc).toContain('## Section A');
      expect(doc).not.toContain('---');
      expect(doc).not.toContain('#Introduction');
    });
  });

  // ========================================================================
  // REGRESSION TESTS FOR v0.4.3
  // ========================================================================
  
  describe('Document Reconstruction - v0.4.3 Regression Tests', () => {
    /**
     * Simulates reconstructFromSections - the FIXED version
     */
    function reconstructFromSections(
      sections: Section[],
      frontmatter?: string,
      preamble?: string
    ): string {
      const parts: string[] = [];

      if (frontmatter) {
        parts.push(frontmatter);
        parts.push('');
      }

      if (preamble) {
        parts.push(preamble);
        parts.push('');
      }

      for (const section of sections) {
        // FIXED: section.content already includes subsections
        parts.push(section.content);
        // DO NOT append subsections separately - they're already in section.content!
      }

      return parts.join('\n').trim() + '\n';
    }

    it('should NOT duplicate subsections in output', () => {
      // This is the critical v0.4.3 bug fix test
      const sections: Section[] = [
        {
          id: 'parent-section',
          heading: '## 概述',
          level: 2,
          content: `## 概述

主要内容在这里。

### 核心原则

子部分内容。

`,
          startLine: 10,
          endLine: 20,
          subsections: [
            {
              id: 'parent-section:core-principles',
              heading: '### 核心原则',
              level: 3,
              content: `### 核心原则

子部分内容。

`,
              startLine: 15,
              endLine: 20,
              subsections: []
            }
          ]
        }
      ];

      // Reconstruct document
      const reconstructed = reconstructFromSections(
        sections,
        '---\ntitle: Test\n---',
        ''
      );

      // Count occurrences of subsection heading
      const matches = reconstructed.match(/### 核心原则/g);
      
      // Should appear EXACTLY ONCE (not twice)
      expect(matches).toHaveLength(1);
      
      // Verify content structure
      expect(reconstructed).toContain('## 概述');
      expect(reconstructed).toContain('### 核心原则');
      expect(reconstructed).toContain('主要内容在这里');
      expect(reconstructed).toContain('子部分内容');
    });

    it('BUG: v0.4.3-debug duplicated subsections', () => {
      // Simulate the buggy v0.4.3-debug behavior
      function reconstructBuggy(sections: Section[]): string {
        const parts: string[] = [];
        
        for (const section of sections) {
          parts.push(section.content);  // Already includes subsections
          
          // BUG: Append subsections again!
          for (const subsection of section.subsections) {
            parts.push(subsection.content);  // DUPLICATE!
          }
        }
        
        return parts.join('\n');
      }

      const sections: Section[] = [
        {
          id: 'test',
          heading: '## Section',
          level: 2,
          content: '## Section\n\n### Subsection\n\nContent.\n\n',
          startLine: 1,
          endLine: 5,
          subsections: [
            {
              id: 'test:sub',
              heading: '### Subsection',
              level: 3,
              content: '### Subsection\n\nContent.\n\n',
              startLine: 3,
              endLine: 5,
              subsections: []
            }
          ]
        }
      ];

      const buggyOutput = reconstructBuggy(sections);
      const matches = buggyOutput.match(/### Subsection/g);
      
      // Buggy code produces DUPLICATE
      expect(matches).toHaveLength(2);  // Bug demonstrated!
      
      // Fixed code produces single occurrence
      const fixedOutput = reconstructFromSections(sections);
      const fixedMatches = fixedOutput.match(/### Subsection/g);
      expect(fixedMatches).toHaveLength(1);  // Fixed!
    });

    it('should handle multiple sections with subsections correctly', () => {
      const sections: Section[] = [
        {
          id: 'section-1',
          heading: '## Section 1',
          level: 2,
          content: '## Section 1\n\n### Sub 1A\n\nContent.\n\n### Sub 1B\n\nMore.\n\n',
          startLine: 1,
          endLine: 10,
          subsections: [
            {
              id: 'section-1:sub-1a',
              heading: '### Sub 1A',
              level: 3,
              content: '### Sub 1A\n\nContent.\n\n',
              startLine: 3,
              endLine: 5,
              subsections: []
            },
            {
              id: 'section-1:sub-1b',
              heading: '### Sub 1B',
              level: 3,
              content: '### Sub 1B\n\nMore.\n\n',
              startLine: 7,
              endLine: 10,
              subsections: []
            }
          ]
        },
        {
          id: 'section-2',
          heading: '## Section 2',
          level: 2,
          content: '## Section 2\n\n### Sub 2A\n\nText.\n\n',
          startLine: 11,
          endLine: 15,
          subsections: [
            {
              id: 'section-2:sub-2a',
              heading: '### Sub 2A',
              level: 3,
              content: '### Sub 2A\n\nText.\n\n',
              startLine: 13,
              endLine: 15,
              subsections: []
            }
          ]
        }
      ];

      const reconstructed = reconstructFromSections(sections, '', '');

      // Each subsection should appear exactly once
      expect(reconstructed.match(/### Sub 1A/g)).toHaveLength(1);
      expect(reconstructed.match(/### Sub 1B/g)).toHaveLength(1);
      expect(reconstructed.match(/### Sub 2A/g)).toHaveLength(1);
      
      // Sections should be in order
      expect(reconstructed.indexOf('## Section 1')).toBeLessThan(
        reconstructed.indexOf('## Section 2')
      );
      expect(reconstructed.indexOf('### Sub 1A')).toBeLessThan(
        reconstructed.indexOf('### Sub 1B')
      );
    });

    it('should preserve section.content which already includes subsections', () => {
      // The key insight: section.content from translation already includes subsections
      const section: Section = {
        id: 'overview',
        heading: '## Overview',
        level: 2,
        content: `## Overview

Introduction text.

### Core Principles

Subsection text already in section.content from translation.

`,
        startLine: 1,
        endLine: 10,
        subsections: [
          {
            id: 'overview:core-principles',
            heading: '### Core Principles',
            level: 3,
            content: `### Core Principles

Subsection text already in section.content from translation.

`,
            startLine: 5,
            endLine: 10,
            subsections: []
          }
        ]
      };

      // Reconstruct using ONLY section.content (correct approach)
      const parts: string[] = [];
      parts.push(section.content);
      // DO NOT append subsections separately!
      
      const correct = parts.join('\n');
      
      // Should have subsection exactly once
      expect(correct.match(/### Core Principles/g)).toHaveLength(1);
    });

    it('should handle sections without subsections', () => {
      const sections: Section[] = [
        {
          id: 'simple-section',
          heading: '## Simple Section',
          level: 2,
          content: '## Simple Section\n\nJust content, no subsections.\n\n',
          startLine: 1,
          endLine: 3,
          subsections: []  // Empty subsections array
        }
      ];

      const reconstructed = reconstructFromSections(sections);

      expect(reconstructed).toContain('## Simple Section');
      expect(reconstructed).toContain('Just content, no subsections.');
      
      // Should not have any level-3 headings
      expect(reconstructed).not.toContain('###');
    });

    it('parseTranslatedSubsections should strip subsections from content to prevent duplication', () => {
      // This documents the fix for the subsection duplication bug (GitHub issue #103)
      // 
      // PROBLEM: When translator returns section content that includes subsections,
      // and we also extract those subsections separately, they would appear twice.
      //
      // SOLUTION: parseTranslatedSubsections now returns:
      // - subsections: Array of extracted subsection objects
      // - contentWithoutSubsections: Content truncated at first subsection heading
      //
      // This test verifies the conceptual fix without needing actual translation
      
      const translatedContent = `## Supply and Demand

Supply and demand are fundamental concepts.

### Market Equilibrium

Market equilibrium occurs when supply equals demand.
`;

      // Simulate what parseTranslatedSubsections does:
      // 1. Find first subsection heading
      const firstSubsectionIndex = translatedContent.indexOf('### Market Equilibrium');
      expect(firstSubsectionIndex).toBeGreaterThan(0);
      
      // 2. Content WITHOUT subsections = everything before first subsection
      const contentWithoutSubsections = translatedContent.substring(0, firstSubsectionIndex).trim();
      
      // 3. Verify content no longer includes subsection
      expect(contentWithoutSubsections).not.toContain('### Market Equilibrium');
      expect(contentWithoutSubsections).not.toContain('Market equilibrium occurs');
      expect(contentWithoutSubsections).toContain('Supply and demand are fundamental concepts');
      
      // This ensures when we reconstruct:
      // - section.content = contentWithoutSubsections (no duplication)
      // - section.subsections = [extracted subsections] (added separately during serialization)
    });

    it('BUG FIX (v0.4.5): subsection heading should not be duplicated due to 1-indexed vs 0-indexed line numbers', () => {
      // GitHub Issue: Subsection headings appearing twice in translated output
      // Root Cause: Parser uses 1-indexed line numbers but array.slice() uses 0-indexed
      //
      // Example:
      // - Subsection heading is on line 5 (1-indexed) of unwrapped content  
      // - After adjusting for frontmatter: firstSubsectionLine = 12 - 7 = 5 (still 1-indexed)
      // - Bug: lines.slice(0, 5) gets indices 0,1,2,3,4 which is lines 1-5 (INCLUDING line 5!)
      // - Fix: Convert to 0-indexed first: lines.slice(0, 5-1) gets indices 0,1,2,3 (lines 1-4, EXCLUDING line 5)
      
      const translatedLines = [
        '## Supply and Demand',        // Line 1 (index 0)
        '',                             // Line 2 (index 1)
        'Some content here.',           // Line 3 (index 2)
        '',                             // Line 4 (index 3)
        '### Market Equilibrium',       // Line 5 (index 4) <-- subsection heading
        '',                             // Line 6 (index 5)
        'Equilibrium content.',         // Line 7 (index 6)
      ];
      
      // Parser reports startLine = 12 (1-indexed, including 7 lines of frontmatter wrapper)
      // So the subsection heading is at 1-indexed line 5 of unwrapped content
      const startLine1Indexed = 12;
      const wrapperLineCount = 7;  // Minimal YAML wrapper
      
      // OLD (BUGGY) BEHAVIOR - using hardcoded wrapper count:
      const buggyIndex = startLine1Indexed - 7;  // = 5
      const buggyContent = translatedLines.slice(0, buggyIndex).join('\n');
      expect(buggyContent).toContain('### Market Equilibrium');  // BUG: Heading included!
      
      // NEW (FIXED) BEHAVIOR - correct conversion to 0-indexed:
      const fixedIndex1Indexed = startLine1Indexed;
      const fixedIndex0Indexed = fixedIndex1Indexed - 1;  // Convert to 0-indexed = 11
      const positionInOriginal = fixedIndex0Indexed - wrapperLineCount;  // = 4
      const fixedContent = translatedLines.slice(0, positionInOriginal).join('\n');
      expect(fixedContent).not.toContain('### Market Equilibrium');  // FIXED: Heading excluded!
      expect(fixedContent).toContain('Some content here.');  // Parent content preserved
    });

    it('BUG FIX (v0.4.5): should handle variable-length YAML headers correctly', () => {
      // GitHub Issue: Hard-coded wrapper length (7) doesn't account for variable YAML headers
      // Root Cause: Different documents have different frontmatter sizes
      //
      // Example frontmatter sizes:
      // - Minimal (used in wrapper): 7 lines
      // - Typical lecture: 13+ lines (includes kernelspec, jupytext version, etc.)
      //
      // Fix: Calculate wrapper length dynamically by finding closing --- fence
      
      const minimalWrapper = [
        '---',                          // Line 1
        'jupytext:',                    // Line 2
        '  text_representation:',       // Line 3
        '    extension: .md',           // Line 4
        '    format_name: myst',        // Line 5
        '---',                          // Line 6 (closing fence)
        '',                             // Line 7 (empty line after)
      ];
      
      const extendedWrapper = [
        '---',                          // Line 1
        'jupytext:',                    // Line 2
        '  text_representation:',       // Line 3
        '    extension: .md',           // Line 4
        '    format_name: myst',        // Line 5
        '    format_version: 0.13',     // Line 6
        '    jupytext_version: 1.16.4', // Line 7
        'kernelspec:',                  // Line 8
        '  display_name: Python 3',     // Line 9
        '  language: python',           // Line 10
        '  name: python3',              // Line 11
        '---',                          // Line 12 (closing fence)
        '',                             // Line 13 (empty line after)
      ];
      
      // Function to calculate wrapper length (mimics our fix)
      const calculateWrapperLength = (wrapperLines: string[]): number => {
        let count = 0;
        let foundClosing = false;
        for (let i = 0; i < wrapperLines.length; i++) {
          count++;
          if (i > 0 && wrapperLines[i] === '---') {
            count++; // Count empty line after
            foundClosing = true;
            break;
          }
        }
        return foundClosing ? count : 0;
      };
      
      // Verify calculation works for both wrapper sizes
      expect(calculateWrapperLength(minimalWrapper)).toBe(7);
      expect(calculateWrapperLength(extendedWrapper)).toBe(13);
      
      // Simulate actual usage:
      // If subsection starts at line 15 in wrapped content with extended wrapper (13 lines)
      // Then it's at position 15 - 1 (0-indexed) - 13 (wrapper) = 1 in original content
      const subsectionLine1Indexed = 15;
      const wrapperCount = calculateWrapperLength(extendedWrapper);
      const positionInOriginal = (subsectionLine1Indexed - 1) - wrapperCount;
      
      expect(positionInOriginal).toBe(1);  // Correct position in original content
    });
  });

  describe('Recursive Subsection Structure Validation', () => {
    /**
     * Tests the validateSubsectionStructure() helper added in v0.4.7+
     * 
     * When translator doesn't return full nested structure (missing ####, #####),
     * we should detect the mismatch and preserve target subsections.
     * 
     * This prevents heading-map entries from being lost when Claude doesn't
     * return deeply nested subsections.
     */
    
    it('should detect when translator omits level-4 subsections', () => {
      // Simulate the scenario from Test 09:
      // Source: ## Vector Spaces > ### Basic Properties > #### Applications in Economics
      // Target: ## 向量空间 > ### 基本性质 > #### 在经济学中的应用
      // Translator returns: ## 向量空间 > ### 基本性质 (missing ####)
      
      const expectedSubsections: Section[] = [
        {
          id: 'basic-properties',
          heading: '### Basic Properties',
          level: 3,
          content: 'Properties content',
          startLine: 10,
          endLine: 20,
          subsections: [
            {
              id: 'applications-in-economics',
              heading: '#### Applications in Economics',
              level: 4,
              content: 'Applications content',
              startLine: 15,
              endLine: 20,
              subsections: []
            }
          ]
        }
      ];

      const parsedSubsections: Section[] = [
        {
          id: 'basic-properties',
          heading: '### 基本性质',
          level: 3,
          content: 'Properties content in Chinese',
          startLine: 10,
          endLine: 20,
          subsections: []  // Translator didn't return the #### level!
        }
      ];

      // This is the validation function from file-processor.ts
      const validateSubsectionStructure = (expected: Section[], parsed: Section[]): boolean => {
        if (expected.length !== parsed.length) return false;
        
        for (let i = 0; i < expected.length; i++) {
          // Recursively validate nested subsections
          if (!validateSubsectionStructure(expected[i].subsections, parsed[i].subsections)) {
            return false;
          }
        }
        return true;
      };

      // OLD validation: only checked direct children count
      const oldValidation = parsedSubsections.length === expectedSubsections.length;
      expect(oldValidation).toBe(true);  // BUG: Would have passed!

      // NEW validation: recursively checks full tree
      const newValidation = validateSubsectionStructure(expectedSubsections, parsedSubsections);
      expect(newValidation).toBe(false);  // ✓ Correctly detects mismatch!
    });

    it('should validate correctly when nested structure matches', () => {
      const expectedSubsections: Section[] = [
        {
          id: 'policy-implications',
          heading: '### Policy Implications',
          level: 3,
          content: 'Policy content',
          startLine: 10,
          endLine: 30,
          subsections: [
            {
              id: 'policy-trade-offs',
              heading: '#### Policy Trade-offs',
              level: 4,
              content: 'Trade-offs content',
              startLine: 15,
              endLine: 30,
              subsections: [
                {
                  id: 'short-term-effects',
                  heading: '##### Short-term Effects',
                  level: 5,
                  content: 'Short-term content',
                  startLine: 20,
                  endLine: 25,
                  subsections: []
                },
                {
                  id: 'long-term-effects',
                  heading: '##### Long-term Effects',
                  level: 5,
                  content: 'Long-term content',
                  startLine: 26,
                  endLine: 30,
                  subsections: []
                }
              ]
            }
          ]
        }
      ];

      const parsedSubsections: Section[] = [
        {
          id: 'policy-implications',
          heading: '### 政策含义',
          level: 3,
          content: 'Policy content in Chinese',
          startLine: 10,
          endLine: 30,
          subsections: [
            {
              id: 'policy-trade-offs',
              heading: '#### 政策权衡',
              level: 4,
              content: 'Trade-offs content in Chinese',
              startLine: 15,
              endLine: 30,
              subsections: [
                {
                  id: 'short-term-effects',
                  heading: '##### 短期影响',
                  level: 5,
                  content: 'Short-term content in Chinese',
                  startLine: 20,
                  endLine: 25,
                  subsections: []
                },
                {
                  id: 'long-term-effects',
                  heading: '##### 长期影响',
                  level: 5,
                  content: 'Long-term content in Chinese',
                  startLine: 26,
                  endLine: 30,
                  subsections: []
                }
              ]
            }
          ]
        }
      ];

      const validateSubsectionStructure = (expected: Section[], parsed: Section[]): boolean => {
        if (expected.length !== parsed.length) return false;
        
        for (let i = 0; i < expected.length; i++) {
          if (!validateSubsectionStructure(expected[i].subsections, parsed[i].subsections)) {
            return false;
          }
        }
        return true;
      };

      const isValid = validateSubsectionStructure(expectedSubsections, parsedSubsections);
      expect(isValid).toBe(true);  // ✓ Full nested structure matches!
    });

    it('should detect when translator omits level-5 subsections', () => {
      const expectedSubsections: Section[] = [
        {
          id: 'section',
          heading: '### Section',
          level: 3,
          content: 'Content',
          startLine: 10,
          endLine: 40,
          subsections: [
            {
              id: 'subsection',
              heading: '#### Subsection',
              level: 4,
              content: 'Sub content',
              startLine: 15,
              endLine: 40,
              subsections: [
                {
                  id: 'sub-subsection',
                  heading: '##### Sub-subsection',
                  level: 5,
                  content: 'Sub-sub content',
                  startLine: 20,
                  endLine: 40,
                  subsections: []
                }
              ]
            }
          ]
        }
      ];

      // Translator returns up to level 4, but missing level 5
      const parsedSubsections: Section[] = [
        {
          id: 'section',
          heading: '### 章节',
          level: 3,
          content: 'Content',
          startLine: 10,
          endLine: 40,
          subsections: [
            {
              id: 'subsection',
              heading: '#### 子章节',
              level: 4,
              content: 'Sub content',
              startLine: 15,
              endLine: 40,
              subsections: []  // Missing level 5!
            }
          ]
        }
      ];

      const validateSubsectionStructure = (expected: Section[], parsed: Section[]): boolean => {
        if (expected.length !== parsed.length) return false;
        
        for (let i = 0; i < expected.length; i++) {
          if (!validateSubsectionStructure(expected[i].subsections, parsed[i].subsections)) {
            return false;
          }
        }
        return true;
      };

      const isValid = validateSubsectionStructure(expectedSubsections, parsedSubsections);
      expect(isValid).toBe(false);  // ✓ Correctly detects missing level 5!
    });

    it('should detect when subsection count differs at any depth', () => {
      const expectedSubsections: Section[] = [
        {
          id: 'section',
          heading: '### Section',
          level: 3,
          content: 'Content',
          startLine: 10,
          endLine: 40,
          subsections: [
            {
              id: 'sub-a',
              heading: '#### Sub A',
              level: 4,
              content: 'A',
              startLine: 15,
              endLine: 25,
              subsections: []
            },
            {
              id: 'sub-b',
              heading: '#### Sub B',
              level: 4,
              content: 'B',
              startLine: 26,
              endLine: 40,
              subsections: []
            }
          ]
        }
      ];

      // Translator only returns one of two subsections
      const parsedSubsections: Section[] = [
        {
          id: 'section',
          heading: '### 章节',
          level: 3,
          content: 'Content',
          startLine: 10,
          endLine: 40,
          subsections: [
            {
              id: 'sub-a',
              heading: '#### 子章节 A',
              level: 4,
              content: 'A',
              startLine: 15,
              endLine: 25,
              subsections: []
            }
            // Missing Sub B!
          ]
        }
      ];

      const validateSubsectionStructure = (expected: Section[], parsed: Section[]): boolean => {
        if (expected.length !== parsed.length) return false;
        
        for (let i = 0; i < expected.length; i++) {
          if (!validateSubsectionStructure(expected[i].subsections, parsed[i].subsections)) {
            return false;
          }
        }
        return true;
      };

      const isValid = validateSubsectionStructure(expectedSubsections, parsedSubsections);
      expect(isValid).toBe(false);  // ✓ Correctly detects count mismatch!
    });
  });

  describe('Heading Merge Logic', () => {
    /**
     * Simulates mergeSubsectionsWithTargetTranslations() helper
     * Merges source structure with target headings
     */
    function mergeSubsectionsWithTargetTranslations(
      sourceSubs: Section[],
      targetSubs: Section[]
    ): Section[] {
      return sourceSubs.map((sourceSub, i) => {
        const targetSub = targetSubs[i];
        if (targetSub) {
          return {
            ...sourceSub,
            heading: targetSub.heading,
            subsections: mergeSubsectionsWithTargetTranslations(
              sourceSub.subsections,
              targetSub.subsections
            )
          };
        }
        return sourceSub;
      });
    }

    it('should preserve Chinese headings when merging with source structure', () => {
      const sourceSubsections: Section[] = [
        {
          id: 'basic-properties',
          heading: '### Basic Properties',
          level: 3,
          content: 'Vector spaces satisfy...',
          startLine: 10,
          endLine: 20,
          subsections: [
            {
              id: 'applications-in-economics',
              heading: '#### Applications in Economics',
              level: 4,
              content: 'Vector space properties...',
              startLine: 15,
              endLine: 20,
              subsections: []
            }
          ]
        }
      ];

      const targetSubsections: Section[] = [
        {
          id: 'basic-properties',
          heading: '### 基本性质',
          level: 3,
          content: '向量空间满足...',
          startLine: 10,
          endLine: 20,
          subsections: [
            {
              id: 'applications-in-economics',
              heading: '#### 在经济学中的应用',
              level: 4,
              content: '向量空间性质...',
              startLine: 15,
              endLine: 20,
              subsections: []
            }
          ]
        }
      ];

      const merged = mergeSubsectionsWithTargetTranslations(sourceSubsections, targetSubsections);

      // Should use Chinese headings from target
      expect(merged[0].heading).toBe('### 基本性质');
      expect(merged[0].subsections[0].heading).toBe('#### 在经济学中的应用');
      
      // But use source content (the updates)
      expect(merged[0].content).toBe('Vector spaces satisfy...');
      expect(merged[0].subsections[0].content).toBe('Vector space properties...');
    });

    it('should use English headings for NEW subsections not in target', () => {
      const sourceSubsections: Section[] = [
        {
          id: 'basic-properties',
          heading: '### Basic Properties',
          level: 3,
          content: 'Content...',
          startLine: 10,
          endLine: 20,
          subsections: []
        },
        {
          id: 'new-section',
          heading: '### New Section',
          level: 3,
          content: 'New content...',
          startLine: 21,
          endLine: 30,
          subsections: []
        }
      ];

      const targetSubsections: Section[] = [
        {
          id: 'basic-properties',
          heading: '### 基本性质',
          level: 3,
          content: '内容...',
          startLine: 10,
          endLine: 20,
          subsections: []
        }
        // Missing second section
      ];

      const merged = mergeSubsectionsWithTargetTranslations(sourceSubsections, targetSubsections);

      // First section: Chinese heading
      expect(merged[0].heading).toBe('### 基本性质');
      
      // Second section (NEW): English heading
      expect(merged[1].heading).toBe('### New Section');
      expect(merged[1].content).toBe('New content...');
    });

    it('should handle recursive merging at multiple levels', () => {
      const sourceSubsections: Section[] = [
        {
          id: 'level3',
          heading: '### Level 3',
          level: 3,
          content: 'Content',
          startLine: 10,
          endLine: 40,
          subsections: [
            {
              id: 'level4',
              heading: '#### Level 4',
              level: 4,
              content: 'Content',
              startLine: 15,
              endLine: 35,
              subsections: [
                {
                  id: 'level5',
                  heading: '##### Level 5',
                  level: 5,
                  content: 'Content',
                  startLine: 20,
                  endLine: 30,
                  subsections: []
                }
              ]
            }
          ]
        }
      ];

      const targetSubsections: Section[] = [
        {
          id: 'level3',
          heading: '### 三级',
          level: 3,
          content: '内容',
          startLine: 10,
          endLine: 40,
          subsections: [
            {
              id: 'level4',
              heading: '#### 四级',
              level: 4,
              content: '内容',
              startLine: 15,
              endLine: 35,
              subsections: [
                {
                  id: 'level5',
                  heading: '##### 五级',
                  level: 5,
                  content: '内容',
                  startLine: 20,
                  endLine: 30,
                  subsections: []
                }
              ]
            }
          ]
        }
      ];

      const merged = mergeSubsectionsWithTargetTranslations(sourceSubsections, targetSubsections);

      // All levels should have Chinese headings
      expect(merged[0].heading).toBe('### 三级');
      expect(merged[0].subsections[0].heading).toBe('#### 四级');
      expect(merged[0].subsections[0].subsections[0].heading).toBe('##### 五级');
    });
  });
});

// ============================================================================
// processFull — Heading-Map Injection
// ============================================================================

describe('FileProcessor.processFull — heading-map injection', () => {
  let processor: FileProcessor;
  let mockTranslator: jest.Mocked<TranslationService>;

  beforeEach(() => {
    mockTranslator = {
      translateSection: jest.fn(),
      translateFullDocument: jest.fn(),
    } as any;
    processor = new FileProcessor(mockTranslator, false);
  });

  it('should inject heading-map into translated new file with sections', async () => {
    const sourceContent = `---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
---

# Introduction

Intro text.

## Getting Started

Content here.

## Advanced Topics

More content.
`;

    const translatedContent = `---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
---

# 介绍

介绍文字。

## 入门指南

内容在这里。

## 高级主题

更多内容。
`;

    mockTranslator.translateFullDocument.mockResolvedValue({
      success: true,
      translatedSection: translatedContent,
    });

    const result = await processor.processFull(
      sourceContent,
      'test.md',
      'en',
      'zh-cn',
    );

    // Should contain translation metadata
    const headingMap = extractHeadingMap(result);
    expect(headingMap.size).toBe(2);
    expect(headingMap.get('Getting Started')).toBe('入门指南');
    expect(headingMap.get('Advanced Topics')).toBe('高级主题');

    // Should contain translated title
    const title = extractTranslationTitle(result);
    expect(title).toBe('介绍');
  });

  it('should handle title-only files (no sections) without error', async () => {
    const sourceContent = `---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
---

# Status

This file has no sections.
`;

    const translatedContent = `---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
---

# 状态

这个文件没有章节。
`;

    mockTranslator.translateFullDocument.mockResolvedValue({
      success: true,
      translatedSection: translatedContent,
    });

    const result = await processor.processFull(
      sourceContent,
      'status.md',
      'en',
      'zh-cn',
    );

    // Title-only file: title should still be injected
    const title = extractTranslationTitle(result);
    expect(title).toBe('状态');

    // No sections → no heading entries
    const headingMap = extractHeadingMap(result);
    expect(headingMap.size).toBe(0);
  });

  it('should handle subsections in heading-map', async () => {
    const sourceContent = `---
config: test
---

# Lecture

Intro.

## Main Section

Content.

### Subsection A

Sub content.
`;

    const translatedContent = `---
config: test
---

# 讲座

简介。

## 主要部分

内容。

### 子节 A

子内容。
`;

    mockTranslator.translateFullDocument.mockResolvedValue({
      success: true,
      translatedSection: translatedContent,
    });

    const result = await processor.processFull(
      sourceContent,
      'lecture.md',
      'en',
      'zh-cn',
    );

    const headingMap = extractHeadingMap(result);
    expect(headingMap.size).toBe(2);
    expect(headingMap.get('Main Section')).toBe('主要部分');
    // Subsection uses path-based key
    expect(headingMap.get('Main Section::Subsection A')).toBe('子节 A');
  });
});

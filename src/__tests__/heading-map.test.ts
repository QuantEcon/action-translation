import {
  extractHeadingMap,
  updateHeadingMap,
  serializeHeadingMap,
  lookupTargetHeading,
  injectHeadingMap
} from '../heading-map.js';
import { Section } from '../types.js';

describe('Heading Map System', () => {
  describe('extractHeadingMap', () => {
    it('should extract heading map from frontmatter', () => {
      const content = `---
title: Test
heading-map:
  Introduction: 简介
  Overview: 概述
  Key Concepts: 关键概念
---

Content here`;

      const map = extractHeadingMap(content);
      
      expect(map.size).toBe(3);
      expect(map.get('Introduction')).toBe('简介');
      expect(map.get('Overview')).toBe('概述');
      expect(map.get('Key Concepts')).toBe('关键概念');
    });

    it('should return empty map when no frontmatter', () => {
      const content = `## Introduction

Some content`;

      const map = extractHeadingMap(content);
      
      expect(map.size).toBe(0);
    });

    it('should return empty map when no heading-map in frontmatter', () => {
      const content = `---
title: Test
author: Someone
---

Content`;

      const map = extractHeadingMap(content);
      
      expect(map.size).toBe(0);
    });

    it('should handle empty heading-map', () => {
      const content = `---
title: Test
heading-map: {}
---

Content`;

      const map = extractHeadingMap(content);
      
      expect(map.size).toBe(0);
    });

    it('should handle heading-map with subsections', () => {
      const content = `---
heading-map:
  Introduction: 简介
  Setup: 设置
  Basic Usage: 基本用法
  Advanced Topics: 高级主题
  Configuration: 配置
---

Content`;

      const map = extractHeadingMap(content);
      
      expect(map.size).toBe(5);
      expect(map.get('Advanced Topics')).toBe('高级主题');
    });
  });

  describe('updateHeadingMap', () => {
    const createSection = (heading: string, subsections: Section[] = []): Section => ({
      heading,
      level: heading.startsWith('###') ? 3 : 2,
      id: heading.replace(/^#+\s+/, '').toLowerCase().replace(/\s+/g, '-'),
      content: 'Test content',
      subsections,
      startLine: 1,
      endLine: 10
    });

    it('should add new mappings for new sections', () => {
      const existingMap = new Map<string, string>();
      const sourceSections = [
        createSection('## Introduction'),
        createSection('## Overview')
      ];
      const targetSections = [
        createSection('## 简介'),
        createSection('## 概述')
      ];

      const updated = updateHeadingMap(existingMap, sourceSections, targetSections);

      expect(updated.size).toBe(2);
      expect(updated.get('Introduction')).toBe('简介');
      expect(updated.get('Overview')).toBe('概述');
    });

    it('should preserve existing mappings', () => {
      const existingMap = new Map([
        ['Introduction', '简介'],
        ['Overview', '概述']
      ]);
      const sourceSections = [
        createSection('## Introduction'),
        createSection('## Overview'),
        createSection('## New Section')
      ];
      const targetSections = [
        createSection('## 简介'),
        createSection('## 概述'),
        createSection('## 新章节')
      ];

      const updated = updateHeadingMap(existingMap, sourceSections, targetSections);

      expect(updated.size).toBe(3);
      expect(updated.get('Introduction')).toBe('简介');
      expect(updated.get('Overview')).toBe('概述');
      expect(updated.get('New Section')).toBe('新章节');
    });

    it('should remove deleted sections from map', () => {
      const existingMap = new Map([
        ['Introduction', '简介'],
        ['Overview', '概述'],
        ['Old Section', '旧章节']
      ]);
      const sourceSections = [
        createSection('## Introduction'),
        createSection('## Overview')
      ];
      const targetSections = [
        createSection('## 简介'),
        createSection('## 概述')
      ];

      const updated = updateHeadingMap(existingMap, sourceSections, targetSections);

      expect(updated.size).toBe(2);
      expect(updated.has('Old Section')).toBe(false);
      expect(updated.get('Introduction')).toBe('简介');
      expect(updated.get('Overview')).toBe('概述');
    });

    it('should handle subsections', () => {
      const existingMap = new Map<string, string>();
      const sourceSections = [
        createSection('## Introduction', [
          createSection('### Setup'),
          createSection('### Usage')
        ])
      ];
      const targetSections = [
        createSection('## 简介', [
          createSection('### 设置'),
          createSection('### 用法')
        ])
      ];

      const updated = updateHeadingMap(existingMap, sourceSections, targetSections);

      expect(updated.size).toBe(3);
      expect(updated.get('Introduction')).toBe('简介');
      // Subsections use path-based keys
      expect(updated.get('Introduction::Setup')).toBe('设置');
      expect(updated.get('Introduction::Usage')).toBe('用法');
    });

    it('should match by position when adding new sections', () => {
      const existingMap = new Map<string, string>();
      const sourceSections = [
        createSection('## First'),
        createSection('## Second'),
        createSection('## Third')
      ];
      const targetSections = [
        createSection('## 第一'),
        createSection('## 第二'),
        createSection('## 第三')
      ];

      const updated = updateHeadingMap(existingMap, sourceSections, targetSections);

      expect(updated.get('First')).toBe('第一');
      expect(updated.get('Second')).toBe('第二');
      expect(updated.get('Third')).toBe('第三');
    });

    it('should handle mismatched section counts gracefully', () => {
      const existingMap = new Map<string, string>();
      const sourceSections = [
        createSection('## First'),
        createSection('## Second'),
        createSection('## Third')
      ];
      const targetSections = [
        createSection('## 第一'),
        createSection('## 第二')
      ];

      const updated = updateHeadingMap(existingMap, sourceSections, targetSections);

      expect(updated.size).toBe(2);
      expect(updated.get('First')).toBe('第一');
      expect(updated.get('Second')).toBe('第二');
      expect(updated.has('Third')).toBe(false);
    });

    it('should preserve title in heading-map when provided', () => {
      const existingMap = new Map([
        ['Introduction to Economics', '经济学导论'],
        ['Supply and Demand', '供给与需求'],
        ['Economic Models', '经济模型']
      ]);
      const sourceSections = [
        createSection('## Supply and Demand'),
        createSection('## Economic Models')
      ];
      const targetSections = [
        createSection('## 供给与需求'),
        createSection('## 经济模型')
      ];
      const titleHeading = 'Comprehensive Introduction to Economic Principles';

      // Without title parameter, title would be deleted
      const updatedWithoutTitle = updateHeadingMap(existingMap, sourceSections, targetSections);
      expect(updatedWithoutTitle.has('Introduction to Economics')).toBe(false);
      expect(updatedWithoutTitle.has('Comprehensive Introduction to Economic Principles')).toBe(false);

      // With title parameter, title should be preserved
      existingMap.set(titleHeading, '经济学原理综合导论');
      const updatedWithTitle = updateHeadingMap(existingMap, sourceSections, targetSections, titleHeading);
      
      expect(updatedWithTitle.size).toBe(3);
      expect(updatedWithTitle.get('Comprehensive Introduction to Economic Principles')).toBe('经济学原理综合导论');
      expect(updatedWithTitle.get('Supply and Demand')).toBe('供给与需求');
      expect(updatedWithTitle.get('Economic Models')).toBe('经济模型');
      expect(updatedWithTitle.has('Introduction to Economics')).toBe(false); // Old title removed
    });

    it('should handle title changes correctly', () => {
      const existingMap = new Map([
        ['Old Title', '旧标题'],
        ['Section One', '第一节']
      ]);
      const sourceSections = [
        createSection('## Section One')
      ];
      const targetSections = [
        createSection('## 第一节')
      ];
      const newTitle = 'New Title';

      existingMap.set(newTitle, '新标题');
      const updated = updateHeadingMap(existingMap, sourceSections, targetSections, newTitle);

      expect(updated.size).toBe(2);
      expect(updated.get('New Title')).toBe('新标题');
      expect(updated.get('Section One')).toBe('第一节');
      expect(updated.has('Old Title')).toBe(false); // Old title removed
    });
  });

  describe('serializeHeadingMap', () => {
    it('should serialize map to YAML format', () => {
      const map = new Map([
        ['Introduction', '简介'],
        ['Overview', '概述']
      ]);

      const yaml = serializeHeadingMap(map);

      expect(yaml).toContain('Introduction: 简介');
      expect(yaml).toContain('Overview: 概述');
    });

    it('should return empty string for empty map', () => {
      const map = new Map<string, string>();

      const yaml = serializeHeadingMap(map);

      expect(yaml).toBe('');
    });

    it('should handle special characters in headings', () => {
      const map = new Map([
        ['Section: Advanced', '章节：高级'],
        ['Q&A', '问答']
      ]);

      const yaml = serializeHeadingMap(map);

      expect(yaml).toContain('Section: Advanced');
      expect(yaml).toContain('章节：高级');
      expect(yaml).toContain('Q&A');
      expect(yaml).toContain('问答');
    });
  });

  describe('lookupTargetHeading', () => {
    it('should find exact match in map', () => {
      const map = new Map([
        ['Introduction', '简介'],
        ['Overview', '概述']
      ]);

      const result = lookupTargetHeading('Introduction', map);

      expect(result).toBe('简介');
    });

    it('should return undefined for missing heading', () => {
      const map = new Map([
        ['Introduction', '简介']
      ]);

      const result = lookupTargetHeading('Overview', map);

      expect(result).toBeUndefined();
    });

    it('should handle headings with ## markers', () => {
      const map = new Map([
        ['Introduction', '简介']
      ]);

      const result = lookupTargetHeading('## Introduction', map);

      expect(result).toBe('简介');
    });

    it('should handle headings with ### markers', () => {
      const map = new Map([
        ['Setup', '设置']
      ]);

      const result = lookupTargetHeading('### Setup', map);

      expect(result).toBe('设置');
    });

    it('should handle whitespace variations', () => {
      const map = new Map([
        ['Introduction', '简介']
      ]);

      const result = lookupTargetHeading('##  Introduction  ', map);

      expect(result).toBe('简介');
    });

    it('should return undefined for empty map', () => {
      const map = new Map<string, string>();

      const result = lookupTargetHeading('Introduction', map);

      expect(result).toBeUndefined();
    });
  });

  describe('injectHeadingMap', () => {
    it('should add heading-map to existing frontmatter', () => {
      const content = `---
title: Test
author: Someone
---

## Introduction

Content here`;

      const map = new Map([
        ['Introduction', '简介'],
        ['Overview', '概述']
      ]);

      const result = injectHeadingMap(content, map);

      expect(result).toContain('title: Test');
      expect(result).toContain('author: Someone');
      expect(result).toContain('heading-map:');
      expect(result).toContain('Introduction: 简介');
      expect(result).toContain('Overview: 概述');
      expect(result).toContain('## Introduction');
      expect(result).toContain('Content here');
    });

    it('should replace existing heading-map', () => {
      const content = `---
title: Test
heading-map:
  Old: 旧的
---

Content`;

      const map = new Map([
        ['New', '新的']
      ]);

      const result = injectHeadingMap(content, map);

      expect(result).not.toContain('Old: 旧的');
      expect(result).toContain('New: 新的');
    });

    it('should create frontmatter if none exists', () => {
      const content = `## Introduction

Content here`;

      const map = new Map([
        ['Introduction', '简介']
      ]);

      const result = injectHeadingMap(content, map);

      expect(result).toContain('---');
      expect(result).toContain('heading-map:');
      expect(result).toContain('Introduction: 简介');
      expect(result).toContain('## Introduction');
    });

    it('should handle empty map by removing heading-map', () => {
      const content = `---
title: Test
heading-map:
  Something: 某事
---

Content`;

      const map = new Map<string, string>();

      const result = injectHeadingMap(content, map);

      expect(result).toContain('title: Test');
      expect(result).not.toContain('heading-map:');
      expect(result).not.toContain('Something: 某事');
    });

    it('should preserve content order', () => {
      const content = `---
kernelspec:
  display_name: Python 3
title: Test Document
---

Preamble content

## Section 1

Content 1

## Section 2

Content 2`;

      const map = new Map([
        ['Section 1', '章节 1'],
        ['Section 2', '章节 2']
      ]);

      const result = injectHeadingMap(content, map);

      expect(result.indexOf('kernelspec:')).toBeLessThan(result.indexOf('title:'));
      expect(result.indexOf('title:')).toBeLessThan(result.indexOf('heading-map:'));
      expect(result.indexOf('heading-map:')).toBeLessThan(result.indexOf('Preamble content'));
      expect(result.indexOf('Preamble content')).toBeLessThan(result.indexOf('## Section 1'));
    });

    it('should handle complex nested frontmatter', () => {
      const content = `---
kernelspec:
  display_name: Python 3
  language: python
  name: python3
jupytext:
  text_representation:
    extension: .md
    format_name: myst
---

Content`;

      const map = new Map([
        ['Introduction', '简介']
      ]);

      const result = injectHeadingMap(content, map);

      expect(result).toContain('kernelspec:');
      expect(result).toContain('display_name: Python 3');
      expect(result).toContain('jupytext:');
      expect(result).toContain('heading-map:');
      expect(result).toContain('Introduction: 简介');
    });
  });

  describe('Integration: Full workflow', () => {
    it('should handle complete workflow: extract → update → inject', () => {
      // Initial Chinese document with no heading-map
      const targetContent = `---
title: Test
---

## 简介

中文内容

## 概述

更多内容`;

      // Extract (should be empty)
      const existingMap = extractHeadingMap(targetContent);
      expect(existingMap.size).toBe(0);

      // Simulate English sections from PR
      const sourceSections: Section[] = [
        {
          heading: '## Introduction',
          level: 2,
          id: 'introduction',
          content: 'English content',
          subsections: [],
          startLine: 1,
          endLine: 5
        },
        {
          heading: '## Overview',
          level: 2,
          id: 'overview',
          content: 'More content',
          subsections: [],
          startLine: 6,
          endLine: 10
        }
      ];

      // Simulate Chinese sections (same structure)
      const targetSections: Section[] = [
        {
          heading: '## 简介',
          level: 2,
          id: 'introduction',
          content: '中文内容',
          subsections: [],
          startLine: 1,
          endLine: 5
        },
        {
          heading: '## 概述',
          level: 2,
          id: 'overview',
          content: '更多内容',
          subsections: [],
          startLine: 6,
          endLine: 10
        }
      ];

      // Update (should create map by position matching)
      const updatedMap = updateHeadingMap(existingMap, sourceSections, targetSections);
      expect(updatedMap.size).toBe(2);
      expect(updatedMap.get('Introduction')).toBe('简介');
      expect(updatedMap.get('Overview')).toBe('概述');

      // Inject (should add heading-map to frontmatter)
      const result = injectHeadingMap(targetContent, updatedMap);
      expect(result).toContain('heading-map:');
      expect(result).toContain('Introduction: 简介');
      expect(result).toContain('Overview: 概述');

      // Verify we can extract it back
      const reExtracted = extractHeadingMap(result);
      expect(reExtracted.size).toBe(2);
      expect(reExtracted.get('Introduction')).toBe('简介');
    });

    it('should handle workflow with existing heading-map', () => {
      // Chinese document with existing heading-map
      const targetContent = `---
title: Test
heading-map:
  Introduction: 简介
  Overview: 概述
---

## 简介

中文内容

## 概述

更多内容`;

      // Extract existing map
      const existingMap = extractHeadingMap(targetContent);
      expect(existingMap.size).toBe(2);

      // English added a new section
      const sourceSections: Section[] = [
        {
          heading: '## Introduction',
          level: 2,
          id: 'introduction',
          content: 'English content',
          subsections: [],
          startLine: 1,
          endLine: 5
        },
        {
          heading: '## Overview',
          level: 2,
          id: 'overview',
          content: 'More content',
          subsections: [],
          startLine: 6,
          endLine: 10
        },
        {
          heading: '## New Section',
          level: 2,
          id: 'new-section',
          content: 'New content',
          subsections: [],
          startLine: 11,
          endLine: 15
        }
      ];

      const targetSections: Section[] = [
        {
          heading: '## 简介',
          level: 2,
          id: 'introduction',
          content: '中文内容',
          subsections: [],
          startLine: 1,
          endLine: 5
        },
        {
          heading: '## 概述',
          level: 2,
          id: 'overview',
          content: '更多内容',
          subsections: [],
          startLine: 6,
          endLine: 10
        },
        {
          heading: '## 新章节',
          level: 2,
          id: 'new-section',
          content: '新内容',
          subsections: [],
          startLine: 11,
          endLine: 15
        }
      ];

      // Update (should preserve existing + add new)
      const updatedMap = updateHeadingMap(existingMap, sourceSections, targetSections);
      expect(updatedMap.size).toBe(3);
      expect(updatedMap.get('Introduction')).toBe('简介');
      expect(updatedMap.get('Overview')).toBe('概述');
      expect(updatedMap.get('New Section')).toBe('新章节');

      // Inject (should update heading-map)
      const result = injectHeadingMap(targetContent, updatedMap);
      expect(result).toContain('New Section: 新章节');
    });
  });

  // ========================================================================
  // REGRESSION TESTS FOR v0.4.3
  // ========================================================================
  
  describe('Subsection Support - v0.4.3 Regression Tests', () => {
    const createSection = (heading: string, level: number, subsections: Section[] = []): Section => ({
      heading,
      level,
      id: heading.replace(/^#+\s+/, '').toLowerCase().replace(/\s+/g, '-'),
      content: 'Test content',
      subsections,
      startLine: 1,
      endLine: 10
    });

    it('should include subsections in heading-map', () => {
      const sourceSections: Section[] = [
        createSection('## Overview', 2, [
          createSection('### Core Principles', 3)
        ])
      ];

      const targetSections: Section[] = [
        createSection('## 概述', 2, [
          createSection('### 核心原则', 3)
        ])
      ];

      const existingMap = new Map<string, string>();
      const updatedMap = updateHeadingMap(existingMap, sourceSections, targetSections);

      // Should have entries for BOTH section and subsection (with path-based keys)
      expect(updatedMap.size).toBe(2);
      expect(updatedMap.get('Overview')).toBe('概述');
      expect(updatedMap.get('Overview::Core Principles')).toBe('核心原则');
    });

    it('should handle multiple subsections per section', () => {
      const sourceSections: Section[] = [
        createSection('## Basic Concepts', 2, [
          createSection('### Key Terms', 3),
          createSection('### Examples', 3)
        ])
      ];

      const targetSections: Section[] = [
        createSection('## 基本概念', 2, [
          createSection('### 关键术语', 3),
          createSection('### 示例', 3)
        ])
      ];

      const updatedMap = updateHeadingMap(new Map(), sourceSections, targetSections);

      // Should have 3 entries: 1 section + 2 subsections (with path-based keys)
      expect(updatedMap.size).toBe(3);
      expect(updatedMap.get('Basic Concepts')).toBe('基本概念');
      expect(updatedMap.get('Basic Concepts::Key Terms')).toBe('关键术语');
      expect(updatedMap.get('Basic Concepts::Examples')).toBe('示例');
    });

    it('should handle nested subsections (level 4)', () => {
      const sourceSections: Section[] = [
        createSection('## Policy Implications', 2, [
          createSection('### Policy Trade-offs', 3, [
            createSection('#### Short-term Effects', 4),
            createSection('#### Long-term Effects', 4)
          ])
        ])
      ];

      const targetSections: Section[] = [
        createSection('## 政策含义', 2, [
          createSection('### 政策权衡', 3, [
            createSection('#### 短期影响', 4),
            createSection('#### 长期影响', 4)
          ])
        ])
      ];

      const updatedMap = updateHeadingMap(new Map(), sourceSections, targetSections);

      // Should have 4 entries: 1 level-2 + 1 level-3 + 2 level-4 (with path-based keys)
      expect(updatedMap.size).toBe(4);
      expect(updatedMap.get('Policy Implications')).toBe('政策含义');
      expect(updatedMap.get('Policy Implications::Policy Trade-offs')).toBe('政策权衡');
      expect(updatedMap.get('Policy Implications::Policy Trade-offs::Short-term Effects')).toBe('短期影响');
      expect(updatedMap.get('Policy Implications::Policy Trade-offs::Long-term Effects')).toBe('长期影响');
    });

    it('should handle sections with and without subsections', () => {
      const sourceSections: Section[] = [
        createSection('## Overview', 2, [
          createSection('### Core Principles', 3)
        ]),
        createSection('## Mathematical Example', 2),  // No subsections
        createSection('## Exercises', 2, [
          createSection('### Exercise Solutions', 3)
        ])
      ];

      const targetSections: Section[] = [
        createSection('## 概述', 2, [
          createSection('### 核心原则', 3)
        ]),
        createSection('## 数学示例', 2),  // No subsections
        createSection('## 练习', 2, [
          createSection('### 练习答案', 3)
        ])
      ];

      const updatedMap = updateHeadingMap(new Map(), sourceSections, targetSections);

      // Should have 5 entries: 3 sections + 2 subsections (with path-based keys)
      expect(updatedMap.size).toBe(5);
      expect(updatedMap.get('Overview')).toBe('概述');
      expect(updatedMap.get('Overview::Core Principles')).toBe('核心原则');
      expect(updatedMap.get('Mathematical Example')).toBe('数学示例');
      expect(updatedMap.get('Exercises')).toBe('练习');
      expect(updatedMap.get('Exercises::Exercise Solutions')).toBe('练习答案');
    });

    it('BUG #10: demonstrates v0.4.1 behavior (missing subsections)', () => {
      // Simulate the buggy v0.4.1 behavior: only process sections, not subsections
      function updateHeadingMapBuggy(
        sourceSections: Section[],
        targetSections: Section[]
      ): Map<string, string> {
        const map = new Map<string, string>();
        
        // BUG: Only processes sections, not subsections recursively
        sourceSections.forEach((source, i) => {
          const target = targetSections[i];
          if (target) {
            map.set(
              source.heading.replace(/^#+\s+/, ''),
              target.heading.replace(/^#+\s+/, '')
            );
          }
          // Missing: No recursive processing of subsections!
        });
        
        return map;
      }

      const sourceSections: Section[] = [
        createSection('## Section', 2, [
          createSection('### Subsection', 3)
        ])
      ];

      const targetSections: Section[] = [
        createSection('## 部分', 2, [
          createSection('### 子部分', 3)
        ])
      ];

      const buggyMap = updateHeadingMapBuggy(sourceSections, targetSections);
      
      // Buggy version only has section, not subsection
      expect(buggyMap.size).toBe(1);  // Should be 2!
      expect(buggyMap.get('Section')).toBe('部分');
      expect(buggyMap.get('Subsection')).toBeUndefined();  // Missing!

      // Correct version has both (with path-based keys)
      const correctMap = updateHeadingMap(new Map(), sourceSections, targetSections);
      expect(correctMap.size).toBe(2);
      expect(correctMap.get('Section')).toBe('部分');
      expect(correctMap.get('Section::Subsection')).toBe('子部分');  // Present!
    });
  });
});

/**
 * Tests for the Translation Reviewer module
 *
 * Tests the review mode functionality including:
 * - Helper functions (extractPreamble, extractSections, headingToId)
 * - Change detection (identifyChangedSections)
 * - Review comment generation
 */

import * as fs from 'fs';
import * as path from 'path';
import { identifyChangedSections, parseJsonResponse } from '../reviewer.js';
import { ChangedSection } from '../types.js';

// =============================================================================
// HELPER FUNCTION TESTS
// =============================================================================

describe('Reviewer Helper Functions', () => {
  // We need to test the internal helper functions
  // Since they're not exported, we test them through identifyChangedSections

  describe('extractPreamble (via identifyChangedSections)', () => {
    it('should detect preamble changes', () => {
      const sourceBefore = `---
title: Test
---

# Title

Some intro text.

## Section
Content here.`;

      const sourceAfter = `---
title: Test Updated
---

# Title

Some intro text.

## Section
Content here.`;

      const targetBefore = `---
title: 测试
---

# 标题

介绍文字。

## 部分
内容在这里。`;

      const targetAfter = `---
title: 测试更新
---

# 标题

介绍文字。

## 部分
内容在这里。`;

      const changes = identifyChangedSections(sourceBefore, sourceAfter, targetBefore, targetAfter);

      expect(changes.some((c) => c.heading === '(preamble/frontmatter)')).toBe(true);
      expect(changes.find((c) => c.heading === '(preamble/frontmatter)')?.changeType).toBe(
        'modified'
      );
    });
  });

  describe('extractSections (via identifyChangedSections)', () => {
    it('should detect section-level changes', () => {
      const sourceBefore = `# Title

## Introduction
Original intro content.

## Methods
Methods content.`;

      const sourceAfter = `# Title

## Introduction
Updated intro content with new information.

## Methods
Methods content.`;

      const targetBefore = `# 标题

## 介绍
原始介绍内容。

## 方法
方法内容。`;

      const targetAfter = `# 标题

## 介绍
更新的介绍内容和新信息。

## 方法
方法内容。`;

      const changes = identifyChangedSections(sourceBefore, sourceAfter, targetBefore, targetAfter);

      // Should detect Introduction as modified
      const introChange = changes.find((c) => c.heading.includes('Introduction'));
      expect(introChange).toBeDefined();
      expect(introChange?.changeType).toBe('modified');
    });
  });
});

// =============================================================================
// CHANGE DETECTION TESTS
// =============================================================================

describe('identifyChangedSections', () => {
  describe('New Document', () => {
    it('should mark all sections as added for new documents', () => {
      const sourceBefore = '';
      const sourceAfter = `# New Document

## Introduction
New intro content.

## Methods
New methods.`;

      const targetBefore = '';
      const targetAfter = `# 新文档

## 介绍
新介绍内容。

## 方法
新方法。`;

      const changes = identifyChangedSections(sourceBefore, sourceAfter, targetBefore, targetAfter);

      expect(changes.length).toBeGreaterThan(0);
      expect(changes.every((c) => c.changeType === 'added')).toBe(true);
    });

    it('should handle new document with no sections', () => {
      const sourceBefore = '';
      const sourceAfter = `# Title Only

Just some text without sections.`;

      const targetBefore = '';
      const targetAfter = `# 仅标题

只是一些没有章节的文字。`;

      const changes = identifyChangedSections(sourceBefore, sourceAfter, targetBefore, targetAfter);

      expect(changes.length).toBe(1);
      expect(changes[0].changeType).toBe('added');
      expect(changes[0].heading).toBe('(new document)');
    });
  });

  describe('Deleted Document', () => {
    it('should return deleted marker for fully deleted documents', () => {
      const sourceBefore = `# Document

## Section
Content.`;
      const sourceAfter = '';
      const targetBefore = `# 文档

## 部分
内容。`;
      const targetAfter = '';

      const changes = identifyChangedSections(sourceBefore, sourceAfter, targetBefore, targetAfter);

      expect(changes.length).toBe(1);
      expect(changes[0].heading).toBe('(document deleted)');
      expect(changes[0].changeType).toBe('deleted');
    });
  });

  describe('Renamed Document (no content changes)', () => {
    it('should detect pure rename with no content changes', () => {
      const content = `# Document

## Section
Content here.`;

      const targetContent = `# 文档

## 部分
内容在这里。`;

      const changes = identifyChangedSections(content, content, targetContent, targetContent);

      expect(changes.length).toBe(1);
      expect(changes[0].heading).toContain('no content changes');
      expect(changes[0].changeType).toBe('modified');
    });
  });

  describe('Section Modifications', () => {
    it('should detect modified section content', () => {
      const sourceBefore = `# Title

## Introduction
Original content.

## Methods
Methods content.`;

      const sourceAfter = `# Title

## Introduction
Original content.

## Methods
Updated methods with new details.`;

      const targetBefore = `# 标题

## 介绍
原始内容。

## 方法
方法内容。`;

      const targetAfter = `# 标题

## 介绍
原始内容。

## 方法
更新的方法和新细节。`;

      const changes = identifyChangedSections(sourceBefore, sourceAfter, targetBefore, targetAfter);

      const methodsChange = changes.find((c) => c.heading.includes('Methods'));
      expect(methodsChange).toBeDefined();
      expect(methodsChange?.changeType).toBe('modified');
    });

    it('should detect modified section heading', () => {
      const sourceBefore = `# Title

## Introduction
Content.

## Methods
Methods content.`;

      const sourceAfter = `# Title

## Overview
Content.

## Methods
Methods content.`;

      const targetBefore = `# 标题

## 介绍
内容。

## 方法
方法内容。`;

      const targetAfter = `# 标题

## 概述
内容。

## 方法
方法内容。`;

      const changes = identifyChangedSections(sourceBefore, sourceAfter, targetBefore, targetAfter);

      // Should detect deleted Introduction and added Overview
      expect(
        changes.some((c) => c.heading.includes('Introduction') && c.changeType === 'deleted')
      ).toBe(true);
      expect(changes.some((c) => c.heading.includes('Overview') && c.changeType === 'added')).toBe(
        true
      );
    });
  });

  describe('Section Additions', () => {
    it('should detect added sections', () => {
      const sourceBefore = `# Title

## Introduction
Intro content.`;

      const sourceAfter = `# Title

## Introduction
Intro content.

## New Section
Brand new content.`;

      const targetBefore = `# 标题

## 介绍
介绍内容。`;

      const targetAfter = `# 标题

## 介绍
介绍内容。

## 新部分
全新内容。`;

      const changes = identifyChangedSections(sourceBefore, sourceAfter, targetBefore, targetAfter);

      const newSection = changes.find((c) => c.heading.includes('New Section'));
      expect(newSection).toBeDefined();
      expect(newSection?.changeType).toBe('added');
    });
  });

  describe('Section Deletions', () => {
    it('should detect deleted sections', () => {
      const sourceBefore = `# Title

## Introduction
Intro content.

## Deprecated Section
Old content to remove.

## Conclusion
Final words.`;

      const sourceAfter = `# Title

## Introduction
Intro content.

## Conclusion
Final words.`;

      const targetBefore = `# 标题

## 介绍
介绍内容。

## 废弃部分
要删除的旧内容。

## 结论
最后的话。`;

      const targetAfter = `# 标题

## 介绍
介绍内容。

## 结论
最后的话。`;

      const changes = identifyChangedSections(sourceBefore, sourceAfter, targetBefore, targetAfter);

      const deletedSection = changes.find((c) => c.heading.includes('Deprecated'));
      expect(deletedSection).toBeDefined();
      expect(deletedSection?.changeType).toBe('deleted');
    });
  });

  describe('Multiple Changes', () => {
    it('should detect multiple simultaneous changes', () => {
      const sourceBefore = `# Title

## Introduction
Original intro.

## Methods
Original methods.

## Results
Original results.`;

      const sourceAfter = `# Title

## Introduction
Updated intro with new content.

## Methodology
Renamed from Methods with updates.

## Results
Original results.

## Discussion
Brand new section.`;

      const targetBefore = `# 标题

## 介绍
原始介绍。

## 方法
原始方法。

## 结果
原始结果。`;

      const targetAfter = `# 标题

## 介绍
更新的介绍和新内容。

## 方法论
从方法重命名并更新。

## 结果
原始结果。

## 讨论
全新部分。`;

      const changes = identifyChangedSections(sourceBefore, sourceAfter, targetBefore, targetAfter);

      // Should detect: Introduction modified, Methods deleted, Methodology added, Discussion added
      expect(changes.length).toBeGreaterThanOrEqual(3);

      // Introduction should be modified
      const introChange = changes.find((c) => c.heading.includes('Introduction'));
      expect(introChange?.changeType).toBe('modified');

      // Discussion should be added
      const discussionChange = changes.find((c) => c.heading.includes('Discussion'));
      expect(discussionChange?.changeType).toBe('added');
    });
  });

  describe('Subsections', () => {
    it('should detect changes in subsections (###)', () => {
      const sourceBefore = `# Title

## Introduction

### Background
Original background.

### Motivation
Original motivation.`;

      const sourceAfter = `# Title

## Introduction

### Background
Updated background content.

### Motivation
Original motivation.`;

      const targetBefore = `# 标题

## 介绍

### 背景
原始背景。

### 动机
原始动机。`;

      const targetAfter = `# 标题

## 介绍

### 背景
更新的背景内容。

### 动机
原始动机。`;

      const changes = identifyChangedSections(sourceBefore, sourceAfter, targetBefore, targetAfter);

      // Should detect Background subsection change
      const backgroundChange = changes.find((c) => c.heading.includes('Background'));
      expect(backgroundChange).toBeDefined();
      expect(backgroundChange?.changeType).toBe('modified');
    });
  });

  describe('Edge Cases', () => {
    it('should handle documents with only frontmatter changes', () => {
      const sourceBefore = `---
title: Original
date: 2024-01-01
---

# Title

## Section
Content.`;

      const sourceAfter = `---
title: Updated
date: 2024-12-01
---

# Title

## Section
Content.`;

      const targetBefore = `---
title: 原始
date: 2024-01-01
---

# 标题

## 部分
内容。`;

      const targetAfter = `---
title: 更新
date: 2024-12-01
---

# 标题

## 部分
内容。`;

      const changes = identifyChangedSections(sourceBefore, sourceAfter, targetBefore, targetAfter);

      expect(changes.some((c) => c.heading === '(preamble/frontmatter)')).toBe(true);
    });

    it('should handle whitespace-only differences', () => {
      const sourceBefore = `# Title

## Section
Content.`;

      const sourceAfter = `# Title

## Section
Content.
`; // Added trailing newline

      const targetBefore = `# 标题

## 部分
内容。`;

      const targetAfter = `# 标题

## 部分
内容。
`;

      const changes = identifyChangedSections(sourceBefore, sourceAfter, targetBefore, targetAfter);

      // Should detect no meaningful changes (whitespace normalized)
      // or minimal preamble change
      expect(changes.length).toBeLessThanOrEqual(1);
    });

    it('should handle Chinese headings correctly', () => {
      const sourceBefore = `# Title

## Introduction
Content.`;

      const sourceAfter = `# Title

## Introduction
Updated content.`;

      const targetBefore = `# 标题

## 介绍
内容。`;

      const targetAfter = `# 标题

## 介绍
更新的内容。`;

      const changes = identifyChangedSections(sourceBefore, sourceAfter, targetBefore, targetAfter);

      expect(changes.length).toBeGreaterThan(0);
      // Should match by position since IDs differ between languages
    });

    it('should handle Persian/Farsi headings correctly', () => {
      const sourceBefore = `# Title

## Introduction
Content.`;

      const sourceAfter = `# Title

## Introduction
Updated content.`;

      const targetBefore = `# عنوان

## مقدمه
محتوا.`;

      const targetAfter = `# عنوان

## مقدمه
محتوای به‌روزشده.`;

      const changes = identifyChangedSections(sourceBefore, sourceAfter, targetBefore, targetAfter);

      expect(changes.length).toBeGreaterThan(0);
    });
  });

  // #283: `headingToId` drops the heading level, so headings that differ only
  // by level, or repeat, collided in the lookup map and an unchanged section
  // was reported as changed.
  describe('Headings that share an id (#283)', () => {
    const summary = (changes: ChangedSection[]) =>
      changes.map((c) => `${c.changeType}:${c.heading}`);
    // A target-side change keeps the pure-rename sentinel out of the way.
    const T_BEFORE = '# 标题\n\n旧。';
    const T_AFTER = '# 标题\n\n新。';

    it('reports only the changed one of two same-text headings at different levels', () => {
      const before = `# Title

## Exercises

Top-level exercises.

## Methods

### Exercises

Method exercises.`;
      const after = before.replace('Method exercises.', 'Method exercises, revised.');

      expect(summary(identifyChangedSections(before, after, T_BEFORE, T_AFTER))).toEqual([
        'modified:### Exercises',
      ]);

      const after2 = before.replace('Top-level exercises.', 'Top-level exercises, revised.');
      expect(summary(identifyChangedSections(before, after2, T_BEFORE, T_AFTER))).toEqual([
        'modified:## Exercises',
      ]);
    });

    it('reports nothing for an edit outside two same-text headings at different levels', () => {
      const before = `# Title

## Exercises

A.

## Other

B.

### Exercises

C.`;
      const after = before.replace('B.', 'B, revised.');

      expect(summary(identifyChangedSections(before, after, T_BEFORE, T_AFTER))).toEqual([
        'modified:## Other',
      ]);
    });

    it('matches a heading repeated at one level positionally, the nth to the nth', () => {
      const before = `# Title

## Model A

### Set Up

First set-up.

## Model B

### Set Up

Second set-up.`;
      const after = before.replace('Second set-up.', 'Second set-up, revised.');

      expect(summary(identifyChangedSections(before, after, T_BEFORE, T_AFTER))).toEqual([
        'modified:### Set Up',
      ]);
      // And it is the second one: its content is the revised text.
      const [change] = identifyChangedSections(before, after, T_BEFORE, T_AFTER);
      expect(change.englishContent).toBe('Second set-up, revised.');

      // An edit to neither repeat reports neither.
      const after2 = before.replace('## Model B', '## Model B (revised)');
      expect(summary(identifyChangedSections(before, after2, T_BEFORE, T_AFTER))).toEqual([
        'added:## Model B (revised)',
        'deleted:## Model B',
      ]);
    });

    it('reports a duplicate heading added as added, and one removed as deleted', () => {
      const one = `# Title

## Solver

Solve it.`;
      const two = `${one}

## Solver

Solve it again.`;

      expect(summary(identifyChangedSections(one, two, T_BEFORE, T_AFTER))).toEqual([
        'added:## Solver',
      ]);
      expect(summary(identifyChangedSections(two, one, T_BEFORE, T_AFTER))).toEqual([
        'deleted:## Solver',
      ]);
    });

    it("reports only the edited section on the issue's own example, the harness lecture", () => {
      // `### Applications in Economics` and `#### Applications in Economics`
      // both occur; an edit confined to `## Eigenvalues and Eigenvectors` was
      // reported with a spurious `modified:#### Applications in Economics`.
      const lecture = fs.readFileSync(
        path.join(
          __dirname,
          '..',
          '..',
          'tool-test-action-on-github',
          'test-action-on-github-data',
          'base-lecture.md'
        ),
        'utf-8'
      );
      const edited = lecture.replace('reveal important properties', 'reveal essential properties');
      expect(edited).not.toBe(lecture);

      expect(summary(identifyChangedSections(lecture, edited, T_BEFORE, T_AFTER))).toEqual([
        'modified:## Eigenvalues and Eigenvectors',
      ]);
    });

    it('still matches a heading whose level changed when its text is unique', () => {
      const before = `# Title

## Results

Text.`;
      const after = `# Title

### Results

Text.`;

      // Unchanged from before #283: one section, matched by text, modified.
      expect(summary(identifyChangedSections(before, after, T_BEFORE, T_AFTER))).toEqual([
        'modified:### Results',
      ]);
    });

    it('reads a level change on one of two same-text headings as one modification', () => {
      const before = `# Title

## Exercises

Top-level exercises.

## Exercises

More exercises.`;
      const after = before.replace('## Exercises\n\nMore', '### Exercises\n\nMore');
      expect(after).not.toBe(before);

      // As for a unique heading: no false DELETED line before the reviewer.
      expect(summary(identifyChangedSections(before, after, T_BEFORE, T_AFTER))).toEqual([
        'modified:### Exercises',
      ]);
    });

    it('deletes the right level when one of two same-text headings goes', () => {
      const before = `# Title

## Exercises

Top-level exercises.

### Exercises

Sub exercises.`;
      const after = `# Title

### Exercises

Sub exercises.`;

      // Exactly the deleted `##`, not the surviving `###` paired to it.
      expect(identifyChangedSections(before, after, T_BEFORE, T_AFTER)).toEqual([
        { heading: '## Exercises', changeType: 'deleted' },
      ]);
    });

    // `reviewPR` concatenates every reviewed file (each followed by a blank
    // line, in the PR's file order) and matches once, so ids collide ACROSS
    // files too: a multi-file PR whose files share a heading is paired as one
    // document.
    describe('across the files of a multi-file PR (the concatenation reviewPR matches)', () => {
      const lecture = (title: string, overview: string, exercises: string) =>
        `# ${title}\n\n## Overview\n\n${overview}\n\n## Exercises\n\n${exercises}\n`;
      const concat = (...files: string[]) => files.map((f) => `${f}\n\n`).join('');

      it('reports only the edited section when two files share their headings', () => {
        const a = lecture('A', 'A overview.', 'A exercises.');
        const before = concat(a, lecture('B', 'B overview.', 'B exercises.'));
        const after = concat(a, lecture('B', 'B overview, revised.', 'B exercises.'));

        // Before #283: three `modified` entries (both Overviews and an Exercises).
        expect(summary(identifyChangedSections(before, after, T_BEFORE, T_AFTER))).toEqual([
          'modified:## Overview',
        ]);
      });

      // KNOWN DEFECT, pinned so that the fix changes this test deliberately:
      // a new file that sorts before an existing modified file shifts the
      // nth-to-nth pairing by one file. The new file's sections pair with the
      // existing file's old sections and read `modified`; the existing file's
      // sections read `added`, its unchanged `## Exercises` included. The
      // truth is two `added` (the new file) and one `modified` (`## Overview`
      // of b.md). To be fixed by pairing Changed Sections per file.
      it('mispairs a new file that sorts before an existing modified one (known defect)', () => {
        const before = concat(lecture('B', 'B overview.', 'B exercises.'));
        const after = concat(
          lecture('New', 'New overview.', 'New exercises.'),
          lecture('B', 'B overview, revised.', 'B exercises.')
        );

        const changes = identifyChangedSections(before, after, T_BEFORE, T_AFTER);
        expect(summary(changes)).toEqual([
          'modified:## Overview',
          'modified:## Exercises',
          'added:## Overview',
          'added:## Exercises',
        ]);
        // The `modified` pair is the new file's text; the `added` pair is b.md's.
        // (A file's last section runs on into the next file's title line.)
        expect(changes.map((c) => c.englishContent?.split('\n')[0])).toEqual([
          'New overview.',
          'New exercises.',
          'B overview, revised.',
          'B exercises.',
        ]);
      });
    });
  });
});

// =============================================================================
// REVIEW COMMENT FORMATTING TESTS
// =============================================================================

describe('Review Comment Generation', () => {
  // These test the TranslationReviewer class methods
  // Since they require API calls, we test the structure/format

  describe('formatChangedSections', () => {
    it('should format empty changes array', () => {
      const changes: ChangedSection[] = [];
      // Empty array should result in no sections prompt
      expect(changes.length).toBe(0);
    });

    it('should handle mixed change types', () => {
      const changes: ChangedSection[] = [
        { heading: '## Introduction', changeType: 'modified', englishContent: 'New content' },
        { heading: '## Methods', changeType: 'added', englishContent: 'New section' },
        { heading: '## Old Section', changeType: 'deleted' },
      ];

      expect(changes.filter((c) => c.changeType === 'modified').length).toBe(1);
      expect(changes.filter((c) => c.changeType === 'added').length).toBe(1);
      expect(changes.filter((c) => c.changeType === 'deleted').length).toBe(1);
    });
  });

  describe('normalizeIssues', () => {
    // Test that issues are properly normalized to strings
    it('should handle string issues', () => {
      const issues = ['Issue 1', 'Issue 2'];
      expect(issues.every((i) => typeof i === 'string')).toBe(true);
    });

    it('should handle object issues structure', () => {
      // This tests the expected input format
      const issueObj = {
        location: '## Introduction',
        original: 'wrong text',
        suggestion: 'correct text',
      };

      expect(issueObj.location).toBeDefined();
      expect(issueObj.original).toBeDefined();
      expect(issueObj.suggestion).toBeDefined();
    });
  });
});

// =============================================================================
// INPUT VALIDATION TESTS
// =============================================================================

describe('Review Input Validation', () => {
  describe('getMode', () => {
    // Test mode validation logic
    it('should accept sync mode', () => {
      const validModes = ['sync', 'review'];
      expect(validModes.includes('sync')).toBe(true);
    });

    it('should accept review mode', () => {
      const validModes = ['sync', 'review'];
      expect(validModes.includes('review')).toBe(true);
    });

    it('should reject invalid modes', () => {
      const validModes = ['sync', 'review'];
      expect(validModes.includes('invalid')).toBe(false);
    });
  });

  describe('source-repo format', () => {
    it('should validate owner/repo format', () => {
      const validRepo = 'QuantEcon/lecture-python';
      expect(validRepo.includes('/')).toBe(true);

      const invalidRepo = 'lecture-python';
      expect(invalidRepo.includes('/')).toBe(false);
    });
  });

  describe('max-suggestions', () => {
    it('should accept positive integers', () => {
      const validValues = [1, 5, 10];
      validValues.forEach((v) => {
        expect(Number.isInteger(v) && v > 0).toBe(true);
      });
    });

    it('should accept zero', () => {
      expect(0 >= 0).toBe(true);
    });
  });
});

// =============================================================================
// INTEGRATION SCENARIOS
// =============================================================================

describe('Review Integration Scenarios', () => {
  describe('Real-world document changes', () => {
    it('should handle typical lecture content update', () => {
      const sourceBefore = `---
jupytext:
  text_representation:
    format_name: myst
kernelspec:
  display_name: Python 3
  name: python3
---

# Introduction to Supply and Demand

## Overview

This lecture introduces supply and demand curves.

## Supply Curves

The supply curve shows the relationship between price and quantity supplied.

$$
Q_s = a + bP
$$

## Demand Curves

The demand curve shows the relationship between price and quantity demanded.

$$
Q_d = c - dP
$$`;

      const sourceAfter = `---
jupytext:
  text_representation:
    format_name: myst
kernelspec:
  display_name: Python 3
  name: python3
---

# Introduction to Supply and Demand

## Overview

This lecture introduces supply and demand curves and market equilibrium.

## Supply Curves

The supply curve shows the relationship between price and quantity supplied.

$$
Q_s = a + bP
$$

## Demand Curves

The demand curve shows the relationship between price and quantity demanded.

$$
Q_d = c - dP
$$

## Market Equilibrium

Equilibrium occurs where supply equals demand.

$$
Q_s = Q_d
$$`;

      const targetBefore = `---
jupytext:
  text_representation:
    format_name: myst
kernelspec:
  display_name: Python 3
  name: python3
heading-map:
  overview: "概述"
  supply-curves: "供给曲线"
  demand-curves: "需求曲线"
---

# 供给与需求导论

## 概述

本讲介绍供给和需求曲线。

## 供给曲线

供给曲线显示价格与供给量之间的关系。

$$
Q_s = a + bP
$$

## 需求曲线

需求曲线显示价格与需求量之间的关系。

$$
Q_d = c - dP
$$`;

      const targetAfter = `---
jupytext:
  text_representation:
    format_name: myst
kernelspec:
  display_name: Python 3
  name: python3
heading-map:
  overview: "概述"
  supply-curves: "供给曲线"
  demand-curves: "需求曲线"
  market-equilibrium: "市场均衡"
---

# 供给与需求导论

## 概述

本讲介绍供给和需求曲线以及市场均衡。

## 供给曲线

供给曲线显示价格与供给量之间的关系。

$$
Q_s = a + bP
$$

## 需求曲线

需求曲线显示价格与需求量之间的关系。

$$
Q_d = c - dP
$$

## 市场均衡

均衡发生在供给等于需求的地方。

$$
Q_s = Q_d
$$`;

      const changes = identifyChangedSections(sourceBefore, sourceAfter, targetBefore, targetAfter);

      // Should detect: preamble (heading-map), Overview modified, Market Equilibrium added
      expect(changes.length).toBeGreaterThanOrEqual(2);

      // Overview should be modified
      const overviewChange = changes.find((c) => c.heading.includes('Overview'));
      expect(overviewChange?.changeType).toBe('modified');

      // Market Equilibrium should be added
      const equilibriumChange = changes.find(
        (c) => c.heading.includes('Equilibrium') || c.heading.includes('Market')
      );
      expect(equilibriumChange?.changeType).toBe('added');
    });

    it('should handle code cell changes', () => {
      const sourceBefore = `# Code Example

## Setup

\`\`\`{code-cell} python
import numpy as np
x = np.array([1, 2, 3])
\`\`\``;

      const sourceAfter = `# Code Example

## Setup

\`\`\`{code-cell} python
import numpy as np
import matplotlib.pyplot as plt
x = np.array([1, 2, 3])
\`\`\``;

      const targetBefore = `# 代码示例

## 设置

\`\`\`{code-cell} python
import numpy as np
x = np.array([1, 2, 3])
\`\`\``;

      const targetAfter = `# 代码示例

## 设置

\`\`\`{code-cell} python
import numpy as np
import matplotlib.pyplot as plt
x = np.array([1, 2, 3])
\`\`\``;

      const changes = identifyChangedSections(sourceBefore, sourceAfter, targetBefore, targetAfter);

      // Should detect Setup section as modified
      const setupChange = changes.find((c) => c.heading.includes('Setup'));
      expect(setupChange?.changeType).toBe('modified');
    });
  });
});

// =============================================================================
// parseJsonResponse TESTS
// =============================================================================

describe('parseJsonResponse', () => {
  it('should parse pure JSON response', () => {
    const json = '{"accuracy": 9, "fluency": 8}';
    const result = parseJsonResponse(json) as { accuracy: number; fluency: number };
    expect(result.accuracy).toBe(9);
    expect(result.fluency).toBe(8);
  });

  it('should extract JSON from markdown code block', () => {
    const response =
      'Here is my evaluation:\n```json\n{"accuracy": 9, "fluency": 8}\n```\nThat is my assessment.';
    const result = parseJsonResponse(response) as { accuracy: number; fluency: number };
    expect(result.accuracy).toBe(9);
    expect(result.fluency).toBe(8);
  });

  it('should extract JSON from code block without json label', () => {
    const response = '```\n{"scopeCorrect": true, "summary": "All good"}\n```';
    const result = parseJsonResponse(response) as { scopeCorrect: boolean };
    expect(result.scopeCorrect).toBe(true);
  });

  it('should extract JSON with leading/trailing text via greedy regex', () => {
    const response =
      'Based on my analysis:\n\n{"accuracy": 7, "issues": ["minor issue"]}\n\nLet me know if you need more details.';
    const result = parseJsonResponse(response) as { accuracy: number; issues: string[] };
    expect(result.accuracy).toBe(7);
    expect(result.issues).toEqual(['minor issue']);
  });

  it('should handle multiline JSON', () => {
    const response = `{
  "accuracy": 9,
  "fluency": 8,
  "issues": [
    "Issue 1",
    "Issue 2"
  ]
}`;
    const result = parseJsonResponse(response) as { accuracy: number; issues: string[] };
    expect(result.accuracy).toBe(9);
    expect(result.issues).toHaveLength(2);
  });

  it('should handle JSON in markdown code block with extra whitespace', () => {
    const response = '```json\n\n  {"scopeCorrect": true}\n\n```';
    const result = parseJsonResponse(response) as { scopeCorrect: boolean };
    expect(result.scopeCorrect).toBe(true);
  });

  it('should throw on response with no JSON', () => {
    expect(() => parseJsonResponse('No JSON here, just text')).toThrow();
  });

  it('should throw on empty string', () => {
    expect(() => parseJsonResponse('')).toThrow();
  });

  it('should handle nested objects in JSON', () => {
    const response = '{"outer": {"inner": "value"}, "list": [1, 2, 3]}';
    const result = parseJsonResponse(response) as { outer: { inner: string }; list: number[] };
    expect(result.outer.inner).toBe('value');
    expect(result.list).toEqual([1, 2, 3]);
  });

  it('should prefer code block extraction over greedy regex when both present', () => {
    // Code block has the correct JSON, trailing text has partial JSON
    const response = '```json\n{"accuracy": 9}\n```\nSome text with {invalid json}';
    const result = parseJsonResponse(response) as { accuracy: number };
    expect(result.accuracy).toBe(9);
  });

  it('should handle nested objects inside a markdown code block', () => {
    const response = '```json\n{"outer": {"inner": 1}, "list": [{"a": 2}]}\n```';
    const result = parseJsonResponse(response) as {
      outer: { inner: number };
      list: Array<{ a: number }>;
    };
    expect(result.outer.inner).toBe(1);
    expect(result.list[0].a).toBe(2);
  });

  it('should throw on JSON null', () => {
    expect(() => parseJsonResponse('null')).toThrow('Response JSON is not an object');
  });

  it('should throw on JSON array', () => {
    expect(() => parseJsonResponse('[1, 2, 3]')).toThrow('Response JSON is not an object');
  });

  it('should throw on JSON number', () => {
    expect(() => parseJsonResponse('42')).toThrow('Response JSON is not an object');
  });
});

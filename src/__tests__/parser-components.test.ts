/**
 * Tests for parseDocumentComponents method
 */

import { MystParser } from '../parser.js';

describe('MystParser.parseDocumentComponents', () => {
  let parser: MystParser;

  beforeEach(() => {
    parser = new MystParser();
  });

  it('should parse a complete document with all components', async () => {
    const content = `---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
---

# Introduction to Economics

This is the intro paragraph explaining what this document is about.

## Basic Concepts

Economics is the study of scarce resources.

### Key Terms

- Scarcity
- Opportunity cost

## Mathematical Framework

The production function is important.`;

    const result = await parser.parseDocumentComponents(content, 'test.md');

    // Check CONFIG
    expect(result.config).toContain('jupytext:');
    expect(result.config).toContain('format_name: myst');

    // Check TITLE
    expect(result.title).toBe('# Introduction to Economics');
    expect(result.titleText).toBe('Introduction to Economics');

    // Check INTRO
    expect(result.intro).toContain('This is the intro paragraph');

    // Check SECTIONS
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].heading).toBe('## Basic Concepts');
    expect(result.sections[0].subsections).toHaveLength(1);
    expect(result.sections[1].heading).toBe('## Mathematical Framework');

    // Check metadata
    expect(result.metadata.sectionCount).toBe(2);
  });

  it('should handle empty intro', async () => {
    const content = `---
config: test
---

# Title

## First Section

Content here.`;

    const result = await parser.parseDocumentComponents(content, 'test.md');

    expect(result.title).toBe('# Title');
    expect(result.intro).toBe('');
    expect(result.sections).toHaveLength(1);
  });

  it('should handle no sections (only title and intro)', async () => {
    const content = `---
config: test
---

# Title

This is just some intro text with no sections.

More intro text.`;

    const result = await parser.parseDocumentComponents(content, 'test.md');

    expect(result.title).toBe('# Title');
    expect(result.intro).toContain('This is just some intro text');
    expect(result.sections).toHaveLength(0);
  });

  it('should handle empty frontmatter', async () => {
    const content = `# Title

Intro text here.

## Section One

Content.`;

    const result = await parser.parseDocumentComponents(content, 'test.md');

    expect(result.config).toBe('');
    expect(result.title).toBe('# Title');
    expect(result.intro).toContain('Intro text here');
    expect(result.sections).toHaveLength(1);
  });

  it('should throw error if no title heading found', async () => {
    const content = `---
config: test
---

## Section Without Title

This is invalid.`;

    await expect(
      parser.parseDocumentComponents(content, 'test.md')
    ).rejects.toThrow('Document must have a # title heading');
  });

  it('should handle title with special characters', async () => {
    const content = `# Introduction to Economics: Theory & Practice

Intro text.

## Section`;

    const result = await parser.parseDocumentComponents(content, 'test.md');

    expect(result.title).toBe('# Introduction to Economics: Theory & Practice');
    expect(result.titleText).toBe('Introduction to Economics: Theory & Practice');
  });

  it('should handle MyST cross-ref target before title', async () => {
    const content = `---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
kernelspec:
  display_name: Python 3
  language: python
  name: python3
---

(python_advanced_features)=

# More Language Features

## Overview

Some intro content here.`;

    const result = await parser.parseDocumentComponents(content, 'test.md');

    expect(result.preTitle).toBe('(python_advanced_features)=');
    expect(result.title).toBe('# More Language Features');
    expect(result.titleText).toBe('More Language Features');
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].heading).toBe('## Overview');
  });

  it('should handle cross-ref target and raw block before title', async () => {
    const content = `---
config: test
---

(my_label)=
\`\`\`{raw} jupyter
<div id="qe-notebook-header" align="right" style="text-align:right;">
        <a href="https://quantecon.org/">QuantEcon</a>
</div>
\`\`\`

# My Title

Intro text.

## First Section

Content.`;

    const result = await parser.parseDocumentComponents(content, 'test.md');

    expect(result.preTitle).toContain('(my_label)=');
    expect(result.preTitle).toContain('{raw} jupyter');
    expect(result.preTitle).toContain('qe-notebook-header');
    expect(result.title).toBe('# My Title');
    expect(result.titleText).toBe('My Title');
    expect(result.intro).toContain('Intro text');
    expect(result.sections).toHaveLength(1);
  });

  it('should set preTitle to empty string when no pre-title content', async () => {
    const content = `---
config: test
---

# Title

## Section One

Content.`;

    const result = await parser.parseDocumentComponents(content, 'test.md');

    expect(result.preTitle).toBe('');
    expect(result.title).toBe('# Title');
  });
});

#!/usr/bin/env tsx
/**
 * Quick validation of identifyChangedSections
 */

import { readFileSync } from 'node:fs';
import { identifyChangedSections } from './evaluator.js';

console.log('Testing identifyChangedSections...\n');

let passed = 0;
let failed = 0;

function test(name: string, fn: () => boolean) {
  try {
    if (fn()) {
      console.log(`✅ ${name}`);
      passed++;
    } else {
      console.log(`❌ ${name}`);
      failed++;
    }
  } catch (e) {
    console.log(`❌ ${name}: ${e}`);
    failed++;
  }
}

// Test 1: Preamble-only changes
test('Preamble-only changes', () => {
  const before = `---
title: Old Title
---

## Introduction

Content here.`;

  const after = `---
title: New Title
---

## Introduction

Content here.`;

  const result = identifyChangedSections(before, after, before, after);
  return result.length === 1 && result[0].heading === '(preamble/frontmatter)';
});

// Test 2: Section content modification
test('Section content modification', () => {
  const before = `## Introduction

Old content here.`;

  const after = `## Introduction

New content here.`;

  const result = identifyChangedSections(before, after, before, after);
  return result.length === 1 && result[0].changeType === 'modified';
});

// Test 3: New section added
test('New section added', () => {
  const before = `## Introduction

Content here.`;

  const after = `## Introduction

Content here.

## New Section

New content.`;

  const result = identifyChangedSections(before, after, before, after);
  return result.length === 1 && result[0].changeType === 'added' && result[0].heading === '## New Section';
});

// Test 4: Section deleted
test('Section deleted', () => {
  const before = `## Introduction

Content.

## To Delete

Delete me.`;

  const after = `## Introduction

Content.`;

  const result = identifyChangedSections(before, after, before, after);
  return result.length === 1 && result[0].changeType === 'deleted';
});

// Test 5: New document
test('New document (empty before)', () => {
  const before = '';
  const after = `## Introduction

Content here.`;

  const result = identifyChangedSections(before, after, before, after);
  return result.length >= 1 && result.some(r => r.changeType === 'added');
});

// Test 6: Deleted document
test('Deleted document (empty after)', () => {
  const before = `## Introduction

Content.`;
  const after = '';

  const result = identifyChangedSections(before, after, before, after);
  return result.length >= 1 && result.some(r => r.changeType === 'deleted');
});

// Test 7: Subsection change
test('Subsection modification', () => {
  const before = `## Introduction

Content.

### Background

Old background.`;

  const after = `## Introduction

Content.

### Background

New background.`;

  const result = identifyChangedSections(before, after, before, after);
  return result.length === 1 && result[0].heading === '### Background';
});

// Test 8: No changes
test('No changes returns the pure-rename sentinel', () => {
  const content = `## Introduction

Content here.`;

  const result = identifyChangedSections(content, content, content, content);
  return result.length === 1 &&
    result[0].heading.includes('no content changes') &&
    result[0].changeType === 'modified';
});

// Test 9: Target-only changes (Chinese translation updated)
test('Target-only changes detected', () => {
  const source = `## Introduction

Content here.`;

  const targetBefore = `## 介绍

旧内容。`;

  const targetAfter = `## 介绍

新内容。`;

  const result = identifyChangedSections(source, source, targetBefore, targetAfter);
  return result.length === 1 && result[0].changeType === 'modified';
});

// Test 10: Multiple sections added
test('Multiple sections added', () => {
  const before = `## Introduction

Content.`;

  const after = `## Introduction

Content.

## Section A

A.

## Section B

B.`;

  const result = identifyChangedSections(before, after, before, after);
  return result.length === 2 && result.every(r => r.changeType === 'added');
});

// ============================================
// Additional tests matching GitHub test cases
// ============================================

// Test 11: Deep nesting (Test 22 - ##### and ######)
test('Deep nesting - ###### level changes', () => {
  const before = `## International Trade

Content.

### Regional Trade

More content.

#### Implementation

Details.

##### Dispute Resolution

Procedures.

###### Arbitration Panels

Old panel info.`;

  const after = `## International Trade

Content.

### Regional Trade

More content.

#### Implementation

Details.

##### Dispute Resolution

Procedures.

###### Arbitration Panels

New panel info with updates.`;

  const result = identifyChangedSections(before, after, before, after);
  return result.length === 1 && result[0].heading === '###### Arbitration Panels' && result[0].changeType === 'modified';
});

// Test 12: Empty sections (Test 24)
test('Empty sections - section with no content', () => {
  const before = `## Microeconomics

Content here.

## Macroeconomics

## International Economics

More content.`;

  const after = `## Microeconomics

Content here.

## Macroeconomics

New macroeconomics content added.

## International Economics

More content.`;

  const result = identifyChangedSections(before, after, before, after);
  return result.length === 1 && result[0].heading === '## Macroeconomics' && result[0].changeType === 'modified';
});

// Test 13: Section reorder (Test 04/16)
test('Section reorder detected as modifications', () => {
  const before = `## Supply and Demand

Supply content.

## Economic Models

Models content.`;

  const after = `## Economic Models

Models content.

## Supply and Demand

Supply content.`;

  const result = identifyChangedSections(before, after, before, after);
  // Reordering detected because content at each position changed
  return result.length >= 1;
});

// Test 14: Preamble + Section change (like Test 02 title change with version bump)
test('Preamble and section change together', () => {
  const before = `---
jupytext:
  format_version: 0.12
---

## Introduction

Old intro.`;

  const after = `---
jupytext:
  format_version: 0.13
---

## Introduction

New intro.`;

  const result = identifyChangedSections(before, after, before, after);
  return result.length === 2 && 
    result.some(r => r.heading === '(preamble/frontmatter)') &&
    result.some(r => r.heading === '## Introduction');
});

// Test 15: Code cell change (Test 12 - code inside section)
test('Code cell content change within section', () => {
  const before = `## Nash Equilibrium

Theory here.

\`\`\`python
# Old code
x = 1
\`\`\`

More content.`;

  const after = `## Nash Equilibrium

Theory here.

\`\`\`python
# New code with changes
x = 2
y = 3
\`\`\`

More content.`;

  const result = identifyChangedSections(before, after, before, after);
  return result.length === 1 && result[0].heading === '## Nash Equilibrium';
});

// Test 16: Math equation change (Test 13)
test('Display math change within section', () => {
  const before = `## Optimization

We solve:

$$
\\max_{x} f(x)
$$

End.`;

  const after = `## Optimization

We solve:

$$
\\max_{x} f(x) + g(x)
$$

End.`;

  const result = identifyChangedSections(before, after, before, after);
  return result.length === 1 && result[0].heading === '## Optimization';
});

// Test 17: Special characters in heading (Test 23)
test('Special characters in heading', () => {
  const before = `## Using \`numpy\` Arrays

Old content.`;

  const after = `## Using \`numpy\` Arrays

New content with updates.`;

  const result = identifyChangedSections(before, after, before, after);
  return result.length === 1 && result[0].heading.includes('`numpy`');
});

// Test 18: Multi-level delete (Test 14/15 - delete subsection)
test('Delete subsection leaves parent unchanged', () => {
  const before = `## Main Section

Main content.

### Subsection to Delete

Subsection content.

### Subsection to Keep

Keep this.`;

  const after = `## Main Section

Main content.

### Subsection to Keep

Keep this.`;

  const result = identifyChangedSections(before, after, before, after);
  return result.length === 1 && result[0].changeType === 'deleted' && result[0].heading === '### Subsection to Delete';
});

// Test 19: New document with multiple sections (Test 17 - game-theory.md)
test('New document with full structure', () => {
  const before = '';
  const after = `---
jupytext:
  format_name: myst
---

# Game Theory

Intro.

## Prisoner's Dilemma

Content.

## Nash Equilibrium

More content.`;

  const result = identifyChangedSections(before, after, before, after);
  // Should mark all sections as added
  return result.length >= 2 && result.every(r => r.changeType === 'added');
});

// Test 20: Add sub-subsection (Test 10)
test('Add sub-subsection (####)', () => {
  const before = `## Matrix Operations

Content.

### Eigenvalues

Eigenvalue info.`;

  const after = `## Matrix Operations

Content.

### Eigenvalues

Eigenvalue info.

#### Computing Eigenvalues

New sub-subsection with computation details.`;

  const result = identifyChangedSections(before, after, before, after);
  return result.length === 1 && result[0].heading === '#### Computing Eigenvalues' && result[0].changeType === 'added';
});

// #283: headings that share an id (same text at two levels, or repeated)
const summary = (r: ReturnType<typeof identifyChangedSections>) =>
  r.map(c => `${c.changeType}:${c.heading}`).join('|');

test('Same heading text at two levels: only the changed one is reported (#283)', () => {
  const before = `## Exercises

Top-level exercises.

## Methods

### Exercises

Method exercises.`;
  const after = before.replace('Method exercises.', 'Method exercises, revised.');
  return summary(identifyChangedSections(before, after, before, after)) === 'modified:### Exercises';
});

test('Same heading text at two levels: an edit elsewhere reports neither (#283)', () => {
  const before = `## Exercises

A.

## Other

B.

### Exercises

C.`;
  const after = before.replace('B.', 'B, revised.');
  return summary(identifyChangedSections(before, after, before, after)) === 'modified:## Other';
});

test('A heading repeated at one level matches the nth to the nth (#283)', () => {
  const before = `## Model A

### Set Up

First set-up.

## Model B

### Set Up

Second set-up.`;
  const after = before.replace('Second set-up.', 'Second set-up, revised.');
  const result = identifyChangedSections(before, after, before, after);
  return summary(result) === 'modified:### Set Up' && result[0].englishContent === 'Second set-up, revised.';
});

test('A duplicate heading added is added, one removed is deleted (#283)', () => {
  const one = `## Solver

Solve it.`;
  const two = `${one}

## Solver

Solve it again.`;
  return (
    summary(identifyChangedSections(one, two, one, two)) === 'added:## Solver' &&
    summary(identifyChangedSections(two, one, two, one)) === 'deleted:## Solver'
  );
});

test("The issue's example: an edit to one section of the harness lecture (#283)", () => {
  const lecture = readFileSync(
    new URL('../../test-action-on-github-data/base-lecture.md', import.meta.url),
    'utf-8'
  );
  const edited = lecture.replace('reveal important properties', 'reveal essential properties');
  return (
    edited !== lecture &&
    summary(identifyChangedSections(lecture, edited, lecture, edited)) ===
      'modified:## Eigenvalues and Eigenvectors'
  );
});

test('A unique heading whose level changed still matches as modified (#283)', () => {
  const before = `## Results

Text.`;
  const after = `### Results

Text.`;
  return summary(identifyChangedSections(before, after, before, after)) === 'modified:### Results';
});

test('A level change on one of two same-text headings reads as one modification (#283)', () => {
  const before = `## Exercises

Top-level exercises.

## Exercises

More exercises.`;
  const after = before.replace('## Exercises\n\nMore', '### Exercises\n\nMore');
  return summary(identifyChangedSections(before, after, before, after)) === 'modified:### Exercises';
});

test('Deleting one of two same-text headings at different levels deletes that level (#283)', () => {
  const before = `## Exercises

Top-level exercises.

### Exercises

Sub exercises.`;
  const after = `### Exercises

Sub exercises.`;
  return summary(identifyChangedSections(before, after, before, after)) === 'deleted:## Exercises';
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

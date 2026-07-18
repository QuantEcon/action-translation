/**
 * Tests for finalizeResyncContent — the deterministic output-finalization
 * step of whole-file forward resync (#105).
 *
 * The model is prompted to preserve the target's frontmatter and to never
 * invent a `---` marker, but field runs show it does both. These tests pin
 * the code-level guarantees:
 *  - the TARGET's frontmatter survives resync (not the source's)
 *  - frontmatter-less documents never gain a stray lone `---`
 *  - the heading map (`translation:` block) is injected into the output
 */

import { finalizeResyncContent, ForwardLogger } from '../commands/forward.js';
import { extractHeadingMap, extractTranslationTitle } from '../../heading-map.js';

const quietLogger: ForwardLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

const SOURCE = `---
jupytext:
  text_representation:
    format_name: myst
  jupytext_version: 1.14.5
kernelspec:
  name: python3
---

# Cobweb Model

Intro text.

## Overview

Source overview.

## History

Source history.
`;

const TARGET = `---
jupytext:
  text_representation:
    format_name: myst
  jupytext_version: 1.16.1
kernelspec:
  name: python3
---

# 蛛网模型

介绍文字。

## 概述

目标概述。

## 历史

目标历史。
`;

// What the model typically emits: the SOURCE's frontmatter, updated body
const MODEL_OUTPUT = `---
jupytext:
  text_representation:
    format_name: myst
  jupytext_version: 1.14.5
kernelspec:
  name: python3
---

# 蛛网模型

介绍文字（更新）。

## 概述

更新的概述。

## 历史

更新的历史。
`;

describe('finalizeResyncContent', () => {
  it('carries the TARGET frontmatter forward, not the source/model frontmatter (#105.4)', async () => {
    const result = await finalizeResyncContent(MODEL_OUTPUT, SOURCE, TARGET, 'cobweb.md');

    expect(result).toContain('1.16.1'); // target's jupytext version wins
    expect(result).not.toContain('1.14.5'); // source's version is gone
    expect(result).toContain('介绍文字（更新）'); // resynced body kept
  });

  it('injects the heading map and title into the output (#105.2)', async () => {
    const result = await finalizeResyncContent(MODEL_OUTPUT, SOURCE, TARGET, 'cobweb.md');

    const map = extractHeadingMap(result);
    expect(map.get('Overview')).toBe('概述');
    expect(map.get('History')).toBe('历史');
    expect(extractTranslationTitle(result)).toBe('蛛网模型');
  });

  it('strips a stray lone `---` on frontmatter-less documents (#105.3)', async () => {
    const source = `# About\n\nSource about text.\n`;
    const target = `# 关于\n\n目标关于文字。\n`;
    // Model invents an unclosed frontmatter delimiter
    const modelOutput = `---\n# 关于\n\n更新的关于文字。\n`;

    const result = await finalizeResyncContent(modelOutput, source, target, 'about.md');

    // No unclosed delimiter: either no `---` at all, or a well-formed
    // frontmatter block (from heading-map injection) with a closing marker.
    expect(result.startsWith('---\n# 关于')).toBe(false);
    expect(result).toContain('更新的关于文字');
    // Title-only heading map injection produces valid closed frontmatter
    expect(extractTranslationTitle(result)).toBe('关于');
  });

  it('does not swallow a horizontal rule as frontmatter on frontmatter-less documents', async () => {
    const source = `# About\n\nIntro.\n\n---\n\nFooter text.\n`;
    const target = `# 关于\n\n介绍。\n\n---\n\n页脚。\n`;
    // Stray delimiter + a legitimate horizontal rule later in the body
    const modelOutput = `---\n# 关于\n\n介绍（更新）。\n\n---\n\n页脚。\n`;

    const result = await finalizeResyncContent(modelOutput, source, target, 'about.md');

    expect(result).toContain('介绍（更新）');
    expect(result).toContain('页脚'); // body after the hr survives
  });

  it('prepends the target frontmatter when the model dropped it entirely', async () => {
    const modelOutputNoFm = `# 蛛网模型\n\n介绍文字（更新）。\n\n## 概述\n\n更新的概述。\n\n## 历史\n\n更新的历史。\n`;

    const result = await finalizeResyncContent(modelOutputNoFm, SOURCE, TARGET, 'cobweb.md');

    expect(result.startsWith('---\n')).toBe(true);
    expect(result).toContain('1.16.1');
    expect(result).toContain('介绍文字（更新）');
  });

  it('falls back to frontmatter-fixed content when the heading map cannot be built', async () => {
    // No `# title` heading — parseDocumentComponents throws, finalize must not
    const source = `Just text, no title.\n`;
    const target = `只有文字，没有标题。\n`;
    const modelOutput = `只有更新的文字。\n`;

    const result = await finalizeResyncContent(modelOutput, source, target, 'odd.md', quietLogger);

    expect(result).toBe('只有更新的文字。\n');
  });
});

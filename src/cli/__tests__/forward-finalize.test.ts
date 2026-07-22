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

import {
  finalizeResyncContent,
  findEmbeddedFrontmatter,
  frontmatterSignatureKeys,
  ForwardLogger,
} from '../commands/forward.js';
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

describe('model preamble before the document frontmatter (2026-07-22 field defect)', () => {
  it('drops reasoning prose emitted before the frontmatter — the observed shape', async () => {
    const preamble =
      'Looking at the diff between source and translation, the content is aligned. Let me produce the final output.';
    const modelOutput = `${preamble}\n\n---\njupytext:\n  text_representation:\n    format_name: myst\n  jupytext_version: 1.16.1\nkernelspec:\n  name: python3\n---\n\n# 蛛网模型\n\n介绍文字（更新）。\n\n## 概述\n\n更新的概述。\n\n## 历史\n\n更新的历史。\n`;

    const warnings: string[] = [];
    const logger: ForwardLogger = {
      info: () => {},
      warn: (m) => warnings.push(m),
      error: () => {},
    };
    const result = await finalizeResyncContent(modelOutput, SOURCE, TARGET, 'cobweb.md', logger);

    expect(result).not.toContain('Let me produce the final output');
    expect(result.startsWith('---\n')).toBe(true);
    // Exactly one jupytext block — the carried-forward target one
    expect(result.match(/jupytext:/g)).toHaveLength(1);
    expect(result).toContain('介绍文字（更新）');
    expect(warnings.some((w) => w.includes('preamble'))).toBe(true);
  });

  it('does not strip legitimate body content on frontmatter-less documents', async () => {
    const source = `About\n\nSome text.\n\n---\n\nnote: this line looks like a key after an hr\n`;
    const target = `关于\n\n一些文字。\n\n---\n\nnote: 像键的一行\n`;
    const modelOutput = `关于\n\n更新的文字。\n\n---\n\nnote: 像键的一行\n`;

    const result = await finalizeResyncContent(
      modelOutput,
      source,
      target,
      'about.md',
      quietLogger
    );

    // `note:` is not a frontmatter signature key — nothing is stripped
    expect(result).toContain('更新的文字');
    expect(result).toContain('note: 像键的一行');
  });
});

describe('findEmbeddedFrontmatter / frontmatterSignatureKeys', () => {
  const keys = frontmatterSignatureKeys(
    'jupytext:\n  nested: x\nkernelspec:\n  name: python3\ntitle: t\n'
  );

  it('collects top-level keys only, plus the standard set', () => {
    expect(keys.has('jupytext')).toBe(true);
    expect(keys.has('kernelspec')).toBe(true);
    expect(keys.has('title')).toBe(true);
    expect(keys.has('translation')).toBe(true);
    expect(keys.has('nested')).toBe(false);
    expect(keys.has('name')).toBe(false);
  });

  it('finds a signature block mid-content', () => {
    const content = `preamble text\n\n---\njupytext:\n  x: y\n---\nbody\n`;
    expect(findEmbeddedFrontmatter(content, keys)).toBe(2);
  });

  it('ignores a horizontal rule followed by a non-signature key', () => {
    const content = `text\n\n---\n\nnote: not frontmatter\n`;
    expect(findEmbeddedFrontmatter(content, keys)).toBe(-1);
  });

  it('ignores frontmatter-shaped YAML inside a code fence', () => {
    const content = 'intro\n\n```yaml\n---\njupytext:\n  x: y\n---\n```\n\nbody\n';
    expect(findEmbeddedFrontmatter(content, keys)).toBe(-1);
  });
});

describe('findEmbeddedFrontmatter — close-and-parse hardening (Copilot review)', () => {
  const keys = frontmatterSignatureKeys('jupytext:\n  x: y\ntitle: t\n');

  it('rejects a horizontal rule followed by signature-key prose when the slab is not YAML', () => {
    const content = `body text\n\n---\n\ntitle: a musing about titles\n\nMore prose that is not YAML.\n\n---\n\nmore body\n`;
    expect(findEmbeddedFrontmatter(content, keys)).toBe(-1);
  });

  it('rejects an unclosed candidate block at EOF', () => {
    const content = `preamble\n\n---\njupytext:\n  x: y\n`;
    expect(findEmbeddedFrontmatter(content, keys)).toBe(-1);
  });

  it('still finds a real closed, parsing block after a rejected candidate', () => {
    const content = `text\n\n---\n\ntitle: prose not yaml\n\nnot yaml here\n\n---\njupytext:\n  x: y\n---\nbody\n`;
    expect(findEmbeddedFrontmatter(content, keys)).toBe(8);
  });
});

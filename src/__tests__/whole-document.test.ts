/**
 * The whole-document fence unwrap (#363): each of unwrapDocumentFence's six
 * conditions, and both translator paths that apply it (translateFullDocument
 * for init and sync's new files, translateDocumentResync for forward) through
 * the real SDK behind a fake fetch.
 *
 * The fixture has the shape of the refused French drafts: front matter, an
 * anchor and a `{raw} jupyter` block above the title, and a document that ends
 * in a code cell's closing fence.
 */

import * as core from '@actions/core';
import { unwrapDocumentFence } from '../whole-document.js';
import { checkStructuralParity } from '../structural-parity.js';
import { TranslationService } from '../translator.js';
import {
  FakeAnthropicApi,
  FakeReply,
  installFakeAnthropicApi,
} from '../test-support/fake-anthropic-api.js';

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const SOURCE = `---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
kernelspec:
  display_name: Python 3
  language: python
  name: python3
---

(python_essentials)=
\`\`\`{raw} jupyter
<div id="qe-notebook-header" align="right" style="text-align:right;">
        <a href="https://quantecon.org/" title="quantecon.org">
        </a>
</div>
\`\`\`

# Python Essentials

## Data Types

Computer programs typically keep track of a range of data types.

\`\`\`{code-cell} python3
x = True
x
\`\`\`
`;

const TRANSLATION = SOURCE.replace('# Python Essentials', '# Les bases de Python')
  .replace('## Data Types', '## Types de données')
  .replace(
    'Computer programs typically keep track of a range of data types.',
    'Les programmes informatiques manipulent en général toute une gamme de types de données.'
  );

/** The translation as the model sends it, trimmed, as the translator reads it. */
const DOCUMENT = TRANSLATION.trim();

/** The response shape #363 reports: one fence line above the document and one below. */
function wrap(document: string, opening = '```', closing = '```'): string {
  return `${opening}\n${document}\n${closing}`;
}

/** `text` with every non-blank line indented by two spaces. */
function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => (line.trim() ? `  ${line}` : line))
    .join('\n');
}

describe('unwrapDocumentFence', () => {
  it('removes a bare fence wrapping the whole document, which the guard then passes', () => {
    const wrapped = wrap(DOCUMENT);
    // The defect: the wrapper is closed by the {raw} block's closing fence, so
    // the guard sees the front matter, the anchor and {raw} vanish.
    expect(checkStructuralParity(SOURCE, wrapped).ok).toBe(false);

    const result = unwrapDocumentFence(wrapped, [SOURCE]);

    expect(result).toEqual({ text: DOCUMENT, unwrapped: true });
    expect(checkStructuralParity(SOURCE, result.text).ok).toBe(true);
  });

  it.each(['```markdown', '```md', '```myst', '```MyST', '``` markdown', '```   '])(
    'removes a wrapper opened with %j',
    (opening) => {
      expect(unwrapDocumentFence(wrap(DOCUMENT, opening), [SOURCE])).toEqual({
        text: DOCUMENT,
        unwrapped: true,
      });
    }
  );

  it.each(['```python', '```{code-cell} ipython3', '```text', '```mdx'])(
    'keeps a first line with any other info string, %j',
    (opening) => {
      const response = wrap(DOCUMENT, opening);
      expect(unwrapDocumentFence(response, [SOURCE])).toEqual({ text: response, unwrapped: false });
    }
  );

  it('removes tilde wrappers and longer fences, closed by the same character at least as long', () => {
    expect(unwrapDocumentFence(wrap(DOCUMENT, '~~~', '~~~'), [SOURCE]).unwrapped).toBe(true);
    expect(unwrapDocumentFence(wrap(DOCUMENT, '````', '````'), [SOURCE]).unwrapped).toBe(true);
    expect(unwrapDocumentFence(wrap(DOCUMENT, '```', '`````'), [SOURCE]).unwrapped).toBe(true);

    for (const [opening, closing] of [
      ['~~~', '```'],
      ['```', '~~~'],
      ['````', '```'],
    ]) {
      const response = wrap(DOCUMENT, opening, closing);
      expect(unwrapDocumentFence(response, [SOURCE])).toEqual({ text: response, unwrapped: false });
    }
  });

  it('keeps a wrapper with an indented line: it came indented with the document inside it', () => {
    // As the translator receives a wrapper indented as a whole: the trim leaves
    // only its last line indented.
    const asReceived = indent(wrap(DOCUMENT)).trim();
    for (const response of [
      asReceived,
      wrap(DOCUMENT, '```', '  ```'),
      wrap(DOCUMENT, '  ```', '```'),
    ]) {
      expect(unwrapDocumentFence(response, [SOURCE])).toEqual({ text: response, unwrapped: false });
    }
  });

  it('keeps a wrapper when the source itself ends inside a fence by the walk (condition 5)', () => {
    // The walk takes the indented bare line for the note's closing fence, so the
    // source ends with a fence open: the note's real closer opens one.
    const source =
      '# Title\n\nSome text.\n\n```{note}\nFor example:\n\n    ```python\n    y = 2\n    ```\n```\n';
    // A wrapper never closed: taking the last line would take the note's closer,
    // leave a balanced walk, and pass the guard.
    const response = `\`\`\`\n${source.trim()}`;
    const withoutLastLine = source.trim().split('\n').slice(0, -1).join('\n');
    expect(checkStructuralParity(source, withoutLastLine).ok).toBe(true);

    expect(unwrapDocumentFence(response, [source])).toEqual({ text: response, unwrapped: false });
  });

  it('keeps a wrapper whose document is indented as a whole (condition 6)', () => {
    const response = wrap(indent(DOCUMENT));
    expect(unwrapDocumentFence(response, [SOURCE])).toEqual({ text: response, unwrapped: false });
    // A document of one line has no later line to judge, and is unwrapped.
    expect(unwrapDocumentFence(wrap('  Bonjour.'), [SOURCE])).toEqual({
      text: 'Bonjour.',
      unwrapped: true,
    });
  });

  it('tolerates blank lines around the wrapper and inside it', () => {
    const response = `\n\n\`\`\`markdown\n\n${DOCUMENT}\n\n\`\`\`\n\n`;
    expect(unwrapDocumentFence(response, [SOURCE])).toEqual({ text: DOCUMENT, unwrapped: true });
  });

  it('leaves a document that is not wrapped untouched', () => {
    expect(unwrapDocumentFence(DOCUMENT, [SOURCE])).toEqual({ text: DOCUMENT, unwrapped: false });
  });

  it('keeps the fences when the last line is anything but a bare fence', () => {
    for (const response of [
      `${wrap(DOCUMENT)}\n\nThe translation is complete.`,
      wrap(DOCUMENT, '```', '```python'),
      `\`\`\`\n${DOCUMENT}\nLe document se termine ici.`,
    ]) {
      expect(unwrapDocumentFence(response, [SOURCE])).toEqual({ text: response, unwrapped: false });
    }
  });

  it('keeps a first fence when the source itself starts with one', () => {
    // A document that opens and closes with code: its first and last fences are its own.
    const source = '```python\nprint(1)\n```\n\nSome text.\n\n```\nplain\n```\n';
    const response = '```\nprint(1)\n```\n\nDu texte.\n\n```\nplain\n```';
    expect(unwrapDocumentFence(response, [source])).toEqual({ text: response, unwrapped: false });
    // Leading blank lines and a byte order mark do not hide the source's first fence.
    expect(unwrapDocumentFence(response, [`\uFEFF\n\n${source}`]).unwrapped).toBe(false);
  });

  it('keeps a first fence when the existing translation starts with one (forward)', () => {
    const target = '```\nan edition that opens with a fence\n```\n';
    const response = wrap(DOCUMENT);
    expect(unwrapDocumentFence(response, [SOURCE, target])).toEqual({
      text: response,
      unwrapped: false,
    });
    expect(unwrapDocumentFence(response, [SOURCE, TRANSLATION]).unwrapped).toBe(true);
  });

  it('removes only the first line of a wrapper that never closed (condition 4)', () => {
    // The last line is the document's own closing fence. Taking it too would
    // leave the final code cell open, and the guard would still pass that.
    const response = `\`\`\`\n${DOCUMENT}`;
    const withoutLastLine = DOCUMENT.split('\n').slice(0, -1).join('\n');
    expect(checkStructuralParity(SOURCE, withoutLastLine).ok).toBe(true);
    expect(checkStructuralParity(SOURCE, response).ok).toBe(false);

    const result = unwrapDocumentFence(response, [SOURCE]);

    expect(result).toEqual({ text: DOCUMENT, unwrapped: true });
    expect(checkStructuralParity(SOURCE, result.text).ok).toBe(true);
    expect(unwrapDocumentFence(`\`\`\`markdown\n\n${DOCUMENT}\n\n`, [SOURCE])).toEqual({
      text: DOCUMENT,
      unwrapped: true,
    });
  });

  it('keeps the fences when neither removal leaves the walk closed', () => {
    // A tilde block left open: the last backtick fence cannot close it, so the
    // walk ends open with that line and without it.
    const response = wrap(`${DOCUMENT}\n\n~~~python\nz = 1`);
    expect(unwrapDocumentFence(response, [SOURCE])).toEqual({ text: response, unwrapped: false });
  });

  it('keeps a single fence line, and empty text', () => {
    expect(unwrapDocumentFence('```', [SOURCE])).toEqual({ text: '```', unwrapped: false });
    expect(unwrapDocumentFence('', [SOURCE])).toEqual({ text: '', unwrapped: false });
  });

  it('removes a wrapper around nothing, leaving no text', () => {
    expect(unwrapDocumentFence('```\n\n```', [SOURCE])).toEqual({ text: '', unwrapped: true });
  });
});

describe('the translator unwraps each whole-document response', () => {
  let api: FakeAnthropicApi;
  const info = core.info as jest.Mock;

  const endTurn = (value: string): FakeReply => ({
    content: [{ type: 'text', text: value }],
    stop_reason: 'end_turn',
  });

  const fullDocument = { sourceLanguage: 'en', targetLanguage: 'fr', content: SOURCE };
  const resync = (targetContent: string) => ({
    sourceLanguage: 'en',
    targetLanguage: 'fr',
    sourceContent: SOURCE,
    targetContent,
  });

  /** The unwrap lines the translator logged. */
  const unwrapLogs = (): string[] =>
    info.mock.calls.map((call) => String(call[0])).filter((line) => line.includes('#363'));

  beforeEach(() => {
    api = installFakeAnthropicApi();
    info.mockClear();
  });

  afterEach(() => {
    api.restore();
  });

  it('translateFullDocument: unwraps, counts and logs without debug', async () => {
    api.reply(endTurn(`${wrap(DOCUMENT, '```markdown')}\n`), endTurn(DOCUMENT));
    const service = new TranslationService('test-key', 'claude-sonnet-5');

    const wrapped = await service.translateFullDocument(fullDocument);
    const plain = await service.translateFullDocument(fullDocument);

    expect(wrapped).toMatchObject({ success: true, translatedSection: DOCUMENT });
    expect(plain).toMatchObject({ success: true, translatedSection: DOCUMENT });
    expect(service.getFenceUnwrapCount()).toBe(1);
    expect(unwrapLogs()).toEqual([
      '[Translator] translateFullDocument: removed a code fence wrapping the whole document (#363)',
    ]);
  });

  it('translateFullDocument: unwraps a wrapper that never closed', async () => {
    api.reply(endTurn(`\`\`\`\n${DOCUMENT}\n`));
    const service = new TranslationService('test-key', 'claude-sonnet-5');

    const result = await service.translateFullDocument(fullDocument);

    expect(result).toMatchObject({ success: true, translatedSection: DOCUMENT });
    expect(service.getFenceUnwrapCount()).toBe(1);
    expect(unwrapLogs()).toHaveLength(1);
  });

  it('translateFullDocument: leaves a wrapper indented as a whole for the guard', async () => {
    const response = indent(wrap(DOCUMENT));
    api.reply(endTurn(`${response}\n`));
    const service = new TranslationService('test-key', 'claude-sonnet-5');

    const result = await service.translateFullDocument(fullDocument);

    expect(result).toMatchObject({ success: true, translatedSection: response.trim() });
    expect(service.getFenceUnwrapCount()).toBe(0);
    expect(unwrapLogs()).toEqual([]);
  });

  it('translateDocumentResync: unwraps against the source and the existing translation', async () => {
    api.reply(endTurn(wrap(DOCUMENT)));
    const service = new TranslationService('test-key', 'claude-sonnet-5');

    const result = await service.translateDocumentResync(resync(TRANSLATION));

    expect(result).toMatchObject({ success: true, translatedSection: DOCUMENT });
    expect(service.getFenceUnwrapCount()).toBe(1);
    expect(unwrapLogs()).toEqual([
      '[Translator] translateDocumentResync: removed a code fence wrapping the whole document (#363)',
    ]);
  });

  it('translateDocumentResync: keeps the fences when the existing translation starts with one', async () => {
    const response = wrap(DOCUMENT);
    api.reply(endTurn(response));
    const service = new TranslationService('test-key', 'claude-sonnet-5');

    const result = await service.translateDocumentResync(
      resync(`\`\`\`\nx\n\`\`\`\n${TRANSLATION}`)
    );

    expect(result).toMatchObject({ success: true, translatedSection: response });
    expect(service.getFenceUnwrapCount()).toBe(0);
    expect(unwrapLogs()).toEqual([]);
  });

  it('fails a response that is only a wrapper as one with no text', async () => {
    api.reply(endTurn('```markdown\n```'));
    const service = new TranslationService('test-key', 'claude-sonnet-5');

    const result = await service.translateFullDocument(fullDocument);

    expect(result).toEqual({
      success: false,
      error: 'translateFullDocument: response contained no text',
    });
  });
});

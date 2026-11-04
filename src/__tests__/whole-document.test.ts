/**
 * The whole-document fence unwrap (#363): each of unwrapDocumentFence's four
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

  it('keeps a wrapper that never closed: the last line is the document’s own closing fence', () => {
    // Taking the last line away would leave the final code cell open (condition 4).
    const response = `\`\`\`\n${DOCUMENT}`;
    expect(unwrapDocumentFence(response, [SOURCE])).toEqual({ text: response, unwrapped: false });
    // And the refusal stays loud: the guard rejects the response as it is.
    expect(checkStructuralParity(SOURCE, response).ok).toBe(false);
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

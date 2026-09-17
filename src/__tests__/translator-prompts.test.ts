/**
 * Prompt rule-ordinal drift guard (#163 — audit F74).
 *
 * Each prompt builder numbers its base RULES list by hand and then appends the
 * language config's `additionalRules` with a hand-counted offset. Two of the
 * five offsets had drifted (new-section started additional rules at 8 against
 * a base list ending at 8; full-document at 8 against a base ending at 9), so
 * every zh-cn/fa/fr prompt on those paths carried duplicate ordinals — and no
 * test could see it, because nothing read a rendered prompt. This suite reads
 * the prompts off the mocked SDK and asserts the numbered rules are contiguous
 * 1..N with no repeats, for every builder × language combination.
 */

import { TranslationService } from '../translator.js';

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
}));

const mockFinalMessage = jest.fn();
const mockStream = jest.fn().mockImplementation(() => ({
  finalMessage: mockFinalMessage,
}));

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: {
      stream: mockStream,
    },
  })),
}));

/** Body content with no numbered lines, so every `^N.` match is a rule. */
const SECTION = '## Heading\n\nSome prose.\n';

/**
 * The numbered rules start at `RULES:` or `## Critical rules`; the
 * document-resync builder has a legitimate numbered preamble before that
 * ("You are given: 1. … 2. …") which is not part of the rule list.
 */
function rulesBlock(prompt: string): string {
  const idx = Math.max(prompt.indexOf('RULES:'), prompt.indexOf('## Critical rules'));
  expect(idx).toBeGreaterThanOrEqual(0);
  return prompt.slice(idx);
}

function extractOrdinals(prompt: string): number[] {
  return [...rulesBlock(prompt).matchAll(/^(\d+)\. /gm)].map((m) => parseInt(m[1], 10));
}

function expectContiguous(prompt: string, label: string): void {
  const ordinals = extractOrdinals(prompt);
  expect(ordinals.length).toBeGreaterThan(0);
  const expected = Array.from({ length: ordinals.length }, (_, i) => i + 1);
  if (JSON.stringify(ordinals) !== JSON.stringify(expected)) {
    throw new Error(`${label}: rule ordinals are not contiguous 1..N: [${ordinals.join(', ')}]`);
  }
}

// en exercises the empty-additionalRules branch; the other three each carry
// language-specific rules that the hand-counted offsets must not collide with.
const LANGUAGES = ['en', 'zh-cn', 'fa', 'fr'];

describe('every prompt builder numbers its rules contiguously', () => {
  let service: TranslationService;

  beforeEach(() => {
    mockStream.mockClear();
    mockFinalMessage.mockResolvedValue({
      content: [{ type: 'text', text: 'translated' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    service = new TranslationService('test-key', 'test-model', false);
  });

  function lastPrompt(): string {
    const calls = mockStream.mock.calls;
    const content = calls[calls.length - 1][0].messages[0].content;
    // Prompts are split into [stable-cacheable, volatile] text blocks (#292);
    // rejoin them without inserting a delimiter the API never sees. The
    // ordinal assertions are insensitive to the boundary either way: every
    // stable block ends with a newline, so no `^N. ` match can span it.
    if (typeof content === 'string') return content;
    return content.map((block: { text: string }) => block.text).join('');
  }

  it.each(LANGUAGES)('section update (%s)', async (lang) => {
    await service.translateSection({
      mode: 'update',
      sourceLanguage: 'en',
      targetLanguage: lang,
      oldEnglish: SECTION,
      newEnglish: SECTION,
      currentTranslation: SECTION,
    });
    expectContiguous(lastPrompt(), `update/${lang}`);
  });

  it.each(LANGUAGES)('section resync (%s)', async (lang) => {
    await service.translateSection({
      mode: 'resync',
      sourceLanguage: 'en',
      targetLanguage: lang,
      newEnglish: SECTION,
      currentTranslation: SECTION,
    });
    expectContiguous(lastPrompt(), `resync/${lang}`);
  });

  it.each(LANGUAGES)('new section (%s)', async (lang) => {
    await service.translateSection({
      mode: 'new',
      sourceLanguage: 'en',
      targetLanguage: lang,
      englishSection: SECTION,
    });
    expectContiguous(lastPrompt(), `new/${lang}`);
  });

  it.each(LANGUAGES)('full document (%s)', async (lang) => {
    await service.translateFullDocument({
      content: SECTION,
      sourceLanguage: 'en',
      targetLanguage: lang,
    });
    expectContiguous(lastPrompt(), `full-document/${lang}`);
  });

  it.each(LANGUAGES)('document resync (%s)', async (lang) => {
    await service.translateDocumentResync({
      sourceLanguage: 'en',
      targetLanguage: lang,
      sourceContent: SECTION,
      targetContent: SECTION,
    });
    expectContiguous(lastPrompt(), `document-resync/${lang}`);
  });
});

/**
 * Style exemplars (ml round 3): editor-approved sentence pairs carried in the
 * glossary file render after the terms, inside the prompt-cached stable block,
 * on every builder — and a glossary without them renders exactly as before.
 */
describe('glossary style_examples render as STYLE EXAMPLES in the stable block', () => {
  let service: TranslationService;

  const terms = [{ en: 'useful', ml: 'useful', 'zh-cn': '有用' }];
  const withExamples = {
    version: 'test',
    terms,
    style_examples: [
      { en: 'Here is the first pair.', ml: 'ML-ONE', source: 'test' },
      { en: 'A pair for another language only.', fr: 'FR-ONLY' },
      { en: 'Here is the second pair.', ml: 'ML-TWO' },
    ],
  };

  beforeEach(() => {
    mockStream.mockClear();
    mockFinalMessage.mockResolvedValue({
      content: [{ type: 'text', text: 'translated' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    service = new TranslationService('test-key', 'test-model', false);
  });

  function lastBlocks(): { text: string; cache_control?: unknown }[] {
    const calls = mockStream.mock.calls;
    return calls[calls.length - 1][0].messages[0].content;
  }

  it('renders the target language pairs, in order, after the glossary terms', async () => {
    await service.translateSection({
      mode: 'new',
      sourceLanguage: 'en',
      targetLanguage: 'ml',
      englishSection: SECTION,
      glossary: withExamples,
    });
    const [stable] = lastBlocks();
    expect(stable.cache_control).toBeDefined();
    const glossaryAt = stable.text.indexOf('GLOSSARY:');
    const examplesAt = stable.text.indexOf('STYLE EXAMPLES:');
    expect(glossaryAt).toBeGreaterThanOrEqual(0);
    expect(examplesAt).toBeGreaterThan(glossaryAt);
    expect(stable.text).toContain('  EN: Here is the first pair.\n  ML: ML-ONE');
    expect(stable.text.indexOf('ML-ONE')).toBeLessThan(stable.text.indexOf('ML-TWO'));
    // a pair with no text for this language is skipped, never rendered as "undefined"
    expect(stable.text).not.toContain('FR-ONLY');
    expect(stable.text).not.toContain('undefined');
    // numbered rules stay contiguous — the examples carry no `N. ` lines
    expectContiguous(stable.text, 'new/ml with examples');
  });

  it('reaches every builder through the glossary', async () => {
    await service.translateSection({
      mode: 'update',
      sourceLanguage: 'en',
      targetLanguage: 'ml',
      oldEnglish: SECTION,
      newEnglish: SECTION,
      currentTranslation: SECTION,
      glossary: withExamples,
    });
    expect(lastBlocks()[0].text).toContain('STYLE EXAMPLES:');
    await service.translateFullDocument({
      content: SECTION,
      sourceLanguage: 'en',
      targetLanguage: 'ml',
      glossary: withExamples,
    });
    expect(
      lastBlocks()
        .map((b) => b.text)
        .join('')
    ).toContain('STYLE EXAMPLES:');
    await service.translateDocumentResync({
      sourceLanguage: 'en',
      targetLanguage: 'ml',
      sourceContent: SECTION,
      targetContent: SECTION,
      glossary: withExamples,
    });
    expect(
      lastBlocks()
        .map((b) => b.text)
        .join('')
    ).toContain('STYLE EXAMPLES:');
  });

  it('omits the block when the language has no pairs or the glossary has none', async () => {
    await service.translateSection({
      mode: 'new',
      sourceLanguage: 'en',
      targetLanguage: 'zh-cn',
      englishSection: SECTION,
      glossary: withExamples,
    });
    expect(lastBlocks()[0].text).toContain('GLOSSARY:');
    expect(lastBlocks()[0].text).not.toContain('STYLE EXAMPLES:');

    await service.translateSection({
      mode: 'new',
      sourceLanguage: 'en',
      targetLanguage: 'ml',
      englishSection: SECTION,
      glossary: { version: 'test', terms },
    });
    expect(lastBlocks()[0].text).not.toContain('STYLE EXAMPLES:');
  });
});

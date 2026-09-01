/**
 * Prompt-caching contract (#292).
 *
 * Every translator prompt is split into a stable block (rules + language rules
 * + glossary) carrying a `cache_control` breakpoint, and a volatile block
 * (customInstructions + document content). The prefix cache is a byte-exact
 * match, so the stable block must be identical across calls in a run and no
 * per-call content may leak into it. These tests read the rendered blocks off
 * the mocked SDK — the same failure mode the audit checklist calls a "silent
 * invalidator" would otherwise only show up as a higher bill in production.
 */

import { TranslationService } from '../translator.js';
import { Glossary } from '../types.js';

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

const GLOSSARY: Glossary = {
  version: '1.0',
  terms: [
    { en: 'equilibrium', 'zh-cn': '均衡' },
    { en: 'steady state', 'zh-cn': '稳态' },
  ],
};

interface TextBlock {
  type: string;
  text: string;
  cache_control?: { type: string };
}

function lastBlocks(): TextBlock[] {
  const calls = mockStream.mock.calls;
  return calls[calls.length - 1][0].messages[0].content as TextBlock[];
}

describe('translator prompt caching', () => {
  let service: TranslationService;

  beforeEach(() => {
    mockStream.mockClear();
    mockFinalMessage.mockResolvedValue({
      content: [{ type: 'text', text: 'translated' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    service = new TranslationService('test-key', 'test-model', false);
  });

  // Every content field carries the VOLATILE- marker so leakage into the
  // stable block is detectable for any builder.
  async function callEachBuilder(): Promise<Record<string, TextBlock[]>> {
    const blocks: Record<string, TextBlock[]> = {};
    await service.translateSection({
      mode: 'update',
      sourceLanguage: 'en',
      targetLanguage: 'zh-cn',
      oldEnglish: 'VOLATILE-update-old',
      newEnglish: 'VOLATILE-update-new',
      currentTranslation: 'VOLATILE-update-current',
      glossary: GLOSSARY,
    });
    blocks['update'] = lastBlocks();
    await service.translateSection({
      mode: 'resync',
      sourceLanguage: 'en',
      targetLanguage: 'zh-cn',
      newEnglish: 'VOLATILE-resync-new',
      currentTranslation: 'VOLATILE-resync-current',
      glossary: GLOSSARY,
    });
    blocks['resync'] = lastBlocks();
    await service.translateSection({
      mode: 'new',
      sourceLanguage: 'en',
      targetLanguage: 'zh-cn',
      englishSection: 'VOLATILE-new-section',
      glossary: GLOSSARY,
    });
    blocks['new'] = lastBlocks();
    await service.translateFullDocument({
      content: 'VOLATILE-fulldoc-content',
      sourceLanguage: 'en',
      targetLanguage: 'zh-cn',
      glossary: GLOSSARY,
    });
    blocks['fullDocument'] = lastBlocks();
    await service.translateDocumentResync({
      sourceContent: 'VOLATILE-docresync-source',
      targetContent: 'VOLATILE-docresync-target',
      sourceLanguage: 'en',
      targetLanguage: 'zh-cn',
      glossary: GLOSSARY,
    });
    blocks['documentResync'] = lastBlocks();
    return blocks;
  }

  it('every builder sends [stable + cache_control, volatile] blocks', async () => {
    const perBuilder = await callEachBuilder();
    for (const [name, blocks] of Object.entries(perBuilder)) {
      expect(blocks).toHaveLength(2);
      expect(blocks[0].cache_control).toEqual({ type: 'ephemeral' });
      expect(blocks[1].cache_control).toBeUndefined();
      // Glossary is part of the stable prefix; document content must not be
      expect(blocks[0].text).toContain('"equilibrium" → "均衡"');
      expect(blocks[0].text).not.toContain('VOLATILE-');
      expect(blocks[1].text).toContain(`VOLATILE-`);
      if (blocks[0].text.length === 0) {
        throw new Error(`${name}: stable block is empty`);
      }
    }
  });

  it('stable block is byte-identical across calls that differ per-file', async () => {
    await service.translateSection({
      mode: 'update',
      sourceLanguage: 'en',
      targetLanguage: 'zh-cn',
      oldEnglish: 'old A',
      newEnglish: 'new A',
      currentTranslation: 'current A',
      glossary: GLOSSARY,
      customInstructions: 'PRESERVE data file a.csv',
    });
    const first = lastBlocks();
    await service.translateSection({
      mode: 'update',
      sourceLanguage: 'en',
      targetLanguage: 'zh-cn',
      oldEnglish: 'old B',
      newEnglish: 'new B',
      currentTranslation: 'current B',
      glossary: GLOSSARY,
      customInstructions: 'PRESERVE data file b.csv',
    });
    const second = lastBlocks();

    expect(first[0].text).toBe(second[0].text);
    expect(first[1].text).not.toBe(second[1].text);
  });

  it('customInstructions lands in the volatile block, never the stable one', async () => {
    await service.translateSection({
      mode: 'update',
      sourceLanguage: 'en',
      targetLanguage: 'zh-cn',
      oldEnglish: 'old',
      newEnglish: 'new',
      currentTranslation: 'current',
      glossary: GLOSSARY,
      customInstructions: 'PRESERVE data file a.csv',
    });
    const blocks = lastBlocks();
    expect(blocks[0].text).not.toContain('PRESERVE data file');
    expect(blocks[1].text).toContain('PRESERVE data file a.csv');
  });

  it('accumulates cache token usage, treating absent fields as zero', async () => {
    mockFinalMessage.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'translated' }],
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 9000,
        cache_read_input_tokens: 0,
      },
    });
    mockFinalMessage.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'translated' }],
      usage: {
        input_tokens: 80,
        output_tokens: 40,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 9000,
      },
    });
    // Third call: usage block without cache fields (older mock shape)
    mockFinalMessage.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'translated' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const request = {
      mode: 'new' as const,
      sourceLanguage: 'en',
      targetLanguage: 'zh-cn',
      englishSection: 'section',
      glossary: GLOSSARY,
    };
    await service.translateSection(request);
    await service.translateSection(request);
    await service.translateSection(request);

    expect(service.getUsage()).toEqual({
      inputTokens: 190,
      outputTokens: 95,
      cacheCreationInputTokens: 9000,
      cacheReadInputTokens: 9000,
      apiCalls: 3,
    });
  });
});

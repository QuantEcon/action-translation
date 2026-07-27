/**
 * Tests for localisation rules on the sync path (#178).
 *
 * `init` has always applied the localisation rules; sync never did, so every
 * lecture arriving through the automated path landed with English figure
 * labels and no CJK font config. These tests pin the wiring: NEW files get the
 * rules, existing files do not (their localisation is already on disk and the
 * translator prompts preserve it — #107), and an edition can opt out.
 */

import { SyncOrchestrator, FileToSync, Logger } from '../sync-orchestrator.js';
import { DEFAULT_RULES } from '../localization-rules.js';

// Capture the arguments FileProcessor receives so we can assert on the
// customInstructions parameter that carries the localisation prompt.
const processFullMock = jest.fn(async (...args: unknown[]) => `[TRANSLATED] ${String(args[0])}`);
const processSectionBasedMock = jest.fn(
  async (...args: unknown[]) => `[UPDATED] ${String(args[1])}`
);

jest.mock('../translator', () => ({
  TranslationService: jest.fn().mockImplementation(() => ({
    translateSection: jest.fn(),
    translateDocument: jest.fn(),
  })),
}));

jest.mock('../file-processor', () => ({
  FileProcessor: jest.fn().mockImplementation(() => ({
    processFull: (...args: unknown[]) => processFullMock(...args),
    processSectionBased: (...args: unknown[]) => processSectionBasedMock(...args),
    validateMyST: jest.fn(async () => ({ valid: true })),
  })),
}));

function createTestLogger(): Logger & { messages: { level: string; msg: string }[] } {
  const messages: { level: string; msg: string }[] = [];
  return {
    messages,
    info: (msg: string) => messages.push({ level: 'info', msg }),
    error: (msg: string) => messages.push({ level: 'error', msg }),
    warning: (msg: string) => messages.push({ level: 'warning', msg }),
  };
}

function makeOrchestrator(localizationRules?: Parameters<typeof makeConfig>[0]) {
  return new SyncOrchestrator(makeConfig(localizationRules), createTestLogger());
}

function makeConfig(localizationRules?: (typeof DEFAULT_RULES)[number][]) {
  return {
    sourceLanguage: 'en',
    targetLanguage: 'zh-cn',
    claudeModel: 'claude-sonnet-5',
    anthropicApiKey: 'test-key',
    debugMode: false,
    ...(localizationRules !== undefined ? { localizationRules } : {}),
  };
}

const NEW_FILE: FileToSync[] = [
  {
    filename: 'lectures/intro.md',
    type: 'markdown',
    newContent: '# Introduction\n\nSome content',
    isNewFile: true,
  },
];

/** The customInstructions argument of processFull(content, path, src, tgt, glossary, custom) */
function customInstructionsArg(): string | undefined {
  return processFullMock.mock.calls[0]?.[5] as string | undefined;
}

describe('sync path localisation (#178)', () => {
  beforeEach(() => {
    processFullMock.mockClear();
    processSectionBasedMock.mockClear();
  });

  it('applies the localisation rules to a NEW file by default', async () => {
    await makeOrchestrator().processFiles(NEW_FILE);

    expect(processFullMock).toHaveBeenCalledTimes(1);
    const custom = customInstructionsArg();
    expect(custom).toBeTruthy();
    // Every default rule should be represented in the prompt.
    expect(custom).toContain('Inject font configuration');
    expect(custom).toMatch(/i18n/);
  });

  it('names the target language in the injected prompt', async () => {
    await makeOrchestrator().processFiles(NEW_FILE);
    expect(customInstructionsArg()).toContain('zh-cn');
  });

  it('passes nothing when the edition opts out with an empty rule set', async () => {
    await makeOrchestrator([]).processFiles(NEW_FILE);

    expect(processFullMock).toHaveBeenCalledTimes(1);
    expect(customInstructionsArg()).toBeUndefined();
  });

  it('honours a partial rule set', async () => {
    await makeOrchestrator(['code-comments']).processFiles(NEW_FILE);

    const custom = customInstructionsArg();
    expect(custom).toBeTruthy();
    // The font rule was not requested, so its instruction must be absent.
    expect(custom).not.toContain('Inject font configuration');
  });

  it('does not route existing files through the full-document path', async () => {
    const existing: FileToSync[] = [
      {
        filename: 'lectures/intro.md',
        type: 'markdown',
        oldContent: '# Introduction\n\nOld',
        newContent: '# Introduction\n\nNew',
        targetContent: '# 简介\n\n旧',
        isNewFile: false,
      },
    ];

    await makeOrchestrator().processFiles(existing);

    expect(processFullMock).not.toHaveBeenCalled();
    expect(processSectionBasedMock).toHaveBeenCalledTimes(1);
  });
});

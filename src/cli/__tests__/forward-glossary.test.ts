/**
 * Glossary delivery on the resync path (#149).
 *
 * `forward` resolved its glossary only against `process.cwd()`. No edition
 * repository carries `glossary/<lang>.json`, so a resync run from the target
 * repo — the natural place to run it — translated with no glossary at all and
 * logged nothing either way. These tests pin the end of the chain: what the
 * translator actually receives, from a working directory that has no glossary.
 *
 * Separate file from forward.test.ts because it mocks triage and the translator,
 * which the main suite exercises for real (in test mode).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { resyncSingleFile } from '../commands/forward.js';
import { ForwardOptions } from '../types.js';
import { Glossary } from '../../types.js';

jest.mock('../forward-triage.js', () => ({
  triageForward: jest.fn().mockResolvedValue({
    verdict: 'CONTENT_CHANGES',
    reason: 'mocked',
  }),
}));

const mockResync = jest.fn();
jest.mock('../../translator.js', () => ({
  TranslationService: jest.fn().mockImplementation(() => ({
    translateDocumentResync: mockResync,
  })),
}));

const BUILT_IN_DIR = path.join(__dirname, '..', '..', '..', 'glossary');

function createTestLogger() {
  const messages: Array<{ level: 'info' | 'warn' | 'error'; text: string }> = [];
  return {
    messages,
    info: (text: string) => messages.push({ level: 'info' as const, text }),
    warn: (text: string) => messages.push({ level: 'warn' as const, text }),
    error: (text: string) => messages.push({ level: 'error' as const, text }),
  };
}

function makeOptions(overrides: Partial<ForwardOptions> = {}): ForwardOptions {
  return {
    source: '/tmp/source',
    target: '/tmp/target',
    docsFolder: 'lectures',
    language: 'zh-cn',
    sourceLanguage: 'en',
    model: 'claude-sonnet-5',
    test: false,
    apiKey: 'test-key',
    ...overrides,
  };
}

/** The glossary handed to the translator on the single (mocked) resync call. */
function glossaryPassedToTranslator(): Glossary | undefined {
  expect(mockResync).toHaveBeenCalledTimes(1);
  return mockResync.mock.calls[0][0].glossary;
}

describe('forward glossary resolution', () => {
  let tmpDir: string;
  let cwdSpy: jest.SpyInstance;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forward-glossary-'));
    fs.mkdirSync(path.join(tmpDir, 'source', 'lectures'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'target', 'lectures'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'source', 'lectures', 'test.md'),
      '# Title\n\nMarginal distribution.\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(tmpDir, 'target', 'lectures', 'test.md'),
      '# 标题\n\n旧内容。\n',
      'utf-8'
    );

    // Run "from the target repo" — the working directory the wave is launched
    // from in practice, and one that carries no glossary of its own.
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(path.join(tmpDir, 'target'));

    mockResync.mockReset();
    mockResync.mockResolvedValue({
      success: true,
      translatedSection: '# 标题\n\n新内容。\n',
      tokensUsed: 10,
    });
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function resync(options: ForwardOptions, logger = createTestLogger()) {
    const result = await resyncSingleFile(
      'test.md',
      path.join(tmpDir, 'source'),
      path.join(tmpDir, 'target'),
      'lectures',
      options,
      logger
    );
    return { result, logger };
  }

  it('sends the built-in glossary even when the working directory has none', async () => {
    const { result } = await resync(makeOptions({ builtInGlossaryDir: BUILT_IN_DIR }));

    expect(result.summary.errors).toBe(0);
    const glossary = glossaryPassedToTranslator();
    expect(glossary).toBeDefined();
    expect(glossary!.terms.length).toBeGreaterThan(0);
    // The term whose absence surfaced this defect on QuantEcon/lecture-python.zh-cn#198.
    expect(glossary!.terms.some((t) => t.en === 'Marginal distribution')).toBe(true);
  });

  it('reports the glossary it loaded', async () => {
    const { logger } = await resync(makeOptions({ builtInGlossaryDir: BUILT_IN_DIR }));

    const loaded = logger.messages.filter((m) => m.text.includes('glossary for zh-cn'));
    expect(loaded).toHaveLength(1);
    expect(loaded[0].level).toBe('info');
  });

  it('honours an explicit --glossary path', async () => {
    const custom = path.join(tmpDir, 'custom.json');
    fs.writeFileSync(
      custom,
      JSON.stringify({ version: '1.0', terms: [{ en: 'only', 'zh-cn': '唯一' }] }),
      'utf-8'
    );

    await resync(makeOptions({ builtInGlossaryDir: BUILT_IN_DIR, glossaryPath: custom }));

    expect(glossaryPassedToTranslator()!.terms).toHaveLength(1);
  });

  it('fails loudly on a --glossary path that does not exist', async () => {
    await expect(
      resync(makeOptions({ builtInGlossaryDir: BUILT_IN_DIR, glossaryPath: '/no/such.json' }))
    ).rejects.toThrow(/Glossary not found/);

    expect(mockResync).not.toHaveBeenCalled();
  });

  it('uses a pre-resolved glossary without re-resolving it', async () => {
    // How bulk threads one load through every file in the wave.
    const preResolved: Glossary = { version: '1.0', terms: [{ en: 'threaded', 'zh-cn': '穿线' }] };

    const { logger } = await resync(
      makeOptions({ builtInGlossaryDir: BUILT_IN_DIR, glossary: preResolved })
    );

    expect(glossaryPassedToTranslator()).toBe(preResolved);
    expect(logger.messages.filter((m) => m.text.includes('glossary for zh-cn'))).toHaveLength(0);
  });

  it('says so when it ends up with no glossary', async () => {
    // No built-in directory threaded through and none in the working directory:
    // the pre-fix situation, which must no longer be silent.
    const { logger } = await resync(makeOptions());

    expect(glossaryPassedToTranslator()).toBeUndefined();
    const warnings = logger.messages.filter((m) => m.level === 'warn');
    expect(warnings.some((w) => w.text.includes('WITHOUT terminology enforcement'))).toBe(true);
  });
});

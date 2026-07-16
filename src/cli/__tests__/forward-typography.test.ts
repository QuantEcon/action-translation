/**
 * Forward-resync typography (issue #97 follow-up).
 *
 * The resync path writes whole-file model output; the model does not honour
 * the NBSP prompt rule, so the output must be typeset before it is written —
 * matching init, sync, and apply.mjs. Separate file from forward.test.ts
 * because these tests mock the triage and translator modules, which the main
 * suite exercises for real (in test mode).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { resyncSingleFile } from '../commands/forward.js';
import { ForwardOptions } from '../types.js';

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

const NBSP = '\u00A0';

const silentLogger = {
  info: (_msg: string) => {},
  warn: (_msg: string) => {},
  error: (_msg: string) => {},
};

function makeOptions(overrides: Partial<ForwardOptions> = {}): ForwardOptions {
  return {
    source: '/tmp/source',
    target: '/tmp/target',
    docsFolder: 'lectures',
    language: 'fr',
    sourceLanguage: 'en',
    model: 'claude-sonnet-5',
    test: false,
    apiKey: 'test-key',
    ...overrides,
  };
}

describe('resyncSingleFile typography', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forward-typo-'));
    fs.mkdirSync(path.join(tmpDir, 'source', 'lectures'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'target', 'lectures'), { recursive: true });
    mockResync.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('typesets French resync output before writing it', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'source', 'lectures', 'test.md'),
      '# Title\n\nHello: world!\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(tmpDir, 'target', 'lectures', 'test.md'),
      '# Titre\n\nAncien contenu.\n',
      'utf-8'
    );

    // Model output with the plain spacing it reliably produces.
    mockResync.mockResolvedValue({
      success: true,
      translatedSection: '# Titre\n\nVoici une solution : la voilà !\n',
      tokensUsed: 10,
    });

    const result = await resyncSingleFile(
      'test.md',
      path.join(tmpDir, 'source'),
      path.join(tmpDir, 'target'),
      'lectures',
      makeOptions(),
      silentLogger
    );

    expect(result.summary.errors).toBe(0);
    const written = fs.readFileSync(path.join(tmpDir, 'target', 'lectures', 'test.md'), 'utf-8');
    expect(written).toContain(`Voici une solution${NBSP}:`);
    expect(written).toContain(`la voilà${NBSP}!`);
  });

  it('leaves languages without typography rules untouched', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'source', 'lectures', 'test.md'),
      '# Title\n\nHello!\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(tmpDir, 'target', 'lectures', 'test.md'),
      '# 标题\n\n旧内容。\n',
      'utf-8'
    );

    mockResync.mockResolvedValue({
      success: true,
      translatedSection: '# 标题\n\n新内容 : 好!\n',
      tokensUsed: 10,
    });

    const result = await resyncSingleFile(
      'test.md',
      path.join(tmpDir, 'source'),
      path.join(tmpDir, 'target'),
      'lectures',
      makeOptions({ language: 'zh-cn' }),
      silentLogger
    );

    expect(result.summary.errors).toBe(0);
    const written = fs.readFileSync(path.join(tmpDir, 'target', 'lectures', 'test.md'), 'utf-8');
    expect(written).not.toContain(NBSP);
  });
});

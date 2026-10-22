/**
 * The whole-file resync request forward sends, read off the wire (#348).
 *
 * forward handed the translator display labels (`Chinese (Simplified) (zh-cn)`)
 * where the glossary and LANGUAGE_CONFIGS are keyed by bare code, so every
 * resync in every edition reached the model with an empty GLOSSARY block and
 * none of the edition's rules, while the log said the glossary had loaded.
 * forward-glossary.test.ts could not see it: it mocks TranslationService, which
 * is where the label was used. Here only triage and `fetch` are fake
 * (test-support/fake-anthropic-api.ts); the real translator and SDK build the
 * request, and the assertions read its body.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { resyncSingleFile } from '../commands/forward.js';
import { ForwardOptions } from '../types.js';
import { languageLabel } from '../../language-config.js';
import {
  FakeAnthropicApi,
  RecordedRequest,
  installFakeAnthropicApi,
} from '../../test-support/fake-anthropic-api.js';

// Triage is mocked, so the resync is the only request the fake API serves.
jest.mock('../forward-triage.js', () => ({
  triageForward: jest.fn().mockResolvedValue({
    verdict: 'CONTENT_CHANGES',
    reason: 'mocked',
  }),
}));

const BUILT_IN_DIR = path.join(__dirname, '..', '..', '..', 'glossary');

// One pinned glossary pair and the text of one rule per edition, written out
// here rather than read from glossary/ and LANGUAGE_CONFIGS, so the test does
// not grade itself.
const EDITIONS = [
  {
    language: 'zh-cn',
    term: '"Marginal distribution" → "边缘分布"',
    rule: 'Use proper full-width Chinese punctuation marks',
  },
  {
    language: 'fa',
    term: '"Adjacency matrix" → "ماتریس مجاورت"',
    rule: 'Keep technical terms and code examples in English/Latin script',
  },
  {
    language: 'fr',
    term: '"Marginal distribution" → "Loi marginale"',
    rule: 'Use the impersonal academic register of French course materials',
  },
  {
    language: 'ml',
    term: '"provide" → "നൽകുക"',
    rule: 'Keep section headings in their original English form',
  },
  {
    language: 'ja',
    term: '"Marginal distribution" → "周辺分布"',
    rule: 'Write prose in the plain である style throughout',
  },
];

function createTestLogger() {
  const messages: Array<{ level: 'info' | 'warn' | 'error'; text: string }> = [];
  return {
    messages,
    info: (text: string) => messages.push({ level: 'info' as const, text }),
    warn: (text: string) => messages.push({ level: 'warn' as const, text }),
    error: (text: string) => messages.push({ level: 'error' as const, text }),
  };
}

function makeOptions(language: string): ForwardOptions {
  return {
    source: '/tmp/source',
    target: '/tmp/target',
    docsFolder: 'lectures',
    language,
    sourceLanguage: 'en',
    model: 'claude-sonnet-5',
    test: false,
    apiKey: 'test-key',
    builtInGlossaryDir: BUILT_IN_DIR,
  };
}

/** The prompt as the model reads it: the user message's text blocks, joined. */
function promptOf(request: RecordedRequest): string {
  const [message] = request.body.messages as Array<{ content: Array<{ text: string }> }>;
  return message.content.map((block) => block.text).join('');
}

/** The prompt between two markers, which must both be present. */
function between(prompt: string, start: string, end: string): string {
  const from = prompt.indexOf(start);
  const to = prompt.indexOf(end, from);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return prompt.slice(from, to);
}

describe('forward resync request', () => {
  let tmpDir: string;
  let cwdSpy: jest.SpyInstance;
  let api: FakeAnthropicApi;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forward-request-'));
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

    // Run from the target repo, which carries no glossary of its own, so the
    // packaged glossary is the one that loads.
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(path.join(tmpDir, 'target'));
    // Before resyncSingleFile constructs the translator: the SDK reads fetch once.
    api = installFakeAnthropicApi();
  });

  afterEach(() => {
    api.restore();
    cwdSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function resync(language: string) {
    api.reply({
      content: [{ type: 'text', text: '# 标题\n\n新内容。\n' }],
      stop_reason: 'end_turn',
    });
    const logger = createTestLogger();
    const result = await resyncSingleFile(
      'test.md',
      path.join(tmpDir, 'source'),
      path.join(tmpDir, 'target'),
      'lectures',
      makeOptions(language),
      logger
    );
    expect(result.summary.errors).toBe(0);
    expect(api.requests).toHaveLength(1);
    return { prompt: promptOf(api.requests[0]), logger };
  }

  it.each(EDITIONS)(
    '$language: carries the edition glossary and its rules',
    async ({ language, term, rule }) => {
      const { prompt } = await resync(language);

      expect(between(prompt, 'GLOSSARY:', '## Output format')).toContain(term);
      expect(between(prompt, '## Critical rules', 'GLOSSARY:')).toContain(rule);
    }
  );

  it.each(EDITIONS)(
    '$language: names the languages by code, as the other builders do',
    async ({ language }) => {
      const { prompt } = await resync(language);

      expect(prompt).toContain('The **current en source** document');
      expect(prompt).toContain(`The **current ${language} translation**`);
      expect(prompt).not.toContain(languageLabel(language));
      expect(prompt).not.toContain(languageLabel('en'));
    }
  );

  it.each(EDITIONS)(
    '$language: logs what the request carried beside what was loaded',
    async ({ language }) => {
      const { prompt, logger } = await resync(language);

      const loadedLine = logger.messages.find((m) => m.text.includes('Loaded built-in glossary'));
      const carriedLine = logger.messages.find((m) => m.text.includes('Request carried'));
      expect(loadedLine).toBeDefined();
      expect(carriedLine).toBeDefined();
      const loaded = Number(/ — (\d+) terms/.exec(loadedLine!.text)?.[1]);
      const carried = /carried (\d+) of (\d+) glossary terms and (\d+) \S+ rules/.exec(
        carriedLine!.text
      );
      expect(carried).not.toBeNull();
      const [termsSent, termsLoaded, rulesSent] = carried!.slice(1).map(Number);

      // Each count is what the prompt holds, read off it independently...
      const glossaryLines = between(prompt, 'GLOSSARY:', '## Output format').match(
        /^ {2}- ".*" → ".*"/gm
      );
      const editionRules = [
        ...between(prompt, '## Critical rules', 'GLOSSARY:').matchAll(/^(\d+)\. /gm),
      ].filter((m) => Number(m[1]) > 8);
      expect(termsSent).toBe(glossaryLines?.length ?? 0);
      expect(rulesSent).toBe(editionRules.length);
      // ...and a packaged glossary is carried whole.
      expect(loaded).toBeGreaterThan(0);
      expect(termsLoaded).toBe(loaded);
      expect(termsSent).toBe(loaded);
      expect(rulesSent).toBeGreaterThan(0);
    }
  );
});

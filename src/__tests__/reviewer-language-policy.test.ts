/**
 * Language-specific policy injection into the review prompt.
 *
 * The translator enforces per-language rules (language-config
 * additionalRules) but the review judge previously never saw them, so a
 * policy like Malayalam's keep-English-dominant (issue #70) would read as
 * untranslated content and be scored down — making calibration verdicts
 * noise exactly where the native-speaker loop needs them clean.
 */

import { TranslationReviewer } from '../reviewer.js';

const COMPLETE_RESPONSE = {
  accuracy: 9,
  fluency: 9,
  terminology: 9,
  formatting: 9,
  syntaxErrors: [],
  issues: [],
  strengths: ['good'],
  summary: 'Fine.',
};

function makeReviewer(prompts: string[]) {
  const reviewer = new TranslationReviewer('fake-key', 'fake-token');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (reviewer as any).callWithRetry = async (prompt: string) => {
    prompts.push(prompt);
    return COMPLETE_RESPONSE;
  };
  return reviewer;
}

async function evaluate(targetLanguage: string | undefined): Promise<string> {
  const prompts: string[] = [];
  const reviewer = makeReviewer(prompts);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (reviewer as any).evaluateTranslation(
    'source',
    'target',
    [],
    ['lectures/x.md'],
    undefined,
    targetLanguage
  );
  expect(prompts).toHaveLength(1);
  return prompts[0];
}

describe('review prompt language policy', () => {
  it('names Malayalam rather than the bare code and injects the keep-English rules', async () => {
    const prompt = await evaluate('ml');
    expect(prompt).toContain('English to Malayalam');
    expect(prompt).not.toContain('English to ml');
    expect(prompt).toContain('## Language-Specific Translation Policy');
    expect(prompt).toContain('do NOT translate or transliterate them into Malayalam script');
    // Compliance must be framed as correct, violations as flaggable
    expect(prompt).toContain('Compliance with them is correct behavior');
  });

  it('injects configured rules for other languages too (French typography)', async () => {
    const prompt = await evaluate('fr');
    expect(prompt).toContain('## Language-Specific Translation Policy');
    expect(prompt).toContain('guillemets');
  });

  it('omits the policy section for languages without configured rules', async () => {
    const prompt = await evaluate('es');
    expect(prompt).not.toContain('## Language-Specific Translation Policy');
  });

  it('omits the policy section when no target language is known', async () => {
    const prompt = await evaluate(undefined);
    expect(prompt).not.toContain('## Language-Specific Translation Policy');
    expect(prompt).toContain('the target language');
  });
});

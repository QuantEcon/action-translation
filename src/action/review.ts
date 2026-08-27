import * as core from '@actions/core';
import * as github from '@actions/github';
import { getReviewInputs, validateReviewPREvent } from '../inputs.js';
import { TranslationReviewer } from '../reviewer.js';
import { loadGlossary, formatGlossaryTerms } from '../sync-orchestrator.js';
import { coreLogger } from './core-logger.js';

/**
 * Run the REVIEW mode - evaluate translation quality on a PR
 *
 * Extracted from the entry point as #169's first slice. The entry shim
 * computes `builtInGlossaryDir` — the one path that needs `import.meta.url`
 * (see runtime-paths.ts) — and threads it in as an argument, which is what
 * keeps this module loadable under Jest's CJS registry.
 */
export async function runReview(builtInGlossaryDir: string): Promise<void> {
  // Get and validate inputs
  core.info('Getting review mode inputs...');
  const inputs = getReviewInputs();

  // Validate this is a PR event
  core.info('Validating PR event...');
  const { prNumber } = validateReviewPREvent(github.context);

  core.info(`📝 Reviewing translation PR #${prNumber}`);

  // Initialize reviewer
  const reviewer = new TranslationReviewer(
    inputs.anthropicApiKey,
    inputs.githubToken,
    inputs.claudeModel,
    inputs.maxSuggestions
  );

  // Load glossary — through the same loader sync and rebase use, so a repo with
  // a custom glossary is reviewed against the terminology it was translated
  // against. Review used to read the built-in file directly and ignore
  // `glossary-path` entirely (#146), which mattered once verdict v2 made
  // `terminology` a gating category: judging against the wrong glossary
  // suppresses the gate and biases the shadow calibration data.
  let glossaryTerms: string | undefined;
  const targetLanguage = detectTargetLanguage(github.context.repo.repo);
  if (targetLanguage) {
    const glossary = await loadGlossary(
      targetLanguage,
      builtInGlossaryDir,
      inputs.glossaryPath || undefined,
      coreLogger
    );
    if (glossary) {
      glossaryTerms = formatGlossaryTerms(glossary, targetLanguage);
    }
  } else {
    core.warning(
      `Could not detect a target language from repository name '${github.context.repo.repo}' — ` +
        `reviewing WITHOUT a glossary, so terminology findings are unreliable.`
    );
  }

  // Run review
  const result = await reviewer.reviewPR(
    prNumber,
    inputs.sourceRepo,
    github.context.repo.owner,
    github.context.repo.repo,
    inputs.docsFolder,
    glossaryTerms,
    targetLanguage,
    inputs.autoMergeMode
  );

  // Set outputs
  core.setOutput('review-verdict', result.verdict);
  core.setOutput('translation-score', result.translationQuality.score.toString());
  core.setOutput('diff-score', result.diffQuality.score.toString());
  core.setOutput('review-recommendation', result.recommendation);
  core.setOutput('reviewed-head-sha', result.reviewedHeadSha);
  if (result.wouldAutoMerge !== undefined) {
    core.setOutput('would-auto-merge', String(result.wouldAutoMerge));
  }

  // Cost accounting — retries included (#164). Review runs on every
  // translation PR and previously emitted no token or call count at all.
  const usage = reviewer.getUsage();
  core.setOutput('input-tokens', String(usage.inputTokens));
  core.setOutput('output-tokens', String(usage.outputTokens));
  core.setOutput('cache-creation-input-tokens', String(usage.cacheCreationInputTokens));
  core.setOutput('cache-read-input-tokens', String(usage.cacheReadInputTokens));
  core.setOutput('api-calls', String(usage.apiCalls));
  core.info(
    `API usage: ${usage.apiCalls} call(s), ${usage.inputTokens} input + ${usage.outputTokens} output tokens, cache: ${usage.cacheReadInputTokens} read + ${usage.cacheCreationInputTokens} written`
  );

  core.info(
    `✅ Review complete: ${result.verdict} → ${result.recommendation} (Translation: ${result.translationQuality.score}/10, Diff: ${result.diffQuality.score}/10)`
  );
}

/**
 * Detect target language from repository name
 * e.g., 'lecture-python.zh-cn' -> 'zh-cn'
 */
export function detectTargetLanguage(repoName: string): string | undefined {
  const match = repoName.match(/\.([a-z]{2}(?:-[a-z]{2})?)$/);
  return match ? match[1] : undefined;
}

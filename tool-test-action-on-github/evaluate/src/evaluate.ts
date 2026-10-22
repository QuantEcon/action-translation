#!/usr/bin/env node
/**
 * Translation Quality Evaluation Tool
 * 
 * Evaluates translation PRs from action-translation test suite using Claude Opus 4.5:
 * 1. Translation quality (accuracy, fluency, terminology, formatting)
 * 2. Diff quality (scope, position, structure, heading-map)
 * 
 * Hardcoded to QuantEcon test repositories:
 * - Source: QuantEcon/test-translation-sync
 * - Target: QuantEcon/test-translation-sync.zh-cn
 * 
 * Usage:
 *   npm run evaluate                     # Evaluate all open PR pairs, save report
 *   npm run evaluate:post                # Evaluate and post reviews to PRs
 *   npm run evaluate -- --pr 123         # Evaluate specific PR number
 *   npm run evaluate -- --output report.md # Save report to specific file
 *   npm run evaluate -- --max-suggestions 10 # Allow up to 10 suggestions
 */

import { program } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { GitHubService } from './github.js';
import { TranslationEvaluator, identifyChangedSections } from './evaluator.js';
import {
  checkScopeExpectation,
  formatScopeCheck,
  scopeExpectationFor,
  SYNC_CHECK_NAME,
  syncRunVerdict,
} from './scope-expectations.js';
import type {
  EvaluationOptions,
  EvaluationResult,
  EvaluationReport,
  NoTargetPRSource,
  PRPair,
  ScopeCheckResult,
  SourcePR,
  SyncRunVerdict,
  UnmatchedScopeSource
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function logScopeCheck(check: ScopeCheckResult): void {
  if (check.ok) {
    console.log(chalk.gray(`  Scope check (scenario ${check.scenario}): as expected`));
    return;
  }
  console.log(chalk.red(`  Scope check (scenario ${check.scenario}): ${check.problems.length} problem(s)`));
  for (const problem of check.problems) {
    console.log(chalk.red(`    - ${problem}`));
  }
}

/**
 * A scope run the check decides alone, with no model call: a PR that
 * translates no lecture (scenarios 17 and 18), or one whose scenario expects
 * no translation PR at all. `why` says which, in the review comment.
 */
async function scopeOnlyResult(
  pair: PRPair,
  scopeCheck: ScopeCheckResult,
  why: string,
  github: GitHubService,
  options: EvaluationOptions
): Promise<EvaluationResult> {
  logScopeCheck(scopeCheck);
  const verdict = scopeCheck.ok ? 'PASS' : 'FAIL';
  const reviewComment = `## ${scopeCheck.ok ? '✅' : '❌'} Translation Quality Evaluation

**Verdict**: ${verdict} | **Date**: ${new Date().toISOString().split('T')[0]}

${why}

${formatScopeCheck(scopeCheck)}`;

  if (options.postReviews) {
    console.log(chalk.gray('  Posting review to PR...'));
    await github.postReview(pair.targetNumber, reviewComment, 'COMMENT');
  }

  const verdictColor = scopeCheck.ok ? chalk.green : chalk.red;
  console.log(verdictColor(`  ${verdict}: sync-scope check only (no model evaluation)`));

  return {
    prPair: pair,
    timestamp: new Date().toISOString(),
    scopeCheck,
    overallVerdict: verdict,
    reviewComment,
  };
}

async function evaluatePRPair(
  pair: PRPair,
  github: GitHubService,
  evaluator: TranslationEvaluator,
  options: EvaluationOptions
): Promise<EvaluationResult> {
  console.log(chalk.blue(`\nEvaluating: ${pair.testScenario}`));
  console.log(chalk.gray(`  Source PR #${pair.sourceNumber} → Target PR #${pair.targetNumber}`));

  // A scope run (#344) is held to its scenario's expected result. When the PR
  // translates no lecture, or should not exist at all, that check is the
  // whole evaluation.
  const expectation = scopeExpectationFor(pair.sourceLabels, pair.sourceBranch);
  if (expectation && (expectation.noTargetPR || !expectation.primaryLecture)) {
    const targetFiles = await github.getTargetPRFiles(pair.targetNumber);
    return scopeOnlyResult(
      pair,
      checkScopeExpectation(expectation, targetFiles, pair.targetBody),
      expectation.noTargetPR
        ? 'Under `sync-scope: existing` this scenario should open no translation PR, so there is no model evaluation.'
        : 'Under `sync-scope: existing` this PR translates no lecture, so there is no model evaluation.',
      github,
      options
    );
  }

  // Get source diff (English before/after)
  const sourceDiff = await github.getSourceDiff(pair.sourceNumber);
  
  // Get target diff (Chinese before/after)
  const targetDiff = await github.getTargetDiff(pair.targetNumber);

  const scopeCheck = expectation
    ? checkScopeExpectation(expectation, targetDiff.files, pair.targetBody)
    : undefined;
  if (scopeCheck) logScopeCheck(scopeCheck);

  // Get primary file content for evaluation. A scope run names it: the first
  // changed .md can be a lecture the run left out (19's lecture-minimal.md).
  const primaryFile = sourceDiff.files.find(f => f.filename.endsWith('.md'));
  const sourceFile = expectation?.primaryLecture || primaryFile?.filename || 'lecture-minimal.md';

  const sourceAfter = sourceDiff.afterContent.get(sourceFile) || '';
  const targetAfter = targetDiff.afterContent.get(sourceFile) || '';
  const sourceBefore = sourceDiff.beforeContent.get(sourceFile) || '';
  const targetBefore = targetDiff.beforeContent.get(sourceFile) || '';

  // Identify which sections were actually changed
  const changedSections = identifyChangedSections(
    sourceBefore,
    sourceAfter,
    targetBefore,
    targetAfter
  );
  console.log(chalk.gray(`  Changed sections: ${changedSections.length > 0 ? changedSections.map(s => s.heading).join(', ') : 'preamble only'}`));

  // Evaluate translation quality (focused on changed sections)
  console.log(chalk.gray('  Evaluating translation quality...'));
  const translationResult = await evaluator.evaluateTranslation(
    sourceAfter,
    targetAfter,
    changedSections
  );

  // Evaluate diff quality. The judge compares the target's files with the
  // source's, so a scope run hands it only the source files the run was meant
  // to sync: one it left out on purpose (19's lecture-minimal.md) would read as
  // missing from the target. The scope check above holds the PR to that list.
  console.log(chalk.gray('  Evaluating diff quality...'));
  const notSynced = new Set(expectation?.notSynced ?? []);
  const diffResult = await evaluator.evaluateDiff(
    sourceBefore,
    sourceAfter,
    targetBefore,
    targetAfter,
    sourceDiff.files.filter(f => !notSynced.has(f.filename)),
    targetDiff.files,
    sourceDiff.files.filter(f => notSynced.has(f.filename)).map(f => f.filename)
  );

  // Determine overall verdict
  const overallScore = (translationResult.score + diffResult.score) / 2;
  let verdict: 'PASS' | 'WARN' | 'FAIL';
  if (overallScore >= 8 && diffResult.score >= 8) {
    verdict = 'PASS';
  } else if (overallScore >= 6 && diffResult.score >= 6) {
    verdict = 'WARN';
  } else {
    verdict = 'FAIL';
  }
  // A scope run that is not its expected result fails, whatever the scores.
  if (scopeCheck && !scopeCheck.ok) {
    verdict = 'FAIL';
  }

  // Generate review comment
  const reviewComment =
    evaluator.generateReviewComment(translationResult, diffResult, verdict) +
    (scopeCheck ? `\n\n---\n\n${formatScopeCheck(scopeCheck)}` : '');

  // Post review if enabled
  // Always use COMMENT to avoid "can't approve own PR" errors
  // The verdict (PASS/WARN/FAIL) is included in the comment body
  if (options.postReviews) {
    console.log(chalk.gray('  Posting review to PR...'));
    await github.postReview(pair.targetNumber, reviewComment, 'COMMENT');
  }

  const result: EvaluationResult = {
    prPair: pair,
    timestamp: new Date().toISOString(),
    translationQuality: translationResult,
    diffQuality: diffResult,
    scopeCheck,
    overallScore: Math.round(overallScore * 10) / 10,
    overallVerdict: verdict,
    reviewComment,
  };

  // Print summary
  const verdictColor = verdict === 'PASS' ? chalk.green : 
                       verdict === 'WARN' ? chalk.yellow : chalk.red;
  const scopeNote = scopeCheck && !scopeCheck.ok ? ', scope check failed' : '';
  console.log(verdictColor(`  ${verdict}: Translation ${translationResult.score}/10, Diff ${diffResult.score}/10${scopeNote}`));

  return result;
}

/**
 * Scope-run source PRs that no translation PR references (#344), sorted by
 * what their scenario expects. `missing` expected one, and each is a failure.
 * `expectedNone` expected none, which is the result only if the sync run
 * passed (`withSyncRuns`). Nothing pairs either, so without this both would
 * drop out silently.
 */
function unmatchedScopeSources(
  unmatched: SourcePR[],
  prNumbers?: number[]
): { missing: UnmatchedScopeSource[]; expectedNone: UnmatchedScopeSource[] } {
  const missing: UnmatchedScopeSource[] = [];
  const expectedNone: UnmatchedScopeSource[] = [];
  for (const source of unmatched) {
    const expectation = scopeExpectationFor(source.labels, source.branch);
    if (!expectation) continue;
    if (prNumbers && prNumbers.length > 0 && !prNumbers.includes(source.number)) continue;
    const entry = {
      sourceNumber: source.number,
      title: source.title,
      scenario: expectation.scenario,
      headSha: source.headSha,
    };
    (expectation.noTargetPR ? expectedNone : missing).push(entry);
  }
  return { missing, expectedNone };
}

/**
 * Read the zh-cn sync run of each source PR that expects no translation PR
 * (#344). A run that fails opens no PR either, so the missing PR alone proves
 * nothing. A check that cannot be read leaves the source PR unverified, never
 * passed.
 */
async function withSyncRuns(
  sources: UnmatchedScopeSource[],
  github: GitHubService
): Promise<NoTargetPRSource[]> {
  const verified: NoTargetPRSource[] = [];
  for (const source of sources) {
    let syncRun: SyncRunVerdict;
    try {
      syncRun = syncRunVerdict(await github.getSyncCheckRuns(source.headSha));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      syncRun = {
        state: 'unverified',
        detail: `could not read the ${SYNC_CHECK_NAME} check runs: ${message}`,
      };
    }
    verified.push({ ...source, syncRun });
  }
  return verified;
}

/** Source PRs that expect no translation PR, by their sync run's verdict. */
function bySyncRun(
  sources: NoTargetPRSource[]
): Record<SyncRunVerdict['state'], NoTargetPRSource[]> {
  return {
    passed: sources.filter(s => s.syncRun.state === 'passed'),
    failed: sources.filter(s => s.syncRun.state === 'failed'),
    unverified: sources.filter(s => s.syncRun.state === 'unverified'),
  };
}

/** A sync run's verdict as a console color: red if it failed, yellow if unverified. */
function syncRunColor(verdict: SyncRunVerdict): (text: string) => string {
  if (verdict.state === 'failed') return chalk.red;
  if (verdict.state === 'unverified') return chalk.yellow;
  return chalk.gray;
}

/** A source PR that expects no translation PR, as a line of a report callout. */
function noTargetPRLine(source: NoTargetPRSource): string {
  const run = source.syncRun.url ? ` ([sync run](${source.syncRun.url}))` : '';
  return `> - **${source.title}** (source PR #${source.sourceNumber}, scenario ${source.scenario}): ${source.syncRun.detail}${run}`;
}

/** An average score as the report prints it: "n/a" when the model scored nothing. */
function formatAverage(average: number | undefined): string {
  return average === undefined ? 'n/a' : `${average}/10`;
}

function generateReport(
  results: EvaluationResult[],
  repoInfo: { sourceRepo: string; targetRepo: string },
  model: string,
  dropped: Array<{ pair: PRPair; error: string }> = [],
  missing: UnmatchedScopeSource[] = [],
  expectedNone: NoTargetPRSource[] = []
): EvaluationReport {
  const passed = results.filter(r => r.overallVerdict === 'PASS').length;
  const warned = results.filter(r => r.overallVerdict === 'WARN').length;
  const failed = results.filter(r => r.overallVerdict === 'FAIL').length;

  // Averages cover the pairs the model scored. A scope check that stands
  // alone (17, 18, or a PR that should not exist) has no scores, and with
  // nothing scored there is no average.
  const scored = results.flatMap(r =>
    r.translationQuality && r.diffQuality
      ? [{ translation: r.translationQuality.score, diff: r.diffQuality.score }]
      : []
  );
  const average = (scores: number[]): number | undefined =>
    scores.length > 0
      ? Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 10) / 10
      : undefined;

  // Collect common issues
  const allIssues = results.flatMap(r => [
    ...(r.translationQuality?.issues ?? []),
    ...(r.diffQuality?.issues ?? []),
  ]);
  const issueCounts = new Map<string, number>();
  for (const issue of allIssues) {
    issueCounts.set(issue, (issueCounts.get(issue) || 0) + 1);
  }
  const commonIssues = [...issueCounts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([issue]) => issue);

  return {
    generatedAt: new Date().toISOString(),
    evaluator: model,
    sourceRepo: repoInfo.sourceRepo,
    targetRepo: repoInfo.targetRepo,
    prPairsEvaluated: results.length,
    droppedPairs: dropped.map(d => ({
      sourceNumber: d.pair.sourceNumber,
      title: d.pair.sourceTitle,
      error: d.error,
    })),
    missingTargetPRs: missing,
    expectedNoTargetPRs: expectedNone,
    results,
    summary: {
      passed,
      warned,
      failed,
      averageTranslationScore: average(scored.map(s => s.translation)),
      averageDiffScore: average(scored.map(s => s.diff)),
      commonIssues,
    },
  };
}

function formatReportMarkdown(report: EvaluationReport): string {
  const missing = report.missingTargetPRs ?? [];
  const missingRow = missing.length > 0
    ? `| Missing translation PRs (sync-scope) ❌ | ${missing.length} |\n`
    : '';
  // A source PR that expects no translation PR gets a ✅ only when its sync
  // run passed: a run that fails opens no PR either.
  const noPR = bySyncRun(report.expectedNoTargetPRs ?? []);
  const noPRRows =
    (noPR.passed.length > 0
      ? `| No translation PR, as expected; sync run passed (sync-scope) ✅ | ${noPR.passed.length} |\n`
      : '') +
    (noPR.failed.length > 0
      ? `| No translation PR, but the sync run failed or never ran (sync-scope) ❌ | ${noPR.failed.length} |\n`
      : '') +
    (noPR.unverified.length > 0
      ? `| No translation PR, sync run not verified (sync-scope) ⚠️ | ${noPR.unverified.length} |\n`
      : '');
  let md = `# Translation Evaluation Report

**Generated**: ${report.generatedAt}
**Evaluator**: ${report.evaluator}
**Source Repository**: ${report.sourceRepo}
**Target Repository**: ${report.targetRepo}

---

## Summary

| Metric | Value |
|--------|-------|
| PR Pairs Evaluated | ${report.prPairsEvaluated} |
| Passed ✅ | ${report.summary.passed} |
| Warnings ⚠️ | ${report.summary.warned} |
| Failed ❌ | ${report.summary.failed} |
| Avg Translation Score | ${formatAverage(report.summary.averageTranslationScore)} |
| Avg Diff Score | ${formatAverage(report.summary.averageDiffScore)} |
${missingRow}${noPRRows}
`;

  if (missing.length > 0) {
    md += `> ❌ **${missing.length} source PR(s) under \`sync-scope: existing\` have no translation PR, and their scenarios expect one.**
> Each is a failure. Check the source PR's sync run; one still running has not opened its PR yet.
>
${missing.map(m => `> - **${m.title}** (source PR #${m.sourceNumber}, scenario ${m.scenario})`).join('\n')}

`;
  }

  if (noPR.failed.length > 0) {
    md += `> ❌ **${noPR.failed.length} source PR(s) under \`sync-scope: existing\` have no translation PR, as their scenarios expect, but their zh-cn sync run failed or never ran.**
> Each is a failure: a sync run that fails opens no PR either. Check the run's log and job summary.
>
${noPR.failed.map(noTargetPRLine).join('\n')}

`;
  }

  if (noPR.unverified.length > 0) {
    md += `> ⚠️ **${noPR.unverified.length} source PR(s) under \`sync-scope: existing\` have no translation PR, as their scenarios expect, but the evaluator could not verify their zh-cn sync run.**
> They do not count as passed. Check each run by hand, or evaluate again once every run has finished.
>
${noPR.unverified.map(noTargetPRLine).join('\n')}

`;
  }

  if (noPR.passed.length > 0) {
    md += `> ✅ **${noPR.passed.length} source PR(s) under \`sync-scope: existing\` have no translation PR, as their scenarios expect, and their zh-cn sync run passed:** nothing they change is in scope.
> Check that each run's job summary lists the lecture as not synced.
>
${noPR.passed.map(noTargetPRLine).join('\n')}

`;
  }

  if (report.droppedPairs && report.droppedPairs.length > 0) {
    md += `> ⚠️ **Incomplete run — ${report.droppedPairs.length} pair(s) errored and are excluded from every score above.**
> The scores describe only the ${report.prPairsEvaluated} pair(s) that completed; do not compare
> this denominator against a baseline without re-running the pairs below (\`--pr <number>\`).
>
${report.droppedPairs.map(d => `> - **${d.title}** (source PR #${d.sourceNumber}): ${d.error}`).join('\n')}

`;
  }

  if (report.summary.commonIssues.length > 0) {
    md += `### Common Issues
${report.summary.commonIssues.map(i => `- ${i}`).join('\n')}

`;
  }

  md += `---

## Per-PR Results

`;

  for (const result of report.results) {
    const emoji = result.overallVerdict === 'PASS' ? '✅' : 
                  result.overallVerdict === 'WARN' ? '⚠️' : '❌';
    const { translationQuality: tq, diffQuality: dq, scopeCheck } = result;
    const scores = tq && dq
      ? `- **Translation Score**: ${tq.score}/10\n- **Diff Score**: ${dq.score}/10\n`
      : '- **Model evaluation**: none; the sync-scope check is the whole evaluation\n';
    const scope = scopeCheck
      ? `- **Sync-scope check** (scenario ${scopeCheck.scenario}): ` +
        `${scopeCheck.ok ? '✅ as expected' : `❌ ${scopeCheck.problems.length} problem(s)`}\n` +
        scopeCheck.problems.map(p => `  - ${p}\n`).join('')
      : '';
    const summaries = tq && dq
      ? `**Translation Summary**: ${tq.summary}\n\n**Diff Summary**: ${dq.summary}\n\n`
      : '';
    
    md += `### ${emoji} ${result.prPair.testScenario}

- **Source PR**: [#${result.prPair.sourceNumber}](${result.prPair.sourceUrl})
- **Target PR**: [#${result.prPair.targetNumber}](${result.prPair.targetUrl})
${scores}- **Verdict**: ${result.overallVerdict}
${scope}
${summaries}`;
  }

  return md;
}

async function main() {
  program
    .name('evaluate')
    .description('Evaluate translation PR quality using Claude Opus 4.5')
    .option('--pr <numbers...>', 'PR numbers to evaluate (from either repo)')
    .option('--post-reviews', 'Post review comments to translation PRs', false)
    .option('--output <file>', 'Output report to file (default: reports/evaluation-<date>.md)')
    .option('--list-only', 'Only list matched PR pairs without evaluation (no API key needed)', false)
    .option('--max-suggestions <number>', 'Maximum suggestions per evaluation (default: 5)', '5')
    // The judge, not the thing under test. Defaults to the current best Opus so an
    // absolute quality read uses the strongest available reviewer.
    //
    // Comparing against an existing baseline? Pin this to whatever THAT report's
    // "**Evaluator**:" header names (e.g. --model claude-opus-4-5-20251101 for the
    // 2025-12 reports). Moving the judge and the translation model at once makes a
    // score delta unattributable. Every report records the judge it used, so the
    // right pin is always recoverable from the baseline itself.
    .option(
      '--model <name>',
      'Claude model used to GRADE translations; pin to the baseline’s judge when comparing',
      'claude-opus-4-8'
    )
    .parse(process.argv);

  const opts = program.opts();

  // Check for required environment variables
  const githubToken = process.env.GITHUB_TOKEN;

  if (!githubToken) {
    console.error(chalk.red('Error: GITHUB_TOKEN environment variable is required'));
    process.exit(1);
  }

  // List-only mode: just show matched PRs without evaluation
  if (opts.listOnly) {
    const github = new GitHubService(githubToken);
    const repoInfo = github.getRepoInfo();
    
    console.log(chalk.blue('═'.repeat(50)));
    console.log(chalk.blue('PR Pair Discovery (List Only)'));
    console.log(chalk.blue('═'.repeat(50)));
    console.log(chalk.gray(`Source: ${repoInfo.sourceRepo}`));
    console.log(chalk.gray(`Target: ${repoInfo.targetRepo}`));
    
    console.log(chalk.blue('\nFetching PR pairs...'));
    const matched = await github.matchPRPairs();
    let pairs = matched.pairs;
    const prNumbers: number[] | undefined = opts.pr?.map((p: string) => parseInt(p, 10));

    // Apply --pr filter if provided
    if (prNumbers && prNumbers.length > 0) {
      pairs = pairs.filter(p => 
        prNumbers.includes(p.sourceNumber) || 
        prNumbers.includes(p.targetNumber)
      );
    }
    const scopeSources = unmatchedScopeSources(matched.unmatched, prNumbers);
    const { missing } = scopeSources;

    if (pairs.length === 0 && missing.length === 0 && scopeSources.expectedNone.length === 0) {
      console.log(chalk.yellow('No matching PR pairs found'));
      process.exit(0);
    }
    const expectedNone = await withSyncRuns(scopeSources.expectedNone, github);

    console.log(chalk.green(`\nFound ${pairs.length} PR pair(s):\n`));
    
    for (const pair of pairs) {
      console.log(chalk.cyan(`${pair.testScenario}`));
      console.log(chalk.gray(`  Source: PR #${pair.sourceNumber} (${pair.sourceBranch})`));
      console.log(chalk.gray(`  Target: PR #${pair.targetNumber} (${pair.targetBranch})`));
      console.log(chalk.gray(`  ${pair.sourceUrl}`));
      console.log(chalk.gray(`  ${pair.targetUrl}`));
      console.log('');
    }

    for (const m of missing) {
      console.log(chalk.red(`${m.title}`));
      console.log(chalk.red(`  Source: PR #${m.sourceNumber}, under sync-scope: existing: no translation PR (scenario ${m.scenario} expects one)`));
      console.log('');
    }
    
    for (const m of expectedNone) {
      const color = syncRunColor(m.syncRun);
      console.log(color(`${m.title}`));
      console.log(color(`  Source: PR #${m.sourceNumber}, under sync-scope: existing: no translation PR, as scenario ${m.scenario} expects; zh-cn sync run: ${m.syncRun.detail}`));
      console.log('');
    }

    process.exit(0);
  }

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    console.error(chalk.red('Error: ANTHROPIC_API_KEY environment variable is required'));
    process.exit(1);
  }

  const options: EvaluationOptions = {
    anthropicApiKey,
    githubToken,
    prNumbers: opts.pr ? opts.pr.map((p: string) => parseInt(p, 10)) : undefined,
    postReviews: opts.postReviews,
    outputFile: opts.output,
    maxSuggestions: parseInt(opts.maxSuggestions, 10),
    model: opts.model,
  };

  // Initialize services
  const github = new GitHubService(githubToken);
  const evaluator = new TranslationEvaluator(anthropicApiKey, options.maxSuggestions, options.model);
  const repoInfo = github.getRepoInfo();

  console.log(chalk.blue('═'.repeat(50)));
  console.log(chalk.blue('Translation Quality Evaluation'));
  console.log(chalk.blue('═'.repeat(50)));
  console.log(chalk.gray(`Source: ${repoInfo.sourceRepo}`));
  console.log(chalk.gray(`Target: ${repoInfo.targetRepo}`));
  console.log(chalk.gray(`Model: ${options.model}`));
  console.log(chalk.gray(`Max suggestions: ${options.maxSuggestions}`));
  if (options.postReviews) {
    console.log(chalk.green('Will post reviews to PRs'));
  }

  // Get PR pairs to evaluate
  console.log(chalk.blue('\nFetching PR pairs...'));
  const matched = await github.matchPRPairs();
  let pairs = matched.pairs;

  // Filter by specific PR numbers if provided (accepts source or target PR numbers)
  if (options.prNumbers && options.prNumbers.length > 0) {
    pairs = pairs.filter(p => 
      options.prNumbers!.includes(p.sourceNumber) || 
      options.prNumbers!.includes(p.targetNumber)
    );
  }
  const scopeSources = unmatchedScopeSources(matched.unmatched, options.prNumbers);
  const { missing } = scopeSources;

  if (pairs.length === 0 && missing.length === 0 && scopeSources.expectedNone.length === 0) {
    console.log(chalk.yellow('No matching PR pairs found'));
    process.exit(0);
  }
  const expectedNone = await withSyncRuns(scopeSources.expectedNone, github);
  const noPR = bySyncRun(expectedNone);

  console.log(chalk.green(`Found ${pairs.length} PR pair(s) to evaluate`));
  if (missing.length > 0) {
    console.error(chalk.red(`${missing.length} source PR(s) under sync-scope: existing have no translation PR (each a failure):`));
    for (const m of missing) {
      console.error(chalk.red(`  - ${m.title} (source PR #${m.sourceNumber}, scenario ${m.scenario})`));
    }
  }
  if (expectedNone.length > 0) {
    console.log(chalk.gray(`${expectedNone.length} source PR(s) under sync-scope: existing have no translation PR, as their scenarios expect. Their zh-cn sync runs:`));
    for (const m of expectedNone) {
      console.log(syncRunColor(m.syncRun)(`  - ${m.title} (source PR #${m.sourceNumber}, scenario ${m.scenario}): ${m.syncRun.detail}`));
    }
  }

  // Evaluate each pair
  const results: EvaluationResult[] = [];
  // A pair that throws must not just vanish: the report's denominator is what a
  // reader compares against a baseline, so a silently-dropped pair turns a partial
  // run into a clean-looking one ("25 pairs, 25 passed, 0 failed" while a 26th
  // errored). Collect failures and surface them in the report and exit code.
  const dropped: Array<{ pair: PRPair; error: string }> = [];
  for (const pair of pairs) {
    try {
      const result = await evaluatePRPair(pair, github, evaluator, options);
      results.push(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Failed to evaluate PR pair ${pair.sourceNumber}: ${message}`));
      dropped.push({ pair, error: message });
    }
  }

  if (dropped.length > 0) {
    console.error(
      chalk.red(
        `\n${dropped.length} of ${pairs.length} pair(s) could not be evaluated and are NOT in the scores below:`
      )
    );
    for (const d of dropped) {
      console.error(chalk.red(`  - ${d.pair.sourceTitle} (source PR #${d.pair.sourceNumber}): ${d.error}`));
    }
    console.error(
      chalk.red('Re-run those pairs with --pr <number> before comparing against a baseline.\n')
    );
  }

  // Generate report
  const report = generateReport(results, repoInfo, options.model!, dropped, missing, expectedNone);

  // Print summary
  console.log(chalk.blue('\n' + '═'.repeat(50)));
  console.log(chalk.blue('Evaluation Complete'));
  console.log(chalk.blue('═'.repeat(50)));
  console.log(`Evaluated: ${report.prPairsEvaluated} PR pairs`);
  console.log(chalk.green(`Passed: ${report.summary.passed}`));
  console.log(chalk.yellow(`Warnings: ${report.summary.warned}`));
  console.log(chalk.red(`Failed: ${report.summary.failed}`));
  if (missing.length > 0) {
    console.log(chalk.red(`Missing translation PRs (sync-scope): ${missing.length}`));
  }
  if (noPR.passed.length > 0) {
    console.log(chalk.green(`No translation PR, as expected; sync run passed (sync-scope): ${noPR.passed.length}`));
  }
  if (noPR.failed.length > 0) {
    console.log(chalk.red(`No translation PR, but the sync run failed or never ran (sync-scope): ${noPR.failed.length}`));
  }
  if (noPR.unverified.length > 0) {
    console.log(chalk.yellow(`No translation PR, sync run not verified (sync-scope): ${noPR.unverified.length}`));
  }
  console.log(`Avg Translation Score: ${formatAverage(report.summary.averageTranslationScore)}`);
  console.log(`Avg Diff Score: ${formatAverage(report.summary.averageDiffScore)}`);

  // Save report
  const dateStr = new Date().toISOString().split('T')[0];
  const outputFile = options.outputFile || path.join('..', 'reports', `evaluation-${dateStr}.md`);
  const outputPath = path.resolve(__dirname, '..', outputFile);
  
  const reportMd = formatReportMarkdown(report);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, reportMd);
  console.log(chalk.green(`\nReport saved to: ${outputPath}`));

  // Exit non-zero on failures, and equally on an incomplete run: a dropped pair means
  // the scores above describe a subset, which must not read as a clean pass. A scope
  // run's missing translation PR is a failure too, and so is a source PR that expects
  // none but whose sync run failed or never ran. One whose sync run could not be
  // verified leaves the run incomplete, like a dropped pair.
  if (
    report.summary.failed > 0 ||
    dropped.length > 0 ||
    missing.length > 0 ||
    noPR.failed.length > 0 ||
    noPR.unverified.length > 0
  ) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});

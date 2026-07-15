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
import type { 
  EvaluationOptions, 
  EvaluationResult, 
  EvaluationReport,
  PRPair 
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function evaluatePRPair(
  pair: PRPair,
  github: GitHubService,
  evaluator: TranslationEvaluator,
  options: EvaluationOptions
): Promise<EvaluationResult> {
  console.log(chalk.blue(`\nEvaluating: ${pair.testScenario}`));
  console.log(chalk.gray(`  Source PR #${pair.sourceNumber} → Target PR #${pair.targetNumber}`));

  // Get source diff (English before/after)
  const sourceDiff = await github.getSourceDiff(pair.sourceNumber);
  
  // Get target diff (Chinese before/after)
  const targetDiff = await github.getTargetDiff(pair.targetNumber);

  // Get primary file content for evaluation
  const primaryFile = sourceDiff.files.find(f => f.filename.endsWith('.md'));
  const sourceFile = primaryFile?.filename || 'lecture-minimal.md';

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

  // Evaluate diff quality
  console.log(chalk.gray('  Evaluating diff quality...'));
  const diffResult = await evaluator.evaluateDiff(
    sourceBefore,
    sourceAfter,
    targetBefore,
    targetAfter,
    sourceDiff.files,
    targetDiff.files
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

  // Generate review comment
  const reviewComment = evaluator.generateReviewComment(
    translationResult,
    diffResult,
    verdict
  );

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
    overallScore: Math.round(overallScore * 10) / 10,
    overallVerdict: verdict,
    reviewComment,
  };

  // Print summary
  const verdictColor = verdict === 'PASS' ? chalk.green : 
                       verdict === 'WARN' ? chalk.yellow : chalk.red;
  console.log(verdictColor(`  ${verdict}: Translation ${translationResult.score}/10, Diff ${diffResult.score}/10`));

  return result;
}

function generateReport(
  results: EvaluationResult[],
  repoInfo: { sourceRepo: string; targetRepo: string },
  model: string
): EvaluationReport {
  const passed = results.filter(r => r.overallVerdict === 'PASS').length;
  const warned = results.filter(r => r.overallVerdict === 'WARN').length;
  const failed = results.filter(r => r.overallVerdict === 'FAIL').length;

  const avgTranslation = results.length > 0 
    ? results.reduce((sum, r) => sum + r.translationQuality.score, 0) / results.length
    : 0;
  const avgDiff = results.length > 0
    ? results.reduce((sum, r) => sum + r.diffQuality.score, 0) / results.length
    : 0;

  // Collect common issues
  const allIssues = results.flatMap(r => [
    ...r.translationQuality.issues,
    ...r.diffQuality.issues,
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
    results,
    summary: {
      passed,
      warned,
      failed,
      averageTranslationScore: Math.round(avgTranslation * 10) / 10,
      averageDiffScore: Math.round(avgDiff * 10) / 10,
      commonIssues,
    },
  };
}

function formatReportMarkdown(report: EvaluationReport): string {
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
| Avg Translation Score | ${report.summary.averageTranslationScore}/10 |
| Avg Diff Score | ${report.summary.averageDiffScore}/10 |

`;

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
    
    md += `### ${emoji} ${result.prPair.testScenario}

- **Source PR**: [#${result.prPair.sourceNumber}](${result.prPair.sourceUrl})
- **Target PR**: [#${result.prPair.targetNumber}](${result.prPair.targetUrl})
- **Translation Score**: ${result.translationQuality.score}/10
- **Diff Score**: ${result.diffQuality.score}/10
- **Verdict**: ${result.overallVerdict}

**Translation Summary**: ${result.translationQuality.summary}

**Diff Summary**: ${result.diffQuality.summary}

`;
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
    let pairs = await github.matchPRPairs();

    // Apply --pr filter if provided
    if (opts.pr && opts.pr.length > 0) {
      const prNumbers = opts.pr.map((p: string) => parseInt(p, 10));
      pairs = pairs.filter(p => 
        prNumbers.includes(p.sourceNumber) || 
        prNumbers.includes(p.targetNumber)
      );
    }
    
    if (pairs.length === 0) {
      console.log(chalk.yellow('No matching PR pairs found'));
      process.exit(0);
    }
    
    console.log(chalk.green(`\nFound ${pairs.length} PR pair(s):\n`));
    
    for (const pair of pairs) {
      console.log(chalk.cyan(`${pair.testScenario}`));
      console.log(chalk.gray(`  Source: PR #${pair.sourceNumber} (${pair.sourceBranch})`));
      console.log(chalk.gray(`  Target: PR #${pair.targetNumber} (${pair.targetBranch})`));
      console.log(chalk.gray(`  ${pair.sourceUrl}`));
      console.log(chalk.gray(`  ${pair.targetUrl}`));
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
  let pairs = await github.matchPRPairs();

  // Filter by specific PR numbers if provided (accepts source or target PR numbers)
  if (options.prNumbers && options.prNumbers.length > 0) {
    pairs = pairs.filter(p => 
      options.prNumbers!.includes(p.sourceNumber) || 
      options.prNumbers!.includes(p.targetNumber)
    );
  }

  if (pairs.length === 0) {
    console.log(chalk.yellow('No matching PR pairs found'));
    process.exit(0);
  }

  console.log(chalk.green(`Found ${pairs.length} PR pair(s) to evaluate`));

  // Evaluate each pair
  const results: EvaluationResult[] = [];
  for (const pair of pairs) {
    try {
      const result = await evaluatePRPair(pair, github, evaluator, options);
      results.push(result);
    } catch (error) {
      console.error(chalk.red(`Failed to evaluate PR pair ${pair.sourceNumber}: ${error}`));
    }
  }

  // Generate report
  const report = generateReport(results, repoInfo, options.model!);

  // Print summary
  console.log(chalk.blue('\n' + '═'.repeat(50)));
  console.log(chalk.blue('Evaluation Complete'));
  console.log(chalk.blue('═'.repeat(50)));
  console.log(`Evaluated: ${report.prPairsEvaluated} PR pairs`);
  console.log(chalk.green(`Passed: ${report.summary.passed}`));
  console.log(chalk.yellow(`Warnings: ${report.summary.warned}`));
  console.log(chalk.red(`Failed: ${report.summary.failed}`));
  console.log(`Avg Translation Score: ${report.summary.averageTranslationScore}/10`);
  console.log(`Avg Diff Score: ${report.summary.averageDiffScore}/10`);

  // Save report
  const dateStr = new Date().toISOString().split('T')[0];
  const outputFile = options.outputFile || path.join('..', 'reports', `evaluation-${dateStr}.md`);
  const outputPath = path.resolve(__dirname, '..', outputFile);
  
  const reportMd = formatReportMarkdown(report);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, reportMd);
  console.log(chalk.green(`\nReport saved to: ${outputPath}`));

  // Exit with error code if any failures
  if (report.summary.failed > 0) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});

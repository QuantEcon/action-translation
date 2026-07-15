/**
 * Types for Translation Quality Evaluation
 */

export interface PRPair {
  sourceNumber: number;
  targetNumber: number;
  sourceTitle: string;
  targetTitle: string;
  sourceBranch: string;
  targetBranch: string;
  sourceUrl: string;
  targetUrl: string;
  testScenario: string;
}

export interface FileDiff {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
  patch?: string;
  previousFilename?: string;
}

export interface TranslationContext {
  sourceEnglish: string;
  targetChinese: string;
}

export interface ChangedSection {
  heading: string;          // The section heading (e.g., "## Introduction")
  changeType: 'added' | 'modified' | 'deleted';
  englishContent?: string;  // For added/modified sections
  chineseContent?: string;  // For added/modified sections
}

export interface TranslationQualityResult {
  score: number; // 1-10
  accuracy: number; // 1-10: Does it accurately convey the English meaning?
  fluency: number; // 1-10: Does it read naturally in Chinese?
  terminology: number; // 1-10: Is technical terminology consistent?
  formatting: number; // 1-10: Is MyST/math/code preserved?
  syntaxErrors: string[]; // Markdown/MyST syntax errors found
  issues: string[];
  strengths: string[];
  summary: string;
}

export interface DiffQualityResult {
  score: number; // 1-10
  scopeCorrect: boolean; // Only intended files changed?
  positionCorrect: boolean; // Changes in correct document locations?
  structurePreserved: boolean; // Document structure maintained?
  headingMapCorrect: boolean; // Heading-map properly updated?
  issues: string[];
  summary: string;
  scopeDetails: string;
  positionDetails: string;
  structureDetails: string;
}

export interface EvaluationResult {
  prPair: PRPair;
  timestamp: string;
  translationQuality: TranslationQualityResult;
  diffQuality: DiffQualityResult;
  overallScore: number;
  overallVerdict: 'PASS' | 'WARN' | 'FAIL';
  reviewComment: string;
}

export interface EvaluationReport {
  generatedAt: string;
  evaluator: string;
  sourceRepo: string;
  targetRepo: string;
  prPairsEvaluated: number;
  /**
   * Pairs that were matched but threw during evaluation. They contribute to NO score
   * below, so a reader comparing this report's denominator against a baseline needs to
   * see them — otherwise a partial run reads as a clean one.
   */
  droppedPairs?: Array<{ sourceNumber: number; title: string; error: string }>;
  results: EvaluationResult[];
  summary: {
    passed: number;
    warned: number;
    failed: number;
    averageTranslationScore: number;
    averageDiffScore: number;
    commonIssues: string[];
  };
}

export interface EvaluationOptions {
  anthropicApiKey: string;
  githubToken: string;
  prNumbers?: number[]; // PR numbers to evaluate (from either repo), or all open if undefined
  postReviews: boolean; // Post review comments to translation PRs
  outputFile?: string; // Path for report output
  maxSuggestions: number; // Maximum number of suggestions per evaluation (default: 5)
  model?: string; // Claude model used to GRADE translations (default: DEFAULT_EVALUATOR_MODEL)
}

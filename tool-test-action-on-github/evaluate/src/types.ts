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
  /** Labels on the source PR; `test-sync-scope-existing` marks a scope run (#344). */
  sourceLabels: string[];
  /** The translation PR's body, which a scope run's check reads. */
  targetBody: string;
}

/** An open, labelled source PR as the evaluator lists it. */
export interface SourcePR {
  number: number;
  title: string;
  branch: string;
  url: string;
  labels: string[];
  /** The PR's head commit, which carries the check runs of its sync runs. */
  headSha: string;
}

/** A scope-run source PR that no translation PR references (#344). */
export interface UnmatchedScopeSource {
  sourceNumber: number;
  title: string;
  /** Harness scenario number, e.g. '01'. */
  scenario: string;
  /** The source PR's head commit, which carries the check runs of its sync runs. */
  headSha: string;
}

/**
 * A check run of the source repo's zh-cn sync job (SYNC_CHECK_NAME in
 * scope-expectations.ts), as GitHub lists it for a commit.
 */
export interface SyncCheckRun {
  /** Increases with each run, so the highest is the newest. */
  id: number;
  /** `queued`, `in_progress`, `completed`, and so on. */
  status: string;
  /** Set once the run is `completed`: `success`, `failure`, `skipped`, and so on. */
  conclusion: string | null;
  /** The run's page. */
  url?: string;
}

/**
 * What the zh-cn sync run says about a scope-run source PR whose scenario
 * expects no translation PR (`syncRunVerdict` in scope-expectations.ts).
 */
export interface SyncRunVerdict {
  /**
   * `passed`: the run succeeded, so no translation PR is the expected result.
   * `failed`: the run did not succeed, or never ran. A failure.
   * `unverified`: the check runs could not be read, or the run has not
   * finished. Never a pass.
   */
  state: 'passed' | 'failed' | 'unverified';
  /** What the evaluator saw, in a few words. */
  detail: string;
  /** The page of the run the verdict rests on, when there is one. */
  url?: string;
}

/** A scope-run source PR whose scenario expects no translation PR, with its sync run's verdict. */
export interface NoTargetPRSource extends UnmatchedScopeSource {
  syncRun: SyncRunVerdict;
}

/** The deterministic check of a scope run's translation PR (scope-expectations.ts, #344). */
export interface ScopeCheckResult {
  /** Harness scenario number, e.g. '19'. */
  scenario: string;
  ok: boolean;
  problems: string[];
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
  /**
   * The model's scores. Absent when a scope run's PR translates no lecture
   * (scenarios 17 and 18) or should not exist: the scope check is then the
   * whole evaluation.
   */
  translationQuality?: TranslationQualityResult;
  diffQuality?: DiffQualityResult;
  /** Present when the source PR runs under the scope label and its scenario has an expectation. */
  scopeCheck?: ScopeCheckResult;
  overallScore?: number;
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
  /**
   * Scope-run source PRs whose scenario expects a translation PR and has none.
   * Each is a failure: there is no pair, so nothing else would report it.
   */
  missingTargetPRs?: UnmatchedScopeSource[];
  /**
   * Scope-run source PRs with no translation PR, as their scenario expects:
   * nothing they change is in scope. A sync run that fails opens no PR
   * either, so each carries its zh-cn sync run's verdict. One whose run
   * passed is the expected result. One whose run failed or never ran is a
   * failure, and one whose run could not be verified is not a pass. The
   * summary's passed, warned and failed counts leave them all out.
   */
  expectedNoTargetPRs?: NoTargetPRSource[];
  results: EvaluationResult[];
  summary: {
    passed: number;
    warned: number;
    failed: number;
    /** Over the results the model scored; undefined when it scored none. */
    averageTranslationScore?: number;
    /** Over the results the model scored; undefined when it scored none. */
    averageDiffScore?: number;
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

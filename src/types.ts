/**
 * Types and interfaces for the translation sync action
 * 
 * This action uses a SECTION-BASED approach:
 * - Documents are parsed into sections based on ## headings
 * - Changes are detected at the section level
 * - Translations are performed on entire sections with full context
 * - Documents are reconstructed from translated sections
 */

// ============================================================================
// ACTION CONFIGURATION
// ============================================================================

export interface ActionInputs {
  targetRepo: string;
  targetLanguage: string;
  docsFolder: string;
  sourceLanguage: string;
  glossaryPath: string;
  tocFile: string;
  anthropicApiKey: string;
  claudeModel: string;
  githubToken: string;
  prLabels: string[];
  prReviewers: string[];
  prTeamReviewers: string[];
  testMode: boolean;        // If true, run on PR head instead of merge commit
}

export interface ReviewInputs {
  sourceRepo: string;       // Source repository for English content (owner/repo)
  maxSuggestions: number;   // Maximum suggestions in review comment
  docsFolder: string;       // Documentation folder pattern
  sourceLanguage: string;   // Source language code (default: en)
  glossaryPath: string;     // Path to custom glossary
  anthropicApiKey: string;  // Anthropic API key for Claude
  claudeModel: string;      // Claude model for evaluation
  githubToken: string;      // GitHub token for API access
}

export interface RebaseInputs {
  docsFolder: string;       // Documentation folder pattern
  glossaryPath: string;     // Path to custom glossary
  anthropicApiKey: string;  // Anthropic API key for Claude
  githubToken: string;      // GitHub token for API access
}

// ============================================================================
// GLOSSARY
// ============================================================================

export interface GlossaryTerm {
  en: string;
  context?: string;
  [key: string]: string | undefined; // Support for multiple target languages (zh-cn, ja, etc.)
}

export interface Glossary {
  version: string;
  terms: GlossaryTerm[];
  style_guide?: {
    preserve_code_blocks?: boolean;
    preserve_math?: boolean;
    preserve_citations?: boolean;
    preserve_myst_directives?: boolean;
  };
}

// ============================================================================
// SECTION-BASED PARSING
// ============================================================================

/**
 * A section represents a ## heading and all its content (including subsections)
 * until the next ## heading
 */
export interface Section {
  heading: string;          // Full heading text: "## Economic Models"
  level: number;            // Heading level: 2 (for ##)
  id: string;               // Anchor/slug: "economic-models"
  content: string;          // Full markdown content of section (including subsections)
  startLine: number;        // Starting line in original document
  endLine: number;          // Ending line in original document
  parentId?: string;        // ID of parent section (for nested sections)
  subsections: Section[];   // Nested subsections (### headings)
}

export interface ParsedSections {
  sections: Section[];
  frontmatter?: string;     // YAML frontmatter (if present)
  preamble?: string;        // Content before first ## heading (title, intro, etc.)
  metadata: {
    filepath: string;
    totalLines: number;
    sectionCount: number;
  };
}

/**
 * Document broken into explicit components
 * Every valid document has: CONFIG + TITLE + INTRO + SECTIONS
 * - INTRO and SECTIONS can be empty
 */
export interface DocumentComponents {
  config: string;           // YAML frontmatter (always present, even if empty)
  preTitle: string;         // Content between frontmatter and # title (cross-ref targets, raw blocks, etc.)
  title: string;            // The # heading line (e.g., "# Introduction to Economics")
  titleText: string;        // Just the heading text (e.g., "Introduction to Economics")
  intro: string;            // Content between # title and first ## (can be empty)
  sections: Section[];      // All ## level sections (can be empty array)
  metadata: {
    filepath: string;
    totalLines: number;
    sectionCount: number;
  };
}

// ============================================================================
// SECTION-BASED DIFF DETECTION
// ============================================================================

export type SectionChangeType = 'added' | 'modified' | 'deleted';

/**
 * Represents a change at the section level
 */
export interface SectionChange {
  type: SectionChangeType;
  oldSection?: Section;     // For modified/deleted
  newSection?: Section;     // For modified/added
  position?: {              // For added sections
    afterSectionId?: string;
    parentSectionId?: string;
    index?: number;         // Position among siblings
  };
}

// ============================================================================
// SECTION-BASED TRANSLATION
// ============================================================================

/**
 * Request to translate a section
 * - 'update' mode: Claude sees old/new English + current translation → produces updated translation
 * - 'new' mode: Claude sees new English → produces new translation
 * - 'resync' mode: Claude sees current English + current translation → drift recovery (no baseline)
 */
export interface SectionTranslationRequest {
  mode: 'update' | 'new' | 'resync';
  sourceLanguage: string;
  targetLanguage: string;
  glossary?: Glossary;
  customInstructions?: string;
  // For update mode
  oldEnglish?: string;      // Current English section
  newEnglish?: string;      // Updated English section
  currentTranslation?: string;  // Current translation (generalized from currentChinese)
  // For new mode
  englishSection?: string;  // New English section to translate
  // For resync mode (uses newEnglish + currentTranslation)
}

export interface SectionTranslationResult {
  success: boolean;
  translatedSection?: string;
  error?: string;
  tokensUsed?: number;
}

/**
 * Request to translate a full document (for new files)
 */
export interface FullDocumentTranslationRequest {
  sourceLanguage: string;
  targetLanguage: string;
  glossary?: Glossary;
  customInstructions?: string;
  content: string;
}

/**
 * Request to resync a full document (whole-file RESYNC for forward command).
 * Claude sees the complete source + complete existing translation and produces
 * an updated translation that faithfully reflects the current source while
 * preserving the existing translation's style and localization.
 */
export interface DocumentResyncRequest {
  sourceLanguage: string;
  targetLanguage: string;
  glossary?: Glossary;
  customInstructions?: string;
  sourceContent: string;      // Current authoritative source document
  targetContent: string;      // Existing translation (may be outdated)
}

// ============================================================================
// FILE PROCESSING & GITHUB
// ============================================================================

export interface FileChange {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
  patch?: string;
  previous_filename?: string; // For renamed files
}

export interface SyncResult {
  success: boolean;
  filesProcessed: number;
  prUrl?: string;
  errors: string[];
}

export interface TranslatedFile {
  path: string;
  content: string;
  sha?: string; // SHA of existing file (for updates)
}

// ============================================================================
// REVIEW MODE TYPES
// ============================================================================

/**
 * Represents a changed section identified for review
 */
export interface ChangedSection {
  heading: string;          // The section heading (e.g., "## Introduction")
  changeType: 'added' | 'modified' | 'deleted';
  englishContent?: string;  // For added/modified sections
  translatedContent?: string;  // For added/modified sections (target language)
}

/**
 * Result of translation quality evaluation
 */
export interface TranslationQualityResult {
  score: number;           // Overall score 1-10
  accuracy: number;        // Accuracy score 1-10
  fluency: number;         // Fluency score 1-10
  terminology: number;     // Terminology score 1-10
  formatting: number;      // Formatting score 1-10
  syntaxErrors: string[];  // Markdown/MyST syntax errors found
  issues: string[];        // Suggested improvements
  strengths: string[];     // Positive aspects
  summary: string;         // Brief overall assessment
}

/**
 * Result of diff quality evaluation
 */
export interface DiffQualityResult {
  score: number;              // Overall score 1-10
  scopeCorrect: boolean;      // Only intended files changed?
  positionCorrect: boolean;   // Changes in correct document locations?
  structurePreserved: boolean; // Document structure maintained?
  headingMapCorrect: boolean; // Heading-map properly updated?
  issues: string[];           // Issues found
  summary: string;            // Brief overall assessment
  scopeDetails: string;       // Explanation of scope check
  positionDetails: string;    // Explanation of position check
  structureDetails: string;   // Explanation of structure check
}

/**
 * Overall review result for a PR
 */
export interface ReviewResult {
  prNumber: number;
  timestamp: string;
  translationQuality: TranslationQualityResult;
  diffQuality: DiffQualityResult;
  overallScore: number;
  verdict: 'PASS' | 'WARN' | 'FAIL';
  reviewComment: string;
}

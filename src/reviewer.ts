/**
 * Translation Reviewer for GitHub Action Review Mode
 * 
 * Provides AI-powered quality assessment of translation PRs.
 * Adapted from tool-test-action-on-github/evaluate/src/evaluator.ts
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import Anthropic from '@anthropic-ai/sdk';
import {
  ReviewInputs,
  TranslationQualityResult,
  DiffQualityResult,
  ReviewResult,
  ChangedSection,
  FileChange,
} from './types.js';

// Default model for review (can be overridden)
const DEFAULT_REVIEW_MODEL = 'claude-sonnet-4-6';

/**
 * Extract preamble (content before first heading) from a markdown document
 */
function extractPreamble(content: string): string {
  const lines = content.split('\n');
  const preambleLines: string[] = [];
  
  for (const line of lines) {
    if (line.match(/^#{1,6}\s+/)) {
      break;
    }
    preambleLines.push(line);
  }
  
  return preambleLines.join('\n').trim();
}

/**
 * Extract sections from a markdown document
 * Returns an array of {heading, content} in document order
 */
function extractSections(content: string): Array<{ heading: string; content: string }> {
  const sections: Array<{ heading: string; content: string }> = [];
  const lines = content.split('\n');
  
  let currentHeading = '';
  let currentContent: string[] = [];
  let inSection = false;
  
  for (const line of lines) {
    const headingMatch = line.match(/^(#{2,6})\s+(.+)$/);
    if (headingMatch) {
      // Save previous section
      if (inSection && currentHeading) {
        sections.push({
          heading: currentHeading,
          content: currentContent.join('\n').trim(),
        });
      }
      currentHeading = line;
      currentContent = [];
      inSection = true;
    } else if (inSection) {
      currentContent.push(line);
    }
  }
  
  // Save last section
  if (inSection && currentHeading) {
    sections.push({
      heading: currentHeading,
      content: currentContent.join('\n').trim(),
    });
  }
  
  return sections;
}

/**
 * Generate a simple ID from heading text for matching.
 * Uses Unicode-aware matching to preserve non-Latin scripts.
 */
function headingToId(heading: string): string {
  return heading
    .replace(/^#{2,6}\s+/, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Identify changed sections by comparing before and after content
 */
export function identifyChangedSections(
  sourceBefore: string,
  sourceAfter: string,
  targetBefore: string,
  targetAfter: string
): ChangedSection[] {
  const changedSections: ChangedSection[] = [];
  
  // Handle empty documents
  if (!sourceAfter && !targetAfter) {
    return [{ heading: '(document deleted)', changeType: 'deleted' }];
  }
  
  if (!sourceBefore && !targetBefore) {
    const sections = extractSections(sourceAfter);
    if (sections.length === 0) {
      return [{ heading: '(new document)', changeType: 'added', englishContent: sourceAfter }];
    }
    return sections.map(s => ({
      heading: s.heading,
      changeType: 'added' as const,
      englishContent: s.content,
    }));
  }
  
  // Check for pure rename (no content changes)
  const normalizeForComparison = (s: string) => s.replace(/\r\n/g, '\n').trim();
  if (normalizeForComparison(sourceBefore) === normalizeForComparison(sourceAfter) &&
      normalizeForComparison(targetBefore) === normalizeForComparison(targetAfter)) {
    return [{ heading: '(no content changes - file renamed)', changeType: 'modified' as const }];
  }
  
  // Check preamble changes
  const sourcePreambleBefore = extractPreamble(sourceBefore);
  const sourcePreambleAfter = extractPreamble(sourceAfter);
  const targetPreambleBefore = extractPreamble(targetBefore);
  const targetPreambleAfter = extractPreamble(targetAfter);
  
  if (sourcePreambleBefore !== sourcePreambleAfter || targetPreambleBefore !== targetPreambleAfter) {
    changedSections.push({
      heading: '(preamble/frontmatter)',
      changeType: 'modified',
      englishContent: sourcePreambleAfter,
      translatedContent: targetPreambleAfter,
    });
  }
  
  // Extract sections
  const sourceBeforeSections = extractSections(sourceBefore);
  const sourceAfterSections = extractSections(sourceAfter);
  const targetAfterSections = extractSections(targetAfter);
  
  // Build maps for quick lookup by ID
  const beforeById = new Map(sourceBeforeSections.map(s => [headingToId(s.heading), s]));
  const afterById = new Map(sourceAfterSections.map(s => [headingToId(s.heading), s]));
  
  // Check for added and modified sections
  for (let i = 0; i < sourceAfterSections.length; i++) {
    const section = sourceAfterSections[i];
    const id = headingToId(section.heading);
    const beforeSection = beforeById.get(id);
    const targetSection = targetAfterSections[i];
    
    if (!beforeSection) {
      changedSections.push({
        heading: section.heading,
        changeType: 'added',
        englishContent: section.content,
        translatedContent: targetSection?.content,
      });
    } else if (beforeSection.content !== section.content || beforeSection.heading !== section.heading) {
      changedSections.push({
        heading: section.heading,
        changeType: 'modified',
        englishContent: section.content,
        translatedContent: targetSection?.content,
      });
    }
  }
  
  // Check for deleted sections
  for (const section of sourceBeforeSections) {
    const id = headingToId(section.heading);
    if (!afterById.has(id)) {
      changedSections.push({
        heading: section.heading,
        changeType: 'deleted',
      });
    }
  }
  
  return changedSections;
}

/**
 * Translation Reviewer class
 * Evaluates translation quality and posts review comments on PRs
 */
export class TranslationReviewer {
  private anthropic: Anthropic;
  private octokit: ReturnType<typeof github.getOctokit>;
  private model: string;
  private maxSuggestions: number;

  constructor(
    anthropicApiKey: string,
    githubToken: string,
    model: string = DEFAULT_REVIEW_MODEL,
    maxSuggestions: number = 5
  ) {
    this.anthropic = new Anthropic({ apiKey: anthropicApiKey });
    this.octokit = github.getOctokit(githubToken);
    this.model = model;
    this.maxSuggestions = maxSuggestions;
  }

  /**
   * Parse source PR number from translation PR body
   * Looks for: ### Source PR\n**[#123 - ...
   */
  private parseSourcePRNumber(prBody: string | null): number | null {
    if (!prBody) return null;
    
    // Match: ### Source PR\n**[#123
    const match = prBody.match(/### Source PR\n\*\*\[#(\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }
    return null;
  }

  /**
   * Get source PR diff (English before/after)
   */
  private async getSourceDiff(
    sourceOwner: string,
    sourceRepoName: string,
    sourcePrNumber: number,
    filenames: string[]
  ): Promise<{ before: Map<string, string>; after: Map<string, string> }> {
    const before = new Map<string, string>();
    const after = new Map<string, string>();

    try {
      // Get source PR details
      const { data: sourcePr } = await this.octokit.rest.pulls.get({
        owner: sourceOwner,
        repo: sourceRepoName,
        pull_number: sourcePrNumber,
      });

      // Get files changed in source PR
      const { data: sourceFiles } = await this.octokit.rest.pulls.listFiles({
        owner: sourceOwner,
        repo: sourceRepoName,
        pull_number: sourcePrNumber,
      });

      for (const filename of filenames) {
        // Check if this file was changed in source PR
        const sourceFile = sourceFiles.find(f => f.filename === filename);
        
        // For renamed files, use previous filename for "before"
        const beforeFilename = sourceFile?.status === 'renamed' && sourceFile.previous_filename
          ? sourceFile.previous_filename
          : filename;

        // Get content BEFORE (from base ref)
        if (!sourceFile || sourceFile.status !== 'added') {
          try {
            const { data: beforeData } = await this.octokit.rest.repos.getContent({
              owner: sourceOwner,
              repo: sourceRepoName,
              path: beforeFilename,
              ref: sourcePr.base.sha,
            });
            if ('content' in beforeData) {
              before.set(filename, Buffer.from(beforeData.content, 'base64').toString('utf-8'));
            }
          } catch {
            // File didn't exist before
          }
        }

        // Get content AFTER (from head ref)
        if (!sourceFile || sourceFile.status !== 'removed') {
          try {
            const { data: afterData } = await this.octokit.rest.repos.getContent({
              owner: sourceOwner,
              repo: sourceRepoName,
              path: filename,
              ref: sourcePr.head.sha,
            });
            if ('content' in afterData) {
              after.set(filename, Buffer.from(afterData.content, 'base64').toString('utf-8'));
            }
          } catch {
            // File doesn't exist after (deleted)
          }
        }
      }

      core.info(`✓ Fetched source PR #${sourcePrNumber} diff for ${filenames.length} file(s)`);
    } catch (error) {
      core.warning(`Could not fetch source PR #${sourcePrNumber}: ${error}`);
    }

    return { before, after };
  }

  /**
   * Review a translation PR
   */
  async reviewPR(
    prNumber: number,
    sourceRepo: string,
    targetOwner: string,
    targetRepo: string,
    docsFolder: string,
    glossaryTerms?: string,
    targetLanguage?: string
  ): Promise<ReviewResult> {
    core.info(`Starting review of PR #${prNumber}...`);

    // Get PR details
    const { data: pr } = await this.octokit.rest.pulls.get({
      owner: targetOwner,
      repo: targetRepo,
      pull_number: prNumber,
    });

    // Get changed files in the PR
    const { data: files } = await this.octokit.rest.pulls.listFiles({
      owner: targetOwner,
      repo: targetRepo,
      pull_number: prNumber,
    });

    // Filter for markdown files in docs folder
    const markdownFiles = files.filter(
      (f) => f.filename.startsWith(docsFolder) && f.filename.endsWith('.md')
    );

    if (markdownFiles.length === 0) {
      core.info('No markdown files to review');
      const emptyResult: ReviewResult = {
        prNumber,
        timestamp: new Date().toISOString(),
        translationQuality: {
          score: 10,
          accuracy: 10,
          fluency: 10,
          terminology: 10,
          formatting: 10,
          syntaxErrors: [],
          issues: [],
          strengths: ['No markdown files to review'],
          summary: 'No markdown files changed in this PR.',
        },
        diffQuality: {
          score: 10,
          scopeCorrect: true,
          positionCorrect: true,
          structurePreserved: true,
          headingMapCorrect: true,
          issues: [],
          summary: 'No changes to evaluate.',
          scopeDetails: 'No markdown files changed.',
          positionDetails: 'N/A',
          structureDetails: 'N/A',
        },
        overallScore: 10,
        verdict: 'PASS',
        reviewComment: 'No markdown files to review in this PR.',
      };
      return emptyResult;
    }

    // Get content for evaluation
    const [sourceOwner, sourceRepoName] = sourceRepo.split('/');
    
    // Parse source PR number from translation PR body
    // Format: "### Source PR\n**[#123 - Title](url)**"
    // This is always present for PRs created by sync mode
    const sourcePrNumber = this.parseSourcePRNumber(pr.body);
    if (!sourcePrNumber) {
      throw new Error(
        'Could not find source PR reference in translation PR body. ' +
        'This PR may not have been created by the translation action. ' +
        'Expected format: "### Source PR\\n**[#123..."'
      );
    }
    core.info(`Found source PR reference: #${sourcePrNumber}`);

    // Get filenames for fetching
    const filenames = markdownFiles.map(f => f.filename);

    // Fetch source PR diff (English before/after) - this gives us accurate change detection
    const { before: sourceBeforeMap, after: sourceAfterMap } = await this.getSourceDiff(
      sourceOwner, 
      sourceRepoName, 
      sourcePrNumber, 
      filenames
    );

    // Build content strings for evaluation
    let sourceEnglish = '';
    let targetTranslation = '';
    let sourceBefore = '';
    let targetBefore = '';
    const changedSections: ChangedSection[] = [];

    for (const file of markdownFiles) {
      try {
        // Get target (translation) content - after changes
        const { data: targetData } = await this.octokit.rest.repos.getContent({
          owner: targetOwner,
          repo: targetRepo,
          path: file.filename,
          ref: pr.head.sha,
        });

        if ('content' in targetData) {
          targetTranslation += Buffer.from(targetData.content, 'base64').toString('utf-8') + '\n\n';
        }

        // Get target content before changes (base branch)
        try {
          const { data: targetBeforeData } = await this.octokit.rest.repos.getContent({
            owner: targetOwner,
            repo: targetRepo,
            path: file.filename,
            ref: pr.base.sha,
          });
          if ('content' in targetBeforeData) {
            targetBefore += Buffer.from(targetBeforeData.content, 'base64').toString('utf-8') + '\n\n';
          }
        } catch {
          // File is new in target
        }

        // Get source (English) content from source PR diff
        if (sourceAfterMap.has(file.filename)) {
          sourceEnglish += sourceAfterMap.get(file.filename) + '\n\n';
        } else {
          core.warning(`Source content not found for ${file.filename} in source PR #${sourcePrNumber}`);
        }

        // Get source content before from source PR diff
        if (sourceBeforeMap.has(file.filename)) {
          sourceBefore += sourceBeforeMap.get(file.filename) + '\n\n';
        }
        // Note: sourceBefore may be empty for new files, which is correct

      } catch (error) {
        core.warning(`Error processing ${file.filename}: ${error}`);
      }
    }

    // Identify changed sections
    const detectedChanges = identifyChangedSections(
      sourceBefore,
      sourceEnglish,
      targetBefore,
      targetTranslation
    );
    changedSections.push(...detectedChanges);

    // Evaluate translation quality
    const translationQuality = await this.evaluateTranslation(
      sourceEnglish,
      targetTranslation,
      changedSections,
      glossaryTerms,
      targetLanguage
    );

    // Evaluate diff quality
    const diffQuality = await this.evaluateDiff(
      sourceBefore,
      sourceEnglish,
      targetBefore,
      targetTranslation,
      markdownFiles.map(f => ({
        filename: f.filename,
        status: f.status as 'added' | 'modified' | 'removed' | 'renamed',
        additions: f.additions,
        deletions: f.deletions,
      }))
    );

    // Calculate overall score and verdict
    const overallScore = (translationQuality.score * 0.7 + diffQuality.score * 0.3);
    let verdict: 'PASS' | 'WARN' | 'FAIL';
    if (overallScore >= 8 && translationQuality.syntaxErrors.length === 0) {
      verdict = 'PASS';
    } else if (overallScore >= 6) {
      verdict = 'WARN';
    } else {
      verdict = 'FAIL';
    }

    // Generate review comment
    const reviewComment = this.generateReviewComment(translationQuality, diffQuality, verdict);

    // Post review comment
    await this.postReviewComment(prNumber, targetOwner, targetRepo, reviewComment);

    const result: ReviewResult = {
      prNumber,
      timestamp: new Date().toISOString(),
      translationQuality,
      diffQuality,
      overallScore: Math.round(overallScore * 10) / 10,
      verdict,
      reviewComment,
    };

    return result;
  }

  /**
   * Evaluate translation quality using Claude
   */
  private async evaluateTranslation(
    sourceEnglish: string,
    targetTranslation: string,
    changedSections: ChangedSection[],
    glossaryTerms?: string,
    targetLanguage?: string
  ): Promise<TranslationQualityResult> {
    const changedSectionsPrompt = this.formatChangedSections(changedSections);
    
    // Determine language name for prompt
    const languageNames: Record<string, string> = {
      'zh-cn': 'Simplified Chinese',
      'zh-tw': 'Traditional Chinese',
      'fa': 'Persian (Farsi)',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'ja': 'Japanese',
      'ko': 'Korean',
    };
    const targetLangName = targetLanguage ? (languageNames[targetLanguage] || targetLanguage) : 'the target language';
    
    const glossarySection = glossaryTerms 
      ? `\n## Reference Glossary\nThe translation should follow this established terminology glossary:\n${glossaryTerms}\n`
      : '';

    const prompt = `You are a professional translator and quality evaluator specializing in technical/academic content translation from English to ${targetLangName}.

## Task
Evaluate the quality of the ${targetLangName} translation compared to the English source.
${changedSectionsPrompt}
## English Source Document
\`\`\`markdown
${sourceEnglish}
\`\`\`

## ${targetLangName} Translation
\`\`\`markdown
${targetTranslation}
\`\`\`
${glossarySection}
## IMPORTANT: About the Heading-Map

The ${targetLangName} translation contains a \`heading-map\` section in the YAML frontmatter that is NOT present in the English source. This is CORRECT and EXPECTED behavior:

\`\`\`yaml
heading-map:
  introduction: "介绍"
  background: "背景"
\`\`\`

This is a feature of the translation sync system that maps English heading IDs to ${targetLangName} headings for section matching across languages. Do NOT flag this as an issue or formatting problem - it is intentional and does not affect Jupyter Book compilation.

**Note on double-colon notation**: The heading-map may use \`section::subsection\` notation (e.g., \`supply-and-demand::market-dynamics\`) to represent hierarchical headings. This double-colon \`::\` syntax is intentional and valid - it represents the relationship between a section and its nested subsection. This is safe in YAML because YAML only treats \`:\` as a key-value separator when followed by a space.

## Evaluation Criteria
Rate each criterion from 1-10:

1. **Accuracy** (1-10): Does the translation accurately convey the meaning of the English source?
   - Technical terms translated correctly
   - No missing or added information
   - Mathematical concepts preserved

2. **Fluency** (1-10): Does the translation read naturally in ${targetLangName}?
   - Natural sentence structure
   - Appropriate academic register
   - No awkward phrasing

3. **Terminology** (1-10): Is technical terminology consistent and correct?
   - Does the translation follow the reference glossary above?
   - Domain-specific terms handled appropriately
   - Consistent translation of repeated terms
   - Proper use of established ${targetLangName} terminology

4. **Formatting** (1-10): Is MyST/Markdown formatting preserved?
   - Math equations (LaTeX) intact
   - Code blocks preserved
   - Headings, lists, and structure maintained
   - Links and references correct

5. **Syntax** (check for errors): Check for markdown/MyST syntax errors in the translation:
   - Headings MUST have a space after # (e.g., "## Title" not "##Title")
   - Code blocks must have matching \`\`\` delimiters
   - Math blocks must have matching $$ delimiters
   - MyST directives must use correct syntax: \`\`\`{directive}
   - Report any syntax errors found - these are CRITICAL issues that must be fixed

## Response Format
Respond with ONLY valid JSON in this exact format (no markdown code blocks):
{
  "accuracy": <number 1-10>,
  "fluency": <number 1-10>,
  "terminology": <number 1-10>,
  "formatting": <number 1-10>,
  "syntaxErrors": ["error 1 with line/location if possible", "error 2"],
  "issues": ["Issue 1: description with location and suggestion", "Issue 2: description"],
  "strengths": ["strength 1", "strength 2"],
  "summary": "Brief overall assessment"
}

Note: "syntaxErrors" should be an empty array [] if no markdown syntax errors are found. Syntax errors are CRITICAL and should always be reported even if the array would otherwise be empty.

## Suggestions Guidelines
- The "issues" array can contain **0 to ${this.maxSuggestions} string suggestions**
- Each issue should be a PLAIN STRING (not an object), formatted as: "Location: original text → suggestion"
- Only include actual issues found - an empty array [] is perfectly valid for excellent translations
- Each suggestion should be specific and actionable
- Prioritize by importance: accuracy issues first, then fluency, terminology, formatting
- Do NOT invent issues just to fill the array - quality over quantity

**CRITICAL**: The "issues" array MUST contain suggestions that relate ONLY to the sections that were changed in this PR. Do not suggest improvements for unchanged parts of the document.`;

    const stream = this.anthropic.messages.stream({
      model: this.model,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });
    const response = await stream.finalMessage();

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    try {
      let jsonStr = content.text;
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }

      const result = JSON.parse(jsonStr);
      const score = (
        result.accuracy * 0.35 +
        result.fluency * 0.25 +
        result.terminology * 0.25 +
        result.formatting * 0.15
      );

      return {
        score: Math.round(score * 10) / 10,
        accuracy: result.accuracy,
        fluency: result.fluency,
        terminology: result.terminology,
        formatting: result.formatting,
        syntaxErrors: result.syntaxErrors || [],
        issues: this.normalizeIssues(result.issues || []),
        strengths: result.strengths || [],
        summary: result.summary || '',
      };
    } catch (error) {
      core.error(`Failed to parse evaluation response: ${content.text}`);
      throw new Error('Failed to parse translation quality evaluation');
    }
  }

  /**
   * Evaluate diff quality using Claude
   */
  private async evaluateDiff(
    sourceBefore: string,
    sourceAfter: string,
    targetBefore: string,
    targetAfter: string,
    targetFiles: FileChange[]
  ): Promise<DiffQualityResult> {
    const prompt = `You are an expert code reviewer specializing in translation sync workflows. Your task is to verify that translation changes are correctly positioned in the target document.

## Context
A translation sync action detected changes in an English source document and created corresponding changes in the target document. We need to verify:

1. **Scope**: Only the correct files were modified
2. **Position**: Changes appear in the same relative positions
3. **Structure**: Document structure is preserved
4. **Heading-map**: The heading-map in frontmatter is correctly updated

## IMPORTANT: About the Heading-Map System

The \`heading-map\` in the frontmatter is a CRITICAL feature of this translation system, NOT a bug. Here's how it works:

- English headings generate IDs from English text: \`## Introduction\` → ID: \`introduction\`
- Translated headings generate IDs from translated text: \`## 介绍\` → ID: \`介绍\`
- The heading-map bridges this gap by mapping English IDs to translated headings

Example:
\`\`\`yaml
heading-map:
  introduction: "介绍"
  supply-and-demand: "供需分析"
\`\`\`

**Note on double-colon notation**: The heading-map may use \`section::subsection\` notation to represent hierarchical headings. This is intentional and valid YAML.

## Source Document (English)
### Before:
\`\`\`markdown
${sourceBefore}
\`\`\`

### After:
\`\`\`markdown
${sourceAfter}
\`\`\`

## Target Document (Translation)
### Before:
\`\`\`markdown
${targetBefore}
\`\`\`

### After:
\`\`\`markdown
${targetAfter}
\`\`\`

### Files Changed:
${targetFiles.map(f => `- ${f.filename}: ${f.status} (+${f.additions}/-${f.deletions})`).join('\n')}

## Verification Checks
Evaluate each criterion:

1. **Scope Correct**: Were only the necessary files modified? The target should change the same files as the source.
2. **Position Correct**: Do changes appear in the same sections as source? Section order should match.
3. **Structure Preserved**: Is the document structure (heading levels, nesting) maintained?
4. **Heading-map Correct**: Is the heading-map updated with new/changed headings?

## Response Format
Respond with ONLY valid JSON:
{
  "scopeCorrect": true/false,
  "positionCorrect": true/false,
  "structurePreserved": true/false,
  "headingMapCorrect": true/false,
  "issues": ["issue 1 if any"],
  "summary": "One sentence overall summary",
  "scopeDetails": "Brief explanation of scope check",
  "positionDetails": "Brief explanation of position check",
  "structureDetails": "Brief explanation of structure check"
}`;

    const stream = this.anthropic.messages.stream({
      model: this.model,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });
    const response = await stream.finalMessage();

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    try {
      let jsonStr = content.text;
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }

      const result = JSON.parse(jsonStr);
      const checks = [
        result.scopeCorrect,
        result.positionCorrect,
        result.structurePreserved,
        result.headingMapCorrect,
      ];
      const passedChecks = checks.filter(Boolean).length;
      const score = (passedChecks / checks.length) * 10;

      return {
        score: Math.round(score * 10) / 10,
        scopeCorrect: result.scopeCorrect,
        positionCorrect: result.positionCorrect,
        structurePreserved: result.structurePreserved,
        headingMapCorrect: result.headingMapCorrect,
        issues: result.issues || [],
        summary: result.summary || '',
        scopeDetails: result.scopeDetails || '',
        positionDetails: result.positionDetails || '',
        structureDetails: result.structureDetails || '',
      };
    } catch (error) {
      core.error(`Failed to parse diff evaluation response: ${content.text}`);
      throw new Error('Failed to parse diff quality evaluation');
    }
  }

  /**
   * Format changed sections for the prompt
   */
  private formatChangedSections(changedSections: ChangedSection[]): string {
    if (changedSections.length === 0) {
      return '';
    }

    const sectionsList = changedSections.map(s => {
      if (s.changeType === 'deleted') {
        return `- **DELETED**: ${s.heading}`;
      }
      return `- **${s.changeType.toUpperCase()}**: ${s.heading}`;
    }).join('\n');

    return `\n## IMPORTANT: Changed Sections in This PR

The following sections were actually modified in this PR. **Your suggestions MUST focus ONLY on these changed sections**. Do NOT suggest improvements for unchanged parts of the document.

${sectionsList}

**Rule**: Any suggestions you make must be about the translation quality of the changed sections listed above. Ignore any issues in other parts of the document - those can be addressed in a separate comprehensive review.
`;
  }

  /**
   * Normalize issues to strings
   */
  private normalizeIssues(issues: unknown[]): string[] {
    if (!Array.isArray(issues)) return [];
    return issues.map(issue => {
      if (typeof issue === 'string') return issue;
      if (typeof issue === 'object' && issue !== null) {
        const obj = issue as Record<string, unknown>;
        const location = obj.location || obj.section || obj.heading || '';
        const original = obj.original || obj.current || obj.translated || obj.text || '';
        const suggestion = obj.suggestion || obj.recommended || obj.fix || obj.correction || '';
        const description = obj.description || obj.issue || obj.problem || obj.message || '';
        
        if (description) {
          return location ? `${location}: ${description}` : String(description);
        }
        if (original && suggestion) {
          return location 
            ? `${location}: "${original}" → "${suggestion}"`
            : `"${original}" → "${suggestion}"`;
        }
        return JSON.stringify(obj);
      }
      return String(issue);
    }).filter(s => s && s !== '{}' && s !== '""');
  }

  /**
   * Generate review comment
   */
  private generateReviewComment(
    translationResult: TranslationQualityResult,
    diffResult: DiffQualityResult,
    verdict: 'PASS' | 'WARN' | 'FAIL'
  ): string {
    const emoji = verdict === 'PASS' ? '✅' : verdict === 'WARN' ? '⚠️' : '❌';
    
    let comment = `## ${emoji} Translation Quality Review

**Verdict**: ${verdict} | **Model**: ${this.model} | **Date**: ${new Date().toISOString().split('T')[0]}

---

### 📝 Translation Quality

| Criterion | Score |
|-----------|-------|
| Accuracy | ${translationResult.accuracy}/10 |
| Fluency | ${translationResult.fluency}/10 |
| Terminology | ${translationResult.terminology}/10 |
| Formatting | ${translationResult.formatting}/10 |
| **Overall** | **${translationResult.score}/10** |

**Summary**: ${translationResult.summary}`;

    if (translationResult.strengths.length > 0) {
      comment += ` ${translationResult.strengths.join(' ')}`;
    }

    if (translationResult.syntaxErrors && translationResult.syntaxErrors.length > 0) {
      comment += `

### ⚠️ Markdown Syntax Errors (CRITICAL)
${translationResult.syntaxErrors.map(e => `- 🔴 ${e}`).join('\n')}`;
    }

    if (translationResult.issues.length > 0) {
      comment += `

**Suggestions**:
${translationResult.issues.map(i => `- ${i}`).join('\n')}`;
    }

    comment += `

---

### 🔍 Diff Quality

| Check | Status |
|-------|--------|
| Scope Correct | ${diffResult.scopeCorrect ? '✅' : '❌'} |
| Position Correct | ${diffResult.positionCorrect ? '✅' : '❌'} |
| Structure Preserved | ${diffResult.structurePreserved ? '✅' : '❌'} |
| Heading-map Correct | ${diffResult.headingMapCorrect ? '✅' : '❌'} |
| **Overall** | **${diffResult.score}/10** |

**Summary**: ${diffResult.summary}`;

    if (diffResult.issues.length > 0) {
      comment += `

**Issues**:
${diffResult.issues.map(i => `- ${i}`).join('\n')}`;
    }

    comment += `

---
*This review was generated automatically by [action-translation](https://github.com/quantecon/action-translation) review mode.*`;

    return comment;
  }

  /**
   * Post review comment on PR
   */
  private async postReviewComment(
    prNumber: number,
    owner: string,
    repo: string,
    comment: string
  ): Promise<void> {
    try {
      // Check for existing review comment and update it instead of creating new
      const { data: comments } = await this.octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number: prNumber,
      });

      const existingComment = comments.find(c => 
        c.body?.includes('Translation Quality Review') &&
        c.body?.includes('action-translation')
      );

      if (existingComment) {
        await this.octokit.rest.issues.updateComment({
          owner,
          repo,
          comment_id: existingComment.id,
          body: comment,
        });
        core.info(`Updated existing review comment on PR #${prNumber}`);
      } else {
        await this.octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: prNumber,
          body: comment,
        });
        core.info(`Posted review comment on PR #${prNumber}`);
      }
    } catch (error) {
      core.error(`Failed to post review comment: ${error}`);
      throw error;
    }
  }
}

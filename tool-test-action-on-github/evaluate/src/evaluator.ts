/**
 * Translation Quality Evaluator using Claude Opus 4.5
 * 
 * Uses Opus for evaluation to ensure highest quality assessment,
 * regardless of which model was used for the actual translation.
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { 
  TranslationQualityResult, 
  DiffQualityResult,
  FileDiff,
  ChangedSection 
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The grading model, configurable via constructor / --model.
// Keep this at the current best Opus: it judges translation quality, so a stronger
// reviewer gives a better absolute read. When reproducing or comparing against an
// existing report, pass that report's recorded evaluator explicitly instead.
export const DEFAULT_EVALUATOR_MODEL = 'claude-opus-4-8';

// Load glossary
interface GlossaryTerm {
  en: string;
  'zh-cn': string;
  context?: string;
}

interface Glossary {
  version: string;
  description: string;
  terms: GlossaryTerm[];
}

function loadGlossary(): string {
  try {
    const glossaryPath = path.resolve(__dirname, '../../../glossary/zh-cn.json');
    const glossaryData = JSON.parse(fs.readFileSync(glossaryPath, 'utf-8')) as Glossary;
    
    // Format all glossary terms for prompt
    const termList = glossaryData.terms
      .map(t => `- "${t.en}" → "${t['zh-cn']}"${t.context ? ` (${t.context})` : ''}`)
      .join('\n');
    
    return `\n## Reference Glossary (${glossaryData.terms.length} terms)
The translation should follow this established terminology glossary:
${termList}\n`;
  } catch (error) {
    console.warn('Could not load glossary:', error);
    return '';
  }
}

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
 * Generate a simple ID from heading text for matching
 */
function headingToId(heading: string): string {
  // Remove ## prefix, lowercase, replace spaces with dashes
  return heading
    .replace(/^#{2,6}\s+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Identify changed sections by comparing before and after content
 * Handles: preamble changes, section additions, modifications, deletions, reordering
 */
export function identifyChangedSections(
  sourceBefore: string,
  sourceAfter: string,
  targetBefore: string,
  targetAfter: string
): ChangedSection[] {
  const changedSections: ChangedSection[] = [];
  
  // Handle empty documents (new or deleted files)
  if (!sourceAfter && !targetAfter) {
    // Both deleted - nothing to evaluate
    return [{ heading: '(document deleted)', changeType: 'deleted' }];
  }
  
  if (!sourceBefore && !targetBefore) {
    // New document - mark all sections as added
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
  
  // Check for pure rename (no content changes) - normalize whitespace for comparison
  const normalizeForComparison = (s: string) => s.replace(/\r\n/g, '\n').trim();
  if (normalizeForComparison(sourceBefore) === normalizeForComparison(sourceAfter) &&
      normalizeForComparison(targetBefore) === normalizeForComparison(targetAfter)) {
    // No content changes - this is likely a pure file rename
    return [{ heading: '(no content changes - file renamed)', changeType: 'modified' as const }];
  }
  
  // Check preamble changes (frontmatter, etc.)
  const sourcePreambleBefore = extractPreamble(sourceBefore);
  const sourcePreambleAfter = extractPreamble(sourceAfter);
  const targetPreambleBefore = extractPreamble(targetBefore);
  const targetPreambleAfter = extractPreamble(targetAfter);
  
  if (sourcePreambleBefore !== sourcePreambleAfter || targetPreambleBefore !== targetPreambleAfter) {
    changedSections.push({
      heading: '(preamble/frontmatter)',
      changeType: 'modified',
      englishContent: sourcePreambleAfter,
      chineseContent: targetPreambleAfter,
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
    
    // Find corresponding Chinese section by position
    const targetSection = targetAfterSections[i];
    
    if (!beforeSection) {
      // New section added
      changedSections.push({
        heading: section.heading,
        changeType: 'added',
        englishContent: section.content,
        chineseContent: targetSection?.content,
      });
    } else if (beforeSection.content !== section.content || beforeSection.heading !== section.heading) {
      // Section modified (content or heading changed)
      changedSections.push({
        heading: section.heading,
        changeType: 'modified',
        englishContent: section.content,
        chineseContent: targetSection?.content,
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
  
  // If no section changes detected, check if target-only changes occurred
  // This handles cases where only the translation was updated without English changes
  if (changedSections.length === 0) {
    const targetBeforeSections = extractSections(targetBefore);
    
    for (let i = 0; i < targetAfterSections.length; i++) {
      const targetSection = targetAfterSections[i];
      const targetBefore = targetBeforeSections[i];
      const sourceSection = sourceAfterSections[i];
      
      if (!targetBefore || targetBefore.content !== targetSection.content) {
        changedSections.push({
          heading: sourceSection?.heading || targetSection.heading,
          changeType: targetBefore ? 'modified' : 'added',
          englishContent: sourceSection?.content,
          chineseContent: targetSection.content,
        });
      }
    }
  }
  
  return changedSections;
}

// Default configuration
const DEFAULT_MAX_SUGGESTIONS = 5;

export class TranslationEvaluator {
  private client: Anthropic;
  private glossarySection: string;
  private maxSuggestions: number;
  private model: string;

  constructor(
    apiKey: string, 
    maxSuggestions: number = DEFAULT_MAX_SUGGESTIONS,
    model: string = DEFAULT_EVALUATOR_MODEL
  ) {
    this.client = new Anthropic({ apiKey });
    this.glossarySection = loadGlossary();
    this.maxSuggestions = maxSuggestions;
    this.model = model;
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
   * Evaluate translation quality
   */
  async evaluateTranslation(
    sourceEnglish: string,
    targetChinese: string,
    changedSections: ChangedSection[] = []
  ): Promise<TranslationQualityResult> {
    const changedSectionsPrompt = this.formatChangedSections(changedSections);
    
    const prompt = `You are a professional translator and quality evaluator specializing in technical/academic content translation from English to Simplified Chinese.

## Task
Evaluate the quality of the Chinese translation compared to the English source.
${changedSectionsPrompt}
## English Source Document
\`\`\`markdown
${sourceEnglish}
\`\`\`

## Chinese Translation
\`\`\`markdown
${targetChinese}
\`\`\`
${this.glossarySection}
## IMPORTANT: About the Heading-Map

The Chinese translation contains a \`heading-map\` section in the YAML frontmatter that is NOT present in the English source. This is CORRECT and EXPECTED behavior:

\`\`\`yaml
heading-map:
  introduction: "介绍"
  background: "背景"
\`\`\`

This is a feature of the translation sync system that maps English heading IDs to Chinese headings for section matching across languages. Do NOT flag this as an issue or formatting problem - it is intentional and does not affect Jupyter Book compilation.

**Note on double-colon notation**: The heading-map may use \`section::subsection\` notation (e.g., \`supply-and-demand::market-dynamics\`) to represent hierarchical headings. This double-colon \`::\` syntax is intentional and valid - it represents the relationship between a section and its nested subsection. This is safe in YAML because YAML only treats \`:\` as a key-value separator when followed by a space.

## Evaluation Criteria
Rate each criterion from 1-10:

1. **Accuracy** (1-10): Does the translation accurately convey the meaning of the English source?
   - Technical terms translated correctly
   - No missing or added information
   - Mathematical concepts preserved

2. **Fluency** (1-10): Does the translation read naturally in Chinese?
   - Natural sentence structure
   - Appropriate academic register
   - No awkward phrasing

3. **Terminology** (1-10): Is technical terminology consistent and correct?
   - Does the translation follow the reference glossary above?
   - Domain-specific terms handled appropriately
   - Consistent translation of repeated terms
   - Proper use of established Chinese terminology

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

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    try {
      // Extract JSON from response (handle potential markdown code blocks)
      let jsonStr = content.text;
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }

      const result = JSON.parse(jsonStr);
      
      // Calculate overall score
      const score = (
        result.accuracy * 0.35 +
        result.fluency * 0.25 +
        result.terminology * 0.25 +
        result.formatting * 0.15
      );

      // Normalize issues to strings (Claude sometimes returns objects)
      const normalizeIssues = (issues: unknown[]): string[] => {
        if (!Array.isArray(issues)) return [];
        return issues.map(issue => {
          if (typeof issue === 'string') return issue;
          if (typeof issue === 'object' && issue !== null) {
            // Convert object to readable string
            const obj = issue as Record<string, unknown>;
            
            // Try common patterns Claude might return
            // Pattern 1: { location, original/current, suggestion }
            const location = obj.location || obj.section || obj.heading || '';
            const original = obj.original || obj.current || obj.translated || obj.text || '';
            const suggestion = obj.suggestion || obj.recommended || obj.fix || obj.correction || '';
            const description = obj.description || obj.issue || obj.problem || obj.message || '';
            
            // If we have description, use that
            if (description) {
              return location ? `${location}: ${description}` : String(description);
            }
            
            // If we have original and suggestion, format as replacement
            if (original && suggestion) {
              return location 
                ? `${location}: "${original}" → "${suggestion}"`
                : `"${original}" → "${suggestion}"`;
            }
            
            // Fall back to JSON.stringify for unknown structures
            return JSON.stringify(obj);
          }
          return String(issue);
        }).filter(s => s && s !== '{}' && s !== '""'); // Filter out empty results
      };

      return {
        score: Math.round(score * 10) / 10,
        accuracy: result.accuracy,
        fluency: result.fluency,
        terminology: result.terminology,
        formatting: result.formatting,
        syntaxErrors: result.syntaxErrors || [],
        issues: normalizeIssues(result.issues || []),
        strengths: result.strengths || [],
        summary: result.summary || '',
      };
    } catch (error) {
      console.error('Failed to parse evaluation response:', content.text);
      throw new Error('Failed to parse translation quality evaluation');
    }
  }

  /**
   * Evaluate diff quality - are changes in correct locations?
   */
  async evaluateDiff(
    sourceBefore: string,
    sourceAfter: string,
    targetBefore: string,
    targetAfter: string,
    sourceFiles: FileDiff[],
    targetFiles: FileDiff[]
  ): Promise<DiffQualityResult> {
    const prompt = `You are an expert code reviewer specializing in translation sync workflows. Your task is to verify that translation changes are correctly positioned in the target document.

## Context
A translation sync action detected changes in an English source document and created corresponding changes in the Chinese target document. We need to verify:

1. **Scope**: Only the correct files were modified
2. **Position**: Changes appear in the same relative positions
3. **Structure**: Document structure is preserved
4. **Heading-map**: The heading-map in frontmatter is correctly updated

## IMPORTANT: About the Heading-Map System

The \`heading-map\` in the frontmatter is a CRITICAL feature of this translation system, NOT a bug. Here's how it works:

- English headings generate IDs from English text: \`## Introduction\` → ID: \`introduction\`
- Chinese headings generate IDs from Chinese text: \`## 介绍\` → ID: \`介绍\`
- The \`heading-map\` bridges this gap by mapping English IDs to Chinese headings

**Expected behavior**:
- When a section is added/modified, its heading-map entry should be added/updated
- When a section is deleted, its heading-map entry may be removed
- The heading-map should always contain entries for ALL sections in the document
- Hierarchical headings use double-colon \`::\` notation: \`section::subsection\` (e.g., \`supply-and-demand::market-dynamics\`). This is valid YAML syntax.

This is CORRECT and EXPECTED - do NOT flag heading-map changes as issues unless they are actually wrong (e.g., wrong mapping, missing entries for existing sections).

## Source Document Changes

### Before (English):
\`\`\`markdown
${sourceBefore.slice(0, 4000)}${sourceBefore.length > 4000 ? '\n... (truncated)' : ''}
\`\`\`

### After (English):
\`\`\`markdown
${sourceAfter.slice(0, 4000)}${sourceAfter.length > 4000 ? '\n... (truncated)' : ''}
\`\`\`

### Source Files Changed:
${sourceFiles.map(f => `- ${f.filename}: ${f.status} (+${f.additions}/-${f.deletions})`).join('\n')}

## Target Document Changes

### Before (Chinese):
\`\`\`markdown
${targetBefore.slice(0, 4000)}${targetBefore.length > 4000 ? '\n... (truncated)' : ''}
\`\`\`

### After (Chinese):
\`\`\`markdown
${targetAfter.slice(0, 4000)}${targetAfter.length > 4000 ? '\n... (truncated)' : ''}
\`\`\`

### Target Files Changed:
${targetFiles.map(f => `- ${f.filename}: ${f.status} (+${f.additions}/-${f.deletions})`).join('\n')}

## Verification Checklist
1. **Scope Correct**: Were only the necessary files modified in target?
2. **Position Correct**: Do changes appear in the same sections/locations as source?
3. **Structure Preserved**: Is the document structure (headings, sections) maintained?
4. **Heading-map Correct**: Is the heading-map updated appropriately?

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

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

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
      
      // Calculate score based on checks
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
      console.error('Failed to parse diff evaluation response:', content.text);
      throw new Error('Failed to parse diff quality evaluation');
    }
  }

  /**
   * Generate a PR review comment
   */
  generateReviewComment(
    translationResult: TranslationQualityResult,
    diffResult: DiffQualityResult,
    verdict: 'PASS' | 'WARN' | 'FAIL'
  ): string {
    const emoji = verdict === 'PASS' ? '✅' : verdict === 'WARN' ? '⚠️' : '❌';
    
    let comment = `## ${emoji} Translation Quality Evaluation

**Verdict**: ${verdict} | **Evaluated by**: Claude Opus 4.5 | **Date**: ${new Date().toISOString().split('T')[0]}

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

    // Syntax errors are CRITICAL - show them prominently
    if (translationResult.syntaxErrors && translationResult.syntaxErrors.length > 0) {
      comment += `

### ⚠️ Markdown Syntax Errors (CRITICAL)
The following syntax errors were detected and should be fixed:
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

**Summary**: ${diffResult.summary}

**Scope**: ${diffResult.scopeDetails}

**Position**: ${diffResult.positionDetails}

**Structure**: ${diffResult.structureDetails}`;

    if (diffResult.issues.length > 0) {
      comment += `

**Suggestions**:
${diffResult.issues.map(i => `- ${i}`).join('\n')}`;
    }

    return comment;
  }
}

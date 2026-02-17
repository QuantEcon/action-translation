/**
 * Section-Based File Processor
 * 
 * Orchestrates the translation process for a single file using section-based approach.
 * 
 * Key operations:
 * 1. Detect section-level changes between old and new English documents
 * 2. Match sections to target document (by position)
 * 3. Translate changed sections (update mode for modified, new mode for added)
 * 4. Reconstruct target document with translated sections
 * 
 * This is much simpler than the old block-based approach!
 */

import { MystParser } from './parser';
import { DiffDetector } from './diff-detector';
import { TranslationService } from './translator';
import { Section, Glossary } from './types';
import * as core from '@actions/core';
import { 
  extractHeadingMap, 
  updateHeadingMap, 
  lookupTargetHeading,
  injectHeadingMap,
  HeadingMap
} from './heading-map';

export class FileProcessor {
  private parser: MystParser;
  private diffDetector: DiffDetector;
  private translator: TranslationService;
  private debug: boolean;

  constructor(translationService: TranslationService, debug: boolean = false) {
    this.parser = new MystParser();
    this.diffDetector = new DiffDetector(debug);
    this.translator = translationService;
    this.debug = debug;
  }

  private log(message: string): void {
    if (this.debug) {
      core.info(`[FileProcessor] ${message}`);
    }
  }

  /**
   * Process a file using component-based approach
   * Always reconstructs complete document: CONFIG + TITLE + INTRO + SECTIONS
   * This ensures no components get lost during translation updates
   */
  async processSectionBased(
    oldContent: string,
    newContent: string,
    targetContent: string,
    filepath: string,
    sourceLanguage: string,
    targetLanguage: string,
    glossary?: Glossary
  ): Promise<string> {
    this.log(`Processing file using component-based approach: ${filepath}`);

    // 1. Parse all documents into components
    const oldSource = await this.parser.parseDocumentComponents(oldContent, filepath);
    const newSource = await this.parser.parseDocumentComponents(newContent, filepath);
    const target = await this.parser.parseDocumentComponents(targetContent, filepath);
    
    this.log(`Old source: ${oldSource.sections.length} sections`);
    this.log(`New source: ${newSource.sections.length} sections`);
    this.log(`Target: ${target.sections.length} sections`);

    // 2. Extract heading map from target document
    const headingMap = extractHeadingMap(targetContent);
    this.log(`Loaded heading map with ${headingMap.size} entries`);
    
    // 3. Process each component - translate if changed, copy if unchanged
    
    // CONFIG: Always use new source config (doesn't get translated)
    const resultConfig = newSource.config;
    
    // TITLE: Translate if changed, otherwise keep target
    let resultTitle = target.title;
    if (oldSource.title !== newSource.title) {
      this.log(`TITLE changed: "${oldSource.titleText}" -> "${newSource.titleText}"`);
      
      const result = await this.translator.translateSection({
        mode: 'update',
        sourceLanguage,
        targetLanguage,
        glossary,
        oldEnglish: oldSource.title,
        newEnglish: newSource.title,
        currentTranslation: target.title,
      });
      
      if (!result.success) {
        throw new Error(`Translation failed for title: ${result.error}`);
      }
      
      resultTitle = result.translatedSection || target.title;
      this.log(`Translated title to: "${resultTitle}"`);
    } else {
      this.log(`TITLE unchanged, keeping target: "${target.title}"`);
    }
    
    // INTRO: Translate if changed, otherwise keep target
    let resultIntro = target.intro;
    if (oldSource.intro !== newSource.intro) {
      this.log(`INTRO changed (${oldSource.intro.length} -> ${newSource.intro.length} chars)`);
      
      const result = await this.translator.translateSection({
        mode: 'update',
        sourceLanguage,
        targetLanguage,
        glossary,
        oldEnglish: oldSource.intro,
        newEnglish: newSource.intro,
        currentTranslation: target.intro,
      });
      
      if (!result.success) {
        throw new Error(`Translation failed for intro: ${result.error}`);
      }
      
      resultIntro = result.translatedSection || target.intro;
      this.log(`Translated intro (${resultIntro.length} chars)`);
    } else {
      this.log(`INTRO unchanged, keeping target`);
    }
    
    // SECTIONS: Detect changes and process each section
    const changes = await this.diffDetector.detectSectionChanges(oldContent, newContent, filepath);
    this.log(`Detected ${changes.length} section-level changes`);
    
    const resultSections: Section[] = [];
    
    // Process each section from new source (ensures proper order)
    for (let i = 0; i < newSource.sections.length; i++) {
      const newSection = newSource.sections[i];
      
      // Find if this section has changes
      const change = changes.find(c => 
        c.newSection?.id === newSection.id
      );

      if (!change) {
        // Section unchanged - copy from target
        const targetSection = this.findTargetSectionByHeadingMap(
          newSection,
          target.sections,
          headingMap,
          i  // Position hint for fallback
        );
        
        if (targetSection) {
          resultSections.push(targetSection);
          this.log(`Keeping unchanged section: ${newSection.heading}`);
        } else {
          // If we can't find target section, treat as new
          this.log(`Warning: No target found for section: ${newSection.heading}, treating as new`);
          const translatedSection = await this.translateNewSection(
            newSection,
            sourceLanguage,
            targetLanguage,
            glossary
          );
          resultSections.push(translatedSection);
        }
        continue;
      }

      // Section has changes - translate based on change type
      if (change.type === 'added') {
        this.log(`Processing ADDED section: ${newSection.heading}`);
        const translatedSection = await this.translateNewSection(
          newSection,
          sourceLanguage,
          targetLanguage,
          glossary
        );
        resultSections.push(translatedSection);
        
      } else if (change.type === 'modified') {
        this.log(`Processing MODIFIED section: ${newSection.heading}`);
        
        // Find matching target section
        const targetSection = this.findTargetSectionByHeadingMap(
          change.oldSection!,
          target.sections,
          headingMap,
          i
        );
        
        if (!targetSection) {
          this.log(`Warning: Could not find target for modified section, treating as new`);
          const translatedSection = await this.translateNewSection(
            newSection,
            sourceLanguage,
            targetLanguage,
            glossary
          );
          resultSections.push(translatedSection);
          continue;
        }

        // Translate the update
        const oldFullContent = this.serializeSection(change.oldSection!);
        const newFullContent = this.serializeSection(newSection);
        const currentFullContent = this.serializeSection(targetSection);

        const result = await this.translator.translateSection({
          mode: 'update',
          sourceLanguage,
          targetLanguage,
          glossary,
          oldEnglish: oldFullContent,
          newEnglish: newFullContent,
          currentTranslation: currentFullContent,
        });

        if (!result.success) {
          throw new Error(`Translation failed for modified section: ${result.error}`);
        }

        // Parse subsections from translated content and strip them from content
        const { subsections, contentWithoutSubsections } = await this.parseTranslatedSubsections(
          result.translatedSection || '',
          newSection
        );

        // Extract heading from target section (Chinese) and body from translated content
        // This preserves the Chinese heading while using the new translated body
        let finalContent = contentWithoutSubsections || targetSection.content;
        if (contentWithoutSubsections) {
          const translatedLines = contentWithoutSubsections.split('\n');
          // Skip the first line (translated heading) and keep the rest
          const bodyLines = translatedLines.slice(1);
          // Combine target heading with translated body
          finalContent = `${targetSection.heading}\n${bodyLines.join('\n')}`;
        }

        // Determine final subsections based on what the translator returned
        // If translator returned the expected subsection structure (recursively), use them
        // Otherwise, preserve source structure with target translations where available
        let finalSubsections: Section[];
        const expectedSubsectionCount = newSection.subsections.length;
        const parsedSubsectionCount = subsections.length;
        
        // Helper to recursively validate subsection structure
        const validateSubsectionStructure = (expected: Section[], parsed: Section[]): boolean => {
          if (expected.length !== parsed.length) {
            return false;
          }
          for (let i = 0; i < expected.length; i++) {
            // Check if nested subsections match recursively
            if (!validateSubsectionStructure(expected[i].subsections, parsed[i].subsections)) {
              return false;
            }
          }
          return true;
        };
        
        // Helper to merge source subsections with target translations
        // Takes source structure (English) and applies target headings/content where they exist
        // Also checks heading-map for Chinese translations of subsections not in target array
        const mergeSubsectionsWithTargetTranslations = (
          sourceSubs: Section[],
          targetSubs: Section[],
          parentPath: string = ''
        ): Section[] => {
          return sourceSubs.map((sourceSub, i) => {
            const sourceHeading = sourceSub.heading.replace(/^#+\s+/, '');
            const targetSub = targetSubs[i];
            
            if (targetSub) {
              // Use target heading AND content (Chinese), but source structure
              const currentPath = parentPath 
                ? `${parentPath}::${sourceHeading}` 
                : sourceHeading;
              return {
                ...targetSub,  // Use target (Chinese heading + content)
                subsections: mergeSubsectionsWithTargetTranslations(
                  sourceSub.subsections,  // Source structure (may have more subsections)
                  targetSub.subsections,  // Target translations
                  currentPath             // Track path for heading-map lookup
                )
              };
            }
            
            // No target in array - check if it exists in heading-map
            const sourcePath = parentPath 
              ? `${parentPath}::${sourceHeading}` 
              : sourceHeading;
            const chineseHeading = headingMap.get(sourcePath);
            
            if (chineseHeading) {
              // Found in heading-map - use Chinese heading from map
              this.log(`Found Chinese heading in map for: ${sourcePath} → ${chineseHeading}`);
              return {
                ...sourceSub,
                heading: sourceSub.heading.replace(/^(#+\s+).*/, `$1${chineseHeading}`),
                subsections: mergeSubsectionsWithTargetTranslations(
                  sourceSub.subsections,
                  [],
                  sourcePath
                )
              };
            }
            
            // Not in heading-map - keep source as-is (will be English, truly new)
            return sourceSub;
          });
        };
        
        if (parsedSubsectionCount === expectedSubsectionCount && parsedSubsectionCount > 0) {
          // Check if the full recursive structure matches
          if (validateSubsectionStructure(newSection.subsections, subsections)) {
            // Translation returned all expected subsections with correct structure
            finalSubsections = subsections;
            this.log(`Using ${parsedSubsectionCount} translated subsections (structure validated)`);
          } else {
            // Structure mismatch - merge source structure with target headings
            this.log(`Warning: Subsection structure mismatch (counts match but nested structure differs), merging with target headings`);
            const parentPath = newSection.heading.replace(/^#+\s+/, '');
            finalSubsections = mergeSubsectionsWithTargetTranslations(
              newSection.subsections,
              targetSection.subsections,
              parentPath
            );
          }
        } else if (parsedSubsectionCount === 0 && expectedSubsectionCount === 0) {
          // No subsections expected or returned - correct
          finalSubsections = [];
        } else if (expectedSubsectionCount === 0) {
          // Source has no subsections (deletion case) - always use empty array
          // Don't preserve target subsections when source explicitly has none
          this.log(`Source has no subsections (deletion), using empty array (ignoring ${parsedSubsectionCount} parsed subsections)`);
          finalSubsections = [];
        } else {
          // Mismatch: merge source structure with target headings
          this.log(`Warning: Expected ${expectedSubsectionCount} subsections but got ${parsedSubsectionCount}, merging with target headings`);
          const parentPath = newSection.heading.replace(/^#+\s+/, '');
          finalSubsections = mergeSubsectionsWithTargetTranslations(
            newSection.subsections,
            targetSection.subsections,
            parentPath
          );
        }

        resultSections.push({
          ...targetSection,
          content: finalContent,
          subsections: finalSubsections,
        });

        this.log(`Updated section at position ${i}`);
      }
    }

    // 4. Update heading map with all sections (including title)
    this.log(`Updating heading map`);
    
    // Add title to heading map
    const updatedHeadingMap = new Map(headingMap);
    const newTitleText = newSource.titleText;
    const resultTitleText = resultTitle.replace(/^#\s+/, '').trim();
    updatedHeadingMap.set(newTitleText, resultTitleText);
    
    // Add sections to heading map (pass title so it's preserved)
    const finalHeadingMap = updateHeadingMap(
      updatedHeadingMap,
      newSource.sections,
      resultSections,
      newTitleText  // Pass title to prevent it from being deleted
    );
    this.log(`Updated heading map to ${finalHeadingMap.size} entries`);
    
    // 5. Reconstruct complete document from all components
    this.log(`Reconstructing complete document`);
    const reconstructed = this.reconstructFromComponents(
      resultConfig,
      resultTitle,
      resultIntro,
      resultSections
    );
    
    // 6. Inject updated heading map into frontmatter
    return injectHeadingMap(reconstructed, finalHeadingMap);
  }

  /**
   * Helper: Translate a new section
   */
  private async translateNewSection(
    section: Section,
    sourceLanguage: string,
    targetLanguage: string,
    glossary?: Glossary
  ): Promise<Section> {
    const fullSectionContent = this.serializeSection(section);
    
    const result = await this.translator.translateSection({
      mode: 'new',
      sourceLanguage,
      targetLanguage,
      glossary,
      englishSection: fullSectionContent,
    });

    if (!result.success) {
      throw new Error(`Translation failed for new section: ${result.error}`);
    }

    const translatedLines = (result.translatedSection || '').split('\n');
    const translatedHeading = translatedLines[0] || '';
    
    const { subsections, contentWithoutSubsections } = await this.parseTranslatedSubsections(
      result.translatedSection || '',
      section
    );
    
    return {
      heading: translatedHeading,
      level: section.level,
      id: section.id,
      content: contentWithoutSubsections || '',
      startLine: 0,
      endLine: 0,
      subsections: subsections,
    };
  }

  /**
   * Reconstruct document from components: CONFIG + TITLE + INTRO + SECTIONS
   * This ensures we always produce a complete, valid document
   */
  private reconstructFromComponents(
    config: string,
    title: string,
    intro: string,
    sections: Section[]
  ): string {
    const parts: string[] = [];

    // 1. CONFIG (frontmatter)
    if (config) {
      parts.push(config);
      parts.push(''); // Empty line after frontmatter
    }

    // 2. TITLE
    parts.push(title);
    parts.push(''); // Empty line after title

    // 3. INTRO (can be empty)
    if (intro) {
      parts.push(intro);
      parts.push(''); // Empty line after intro
    }

    // 4. SECTIONS (can be empty array) - includes subsections
    for (const section of sections) {
      // Use serializeSection to include subsections
      parts.push(this.serializeSection(section));
      parts.push(''); // Empty line between sections
    }

    return parts.join('\n').trim() + '\n';
  }

  /**
   * Process a full document (for new files)
   */
  async processFull(
    content: string,
    filepath: string,
    sourceLanguage: string,
    targetLanguage: string,
    glossary?: Glossary
  ): Promise<string> {
    this.log(`Processing full document: ${filepath}`);

    const result = await this.translator.translateFullDocument({
      sourceLanguage,
      targetLanguage,
      glossary,
      content,
    });

    if (!result.success) {
      throw new Error(`Full translation failed: ${result.error}`);
    }

    return result.translatedSection || '';
  }

  /**
   * Parse translated content to extract subsections and strip them from parent content
   * This ensures subsections are properly populated in the heading-map and not duplicated
   * Returns both the subsections and the content without subsections
   */
  private async parseTranslatedSubsections(
    translatedContent: string,
    sourceSection: Section
  ): Promise<{ subsections: Section[]; contentWithoutSubsections: string }> {
    try {
      // Wrap in minimal MyST document for parsing
      const wrappedContent = `---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
---

${translatedContent}`;
      
      const parsed = await this.parser.parseSections(wrappedContent, 'temp.md');
      
      // Extract subsections from the first section
      if (parsed.sections.length > 0 && parsed.sections[0].subsections.length > 0) {
        const section = parsed.sections[0];
        this.log(`Extracted ${section.subsections.length} subsections from translated content`);
        
        // Calculate wrapper length by counting lines up to and including the closing ---
        // This handles variable-length YAML headers correctly
        const wrapperLines = wrappedContent.split('\n');
        let wrapperLineCount = 0;
        let foundClosingFence = false;
        
        for (let i = 0; i < wrapperLines.length; i++) {
          wrapperLineCount++;
          if (i > 0 && wrapperLines[i] === '---') {
            // Found closing fence, count one more line for the empty line after
            wrapperLineCount++;
            foundClosingFence = true;
            break;
          }
        }
        
        if (!foundClosingFence) {
          this.log('Warning: Could not find closing YAML fence in wrapper');
          return { subsections: [], contentWithoutSubsections: translatedContent };
        }
        
        // Convert parser's 1-indexed line number to position in original content
        // Parser line numbers are 1-indexed, array indices are 0-indexed
        const firstSubsectionLine1Indexed = section.subsections[0].startLine;
        const firstSubsectionLine0Indexed = firstSubsectionLine1Indexed - 1;
        const positionInOriginalContent = firstSubsectionLine0Indexed - wrapperLineCount;
        
        // Extract content before first subsection
        const lines = translatedContent.split('\n');
        const contentLines = lines.slice(0, positionInOriginalContent);
        const contentWithoutSubsections = contentLines.join('\n').trim();
        
        return {
          subsections: section.subsections,
          contentWithoutSubsections
        };
      }
    } catch (error) {
      this.log(`Warning: Failed to parse subsections from translated content: ${error}`);
    }
    
    return {
      subsections: [],
      contentWithoutSubsections: translatedContent
    };
  }

  /**
   * Find target section using heading map (preferred) or ID fallback
   * Returns the actual section object or undefined if not found
   */
  private findTargetSectionByHeadingMap(
    sourceSection: Section,
    targetSections: Section[],
    headingMap: HeadingMap,
    positionHint?: number  // Optional position for fallback matching
  ): Section | undefined {
    this.log(`Finding target for source section: "${sourceSection.heading}" (id: ${sourceSection.id})`);
    
    // Strategy 1: Use heading map to find translated heading
    // For top-level sections, parent path is empty
    const translatedHeading = lookupTargetHeading(sourceSection.heading, headingMap, '');
    if (translatedHeading) {
      this.log(`  Strategy 1: Looking for translated heading: "${translatedHeading}"`);
      
      // Search for the translated heading in target sections
      for (const targetSection of targetSections) {
        const cleanTargetHeading = targetSection.heading.replace(/^#+\s+/, '').trim();
        if (cleanTargetHeading === translatedHeading) {
          this.log(`  ✓ Found by heading map: "${translatedHeading}"`);
          return targetSection;
        }
      }
      this.log(`  ✗ Not found by heading map`);
    } else {
      this.log(`  Strategy 1: No heading map entry for "${sourceSection.heading.replace(/^#+\s+/, '').trim()}"`);
    }

    // Strategy 2: Fall back to ID-based matching
    this.log(`  Strategy 2: Looking for ID: "${sourceSection.id}"`);
    for (const targetSection of targetSections) {
      if (targetSection.id === sourceSection.id) {
        this.log(`  ✓ Found by ID: ${sourceSection.id}`);
        return targetSection;
      }
    }
    this.log(`  ✗ Not found by ID`);
    
    // Log target section IDs for debugging
    if (targetSections.length <= 10) {
      this.log(`  Available target IDs: ${targetSections.map(s => s.id).join(', ')}`);
    }

    // Strategy 3: Fall back to position-based matching if heading map is empty
    // This handles initial translations where no heading-map exists yet
    if (headingMap.size === 0 && positionHint !== undefined) {
      this.log(`  Strategy 3: Heading map empty, using position-based fallback`);
      if (positionHint >= 0 && positionHint < targetSections.length) {
        this.log(`  ✓ Found by position: index ${positionHint}`);
        return targetSections[positionHint];
      }
      this.log(`  ✗ Position ${positionHint} out of bounds (target has ${targetSections.length} sections)`);
    }

    return undefined;
  }

  /**
   * Serialize a section with all its subsections into markdown text
   * This ensures subsections are included when translating
   */
  private serializeSection(section: Section): string {
    const parts: string[] = [];
    
    // Add section content (heading and direct content)
    parts.push(section.content);
    
    // Add subsections recursively if present
    for (const subsection of section.subsections) {
      parts.push(''); // Empty line before subsection
      // Recursively serialize subsection to handle nested subsections
      parts.push(this.serializeSection(subsection));
    }
    
    return parts.join('\n');
  }

  /**
   * Validate the translated content has valid MyST syntax
   */
  async validateMyST(content: string, filepath: string): Promise<{ valid: boolean; error?: string }> {
    return await this.parser.validateMyST(content, filepath);
  }
}

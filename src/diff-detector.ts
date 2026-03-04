/**
 * Section-Based Diff Detection Engine
 * 
 * Detects changes at the section level (## headings) rather than individual blocks.
 * This approach is much simpler and more reliable for translation workflows.
 * 
 * Key principles:
 * - Sections are matched by position (most reliable for translations)
 * - Changes are: added section, modified section, deleted section
 * - No complex block matching or insertion point logic needed
 */

import { MystParser } from './parser.js';
import { Section, SectionChange } from './types.js';
import * as core from '@actions/core';

export class DiffDetector {
  private parser: MystParser;
  private debug: boolean;

  constructor(debug: boolean = false) {
    this.parser = new MystParser();
    this.debug = debug;
  }

  private log(message: string): void {
    if (this.debug) {
      core.info(`[DiffDetector] ${message}`);
    }
  }

  /**
   * Detect section-level changes between old and new documents
   * Also detects preamble changes (title and intro before first ## section)
   */
  async detectSectionChanges(
    oldContent: string,
    newContent: string,
    filepath: string
  ): Promise<SectionChange[]> {
    this.log(`Detecting section changes in ${filepath}`);
    
    const oldSections = await this.parser.parseSections(oldContent, filepath);
    const newSections = await this.parser.parseSections(newContent, filepath);

    this.log(`Old document: ${oldSections.sections.length} sections`);
    this.log(`New document: ${newSections.sections.length} sections`);

    const changes: SectionChange[] = [];
    const processedOldSections = new Set<string>();

    // Check for preamble changes (title and intro text)
    if (oldSections.preamble !== newSections.preamble) {
      const oldPreamble = oldSections.preamble?.trim() || '';
      const newPreamble = newSections.preamble?.trim() || '';
      
      if (oldPreamble !== newPreamble) {
        this.log(`PREAMBLE MODIFIED: Content changed`);
        
        // Treat preamble as a special section with ID 'preamble'
        changes.push({
          type: 'modified',
          oldSection: {
            id: '_preamble',
            heading: '',  // Preamble has no heading
            level: 0,     // Special level for preamble
            content: oldPreamble,
            startLine: 1,
            endLine: 1,
            subsections: []
          },
          newSection: {
            id: '_preamble',
            heading: '',
            level: 0,
            content: newPreamble,
            startLine: 1,
            endLine: 1,
            subsections: []
          }
        });
      }
    }

    // Check for added and modified sections
    for (let i = 0; i < newSections.sections.length; i++) {
      const newSection = newSections.sections[i];
      
      // Try to find corresponding section in old document
      // Strategy 1: Match by position (most reliable for translations)
      const oldSectionByPosition = oldSections.sections[i];
      
      // Strategy 2: Match by ID (works if section heading didn't change)
      const oldSectionById = this.parser.findSectionById(
        oldSections.sections,
        newSection.id
      );

      let matchedOldSection: Section | undefined;
      
      // Prefer position-based matching for translations
      // (Chinese "## 经济模型" is at same position as English "## Economic Models")
      if (oldSectionByPosition && this.sectionsMatch(oldSectionByPosition, newSection)) {
        matchedOldSection = oldSectionByPosition;
        this.log(`Matched section "${newSection.heading}" by position ${i}`);
      } else if (oldSectionById) {
        matchedOldSection = oldSectionById;
        this.log(`Matched section "${newSection.heading}" by ID "${newSection.id}"`);
      }

      if (!matchedOldSection) {
        // New section added
        this.log(`ADDED: Section "${newSection.heading}" at position ${i}`);
        changes.push({
          type: 'added',
          newSection,
          position: {
            index: i,
            afterSectionId: i > 0 ? newSections.sections[i - 1].id : undefined,
          },
        });
      } else {
        processedOldSections.add(matchedOldSection.id);

        // Check if section content changed
        if (!this.sectionContentEqual(matchedOldSection, newSection)) {
          this.log(`MODIFIED: Section "${newSection.heading}"`);
          changes.push({
            type: 'modified',
            oldSection: matchedOldSection,
            newSection,
          });
        } else {
          this.log(`UNCHANGED: Section "${newSection.heading}"`);
        }
      }
    }

    // Check for deleted sections
    for (const oldSection of oldSections.sections) {
      if (!processedOldSections.has(oldSection.id)) {
        this.log(`DELETED: Section "${oldSection.heading}"`);
        changes.push({
          type: 'deleted',
          oldSection,
        });
      }
    }

    this.log(`Total section changes detected: ${changes.length}`);
    return changes;
  }

  /**
   * Check if two sections match (for position-based matching)
   * Sections match if they have the same ID (heading)
   * 
   * Note: We used to check structural similarity (level + subsection count),
   * but this caused false matches when inserting new sections.
   * Now we require ID match for position-based matching.
   */
  private sectionsMatch(section1: Section, section2: Section): boolean {
    // Sections must have the same ID to be considered a match
    // This prevents false matches when sections shift positions
    return section1.id === section2.id;
  }

  /**
   * Check if section content has changed (including all nested subsections recursively)
   */
  private sectionContentEqual(section1: Section, section2: Section): boolean {
    // Compare source documents (old English vs new English) using exact string equality
    // Any change in content, even a single character, should be detected
    // This ensures we catch typo fixes, word changes, added sentences, etc.
    
    // 1. Compare direct content (excluding subsections)
    if (section1.content.trim() !== section2.content.trim()) {
      return false;
    }
    
    // 2. Compare subsection count
    if (section1.subsections.length !== section2.subsections.length) {
      return false;
    }
    
    // 3. Recursively compare each subsection
    for (let i = 0; i < section1.subsections.length; i++) {
      if (!this.sectionContentEqual(section1.subsections[i], section2.subsections[i])) {
        return false;
      }
    }
    
    return true;
  }
}

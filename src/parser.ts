/**
 * MyST Markdown Section Parser
 * 
 * Parses MyST markdown documents into sections based on ## headings.
 * Each section includes all content until the next ## heading, including
 * any nested ### subsections.
 * 
 * This simplified parser replaces the previous block-based approach with
 * a cleaner section-based structure that's easier to work with for translations.
 */

import { Section, ParsedSections, DocumentComponents } from './types.js';

export class MystParser {
  /**
   * Parse markdown content into sections based on ## headings
   * Each section includes all content until the next ## heading
   * Handles arbitrary nesting depth (##, ###, ####, #####, ######)
   */
  async parseSections(content: string, filepath: string): Promise<ParsedSections> {
    const lines = content.split('\n');
    const sections: Section[] = [];
    
    // Extract frontmatter (YAML between --- markers)
    let frontmatter: string | undefined;
    let preamble: string | undefined;
    let contentStartIndex = 0;
    
    if (lines[0] === '---') {
      // Find end of frontmatter
      const endIndex = lines.slice(1).findIndex(line => line === '---');
      if (endIndex !== -1) {
        // Extract frontmatter including the --- markers
        frontmatter = lines.slice(0, endIndex + 2).join('\n');
        contentStartIndex = endIndex + 2;
      }
    }
    
    // Extract preamble (content before first ## heading, or all content if no ## sections)
    const firstSectionIndex = lines.slice(contentStartIndex).findIndex(line => line.match(/^##\s+/));
    if (firstSectionIndex !== -1) {
      // There are ## sections, extract content before them
      const preambleLines = lines.slice(contentStartIndex, contentStartIndex + firstSectionIndex);
      // Only keep preamble if it has non-empty content
      const preambleText = preambleLines.join('\n').trim();
      if (preambleText) {
        preamble = preambleText;
      }
      contentStartIndex = contentStartIndex + firstSectionIndex;
    } else {
      // No ## sections, all remaining content is preamble
      const preambleLines = lines.slice(contentStartIndex);
      const preambleText = preambleLines.join('\n').trim();
      if (preambleText) {
        preamble = preambleText;
      }
      contentStartIndex = lines.length; // No sections to parse
    }
    
    // Stack-based parsing for recursive subsections (handles ##, ###, ####, #####, ######)
    // Stack tracks the current nesting: [level2Section, level3Sub, level4SubSub, ...]
    const sectionStack: Section[] = [];
    
    for (let i = contentStartIndex; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      
      // Check for any heading level (## through ######)
      const headingMatch = line.match(/^(#{2,6})\s+(.+)$/);
      
      if (headingMatch) {
        const level = headingMatch[1].length;
        const headingText = headingMatch[2];
        const id = this.generateHeadingId(headingText);
        
        // Create new section
        const newSection: Section = {
          heading: line,
          level,
          id,
          content: line + '\n',
          startLine: lineNum,
          endLine: lineNum,
          subsections: [],
        };
        
        // Set parentId if this is a subsection
        if (level > 2 && sectionStack.length > 0) {
          newSection.parentId = sectionStack[sectionStack.length - 1].id;
        }
        
        // Pop stack until we find the parent level (level - 1)
        // or reach a level lower than current
        while (sectionStack.length > 0 && sectionStack[sectionStack.length - 1].level >= level) {
          const completed = sectionStack.pop()!;
          completed.endLine = lineNum - 1;
          
          if (sectionStack.length > 0) {
            // Add to parent's subsections
            sectionStack[sectionStack.length - 1].subsections.push(completed);
          } else {
            // Top-level section completed
            sections.push(completed);
          }
        }
        
        // Push new section onto stack
        sectionStack.push(newSection);
        continue;
      }
      
      // Add content to the deepest section in the stack
      if (sectionStack.length > 0) {
        const currentDeepest = sectionStack[sectionStack.length - 1];
        currentDeepest.content += line + '\n';
        currentDeepest.endLine = lineNum;
      }
    }
    
    // Save remaining sections in stack
    while (sectionStack.length > 0) {
      const completed = sectionStack.pop()!;
      
      if (sectionStack.length > 0) {
        // Add to parent's subsections
        sectionStack[sectionStack.length - 1].subsections.push(completed);
      } else {
        // Top-level section
        sections.push(completed);
      }
    }
    
    // Trim trailing newlines from content
    
    // Recursively trim trailing newlines from content
    const trimSection = (section: Section) => {
      section.content = section.content.trimEnd();
      section.subsections.forEach(trimSection);
    };
    sections.forEach(trimSection);

    return {
      sections,
      frontmatter,
      preamble,
      metadata: {
        filepath,
        totalLines: lines.length,
        sectionCount: sections.length,
      },
    };
  }
  
  /**
   * Generate heading ID/anchor from heading text
   * Follows the same rules as MyST/Sphinx for consistency.
   * Uses Unicode-aware matching to preserve non-Latin scripts
   * (Chinese, Arabic, Japanese, etc.) in heading IDs.
   */
  private generateHeadingId(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  /**
   * Find a section by ID (searches recursively through subsections)
   */
  findSectionById(sections: Section[], id: string): Section | undefined {
    for (const section of sections) {
      if (section.id === id) {
        return section;
      }
      const found = this.findSectionById(section.subsections, id);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  /**
   * Find section by position/index
   */
  findSectionByPosition(sections: Section[], index: number): Section | undefined {
    return sections[index];
  }

  /**
   * Validate MyST syntax by attempting to parse
   * Returns true if valid, false otherwise
   */
  async validateMyST(content: string, filepath: string): Promise<{ valid: boolean; error?: string }> {
    try {
      await this.parseSections(content, filepath);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error',
      };
    }
  }

  /**
   * Parse document into explicit components: CONFIG + TITLE + INTRO + SECTIONS
   * 
   * This provides a more structured view of the document that ensures
   * complete reconstruction by always including all components.
   * 
   * @param content - The markdown content to parse
   * @param filepath - Path to the file (for metadata)
   * @returns DocumentComponents with all parts explicitly separated
   */
  async parseDocumentComponents(content: string, filepath: string): Promise<DocumentComponents> {
    // Use the full recursive parser to get sections with all nested subsections (##, ###, ####, etc.)
    const parsed = await this.parseSections(content, filepath);
    
    const lines = content.split('\n');
    let contentStartIndex = 0;
    
    // 1. Extract CONFIG (frontmatter YAML) - reuse from parseSections
    const config = parsed.frontmatter || '';
    if (config) {
      // Calculate where content starts after frontmatter
      const configLines = config.split('\n');
      contentStartIndex = configLines.length;
    }
    
    // 2. Extract TITLE (# heading), collecting any pre-title content
    // Pre-title content includes MyST cross-ref targets like (label)= and
    // directive blocks like ```{raw} jupyter ... ``` that appear before the title
    let title = '';
    let titleText = '';
    let preTitleLines: string[] = [];
    let titleEndIndex = contentStartIndex;
    let insideFence = false;
    
    // Scan forward to find the # title heading, collecting pre-title content
    while (titleEndIndex < lines.length) {
      const line = lines[titleEndIndex];
      
      // Track code fence boundaries
      if (line.match(/^(`{3,}|~{3,})/)) {
        insideFence = !insideFence;
        preTitleLines.push(line);
        titleEndIndex++;
        continue;
      }
      
      // Inside a fence, skip everything
      if (insideFence) {
        preTitleLines.push(line);
        titleEndIndex++;
        continue;
      }
      
      // Check for # title heading
      const titleMatch = line.match(/^#\s+(.+)$/);
      if (titleMatch) {
        title = line;
        titleText = titleMatch[1];
        titleEndIndex++;
        break;
      }
      
      // Not a title — collect as pre-title content
      preTitleLines.push(line);
      titleEndIndex++;
    }
    
    const preTitle = preTitleLines.join('\n').trim();
    
    if (!title) {
      throw new Error('Document must have a # title heading');
    }
    
    // 3. Extract INTRO (content after title, before first ##)
    // parseSections.preamble includes the title line, so we need to strip it
    let intro = '';
    if (parsed.preamble) {
      const preambleLines = parsed.preamble.split('\n');
      // Skip the first line if it's the title
      const startIndex = preambleLines[0].match(/^#\s+/) ? 1 : 0;
      intro = preambleLines.slice(startIndex).join('\n').trim();
    }
    
    // 4. Use sections from parseSections (includes full recursive structure)
    const sections = parsed.sections;
    
    return {
      config,
      preTitle,
      title,
      titleText,
      intro,
      sections,
      metadata: {
        filepath,
        totalLines: lines.length,
        sectionCount: sections.length,
      },
    };
  }
}

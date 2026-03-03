/**
 * Cross-language section matcher
 * 
 * Matches sections between SOURCE (English) and TARGET (translated) documents.
 * Different from diff-detector.ts which compares same-language documents —
 * this module uses position-based matching with heading-map validation.
 * 
 * Matching strategy:
 * 1. Position-based: 1st section ↔ 1st section, 2nd ↔ 2nd, etc.
 * 2. Heading-map validation: confirm matches via heading-map when available
 * 3. Handle SOURCE_ONLY and TARGET_ONLY sections at boundaries
 */

import { Section } from '../types';
import { HeadingMap } from '../heading-map';
import { SectionPair, SectionSyncStatus } from './types';

/**
 * Match sections between SOURCE and TARGET documents by position
 * 
 * Uses position-based matching (simplest, most reliable for translation repos)
 * with heading-map validation when available.
 * 
 * @param sourceSections - Sections from the SOURCE (English) document
 * @param targetSections - Sections from the TARGET (translated) document
 * @param headingMap - Optional heading-map from TARGET frontmatter for validation
 * @returns Array of matched section pairs with sync status
 */
export function matchSections(
  sourceSections: Section[],
  targetSections: Section[],
  headingMap?: HeadingMap,
): SectionPair[] {
  const pairs: SectionPair[] = [];
  const maxLen = Math.max(sourceSections.length, targetSections.length);

  for (let i = 0; i < maxLen; i++) {
    const source = i < sourceSections.length ? sourceSections[i] : null;
    const target = i < targetSections.length ? targetSections[i] : null;

    if (source && target) {
      pairs.push({
        sourceSection: source,
        targetSection: target,
        status: 'MATCHED',
        sourceHeading: source.heading,
        targetHeading: target.heading,
      });
    } else if (source && !target) {
      pairs.push({
        sourceSection: source,
        targetSection: null,
        status: 'SOURCE_ONLY',
        sourceHeading: source.heading,
      });
    } else if (!source && target) {
      pairs.push({
        sourceSection: null,
        targetSection: target,
        status: 'TARGET_ONLY',
        targetHeading: target.heading,
      });
    }
  }

  return pairs;
}

/**
 * Validate position-based matches against the heading-map
 * 
 * Returns warnings for mismatches (doesn't change the matching —
 * position-based is still the primary strategy, but mismatches
 * indicate structural drift that should be reported).
 * 
 * @param pairs - Section pairs from matchSections()
 * @param headingMap - Heading-map from TARGET frontmatter
 * @returns Array of warning messages for mismatched pairs
 */
export function validateMatchesWithHeadingMap(
  pairs: SectionPair[],
  headingMap: HeadingMap,
): string[] {
  const warnings: string[] = [];

  for (const pair of pairs) {
    if (pair.status !== 'MATCHED' || !pair.sourceSection || !pair.targetSection) {
      continue;
    }

    // Extract the heading text without the ## prefix
    const sourceHeadingText = pair.sourceSection.heading.replace(/^#+\s+/, '');
    
    // Look up in heading-map: the key is typically the source heading ID or path
    // Heading-map maps English heading text → translated heading text
    const expectedTranslation = headingMap.get(sourceHeadingText);
    
    if (expectedTranslation) {
      const targetHeadingText = pair.targetSection.heading.replace(/^#+\s+/, '');
      if (expectedTranslation !== targetHeadingText) {
        warnings.push(
          `Position ${pairs.indexOf(pair)}: heading-map expected "${expectedTranslation}" ` +
          `for "${sourceHeadingText}", but found "${targetHeadingText}"`
        );
      }
    }
  }

  return warnings;
}

/**
 * Get a summary of section matching results
 */
export function getMatchingSummary(pairs: SectionPair[]): {
  matched: number;
  sourceOnly: number;
  targetOnly: number;
  total: number;
} {
  let matched = 0;
  let sourceOnly = 0;
  let targetOnly = 0;

  for (const pair of pairs) {
    switch (pair.status) {
      case 'MATCHED':
        matched++;
        break;
      case 'SOURCE_ONLY':
        sourceOnly++;
        break;
      case 'TARGET_ONLY':
        targetOnly++;
        break;
    }
  }

  return { matched, sourceOnly, targetOnly, total: pairs.length };
}

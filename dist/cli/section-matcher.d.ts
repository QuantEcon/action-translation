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
import { SectionPair } from './types';
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
export declare function matchSections(sourceSections: Section[], targetSections: Section[], _headingMap?: HeadingMap): SectionPair[];
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
export declare function validateMatchesWithHeadingMap(pairs: SectionPair[], headingMap: HeadingMap): string[];
/**
 * Get a summary of section matching results
 */
export declare function getMatchingSummary(pairs: SectionPair[]): {
    matched: number;
    sourceOnly: number;
    targetOnly: number;
    total: number;
};
//# sourceMappingURL=section-matcher.d.ts.map
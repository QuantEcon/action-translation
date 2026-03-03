/**
 * Report Generator
 *
 * Formats backward analysis results as Markdown or JSON reports.
 *
 * Report tone: Suggestions, not corrections. SOURCE is the source of truth.
 * Uses language like "The translation may have identified..." rather than "Fix this."
 */
import { BackwardReport, BulkBackwardReport } from './types';
/**
 * Generate a Markdown report for a single file backward analysis
 */
export declare function generateMarkdownReport(report: BackwardReport): string;
/**
 * Generate a summary Markdown report for bulk backward analysis
 */
export declare function generateBulkMarkdownReport(report: BulkBackwardReport): string;
/**
 * Generate a JSON report for a single file backward analysis
 */
export declare function generateJsonReport(report: BackwardReport): string;
/**
 * Generate a JSON report for bulk backward analysis
 */
export declare function generateBulkJsonReport(report: BulkBackwardReport): string;
//# sourceMappingURL=report-generator.d.ts.map
/**
 * Forward Command — Resync TARGET to match current SOURCE
 *
 * Pipeline per file:
 * 1. Forward triage (LLM) — content changes or i18n only?
 * 2. Whole-file RESYNC translate (LLM) — entire document in one pass
 * 3. Output: write to disk or create PR (--github)
 *
 * Uses whole-file RESYNC (decided after experiment — see
 * experiments/forward/whole-file-vs-section-by-section/REPORT.md).
 * Benefits over section-by-section:
 * - Preserves cross-section context (localized plot labels, font config)
 * - 2-3× cheaper (glossary sent once, not per section)
 * - Fewer diff lines (more surgical updates)
 *
 * Supports:
 * - Single file: `npx resync forward -f cobweb.md`
 * - Bulk: `npx resync forward` (all OUTDATED files via status)
 * - GitHub: `--github owner/repo` (one PR per file in TARGET repo)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import cliProgress from 'cli-progress';
import { TranslationService } from '../../translator.js';
import { Glossary } from '../../types.js';
import { triageForward } from '../forward-triage.js';
import { languageLabel } from '../../language-config.js';
import { ForwardOptions, ForwardFileResult, FileState } from '../types.js';
import { runStatus, FileStatusEntry, FileSyncStatus } from './status.js';
import {
  writeFileState,
  serializeFileState,
  stateFileRelativePath,
  getToolVersion,
} from '../translate-state.js';
import { getFileGitMetadata } from '../git-metadata.js';
import { MystParser } from '../../parser.js';
import { applyTypography } from '../../typography.js';
import { checkStructuralParity, formatParityViolations } from '../../structural-parity.js';
import {
  findTargetLocalReads,
  buildPreserveInstruction,
  verifyPreservedReads,
} from '../target-local-reads.js';
import { buildHeadingMap, injectHeadingMap, extractTranslationTitle } from '../../heading-map.js';
import {
  createForwardPR,
  gitPrepareAndPush,
  detectSourceRepo,
  GhRunner,
  GitRunner,
  realGhRunner,
  realGitRunner,
} from '../forward-pr-creator.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ForwardLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

const defaultLogger: ForwardLogger = {
  info: (msg) => console.log(msg),
  warn: (msg) => console.warn(`⚠️  ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
};

// ============================================================================
// OUTPUT FINALIZATION
// ============================================================================

/**
 * Split a document into frontmatter YAML and body.
 *
 * A leading `---` only counts as a frontmatter opener when a closing `---`
 * exists AND the enclosed text parses as a YAML mapping. Otherwise a stray
 * lone `---` (which the model can emit on frontmatter-less files) would
 * swallow body content up to the next horizontal rule.
 */
function splitFrontmatter(content: string): { yaml?: string; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (match) {
    try {
      const parsed = yaml.load(match[1]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { yaml: match[1], body: content.slice(match[0].length) };
      }
    } catch {
      // Not valid YAML — treat the leading `---` as stray, handled below
    }
  }
  return { body: content };
}

/**
 * Top-level keys of the target's frontmatter, plus the keys every lecture
 * edition carries. Used to recognize a frontmatter block that is NOT at
 * position 0 — a bare `---` is also a horizontal rule, so only a block whose
 * first key matches a known frontmatter key counts.
 */
export function frontmatterSignatureKeys(targetYaml?: string): Set<string> {
  const keys = new Set(['jupytext', 'kernelspec', 'translation']);
  if (targetYaml) {
    for (const m of targetYaml.matchAll(/^([A-Za-z_][A-Za-z0-9_-]*):/gm)) {
      keys.add(m[1]);
    }
  }
  return keys;
}

const EMBEDDED_FENCE = /^\s*(`{3,}|~{3,})(.*)$/;
const FRONTMATTER_DELIM = /^---\s*$/;

/**
 * Line index of a frontmatter-signature block (`---` whose next non-blank
 * line is a known top-level frontmatter key) anywhere in the content, or -1.
 * Fence-aware so YAML examples inside code cells cannot false-positive.
 *
 * Exists because the model can emit reasoning prose BEFORE the document
 * (observed 2026-07-22 on long_run_growth): splitFrontmatter anchors at
 * position 0, so the real frontmatter goes unrecognized, the preamble lands
 * in the body, and the written file carries two frontmatter blocks with
 * leaked deliberation text between them. #105's sibling, one shape over.
 */
export function findEmbeddedFrontmatter(content: string, signatureKeys: Set<string>): number {
  const lines = content.split('\n');
  let openFence: { char: string; length: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const fence = EMBEDDED_FENCE.exec(lines[i]);
    if (openFence) {
      if (
        fence &&
        fence[1][0] === openFence.char &&
        fence[1].length >= openFence.length &&
        fence[2].trim() === ''
      ) {
        openFence = null;
      }
      continue;
    }
    if (fence) {
      openFence = { char: fence[1][0], length: fence[1].length };
      continue;
    }
    if (FRONTMATTER_DELIM.test(lines[i])) {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      const key = /^([A-Za-z_][A-Za-z0-9_-]*):(\s|$)/.exec(lines[j] ?? '');
      if (!key || !signatureKeys.has(key[1])) continue;
      // A signature key alone is not enough — a horizontal rule followed by
      // `title:`-style prose would match, and the finalize strip would drop
      // legitimate body content. The candidate only counts as frontmatter if
      // it CLOSES with another `---` and the enclosed slab parses as a YAML
      // mapping (prose after a key line fails YAML, so this discriminates).
      let close = i + 1;
      while (close < lines.length && !FRONTMATTER_DELIM.test(lines[close])) close++;
      if (close >= lines.length) continue;
      try {
        const parsed = yaml.load(lines.slice(i + 1, close).join('\n'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return i;
      } catch {
        // Not a YAML mapping — a horizontal rule, not frontmatter
      }
    }
  }
  return -1;
}

/**
 * Finalize whole-file resync output before it is written or committed:
 *
 * 1. Carry the TARGET's frontmatter forward — the model is instructed to
 *    preserve it, but field runs show it emits the source's frontmatter
 *    instead, silently reverting target-side metadata (e.g. jupytext
 *    version bumps). Enforced deterministically here.
 * 2. Strip a stray lone `---` the model can invent on frontmatter-less
 *    documents (an unclosed delimiter corrupts MyST parsing).
 * 3. Rebuild and inject the heading map (`translation:` block) from the
 *    current source and resynced sections, matching what the action's
 *    processFull() path writes — without it every resynced file stays
 *    MISSING_HEADINGMAP and section-level sync cannot match it.
 *
 * Exported for testing.
 */
export async function finalizeResyncContent(
  resyncedContent: string,
  sourceContent: string,
  targetContent: string,
  file: string,
  logger: ForwardLogger = defaultLogger
): Promise<string> {
  // 1-2. Replace whatever frontmatter the model emitted with the target's own;
  // drop a stray leading `---` when neither side has real frontmatter.
  const targetSplit = splitFrontmatter(targetContent);
  let outputSplit = splitFrontmatter(resyncedContent);
  if (outputSplit.yaml === undefined) {
    // The model can emit reasoning prose BEFORE the document's frontmatter,
    // which position-0-anchored splitFrontmatter cannot see — the preamble
    // would land in the body under the carried-forward frontmatter and the
    // file would publish deliberation text plus a duplicate jupytext block.
    // Locate the real block by signature key and drop everything before it.
    const signatureKeys = frontmatterSignatureKeys(targetSplit.yaml);
    const idx = findEmbeddedFrontmatter(resyncedContent, signatureKeys);
    const lines = resyncedContent.split('\n');
    if (idx > 0 && lines.slice(0, idx).some((l) => l.trim() !== '')) {
      logger.warn(
        `${file}: dropped ${idx} preamble line(s) the model emitted before the document frontmatter`
      );
      outputSplit = splitFrontmatter(lines.slice(idx).join('\n'));
    }
  }
  let body = outputSplit.body;
  if (outputSplit.yaml === undefined) {
    body = body.replace(/^---[ \t]*\r?\n+/, '');
  }
  body = body.replace(/^\r?\n+/, '');

  let merged = targetSplit.yaml !== undefined ? `---\n${targetSplit.yaml}\n---\n\n${body}` : body;

  // 3. Rebuild the heading map from current source + resynced body.
  // Mirrors processFull(): a malformed document must not fail the resync,
  // so fall back to the frontmatter-fixed content without a map.
  try {
    const parser = new MystParser();
    const sourceParsed = await parser.parseDocumentComponents(sourceContent, file);
    const mergedParsed = await parser.parseDocumentComponents(merged, file);
    const { map } = buildHeadingMap(sourceParsed.sections, mergedParsed.sections);
    const title = mergedParsed.titleText || extractTranslationTitle(targetContent) || '';
    if (map.size > 0 || title) {
      merged = injectHeadingMap(merged, map, title);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Could not build heading map for ${file}: ${msg}`);
  }

  return merged;
}

// ============================================================================
// SINGLE FILE RESYNC
// ============================================================================

/**
 * Resync a single file: triage → whole-file RESYNC → output.
 *
 * Exported for direct testing.
 */
export async function resyncSingleFile(
  file: string,
  sourceRepoPath: string,
  targetRepoPath: string,
  docsFolder: string,
  options: ForwardOptions,
  logger: ForwardLogger = defaultLogger,
  ghRunner?: GhRunner,
  gitRunner?: GitRunner
): Promise<ForwardFileResult> {
  const sourceFilePath = path.join(sourceRepoPath, docsFolder, file);
  const targetFilePath = path.join(targetRepoPath, docsFolder, file);

  // Verify both files exist
  if (!fs.existsSync(sourceFilePath)) {
    throw new Error(`Source file not found: ${sourceFilePath}`);
  }
  if (!fs.existsSync(targetFilePath)) {
    throw new Error(
      `Target file not found: ${targetFilePath} (use 'new' translation for missing targets)`
    );
  }

  const sourceContent = fs.readFileSync(sourceFilePath, 'utf-8');
  const targetContent = fs.readFileSync(targetFilePath, 'utf-8');

  // ──── Step 1: Forward triage ─────────────────────────────────────────────
  logger.info(`  Triaging ${file}…`);

  const triageResult = await triageForward(file, sourceContent, targetContent, {
    apiKey: options.apiKey,
    model: options.model,
    sourceLanguage: languageLabel(options.sourceLanguage),
    targetLanguage: languageLabel(options.language),
    testMode: options.test,
  });

  if (
    triageResult.verdict !== 'CONTENT_CHANGES' &&
    triageResult.verdict !== 'TARGET_HAS_ADDITIONS'
  ) {
    const label = triageResult.verdict === 'IDENTICAL' ? 'identical' : 'i18n only';
    logger.info(`  SKIPPED — ${label}${triageResult.reason ? ` (${triageResult.reason})` : ''}`);
    return {
      file,
      triageResult,
      sections: [],
      summary: { resynced: 0, unchanged: 0, new: 0, removed: 0, errors: 0 },
    };
  }

  if (triageResult.verdict === 'TARGET_HAS_ADDITIONS') {
    // Two provenances, opposite treatments (#90 defect 2): content the SOURCE
    // once had and later deleted (removal is correct — the resync mirrors the
    // current source), or human-authored target additions (removal is
    // destructive). The triage verdict cannot tell them apart; the operator can.
    logger.warn(`${file}: TARGET has content not in SOURCE — the resync will remove it.`);
    logger.warn(
      `If the source deleted this content, removal is correct. If it is human-authored, ` +
        `move it to a target-only file first (see the FAQ on adding content to a translated ` +
        `edition), or run 'translate backward' to capture improvements upstream.`
    );
    if (triageResult.reason) {
      logger.warn(`Reason: ${triageResult.reason}`);
    }
  }

  logger.info(`  Content changes detected — resyncing (whole-file)…`);

  // ──── Step 2: Whole-file RESYNC ──────────────────────────────────────────
  const glossary = loadGlossary(options.language);
  let outputContent: string | undefined;
  let tokensUsed: number | undefined;

  if (options.test) {
    // Test mode: mock resync — prefix target content with marker
    outputContent = `[TEST RESYNC]\n${targetContent}`;
    logger.info(`  ✅ Test mode — mock resync applied`);
  } else {
    // Target-local data reads (#107): code lines loading files that exist only
    // in the translation repo are localisation the model cannot infer — the
    // file itself is invisible to it. Pin the exact lines in the request, and
    // verify after finalization that they survived (the class rule alone
    // demonstrably does not hold: the reverted block reproduced on a re-run
    // with the strengthened rule in place, 2026-07-22 validation wave).
    const targetLocalReads = findTargetLocalReads(
      targetContent,
      path.join(sourceRepoPath, docsFolder),
      path.join(targetRepoPath, docsFolder)
    );
    if (targetLocalReads.length > 0) {
      logger.info(
        `  Pinning ${targetLocalReads.length} target-local data read(s): ` +
          targetLocalReads.map((r) => r.basename).join(', ')
      );
    }

    const translator = new TranslationService(options.apiKey, options.model, false);
    const result = await translator.translateDocumentResync({
      sourceLanguage: languageLabel(options.sourceLanguage),
      targetLanguage: languageLabel(options.language),
      glossary,
      customInstructions: buildPreserveInstruction(targetLocalReads),
      sourceContent,
      targetContent,
    });

    if (result.success && result.translatedSection) {
      // Apply deterministic typography before anything derives from the text —
      // the model does not honour the NBSP prompt rule, and every other write
      // path (init, sync, apply.mjs) already typesets. Frontmatter (including
      // the preserved heading map) is skipped by the transform.
      const typeset = applyTypography(result.translatedSection, options.language);
      // Carry the target's frontmatter forward and inject the heading map —
      // the model is prompted to do both but does not reliably comply.
      outputContent = await finalizeResyncContent(
        typeset,
        sourceContent,
        targetContent,
        file,
        logger
      );

      // Structural parity: directive shapes and target anchors must survive the
      // resync verbatim (#119, #65 — and #118's fence-wrap destroys the whole
      // token sequence, so it fails here too). This runs AFTER finalization so
      // it checks exactly the bytes that would be written; failing the file
      // loudly is the point, because every defect in this class previously
      // shipped as a success and surfaced weeks later downstream.
      const parity = checkStructuralParity(sourceContent, outputContent);
      if (!parity.ok) {
        logger.error(`  ${formatParityViolations(file, parity)}`);
        return {
          file,
          triageResult,
          sections: [],
          summary: { resynced: 0, unchanged: 0, new: 0, removed: 0, errors: 1 },
        };
      }

      // No second frontmatter block may survive into the written bytes — a
      // preamble shape the finalize strip missed would publish reasoning
      // prose and a duplicated jupytext block. Loud beats silent.
      const embeddedIdx = findEmbeddedFrontmatter(
        splitFrontmatter(outputContent).body,
        frontmatterSignatureKeys(splitFrontmatter(targetContent).yaml)
      );
      if (embeddedIdx >= 0) {
        logger.error(
          `  ${file}: resync output contains an embedded frontmatter block in the body ` +
            `(model preamble not fully reconciled) — failing the file rather than writing it`
        );
        return {
          file,
          triageResult,
          sections: [],
          summary: { resynced: 0, unchanged: 0, new: 0, removed: 0, errors: 1 },
        };
      }

      // Pinned target-local reads must survive — a silent revert merges
      // English legends; a loud failure gets a human (#107).
      const missingReads = verifyPreservedReads(outputContent, targetLocalReads);
      if (missingReads.length > 0) {
        logger.error(
          `  ${file}: resync dropped ${missingReads.length} pinned target-local data read(s) — ` +
            `failing the file rather than reverting localisation to English:`
        );
        for (const line of missingReads) {
          logger.error(`    - ${line}`);
        }
        return {
          file,
          triageResult,
          sections: [],
          summary: { resynced: 0, unchanged: 0, new: 0, removed: 0, errors: 1 },
        };
      }

      tokensUsed = result.tokensUsed;
      logger.info(`  ✅ Resync complete (${tokensUsed?.toLocaleString()} tokens)`);
    } else {
      logger.error(`  Failed to resync ${file}: ${result.error}`);
      return {
        file,
        triageResult,
        sections: [],
        summary: { resynced: 0, unchanged: 0, new: 0, removed: 0, errors: 1 },
      };
    }
  }

  // ──── Step 3: Output ─────────────────────────────────────────────────────
  let prUrl: string | undefined;

  // Compute per-file state once — committed alongside the content in --github
  // mode (so discovery works after merge), written to the working tree in
  // local mode. Failure to compute state is non-fatal.
  let fileState: FileState | undefined;
  try {
    const docsRelPath = docsFolder ? path.join(docsFolder, file) : file;
    const sourceGit = await getFileGitMetadata(sourceRepoPath, docsRelPath);
    const parser = new MystParser();
    const parsed = await parser.parseSections(sourceContent, file);
    fileState = {
      'source-sha': sourceGit?.lastCommit ?? 'unknown',
      'synced-at': new Date().toISOString().split('T')[0],
      model: options.model,
      mode: 'RESYNC',
      'section-count': parsed.sections.length,
    };
  } catch {
    fileState = undefined;
  }

  if (outputContent) {
    if (options.github) {
      // Git: create branch, write content + state, commit, push
      const stateFiles = fileState
        ? [
            {
              relPath: stateFileRelativePath(file),
              content: serializeFileState({ ...fileState, 'tool-version': getToolVersion() }),
            },
          ]
        : [];
      const gRunner = gitRunner ?? realGitRunner;
      const gitResult = gitPrepareAndPush(
        file,
        outputContent,
        targetRepoPath,
        docsFolder,
        gRunner,
        stateFiles
      );
      if (!gitResult.success) {
        logger.error(`  Git failed for ${file}: ${gitResult.error}`);
        return {
          file,
          triageResult,
          sections: [],
          outputContent,
          tokensUsed,
          summary: { resynced: 0, unchanged: 0, new: 0, removed: 0, errors: 1 },
        };
      }
      logger.info(`  Branch ${gitResult.branchName} pushed to origin`);

      // Detect source repo's GitHub identity for the PR body
      const sourceGitHub = detectSourceRepo(sourceRepoPath, gRunner);

      // Create PR in TARGET repo via gh CLI
      const runner = ghRunner ?? realGhRunner;
      const prResult = createForwardPR(
        file,
        outputContent,
        [], // No per-section results in whole-file mode
        options.github,
        runner,
        sourceGitHub,
        docsFolder,
        triageResult.reason,
        {
          sourceCommitSha: fileState?.['source-sha'] ?? 'unknown',
          targetBaseSha: gitResult.baseSha ?? '',
          sourceLanguage: options.sourceLanguage,
          targetLanguage: options.language,
          model: options.model,
          statePath: fileState ? stateFileRelativePath(file) : undefined,
        }
      );
      if (prResult.success) {
        prUrl = prResult.url;
        logger.info(`  ✅ PR created: ${prUrl}`);
      } else {
        logger.error(`  Failed to create PR for ${file}: ${prResult.error}`);
        return {
          file,
          triageResult,
          sections: [],
          outputContent,
          tokensUsed,
          summary: { resynced: 0, unchanged: 0, new: 0, removed: 0, errors: 1 },
        };
      }
    } else {
      // Write to local disk (state goes to .translate/state/ in the worktree)
      fs.writeFileSync(targetFilePath, outputContent, 'utf-8');
      logger.info(`  ✅ Written to ${targetFilePath}`);
      if (fileState) {
        try {
          writeFileState(targetRepoPath, file, fileState);
        } catch {
          // State write failure is non-fatal
        }
      }
    }
  }

  return {
    file,
    triageResult,
    sections: [], // Whole-file mode — no per-section tracking
    outputContent,
    prUrl,
    tokensUsed,
    summary: { resynced: 1, unchanged: 0, new: 0, removed: 0, errors: 0 },
  };
}

// ============================================================================
// BULK FORWARD RESYNC
// ============================================================================

/**
 * Flags that make a file a forward-resync candidate. Anything carrying one of
 * these goes to stage-1 triage, which is the real gate — i18n-only/identical
 * files are skipped there at the cost of one triage call.
 */
const FORWARD_CANDIDATE_FLAGS: FileSyncStatus[] = [
  'OUTDATED',
  'SOURCE_AHEAD',
  'TARGET_AHEAD',
  'MISSING_HEADINGMAP',
];

/**
 * Select which status entries forward should attempt.
 *
 * Matches on `flags`, not the primary status (#106): status priority ranks
 * MISSING_HEADINGMAP above OUTDATED, so on an unbootstrapped repo — where
 * every file lacks a heading map — a date-stale file's primary status hides
 * its staleness and the old primary-status filter never saw it. TARGET_AHEAD
 * files are candidates too: forward explicitly handles the
 * TARGET_HAS_ADDITIONS verdict rather than ignoring target-side divergence.
 *
 * Note the residual gap: a content-stale file that carries none of these
 * flags (heading map present, no state, matching section counts, target git
 * dates newer than source) is still invisible — only `status --check-sync`'s
 * LLM triage can catch it. Exported for testing.
 */
export function selectForwardCandidates(
  entries: FileStatusEntry[]
): Array<{ file: string; flags: FileSyncStatus[] }> {
  return entries
    .map((e) => ({
      file: e.file,
      flags: e.flags.filter((f) => FORWARD_CANDIDATE_FLAGS.includes(f)),
    }))
    .filter((c) => c.flags.length > 0);
}

/**
 * Run forward resync on all files flagged as divergent by status.
 */
export async function runForwardBulk(
  options: ForwardOptions,
  logger: ForwardLogger = defaultLogger,
  exclude: string[] = [],
  ghRunner?: GhRunner,
  gitRunner?: GitRunner
): Promise<ForwardFileResult[]> {
  const { source, target, docsFolder, language } = options;

  // Discover OUTDATED files via status command
  logger.info('Discovering outdated files…\n');

  const statusResult = await runStatus({
    source,
    target,
    docsFolder,
    language,
    exclude,
  });

  // Filter to files carrying any divergence flag (#106) — triage decides the rest
  const selected = selectForwardCandidates(statusResult.entries);
  const candidates = selected.map((c) => c.file);

  if (candidates.length === 0) {
    logger.info('No files carry divergence flags — nothing to resync.');
    logger.info(
      'Note: content-stale files with matching structure and no .translate/ state ' +
        "are invisible to discovery — run 'status --check-sync' to find them, then " +
        'resync with -f.'
    );
    return [];
  }

  logger.info(`Found ${candidates.length} candidate file(s) — triage will decide each:\n`);
  for (const c of selected) {
    logger.info(`  • ${c.file} [${c.flags.join(', ')}]`);
  }
  logger.info('');

  // Process each file
  const results: ForwardFileResult[] = [];
  const bar = new cliProgress.SingleBar(
    { format: '  {bar} {percentage}% | {value}/{total} files | {filename}' },
    cliProgress.Presets.shades_classic
  );
  bar.start(candidates.length, 0, { filename: '' });

  // Force sequential when --github is set: parallel git ops in the same
  // worktree would race and corrupt branches/commits.
  const CONCURRENCY = options.github ? 1 : (options.parallel ?? 5);

  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY);
    bar.update(results.length, { filename: batch[0] });

    const batchResults = await Promise.all(
      batch.map(async (file) => {
        try {
          return await resyncSingleFile(
            file,
            source,
            target,
            docsFolder,
            options,
            logger,
            ghRunner,
            gitRunner
          );
        } catch (error) {
          logger.error(
            `Failed to resync ${file}: ${error instanceof Error ? error.message : String(error)}`
          );
          return {
            file,
            triageResult: {
              file,
              verdict: 'CONTENT_CHANGES' as const,
              reason: 'Error during processing',
            },
            sections: [],
            summary: { resynced: 0, unchanged: 0, new: 0, removed: 0, errors: 1 },
          };
        }
      })
    );

    results.push(...batchResults);
    bar.update(results.length, { filename: batch[batch.length - 1] });
  }

  bar.update(candidates.length, { filename: 'done' });
  bar.stop();
  console.log('');

  // Print summary
  printBulkSummary(results, logger);

  return results;
}

// ============================================================================
// SUMMARY
// ============================================================================

/** Human label for why a file was skipped, from its triage verdict. */
function skipLabel(verdict: string): string {
  switch (verdict) {
    case 'IDENTICAL':
      return 'identical';
    case 'I18N_ONLY':
      return 'i18n only';
    case 'TARGET_HAS_ADDITIONS':
      return 'target has additions';
    default:
      return verdict.toLowerCase().replace(/_/g, ' ');
  }
}

/**
 * Print the bulk-run summary, bucketing by what the pipeline actually DID
 * with each file — not by triage verdict (#106): TARGET_HAS_ADDITIONS files
 * are resynced, so bucketing by `verdict !== CONTENT_CHANGES` reported them
 * as "skipped: i18n only" while their PRs existed, understating the wave and
 * mislabeling the reason. Exported for testing.
 */
export function printBulkSummary(results: ForwardFileResult[], logger: ForwardLogger): void {
  const processed = results.filter((r) => r.summary.resynced > 0 || r.summary.errors > 0);
  const skipped = results.filter((r) => r.summary.resynced === 0 && r.summary.errors === 0);

  let totalResynced = 0;
  let totalErrors = 0;
  let totalTokens = 0;

  for (const r of results) {
    totalResynced += r.summary.resynced;
    totalErrors += r.summary.errors;
    if (r.tokensUsed) totalTokens += r.tokensUsed;
  }

  logger.info('─── Forward Resync Summary ───────────────────────────');
  logger.info(`  Files processed: ${processed.length}`);
  logger.info(`  Files resynced:  ${totalResynced}`);
  logger.info(`  Files skipped:   ${skipped.length}`);

  if (skipped.length > 0) {
    for (const r of skipped) {
      const reason = r.triageResult.reason ? ` — ${r.triageResult.reason}` : '';
      logger.info(`    ${r.file}: ${skipLabel(r.triageResult.verdict)}${reason}`);
    }
  }

  if (totalErrors > 0) {
    logger.info(`  Files errored:   ${totalErrors}`);
    for (const r of results.filter((x) => x.summary.errors > 0)) {
      logger.info(`    ${r.file}`);
    }
  }
  if (totalTokens > 0) {
    logger.info(`  Total tokens:    ${totalTokens.toLocaleString()}`);
  }
  logger.info('─────────────────────────────────────────────────────');
}

// ============================================================================
// GLOSSARY LOADER
// ============================================================================

function loadGlossary(language: string): Glossary | undefined {
  // Try to find glossary file relative to CWD
  const candidates = [
    path.join(process.cwd(), 'glossary', `${language}.json`),
    path.join(process.cwd(), `glossary-${language}.json`),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const raw = fs.readFileSync(candidate, 'utf-8');
        return JSON.parse(raw) as Glossary;
      } catch {
        // Ignore parse errors
      }
    }
  }

  return undefined;
}

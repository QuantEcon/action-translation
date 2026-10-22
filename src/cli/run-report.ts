/**
 * Run reports — the machine-readable record of a CLI run, and the classes a
 * failed file is sorted into.
 *
 * `translate init --report-json <path>` writes one (schema
 * `translate-init-report/1`), so that a measurement reads each failure's class
 * instead of grepping log text. A refusal, a truncation and a structural parity
 * failure are different findings about a model; an infra failure (a 429, 5xx,
 * overload or connection error that outlasted the retries, or a stream cut off
 * part-way, which is retried only for an overload) is not a finding about the
 * model at all.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  APIError,
  AnthropicError,
  AuthenticationError,
  PermissionDeniedError,
} from '@anthropic-ai/sdk';
import {
  ApiUsage,
  ModelRefusalError,
  ModelRequestPolicy,
  TruncatedResponseError,
  UnexpectedStopReasonError,
  isRetryableAnthropicError,
} from '../models.js';

/** The class of a failed file, in the order `classifyFailure` tests them. */
export type FailureKind =
  | 'model-refusal' // stop_reason refusal; category from stop_details
  | 'truncated' // stop_reason max_tokens
  | 'unexpected-stop' // any other stop reason but end_turn
  | 'parity' // the structural parity guard refused the output
  | 'auth' // 401 / 403
  | 'infra' // 429, 5xx, overload, connection error after the retries; a stream cut short
  | 'api-error' // any other API error: a 400, a 404 for an unknown model, ...
  | 'too-large' // refused before the call: over the whole-document output budget
  | 'incomplete' // the model printed the incomplete-document marker
  | 'no-text' // an end_turn without a text block
  | 'error'; // anything else

/** Why one file failed. */
export interface FailureInfo {
  kind: FailureKind;
  /** The error message, cut at 500 characters. */
  message: string;
  /** model-refusal: the stop_details category, null when the API named none. */
  category?: string | null;
  /** unexpected-stop: the stop reason, null when the response had none. */
  stopReason?: string | null;
  /** An SDK error's HTTP status, when it has one (a mid-stream error has none). */
  status?: number;
  /** An SDK error's API error type, when it has one: 'rate_limit_error', 'api_error', ... */
  type?: string;
}

/** The structural parity guard refused a file's output (thrown by init). */
export class StructuralParityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StructuralParityError';
  }
}

const MESSAGE_LIMIT = 500;

/**
 * An SSE `error` event ends a stream in place of a response, and reaches the
 * SDK as an APIError with no HTTP status, typed by the event. These are the
 * types whose HTTP form (429, 500, 504, 529) is retried; mid-stream only an
 * overload is (`isRetryableAnthropicError`), so without this set a server
 * error that cut a long stream short would count against the model.
 */
const MID_STREAM_INFRA_TYPES: ReadonlySet<string> = new Set([
  'rate_limit_error',
  'api_error',
  'timeout_error',
  'overloaded_error',
]);

/**
 * The SDK's own errors for a stream that stopped below the API: a body that
 * ended before the message did. A connection dropped mid-read reaches the SDK
 * as fetch's TypeError ('terminated'), which it wraps in a plain
 * AnthropicError. Neither is retried — neither is an APIConnectionError — and
 * neither says anything about the model.
 */
const STREAM_ENDED_EARLY_MESSAGES: ReadonlySet<string> = new Set([
  'stream ended without producing a Message with role=assistant',
  'request ended without sending any chunks',
]);

function isStreamCutShort(error: unknown): boolean {
  return (
    error instanceof AnthropicError &&
    !(error instanceof APIError) &&
    (error.cause instanceof TypeError || STREAM_ENDED_EARLY_MESSAGES.has(error.message))
  );
}

/** Sort a failed file's error into a FailureKind. */
export function classifyFailure(error: unknown): FailureInfo {
  const fullMessage = error instanceof Error ? error.message : String(error);
  const message = fullMessage.slice(0, MESSAGE_LIMIT);

  if (error instanceof ModelRefusalError) {
    return { kind: 'model-refusal', message, category: error.category };
  }
  if (error instanceof TruncatedResponseError) {
    return { kind: 'truncated', message };
  }
  if (error instanceof UnexpectedStopReasonError) {
    return { kind: 'unexpected-stop', message, stopReason: error.stopReason };
  }
  if (error instanceof StructuralParityError) {
    return { kind: 'parity', message };
  }
  if (error instanceof APIError) {
    const details: Pick<FailureInfo, 'status' | 'type'> = {};
    if (error.status !== undefined) details.status = error.status;
    if (error.type) details.type = error.type;
    if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
      return { kind: 'auth', message, ...details };
    }
    if (
      isRetryableAnthropicError(error) ||
      (error.status === undefined && !!error.type && MID_STREAM_INFRA_TYPES.has(error.type))
    ) {
      return { kind: 'infra', message, ...details };
    }
    return { kind: 'api-error', message, ...details };
  }
  if (isStreamCutShort(error)) {
    return { kind: 'infra', message };
  }
  if (fullMessage.startsWith('Document too large')) {
    return { kind: 'too-large', message };
  }
  if (fullMessage.includes('Document exceeded token limits')) {
    return { kind: 'incomplete', message };
  }
  if (fullMessage.includes('response contained no text')) {
    return { kind: 'no-text', message };
  }
  return { kind: 'error', message };
}

/**
 * The one stderr line a failed file gets, so that a log shows each failure's
 * class: `✗ <file>: <kind>[ (<category>)] — <message, first 200 characters>`.
 */
export function formatFailureLine(file: string, failure: FailureInfo): string {
  const category = failure.category ? ` (${failure.category})` : '';
  const text = failure.message.replace(/\s+/g, ' ').trim().slice(0, 200);
  return `✗ ${file}: ${failure.kind}${category} — ${text}`;
}

/** `after - before`, field by field: one lecture's share of a run's usage. */
export function usageSince(before: ApiUsage, after: ApiUsage): ApiUsage {
  return {
    inputTokens: after.inputTokens - before.inputTokens,
    outputTokens: after.outputTokens - before.outputTokens,
    thinkingTokens: after.thinkingTokens - before.thinkingTokens,
    cacheCreationInputTokens: after.cacheCreationInputTokens - before.cacheCreationInputTokens,
    cacheReadInputTokens: after.cacheReadInputTokens - before.cacheReadInputTokens,
    apiCalls: after.apiCalls - before.apiCalls,
  };
}

export const INIT_REPORT_SCHEMA = 'translate-init-report/1';

/** One lecture of an init run. */
export interface LectureReport {
  /** The lecture's path under the docs folder, as `_toc.yml` names it. */
  file: string;
  outcome: 'ok' | 'failed';
  /** failed only. */
  failure?: FailureInfo;
  /** Translation, checks and write; the state-file write excluded. */
  elapsedMs: number;
  /** ok only: the final response's input + output tokens (the Markdown report's figure). */
  tokensUsed?: number;
  /** ok only: characters written to the target file. */
  outputChars?: number;
  /**
   * `--parallel 1` only: this lecture's API usage, every call that returned a
   * final message (refused, truncated and parity-failed ones included). An
   * attempt that threw before its final message, every retried one among them,
   * adds none; `retries` counts the retried ones.
   */
  usage?: ApiUsage;
  /** `--parallel 1` only: attempts retried after a transient error. */
  retries?: number;
}

/** The report `translate init --report-json` writes. */
export interface InitRunReport {
  schema: typeof INIT_REPORT_SCHEMA;
  /** package.json version of the translate CLI that ran. */
  toolVersion: string;
  /** The @anthropic-ai/sdk version that ran: a checkout can run on another's node_modules. */
  sdkVersion: string;
  /** ISO 8601. */
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  /** The requested model. */
  model: string;
  /** The model's request policy (`requestPolicyFor`); absent fields are null. */
  requestPolicy: {
    label: string;
    thinking: NonNullable<ModelRequestPolicy['thinking']> | null;
    effort: NonNullable<ModelRequestPolicy['effort']> | null;
    alwaysThinks: boolean;
  };
  maxTokens: { fullDocument: number };
  sourceLanguage: string;
  targetLanguage: string;
  /** The resolved localization rules ([] for `--localize none`). */
  localize: string[];
  glossaryTerms: number;
  parallel: number;
  /**
   * The whole run's API usage: every call that returned a final message,
   * refused, truncated and parity-failed ones included. An attempt that threw
   * before its final message, every retried one among them, returns no usage
   * (so it is in neither `usage`, `apiCalls` included, nor the cost); `retries`
   * counts the retried ones.
   */
  usage: ApiUsage;
  /** `usage` at the model's list price (model-pricing.ts); null when unpriced. */
  costUSD: number | null;
  /** Every model the API reported serving, sorted. */
  servedModels: string[];
  /** Attempts retried after a transient error. */
  retries: number;
  /** total = ok + failed + skipped. */
  summary: { total: number; ok: number; failed: number; skipped: number };
  /** Every lecture translated or failed in this run, in run order. */
  lectures: LectureReport[];
}

/**
 * Write a report as JSON, creating its directory. It goes to a temporary file
 * first and is renamed into place, so a killed run leaves no half-written
 * report. Returns the absolute path.
 */
export function writeRunReport(reportPath: string, report: InitRunReport): string {
  const target = path.resolve(reportPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  fs.renameSync(temporary, target);
  return target;
}

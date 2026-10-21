/**
 * A fake Anthropic Messages API behind `globalThis.fetch`, for tests that run
 * the REAL @anthropic-ai/sdk (its request builder, SSE parser and stream
 * accumulator) instead of mocking the SDK module.
 *
 * Install it BEFORE constructing the code under test: the SDK client reads
 * `fetch` once, in its constructor (`options.fetch ?? getDefaultFetch()`).
 * Queued replies are served one per request, in order. A request with nothing
 * queued is answered with an HTTP 400 — a BadRequestError, which no call site
 * retries — so an unexpected extra request fails loudly, and it is still
 * recorded in `requests`.
 *
 * The wire shapes are the ones SDK 0.131 reads:
 * - Streamed (`body.stream === true`): `content-type: text/event-stream`, and
 *   every frame is `event: <type>\ndata: <json>\n\n` (the SDK drops a frame
 *   with no `event:` line). `message_start` carries the message with
 *   `stop_details: null` and a `usage` object, which the accumulator writes
 *   into; `message_delta` carries `delta: {stop_reason, stop_sequence,
 *   stop_details, container}` and the final `usage.output_tokens`. Each text
 *   block arrives as two `text_delta`s, and the bytes in 7-byte chunks, which
 *   split lines and multi-byte characters as a network can.
 * - Non-streamed: the whole Message as `application/json` (without that
 *   content type the SDK returns the body as a string).
 */

import type Anthropic from '@anthropic-ai/sdk';

/** A content block of a fake reply. */
export type FakeContentBlock =
  | { type: 'text'; text: string }
  // `thinking` is '' under the API's default `display: 'omitted'`; a
  // non-empty one is streamed as a `thinking_delta`, as `display: 'summarized'` is.
  | { type: 'thinking'; thinking: string; signature: string };

/** What the fake API answers to one request. */
export interface FakeReply {
  content: FakeContentBlock[];
  stop_reason: Anthropic.StopReason | null;
  /** The API sets it only with stop_reason 'refusal'; null otherwise (the default). */
  stop_details?: Anthropic.RefusalStopDetails | null;
  /** Billed tokens. Default: 120 in, 40 out. */
  usage?: { input_tokens: number; output_tokens: number };
}

/** One request as the SDK sent it over the wire. */
export interface RecordedRequest {
  readonly method: string;
  readonly url: string;
  /** Header names lower-cased. */
  readonly headers: Readonly<Record<string, string>>;
  /** The body exactly as sent (JSON text, '' when it was not a string). */
  readonly rawBody: string;
  /** The parsed body, keys in the order the SDK serialized them ({} if unparseable). */
  readonly body: Readonly<Record<string, unknown>>;
}

export interface FakeAnthropicApi {
  /** Every request received so far, in order, unanswered ones included. */
  readonly requests: readonly RecordedRequest[];
  /** Queue replies, served one per request in order. */
  reply(...replies: FakeReply[]): void;
  /** Put the real fetch back. */
  restore(): void;
}

const DEFAULT_USAGE = { input_tokens: 120, output_tokens: 40 };

/** Small, so boundaries land mid-line and, in non-ASCII text, mid-character. */
const STREAM_CHUNK_BYTES = 7;

/** Stub `globalThis.fetch` with the fake API until `restore()`. */
export function installFakeAnthropicApi(): FakeAnthropicApi {
  const requests: RecordedRequest[] = [];
  const queue: FakeReply[] = [];

  const spy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const rawBody = typeof init?.body === 'string' ? init.body : '';
    const body = parseJsonObject(rawBody);
    requests.push({
      method: init?.method ?? 'GET',
      url,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      rawBody,
      body: body ?? {},
    });
    const serial = requests.length;

    if (!url.endsWith('/v1/messages')) {
      return invalidRequest(serial, `unexpected endpoint ${url}`);
    }
    if (!body) {
      return invalidRequest(serial, `request ${serial} has no JSON object body`);
    }
    const reply = queue.shift();
    if (!reply) {
      return invalidRequest(serial, `no reply queued for request ${serial}`);
    }

    const message = completeMessage(serial, String(body.model), reply);
    return body.stream === true
      ? sseResponse(serial, streamEvents(message, reply.content))
      : jsonResponse(serial, 200, message);
  });

  return {
    requests,
    reply(...replies: FakeReply[]): void {
      queue.push(...replies);
    },
    restore(): void {
      spy.mockRestore();
    },
  };
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}

function usageBlock(inputTokens: number, outputTokens: number): Anthropic.Usage {
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation: null,
    inference_geo: null,
    output_tokens_details: null,
    server_tool_use: null,
    service_tier: 'standard',
  };
}

/** The complete Message the reply amounts to, echoing the requested model. */
function completeMessage(serial: number, model: string, reply: FakeReply): Anthropic.Message {
  const usage = { ...DEFAULT_USAGE, ...reply.usage };
  return {
    id: `msg_fake_${serial}`,
    type: 'message',
    role: 'assistant',
    model,
    content: reply.content.map(
      (block): Anthropic.ContentBlock =>
        block.type === 'text'
          ? { type: 'text', text: block.text, citations: null }
          : { type: 'thinking', thinking: block.thinking, signature: block.signature }
    ),
    container: null,
    diagnostics: null,
    stop_reason: reply.stop_reason,
    stop_sequence: null,
    stop_details: reply.stop_details ?? null,
    usage: usageBlock(usage.input_tokens, usage.output_tokens),
  };
}

/** The server-sent events that stream `message`, in order. */
function streamEvents(
  message: Anthropic.Message,
  blocks: FakeContentBlock[]
): Anthropic.RawMessageStreamEvent[] {
  const events: Anthropic.RawMessageStreamEvent[] = [
    {
      type: 'message_start',
      message: {
        ...message,
        content: [],
        stop_reason: null,
        stop_details: null,
        // Output so far; the final count arrives on message_delta.
        usage: usageBlock(message.usage.input_tokens, 1),
      },
    },
  ];

  blocks.forEach((block, index) => {
    if (block.type === 'text') {
      events.push({
        type: 'content_block_start',
        index,
        content_block: { type: 'text', text: '', citations: null },
      });
      for (const piece of inTwo(block.text)) {
        events.push({
          type: 'content_block_delta',
          index,
          delta: { type: 'text_delta', text: piece },
        });
      }
    } else {
      events.push({
        type: 'content_block_start',
        index,
        content_block: { type: 'thinking', thinking: '', signature: '' },
      });
      if (block.thinking) {
        events.push({
          type: 'content_block_delta',
          index,
          delta: { type: 'thinking_delta', thinking: block.thinking },
        });
      }
      events.push({
        type: 'content_block_delta',
        index,
        delta: { type: 'signature_delta', signature: block.signature },
      });
    }
    events.push({ type: 'content_block_stop', index });
  });

  events.push(
    {
      type: 'message_delta',
      delta: {
        stop_reason: message.stop_reason,
        stop_sequence: message.stop_sequence,
        stop_details: message.stop_details,
        container: null,
      },
      usage: {
        output_tokens: message.usage.output_tokens,
        input_tokens: null,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        output_tokens_details: null,
        server_tool_use: null,
      },
    },
    { type: 'message_stop' }
  );
  return events;
}

/** A text as two deltas, so the accumulator has to join them. */
function inTwo(text: string): string[] {
  const characters = Array.from(text);
  const half = Math.ceil(characters.length / 2);
  return [characters.slice(0, half).join(''), characters.slice(half).join('')].filter(
    (piece) => piece !== ''
  );
}

function sseResponse(serial: number, events: Anthropic.RawMessageStreamEvent[]): Response {
  const bytes = new TextEncoder().encode(
    events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('')
  );
  let offset = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + STREAM_CHUNK_BYTES));
      offset += STREAM_CHUNK_BYTES;
    },
  });
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'request-id': `req_fake_${serial}`,
    },
  });
}

function jsonResponse(serial: number, status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', 'request-id': `req_fake_${serial}` },
  });
}

function invalidRequest(serial: number, message: string): Response {
  return jsonResponse(serial, 400, {
    type: 'error',
    error: { type: 'invalid_request_error', message: `fake-anthropic-api: ${message}` },
  });
}

/**
 * A fake Anthropic Messages API for CHILD processes: `NODE_OPTIONS="--import <this file>"` replaces
 * `globalThis.fetch` before any module loads, so the real SDK inside a spawned `translate init`
 * talks to it and nothing reaches the network. eval-tooling.test.ts runs rate-check.sh end to end
 * through it, at no cost. (In-process tests use src/test-support/fake-anthropic-api.ts; the wire
 * shapes are the same ones SDK 0.131 reads.)
 *
 * The reply depends on the target language the prompt names ("… from en to <lang>."):
 *   zh-cn  the source document echoed back, end_turn — a "translation" every guard accepts
 *   fa     a streamed refusal, stop_details.category 'bio'
 *   ml     HTTP 529 overloaded_error on every attempt — the engine retries, then an infra failure
 *   fr     HTTP 400 invalid_request_error — not retried, not infra (an api-error)
 *   de     no answer for 60 s — a draw still running when the test interrupts the run
 * Anything else, or a request it cannot read, gets a 400. With FAKE_ANTHROPIC_HANG set, every
 * request gets no answer for 60 s, whatever its language: the draws of that one invocation (a
 * resume, say) are still running when the test interrupts it.
 */

const CHUNK_BYTES = 7; // split lines and multi-byte characters, as a network can

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', 'request-id': 'req_fake_preload' },
  });
}

function apiError(status, type, message) {
  return jsonResponse(status, { type: 'error', error: { type, message } });
}

function usage(inputTokens, outputTokens) {
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

function sse(model, text, stopReason, stopDetails) {
  const events = [
    {
      type: 'message_start',
      message: {
        id: 'msg_fake_preload',
        type: 'message',
        role: 'assistant',
        model,
        content: [],
        container: null,
        diagnostics: null,
        stop_reason: null,
        stop_sequence: null,
        stop_details: null,
        usage: usage(1000, 1),
      },
    },
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '', citations: null },
    },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: {
        stop_reason: stopReason,
        stop_sequence: null,
        stop_details: stopDetails,
        container: null,
      },
      usage: {
        output_tokens: 500,
        input_tokens: null,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        output_tokens_details: { thinking_tokens: 0 },
        server_tool_use: null,
      },
    },
    { type: 'message_stop' },
  ];
  const bytes = new TextEncoder().encode(
    events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('')
  );
  let offset = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + CHUNK_BYTES));
      offset += CHUNK_BYTES;
    },
  });
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'request-id': 'req_fake_preload',
    },
  });
}

async function noAnswer() {
  await new Promise((resolve) => setTimeout(resolve, 60_000));
  return apiError(400, 'invalid_request_error', 'fake: answered after 60 s');
}

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (process.env.FAKE_ANTHROPIC_HANG) return noAnswer();
  if (!url.endsWith('/v1/messages'))
    return apiError(400, 'invalid_request_error', `fake: unexpected endpoint ${url}`);
  let body;
  try {
    body = JSON.parse(typeof init?.body === 'string' ? init.body : '');
  } catch {
    return apiError(400, 'invalid_request_error', 'fake: request body is not JSON');
  }
  const prompt = (body.messages ?? [])
    .flatMap((m) =>
      Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content) }]
    )
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
  const lang = /from \S+ to (\S+?)\.\s/.exec(prompt)?.[1];
  const source = /CONTENT:\n([\s\S]*)\n\nProvide the complete translated document/.exec(
    prompt
  )?.[1];
  switch (lang) {
    case 'zh-cn':
      if (source === undefined)
        return apiError(400, 'invalid_request_error', 'fake: no CONTENT block');
      return sse(body.model, source, 'end_turn', null);
    case 'fa':
      return sse(body.model, 'I cannot help with', 'refusal', {
        type: 'refusal',
        category: 'bio',
        explanation: 'fake refusal for the test',
      });
    case 'ml':
      return apiError(529, 'overloaded_error', 'Overloaded');
    case 'fr':
      return apiError(400, 'invalid_request_error', 'fake: rejected for the test');
    case 'de':
      return noAnswer();
    default:
      return apiError(400, 'invalid_request_error', `fake: no reply for language ${lang}`);
  }
};

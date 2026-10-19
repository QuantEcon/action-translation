// fake-api.mjs — a fake Anthropic Messages API behind globalThis.fetch, for $0 runs of the real
// SDK: preload it with `node --import <this file> <script>` (the CLI, judge.mjs, ...). It is the
// R1 instrument of engine-aa.mjs and the dry-run harness of the other scripts; it never forwards
// a request anywhere. The wire shapes follow src/test-support/fake-anthropic-api.ts (SSE frames as
// `event: <type>\ndata: <json>\n\n`, stop_details on message_delta, the whole Message as JSON for
// a non-streamed call), which works with SDK 0.131 and, through globalThis.fetch, with 0.78.
//
// FAKE_API_SCRIPT   a JSON file saying what to answer (below); required
// FAKE_API_LOG      append one JSON line per request: { url, method, headers, rawBody }
// FAKE_API_COUNTER  a file whose size counts requests across processes (mode "echo" outcomes)
//
// Script modes:
//   { "mode": "replies", "replies": [Reply, ...], "then": "repeat-last" | "error" }
//       served one per request, in order, within a process
//   { "mode": "echo", "outcomes": ["ok", "refusal:bio", "truncated", "overloaded", "parity"],
//     "outcomesByModel": { "<model>": [...] }, "doubleWordsForModel": "<model>" }
//       a whole-document translation request is answered with its own CONTENT section (an
//       identity "translation"), shaped by the next outcome in the cycle (default ["ok"]; a
//       model's own cycle when listed); doubleWordsForModel writes " the the " for " the " in
//       that model's echoes (longer prose, same structure), so a judge has something to prefer
//   { "mode": "judge", "verdict": "first" | "second" | "tie" | "longer" | "shorter",
//     "refuseEvery": N, "garbageEvery": N }
//       a judge request is answered {"winner": "1"|"2"|"tie", "reason": "..."} as text, the reason
//       quoting MyST and math with braces as a real judge's does; every Nth request refuses, or
//       returns prose with no JSON
//   Any mode: "delayMs": N holds every reply N ms (a draw still running when a test stops it).
// Reply: { "text": "...", "textFile": "path", "stop_reason": "end_turn", "stop_details": {...},
//          "midStreamError": { "type": "overloaded_error", "message": "Overloaded" },
//          "usage": { "input_tokens": n, "output_tokens": n }, "thinking": true }

/* global globalThis */
import fs from 'node:fs';

const script = (() => {
  const file = process.env.FAKE_API_SCRIPT;
  if (!file) throw new Error('fake-api.mjs: FAKE_API_SCRIPT is not set');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
})();

let served = 0;
const CHUNK = 7; // bytes per stream chunk: boundaries land mid-line and mid-character

function nextCount() {
  const file = process.env.FAKE_API_COUNTER;
  if (!file) return served;
  fs.appendFileSync(file, 'x');
  return fs.statSync(file).size - 1;
}

function usageBlock(input, output) {
  return {
    input_tokens: input,
    output_tokens: output,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation: null,
    inference_geo: null,
    output_tokens_details: null,
    server_tool_use: null,
    service_tier: 'standard',
  };
}

/** The text of the last user message of a request body. */
function userText(body) {
  const last = [...(body.messages ?? [])].reverse().find((m) => m.role === 'user');
  if (!last) return '';
  if (typeof last.content === 'string') return last.content;
  return last.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/** A whole-document request's CONTENT section (the translator's volatile suffix). */
function documentOf(body) {
  const text = userText(body);
  const start = text.lastIndexOf('\nCONTENT:\n');
  if (start === -1) return null;
  const rest = text.slice(start + '\nCONTENT:\n'.length);
  const end = rest.lastIndexOf('\n\nProvide the complete translated document');
  return end === -1 ? rest : rest.slice(0, end);
}

function replyFor(body) {
  const n = served++;
  if (script.mode === 'replies') {
    const list = script.replies ?? [];
    if (n < list.length) return list[n];
    if (script.then === 'repeat-last' && list.length) return list[list.length - 1];
    return { httpStatus: 400, errorType: 'invalid_request_error', message: `fake-api: no reply for request ${n + 1}` };
  }
  if (script.mode === 'echo') {
    let doc = documentOf(body);
    if (doc === null) return { text: 'fake-api: not a whole-document request', stop_reason: 'end_turn' };
    if (script.doubleWordsForModel === body.model) doc = doc.replace(/ the /g, ' the the ');
    const outcomes = script.outcomesByModel?.[body.model] ?? script.outcomes ?? ['ok'];
    const outcome = outcomes[nextCount() % outcomes.length];
    if (outcome === 'ok') return { text: doc, stop_reason: 'end_turn' };
    if (outcome === 'truncated') return { text: doc.slice(0, Math.floor(doc.length / 2)), stop_reason: 'max_tokens' };
    if (outcome === 'overloaded') return { text: doc.slice(0, 200), midStreamError: { type: 'overloaded_error', message: 'Overloaded' } };
    if (outcome === 'parity') {
      // drop the first fenced directive line: the structural-parity guard refuses the result
      const lines = doc.split('\n');
      const i = lines.findIndex((l) => /^```\{/.test(l));
      if (i !== -1) lines.splice(i, 1);
      return { text: lines.join('\n'), stop_reason: 'end_turn' };
    }
    if (outcome.startsWith('refusal')) {
      return {
        text: doc.slice(0, 300),
        stop_reason: 'refusal',
        stop_details: { type: 'refusal', category: outcome.split(':')[1] ?? null, explanation: 'fake-api refusal' },
      };
    }
    throw new Error(`fake-api.mjs: unknown echo outcome ${outcome}`);
  }
  if (script.mode === 'judge') {
    if (script.refuseEvery && (n + 1) % script.refuseEvery === 0) {
      return { text: '', stop_reason: 'refusal', stop_details: { type: 'refusal', category: null, explanation: 'fake-api refusal' } };
    }
    if (script.garbageEvery && (n + 1) % script.garbageEvery === 0) return { text: 'I think the first one reads better overall.', stop_reason: 'end_turn' };
    const text = userText(body);
    const block = (k) => {
      const m = text.match(new RegExp(`<translation_${k}>\\n?([\\s\\S]*?)\\n?</translation_${k}>`));
      return m ? m[1] : '';
    };
    let winner = 'tie';
    if (script.verdict === 'first') winner = '1';
    else if (script.verdict === 'second') winner = '2';
    else if (script.verdict === 'longer' || script.verdict === 'shorter') {
      const a = block(1).length;
      const b = block(2).length;
      const firstWins = script.verdict === 'longer' ? a > b : a < b;
      winner = a === b ? 'tie' : firstWins ? '1' : '2';
    }
    // braces in the reason, as in a verdict on MyST, math or code
    return { text: JSON.stringify({ winner, reason: `fake-api: ${script.verdict ?? 'tie'}` + ' ({math} $\\beta^{t}$)' }), stop_reason: 'end_turn' };
  }
  throw new Error(`fake-api.mjs: unknown mode ${script.mode}`);
}

function message(body, reply) {
  const text = reply.textFile ? fs.readFileSync(reply.textFile, 'utf8') : (reply.text ?? '');
  const content = [];
  if (reply.thinking) content.push({ type: 'thinking', thinking: '', signature: 'fake-signature' });
  content.push({ type: 'text', text, citations: null });
  const input = reply.usage?.input_tokens ?? Math.ceil(JSON.stringify(body).length / 4);
  const output = reply.usage?.output_tokens ?? Math.max(1, Math.ceil(text.length / 4));
  return {
    id: `msg_fake_${served}`,
    type: 'message',
    role: 'assistant',
    model: String(body.model),
    content,
    container: null,
    diagnostics: null,
    stop_reason: reply.midStreamError ? null : (reply.stop_reason ?? 'end_turn'),
    stop_sequence: null,
    stop_details: reply.stop_details ?? null,
    usage: usageBlock(input, output),
  };
}

function sse(events) {
  const bytes = new TextEncoder().encode(events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''));
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + CHUNK));
      offset += CHUNK;
    },
  });
}

function streamEvents(msg, reply) {
  const events = [{ type: 'message_start', message: { ...msg, content: [], stop_reason: null, stop_details: null, usage: usageBlock(msg.usage.input_tokens, 1) } }];
  msg.content.forEach((block, index) => {
    if (block.type === 'thinking') {
      events.push({ type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '', signature: '' } });
      events.push({ type: 'content_block_delta', index, delta: { type: 'signature_delta', signature: block.signature } });
    } else {
      events.push({ type: 'content_block_start', index, content_block: { type: 'text', text: '', citations: null } });
      const chars = Array.from(block.text);
      const half = Math.ceil(chars.length / 2);
      for (const piece of [chars.slice(0, half).join(''), chars.slice(half).join('')]) {
        if (piece) events.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: piece } });
      }
    }
    if (!(reply.midStreamError && index === msg.content.length - 1)) events.push({ type: 'content_block_stop', index });
  });
  if (reply.midStreamError) {
    events.push({ type: 'error', error: { type: reply.midStreamError.type, message: reply.midStreamError.message } });
    return events;
  }
  events.push({
    type: 'message_delta',
    delta: { stop_reason: msg.stop_reason, stop_sequence: null, stop_details: msg.stop_details, container: null },
    usage: { output_tokens: msg.usage.output_tokens, input_tokens: null, cache_creation_input_tokens: null, cache_read_input_tokens: null, output_tokens_details: null, server_tool_use: null },
  });
  events.push({ type: 'message_stop' });
  return events;
}

function json(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json', 'request-id': `req_fake_${served}` } });
}

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const rawBody = typeof init.body === 'string' ? init.body : '';
  if (process.env.FAKE_API_LOG) {
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    fs.appendFileSync(process.env.FAKE_API_LOG, `${JSON.stringify({ url, method: init.method ?? 'GET', headers, rawBody })}\n`);
  }
  if (!/\/v1\/messages(\?|$)/.test(url)) return json(404, { type: 'error', error: { type: 'not_found_error', message: `fake-api: no route for ${url}` } });
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json(400, { type: 'error', error: { type: 'invalid_request_error', message: 'fake-api: body is not JSON' } });
  }
  const reply = replyFor(body);
  if (script.delayMs) await new Promise((resolve) => setTimeout(resolve, script.delayMs));
  if (reply.httpStatus) return json(reply.httpStatus, { type: 'error', error: { type: reply.errorType ?? 'api_error', message: reply.message ?? 'fake-api error' } });
  const msg = message(body, reply);
  if (body.stream === true) {
    return new Response(sse(streamEvents(msg, reply)), { status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8', 'request-id': `req_fake_${served}` } });
  }
  if (reply.midStreamError) return json(529, { type: 'error', error: reply.midStreamError });
  return json(200, msg);
};

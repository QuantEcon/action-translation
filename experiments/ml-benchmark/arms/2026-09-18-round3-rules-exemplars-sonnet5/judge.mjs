// Blind pairwise style judge.
//
// For each item and each requested arm pair, shows the English paragraph, the
// editor's reviewed Malayalam as the reference, and the two arms' renderings
// in RANDOM order, and asks which is closer to the reference in STYLE only.
// Identical candidates are scored TIE without a call. Position is recorded so
// position bias can be checked afterwards.
//
// usage: node judge.mjs items-<lecture>.json "fA:fB,fB:fBex" [judgements.json]

import fs from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

const [itemsPath, pairSpec, outPath = 'judgements.json'] = process.argv.slice(2);
const MODEL = 'claude-opus-5';
const CONCURRENCY = 6;

const items = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));
const pairs = pairSpec.split(',').map((p) => p.split(':'));
const client = new Anthropic();

const Verdict = z.object({
  winner: z.enum(['A', 'B', 'TIE']),
  reason: z.string(),
});

const SYSTEM = `You are a senior Malayalam copy-editor calibrating a translation tool for QuantEcon's lecture series. The edition follows a keep-English policy: technical terms stay in Latin script and Malayalam supplies the grammatical connective tissue.

You will see an English paragraph, the REFERENCE — the native-speaker editor's approved Malayalam for it — and two candidate machine renderings, A and B. Decide which candidate is closer to the REFERENCE in STYLE:

- register and rhythm (teacher's classroom voice; hortative നമുക്ക് … -ആം rather than plain future)
- punctuation: where commas fall at clause boundaries, terminal colon / full stop
- verb forms: aspect and mood (e.g. -തിരിക്കുന്ന vs bare past participle, conditional -ആൽ, -ആം vs bare imperative)
- clause order and sentence splitting
- which ordinary words stay in English and which are rendered in Malayalam, and how English roots take suffixes

Judge style resemblance, not meaning fidelity and not overall quality. Two renderings that say the same thing with different vocabulary but the same rhythm and grammar are a TIE. Answer TIE when the candidates are equally close or the differences are not stylistic. Give a one-sentence reason naming the decisive feature.`;

function buildUser(item, a, b) {
  return `ENGLISH:
${item.en}

REFERENCE (editor's approved Malayalam):
${item.ref}

CANDIDATE A:
${a}

CANDIDATE B:
${b}`;
}

const existing = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : [];
const done = new Set(existing.map((j) => j.key));
const results = [...existing];

const tasks = [];
for (const [x, y] of pairs) {
  items.forEach((item, idx) => {
    const key = `${item.lecture}|${item.draw}|${idx}|${x}:${y}`;
    if (done.has(key)) return;
    const cx = item.candidates[x];
    const cy = item.candidates[y];
    if (cx === undefined || cy === undefined) return;
    tasks.push({ key, item, idx, x, y, cx, cy });
  });
}
console.error(`${tasks.length} comparisons to run (${existing.length} already done)`);

let cursor = 0;
let calls = 0;
async function worker() {
  while (cursor < tasks.length) {
    const t = tasks[cursor++];
    if (t.cx === t.cy) {
      results.push({ key: t.key, pair: `${t.x}:${t.y}`, draw: t.item.draw, idx: t.idx, winner: 'TIE', identical: true });
      continue;
    }
    const swap = Math.random() < 0.5;
    const [a, b] = swap ? [t.cy, t.cx] : [t.cx, t.cy];
    try {
      const response = await client.messages.parse({
        model: MODEL,
        max_tokens: 2048,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: buildUser(t.item, a, b) }],
        output_config: { format: zodOutputFormat(Verdict), effort: 'medium' },
      });
      calls++;
      const v = response.parsed_output;
      if (!v) throw new Error('unparsed verdict');
      // map back from displayed position to arm
      const winnerArm = v.winner === 'TIE' ? 'TIE' : (v.winner === 'A') !== swap ? t.x : t.y;
      results.push({
        key: t.key, pair: `${t.x}:${t.y}`, draw: t.item.draw, idx: t.idx,
        winner: winnerArm, position: v.winner, swap, reason: v.reason,
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) {
        await new Promise((r) => setTimeout(r, 15000));
        cursor--; // retry this task
        continue;
      }
      if (err instanceof Anthropic.APIError) {
        console.error(`API error ${err.status} on ${t.key}: ${err.message}`);
        results.push({ key: t.key, pair: `${t.x}:${t.y}`, draw: t.item.draw, idx: t.idx, winner: 'ERROR', error: String(err.message) });
        continue;
      }
      throw err;
    }
    if (results.length % 50 === 0) {
      fs.writeFileSync(outPath, JSON.stringify(results, null, 1));
      console.error(`${results.length} judged (${calls} calls)`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
fs.writeFileSync(outPath, JSON.stringify(results, null, 1));
console.error(`done: ${results.length} judgements, ${calls} API calls`);

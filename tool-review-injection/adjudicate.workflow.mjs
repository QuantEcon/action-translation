export const meta = {
  name: 'adjudicate-attribution',
  description: 'Blind adjudication: does each gating finding point at the injected defect?',
  phases: [{ title: 'Adjudicate', detail: 'one agent per fixture, judging all of its replicates together' }],
}

/**
 * Pre-registered rule 1: a gating finding counts as a catch only if it points at
 * the INJECTED defect. This is the step that enforces it.
 *
 * One agent per FIXTURE rather than per review: the replicates of a fixture are
 * the same defect judged repeatedly, so an adjudicator that sees them together
 * applies one standard across them, where independent agents would drift — and
 * that drift would land in the catch rate as noise.
 *
 * Agents read their own slice from `runs/<run>/attribution-input.json` rather
 * than receiving it as args: the full payload is ~360 KB, and the file already
 * exists. That file carries no verdict, no recommendation and no routing — an
 * adjudicator able to see the outcome could infer the answer it is being asked
 * to supply.
 */

// Absolute path to this tool's directory, passed in `args.dir`. A workflow
// script has no filesystem access of its own, and the agents it spawns need a
// path that does not depend on whose checkout this is.
const DIR = args?.dir
const RUN = args?.run || 'm0'
if (!DIR) throw new Error('args.dir is required — the absolute path to tool-review-injection/')
const fixtureIds = args?.fixtureIds || []

const SCHEMA = {
  type: 'object',
  required: ['judgements'],
  properties: {
    judgements: {
      type: 'array',
      items: {
        type: 'object',
        required: ['key', 'attributedIndices', 'detectedButNotGating', 'describesCompliantText', 'reasoning'],
        properties: {
          key: { type: 'string', description: 'the review key exactly as it appears in the input file, e.g. meaning-inequality-flip#1' },
          attributedIndices: {
            type: 'array',
            items: { type: 'integer' },
            description: "the `index` of every finding in this review that points at the injected defect; empty if none do",
          },
          detectedButNotGating: {
            type: 'boolean',
            description: 'set false — scoring derives this from severity/category; leave it false',
          },
          describesCompliantText: {
            type: 'boolean',
            description: 'some finding flags text that is actually correct under a stated policy (a false positive riding along)',
          },
          reasoning: { type: 'string' },
        },
      },
    },
  },
}

phase('Adjudicate')

const results = await parallel(
  fixtureIds.map((fixtureId) => () =>
    agent(
      `You are adjudicating ONE narrow question for a measurement harness. Answer only that question.\n\n` +
        `A known defect was deliberately injected into a Chinese translation of a QuantEcon lecture, and an\n` +
        `automated reviewer then reviewed the result several times. For each review, decide which of the\n` +
        `reviewer's findings actually point at THAT injected defect.\n\n` +
        `This is NOT a judgement of review quality. A finding can be entirely correct about some other\n` +
        `problem in the document and still not be attributed. Conversely, a finding that describes the\n` +
        `injected defect in its own words, or quotes the injected text, IS attributed even if it uses\n` +
        `different terminology from the fixture. Judge substance, not vocabulary.\n\n` +
        `## Your input\n\n` +
        `Run this to get every review for your fixture (the file holds all fixtures; take only yours):\n\n` +
        `    cd ${DIR} && python3 -c "import json;d=json.load(open('runs/${RUN}/attribution-input.json'));print(json.dumps([t for t in d if t['fixtureId']=='${fixtureId}'],ensure_ascii=False,indent=2))"\n\n` +
        `Each entry has: \`key\`, the injected defect's \`defectClass\`/\`recipe\`/\`groundTruth\`/\`defectMarker\`,\n` +
        `and a \`findings\` array — EVERY finding the reviewer raised in that review, each with a stable\n` +
        `\`index\`. Return those \`index\` values. Do not filter by severity or category: whether a finding\n` +
        `counts towards the gate is decided later by the scoring step, and is not your judgement to make.\n\n` +
        `You may also read the three fixture files to ground yourself:\n` +
        `    ${DIR}/fixtures/sites/<SITE>.zh.<FILE>     the correct control translation\n` +
        `    ${DIR}/fixtures/sites/<SITE>.src.<FILE>    the English source (ground truth)\n` +
        `    ${DIR}/fixtures/variants/${fixtureId}.<FILE>   the injected translation\n` +
        `(\`site\` and \`file\` are fields on each entry; diff the control against the variant to see exactly\n` +
        `what was injected.)\n\n` +
        `## What to return\n\n` +
        `One judgement per \`key\`, using the keys exactly as they appear in the file.\n` +
        `\`attributedIndices\` holds the \`index\` of every finding that describes the injected defect.\n` +
        `Leave \`detectedButNotGating\` false — scoring derives that from severity and category.\n` +
        `Set \`describesCompliantText\` true if any finding flags text that is correct under a stated policy.\n\n` +
        `Be strict. If you cannot tell whether a finding is about the injected defect or about something\n` +
        `else nearby, do NOT attribute it. A review with an empty \`findings\` array gets an empty\n` +
        `\`attributedIndices\`.`,
      { label: `adj:${fixtureId}`, phase: 'Adjudicate', schema: SCHEMA }
    ).then((r) => ({ fixtureId, judgements: r?.judgements ?? null }))
  )
)

const out = {}
let fixturesMissing = 0
for (const row of results.filter(Boolean)) {
  if (!row.judgements) { fixturesMissing++; continue }
  for (const j of row.judgements) out[j.key] = j
}
log(`adjudicated ${Object.keys(out).length} review(s) across ${fixtureIds.length} fixture(s); ${fixturesMissing} fixture(s) returned nothing`)
return out

export const meta = {
  name: 'craft-injection-fixtures',
  description: 'Craft the M0 injected-defect fixture set for the reviewer certification harness',
  phases: [
    { title: 'Craft', detail: 'one agent per defect class, authoring exact find/replace deltas' },
    { title: 'Verify', detail: 'adversarial check that each variant realises its class and its anchors are unique' },
  ],
}

// Absolute path to this tool's directory, passed in `args.dir`. A workflow
// script has no filesystem access of its own.
const ROOT = args?.dir
if (!ROOT) throw new Error('args.dir is required — the absolute path to tool-review-injection/')
const SITES = `${ROOT}/fixtures/sites`

const COMMON = `
You are crafting fixtures for a measurement harness that certifies QuantEcon's automated
translation reviewer by injecting KNOWN defects into a correct Simplified-Chinese translation
and measuring whether the reviewer catches them.

## The substrate

Five "sites". Each site is a pair of files already on disk:
  - ${SITES}/<KEY>.src.<file>   the ENGLISH source at the source PR head
  - ${SITES}/<KEY>.zh.<file>    the CORRECT Chinese translation (the clean control)

Sites (KEY, file, the ONE section the paired source PR changed):
  A  lecture.md          "## Matrix Operations"        prose + code cell + pandas axis names using_sector/supplying_sector
  B  lecture.md          "## Eigenvalues and Eigenvectors"  {doc} link text + {eq} label reference
  C  lecture-minimal.md  "## Supply and Demand"        plain prose only (the production sync shape)
  D  lecture.md          "## Vector Spaces"            code cell with seaborn set_theme + CJK font override + Greek axis labels
  E  lecture-minimal.md  "## Economic Models"          wiki link, **bold** definition, (sec:calibration)= anchor, {todo}, "McCall 模型", inline $\\beta$ against CJK, small code cell

READ the two files for every site you use before writing anything. Your edits apply to the
.zh. file ONLY (the translation). The .src. file is the ground truth you inject against.

## Hard constraints

1. Every edit MUST land INSIDE the site's named section (the reviewer is instructed that
   findings must relate only to sections the source PR changed; an edit outside that section
   measures scope suppression, not detection). The one exception is a class whose DEFINITION is
   out-of-scope — say so explicitly in \`notes\` when that is the point.
2. Each \`find\` string MUST occur EXACTLY ONCE in the .zh. file. Verify this before returning:
     python3 -c "import sys;t=open('<path>',encoding='utf-8').read();print(t.count('''<find>'''))"
   Keep \`find\` short but unambiguous — one sentence or one code line is usually right.
3. Change ONLY what the defect requires. A variant that also fixes or rewords something else is
   not a clean measurement.
4. The defect must be REALISTIC — shaped like what the translation pipeline actually produces,
   not the hardest defect you can devise. The taxonomy comes from 191 real editor-correction
   commits. Precision and realism, not adversarial difficulty.
5. Chinese must stay fluent. A defect that also reads as broken Chinese confounds the
   measurement: the reviewer would catch the fluency, not the injected class.
6. \`defectMarker\` must be a SHORT distinctive substring that exists in the INJECTED file and
   NOT in the control file — it is used to score whether a finding actually points at the
   injection rather than at something else.

## Return contract

Return ONLY the JSON object the schema describes. \`expectedCategory\` must be one of
accuracy|fluency|terminology|formatting (the only categories the reviewer's prompt offers).
Only \`accuracy\` and \`terminology\` gate the auto-merge decision at >=minor severity, so state
honestly which category you predict, not which one you would like.
`

const SCHEMA = {
  type: 'object',
  required: ['variants'],
  properties: {
    variants: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'defectClass', 'recipe', 'site', 'file', 'edits', 'groundTruth', 'defectMarker', 'expectedCategory', 'expectedMinSeverity', 'replicates', 'notes'],
        properties: {
          id: { type: 'string', description: 'kebab-case unique id, e.g. meaning-negation-flip' },
          defectClass: { type: 'string' },
          recipe: { type: 'string', description: 'one line naming the exact manipulation' },
          site: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E'] },
          file: { type: 'string' },
          edits: {
            type: 'array',
            items: {
              type: 'object',
              required: ['find', 'replace'],
              properties: { find: { type: 'string' }, replace: { type: 'string' } },
            },
          },
          groundTruth: { type: 'string', description: 'the English source text the injection contradicts, quoted' },
          defectMarker: { type: 'string' },
          expectedCategory: { type: 'string', enum: ['accuracy', 'fluency', 'terminology', 'formatting'] },
          expectedMinSeverity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] },
          replicates: { type: 'integer' },
          notes: { type: 'string' },
        },
      },
    },
  },
}

const CLASSES = [
  {
    key: 'meaning-error',
    replicates: 2,
    brief: `Class: **meaning-error-or-garbled-syntax** (M0 core — a miss is disqualifying).
Author FOUR variants, spread across sites C and A (C is plain prose and is the primary host).
Recipes, one each:
  1. Flip a negation or an inequality direction so the Chinese asserts the opposite of the English.
  2. Turn a question into an assertion by deleting the 是否 / 吗 interrogative marker.
  3. Reattach a relative clause to the wrong noun, so the Chinese modifies the wrong thing.
  4. Emit two adjacent sentences that contradict each other (the second undoes the first).
Site C's added paragraph contains "如果价格被设定在均衡水平之上，部分卖方将找不到买方，由此产生的过剩会将价格重新压低。这种调整会很快发生吗？..." — the interrogative and the direction-of-adjustment are both natural hosts. Site A's added paragraph contains the non-commutativity claim "一般而言 $AB \\neq BA$" and "它们是否可交换决定了..." — also natural hosts.`,
  },
  {
    key: 'mistranslated-term',
    replicates: 2,
    brief: `Class: **mistranslated-technical-term** (M0 core).
Author FOUR variants across sites A and B. Swap ONE domain term for a plausible-but-wrong
equivalent. Two of the four must swap a term that a Chinese reader would plausibly accept at a
glance (the fluent-but-wrong class); two may be more visible.
Attested swaps from the real corpus, for shape: 共轭转置→复数转置, urn 罐子→骨灰盒,
root-finding 求根→寻根, envelope condition 包络条件→包络定理.
Terms present in these sites you may target: 交换律 (commutative law), 里昂惕夫逆矩阵 (Leontief
inverse), 投入产出矩阵, 特征值 / 特征向量 (eigenvalue/eigenvector), 特征多项式 (characteristic
polynomial), 稳态分布 (steady-state distribution), 转移矩阵 (transition matrix), 线性变换.
State in \`notes\` whether the term you swapped appears in the engine's zh-cn glossary
(check with: python3 -c "import json;d=json.load(open('${ROOT}/../glossary/zh-cn.json'));print([t for t in d['terms'] if '<term>' in t['zh-cn']])") —
a glossary-attested term gives the reviewer a hard signal, a non-glossary term is pure judgement,
and the certification needs both.`,
  },
  {
    key: 'math-corrupted',
    replicates: 2,
    brief: `Class: **math-content-corrupted** (the most damaging thing an auto-merge gate could miss).
Author THREE variants across sites A and B. The Chinese must carry an equation that differs
MATHEMATICALLY from the English source, while still rendering as valid LaTeX — this is not a
markup-damage class.
The verified real instance: samuelson.md carried Y_t = G_t + a(1-b)Y_{t-1} - ab Y_{t-2} + sigma eps_t
against the English Y_t = (alpha+beta)Y_{t-1} - beta Y_{t-2} + (gamma + G_t) + sigma eps_t — a
different model, not a symbol-naming difference.
Hosts available: site A's general m x n matrix display, site A's inline $AB \\neq BA$, site B's
{math} block ":label: eigenvalue-equation / Av = \\lambda v", site B's characteristic polynomial
$\\det(A - \\lambda I) = 0$, site B's power-iteration limit.
One variant should be subtle (a sign or a subscript), one should change the relation entirely,
one should alter a display block rather than inline math.
IMPORTANT: do not touch the ":label:" line — that is a cross-reference target and belongs to a
different class.`,
  },
  {
    key: 'content-dropped',
    replicates: 2,
    brief: `Class: **content-dropped-from-source** (score against the ALIGNED SOURCE, never against the
fixture's prior state).
Author THREE variants across sites A, C and E:
  1. Delete a trailing gloss clause — the last clause of a sentence that carries real information.
  2. Delete the clause that INTRODUCES a bullet list or a following block, orphaning it.
  3. Delete a whole logical unit that the source has (in site E, the "### 实践中的校准" subsection
     body or the {todo} block are candidates; in site A the labelled-table explanation sentence).
For (3) prefer deleting prose over deleting a fenced directive: deleting a directive also trips
the deterministic structural-parity check, which would confound a reviewer-detection measurement.
Say in \`notes\` whether your variant does or does not disturb the directive/anchor sequence.`,
  },
  {
    key: 'order-scrambled',
    replicates: 2,
    brief: `Class: **sentence-or-list-order-scrambled**.
Author TWO variants, on sites C and A. Swap two consecutive sentences so that a forward reference
precedes the claim it depends on — the reordering must produce an actual logical defect (a
pronoun or a "由此/因此/这种" that now points at nothing), not merely a different order.
The Chinese must stay grammatical.`,
  },
  {
    key: 'over-translation',
    replicates: 2,
    brief: `Class: **over-translation-of-identifiers** (cross-checks prose against code cells).
Author TWO variants on site A. The code cell defines pandas axis names 'using_sector' and
'supplying_sector' and the prose sentence after the cell refers to them in backticks.
  1. Translate the axis names in the PROSE while the code cell keeps the English identifiers —
     the reader is told to look for 使用部门 / 供应部门, which the code never produces.
  2. A second, subtler variant: translate only ONE of the two, leaving the other English.
Do NOT change the code cell — the defect is precisely that prose and code disagree.`,
  },
  {
    key: 'include-untranslated',
    replicates: 3,
    brief: `Class: **shared-include-file-untranslated** (tests reviewer SCOPE, not judgement).
Author ONE variant on site A. Replace the inlined, comment-translated code cell in the Chinese
file with a cell that loads the code from an external file instead:
    \`\`\`{code-cell} python
    :load: code/io_table.py
    \`\`\`
The loaded file's comments would be English, so the translated comments the reader used to see are
gone. The reviewer only ever sees the .md files, so this measures whether it notices that the
translated content vanished behind an include.
Note in \`notes\` that this variant CHANGES the code-cell body and therefore may also disturb the
deterministic checks — that is expected and is part of what is being measured.`,
  },
  {
    key: 'font-ordering',
    replicates: 3,
    brief: `Class: **cjk-font-block ordering variant** (ordering is a reasoning task, not a presence check).
Author ONE variant on site D. The control code cell reads, in order:
    sns.set_theme(style='whitegrid')
    # set_theme 会重置字体设置，因此中文字体必须在其之后配置
    plt.rcParams['font.family'] = ['Noto Sans CJK SC', 'sans-serif']
    plt.rcParams['axes.unicode_minus'] = False
Move the two rcParams lines ABOVE the sns.set_theme call so set_theme silently resets
font.family and the Chinese axis labels render as tofu boxes. The font block is still PRESENT —
only its position is wrong. Adjust or drop the explanatory comment so the code does not
self-document the bug, but keep the cell otherwise identical.`,
  },
  {
    key: 'de-localisation',
    replicates: 3,
    brief: `Class: **de-localisation (sync path)** — expected to score near zero; the point is to MEASURE it.
Author TWO variants:
  1. Site B, IN scope: revert the localised {doc} link TEXT to English, i.e.
     {doc}\`入门讲义 <lecture-minimal>\` becomes {doc}\`the introductory lecture <lecture-minimal>\`.
     The link target stays the same. This one IS inside the changed section, so it is a fair
     detection test.
  2. Site E, IN scope: revert the localised Wikipedia link text "维基百科的校准条目" to English
     "Wikipedia entry on calibration" while keeping the URL. Same shape, different host.
Both are the class that produced two real false-PASS auto-merges (lecture-intro.zh-cn#278 and
#296). Note in \`notes\` that the _toc.yml caption variant of this class is handled separately by
the harness because review mode filters to .md files and never sees _toc.yml at all.`,
  },
  {
    key: 'deterministic-controls',
    replicates: 1,
    brief: `These are the **deterministic-check controls** — one variant per class, injected only as a
"not worse than the script" control. A purpose-built script would catch every one of these; the
question is whether the model does too.
Author ONE variant for EACH of these TEN classes, choosing whichever of sites A/B/C/D/E hosts it
most naturally (site E was built to host most of them):
  1. untranslated-text-left        — leave one prose sentence in the changed section in English
  2. blank-line-breaks-math        — insert a blank line inside a $$...$$ or {math} block
  3. missing-space-at-cjk-inline-math — delete the space between a CJK char and inline $...$ or a
                                     {doc}/{eq} role (site E "接近 $0.95$ 的贴现因子 $\\beta$" or
                                     site B's roles are hosts) — this VIOLATES the zh-cn language
                                     policy the reviewer is given, so it should be findable
  4. ascii-punctuation-in-cjk-prose — replace full-width ，。： with ASCII ,.: in one sentence
  5. emphasis-markup-broken-in-cjk — break the **校准** bold markup in site E (e.g. leave one
                                     asterisk pair unbalanced or put a space inside)
  6. greek-glyph-tofu-in-figure-labels — in site D, replace the Greek in the axis labels with a
                                     literal tofu/mojibake rendering
  7. half-translated-hybrid-token  — produce a token that is half English half Chinese, e.g.
                                     "steady态分布" or "eigen特征值"
  8. duplicated-line              — duplicate one prose line verbatim
  9. label-anchor-integrity       — drop or rename the (sec:calibration)= anchor in site E
 10. leftover-scaffolding-artifact — leave a translator scaffolding artefact in the text, e.g. a
                                     stray "[待翻译]" or an HTML comment "<!-- TRANSLATE BELOW -->"
Set defectClass to the class name and use replicates: 1 for all ten.`,
  },
  {
    key: 'negative-controls',
    replicates: 3,
    brief: `These are **NEGATIVE controls — the reviewer must NOT flag them.** Each is correct behaviour
under a standing policy ruling, and a finding on any of them is a FALSE POSITIVE.
Author ONE variant for EACH of these FOUR, replicates: 3:
  1. baidu-baike-substitution — in site E, swap the Wikipedia URL for the equivalent Baidu Baike
     entry (https://baike.baidu.com/item/校准) and keep the Chinese link text. Baidu Baike is an
     ACCEPTED Wikipedia substitute in zh-cn editions (standing policy).
  2. latin-script-retention — in site E, ensure a technical name is deliberately kept in Latin
     script inside Chinese prose in the house style, e.g. render "Shannon entropy" as "Shannon 熵"
     and keep "McCall 模型". Add a second such term so the variant is not a no-op.
  3. stale-api-code-upstream-drift — site D's source cell already calls the legacy
     np.random.seed(42). Make the Chinese cell faithfully carry the same legacy call (it already
     does) AND add a comment making the staleness visible, so the reviewer has every opportunity
     to mislabel real upstream breakage as a translation defect. It must decline, or mark it
     out-of-scope. If the control needs no edit at all to test this, return an EMPTY edits array
     and say so in notes.
  4. todo-admonition-present-in-source — site E's {todo} admonition is present in the ENGLISH
     source and the translation keeps it verbatim. Verify that is already the case in the control;
     if it is, return an empty edits array and note that the clean control already exercises it.
For any variant whose \`edits\` array is empty, set defectMarker to the empty string.
Set expectedCategory to your best guess of the category a FALSE finding would land in, and set
expectedMinSeverity to "nit".`,
  },
  {
    key: 'regression-classes',
    replicates: 1,
    brief: `These are **regression-only classes** — chunk-boundary artefacts of a retired 3,000-character
pipeline. They are injected to protect structure preservation, and their pre-engine volume must
NOT drive priorities. Author ONE variant for EACH of these FIVE, replicates: 1:
  1. sentence-fragmentation   — split one Chinese sentence at a source line break so it becomes
                                two ungrammatical fragments
  2. blank-line-inside-math   — a blank line inside a display-math environment (choose a DIFFERENT
                                host from the deterministic-control version of this class)
  3. math-markup-lost         — a $...$ or $$...$$ delimiter dropped so LaTeX leaks into prose
  4. list-structure-broken    — a bullet list whose markers are lost so the items run together
  5. code-cell-legacy-syntax  — a {code-cell} whose fence or language tag is malformed in the way
                                the old pipeline produced
Choose hosts from sites A/B/C/D/E. Note that several of these will also break structural parity or
raise a syntax error — that is expected, and which surface catches them is part of the result.`,
  },
]

phase('Craft')
const drafts = await parallel(
  CLASSES.map((c) => () =>
    agent(`${COMMON}\n\n---\n\n${c.brief}\n\nSet \`replicates\` to ${c.replicates} on every variant unless the brief says otherwise.`, {
      label: `craft:${c.key}`,
      phase: 'Craft',
      schema: SCHEMA,
    }).then((r) => ({ key: c.key, variants: r?.variants ?? [] }))
  )
)

const all = drafts.filter(Boolean).flatMap((d) => d.variants.map((v) => ({ ...v, group: d.key })))
log(`crafted ${all.length} variants across ${drafts.filter(Boolean).length} classes`)

phase('Verify')
const verdicts = await parallel(
  all.map((v) => () =>
    agent(
      `Adversarially verify ONE injection fixture for the reviewer-certification harness. Default to rejecting when uncertain.\n\n` +
        `Control file: ${SITES}/${v.site}.zh.${v.file}\n` +
        `Source (ground truth) file: ${SITES}/${v.site}.src.${v.file}\n` +
        `Site ${v.site} changed section: see ${SITES}/index.json\n\n` +
        `Proposed variant:\n${JSON.stringify(v, null, 2)}\n\n` +
        `Check, by actually reading the files and running python3 to count occurrences:\n` +
        `1. ANCHOR UNIQUENESS — does every \`find\` occur EXACTLY once in the control file? Report the counts.\n` +
        `2. IN-SCOPE — does every edit land inside the site's named section? (Out-of-scope is only acceptable when the variant's notes say that is the point.)\n` +
        `3. REALISES THE CLASS — after applying the edits, is the result genuinely an instance of \`defectClass\`, and NOT primarily an instance of some other class? A "meaning error" that mostly reads as broken Chinese is a fluency defect, not a meaning defect.\n` +
        `4. GROUND TRUTH — is \`groundTruth\` actually what the English source says? Quote the source line you checked.\n` +
        `5. MARKER — does \`defectMarker\` appear in the injected text and NOT in the control?\n` +
        `6. COLLATERAL — do the edits change anything the defect does not require?\n` +
        `7. CHINESE QUALITY — would a native reader judge the injected Chinese fluent apart from the injected defect?\n\n` +
        `If any check fails and you can fix it with a minimal correction, return the CORRECTED variant in \`fixed\` and set verdict to "fixed". If it cannot be salvaged, set "reject".`,
      { label: `verify:${v.id}`, phase: 'Verify', schema: {
        type: 'object',
        required: ['id', 'verdict', 'reasons'],
        properties: {
          id: { type: 'string' },
          verdict: { type: 'string', enum: ['accept', 'fixed', 'reject'] },
          reasons: { type: 'array', items: { type: 'string' } },
          anchorCounts: { type: 'array', items: { type: 'integer' } },
          fixed: { type: 'object', additionalProperties: true },
        },
      } }
    ).then((r) => ({ original: v, review: r }))
  )
)

const accepted = []
const rejected = []
for (const row of verdicts.filter(Boolean)) {
  const { original, review } = row
  if (!review) { rejected.push({ id: original.id, why: 'verifier returned nothing' }); continue }
  if (review.verdict === 'reject') { rejected.push({ id: original.id, why: review.reasons?.join(' | ') }); continue }
  const merged = review.verdict === 'fixed' && review.fixed ? { ...original, ...review.fixed } : original
  accepted.push({ ...merged, verifierVerdict: review.verdict, verifierReasons: review.reasons })
}

log(`accepted ${accepted.length}, rejected ${rejected.length}`)
return { accepted, rejected }

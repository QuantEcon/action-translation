# Survey reply dispositions — how each answer becomes a change

**Date**: 2026-08-03 · **Tracking**: #189 Phase 2 · **Input**: Adisankar's filled
packet, received by email 2026-08-03.

This is the companion to `REPORT.md` (what we measured) and
`malayalam-review-questions.md` (what we asked). It records what the reviewer
answered, what each answer changes, and where each change lands — so that when the
glossary or a config rule is questioned later, the provenance is one lookup away.

## Provenance and integrity

The reply came back exactly as requested: the `.md` file itself, edited in place.

| Check | Sent | Returned |
|---|--:|--:|
| Valid UTF-8 | yes | yes |
| Malayalam codepoints (whole file) | 659 | 925 |
| ZWJ / ZWNJ (whole file) | 0 / 0 | 0 / 0 |
| Answer boxes filled | 0 of 23 | **23 of 23** |

Zero zero-width characters on both sides means nothing was stripped in transit
(the packet's Malayalam already used atomic chillus, which need no joiner — see
`scripts/parse_responses.py:zero_width_report` for why zero is not itself a
signal). His
answers add 266 Malayalam codepoints, all intact. A conversation-pasted copy of the
same file rendered as mojibake, which is the same failure the reference survived in
#191 — the ask-for-the-raw-file rule stays.

Files:

- `malayalam-review-answers-adisankar.md` — byte-exact copy of the returned file
- `malayalam-review-answers-adisankar.json` — parsed answers
  (`scripts/parse_responses.py --check-zw --json`, run from this directory)

We designed for a partial reply — the covering note said A1, A9 and D1 alone would
be enough. He answered everything, and twice supplied his own improved renderings
(B1, B3), which double as ground truth for display-math prose — a construct his
reference translation contains none of.

## Dispositions

Every question was promised one of three outcomes: a **glossary entry**, a **rule
change**, or **accepted as-is**. The actual outcomes add two more categories the
packet did not anticipate: **defect confirmed** (feeds the Phase 3 gate decisions)
and **follow-up** (our question was under-specified, detail below).

| ID | His ruling | Disposition |
|---|---|---|
| A1 | Deliberate register rule: ordinary English words (hopefully, example, best, click…) stay in Latin script | **Rule change** — rewrite rule 2; see "The register layer" below |
| A2 | Tool's `-യിലെ` correct; his own `-ലെ` was incidental | **Rule change** — codify `-യിലെ` after vowel-final roots (tool already complies) |
| A3 | His `-ഉം` correct; tool dropping it loses "plus/also" | **Rule change + defect** — additive `-ഉം` must survive |
| A4 | Tool's `-മായി` acceptable; prefer `-ുമായി` | **Rule change** — prefer `-ുമായി` (byte-exact from his answer) |
| A5 | Needs the source sentence | **Follow-up** — sentence found (EN `getting_started.md` line 226), sent back |
| A6 | Error *if* the source is not comparative | **Follow-up, likely resolves accepted-as-is** — the source IS comparative; see below |
| A7 | Needs the source sentence | **Follow-up** — probable false pairing; see below |
| A8 | `അടിക്കുക` is a mistranslation; normalise keyboard verbs to `press ചെയ്യുക` | **Rule change + glossary** — pin `press`; map hit/strike/tap → press for key instructions |
| A9 | Light-verb pattern (`click ചെയ്യുക`, `enable ആകും`) is the deliberate default for software actions | **Rule change** — the highest-yield single change; see below |
| A10 | Short sentences that are mostly code/URLs stay fully English | **Rule change** — new sentence-level rule |
| A11 | Both suspected errors confirmed | **Defect confirmed** |
| A12 | Headings stay English — intended | **Accepted as-is** — closes a #71 open question; rule 4 already encodes it |
| A13 | Proper names stay Latin — intended | **Accepted as-is** — closes a #71 open question; rule 5 already encodes it |
| A14 | Transliteration is a **serious error**, not awkwardness | **Gate decision pre-authorised** — `transliteration_check.py` should graduate to a blocking `diff-checks.ts` ml gate in Phase 3 |
| B1 | Mix right; word order improvable; `Mathematically,` stays English | **Accepted as-is** + his renderings join the example bank |
| B2 | Sample fine; asked what "read more plainly" meant | **Accepted as-is** — our question was vague; clarified in the follow-up, no reply needed |
| B3 | Register right; his rendering reorders; short exercises may stay English | **Accepted as-is** + example bank; reinforces A10 |
| B4 | Code comments stay English, always | **Rule change** — also resolves our own `--localize`-mode inconsistency (REPORT.md finding 5) |
| B5 | n/a (B4 answered "no") | — |
| C1 | All 34 frequent terms stay English | **Accepted as-is** — the unpinned policy holds; no mass pinning |
| C2 | Pin `click`, `option`, `set`, `type` | **Glossary** — pinned, plus `press` from A8; v0.2.0 |
| D1 | python_by_example, numpy, pandas, matplotlib, functions; defers on variety | **Accepted as-is** — Phase 2 batch is his five; see below |
| D2 | Flag Western cultural references for human review rather than translate | **New issue** — mechanism does not exist yet; intersects `--localize` |

## Corrections we owe him (and ourselves)

The packet stripped sentence context from the case-grammar questions to keep them
small. He declined to rule on all three without it — and on two of the three, the
context shows *our* framing was wrong, not the tool:

- **A6 (`option-നെക്കാൾ`)** — the packet called this "a comparative where the
  source is not comparative". The source (line 72) is: *"At the same time, local
  installs require more work **than** a cloud option like Colab."* Comparative. The
  tool's `-നെക്കാൾ` ("than") is a defensible — arguably more literal — rendering
  than the reference's `-നെ അപേക്ഷിച്ച്` ("compared to"). His conditional verdict
  does not fire. Unless he objects on other grounds, this reclassifies from
  suspected error to acceptable variant.
- **A7 (`list-ൽ` vs `list-ന്`)** — the source (line 355) contains **two** list-like
  nouns: *"select `Markdown` from the `Code` drop-down **box** just below the
  **list** of menu items"*. The reference's `list-ൽ` renders the drop-down; the
  tool's dative `list-ന്` is exactly how Malayalam builds "below X" (`X-ന് താഴെ`),
  i.e. plausibly the *menu-item list*. The packet may have paired two different
  grammatical slots. Cannot be confirmed, because —
- **The Stage 1 arm output was never archived.** `REPORT.md` quotes fragments of a
  rendering that existed only in a working directory. The full sentences behind
  A5 and A7 are unrecoverable. **Process rule for future packets: any machine
  output a packet quotes gets committed alongside it**, and case-grammar questions
  ship with their full sentences — the reviewer's "the correct form depends on what
  the original English sentence actually says" is simply right, and his refusal to
  rule without context was better calibrated than our confidence.
- **A5 (`cursor`)** — source (line 226): *"In this mode, whatever you type will
  appear in the cell with the flashing cursor."* Both renderings read "with" as
  accompaniment ("along with a cursor"); the likelier intent is identification
  (*the cell that has the flashing cursor*). Both may be wrong. His call.

All three go back in `malayalam-review-followup.md` — three questions, sentences
included this time.

A note on reviewer calibration: on A2 he ruled **against his own reference** ("my
use of `-ലെ` was incidental"). He is adjudicating, not defending his draft — which
is the property #189's "divergences are questions, not errors" stance hoped for,
and it means the reference is strong ground truth without being infallible.

## The register layer — structure for keep-English beyond the glossary

A1 and A9 establish that keep-English extends past technical terms into ordinary
vocabulary and software verbs, as a register. The obvious encoding — enumerate the
words that stay English — has two fatal properties:

1. **It is an open class.** The 32 words in the A1 inventory are the ones one
   lecture happened to contain. Every ordinary adjective, adverb and interface verb
   in the series is a candidate; the list grows without bound, and every prompt
   pays its token cost.
2. **A word list cannot even be correct in principle.** The same root legitimately
   goes both ways by grammatical function: the reference keeps `use` English as a
   content verb yet writes `ഉപയോഗിച്ച്` for the converb "using X" — in the same
   document, correctly both times. Membership is decided by construction, not by
   word.

So the structure inverts which set gets enumerated. The Malayalam side —
grammatical connective tissue plus a small stock of native verbs — is a **closed
class** and can be described in one rule; everything outside it defaults to
English. Three layers, only the first two of which ever touch a prompt:

| Layer | Contents | Size discipline | Lives in |
|---|---|---|---|
| **1. Categorial rules** | What *does* get translated (pronouns, demonstratives, conjunctions, postpositions, case morphology, common native verbs of being/seeing/saying) + the light-verb rule for software actions + the sentence-level rule | Capped by design — rules describe categories, never enumerate open classes | `src/language-config.ts` `additionalRules` |
| **2. Contrastive example bank** | ~a dozen curated pairs showing the line: `click ചെയ്യുക` not `ക്ലിക്ക് ചെയ്യുക`; `Hopefully, നിങ്ങളുടെ default browser…` keeping the adverb English; his B1/B3 renderings | Hard cap; an example enters only by displacing a weaker one | Inside the rules (examples in-line), so they version together |
| **3. Regression inventory** | The full A1 32-word list, the four transliterated terms, morphology rulings (A2–A4), light-verb patterns — everything the reviewer has ever ruled on | **Unbounded, and free to grow** — it is never injected into a prompt, so its size costs nothing per translation | `experiments/ml-benchmark/` checks now; candidates graduate to `diff-checks.ts` ml gates in Phase 3 |

The growth valve, if layer 1+2 ever proves insufficient in Phase 2: **source-
filtered injection** — include an inventory word in the prompt only when the source
document actually contains it, which makes prompt cost O(document) instead of
O(inventory). That is an escalation to hold in reserve, not build now. Checks in
layer 3 should be two-tier from the start: **hard-fail** words where a Malayalam
rendering is always wrong (`click`, `press`, `option`, `set`, `type` — the
interface verbs that were actually transliterated), and **soft-watch** words that
legitimately go both ways by function (`use`, `open`, `right`), which flag for a
human eye rather than fail the build.

Candidate for `.dev/decisions/` promotion once Phase 2 validates the rules
empirically. #promote

## Rule text (implemented in the companion PR)

Rules 1, 4, 5, 6, 7 stand (A12/A13 formally confirm 4 and 5). Rule 2 is rewritten,
rule 3 is split, and two rules are added — exact wording in
`src/language-config.ts`; summary:

- **Rule 2 (rewritten, from A1)** — defines the *translate* set categorially
  (grammatical tissue + native verb stock), states that ordinary English content
  words commonly stay Latin in this register, keeps `country → രാജ്യം`-class
  examples as the positive case. Resolves the tension where the old rule's
  `increase → ഉയർത്തുക` example taught the model to translate verbs that A9 says
  must stay English.
- **Rule 3 (morphology, from A2–A4)** — suffix attachment with his preferred
  forms: `-യിലെ` after vowel-final roots, additive `-ഉം` preserved, `-ുമായി` over
  `-മായി`.
- **New rule (verbs, from A9+A8)** — software/interface actions keep the English
  verb + Malayalam light verb (`click ചെയ്യുക`, `enable ആകും`); never a native
  verb; keyboard-press synonyms (hit/strike/tap) normalise to `press ചെയ്യുക`.
- **New rule (sentences, from A10+B3)** — a short sentence that is mostly code,
  commands or URLs may stay entirely English; longer sentences translate the prose
  around untouched code.
- **New rule (comments, from B4)** — code comments are never translated.

Glossary: v0.1.0-draft → **v0.2.0**; +5 pins (`click`, `option`, `set`, `type`,
`press`, context `software-interface`); description updated to record native-
speaker validation. C1's 34 terms are deliberately **not** pinned — the measured
policy holds on 203 unpinned terms, and the packet's stance stands: pin what
failed, not what worked.

## Phase 2 batch

His five: **python_by_example, numpy, pandas, matplotlib, functions** — accepted
as nominated. Against the diversity matrix this skews technical (about_py was the
canonical prose-heavy pick; the programming series has no economics-heavy option),
but numpy + pandas satisfy the long-document consistency requirement,
python_by_example carries enough narrative to exercise the A1/A10 register rules,
and reviewer motivation on a calibration batch beats marginal coverage. about_py
headlines the next round. Per the #228 re-scope: batch runs on the current default
model, recorded per-file so flags stay attributable.

Sequencing: the config/glossary PR merges first (the batch must be produced under
the new rules), regeneration of `getting_started.md` confirms the A9 fix closes
the divergence inventory rather than patching one spot, then the five lectures go
out as `test-translation-sync.ml` PRs for inline flagging.

## Next actions

1. ~~Commit reply + parsed JSON + this report~~ (this PR)
2. ~~Follow-up to Adisankar: `malayalam-review-followup.md` (A5/A6/A7 with
   sentences, B2 clarification) — email, same raw-file round-trip~~ — returned
   2026-08-06, all three resolved; see "Follow-up round" below
3. Companion PR: rules rewrite + glossary v0.2.0 + regeneration evidence
4. Phase 2 batch through `test-translation-sync.ml` after merge
5. New issue: cultural-reference flagging (D2)
6. Phase 3 carries: transliteration gate graduation (A14), judge calibration
   against B1/B3 renderings, A11 defects as seeded-violation test cases

## Follow-up round (F1–F3) — returned 2026-08-06

The three re-posed A5–A7 questions came back answered 3 of 3, closing the last
open threads from the packet: every question either round asked is now resolved,
and Phase 2's only remaining dependency is his inline review of
`lecture-python-programming.ml` PRs 1–5.

### Provenance and integrity

| Check | Sent | Returned |
|---|--:|--:|
| Valid UTF-8 | yes | yes |
| Malayalam codepoints (whole file) | 209 | 407 |
| ZWJ / ZWNJ (whole file) | 0 / 0 | 0 / 0 |
| Answer boxes filled | 0 of 3 | **3 of 3** |

One difference the first round did not have: a single line of **our covering
prose** came back reworded ("are now pinned to stay in English" → "are pinned
keep-English") — outside any answer box, and git confirms the sent version had
the former. Harmless (he tightened our sentence into our own jargon), but it
means "returned exactly as sent" is a per-round observation, not an assumption:
the outside-the-boxes diff is now part of the check.

Files:

- `malayalam-review-followup-answers-adisankar.md` — byte-exact copy of the
  returned file
- `malayalam-review-followup-answers-adisankar.json` — parsed answers
  (`scripts/parse_responses.py --filled … --template malayalam-review-followup.md
  --check-zw --json`)

### Dispositions

| ID | His ruling | Disposition |
|---|---|---|
| F1 | Both renderings wrong: "the cell with the flashing cursor" *identifies which cell*; correct form is the relative participle `flashing cursor ഉള്ള cell-ൽ` | **Rule change + live defect** — the post-packet regeneration still renders accompaniment; fix rides v0.3. His full sentence joins the example bank and the Phase 3 judge ground truth (third reviewer-supplied rendering, after B1/B3) |
| F2 | `-നെക്കാൾ` is an acceptable colloquial variant of `-നെ അപേക്ഷിച്ച്`; `കുറച്ചു` must be dropped alongside it, since the suffix already carries the comparative | **Accepted as-is + narrow rule** — A6 formally reclassifies from suspected error to acceptable variant, as predicted above. All five delivered PRs scanned: zero instances of the banned stack |
| F3 | (a) `-ൽ നിന്നും` correct and preferred for "selecting from"; (b) `list-ന് താഴെ` correct for "below the list" | **Accepted as-is** — A7's false-pairing hypothesis confirmed; both forms → regression inventory |

### What verification against live output added

- **F1 is reproducible, not historical.** The post-packet regeneration
  (`arms/2026-08-03-postpacket-opus5/getting_started.md`) renders the sentence
  `…flashing cursor-നോടൊപ്പം cell-ൽ appear ചെയ്യും` — the same accompaniment
  reading, under the current rules, in a different model. The rule gap is
  general: English "the N with X" as an identifying modifier → `X ഉള്ള N`. The
  accompaniment rendering is a seeded-violation candidate for Phase 3.
- **F2 compliance is already true of the batch.** The diffs of
  lecture-python-programming.ml PRs 1–5 contain five comparative-suffix
  sentences; none stacks `കുറച്ചു` (checked at paragraph level). Nothing to fix,
  nothing for him to re-review.
- **F3's exoneration is visible in the regeneration**, which renders the
  sentence `menu items-ന്റെ list-ന് തൊട്ടു താഴെയുള്ള Code drop-down box-ൽ
  നിന്ന്…` — near-verbatim his second natural form, with `തൊട്ടു` even
  capturing "just below". The tool's `list-ന്` was the menu-items slot all
  along; the packet compared two different grammatical slots, as suspected.

### Watch list (seen, deliberately not acted on)

- **`കൂടുതൽ` as load-bearing quantifier next to `-നെക്കാൾ`** ("more work
  than", "gives more than") is *outside* the F2 ruling, which named only the
  downtoner `കുറച്ചു`. The regeneration renders the F2 source sentence itself
  this way (`option-നെക്കാൾ കൂടുതൽ work … ആവശ്യമാണ്`), and PR 4 (pandas) has
  the same structure (`Series NumPy arrays-നേക്കാൾ കൂടുതൽ നൽകുന്നു`) — under
  his active review, so the PR round adjudicates it organically. Extending the
  ruling to `കൂടുതൽ` without evidence would repeat the A6 error in the other
  direction.
- **`നിന്ന്` vs `നിന്നും`** — he calls `-ൽ നിന്നും` "preferred"; the tool
  writes `-ൽ നിന്ന്` throughout the five PRs. Soft-watch: if it matters, it
  surfaces as an inline flag.

### Sequencing

No standalone release and no re-regeneration now: the F1 rule/example change,
the `കുറച്ചു` constraint, and the F3 morphology examples fold into **v0.3 with
the PR-review flags**, exactly as the batch sequencing above records. Nothing
further is owed to the reviewer; the acknowledgement says so explicitly.

Calibration note for the record: F1 is the third time he has ruled against his
own reference (A2, the B1/B3 reorderings, now the `-ഉം` cursor sentence). The
reference remains strong ground truth held by an adjudicating, not defending,
reviewer.

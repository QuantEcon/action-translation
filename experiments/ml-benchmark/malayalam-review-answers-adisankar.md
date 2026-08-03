# Malayalam review — questions for Adisankar

**Date**: 2026-07-28 · **Tracking**: #228 (Phase 1 of #189), folding in #207.

Thank you for the strategy document and the `getting_started.md` translation. Both are
doing a lot of work: your translation is now the yardstick every automated check is
calibrated against, and it passes all of them — 27 of 27 headings identical to the
English source, and not one technical term written phonetically in Malayalam script.

**There is no deadline, and no need to answer everything.** If you only have time for
three, do **A1**, **A9** and **D1** — those are worth more than all the rest combined.

## How to answer

Type your answer inside the box under each question. The boxes look like this:

    ```answer A1
    your answer here
    ```

Leave a box empty to skip that question. Don't worry about tidiness — anything
readable is fine, in English or Malayalam, as long as it stays between the two
` ``` ` lines.

**Please send back the `.md` file itself, or paste it as plain text — not Word or
Google Docs.** This is not fussiness: Malayalam uses zero-width joiners in chillu
formations, and those are silently deleted by some editors and converters. We would
not notice the damage, and it would end up in the glossary.

## What we settled ourselves, so you don't have to

Everything a script could decide, a script decided — heading fidelity, glossary-term
retention, casing, structure and consistency were all checked mechanically and are
absent from this document. Two of your four earlier open questions are answered by
your own translation and appear below only as one-line confirmations.

Every question resolves to one of three outcomes: a **glossary entry**, a **rule
change** in the tool, or **accepted as-is**.

---

## Section A — where your translation and the tool's differ

You are ruling "error" or "acceptable variant", not reading for correctness.

### A1 — how far does keep-English reach into ordinary vocabulary?

Your translation keeps these **32 ordinary English words** in Latin script. The tool
renders every one of them in Malayalam:

> already, best, choose, click, create, detail, efficient, example, explore, free,
> green, here, hit, hopefully, idea, important, instruction, interact, open, popular,
> possible, process, provide, right, select, share, similar, simple, top, try, use

They are not technical terms, which is what makes the question interesting. Yours first:

| You | The tool |
|---|---|
| `Hopefully, നിങ്ങളുടെ default browser-ലും ഇതുപോലെ ഒരു web page തുറന്നിട്ടുണ്ടാകും.` | `നിങ്ങളുടെ default browser-ഉം ഇതുപോലെ കാണപ്പെടുന്ന ഒരു web page-മായി തുറന്നിട്ടുണ്ടാകും എന്ന് പ്രതീക്ഷിക്കുന്നു` |
| `താഴത്തെ split-ന്റെ top right-ൽ click ചെയ്താൽ on-line help close ആകും.` | `താഴത്തെ split-ന്റെ വലതുവശത്ത് മുകളിൽ ക്ലിക്ക് ചെയ്താൽ on-line help അടയ്ക്കുന്നു.` |

**A1. Is keeping ordinary English words like these in Latin script a deliberate
register choice we should encode as a rule, or incidental to how you were drafting?**

```answer A1
Deliberate rule. Keeping ordinary English words like "hopefully", "click", and "example" in Latin script is intentional — these words are in everyday use among educated Malayalam speakers and translating them feels unnatural and overly formal in a classroom context.
```

### A2–A4 — case-suffix attachment

The same English root taking a different Malayalam ending. Each row is one pattern
across several words, so one answer settles all of them.

| # | You write | The tool writes | On the roots |
|---|---|---|---|
| **A2** | `-ലെ` | `-യിലെ` | directory, numpy |
| **A3** | `-ഉം` | *(no ending)* | border, file |
| **A4** | *(no ending)* | `-മായി` | files, message, page |

**A2–A4. For each: is the tool's form wrong, or an acceptable alternative?**

```answer A2
The tool's form -യിലെ is correct. My use of -ലെ was incidental — -യിലെ is the more natural attachment when the English root ends in a vowel sound. This should be the rule.
```

```answer A3
My form -ഉം is correct. The tool dropping the ending entirely loses the meaning — when the sentence calls for "also/and", the suffix must be attached. -ഉം should be the rule for these cases.
```

```answer A4
The tool's -മായി is acceptable, but the preferred form is -ുമായി (with chandrakala) — this flows more naturally in written Malayalam. If the tool can produce -ുമായി consistently, that should be the rule over plain -മായി.
```

### A5–A7 — single words where the case differs outright

| # | Root | You write | The tool writes |
|---|---|---|---|
| **A5** | cursor | `cursor-ഉം` | `cursor-നൊപ്പം` |
| **A6** | option | `option-നെ` | `option-നെക്കാൾ` |
| **A7** | list | `list-ൽ` | `list-ന്` |

**A5–A7. Error or variant?** A6 reads to us like a comparative where the source is not
comparative, so we suspect it is an error.

```answer A5
I need to see the full sentence in context to give a definitive ruling. In isolation: -ഉം means "and/also" while -നൊപ്പം means "along with" — these carry different meanings and the correct form depends on what the original English sentence actually says. Please share the full sentence and I will rule immediately.
```

```answer A6
Agreed with your suspicion — -നെക്കാൾ is comparative ("more than option") and if the source sentence is not comparative, this is an error, not a variant. Again, please share the full sentence to confirm, but I am confident this is a tool error.
```

```answer A7
I need the full sentence to rule correctly. -ൽ means "in the list" (location) and -ന്  means "to/for the list" (dative) — they are not interchangeable and the right choice depends entirely on the source sentence meaning.
```

### A8 — a suspected mistranslation

The source says "**hit** the `Esc` key". You keep `hit` in English. One of the tool's
renderings uses `അടിക്കുക` — the physical *strike* sense.

**A8. Is `അടിക്കുക` wrong here, and should `hit` be pinned as keep-English?**

```answer A8
Yes, `അടിക്കുക` is a mistranslation — it carries the physical strike sense which is wrong in a keyboard context. "Hit the Esc key" means press the key. I would prefer keeping `press` in English consistently for all keyboard instructions — so "hit the Esc key" should become "Esc key press ചെയ്യുക" rather than using either `hit` or `അടിക്കുക`.
```

### A9 — the light-verb construction (the most important question here)

You asked earlier whether the whole-English sentences in your draft were deliberate.
We can now answer with a measurement, and it points at something specific.

Across the document the tool is measurably more Malayalam than you are — at every
level, and **entirely in one direction**. Of the paragraphs where the two translations
differ substantially, every single one has the tool using more Malayalam. Not one goes
the other way.

One construction explains most of it. **You keep an English verb in Latin script and
attach a Malayalam light verb** — `press ചെയ്യുക`, `click ചെയ്താൽ`, `close ആകും`,
`check ചെയ്യാം`, `enable ആകും`. The tool replaces the whole thing with a native
Malayalam verb — `അമർത്തുക`, `അടയ്ക്കുന്നു`, `പ്രവർത്തനക്ഷമമാകും`.

Examples, yours first:

| # | You | The tool |
|---|---|---|
| 1 | `* For example, try `np.random.randn(3)`.` *(fully English)* | `* ഉദാഹരണത്തിന്, `np.random.randn(3)` പരീക്ഷിക്കുക.` |
| 2 | `The output tells us the notebook is running at `http://localhost:8888/`` *(fully English)* | `notebook `http://localhost:8888/` എന്നിടത്ത് run ചെയ്യുന്നു എന്ന് output പറയുന്നു` |
| 3 | `Markdown code complete ചെയ്താൽ, `Shift+Enter` press ചെയ്യുക.` | `ഇനി ഇത് ഉണ്ടാക്കാൻ നമ്മൾ `Shift+Enter` അമർത്തുന്നു` |
| 4 | `ആ bug icon-ൽ click ചെയ്താൽ Jupyter-ന്റെ debugger enable ആകും.` | `ഈ icon-ൽ ക്ലിക്ക് ചെയ്താൽ Jupyter debugger പ്രവർത്തനക്ഷമമാകും.` |

**A9. Is the `<English verb> + ചെയ്യുക/ആകും` pattern the correct default for verbs
describing software actions?** If yes, that is one rule and it likely closes most of
the gap in a single change.

```answer A9
Yes, the `<English verb> + ചെയ്യുക/ആകും` pattern is the correct default for software action verbs (just as we saw in A8). This is deliberate, not incidental.

When a student reads `click ചെയ്താൽ` or `enable ആകും`, they immediately connect it to what they see on their screen — because these interface words appear in English on every device they use. Replacing them with pure Malayalam verbs like `അടയ്ക്കുന്നു` or 
`പ്രവർത്തനക്ഷമമാകും` forces the student to mentally translate back to the interface word, adding unnecessary friction.

The correct rule is:
- Software action verbs: keep English verb + attach ചെയ്യുക/ആകും
- Example: `click ചെയ്യുക`, `press ചെയ്യുക`, `enable ആകും`,   `close ആകും`, `check ചെയ്യാം`
- Do NOT replace with pure Malayalam verbs for software actions
```

**A10. Rows 1 and 2 are fully English in your translation. Deliberate?** They are both
instruction-and-keyboard text, which looks like a pattern rather than an accident.

```answer A10
Deliberate, but with a nuance worth noting.

When a sentence is short and the majority of its content is already staying in English — a URL, a command, a code reference — translating the small remaining prose feels unnecessary and fragments the instruction. In those cases I kept the whole sentence in English for clarity and flow.

For longer sentences where code or a URL appears mid-sentence, I would translate the surrounding prose normally and leave only the code/URL untouched. The length and proportion of English content in the sentence determines the approach.

My recommendation: if a sentence is short and majority of its content is code, URL, or command text, keep the full sentence in English. Otherwise translate the prose portions normally.
```

### A11 — a suspected error

In one passage the tool writes `"Next" button-ലെ buttons` ("buttons in the Next
button"), and turns your "you can check each line" into "you can move forward line by
line".

**A11. Is that wrong?** Confirm and we treat it as a defect rather than a variant.

```answer A11
Yes, both are errors, not variants.
```

### A12–A13 — two one-line confirmations

**A12. Headings stay fully English.** Confirmed by measurement — your translation has
27 of 27 headings byte-identical to the English source, as do all three machine
renderings. Please just confirm it is intended.

```answer A12
Confirmed. It is intentional.
```

**A13. Proper names stay in Latin script.** Same — your translation does this
throughout. Confirm and we close it.

```answer A13
Confirmed. It is intentional.
```

### A14 — a policy violation, and how serious you think it is

The tool sometimes writes an English word out *phonetically in Malayalam letters*
instead of leaving it in Latin. Your translation never does this — zero instances
across every term we checked. The machine does:

| Written as | Should be | How often |
|---|---|---|
| `ക്ലിക്ക്` | `click` | all 6 occurrences, in one rendering |
| `ഓപ്ഷൻ` | `option` | 3 of 7 occurrences, in another |
| `സെറ്റ്` | `set` | twice |

**A14. How bad is this — a serious error, or merely awkward?** We ask because `option`
was transliterated 3 times out of 7 and left in Latin the other 4 *in the same
document*, and that kind of inconsistency is what worries us most at scale.

```answer A14
This is a serious error, not merely awkward.
Please treat any transliteration as a defect, not a variant.
```

---

## Section B — contexts your reference doesn't cover

Your translation contains none of these constructs, so we have no ground truth. The
tool's current treatment is shown so you are confirming or correcting, not composing.

### B1 — prose that introduces a display-math block

| English | The tool |
|---|---|
| `Mathematically, a vector $\mathbf{v} \in \mathbb{R}^n$ can be represented as:` | `Mathematically, ഒരു vector $\mathbf{v} \in \mathbb{R}^n$ ഇങ്ങനെ represent ചെയ്യാം:` |
| `An eigenvector $v$ of matrix $A$ satisfies:` | `matrix $A$-യുടെ ഒരു eigenvector $v$ ഇത് satisfy ചെയ്യുന്നു:` |

**B1. Is this the right mix for maths-introducing prose?** Note the first keeps the
sentence-opening adverb `Mathematically,` in English — deliberate-looking, but we did
not ask for it.

```answer B1
The mix is broadly correct — mathematical terms, symbols, and "Mathematically," stay in English, with Malayalam connective prose around them. 
However the tool's word order and phrasing can be improved.

I would have translated it as:

`Mathematically, $\mathbf{v} \in \mathbb{R}^n$ എന്ന ഒരു vector-നെ ഇങ്ങനെ represent ചെയ്യാം:`

`matrix $A$-യുടെ ഒരു eigenvector $v$, താഴെപറയുന്നവ satisfy ചെയ്യുന്നു:` 
(where the source implies "satisfies the following")
```

### B2 — prose inside a nested `####` subsection

> **EN**: `Vector space properties are fundamental in economic modeling. The closure property ensures that combinations of feasible allocations remain feasible.`
>
> **ML**: `economic modeling-ൽ vector space properties അടിസ്ഥാനപരമാണ്. closure property, feasible allocations-ന്റെ combinations feasible ആയി തുടരുന്നു എന്ന് ഉറപ്പാക്കുന്നു.`

**B2. Does deeply-nested explanatory prose want the same mix as top-level prose, or
should it read more plainly?**

```answer B2
The translation seems okay to me. 
However I want to make sure I understand the question correctly — could you clarify what "read more plainly" means here?
```

### B3 — exercise and hint prose

> **EN**: `Starting with your solution to exercise 1, plot three simulated time series, one for each of the cases $\alpha=0$, $\alpha=0.8$ and $\alpha=0.98$.`
>
> **ML**: `Exercise 1-ന്റെ നിങ്ങളുടെ solution-ൽ നിന്ന് തുടങ്ങി, മൂന്ന് simulated time series plot ചെയ്യുക; $\alpha=0$, $\alpha=0.8$, $\alpha=0.98$ എന്നീ ഓരോ case-നും ഒന്ന് വീതം.`

**B3. Exercise text is instructional rather than explanatory. Is this register right
for a student reading a problem set?**

```answer B3
The register is right.

I would have translated it as:
Exercise 1-ന്റെ നിങ്ങളുടെ solution-ൽ നിന്ന് തുടങ്ങി, $\alpha=0$, $\alpha=0.8$, $\alpha=0.98$ എന്ന മൂന്ന് case-നും, ഓരോ simulated time series plot ചെയ്യുക.

As discussed previously, if the exercise sentence is short, it may be retained in English.
```

### B4–B5 — Python comments inside code cells

This has an inconsistency we created ourselves, and we would rather show it than hide
it. In one configuration the tool translates code comments; in another it leaves them
alone. Within the translating configuration it is also not uniform:

| English comment | The tool |
|---|---|
| `# Create two vectors` | `# രണ്ട് vectors സൃഷ്ടിക്കുക` |
| `# Final demand vector (in billions)` | `# Final demand vector (billions-ൽ)` |
| `# Sectors: Agriculture, Manufacturing, Services` | *left identical* |
| `# States: Employed, Unemployed` | *left identical* |

**B4. Should Python comments inside code cells be translated at all for Malayalam?** A
"no" is easy for us to implement and arguably safer, since comments sit beside code a
student may copy.

```answer B4
No — Python comments inside code cells need not be translated. Leave them in English.
```

**B5. If yes, is leaving all-proper-noun comments untouched the right exception?** That
is what happened, but nothing in the configuration asked for it.

```answer B5
n/a
```

*(We had intended to ask about figure captions too. It turns out none of the 47 figures
in the programming series has caption prose, so there is nothing to ask.)*

---

## Section C — which terms to pin

**Good news first, because it changes what we need here.** We translated five lectures
with two different models and extracted every technical term each produced — **203
distinct terms. Both models kept all 203 in English.** Only six are pinned in the
glossary today, so the policy is holding on nearly two hundred terms it was never
explicitly told about.

So this is not a list to work through. Below are the 34 most frequent unpinned terms,
**all currently kept in English**, which we believe is correct.

**C1. Please name only the ones you think should be TRANSLATED instead.** If they
should all stay English, just say so and skip the list — that is the answer we expect,
and it takes one line.

array · method · class · broadcasting · cell · consumer · data · instance · data type ·
dimension · object · shape · wealth · time series · element-wise · package · steady
state · code block · command · instance data · sequence · expression · indentation ·
area · attribute · index · market · polynomial · set · string · terminal · text editor ·
tuple · coefficient

```answer C1
All 34 terms should stay in English. None should be translated into Malayalam.
```

**C2. Why pin anything, if the policy already holds?** Because it held for these 203
and failed for four others. The words that came back transliterated — `click`,
`option`, `set`, `type` from A14 — are unpinned, and three of them are interface verbs
that a terminology extractor never proposes, so nothing was protecting them. **Are you
happy for us to pin those four as keep-English?**

```answer C2
Yes — please pin all four.
```

---

## Section D — what next

**D1. Which 3–5 lectures from `lecture-python-programming` would you most like to
review next?**

We will translate whichever you choose and deliver them as pull requests so you can
comment inline. Our only constraint is variety — ideally one prose-heavy, one
economics-heavy, one maths-heavy, one code-heavy, and at least one long one, because
term consistency only becomes visible across a long document. Beyond that the choice is
better made by you. Asking now saves a whole round trip.

Candidates: about_py · getting_started · python_by_example · python_essentials ·
python_oop · python_advanced_features · functions · names · numpy · pandas ·
pandas_panel · scipy · sympy · numba · jax_intro · need_for_speed ·
numpy_vs_numba_vs_jax · writing_good_code · workspace · debugging · matplotlib

```answer D1
I have not gone through all the lectures in detail, so my selection is based on what I know.

python_by_example
numpy
pandas
matplotlib
functions

If the team has a different view on variety or sequencing based on the tool's current capabilities, I am happy to defer — you know the technical constraints better than I do.
```

**D2. Anything else you noticed that we didn't ask about?**

```answer D2
In the getting_started.md translation, I removed a pop culture reference (Nicki Minaj). When western cultural references, idioms, or examples appear in the lectures, I would recommend to flag these for human review rather than translate them literally — a translated Nicki Minaj reference is no more relevant to our learners than the English original. In some cases removal is the right call, in others a locally relevant substitute might work better.
```

---

## What happens next

1. Your answers become glossary entries and configuration rules — we regenerate the
   affected documents to confirm each fix generalises rather than patching one spot.
2. We translate your chosen lectures from D1 and deliver them as pull requests.

A partial reply — even just A1, A9 and D1 — moves this forward materially. Thank you.

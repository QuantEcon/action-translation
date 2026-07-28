# Malayalam review packet — questions for Adisankar

**Date**: 2026-07-28 · **Tracking**: #228 (Phase 1 of #189), folding in #207.

Thank you for the strategy document and the `getting_started.md` reference translation —
both are doing a lot of work. The reference in particular is now the yardstick every
automated check is calibrated against, and it passes all of them.

**How to answer**: every question is numbered. Reply by number, in any medium —
"A1: yes", "A7: the second one", "C12: keep English" is perfectly sufficient. Answer
as far as you get; the sections are ordered so a partial reply is still useful.

**What we have already decided without troubling you.** Anything a script can settle,
a script settled. Heading fidelity, glossary-term retention, casing consistency, MyST
structure, code fences and math blocks were all checked mechanically and are correct —
so none of them appear below. Document structure is also **not** in question: please
don't change headings, code cells or math blocks, only prose. Two of your four
outstanding questions from earlier this year are answered by your own translation and
appear below only as one-line confirmations.

Every question below resolves to exactly one of three outcomes: a **glossary entry**, a
**rule change** in the tool's configuration, or **accepted-as-is with a rationale**.

---

## Section A — adjudications

Places where your translation and the tool's differ. You are ruling "error" or
"acceptable variant", not reading for correctness.

### A1 — the big one: how far does keep-English reach into ordinary vocabulary?

Your translation keeps these **32 ordinary English words** in Latin script. The tool
renders every one of them in Malayalam:

> already, best, choose, click, create, detail, efficient, example, explore, free,
> green, here, hit, hopefully, idea, important, instruction, interact, open, popular,
> possible, process, provide, right, select, share, similar, simple, top, try, use

These are not technical terms — that is what makes the question interesting. Examples,
your rendering first:

| Your translation | The tool |
|---|---|
| `For example, `np.random.r` എന്ന് type ചെയ്ത് `Tab` key press ചെയ്യുക.` | `ഉദാഹരണത്തിന്, ഇവിടെ നമ്മൾ `np.random.r` type ചെയ്ത് Tab അമർത്തുന്നു` |
| `Hopefully, നിങ്ങളുടെ default browser-ലും ഇതുപോലെ ഒരു web page തുറന്നിട്ടുണ്ടാകും.` | `നിങ്ങളുടെ default browser-ഉം ഇതുപോലെ കാണപ്പെടുന്ന ഒരു web page-മായി തുറന്നിട്ടുണ്ടാകും എന്ന് പ്രതീക്ഷിക്കുന്നു` |
| `താഴത്തെ split-ന്റെ top right-ൽ click ചെയ്താൽ on-line help close ആകും.` | `താഴത്തെ split-ന്റെ വലതുവശത്ത് മുകളിൽ ക്ലിക്ക് ചെയ്താൽ on-line help അടയ്ക്കുന്നു.` |

**A1. Is keeping ordinary English words like these in Latin script a deliberate register
choice we should encode as a rule, or is it incidental to how you were drafting?**

If deliberate, it is one configuration change rather than 32 glossary entries — which is
why it is first. There is one word in the other direction (`box`), where you used
Malayalam and the tool kept English.

### A2–A4 — morphology: case-suffix attachment

The same English root taking a different Malayalam ending in the two translations. Each
row is one pattern across several words, so one answer settles all of them.

| # | You write | The tool writes | On the roots |
|---|---|---|---|
| **A2** | `-ലെ` | `-യിലെ` | directory, numpy |
| **A3** | `-ഉം` | *(no ending)* | border, file |
| **A4** | *(no ending)* | `-മായി` | files, message, page |

**A2–A4. For each: is the tool's form wrong, or an acceptable alternative?** If the
tool's form is simply wrong, this becomes a rule we state explicitly in the prompt.

### A5–A7 — morphology: single words where the case differs outright

| # | Root | You write | The tool writes |
|---|---|---|---|
| **A5** | cursor | `cursor-ഉം` | `cursor-നൊപ്പം` |
| **A6** | option | `option-നെ` | `option-നെക്കാൾ` |
| **A7** | list | `list-ൽ` | `list-ന്` |

**A5–A7. Same question — error or variant?** A6 in particular reads to us like a
comparative where the source is not comparative, so we suspect it is an error.

### A8 — a suspected mistranslation

The source says "**hit** the `Esc` key". You keep `hit` in English. One of the tool's
renderings uses `അടിക്കുക` — the physical *strike* sense.

**A8. Is `അടിക്കുക` wrong here, and is `hit` a word to pin as keep-English?**

### A9 — the light-verb construction (we think this is the single most important question)

You asked us earlier whether the whole-English sentences in your draft were deliberate
or remnants. We can now answer with a measurement, and it points at something more
specific than "more English".

Across the document, the tool is measurably more Malayalam than you are — at every level
of the distribution, reproducibly, and **entirely in one direction**: of the paragraphs
where the two translations differ substantially, *every single one* has the tool using
more Malayalam. Not one goes the other way.

Looking at what actually differs, one construction explains most of it. **You keep an
English verb in Latin script and attach a Malayalam light verb** — `press ചെയ്യുക`,
`click ചെയ്താൽ`, `close ആകും`, `check ചെയ്യാം`, `enable ആകും`. The tool replaces the
whole thing with a native Malayalam verb — `അമർത്തുക`, `അടയ്ക്കുന്നു`,
`പ്രവർത്തനക്ഷമമാകും`.

All nine substantial divergences, yours first:

| # | You | The tool |
|---|---|---|
| 1 | `* For example, try `np.random.randn(3)`.` *(fully English)* | `* ഉദാഹരണത്തിന്, `np.random.randn(3)` പരീക്ഷിക്കുക.` |
| 2 | `* edit mode to command mode, hit the `Esc` key or `Ctrl-M` …` *(fully English)* | `* edit mode-ൽ നിന്ന് command mode-ലേക്ക്, `Esc` key അല്ലെങ്കിൽ `Ctrl-M` അമർത്തുക …` |
| 3 | `The output tells us the notebook is running at `http://localhost:8888/`` *(fully English)* | `notebook `http://localhost:8888/` എന്നിടത്ത് run ചെയ്യുന്നു എന്ന് output പറയുന്നു` |
| 4 | `Markdown code complete ചെയ്താൽ, `Shift+Enter` press ചെയ്യുക.` | `ഇനി ഇത് ഉണ്ടാക്കാൻ നമ്മൾ `Shift+Enter` അമർത്തുന്നു` |
| 5 | `താഴത്തെ split-ന്റെ top right-ൽ click ചെയ്താൽ on-line help close ആകും.` | `താഴത്തെ split-ന്റെ വലതുവശത്ത് മുകളിൽ ക്ലിക്ക് ചെയ്താൽ on-line help അടയ്ക്കുന്നു.` |
| 6 | `Notebook files വെറും text files മാത്രമാണ്. They are structured in JSON. They typically end with `.ipynb`.` | `Notebook files എന്നത് JSON-ൽ ഘടനാപ്പെടുത്തിയ, സാധാരണയായി `.ipynb`-യിൽ അവസാനിക്കുന്ന text files മാത്രമാണ്.` |
| 7 | `For example, `np.random.r` എന്ന് type ചെയ്ത് `Tab` key press ചെയ്യുക.` | `ഉദാഹരണത്തിന്, ഇവിടെ നമ്മൾ `np.random.r` type ചെയ്ത് Tab അമർത്തുന്നു` |
| 8 | `CALLSTACK (located in the right hand window) toolbar-ലെ "Next" button ഉപയോഗിച്ച് code-ന്റെ ഓരോ line-ഉം നിങ്ങൾക്ക് check ചെയ്യാം.` | `തുടർന്ന് CALLSTACK toolbar-ലെ (വലതുവശത്തെ window-ൽ സ്ഥിതി ചെയ്യുന്നത്) "Next" button-ലെ buttons ഉപയോഗിച്ച് നിങ്ങൾക്ക് code-ലൂടെ വരി വരിയായി മുന്നോട്ട് പോകാം.` |
| 9 | `ആ bug icon-ൽ click ചെയ്താൽ Jupyter-ന്റെ debugger enable ആകും.` | `ഈ icon-ൽ ക്ലിക്ക് ചെയ്താൽ Jupyter debugger പ്രവർത്തനക്ഷമമാകും.` |

**A9. Is the `<English verb> + ചെയ്യുക/ആകും` pattern the correct default for verbs
describing software actions?** If yes, that is one rule and it likely fixes most of the
gap in one change — which is why we would rather ask this than ask about each paragraph.

**A10. Rows 1, 2 and 3 are fully English in your translation. Deliberate?** They are all
instruction-and-keyboard text, which is a consistent enough pattern that it looks like a
rule rather than an accident.

**A11. Row 8 looks to us like an error, not a style difference** — the tool writes
`"Next" button-ലെ buttons` ("buttons in the Next button"), and changes your "you can
check each line" into "you can move forward line by line". Please confirm it is wrong so
we treat it as a defect rather than a variant.

**A12. Row 6: you split it into three sentences and kept two of them fully English; the
tool merges all three into one Malayalam sentence.** Is sentence-splitting something we
should preserve from the source, or is merging acceptable?

### A13–A14 — the two one-line confirmations

**A13. Headings stay fully English.** Confirmed by measurement — your translation has
**27 of 27 headings byte-identical** to the English source, and so do all three machine
renderings. Please just confirm this is intended, and we will stop treating it as open.

**A14. Proper names stay in Latin script.** Same — your translation does this
throughout. Confirm and we close it.

### A15 — a policy violation we found, and want your view on severity

The tool sometimes writes an English word out *phonetically in Malayalam letters*
instead of leaving it in Latin. Your translation never does this — zero instances across
every term we checked. The machine renderings do:

| Written as | Should be | Occurrences |
|---|---|---|
| `ക്ലിക്ക്` | `click` | 6 of 6 occurrences in one rendering |
| `ഓപ്ഷൻ` | `option` | 3 of 7 occurrences in another |
| `സെറ്റ്` | `set` | 2 |

**A15. How bad is this — a serious error, or merely awkward?** We ask because
`option` was transliterated 3 times out of 7 and left in Latin the other 4 times *in the
same document*, and inconsistency of that kind is the thing we are most worried about at
scale. All three words are absent from the glossary, so pinning them should prevent it —
which is what Section C is for.

---

## Section B — content-mix catalog

Contexts your reference translation does not contain, so we have no ground truth for
them. For each, the tool's current treatment is shown so you are confirming or
correcting rather than composing from scratch.

### B1–B3 — prose that introduces a display-math block

| # | English source | The tool |
|---|---|---|
| **B1** | `Mathematically, a vector $\mathbf{v} \in \mathbb{R}^n$ can be represented as:` | `Mathematically, ഒരു vector $\mathbf{v} \in \mathbb{R}^n$ ഇങ്ങനെ represent ചെയ്യാം:` |
| **B2** | `An eigenvector $v$ of matrix $A$ satisfies:` | `matrix $A$-യുടെ ഒരു eigenvector $v$ ഇത് satisfy ചെയ്യുന്നു:` |
| **B3** | `The power iteration method can be used to find the dominant eigenvalue:` | `dominant eigenvalue കണ്ടെത്താൻ power iteration method ഉപയോഗിക്കാം:` |

**B1–B3. Is this the right mix for maths-introducing prose?** Note B1 keeps the
sentence-opening adverb `Mathematically,` in English — deliberate-looking, but we did
not ask for it.

### B4 — prose inside a nested `####` subsection

> **EN**: `Vector space properties are fundamental in economic modeling. The closure property ensures that combinations of feasible allocations remain feasible, while the existence of inverses allows us to model debts and obligations.`
>
> **ML**: `economic modeling-ൽ vector space properties അടിസ്ഥാനപരമാണ്. closure property, feasible allocations-ന്റെ combinations feasible ആയി തുടരുന്നു എന്ന് ഉറപ്പാക്കുന്നു, inverses-ന്റെ നിലനിൽപ്പ് debts, obligations എന്നിവ model ചെയ്യാൻ നമ്മെ അനുവദിക്കുന്നു.`

**B4. Does deeply-nested explanatory prose want the same mix as top-level prose, or
should it read more plainly?**

### B5 — exercise and hint prose

> **EN**: `Starting with your solution to exercise 1, plot three simulated time series, one for each of the cases $\alpha=0$, $\alpha=0.8$ and $\alpha=0.98$.`
>
> **ML**: `Exercise 1-ന്റെ നിങ്ങളുടെ solution-ൽ നിന്ന് തുടങ്ങി, മൂന്ന് simulated time series plot ചെയ്യുക; $\alpha=0$, $\alpha=0.8$, $\alpha=0.98$ എന്നീ ഓരോ case-നും ഒന്ന് വീതം.`

**B5. Exercise text is instructional rather than explanatory. Is this register right for
a student reading a problem set?**

### B6–B7 — Python comments inside code cells

This one has an inconsistency we created ourselves, and we would rather show it than
hide it. In one configuration the tool translates code comments; in another it leaves
them alone. Within the translating configuration it is also not uniform:

| # | English comment | The tool |
|---|---|---|
| **B6** | `# Create two vectors` | `# രണ്ട് vectors സൃഷ്ടിക്കുക` |
| | `# Visualize vectors` | `# Vectors visualize ചെയ്യുക` |
| | `# Final demand vector (in billions)` | `# Final demand vector (billions-ൽ)` |
| **B7** | `# Sectors: Agriculture, Manufacturing, Services` | *left identical* |
| | `# States: Employed, Unemployed` | *left identical* |

**B6. Should Python comments inside code cells be translated at all for Malayalam?** A
"no" is easy for us to implement and arguably safer, since comments sit beside code a
student may copy.

**B7. If yes, is leaving all-proper-noun comments untouched the right exception?** That
is what happened, but nothing in the configuration asked for it.

### B8 — a note on figures

We had intended to ask about figure captions. It turns out **none of the 47 figures in
the programming series has caption prose** — they carry only a scale directive. So there
is nothing to ask, and we are recording that rather than inventing a question.

---

## Section C — which terms to pin

**First, the good news, because it changes what we need from you here.** We translated
five lectures from the programming series with two different models and extracted every
technical term each one produced — **203 distinct terms**. Both models kept **all 203 in
English**. Not one was rendered in Malayalam script. Only 6 of them are pinned in the
glossary today, so the policy is holding on nearly two hundred terms it was never
explicitly told about.

That means we cannot bring you the list we planned. We intended to show you the terms
where the two models *disagreed* about keeping a term English, on the theory that
disagreement marks the terms needing a ruling. There is no disagreement to show: the two
models differed on ten terms and every difference was singular-versus-plural (`tuple` /
`tuples`, `coefficient` / `coefficients`) or spacing (`deadweight loss` / `dead weight
loss`). Nothing substantive. So the question below is a different and simpler one.

**Why pin anything, if the policy already holds?** Because it held for these 203 terms
and failed for four others. Three of the words that came back transliterated — `click`,
`option`, `type` from A15 — are interface verbs rather than domain terms, so they were
never extracted as terminology and nothing was protecting them. The fourth, `set`, *is*
in the list below. Either way none of the four is pinned, and pinning is what makes a
term's treatment reliable rather than lucky.

**C1–C20. Below are the 20 most frequent unpinned terms, all currently kept in English
by both models. Tick any you think should be pinned so a future model cannot change its
mind — and flag any you think should actually be *translated*.**

Please don't feel obliged to work through all twenty. The top ten matter most, and blanket
answers are genuinely useful: "all of these keep English" or "everything down to C20 is
fine" saves you time and tells us what we need.

| # | Term | Occurrences | Lectures | Keep English? |
|---|---|--:|--:|---|
| C1 | `array` | 45 | 2 | ☐ keep ☐ translate |
| C2 | `method` | 40 | 3 | ☐ keep ☐ translate |
| C3 | `class` | 30 | 1 | ☐ keep ☐ translate |
| C4 | `broadcasting` | 20 | 1 | ☐ keep ☐ translate |
| C5 | `cell` | 20 | 1 | ☐ keep ☐ translate |
| C6 | `consumer` | 20 | 1 | ☐ keep ☐ translate |
| C7 | `data` | 20 | 1 | ☐ keep ☐ translate |
| C8 | `instance` | 20 | 1 | ☐ keep ☐ translate |
| C9 | `data type` | 16 | 2 | ☐ keep ☐ translate |
| C10 | `dimension` | 15 | 1 | ☐ keep ☐ translate |
| C11 | `object` | 15 | 1 | ☐ keep ☐ translate |
| C12 | `shape` | 15 | 1 | ☐ keep ☐ translate |
| C13 | `wealth` | 15 | 1 | ☐ keep ☐ translate |
| C14 | `time series` | 13 | 2 | ☐ keep ☐ translate |
| C15 | `element-wise` | 12 | 1 | ☐ keep ☐ translate |
| C16 | `package` | 12 | 2 | ☐ keep ☐ translate |
| C17 | `steady state` | 12 | 1 | ☐ keep ☐ translate |
| C18 | `code block` | 10 | 1 | ☐ keep ☐ translate |
| C19 | `command` | 10 | 1 | ☐ keep ☐ translate |
| C20 | `instance data` | 10 | 1 | ☐ keep ☐ translate |

*(Fourteen further terms sit just below these, and would be numbered C21–C34, in descending frequency: `sequence`,
`expression`, `indentation`, `area`, `attribute`, `index`, `market`, `polynomial`, `set`,
`string`, `terminal`, `text editor`, `tuple`, `coefficient`. Happy to send them as a
follow-up — we did not want the length of the table to be the reason this goes
unanswered.)*

**C35. Is there any term in these lists you would *translate* rather than keep?** That is
the more interesting direction. Our own guesses at candidates are the economics words
rather than the programming ones — `consumer` (C6), `wealth` (C13), `market` — where
everyday Malayalam may have a better rendering than the English.

**C36. `set` is on the follow-up list and is also one of the four words that came back
transliterated (A15).** It is the one term where we have direct evidence of instability,
so it is worth a specific answer even if you skip the rest.

---

## Section D — one forward-looking question

**D1. Which 3–5 lectures from `lecture-python-programming` would you most want to review
next?**

We will translate whichever you choose and deliver them as pull requests so you can
comment inline. Our only constraint is variety — ideally one prose-heavy, one
economics-heavy, one maths-heavy and one code-heavy, and at least one long one, because
term consistency only becomes visible across a long document. Beyond that the choice is
better made by you than by us. Asking now saves a whole round trip.

The full candidate list is: about_py, getting_started, python_by_example,
python_essentials, python_oop, python_advanced_features, functions, names, numpy,
pandas, pandas_panel, scipy, sympy, numba, jax_intro, need_for_speed,
numpy_vs_numba_vs_jax, writing_good_code, workspace, debugging, matplotlib.

---

## What happens next

1. Your answers become glossary entries and configuration rules — we regenerate the
   affected documents to confirm each fix generalises rather than patching one spot.
2. We translate your chosen lectures from D1 and deliver them as pull requests for
   inline review.

There is no deadline. A partial reply — even just Section A1 and Section D1 — moves this
forward materially.

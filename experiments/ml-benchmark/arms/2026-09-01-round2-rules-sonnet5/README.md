# Arm: round-2 rules (v0.4), claude-sonnet-5, 2026-09-01

The regeneration run that checks the round-2 rule changes generalise (#296 — the
118-suggestion inline review on lecture-python-programming.ml#7, dispositions in
QuantEcon/project-translation
`reports/2026-09-01-ml-functions-review-disposition.md`). Same recipe as the
round-1 arm (`2026-08-17-round1-rules-sonnet5/`): one fresh single-pass
translation of the reviewed lecture with the new payload, scored against the
seed the reviewer flagged and against his reviewed text. Archived per the
DISPOSITIONS.md process rule.

## Provenance

| Field | Value |
|---|---|
| Model | `claude-sonnet-5` (same model that produced the ml#7 seed) |
| Command | `init -s <src> -t <target> --target-language ml -f functions.md --localize none -m claude-sonnet-5` |
| Source | `QuantEcon/lecture-python-programming@81d9734` (the ml#7 seed's own source, so the comparison is like-for-like) |
| Engine | `ml-round2-v04@1251b7b` — rules 18 → 24 + glossary v0.4.0 + the round-2 lints |
| Tokens / wall time | 25,756 / 3.4 min |

## Scores — signature counts: seed (what the reviewer flagged) vs his reviewed text vs this arm

Seed = ml#7 base `5ffae4e`; reviewed = his 118 suggestions applied + normalised,
ml `main@c1200fa`. The first row is the four round-2 lints from
`scripts/ml_metrics.py` (terminal punctuation / lowercase-initial / banned
renderings / future-hortative watch); "−" should fall toward the reviewed count,
"+" should rise toward it.

| Signature | dir | seed | reviewed | this arm |
|---|---|---|---|---|
| bare-ending / lowercase-initial / banned / hortative-watch (lints) | − | 23/17/15/6 | 1/0/2/1 | **16/5/1/3** |
| colon-terminated Malayalam paragraphs | + | 4 | 18 | **6** |
| തന്നിരിക്കുന്ന (a given) | + | 0 | 3 | **4** |
| ഒരു നൽകിയ (a given, banned) | − | 3 | 0 | **0** |
| നമുക്ക് (hortative subject) | + | 9 | 21 | **14** |
| നോക്കാം | + | 0 | 8 | **4** |
| നമ്മൾ … -ും future (sentence-final) | − | 6 | 1 | **3** |
| കണക്കിലെടുക്ക (consider, banned in the look sense) | − | 5 | 1 | **0** |
| ഉപയോഗപ്രദ (useful, banned) | − | 5 | 1 | **0** |
| useful (English) | + | 0 | 4 | **5** |
| കുറച്ചുകൂടെ (misspelling) | − | 3 | 0 | **0** |
| Capitalised sentence-initial English (Functions-നെ, Built-in, Return statement, Order, User-defined) | + | 0 | 5 | **2** |
| bullet items carrying additive -ഉം (`sqrt()` function-ഉം) | − | 2 | 0 | **0** |
| `a`, `b` എന്നിവ | + | 0 | 1 | **1** |
| sandwich fragment ഒപ്പം alone on a line | − | 1 | 0 | **0** |
| In particular, / Obviously, / Basically, English | + | 0 | 3 | **3** |
| For example, English (held, ml#12 Q1) | ? | 0 | 2 | **3** |
| ex3 random device wholly English (Flip an unbiased coin 10 times.) | + | 0 | 1 | **1** |
| ex2 binomial sentence English (Using `rng = …`, write a function) | + | 0 | 1 | **1** |
| ex1 hybrid: such that `factorial(n)` returns $n!$ (English clause) | + | 0 | 1 | **1** |
| pointer sentences English (Here's a/another function for the …) | + | 0 | 2 | **2** |
| `plot(x, 'b-')` differs from … English | + | 0 | 1 | **1** |
| ex5 recursion statement Malayalam (recursion ഉപയോഗിച്ച്) | + | 1 | 1 | **0** |
| math-heavy hint (ex2) English: If $U$ is uniform | + | 1 | 1 | **1** |
| already (English, held Q3) / ഇതിനകം | ? | 4 | 4 | **4** |
| name (English, held Q5) / പേര് | ? | 10 | 11 | **12** |
| `ml_metrics.py` FAIL gates (headings 17/17, casing 0) | | clean | — | **1 FAIL** (see 4) |

Signature script: QuantEcon/project-translation scratch `signatures.py` (regexes
are in this README's table labels; the lint counts come from `ml_metrics.py --json`).

## Misses and new findings (one rendering, one model, one document — direction, not a rate; #227 discipline applies)

1. **Terminal punctuation is the weak rule: 23 → 16 bare endings, not → 1.** The
   prompt rule fires on a third of the cases; the model still mirrors an
   unpunctuated English line. Every one of the 16 is a Malayalam sentence
   immediately before a code cell, and in the reviewed text every such line
   carries a colon or a full stop. This is the clearest case yet for a
   **deterministic post-processing step** rather than more prompt: a bare
   Malayalam ending before a `{code-cell}` gets `:` (the reviewer's choice in
   every forward-pointing case). Candidate for W2 (#260) deterministic
   localisation; the lint already detects it on every sync PR.
2. **Capitalisation: 17 → 5, all five on bullet items** (`built-in ആയ …`,
   `code reuse …`, `data …`, `function calls …`). Paragraph starts are all
   fixed; list items are not. Sharpen the rule text with a bullet example
   ("* Code reuse …"), or fold into the same post-processing step (a
   lowercase Latin word at the head of a prose line or list item is
   capitalised deterministically).
3. **Scope over-application: the ex5 statement stayed English.** "Rewrite the
   function `factorial()` in from [Exercise 1] using recursion." is pure
   programming instruction — the reviewed text translates it — but the model
   read the new exercise-statement rule as "exercise statements stay English".
   The rule already says pure programming translates; it needs the negative
   example named ("Rewrite the `factorial()` function using recursion"
   translates). One instance. (Separately: the English source carries a typo,
   "in from" — a source-side fix for lecture-python-programming.)
4. **One pinned-term FAIL, a real regression: `set` transliterated.** "with `n`
   set equal to 100" → `100 ആയി സെറ്റ് ചെയ്ത്` — the software-interface pin from
   packet C2 (`set`) rendered in Malayalam script. Not the #240 homograph
   class (this is the pinned sense and it was transliterated, which the policy
   forbids outright); the seed had it right (`set ചെയ്ത്`). One instance, the
   gate caught it, no rule change proposed from a single draw.
5. **One round-1 class regression**: `സൂചിപ്പിക്കുന്നു` for *refer* (glossary
   pin `refer` → refer ചെയ്യുന്നു, round-1 flag 19) at line 155. One instance.
6. **"For example," rendered English 3×** where the reviewer had 2 English / 2
   Malayalam — consistent with the held guess on ml#12 Q1; nothing encoded yet.
7. Hortative partially adopted: നമുക്ക് 9 → 14 (reviewed 21), നോക്കാം 0 → 4
   (reviewed 8), sentence-final നമ്മൾ…-ും 6 → 3 (reviewed 1). Direction right,
   magnitude half.

## Verdict

The round-2 rules generalise where they are lexical or structural: every fixed
pair (a given, consider, useful, spelling), the accusative/list-item forms, the
sandwich sentence, the connectives, all four exercise-scope retentions and both
pointer sentences land exactly at the reviewed form — 17 of 26 signatures at or
past the reviewed count on one fresh pass. The two purely mechanical classes
(terminal punctuation, list-item capitalisation) are where a prompt rule
under-delivers and a deterministic step would deliver in full; they are also
the two the new lints detect on every PR, so nothing ships silently. Two
one-instance regressions (`set` transliterated, `refer` calqued) and one scope
over-application (ex5) are logged; the ex5 negative example is worth adding
before release, the rest are watch items.

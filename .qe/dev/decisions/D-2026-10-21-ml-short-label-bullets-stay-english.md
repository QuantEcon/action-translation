# Malayalam: short label bullets stay in English

**Context**: In the fifth inline review round (lecture-python-programming.ml#26, `pandas`, 85
suggestion blocks, 2026-10-09..16) the editor of record (@adisankarmt) returned the five bullets
under *endows them with methods that facilitate operations such as* to the English byte for byte:
*reading in data*, *adjusting indices*, *working with dates and time series*, *sorting, grouping,
re-ordering and general data munging*, *dealing with missing values, etc., etc.* The seed had
rendered them as verbal nouns (`data read ചെയ്യൽ`), the other two draws as imperatives. Whether this
was a scope rule or a one-off fix was put to him as ml#57 Q1, because the evidence pointed both
ways: `D-2026-09-18-ml-further-reading-lists-stay-english` had noted that the all-English feature
list in `matplotlib` was "not a general preference for English bullets", and in round 3 he turned
*output in all the usual formats* into a Malayalam sentence, which rule 12 still asks for. His
answer (2026-10-20): "the points were barely 2-3 words. so i retained it in english. to add on, the
translated part read badly. so yes, make it general rule - reading small sentences in english is
better than bad translation". Like the exercise and Further Reading rulings, it changes *what* is
translated rather than *how*, so it needs its own record. Analysis: QuantEcon/project-translation
`reports/2026-10-19-ml-pandas-review-disposition.md` (observation 4, R7, R11). #promote

**Decision**: Ruled by the editor on lecture-python-programming.ml#57, encoding approved by
@mmcky, 2026-10-21. For `ml`, a bullet list of short labels stays wholly in English, each item
byte-identical to the source. Unlike Further Reading, the boundary can be drawn without judgement,
so it goes **into code first**: `ml_metrics.is_label_list` decides on the English list, and
`ml_repair.py` restores the items the model translated (repair 6, source-gated), with a lint key,
`label_list_translated`.

The boundary is a list's, not an item's, because no word count reproduces his pages: a 6–8 word
item stays English in a list of labels (`pandas` 70–72, `python_by_example` 97–98) while a 7–9 word
item is a Malayalam sentence in a list that mixes lengths (`matplotlib` 50 and 52). A list is a
label list when:

- it is a bullet list (`*`, `-`, `+`); a numbered list is a sequence of steps;
- at least one item has three words or fewer, and none more than eight (a code span, a footnote
  mark or a link's text counts as one word);
- no item continues the sentence (ending in *and*, *or* or a comma), ends in a full stop other than
  *etc.*, or carries a clause after an em-dash;
- its lead-in does not end in a relative, a modal, *let* or *to*, after which the items are verb
  phrases (*The main part of the program that*, *consumers, who can*);
- every item is one line with no nested list, and the draft has the same lists in that section,
  with the same item count and indent. Anything else is skipped, never guessed at.

On the five reviewed pages this matches only lists that are already English, plus the two bullets
at `functions` 279–280 (*separating different strands of logic*, *facilitating code reuse*), which
the round-2 review predates. On the archived drafts it restores the five `pandas` bullets in 9 of
9, the two `functions` bullets in 29 of 29, and the `python_by_example` list in the drafts that
translated it; its one false positive there (the numbered steps of `getting_started`) is what the
bullets-only condition removed.

**Consequences**:

- Rule 12's bullet clause ("make a bare noun-phrase bullet a full Malayalam sentence") now applies
  only to bullets outside a label list. The prompt text changes in the next re-drawing release,
  measured at ≥ 12 draws per arm with the other held rule edits, not here: a rule edit is not
  inert (the round-4 trims, `experiments/ml-benchmark/arms/2026-09-28-round4-prompt-trims/`).
  Until then the review judge
  is not told, so it may call a restored list under-translation, as it could Further Reading before
  rule 22.
- The `{note}` lead-in he returned to English at the same time (*For the `.apply()` method:*,
  ml#26 326) is not in the code: one site, and a short lead-in has no structure to key on. It goes
  in the prompt rule.
- `functions` 279–280 stay as he approved them on the edition's `main` (@mmcky, 2026-10-21): the
  ruling governs new drafts, and a reviewed page is not reopened for it.
- Retention checks and the script-ratio band must treat an all-English label list as compliant.

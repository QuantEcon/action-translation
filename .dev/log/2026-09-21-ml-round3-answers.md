# 2026-09-21 — ml round-3 answers (ml#22) encoded; two shipped guesses corrected

**Trigger**: Adisankar answered QuantEcon/lecture-python-programming.ml#22 on 2026-09-19 — every question, one line each. Three answers confirm our reading, two overturn a guess, two are "both acceptable".

| Item | His answer | Against our guess |
|---|---|---|
| Which ordinary words stay English | "would a Kerala student say this word in everyday conversation?" is "a fair test" | confirmed — mildly, and to a leading question |
| *provide* | both acceptable; `നൽകുന്നു` read better in that lecture | soft confirmation |
| plural of a retained noun | English plural + Malayalam suffix; agrees `-ുകൾ` after a hyphen renders badly | confirmed |
| *prefer* | keep in English | we had none |
| *draw* | `വരയ്ക്കാം` is natural and worked better there | **overturned** (`draw ചെയ്യുക`) |
| comma between `-ഉം` items | always — phrases and single words | **overturned**, and v0.29.0 shipped the guess |
| Further Reading | intentional: reference material pointing outside the lecture | the section, not any link-led bullet |
| our two normalisations on ml#13 | both correct | — |

**Done** (branch `ml-round3-answers-ml22`)
- `ml` rules 27 → 28. The clause-boundary comma rule, part (c), loses "when each side is a phrase rather than a single word" and gains single-word examples; the suffix rule's own example (`a green border-ഉം a blinking cursor-ഉം`) contradicted it and now carries the comma. New short rule: the plural of a retained noun is the English plural plus the suffix — its own rule rather than one more clause in the longest rule of the set, where adherence is weakest.
- Glossary v0.7.0: `prefer` pinned English (light-verb form); `provide` → `നൽകുക`, superseding the v0.4.0 pin, with a context note that the other form is never an error.
- **Not encoded, on purpose**: *draw*. He changed `വരയ്ക്കുന്ന` to `draw ചെയ്യുക` at one line of `matplotlib` and calls `വരയ്ക്കാം` natural at another; both are his. The round-3 disposition report classed the first as a rule miss — in hindsight it was not. A future flip on *draw* or *provide* is preference, not a defect, and should be read that way in the round-4 analysis.
- `D-2026-09-21-ml-further-reading-boundary-is-the-reference-section` (pointer note atop the 09-18 record). The prompt rule's wording already matched; moving it to code is now unblocked under #260.
- `ml_metrics.py`: two lints — a Malayalam plural on a Latin-script singular, and two adjacent hyphen-suffixed `-ഉം` items with no comma. Calibrated on the three reviewed lectures and the round-4 draft: no false positives; they do find seven instances on already-merged pages (`matplotlib` 87, 89 ×2; `functions` 279; `python_by_example` 95, 358, 441), handled on the edition.
- Tests: the two corrected strings pinned (and their old forms pinned absent), the plural rule, *draw* absent from the light-verb list, glossary shape. Suite green, lint/format clean, `dist/` + `dist-action/` rebuilt.

**Still open — rule 2.** He accepts the everyday-speech test, so the rewrite the round-3 report proposed (the principle in the prompt, the word lists in the glossary) is unblocked. It is not in this change: rule 2 is the rule behind the ordinary-word pendulum (round 2: 24 to English / 8 to Malayalam; round 3: 4 / 12), *draw* — which we had listed under "stays English" — shows the test is not sharp, and nothing reaches him unmeasured. Run it held-out through the blind pairwise judge (`judge.mjs` in the 2026-09-18 arm) first.

**Round 4 is not regenerated.** lecture-python-programming.ml#23 (`numpy`, v0.29.0) has had no human activity. Against his answers the draft has no Malayalam plurals on English nouns, no *prefer*, no *draw*; two lint-visible comma-less `-ഉം` pairs (282, 846) and two more by eye (842, 904); six `provide ചെയ്യുന്ന`, which he calls acceptable. About four contradicted lines in 143 does not justify resampling nearly every line. Pre-registered for the round-4 analysis: flags on those comma lines and any *provide* flip are known-and-encoded, excluded from the convergence residue.

**Next**: PR → harness run on the `.ml` lane with the local bundle → ride the next release (a patch is enough; nothing here is a feature). Then the rule-2 arm.

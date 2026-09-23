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

**Round 4 will be regenerated at the next release (Matt, 2026-09-21 — reverses the first call of the day).** The first call was to leave lecture-python-programming.ml#23 (`numpy`, v0.29.0) alone: about four contradicted lines in 143 did not justify three new draws. The arm below changed the arithmetic — the draws now exist, and branch draw 1 is cleaner than the draft he was sent on every lint (bare endings 0 vs 3, comma-less `-ഉം` pairs 0 vs 2, `provide ചെയ്യ…` 0 vs 6, banned 2 vs 3) — and his review time is the scarce resource. He has not started (no activity on #23 since 2026-09-18), and he has been asked on #22 and #23 to hold off. Sequence, as for round 3 at v0.28.0: merge → v0.29.1 with its §4a gate → three draws at `@v0`, best by lint, `ml_repair.py` applied and disclosed → force-update #23 and retitle. No branch draw goes to him: every round has been generated at a published `@v0`. If he says he has already started, #23 stays as it is and the pre-registration stands: flags on the comma-less pairs and any *provide* flip are known-and-encoded, excluded from the convergence residue.

**Measured** (`experiments/ml-benchmark/arms/2026-09-21-round3-answers-numpy/`): three draws of `numpy` on the branch beside the three archived v0.29.0 draws — same source, model and command, and `numpy` is held out. The glossary change is deterministic (`provide ചെയ്യ…` 16 → 0). The corrected comma rule moves the output part-way only: hyphenated `-ഉം` pairs with a comma 0 of 4 → 2 of 6, the same two lines missed in both draws that had them. A rule he states as "always" lands about a third of the time from the prompt — the terminal-punctuation finding again — so `ml_repair.py` gained the comma as its third mechanical repair. The plural rule had nothing to do on this lecture; the one Malayalam plural in six draws is on a mass noun (`functionality-കൾ`), the same case as `logic-ുകളെ` on the reviewed `functions` page, and that is a question to him, not a rule.

**Harness**: the local `dist-action` bundle delivered on the `.ml` lane (test-translation-sync.ml#191, fixture PR test-translation-sync#890): 87-term glossary loaded, UPDATE path, the plural rule firing on the fixture's own `concepts-കൾ` → `concepts`, the hortative holding. It also missed the comma on its one `-ഉം` pair and opened a sentence with lowercase `modern` — the second harness run in a row to do so. Both are lintable misses of rules already present: more weight on the lint-and-repair step (#260, #301) over more prompt.

**Edition side**: lecture-python-programming.ml#24 brings the six places on the reviewed pages into line with his answers (three plurals, three commas), for his review; `logic-ുകളെ` left as his call.

**Merged and release cut, same day.** #315 merged as `cd41558` (Copilot: two wording nits, addressed in `a4ecc46`); release PR for v0.29.1 opened on `release-v0.29.1`. §4a gate status is recorded on the release PR.

**Next (as written before the merge)**: review + merge → patch release v0.29.1 (nothing here is a feature) → regenerate round 4 at `@v0` → then the rule-2 arm.

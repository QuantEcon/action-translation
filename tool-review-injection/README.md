# `tool-review-injection` — certifying the reviewer by injected-defect catch rate

*Puts known defects in front of the deployed reviewer and records what it says. The object under test is `QuantEcon/action-translation@v0` as the estate resolves it, exercised through the harness's real `review-translations.yml` — this tool builds nothing and patches nothing.*

Tracker: [QuantEcon/project-translation#28](https://github.com/QuantEcon/project-translation/issues/28) · the review-mode half of the per-mode eval harness ([#11](https://github.com/QuantEcon/project-translation/issues/11)) · Last updated: 2026-08-20

## Why injection rather than field observation

Three numbers, from the tracker:

- **Field volume cannot certify the gate.** ~1.2 auto-merge-eligible PRs/week estate-wide → ~300 consecutive clean auto-merges for a ≤1% regression bound → ~4.6 years.
- **Field labels do not exist.** Under the default-deny ground-truth rule the estate holds four engine-era human-labelled commits (~175 lines). Fitting the gate to shadow data is the machine grading the machine.
- **The tunable knobs are dead.** `CRITERION_FLOORS` gate 1 of 44 live shadow editor-routings alone. The operative rule is **any ≥minor finding in a gating category**, which fires on 43/44.

Injection inverts all three: the positive class is manufactured, ground truth is constructed, and a review costs ~$0.49 / ~40s.

## What is measured

Not "did the score drop", and not "did the PR route to editor". Those are different questions and a defect can be caught by one surface and missed by another, so each is recorded separately (`surfaces()` in `lib.mjs`):

| Surface | Definition | Why it is separate |
|---|---|---|
| **operative** | a `blocker`/`major` finding in **any** category, or a `minor` in `accuracy`/`terminology`/`syntax`/`diff-check`/`other` | the rule that actually gates 43/44 live routings — the headline catch rate |
| **deterministic** | a `diffChecks` entry false with provenance ≠ `model` | measured fact, not model opinion; catches structure without judging content |
| **syntax** | `syntaxErrorCount > 0` | engine-side, always gating |
| **floors** | a `… below floor …` reason | the near-inert knob, recorded to keep confirming it is inert |
| **routed** | `recommendation === 'editor'` | the union of everything above; the safety-relevant outcome |

A defect caught only by `routed` and not by `operative` was caught by luck or by a side effect, and the report says so.

> **Correction, made during the build and recorded rather than hidden.** The tracker describes the operative surface as "any ≥minor finding in a gating category". That is right for `minor`, but `computeRecommendation` gates `blocker` and `major` through separate `blockers > 0` / `majors > 0` clauses that ignore the category entirely — so a `blocker/formatting` gates the PR. The first implementation here required a gating category at every severity, which **understated** the reviewer. `isGatingFinding()` in `lib.mjs` now mirrors the engine. Attribution was restructured at the same time to index the full `findings` array rather than the gating subset, so a future change to the gating rule re-scores the existing data instead of silently re-indexing it.


## Pre-registered analysis rules

**Registered 2026-08-20, before any fixture was run.** These follow the conventions in the [#15 addendum](https://github.com/QuantEcon/project-translation/issues/15#issuecomment-5186948873) and are not to be revised against the data they judge.

1. **Attribution is required for a catch.** A gating finding counts as a catch only if it points at the injected defect. Firing on something else in the same document is not a catch, and a certification that scored it as one would overstate the reviewer. Attribution is adjudicated per finding against the fixture's `groundTruth` and `defectMarker`, blind to whether the fixture was caught overall.
2. **The clean control is the baseline, per site.** Each site's control fixes that site's background finding signature. A finding present in the control's signature is not evidence about an injection at the same site.
3. **Replicates are draws, not properties.** Per-class catch rates are reported with Wilson 95% intervals. No claim rests on a single fixture's routing — [#248](https://github.com/QuantEcon/action-translation/issues/248) established the decision layer is deterministic *given fixed input*, which makes small replicate counts adequate but does not make n=1 a rate.
4. **Severity margin is reported as a distribution, not a binary.** The reviewer's variance lives at the nit/minor boundary and 18 of 44 live shadow routings hang on a single minor finding, so every fixture's full severity×category signature is recorded and reported, not just whether it gated.
5. **Negative controls are scored as false positives, without exception.** A finding on a `baike.baidu.com` link, on deliberate Latin-script retention, on real upstream API drift, or on a `{todo}` the English source still carries, is a false positive regardless of how reasonable its prose sounds.
6. **No prompt, rubric, severity-definition or floor change during the measurement.** The reviewer is frozen while it is measured; catch-rate data then directs what gets sharpened. The engine ref is recorded on every verdict (`engineVersion`/`engineRef`) so the lineage is falsifiable.
7. **Scope suppression is reported separately from detection.** A defect the reviewer never had in scope was not missed — it was never asked about. Fixtures state which case they are.
8. **Nothing is silently dropped.** An unparseable verdict block, a review that never ran, a fixture whose anchor failed to apply — each is recorded and counted, because a certification that quietly discards its failures reports a rate for a different experiment.

## Two structural facts the design turns on

Both were established by reading the deployed engine, not inferred, and both change what the fixtures can mean.

**Scope is derived from the *source* diff.** The reviewer's prompt ends with *"findings MUST relate ONLY to the sections that were changed in this PR"*, and `identifyChangedSections` computes those from the source PR's before/after — target-only changes never add a section. So every injection needs a paired source-side edit covering its site, or the measurement is of scope suppression rather than detection. That is why the harness opens a **source PR per site**.

**Review filters to `.md`.** `reviewPR` keeps only files matching the docs folder and ending `.md`, before any model call. **`_toc.yml` therefore never reaches the reviewer at all** — the ToC-caption variant of `de-localisation` scores zero *by construction*, not by model failure. The tracker's "expected to score near zero" is a stronger statement than it looked: this half of the class is not a judgement the reviewer gets wrong, it is a file it is never shown. The in-document half (`{doc}` link text, figure captions) *is* visible, and that is the half worth measuring.

## The sites

A site is one (source edit, correct translation) pair, confined to a single `##`+ section so the injection lands in scope. `build-sites.py` derives all five from the harness base state by exact anchored substitution — it fails loudly rather than fuzzily if the base drifts.

| Site | File | Section | Affordances it exists to host |
|---|---|---|---|
| A | `lecture.md` | Matrix Operations | prose, display math, code cell, pandas axis names (`using_sector`/`supplying_sector`) as identifier ground truth |
| B | `lecture.md` | Eigenvalues and Eigenvectors | `{doc}` link text (must localise) beside an `{eq}` label (must not) |
| C | `lecture-minimal.md` | Supply and Demand | plain prose only — the diff shape closest to a real auto-merge-eligible sync PR |
| D | `lecture.md` | Vector Spaces | `sns.set_theme()` followed by the CJK font override; Greek axis labels; a legacy `np.random.seed` |
| E | `lecture-minimal.md` | Economic Models | wiki link, `**bold**` definition, `(sec:calibration)=` anchor, a `{todo}` the source keeps, `McCall 模型`, inline `$\beta$` against CJK, a code cell |

All five verify clean before anything is spent: correct changed-section scope through the engine's own `identifyChangedSections`, and `checkStructuralParity` OK against their source.

## Mechanism

Review mode does not fire on hand-staged content by accident — it needs the `action-translation` label *and* a `### Source PR` block in the body ([action-translation#218](https://github.com/QuantEcon/action-translation/issues/218)). Supply both and the real workflow runs, which is how these fixtures reach the deployed reviewer without a sync in the loop:

1. `sources` — one PR per site on `test-translation-sync`, carrying the English edit. **Never merged, never labelled `test-translation`** — either would fire a real sync.
2. `targets` — one PR per fixture on `test-translation-sync.zh-cn`, branch `inject/…` (deliberately not `translation-sync-`/`resync/`, the prefixes the rebase workflow acts on), body shaped by the engine's own `buildPrBody`, **unlabelled**.
3. `fire` — add `action-translation` in waves. Labelling is the trigger, so it is also the throttle.
4. `capture` — poll, parse with the engine's own `parseReviewVerdict` from `dist/`, never a hand-rolled grep.
5. `replicate` — empty-commit re-fire. `update-branch` works exactly once and label-cycling is a silent no-op if the remove did not land; an empty commit changes the head sha every time.

Capture is keyed on `reviewedHeadSha` and never re-fires over an uncaptured verdict, because **review mode overwrites its comment in place** — a verdict not captured before the next fire is gone.

## Running

```
RUN_ID=m0 node run.mjs plan          # apply edits, validate anchors, cost the run
RUN_ID=m0 node run.mjs sources       # source PRs, one per site
RUN_ID=m0 node run.mjs targets       # target PRs, unlabelled
RUN_ID=m0 node run.mjs fire --size 12
RUN_ID=m0 node run.mjs capture
RUN_ID=m0 node run.mjs replicate --size 12
RUN_ID=m0 node run.mjs status --verbose
```

`plan` is safe and free. Everything from `sources` on mutates the harness repos.

## Regenerating the fixture set

`fixtures/sites/`, `fixtures/variants/` and `runs/` are derived and deliberately not committed — a stale copy that no longer matches harness base state is exactly the silent-drift class this tool exists to measure.

```
python3 build-sites.py          # fixtures/base + anchored edits -> fixtures/sites
RUN_ID=m0 node run.mjs plan     # fixtures/sites + fixtures.json -> fixtures/variants
```

`build-sites.py` fails loudly if an anchor no longer matches, which is what you want when the harness base state has moved: re-snapshot `fixtures/base/` from the live repos and fix the anchors rather than letting a fixture drift into meaning something else.

The two `*.workflow.mjs` files reproduce the authoring and adjudication passes. Both need the tool's absolute path, because a workflow script has no filesystem access of its own:

```
Workflow({ scriptPath: '.../craft-fixtures.workflow.mjs', args: { dir: '<abs path to this directory>' } })
Workflow({ scriptPath: '.../adjudicate.workflow.mjs',   args: { dir: '<abs path>', run: 'm0', fixtureIds: [...] } })
```

Crafting is the one nuance-bound step — subtle meaning inversions, plausible-but-wrong term swaps, equations that differ mathematically while looking similar. Every variant is adversarially verified before it runs (anchor uniqueness, in-scope, realises its class, ground truth quoted from the source, marker present only in the injected file, no collateral change). `fixtures/rejected.json` records what did not survive.

## Cleanup

Fixture PRs and branches are disposable: the engine's E2E script closes every open PR and force-pushes `main` back to base fixtures on its next run, so residue is self-clearing. Do not merge any fixture PR — a merged target PR whose branch matched a translation prefix would start the rebase workflow, and a merged source PR would fire a real sync.

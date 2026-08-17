# Arm: round-1 rules (v0.3), claude-sonnet-5, 2026-08-17

The regeneration run that checks the round-1 rule changes generalise (#272 — the
100-flag inline review on lecture-python-programming.ml#1, dispositions in
QuantEcon/project-translation
`reports/2026-08-17-ml-python-by-example-review-disposition.md`). Archived per
the DISPOSITIONS.md process rule: any machine output that an analysis quotes
gets committed. The Phase 2 (#189) closing check.

## Provenance

| Field | Value |
|---|---|
| Model | `claude-sonnet-5` (same model that produced the calibration batch the reviewer flagged) |
| Command | `init -s <src> -t <target> --target-language ml -f python_by_example.md --localize none -m claude-sonnet-5` |
| Source | `QuantEcon/lecture-python-programming@1c60c7d` (last main commit before the 2026-08-03 batch; the lecture drifted 13 lines since, so current main would confound) |
| Engine | `main@ac53b30` — the #272 squash: rules 10→18 + glossary v0.3.0 |
| Tokens / wall time | 24,844 / 4.0 min |

## Scores — signature counts: seed (what the reviewer flagged) vs his reviewed text vs this arm

Signatures are deterministic proxies for the round-1 rule classes ("+" should
rise toward the reviewed count, "−" should vanish). Seed = ml#1 base `ff09b87`;
reviewed = his 100 flags applied, `6ee7130`.

| Signature | dir | seed | reviewed | this arm |
|---|---|---|---|---|
| Below-deixis (`താഴെ കാണ`/`കൊടുത്ത`) | + | 0 | 17 | **10** |
| Ordinal `ആദ്യത്തെ` / clipped `ആദ്യ` | +/− | 0 / 8 | 7 / 1 | **7 / 1** |
| `അവസാനത്തെ` | + | 0 | 1 | 2 |
| Ablative `നിന്നും` / clipped `നിന്ന്` | +/− | 0 / 8 | 5 / 2 | **9 / 1** |
| "On the other hand" English / `മറുവശത്ത്` | +/− | 0 / 1 | 1 / 0 | **1 / 0** |
| `അതായത്` / `മറ്റൊരു വിധത്തിൽ പറഞ്ഞാൽ` | +/− | 1 / 1 | 2 / 0 | **2 / 0** |
| `മിക്കവാറും എപ്പോഴും` ("almost always" calque) | − | 1 | 0 | **0** |
| `ആവശ്യപ്പെടുന്നു` ("demands" for *require*) | − | 1 | 0 | **0** |
| `ആവർത്തിച്ച്` (vs keep-English *repeatedly*) | − | 2 | 0 | **0** |
| `സൂചിപ്പിക്കുന്നു` (vs *refer* `ചെയ്യുന്നു`) | − | 1 | 0 | **0** |
| `end ആക` / `അവസാനിക്ക` (everyday-verb direction) | −/+ | 2 / 0 | 0 / 2 | **0 / 1** |
| Pointer "`… ഇവിടെ`" sentences | − | 4 | 0 | **0** |
| *cover* `ചെയ്` present | + | 0 | 1 | **1** |
| **ex5 Hint wholly English** (scope ruling) | + | no | yes | **yes** |
| **ex5 Solution prose wholly English** (scope ruling) | + | no | yes | **yes** |
| `ml_metrics.py` FAIL gates | | clean | — | **clean** |

## Misses and new findings (one rendering, one model, one document — direction, not a rate; #227 discipline applies)

1. **"In fact" calqued both times** (`വാസ്തവത്തിൽ` ×2, both sentence-initial) —
   the one discourse-formula clause that did not fire; "On the other hand" in
   the same rule did.
2. **One `കൈകാര്യം` survives** — but for "working with (arrays)", not "cover",
   so the glossary pin held; it sits in the majority-technical NumPy bullet the
   reviewer anglicised wholesale (flag 11), a partial miss of the
   sentence-level keep-English rule.
3. **New variance regression: "line(s) of code" → `വരി`/`വരികൾ` (14×)** where
   the seed kept English (19×) and the reviewer kept English. Nothing in v0.3
   touched this term. Candidate glossary pins for v0.3.1: `line`, `lines`
   (programming); likewise watch `ദൈർഘ്യമേറിയ` for "long (program)" — an
   ordinary adjective the A1 rule says stays Latin.

## Verdict

The round-1 rules generalise: 20 of 23 signatures land at or near the reviewed
register on a fresh single-pass translation, including both halves of the
math-heavy Hint/Solution scope ruling
(D-2026-08-17-ml-math-heavy-sections-stay-english). The residuals are two
discourse/sentence-level prompt misses and one unrelated term-variance
regression, all logged above as v0.3.1 candidates.

# D-2026-07-15 — Sonnet 5 validated for zh-cn and fa; estate moves to v0.16.1

**Status**: decided · **Supersedes**: nothing · **Related**: D-2026-07-14-thinking-off-sonnet5,
D-2026-07-14-opus-for-bulk-seed, issue #82, QuantEcon/project-translation#5

## Decision

Move every production repo to v0.16.1, which carries the Sonnet 4.6 → Sonnet 5 default for
zh-cn and fa. Evidence-backed rather than assumed.

## Why the framing mattered

project-translation#5 framed this as "fr moves to Sonnet 5; zh-cn/fa stay on 4.6", i.e.
staying put is the safe option. That premise was wrong: **4.6 was never measured either** —
it shipped as the v0.15.0 default with no evaluation. "Don't upgrade until measured" held
the new model to a bar the incumbent didn't clear.

The answerable question was: does Sonnet 5 clear the last *known-good* bar (the 2025-12
Sonnet 4.5 baseline)?

## Evidence

26-scenario e2e harness, v0.16.1 + Sonnet 5, against zh-cn and fa: **26/26 correct
translation PRs per language**, incl. the RTL path.

| | Dec 2025 (Sonnet 4.5) | v0.16.1 (Sonnet 5) |
|---|---|---|
| Avg translation | 9.5/10 | 9.4/10 |
| Avg diff | 10/10 | 10/10 |
| Verdicts | 24/24 pass | 25/25 pass |

Judge pinned to the baseline's (`claude-opus-4-5-20251101`) so the comparison isolates the
translation model. Opus 4.8 as judge scored translation 9.6/10.
Reports: `tool-test-action-on-github/reports/evaluation-2026-07-15-sonnet5-{v2,opus48}.md`.

**Why three different denominators** (26 / 25 / 24) — they are genuinely different runs, not
a typo, and the numbers above are as-measured:

| number | what it counts | why it differs |
|---|---|---|
| **26** | scenarios in the harness → PRs produced, per language | structural check: does sync produce a correct PR. Not judge-scored. |
| **25** | pairs the Opus-4.5 run scored (01–21, 23–26) | scenario **22** (deep nesting) dropped mid-run; it passes in isolation (9.2 translation, 10/10 diff), so the artifact is fine and the run was at fault. Transient — the Opus-4.8 run scored all 26. |
| **24** | pairs the Dec-2025 baseline scored (01–24) | only 24 scenarios existed then; 25 and 26 were added 2026-03-24. So 24/24 was complete *for its time*. |

The 24 vs 25 gap is therefore two scenarios that did not exist in December plus one transient
drop — not a coverage regression. Comparing the *rates* (100% pass either way) is sound;
comparing the counts is not, and the counts should not be reconciled by adjusting them.

Caveat on the baseline's denominator: before the fix in #86, a pair that errored vanished
from the report silently, so "24 pairs" in the Dec reports cannot be *confirmed* as 24 of 24
from the artifact alone — the contiguous 01–24 range is what supports it.

## What the evidence does NOT cover

The harness runs small synthetic lectures. It says nothing about the new `stop_reason`
truncation guard — nothing truncates at that size. That guard is the one change that can
turn a currently-silent-but-passing sync into a visible failure on real, long lectures.
Correct behaviour, but expect it to surface as errors rather than silence.

## Cost of getting the number

Three harness defects had to be fixed first, and each had made the tool confidently wrong:

1. **Rubric frozen at the pre-v0.13.0 `heading-map:` format** (last touched 2025-12; format
   changed 2026-03) — marked all 25 PRs down for emitting the *current* format. Diff 10 →
   7.7, 23 spurious warnings. Read as a Sonnet 5 regression; was not.
2. **Documents truncated at 4000 chars before the diff judge** — symmetric in characters,
   asymmetric in content (Chinese is ~35% denser), so English source truncated while the
   whole Chinese target fit. Manufactured "out-of-scope edit" findings on every lecture over
   ~4KB, incl. one FAIL.
3. **Dropped pairs vanished silently** — a pair that threw was logged and skipped; the report
   still read "25 pairs / 25 passed / 0 failed", exit 0. The 2025-12 "24 pairs" therefore
   cannot be confirmed as 24 of 24.

All fixed in #86. The pattern across all three — and across the action bugs #83 fixed — is
one thing: **the failure path produced a success-shaped artifact.** That is the class worth
hunting, not any individual bug.

## Follow-ups

- Issue #82 (deterministic model-swap eval) stays open — this run was harness-mediated and
  judge-mediated; the REVIEW §7.4 design is still the cheaper, more repeatable answer.
- Re-baseline (and bump the harness `ref:`) at each release.

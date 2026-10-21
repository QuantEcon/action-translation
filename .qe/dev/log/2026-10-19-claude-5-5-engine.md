# 2026-10-19 — Claude Sonnet 5.5 and Opus 5.5 in the engine (#342, #334; PR #394)

**Trigger**: @mmcky asked to move to the latest Sonnet and Opus (5.5) and to validate the
upgrade with an evaluation project.

**Why it was not a model-ID swap** — both 5.5 models reject the `thinking: {type: 'disabled'}`
that every call sent. Opus 5.5 always thinks, so a thinking block came first and the translator's
and reviewer's first-block read broke. Refusals were never checked (R12 of the 2026-10-06
review). #342 had planned the fix in nine steps. #334 scoped the Opus refresh (Part A) and the
evaluation (Part B).

**PR #394** — the engine part of #342 and #334:
- **SDK**: `@anthropic-ai/sdk` 0.78.0 → 0.131.0, the newest release at least two weeks old. It
  types `between_tools` and keeps streamed `stop_details`.
- **Per-model request policy** in `models.ts`, as a table:
  - Sonnet 5 and every model that accepts it keep their request byte for byte.
  - Sonnet 5.5 gets `between_tools` at effort `high`.
  - Opus 5.5 and Fable get adaptive thinking at effort `medium`, with room for it under the cap.
  - Haiku 5.5 is recognised and keeps its v0.29.5 request.
  - Unknown IDs get the API's defaults.
- **Responses**: only `end_turn` is usable, text comes from every block, and fallbacks stay off.
- **Part A**: glossary tooling runs on Opus 5.5.
- **Docs and records**: docs plus decisions `D-2026-10-19-per-model-request-policy` and
  `D-2026-10-19-opus-5-5-for-bulk-seed`.
- **The default is unchanged.**

**Verification** — 1,798 tests across 70 suites (+163).
- The new real-SDK suite drives SDK 0.131's request builder and stream accumulator through a
  fake `fetch`. Each mutation check failed it as intended.
- Two critics checked the spec before implementation, then an adversarial review ran (five
  lenses, a skeptic per finding). It confirmed eight small issues, all fixed. The useful one:
  `claude-haiku-5-5` was unrecognised and would have moved from disabled to adaptive thinking,
  with caps sized for output alone.

**Not done** — no live API call was made: the session had no Anthropic key. So #342's live
check (`translate init -m claude-sonnet-5-5` on one lecture) is still open.

**Drift recorded** — three append-only references already pointed at moved code and now shift
further; `check-dev-refs` still passes:
- `D-2026-07-24-tech-debt-audit-boundaries`'s translator reference for `translateSectionResync`;
- the 2026-08-10 issue-review workplan's four translator references;
- `REVIEW-FABLE5-2026-07-15`'s `suggest-glossary` reference for the `t?.fr` fallback.

The references that `D-2026-07-24` and older logs make into `models.ts`, the glossary
`PRICING` table and `translate-sample`'s stop-reason guard were kept on the same text.

**Merge with #376** — both PRs add to CHANGELOG `[Unreleased]`, which gave one conflict in
simulation. Whichever merges second folds them together and re-runs `npm run build`.

**Next**, as planned on 2026-10-19: the evaluation project, a stacked PR (#395) with:
- `init --report-json`;
- a classified `rate-check.sh`;
- `experiments/claude-5-5-upgrade/`, pre-registered.

Then the default flip, once its decision rules pass.

**Changed 2026-10-20, before this PR merged**: the evaluation moved to a standing golden set in
QuantEcon/test-action-translation, scored by `model-eval` (decision
`D-2026-10-20-model-upgrades-measured-against-goldens`). #395 keeps the engine-side pieces
(`init --report-json`, the price table, the classified `rate-check.sh`) and drops
`experiments/claude-5-5-upgrade/`. The flip waits on the first `model-eval` report and cites it.
Handover: `log/2026-10-20-claude-5-5-eval-handover`.

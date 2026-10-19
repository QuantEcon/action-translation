# Each model gets its own request settings, and only a natural stop is a usable response

**Context**: Claude Sonnet 5.5 and Claude Opus 5.5 reject `thinking: {type: 'disabled'}` with a
400, as do both Fable models. Every call sent that setting (`DEFAULT_THINKING`), so none of these
models could run. `claude-fable-5` already passed model validation and still failed every call.
Opus 5.5 and Fable always think. Their responses can begin with thinking blocks, which broke the
translator's and reviewer's reading of the first content block, and the thinking counts toward
`max_tokens`. The new models can also decline a request (`stop_reason: refusal`, HTTP 200). A
refusal can arrive mid-stream with partial text. The translator accepted any stop reason except
`max_tokens`, so a refusal could be committed as a translation (R12 of the 2026-10-06 review).
#342 planned the change, and #334 Part B needs it.

**Decision**: One table in `models.ts` (`requestPolicyFor`) shapes every request.

- **Sonnet 5 and every other recognised model that accepts it**: thinking disabled, no effort,
  the same `max_tokens`. This is byte-identical to the v0.29.5 request, and tests pin it.
- **`claude-sonnet-5-5`**: `between_tools` (its lowest setting, no extended thinking) at effort
  `high`. This keeps D-2026-07-14-thinking-off-sonnet5's choice: thinking stays off wherever the
  model allows it.
- **`claude-opus-5-5`, `claude-fable-5`, `claude-fable-5-1`**: adaptive thinking at effort
  `medium`, with `max_tokens` raised to leave room for the thinking. The full-document admission
  check keeps its 64,000-token output budget for every model.
- **An unrecognised ID**: neither field is sent, so the API's defaults apply.

Only `stop_reason: end_turn` is usable:
- `max_tokens` throws `TruncatedResponseError`. As before, only the CLI's bounded analysis calls
  retry it.
- A refusal throws `ModelRefusalError` with the classifier category and is not retried.
- Any other stop reason throws `UnexpectedStopReasonError`.

Text comes from every text block, never the first block. A reply with no text fails the
translator and reviewer calls, and backward evaluation's fail-closed parser rejects it (retried,
then the file errors). The CLI triage parsers (`forward-triage.ts`, `document-comparator.ts`)
keep their recall-biased fallback from #165/F54: they read an empty reply as CONTENT_CHANGES /
CHANGES_DETECTED, as they do any reply they cannot parse.

Server-side refusal fallbacks stay off. Every provenance field (PR body, sync metadata, state
files, review verdicts) records the requested model. A mid-stream fallback would also join two
models' text into one translation. Revisit this once the evaluation has measured refusal rates; a
fallback would then need the serving model (`response.model`) recorded for each call.

**Consequences**:
- The 5.5 models and Fable can be selected. The default stays `claude-sonnet-5` until the
  evaluation reports.
- `@anthropic-ai/sdk` moves to 0.131.0, the newest release at least two weeks old. It types
  `between_tools` and keeps `stop_details` on streamed responses, which 0.78.0 dropped.
- Refusals that were absorbed now fail the file loudly. Forward triage and backward analysis now
  report a per-file error where they used to carry on.
- A new model that rejects `disabled` needs its table entry in the same change that recognises
  it. models.test.ts pins the pattern list to force that.
- D-2026-07-14-thinking-off-sonnet5 still holds for Sonnet 5. Its note that first-block text
  extraction stays valid does not.

**Refs**: #342, #334, R12 in `log/2026-10-06-codebase-review.md`, D-2026-07-14-thinking-off-sonnet5,
D-2026-07-24-tech-debt-audit-boundaries (the non-streamed cap).

# An unparseable diff evaluation degrades the review instead of failing it

**Context**: Review mode makes two model calls per PR: `evaluateTranslation`, then
`evaluateDiff`. About 2% of the time `evaluateDiff`'s retry budget of three attempts ended on a
reply that was not valid JSON, and the run failed with no verdict posted, discarding the
translation evaluation it had already paid for (#284). In the shadow data such a run looks like
a review that has not run yet. Ruled by @mmcky on 2026-11-15 (the overnight plan for WP5) and
2026-11-25 (WP5's review), shipped on the WP5 branch (`claude/overnight-wp5-reviewer`).

**Decision**:

- **The three attempts stay, and the review degrades rather than retrying differently**
  (2026-11-15). Some parse failures are transient, so the retries keep their value; what
  changes is what happens when the budget ends on one.
- **The degraded review** (2026-11-25):
  - records `scopeCorrect` and `positionCorrect`, the two model-judged diff checks, as `false`;
  - adds a `minor`/`diff-check` finding for each, whose description carries the fixed phrase
    `diff evaluation returned no parseable verdict` (`DIFF_EVALUATION_UNPARSEABLE` in
    `src/review-verdict.ts`), so calibration data can tell "the model gave no answer" from "the
    model judged the check failed";
  - routes to `editor` by a recommendation reason carrying the same phrase. The reason gates on
    its own: the findings are capped at 20, and twenty findings of the model's own can push the
    two `diff-check` findings out of the list;
  - runs and reports the deterministic checks (`structurePreserved`, `headingMapCorrect`) as
    usual;
  - ends the run green, with a workflow warning;
  - changes no verdict schema: no field is added, and the phrase lives in strings the block
    already has.
- **`evaluateTranslation` is not covered** (2026-11-25). If its reply never parses, the run
  still fails and no verdict is posted. So do an API error, a refusal or a truncated reply in
  either call.
- **#283 is allowed during the reviewer-prompt freeze** (2026-11-25). It changes how the engine
  matches a PR's sections before and after when two headings share an id, which changes the
  "Changed Sections" list given to the reviewer on such lectures. That list is engine-computed
  input, not prompt text, and the change edits no prompt string. Lectures whose headings are all
  distinct get exactly the list they got before.

**The 404-only rule now covers the reviewer's source reads.**
`D-2026-11-15-only-a-404-means-absent` took the rule for sync's and rebase's reads. Review mode
read each file's English source with any error taken as "the file is absent", so a rate limit
or a 5xx dropped a file from a multi-file review, which could then pass (#261). It now follows
the same rule: a 404 alone means the source has no such file, and that file routes the PR to
`editor` by name; any other failed read fails the run before any model call, naming the file.
A contents response with no content for a non-empty file (GitHub's answer above 1 MB) is such a
failed read, on the source side and on the translation side. That record is not edited.

**Consequences**:

- Consumers detect a degraded review by the phrase in `recommendationReasons`; a finding with
  the phrase is not evidence about the translation. `docs/user/metadata-contract.md` says so.
- The injected-defect scorer (`tool-review-injection`) scores a degraded review as it scored
  the failed run it replaces (`reviewFailed`): not a catch and not a false positive. It repeats
  the phrase, and a test checks that its copy matches the engine's.
- A model-reported `scopeCorrect: false` gates only through its `diff-check` finding, so the
  same cap can push it out when the model also reports twenty findings. That predates #284 and
  is not changed here.

**Refs**: #284, #283, #261, `D-2026-11-15-only-a-404-means-absent`.

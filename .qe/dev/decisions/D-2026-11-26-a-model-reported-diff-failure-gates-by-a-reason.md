# A model-reported diff-check failure gates by a reason of its own

**Context**: Since #148 a diff check the model judges (`scopeCorrect`, `positionCorrect`) does
not gate as a check: `computeRecommendation` skips it, so its `false` is never recorded as
`diff check failed`, the wording calibration reads as measured fact. It gated only through the
`minor` `diff-check` finding the reviewer adds for it. `findings[]` keeps the worst 20, and a
stable sort puts the translation evaluation's own findings first among equals, so any 20
findings sorted ahead of it (20 `minor` translation findings, or 15 beside 5 diff-quality
issues) cut that finding and the verdict read `auto-merge` beside a published
`scopeCorrect: false` (#477, found by the review of #475 and reproduced at `939ceaf`). No merge
followed, since `auto-merge-mode` accepts only `off` and `shadow`, but it wrote false points into
the shadow-mode calibration data, and would merge wrongly once an active mode exists. Either
fix changes verdicts during the shadow window. Ruled by @mmcky on 2026-11-26: fix it now, by a
reason (the issue's option 1, the pattern #475 used for an unparseable diff evaluation).

**Decision**:

- **A model-asserted check that is not strictly `true` adds the reason
  `model-asserted check failed: <check>`** (`MODEL_ASSERTED_CHECK_FAILED`), so it gates
  whatever survives the findings cap.
- **Its wording stays apart from `diff check failed: <check>`**, which only deterministic checks
  produce, so #148's split between opinion and fact survives in the reasons.
- **Not added when the diff evaluation did not parse** (#284): nothing was judged, and that case
  gates by its own reason.
- **The `diff-check` finding stays**, for readers; the cap itself is unchanged.

**Consequences**:

- Some shadow verdicts move from `auto-merge` to `editor`. A verdict written before the fix that
  reads `auto-merge` with a `model` check at `false` was this false case, and calibration
  should count it as `editor`.
- No prompt or request changes; the reviewer-prompt freeze (#262) is unaffected.
- Other gating `minor` findings appended after the translation findings could still be cut by
  the cap; none other exists today, and a new one should gate by a reason too.

**Refs**: #477, #148, #284, #475, `D-2026-11-25-an-unparseable-diff-evaluation-degrades-the-review`.

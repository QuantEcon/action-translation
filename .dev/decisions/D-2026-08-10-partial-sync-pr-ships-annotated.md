# A partial sync PR ships, loudly annotated — it is not suppressed

**Context**: verification during the 2026-08-10 review corrected the backlog audit: the
four `index.ts` fetch sites are fail-closed (errors join `result.errors`, the run fails,
a failure issue opens), but PR creation still proceeds when the error set is non-empty
(`index.ts:902` at v0.25.0) and nothing on the PR itself says it is partial. W1 (#259)
needed a ruling: annotate the partial PR, or suppress it entirely. The owner took the
decision on 2026-08-10.

**Decision**: Ship annotated. When a run ends with a non-empty error or unexplained-gap
set, the PR still ships, carrying a prominent "Files failed" section that lists each
undelivered file and links the failure issue (#156.2's direction). The "Files Updated"
list renders from the computed delivered set (#256.5), never from the declared metadata.
State files for undelivered files stay unadvanced, so the next run diffs from the
correct base.

The deciding argument: the danger of partial PRs was never partiality — it was silence.
Suppression punishes the good files for one file's failure: on a six-file batch, a
transient fetch error would hold five correct translations hostage, and the recovery
(re-run the entire sync) costs more than reviewing what landed. A partial PR that says
it is partial in its body, links its failure issue, and sits on a failed check run is
loud at every surface a human touches. The 2026-08-10 fr#29 incident was harmful
because the run *reported success* over a drop; the fix is truthful accounting, not
withholding delivery.

**Consequences**:

- W1 implements the annotation alongside the declared-vs-delivered assertion; the two
  share the same computed delivered/failed/explained sets.
- The review-mode input receives the run's error set (#157 gap 2), so a verdict can no
  longer score 10/10 over an undisclosed gap.
- Any auto-merge path must treat a non-empty failed set as a hard block; "annotated"
  never means "mergeable without a human reading the annotation".
- Revisit trigger: an annotated-partial PR gets merged and its failure issue goes
  unactioned. That would be evidence the annotation is not loud enough, and suppression
  is the recorded fallback.

**Refs**: QuantEcon/action-translation#90, QuantEcon/action-translation#156,
QuantEcon/action-translation#256, QuantEcon/action-translation#257,
QuantEcon/action-translation#259

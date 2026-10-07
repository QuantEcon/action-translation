# Sync does not first-translate target-missing lectures — it reports the gap

**Context**: #222 documented `sync` silently escalating a target-missing lecture into a
full first translation (`NEW` mode, `sync-orchestrator.ts:545`/`:650` at v0.25.0),
undisclosed in the PR body and invisible in the run output. The 2026-08-10 work plan
(tracker #257) carried this as decision D2, gating the wording of W1's
declared-vs-delivered assertion (#259) and the scope of W5's TOC insertion (#263). The
owner took the decision on 2026-08-10.

**Decision**: No. Sync's contract is to propagate diffs to lectures that already exist
in the target edition. A target-missing lecture is a gap to report, not work to absorb:
the run applies what it can, records "target missing — seeding required" for that file
in the delivered-set accounting, surfaces it in the PR body, and leaves seeding to
`translate init` (whose gap-fill path is #142, scheduled in W5).

The deciding argument is that first-translation inside sync couples two failure domains.
A full first translation is the highest-variance, highest-cost operation the engine
performs, and it was being triggered implicitly by an *absence* — a missing file became
a silently larger PR instead of a signal, which is exactly the failure shape the plan
exists to close. Growing an edition by a lecture is an editorial decision; a human
should take it, with `init`'s seeding path, not discover it post-hoc in a sync diff.

The alternative considered and not taken: escalation-complete — allow the first
translation provided the run also inserts the `_toc.yml` entry (#142's source-order
algorithm) and discloses the first-translation in the PR body. It is acceptable on its
own terms but adds W5 scope to the sync path and still buries a seeding decision inside
a sync run.

**Consequences**:

- W1's assertion wording: a metadata `files` entry whose target is missing is recorded
  as an explained gap ("target missing — seeding required") and does not fail the run;
  it renders in the PR body so the gap is loud at the surface a human reads.
- #222's defect B (the eight-against-nine signature) becomes pure detection work in W1;
  no escalation path needs building or testing.
- #142's TOC-insertion algorithm is still wanted — for `init` gap-fill in W5 — just not
  on the sync path.
- Revisiting means reopening this file. If an edition later wants auto-seeding, the
  escalation-complete requirements (TOC insertion + PR-body disclosure) are the floor,
  not an option.

**Refs**: QuantEcon/action-translation#222, QuantEcon/action-translation#257,
QuantEcon/action-translation#259, QuantEcon/action-translation#263,
QuantEcon/action-translation#142

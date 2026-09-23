# The `\translate-resync` trust gate admits OWNER, MEMBER, COLLABORATOR — not CONTRIBUTOR

**Context**: #192 (absorbing #138) gates the `issue_comment` resync trigger on
`github.event.comment.author_association`, because an ungated one lets any GitHub account
spend Anthropic credits on a public source repo. #138's thread left one question open and
#192 carried it forward: whether to admit `CONTRIBUTOR` as well, for RA reviewers who may
legitimately want to re-trigger a sync.

**Decision**: The workflow admits `OWNER`, `MEMBER`, `COLLABORATOR` only. `CONTRIBUTOR` is
excluded.

The deciding argument is not the threat model — it is that `src/inputs.ts` has enforced
exactly this three-way set (`TRUSTED_ASSOCIATIONS`) inside the action since the resync
command shipped. A workflow that admitted `CONTRIBUTOR` would start a billed, secrets-bearing
run that the action then no-ops with a warning nobody reads. Two gates on the same decision
have to agree, and the outer one has to be at least as tight as the inner one, or the outer
one is not a gate. Widening is a two-file change and a deliberate one; it is not something to
do by accident in a workflow template.

`CONTRIBUTOR` is also weak on its own terms: GitHub assigns it to anyone with one merged PR
to the repo, which on a public lecture repo is a typo fix. The people this would be for —
RA reviewers who re-trigger syncs — should be repo collaborators, which is a permissions
change in the repo, not a loosened trigger.

**Consequences**:

- An RA who legitimately needs to resync and is not a collaborator gets no run and no
  feedback: the job never starts, so there is nothing to read. The recovery path is to be
  added as a collaborator, or to have someone who is comment the command.
- Revisiting means changing `TRUSTED_ASSOCIATIONS` in `src/inputs.ts` **and** every workflow
  copy. `workflow-templates.test.ts` asserts the two agree, so a one-sided change fails CI
  rather than shipping a silent mismatch.
- The alternative that was considered and not taken: an explicit permission check via the
  API (`GET /repos/{owner}/{repo}/collaborators/{user}/permission`) in a gate step. It is
  finer-grained and would let `CONTRIBUTOR`-with-write through correctly, but it needs a
  token and a step before the guard can run, which means the run has already started — it
  moves the cost, it does not avoid it. The association gate is the standard low-ceremony
  fix and is what the estate already carries.

**Refs**: QuantEcon/action-translation#192, QuantEcon/action-translation#138,
QuantEcon/test-translation-sync#671, QuantEcon/lecture-python.myst#979.
The deployed reference shape is QuantEcon/lecture-python.myst@8abdb57.

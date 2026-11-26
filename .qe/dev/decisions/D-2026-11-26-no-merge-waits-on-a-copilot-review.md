# No merge waits on a Copilot review

**Context**: Since 2026-11-12 the working rule for this repository was that Copilot's review is
read before a PR merges (Matt's standing preference in log `2026-11-12-handover`): the
organiser fixed real bugs Copilot found and replied on each of its threads. On 2026-11-22 Matt
turned off automatic Copilot reviews on QuantEcon's PRs for cost, and gave the remaining
Copilot budget to a review experiment that requests reviews on PRs it chooses, so most PRs here
no longer got one. On 2026-11-26, asked by the PR organiser (the merge coordinator for PRs from
qe-mini1's sessions), he chose to drop the rule for action-translation, and confirmed it in this
repository's organiser session the same day.

**Decision**:

- **Copilot is not requested on this repository's PRs by default**, and no merge waits on a
  Copilot review.
- **When a review is requested**, from Copilot or a person, its inline comments are addressed
  as before: a real bug is fixed, and each thread gets a reply (`AGENTS.md`, *Addressing PR
  Review Comments*).
- Nothing else in how PRs are reviewed changes: the PR organiser still reviews each PR from
  qe-mini1's sessions before it asks Matt for his yes.

**Consequences**:

- `AGENTS.md`'s section on review comments no longer assumes a Copilot review on every PR.
- A PR's ready message says "Copilot: not requested" unless a review was requested.

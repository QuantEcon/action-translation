# A release moves one floating tag, `v0`; no `v0.N` tags are added

**Context**: Each release moved two floating tags to its commit, `vX.Y` (such as `v0.30`) and
`v0` (release checklist step 5). On 2026-11-16 Matt reviewed how QuantEcon organises its GitHub
Actions (relayed by `mini:actions`): the lecture-publishing pipeline lives in QuantEcon/actions,
and self-contained actions such as this one stay in their own repositories, as a family with a
common standard, listed in QuantEcon/actions' README (QuantEcon/actions#332). The family moves
one floating major tag only. A code search of the QuantEcon organisation that day found every
consumer workflow on `@v0` (19 files in 10 repositories) and none on a `v0.N`. Matt confirmed
the change for this repository in its organiser's session the same day, at v0.31.0.

**Decision**:

- **A release moves `v0` only**, after the gate (4a) and the rate check (4b), and then runs the
  `@v0` smoke.
- **No `v0.N` tag is created.** v0.31.0 has none. The `v0.N` tags made up to v0.30.2 stay where
  they are: nothing removes them, and anyone who pinned one keeps working.
- **A major version moves `v1`**, when there is one, the same way.

**Consequences**:

- The release checklist's step 5 moves `v0` alone, and steps 4a and 4b speak of the floating
  tag in the singular.
- The harness's `--action-ref v0` smoke stays the check that the tag resolves (#109, #202).
- The rest of the family standard (SECURITY.md, Dependabot, CODEOWNERS, topics, a `uses: ./`
  CI job, `deploy-docs.yml` on Node 24) is not settled here; it is to be planned with Matt.

**Refs**: QuantEcon/actions#332, #109, #202.

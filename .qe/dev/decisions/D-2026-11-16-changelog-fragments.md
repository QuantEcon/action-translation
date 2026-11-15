# Changelog entries go in per-PR fragments, collected at release; a prototype

**Context**: Every PR added its entry at the top of `CHANGELOG.md`'s `[Unreleased]` section,
so each merge conflicted every other open PR there. The ten PRs merged between 2026-11-15 and
2026-11-16 (#439–#448) took 15 rebases between them, each with a fresh CI run and a patch-id
check, and a resolver script to keep both sides. One crash of that script committed conflict
markers locally (log `2026-11-16-overnight-stack`). The merging session put three options to
Matt on QuantEcon/infrastructure#123: fragments; building `dist-action/` only at release; and
git's `merge=union` for `CHANGELOG.md`. Union was set aside, since it keeps both copies of an
entry that a later commit revises, as #447's did, with no marker to catch it. Matt agreed to
fragments on 2026-11-16. A Fable design review then cut the proposal down, and Matt chose that
leaner version as a prototype: "we can see if this pattern works well and then file a project
to build the workflows and associated infrastructure needed".

**Decision**:

- **One fragment per PR**, `changelog.d/<branch without its prefix>.md`. It holds one or more
  `### <Section>` lines (Keep a Changelog's six, plus `Documentation`), each followed by its
  entries exactly as they will appear in `CHANGELOG.md`. The name comes from the branch
  because an agent writes the file before the PR, and its number, exist, and a branch is
  unique to its PR. Matt's variant, one file per PR named by its number
  (`CHANGELOG-{pr-#}`), would need a rename once the PR is open.
- **`[Unreleased]` stays empty between releases.** `changelog.mjs --check`
  (`npm run changelog:check`, a step in `ci.yml`) validates every fragment and fails when
  anything sits under `[Unreleased]`. That catches a direct edit without having to tell a
  release PR from another.
- **The release PR collects them.** `changelog.mjs --release X.Y.Z` writes the fragments under
  `## [X.Y.Z] - <date>`, below a fresh empty `## [Unreleased]`. Sections come in canonical
  order, and within one the fragments come by file name, issue numbers first. It deletes the
  fragments and prints the sections, the draft for the release notes. The order is a pure
  function of the folder, so a run is reproducible; the release PR reorders by hand when it
  matters. The date defaults to the local date, since every release carries the Sydney date.
  Nothing is written unless every check passes.
- **The entries already under `[Unreleased]` moved into fragments unchanged**, one per PR, in
  the PR that introduced the script. A trial release reproduced all eleven entries byte for
  byte, each in its section, in file-name order rather than the file's merge order.

**Not built, by Matt's choice of the prototype**: a workflow that fails a PR without a
fragment, and the `no-changelog` label it would need. They wait until a fragment has been
forgotten in practice; `.qe/dev/README.md`'s rule is to script a check on evidence. If built,
the design review's shape is a `pull_request` workflow with no `paths:` filter. It would list
the PR's added and changed files through the API, need a fragment when they include `src/`
(tests aside), `action.yml`, `glossary/` or `examples/`, and be waived by the label. An
organisation label sync with `prune: true` would delete a label its manifest lacks.

**Consequences**:

- A forgotten fragment is a follow-up PR of one file, which conflicts with nothing.
- A PR opened before this landed, and merged after it, fails `changelog:check` until its entry
  moves into a fragment.
- Release checklist step 1 is the script, and step 6's notes start from its output.
- The pattern could suit QuantEcon's other repositories whose PRs land in batches; whether it
  does is the prototype's question. #promote

**Refs**: QuantEcon/infrastructure#123, log `2026-11-16-overnight-stack`, #447, #304
(the empty `[Unreleased]` header), `changelog.d/README.md`.

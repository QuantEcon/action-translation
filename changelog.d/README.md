# Changelog fragments

Each pull request with a user-visible change adds its changelog entry here, as a file of its
own, instead of editing `CHANGELOG.md`. The release PR collects the fragments into
`CHANGELOG.md` and deletes them. No two PRs edit the same lines, so merging one no longer
conflicts the others (`.qe/dev/decisions/D-2026-11-16-changelog-fragments.md`).

## Name

Use the PR's branch name without its type prefix: `fix/134-init-repo-scope` becomes
`134-init-repo-scope.md`, and `chore/dev-deps-audit` becomes `dev-deps-audit.md`. Lower case,
digits, `.`, `_` and `-`. A branch is unique to its PR, so two fragments cannot collide.

## Format

One or more section lines, `### <Section>`, each followed by its entries exactly as they will
appear in `CHANGELOG.md`. The sections are `Added`, `Changed`, `Deprecated`, `Removed`,
`Fixed`, `Security` and `Documentation`. Every unindented line under a section starts an entry
with `- `. Nested bullets, indented continuation paragraphs and blank lines are kept as they
are, and line endings become LF. For example:

```markdown
### Fixed

- **A lecture moved out of `docs-folder` is deleted from the edition, with its state file** (#398). GitHub lists such a move as a rename under the new path. …
```

A PR that revises its entry edits its own fragment.

## Commands

- `npm run changelog:check` validates every fragment, and checks that `CHANGELOG.md`'s
  `## [Unreleased]` is empty. CI runs it on every PR.
- `npm run changelog -- --release X.Y.Z [--date YYYY-MM-DD]`, in the release PR, writes the
  fragments under `## [X.Y.Z] - <date>`, below a fresh empty `## [Unreleased]`. The sections
  come in the order above, and within a section the fragments come by file name, issue
  numbers first. It then deletes the fragments and prints the release's sections, the draft
  for the release notes. The date defaults to today's local date. Reorder entries by hand in
  the release PR if the order matters. `git checkout -- CHANGELOG.md changelog.d` undoes a run.

A PR with nothing user-visible (tests, refactors, `.qe/` notes) needs no fragment.

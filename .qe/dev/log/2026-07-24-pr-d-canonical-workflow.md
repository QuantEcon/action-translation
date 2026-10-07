# 2026-07-24 — #161 (PR D): one canonical review-workflow template

The fleet-template PR. Six copies of the review workflow, five unfireable (no `labeled`
trigger — the label lands after `opened`, so the gate never passes; the v0.21.0
six-PRs-merged-unreviewed shape). Fix is structural, not a six-way patch:
`examples/review-translations.yml` is canonical, `translate setup` renders it at runtime
(examples dir threaded from the entry point like the glossary dir — same Jest-CJS reason),
docs quote its shape, and `workflow-templates.test.ts` (branch-naming mold) fails when any
copy loses a structural line. Scaffolder also: `@v0` replaces the stale `v0.9.0` literals
(F27; and F137's release-checklist gap closes because there is nothing left to bump),
writes `rebase-translations.yml` verbatim from its canonical file, source workflow gains
`issue_comment` resync + composite guard (F91), `checkout@v7` (F135), and the
paths-filter normalizer gets its missing `g` flag (`./lectures/` emitted
`lectures//**/*.md`). `doctor` now warns on review workflows without `labeled` (F7's
second half).

F127 landed as its docs half only — option (b), removing the dead review `target-language`
knob everywhere and documenting the suffix convention — because option (a) (honouring the
input) touches `inputs.ts`/`index.ts` and this PR is declared no-dist-action-rebuild.
If review mode ever honours the input, the docs come back with it; that is a deliberate
non-decision recorded here.

Substitution contract worth knowing: `generateTargetWorkflowYaml` is the identity when
rendered with the template's own example values (tested), so the canonical file doubles as
a golden output; a template edit that breaks a substitution key throws at scaffold time
and fails the unit test.

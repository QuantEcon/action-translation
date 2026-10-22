# Lecture-at-a-time editions are tooled in the CLI first; a skill takes only the judgement steps

**Context**: An edition built one reviewed lecture at a time (#344; the first is
QuantEcon/lecture-python-programming.ml) repeats one round per lecture: draft it with
`init -f`, keep only what the PR needs, confirm its state file, open the PR for the editor's
review, carry any English change that merges before the PR does, record it, and merge. In #376
these are manual steps in the tutorials, and the commands they use have open defects: `init -f`
takes the first ToC entry that contains the name (#384), copies over the edition's own files
(#134) and does not fail when it cannot write the state file (#378); `init --skip-existing`
re-translates a lecture whose state file it cannot validate (#379); `status --write-state`
rewrites `.translate/config.yml` from its flags (#175) and recorded English changes nobody had
carried (#380). The question was where the round's tooling belongs: one pipeline command, a
Claude skill, or the CLI. The recommendation put to @mmcky was the CLI first, a thin skill later
and no single pipeline command. Ruled 2026-10-19 (@mmcky): "Agree, lean towards cli where
possible."

**Decision**: The deterministic steps belong in the CLI:

- an add-one-lecture mode of `init -f`, #142's gap-fill path, with exact name matching (#384),
  no clobbering of the edition's files (#134), a state write that fails loudly (#378),
  `--skip-existing` deciding on whether the state file exists (#379), and an optional
  `--github` that opens the round's PR through `forward`'s PR creator;
- in `status --write-state`, config precedence (#175) and the carried-change confirmation,
  `--carried` (#380, folded into #376);
- a `setup` option for lecture-at-a-time editions (#371);
- `doctor --require-state` (#370);
- inserting the lecture's ToC entry, once #259's ToC rule lands.

A thin local Claude skill, like `.claude/skills/glossary-review`, takes only the judgement
steps: choosing among draws, language repairs and lints, the PR's disclosures, applying the
editor's suggestions, and deciding how to carry an English change. It calls the CLI for every
step that touches state, and it is built after the CLI is hardened. There is no single pipeline
command.

Phases: 0, the ml rollout (backfill each lecture's state file with the English commit its draft
was made from, and carry the two English fixes `python_by_example` missed, #344); 1, the CLI
bug fixes; 2, the add-one-lecture mode, `setup` and `doctor`; 3, the skill. #promote

**Consequences**:

- The skill never writes a state file, which is what puts a lecture in sync's scope
  (D-2026-10-19-sync-scope-existing-reads-state-files): the CLI does, and its write fails
  loudly once #378 lands.
- The tutorials keep their manual round ("One reviewed lecture at a time" in Fresh Setup) until
  phase 2 gives its steps commands.
- `doctor --require-state`, extended as that record's ruling on retirement condition 3 says, is
  the check that condition needs. The condition is met only once every syncing edition runs it
  as a required CI check.

**Refs**: #142, #134, #370, #371, #378, #379, #380, #384, #175, #259, #344, #376.

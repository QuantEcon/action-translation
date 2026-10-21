# Model upgrades are measured against a standing golden set, not a one-off experiment

**Context**: Claude Sonnet 5.5 and Opus 5.5 arrived while the engine ran `claude-sonnet-5`.
#394 lets the engine call them, and the default stays where it is until evidence moves it. The
first evaluation design, `experiments/claude-5-5-upgrade/` in #395, was a one-off: five stages
and two LLM judges, about $268, or $389 with Malayalam. Its critiques found real flaws:
- a point-estimate arbitration that let a model a full margin worse pass;
- a paragraph alignment that dropped deleted content, which raised the scores of drafts that
  omitted text;
- no edition action when data was missing.

Each later model would also have needed an experiment of its own. Ruled 2026-10-20 (@mmcky):
- **The evaluation is focused and reusable.** Every model upgrade is measured against one golden
  set, kept in its own repository and grown language by language, so the results show how each
  model has done in each language over time.
- **Retranslation is the evidence for an edition.** Where an edition has gold lectures, the
  evidence is retranslating them and comparing, not waiting for its editor's next round.

**Decision**: The goldens and the evaluation live in QuantEcon/test-action-translation. A golden
is a real lecture paired with a translation people approved, pinned by commit, sha256 and size.
The first set is 18 lectures in ml, fr, zh-cn and fa.

One command, `model-eval`, runs the evaluation (specified in that repository's `DESIGN.md`):
- it translates each golden a few times with the current default and with the candidate,
  through the engine's own `translate init --report-json`;
- it scores the drafts with deterministic metrics only (#227);
- it applies per-language non-inferiority rules;
- it writes a report and appends a per-language history.

A standard run costs about $36.

Each language gets its own verdict:
- **PASS:** the edition follows the new default.
- **FAIL or INCONCLUSIVE:** the edition keeps the old model in its workflows until its editor
  has reviewed drafts from the new one. Missing data never passes.

The procedure is a project skill plus a checklist in this repository (`/model-upgrade` and
`docs/developer/model-upgrades.md`), so every model upgrade follows the same steps.

**Consequences**:
- **#395 keeps the engine-side pieces and drops the experiment.** It keeps `--report-json`,
  the pricing table, and rate-check's `--source-dir`, `--localize`, `--model` and
  `--run-dir`/`--resume`. It drops `experiments/claude-5-5-upgrade/`.
- **The default flip cites a test-action-translation report.** It pins the edition of any
  language that did not pass before `v0` moves.
- **The billed runs belong to a maintainer with an API key.** CI runs only the offline tests.

**Refs**: #82 (no test set for model upgrades), #204 (model-bump regression testing), #342, #334,
#227, #394, #395; log `2026-10-20-claude-5-5-eval-handover`.

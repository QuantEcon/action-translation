# Bulk seeds and glossary seeding move to Claude Opus 5.5

**Context**: D-2026-07-14-opus-for-bulk-seed chose the Opus tier for one-time bulk seeds. Across
five French lectures, Opus 4.8 drifted on no term where Sonnet 5 drifted on five, at 1.66× the
cost. Claude Opus 5.5 succeeds that line at a lower price ($4 / $20 per M tokens, against $5 / $25
for Opus 4.8). It always thinks, though, so it could not run until the engine stopped sending
disabled thinking (D-2026-10-19-per-model-request-policy). Until then the glossary tooling kept
seeding and extracting terms with Opus 4.8.

**Decision**: The bulk-seed model is the current Opus, `claude-opus-5-5` (`translate init --model
claude-opus-5-5`), and `scripts/glossary` seeds and extracts with it. The choice of tier rests on
the 2026-07-14 evidence; moving within the tier to its successor is a refresh, not a new
measurement. The glossary probe follows the production sync default rather than naming a model.

**Consequences**:
- Seeds cost less per token but carry Opus 5.5's thinking, which is billed as output (adaptive at
  effort `medium`).
- Before the next bulk seed, the Opus arm of the 5.5 evaluation reports its parity, refusal and
  keep-English rates per language. Malayalam matters most: Opus 5 translated more of
  `getting_started` into Malayalam than Sonnet 5 did (#334).
- This supersedes D-2026-07-14-opus-for-bulk-seed.

**Refs**: #334 Part A, D-2026-07-14-opus-for-bulk-seed, D-2026-10-19-per-model-request-policy.

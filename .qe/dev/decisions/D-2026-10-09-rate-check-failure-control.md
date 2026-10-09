# A failed 4b rate check is settled by a same-day control, not by holding the tags

**Context**: Release step 4b (`rate-check.sh`, adopted 2026-09-23 for #320) fails a release
when any fixture × language cell shows more than one refusal in twelve draws. Its first
failure came at v0.29.4 (2026-10-09): zh-cn `game-theory.md` refused 2/12, each time with
#203's signature. The zh-cn request was byte-identical at v0.29.3, and same-day controls
read 0/36 at v0.29.3 and 3/36 at v0.29.4 (Fisher p ≈ 0.24), about 4% pooled. The checklist
said only that the cell fails, and the script said "do not release on the gate alone". Ruled
2026-10-09 (@mmcky): release.

**Decision**: When a 4b cell fails, draw a same-day control for it, 24 draws at the previous
release and 24 at this tag, and check whether that language's request inputs changed
between the two. A clearly higher rate at this tag (Fisher's exact test, p < 0.05) is a
failed gate: the floating tags stay, and the repair ships as the next patch. Otherwise the
rate predates the release and holding the tags protects no one from it. The release goes
ahead, with both tables on the release PR and the measurement on the defect's issue.

The threshold (at most one refusal in twelve) stays. At #320's ~40% it misses about 2% of
the time; at a latent ~4% it fails about 8% of releases by chance, and the control is the
answer to that, not a looser threshold.

**Consequences**: AGENTS.md step 4b gains the procedure, and `rate-check.sh`'s failure line
points to it. The latent zh-cn rate stays with #203.

**Refs**: #320 and #323 (step 4b), #354 (the v0.29.4 tally), #203.

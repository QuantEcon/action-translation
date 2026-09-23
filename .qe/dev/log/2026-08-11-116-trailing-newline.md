# #116 — trailing newline on forward writes

2026-08-11. W0 "S fixes" item from the [2026-08-10 work plan](2026-08-10-issue-review-workplan.md).

## What was wrong

`translator.ts` trims every model response, and nothing on the forward path put a
terminator back, so each resynced file was written with its last line unterminated —
`\ No newline at end of file` in all 69 Track B PR diffs on `lecture-python.zh-cn`.

## Where the fix went

`ensureTrailingNewline` (`src/cli/commands/forward.ts:91`), applied at the end of
`finalizeResyncContent` (`:264`) rather than at the two write sites
(`:499` `gitPrepareAndPush`, `:556` the local write). Finalize already returns the exact
bytes that get written — the structural-parity guard runs on its output and the comment
at `:399` says so — so one call there covers both routes and the invariant does not
depend on a future writer remembering. `--test` mode terminates its mock the same way
(`:350`) so the smoke path exercises the same bytes. When #172's
`finalizeTranslatedDocument` lands, this moves with finalize rather than being re-derived.

Narrow on purpose: already-terminated content is byte-identical, trailing blank lines are
preserved (not collapsed to one), and `''` stays `''` so an empty output remains falsy and
still skips the write instead of becoming a one-byte file.

## What this did not fix

**`translate init` has the same defect** and is out of #116's scope. `init.ts:302` writes
`injectHeadingMap(applyTypography(<trimmed model output>), …)`; verified against the built
`dist/` that neither step adds a terminator, so every seeded edition file is written
unterminated too. Worth a sibling issue — the fix is the same one-liner, and it is the
second of the three writers the audit's choke-point finding (#172) names.

The action's sync path was never affected: `file-processor.ts:656` has always ended
`reconstructDocument` with `.trim() + '\n'`. Forward state files are fine too —
`serializeFileState` is `yaml.dump`, which terminates.

## Verification

New tests fail on the pre-fix source and pass after (checked by reverting
`commands/forward.ts` and re-running): local-write and `--github`-commit bytes end with a
newline (`forward.test.ts`), finalize terminates trimmed model output without doubling an
existing one, and the helper's four cases (`forward-finalize.test.ts`). Full suite
1508/1508, lint clean. `dist-action/` is unchanged — the bundle's entry is the action
(`src/index.ts`), which does not include the CLI.

# init trailing newline — the #116 sibling

2026-08-11, follow-up to [the #116 fix](2026-08-11-116-trailing-newline.md), which found
and recorded this defect as out of scope: `translate init` writes
`injectHeadingMap(applyTypography(<trimmed model output>))` and neither step terminates,
so every seeded edition file was written without a trailing newline — verified against the
built `dist/` before filing, not inferred.

## The fix

`ensureTrailingNewline` imported from `commands/forward.ts` and applied where
`finalContent` is computed (`src/cli/commands/init.ts:289`), **before** the structural-parity
guard — so the guard checks the exact bytes that get written, the same ordering forward's
finalize path uses. Cross-command import follows existing precedent (forward imports
`runStatus` from `./status.js`); checked transitively that nothing forward.ts imports
reaches back into init.ts, so no cycle. Deliberately not moved to a neutral module now:
#172's `finalizeTranslatedDocument` is the planned single home for write-path
finalization, and both callers collapse into it when that lands.

## Verification

Regression test in `init-parity.test.ts` drives the real `translateLecture` write path
with a fake translator returning `trimEnd()`-ed content (mimicking the real translator's
trim) and asserts the written bytes end with exactly one newline. Fails on the pre-fix
source, passes after. Full suite + lint + format green. `dist-action/` unchanged — the
bundle entry is the action, which does not include the CLI.

## Write-path ledger

With this, all three CLI/action writers of model output terminate their files:
sync (`file-processor.ts` `reconstructDocument`, always did), forward
(`finalizeResyncContent`, #116/PR #266), init (this change). The ledger is worth keeping
because the audit's choke-point finding (#172) counts "one bug per path per invariant" —
trailing newline is now settled on all paths and should stay settled by construction once
finalization is consolidated.

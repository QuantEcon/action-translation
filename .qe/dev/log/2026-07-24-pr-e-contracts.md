# 2026-07-24 — #162 (PR E): contract constants get an owner

`src/contracts.ts` now owns the cross-boundary strings (trigger label, sync/resync label
sets, failure-issue label, auto-merge modes; `DEFAULT_CLAUDE_MODEL` re-exported, owner
stays `models.ts`). Ten literals across `inputs.ts`, `reviewer.ts`,
`forward-pr-creator.ts`, `index.ts`, `doctor.ts` replaced with imports. Structural tests
in `contracts.test.ts` (branch-naming mold): confinement scan over
`src`/`src/cli`/`src/cli/commands` + parity against `action.yml` defaults, the canonical
review template's gate clauses, and metadata-contract.md's Labels section (which now names
`translation-sync-failure` — the spec had omitted its own label).

Bootstrap closes the F141 hole: `forward --github` hard-requires three labels nothing
created; `setup` now runs idempotent `gh label create --force` for the target-repo set
plus the failure-issue label in the source repo, `doctor --check-gh` gains a Labels check
(resolves the repo slug via `gh repo view` in the target path), and `checkWorkflow` warns
on pinned `@vX.Y` action versions. `getInputs` warns when custom `pr-labels` drops the
trigger label.

Two boundary decisions honoured: pr-creator.ts's non-fatal label failure stays (settled in
the audit-boundaries record — bootstrap is the fix, F42's "raise instead" rec refused),
and F32's suggested strip-labels-and-retry rework of `createForwardPR` was NOT taken —
the issue's plan line scopes F32 to bootstrap + doctor, and with labels bootstrapped at
setup the missing-label failure mode the retry would paper over should no longer occur.

Confinement nuance for the future: `review-verdict.ts` and `translate-state.ts` compare
`pkg.name === 'action-translation'` — the npm package name, same bytes, different concept.
They are allowlisted by filename in the confinement test; a label literal added to those
two files would not be caught.

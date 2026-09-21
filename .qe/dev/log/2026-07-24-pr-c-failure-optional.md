# 2026-07-24 — #160 (PR C): failure is no longer optional

The red-by-design PR, shipped at the start of a working block per the wave plan. Five
findings: rebase `setFailed` + typed `rebased`/`skipped` result + **throw-before-reset**
(the force-reset previously ran before the error check, so partial failure dropped the
errored files' translations from the PR and then commented "content is preserved"); bulk
`backward`/`forward` exit 1 on any errored file (forward's count includes failed pushes and
PR creations — F66); `backward --resume` retries errored files (reversing the documented
choice, per the boundaries record: no `--skip-errored` flag); stack traces at both terminal
handlers; failure-issue close-on-recovery (title-matched, not label-matched; creation-side
dedup stays refused per D-2026-07-16).

Sourcemap engagement measured before shipping, both directions: `node dist-action/run.cjs`
with a forced input error decodes frames to `src/inputs.ts:25` / `src/index.ts:45`;
`node dist-action/index.js` (the old entry) shows `index.js:21610`. The shim is the only
working placement (boundaries record: no `env:` key in a node24 `runs:` block, esbuild
banner too late) — `action.yml`'s `main:` now points at `run.cjs`.

The `backward` aggregate report gains optional `filesErrored`/`erroredFiles` (schema
addition, old reports parse). New tests: resume-retries-errored integration + errored-files
aggregate unit. `src/index.ts` changes (rebase, close-on-recovery, stack logging) remain
untestable under the Jest CJS registry (`import.meta` at `:36`) — the known 0%-coverage
liability, in scope for the later Wave 1 PRs that split `index.ts`.

Note for the first rebase wave after this lands: PRs that used to show "rebased" counts
including skips will report fewer rebases and may fail the workflow — that is existing
damage becoming visible, not a regression.

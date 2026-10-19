# 2026-10-19 — handover: the v0.29.5 release gate, for @mmcky's local machine

**Trigger**: v0.29.5 is tagged (`e7356cc`, release PR #373) but not gated. The two gate steps are
local scripts the session could not run: the harness needs the `gh` token's `workflow` scope, and
the rate check needs `ANTHROPIC_API_KEY`. @mmcky runs them locally and logs the results back; the
session then moves the floating tags, smokes `@v0`, publishes the release and posts the tallies.

**State, read live on 2026-10-19 before 06:04 UTC**:

- `main` is at `e7356cc` (`chore: release v0.29.5`, #373). `package.json` says 0.29.5.
- Tag `v0.29.5` → `e7356cc`, lightweight like every earlier release tag. `v0.29` and `v0` are still
  at `fcee846` (v0.29.4): nothing live has changed.
- Payload since v0.29.4 that changes the engine: #372 (ml glossary v0.8.0) and #360 (dependency
  advisories). Nothing in the request changes for zh-cn or fa, so the 4b zh-cn rate is expected to
  read as at v0.29.4 (2/12 on `game-theory.md`, judged pre-existing on #354).
- The harness repos (`test-translation-sync`, `.zh-cn`, `.fa`, `.ml`) sit where the v0.29.4 smoke
  left them. A `--dry-run` at `v0.29.5` lists the expected 28 scenarios.

## How to run this (@mmcky, locally)

From a checkout of `main` at `e7356cc` with `npm ci` done after checking it out. The rate check
symlinks this checkout's `node_modules` into its worktrees, so a stale install measures the old
dependencies:

1. **Token scope, once.** The harness refuses to run without it (it rewrites the nine workflow
   files in the four harness repos):

   ```bash
   gh auth refresh -h github.com -s workflow
   ```

2. **§4a — the gate at the tag.** Real, billed model calls (~84 sync runs plus their review runs
   across three lanes); 5+ minutes to create the PRs, then the workflows run on GitHub:

   ```bash
   SCRATCH=$(mktemp -d)
   ./tool-test-action-on-github/test-action-on-github.sh --action-ref v0.29.5 2>&1 | tee "$SCRATCH/gate-v0.29.5.log"
   ```

   Keep the log. What to read back from it: the **census** (every workflow pinned `@v0.29.5`,
   9/9), and that all 28 PRs were created. The verdicts come later, from the harness repos: once
   the runs finish, each target repo should hold 28 translation PRs whose verdict block says
   `engineVersion: 0.29.5`, and scenario 17 should be delivered on all three lanes (the file
   `game-theory.md` present in the translation PR). Two runs per lane reading as skipped is normal:
   the reset's PR-close fires events the workflows skip.

3. **§4b — the rate check at the tag.** Local, 36 CLI translations against a cached prompt:

   ```bash
   export ANTHROPIC_API_KEY=…
   ./tool-test-action-on-github/rate-check.sh --ref v0.29.5
   ```

   It prints a table and a verdict and writes `summary.txt` and `meta.txt` under
   `${TMPDIR:-/tmp}/action-translation-rate-check/<timestamp>-<pid>/`. **If a cell fails**, follow
   AGENTS.md step 4b before holding anything: same-day controls, 24 draws each, at `v0.29.4` and
   `v0.29.5` for that language (`--languages <lang> --draws 24`), then compare.

4. **Log the results back** as a comment on #373, or paste them to the session: the census line,
   the PR count, the per-lane delivery and `engineVersion` tallies when the runs are done, and the
   4b table with its verdict (and the control tables if any cell failed).

## What the session does next, on those results

- Gate and rate check clean (or 4b over threshold but indistinguishable from v0.29.4 under the
  control): move `v0.29` and `v0` to `e7356cc`, smoke `@v0` on scenario 01, publish the GitHub
  release (title `v0.29.5`; the notes' first line is the headline), post the tallies on #373,
  then the close-out log and STATE.
- Gate short, or 4b clearly higher than v0.29.4: the floating tags stay at v0.29.4, the tally goes
  on #373, and the repair ships as the next patch — as v0.29.1 did.
- Then the Malayalam side: the decision-19 gate on `pandas` at v0.29.5 (QuantEcon/project-translation,
  `plans/ml-programming-edition.md`), before round 6 is drafted.

**Release notes, ready for step 6** (first line is the headline):

> Malayalam glossary v0.8.0 from the fifth review round, and two production dependency advisories cleared.
>
> **Changed** — `ml` glossary v0.7.0 → v0.8.0 (87 → 93 terms) from the fifth native review round (`pandas`, QuantEcon/lecture-python-programming.ml#26): English pins for *efficient*, *convenient*, *satisfy*, *compare* and *success*, everyday words the editor returned to English at every site and whose Malayalam forms appear nowhere on his five reviewed pages; *store* in the light-verb form; *work* unpinned, since he writes both forms (#372).
>
> **Security** — `js-yaml` 4.3.2 and `undici` 6.29.0, within the existing ranges, clearing the two high-severity production advisories; both are bundled, so the fix reaches `@v0` workflows with this release (#360).
>
> **Added, experiment tooling only** — `ml_repair.py` widens the comma-splice repair to any finite-verb comma followed by a continuing clause, restores sentence-initial discourse formulas gated on the English source, and commas multi-word `-ഉം` pairs; `ml_metrics.py` gains an over-translation lint; 31 fixture tests (#372). Full details in `CHANGELOG.md` under `[0.29.5]`.

## Results (2026-10-19, run from @mmcky's machine)

The handover was executed by a local session on @mmcky's machine, which has the `workflow` scope
and an API key; @mmcky approved the release on the results below.

**§4a passed.** Census 9/9 at `@v0.29.5`; 28 source PRs (test-translation-sync#1006–1033); 84/84
sync runs succeeded, two skipped per lane as expected. Each lane holds 28 translation PRs, and all
84 carry a verdict block at `engineVersion: 0.29.5`, `engineRef: v0.29.5`. Scenario 17 delivered
`game-theory.md` on all three lanes (zh-cn#1038, fa#423, ml#332). Verdicts: 83 PASS, 1 WARN. The
WARN is zh-cn scenario 22 (zh-cn#1043): the headings of two whole `##` sections stay in English
while their body is translated. It is not new: the v0.29.4 gate's zh-cn#1013 read the same 23/33,
unremarked, because the read-back counts verdict coverage, not verdict values. Filed as #375.

**§4b over threshold on fa and ml, pre-existing.** `game-theory.md` refused 0/12 on zh-cn, 2/12 on
fa and 2/12 on ml, every refusal with #203's signature (directives 3 → 2, `{code-cell}` and `{math}`
transposed). The fa request is byte-identical to v0.29.4's: no `src/` change except one test, and
no change to `glossary/fa.json` or the language configs. The ml request differs only by
`glossary/ml.json` (#372). Same-day controls, 24 draws per arm, run side by side: fa 0/24 at
v0.29.4 against 1/24 at v0.29.5, ml 1/24 against 2/24. Pooled with v0.29.4's 0/12 of 2026-10-09
and today's 4b: fa 0/36 against 3/36 (Fisher two-sided p ≈ 0.24), ml 1/36 against 4/36
(p ≈ 0.36). The two cannot be told apart, so step 4b releases. The cell that trips moves between
languages from release to release (zh-cn at v0.29.4, fa and ml now), as a latent rate of a few
percent does at 12 draws. #363 (v0.30.0) is the repair.

**Traps, for the next run.** Step 2's `tee` needed `SCRATCH` set first (fixed above). The clone
used here still held v0.29.4's install (`js-yaml` 4.3.0, `undici` 6.27.0) because `npm ci` was not
re-run after fast-forwarding, so 4b measured v0.29.5's `src/` and glossary without #360's bumps.
Those reach the action through `dist-action/`, which §4a ran, and do not reach the model request.
As at v0.29.4, a refused draw reports `Tokens: 0` and `Time: 0.0`; it is still the parity guard,
not an API failure. Read the `## Failures` section of the draw's `TRANSLATION-REPORT.md`.

**Tags and release**: pending. The session's tag push was refused by its permission classifier,
so @mmcky runs checklist 5 (move `v0.29` and `v0`, smoke `@v0` on scenario 01) and 6 (the release,
with the notes above) by hand; the tally then goes on #373 and the measurement on #203.

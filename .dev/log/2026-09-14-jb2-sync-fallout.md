# 2026-09-14 — a merge into `jb2` fired every sync workflow; v0.28.1

**Trigger**: QuantEcon/lecture-python-programming#629 (theme v3.0.0 migration) merged into the long-lived `jb2` branch on 2026-09-12 05:08 UTC. All three sync workflows ran (fa/fr/zh-cn, `pull_request` event, success) and opened lecture-python-programming.fr#79, .fa#166, .zh-cn#105 — translation PRs for content the English edition does not publish.

**Cause**: the published sync workflow triggers on `pull_request: types: [closed]` with no `branches:` filter, so it fires for a PR closed against any base; the job `if:` checks only `merged == true`; the action never read `base.ref`. Every deployed copy had the shape because every doc page copied it from an older one (#192's lesson, again).

**Done** (#308, merged `aae38d1`)
- `branches: [main]` in every published sync trigger: README, `examples/` ×2, quickstart, action-reference ×2, three tutorials, the scaffolder in `setup.ts`, the E2E harness template. `workflow-templates.test.ts` now requires `on.pull_request.branches == ['main']` on every sync job it sweeps.
- `mergedIntoDefaultBranch` (`src/inputs.ts`): base ref vs `repository.default_branch`; used in `validatePREvent` (pull_request path) and in `runSync` after `pulls.get` (resync path — an `issue_comment` trigger cannot carry a branch filter). Unknown default branch or base ref warns and proceeds. Copilot's three comments adopted (`d0b0a6c`): default-branch wording in README/quickstart; `validatePREvent` returns as soon as a closed PR is found unmerged, so the PRODUCTION log no longer follows "Skipping sync".
- Release v0.28.1 (this log's day): CHANGELOG promoted, version bumped, STATE updated.

**Tidy-up outside the repo**: fr#79 / fa#166 / zh-cn#105 closed unmerged with a note; `branches: [main]` PRs opened in lecture-python-programming (3 workflows), lecture-python-intro, lecture-python.myst. The harness source repo (test-translation-sync) re-renders from the template on the next run and needs no PR.

**Gate**: §4a on `v0.28.1` per the checklist; tally recorded on the release PR. Note for the tally: the harness fires the `labeled` trigger on open fixture PRs against `main`, so the new filter is exercised on every run — a lane that fails to start is the filter misbehaving, not the fixture.

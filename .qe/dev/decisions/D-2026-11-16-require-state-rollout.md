# `doctor --require-state` is rolled out as a required check in the editions that sync

**Context**: `sync-scope` retires once three conditions land
(`D-2026-10-19-sync-scope-existing-reads-state-files`). Condition 3 is a state check that runs
as a required CI check, on every PR and on pushes to `main`, in every edition that syncs. #460
built that check, `translate doctor --require-state` (`D-2026-11-16-require-state-check`).
Conditions 1 and 2, #259's D2 and the one ToC rule of #259 and #142, are still open. On
2026-11-16 Matt asked for a rollout plan and chose how it is carried out, in this repository's
organiser session.

**Decision**:

- **The editions.** It covers the five editions that sync today, judged by the source
  repositories' sync workflows:
  - lecture-intro.zh-cn;
  - lecture-python-programming's fa, fr and zh-cn editions;
  - lecture-python.zh-cn.

  The ml and ja editions have no sync workflow, so they join when they start to sync.
- **The steps, in order.**
  1. Three edition PRs add `.translate/state/_admonition/gpu.md.yml`: in
     lecture-python-programming.fr and .zh-cn, recording `3e4f703` of
     lecture-python-programming, and in lecture-python.zh-cn, recording `1f6b3fa` of
     lecture-python.myst. Each is written by `translate status -f _admonition/gpu.md
     --write-state` from full clones, with `.translate/config.yml` restored afterwards. These
     editions failed the check on that file alone. lecture-intro.zh-cn and fa already pass.
  2. **v0.33.0 ships when the rollout starts**, not before, so that the CI jobs can pin a
     release that has the check.
  3. Each of the five editions gets a workflow file of its own that runs the check on
     `pull_request` and on `push` to `main`, as in the CLI reference's *Requiring state files*.
     It is not a job in the edition's `ci.yml`, which runs on PRs only.
  4. The job becomes a required status check on `main`. lecture-intro.zh-cn's "Base" ruleset
     and lecture-python.zh-cn's "main_protect" gain the rule. The three editions with no
     ruleset get one, which makes them PR-only, as the other two already are.
- **Who carries it out.** This repository's organiser session drafts the plan and makes the
  release, each release step on Matt's go. A session on Matt's laptop opens the edition PRs of
  steps 1 and 3, each for his review and merge. A session with an admin token makes the
  ruleset changes of step 4 through the API, on his go for each repository. The organiser
  session makes no edition writes.

**Consequences**:

- Condition 3 counts as met once step 4 is done in all five editions. That will be recorded in a
  log entry and STATE.md. `sync-scope` stays until conditions 1 and 2 land too.
- An edition that starts to sync joins the rollout first. ml needs `intro.md` declared, its
  lectures declared or backfilled, and `gpu.md` declared once a lecture that includes it lands.

**Refs**: #460, #370, #259, #142, #371.

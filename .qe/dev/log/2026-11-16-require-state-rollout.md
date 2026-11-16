# 2026-11-16 — `state-files` is a required check in the five editions that sync

**Trigger**: the rollout in `D-2026-11-16-require-state-rollout`, which started with v0.33.0
(log `2026-11-16-v0330-release`). Its four steps ran the same day. A laptop session did the
edition work, on Matt's go at each step. This repository's organiser session wrote the briefs
and checked each result read-only. It made no edition writes.

## The steps

1. **The `gpu.md` state files.** QuantEcon/lecture-python-programming.fr#108,
   QuantEcon/lecture-python-programming.zh-cn#149 and QuantEcon/lecture-python.zh-cn#321 merged
   at 09:23 UTC. Each added `.translate/state/_admonition/gpu.md.yml`, recording `3e4f703` or
   `1f6b3fa` as planned. The three translations already carried the English's January 2026
   wording.
2. **v0.33.0**, released at 09:09 UTC.
3. **The `State files` workflow.** Five PRs each added `.github/workflows/state-files.yml`,
   byte-identical to the CLI reference's example, pinned to `v0.33.0`:
   QuantEcon/lecture-intro.zh-cn#326, QuantEcon/lecture-python-programming.fa#182,
   QuantEcon/lecture-python-programming.fr#109, QuantEcon/lecture-python-programming.zh-cn#150
   and QuantEcon/lecture-python.zh-cn#322. Each passed its own run and then the push run on
   `main`.
4. **The required check**, at 09:56 UTC, on Matt's "Require it, all five". Matt chose no bypass,
   and the same rules in all five editions:
   - lecture-intro.zh-cn's "Base" and lecture-python.zh-cn's "main_protect" gained the
     `required_status_checks` rule;
   - fa, fr and lecture-python-programming.zh-cn got new "Base" rulesets with the same four
     rules: `deletion`, `non_fast_forward`, `pull_request` with 0 approvals, and the check.

   The check is `state-files`, from GitHub Actions (app 15368), and not strict. The three
   editions with new rulesets are PR-only for the first time.

fa#182 merged in two halves. The squash commit reached `main` first, while the PR still read
open and no push run fired. About 25 minutes later GitHub finished the merge itself, with an
empty commit on the same tree (`af254a9`). Nothing needed tidying.

## What it leaves

- **Retirement condition 3 is met**, in the terms ruled on 2026-10-19: every edition that
  syncs runs the state check as a required check on every PR and on pushes to `main`.
  `sync-scope` still waits on conditions 1 and 2 (#259, #142).
- **55 open edition PRs had no `state-files` run** when the rule went on: 4, 12, 2, 8 and 29.
  Each needs one new event before it can merge.
- **A look-back** around 2026-11-23 is #463. It covers blocked PRs, failures for reasons other
  than a missing state file, and the editions that became PR-only. The settings change is logged
  in QuantEcon/infrastructure's `github/settings-changelog.md`.
- **The workflows pin `v0.33.0`.** A later release changes nothing in the editions until their
  pins move.
- **An edition that starts to sync joins the rollout first.** ml needs its declarations or
  backfills before its check (`D-2026-11-16-require-state-rollout`).

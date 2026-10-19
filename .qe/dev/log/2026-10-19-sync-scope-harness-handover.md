# 2026-10-19 — handover: the #344 scope smoke on the E2E harness, for @mmcky's local machine

**Trigger**: #376 implements #344 (`sync-scope: existing`). CI passes, and a bundle-level test
runs the built action against a fake GitHub API. The live E2E check has not run: the harness
rewrites the workflow files in the four harness repos, which needs the `gh` token's `workflow`
scope, and the session's token had none. @mmcky runs the smoke locally and reports on #376.

**State, read live on 2026-10-19 at about 07:40 UTC**:

- `main` is at `e7356cc` (v0.29.5, #373). It has no `sync-scope` input.
- #376's branch, `feat/sync-scope-existing`, is at `0b2a2cb`, with `main` merged in. CI `test`
  passed, and Copilot's review reported no open issues.
- The harness repos sit where the v0.29.5 `@v0` smoke left them. Each repo has one open PR
  (scenario 01), the sync workflows are on `@v0`, and the targets hold `.translate/config.yml`
  and no state file. The `test-sync-scope-existing` label does not exist yet; the script creates
  it.

## How to run this (@mmcky, locally)

Run from a checkout of the branch, not `main`. The harness's `--sync-scope` option exists only on
#376:

```bash
git fetch origin && git switch feat/sync-scope-existing && git pull
```

1. **Token scope, once.** The harness refuses to run without it:

   ```bash
   gh auth refresh -h github.com -s workflow
   ```

2. **The scope smoke**, five scenarios on all three lanes. It makes real, billed model calls, but
   few. Per language, scenario 19 makes one sync translation, and 19 and 20 make one review each.
   Scenarios 01, 17 and 18 make none: 01 opens no PR, 17's PR has no Markdown to review, and 18
   takes the deletion-only review.

   ```bash
   SCRATCH=$(mktemp -d)
   ./tool-test-action-on-github/test-action-on-github.sh --action-ref feat/sync-scope-existing \
     --sync-scope existing --scenarios 01,17,18,19,20 2>&1 | tee "$SCRATCH/scope-smoke.log"
   ```

   The census should read `sync-scope existing`, with all 9 workflows on `@feat/sync-scope-existing`
   and the smoke-test warning. The script stops if the ref's `action.yml` lacks the input, which
   is why the ref is the branch. Its reset lays down `.translate/state/lecture.md.yml` in every
   target and none for `lecture-minimal.md`. Every PR it creates carries the scope label before
   `test-translation`.

3. **Read the results back** once the runs on GitHub finish, about ten minutes. Expected, per
   language (the harness README's "Scope runs" table, with 01 and 18 added):

   | Scenario | Translation PR | Its files | `### Lectures Not Synced` | Sync run |
   |---|---|---|---|---|
   | 01 | none | — | — (the job summary lists `lecture-minimal.md`) | passes |
   | 17 | yes | `_toc.yml` only, with `game-theory` added | `game-theory.md` | passes |
   | 18 | yes | deletes `lecture.md` and `.translate/state/lecture.md.yml`, updates `_toc.yml` | none | passes |
   | 19 | yes | `lecture.md` and `.translate/state/lecture.md.yml`, both modified | `lecture-minimal.md` | passes |
   | 20 | yes | adds `linear-algebra.md` and `.translate/state/linear-algebra.md.yml`, deletes `lecture.md` and `.translate/state/lecture.md.yml` (GitHub may show either pair as a rename), updates `_toc.yml` | none | passes |

   Expected review verdicts:
   - 17: the "No markdown files to review" PASS;
   - 18: the deletion-only PASS;
   - 19 and 20: ordinary reviews.

   One skipped sync run per PR and lane is also expected: adding the scope label fires a run
   whose job the workflow skips.

   ```bash
   # the translation PRs on each lane
   for lang in zh-cn fa ml; do echo "== $lang"
     gh pr list --repo QuantEcon/test-translation-sync.$lang --state open \
       --json number,title --jq '.[] | "#\(.number) \(.title)"'; done
   # one translation PR: its files, then its not-synced list
   gh pr view <n> --repo QuantEcon/test-translation-sync.<lang> --json files --jq '.files[].path'
   gh pr view <n> --repo QuantEcon/test-translation-sync.<lang> --json body --jq .body \
     | sed -n '/### Lectures Not Synced/,/### Details/p'
   # the sync runs on the source repo; then scenario 01's log for each lane
   gh run list --repo QuantEcon/test-translation-sync --limit 40 \
     --json databaseId,conclusion,workflowName,displayTitle \
     --jq '.[] | "\(.databaseId) \(.conclusion) \(.workflowName) | \(.displayTitle)"'
   gh run view <run-id> --repo QuantEcon/test-translation-sync --log | grep -E "not synced|sync-scope: existing"
   ```

   Each scoped run also writes a job summary, on the run's page under the job. It lists what was
   in scope and what was not.

   The evaluator checks the zh-cn lane against the same expectations, scenario 01's sync run
   included. It needs `npm ci` in its folder, plus `GITHUB_TOKEN` and `ANTHROPIC_API_KEY`, and it
   makes billed Opus calls for 19 and 20. It reads only zh-cn, so read fa and ml back with the
   commands above:

   ```bash
   (cd tool-test-action-on-github/evaluate && npm ci && npm run evaluate)
   ```

4. **Optional: the default control at the branch.** It shows that an edition without the input
   sees nothing new. It resets the repos, so read step 3 back first:

   ```bash
   ./tool-test-action-on-github/test-action-on-github.sh --action-ref feat/sync-scope-existing \
     --scenarios 17,19,20 2>&1 | tee "$SCRATCH/default-control.log"
   ```

   Expect what the v0.29.5 gate delivered for these scenarios:
   - 17 delivers `game-theory.md`;
   - no PR body has `### Lectures Not Synced`;
   - no sync run writes a job summary.

   The v0.30.0 release gate repeats this for all 28 scenarios at the tag.

5. **Report on #376**, as a comment:
   - the census line and the source PR numbers;
   - the table above, filled in per lane: the translation PR's number, whether its files and
     not-synced list match, the sync run's conclusion, and the review verdict;
   - the evaluator's summary, and the control's result, if run.

   For anything that does not match, give the PR, its file list and the run link.

## What happens next, on those results

- **If everything matches**, #376 is ready for @mmcky to merge. #344 can then close, since this run
  was its last open task. The input ships in the release #346 tracks; that release's gate keeps
  every lane on the default.
- **If a case deviates**, it goes on #376. A session fixes it on the branch and re-runs only the
  affected scenarios.
- **Either way**, the next default harness run (the v0.30.0 gate) deletes the state file this
  run lays down.

## Traps

- **Don't add `--languages`.** It narrows the estate: the reset re-renders the source repo's
  `.github/` from the narrowed list, so the other languages' sync workflows stay deleted until an
  unscoped run. This smoke does not need it.
- **The translation PRs carry the scope label too.** The action copies a source PR's labels
  (all but `test-translation`) onto its translation PR, so the label is also created in each
  target. The review workflows ignore it.
- **Set `SCRATCH` before the `tee`.** It is the trap the v0.29.5 handover hit.

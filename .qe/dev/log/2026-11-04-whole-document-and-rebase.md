# 2026-11-04 — zh-cn failures triaged; the whole-document head; rebase moves a branch in one step

**Trigger**: Matt asked for a review of the open issues and a recommendation, then agreed the
plan: triage the untriaged zh-cn sync failures; fix the whole-document paths (#363's fence
unwrap, then #326's head region and #288's front-matter guard); then #280; ship them together
with #346's French items. Smaller items: ml#58 round 6, #415's doc line, the #414 ruling. Not
next: #416, #417, the #257 re-cut. Six PRs are open at the end, none merged.

## zh-cn failures → #418 (PR #419) and #420

- Five `translation-sync-failure` issues had no comments (lecture-python.myst#1097, #1100,
  #1107; lecture-python-intro#850, #858). In lecture-python.zh-cn, 35 of 150 lectures were
  behind their source; 32 of them sit in the four unreviewed October sync PRs (zh-cn#308, #310,
  #311, #312).
- **#418**: the section cap (16,384 output tokens) cut off the two longest `## Exercises` in
  the estate (`lq_mean_field_games`, `likelihood_ratio_process_2`). Over 252 zh-cn section
  updates, output runs 0.487 tokens per source character at the median and 0.625 at most.
  **PR #419** gives a section its document's cap (64,000; 128,000 for models that always
  think). Billing and the output-token rate limit count generated tokens, not `max_tokens`
  (rate-limits doc, read 2026-11-04); the old comment saying otherwise is corrected.
- **#420**: update mode diffs from English the translation never carried. When a lecture's
  previous sync PR is still open, or its last sync failed, every later sync fails parity, and
  the `\translate-resync` the failure issue advises fails the same way (#281). The state file's
  `source-sha` holds what a precondition check needs. No PR yet.

## #363 → PR #421

`unwrapDocumentFence` (`src/whole-document.ts`) removes a wrapper fence only under #203's four
conditions; the fourth (the fence walk ends closed once the two lines are gone) matters because
20 of the 27 programming lectures end in a bare closing fence. The French redraw that would
measure it on the live model is not run: it needs Matt's go-ahead (about USD 3–4 for 24 draws).

## #326 and #288 → PR #422 (stacked on #421)

- **`restoreHead`**: init and the full-document sync write the source's lines above the H1
  byte for byte; forward writes the target's front matter plus the source's pre-title. Runs after
  typography, before the heading map. **`checkWrittenDocument`** = parity plus the new rule that
  `jupytext:` / `kernelspec:` / `translation:` appear only in the leading block and the source's
  jupytext/kernelspec survive; it refuses rather than repairs. `init --report-json` gains
  `headRestored` per lecture and `headRestores` per run; the rate check prints the count.
- **Replays, no new spend**: of 12 French v0.29.4 drafts, 7 heads were replaced and all were
  written; 6 of the 9 v0.29.4 wrote had lost jupytext/kernelspec. Across the B12 drafts:
  Opus 5.5 8 of 60 restored; Haiku 2 restored and 3 refused (`commod_price`: a stray unclosed
  code-cell fence leaves no H1 outside fences); Sonnet 5.5 and Fable 5.1 untouched (120).
- **Edition sweep**: 0 front-matter violations. 7 pre-title diffs against source: zh-cn
  `about` (stray `---`), `exchangeable` and `mix_model` (stale anchors), `lagrangian_lqdp`
  (stray `+++`), `von_neumann_model` (blank line in `{raw}`), fa `getting_started` (its
  `<style>` block is missing), fr `getting_started` (U+00A0 in the CSS, #325). An UPDATE sync
  repairs all but the fr one; a forward on #422 repairs all seven.

## #280 → PR #423

- `src/git-commit.ts`: one Git Data API commit on a base SHA pinned when the PR's rebase began
  (the ref-free calls retried on 5xx, 429 and secondary limits), one forced `updateRef` never
  retried, then `pulls.get`. A tree equal to `main`'s closes the PR with a comment and leaves the
  branch; a PR not open after the move fails the run. `queue: max` in the rebase template.
- **Departures from the issue's plan**: `fetchExistingStateShas` is pinned, not dropped. It is
  the orchestrator's deletion oracle for state files. The source bibliography is now read at the
  PR's source commit, as sync reads it.
- **Tests**: 20 module tests, and 4 bundle tests through an extended `action-bundle-runner.cjs`
  (rebase routes, `RUNNER_SOURCE_REPO`). With `main`'s bundle in place all four bundle tests fail.
  Suite 2,156 tests on the branch.
- The closing comment claims only what is checked. A declared file can be skipped by the read
  step: every forward PR declares its state file, which the source does not hold.

## #415 → PR #424

A comment in the sync workflow `translate setup` writes, plus the action reference, the FAQ and
the README: a PR merged from a fork never syncs on its own and needs `\translate-resync`, as soon
as it has merged (#276's precondition; `translate forward` once a later merge has touched the
files).

## ml#58, round 6 (`intro`)

The editor approved on 2026-11-01 with two suggestions, touching both prose lines: the
Malayalam plural dropped from `series` (Copilot had flagged it); `ഈ lectures` → `ഇവിടെ കാണുന്ന
lectures`; `Economics` capitalised with the `-ഉം` comma (both already encoded, after the v0.29.5
seed); the accusative `applications-നെ`; `ശ്രദ്ധ കേന്ദ്രീകരിക്കുന്നത്` → `focus ചെയ്യുന്നത്`.
The plural rule and its `ml_metrics` lint exist, and the lint flags `series-കളുടെ`, at v0.29.5
and at `main`. The seeding run recorded it (the round-6 arm's `checks.jsonl`, `plural: 1`), but
the PR's hand-written verification line said there were none: QuantEcon/project-translation#83.
The lint gap the page does show is the lowercase opener `economics-ലും`, which `lowercase_initial`
misses (#301, part 1). The other three are singletons and are not encoded under the recurrence
rule. The suggestions are not applied: that is a write to the edition, held for Matt.

**#301 → PR #426.** #301 is rewritten in place and retitled: part 2 (the hortative rule's
dangling colon) was already done in #311, and part 1 now carries a tested change. #426 makes it,
with `conda` in `LOWERCASE_OK`, pipe-table rows skipped by the terminal-punctuation lint, and the
two `ഓർക്കുക:` comments. Against `main`: nothing new on the editor's five reviewed pages, two
lines on the six seeds sent for review (both lines the editor changed), and 1290 → 1512 on the
280 archived drafts, none lost. Round 6 alone is weak evidence, since ml#58's description had
proposed the capital the editor accepted; the reviewed pages carry the case (49 of 49 suffixed
paragraph openers outside lists are capitalised).

## Open for Matt

- **Merge order**: #419, then #421, then #422 (rebase it onto `main` after #421 squash-merges;
  CI runs only on PRs into `main`), then #423; #424 and #426 any time. All six touch
  `CHANGELOG.md`, so each later one needs a rebase; the four that touch `dist-action/` also need
  `npm run build`.
- **Merging zh-cn#308/#310/#311/#312 before #423 ships**: each merge runs the old rebase, which
  closed two siblings on 2026-10-21. Merge one at a time and check the others are still open, or
  pause `rebase-translations.yml` until all four are in.
- `\translate-resync` on lecture-python-intro#845 (its sync failed in run 34954991418 and opened
  no failure issue); the recovery route for the lectures behind source that are natively
  reviewed (never forward those); the #414 ruling; the French redraw spend; release timing.

# 2026-07-26 — #192: gate the `\translate-resync` trigger on commenter trust

Details in the CHANGELOG entry; the association-set question that #138 left open is settled
in [`D-2026-07-26-resync-trust-gate-association-set.md`](../decisions/D-2026-07-26-resync-trust-gate-association-set.md).
What else outlives the PR:

- **The issue scoped step 1 as three files; it is fourteen.** #192's table named
  `setup.ts`, `examples/README.md` and `docs/user/quickstart.md`. A sweep found twelve
  documented copies (README, `examples/` ×3, quickstart, action-reference ×3, and the three
  tutorials ×4) plus the scaffolder plus the E2E harness template. Fixing the three the issue
  named would have left nine copies teaching the vulnerable shape — and the docs are how the
  estate gets configured, so those nine are the *supply* side of the exposure. Scope taken as
  "every in-repo copy", which is what "canonical" has to mean here.
- **The new guard sweeps rather than enumerates.** `workflow-templates.test.ts`'s existing
  review-workflow guard uses a hard-coded `DOC_PAGES` list. That shape is what let this
  spread: each new doc page copied an older one, and no list knew it existed. The sync guard
  instead walks `README.md`, `examples/`, `docs/`, `tool-test-action-on-github/` and
  `.github/`, parses every workflow block it finds with `js-yaml`, and asserts per job. A
  page added tomorrow is covered on the day it lands. It deliberately does *not* walk the
  repo root: the `test-translation-sync*` clones are gitignored but present in a working
  tree, and a test whose result depends on what happens to be on disk is worse than no test.
- **It parses instead of grepping, on purpose.** The fix rewrote a folded `if:` in fourteen
  places. A substring check passes on a copy whose fold silently swallowed a clause; parsing
  and reading `jobs.*.if` compares what GitHub actually evaluates. Verified the guard fails
  before trusting it — regressing one doc page turns 5 assertions red.
- **The two gates are pinned to each other.** `src/inputs.ts` has enforced
  `TRUSTED_ASSOCIATIONS` inside the action since resync shipped, so the workflow gate was
  never the only defence — but it was the only one that runs *before* the billing starts.
  The guard now asserts the workflow's set equals the one `inputs.ts` declares, so widening
  one without the other fails CI.
- **The folded `if:` is verified, not assumed.** YAML folds a more-indented continuation line
  by preserving its newline, so the expression GitHub receives contains literal `\n`. The
  shape is the one deployed on `QuantEcon/lecture-python.myst@8abdb57` since 2026-07-22, and
  both branches have fired there since (`issue_comment` runs on 07-23, `pull_request` runs
  through 07-26) — checked before copying it, because a mis-folded `if:` would stop the sync
  firing on merges entirely and would look exactly like "nothing happened".
- **`dist-action/` is byte-identical.** The change is CLI + docs + a test; the action bundle
  does not move. Rebuilt and confirmed no drift.

**Not done here** — rollout steps 2 and 3 of the issue, which are other repos:

- The harness *template* is updated in this PR, so `test-translation-sync`'s three sync
  workflows pick the gate up on the next harness run (it force-pushes what it renders). The
  three files as they sit on that repo right now are still ungated.
- The estate is untouched: `lecture-python-intro/sync-translations-zh-cn.yml`,
  `lecture-python-programming/sync-translations-{zh-cn,fa,fr}.yml`.
  `lecture-python.myst` already carries the fix — it is where the shape came from.

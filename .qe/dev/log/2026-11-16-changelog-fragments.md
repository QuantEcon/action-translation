# 2026-11-16 — changelog fragments, a prototype

**Trigger**: log `2026-11-16-overnight-stack`, whose next step this was. Every merge of that
batch conflicted the open PRs on `CHANGELOG.md`'s `[Unreleased]`. The merging session put three
remedies on QuantEcon/infrastructure#123, and Matt agreed to fragments the same morning.

## Rulings (@mmcky, 2026-11-16)

- **Fragments, as a prototype, in the lean form.** No workflow requires a fragment yet, and
  there is no `no-changelog` label: "we can see if this pattern works well and then file a
  project to build the workflows and associated infrastructure needed". He also suggested
  per-PR files named by PR number (`CHANGELOG-{pr-#}`). Fragments are named by branch instead,
  since an agent writes the file before the PR number exists. The record notes his variant
  (`D-2026-11-16-changelog-fragments`).

## What was built

`changelog.mjs` at the root:
- `--check` runs in CI, as the `ci.yml` step "Check changelog fragments". It validates every
  fragment and fails while `[Unreleased]` holds anything.
- `--release X.Y.Z` writes the fragments under the version, deletes them, and prints the
  sections as the draft release notes. Nothing is written until every check passes.

`changelog.d/` holds a README, plus the eleven `[Unreleased]` entries moved into nine
fragments, one per PR (#439 had none). A trial release reproduced every entry byte for byte,
each in its section. The order is file-name order rather than merge order, so the block as a
whole differs.

The PR adds 31 tests. AGENTS.md's rule, its documentation line and release steps 1 and 6
changed to match, and so did CONTRIBUTING.md.

## The reviews

Two Fable passes:

- **On the design**, before building, it cut the draft:
  - `[Unreleased]` stays empty, enforced by `--check`. That replaced merging old entries in,
    and removed the need to tell a release PR from another.
  - Fragment order is by file name, not `git log`, which is unreliable in a shallow CI clone.
  - The date defaults to the local date, since releases carry the Sydney date.
  - Tests run the script on fixture folders.
- **On the code**, it found three must-fixes, all fixed:
  - an unknown flag was ignored and `--release` then wrote: a mistyped `--dat` would have
    released under today's date;
  - a CRLF fragment leaked `\r` into the changelog;
  - this session had no log entry.

  Also adopted: a real-date check, a pre-write check that `changelog.d/` is writable, a message
  for fragments left after the write, clearer messages for an indented section line and a lazy
  continuation, and `process.execPath` in the tests.

Two of my own mistakes were caught before committing:
- a test expected the wrong line number;
- a scripted edit's slice ended one brace early, which the parser caught. AGENTS.md's warning
  about scripted edits applies to small edits too.

## Next

- The first release through `npm run -s changelog -- --release X.Y.Z`, which carries the stack.
- If the prototype holds, Matt files a project for the workflows. The design review left the
  shape of a fragment-required check in the decision record.

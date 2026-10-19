# Sync scope is read from the edition's state files; `sync-scope` is a temporary switch

**Context**: Some editions are built one reviewed lecture at a time. The first,
QuantEcon/lecture-python-programming.ml, also holds English copies of `intro.md` and
`_admonition/gpu.md` on `main`. Until D2 (D-2026-08-10-sync-does-not-first-translate, #259) is
built, sync first-translates a changed lecture the target lacks (#222). On such an edition,
sync would draft a lecture whole, outside any review round, and turn an English change to
`intro.md` into a half-translated page. Ruled 2026-10-19 (@mmcky), on #344.

**Decision**: A new input, `sync-scope`, takes `all` (the default: the behaviour before this
input, byte for byte) or `existing`. Under `existing`:

- A changed lecture is in scope when the edition has its state file,
  `.translate/state/<docs-relative path>.yml`, on its default branch. A rename is decided by
  the previous path's state file: the edition holds the lecture under that name until this
  sync moves it. The tools that add a lecture write its state file, so a lecture joins sync
  when the PR that adds it merges.
- A `.md` on `main` is not enough, since it does not prove the lecture has been migrated: the
  ml edition's English `intro.md` and `_admonition/gpu.md` stay out of scope. Scope reads
  existence, never contents: a state file that `readFileState()` cannot validate still counts.
  Ruled 2026-10-19 (@mmcky): this stays. The CLI's reader is to be fixed instead, in its own
  issues and not in #376: it is to load state with `CORE_SCHEMA` and name the key it rejects
  (#381), `init --skip-existing` is to decide on existence (#379), and extra keys stay accepted,
  as #290 needs.
- Only a 404 means out of scope; any other status fails the run, as the ToC fetch already
  does (#254). Taking a read error as absence, as the `all` path's content fetch still does
  (F36 on #169), would make an outage a silent skip of a reviewed lecture. Implementation
  reading of "as the ToC fetch already does", not ruled: like a non-404 `_toc.yml` read, a
  failed read of a lecture's state file or `.md` is an error for that lecture alone, which is
  neither synced nor skipped; the run fails and opens the failure issue, and the other
  lectures still sync. The edition read is the exception (see Consequences).
- A lecture out of scope is skipped before any content is fetched: no model call, no failure
  issue. One in scope whose `.md` the edition lacks is skipped with a warning, never
  translated from scratch.
- Removals follow the `.md`, as before #344: a lecture deleted upstream is deleted from the
  edition, with its state file if it has one.
- `_toc.yml` stays a mirror of the source, part captions kept (#254), and a partial edition
  prunes it at build time. Leaving the ToC alone, as #344 first proposed, breaks renames (the
  ToC keeps the old name, and the lecture drops out of the navigation) and leaves the copy
  frozen (an entry the source adds later never arrives). #259's structured ToC merge, when
  built, applies under `all` only; `existing` keeps the mirror until the input retires. As
  of 2026-10-19 the ml edition's `scripts/prune_toc.py` drops each entry whose `.md` is
  absent; #344 says it will keep the entries that have a state file, a change in the ml
  repository. #promote
- Skipped lectures are listed in the PR body, under `### Lectures Not Synced` (or
  `### ⚠️ State File Without a Lecture` when the `.md` is missing), and in a job summary,
  which only a scoped run writes. They stay out of the `translation-sync-metadata` `files`,
  which name what the PR delivers (#259's declared-vs-delivered check). The source PR gets
  no comment about them, because most English PRs touch some lecture that a partial edition
  does not have yet.
- When nothing is left to sync (no changed lecture in scope, no `_toc.yml` change, no removal
  and no scope error), there is no PR and no new failure issue, and the run passes. Besides the
  job summary, its only other output is on a failure issue an earlier run opened for the same
  PR and language, if there is one: the run closes it, with a comment that links the run.
  Folded in from #387 on 2026-10-19 (@mmcky): every scoped run that passes without a PR closes
  that issue, as a run that opens its PR already does. `all` keeps its behaviour byte for byte,
  so there a run that passes without a PR still leaves the issue open; #387 stays open for that
  half.

**Temporary input**: When an edition completes, there is no switch from `existing` to `all`.
`sync-scope` retires once three things land:

1. D2 in #259 — no sync first-translates a lecture the edition lacks;
2. one ToC rule for every edition (#259's third task plus #142): the committed `_toc.yml`
   lists the lectures that have a state file and those the PR delivers, and `init` inserts a
   new lecture's entry;
3. a check that fails a lecture on `main` without a state file (`translate doctor` already
   checks this).

State-aware sync then becomes every edition's only behaviour. Every top-level lecture of the
five complete editions (lecture-python-programming.fr, .zh-cn and .fa, lecture-python.zh-cn and
lecture-intro.zh-cn) has a state file (checked 2026-10-19); the ruling on (3) below lists the
other `.md` files that lack one.
On (3): as of 2026-10-19, `doctor` checks only the top-level lectures of the docs folder and
reports one without a state file as a warning, not a failure; its state-file check fails only
when none of those lectures has a state file, or when one of their state files exists but
cannot be read. The scope check is built as the path every edition will take, in a module
D2's path can import (the entry point cannot be imported, #169). The input is a thin switch
around it, so retiring the input is a deletion.

Ruled 2026-10-19 (@mmcky), on (3): the condition is met when every syncing edition runs, as a
required CI check on every PR and on pushes to `main`, a state check that fails on (a) any
`.md` under the docs folder, subfolders included, that has no state file and is not a declared
exception; (b) a declared exception that has a state file; (c) a state file with no lecture;
(d) an unreadable state file. It is built by extending #370 (`doctor --require-state`) with
recursion (#385) and with exceptions declared in `.translate/config.yml`, each listed by name.
For every edition to pass that check, retiring the input also needs backfills: the ml
edition's five lectures, each with the English commit its draft was made from, and the translated `lectures/_admonition/gpu.md` in lecture-python-programming.fr,
lecture-python-programming.zh-cn and lecture-python.zh-cn. It also needs declared exceptions:
ml's `intro.md` and `_admonition/gpu.md`, lecture-python-programming.fa's English
`_admonition/gpu.md`, and lecture-intro.zh-cn's `README.md`. #promote

**Relation to D2**: #344 is D2's partial-edition variant and ships first, in the release #346
tracks. It differs from D2 in three ways: a lecture is in scope only once it has been
migrated, which a file on `main` does not prove; `_toc.yml` stays a mirror; and lectures not
yet migrated are expected, so they are listed briefly rather than reported as gaps. Its scope
check is the one D2 will reuse.

**Known gap**: An English change that lands between a lecture's draft (`translate init`) and
its PR's merge is not synced, because the lecture is out of scope until the merge. `init`
records the English commit the draft was made from, so `translate status -f <file>` on the
round's branch reports OUTDATED before the merge, and the round carries the change. It records
the carried change with `translate status -f <file> --write-state --carried` (#380, folded in
2026-10-19): without `--carried`, `--write-state` refuses a lecture whose English has changed
since the commit its state file records, where before it compared only commit dates.
Implementation finding, not ruled: a rename opens the same gap. Until the rename's sync PR
merges, the edition's state file keeps the old name, so a change to the lecture at its new
path is not synced; once that PR merges, `translate status -f <new name>` reports it OUTDATED.

**Consequences**:

- Implementation guard, not ruled: the 404 rule needs the edition itself read first, because
  GitHub also answers 404 for a repository the token cannot see; without that read, a run
  with a wrong `target-repo` or token could pass with nothing synced. The edition is read
  when a changed or renamed lecture is to be checked. If that read fails, 404 included,
  nothing is synced, not even `_toc.yml` or a removal, since an unreadable edition can take
  no change. The run fails at once, with the failure issue and the job summary.
- An edition that switches to `existing` needs a state file for every lecture it already has,
  and for nothing else. A lecture merged without one stays out of scope until a state file
  written with `translate status -f <file> --write-state` is merged to the edition's default
  branch; without `-f` or `--exclude`, `status --write-state` also writes one for a top-level
  English copy such as `intro.md`. On 2026-10-19 the ml edition had no state file on `main`,
  beside five translated lectures. #promote
- An unrecognised `sync-scope` value fails the run rather than falling back to `all`.
- Rebase mode needs no change for scope: it works from sync PR metadata, which names no
  skipped lecture. Its content fetch, like the `all` path's, still takes a failed target read
  as a new file (F36 on #169), on every edition.

**Refs**: #344 (the input), #346 (its release), #259 (D2 and the ToC rule), #142 (`init` ToC
insertion), #169 (F36; the entry point), #222, #254, #387 (closing a stale failure issue), #380
(`--carried`), #370 and #385 (the state check), #379, #381 and #290 (the CLI's state reader),
D-2026-10-19-lecture-at-a-time-tooling-is-cli-first, QuantEcon/lecture-python-programming.ml.

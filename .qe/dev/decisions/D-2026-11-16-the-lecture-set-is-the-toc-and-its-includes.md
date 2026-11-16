# The lecture set is the ToC's documents and the `.md` files they include, for every tool

**Context**: Three tools held three lecture sets (#449). `translate init` took the ToC's
documents. Sync took every `.md` under `docs-folder`, subfolders included, narrowed under
`sync-scope: existing` to the lectures whose state file the edition has. The CLI's bulk modes
(`doctor`, `status`, `forward`, `backward`, `headingmap`) took the docs folder's top-level `.md`
files (#385). On the source repositories they differ on the one `.md` in `lectures/` that is
neither the ToC's root nor a `file:` entry, `_admonition/gpu.md`, an admonition that lectures
pull in with `{include}`: `init` neither translates nor copies it, so a fresh edition's lectures
include a file it lacks (#117's mechanism). Before #442 merged, Matt asked whether the action
should track lectures by the ToC. #449 asked eight questions; ruled 2026-11-16 (@mmcky), "all
eight as recommended. On 8, design the reader for two front ends now, and build `myst.yml`'s at
the first mystmd edition." A ninth, on the CLI without a ToC, was ruled the same day, on the
build plan.

**Decision**:

1. **"Published" means listed in the ToC, not built.** An edition built without
   `only_build_toc_files` also builds unlisted files; they are still outside the set.
2. **One lecture set for `init`, sync and the CLI's bulk modes:** the documents the source's
   ToC lists, plus every `.md` that one of them includes, followed through further includes,
   read at the commit in question. Entries are resolved against the folder's files: a
   `file:` entry is a lecture only when a `.md` is behind it, so one backed by a notebook is
   left out. An include is resolved as Sphinx resolves it, relative to the including file, or
   to the docs folder with a leading `/`; only `.md` targets count, and a `{literalinclude}`
   target stays a copied file. `init` translates `_admonition/gpu.md`, and `init -f` accepts it.
3. **A `.md` outside the set** (a draft, a `README.md`, an entry commented out of the ToC) is
   left alone. Sync lists a changed one in the PR body and the job summary, on `all` runs too.
   It is not a failure.
4. **A lecture taken out of the ToC but kept in the folder stops syncing.** The edition keeps
   its translation and state file, and the PR body lists it. A removed `.md` is still deleted,
   listed or not, so a cleanup is never blocked.
5. **A ToC entry a PR adds for a `.md` the PR does not change** translates nothing; the PR
   body lists it as a gap, with the CLI catch-up: `translate status` and `forward` for a
   re-listed lecture, which has a state file, and `init -f` for one listed for the first time.
   Dropping the entry from the mirrored ToC is #259's structured merge.
6. **A changed lecture that includes a `.md` the edition lacks** is reported in the PR body as
   a gap, with `init -f <fragment>` as the catch-up, rather than translated inside the sync,
   which D2 on #259 rules out for lectures.
7. **Condition 3's state check runs on the lecture set** (amending
   `D-2026-10-19-sync-scope-existing-reads-state-files`, whose (3)(a) checked every `.md` under
   the docs folder). In the edition, the set is its ToC's documents plus the files its own
   lectures include, limited to the `.md` files it has, since its `_toc.yml` is a mirror that
   can list lectures a partial edition lacks. lecture-intro.zh-cn's `lectures/README.md` needs
   no declared exception. ml's `intro.md` and `_admonition/gpu.md`, and
   lecture-python-programming.fa's English `_admonition/gpu.md`, still do.
8. **The reader has two front ends by design:** `_toc.yml` (`jb-book` and `jb-article`) and
   mystmd's `myst.yml` (`project.toc`). Only `_toc.yml`'s is built. `myst.yml`'s is named and
   refused, and is built, with a test against lecture-wasm's ToC, when the first edition moves
   to mystmd. Implementation reading, not ruled: a folder with both reads `_toc.yml`, and a
   `_toc.yml` whose `format` is neither `jb-book` nor `jb-article`, or that names no `root`, is
   refused rather than read as an empty book.
9. **No ToC, no lecture set.** A sync run whose source ToC cannot be read or parsed fails; it
   never falls back to the folder, which would quietly widen the set. The CLI's bulk modes fail
   the same way when the docs folder has no `_toc.yml`, as `init` already did. A bulk mode's
   `-f` names a file and skips discovery, so it needs no ToC; `init -f` still reads the ToC,
   since it accepts only a file in the set.

**Consequences**:

- Scope under `sync-scope: existing` is the lecture set intersected with the lectures whose
  state file the edition holds, the ToC test first. The three conditions for retiring
  `sync-scope` stand.
- Resync, rebase and review need no change. Resync reads the source at the PR's merge commit,
  where the ToC is read too; rebase replays the sync PR's own file list; review reviews the
  files the translation PR holds.
- Sync reads the source ToC and the folder's file list on every run with a changed or renamed
  `.md`, where it read the ToC only when the PR changed it, and it reads lectures for their
  includes only when a changed `.md` is not a ToC document.
- The reader is `src/lecture-set.ts`. It reads through a source, a file list and a reader, so
  the CLI drives it from disk and sync from the GitHub API at one commit. Its first PR moved
  sync's ToC walk there and changed no behaviour; the tools move onto it in the PRs after.
- The edition's set (7) is the same reader run on the edition's docs folder: entries with no
  `.md` behind them are reported, not included, so it is limited to the files the edition has.
  There is no separate edition reader.

**Refs**: #449 (the design and the ruling), #385, #370, #259 (D2 and the ToC merge), #222, #117,
#142, #254, #398, D-2026-10-19-sync-scope-existing-reads-state-files.

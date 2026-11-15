# A lecture moved out of `docs-folder` is deleted from the edition; a book moved out of it is refused

**Context**: GitHub lists a file moved out of the docs folder as a rename under its new path.
Sync decided what a rename was from the new path alone, so the entry matched no list and was
dropped. The edition kept the translation and its state file, and a ToC edit in the same PR
left the lecture outside the edition's toctree, with nothing in the log, the PR or the review
naming it (#398). #433 (v0.30.1) had fixed the other half, #307's check of a rename's old
path. Ruled 2026-11-15 (@mmcky), in the overnight plan for WP2 (2c), shipped in #442.

**Decision**:

- **A docs-folder lecture renamed to a path outside the folder is a removal of its old path.**
  The sync PR deletes the translation and its state file and lists both under Files Deleted,
  and the log says why. Sphinx builds only files under its source folder, so the lecture is no
  longer a page of the book.
- **Review learns the same.** It counts the deletion as one the source PR made, so the PR gets
  the deletion-only review instead of the aborted run #210 described.
- **A book moved out of the folder is refused.** When the docs folder's own `_toc.yml` moves out
  of it, or is removed while a `_toc.yml` outside it is added (GitHub's listing of a ToC moved
  and rewritten), taking each lecture's move as a removal would delete every translation. The
  run fails with a failure issue instead. It says to move the edition's files the same way in a
  PR of its own, to point the workflow's `docs-folder` and `paths:` at the new folder, and not
  to resync the PR.
- **A lecture renamed inside the folder to a name that is not `.md`**, such as a conversion to
  `.ipynb`, is left in the edition with a warning that sync no longer updates it, since the
  source's ToC still lists it.

**Consequences**:

- Whether a workflow's `paths:` filter fires on a rename's old path alone is unverified. A move
  usually comes with a ToC edit, which it does match.
- Before #442 merged, Matt asked whether the action should track lectures by the ToC rather
  than by the folder. For this case the two agree. The wider question is #449.

**Refs**: #398, #307, #210, #442, #449.

# 2026-10-20 — what sync does with a lecture the source removes; six gaps filed

**Trigger**: Matt asked whether a translated lecture becomes an orphan when the English source
removes it, then asked for the untracked gaps to be filed and the Project updated.

**The answer, verified.** Sync cleans up through the translation PR for the deleting source PR:
it deletes the lecture's `.md` and its state file, and the mirrored `_toc.yml` drops the entry.
Review routes a deletion-only PR to an editor with no model call. Nothing else goes: assets,
`.bib` entries and the source's redirects stay (#271). Checked by:
- reading the code at e7356cc;
- fake-GitHub bundle runs, where `main`'s and #376's bundles behaved identically under `all`;
- CLI fixtures;
- comparing the six editions with their sources on 2026-10-20.

No edition holds an orphaned lecture or state file. Sync's only production deletions so far are
renames (lecture-intro.zh-cn#311 and #312). Before sync was wired, lecture-python.myst's November
2025 reorganisation orphaned eight lectures in lecture-python.zh-cn, which were removed by hand in
lecture-python.zh-cn#99. Eight non-`.md` files that the source deleted before sync was wired are
still there. #promote

**Gaps filed** (all `bug`, unparented: none serves an open Project's definition of done):
- #396: a failed read on the removal path drops the deletion and reports success (F36 on #169).
- #397: a deletion while the lecture's own translation PR is open.
- #398: a lecture moved out of `docs-folder`.
- #399: the CLI cannot tell an orphan from an edition-only file, or list a state file whose
  lecture is gone.
- #400: bulk `backward` fails on every one-sided file.
- #401: `status --write-state` prints its banner when it wrote no state file.

Comments:
- #276: resync re-creates a deleted lecture, the same root cause. It flags
  lecture-python-intro#850, whose recovery advice would do exactly that.
- #379: a leftover state file makes `--skip-existing` skip a lecture the source adds back.
- #370: the agreed check cannot see an orphan that kept its state file. Recommended: keep the
  per-PR check edition-only, and compare with the source on a schedule.

**#376.** One line added to the action reference's Partial editions section. Under `existing`, a
rename whose old path has no state file (an English copy) is skipped: the old file stays, and the
mirrored ToC drops its entry.

**Project.** The Malayalam edition's tracker, project-translation#63, was re-stamped 2026-10-20
and given its first revision-log comment, following the qe `workplan` skill's `update`
(QuantEcon/skills, plugin `qe@quantecon` 0.10.0, installed this session). Two points from the
2026-10-19 records were reconciled there:
- The ml backfill may record the current English commit once lecture-python-programming.ml#55
  has carried `python_by_example` forward, which is ml#56's order.
- ml's `intro.md` leaves the declared exceptions when its round (ml#58) merges.

Field note for the skills (#promote): `workplan`'s discovery searches for "work plan" in the
title, so here it finds only the parked #257. It does not read `.qe/project.yml`, which declares
both trackers, the active #349 included.

**Next**: Matt's review of #376 and the scope smoke (#377). Triage of #378–#391 and #396–#401.

**Promoted, later 2026-10-20**: the field note went upstream as QuantEcon/skills#85 (`qe` 0.10.1),
which closes QuantEcon/skills#80. With no issue named, discovery now reads `.qe/project.yml` in both
shapes, plus `Project`-typed issues and the title search, and asks when they name more than one.
`NEXT-STEPS.md` gives the recommendation. Run by hand here, it names #349 and #257 and recommends
#349.

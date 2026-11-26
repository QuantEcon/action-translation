# A review finding moves to another file only on strong quote evidence

**Context**: The reviewer sometimes names one file while its finding quotes another file of the
same PR (lecture-python.zh-cn#208: an accuracy finding on `kesten_processes.md` quoting
`olg_adaptive_money.md`), so an editor sent to the named file finds nothing to act on (#223).
The issue also proposed marking a finding "unlocated" when no file holds its quotes; that needs a
verdict schema change during the shadow window and was not built. The overnight build of
2026-11-25 (#476) moves a misfiled finding; this record states the rule it moves by, which was
decided in the building session and is to be confirmed by @mmcky at merge.

**Decision**: On a PR that reviews more than one file, the text a reviewer finding quotes in its
description (in backticks or quotation marks, 6 characters or more; never the suggestion, which
proposes text) is compared with every reviewed file's English and translation, before and after
the PR, under a folding comparison (whitespace, compatibility forms, emphasis markers,
backticks, MyST role prefixes, apostrophes and case; CJK compared with all whitespace removed).
The finding is moved to another file, with its location cleared, only when all of these hold:

- the named file has both texts, and holds none of the quotes;
- every quote that is found anywhere is found in one and the same other file;
- there are two such quotes, or one of 20 characters or more;
- no quote is found nowhere, except that one quote found nowhere is tolerated beside two found
  in the destination.

The last condition loosens a rule of its own. The first build ignored quotes found nowhere, and
its review showed that this moved findings on weak evidence, so a quote found nowhere now keeps
the finding where it is; but the #208 finding itself carries the reviewer's own proposed wording
in quotation marks, which is in no file, beside two passages of the other lecture. One unfound
quote beside two found ones is therefore taken as such a proposal and tolerated. Otherwise the
finding is left as the reviewer wrote it. Severity, category and text never change, no finding
is dropped, and routing is unchanged; each move is logged in the run.

**Consequences**:

- A quote common to several lectures, a glossary term, a short phrase, or the named file's own
  text in a form the comparison misses leaves the finding where it is.
- Residual: a single quote of 20 characters or more that only another file holds can move a
  finding that merely cites that file.
- A move is visible only in the run log: the verdict schema is unchanged, so shadow data cannot
  tell a moved finding from one the reviewer filed there, and per-file shadow data shifts across
  the release that carries this.
- The "unlocated" remedy stays with #223, which remains open.

**Refs**: #223, #476, lecture-python.zh-cn#208.

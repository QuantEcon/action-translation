# Next steps — reading order across trackers

*Curated by people. Proposed 2026-10-06 for the maintainer's approval.*

This repository has two project trackers. Read them in this order:

1. **#349 — hardening from the 2026-10-05 codebase review** (active). Its sub-issue list is the
   plan. #348 comes first: forward resyncs send no glossary terms or language rules, so it lands
   before the next `translate forward` run. #280 (rebase moves a PR branch in one step) follows.
2. **#257 — the work plan from the 2026-08-10 backlog review** (parked 2026-10-04: relevant,
   not urgent). It resumes when a release is assigned to W1 (#259); its next planning session
   re-cuts it to W1 alone. Notes for that re-cut: the 2026-10-06 comment on #259.

**Gates between the trackers:** none. Neither needs anything the other produces.

`.qe/project.yml` still declares #257 (registry `engine-v027`). Whether #349 is registered as
well, and how `project.yml` should declare a second tracker, is the maintainer's call.

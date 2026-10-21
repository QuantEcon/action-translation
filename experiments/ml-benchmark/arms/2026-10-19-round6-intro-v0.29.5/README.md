# Arm: round 6 (`intro`) — three draws at v0.29.5, chosen on structure, 2026-10-19

These are the round-6 calibration seed drafts for lecture-python-programming.ml, sent as
lecture-python-programming.ml#58 (review issue ml#32). The round was drafted
before the editor's round-5 answers (lecture-python-programming.ml#57) on Matt's ruling of
2026-10-19: neither of that issue's questions has a site on this page (no label bullets, no
case-marked `-ഉം` pair).

- **How they were made.** Three drafts at v0.29.5 (`e7356cc` = `@v0`, glossary v0.8.0, 93 terms)
  with `init -s <English> -f intro.md --localize none -m claude-sonnet-5`, from a git worktree of
  lecture-python-programming at `b0c58ab` (`intro.md` last changed in `a2a3763`), so the state file
  records `source-sha: a2a3763`. The CLI ran from a scratch worktree of the tag with its own
  `npm ci`.
- **A first run was discarded** (`first-run-git-archive/`): it drafted from a `git archive` export,
  which has no history, so `init` wrote `source-sha: unknown`. Its three drafts are kept as
  evidence for the rates below; they were not candidates.
- **`checks.jsonl`** holds the per-draft checks (the round-5 gate arm's `checks.py`).

| Draft | Front matter | Refused first | Lints | `ml_repair` | Pinned-term check |
|---|---|---|---|---|---|
| 1 | **dropped** (only `translation:` left) | 0 | clean | no change | `set 1→0` |
| **2 (sent)** | identical to the English | 0 | clean | no change | `set 1→0` |
| 3 | **dropped** | 2 | 1 `-ഉം` pair without a comma | 1 comma | clean |

**Why draft 2.** It is the only draft whose jupytext front matter survives; drafts 1 and 3 return
the page with nothing above the heading but the `translation:` block. All three are otherwise
clean: heading and `{tableofcontents}` identical to the English, both paragraphs ending in a full
stop, no banned rendering, no lowercase opener, *provide* rendered `നൽകുന്ന`.

**Left as generated and disclosed:** *the set of lecture series* is rendered `lecture series-കളുടെ
ശേഖരത്തിലെ` ("collection"). The glossary pins *set* in English for its software and mathematics
senses; this is the everyday sense, so the pinned-term check's flag may be a false alarm, but
everyday words are what the editor returned to English in round 5. It is his call. The link text
is translated, as in draft 1; draft 3 keeps *set* in English inside it.

**Two engine observations on this page** (it is two sentences and an empty directive, the shortest
the edition has):

- **Refusals.** 5 of 11 attempts across both runs were refused by the structural-parity guard, all
  with `directive count differs: source has 1, output has 0` — the page's only directive, the
  empty `{tableofcontents}`, missing. That is consistent with action-translation#203's
  whole-document fence wrap (the scan misses the first directive), but with one directive the
  report cannot tell a wrap from a dropped block, and refused output is not kept (#364).
- **Front matter dropped in 4 of 6 drafts.** No check catches it: the parity guard counts
  directives, headings and anchors, not front-matter keys. None of the six `pandas` drafts drawn
  the same day lost theirs. A deterministic restore of the source's non-`translation` front matter
  would close it.

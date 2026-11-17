# Arm: round 7 (`python_essentials`) — three draws at v0.33.0, chosen by lint, 2026-11-17

These are the round-7 calibration seed drafts for lecture-python-programming.ml, sent as lecture-python-programming.ml#65 (review issue ml#33). Round 7 followed the merge of round 6 (ml#58) and of round 6's one engine change, the capital repair (#468).

- **How they were made.** Three drafts at v0.33.0 (`d68f54d` = `@v0`, glossary v0.8.0 with 93 terms, the 28 ml rules), each made with `init -s <English> -f python_essentials.md --localize none -m claude-sonnet-5`. They were drafted from a git clone of lecture-python-programming at `426fb42`, where `python_essentials.md` last changed in `c571121`, so the state file records `source-sha: c571121`. The CLI ran from a scratch worktree of the tag with its own `npm ci`. All three came back on the first attempt; none was refused.
- **`checks.jsonl`** holds the per-draw checks, before repair. It is in the schema of the earlier arms, written by `arms/2026-10-19-round5-gate-pandas-v0.29.5/checks.py`, with `ml_metrics` and the glossary at `bffad74` and the verbatim check from the v0.33.0 build. Two fields are added:
  - `front_matter_identical`;
  - `ml_repair_bffad74`, the repairs `ml_repair` at `bffad74` would make.

| Draw | Structure | Bare before a cell | `-ഉം` without comma | Repairable splices | Lowercase openers | Left after `ml_repair` |
|---|---|---|---|---|---|---|
| 1 | identical | 44 | 14 | 11 | 1 | banned `explicit ആയ` (500), watch `വിവിധ`, 2 unpunctuated lines |
| 2 | identical | 43 | 11 | 10 | 3 | plural `mode-കൾ` (421), watch `വിവിധ`, 2 lowercase bullets, 2 unpunctuated lines |
| **3 (sent)** | identical | 42 | 6 | 9 | 3 | 2 lowercase bullets and 2 unpunctuated lines, all as in the English |

"Structure identical" means front matter, headings, 85/85 code cells and 12/12 exercise-family blocks byte-identical to the English.

**Why draw 3.** After the repairs it was the only draw with no banned rendering, no plural and no watch hit. Its four remaining lint lines mirror the English: 431 and 717 are unpunctuated, as are the English's 415 and 706, and 641 and 643 are bullets that open with *for example*, lowercase in the English too. They were left for the editor and disclosed.

**Pinned-term retention** reports a FAIL on every draw: `Python 31->30` and `returns 2->1`, and on draw 2 also `set 4->3`. The gate counts a pinned term's occurrences without regard to sense, and it fails on every one of the editor's reviewed pages too, so it was not used to choose a draw. On draw 3:
- The missing *Python* is the English's repeated "Python provides numerous other built-in Python data types" rendered with one *Python*. No sentence is dropped: every English paragraph aligns.
- One *returns* became `return ചെയ്യുന്നു`.

**Repairs on draw 3:** 58 on 51 lines, disclosed line by line on ml#65:
- 42 colons;
- 9 sentence splits;
- 6 `-ഉം` commas, one of them before a bracket (194, `Tuples-നെയും, (lists-നെയും)`), which was put to the editor;
- 1 capital (407).

**The bare-ending mode.** All three draws left 42–44 lines bare before a code cell. The English leaves 48 of its 60 lines before a code cell unpunctuated, and the drafts copied it. Round 4's `numpy` showed this mode varying between draws (37 / 34 / 3); on this lecture it showed in every draw.

**The *focus* watch** (#468) did not fire on any draw. The site, line 25 of the English ("with a focus on examples"), came out as `examples-ൽ focus ചെയ്തുകൊണ്ട്` in all three, keeping *focus* in English as the editor did on `intro`.

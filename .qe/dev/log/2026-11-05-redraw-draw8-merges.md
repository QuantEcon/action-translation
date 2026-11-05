# 2026-11-05 — the French redraw, what draw 8 was, and five merges

**Trigger**: 2026-11-04's plan, continued. Matt approved the French redraw that #363 asks for
(24 draws, about USD 3.60), then a capture run (8 draws, USD 1.32) to see the shape of its
refusals. The open whole-document and rebase PRs then merged in order: #421, #422, #423, #424.

## The French redraw (#363), at #421's `aaefcab`

`claude-sonnet-5`, default localisation, English lecture-python-programming@`85586e6`, 12 draws
per lecture:

| Lecture | Delivered | Wrapped | Unwrapped, then delivered |
|---|---|---|---|
| `python_essentials` | 10 of 12 | 10 | 8 |
| `python_oop` | 8 of 12 | 4 | 0 |
| Both | 18 of 24 (v0.29.4: 3 of 23) | 14 | 8 |

`rate-check.sh` still reads FAIL for both cells, by its one-refusal threshold. The six refusals
had #363's signature and no unwrap, and the run kept no refused responses (#364).

## The capture, and what draw 8 was

8 `python_oop` draws from a scratch build that saved each raw response before the unwrap: one
closed wrapper (unwrapped, delivered), draw 8, one draw that dropped its front matter and anchor
(#326's defect, refused for the anchor), and five plain drafts.

- Draw 8 was first read as a wrapper never closed, and `a18fe02` (in #421) made condition 4
  remove only the first line when removing both leaves the walk open. **It was not a wrapper.**
  The model wrote a bare fence in place of the front matter's opening `---`, and its last line
  is the document's own closing fence after `{solution-end}`.
- Removing that first line leaves the front matter without its opening line, which parity does
  not see. `init` at #421 alone writes it under a `translation:`-only front matter, with
  `jupytext :` and `kernelspec :` below as body text (French spacing applied), so MyST-NB would
  drop every code cell. At `aaefcab` the draw was refused.
- Found while rebasing #422, after #421 had merged. No deployed workflow runs `main` (13 pin
  `@v0` = v0.30.0, 2 pin `@v0.16.1`), and #422 merged the same day. #422 writes the source's head
  in its place, and its front-matter rule refuses the page where no H1 lets the restore run. A
  unit test and an init test pin the shape. #421's description and results comment were
  corrected in place.
- The replay that cleared `a18fe02` checked that the output passed the guard, not what was
  written. A replay of a head-region change should read the written head as well.
- The six refused redraw responses carry draw 8's guard message, so they likely had its shape.

## #422: rebased, plus the fence rule

- Rebased onto `main` after #421's squash merge (only #422's own commit replayed; the
  `CHANGELOG.md` conflict kept both sides).
- **`checkFenceEnd`** in `checkWrittenDocument`: an output whose fence walk ends open when its
  source's does not is refused, naming the line that opened the fence. A ```` ```text ````
  wrapper the unwrap declines is closed by the first bare fence in the document; when that is a
  `{raw}` pre-title's, the head restore removes the wrapper's first line with the head and leaves
  its closing line last. A closing fence the model left out ends a document the same way.
  0 of the 288 edition files that have a source are refused, and all 8 captured responses pass.
- Copilot's two comments from 2026-11-04: the README's quoted summary lines now match the script
  (`8e3f558`); `HeadRestore.replaced` keeps its trim, with a comment saying why (the translator
  trims every response, so it only sets aside blank lines between the head and the H1).

## Merged 2026-11-05, not yet released

| PR | Commit | Change |
|---|---|---|
| #419 | `2ab18cd` | a section gets its document's output cap (#418) |
| #421 | `fe9700e` | the whole-document fence unwrap (#363) |
| #422 | `bd24fca` | the source's head; the front-matter and fence rules (#326, #288) |
| #423 | `2ce27b3` | rebase moves a PR branch in one step and queues its runs (#280) |
| #424 | `1c0b20b` | a PR merged from a fork needs `\translate-resync` (#415) |

#363, #326 and #288 are closed, and #203 stays open for the residual: the W5 box on #263 now says
the repair is in code, and what is left is measuring the next release's 4b cells, with the
anti-wrap prompt line or a bounded retry as fallbacks. #280 stays open for the three steps under
*After merge* in #423's description.

## Open for Matt

- **The release** carries all five. Its 4b rate check now prints `fence unwrapped` and
  `head restored` for each cell. Until it ships and `@v0` moves, the editions run the old
  rebase: merge zh-cn#308/#310/#311/#312 one at a time, or pause `rebase-translations.yml`.
- **#280's closing steps**, after the release: confirm GitHub accepts `queue: max` on a harness
  target (a narrow harness run, billed), patch the seven editions' `rebase-translations.yml`,
  then the back-to-back merge test.
- Carried from 2026-11-04: lecture-python-intro#845's resync; the #414 ruling; ml#58's two
  suggestions, not applied; #420 has no PR.

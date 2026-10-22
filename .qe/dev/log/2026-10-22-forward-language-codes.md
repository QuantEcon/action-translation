# 2026-10-22 — #348: forward resyncs carry the edition's glossary and rules; zh-cn recovered and published

**Trigger**: after v0.30.0, Matt asked to work through the next tasks together. They were the
lecture-python.zh-cn delivery that #408 unblocked, with a review of human edits in the resync,
and then #348, starting with a check that the issue was up to date. The session ran on Matt's
machine, with an `ANTHROPIC_API_KEY` set.

## The zh-cn delivery

- `\translate-resync` on QuantEcon/lecture-python.myst#1055, at v0.30.0, opened
  lecture-python.zh-cn#304 for `var_dmd` and `measurement_models`. lecture-python.zh-cn#303 had already
  delivered `svd_intro`, so it was dropped from the PR (`bb0a705`).
- **Human-edit review:** a blame of `var_dmd` found that the resync had replaced the 2025
  reviewers' terms. It wrote 伪逆 where they had 广义逆矩阵, 摩尔-彭若斯 where they had
  穆尔-彭罗斯, 约化 where they had 简化, and 矮胖/瘦高 where they had 短胖型/高瘦型. All were
  restored by hand in the same PR (`91f3106`). QuantEcon/lecture-python.myst#1095 shut itself on
  the successful sync.

## #348 (PR #412, `f89f061`)

- **The issue first:** its body was refreshed in place: line numbers, ml's 93 terms, the `ja`
  row, the fake-API test option, "fails on `main` before the fix", and the paragraph on blocked
  deliveries.
- **The fix:**
  - `forward.ts` passes codes at its one call site;
  - `formatGlossary` warns through `core.warning`, once per key per service instance, when a
    non-empty glossary has no term for the key;
  - `translateDocumentResync` reports `glossaryTermsSent` and `languageRulesSent`, and forward
    logs `Request carried N of M glossary terms and K <lang> rules`.
- **Tests:** `src/cli/__tests__/forward-request.test.ts` has 15 cases. It drives `resyncSingleFile`
  through the real `TranslationService` and SDK over `test-support/fake-anthropic-api.ts`, and
  checks five languages for a pinned pair, a rule's text, codes in the prose, and counts equal to
  what the request holds. `translator-prompts.test.ts` gained four warning cases. Five mutations
  were each caught: the unfixed code, the labels put back, no warning, no once-per-key guard, and
  a warning on every key. The suite has 2,131 tests.
- **Side effect:** the resync pre-flight now uses each language's own expansion factor, so fa's
  admission limit falls from about 165,300 to about 137,800 characters. The largest fa lecture
  is 80,040.
- Copilot recommended approval with no comments. The fix is not released yet; forward runs
  from a `main` build are open.

## After the merge

- **The four "forward" lectures needed no forward run.** `sir_model`, `harrison_kreps`,
  `mccall_q` and `ak_aiyagari` had been routed through `translate forward -f` and held for #348.
  A parallel session recovered three of them by 01:27Z (lecture-python.zh-cn#301,
  lecture-python.zh-cn#302), and
  `ak_aiyagari` was already current. That was about three hours before this session rewrote
  lecture-python.zh-cn#298's body at 04:41Z, still routing them through `forward`.
  `translate status` read 150/150 aligned, and the issue's body was rewritten to the current state at
  05:40Z. **Lesson:** before acting on a tracker's routing, sweep the target repo's PRs merged
  since the tracker's last edit.
- **`sir_model`'s reviewed wording** (2025: yuki, Humphrey Yang) was lost in
  lecture-python.zh-cn#302 and restored in lecture-python.zh-cn#305 (`86b86e5`).
  - **The rule, from a blame:** restore reviewed-era lines whose English did not change, and keep
    the sync's text for lines that the July forward resync (lecture-python.zh-cn#151) had written.
  - Also made consistent: the state names, and the plot labels, which are Chinese throughout now.
  - The engine evidence is on #295: an unchanged `###` subsection was regenerated with its
    changed `##` parent.
- **Published** as `publish-2026oct22` (Matt) and checked on the live site:
  - the publish log has no failed notebook;
  - within six minutes of the deploy the CDN served all 150 pages from it (every
    `Last-Modified` 06:16:37 GMT), so the 10-minute `max-age` wait was not needed;
  - `check-tofu --site` (QuantEcon/project-translation `bin/check-tofu`) found no missing
    glyphs;
  - the whole-site check was clean: 150 of 150 ToC lectures have pages, the 19 part captions
    are the ToC's Chinese ones, and no page shows an execution error.

  lecture-python.zh-cn#298 is closed.
- **Tracker #349** was re-stamped at 2026-10-22 17:20 AEDT with #280 next, and got a
  revision-log comment. #280 got the fifth and sixth instances (lecture-python.zh-cn#294 and
  lecture-python.zh-cn#296).

## Open, for Matt

- **When to release #348.** No hurry: the CLI runs from `main`, and the Action gains only the
  zero-term warning.
- **#295's preserve rule:** decide whether it moves up the plan. Section regeneration rewrote two
  more reviewed lectures' wording today.
- **zh-cn glossary pins** for `var_dmd`'s reviewed terms, and `svd_intro`'s 伪逆 to align with
  them (open since lecture-python.zh-cn#304).
- **The July forward wave:** lecture-python.zh-cn#151 dropped 26 of `sir_model`'s 47 reviewer
  lines, and other lectures forwarded that week may have lost the same. An audit belongs with
  #154.

## Traps met

- zsh does not word-split an unquoted `$VAR`: five SHAs arrived as one argument, and a blame
  script reported zero human lines. Use `${=VAR}`, or pass the arguments one by one.
- `grep` reads the `$` in `$S$` as an anchor: use `grep -F` for literal math.
- A masking placeholder made of a letter (`R` for a role) matched real text (`NBER工作`): use a
  control character.
- `grep -oE` with alternatives over multibyte text miscounted terms here: read the diff.
- A scratch clone made with `--no-checkout`, or a sparse one, has an empty or partial working
  tree, and `translate status` then reads every lecture as `SOURCE_ONLY`.
- `newton_method`'s traceback on the zh-cn site is deliberate (`raises-exception`): a site check
  must not count it as an execution failure.

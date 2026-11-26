# 2026-11-26 — Matt's rulings after the stack, and their first PRs

**Trigger**: after the overnight stack merged (log `2026-11-26-overnight-stack-merge`), Matt
asked this repository's organiser session (`mini:action-translation`, on qe-mini1) to put its
open questions to him one at a time, with context and a recommendation. He took each
recommendation.

## Rulings (@mmcky, 2026-11-26)

1. **#477: fix now, by a reason** (`D-2026-11-26-a-model-reported-diff-failure-gates-by-a-reason`).
2. **The fr heal before `@v0`** (#324): the laptop session opens the edition PR from a brief by
   this session, which verifies it read-only.
3. **#290's harness exercise is folded into release step 4a**, by a harness fixture PR.
4. **v0.34.0** carries the stack once #477's fix and the #290 fixture merge; the tag and each
   billed step still need Matt's own go, and `@v0` moves only after the fr heal merges.
5. **The docs deploy on Node 24, now**: #485.
6. **The action-family package** (SECURITY.md, Dependabot, CODEOWNERS, topics, a `uses: ./` CI
   job): planned now, built after v0.34.0.
7. **#463's look-back**: gathered and drafted for Matt; handed to `mini:project-translation`
   (below).
8. **Follow-up issues** from the stack's reviews: about four grouped drafts, for his review.
9. **No merge waits on a Copilot review**: #486 (`D-2026-11-26-no-merge-waits-on-a-copilot-review`).
10. **#470** (QEP-2 v2): after v0.34.0, with the family package.
11. **The two zh-cn edition leftovers**: issues in QuantEcon/project-translation; handed over too.

## What landed

- **#485** (`742101b`): `deploy-docs.yml` on Node 24 with `mystmd@1.14.0` pinned. mystmd 1.13.0
  (2026-11-12) began to require Node >= 22, and the unpinned install had failed all 18 builds
  since 2026-11-15. The deploy run on the merge succeeded, the first since 2026-11-12.
- **#486** (`8581eb1`): `AGENTS.md`'s review-comments section, and the Copilot record.
- **#487** (#477): a model-asserted diff check that is not strictly `true` adds the reason
  `model-asserted check failed: <check>`. A Fable review reproduced the false `auto-merge` on
  `main` through `reviewPR` in shadow mode (20 or 25 minor findings, either model check, a
  two-file PR) and found it fixed at the head; two surviving mutants got tests.

## Edition and program work moves to `mini:project-translation`

The same evening Matt set up `mini:project-translation`, the organiser for
QuantEcon/project-translation, and said (relayed by the PR organiser): "Then we can ask
mini:action-translation to handover any work that is not directly action-translation work to
mini:project-translation". Handed over: #463's look-back, the two zh-cn leftovers, #325's
`<style>` repair in the fr edition (after v0.34.0 reaches `@v0`, on this session's word), and
the edition context. This repository keeps the engine: releases and their prerequisites, and
engine issues. An engine defect found in an edition comes back here.

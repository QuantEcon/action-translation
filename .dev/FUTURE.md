# FUTURE: Feature ideas

**Created**: 2026-07-05. Each idea is documented well enough to revisit and iterate on later.
When an idea is scheduled for building, expand it into phases and move it to
[PLAN.md](PLAN.md); if rejected, record why in a [decisions/](decisions/) file and delete the
section here.

Template per idea: **Status / Summary / Motivation & evidence / Design sketch /
Open questions / Effort / References**.

---

## 1. Auto-merge with quality threshold + editor digest

**Status**: Designed (spec below is the surviving Stage 2 of the issue-#63 fix); prerequisite
(rebase-on-merge) shipped in v0.15.0 and is deployed.

**Summary**: Automatically merge translation PRs whose review score clears a configurable
threshold, and replace per-PR review with a periodic digest issue that editors audit.

**Motivation & evidence**: Review latency is the program's binding constraint — it *caused*
the #63 conflict pile-ups (62% of PRs conflicted on lecture-python-programming.fa), and the
#63 analysis explicitly recommended auto-merge + digest as the workflow fix; only the
conflict-mechanics half (rebase-on-merge) was built. Most translation PRs score well on
review (~80–90% per the #63 discussion). Without rebase-on-merge auto-merge was a race
condition; with it shipped, auto-merge is now safe and purely a productivity feature.

**Design sketch** (from the #63 design record — git history: `dev-notes/FIX-ISSUE-63.md`;
decision context: decisions/D-2026-04-01-rebase-on-merge.md):

- New sync-mode inputs, off by default:
  `auto-merge: true`, `auto-merge-quality-threshold: 9` (1–10),
  `auto-merge-labels: "auto-merged"`, `auto-merge-digest: weekly|monthly|none`,
  `auto-merge-digest-assignees: <users>`
- Flow: sync creates PR → review mode runs automatically → score ≥ threshold **and** no
  structural issues → approve + merge + label `auto-merged`; below threshold → stays open,
  label `needs-review`
- Digest: a scheduled `mode: digest` run opens a periodic issue — count of auto-merged PRs,
  table of PR / source PR / files / scores / reviewer warnings, assigned to editors,
  labelled `translation-digest`
- Safeguards: opt-in per repo, conservative default threshold, structural-issue veto
  regardless of score, label tracking for audit, digest assignees for accountability

**Open questions**: Should the structural veto be the Phase-2 `validateMyST`/myst-lint result
(strongly suggested — don't auto-merge what a deterministic check can't pass)? Does auto-merge
need the machine-user identity (#61) first so merges aren't attributed to a person? Threshold
calibration — use the 24-PR human evaluation set (#4) as the baseline?

**Effort**: M (auto-merge) + S (digest mode).

**References**: issue #63 (analysis + recommendation), decisions/D-2026-04-01-rebase-on-merge.md,
PLAN.md Phase 4 (review-mode fixes are prerequisites — per-file evaluation, NaN guards).

---

## 2. Per-language model & translation-policy configuration

**Status**: Forced by the language scale-out; partially designed in issue #70.

**Summary**: Let each target language specify its own model (e.g. Opus for low-resource
pairs), glossary policy (translate / transliterate / keep-English), and prompt rules —
instead of today's single global `claude-model` input and uniform glossary semantics.

**Motivation & evidence**: en→ml is a genuine low-resource generation cliff (issue #70:
GPT-4 chrF 28.4 vs specialist NMT ~66); the native-reviewer decision was a
**keep-English-dominant** policy carried by `language-config.ts` prompt rules, with a
per-language Opus default named as a follow-up in PR #71. Meanwhile fr (#68) and ja (#69)
glossaries are blocked partly because a glossary alone doesn't enable a language — the
`LANGUAGE_CONFIGS` entry is the real switch, which is exactly the kind of per-language
config this idea makes first-class. `VALID_MODEL_PATTERNS` staleness (PLAN Phase 4) is the
same problem from another angle.

**Design sketch**:
- Extend `LanguageConfig` with optional `defaultModel`, and resolution order:
  action input `claude-model` (explicit) > language default > global default
- Add `claude-opus-4-8`/current-generation IDs to the allowlist or drop pattern validation
- Per-language glossary policy field (the deferred `treatment` schema from #70) only if the
  ml calibration shows prompt rules alone are insufficient — v1 stays zero-schema-change
- Document per-language cost implications (Opus vs Sonnet) in the language-config docs page

**Open questions**: Is model choice per-language or per-(language × mode) — review could stay
on a cheaper model than translation? Where does the reviewer's model come from (today it's
hardcoded separately, `src/reviewer.ts:28`)?

**Effort**: S–M.

**References**: issues #70, PR #71 follow-ups, PRs #68/#69 Copilot comments,
memory: ml keep-English policy.

---

## 3. `translation-sync-metadata` as a versioned public contract (issue #66)

**Status**: Requested, undesigned beyond the issue; internal consumer (rebase mode) already
depends on it.

**Summary**: Promote the machine-readable JSON block in translation-PR bodies to a stable,
versioned, documented contract that downstream tooling can build on.

**Motivation & evidence**: QuantEcon/action-weekly-report (QuantEcon/meta#313) wants to roll
up "N upstream changes → M languages" from these blocks. The schema already exists
(`src/pr-creator.ts:44-54`) but has no `schemaVersion`, no docs page, and ad-hoc optional-field
evolution (`targetBaseSha` backfill, `type` defaulting).

**Design sketch**: add `schemaVersion: 1`; write `docs/developer/translation-sync-metadata.md`
(fields, invariants, the `action-translation` label and `translation-sync-` branch prefix as
stable identifiers, breaking-change policy = bump major); keep parser tolerant of unknown
fields.

**Open questions**: Settle **ARCHITECTURE.md Q3 first** — if rebase state moves into
`.translate/` on the PR branch, the PR-body block becomes a *read-only summary* for external
consumers, which is a much safer thing to freeze. Also sequence after the rebase-mode
input-validation hardening (PLAN Phase 1.5) so the documented contract rests on validated
inputs.

**Effort**: S.

**References**: issue #66, the #63 design record for the original schema (git history:
`dev-notes/FIX-ISSUE-63.md`), ARCHITECTURE.md R2/Q3.

---

## 4. Deterministic MyST structural lint

**Status**: Repeatedly promised (issues #4, #5 → QuantEcon/meta#268), never built.
PLAN Phase 2 implements the minimal in-process version; this idea is the full tool.

**Summary**: A deterministic (no-LLM) structural checker for translated MyST documents,
run between Claude output and commit, and available standalone (`translate lint`).

**Motivation & evidence**: The recurring bug family — one unseen MyST construct at a time
getting silently mangled (#5 malformed headings, #6/#40 pre-title anchors, #49 CJK spacing,
#50/#54 roles in heading-maps, #65 dropped anchors) — plus the review finding that
`validateMyST` validates nothing. Every one of these would have been a loud failure with a
structural gate.

**Design sketch**: checks = balanced code fences; `$$` pairing; directive open/close pairing
(`exercise-start`/`exercise-end` etc.); label-anchor set equality between source and
translation; heading count/level shape vs source; code-cell count equality; frontmatter
schema. Emit machine-readable findings (reuse the CLI report shapes). Wire as: (a) the sync
pipeline gate, (b) the structural veto for auto-merge (idea 1), (c) a CLI command for target
repos' CI.

**Open questions**: Build on **mystmd's own TypeScript parser** rather than our regex layer?
mystmd is TS/JS, gives a real AST, and matches the future builder (ARCHITECTURE.md Q2) —
strong synergy, but adds a dependency and pins us to its dialect. Should target repos run it
in their own CI (catching hand-edit breakage too)?

**Effort**: M standalone; S if PLAN Phase 2's checks are just exposed as a command.

**References**: QuantEcon/meta#268, issues #4/#5/#65, ARCHITECTURE.md R1/Q2.

---

## 5. Correction-capture review CLI (issue #55)

**Status**: Proposed with real reviewer evidence; no design decisions yet.

**Summary**: `translate review` extension (or sibling command) for interactive accept/edit/flag
review of the three element types AI translation most often gets wrong — code comments,
figure/axis labels, `\text{}` inside math — writing corrections back to the target and feeding
flagged terms into the glossary.

**Motivation & evidence**: Originated from HumphreyYang's reviewer findings; these elements
are invisible in prose-level review but break rendered lectures. Captured corrections are
also the raw material for the feedback loop (idea 6 shares this goal for non-developers).

**Design sketch**: extract reviewable elements per file (parser already isolates code cells
and math); walk them in the existing ink review UI; on accept/edit, patch the target file;
on flag, append to a glossary-candidates file (draft-then-native-review workflow, as used for
ml/fr/ja). Reuse `review-session.ts` state machine.

**Open questions**: scope — target-repo-local edits vs PRs? How do corrections feed prompts
(few-shot examples per language?) vs glossary terms? Priority relative to idea 6 (recommend:
this first — smaller, developer-audience, same data model).

**Effort**: L.

**References**: issue #55, issue #4 (reviewer findings), memory: glossary draft-then-review
workflow.

---

## 6. Reviewer web app — side-by-side annotation (issue #56)

**Status**: Idea + companion RA-project sketch; MVP unscoped.

**Summary**: Dual-pane source/target web editor for **non-developer** native-speaker
reviewers: annotate, correct, and submit — the app turns submissions into PRs via the GitHub
API and logs structured corrections as a training/eval signal.

**Motivation & evidence**: Per-language native reviewers are the established pattern
(HumphreyYang for zh-cn/fa; Adisankar for ml), but they currently need GitHub + local
tooling. Review capacity is the bottleneck (see idea 1); lowering the barrier for reviewers
scales it. The RA-projects design (docs/projects + memory) already frames this as a
gamified data-collection opportunity.

**Design sketch (MVP)**: read-only paired rendering first (source | target, section-aligned
via heading-maps); then inline target editing producing a single PR per session; corrections
logged as `{file, section, before, after, category}` JSONL. Auth via GitHub OAuth;
static-hosted SPA + minimal API. Defer: scoring, leaderboards, prompt feedback.

**Open questions**: hosting/ownership (QuantEcon org infra?); does it read heading-maps from
`.translate/` (argues for ARCHITECTURE Q3 consolidation); relationship to idea 5's data model
(should share the corrections schema).

**Effort**: XL — treat as an RA project with its own plan.

**References**: issue #56, memory: RA projects design, issue #55.

---

## 7. Prompt caching + real token counting

**Status**: Unexplored; pure cost/latency win.

**Summary**: Restructure prompts so the static prefix (system rules + language rules +
glossary — easily several thousand tokens) carries a `cache_control` breakpoint, and replace
the chars/4 heuristic with the `count_tokens` API.

**Motivation & evidence**: A sync run issues dozens of sequential calls per language with an
identical prefix; cached input tokens are ~10× cheaper. `estimateOutputTokens`
(`src/translator.ts:40-64`) guesses chars/4 with a 2000-token buffer and drives both the
32768 "API maximum" rejection and `max_tokens` sizing — miscalibration causes both H2-class
truncation and false "document too large" rejections.

**Design sketch**: order prompts static-first (rules + glossary, then document content);
add `cache_control: {type: 'ephemeral'}` on the static block; measure hit rates in action
logs; use `count_tokens` before full-document calls to pick `max_tokens` and split decisions.
Do after PLAN Phase 6's shared client exists (one place to implement).

**Open questions**: none blocking — measure and ship.

**Effort**: S (after Phase 6).

**References**: PLAN Phase 6, review finding on `checkDocumentSize` (PLAN Phase 4).

---

## 8. Config-driven CLI defaults from `.translate/config.yml`

**Status**: Half-built; the config file exists precisely for this and is mostly unread.

**Summary**: Make `translate` commands resolve `target-language`, `docs-folder`, glossary
path, and source repo from the target repo's `.translate/config.yml`, so per-repo flags
become unnecessary.

**Motivation & evidence**: `config.yml` was designed "so CLI flags don't need to be repeated"
(`src/cli/types.ts:289-297`), but only `source-language` is resolved from it; `-l` silently
defaults to `zh-cn` and `-d` to `lectures` — a live trap for the new ml/fr/ja repos where a
forgotten flag targets the wrong language.

**Design sketch**: resolution order flag > config > error-if-ambiguous (not silent default);
`translate doctor` validates config completeness; `setup`/`init` write complete configs.

**Effort**: S.

**References**: review CLI findings; PLAN Phase 3 (state semantics).

---

## 9. Cross-model (GPT) second reviewer (issue #2 remainder)

**Status**: Mostly superseded — Claude review mode shipped v0.7.0; the unbuilt remainder is
specifically a *second, non-Anthropic* opinion.

**Summary**: Optional second review comment from a non-Claude model on translation PRs, as an
independent-perspective check on the Claude reviewer.

**Motivation & evidence**: mmcky's GPT-5 evaluation matrix over 16 test PRs was useful
(issue #2 discussion); an independent model catches shared-blind-spot errors, relevant once
auto-merge (idea 1) raises the stakes of a single reviewer.

**Design sketch**: `reviewer-model-2` input + second API key; post as a separate comment or a
combined table; disagreement above a delta flags `needs-review` even if the primary score
passes.

**Open questions**: worth a second API dependency and secret in every workflow? Cheaper
alternative: two diverse Claude prompts/models (e.g. Opus adversarial pass). Decide after
auto-merge lands and real disagreement data exists.

**Effort**: M.

**References**: issue #2.

---

## 10. Scheduled backward analysis (carried from previous plan, "Phase 8")

**Status**: Designed at task level in the 2026-03 plan (git history: `dev-notes/PLAN.md`);
unscheduled.

**Summary**: Monthly GitHub Actions workflow running `translate backward` + `status` per
target repo, storing the report as an artifact and notifying maintainers (tracking-issue
comment or Slack); maintainers run `translate review` locally on the downloaded report.

**Motivation & evidence**: Backward analysis only has value if it runs; today it requires a
maintainer remembering to run it. Auto-PR creation was deliberately scoped out (human review
via `review` stays).

**Effort**: S — blocked on PLAN Phase 3 (backward's skip predicate is currently inverted, so
scheduled runs would silently analyze nothing).

**References**: 2026-03 plan Phase 8 (git history: `dev-notes/PLAN.md`); PLAN Phase 3.

---

## 11. Python/`rich` CLI rewrite (carried from previous plan)

**Status**: Documented fallback, explicitly conditional — not planned.

**Summary**: If ink rendering proves insufficient for MyST review (math, directives,
side-by-side diffs), port the entire CLI (~3,600 lines) to Python with `rich`/`textual`,
publish to PyPI; the action stays Node.

**Trigger conditions** (from the original write-up): ink rendering gaps actually blocking
reviewers; a team decision to maintain the CLI in Python long-term; stable CLI interfaces and
JSON schemas (now true). Revisit only if idea 5's richer review UI hits ink's limits.

**Effort**: XL.

**References**: 2026-03 plan, "Future: Python Rewrite with rich" (git history:
`dev-notes/PLAN.md`; includes the module inventory). Decision context:
decisions/D-2026-03-04-ink-over-rich-cli.md.

---

## 12. Smaller carried-forward backlogs

Kept as one section; promote items individually if they become real.

- **Review-command UX polish** (2026-03 plan): scroll viewport; truncate long before/after
  blocks with expand; syntax highlighting (cli-highlight); MyST-aware card rendering;
  word-level inline diff.
- **Prompt-tuning pass** (2026-03 plan): Stage-1 triage precision (flagging rate ~67% vs
  target 5–10% — high recall, poor precision); Stage-2 noise reduction; RESYNC preservation
  quality; re-run the validation set after each change. Pairs with prompt versioning
  (ARCHITECTURE.md R7) so tuning is measurable.
- **Error-handling hardening** (2026-03 plan): missing source/target files; API timeout/rate
  limit; invalid heading-map; oversized documents; graceful degradation with warnings.
- **Digest of dropped-anchor damage** (issue #65 follow-up): one-off scan of past translation
  output for silently dropped `(label)=` anchors across zh-cn/fa repos.

# Ready-to-file issue set: tracking issue + 7 phase sub-issues

Prepared 2026-08-10. File the tracker first, then the phases as its sub-issues
(GitHub: tracker → "Create sub-issue"). Per QEP-0002, the tracker and phase issues
are structure, not work — no Type label. Member issues are task-listed inside each
phase so their open/closed state renders as progress; when native sub-issue nesting
is preferred, add each member issue as a sub-issue of its phase instead.

═══════════════════════════════════════════════════════════════════════
## ISSUE 1 of 8 — the tracker
**Title**: Work plan — 2026-08-10 backlog review: all 67 open issues triaged, fix-status verified against v0.25.0 (supersedes #94, #198)
**Type**: Task · **Labels**: none (tracking parent)

**Body**:

Tracking issue for the 2026-08-10 review of **all 67 open issues**, verified against `main` @ v0.25.0 (`3db2f9f`). Every issue was read in full; bug claims were checked against the current source, `CHANGELOG.md`, and comment threads (several issues carry status-changing comments their bodies don't reflect). Labels follow [QEP-0002](https://quantecon.github.io/qeps/qep-0002-standard-github-labels/) (software set). This is a tracking parent and carries no Type label; the work phases are sub-issues.

### The finding

The backlog has one dominant failure shape, named by #90 and re-confirmed by every production incident since: **the failure path produces a success-shaped artifact.** Files declared in sync metadata but never delivered (#90.3 / #156 / #222 / #256 — five field instances, the latest on v0.25.0, 2026-08-10); unbuildable PRs shipped after the run logged its own errors (#156); localisations silently overwritten and served to readers for 17 days (#254) or as tofu for months (#182); runs that never start and never say so (#234).

The ordering keeps the doctrine #94 validated: **decisions and external clocks first; detection before repair; foundations before dependents.**

### Verified status changes (issues whose bodies are stale)

| Issue | Verified against v0.25.0 |
|---|---|
| #89 | **Done in substance** — `action.yml` node24, esbuild target node24, `engines >=24`, `@actions/core` 2.0.3 + `@actions/github` 8.0.1, `npm audit --omit=dev` = 0. ESM-only 3.x/9.x residual = #177 F35's trigger. → close |
| #90 | Defect 1 substantially fixed (v0.17.0; verification pass left), defect 2 resolved (#137). **Defects 3–5 live as a class**, with a correction: the four `index.ts` fetch sites are already fail-closed (`:525` collects into `fetchErrors`, `:533–535` throws before any branch reset; `:1097/:1158/:1190` → `result.errors` → run fails + failure issue). The live gaps are (a) drops that record **no error at all** — the fresh 2026-08-10 repro (lecture-python-programming.fr#29) reported success — and (b) a partial PR still ships when the error set is non-empty (`index.ts:902`) |
| #256 | Defect 3 (`.bib`) expected fixed by #117's backfill in v0.25.0 (failing batch ran 0.24.0) — verify on next organic batch. Defects 1/2/4/5/6 live |
| #134 | `writeConfig` half fixed (#246); the Phase-4 asset clobber is live (`init.ts:495` unconditional `copyNonMarkdownFiles`) |
| #118 | Forward now runs `checkStructuralParity` post-finalize (`forward.ts:384`) — the 2026-07 fence-wrap would be refused; residual = title-sanity check |
| #253 | Confirmed: `grep -c findTargetLocalReads dist-action/index.js` = **0**; guard wired into `forward` only |
| #230 | Confirmed: `PRICING` in `scripts/glossary/lib.mjs:56` lacks `claude-opus-5`, falls back to `{in: 0, out: 0}`; `VALID_MODEL_PATTERNS` also lacks it |

### The phases (sub-issues)

| Phase | Priority | Gate |
|---|---|---|
| W0 — decisions, closures, S-size fixes | this week | none |
| W1 — v0.26.0: make partial delivery loud | **P0** | land #169 first/alongside (`index.ts` at 0% coverage) |
| W2 — localisation becomes deterministic | P1 | D1 font-mechanism decision; #172 choke point |
| W3 — reviewer, deterministic half | P1 | parallel with W2 |
| W4 — reviewer, prompt batch | — | shadow-freeze lift (~2026-09-01) |
| W5 — CLI hardening | P2 | D2 |
| W6 — scheduled debt (Wave 2, eval set, cleanup) | P3 | capacity |

### Dependency spine

```
D1 (font mechanism) ──► W2 (scope: #178/#141 live or die here)
D2 (sync first-translate?) ──► W1 wording + W5 TOC insertion
D3 (bot identity) ──► #61 execution; #221 closes
#169 ──► W1 (test the code W1 edits)
#172 ──► W2 transforms (one home, not five sites)
#171 ──► #90.1/.4 closure
W1 (error set) ──► W3 reachability + review input
shadow window ──► W4
#82 baseline ──► any future DEFAULT_CLAUDE_MODEL change
```

### Close-candidates

- **#89** — done (table above) · **#94, #198** — superseded by this tracker · **#221** — closes when D3 is recorded · **#250** — answer feeds W4's #249 rules

### QEP-0002 label migration (repo level)

- Retire `testing` (`#5319E7`): #240 → `bug`, #229 → `bug`, #189 → tracker (no Type); then delete the label
- Recolour `maintenance` `#1D76DB` → `#fbca04` (rename-in-place keeps history)
- Install missing core labels (`discuss`, `do-not-merge`, `duplicate`, `wontfix`, automation greys) + `refactor` (software extension)
- Per-issue relabels: #169–#175 → `refactor`; #103/#155/#205/#221 → `discuss`; #89 → `infrastructure`; `high-priority` only on the outliers (#90, #156, #182, #222, #234, #253, #254, #256)

Full report: `.dev/log/2026-08-10-issue-review-workplan.md` on branch `claude/action-translation-issues-review-p8meei`.

═══════════════════════════════════════════════════════════════════════
## ISSUE 2 of 8 — W0
**Title**: W0 — decisions, closures, and S-size fixes (this week, no release)
**Type**: Task

**Body**:

Sub-issue of the 2026-08-10 work-plan tracker. Everything here is a decision, a closure, or an S-size fix; none of it needs a release, and three decisions gate the later phases.

**Decisions** (record each as a `.dev/decisions/` file):
- [ ] **D1 — global font mechanism** (editions-level). Decides the fate of #178 (unnecessary if global) and #141's injection half; scopes #182 (becomes the whole remaining job). Context: #178's 2026-07-24 comment and the CJK font review.
- [ ] **D2 — may `sync` first-translate a target-missing lecture?** (#222). Recommend **no**: apply what it can, report the gap explicitly, leave seeding to `init`. If yes, the escalation must insert the `_toc.yml` entry (#142's algorithm) and disclose first-translations in the PR body.
- [ ] **D3 — bot identity** (#61/#221). Recommend the `quantecon-services` machine user (no gate change anywhere); a GitHub App needs an allowlist in ~17 files. #221 closes when recorded.

**Closures**:
- [ ] Close #89 (done in substance; ESM-only `@actions` 3.x/9.x residual is #177 F35's trigger)
- [ ] Close #94 and #198 as superseded by the tracker
- [ ] Verify #256.3 (`.bib`) fixed by v0.25.0's #117 backfill on the next organic batch; tick it off in #256

**Label migration**: per the tracker's QEP-0002 section.

**S-size fixes** (safe any time):
- [ ] #230 — add `claude-opus-5` to `PRICING` (`scripts/glossary/lib.mjs:56`) and `VALID_MODEL_PATTERNS` (`src/models.ts`); warn on unknown model instead of pricing at zero
- [ ] #116 — trailing newline in the forward write path
- [ ] #234 (item 4) — align the resync gate (`setup.ts:174` `contains`) with the parser (`inputs.ts:315` `startsWith`)
- [ ] #53 — add the legacy `heading-map:` deprecation warning (removal itself is W6)
- [ ] #91 — fix `docs/user/heading-maps.md` key-format claims against `cleanHeading` reality
- [ ] #7 — rename/regenerate the presentation files, or close `wontfix` if historical

═══════════════════════════════════════════════════════════════════════
## ISSUE 3 of 8 — W1
**Title**: W1 — v0.26.0: make partial delivery loud (declared-vs-delivered, TOC merge) [P0]
**Type**: Task

**Body**:

Sub-issue of the 2026-08-10 work-plan tracker. The detection layer for the silent-delivery-loss class — five production instances to date, latest on v0.25.0 (2026-08-10). All deterministic engine work.

- [ ] **Declared-vs-delivered assertion** (#90.3, #156-B, #222-B, #256.1): every `translation-sync-metadata.files` entry ends the run either changed or recorded "no change required + reason"; unexplained empty ⇒ run fails. The assertion must compare metadata against the delivered set **independently of the error plumbing**: the four `index.ts` fetch sites are already fail-closed as of v0.25.0 (`:525` collects into `fetchErrors` and `:533–535` throws before any branch reset; `:1097/:1158/:1190` feed `result.errors` via `:881`, which fails the run and opens a failure issue) — yet the 2026-08-10 fr#29 drop **reported success**, so the live drop path records no error at all. Trace and close that path as part of this item.
- [ ] **Partial PRs still ship on failure**: when `result.errors` is non-empty the run is marked failed and a failure issue opens, but PR creation still proceeds (`src/index.ts:902`). Decide and implement: annotate the PR as partial (with the "Files failed" section below) or suppress creation.
- [ ] **`_toc.yml` structured merge** (#254, #156.1, #256.2): add/remove `- file:` entries only; never write captions from source; skip entries whose target document is absent from target ∪ PR. Plus #254's deterministic caption-script assertion. Also dissolves the concurrent full-mirror coupling (#156 thread).
- [ ] **PR body from the computed set** (#256.5) and a "Files failed" section linking the failure issue (#156.2); thread the run's error set into review input (#157 gap 2).
- [ ] **State-not-response checks**: PR-create adopt-on-timeout via unique head branch (#92); rebase refuses to force-push a branch to/behind base — closes deliberately with a comment instead (#256.4).
- [ ] **Stalled-run detection** (#234): `examples/detect-stalled-sync.yml` + `translate status --stalled` + FAQ fingerprint for `action_required` runs.

**Gate**: land #169 (importable entry point) first or alongside — this phase edits `index.ts`, which has 0% test coverage. Validate with the e2e harness; watch the first organic sync after the tag moves.

Member issues: #90 #92 #156 #222 #234 #256 (defects 1/4/5) · supports #157

═══════════════════════════════════════════════════════════════════════
## ISSUE 4 of 8 — W2
**Title**: W2 — localisation becomes deterministic (after D1) [P1]
**Type**: Task

**Body**:

Sub-issue of the 2026-08-10 work-plan tracker. Every rule that must hold on every run becomes a deterministic transform, homed in #172's write-path choke point (pull it forward from Wave 2 — its Wave-3 trigger F23 fired via intro.zh-cn#285). Gated on **D1** (global font mechanism): if global lands, #178 is unnecessary, #141's injection half collapses, and #182 is the whole remaining job.

- [ ] **#253** — wire the target-local-read guard into the sync path, bundle it (plus a build-time assertion the bundle contains it — today `grep -c findTargetLocalReads dist-action/index.js` = 0), resolve same-repo raw URLs before the URL skip
- [ ] **#182** — deterministic i18n preservation: pre-write diff of target code cells; re-apply recognised adaptation lines (font registration/rcParams, LaTeX preamble/helpers, localised plot strings); `# i18n` markers stay a hint, not the signal
- [ ] **#181** — strip/report `text.usetex` for scripts LaTeX can't typeset (currently no `usetex` awareness anywhere in `src/`)
- [ ] **#217** — per-language typography rule list (fr guillemets interior NBSP; zh no-space around `——`), applied pre-heading-map per #172's placement constraints
- [ ] **#254/#255 shared predicate** — one deterministic check: a target-language file must not carry a caption byte-identical to its source (covers `_toc.yml` part captions and mystnb `caption:` metadata). Caption *translation* per D1's outcome; repair of the existing 85 is a separate hand pass
- [ ] **#141** (path half) — font-path convention detection or `--font-path` (moot if D1 goes global)

Member issues: #141 #178 #181 #182 #217 #253 #255 · structural home #172

═══════════════════════════════════════════════════════════════════════
## ISSUE 5 of 8 — W3
**Title**: W3 — reviewer: the deterministic half (no prompt changes) [P1]
**Type**: Task

**Body**:

Sub-issue of the 2026-08-10 work-plan tracker. Reviewer *prompt* text is frozen until the shadow window closes (~2026-09-01, project-translation#15); everything here is engine-side and allowed now, extending v0.23.0's `diffCheckSources` pattern.

- [ ] **#157** — cross-file reachability as a fifth deterministic diff-check: every `_toc.yml` entry and `{doc}`/`{numref}`/`{cite}` ref introduced by the diff resolves against target ∪ PR; run it in both directions (files added ⊆ reachable). Pure filesystem+regex; would have caught six dangling refs on zh-cn#202 and both directions of #222
- [ ] **#224** — exclude `# i18n`-marked lines from the code-comparison the reviewer grades (the engine writes and marks them; review reads them back as "unauthorised modification" — a false gating major on every zh-cn plotting sync)
- [ ] **#223** — finding-coordinate validation: verify a distinctive substring of `description`/`suggestion` occurs in the named `file`; re-attribute within the diff or mark unlocated
- [ ] **#251** (enhancement rider) — label writer in `src/contracts.ts`: review mode applies `editor` when it computes that recommendation; optionally label shadow `wouldAutoMerge`

Member issues: #157 #223 #224 #251 · consumes W1's error-set plumbing

═══════════════════════════════════════════════════════════════════════
## ISSUE 6 of 8 — W4
**Title**: W4 — reviewer: prompt batch (at shadow-freeze lift, ~2026-09-01)
**Type**: Task

**Body**:

Sub-issue of the 2026-08-10 work-plan tracker. One measured, pre-registered prompt change (per project-translation#15 rules) when the shadow window closes:

- [ ] **#187** — score prose criteria over changed translatable content only; mark them N/A on code/metadata-only diffs instead of gating on untouched text; add the zh-cn convention allowlist (Baidu Baike)
- [ ] **#135** — pin the report language (or add a `review-language` input)
- [ ] **#249** — findings must quote the exact offending span, name the rule/term violated, and assert direction ("X violates Y", never "X complies, but…"); plus the deterministic assist: demote `terminology` findings whose quoted span provably complies with the loaded glossary
- [ ] **#235** — feed the reviewer the heading-map format contract, or compute the heading-map check deterministically
- [ ] **#256.6** — a signal for legitimately-newer baselines (superseded-PR fold-ins shouldn't score as drift)

Member issues: #135 #187 #235 #249 · evidence preserved in #248's run records

═══════════════════════════════════════════════════════════════════════
## ISSUE 7 of 8 — W5
**Title**: W5 — CLI hardening: init/forward [P2]
**Type**: Task

**Body**:

Sub-issue of the 2026-08-10 work-plan tracker.

- [ ] **#134/#142** — `init -f`/gap-fill: copy-if-missing semantics (never overwrite existing target files), `--copy-assets` opt-in, and TOC insertion via #142's source-order algorithm (also serves D2 if "yes"). `writeConfig` half already fixed (#246); the Phase-4 clobber at `init.ts:495` is the live half
- [ ] **#106** — `forward --from-status` (consume `status --check-sync` output), content-triage fallback when state is absent, and a truthful run summary (bucket by what the pipeline did, not by triage verdict)
- [ ] **#203** — bounded retry-on-parity-failure in `init` (the guard caught a transposed document; the ask is retry before hard-fail, plus a measured failure rate)
- [ ] **F11 (from #175, pulled forward)** — read `.translate/config.yml`'s `target-language`; three commands hardcode `zh-cn`, so `forward` with no `-l` runs a French edition as Chinese, silently
- [ ] **#118 residual** — title-derivation sanity check (derived title must correspond to an actual H1); the fence-wrap class is already refused by `checkStructuralParity` on the forward path (`forward.ts:384`)

Member issues: #106 #118 #134 #142 #203 · part of #175

═══════════════════════════════════════════════════════════════════════
## ISSUE 8 of 8 — W6
**Title**: W6 — scheduled debt: Wave 2 refactors, eval set, cleanup [P3]
**Type**: Task

**Body**:

Sub-issue of the 2026-08-10 work-plan tracker. The scheduled-but-not-urgent tail; #198's "Phase 2 first or interleave Wave 2?" question resolves as **interleave** — three Wave 2 items are now load-bearing for open production bugs and were pulled into earlier phases (#169 → W1, #172 → W2, #171 → below).

- [ ] **#171** — brand `HeadingKey` (`cleanHeadingText` sole constructor): closes #90 defects 1-residual/4 structurally; the raw `.replace(/^#+\s+/, '')` sites are live at `file-processor.ts:232/:249/:425/:466/:488`
- [ ] **#90.5** — stop `injectHeadingMap` round-tripping frontmatter through `yaml.load`/`yaml.dump` (`heading-map.ts:218–233`; scalar re-typing)
- [ ] Remaining Wave 2 in audited order: #170 → #173 → #174 → #175 → #176
- [ ] **#82** — frozen eval set + committed baseline; hard gate before any `DEFAULT_CLAUDE_MODEL` change
- [ ] **#216** — harness scenario for a rename GitHub reports as delete+add
- [ ] **#53** — remove the legacy `heading-map:` fallback (after the deprecation warning ships and the estate is checked)
- [ ] **#229/#240** — fix the ml metric gates (two-sample test; root-aware/context-scoped pinned-term retention) before #189 Phase 3 graduates them into `diff-checks.ts`

Member issues: #53 #82 #90 (4/5) #169 #170 #171 #172 #173 #174 #175 #176 #216 #229 #240

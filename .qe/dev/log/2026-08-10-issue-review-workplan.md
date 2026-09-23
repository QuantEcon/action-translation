# Issue review and work plan — 2026-08-10

**Scope**: all 67 open issues on QuantEcon/action-translation, reviewed against `main` @ v0.25.0
(`3db2f9f`, 2026-08-06). Every issue was read in full; bug and maintenance claims were verified
against the current source, `CHANGELOG.md`, and the issues' own comment threads (several issues
carry status-changing comments that their bodies do not reflect).

**Labels**: classified per [QEP-0002](https://quantecon.github.io/qeps/qep-0002-standard-github-labels/)
(software repo: core 19 + `refactor`). Recommended label changes are in §2; they have not been
applied to the live issues.

**Predecessors**: #94 (2026-07-15 ordering) and #198 (week of 2026-07-27) are the two prior
work-plan issues. #94 is substantially executed (v0.17.0–v0.25.0, Wave 1 #158–#168); this
document is their successor and proposes closing both as superseded.

---

## 1. Executive summary

The backlog has one dominant failure shape, named by #90 and re-confirmed by every production
incident since: **the failure path produces a success-shaped artifact.** Files declared in sync
metadata but never delivered (#90.3, #156, #222, #256.1, four production instances, the latest
on v0.25.0 2026-08-10); unbuildable PRs shipped after the run logged its own errors (#156);
localisations silently overwritten with English and served to readers for 17 days (#254) or as
tofu for three months (#182); runs that never start and never say so (#234). None of these
failures errored where anyone was looking.

The plan therefore keeps the doctrine the repo has already validated (#94: *detection before
repair; foundations before dependents*), updated for what has changed since July:

- **The single highest-leverage change is a declared-vs-delivered assertion** in the sync path:
  every file in `translation-sync-metadata.files` must end the run either changed, or recorded
  as "no change required" with a reason — anything else fails the run. It converts the entire
  #90.3/#156/#222/#256.1 class from silent to loud, is cheap (the comparison is free), and is
  the precondition for trusting any later fix.
- **TOC handling must become a structured merge.** `_toc.yml` is currently copied verbatim from
  the source (`sync-orchestrator.ts:657`), which simultaneously clobbers localised captions
  (#254), ships entries for files the run failed to produce (#156), and couples concurrent PRs
  (#156 thread). One fix, three symptom families.
- **Two decisions gate real work and cost nothing to take**: (a) the editions-level global
  font mechanism (#178 hold — decides the fate of #178/#141 and scopes #182); (b) whether sync
  may first-translate missing lectures at all (#222). Both should be taken before the
  localisation work is built.
- **The reviewer's prompt is frozen until the shadow window closes (~2026-09-01)**, so reviewer
  fixes are sequenced deterministic-first (reachability check #157, `# i18n` filter #224,
  finding-coordinate validation #223, label writer #251) with prompt-side fixes (#187, #135,
  #249) batched for the freeze lift.

Roughly a third of the backlog needs no engineering at all: three issues are close-candidates
(fixed or superseded), ~8 are decisions/questions, and the label migration is mechanical.

## 2. QEP-0002 triage

### 2.1 Repo label-set conformance

The repo is partly migrated to QEP-0002. Remaining gaps:

| Gap | Fix |
|---|---|
| `testing` (`#5319E7`, "Testing and unlikely to merge") is not a QEP-0002 label | Migrate its 3 issues (#240, #229, #189) per the table below, then delete. QEP-0002 folds test work into `infrastructure`/`maintenance` |
| `maintenance` carries the pre-QEP colour `#1D76DB` | Recolour to `#fbca04` (rename-in-place preserves history) |
| Priority scheme | `high-priority` exists ✓; no `medium-priority` — correct, unlabelled is the middle |
| Missing core labels (`discuss`, `do-not-merge`, automation greys, `duplicate`, `wontfix`, `refactor`, `help wanted`) | Install the standard set; they sit dormant until used |

### 2.2 Per-issue classification

Type recommendations follow QEP-0002's rules: one Type per issue; trackers carry no Type;
`refactor` (not `enhancement`) for behaviour-preserving restructuring; the bug/enhancement
boundary is the artifact's promise; `high-priority` only for genuine outliers (published
content broken, silent corruption, build blockers).

| # | Title | Recommended (QEP-0002) | Current | In plan |
|---|---|---|---|---|
| #256 | Six defects observed syncing a six-PR batch to lecture-intro.zh-cn (d... | `bug + high-priority` | — | yes |
| #255 | Figure captions ship untranslated: 85 of 222 on lecture-python.zh-cn ... | `bug` | — | yes |
| #254 | Sync overwrites localised _toc.yml part captions with English, and no... | `bug + high-priority` | — | yes |
| #253 | The deterministic target-local-read guard is in neither the action bu... | `bug + high-priority` | — | yes |
| #251 | Nothing writes the routing/audit labels (editor, audit, auto-merged, ... | `enhancement` | — | — |
| #250 | ml packet question: is the recurring minor/terminology demerit genuin... | `question` | question | — |
| #249 | Reviewer finding descriptions are unreproducible and sometimes descri... | `bug` | bug | yes |
| #248 | Review-mode replicate experiment: quantify routing and severity-assig... | `infrastructure` | enhancement | — |
| #240 | ml_metrics pinned-term retention: homograph + light-verb false positi... | `bug` | bug + testing | yes |
| #239 | hreflang and switcher targets can 404 with nobody noticing — add a ... | `enhancement` | — | — |
| #238 | Cultural references: flag for human review instead of translating lit... | `enhancement` | enhancement | — |
| #235 | Reviewer invents a heading-map slug spec that contradicts the engine,... | `bug` | — | yes |
| #234 | Sync silently does not run when a merged source PR has an agent-autho... | `bug + high-priority` | — | yes |
| #230 | claude-opus-5 costs report as $0.000 — missing pricing entry silent... | `bug` | — | yes |
| #229 | ml script-ratio gate compares a mean against a p10-p90 band, so it ca... | `bug` | testing | yes |
| #227 | bench/: a replicate-based reliability instrument for the document wri... | `infrastructure` | enhancement | — |
| #224 | Review mode grades the engine's own i18n font localisation as unautho... | `bug` | bug | yes |
| #223 | Reviewer emits findings with the wrong file and location — accuracy... | `bug` | bug | yes |
| #222 | sync silently first-translates lectures missing from the target — u... | `bug + high-priority` | bug | yes |
| #221 | Moving the sync bot to a GitHub App will silently break \\translate-r... | `discuss + low-priority + security` | infrastructure + security | — |
| #218 | Seed PRs have no AI-review path: init has no --github mode and review... | `enhancement` | enhancement | — |
| #217 | French guillemets interior NBSP is prompt-only — needs a determinis... | `bug` | bug | yes |
| #216 | Harness has no scenario for a rename GitHub reports as delete+add | `maintenance` | infrastructure | yes |
| #205 | fa: pin whether language/library proper nouns transliterate (پایت... | `discuss` | — | — |
| #204 | Build model-bump regression testing into the harness: diff regenerate... | `infrastructure` | infrastructure | — |
| #203 | translate init produced structurally transposed output (code-cell ↔... | `bug` | bug | yes |
| #198 | Work plan — week of 2026-07-27: v0.24.0 release decision, then Phas... | *(none — tracker)* | — | — |
| #189 | Malayalam (ml) test project: benchmark vs native-speaker reference, c... | *(none — tracker)* | testing + enhancement | — |
| #187 | Reviewer grades out-of-diff prose on code/metadata-only sync PRs, for... | `bug` | bug | yes |
| #182 | The #107 i18n-preservation guardrail is prompt prose and fails at scale | `bug + high-priority` | bug + high-priority | yes |
| #181 | Sync carries text.usetex into CJK targets — recurring build break | `bug` | bug | yes |
| #178 | Sync applies no localisation rules — English figure labels, no font... | `bug` | bug | yes |
| #177 | tech-debt Wave 3: trigger-gated backlog (18 findings, deliberately no... | *(none — tracker)* | — | — |
| #176 | tech-debt T6: Delivery and the cross-repo contract | `infrastructure` | infrastructure | yes |
| #175 | tech-debt T7: CLI shared spine — config precedence, one worker pool... | `refactor` | enhancement | yes |
| #174 | tech-debt T5: Widen `LanguageConfig` and build rule lists once | `refactor` | enhancement | yes |
| #173 | tech-debt T4: One Anthropic client: `src/anthropic-client.ts` | `refactor` | enhancement | yes |
| #172 | tech-debt T2·3: Create the write-path choke point: `finalizeTranslat... | `refactor` | enhancement | yes |
| #171 | tech-debt T2·2: Give heading identity an owner: brand `HeadingKey` | `refactor` | bug | yes |
| #170 | tech-debt T2·1: Own the document primitives: one fence walker, one f... | `refactor` | bug | yes |
| #169 | tech-debt T1: Make the Action entry point importable | `refactor` | enhancement | yes |
| #157 | Review verdict says PASS with diff 10/10 on a sync PR that cannot bui... | `bug` | bug | yes |
| #156 | sync opens a PR whose _toc.yml references a lecture the same run fail... | `bug + high-priority` | bug + high-priority | yes |
| #155 | Decide whether positionCorrect should be deterministic | `discuss` | — | — |
| #154 | Measure glossary adherence across the estate | `infrastructure` | infrastructure | — |
| #143 | glossary(fr): pin payments → versements for cash-flow contexts | `enhancement + low-priority` | — | — |
| #142 | init: gap-fill into an existing edition needs manual clobber-recovery... | `enhancement` | enhancement | yes |
| #141 | init: i18n-font-config injection is nondeterministic and the font pat... | `bug` | bug | yes |
| #136 | feat: whole-lecture human-audit workflow | `enhancement` | enhancement | — |
| #135 | Review report language is nondeterministic | `bug` | bug | yes |
| #134 | init -f is repo-scoped: rewrites .translate/config.yml and clobbers l... | `bug` | bug | yes |
| #133 | Feedback: first-class consistency check for recurring document-local ... | `enhancement` | enhancement | — |
| #118 | forward resync wrapped an entire document in a code fence and mis-der... | `bug` | bug | yes |
| #116 | forward CLI writes lecture files without a trailing newline | `bug + low-priority + good first issue` | bug + good first issue | yes |
| #106 | forward discovery misses content-stale files on unbootstrapped repos,... | `bug` | bug | yes |
| #103 | Design: route sync PRs by review verdict and make human review measur... | `discuss` | enhancement | — |
| #94 | Work plan: suggested order for the post-review backlog | *(none — tracker)* | — | — |
| #92 | PR creation reports failure when the GitHub API times out after succe... | `bug` | bug | yes |
| #91 | docs: heading-maps.md documents a key format the action has never wri... | `documentation` | documentation | yes |
| #90 | Silent data loss in the sync merge path — five ways | `bug + high-priority` | bug | yes |
| #89 | node24 + @actions/* majors | `infrastructure` | maintenance | yes |
| #82 | No test set for model upgrades | `infrastructure` | infrastructure | yes |
| #61 | Switch translation PR identity to quantecon-services machine user | `infrastructure` | infrastructure | yes |
| #56 | feat: Web app for side-by-side annotation | `enhancement + low-priority` | enhancement | — |
| #55 | feat: qetranslate review CLI for code comments, figure labels, LaTeX | `enhancement + low-priority` | enhancement | — |
| #53 | Deprecate and remove legacy heading-map: frontmatter format | `maintenance + low-priority` | maintenance | yes |
| #7 | docs: Update presentation for action-translation rename | `documentation + low-priority` | documentation | yes |

Notable relabels, with reasoning:

- **#169–#176 (tech-debt waves) → `refactor`/`infrastructure`**, not `enhancement`/`bug`: all
  are behaviour-preserving restructuring (the QEP software extension exists for exactly this);
  #176 stays `infrastructure` (release automation is CI/tooling work).
- **#221 → `discuss` + `security`**: nothing is broken today; the issue records a decision to
  take before the bot-identity migration. It terminates in a decision, which is `discuss`.
- **#103, #155, #205 → `discuss`**: open design/decision threads.
- **#94, #198, #177, #189 → tracker (no Type label)**: umbrella/planning issues; QEP-0002
  exempts sub-issue parents from the one-Type rule. Where native sub-issues are not set up,
  leaving them unlabelled with a "tracking" first line is the closest conforming state.
- **#89 → `infrastructure`** (currently `maintenance`): a Node-runtime migration plus two
  `@actions/*` majors passes the release-note test.
- **#91, #7 stay `documentation`**: repo docs about the tool, not product content.
---

## 3. Verified analysis — the bug/maintenance backlog in eight clusters

Every fix-status below was checked against `main` @ v0.25.0 on 2026-08-10; citations are to the
current tree. "Live" means the defect mechanism is present in today's code, not merely that the
issue is open.

### A. Sync delivery integrity — declared files silently not delivered

**Issues**: #90 (origin), #156, #222, #92, #234, #256 (defects 1, 4, 5) · **all live**

The class: a sync run drops or skips work and nothing downstream compares what was promised
against what was delivered. Five production instances so far, the latest on v0.25.0
(2026-08-10, `lecture-python-programming.fr#29` dropping `numpy.md` — #90 thread).

| Verified mechanism | Where (today) |
|---|---|
| ~~Per-file fetch failure logged and dropped~~ **Corrected on verification**: the four fetch sites are fail-closed (`:525` collects into `fetchErrors`, `:533–535` throws pre-reset; `:1097/:1158/:1190` → `result.errors` at `:881` → run fails + failure issue). The live gaps: the fr#29 drop recorded **no error at all** (drop path is upstream of fetch), and a partial PR still ships when errors exist | `src/index.ts:525–535`, `:881–886`, `:902` |
| Run error set never consulted by TOC processing, PR body, or the reviewer | `src/sync-orchestrator.ts` (TOC), `src/pr-creator.ts` (body), #157 |
| Sync escalates a missing target file to a full first translation (`NEW` mode), undisclosed | `src/sync-orchestrator.ts:545`, `:650` |
| `pulls.create` throw treated as "PR does not exist" — timeout after success reads as failure; naive retry would duplicate | `src/pr-creator.ts:192` (no adopt-existing check) |
| Merged agent-authored source PRs park sync runs at `action_required`, invisibly | outside the action (workflow gate); no detector exists |
| Resync gate/parser mismatch: workflow triggers on `contains`, action requires `startsWith` | `src/cli/commands/setup.ts:174` vs `src/inputs.ts:315` |

**#90 status ledger** (its body predates three rounds of fixes): defect 1 substantially fixed
in v0.17.0 (a verification pass over remaining sites is what's left — see cluster E); defect 2
resolved 2026-07-22 via #137 (removal-with-visibility; declared-additions design shelved with a
recorded trigger); defects 3–5 live.

**The class fix** (#256.1's proposal, seconded by #156's thread): after generating the diff,
assert every entry in `translation-sync-metadata.files` produced either a change or an
explicitly recorded "no change required — reason"; fail the run on an unexplained empty, and
render the PR body's "Files Updated" from the same computed set (#256.5). This one assertion
converts #90.3, #156-defect-B, #222-defect-B and #256.1 from silent to loud. It is a
comparison the run can already make; no new state is needed.

### B. `_toc.yml` and shared assets — one file, three failure families

**Issues**: #254, #156 (defect 1), #256 (defects 2, 3), #142 (TOC half) · **live except bib**

`_toc.yml` is *copied verbatim from the source* — `src/sync-orchestrator.ts:657` ("Process a
TOC file (copied directly without translation)"). That single mechanism produces:

- **Caption de-localisation** (#254): 14 Chinese part captions replaced with English, served
  to readers for 17 days; two more instances sitting in the intro.zh-cn queue (#256.2). No
  mode translates a caption (`init.ts` parses `caption?` and ignores it), review mode filters
  to `docsFolder`+`.md` so it never sees the file, and the strict build passes English captions.
- **Dangling entries** (#156): the copied TOC lists files the same run failed to produce —
  four field instances; plus the concurrent-coupling variant (three simultaneous lecture-adding
  PRs each mirroring the full source TOC, each unbuildable until the others merge — #156 thread).
- **Bibliography**: #256.3 (`.bib` never synced) reproduced on tool 0.24.0; **v0.25.0 shipped
  #117's demand-driven bibliography backfill** (CHANGELOG), so this defect is expected fixed —
  verify on the next organic batch before ticking it off #256.

**The class fix**: treat `type: toc` as a structured merge (add/remove `- file:` entries only;
never write captions from source; skip entries whose target document does not exist in target ∪
PR), plus #254's cheap deterministic assertion (non-Latin-script target must not lose
target-script characters in captions). Option 2+1 of #254 prevents both recorded field instances.

### C. Localisation pipeline — rules that exist but don't run

**Issues**: #182, #253, #181, #217, #255, #141, #178 (on hold) · **all live**

- The i18n-preservation rule is prompt prose at `src/translator.ts:291`, `:384`, `:649`,
  `:666` — still naming the superseded `SimHei` idiom and keying on `# i18n` markers that 104
  of 154 live blocks lack (#182: 21 lectures stripped, 9 rendered tofu in production).
- The deterministic target-local-read guard exists (`src/cli/target-local-reads.ts`), works,
  and is wired only into `forward` — `grep -c findTargetLocalReads dist-action/index.js` = **0**
  today (#253). It is also blind to URL-form reads.
- No `text.usetex` awareness anywhere in `src/` (#181): two lectures re-break on every resync.
- French guillemets interior NBSP is prompt-only (`src/language-config.ts:56`);
  `applyTypography` has no interior-guillemet transform (#217). The zh full-width-dash case in
  #217's thread makes this a *per-language typography rule list*, not a French special case.
- 85 of 222 figure captions on lecture-python.zh-cn byte-identical to English, delivered by
  sync (68) and init (17), including two lectures delivered **by v0.25.0** (#255).

**Sequencing constraint**: #178 is on hold pending the editions-level decision on a global
build-level font mechanism (#178 thread, 2026-07-24). If global lands: #178 becomes
unnecessary, #141's injection half collapses to "emit nothing", and **#182 becomes the entire
remaining job**. Take the decision first; build second.

**Structural home**: #172's write-path choke point (`finalizeTranslatedDocument`). Its Wave-3
trigger condition — "the first merged sync PR that reverts a localized code cell" (#177 F23) —
**has fired** (intro.zh-cn#285). Deterministic transforms (#182/#181/#217) each need to run on
every write path; landing them individually at five write sites is how this class was created.

### D. Reviewer and verdict — trust the deterministic half, fix the rest in two batches

**Issues**: #157, #223, #224, #235, #249, #187, #135, #251 (rider) · **all live**

**Hard constraint**: reviewer *prompt* changes are frozen until the shadow window closes
(earliest 2026-09-01, QuantEcon/project-translation#15). Engine-side deterministic work is not
frozen — and v0.23.0's `diffCheckSources` (deterministic vs model provenance) is the pattern
to extend.

Deterministic, allowed now:
- **Cross-file reachability check** (#157): every `_toc.yml` entry and `{doc}`/`{numref}`/`{cite}`
  ref introduced by the diff resolves against target ∪ PR. Pure filesystem+regex; `src/diff-checks.ts`
  currently has no such check (verified). Would have caught six dangling references on zh-cn#202
  and both directions of #222. Run it in *both* directions (files added ⊆ reachable).
- **`# i18n` line filter** (#224): the engine writes and marks these lines
  (`src/localization-rules.ts`); review reads them back as "unauthorised modification" — a
  false gating major on every zh-cn plotting sync. Excluding marked lines from code comparison
  is mechanical and uses a signal the engine already emits.
- **Finding-coordinate validation** (#223): verify a distinctive substring of
  `description`/`suggestion` occurs in the named `file`; re-attribute within the diff or mark
  unlocated. Same spirit as #148's remedy.
- **Label writer** (#251, an enhancement riding with this cluster): review mode applies
  `editor` when it computes that recommendation; shadow `wouldAutoMerge` optionally labels.
  Belongs in `src/contracts.ts` (verified: only the sync/detection label set lives there today).
- Thread the sync run's error set into review input (#157 gap 2 — pairs with cluster A's fix).

Prompt-side, batched for the freeze lift (~2026-09-01), pre-registered per program rules:
#187 (score changed translatable content only; N/A prose criteria on thin diffs), #135 (pin
report language), #249 (findings must quote the offending span + rule + direction), #235 (feed
the heading-map contract, or compute the check), #256.6 (legitimately-newer-baseline signal),
plus the zh-cn convention allowlist (Baidu Baike, #187).

### E. Parser and heading identity — the #90 remainder

**Issues**: #90 (defects 1, 4, 5), #91, #53, #118, #203 · **live**

- Raw `.replace(/^#+\s+/, '')` heading derivations (no `stripMystRoles`, no trim) remain at
  `src/file-processor.ts:232, :249, :425, :466, :488` — the un-normalised `parentPath` sites
  the audit called F118, behind #90's defects 1-residual and 4. The structural fix is #171
  (brand `HeadingKey`, `cleanHeadingText` as sole constructor) — it turns every stray site
  into a compile error, which is cheaper than a hand verification pass and permanent.
- `injectHeadingMap` still round-trips the whole frontmatter through `yaml.load`/`yaml.dump`
  (`src/heading-map.ts:218–233`) — #90.5's scalar re-typing (`date:` → ISO datetime) is live.
- Legacy `heading-map:` fallback still read (`src/heading-map.ts:81`) — #53 is unstarted; the
  deprecation warning costs one line.
- `docs/user/heading-maps.md` still documents slugified keys the action has never written
  (#91) — a docs fix, best landed with the `HeadingKey` work so it documents the settled answer.
- #118 (forward wrapped a document in a fence): the forward path now runs
  `checkStructuralParity` post-finalize (`src/cli/commands/forward.ts:384`) — the 2026-07
  corruption *would now be refused*. The un-covered residual is the title-derivation sanity
  check ("derived title corresponds to an actual H1"), which is cheap and still worth landing.
- #203 (init transposed code-cell ↔ math; guard caught it): the ask is a bounded
  retry-on-parity-failure in `init` instead of a hard fail — plus the reproduction count it
  suggests, which doubles as #82's first eval exercise.

### F. CLI operational bugs — init/forward

**Issues**: #134, #142, #106, #116, #141 (path half) · **live except #134's config half**

- #134: the `writeConfig` half was fixed on main (#246, `597b2be` — merge over existing
  config); **the Phase-4 clobber is live**: `copyNonMarkdownFiles` runs unconditionally in
  `runInit` (`src/cli/commands/init.ts:495`), overwriting localised `_config.yml`/`_toc.yml`
  and assets even in `-f` single-file mode. Fix: copy-if-missing semantics under `-f`
  (never overwrite), `--copy-assets` to opt back in. #142's gap-fill report is the same
  defect plus the missing TOC insertion (its source-order insertion algorithm placed 37/37
  entries correctly by hand — and is also what #222's escalation path needs if D2 = yes).
- #106: `forward` discovery undercounts on unbootstrapped repos (12 of 41) while
  `status --check-sync` had already classified all 41 with no way to hand the result over
  (`--from-status`), and the run summary buckets resynced files as "skipped: i18n only".
- #116: trailing-newline on forward writes — one-line fix, `good first issue` (labelled).
- Pulled forward from #175 because it is a live silent-corruption hazard, not just debt:
  **`.translate/config.yml`'s `target-language` is read by nothing and three commands
  hardcode `zh-cn`** (audit F11, rank 7) — `translate forward` on a French edition with no
  `-l` runs the resync as Chinese, silently.

### G. Platform, dependencies, identity

**Issues**: #89 (close-candidate), #61, #221, #230, #7

- **#89 is done in substance** (verified): `action.yml` declares `node24`; esbuild target
  `node24` (`build-action.mjs:23`); `engines.node >=24`; CONTRIBUTING updated;
  `@actions/core` 2.0.3 + `@actions/github` 8.0.1 landed with `npm audit --omit=dev` at
  **0 vulnerabilities** (CHANGELOG v0.18.0). The 3.x/9.x lines are ESM-only and deliberately
  deferred — that residual is exactly #177's F35 trigger. **Recommend: close #89**, noting the
  residual rides on F35.
- **#61 + #221 are one decision** (D3): move PR identity to the `quantecon-services` machine
  user (option A — no gate change anywhere, `author_association` keeps meaning what it says);
  a GitHub App would require an allowlist in ~17 files. #221 is `discuss` + `security` and
  closes when the decision is recorded as a `.dev/decisions/` file.
- **#230**: verified — `PRICING` in `scripts/glossary/lib.mjs:56` has no `claude-opus-5`
  entry and falls back to `{ in: 0, out: 0 }` (line 63), the exact silent-zero the issue
  describes; `VALID_MODEL_PATTERNS` in `src/models.ts` also lacks it. S-size fix: add both
  entries + warn on unknown model at the cost calculator.
- **#7**: `presentations/` still carries `action-translation-sync.*` — trivial rename, or
  close as wontfix if the presentation is historical.

### H. Scheduled refactors and test infrastructure

**Issues**: #169–#176 (Wave 2, unstarted — no CHANGELOG landings), #177 (Wave 3 gate-keeper),
#216, #82, #229, #240

Wave 2 is verified against v0.23.0 and remains valid. What has changed since it was scoped is
that three of its items are now load-bearing for open production bugs, which resolves #198's
"Phase 2 first or interleave Wave 2?" question in favour of interleaving:

| Wave 2 item | Now needed by |
|---|---|
| #172 write-path choke point | Cluster C's deterministic transforms (trigger F23 has fired) |
| #171 `HeadingKey` brand | #90 defects 1-residual/4 (cluster E) — cheaper than the hand verification pass |
| #169 importable entry point | Cluster A rewrites `index.ts` fetch/error paths at 0% coverage — W1 should not land blind |

The rest of Wave 2 (#170, #173, #174, #175, #176) keeps its audited order behind those three.
#82 (frozen eval set + baseline before the next model bump) should precede any model change —
it is the standing guard the v0.16.0 lesson bought. #229/#240 are experiment-side metric
defects that only gate #189's Phase 3 graduation into `diff-checks.ts`; fix before graduation,
not before.

---

## 4. The work plan

Ordering rules, inherited from #94 and still right: **decisions and external clocks first;
detection before repair; foundations before dependents.** Priorities: P0 = stops silent
corruption of published content; P1 = recurring production pain; P2 = bounded; P3 = scheduled
debt.

### W0 — This week: decisions, closures, and S-size fixes (no release needed)

| Item | What | Issues |
|---|---|---|
| D1 | Decide the global font mechanism (editions-level). Scopes the whole of cluster C | #178, #141, #182 |
| D2 | Decide: may sync first-translate a target-missing lecture? Recommend **no** — report the gap, leave seeding to `init` (conservative option; escalation-complete is acceptable if #142's TOC insertion lands with it) | #222 |
| D3 | Decide bot identity: recommend machine user (no gate change); record as `.dev/decisions/` | #61, #221 |
| Close | #89 (done; ESM residual = #177 F35) · #94, #198 (superseded by this plan) · verify #256.3 fixed by v0.25.0 #117 backfill | |
| Labels | Apply §2 migration (retire `testing`, recolour `maintenance`, install missing core labels, per-issue relabels) | |
| S fixes | #230 pricing entry + unknown-model warning · #116 newline · #234.4 gate/parser alignment · #53 deprecation warning · #91 + #7 docs | |

### W1 — v0.26.0: make partial delivery loud — **P0**, ~1–2 weeks

The detection layer for cluster A/B. Everything here is deterministic engine work.

1. **Declared-vs-delivered assertion** — every metadata `files` entry ends the run changed or
   recorded "no change required + reason"; unexplained empty ⇒ run fails. The assertion must be
   independent of the error plumbing: the four `index.ts` fetch sites are already fail-closed
   (verified), yet the fr#29 drop reported success — trace and close the no-error drop path,
   and decide whether PR creation may proceed when the error set is non-empty (`index.ts:902`
   ships the partial PR today). (#90.3, #156-B, #222-B, #256.1)
2. **TOC structured merge** — entries only, never captions, skip target-missing docs — plus
   the caption-script assertion. (#254, #156.1, #256.2; unblocks the concurrent-PR coupling)
3. **PR body from the computed set** (#256.5) and a "Files failed" section linking the failure
   issue (#156.2); thread the error set into review input (#157 gap 2).
4. **State-not-response checks**: PR-create adopt-on-timeout via unique head branch (#92);
   rebase refuses to force-push a branch to/behind base — close deliberately instead (#256.4).
5. **Stalled-run detection** (#234): `examples/detect-stalled-sync.yml` + `translate status
   --stalled` + FAQ fingerprint.

Land #169 (importable entry point) first or alongside — W1 edits `index.ts` at 0% coverage.
Validate with the e2e harness; watch the first organic sync after the tag moves (#198's habit).

### W2 — Localisation becomes deterministic — **P1**, after D1, ~1–2 weeks

Home the transforms in #172's choke point (pull it forward from Wave 2; its trigger fired):

1. **#253**: wire the target-local-read guard into sync, bundle it (plus a build-time
   assertion the bundle contains it), resolve same-repo raw URLs before the URL skip.
2. **#182**: deterministic i18n preservation — pre-write diff of target code cells,
   re-apply recognised adaptation lines (fonts/rcParams, LaTeX preamble/helpers, localised
   plot strings); prompt rule stays as a hint.
3. **#181**: strip/report `text.usetex` for scripts LaTeX can't typeset.
4. **#217**: per-language typography rule list (fr guillemets interior NBSP; zh no-space `——`),
   applied pre-heading-map per #172's placement constraints.
5. **#254/#255 shared predicate**: "a target-language file should not carry a caption
   byte-identical to its source" as one deterministic check across `_toc.yml` and mystnb
   captions; caption translation surface per D1's outcome. Repair of the existing 85 captions
   is a hand pass on the edition, separate from engine work.
6. #141's font-path half: convention detection or `--font-path` (moot if D1 goes global).

### W3 — Reviewer, deterministic half — **P1**, parallel with W2, ~1 week

#157 reachability diff-check (both directions, `deterministic` provenance) · #224 `# i18n`
filter · #223 coordinate validation · #251 label writer (rider). No prompt text changes.

### W4 — Reviewer, prompt batch — at freeze lift (~2026-09-01)

#187 (+ Baidu Baike allowlist) · #135 · #249 · #235 · #256.6 — pre-registered, shipped as one
measured change against the shadow baseline.

### W5 — CLI hardening — **P2**, ~1 week

#134/#142 copy-if-missing + `--no-copy` + TOC insertion (also serves D2-yes) · #106
`--from-status` + truthful summary · #203 bounded retry-on-parity in `init` · F11 from #175
(read `target-language` from config; stop hardcoding `zh-cn`) · #118 title-sanity assertion.

### W6 — Scheduled debt — **P3**, as capacity allows

Remaining Wave 2 in audited order (#170 → #171* → #173 → #174 → #175 → #176; * unless already
pulled into W1/W2) · #82 frozen eval set + baseline (hard gate before the next model change)
· #216 harness scenario · #53 fallback removal (after estate check) · #229/#240 before #189
Phase 3 graduates metrics into `diff-checks.ts`.

### Dependency spine

```
D1 ──► W2 (scope: #178/#141 live or die here)
D2 ──► W1.1 wording + W5 TOC insertion
D3 ──► #61 execution; #221 closes
#169 ──► W1 (test the code W1 edits)
#172 ──► W2 transforms (one home, not five sites)
#171 ──► #90.1/.4 closure (cluster E)
W1.1 (error set) ──► W3 reachability + review input
shadow window ──► W4
#82 baseline ──► any future DEFAULT_CLAUDE_MODEL change
```

---

## 5. Close-candidates and supersessions

| Issue | Action | Reason |
|---|---|---|
| #89 | Close | All asks landed (node24 everywhere, majors in, 0 advisories); ESM-only 3.x/9.x residual is #177 F35's trigger, recorded there |
| #94 | Close | 2026-07-15 ordering, substantially executed; superseded by this plan |
| #198 | Close | Week-of-2026-07-27 plan, executed (v0.25.0 released; round-trip gate decision pending separately); superseded |
| #256.3 | Verify + tick | #117 bibliography backfill shipped in v0.25.0; batch that hit it ran 0.24.0 |
| #221 | Close on D3 | It is a decision record; a `.dev/decisions/` file is its terminal state |
| #250 | Answer + close | `question` — its answer (keep-English policy vs reviewer misread) feeds W4's #249 evidence rules |
| #7 | Fix or wontfix | Rename is minutes; if the deck is historical, close `wontfix` with a sentence |

## 6. Out-of-scope issues (features, design, experiments) — for completeness

Not bug/maintenance; listed so the review covers all 67. Trackers: #94, #198 (close above),
#177 (keep — Wave 3 gate-keeper), #189 (ml program). Design/discussion: #103 (largely absorbed
by the program plan; consider closing with a pointer), #155 (measure `positionCorrect`
precision via `diffCheckSources` shadow data, then decide), #205 (fa transliteration policy),
#221 (→ D3), #250 (→ answer). Features: #56, #55 (web app / element review CLI — low-priority),
#136 (human-audit workflow — program-adopted), #133 (document-local consistency check — pairs
with #249's direction), #218 (seed-PR review path — the 37-seed debt makes this the most
valuable enhancement here; shape 2 (whole-file review) has standing value), #251 (label writer
— scheduled as W3 rider), #142 (enhancement half), #238 (cultural-reference flagging), #239
(cross-edition reachability checker — likely a shared workflow, not engine code), #143 (fr
glossary pin, deferred by design). Experiments/infra instruments: #227 (bench/ replicate
instrument), #248 (routing-variance replicate — evidence already informing #249), #204
(model-bump regression in harness — subsumed by #82's design), #154 (measurement exists;
remaining work program-side), #82 (scheduled W6, gate for model changes).

---

*Method note: all 67 open issues were read in full; classifications follow QEP-0002 (software
repo: core 19 + `refactor`); fix-status claims were verified against `main` @ `3db2f9f`
(v0.25.0) by direct inspection on 2026-08-10, including comment threads on #90, #154, #156,
#178, #217 whose status changes are not reflected in the issue bodies. Line references are to
that commit.*

# Claude 5.5 upgrade evaluation: should Sonnet 5.5 become the default, and what is Opus 5.5 for?

**Status: pre-registered 2026-10-20; not yet run.** This protocol, the corpus and the decision rules
are fixed before the first draw. Results go to `RESULTS.md` (written by `summarize.mjs`); this file
changes only to record incidents, below.

## Question

1. Can `DEFAULT_CLAUDE_MODEL` move from `claude-sonnet-5` (s5) to `claude-sonnet-5-5` (s55)
   without more structural failures, refusals on production content, truncation exposure or cost?
2. What do the same measurements say about `claude-opus-5-5` (o55), for #334's options: keep
   Sonnet everywhere, move review, or move translation, and for the bulk-seed model
   (D-2026-10-19-opus-5-5-for-bulk-seed)?

No default changes in this experiment. The decision rules below say what a flip needs; the flip is
its own PR, citing `RESULTS.md`.

## Why now

- **#342 and #334, PR A (#394).** Sonnet 5.5, Opus 5.5 and both Fable models reject
  `thinking: {type: 'disabled'}` with a 400, so none of them could run until the engine moved to a
  per-model request policy ([D-2026-10-19-per-model-request-policy](../../.qe/dev/decisions/D-2026-10-19-per-model-request-policy.md)):
  Sonnet 5 keeps thinking disabled, byte-identical to v0.29.5; Sonnet 5.5 sends `between_tools` at
  effort `high`; Opus 5.5 thinks adaptively at effort `medium` with `max_tokens` headroom. A refusal
  (`stop_reason: refusal`) now fails the file, and the SDK moved 0.78 → 0.131. #342 makes any change of
  default wait for a measurement through the #227 instrument.
- **#82 and #204.** v0.16.0 changed the default model with no before/after measurement, and the
  repository still had no test set for a model change. This is the first one: pinned real lectures,
  the release instrument (`rate-check.sh`) and pre-registered rules.
- **#227's doctrine** governs everything below: deterministic outcomes gate, never an LLM-judged
  score; rates carry Wilson 95% intervals and contrasts an exact test; infra failures leave numerator
  and denominator, and a cell above 10% infra gives no verdict; tooling imports the engine's guards
  from `dist/` instead of re-implementing them; a cell sized below its stated power is advisory.
- **The known failure classes are exactly what a new model could move.** #203/#363 (the whole-document
  fence wrap, which the parity guard refuses): Sonnet 5 fails `game-theory.md` on about 4–6% of draws
  per language (zh-cn 3/84, fa 3/84, ml 5/84 over the 4b checks and controls of 2026-09-23 to
  2026-10-19) and failed 14 of 14 French drafts of `python_essentials` at v0.29.4. #118 (head blocks
  under the localization rules): `prospects_bounded_rationality` passed 5/15 at default localize
  against 14/15 at none (#227). The new models add refusal categories (`bio`, `frontier_llm`,
  `general_harms`, …) the economics corpus has never been screened for.

## Arms

| Arm | Model | Request (PR A's policy) | Full-document `max_tokens` | Role |
|---|---|---|---|---|
| s5 | `claude-sonnet-5` | thinking disabled, no effort | 64,000 | production baseline |
| s55 | `claude-sonnet-5-5` | `between_tools`, effort `high` | 64,000 | candidate default |
| o55 | `claude-opus-5-5` | adaptive, effort `medium` | 128,000 | bulk seeds / review (#334); informational |
| s5@v0.29.5 | `claude-sonnet-5` | v0.29.5's own request | 64,000 | Stage 0b only (advisory A/A) |

s5 and s55 share list price ($2 / $10 per million tokens, cache reads $0.20) and tokenizer, so their
output tokens compare directly. o55 ($4 / $20) uses a different tokenizer: compare its dollars, not
its tokens. Server-side refusal fallbacks stay off (D-2026-10-19): a refusal is measured as a refusal.

**One engine for every stage** (`run-stages.mjs` enforces it). It is the release candidate that will
carry the flip: this branch, plus whatever merges first, #363's fence unwrap included if it lands
before the run. `EVAL_ROOT/engine.json` pins it (git sha and clean flag, `dist/` hash, translator and
parity-guard hashes, glossary hashes, SDK version), every later invocation refuses another engine,
and `rate-check.sh` records the same hashes in each run, which R0 compares. If the run uses the
pre-#363 engine, two things follow: the head-raw cells can only show improvement, since s5 fails them
67–100% of the time, and the fixture rates include a defect production will not have once #363 ships.

Run the stages from a checkout pinned at that engine (`npm ci && npm run build`), and commit nothing
there until the last stage: `rate-check --resume` refuses a run whose commit moved. Write the results
into the checkout you commit from with `summarize.mjs --out`.

## Stages

Estimates come from `node run-stages.mjs --plan` (list prices from `dist/model-pricing.js`; output
tokens per source byte measured for fr, 0.566, estimated for the other languages; o55 assumed to think
2,000 tokens a draw, unmeasured). `run-stages.mjs` stops an invocation when the run reports' own
`costUSD` passes 1.5 × its estimate (a finished draw with no report, such as Stage 0b's v0.29.5 arm,
counts at its estimated cost); rerunning the same command resumes. The worst case is every draw
running to `max_tokens`.

| Stage | What | Draws | Typical | Worst |
|---|---|---:|---:|---:|
| 0a | **R1**, deterministic: `engine-aa.mjs`, both engines against a fake API | 0 | $0 | $0 |
| 0b | Stochastic A/A, optional and advisory: `game-theory.md` × zh-cn, fa, ml, fr × {s5@v0.29.5, s5} × 12 | 96 | $5.75 | $63 |
| 1 | Fixtures: `game-theory.md`, `25-pre-title-content-lecture.md`, `28-add-exercise-lecture.md` × zh-cn, fa, ml, fr × {s5, s55, o55} × 12, localize none | 432 | $40 | $563 |
| 2 | Real lectures: head-raw (`python_essentials`, `python_oop` × fr; `prospects_bounded_rationality` × zh-cn; default localize) × 3 arms × 12; safety probes (`sir_model`, `autodiff`, `jax_intro`, `jax_nn`, `keras` × zh-cn) × {s55 6, o55 6, s5 3}; long tail (`two_computation` × zh-cn, fa) × 3 arms × 2 | 195 | $56 | $269 |
| 3 | Production refusal sweep: every lecture of lecture-python-programming (zh-cn and fa), lecture-python.myst and lecture-python-intro (zh-cn) × {s55, s5} × 1 | 522 | $98 | $359 |
| 4 | Quality, advisory: reference-ml lectures (`functions`, `matplotlib`, `numpy`) × ml × 3 arms × 6; `judge.mjs` over Stages 1–2; `ml-lints.mjs` | 54 + ~2,500 judge calls | $17 + $52 | $72 + judge |
| 5 | Pre-release wiring check (Matt; needs the `workflow` scope): the harness at the flip branch and a same-day baseline at `main`, then `evaluate --model claude-opus-4-8` | 2 harness runs | ~$60 | — |
| | **Stages 0–4** | **1,299** | **~$268** | **$1,325** |

Follow-up draws, only when a rule calls for them (`run-stages.mjs --followups`): an R2 same-day
control is 24 more draws for each of s5 and s55 on one cell (~$2.50 on a fixture); an R3 redraw is 12
more for each of s55 and s5 on one lecture (~$2–20 by size). Stage 5 is not release step 4a: the
release that carries the flip still runs 4a and 4b on its own tag.

### Commands

```bash
export EVAL_ROOT=~/.cache/action-translation/claude-5-5-eval   # the default; durable, outside the repo
D=experiments/claude-5-5-upgrade

node $D/run-stages.mjs --plan                              # the cell table and the estimates, no key needed
node $D/fetch-corpus.mjs --out "$EVAL_ROOT/corpus" --sweep # the pinned corpus, sha256-verified, no key
# behind an HTTPS proxy, Node's fetch needs NODE_USE_ENV_PROXY=1

# Stage 0a, R1 ($0): a v0.29.5 engine with its own dependencies (SDK 0.78), outside this repository
T=$(mktemp -d)/v0.29.5 && git worktree add "$T" v0.29.5 && (cd "$T" && npm ci && npx tsc)
node $D/engine-aa.mjs --baseline "$T"
git worktree remove --force "$T"

export ANTHROPIC_API_KEY=…
node $D/run-stages.mjs --stage 0 --yes            # optional, advisory (npm ci in a v0.29.5 worktree)
node $D/run-stages.mjs --stage 1 --yes
node $D/run-stages.mjs --stage 2 --yes
node $D/run-stages.mjs --stage 3 --yes
node $D/run-stages.mjs --stage 4 --yes
node $D/summarize.mjs                             # RESULTS.md; lists the follow-ups and re-runs owed
node $D/run-stages.mjs --followups --yes          # R2 controls and R3 redraws, then summarize again
node $D/run-stages.mjs --stage N --rerun <unit> --yes        # R0: a new attempt, every arm
node $D/run-stages.mjs --stage N --redraw-infra --units <unit> --yes   # R0: top a cell up to 12 valid draws
node $D/judge.mjs --yes                           # advisory; --plan first prices it
node $D/ml-lints.mjs                              # advisory; Python 3, stdlib only
node $D/summarize.mjs --out <your checkout>/$D    # RESULTS.md, results.json, records/
```

Every rate-check call gets `--source-dir`, `--localize`, `--model`, `--draws`,
`--run-dir "$EVAL_ROOT/stage<N>/<unit>/<arm>/r<k>"` (`--resume` when that run exists) and
`--max-refusals 1000000`: the experiment reports rates and the rules decide, not rate-check's 4b
threshold. A unit's arms are launched together, one rate-check each, in a seeded random order. Each
arm runs `floor(256,000 / its full-document max_tokens)` draws at a time (4 for Sonnet, 2 for Opus 5.5),
which reserves the same output-token rate limit per arm (`--parallel-budget`). rate-check's exit 1 (a
cell UNRELIABLE or INCOMPLETE) is a result; exit 2 stops the invocation.

## Cells and draws

A **unit** is one rate-check call per arm. A **cell**, the unit of analysis, is one document × one
language. Every unit except the sweeps holds one document, so the arms of a cell are drawn in the same
window. `cells.mjs` holds the design as data; `run-stages.mjs --plan` prints it in full.

| Cells | Role | Arms × draws | Feeds |
|---|---|---|---|
| 12 fixture cells (3 × 4 languages) | gating | s5, s55, o55 × 12 | R0, R2-pooled, R2 guard, R4, R5 |
| 3 head-raw cells | gating | s5, s55, o55 × 12 | R0, R2 guard, R3, R4, R5 |
| 5 safety probes (zh-cn) | probe | s55 × 6, o55 × 6, s5 × 3 | R3 (production lectures), descriptive |
| 2 long-tail cells | descriptive | s5, s55, o55 × 2 | truncation, descriptive |
| 261 sweep cells (234 lectures; 27 also in fa) | sweep | s55 × 1, s5 × 1 | R3 |
| 3 reference-ml cells | advisory | s5, s55, o55 × 6 | ml lints, R3 |
| 4 Stage 0b cells | advisory | s5@v0.29.5, s5 × 12 | advisory A/A |

`corpus.yml` pins every document: repository commit, path, sha256 and size, resolved with `gh api` on
2026-10-20, plus the editions that hold each lecture (production status). Every named lecture exists
at its pinned commit, so none was substituted; `prospects_bounded_rationality.md` is in lecture-python.myst.
`sir_model.md` is in the zh-cn edition, so a refusal there is a production refusal. `jax_nn.md` and
`keras.md` (lecture-jax) are in no edition. The reference-ml sources are byte-identical to
lecture-python-programming@b0c58ab. The sweep is pinned file by file, one directory per repository,
because names repeat across repositories (`intro.md`) and across classes (`numpy.md`).

## Metrics

Each draw is classified by rate-check from init's run report (`init --report-json`): ok; failed, by
failure kind (model-refusal with its category, truncated, parity, unexpected-stop, too-large,
incomplete, no-text, api-error, auth, error, or a finished draw with no report); or infra (a 429, 5xx,
overload or connection error that outlasted the engine's retries, or a stream that a server error or a
dropped connection cut off part-way; of those the engine retries only an overload).

- **Structural failure rate** (R2): every non-infra failure except a model refusal or an auth failure,
  over valid draws (completed minus infra). A crash counts.
- **Refusal rate** (R3): model refusals over valid draws, with their `stop_details` categories.
- **Infra share** (R0): infra attempts over completed attempts, per arm, with the difference between
  arms; replaced infra attempts stay in the share.
- **Output tokens per successful draw** (R4): from each report's usage, over ok draws with no retried
  attempt.
- **Cost per delivered file** (R5): all reported spend in a cell × arm, failed and infra attempts
  included (an attempt that threw before its final message reports no usage), over its ok draws.
  Input is priced under one fixed cache assumption, so that the run schedule does not
  move it: the cacheable prefix (the median cached tokens of a single-call draw) is written once per
  cell × arm and read by every later call.
- Reported, not gated: thinking tokens, latency (ok draws with no retry), served models (with fallbacks
  off, equal to the requested model; recorded so each arm can prove its identity), retries.

Orientation of every 2×2 table: `[[candidate failures, candidate successes], [baseline failures,
baseline successes]]`, candidate s55 (or o55), baseline s5. A one-sided test asks "candidate worse"
(`fisherExact(...).greater`), and a risk difference is candidate minus baseline. `summarize.mjs
--self-test` pins this end to end: s55 at 6/12 against s5 at 0/12 fails R2, and the reverse passes.

## Decision rules

Pre-registered. They decide whether the default flips. `summarize.mjs` evaluates them and
`RESULTS.md` reports each as PASS, FAIL or INCONCLUSIVE, with its reason.

- **R0: reliable data.** In every gating cell (Stage 1 and head-raw), each of s5 and s55 has:
  infra ≤ 10% of its attempts; at least 12 valid draws; no auth failure; every response served by
  the arm's own model (fallbacks are off); both arms drawn in the same launch, on the pinned engine,
  with identical engine and glossary hashes. Remedy: a cell above 10% infra is re-run whole (all
  arms, a new attempt, preferably another day), and both tables are reported. A cell at or under 10%
  infra with fewer than 12 valid draws is topped up with `--redraw-infra`. No other rule is read
  until R0 passes. R0 also reports infra per arm, and the difference between the arms.
- **R1: engine neutral for Sonnet 5 (deterministic, $0).** `engine-aa.mjs` runs v0.29.5, built with
  its own dependencies (SDK 0.78), and the engine under test against the same fake API, for s5 on every
  Stage 1 fixture × language. The request bodies must be byte-identical. Headers may differ only in SDK
  identification (`user-agent`, `x-stainless-*`); RESULTS.md explains any other difference. The
  end_turn, max_tokens and mid-stream-overload streams must give the same outcome class and the same
  number of requests. The refusal stream must fail the file with model-refusal under the engine under
  test, the intended change of D-2026-10-19; what v0.29.5 made of it is recorded. Stage 0b's
  stochastic A/A is advisory: at 12 v 12 it has almost no power, and it scores both arms by the legacy
  no-output-file rule.
- **R2: structure not worse.** The metric is the structural failure rate. Refusals belong to R3.
  - **R2-pooled (non-inferiority):** pooled over all 12 Stage 1 cells, the one-sided 95% upper bound of
    the Mantel–Haenszel risk difference (s55 − s5, Sato–Greenland–Robins variance) is below
    **δ = 6.5 percentage points**. If neither arm has a structural failure, the bound is the one-sided
    95% Wilson bound of 0 in s55's draws (1.8% at 144). The exact stratified test (the convolution of
    the per-cell hypergeometrics) is reported, advisory.
  - **R2 guard (release step 4b's procedure, [D-2026-10-09](../../.qe/dev/decisions/D-2026-10-09-rate-check-failure-control.md)):**
    a gating cell is triggered when s55 shows at least 2 structural failures in its base draws and
    more than s5's. The control is 24 more draws for each of s55 and s5 on that cell, same day, arms
    together. The cell blocks the flip if the one-sided Fisher test (s55 worse) on the totals, 36 v 36,
    gives p < 0.05.
  - The per-cell Fisher test on the base 12 v 12 is reported, advisory: underpowered cells cannot gate.
- **R3: no refusals on production content.** Stage 3 sweeps every lecture of the three production
  source repositories at s55 × 1 and s5 × 1 (zh-cn, plus fa for lecture-python-programming). The Stage
  2 probes, head-raw, long-tail and reference-ml cells add their draws. A lecture is production when an
  edition holds it at the pinned edition commit (`corpus.yml`). Any s55 refusal on a production lecture
  triggers 12 more draws for each of s55 and s5 on that lecture and language. The flip is blocked if
  s55 refuses again in any of those 12, or if its refusals on that lecture exceed s5's at one-sided
  Fisher p < 0.05, until a mitigation is decided (a retry or a fallback, with provenance). Every
  production lecture needs at least one valid s55 draw, else R3 is inconclusive. Refusals on lectures
  in no edition are reported, not blocking. A pass bounds the per-draw refusal rate on production
  content: 0 refusals in N valid draws gives a one-sided 95% upper bound of 1 − 0.05^(1/N), about
  1.2% at the ~250 production draws of the sweep.
- **R4: no new truncation exposure.** Take the cells of Stages 1–2 where s5 and s55 each have at
  least 6 successful draws with no retried attempt. In each, compute the ratio of mean output tokens,
  s55 / s5. Aggregate the cells into a geometric mean, with a one-sided 95% upper bound from a seeded
  cell-level bootstrap (10,000 resamples). R4 passes if the bound is **≤ 1.10**. The two models share
  the tokenizer and the 64,000-token full-document cap, so truncation exposure scales with this ratio.
  At 1.10, the production lectures within 10% of the cap, at the 0.566 tokens per byte measured in fr,
  are `phillips_drifts_volatilities` (111,830 bytes) and `long_run_risk_operator` (103,955 bytes).
  `two_computation` (121,374 bytes) is over the cap already at s5. All three are in the zh-cn edition,
  whose rate per byte is unmeasured. Truncations are reported per cell, descriptively: the long-tail
  cells are 2 v 2 and cannot gate (#227).
- **R5: cost.** Over the same cells, compute the cost per delivered file (above). Take the geometric
  mean of the per-cell s55 / s5 ratios, with a seeded bootstrap 95% interval. R5 passes if the mean is
  **≤ 1.25**. Above that, the flip waits for an explanation; R5 does not block it. Output tokens per
  delivered file are reported beside it, since the cache and the schedule cannot move them.
- **Advisory, never gating:** the judge and the ml lints (below). A clear adverse result triggers a
  native-review check for that edition before its default moves. For the judge, that means the
  pair-level sign test gives p < 0.05 against s55 in a language, beyond its A/A range. For the ml
  lints, it means a keep-English shift with a stratified Mann–Whitney p < 0.05. Meanwhile the edition
  can pin `claude-model: claude-sonnet-5`.
- **Opus 5.5:** the same measures are reported for o55 against s5 (R2-pooled, R4 and R5 as
  information, refusals and truncations per cell). They inform #334's options and the bulk-seed model.
  No default changes here.

**The decision.** R0 must pass before anything else is read. The flip is supported when R1 passes
(or every listed header difference is explained) and R2-pooled, the R2 guard, R3 and R4 pass; R5 must
be computable, and above 1.25 it needs its explanation. A FAIL on R1, R2, R3 or R4 keeps
`claude-sonnet-5`. Even a supported flip has measured only the whole-document path; the decision
record has to say so (below). The release that carries the flip runs release steps 4a and 4b on its
tag, as every release does.

### Power: what a pass can and cannot show

Computed exactly (binomial and hypergeometric enumeration) or by seeded simulation, before any draw:

- **12 v 12 in one cell** (one-sided Fisher, α 0.05) has 80% power only when s55's rate reaches 51%
  against s5's 4% (42% against 0%; 61% against 10%). It resolves differences of about 45–50 points,
  which is why no per-cell test gates.
- **R2-pooled at δ = 6.5 points** (12 cells × 12 draws per arm): when s55 equals s5, it passes with
  probability 0.94 at a 3% base rate, 0.82 at 5% and 0.70 at 7%. At the measured rates (game-theory
  4–6%, fixtures 25 and 28 near 1%) that probability is 0.98. When s55 is worse by exactly δ, it passes
  with probability 0.05–0.09. A margin of 5 points would need about 235 draws per arm, and 3 points
  about 650. The superiority test the draft rules used (pooled one-sided Fisher, "p ≥ 0.05 passes")
  would let s55 through about two times in three while doubling a 4–6% rate. That is why the rule is
  now a non-inferiority bound.
- **R2 guard:** with s5 and s55 equal at 4%, it blocks a neutral flip 2.3% of the time across the 12
  cells (8.2% at 7%). It catches one language whose rate rises from 4% to 29%, 20% or 15% in all three
  of its cells with probability 0.99, 0.84 and 0.55. The draft clause ("≤ 1 failure in 12 unless s5
  exceeds it") would have blocked a flip to an exactly-as-good model with probability 0.29 from the
  four game-theory cells alone, and about 0.65 across all 12 cells if fixtures 25 and 28 fail as often.
- **R3:** with 6 probe draws, a lecture that refuses 10% of the time shows no refusal with probability
  0.53. The sweep plus the 12-draw redraw is what bounds production refusals (above).
- **R4 and R5** bound a ratio measured on every cell, not a rare event, so 12 or more cells resolve a
  few percent.

## Advisory instruments

**`judge.mjs`, the blind pairwise judge** (default `claude-opus-4-8`). It reads Stage 1–2 drafts and
runs the pairs s55:s5 and o55:s5, plus the A/A calibration pairs s5:s5 and s55:s55: two different
drafts of one arm, in the same job.

- **Pairing.** Drafts are paired by a seeded shuffle within a cell, at most 6 pairs.
- **Sections.** The engine's `MystParser` splits the source and both drafts into sections. A pair
  whose section counts differ is skipped, and the skips are counted per arm: that is structural drift,
  a finding in itself. Each kept pair is judged on 4 sections sampled by a seeded hash.
- **Order.** Every section is judged in both display orders. A section counts as a win only when the
  two orders agree. Otherwise it is a tie, and it is counted as order-inconsistent, the measure of
  position bias.
- **Aggregation.** Wins aggregate to the draft pair (the majority over its sections) before a sign
  test, because sections of one pair are not independent.
- **Prompt.** The judge sees the edition's language rules and the glossary terms in the section,
  never an arm or a model name. It is asked for strict JSON through a JSON-schema `output_config.format`,
  merged with the policy's own `output_config`. Its call goes through `modelRequestParams`,
  `maxTokensFor`, `assertCompleteResponse` and `extractResponseText` from `dist/models.js`. A refusal,
  truncation, API error or unparseable verdict becomes an ERROR row; `judgements.jsonl` is append-only,
  and a rerun retries the ERROR keys.
- **Report.** Per pair × language, `judge-summary.json` reports wins, losses and ties for pairs and
  for sections, the sign-test p, the A/A deviation, first-shown win share, win share by tercile of
  length difference, skipped pairs and cost. A judge in an arm's model line, such as an Opus judging
  o55, is flagged as a lineage-bias risk.
- **Guards.** The script refuses a judge that is any judged arm's model.
- **Trigger.** s55 loses to s5 at pair level with a two-sided sign-test p < 0.05, and its share lies
  outside the A/A range for that language.

**`ml-lints.mjs`, the ml lints.** It runs `experiments/ml-benchmark/scripts/ml_metrics.py` on every
successful ml draft. The script is never edited. Its CLI is `--output <draft> --source <English>
--glossary <repo>/glossary/ml.json --json`, run from the repository root: its default glossary path is
relative. Exit 1 only means a FAIL gate fired, and that is recorded. The unit of the keep-English
comparison is one draft: its mean per-paragraph Malayalam share (`script_ratio.output.mean`; the
script prints no per-paragraph values), with n = 6 per arm per lecture in Stage 4 and 12 in Stage 1.
Each candidate is compared with fresh s5 drafts of the same lectures, never with the reference. The
test is an exact Mann–Whitney that permutes within each lecture (`mannWhitneyStratified`), two-sided.
The editor's reference pages are scored once, for context.

**ml (the edition).** Neither instrument can clear s55 for ml. The reference pages are the editor's
post-edits of `claude-sonnet-5` seeds (round 3 `matplotlib`, round 4 `numpy`), and `ml_metrics` and
`ml_repair` encode error classes found in Sonnet 5 drafts, so a reference-based measure favours s5 by
construction. The convergence series continues on s5 (#393). **The ml edition stays pinned to
`claude-sonnet-5`** (`claude-model: claude-sonnet-5` in its workflow, and `init -m claude-sonnet-5`
for its drafts) until one native-review round on an s55 draft, whatever the advisory results. The ml
round series splits where its model changes.

## What this does NOT cover

- **The section-level sync path and the reviewer.** The flip changes `DEFAULT_CLAUDE_MODEL`, which
  both use, but this protocol measures rates only on whole-document `init`. Bulk seeds have already
  moved to Opus 5.5, so in production that path is mainly the sync of new or renamed lectures (#326).
  The section path and the reviewer get one draw per scenario, in Stage 5. Powered cells for them were
  considered and deferred: no CLI entry drives the sync section path, and building one here would
  re-implement the sync write path. The flip's decision record must say "unmeasured as a rate on the
  section path and the reviewer".
- **Forward resync**, which stays confounded until #348 lands.
- **Native-speaker judgement**: the judge is a model. **fa quality**: there is no human reference.
- **Refusal fallbacks**, which stay off. The rate measured is the rate without them.
- **Capacity.** Sonnet 5.5 has its own rate-limit pool (#342). Infra share per arm is reported, but
  this is not a load test, and latency is not measured under production concurrency.

## Outputs (what gets committed)

- Now: this README, `corpus.yml`, and the scripts:
  - `cells.mjs`, the design;
  - `fetch-corpus.mjs`;
  - `run-stages.mjs`, the driver;
  - `results.mjs` and `rules.mjs`, the reading and the rules;
  - `summarize.mjs`;
  - `engine-aa.mjs` and `fake-api.mjs`, R1 and the $0 harness;
  - `judge.mjs`, `ml-lints.mjs` and `lib.mjs`.
- After the run, from `summarize.mjs`: `RESULTS.md`, `results.json`, and `records/`, the machine
  output `RESULTS.md` quotes:
  - `summaries.json` (every rate-check `summary.json`, with its run's meta);
  - `draws.jsonl` (one line per draw: outcome, kind, category, tokens, cost, latency, served model);
  - `engine.json` and `manifest.jsonl` (the launches);
  - `engine-aa.json`;
  - `judge-summary.*.json` and `judged-drafts.*.json` (the sha256 of every draft judged);
  - `ml-lints-summary.json`.
- The raw drafts and logs stay in `EVAL_ROOT`, outside the tree. The default,
  `~/.cache/action-translation/claude-5-5-eval`, is durable: the OS cleans `$TMPDIR`, and the judge and
  `summarize.mjs` read earlier stages' drafts days later. `run-stages.mjs` refuses a temporary root
  for Stage 1 and later unless `--allow-tmp`.
- The flip itself is a separate PR, with a decision record that cites `RESULTS.md`.

Dry runs cost nothing. Preloading `fake-api.mjs` (`node --import`, or `NODE_OPTIONS=--import=…` for
the CLI child processes) runs the whole pipeline against a fake Messages API: `run-stages.mjs` →
`rate-check.sh` → `translate init --report-json` → `summarize.mjs`, `judge.mjs` and `ml-lints.mjs`.
It was used this way before pre-registration. `summarize.mjs --self-test`, which CI runs, checks the
rule verdicts on synthetic roots.

## Incidents

None yet. Anything that departs from this protocol while it runs, such as a re-run, a stopped stage,
a changed engine or a corpus problem, is recorded here with its date. The rules above are not edited.

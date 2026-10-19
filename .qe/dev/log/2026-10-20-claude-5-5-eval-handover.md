# 2026-10-20 — handover: the Claude 5.5 evaluation and the work left, for @mmcky's local machine

**Trigger**: The engine can call Claude Sonnet 5.5 and Opus 5.5 (#394), but no billed call has
been made: this session had no API key. The evaluation has moved from #395's one-off experiment
to a standing golden set in QuantEcon/test-action-translation (decision
`D-2026-10-20-model-upgrades-measured-against-goldens`). The billed runs and the rest of the
build continue on @mmcky's machine. It has the key, so each step can be tried against the real
API as it is built.

**State, read live on 2026-10-20**:

- **`main` is at `f011f93`.** The default is still `claude-sonnet-5`; nothing live has changed.
- **#394** (`feat/claude-5-5-models`; CI green; mergeable, clean) is ready to merge. It brings:
  - the per-model request policy: Sonnet 5.5 runs `between_tools` at effort `high`; Opus 5.5 and
    Fable run adaptive at `medium`, with larger output caps because they always think;
  - refusal handling: a refusal fails the file instead of being written;
  - SDK 0.131.0.

  Sonnet 5's request bytes are unchanged, and tests pin them.
- **#395** (`feat/claude-5-5-eval`; stacked on #394; clean) needs a trim before it merges (work
  item 2).
  - **What stays:** `translate init --report-json`, `model-pricing.ts`, `run-report.ts`, and
    `rate-check.sh` with `--source-dir`, `--localize`, `--model`, `--run-dir`/`--resume` and
    `--engine-dir`. rate-check now classifies each failure and gives Wilson intervals.
  - **What goes:** `experiments/claude-5-5-upgrade/` and its test, which the decision
    supersedes.
- **`feat/default-sonnet-5-5`** (`919a342`; pushed, no PR) is one WIP commit on top of #395.
  - **What it does:** it flips the default to `claude-sonnet-5-5` in `models.ts`, `action.yml`
    and the docs. It also makes rate-check's `--model` default to the engine's own
    `DEFAULT_CLAUDE_MODEL`.
  - **Its state:** it builds, but `npm test` fails 5 tests in `eval-tooling.test.ts`, all caused
    by the rate-check change. The commit message names them and gives the fix.
  - **When it becomes a PR:** only after the evaluation passes.
- **#376** (`sync-scope: existing`) is also open against `main`. Whichever of it and #394 merges
  second resolves a `CHANGELOG.md` conflict and rebuilds `dist-action/`.
- **QuantEcon/test-action-translation is at `c35a5ff`.** It holds:
  - the 18 goldens (ml 6, fr 6, zh-cn 3, fa 3): 52 files, each pinned by sha256 and size, all
    verified by a real fetch;
  - the fetcher and 21 offline tests;
  - `DESIGN.md`, the `model-eval` spec: scoring, rules, tests and cost;
  - `AGENTS.md`.

  `model-eval` itself is not built.

## The runs (@mmcky, locally, with `ANTHROPIC_API_KEY`)

**Setup.** Keep the engine in its own worktree, so the main checkout is left as it is:

```bash
AT=~/work/quantecon/action-translation
EV=~/work/quantecon/at-claude-5-5-eval        # the engine under test: #395
TAT=~/work/quantecon/test-action-translation
ROOT=~/.cache/test-action-translation/claude-sonnet-5__claude-sonnet-5-5   # model-eval's default root
git -C "$AT" fetch origin
git -C "$AT" worktree add "$EV" feat/claude-5-5-eval
(cd "$EV" && npm ci && npm run build)
git -C "$TAT" pull --ff-only
(cd "$TAT" && npm install && npm run fetch -- --out "$ROOT/goldens")
export ANTHROPIC_API_KEY=…
```

**1. Smoke: #342's live check, under $1.** One fr draft from each new model:

```bash
for M in claude-sonnet-5-5 claude-opus-5-5; do
  "$EV/tool-test-action-on-github/rate-check.sh" --source-dir "$ROOT/goldens/fr-oop_intro/src" \
    --fixtures oop_intro.md --languages fr --localize default --model "$M" \
    --draws 1 --parallel 1 --run-dir "$ROOT/smoke/$M"
done
```

**The smoke passes when:**
- each run exits 0;
- the cell reads 1/1 ok;
- the cell's `servedModels` in `summary.json` is the requested model.

**If either model returns a 400, stop.** It means the request policy is wrong for that model:
fix #394 before drawing anything else. Post both results on #342.

**2. Drafts: the evaluation's billed part, about $36.** Draw 6 drafts per golden from each
Sonnet: ml $13.4, fr $10.1, fa $7.0 and zh-cn $5.2 at list prices.
- **Layout.** The drafts go where `model-eval` will look for them, `<root>/runs/<id>/<model>`.
  Building the scorer afterwards then costs nothing, and nothing has to be drawn again.
- **No spend cap.** The loop has none (`model-eval` will stop at 1.5× its plan).
- **Stopping.** Ctrl-C stops it, and a rerun resumes.
- **Exit codes.** A cell that exits 1 is a result. Exit 2 is a setup error and stops the loop.

```bash
(cd "$TAT" && node --input-type=module -e "import {loadManifest,goldensOf} from './lib/manifest.mjs'; for (const g of goldensOf(loadManifest())) console.log(g.id, g.language, g.localize, g.lecture)") > "$ROOT/goldens.txt"
while read -r id lang loc lecture; do
  for M in claude-sonnet-5 claude-sonnet-5-5; do
    RUN="$ROOT/runs/$id/$M"; RESUME=""; [ -f "$RUN/meta.txt" ] && RESUME=--resume
    rc=0
    "$EV/tool-test-action-on-github/rate-check.sh" --source-dir "$ROOT/goldens/$id/src" \
      --fixtures "$lecture" --languages "$lang" --localize "$loc" --model "$M" --draws 6 \
      --max-refusals 1000000 --parallel 6 --run-dir "$RUN" $RESUME < /dev/null || rc=$?
    [ "$rc" -eq 2 ] && { echo "setup error: $id $M"; break 2; }
    [ "$rc" -eq 130 ] && break 2
  done
done < "$ROOT/goldens.txt"
```

The spend so far, from the per-draw reports:

```bash
find "$ROOT" -name '*.json' -exec jq -r 'select(.schema? == "translate-init-report/1") | .costUSD // 0' {} + | awk '{s+=$1} END {printf "$%.2f\n", s}'
```

**The optional third arm**, `claude-opus-5-5`, is the same loop with `for M in claude-opus-5-5`.
It costs about $47 more, its thinking cost is unmeasured, and the report shows it as INFO only.
Run it after the Sonnet pair.

**Keep `$ROOT`.** The drafts are the evidence, and drawing them again costs money.

## The work left, in order

1. **Merge #394.** It changes no default.
2. **Trim #395, then merge it.**
   - Delete `experiments/claude-5-5-upgrade/` and `src/__tests__/claude-5-5-eval.test.ts`.
   - Rewrite its CHANGELOG entry, its STATE.md bullet and its log
     (`log/2026-10-20-claude-5-5-eval.md`) so they describe what stays and point at
     test-action-translation and the decision.
   - Retarget it to `main` once #394 is in, run `npm run build` and `npm test`, then grep for
     `claude-5-5-upgrade`. Only logs should still name it.
3. **Build `model-eval`** in test-action-translation, following `DESIGN.md`:
   - write `lib/score.py`, `lib/rules.mjs` and `bin/model-eval.mjs`, with the offline tests it
     lists;
   - check the prose stripper on real ml drafts before trusting any number from it;
   - run `model-eval --yes` with the drafts' root. It resumes every cell and draws nothing new;
   - write the report (`reports/<date>-claude-sonnet-5-5-vs-claude-sonnet-5/`) and run
     `--record`.
4. **Add the `/model-upgrade` skill and checklist** in this repository:
   `.claude/skills/model-upgrade/SKILL.md`, `docs/developer/model-upgrades.md`, and an AGENTS.md
   checklist entry, all pointing at test-action-translation. Its steps are the ones in that
   repository's README:
   - engine readiness;
   - evaluate;
   - decide per language;
   - flip.

   This session could not write to `.claude/skills/`.
5. **The flip**, once the report is in:
   - Open `feat/default-sonnet-5-5` as a PR and fix its 5 failing tests.
   - Add the CHANGELOG entry and a decision record citing the report.
   - Before `v0` moves, pin `claude-model: claude-sonnet-5` in the workflows of each edition whose
     language did not PASS.
   - At that release, step 4b compares models, not just request bytes. The same-day control at
     the previous tag draws `claude-sonnet-5`, because rate-check now takes each engine's own
     default. A clearly higher rate at the new tag therefore belongs to the new model, and it
     fails the gate.
6. **Add CI to test-action-translation**: `npm test` and `score.py --self-test` on PRs, with no
   API key. The workflow file needs the `workflow` scope to push, so it is @mmcky's to push.
7. **Optional:** the Opus 5.5 arm above, and a refusal sweep over `lecture-python-programming` in
   zh-cn (about $3).

**STATE.md is unchanged here.** #394 and #395 each carry a STATE bullet for the upgrade, and the
trim in item 2 rewrites #395's.

#!/usr/bin/env bash
# rate-check.sh — N-draw failure-rate check on full-document translations (release checklist 4b).
#
# The release gate (test-action-on-github.sh) takes ONE draw per scenario through the action
# path, so a model-side defect that fails less than always can pass it: scenario 17's fixture
# was refused by the structural-parity guard on ~40% of draws from v0.28.0 to v0.29.0 and
# passed three gates (#320). This script measures the rate directly. It runs the CLI at the
# requested engine N times per fixture and language, classifies every draw, and fails if any
# cell shows more than --max-refusals failures. No GitHub runs: the cost is
# draws x fixtures x languages CLI translations against a cached prompt.
#
# Usage: ./tool-test-action-on-github/rate-check.sh [--ref <tag|branch> [--ref-deps shared|own]]
#            [--engine-dir DIR] [--draws N] [--languages ml,fa,zh-cn] [--fixtures game-theory.md]
#            [--source-dir DIR] [--localize none|default|RULES] [--parallel J]
#            [--max-refusals K] [--model M] [--run-dir DIR [--resume] [--redraw-infra]]
#            [--summarize DIR]
#
#   --ref            engine to test. Default: this checkout's dist/ and glossary (build first).
#                    With a ref, a temporary worktree at that ref is compiled with `npx tsc`
#                    and its own glossary is used, so old versions can be measured too.
#   --ref-deps       with --ref. `shared` (default): the worktree borrows this checkout's
#                    node_modules, so the ref runs on THIS checkout's SDK. `own`: `npm ci` from
#                    the ref's own lockfile (needs the npm registry), so it runs on the SDK it
#                    shipped with. meta.txt records the SDK actually loaded either way.
#   --engine-dir     an engine already built elsewhere (its dist/, glossary/, node_modules), e.g.
#                    a worktree you ran `npm ci && npx tsc` in yourself. Exclusive with --ref.
#   --draws          draws per fixture x language (default 12 — six per arm gave the right
#                    direction and the wrong story on 2026-09-21)
#   --languages      comma list; default: every language in test-action-on-github.sh
#   --fixtures       comma list of .md file names in the source directory (no paths). Default:
#                    game-theory.md, the document scenario 17 introduces as NEW.
#   --source-dir     take the fixtures from DIR instead of test-action-on-github-data/ (e.g. a
#                    directory of pinned real lectures)
#   --localize       `none` (default, as before); `default`, which passes no --localize so the
#                    engine applies its own default rules; or a rule list for init --localize.
#                    Checked once against the engine before any draw.
#   --parallel       concurrent CLI runs (default 6)
#   --max-refusals   most failures a cell may show and still pass (default 1)
#   --model          Claude model (default claude-sonnet-5, the production default)
#   --run-dir        write the run to DIR instead of a new directory under
#                    ${TMPDIR:-/tmp}/action-translation-rate-check/. Refused inside the
#                    repository, and refused when DIR already holds a run, unless --resume.
#   --resume         continue the run in --run-dir: draws with a completion marker are kept,
#                    unfinished ones are drawn again. The engine and inputs must match the run's
#                    meta.txt (commit, dist/ and glossary hashes, SDK, model, localize, fixtures and
#                    their hashes, languages, report mode), or it exits 2. --draws may grow, not shrink.
#   --redraw-infra   with --run-dir (implies --resume): move every draw whose current attempt was
#                    an infra failure aside to <i>.infra<k>.* and draw it again. The replaced
#                    attempts stay in the cell's infra share. Needs an engine with --report-json.
#   --summarize DIR  re-read a run directory (no new draws), print its table, exit with its verdict
#
# Classification. When the engine's `init --help` lists --report-json (feature-detected), every
# draw writes a JSON report and is classified from it: ok; failed (model refusal with its
# category, truncation, structural parity, ...; a finished draw with no report counts as failed);
# or infra (429 / 5xx / overload / connection error that outlasted the engine's retries, or a
# stream cut off part-way, which is retried only for an overload). Infra draws leave both
# numerator and denominator. Verdict per cell, first match wins: FAIL when the failures exceed
# --max-refusals; INCOMPLETE when a planned draw never finished; UNRELIABLE when infra exceeds
# 10% of the cell's attempts (no verdict: re-run the cell); otherwise ok. An engine
# without --report-json (v0.29.5 and older) keeps the original rule: every draw that wrote no
# output file counts as refused, infra included. Every cell of summary.json carries that legacy
# count too, each draw judged on its first attempt, so a run on each kind of engine can be
# compared on one rule.
#
# The run directory (outside the repository — D-2026-09-21-no-scratch-in-tree):
#   meta.txt                          KEY='value' lines: engine identity and hashes, flags, inputs
#   _src/                             the fixtures and the _toc.yml init reads
#   <lang>/<fixture stem>/<i>/        init's target directory (the translation, on success)
#   <lang>/<fixture stem>/<i>.log     the CLI's output
#   <lang>/<fixture stem>/<i>.json    init's run report (engines with --report-json)
#   <lang>/<fixture stem>/<i>.exit    completion marker: exit=<code>, start=, end= (UTC)
#   <lang>/<fixture stem>/<i>.infra<k>.{exit,json,log} and <i>.infra<k>/   replaced infra attempts
#   summary.txt, summary.json         the table and the machine-readable tally (rate-check-summary.mjs);
#                                     a resume removes them before it draws, and a --summarize that
#                                     writes none leaves the old pair as summary.prev.* (never read)
#
# Exit 0 = every cell ok; 1 = a cell is FAIL, UNRELIABLE or INCOMPLETE; 2 = usage or setup error;
# 130 = interrupted (SIGINT or SIGTERM: the draws in flight are stopped and stay unfinished).

set -euo pipefail

# The real path: node runs the helpers below by their real paths, whatever spelling $0 used.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
DATA_DIR="$SCRIPT_DIR/test-action-on-github-data"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT_REAL="$(cd "$REPO_ROOT" && pwd -P)"
MAIN_SCRIPT="$SCRIPT_DIR/test-action-on-github.sh"
SUMMARIZER="$SCRIPT_DIR/rate-check-summary.mjs"
IDENTITY="$SCRIPT_DIR/lib/run-identity.mjs"

REF=""; REF_DEPS=""; ENGINE_DIR_ARG=""; DRAWS=12; LANGS=""; FIXTURES="game-theory.md"
SOURCE_DIR_ARG=""; LOCALIZE="none"; PARALLEL=6; MAX_REFUSALS=1; MODEL="claude-sonnet-5"
SUMMARIZE=""; RUN_DIR_ARG=""; RESUME=0; REDRAW_INFRA=0

usage_error() { echo "$1 (try --help)" >&2; exit 2; }
need_value() { if [ -z "${2-}" ]; then usage_error "$1 needs a value"; fi; }

while [ $# -gt 0 ]; do
    case "$1" in
        --ref) need_value "$1" "${2-}"; REF="$2"; shift 2 ;;
        --ref-deps) need_value "$1" "${2-}"; REF_DEPS="$2"; shift 2 ;;
        --engine-dir) need_value "$1" "${2-}"; ENGINE_DIR_ARG="$2"; shift 2 ;;
        --draws) need_value "$1" "${2-}"; DRAWS="$2"; shift 2 ;;
        --languages) need_value "$1" "${2-}"; LANGS="$2"; shift 2 ;;
        --fixtures) need_value "$1" "${2-}"; FIXTURES="$2"; shift 2 ;;
        --source-dir) need_value "$1" "${2-}"; SOURCE_DIR_ARG="$2"; shift 2 ;;
        --localize) need_value "$1" "${2-}"; LOCALIZE="$2"; shift 2 ;;
        --parallel) need_value "$1" "${2-}"; PARALLEL="$2"; shift 2 ;;
        --max-refusals) need_value "$1" "${2-}"; MAX_REFUSALS="$2"; shift 2 ;;
        --model) need_value "$1" "${2-}"; MODEL="$2"; shift 2 ;;
        --run-dir) need_value "$1" "${2-}"; RUN_DIR_ARG="$2"; shift 2 ;;
        --resume) RESUME=1; shift ;;
        --redraw-infra) REDRAW_INFRA=1; RESUME=1; shift ;;
        --summarize) need_value "$1" "${2-}"; SUMMARIZE="$2"; shift 2 ;;
        -h|--help) sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) usage_error "unknown argument: $1" ;;
    esac
done

command -v node >/dev/null || { echo "node not found" >&2; exit 2; }

# The tally, its table and the verdict (rate-check-summary.mjs), returned as its exit code. The
# code is captured in this shell — a `… | tee` here would put the verdict in a subshell and exit 0
# every time (it did, on the first validation run). The old summary is set aside first, and a
# summarizer that exits 0 or 1 without writing summary.json is a setup error: a verdict is only
# ever read from a summary written for these draws. The old one is kept, as summary.prev.*, only
# when no new one replaced it.
summarize_run() {
    local dir=$1 status=0 f
    for f in txt json; do
        if [ -e "$dir/summary.$f" ]; then mv -f "$dir/summary.$f" "$dir/summary.prev.$f"; fi
    done
    node "$SUMMARIZER" "$dir" || status=$?
    if [ "$status" != 2 ] && [ ! -s "$dir/summary.json" ]; then
        echo "rate-check-summary.mjs wrote no summary.json in $dir (exit $status): no verdict" >&2
        status=2
    fi
    if [ -s "$dir/summary.json" ]; then rm -f "$dir/summary.prev.txt" "$dir/summary.prev.json"; fi
    return "$status"
}

# --summarize: re-read a run (its meta.txt carries what the table needs) and exit with the
# verdict the run gave. No API key, no draws.
if [ -n "$SUMMARIZE" ]; then
    [ -f "$SUMMARIZE/meta.txt" ] || { echo "no meta.txt in $SUMMARIZE" >&2; exit 2; }
    STATUS=0
    summarize_run "$SUMMARIZE" || STATUS=$?
    exit "$STATUS"
fi

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then echo "ANTHROPIC_API_KEY must be set" >&2; exit 2; fi

is_uint() { case "$1" in ''|*[!0-9]*) return 1 ;; *) return 0 ;; esac; }
if ! is_uint "$DRAWS" || [ "$DRAWS" -lt 1 ]; then usage_error "--draws must be a positive integer"; fi
if ! is_uint "$PARALLEL" || [ "$PARALLEL" -lt 1 ]; then usage_error "--parallel must be a positive integer"; fi
if ! is_uint "$MAX_REFUSALS"; then usage_error "--max-refusals must be a non-negative integer"; fi
case "$REF_DEPS" in ''|shared|own) ;; *) usage_error "--ref-deps must be shared or own" ;; esac
if [ -n "$REF_DEPS" ] && [ -z "$REF" ]; then usage_error "--ref-deps applies only with --ref"; fi
if [ -n "$REF" ] && [ -n "$ENGINE_DIR_ARG" ]; then usage_error "--ref and --engine-dir are exclusive"; fi
if [ "$RESUME" = 1 ] && [ -z "$RUN_DIR_ARG" ]; then usage_error "--resume and --redraw-infra need --run-dir (the run to continue)"; fi

# Fixture source: the harness fixtures, or --source-dir (absolute from here on: the CLI runs
# from the engine directory).
SOURCE_DIR="$DATA_DIR"; SOURCE_DIR_META=""
if [ -n "$SOURCE_DIR_ARG" ]; then
    [ -d "$SOURCE_DIR_ARG" ] || usage_error "--source-dir is not a directory: $SOURCE_DIR_ARG"
    SOURCE_DIR="$(cd "$SOURCE_DIR_ARG" && pwd -P)"
    SOURCE_DIR_META="$SOURCE_DIR"
fi

# Languages come from the main script's LANGUAGES array ("code|Name" per line), so there is
# one list to maintain.
if [ -z "$LANGS" ]; then
    LANGS=$(awk '/^LANGUAGES=\(/{f=1;next} f&&/^\)/{exit} f{gsub(/[" ]/,""); sub(/\|.*/,""); print}' "$MAIN_SCRIPT" | paste -sd, -)
fi
IFS=',' read -ra LANG_LIST <<< "$LANGS"
IFS=',' read -ra FIXTURE_LIST <<< "$FIXTURES"
[ "${#LANG_LIST[@]}" -gt 0 ] || usage_error "--languages is empty"
[ "${#FIXTURE_LIST[@]}" -gt 0 ] || usage_error "--fixtures is empty"
SEEN=","
for lang in "${LANG_LIST[@]}"; do
    case "$lang" in ''|*[!A-Za-z0-9-]*) usage_error "--languages: not a language code: '$lang'" ;; esac
    case "$SEEN" in *",$lang,"*) usage_error "--languages lists $lang twice" ;; esac
    SEEN="$SEEN$lang,"
done
SEEN=","
for fx in "${FIXTURE_LIST[@]}"; do
    case "$fx" in
        */*|*[[:space:]]*|*"'"*) usage_error "--fixtures takes plain .md file names: '$fx' (use --source-dir for another directory)" ;;
        ?*.md) ;;
        *) usage_error "--fixtures: not a .md file name: '$fx'" ;;
    esac
    case "$SEEN" in *",$fx,"*) usage_error "--fixtures lists $fx twice" ;; esac
    SEEN="$SEEN$fx,"
    [ -f "$SOURCE_DIR/$fx" ] || { echo "fixture not found: $SOURCE_DIR/$fx" >&2; exit 2; }
done

# A path is in the repository when it is the root or below it, by either spelling of the root.
inside_repo() {
    case "$1/" in "$REPO_ROOT"/*|"$REPO_ROOT_REAL"/*) return 0 ;; esac
    return 1
}

# Run directory. --run-dir is made absolute before anything uses it: the CLI runs from the
# engine directory, so a relative path would land each draw somewhere else. The part of the
# path that exists is resolved through symlinks too, so the repository check comes before
# anything is created.
RUN_DIR_IS_NEW=1
if [ -n "$RUN_DIR_ARG" ]; then
    RUN_DIR="$(node -e '
        const path = require("path"), fs = require("fs");
        let dir = path.resolve(process.argv[1]); const rest = [];
        while (!fs.existsSync(dir)) { rest.unshift(path.basename(dir)); dir = path.dirname(dir); }
        process.stdout.write(path.join(fs.realpathSync(dir), ...rest));' "$RUN_DIR_ARG")"
    if inside_repo "$RUN_DIR"; then usage_error "--run-dir must be outside the repository (no scratch in the tree): $RUN_DIR"; fi
    if [ -f "$RUN_DIR/meta.txt" ]; then
        [ "$RESUME" = 1 ] || usage_error "$RUN_DIR already holds a run: pass --resume to continue it, or choose a new --run-dir"
        RUN_DIR_IS_NEW=0
    elif [ -d "$RUN_DIR" ] && [ -n "$(ls -A "$RUN_DIR")" ]; then
        usage_error "--run-dir $RUN_DIR is not empty and holds no rate-check run (no meta.txt)"
    fi
    if [ "$REDRAW_INFRA" = 1 ] && [ "$RUN_DIR_IS_NEW" = 1 ]; then usage_error "--redraw-infra: $RUN_DIR holds no run to continue"; fi
else
    STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)-$$"   # PID keeps two runs in one second apart
    RUN_DIR="${TMPDIR:-/tmp}/action-translation-rate-check/$STAMP"
fi
mkdir -p "$RUN_DIR"
RUN_DIR="$(cd "$RUN_DIR" && pwd -P)"   # symlink-free from here on
if inside_repo "$RUN_DIR"; then
    rmdir "$RUN_DIR" 2>/dev/null || true
    usage_error "--run-dir resolves into the repository (no scratch in the tree): $RUN_DIR"
fi

# One rate-check per run directory at a time; a lock whose process is gone is taken over.
# DONE is set only on the two ways out that carry a verdict, the end and a signal: any other exit
# leaves with 2, a `set -u` or `set -e` abort included (bash 3.2 reports such an abort to the EXIT
# trap as status 0, which would read as every cell passing).
WORKTREE=""; LOCK_DIR=""; DONE=""
cleanup() {
    if [ -n "$WORKTREE" ]; then
        if [ -L "$WORKTREE/node_modules" ]; then rm -f "$WORKTREE/node_modules"; fi
        git -C "$REPO_ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
    fi
    if [ -n "$LOCK_DIR" ] && [ "$(cat "$LOCK_DIR/pid" 2>/dev/null || true)" = "$$" ]; then rm -rf "$LOCK_DIR"; fi
    if [ -z "$DONE" ]; then exit 2; fi
}
# A signal stops every draw's CLI (run_one records each PID in the lock) and waits for them all,
# so the lock and a --ref worktree go only after the last writer has exited. A draw stopped this
# way writes no marker: it stays unfinished, and a resume draws it again.
on_signal() {
    trap '' INT TERM
    if [ -n "$LOCK_DIR" ]; then
        : > "$LOCK_DIR/stopping" 2>/dev/null || true
        for f in "$LOCK_DIR"/cli.*; do
            if [ -f "$f" ]; then kill -TERM "$(cat "$f" 2>/dev/null || true)" 2>/dev/null || true; fi
        done
    fi
    wait || true
    DONE=1
    exit 130
}
trap cleanup EXIT
trap on_signal INT TERM
if ! mkdir "$RUN_DIR/.lock" 2>/dev/null; then
    OTHER="$(cat "$RUN_DIR/.lock/pid" 2>/dev/null || true)"
    if [ -n "$OTHER" ] && kill -0 "$OTHER" 2>/dev/null; then
        echo "another rate-check (pid $OTHER) is using $RUN_DIR" >&2; exit 2
    fi
    # A rate-check killed outright (SIGKILL runs no trap) can leave draws running that still
    # write into the run: never take the run over while one of them is alive.
    for f in "$RUN_DIR"/.lock/cli.*; do
        CLI_PID="$(cat "$f" 2>/dev/null || true)"
        if [ -n "$CLI_PID" ] && kill -0 "$CLI_PID" 2>/dev/null; then
            echo "a draw of an earlier rate-check ($(basename "$f"), pid $CLI_PID) is still running in $RUN_DIR: let it finish or stop it" >&2; exit 2
        fi
    done
    echo "Taking over a stale lock in $RUN_DIR (pid ${OTHER:-?} is gone)"
    rm -rf "$RUN_DIR/.lock"; mkdir "$RUN_DIR/.lock"
fi
LOCK_DIR="$RUN_DIR/.lock"
echo "$$" > "$LOCK_DIR/pid"

# Engine under test: this checkout, a prepared --engine-dir, or a worktree at --ref compiled
# in place.
ENGINE_DIR="$REPO_ROOT"; ENGINE_MODE="checkout"
if [ -n "$ENGINE_DIR_ARG" ]; then
    [ -d "$ENGINE_DIR_ARG" ] || usage_error "--engine-dir is not a directory: $ENGINE_DIR_ARG"
    ENGINE_DIR="$(cd "$ENGINE_DIR_ARG" && pwd -P)"; ENGINE_MODE="engine-dir"
elif [ -n "$REF" ]; then
    ENGINE_MODE="ref"; REF_DEPS="${REF_DEPS:-shared}"
    WORKTREE="${TMPDIR:-/tmp}/rate-check-wt.$$"
    git -C "$REPO_ROOT" worktree add -q "$WORKTREE" "$REF" || { echo "cannot check out $REF" >&2; WORKTREE=""; exit 2; }
    if [ "$REF_DEPS" = own ]; then
        echo "Installing $REF's own dependencies (npm ci from its package-lock.json)..."
        (cd "$WORKTREE" && npm ci --ignore-scripts --no-audit --no-fund --loglevel=error) || { echo "npm ci failed in the $REF worktree" >&2; exit 2; }
    else
        ln -s "$REPO_ROOT/node_modules" "$WORKTREE/node_modules"
    fi
    echo "Compiling $REF in a temporary worktree..."
    (cd "$WORKTREE" && npx tsc) || { echo "compiling $REF failed" >&2; exit 2; }
    ENGINE_DIR="$WORKTREE"
fi
CLI="$ENGINE_DIR/dist/cli/index.js"
[ -f "$CLI" ] || { echo "no $CLI — run 'npm run build' first (or pass --ref)" >&2; exit 2; }
ENGINE_SHA=$(git -C "$ENGINE_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)
ENGINE_SHA_FULL=$(git -C "$ENGINE_DIR" rev-parse HEAD 2>/dev/null || echo unknown)
ENGINE_TAG=$(git -C "$ENGINE_DIR" tag --points-at HEAD 2>/dev/null | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1 || true)
if [ -z "$(git -C "$ENGINE_DIR" status --porcelain --untracked-files=no 2>/dev/null || echo unknown)" ]; then ENGINE_CLEAN=1; else ENGINE_CLEAN=0; fi

# What the engine is made of (the SDK it loads, dist/ and glossary hashes) and what --localize
# resolves to for it. An unknown rule stops here, before any draw (run-identity.mjs exits 2).
IDENTITY_LINES="$(node "$IDENTITY" --engine-dir "$ENGINE_DIR" --languages "$LANGS" --source-dir "$SOURCE_DIR" --fixtures "$FIXTURES" --localize "$LOCALIZE")" || exit 2
# Every key before the eval: a helper that printed nothing and exited 0 (it once did, run from a
# symlinked checkout) must stop the run here, not leave the engine unrecorded.
for key in ENGINE_VER SDK_VERSION SDK_DECLARED SDK_LOCKED ENGINE_DIST_SHA256 TRANSLATOR_SHA256 \
           PARITY_SHA256 GLOSSARY_SHA256 FIXTURES_SHA256 LOCALIZE_RULES DIST_STALE; do
    grep -q "^$key=" <<< "$IDENTITY_LINES" || { echo "run-identity.mjs gave no $key: cannot record the engine" >&2; exit 2; }
done
eval "$IDENTITY_LINES"   # sets ENGINE_VER, SDK_*, *_SHA256, LOCALIZE_RULES, DIST_STALE (single-quoted values)

# The machine-readable report is feature-detected per engine; without it, the legacy rule.
HELP_TEXT="$(cd "$ENGINE_DIR" && node "$CLI" init --help 2>&1 || true)"
case "$HELP_TEXT" in *--report-json*) REPORTS=1 ;; *) REPORTS=0 ;; esac
if [ "$REDRAW_INFRA" = 1 ] && [ "$REPORTS" = 0 ]; then
    usage_error "--redraw-infra needs an engine with init --report-json: the legacy rule counts every infra draw as refused"
fi

# meta.txt: written in shell syntax, so --summarize of older versions could source it.
q() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
STARTED_AT="$NOW"; RESUMED_AT=""
META_NEW="$RUN_DIR/.lock/meta.new"
write_meta() {
    echo "META_VERSION='2'"
    echo "STARTED_AT=$(q "$STARTED_AT")"; echo "RESUMED_AT=$(q "$RESUMED_AT")"
    echo "ENGINE_TAG=$(q "$ENGINE_TAG")"; echo "ENGINE_SHA=$(q "$ENGINE_SHA")"; echo "ENGINE_SHA_FULL=$(q "$ENGINE_SHA_FULL")"
    echo "ENGINE_VER=$(q "$ENGINE_VER")"; echo "ENGINE_CLEAN=$(q "$ENGINE_CLEAN")"; echo "ENGINE_MODE=$(q "$ENGINE_MODE")"
    echo "REF=$(q "$REF")"; echo "REF_DEPS=$(q "$REF_DEPS")"
    echo "SDK_VERSION=$(q "$SDK_VERSION")"; echo "SDK_DECLARED=$(q "$SDK_DECLARED")"; echo "SDK_LOCKED=$(q "$SDK_LOCKED")"
    echo "ENGINE_DIST_SHA256=$(q "$ENGINE_DIST_SHA256")"; echo "DIST_STALE=$(q "$DIST_STALE")"
    echo "TRANSLATOR_SHA256=$(q "$TRANSLATOR_SHA256")"; echo "PARITY_SHA256=$(q "$PARITY_SHA256")"
    echo "GLOSSARY_SHA256=$(q "$GLOSSARY_SHA256")"
    echo "MODEL=$(q "$MODEL")"; echo "DRAWS=$(q "$DRAWS")"; echo "MAX_REFUSALS=$(q "$MAX_REFUSALS")"
    echo "LANGS=$(q "$LANGS")"; echo "FIXTURES=$(q "$FIXTURES")"; echo "FIXTURES_SHA256=$(q "$FIXTURES_SHA256")"
    echo "SOURCE_DIR=$(q "$SOURCE_DIR_META")"
    echo "LOCALIZE=$(q "$LOCALIZE")"; echo "LOCALIZE_RULES=$(q "$LOCALIZE_RULES")"
    echo "REPORTS=$(q "$REPORTS")"; echo "MARKERS='1'"
}
write_meta > "$META_NEW"

# --resume: the engine and the inputs must be the ones the run started with.
IDENTITY_KEYS="ENGINE_SHA_FULL ENGINE_DIST_SHA256 TRANSLATOR_SHA256 PARITY_SHA256 SDK_VERSION GLOSSARY_SHA256 REF MODEL LANGS FIXTURES FIXTURES_SHA256 SOURCE_DIR LOCALIZE LOCALIZE_RULES REPORTS"
if [ "$RUN_DIR_IS_NEW" = 0 ]; then
    OLD_META="$RUN_DIR/meta.txt"
    grep -q "^MARKERS='1'" "$OLD_META" || { echo "$RUN_DIR was written by a rate-check without completion markers and cannot be resumed" >&2; exit 2; }
    MISMATCH=""
    for key in $IDENTITY_KEYS; do
        OLD_LINE="$(grep -m1 "^$key=" "$OLD_META" || true)"
        NEW_LINE="$(grep -m1 "^$key=" "$META_NEW" || true)"
        if [ "$OLD_LINE" != "$NEW_LINE" ]; then MISMATCH="$MISMATCH  $key: run has ${OLD_LINE#*=}, now ${NEW_LINE#*=}
"; fi
    done
    if [ -n "$MISMATCH" ]; then
        printf 'cannot resume %s: this engine or input differs from the run'"'"'s\n%s' "$RUN_DIR" "$MISMATCH" >&2
        exit 2
    fi
    OLD_DRAWS="$(grep -m1 "^DRAWS=" "$OLD_META" | sed "s/^DRAWS='\{0,1\}\([0-9]*\).*/\1/" || true)"
    if [ -n "$OLD_DRAWS" ] && [ "$DRAWS" -lt "$OLD_DRAWS" ]; then
        usage_error "--draws $DRAWS is below the run's $OLD_DRAWS: a resumed run can grow, not shrink"
    fi
    STARTED_AT="$(grep -m1 "^STARTED_AT=" "$OLD_META" | sed "s/^STARTED_AT='\(.*\)'$/\1/" || true)"
    RESUMED_AT="$NOW"
    write_meta > "$META_NEW"
    # The old verdict goes before the new meta.txt comes in: a resume cut short leaves no summary
    # beside draws it does not count (the next resume or --summarize writes a fresh pair).
    rm -f "$RUN_DIR/summary.txt" "$RUN_DIR/summary.json"
fi
mv -f "$META_NEW" "$RUN_DIR/meta.txt"

# --redraw-infra: move each infra draw aside (marker first, so an interruption can only leave
# the draw unfinished, never finished without its report), then draw it again below.
archive_attempt() {
    local base=$1 k=1
    while [ -e "$base.infra$k.exit" ]; do k=$((k+1)); done
    mv "$base.exit" "$base.infra$k.exit"
    if [ -e "$base.json" ]; then mv "$base.json" "$base.infra$k.json"; fi
    if [ -e "$base.log" ]; then mv "$base.log" "$base.infra$k.log"; fi
    if [ -e "$base" ]; then mv "$base" "$base.infra$k"; fi
}
if [ "$REDRAW_INFRA" = 1 ]; then
    INFRA_DRAWS="$(node "$SUMMARIZER" --list-infra "$RUN_DIR")" || { echo "cannot classify the draws in $RUN_DIR" >&2; exit 2; }
    MOVED=0
    while IFS= read -r rel; do
        if [ -n "$rel" ]; then archive_attempt "$RUN_DIR/$rel"; MOVED=$((MOVED+1)); fi
    done <<< "$INFRA_DRAWS"
    echo "Moved $MOVED infra draw(s) aside to draw them again"
fi

# Source directory: the fixtures plus a TOC that lists them (init copies non-markdown files
# and translates only the -f file). Shortest names first: at v0.29.5 and older (an old --ref),
# init -f takes the first TOC entry that equals or contains the name (later engines prefer an
# exact match), so `-f intro.md` must not meet `jax_intro.md` before it.
SRC_DIR="$RUN_DIR/_src"   # '_' keeps it apart from the <lang>/ directories
rm -rf "$SRC_DIR"; mkdir -p "$SRC_DIR"
for fx in "${FIXTURE_LIST[@]}"; do cp "$SOURCE_DIR/$fx" "$SRC_DIR/"; done
TOC_ORDER=()
while IFS= read -r fx; do TOC_ORDER+=("$fx"); done < <(
    n=0
    for fx in "${FIXTURE_LIST[@]}"; do n=$((n+1)); printf '%d\t%d\t%s\n' "${#fx}" "$n" "$fx"; done |
        sort -t "$(printf '\t')" -k1,1n -k2,2n | cut -f3-
)
{
    echo "format: jb-book"
    echo "root: ${TOC_ORDER[0]%.md}"
    if [ "${#TOC_ORDER[@]}" -gt 1 ]; then
        echo "chapters:"
        for fx in "${TOC_ORDER[@]:1}"; do echo "  - file: ${fx%.md}"; done
    fi
} > "$SRC_DIR/_toc.yml"

TOTAL=$(( DRAWS * ${#FIXTURE_LIST[@]} * ${#LANG_LIST[@]} ))
PENDING=0
for lang in "${LANG_LIST[@]}"; do
    for fx in "${FIXTURE_LIST[@]}"; do
        for i in $(seq 1 "$DRAWS"); do
            if [ ! -f "$RUN_DIR/$lang/${fx%.md}/$i.exit" ]; then PENDING=$((PENDING+1)); fi
        done
    done
done

echo "========================================"
echo "Full-document failure-rate check"
echo "========================================"
echo "  engine     ${ENGINE_TAG:-(untagged)} ${ENGINE_SHA} package.json ${ENGINE_VER} · SDK ${SDK_VERSION}${REF:+ (from --ref $REF, deps $REF_DEPS)}${ENGINE_DIR_ARG:+ (from --engine-dir $ENGINE_DIR)}"
echo "  model      $MODEL"
echo "  fixtures   ${FIXTURES} (from ${SOURCE_DIR_META:-test-action-on-github-data/})"
echo "  languages  ${LANGS}"
echo "  localize   ${LOCALIZE}${LOCALIZE_RULES:+ ($LOCALIZE_RULES)}"
echo "  draws      $DRAWS per cell — $TOTAL CLI translations, $PENDING to draw now, $PARALLEL at a time"
if [ "$REPORTS" = 1 ]; then
    echo "  classify   init --report-json: failed = every non-infra failure; infra excluded, a cell above 10% is UNRELIABLE"
else
    echo "  classify   legacy rule (no init --report-json): a draw without its output file counts, infra included"
fi
echo "  threshold  a cell fails above $MAX_REFUSALS failure(s)"
echo "  logs       $RUN_DIR"
if [ "$DIST_STALE" = 1 ]; then echo "  ⚠ dist/ is older than src/ in $ENGINE_DIR — run 'npm run build' unless that is intended"; fi
if [ "$ENGINE_CLEAN" = 0 ]; then echo "  ⚠ the engine checkout has uncommitted changes (meta.txt records ENGINE_CLEAN=0)"; fi
if [ -n "$SDK_LOCKED" ] && [ "$SDK_LOCKED" != "$SDK_VERSION" ]; then
    echo "  ⚠ this engine locks @anthropic-ai/sdk $SDK_LOCKED but loads $SDK_VERSION${REF:+ (--ref-deps own installs the locked one)}"
fi
echo ""

run_one() {
    local lang=$1 fx=$2 i=$3
    local out="$RUN_DIR/$lang/${fx%.md}/$i"
    local pidfile="$LOCK_DIR/cli.$lang.${fx%.md}.$i"
    local start end cli code=0
    mkdir -p "$(dirname "$out")"
    # A fresh attempt: an interrupted one can leave partial files behind.
    rm -rf "$out" "$out.log" "$out.json" "$out.exit" "$out.exit.tmp"
    if [ "$LOCALIZE" = default ]; then set --; else set -- --localize "$LOCALIZE"; fi
    if [ "$REPORTS" = 1 ]; then set -- "$@" --report-json "$out.json"; fi
    start="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    # cwd is the engine dir so the CLI picks up THAT checkout's glossary. `exec`, so that $! is
    # the CLI itself: on_signal stops it by the PID recorded in the lock.
    (cd "$ENGINE_DIR" && exec node "$CLI" init -s "$SRC_DIR" -t "$out" --target-language "$lang" \
        -d . -f "$fx" -m "$MODEL" "$@" > "$out.log" 2>&1) &
    cli=$!
    echo "$cli" > "$pidfile"
    # a stop that began before the PID was recorded still reaches this CLI
    if [ -e "$LOCK_DIR/stopping" ]; then kill -TERM "$cli" 2>/dev/null || true; fi
    wait "$cli" || code=$?
    rm -f "$pidfile"
    end="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    # The marker is the draw's commit: without it, --resume draws it again and the summary
    # counts it as never finished. A CLI stopped by SIGHUP, SIGINT or SIGTERM was interrupted,
    # not crashed, so it gets no marker either.
    case "$code" in 129|130|143) return 0 ;; esac
    printf 'exit=%s\nstart=%s\nend=%s\n' "$code" "$start" "$end" > "$out.exit.tmp"
    mv -f "$out.exit.tmp" "$out.exit"
}

for lang in "${LANG_LIST[@]}"; do
    for fx in "${FIXTURE_LIST[@]}"; do
        for i in $(seq 1 "$DRAWS"); do
            if [ -f "$RUN_DIR/$lang/${fx%.md}/$i.exit" ]; then continue; fi
            while [ "$(jobs -rp | wc -l)" -ge "$PARALLEL" ]; do sleep 1; done
            run_one "$lang" "$fx" "$i" &
        done
    done
done
wait

STATUS=0
summarize_run "$RUN_DIR" || STATUS=$?
DONE=1
exit "$STATUS"

#!/usr/bin/env bash
# rate-check.sh — N-draw refusal-rate check on the full-document fixtures (release checklist 4b).
#
# The release gate (test-action-on-github.sh) takes ONE draw per scenario through the action
# path, so a model-side defect that fails less than always can pass it: scenario 17's fixture
# was refused by the structural-parity guard on ~40% of draws from v0.28.0 to v0.29.0 and
# passed three gates (#320). This script measures the rate directly. It runs the CLI at the
# requested engine N times per fixture and language, counts the draws the guard refused (no
# output file written), and fails if any cell shows more than --max-refusals. No GitHub runs:
# the cost is draws x fixtures x languages CLI translations against a cached prompt.
#
# Usage: ./tool-test-action-on-github/rate-check.sh [--ref <tag|branch>] [--draws N]
#            [--languages ml,fa,zh-cn] [--fixtures game-theory.md] [--parallel J]
#            [--max-refusals K] [--model M] [--summarize DIR]
#
#   --ref            engine to test. Default: this checkout's dist/ and glossary (build first).
#                    With a ref, a temporary worktree at that ref is compiled with `npx tsc`
#                    and its own glossary is used, so old versions can be measured too.
#   --draws          draws per fixture x language (default 12 — six per arm gave the right
#                    direction and the wrong story on 2026-09-21)
#   --languages      comma list; default: every language in test-action-on-github.sh
#   --fixtures       comma list of files in test-action-on-github-data/ that the gate introduces
#                    as NEW documents (default: game-theory.md, scenario 17)
#   --parallel       concurrent CLI runs (default 6)
#   --max-refusals   most refusals a cell may show and still pass (default 1)
#   --model          Claude model (default claude-sonnet-5, the production default)
#   --summarize DIR  re-read a finished run directory (no new draws) and print its table
#
# Per-draw logs, meta.txt and summary.txt land in .dev/scratch/rate-check/<UTC timestamp>-<pid>/.
# Exit 0 = every cell within --max-refusals; 1 = a cell over it; 2 = usage or setup error.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$SCRIPT_DIR/test-action-on-github-data"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MAIN_SCRIPT="$SCRIPT_DIR/test-action-on-github.sh"

REF=""; DRAWS=12; LANGS=""; FIXTURES="game-theory.md"; PARALLEL=6; MAX_REFUSALS=1; MODEL="claude-sonnet-5"; SUMMARIZE=""
while [ $# -gt 0 ]; do
    case "$1" in
        --ref) REF="$2"; shift 2 ;;
        --draws) DRAWS="$2"; shift 2 ;;
        --languages) LANGS="$2"; shift 2 ;;
        --fixtures) FIXTURES="$2"; shift 2 ;;
        --parallel) PARALLEL="$2"; shift 2 ;;
        --max-refusals) MAX_REFUSALS="$2"; shift 2 ;;
        --model) MODEL="$2"; shift 2 ;;
        --summarize) SUMMARIZE="$2"; shift 2 ;;
        -h|--help) sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "unknown argument: $1 (try --help)" >&2; exit 2 ;;
    esac
done

# Tally a run directory: one line per fixture x language, the distinct refusal reasons under
# any cell with refusals, written to summary.txt. Runs in the current shell on purpose — a
# `{ … } | tee` here would put FAIL in a subshell and the exit code would always be 0 (it was,
# on the first validation run).
summarize_run() {
    local lang fx i out refused reasons rate verdict
    SUMMARY="$RUN_DIR/summary.txt"   # global: the closing line reports it
    FAIL=0
    {
        echo "engine ${ENGINE_TAG:-(untagged)} $ENGINE_SHA · model $MODEL · $DRAWS draws per cell · threshold $MAX_REFUSALS"
        echo ""
        printf '%-24s %-8s %-14s %-6s %s\n' fixture language refused/draws rate verdict
        for lang in "${LANG_LIST[@]}"; do
            for fx in "${FIXTURE_LIST[@]}"; do
                refused=0
                reasons="$RUN_DIR/$lang/${fx%.md}/reasons.txt"
                : > "$reasons"
                for i in $(seq 1 "$DRAWS"); do
                    out="$RUN_DIR/$lang/${fx%.md}/$i"
                    if [ ! -f "$out/$fx" ]; then
                        refused=$((refused+1))
                        sed 's/\x1b\[[0-9;]*m//g' "$out.log" | grep -m1 -E "differs|parity|Failed|Error|error" | sed 's/^[[:space:]]*//' >> "$reasons" || echo "(no reason line in log)" >> "$reasons"
                    fi
                done
                rate=$(( refused * 100 / DRAWS ))
                if [ "$refused" -gt "$MAX_REFUSALS" ]; then verdict="FAIL"; FAIL=1; else verdict="ok"; fi
                printf '%-24s %-8s %-14s %-6s %s\n' "$fx" "$lang" "$refused/$DRAWS" "${rate}%" "$verdict"
                if [ "$refused" -gt 0 ]; then
                    sort "$reasons" | uniq -c | sort -rn | sed 's/^/      /'
                fi
            done
        done
    } > "$SUMMARY"
    cat "$SUMMARY"
}

# --summarize: re-read a finished run (its meta.txt carries what the table needs) and exit
# with the same verdict the run would have given. No API key, no draws.
if [ -n "$SUMMARIZE" ]; then
    RUN_DIR="$SUMMARIZE"
    [ -f "$RUN_DIR/meta.txt" ] || { echo "no meta.txt in $RUN_DIR" >&2; exit 2; }
    # shellcheck disable=SC1091
    . "$RUN_DIR/meta.txt"
    IFS=',' read -ra LANG_LIST <<< "$LANGS"
    IFS=',' read -ra FIXTURE_LIST <<< "$FIXTURES"
    summarize_run
    [ "$FAIL" -eq 1 ] && exit 1
    exit 0
fi

: "${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY must be set}"
command -v node >/dev/null || { echo "node not found" >&2; exit 2; }

# Languages come from the main script's LANGUAGES array ("code|Name" per line), so there is
# one list to maintain.
if [ -z "$LANGS" ]; then
    LANGS=$(awk '/^LANGUAGES=\(/{f=1;next} f&&/^\)/{exit} f{gsub(/[" ]/,""); sub(/\|.*/,""); print}' "$MAIN_SCRIPT" | paste -sd, -)
fi
IFS=',' read -ra LANG_LIST <<< "$LANGS"
IFS=',' read -ra FIXTURE_LIST <<< "$FIXTURES"
for fx in "${FIXTURE_LIST[@]}"; do
    [ -f "$DATA_DIR/$fx" ] || { echo "fixture not found: $DATA_DIR/$fx" >&2; exit 2; }
done

# Engine under test: this checkout, or a worktree at --ref compiled in place.
WORKTREE=""
SRC_DIR="$(mktemp -d "${TMPDIR:-/tmp}/rate-check-src.XXXXXX")"
cleanup() {
    rm -rf "$SRC_DIR"
    if [ -n "$WORKTREE" ]; then
        rm -f "$WORKTREE/node_modules"
        git -C "$REPO_ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT

ENGINE_DIR="$REPO_ROOT"
if [ -n "$REF" ]; then
    WORKTREE="${TMPDIR:-/tmp}/rate-check-wt.$$"
    git -C "$REPO_ROOT" worktree add -q "$WORKTREE" "$REF"
    ln -s "$REPO_ROOT/node_modules" "$WORKTREE/node_modules"
    echo "Compiling $REF in a temporary worktree..."
    (cd "$WORKTREE" && npx tsc)
    ENGINE_DIR="$WORKTREE"
fi
CLI="$ENGINE_DIR/dist/cli/index.js"
[ -f "$CLI" ] || { echo "no $CLI — run 'npm run build' first (or pass --ref)" >&2; exit 2; }
ENGINE_SHA=$(git -C "$ENGINE_DIR" rev-parse --short HEAD)
ENGINE_TAG=$(git -C "$ENGINE_DIR" tag --points-at HEAD | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1 || true)
ENGINE_VER=$(node -p "require('$ENGINE_DIR/package.json').version")

# Source directory: the fixtures plus a TOC that lists them (init copies non-markdown files
# and translates only the -f file).
for fx in "${FIXTURE_LIST[@]}"; do cp "$DATA_DIR/$fx" "$SRC_DIR/"; done
{
    echo "format: jb-book"
    echo "root: ${FIXTURE_LIST[0]%.md}"
    if [ "${#FIXTURE_LIST[@]}" -gt 1 ]; then
        echo "chapters:"
        for fx in "${FIXTURE_LIST[@]:1}"; do echo "  - file: ${fx%.md}"; done
    fi
} > "$SRC_DIR/_toc.yml"

STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)-$$"   # PID keeps two runs in one second apart
RUN_DIR="$REPO_ROOT/.dev/scratch/rate-check/$STAMP"
mkdir -p "$RUN_DIR"
{
    echo "ENGINE_TAG='${ENGINE_TAG}'"; echo "ENGINE_SHA='${ENGINE_SHA}'"; echo "MODEL='${MODEL}'"
    echo "DRAWS='${DRAWS}'"; echo "MAX_REFUSALS='${MAX_REFUSALS}'"; echo "LANGS='${LANGS}'"; echo "FIXTURES='${FIXTURES}'"
} > "$RUN_DIR/meta.txt"

TOTAL=$(( DRAWS * ${#FIXTURE_LIST[@]} * ${#LANG_LIST[@]} ))
echo "========================================"
echo "Full-document refusal-rate check"
echo "========================================"
echo "  engine     ${ENGINE_TAG:-(untagged)} ${ENGINE_SHA} package.json ${ENGINE_VER}${REF:+ (from --ref $REF)}"
echo "  model      $MODEL"
echo "  fixtures   ${FIXTURES}"
echo "  languages  ${LANGS}"
echo "  draws      $DRAWS per cell — $TOTAL CLI translations, $PARALLEL at a time"
echo "  threshold  a cell fails above $MAX_REFUSALS refusal(s)"
echo "  logs       $RUN_DIR"
echo ""

run_one() {
    local lang=$1 fx=$2 i=$3
    local out="$RUN_DIR/$lang/${fx%.md}/$i"
    mkdir -p "$(dirname "$out")"
    # cwd is the engine dir so the CLI picks up THAT checkout's glossary.
    (cd "$ENGINE_DIR" && node "$CLI" init -s "$SRC_DIR" -t "$out" --target-language "$lang" \
        -d . -f "$fx" --localize none -m "$MODEL" > "$out.log" 2>&1) || true
}

for lang in "${LANG_LIST[@]}"; do
    for fx in "${FIXTURE_LIST[@]}"; do
        for i in $(seq 1 "$DRAWS"); do
            while [ "$(jobs -rp | wc -l)" -ge "$PARALLEL" ]; do sleep 1; done
            run_one "$lang" "$fx" "$i" &
        done
    done
done
wait

summarize_run   # sets FAIL; prints and writes summary.txt

echo ""
if [ "$FAIL" -eq 1 ]; then
    echo "✗ A cell is over the threshold. One draw per scenario would have passed this at ~$((100 - 100 * MAX_REFUSALS / DRAWS))% or better; the gate cannot see it — do not release on the gate alone."
    exit 1
fi
echo "✓ Every cell within threshold. Summary: $SUMMARY"

#!/usr/bin/env bash
# Drive a full certification run unattended.
#
# Waves exist for two reasons, neither cosmetic: labelling is the trigger, so it
# is also the only throttle available; and a verdict must be captured before its
# PR is re-fired, because review mode overwrites its comment in place.
#
#   ./drive.sh <wave-size> <max-waves>
#
# Safe to re-run — every step is idempotent and keyed on `reviewedHeadSha`.
set -uo pipefail
cd "$(dirname "$0")"

WAVE=${1:-12}
MAX=${2:-20}
export RUN_ID=${RUN_ID:-m0}

echo "== targets (all fixtures, unlabelled) =="
node run.mjs targets

for i in $(seq 1 "$MAX"); do
  echo
  echo "== wave $i: fire =="
  fired=$(node run.mjs fire --size "$WAVE" | tail -1)
  echo "$fired"

  echo "== wave $i: replicate (re-fire fixtures short of their count) =="
  node run.mjs replicate --size "$WAVE" | tail -1

  echo "== wave $i: capture =="
  node run.mjs capture --rounds 30 --every 30 | tail -3

  echo "== wave $i: runs =="
  node run.mjs runs

  # Done when every fixture has as many captured verdicts as it wants.
  if node run.mjs status | grep -q 'short of their replicate count'; then
    node run.mjs status
  else
    echo "== all fixtures at their replicate count =="
    break
  fi
done

node run.mjs status --verbose

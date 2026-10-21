#!/bin/bash
# Rule 8 alone, second functions round (action-translation#404): 24 more drafts each for
# control (888cdb7, wt-ctrl) and r8 (888cdb7 + b5c1f10's rule 8, wt-r8), draws 25-48.
#
# Pre-registered before any draw (2026-10-21, Matt's go-ahead):
#   pool with round 1 (control 1-24 from arm/, r8 1-24 from arm-ablation/) -> 48 v 48;
#   DROP rule 8 if the bare-endings mode (>= 10 bare) is worse at one-sided Fisher p < 0.05,
#   or parity refusals (per attempt) are worse at p < 0.05; otherwise rule 8 ships alone.
#   The mean bare-endings count is reported as secondary. Extending the sample after a
#   look inflates alpha slightly; reported as such.
S=/private/tmp/claude-501/-Users-mmcky-work-quantecon-project-translation/a9317a0a-da0a-494c-ae0c-00456ead6150/scratchpad
SRC=$S/src-b0c58ab
ARM=$S/arm-r8b
OUT=$S/out-r8b
mkdir -p "$ARM" "$OUT"
{
  echo "start $(date -u +%FT%TZ)"
  echo "control $(git -C $S/wt-ctrl rev-parse HEAD)"
  echo "r8 $(git -C $S/wt-r8 rev-parse HEAD) + $(git -C $S/wt-r8 diff --stat | tail -1)"
} > "$ARM/meta.txt"

draw() { # arm worktree first last
  for i in $(seq "$3" "$4"); do
    for try in 1 2 3; do
      out="$OUT/$1-functions-$i-$try"
      t0=$(date +%s)
      (cd "$2" && node dist/cli/index.js init -s "$SRC" -t "$out" \
        --target-language ml -f functions.md --localize none -m claude-sonnet-5) > "$out.log" 2>&1
      t1=$(date +%s)
      if [ -f "$out/lectures/functions.md" ]; then
        cp "$out/lectures/functions.md" "$ARM/functions-$1-draw$i.md"
        tail -5 "$out.log" > "$ARM/functions-$1-draw$i.log-tail"
        echo "functions $1 $i ok try=$try $((t1 - t0))s" >> "$ARM/progress.txt"
        break
      fi
      tail -5 "$out.log" > "$ARM/functions-$1-draw$i-refused$try.log-tail"
      echo "functions $1 $i REFUSED try=$try $((t1 - t0))s" >> "$ARM/progress.txt"
    done
  done
}

draw control "$S/wt-ctrl" 25 36 &
draw control "$S/wt-ctrl" 37 48 &
draw r8 "$S/wt-r8" 25 36 &
draw r8 "$S/wt-r8" 37 48 &
wait
echo "end $(date -u +%FT%TZ)" >> "$ARM/meta.txt"
echo ALL-DONE >> "$ARM/progress.txt"

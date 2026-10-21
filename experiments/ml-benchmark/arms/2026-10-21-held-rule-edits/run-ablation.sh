#!/bin/bash
# Ablation of the held-rule-edits candidate on functions: rule 12 alone (wt-r12) and
# rule 8 alone (wt-r8), each 888cdb7 with one rule line taken from b5c1f10.
# Also refills candidate functions slot 20 (refused three times in the main run).
S=/private/tmp/claude-501/-Users-mmcky-work-quantecon-project-translation/a9317a0a-da0a-494c-ae0c-00456ead6150/scratchpad
SRC=$S/src-b0c58ab
ARM=$S/arm-ablation
OUT=$S/out-ablation
mkdir -p "$ARM" "$OUT"
echo "start $(date -u +%FT%TZ)" > "$ARM/meta.txt"

draw() { # arm worktree lecture first last maxtries dest
  for i in $(seq "$4" "$5"); do
    for try in $(seq 1 "$6"); do
      out="$OUT/$1-$3-$i-$try"
      t0=$(date +%s)
      (cd "$2" && node dist/cli/index.js init -s "$SRC" -t "$out" \
        --target-language ml -f "$3.md" --localize none -m claude-sonnet-5) > "$out.log" 2>&1
      t1=$(date +%s)
      if [ -f "$out/lectures/$3.md" ]; then
        cp "$out/lectures/$3.md" "$7/$3-$1-draw$i.md"
        tail -5 "$out.log" > "$7/$3-$1-draw$i.log-tail"
        echo "$3 $1 $i ok try=$try $((t1 - t0))s" >> "$ARM/progress.txt"
        break
      fi
      tail -5 "$out.log" > "$7/$3-$1-draw$i-refused$try.log-tail"
      echo "$3 $1 $i REFUSED try=$try $((t1 - t0))s" >> "$ARM/progress.txt"
    done
  done
}

draw r12 "$S/wt-r12" functions 1 12 3 "$ARM" &
draw r12 "$S/wt-r12" functions 13 24 3 "$ARM" &
draw r8 "$S/wt-r8" functions 1 12 3 "$ARM" &
draw r8 "$S/wt-r8" functions 13 24 3 "$ARM" &
# slot 20 of the main run's candidate arm (kept here so the main run's refusal tails
# for that slot are not overwritten; the draft is copied into arm/ afterwards)
draw candidate "$S/wt-cand" functions 20 20 5 "$ARM" &
wait
echo "end $(date -u +%FT%TZ)" >> "$ARM/meta.txt"
echo ALL-DONE >> "$ARM/progress.txt"

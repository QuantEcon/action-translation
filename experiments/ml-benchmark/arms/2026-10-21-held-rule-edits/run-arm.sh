#!/bin/bash
# Held-rule-edits arm (action-translation#404): 96 raw ml drafts.
# control = 888cdb7 (wt-ctrl), candidate = b5c1f10 (wt-cand); English at b0c58ab.
S=/private/tmp/claude-501/-Users-mmcky-work-quantecon-project-translation/a9317a0a-da0a-494c-ae0c-00456ead6150/scratchpad
SRC=$S/src-b0c58ab
ARM=$S/arm
OUT=$S/out
mkdir -p "$ARM" "$OUT"
{
  echo "start $(date -u +%FT%TZ)"
  echo "control $(git -C $S/wt-ctrl rev-parse HEAD)"
  echo "candidate $(git -C $S/wt-cand rev-parse HEAD)"
  echo "english b0c58ab"
  echo "model claude-sonnet-5"
} > "$ARM/meta.txt"

draw() { # arm lecture first last
  local wt=$S/wt-ctrl; [ "$1" = candidate ] && wt=$S/wt-cand
  for i in $(seq "$3" "$4"); do
    for try in 1 2 3; do
      out="$OUT/$1-$2-$i-$try"
      t0=$(date +%s)
      (cd "$wt" && node dist/cli/index.js init -s "$SRC" -t "$out" \
        --target-language ml -f "$2.md" --localize none -m claude-sonnet-5) > "$out.log" 2>&1
      t1=$(date +%s)
      if [ -f "$out/lectures/$2.md" ]; then
        cp "$out/lectures/$2.md" "$ARM/$2-$1-draw$i.md"
        tail -5 "$out.log" > "$ARM/$2-$1-draw$i.log-tail"
        echo "$2 $1 $i ok try=$try $((t1 - t0))s" >> "$ARM/progress.txt"
        break
      fi
      tail -5 "$out.log" > "$ARM/$2-$1-draw$i-refused$try.log-tail"
      echo "$2 $1 $i REFUSED try=$try $((t1 - t0))s" >> "$ARM/progress.txt"
    done
  done
}

for arm in control candidate; do
  draw $arm pandas 1 12 &
  draw $arm numpy 1 12 &
  draw $arm functions 1 12 &
  draw $arm functions 13 24 &
done
wait
echo "end $(date -u +%FT%TZ)" >> "$ARM/meta.txt"
echo ALL-DONE >> "$ARM/progress.txt"

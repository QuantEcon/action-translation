#!/bin/zsh
# usage: draw.sh <lecture> <n> <maxattempts>  — n successful init -f drafts at v0.33.0
S=${0:A:h}; lec=$1; n=$2; max=$3; W=${4:-0}; ok=0; att=0; mkdir -p $S/val/$lec
CLI=$S/at-v0/dist/cli/index.js
while (( ok < n && att < max )); do
  att=$((att+1)); d=$S/val/$lec/w$W-a$att; rm -rf $d
  NODE_USE_ENV_PROXY=1 ANTHROPIC_API_KEY="$(/usr/bin/security find-generic-password -s qe/anthropic-api-key -a mmcky -w)" node $CLI init -s $S/en-src -t $d --target-language ml -f $lec.md --localize none -m claude-sonnet-5 --report-json $d.report.json > $d.log 2>&1
  if [[ -s $d/lectures/$lec.md ]] && grep -q '[ഀ-ൿ]' $d/lectures/$lec.md; then ok=$((ok+1)); cp $d/lectures/$lec.md $S/val/$lec/draft-w$W-$ok.md; echo "$lec attempt $att -> draft $ok"; else echo "$lec attempt $att refused: $(grep -m1 -iE 'refus|parity|error' $d.log)"; fi
done
echo "$lec: $ok drafts in $att attempts"

"""Emit the paragraph-level comparison items the pairwise judge consumes.

usage: make_pairs.py <lecture> <arm> <arm> ... > items-<lecture>.json

One item per (draw index, English paragraph): the English, the editor's reviewed
Malayalam (the reference), and each arm's rendering of the same paragraph from
the same-numbered draw. Paragraphs the editor left in English are skipped.
"""
import glob
import json
import sys

from align import align, ML

lecture, arms = sys.argv[1], sys.argv[2:]
EN = open(f'corpus/{lecture}.en.md').read()
REF = {(p['anchor'], p['en']): p['tr'] for p in align(EN, open(f'corpus/{lecture}.ml.md').read())[0]}


def by_en(path):
    return {(p['anchor'], p['en']): p['tr'] for p in align(EN, open(path).read())[0]}


draws = {arm: [by_en(p) for p in sorted(glob.glob(f'draws/{lecture}-{arm}-draw*.md'))] for arm in arms}
n = min(len(v) for v in draws.values())
items = []
for i in range(n):
    for k, ref in REF.items():
        if not ML.search(ref):
            continue
        cands = {arm: draws[arm][i].get(k) for arm in arms}
        if any(c is None for c in cands.values()):
            continue
        items.append({'lecture': lecture, 'draw': i + 1, 'anchor': k[0], 'en': k[1], 'ref': ref, 'candidates': cands})
json.dump(items, sys.stdout, ensure_ascii=False, indent=1)
print(f'{len(items)} items ({n} draws × {len(items)//max(1,n)} paragraphs)', file=sys.stderr)

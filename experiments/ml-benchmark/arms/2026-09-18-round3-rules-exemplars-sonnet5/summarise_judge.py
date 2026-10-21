"""Summarise pairwise judgements: win rates per arm pair, a sign test on the
non-tie decisions, and a position-bias check (share of wins going to the
candidate shown first, which should sit near 0.5 across a randomised run).

usage: summarise_judge.py judgements-<lecture>.json
"""
import json
import sys
from collections import Counter, defaultdict
from math import comb


def sign_test_p(w, l):
    """Two-sided exact binomial p-value for w wins vs l losses under p = 0.5."""
    n = w + l
    if n == 0:
        return 1.0
    k = min(w, l)
    tail = sum(comb(n, i) for i in range(0, k + 1)) / 2**n
    return min(1.0, 2 * tail)


j = json.load(open(sys.argv[1]))
by_pair = defaultdict(list)
for r in j:
    by_pair[r['pair']].append(r)

for pair, rows in by_pair.items():
    x, y = pair.split(':')
    c = Counter(r['winner'] for r in rows)
    identical = sum(1 for r in rows if r.get('identical'))
    judged = [r for r in rows if not r.get('identical') and r['winner'] != 'ERROR']
    ties = sum(1 for r in judged if r['winner'] == 'TIE')
    wx, wy = c[x], c[y]
    p = sign_test_p(wx, wy)
    first = Counter(r['position'] for r in judged if r['winner'] != 'TIE')
    pos_a = first['A'] / max(1, first['A'] + first['B'])
    per_draw = defaultdict(Counter)
    for r in judged:
        per_draw[r['draw']][r['winner']] += 1
    print(f"{pair}: n={len(rows)} identical={identical} judged={len(judged)} | {x} {wx} · {y} {wy} · tie {ties} "
          f"| {y} share of decisions {wy/max(1,wx+wy):.2f} | sign-test p={p:.3f} | first-shown wins {pos_a:.2f} | errors {c['ERROR']}")
    for d in sorted(per_draw):
        pc = per_draw[d]
        print(f"    draw {d}: {x} {pc[x]} · {y} {pc[y]} · tie {pc['TIE']}")

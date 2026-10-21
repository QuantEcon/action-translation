"""Tables for the README from records.jsonl. usage: summarise.py records.jsonl"""
import json, math, sys
from collections import defaultdict
R = [json.loads(l) for l in open(sys.argv[1], encoding='utf-8')]
def fisher(a, n1, b, n2):
    N, K = n1 + n2, a + b
    p = lambda x: math.comb(K, x) * math.comb(N - K, n1 - x) / math.comb(N, n1)
    p0 = p(a); return sum(p(x) for x in range(max(0, K - n2), min(K, n1) + 1) if p(x) <= p0 + 1e-12)
g = defaultdict(list)
for r in R: g[(r['lecture'], r['arm'])].append(r)
print('| Lecture | Arm | Drafts | Bare-endings mode | Completive at "already seen/met" | Simple past 864 completive | alpha perfect | dashes kept | opener എന്നത്, |')
print('|---|---|---|---|---|---|---|---|---|')
for (lec, arm), rs in sorted(g.items()):
    bad = sum(r['bare_mode'] for r in rs)
    s = [x for r in rs for x in r['already_sites']]; comp = sum(x['form'] == 'completive' for x in s)
    sp = [x for r in rs for x in r['simple_past_already_saw']]
    al = [r['alpha_site'] for r in rs if r['alpha_site']]
    d = [x for r in rs for x in r['dash_sites_kept']]
    print(f"| `{lec}` | {arm} | {len(rs)} | {bad} | {comp}/{len(s)} | {(str(sum(x['form']=='completive' for x in sp))+'/'+str(len(sp))) if sp else '—'} | {(str(sum(a['perfect'] for a in al))+'/'+str(len(al))) if al else '—'} | {sum(d)}/{len(d)} | {sum(r['opener_ennath_comma'] for r in rs)}/{len(rs)} |")
print()
for lec in ('functions',):
    A = g[(lec, 'A')]
    for arm in 'BCD':
        X = g[(lec, arm)]
        print(f"{lec}: A {sum(r['bare_mode'] for r in A)}/{len(A)} vs {arm} {sum(r['bare_mode'] for r in X)}/{len(X)}: Fisher p = {fisher(sum(r['bare_mode'] for r in A), len(A), sum(r['bare_mode'] for r in X), len(X)):.3f}")
pool = {arm: [r for r in R if r['arm'] == arm] for arm in 'AB'}
a, b = sum(r['bare_mode'] for r in pool['A']), sum(r['bare_mode'] for r in pool['B'])
print(f"pooled four lectures: A {a}/{len(pool['A'])} vs B {b}/{len(pool['B'])}: Fisher p = {fisher(a, len(pool['A']), b, len(pool['B'])):.3f}")

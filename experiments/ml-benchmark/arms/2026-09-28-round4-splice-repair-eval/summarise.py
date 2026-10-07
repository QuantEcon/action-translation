import glob, json, math, sys
from collections import Counter
def sign_p(k, n):
    if n == 0: return float('nan')
    tail = sum(math.comb(n, i) for i in range(0, min(k, n - k) + 1)) / 2 ** n
    return min(1.0, 2 * tail)
E = sys.argv[1]
tot = {}
for f in sorted(glob.glob(f'{E}/judgements-*.json')):
    J = json.load(open(f, encoding='utf-8')); mode, lec = f.split('judgements-')[1][:-5].split('-', 1)
    for pair in sorted({j['pair'] for j in J}):
        x, y = pair.split(':')
        P = [j for j in J if j['pair'] == pair]
        called = [j for j in P if not j.get('identical')]
        err = sum(j['winner'] == 'ERROR' for j in called)
        wx = sum(j['winner'] == x for j in called); wy = sum(j['winner'] == y for j in called); tie = sum(j['winner'] == 'TIE' for j in called)
        n = wx + wy
        dec = [j for j in called if j['winner'] in (x, y)]
        first = sum(1 for j in dec if j.get('position') == 'A') / len(dec) if dec else float('nan')
        print(f'{mode:5s} {lec:10s} {pair:8s} compared {len(called):3d}  {y} {wy:3d} : {wx:3d} {x}  ties {tie:3d}  err {err}  p={sign_p(wy, n):.3g}  first-shown won {first:.2f}')
        k = (mode, pair); a = tot.setdefault(k, [0, 0, 0]); a[0] += wy; a[1] += wx; a[2] += tie
print('--- pooled ---')
for (mode, pair), (wy, wx, tie) in sorted(tot.items()):
    x, y = pair.split(':'); n = wy + wx
    print(f'{mode:5s} {pair:8s} {y} {wy} : {wx} {x} ({100*wy/max(1,n):.0f}% of decisions), ties {tie}, p={sign_p(wy, n):.3g}')

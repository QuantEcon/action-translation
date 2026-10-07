"""items-<lecture>.json for judge.mjs: one item per (draw, aligned English paragraph)
with the editor's reviewed Malayalam as `ref` and the raw / old-repair / new-repair
renderings as candidates. Paragraphs the editor left in English are skipped."""
import glob, json, re, sys
sys.path.insert(0, sys.argv[1])
from align import align, ML
E = sys.argv[1]
for lecture in ('numpy', 'functions', 'matplotlib'):
    EN = open(f'{E}/corpus/{lecture}.en.md', encoding='utf-8').read()
    REF = {(p['anchor'], p['en']): p['tr'] for p in align(EN, open(f'{E}/corpus/{lecture}.ml.md', encoding='utf-8').read())[0]}
    def by_en(path):
        return {(p['anchor'], p['en']): p['tr'] for p in align(EN, open(path, encoding='utf-8').read())[0]}
    items, unaligned = [], 0
    for raw in sorted(glob.glob(f'{E}/draws/{lecture}-raw-draw*.md')):
        n = int(re.search(r'draw(\d+)', raw).group(1))
        arms = {a: by_en(f'{E}/draws/{lecture}-{a}-draw{n}.md') for a in ('raw', 'old', 'new')}
        for k, ref in REF.items():
            if not ML.search(ref):
                continue
            cands = {a: arms[a].get(k) for a in arms}
            if any(c is None for c in cands.values()):
                unaligned += 1
                continue
            items.append({'lecture': lecture, 'draw': n, 'anchor': k[0], 'en': k[1], 'ref': ref, 'candidates': cands})
    json.dump(items, open(f'{E}/items-{lecture}.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    diff_on = sum(i['candidates']['old'] != i['candidates']['new'] for i in items)
    diff_rn = sum(i['candidates']['raw'] != i['candidates']['new'] for i in items)
    print(f'{lecture}: {len(items)} items, {unaligned} unaligned; old!=new {diff_on}, raw!=new {diff_rn}')

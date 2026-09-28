"""Every paragraph where the new repair differs from the old one: what changed,
and character similarity of each to the editor's reviewed paragraph.
Writes sites.json (input to the precision screen) and prints a summary."""
import difflib, json, statistics, sys
E = sys.argv[1]
ratio = lambda a, b: difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()
sites = []
for lecture in ('numpy', 'functions', 'matplotlib'):
    for i, it in enumerate(json.load(open(f'{E}/items-{lecture}.json'))):
        o, n = it['candidates']['old'], it['candidates']['new']
        if o == n:
            continue
        ops = [(tag, o[i1:i2], n[j1:j2]) for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, o, n, autojunk=False).get_opcodes() if tag != 'equal']
        kinds = []
        for tag, a, b in ops:
            if a == ',' and b == '.': kinds.append('split')
            elif a == '' and b == ':': kinds.append('colon')
            elif a == ':' and b == '': kinds.append('colon-removed')
            else: kinds.append(f'{tag}:{a!r}->{b!r}')
        sites.append({'id': f'{lecture}-d{it["draw"]}-{i}', 'lecture': lecture, 'draw': it['draw'], 'en': it['en'], 'ref': it['ref'],
                      'raw': it['candidates']['raw'], 'old': o, 'new': n, 'kinds': kinds,
                      'sim_old': round(ratio(o, it['ref']), 4), 'sim_new': round(ratio(n, it['ref']), 4)})
json.dump(sites, open(f'{E}/sites.json', 'w'), ensure_ascii=False, indent=1)
from collections import Counter
print(len(sites), 'paragraphs differ old vs new;', Counter(k for s in sites for k in s['kinds']).most_common(8))
for lecture in ('numpy', 'functions', 'matplotlib'):
    S = [s for s in sites if s['lecture'] == lecture]
    if not S: print(lecture, 'no sites'); continue
    d = [s['sim_new'] - s['sim_old'] for s in S]
    print(f"{lecture}: {len(S)} paragraphs; similarity to his text old→new mean {statistics.mean(s['sim_old'] for s in S):.3f}→{statistics.mean(s['sim_new'] for s in S):.3f}; closer {sum(x>0 for x in d)}, further {sum(x<0 for x in d)}, same {sum(x==0 for x in d)}")

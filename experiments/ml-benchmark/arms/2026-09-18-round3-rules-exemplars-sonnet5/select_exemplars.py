"""Select style exemplars from editor-reviewed lectures (ml round 3).

Candidates are aligned EN → reviewed-ML paragraph pairs (align.py). A pair is
eligible only if it would pass the current lints — the round-1 lecture contains
forms the editor corrected in round 2, and an exemplar must never contradict a
rule. Selection is greedy for coverage of the style features the round-3 review
showed the rules do not reach (clause-boundary commas, aspect, conditionals,
sentence splits, hortative, full-sentence bullets).

usage: select_exemplars.py <lecture>:<n> [<lecture>:<n> ...] > exemplars.json
"""
import json
import re
import sys

from align import align, ML

BANNED = ['ഉപയോഗപ്രദ', 'ഇതിനകം', 'ഒരു നൽകിയ', 'കുറച്ചുകൂടെ', 'കണക്കിലെടുക്ക', 'ഉദാഹരണ', 'നിലവിലുണ്ട്', 'സൃഷ്ടിച്ച']
OPEN_QUESTIONS = ['draw ചെയ്യ']  # lecture-python-programming.ml#22
TARGET = {'comma+', 'asp', 'cond', 'split', 'topic', 'hort', 'bullet'}


def feats(en, ml):
    f = []
    if ml.count(',') > en.count(','):
        f.append('comma+')
    if re.search('ിരിക്കുന്ന|ിട്ടുണ്ട്', ml):
        f.append('asp')
    if re.search(r'ാൽ,?\s', ml):
        f.append('cond')
    if len(re.findall(r'[.!?](\s|$)', ml)) > len(re.findall(r'[.!?](\s|$)', en)):
        f.append('split')
    if re.search('നമുക്ക്.*ാം[.:]', ml):
        f.append('hort')
    if re.match(r'^\s*(\*|\d+\.)\s', ml):
        f.append('bullet')
    if 'എന്നത്,' in ml:
        f.append('topic')
    return f


def eligible(en, ml):
    if not ML.search(ml) or '\n' in ml or ml.count('$') > 4:
        return False
    if not 35 <= len(en) <= 240 or len(ml) > 210:
        return False
    if any(b in ml for b in BANNED + OPEN_QUESTIONS):
        return False
    if re.search(r'നമ്മൾ[^.]*ും[.]', ml):  # plain future, superseded by the hortative rule
        return False
    body = re.sub(r'^\s*(\*|\d+\.)\s+', '', ml)
    if re.match(r'[a-z]', body):  # lowercase-initial
        return False
    if re.search(r'[:,]\s*\S{0,3}$', en) and not ml.rstrip().endswith(':'):
        return False  # EN paragraph runs on into a list the pair does not carry
    return bool(re.search(r'[.:)!?]$', ml.rstrip()))  # no bare endings


def pick(pool, n):
    chosen, cover = [], {}
    pool = [x for x in pool if set(x['f']) & TARGET]
    while pool and len(chosen) < n:
        best = max(pool, key=lambda x: (sum(1.0 / (1 + cover.get(t, 0)) for t in set(x['f']) & TARGET), -len(x['ml'])))
        chosen.append(best)
        pool.remove(best)
        for t in set(best['f']) & TARGET:
            cover[t] = cover.get(t, 0) + 1
    return chosen


if __name__ == '__main__':
    out = []
    for spec in sys.argv[1:]:
        lecture, n = spec.split(':')
        pairs, _ = align(open(f'corpus/{lecture}.en.md').read(), open(f'corpus/{lecture}.ml.md').read())
        pool = []
        for p in pairs:
            en, ml = ' '.join(p['en'].split()), p['tr'].strip()
            if eligible(en, ml):
                pool.append({'en': en, 'ml': ml, 'source': f'lecture-python-programming.ml {lecture}', 'f': feats(en, ml)})
        out += pick(pool, int(n))
    json.dump([{k: v for k, v in x.items() if k != 'f'} for x in out], sys.stdout, ensure_ascii=False, indent=1)

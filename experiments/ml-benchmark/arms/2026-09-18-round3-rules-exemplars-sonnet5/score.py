"""Score draws of a lecture against the editor's reviewed text, paragraph by paragraph.

usage (from this directory): python3 score.py matplotlib | functions
"""
import difflib
import glob
import json
import re
import statistics as st
import sys

from align import align, ML

LECTURE = sys.argv[1] if len(sys.argv) > 1 else 'matplotlib'
EN = open(f'corpus/{LECTURE}.en.md').read()
REVIEWED = open(f'corpus/{LECTURE}.ml.md').read()


def by_en(text):
    pairs, skipped = align(EN, text)
    return {(p['anchor'], p['en']): p['tr'] for p in pairs}, skipped


REF, _ = by_en(REVIEWED)
REF_ML = {k: v for k, v in REF.items() if ML.search(v)}
FR = EN[EN.index('## Further Reading'):EN.index('## Exercises')] if '## Further Reading' in EN else None

SIGS = [
    ('commas / Malayalam paragraph', None),
    ('-തിരിക്കുന്ന / -ഇട്ടുണ്ട് (aspect)', r'ിരിക്കുന്ന|ിട്ടുണ്ട്'),
    ('conditional ചെയ്താൽ / ഉപയോഗിച്ചാൽ', r'ചെയ്താൽ|ഉപയോഗിച്ചാൽ'),
    ('കരുതാം', r'കരുതാം'),
    ('എന്നത്,', r'എന്നത്,'),
    ('ഇനി,', r'ഇനി,'),
    ('ഒന്നിലധികം (vs multiple)', r'ഒന്നിലധികം'),
    ('multiple (−)', r'\bmultiple\b'),
    ('വ്യക്തമായ- (vs explicit)', r'വ്യക്തമായ'),
    ('explicit ആയ (−)', r'explicit ആയ'),
    ('പോലെയുള്ള (vs -like)', r'പോലെയുള്ള'),
    ('dictionary-like (−)', r'dictionary-like'),
    ('ലളിതമായ (−)', r'ലളിത'),
    ('നീക്കം ചെയ്യ (−)', r'നീക്കം ചെയ്യ'),
    ('refugees / home literal (−)', r'refugees|home ആയി|ready home'),
    ('പിന്തുടര (follow, −)', r'പിന്തുടര'),
]


def score(path):
    text = open(path).read()
    tr, skipped = by_en(text)
    sims = []
    for k, ref in REF_ML.items():
        if k in tr:
            sims.append(difflib.SequenceMatcher(None, tr[k], ref, autojunk=False).ratio())
    mal = [v for v in tr.values() if ML.search(v)]
    prose = '\n'.join(mal)
    row = {
        'n': len(sims),
        'median': st.median(sims),
        'mean': st.mean(sims),
        'exact': sum(s == 1.0 for s in sims),
        'ge90': sum(s >= 0.9 for s in sims),
        'lt70': sum(s < 0.7 for s in sims),
        'fr_verbatim': (FR in text) if FR else None,
        'sig': {},
    }
    for name, rx in SIGS:
        if rx is None:
            row['sig'][name] = round(sum(v.count(',') for v in mal) / max(1, len(mal)), 2)
        else:
            row['sig'][name] = len(re.findall(rx, prose))
    return row


if __name__ == '__main__':
    if LECTURE == 'functions':
        arms = '..'
        groups = [
            ('reviewed (target)', ['corpus/functions.ml.md']),
            ('round-2 arm, v0.4 rules (engine ml-round2-v04)', [f'{arms}/2026-09-01-round2-rules-sonnet5/functions.md']),
            ('round-2 arm second draw, v0.27.0', [f'{arms}/2026-09-01-round2-rules-sonnet5/functions-v0.27.0.md']),
        ] + [(arm, sorted(glob.glob(f'draws/functions-{arm}-draw*.md'))) for arm in ('fA', 'fB', 'fBex', 'fBcon', 'fBbig', 'fAbig')]
    else:
      groups = [
        ('reviewed (target)', ['corpus/matplotlib.ml.md']),
        ('seed v0.27.0', ['../2026-09-03-round3-matplotlib-v0.28.0/matplotlib-v0.27.0.md']),
        ('seed v0.28.0 (what he reviewed)', ['../2026-09-03-round3-matplotlib-v0.28.0/matplotlib-v0.28.0.md']),
    ] + [(arm, sorted(glob.glob(f'draws/matplotlib-{arm}-draw*.md'))) for arm in ('A', 'Aex', 'B', 'Bex')]
    results = {}
    for name, paths in groups:
        rows = [score(p) for p in paths]
        if not rows:
            continue
        results[name] = rows
        med = [r['median'] for r in rows]
        print(f"\n== {name}  (draws={len(rows)}, paragraphs={rows[0]['n']})")
        print('   median sim per draw:', ' '.join(f'{m:.3f}' for m in med), f'| arm mean {st.mean(med):.3f}')
        print('   mean sim per draw:  ', ' '.join(f"{r['mean']:.3f}" for r in rows), f"| arm mean {st.mean(r['mean'] for r in rows):.3f}")
        print('   exact / >=0.90 / <0.70:', ' '.join(f"{r['exact']}/{r['ge90']}/{r['lt70']}" for r in rows))
        print('   Further Reading verbatim:', [r['fr_verbatim'] for r in rows])
        for s, _ in SIGS:
            print(f'   {s:38s}', [r['sig'][s] for r in rows])
    json.dump(results, open(f'scores-{LECTURE}.json', 'w'), ensure_ascii=False, indent=1)

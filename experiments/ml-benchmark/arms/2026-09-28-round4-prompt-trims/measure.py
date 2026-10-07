"""Per-draft measurements for the round-4 prompt-trim arms.

usage: measure.py <draws-dir> <src-root> <ml_metrics.py> > records.jsonl
Draws are named <lecture>-<arm>-draw<n>.md; sources live at <src-root>/src-<lecture>/lectures/<lecture>.md.
Arms: A = rules at v0.29.3; B = all four trims; C = rule-19 exception only; D = the three deletions only.
"""
import glob, json, re, sys, importlib.util
from pathlib import Path
DRAWS, SRC, METRICS = sys.argv[1:4]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from align import align
spec = importlib.util.spec_from_file_location('m', METRICS); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
ALREADY = re.compile(r"(have|'ve|has) already\s+(seen|met)", re.I)
def form(tr):
    return 'completive' if 'കഴിഞ്ഞ' in tr else ('perfect' if 'ട്ടുണ്ട്' in tr else 'other')
for f in sorted(glob.glob(f'{DRAWS}/*-draw*.md')):
    lec, arm, n = re.match(r'.*/(.+)-([A-D])-draw(\d+)\.md', f).groups()
    EN = open(f'{SRC}/src-{lec}/lectures/{lec}.md', encoding='utf-8').read()
    T = open(f, encoding='utf-8').read()
    pairs = align(EN, T)[0]
    lint = m.round2_lints(T)
    bare = sum(1 for x in lint['terminal_punctuation'] if x['kind'].startswith('bare'))
    rec = {'lecture': lec, 'arm': arm, 'draw': int(n), 'bare_endings': bare, 'bare_mode': bare >= 10,
           'splice_per_100': m.comma_splice_rate(T)['per_100_lines'],
           'already_sites': [], 'simple_past_already_saw': [], 'alpha_site': None,
           'dash_sites_kept': [], 'work_latin': len(re.findall(r'\bwork', T)), 'pravarthikk': T.count('പ്രവർത്തിക്ക')}
    ml = [p['tr'] for p in pairs if re.search('[ഀ-ൿ]', p['tr'])]
    opener = next((t for t in ml if 'എന്നത്' in t), '')
    rec['opener_ennath_comma'] = 'എന്നത്,' in opener
    for p in pairs:
        en, tr = p['en'], p['tr']
        if ALREADY.search(en) and not tr.lstrip().startswith('*'):
            rec['already_sites'].append({'form': form(tr), 'tr': tr})
        if 'We already saw' in en:
            rec['simple_past_already_saw'].append({'form': form(tr), 'tr': tr})
        if 'also used `alpha`' in en:
            rec['alpha_site'] = {'perfect': 'ട്ടുണ്ട്' in tr, 'tr': tr}
        if re.search(r'\S---\S|—', en):
            rec['dash_sites_kept'].append(bool(re.search(r'---|—', tr)))
    print(json.dumps(rec, ensure_ascii=False))

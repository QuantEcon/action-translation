"""For every raw draw: apply ml_repair before #331 (old) and after it (new),
then score raw/old/new with the NEW ml_metrics so the measure is the same for
all three. Writes draws/<l>-{old,new}-draw<n>.md and scores.json."""
import glob, json, re, shutil, subprocess, sys, importlib.util
E = sys.argv[1]; WT = sys.argv[2]
NEW = f'{WT}/experiments/ml-benchmark/scripts'; OLD = f'{E}/old-scripts'
spec = importlib.util.spec_from_file_location('m', f'{NEW}/ml_metrics.py'); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

def run_repair(scripts, src, dst):
    shutil.copy(src, dst)
    r = subprocess.run([sys.executable, f'{scripts}/ml_repair.py', '--output', dst, '--write', '--json'],
                       cwd=WT, capture_output=True, text=True)
    if r.returncode: raise SystemExit(f'repair failed on {dst}: {r.stderr[-500:]}')
    return json.loads(r.stderr.strip().splitlines()[-1])

def score(path):
    t = open(path, encoding='utf-8').read()
    lint = m.round2_lints(t)
    return {'splice': m.comma_splice_rate(t), **{k: len(v) for k, v in lint.items()}}

out = {}
for raw in sorted(glob.glob(f'{E}/draws/*-raw-draw*.md')):
    base = raw.split('/')[-1]
    l, n = re.match(r'(.+)-raw-draw(\d+)\.md', base).groups()
    rec = {'lecture': l, 'draw': int(n)}
    for arm, scripts in (('old', OLD), ('new', NEW)):
        dst = f'{E}/draws/{l}-{arm}-draw{n}.md'
        rec[f'repair_{arm}'] = run_repair(scripts, raw, dst)
    for arm in ('raw', 'old', 'new'):
        rec[f'score_{arm}'] = score(f'{E}/draws/{l}-{arm}-draw{n}.md')
    a = open(f'{E}/draws/{l}-old-draw{n}.md').read().split('\n'); b = open(f'{E}/draws/{l}-new-draw{n}.md').read().split('\n')
    rec['lines_old_vs_new'] = sum(x != y for x, y in zip(a, b)) + abs(len(a) - len(b))
    out[f'{l}-{n}'] = rec
for ref in ('numpy', 'functions', 'matplotlib'):
    out[f'{ref}-editor'] = {'lecture': ref, 'score_ref': score(f'{E}/corpus/{ref}.ml.md')}
json.dump(out, open(f'{E}/scores.json', 'w'), ensure_ascii=False, indent=1)
print(len(out), 'records')

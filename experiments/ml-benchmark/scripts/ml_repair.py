"""Deterministic repair of four Malayalam rule misses the model makes reliably
even though the prompt states the rule (the #260 post-processing prototype):

  1. sentence-initial "ഉദാഹരണത്തിന്," → "For example," (discourse rule);
  2. a Malayalam prose line that ends bare immediately before a code cell or a
     list gets a terminal colon (terminal-punctuation rule);
  3. two adjacent hyphen-suffixed -ഉം items with no comma between them get one
     (Columns-ഉം rows-ഉം → Columns-ഉം, rows-ഉം) — the editor's answer on
     lecture-python-programming.ml#22 is "always", so there is no judgement in it;
  4. a finite clause joined to the next by a comma and a resumptive pronoun or
     connective is split into two sentences (… methods ഉണ്ട്, ഇവയെല്ലാം … →
     … methods ഉണ്ട്. ഇവയെല്ലാം …, rule 12). The editor removed that comma at
     every such site he edited in rounds 1, 2 and 4 (lecture-python-programming
     .ml#23), with a full stop at 19 of 25 — the rest an em-dash, a semicolon or
     a converb, which are his choices and not generated.

Only the "bare ending before a cell or list" class is repaired; the lint's other
class ("paragraph without terminal punctuation") is left alone. Line
classification is delegated to ml_metrics so the two scripts cannot disagree
about what is prose, and the splice repair calls ml_metrics' own classifier.
Disclose the counts on the seed PR: a repaired line the editor changes back is
evidence the repair is wrong.

usage: ml_repair.py --output translated.md [--source english.md] [--write] [--json]
Without --write the repaired text goes to stdout; with it the file is rewritten.
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from ml_metrics import split_resumptive_splices  # noqa: E402
FOR_EXAMPLE = re.compile(r'(^|\n)(\s*(?:[*-]|\d+\.)?\s*)ഉദാഹരണത്തിന്,')
UM_PAIR = re.compile(r'(\S+-ഉം)(\s+\S+-ഉം)')


def lint(output: Path, source: Path | None):
    cmd = [sys.executable, str(HERE / 'ml_metrics.py'), '--output', str(output), '--json']
    if source:
        cmd += ['--source', str(source)]
    res = subprocess.run(cmd, capture_output=True, text=True)
    return json.loads(res.stdout)


def repair(text: str, bare_lines: list[int], um_lines: list[int] | None = None,
           splice_lines: list[int] | None = None) -> tuple[str, dict]:
    lines = text.split('\n')
    colons = 0
    for n in bare_lines:
        line = lines[n - 1]
        # A closing bracket is terminated only after a stop, as in the lint: the
        # deep-copy line "(… വിളിക്കുന്നു)" before a cell gets his "):" (ml#23
        # 920). A paragraph that is wholly bracketed is left to the lint — he put
        # that stop inside the bracket (ml#23 197), and not before a cell.
        if (re.search('[ഀ-ൿ]', line) and not re.search(r'(?:[.:!?,]|[.!?:…]\))\s*$', line)
                and not line.lstrip().startswith('(')):
            lines[n - 1] = line.rstrip() + ':'
            colons += 1
    commas = 0
    for n in sorted(set(um_lines or [])):
        lines[n - 1], k = UM_PAIR.subn(r'\1,\2', lines[n - 1])
        commas += k
    splits = 0
    for n in sorted(set(splice_lines or [])):
        lines[n - 1], k = split_resumptive_splices(lines[n - 1])
        splits += k
    out = '\n'.join(lines)
    out, examples = FOR_EXAMPLE.subn(r'\1\2For example,', out)
    return out, {'colons_added': colons, 'for_example_restored': examples, 'um_commas_added': commas,
                 'splices_split': splits}


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--output', required=True)
    ap.add_argument('--source')
    ap.add_argument('--write', action='store_true')
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    out = Path(a.output)
    report = lint(out, Path(a.source) if a.source else None)
    bare = [x['line'] for x in report['lint']['terminal_punctuation'] if x['kind'].startswith('bare ending')]
    text = out.read_text(encoding='utf-8')
    um = [x['line'] for x in report['lint'].get('um_pair_without_comma', [])]
    splices = [x['line'] for x in report['lint'].get('comma_splice_resumptive', [])]
    fixed, stats = repair(text, bare, um, splices)
    if a.write:
        out.write_text(fixed, encoding='utf-8')
    else:
        sys.stdout.write(fixed)
    print(json.dumps(stats) if a.json else f"repaired: {stats}", file=sys.stderr)

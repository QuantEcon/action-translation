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
     every such site he edited in rounds 1, 2 and 4
     (lecture-python-programming.ml#23), with a full stop at 19 of 25 — the
     rest an em-dash, a semicolon or a converb, which are his choices and not
     generated. Round 5 (lecture-python-programming.ml#26) widened the subset
     from "comma + resumptive pronoun" to "comma + a continuing clause": he
     split 7 of the 8 such sites and kept only a coordination; the guards are
     ml_metrics' (coordinators, a repeated finite form, an "X, not Y" contrast);
  5. a sentence-initial English discourse formula the model rendered in
     Malayalam is restored, gated on the source: only where the aligned English
     paragraph opens with that formula ("In fact," ← വാസ്തവത്തിൽ, ml#26 137;
     "In essence," ← അടിസ്ഥാനപരമായി, 159; "In practice," ← Practice-ൽ, 190;
     "As a rule," and the one-line "And so on." from round 4). He has restored
     six such formulas to English across rounds and moved none the other way;
     "In addition," is deliberately absent — he kept ഇത് കൂടാതെ, (ml#26 342).
     Needs --source; without it nothing is restored;
  6. a list of short labels the model translated is restored to the English
     byte for byte, gated on the source (ml_metrics.is_label_list). The editor
     returned the five such pandas bullets to English (ml#26 68-72) and ruled on
     lecture-python-programming.ml#57 (Q1, 2026-10-20) that short bullets stay
     English as a general rule. Needs --source.

Repair 3 also covers case-marked pairs since his ml#57 answer (Q2, "always a
comma"): speed-ന്റെയും memory-യുടെയും → speed-ന്റെയും, memory-യുടെയും.

Only the "bare ending before a cell or list" class is repaired; the lint's other
class ("paragraph without terminal punctuation") is left alone. Line
classification is delegated to ml_metrics so the two scripts cannot disagree
about what is prose, and the splice repair calls ml_metrics' own classifier.
Disclose the counts on the seed PR: a repaired line the editor changes back is
evidence the repair is wrong.

usage: ml_repair.py --output translated.md [--source english.md] [--write] [--json]
Without --write the repaired text goes to stdout; with it the file is rewritten.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from ml_metrics import LIST_ITEM_RE, add_um_commas, label_list_sites, prose_line_info, split_splices  # noqa: E402
FOR_EXAMPLE = re.compile(r'(^|\n)(\s*(?:[*-]|\d+\.)?\s*)ഉദാഹരണത്തിന്,')
# (English opener, the Malayalam openers the model writes for it). Each entry
# is editor-attested: he restored the English at every site across rounds.
FORMULAS: list[tuple[str, tuple[str, ...]]] = [
    ('In fact,', ('വാസ്തവത്തിൽ,',)),
    ('In essence,', ('അടിസ്ഥാനപരമായി,', 'സാരാംശത്തിൽ,')),
    ('Basically,', ('അടിസ്ഥാനപരമായി,',)),
    ('In practice,', ('Practice-ൽ,', 'പ്രായോഗികമായി,')),
    ('As a rule,', ('സാധാരണയായി,', 'പൊതുവേ,')),
    ('On the other hand,', ('മറുവശത്ത്,',)),
    ('In particular,', ('പ്രത്യേകിച്ച്,', 'പ്രത്യേകിച്ചും,')),
    ('Obviously,', ('വ്യക്തമായും,',)),
]
# A one-sentence paragraph restored whole.
WHOLE_LINE: list[tuple[str, re.Pattern[str]]] = [
    ('And so on.', re.compile(r'^ഇങ്ങനെ തുടര\S*\.$')),
]
_LATIN_TOKEN = re.compile(r'[A-Za-z_]{3,}')


def paragraphs(text: str) -> list[tuple[int, str]]:
    """(1-based line number of the first line, joined text) for each prose
    paragraph, by ml_metrics' classifier so both documents are cut alike."""
    out: list[tuple[int, list[str]]] = []
    for p in prose_line_info(text):
        if p['starts_para'] or not out:
            out.append((p['n'], [p['line']]))
        else:
            out[-1][1].append(p['line'])
    return [(n, ' '.join(ls)) for n, ls in out]


def align_paragraphs(ml: list[tuple[int, str]], en: list[tuple[int, str]], window: int = 4) -> dict[int, int]:
    """ml paragraph index → en paragraph index, by Latin-token overlap within a
    positional window. Resolved 144/144 pandas paragraphs in the round-5 analysis."""
    def key(s: str) -> set[str]:
        return {w.lower() for w in _LATIN_TOKEN.findall(s)}
    out: dict[int, int] = {}
    for i, (_, s) in enumerate(ml):
        a = key(s)
        best, best_j = -1.0, None
        for j in range(max(0, i - window), min(len(en), i + window + 1)):
            b = key(en[j][1])
            jac = len(a & b) / max(1, len(a | b))
            if jac > best:
                best, best_j = jac, j
        # No Latin tokens on either side (a one-line "And so on.") leaves every
        # candidate at zero: fall back to the same position.
        if best <= 0 and i < len(en):
            best_j = i
        if best_j is not None:
            out[i] = best_j
    return out


def restore_formulas(text: str, source: str) -> tuple[str, int]:
    """Restore sentence-initial English discourse formulas, source-gated."""
    lines = text.split('\n')
    ml = paragraphs(text)
    en = paragraphs(source)
    amap = align_paragraphs(ml, en)
    n = 0
    for i, (start, _) in enumerate(ml):
        if i not in amap:
            continue
        en_text = en[amap[i]][1].lstrip()
        en_text = LIST_ITEM_RE.sub('', en_text)
        line = lines[start - 1]
        m = LIST_ITEM_RE.match(line)
        prefix = line[: m.end()] if m else re.match(r'\s*', line).group(0)
        body = line[len(prefix):]
        for english, openers in FORMULAS:
            if not en_text.startswith(english):
                continue
            for opener in openers:
                if body.startswith(opener):
                    lines[start - 1] = prefix + english + body[len(opener):]
                    n += 1
                    break
            break
        for english, pat in WHOLE_LINE:
            if en_text.strip() == english and pat.match(body.strip()):
                lines[start - 1] = prefix + english
                n += 1
    return '\n'.join(lines), n


def restore_label_lists(text: str, source: str) -> tuple[str, int]:
    """Restore each item of an English label list the model translated, from
    the source line byte for byte (ml#57 Q1)."""
    lines = text.split('\n')
    sites = label_list_sites(text, source)
    for s in sites:
        lines[s['line'] - 1] = s['english']
    return '\n'.join(lines), len(sites)


def lint(output: Path, source: Path | None):
    cmd = [sys.executable, str(HERE / 'ml_metrics.py'), '--output', str(output), '--json']
    if source:
        cmd += ['--source', str(source)]
    res = subprocess.run(cmd, capture_output=True, text=True)
    return json.loads(res.stdout)


def repair(text: str, bare_lines: list[int], um_lines: list[int] | None = None,
           splice_lines: list[int] | None = None, source: str | None = None) -> tuple[str, dict]:
    # First, so no other repair is counted on a line the restore replaces; it
    # replaces lines one for one, so the lint's line numbers still hold.
    labels = 0
    if source is not None:
        text, labels = restore_label_lists(text, source)
    lines = text.split('\n')
    colons = 0
    for n in bare_lines:
        line = lines[n - 1]
        # A closing bracket is terminated only after a stop, as in the lint: the
        # deep-copy line "(… വിളിക്കുന്നു)" before a cell gets his "):" (ml#23
        # 920). A paragraph that is wholly bracketed is left to the lint — he put
        # that stop inside the bracket (ml#23 197), and not before a cell — as is
        # a comma before a cell, which appending would turn into ",:".
        if (re.search('[ഀ-ൿ]', line) and not re.search(r'(?:[.:!?,]|[.!?:…]\))\s*$', line)
                and not line.lstrip().startswith('(')):
            lines[n - 1] = line.rstrip() + ':'
            colons += 1
    commas = 0
    for n in sorted(set(um_lines or [])):
        lines[n - 1], k = add_um_commas(lines[n - 1])
        commas += k
    splits = 0
    for n in sorted(set(splice_lines or [])):
        lines[n - 1], k = split_splices(lines[n - 1])
        splits += k
    out = '\n'.join(lines)
    out, examples = FOR_EXAMPLE.subn(r'\1\2For example,', out)
    formulas = 0
    if source is not None:
        out, formulas = restore_formulas(out, source)
    return out, {'colons_added': colons, 'for_example_restored': examples, 'um_commas_added': commas,
                 'splices_split': splits, 'formulas_restored': formulas, 'label_bullets_restored': labels}


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
    splices = [x['line'] for x in report['lint'].get('comma_splice_repairable', [])]
    source = Path(a.source).read_text(encoding='utf-8') if a.source else None
    fixed, stats = repair(text, bare, um, splices, source)
    if a.write:
        out.write_text(fixed, encoding='utf-8')
    else:
        sys.stdout.write(fixed)
    print(json.dumps(stats) if a.json else f"repaired: {stats}", file=sys.stderr)

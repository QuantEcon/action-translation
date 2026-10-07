"""Align the prose paragraphs of an English MyST lecture with a translation of it.

Both files share their structure (headings stay English in ml, code cells are
byte-identical), so paragraphs are paired by position between structural anchors.
A segment whose paragraph counts differ is skipped rather than guessed at.
"""
import re
import sys
import json

ML = re.compile('[ഀ-ൿ]')
FENCE = re.compile(r'^\s{0,3}(`{3,}|~{3,}|:{3,})(.*)$')
PROSE_DIRECTIVES = {'note', 'warning', 'tip', 'important', 'admonition', 'seealso', 'caution'}
SKIP_DIRECTIVES = {'exercise', 'exercise-start', 'solution', 'solution-start', 'hint'}


def strip_frontmatter(lines):
    if lines and lines[0].strip() == '---':
        for i in range(1, len(lines)):
            if lines[i].strip() == '---':
                return lines[i + 1:]
    return lines


def blocks(text):
    """Yield ('anchor', key) and ('para', text) items, skipping exercise regions."""
    lines = strip_frontmatter(text.split('\n'))
    out, para = [], []
    stack = []  # (marker, literal)
    skip_until = None
    ncode = 0

    def flush():
        if para:
            out.append(('para', '\n'.join(para)))
            para.clear()

    for line in lines:
        s = line.strip()
        m = FENCE.match(line)
        if stack and stack[-1][1]:  # inside a literal fence: only its closer matters
            if m and m.group(1)[0] == stack[-1][0][0] and len(m.group(1)) >= len(stack[-1][0]) and not m.group(2).strip():
                stack.pop()
            continue
        if m:
            flush()
            marker, rest = m.group(1), m.group(2).strip()
            d = re.match(r'\{([\w:+.-]+)\}', rest)
            name = d.group(1) if d else None
            if not rest and stack and marker[0] == stack[-1][0][0] and len(marker) >= len(stack[-1][0]):
                stack.pop()
                continue
            if name in ('exercise-start', 'solution-start'):
                skip_until = name.replace('start', 'end')
            if name in ('exercise-end', 'solution-end'):
                skip_until = None
                continue
            if name in PROSE_DIRECTIVES:
                stack.append((marker, False))
                out.append(('anchor', 'dir:' + name))
            elif name in ('exercise-start', 'solution-start'):
                pass  # one-line fence, region handled by skip_until
            else:
                stack.append((marker, True))
                ncode += 1
                out.append(('anchor', f'code:{ncode}'))
            continue
        if skip_until:
            continue
        if not s:
            flush()
            continue
        if s.startswith('#'):
            flush()
            out.append(('anchor', 'h:' + s))
            continue
        if re.match(r'^\([\w:.-]+\)=$', s) or s.startswith('+++') or s.startswith('%'):
            flush()
            continue
        # list items are their own paragraphs
        if re.match(r'^(\*|-|\d+\.)\s', s):
            flush()
            para.append(line)
            continue
        if para and re.match(r'^(\*|-|\d+\.)\s', para[0].strip()) and not line.startswith(' '):
            flush()
        para.append(line)
    flush()
    return out


def segments(items):
    segs, cur, key = [], [], 'start'
    for kind, val in items:
        if kind == 'anchor':
            segs.append((key, cur))
            cur, key = [], val
        else:
            cur.append(val)
    segs.append((key, cur))
    return segs


def align(en_text, tr_text):
    se, st = segments(blocks(en_text)), segments(blocks(tr_text))
    pairs, skipped = [], 0
    # anchors: headings are identical strings; code/dir anchors are positional
    ke, kt = [k for k, _ in se], [k for k, _ in st]
    if ke != kt:
        # fall back to aligning on the common anchor subsequence
        import difflib
        sm = difflib.SequenceMatcher(None, ke, kt, autojunk=False)
        idx = [(i + d, j + d) for i, j, n in sm.get_matching_blocks() for d in range(n)]
    else:
        idx = [(i, i) for i in range(len(ke))]
    for i, j in idx:
        pe, pt = se[i][1], st[j][1]
        if len(pe) != len(pt):
            skipped += len(pe)
            continue
        section = se[i][0]
        for a, b in zip(pe, pt):
            pairs.append({'anchor': section, 'en': a, 'tr': b})
    return pairs, skipped


if __name__ == '__main__':
    en, tr = open(sys.argv[1]).read(), open(sys.argv[2]).read()
    pairs, skipped = align(en, tr)
    mal = [p for p in pairs if ML.search(p['tr'])]
    print(f'{len(pairs)} pairs ({len(mal)} Malayalam), {skipped} EN paragraphs skipped', file=sys.stderr)
    json.dump(pairs, sys.stdout, ensure_ascii=False, indent=1)

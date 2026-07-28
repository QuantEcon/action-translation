#!/usr/bin/env python3
"""Extract aligned English/Malayalam passage pairs from a structurally-identical pair of documents.

Built for Stage 2 of #228 (the content-mix catalog) and reused by Stage 1's
divergence inventory. The point of doing this in a script rather than by reading
and retyping: Malayalam uses ZWJ/ZWNJ (U+200D/U+200C) in chillu formations, and
copy-paste through an editor or a model's context can silently strip them. Every
passage this emits is sliced byte-exact from the file, never retyped. See
`reference/README.md` for the same hazard in the reference-commit procedure.

Alignment assumes the two documents are structurally identical — which for the
harness seeds is guaranteed by the #159 parity guard passing on write, and is
re-asserted here rather than trusted.

Usage:
    python3 passage_pairs.py --source base-lecture.md --target base-lecture-ml.md
    python3 passage_pairs.py --source a.md --target b.md --situation math --json
"""

import argparse
import json
import re
import sys

FENCE = re.compile(r'^\s*(`{3,})\{([\w-]+)\}')
# Any fence opener that is NOT a `{directive}`: ```python, ~~~, or a bare ```.
# Must be tried only after FENCE, which claims the braced form.
FENCE_PLAIN = re.compile(r'^\s*(`{3,}|~{3,})([^\s{][^\n]*)?\s*$')
HEADING = re.compile(r'^(#{1,6})\s+(.*)$')
DOLLAR = re.compile(r'^\$\$\s*$')
ML_RANGE = (0x0D00, 0x0D7F)


def strip_frontmatter(text):
    """Drop a leading YAML frontmatter block — jupytext metadata is not prose."""
    if not text.startswith('---'):
        return text
    lines = text.split('\n')
    for i in range(1, len(lines)):
        if lines[i].strip() == '---':
            return '\n'.join(lines[i + 1:])
    return text


def ml_codepoints(s):
    return sum(1 for c in s if ML_RANGE[0] <= ord(c) <= ML_RANGE[1])


def latin_letters(s):
    return sum(1 for c in s if ('a' <= c <= 'z') or ('A' <= c <= 'Z'))


def blocks(lines):
    """Segment a document into typed blocks, tracking fenced regions.

    Returns a list of dicts: {kind, name, start, end, lines}. `kind` is one of
    heading / directive / codefence / mathfence / para. Code and math fences are
    kept whole so prose extraction never reaches inside one.

    `codefence` covers a fence with no `{directive}` — ```python, ~~~, or a bare
    ```. Its `name` is the language tag if there is one, else None.
    """
    out = []
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        m = FENCE.match(line)
        if m:
            ticks, name = m.group(1), m.group(2)
            j = i + 1
            close = re.compile(r'^\s*%s{%d,}\s*$' % (re.escape(ticks[0]), len(ticks)))
            while j < n and not close.match(lines[j]):
                j += 1
            out.append({'kind': 'directive', 'name': name, 'start': i, 'end': min(j, n - 1),
                        'lines': lines[i:min(j + 1, n)]})
            i = j + 1
            continue
        m = FENCE_PLAIN.match(line)
        if m:
            # A fence with no `{directive}` — ```python, ~~~, or a bare ```. Consumed
            # whole, exactly like a directive: before this branch existed the opener
            # fell through to the paragraph scan and the code inside was extracted as
            # prose. No document in this experiment triggered it (every fence in the
            # ml corpus is a braced MyST directive), but harness fixtures such as
            # `23-special-chars-lecture.md` are all plain fences and would have been
            # read as prose end to end.
            ticks, lang = m.group(1), (m.group(2) or '').strip() or None
            j = i + 1
            close = re.compile(r'^\s*%s{%d,}\s*$' % (re.escape(ticks[0]), len(ticks)))
            while j < n and not close.match(lines[j]):
                j += 1
            out.append({'kind': 'codefence', 'name': lang, 'start': i, 'end': min(j, n - 1),
                        'lines': lines[i:min(j + 1, n)]})
            i = j + 1
            continue
        if DOLLAR.match(line):
            j = i + 1
            while j < n and not DOLLAR.match(lines[j]):
                j += 1
            out.append({'kind': 'mathfence', 'name': '$$', 'start': i, 'end': min(j, n - 1),
                        'lines': lines[i:min(j + 1, n)]})
            i = j + 1
            continue
        h = HEADING.match(line)
        if h:
            out.append({'kind': 'heading', 'name': h.group(1), 'start': i, 'end': i,
                        'lines': [line], 'text': h.group(2)})
            i += 1
            continue
        if line.strip() == '':
            i += 1
            continue
        # A paragraph runs to the next blank line or structural marker. FENCE_PLAIN
        # belongs in this list too: without it a paragraph immediately followed by
        # ```python swallowed the fence and its code.
        j = i
        while (j < n and lines[j].strip() != '' and not FENCE.match(lines[j])
               and not FENCE_PLAIN.match(lines[j]) and not DOLLAR.match(lines[j])
               and not HEADING.match(lines[j])):
            j += 1
        out.append({'kind': 'para', 'name': None, 'start': i, 'end': j - 1, 'lines': lines[i:j]})
        i = j
    return out


def signature(bs):
    """Structural fingerprint used to assert the two documents align."""
    return [(b['kind'], b['name']) for b in bs]


def skeleton(bs):
    """Directive / math / heading sequence — the real structural contract.

    Paragraph counts legitimately differ between two independent translations
    (a translator may split or merge a paragraph), so comparing every block
    reports MISALIGNED on perfectly healthy documents. The skeleton is what the
    engine's own structural-parity guard cares about, and what a mismatch here
    would actually mean: a lost or transposed code cell, math block or heading.
    """
    return [(b['kind'], b['name']) for b in bs
            if b['kind'] in ('directive', 'mathfence', 'heading', 'codefence')]


def code_comments(block):
    """Comment lines inside a code fence, with their offsets."""
    res = []
    for off, ln in enumerate(block['lines']):
        s = ln.strip()
        if s.startswith('#') and not s.startswith('#!'):
            res.append((off, ln))
    return res


ADMONITIONS = ('note', 'hint', 'warning', 'tip', 'important', 'admonition',
               'exercise', 'exercise-start', 'solution-start', 'epigraph', 'seealso')


def emit_code_comments(pairs, a, b, i):
    """Pair up the comment lines inside two corresponding code fences."""
    for (oa, la), (ob, lb) in zip(code_comments(a), code_comments(b)):
        pairs.append({'situation': 'code-comment', 'block': i,
                      'source_line': a['start'] + oa + 1,
                      'target_line': b['start'] + ob + 1,
                      'en': la, 'ml': lb,
                      'identical': la.rstrip() == lb.rstrip(),
                      'ml_codepoints': ml_codepoints(lb)})


def emit_block_pair(pairs, a, b, i, bs=None):
    """Append the passage pairs a single aligned block pair contributes.

    Directive-anchored situations (heading, admonition, figure, code-comment) need
    only that this pair corresponds. Prose situations additionally need the
    surrounding paragraph sequence, so they are emitted only when `bs` is supplied.
    """
    if a['kind'] == 'heading':
        pairs.append({'situation': 'heading', 'block': i,
                      'source_line': a['start'] + 1, 'target_line': b['start'] + 1,
                      'en': a['lines'][0], 'ml': b['lines'][0],
                      'identical': a['lines'][0].rstrip() == b['lines'][0].rstrip()})
        return
    if a['kind'] == 'directive':
        if a['name'] in ADMONITIONS:
            pairs.append({'situation': 'admonition', 'directive': a['name'], 'block': i,
                          'source_line': a['start'] + 1, 'target_line': b['start'] + 1,
                          'en': '\n'.join(a['lines']), 'ml': '\n'.join(b['lines'])})
        if a['name'] in ('figure', 'image'):
            pairs.append({'situation': 'figure', 'directive': a['name'], 'block': i,
                          'source_line': a['start'] + 1, 'target_line': b['start'] + 1,
                          'en': '\n'.join(a['lines']), 'ml': '\n'.join(b['lines'])})
        if a['name'] in ('code-cell', 'code-block'):
            emit_code_comments(pairs, a, b, i)
        return
    if a['kind'] == 'codefence':
        # A plain fence carries comments worth reviewing just as a code-cell does.
        emit_code_comments(pairs, a, b, i)
        return
    if bs is None:
        return
    for sit in classify(bs, i):
        pairs.append({'situation': sit, 'block': i,
                      'source_line': a['start'] + 1, 'target_line': b['start'] + 1,
                      'en': '\n'.join(a['lines']), 'ml': '\n'.join(b['lines']),
                      'ml_codepoints': ml_codepoints('\n'.join(b['lines'])),
                      'latin_letters': latin_letters('\n'.join(b['lines']))})


def emit_text(report, pairs):
    counts = {}
    for p in pairs:
        counts[p['situation']] = counts.get(p['situation'], 0) + 1
    print(f"aligned={report['aligned']}  "
          f"skeleton_identical={report['skeleton_identical']}  "
          f"blocks={report['source_blocks']}")
    print("situations: " + ', '.join(f'{k}={v}' for k, v in sorted(counts.items())))
    print()
    for p in pairs:
        flag = ''
        if 'identical' in p:
            flag = '  [IDENTICAL]' if p['identical'] else '  [DIFFERS]'
        print(f"--- {p['situation']}  en:{p['source_line']} ml:{p['target_line']}{flag}")
        print(f"EN: {p['en']}")
        print(f"ML: {p['ml']}")
        print()


def classify(bs, idx):
    """Which content situations does block idx participate in?"""
    b = bs[idx]
    sits = []
    if b['kind'] != 'para':
        return sits
    nxt = bs[idx + 1] if idx + 1 < len(bs) else None
    if nxt and nxt['kind'] == 'mathfence':
        sits.append('math-intro')
    if nxt and nxt['kind'] == 'directive' and nxt['name'] == 'math':
        sits.append('math-intro')
    if nxt and nxt['kind'] == 'directive' and nxt['name'] in ('code-cell', 'code-block'):
        sits.append('code-intro')
    if nxt and nxt['kind'] == 'codefence':
        sits.append('code-intro')
    # depth of the most recent heading
    depth = 0
    for k in range(idx - 1, -1, -1):
        if bs[k]['kind'] == 'heading':
            depth = len(bs[k]['name'])
            break
    if depth >= 4:
        sits.append('nested-subsection')
    if not sits:
        sits.append('plain-prose')
    return sits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', required=True)
    ap.add_argument('--target', required=True)
    ap.add_argument('--situation', default=None,
                    help='math-intro | code-intro | nested-subsection | plain-prose | '
                         'admonition | figure | code-comment | heading')
    ap.add_argument('--json', action='store_true')
    args = ap.parse_args()

    src = strip_frontmatter(open(args.source, encoding='utf-8').read()).split('\n')
    tgt = strip_frontmatter(open(args.target, encoding='utf-8').read()).split('\n')
    bs, bt = blocks(src), blocks(tgt)

    sig_s, sig_t = signature(bs), signature(bt)
    skel_s, skel_t = skeleton(bs), skeleton(bt)
    aligned = sig_s == sig_t
    skeleton_ok = skel_s == skel_t
    report = {'source': args.source, 'target': args.target,
              'aligned': aligned, 'skeleton_identical': skeleton_ok,
              'blocks': len(bs),
              'source_blocks': len(bs), 'target_blocks': len(bt),
              'source_skeleton': len(skel_s), 'target_skeleton': len(skel_t),
              'pairs': []}

    if not skeleton_ok:
        # A skeleton mismatch is a real structural defect — a lost or transposed
        # code cell, math block or heading. Refuse to emit pairs.
        for k, (a, b) in enumerate(zip(skel_s, skel_t)):
            if a != b:
                report['skeleton_divergence'] = {
                    'index': k, 'source': list(a), 'target': list(b)}
                break
        else:
            report['skeleton_divergence'] = {
                'index': min(len(skel_s), len(skel_t)),
                'note': f'length differs: {len(skel_s)} vs {len(skel_t)}'}
        msg = f"STRUCTURAL DEFECT: {report['skeleton_divergence']}"
        print(json.dumps(report, ensure_ascii=False, indent=2) if args.json else msg,
              file=sys.stderr)
        return 2

    if not aligned:
        # Paragraph counts differ but the skeleton matches: a translator split or
        # merged a paragraph. Benign, and common between independent renderings —
        # so warn and carry on, emitting only the directive-anchored situations
        # (headings, admonitions, figures, code comments), which do not depend on
        # paragraph correspondence. Prose situations are suppressed because
        # pairing them by index would be wrong; see REPORT.md "Method corrections".
        report['note'] = ('paragraph structure differs but the skeleton is identical; '
                          'emitting directive-anchored situations only')
        print(f"NOTE: paragraph blocks differ ({len(bs)} vs {len(bt)}) but the "
              f"structural skeleton is identical ({len(skel_s)} items) — emitting "
              f"directive-anchored situations only", file=sys.stderr)
        pairs = []
        s_idx = [i for i, b in enumerate(bs)
                 if b['kind'] in ('directive', 'mathfence', 'heading', 'codefence')]
        t_idx = [i for i, b in enumerate(bt)
                 if b['kind'] in ('directive', 'mathfence', 'heading', 'codefence')]
        for si_, ti_ in zip(s_idx, t_idx):
            emit_block_pair(pairs, bs[si_], bt[ti_], si_)
    else:
        pairs = []
        for i, (a, b) in enumerate(zip(bs, bt)):
            emit_block_pair(pairs, a, b, i, bs=bs)

    if args.situation:
        pairs = [p for p in pairs if p['situation'] == args.situation]
    report['pairs'] = pairs

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        emit_text(report, pairs)
    return 0


if __name__ == '__main__':
    sys.exit(main())

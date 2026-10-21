"""Convergence of an ml draft against a reviewed reference, round-5 method (R8/R23).

Denominator: Malayalam-bearing prose lines above `## Exercises`, by the engine's
ml_metrics.prose_lines. Lines are paired within heading-delimited sections (headings
stay byte-identical English in ml), by order. Similarity: character SequenceMatcher (autojunk=False)
ratio. Edit mass: textstrata changed_chars (deleted + added) per 1,000 draft chars.

usage: python3 -I convergence.py ENGINE_SCRIPTS_DIR REFERENCE DRAFT [DRAFT ...]
"""
import difflib, json, re, statistics, sys
from pathlib import Path

sys.path.insert(0, sys.argv[1])
import ml_metrics as M  # noqa: E402

HEADING = re.compile(r"^#{1,6} ")


def sections(text):
    """[(heading, [prose lines])] above ## Exercises; Malayalam filtering is done on the draft side."""
    lines = text.split("\n")
    stop = next((i for i, l in enumerate(lines) if re.match(r"^## Exercises\s*$", l)), len(lines))
    prose = {n: line for n, line, _ in M.prose_lines(text)}
    out, cur, head = [], [], "(top)"
    for i, line in enumerate(lines[:stop], start=1):
        if HEADING.match(line):
            out.append((head, cur)); head, cur = line.strip(), []
        elif i in prose:
            cur.append(line.rstrip())
    out.append((head, cur))
    return out


def changed_chars(old, new):
    d = a = 0
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, old, new, autojunk=False).get_opcodes():
        if tag in ("replace", "delete"): d += i2 - i1
        if tag in ("replace", "insert"): a += j2 - j1
    return d + a


def compare(ref_text, draft_text):
    rs, ds = sections(ref_text), sections(draft_text)
    rmap = {}
    for h, ls in rs:
        rmap.setdefault(h, []).append(ls)
    pairs, unpaired, mismatched = [], 0, []
    seen = {}
    for h, dl in ds:
        k = seen.get(h, 0); seen[h] = k + 1
        rl = rmap.get(h, [None] * (k + 1))[k] if h in rmap and k < len(rmap[h]) else None
        if rl is None:
            unpaired += len(dl); mismatched.append((h, len(dl), 0)); continue
        if len(rl) != len(dl):
            mismatched.append((h, len(dl), len(rl)))
            sm = difflib.SequenceMatcher(None, [x[:40] for x in dl], [x[:40] for x in rl], autojunk=False)
            # fall back to best-ratio greedy pairing within the section
            used = set()
            for x in dl:
                best = max(((difflib.SequenceMatcher(None, x, y, autojunk=False).ratio(), j) for j, y in enumerate(rl) if j not in used), default=None)
                if best is None:
                    unpaired += 1; continue
                used.add(best[1]); pairs.append((x, rl[best[1]]))
        else:
            pairs.extend(zip(dl, rl))
    # denominator: the draft's Malayalam-bearing prose lines
    pairs = [(d, r) for d, r in pairs if M.MALAYALAM_RE.search(d)]
    n = len(pairs) + unpaired
    touched = [(d, r) for d, r in pairs if d != r]
    sims = [difflib.SequenceMatcher(None, d, r, autojunk=False).ratio() for d, r in touched]
    chars = sum(len(d) for d, _ in pairs)
    mass = sum(changed_chars(d, r) for d, r in touched)
    return {
        "lines": n, "unpaired": unpaired, "touched": len(touched) + unpaired,
        "touch_rate": (len(touched) + unpaired) / n if n else 0,
        "median_sim": statistics.median(sims) if sims else 1.0,
        "light_ge_0.90": sum(s >= 0.90 for s in sims) / len(sims) if sims else 0,
        "heavy_lt_0.70": sum(s < 0.70 for s in sims) / len(sims) if sims else 0,
        "edit_mass_per_1000": 1000 * mass / chars if chars else 0,
        "section_mismatches": mismatched,
    }


if __name__ == "__main__":
    ref = Path(sys.argv[2]).read_text()
    for p in sys.argv[3:]:
        r = compare(ref, Path(p).read_text())
        print(json.dumps({"draft": Path(p).name, **r}, ensure_ascii=False))

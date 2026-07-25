#!/usr/bin/env python3
"""Compare a fresh `translate init` run against an established reference fixture.

Answers: how far has model output drifted from translations a human reviewed?
Structure must match exactly (that is a correctness gate). Prose is expected to
differ (translation is not deterministic) - the question is how much, and whether
the differences are stylistic or substantive.
"""
import re
import sys
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

HEADING = re.compile(r"^#{1,6} ", re.M)
FENCE = re.compile(r"^```", re.M)
MATH = re.compile(r"^\$\$", re.M)
FM = re.compile(r"\A---\n.*?\n---\n", re.S)


def body(text):
    """Strip frontmatter - it is regenerated, not translated."""
    return FM.sub("", text)


def prose_paras(text):
    """Paragraphs outside code fences, for text comparison."""
    out, in_fence = [], False
    for block in body(text).split("\n\n"):
        if FENCE.search(block):
            in_fence = not in_fence if block.count("```") % 2 else in_fence
            continue
        if in_fence or not block.strip():
            continue
        if block.lstrip().startswith(("#", "$$", ":", "|")):
            continue
        out.append(" ".join(block.split()))
    return out


def script_ratio(s):
    """Fraction of letters that are non-Latin - detects under/over-translation."""
    letters = [c for c in s if c.isalpha()]
    if not letters:
        return 0.0
    non_latin = sum(1 for c in letters if not ("LATIN" in unicodedata.name(c, "")))
    return non_latin / len(letters)


def compare(ref_path, new_path, label):
    ref, new = Path(ref_path).read_text(), Path(new_path).read_text()
    print(f"\n{'=' * 62}\n{label}\n{'=' * 62}")

    # Structure: these must match, or the fresh output is simply wrong.
    print("\n  STRUCTURE (must match)")
    ok = True
    for name, rx in (("headings", HEADING), ("code fences", FENCE), ("math blocks", MATH)):
        a, b = len(rx.findall(body(ref))), len(rx.findall(body(new)))
        mark = "OK " if a == b else "DIFF"
        ok &= a == b
        print(f"    [{mark}] {name:12s} reference={a:3d}  fresh={b:3d}")

    # Prose: expected to differ. Measure how much.
    rp, np_ = prose_paras(ref), prose_paras(new)
    print(f"\n  PROSE  reference={len(rp)} paragraphs, fresh={len(np_)} paragraphs")
    if len(rp) == len(np_):
        sims = [SequenceMatcher(None, a, b).ratio() for a, b in zip(rp, np_)]
        ident = sum(1 for s in sims if s == 1.0)
        print(f"    character-level similarity: mean={sum(sims)/len(sims):.1%} "
              f"min={min(sims):.1%} max={max(sims):.1%}")
        print(f"    byte-identical paragraphs:  {ident}/{len(sims)}")
        worst = min(range(len(sims)), key=lambda i: sims[i])
        print(f"\n    most-diverged paragraph (#{worst + 1}, {sims[worst]:.1%} similar):")
        print(f"      reference: {rp[worst][:150]}")
        print(f"      fresh:     {np_[worst][:150]}")
    else:
        print("    paragraph counts differ - not comparable pairwise")

    r_ratio = script_ratio(" ".join(rp))
    n_ratio = script_ratio(" ".join(np_))
    print(f"\n  SCRIPT RATIO (non-Latin letters / all letters)")
    print(f"    reference={r_ratio:.1%}  fresh={n_ratio:.1%}  delta={n_ratio - r_ratio:+.1%}")
    return ok


if __name__ == "__main__":
    all_ok = True
    for ref, new, label in [tuple(a.split("::")) for a in sys.argv[1:]]:
        all_ok &= compare(ref, new, label)
    print()
    sys.exit(0 if all_ok else 1)

#!/usr/bin/env python3
"""Detect Malayalam-script phonetic renderings of English terms — a policy violation for ml.

The ml policy keeps technical terms in Latin script. Writing an English word out
phonetically in Malayalam letters (`click` -> `ക്ലിക്ക്`) violates it, and #189 sets
the target at zero instances. Until now this was the one check in the ml suite
documented as *manual* ("top tokens listed for a transliteration scan") — and a
manual scan missed a real instance: `ml_metrics.py` printed the top 30 Malayalam
tokens of an Opus 5 rendering and `ക്ലിക്ക്` (6 occurrences) fell just below the
cut, while every FAIL gate reported clean.

Two detectors, because each has a blind spot the other covers:

  targeted  — for each English term, look for its conventional Malayalam
              transliteration(s). Catches a transliteration even when a native
              reference uses the same one, which the novel-token detector cannot.
  novel     — Malayalam tokens present in a rendering but absent from a native
              reference translation of the same document. Needs no term list, so it
              catches transliterations nobody thought to enumerate. Blind to any
              form the reference also used.

Neither is a substitute for a native reader; both are cheap enough to gate on.
`--fail-on-hit` exits non-zero so this can sit in CI or graduate into
`diff-checks.ts` (#189 Phase 3).

Usage:
    python3 transliteration_check.py --doc out.md [--doc other.md] \
        [--reference ../reference/getting_started.md] [--source EN.md] [--json]
"""

from __future__ import annotations

import argparse
import collections
import json
import re
import sys
from pathlib import Path

MALAYALAM_TOKEN = re.compile(r"[ഀ-ൿ‌‍]+")
FENCE = re.compile(r"^\s*(`{3,}|~{3,})")
HEADING = re.compile(r"^#{1,6}\s")

# Conventional Malayalam transliterations of the English vocabulary QuantEcon
# lectures actually use. Longest-form-first within each entry: forms are matched
# without overlap so that `ക്ലിക്ക്` is not also counted as `ക്ലിക്`.
TRANSLITERATIONS: dict[str, list[str]] = {
    "click": ["ക്ലിക്ക്", "ക്ലിക്"],
    "select": ["സെലക്റ്റ്", "സെലക്ട്"],
    "tab": ["ടാബ്"],
    "cell": ["സെല്ല്", "സെൽ"],
    "menu": ["മെന്യു", "മെനു"],
    "kernel": ["കേർണൽ", "കെർണൽ"],
    "browser": ["ബ്രൗസ്സർ", "ബ്രൗസർ"],
    "dashboard": ["ഡാഷ്‌ബോർഡ്", "ഡാഷ്ബോർഡ്"],
    "terminal": ["ടെർമിനൽ"],
    "notebook": ["നോട്ട്‌ബുക്ക്", "നോട്ട്ബുക്ക്", "നോട്ബുക്ക്"],
    "button": ["ബട്ടൺ"],
    "icon": ["ഐക്കൺ", "ഐകൺ"],
    "border": ["ബോർഡർ"],
    "cursor": ["കഴ്സർ", "കർസർ"],
    "mode": ["മോഡ്"],
    "line": ["ലൈൻ"],
    "port": ["പോർട്ട്"],
    "toolbar": ["ടൂൾബാർ"],
    "debugger": ["ഡീബഗ്ഗർ", "ഡീബഗർ"],
    "download": ["ഡൗൺലോഡ്"],
    "install": ["ഇൻസ്റ്റാൾ"],
    "library": ["ലൈബ്രറി"],
    "package": ["പാക്കേജ്"],
    "code": ["കോഡ്"],
    "program": ["പ്രോഗ്രാം"],
    "file": ["ഫയൽ"],
    "text": ["ടെക്സ്റ്റ്"],
    "search": ["സെർച്ച്"],
    "green": ["ഗ്രീൻ"],
    "box": ["ബോക്സ്"],
    "window": ["വിൻഡോ"],
    "page": ["പേജ്"],
    "option": ["ഓപ്ഷൻ"],
    "setup": ["സെറ്റപ്പ്"],
    "set": ["സെറ്റ്"],
    "server": ["സെർവർ"],
    "cloud": ["ക്ലൗഡ്"],
    "output": ["ഔട്ട്പുട്ട്"],
    "run": ["റൺ"],
    "type": ["ടൈപ്പ്"],
    "edit": ["എഡിറ്റ്"],
    "copy": ["കോപ്പി"],
    "paste": ["പേസ്റ്റ്"],
    "version": ["വേർഷൻ"],
    "system": ["സിസ്റ്റം"],
    "default": ["ഡിഫോൾട്ട്"],
    "extension": ["എക്സ്റ്റൻഷൻ"],
    "split": ["സ്പ്ലിറ്റ്"],
    "test": ["ടെസ്റ്റ്"],
    "start": ["സ്റ്റാർട്ട്"],
    "machine": ["മെഷീൻ"],
    "plot": ["പ്ലോട്ട്"],
    "figure": ["ഫിഗർ"],
    "help": ["ഹെൽപ്പ്"],
}


def strip_to_prose(text: str) -> str:
    """Drop fenced blocks and headings, matching ml_metrics.py's convention."""
    out, in_fence, marker = [], False, ""
    for line in text.split("\n"):
        m = FENCE.match(line)
        if m:
            tok = m.group(1)
            if not in_fence:
                in_fence, marker = True, tok[0]
            elif tok[0] == marker:
                in_fence = False
            continue
        if in_fence or HEADING.match(line):
            continue
        out.append(line)
    return "\n".join(out)


def count_without_overlap(text: str, forms: list[str]) -> dict[str, int]:
    """Count each form, consuming matches so a longer form is never re-counted.

    `ക്ലിക്` is a prefix of `ക്ലിക്ക്`; counting both naively double-counts every
    occurrence. Forms are tried longest-first and matched text is blanked out.
    """
    counts: dict[str, int] = {}
    haystack = text
    for form in sorted(forms, key=len, reverse=True):
        n = haystack.count(form)
        if n:
            counts[form] = n
            haystack = haystack.replace(form, "\x00" * len(form))
    return counts


def targeted(prose: str) -> dict:
    hits, total = {}, 0
    for term, forms in TRANSLITERATIONS.items():
        found = count_without_overlap(prose, forms)
        if found:
            n = sum(found.values())
            hits[term] = {"count": n, "forms": found}
            total += n
    return {"total": total, "terms": hits}


def novel(prose: str, ref_prose: str) -> dict:
    ref = set(MALAYALAM_TOKEN.findall(ref_prose))
    counts = collections.Counter(MALAYALAM_TOKEN.findall(prose))
    fresh = {t: c for t, c in counts.items() if t not in ref}
    return {
        "distinct_tokens": len(counts),
        "absent_from_reference": len(fresh),
        "top": sorted(fresh.items(), key=lambda kv: (-kv[1], kv[0]))[:25],
    }


def latin_occurrences(source: str, term: str) -> int:
    return len(re.findall(rf"\b{re.escape(term)}(?:s|es|ing|ed)?\b", source, re.I))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--doc", type=Path, action="append", required=True,
                    help="translated document to check (repeatable)")
    ap.add_argument("--reference", type=Path,
                    help="native-speaker reference, enables the novel-token detector")
    ap.add_argument("--source", type=Path,
                    help="English source, to report how many occurrences were affected")
    ap.add_argument("--fail-on-hit", action="store_true",
                    help="exit non-zero if any targeted transliteration is found")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    ref_prose = strip_to_prose(args.reference.read_text(encoding="utf-8")) if args.reference else None
    src_raw = args.source.read_text(encoding="utf-8") if args.source else None

    report = {"documents": {}}
    worst = 0
    for doc in args.doc:
        prose = strip_to_prose(doc.read_text(encoding="utf-8"))
        entry = {"targeted": targeted(prose)}
        if ref_prose is not None:
            entry["novel"] = novel(prose, ref_prose)
        if src_raw is not None:
            for term, info in entry["targeted"]["terms"].items():
                info["source_occurrences"] = latin_occurrences(src_raw, term)
        report["documents"][str(doc)] = entry
        worst = max(worst, entry["targeted"]["total"])

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        for name, entry in report["documents"].items():
            t = entry["targeted"]
            print(f"== {name}")
            print(f"   targeted transliterations: {t['total']}")
            for term, info in sorted(t["terms"].items(), key=lambda kv: -kv[1]["count"]):
                src = info.get("source_occurrences")
                frac = f" of {src} source occurrences" if src else ""
                forms = ", ".join(f"{f}×{c}" for f, c in info["forms"].items())
                print(f"     {term:12s} {info['count']:3d}{frac}   [{forms}]")
            if "novel" in entry:
                n = entry["novel"]
                print(f"   Malayalam tokens absent from the reference: "
                      f"{n['absent_from_reference']} of {n['distinct_tokens']} distinct")
            print()

    if args.fail_on_hit and worst:
        print(f"FAIL: {worst} transliteration(s) found; ml policy target is 0",
              file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

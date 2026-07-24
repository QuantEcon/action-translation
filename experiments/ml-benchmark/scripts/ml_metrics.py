#!/usr/bin/env python3
"""Deterministic quality metrics for Malayalam (ml) translations.

The ml policy (issue #70, PR #71) is keep-English-dominant: technical terms
must survive in Latin script with Malayalam prose wrapping around them. That
makes the core checks scriptable — see experiments/ml-benchmark/PLAN.md for
metric definitions and gate semantics.

Usage:
    ml_metrics.py --output translated.md [--source english.md]
                  [--glossary glossary/ml.json] [--reference reference.md]
                  [--top-tokens 30] [--json]

Exit code 1 if any FAIL gate breaches (requires --source), else 0.
Stdlib only.
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
from pathlib import Path

MALAYALAM_RE = re.compile(r"[ഀ-ൿ]")
LATIN_RE = re.compile(r"[A-Za-z]")
FENCE_RE = re.compile(r"^(```|~~~)")
HEADING_RE = re.compile(r"^#{1,6} ")


def strip_to_prose(text: str) -> str:
    """Drop YAML frontmatter and fenced blocks (code cells, directives)."""
    lines = text.split("\n")
    out: list[str] = []
    i = 0
    if lines and lines[0].strip() == "---":
        i = 1
        while i < len(lines) and lines[i].strip() != "---":
            i += 1
        i += 1
    in_fence = False
    fence_marker = ""
    for line in lines[i:]:
        stripped = line.lstrip()
        m = FENCE_RE.match(stripped)
        if m:
            if not in_fence:
                in_fence, fence_marker = True, m.group(1)
            elif stripped.startswith(fence_marker):
                in_fence = False
            continue
        if not in_fence:
            out.append(line)
    return "\n".join(out)


def headings(text: str) -> list[str]:
    return [ln.rstrip() for ln in strip_to_prose(text).split("\n") if HEADING_RE.match(ln)]


def term_pattern(term: str) -> re.Pattern[str]:
    # Left boundary: not preceded by a Latin letter. Right: not followed by a
    # lowercase Latin letter — this permits the hyphenated Malayalam suffix
    # attachment the policy mandates (economy-യിലെ) and plural "s".
    return re.compile(r"(?<![A-Za-z])" + re.escape(term) + r"(?![a-z])", re.IGNORECASE)


def count_term(term: str, prose: str) -> int:
    return len(term_pattern(term).findall(prose))


def surface_forms(term: str, prose: str) -> list[str]:
    return sorted(set(term_pattern(term).findall(prose)))


def paragraph_ratios(prose: str, min_letters: int = 12) -> list[float]:
    """Per-paragraph Malayalam share of alphabetic characters."""
    ratios = []
    for para in re.split(r"\n\s*\n", prose):
        if HEADING_RE.match(para.strip()):
            continue
        ml = len(MALAYALAM_RE.findall(para))
        la = len(LATIN_RE.findall(para))
        if ml + la >= min_letters:
            ratios.append(ml / (ml + la))
    return ratios


def ratio_stats(ratios: list[float]) -> dict:
    if not ratios:
        return {"n": 0}
    qs = statistics.quantiles(ratios, n=10) if len(ratios) >= 3 else [min(ratios), max(ratios)]
    return {
        "n": len(ratios),
        "mean": round(statistics.mean(ratios), 3),
        "median": round(statistics.median(ratios), 3),
        "p10": round(qs[0], 3),
        "p90": round(qs[-1], 3),
    }


def malayalam_tokens(prose: str, top: int) -> list[tuple[str, int]]:
    counts: dict[str, int] = {}
    for tok in re.findall(r"[ഀ-ൿ‌‍]+", prose):
        if len(tok) > 1:
            counts[tok] = counts.get(tok, 0) + 1
    return sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:top]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--output", required=True, type=Path, help="translated ml document")
    ap.add_argument("--source", type=Path, help="English source (enables FAIL gates)")
    ap.add_argument("--glossary", type=Path, default=Path("glossary/ml.json"))
    ap.add_argument("--reference", type=Path, help="native-speaker reference (ratio band)")
    ap.add_argument("--top-tokens", type=int, default=30)
    ap.add_argument("--json", action="store_true", dest="as_json")
    args = ap.parse_args()

    out_text = args.output.read_text(encoding="utf-8")
    out_prose = strip_to_prose(out_text)
    glossary = json.loads(args.glossary.read_text(encoding="utf-8"))
    pinned = [t for t in glossary["terms"] if t["en"] == t["ml"]]
    everyday = [t for t in glossary["terms"] if t["en"] != t["ml"]]

    result: dict = {"output": str(args.output), "fail": [], "warn": []}

    # -- Heading fidelity + pinned-term retention (need the source) ----------
    if args.source:
        src_text = args.source.read_text(encoding="utf-8")
        src_prose = strip_to_prose(src_text)

        src_h, out_h = headings(src_text), headings(out_text)
        result["headings"] = {"source": len(src_h), "output": len(out_h), "identical": src_h == out_h}
        if src_h != out_h:
            diffs = [
                {"index": i, "source": s, "output": o}
                for i, (s, o) in enumerate(zip(src_h, out_h))
                if s != o
            ]
            if len(src_h) != len(out_h):
                diffs.append({"index": "count", "source": len(src_h), "output": len(out_h)})
            result["headings"]["diffs"] = diffs
            result["fail"].append(f"heading fidelity: {len(diffs)} difference(s)")

        retention = []
        for t in pinned:
            s_n, o_n = count_term(t["en"], src_prose), count_term(t["en"], out_prose)
            if s_n > 0:
                retention.append({"term": t["en"], "source": s_n, "output": o_n, "ok": o_n >= s_n})
        lost = [r for r in retention if not r["ok"]]
        result["pinned_retention"] = {"checked": len(retention), "lost": lost}
        if lost:
            result["fail"].append(
                "pinned-term retention: " + ", ".join(f"{r['term']} {r['source']}->{r['output']}" for r in lost)
            )

        result["everyday_terms"] = [
            {
                "en": t["en"],
                "ml": t["ml"],
                "source_en": count_term(t["en"], src_prose),
                "output_ml_exact": out_prose.count(t["ml"]),
                "note": "informational — inflection alters endings",
            }
            for t in everyday
        ]

    # -- Casing consistency (output only) ------------------------------------
    inconsistent = []
    for t in pinned:
        forms = surface_forms(t["en"], out_prose)
        # Tolerate sentence-initial capitalization of an otherwise-lowercase term
        folded = {f.lower() for f in forms}
        if len(folded) == 1 and len(forms) > 1 and not any(f.isupper() for f in forms):
            continue
        if len(forms) > 1:
            inconsistent.append({"term": t["en"], "forms": forms})
    result["casing"] = inconsistent
    if inconsistent:
        result["warn"].append(
            "casing variants: " + ", ".join(f"{c['term']} {c['forms']}" for c in inconsistent)
        )

    # -- Script-ratio band ----------------------------------------------------
    out_stats = ratio_stats(paragraph_ratios(out_prose))
    result["script_ratio"] = {"output": out_stats}
    if args.reference:
        ref_prose = strip_to_prose(args.reference.read_text(encoding="utf-8"))
        ref_stats = ratio_stats(paragraph_ratios(ref_prose))
        result["script_ratio"]["reference"] = ref_stats
        if out_stats["n"] and ref_stats["n"]:
            lo, hi = ref_stats["p10"] - 0.05, ref_stats["p90"] + 0.05
            if not (lo <= out_stats["mean"] <= hi):
                direction = "over-translation" if out_stats["mean"] > hi else "untranslated prose"
                result["warn"].append(
                    f"script ratio mean {out_stats['mean']} outside reference band "
                    f"[{round(lo, 3)}, {round(hi, 3)}] — suggests {direction}"
                )

    # -- Token list for the manual transliteration scan -----------------------
    result["malayalam_tokens_top"] = malayalam_tokens(out_prose, args.top_tokens)

    if args.as_json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"== ml metrics: {args.output} ==")
        for key in ("headings", "pinned_retention", "script_ratio"):
            if key in result:
                print(f"{key}: {json.dumps(result[key], ensure_ascii=False)}")
        print(f"casing variants: {len(result['casing'])}")
        print("top Malayalam tokens (scan for transliterated English):")
        for tok, n in result["malayalam_tokens_top"]:
            print(f"  {n:4d}  {tok}")
        for w in result["warn"]:
            print(f"WARN: {w}")
        for f in result["fail"]:
            print(f"FAIL: {f}")
        if not result["fail"] and not result["warn"]:
            print("all gates clean")

    return 1 if result["fail"] else 0


if __name__ == "__main__":
    sys.exit(main())
